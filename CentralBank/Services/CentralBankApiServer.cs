using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using CentralBank.Models;

namespace CentralBank.Services;

/// <summary>
/// Servidor de comunicaciones del Banco Central (:5050).
///
/// Protocolo:
///  1. GET  /api/channel/info   -> entrega la llave pública del banco y un reto firmado.
///  2. POST /api/channel/open   -> recibe una llave de sesión envuelta con la llave pública,
///                                 abre la sesión y responde ya dentro de un sobre cifrado.
///  3. POST /api/secure         -> único punto de entrada para las operaciones de negocio.
///                                 El sobre se descifra con la llave de la sesión (AAD = sid);
///                                 si un solo bit del mensaje o del IV fue modificado, el
///                                 descifrado autenticado falla, la sesión se invalida y la
///                                 petición se rechaza con HTTP 400.
/// </summary>
public class CentralBankApiServer : IDisposable
{
    private const int MaxRequestBytes = 262_144;
    private const long MaxClockSkewMs = 5 * 60 * 1000;

    private readonly CentralBankStateService _state;
    private readonly SessionStore _sessions = new();
    private readonly LoginThrottle _throttle = new();
    private readonly HandoffStore _handoffs = new();
    private readonly CancellationTokenSource _cts = new();
    private TcpListener? _tcpListener;
    private Process? _tunnelProcess;
    private bool _isRunning;

    public const string DiscoveryChannelUrl = "https://ntfy.sh/aetherpay_cb_dabi0212_net";
    public const string VercelStoreProductionUrl = "https://proyecto-intercomunicacion-segurida.vercel.app";

    public string BaseUrl { get; } = "http://0.0.0.0:5050/";
    public string PublicHttpsTunnelUrl { get; private set; } = string.Empty;
    public event Action<string>? TunnelUrlPublished;

    public static List<string> GetAllLocalLanIps()
    {
        try
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            return host.AddressList
                .Where(ip => ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                .Select(ip => ip.ToString())
                .Distinct()
                .ToList();
        }
        catch
        {
            return new List<string> { "192.168.1.74" };
        }
    }

    public static string GetLocalLanIp()
    {
        var candidates = GetAllLocalLanIps();
        var wifiLan = candidates.FirstOrDefault(ip =>
            ip.StartsWith("192.168.1.", StringComparison.Ordinal) ||
            ip.StartsWith("192.168.0.", StringComparison.Ordinal) ||
            ip.StartsWith("10.", StringComparison.Ordinal));

        return wifiLan ?? candidates.FirstOrDefault() ?? "127.0.0.1";
    }

    public CentralBankApiServer(CentralBankStateService state)
    {
        _state = state;
    }

    public void Start()
    {
        if (_isRunning) return;
        try
        {
            TryOpenWindowsFirewallPort();
            _tcpListener = new TcpListener(IPAddress.Any, 5050);
            _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            _tcpListener.Start();
            _isRunning = true;
            _ = Task.Run(() => AcceptClientsLoopAsync(_cts.Token));
            _ = Task.Run(() => StartAutomaticPublicTunnelAndDiscoveryAsync(_cts.Token));
        }
        catch (Exception ex)
        {
            _state.AddAuditLog("WARN", "#FF9500", $"[Servidor API] No se pudo iniciar en puerto 5050: {ex.Message}");
        }
    }

    private static void TryOpenWindowsFirewallPort()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netsh",
                Arguments = "advfirewall firewall add rule name=\"CentralBank_API_5050\" dir=in action=allow protocol=TCP localport=5050",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(1500);
        }
        catch { }
    }

    /// <summary>
    /// Inicia automáticamente un túnel HTTPS público (Cloudflare Quick Tunnel) y publica el endpoint
    /// en el registro automático en la nube para que MarketStore (en Vercel) y WalletPay (APK móvil)
    /// se conecten desde CUALQUIER dispositivo sin configurar ninguna dirección IP manualmente.
    /// </summary>
    private async Task StartAutomaticPublicTunnelAndDiscoveryAsync(CancellationToken token)
    {
        // Publicar de inmediato las IPs locales mientras el túnel HTTPS se levanta
        await PublishDiscoveryEndpointsAsync("");

        try
        {
            var cfCandidates = new[]
            {
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "cloudflared.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CentralBankTunnel", "cloudflared.exe"),
                "cloudflared.exe"
            };

            var cfBinary = cfCandidates.FirstOrDefault(File.Exists);
            if (string.IsNullOrEmpty(cfBinary))
            {
                return;
            }

            // Cerrar túneles previos huérfanos si existieran
            foreach (var old in Process.GetProcessesByName("cloudflared"))
            {
                try { old.Kill(); } catch { }
            }

            var psi = new ProcessStartInfo
            {
                FileName = cfBinary,
                Arguments = "tunnel --url http://127.0.0.1:5050 --no-autoupdate",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            _tunnelProcess = Process.Start(psi);
            if (_tunnelProcess == null) return;

            var urlRegex = new Regex(@"https://[a-zA-Z0-9-]+\.trycloudflare\.com", RegexOptions.Compiled);

            async Task ReadStreamAsync(StreamReader reader)
            {
                while (!token.IsCancellationRequested && !_tunnelProcess.HasExited)
                {
                    var line = await reader.ReadLineAsync();
                    if (line == null) break;
                    var match = urlRegex.Match(line);
                    if (match.Success && string.IsNullOrEmpty(PublicHttpsTunnelUrl))
                    {
                        PublicHttpsTunnelUrl = $"{match.Value}/api";
                        _state.AddAuditLog("NET", "#34C759", $"[Auto-Descubrimiento Global] Túnel HTTPS activo ({PublicHttpsTunnelUrl}). Sincronizado automáticamente con Vercel y WalletPay APK.");
                        await PublishDiscoveryEndpointsAsync(PublicHttpsTunnelUrl);
                        TunnelUrlPublished?.Invoke(PublicHttpsTunnelUrl);
                    }
                }
            }

            _ = Task.Run(() => ReadStreamAsync(_tunnelProcess.StandardError), token);
            _ = Task.Run(() => ReadStreamAsync(_tunnelProcess.StandardOutput), token);

            // Republicar periódicamente cada 45 segundos para mantener fresco el descubrimiento automático
            while (!token.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(45), token);
                await PublishDiscoveryEndpointsAsync(PublicHttpsTunnelUrl);
            }
        }
        catch
        {
            // Si no hay internet para túnel público, continúa operando en red local automáticamente
        }
    }

    private async Task PublishDiscoveryEndpointsAsync(string httpsApiUrl)
    {
        try
        {
            var lanIp = GetLocalLanIp();
            var lanUrl = $"http://{lanIp}:5050/api";
            var allLanUrls = GetAllLocalLanIps().Select(ip => $"http://{ip}:5050/api").ToArray();

            var payloadObj = new
            {
                httpsUrl = httpsApiUrl,
                lanUrl,
                allLanUrls,
                storeUrl = VercelStoreProductionUrl,
                ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            var json = JsonSerializer.Serialize(payloadObj);

            // 1. Guardar archivo local bank-discovery.json en la raíz del repositorio (para GitHub raw / Auto-Sync)
            try
            {
                var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
                while (dir != null)
                {
                    if (Directory.Exists(Path.Combine(dir.FullName, ".git")))
                    {
                        await File.WriteAllTextAsync(Path.Combine(dir.FullName, "bank-discovery.json"), json, Encoding.UTF8);
                        break;
                    }
                    dir = dir.Parent;
                }
            }
            catch { }

            // 2. Publicar instantáneamente en canal de descubrimiento HTTPS sin configuración
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            using var content = new StringContent(json, Encoding.UTF8, "text/plain");
            await http.PostAsync(DiscoveryChannelUrl, content);
        }
        catch { }
    }

    private async Task AcceptClientsLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _tcpListener != null)
        {
            try
            {
                var client = await _tcpListener.AcceptTcpClientAsync(token);
                _ = Task.Run(() => HandleTcpClientAsync(client), token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                // Continuar aceptando conexiones de WalletPay y MarketStore
            }
        }
    }

    private async Task HandleTcpClientAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 10000;
                client.SendTimeout = 10000;
                var remoteIp = (client.Client.RemoteEndPoint as IPEndPoint)?.Address.ToString() ?? "unknown";
                using var stream = client.GetStream();

                var (method, rawPath, bodyText, tooLarge) = await ReadHttpRequestAsync(stream);
                if (tooLarge)
                {
                    await WriteJsonAsync(stream, 413, new { ok = false, code = "PAYLOAD_TOO_LARGE", error = "La solicitud excede el tamaño permitido." });
                    return;
                }
                if (string.IsNullOrEmpty(method)) return;

                if (method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    await WriteHttpResponseAsync(stream, 204, "");
                    return;
                }

                var path = rawPath.ToLowerInvariant();
                await RouteRequestAsync(stream, method.ToUpperInvariant(), path, bodyText, remoteIp);
            }
            catch
            {
                // Ignorar desconexiones abruptas del cliente
            }
        }
    }

    private static async Task<(string Method, string Path, string Body, bool TooLarge)> ReadHttpRequestAsync(NetworkStream stream)
    {
        var buffer = new byte[16384];
        using var ms = new MemoryStream();
        var headerEndIndex = -1;
        var contentLength = 0;

        while (true)
        {
            var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
            if (bytesRead <= 0) break;

            if (ms.Length + bytesRead > MaxRequestBytes)
            {
                return ("", "/", "", true);
            }

            ms.Write(buffer, 0, bytesRead);
            var currentBytes = ms.ToArray();

            if (headerEndIndex < 0)
            {
                headerEndIndex = FindHeaderEnd(currentBytes);
                if (headerEndIndex >= 0)
                {
                    var headerStr = Encoding.UTF8.GetString(currentBytes, 0, headerEndIndex);
                    foreach (var line in headerStr.Split("\r\n", StringSplitOptions.RemoveEmptyEntries))
                    {
                        if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        {
                            var valPart = line.Substring("Content-Length:".Length).Trim();
                            if (!int.TryParse(valPart, out contentLength) || contentLength < 0 || contentLength > MaxRequestBytes)
                            {
                                return ("", "/", "", true);
                            }
                        }
                    }
                }
            }

            if (headerEndIndex >= 0)
            {
                var bodyBytesReceived = currentBytes.Length - (headerEndIndex + 4);
                if (bodyBytesReceived >= contentLength) break;
            }
        }

        var allBytes = ms.ToArray();
        if (allBytes.Length == 0 || headerEndIndex < 0)
        {
            return ("", "/", "", false);
        }

        var headersText = Encoding.UTF8.GetString(allBytes, 0, headerEndIndex);
        var firstLineEnd = headersText.IndexOf("\r\n", StringComparison.Ordinal);
        var requestLine = firstLineEnd >= 0 ? headersText.Substring(0, firstLineEnd) : headersText;
        var parts = requestLine.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2)
        {
            return ("", "/", "", false);
        }

        var method = parts[0].Trim();
        var fullTarget = parts[1].Trim();
        var qIdx = fullTarget.IndexOf('?');
        var path = qIdx >= 0 ? fullTarget.Substring(0, qIdx) : fullTarget;

        var bodyOffset = headerEndIndex + 4;
        var availableBody = Math.Max(0, allBytes.Length - bodyOffset);
        var bodyToRead = contentLength > 0 ? Math.Min(contentLength, availableBody) : availableBody;
        var body = bodyToRead > 0 ? Encoding.UTF8.GetString(allBytes, bodyOffset, bodyToRead) : "";

        return (method, path, body, false);
    }

    private static int FindHeaderEnd(byte[] data)
    {
        for (var i = 0; i <= data.Length - 4; i++)
        {
            if (data[i] == '\r' && data[i + 1] == '\n' && data[i + 2] == '\r' && data[i + 3] == '\n')
                return i;
        }
        return -1;
    }

    // =========================================================================
    // ENRUTADOR PRINCIPAL (solo apertura de canal + sobre protegido)
    // =========================================================================

    private async Task RouteRequestAsync(NetworkStream stream, string httpMethod, string path, string rawBody, string remoteIp)
    {
        try
        {
            if (path == "/api/health" && httpMethod == "GET")
            {
                await WriteJsonAsync(stream, 200, new
                {
                    ok = true,
                    service = "CentralBank Desktop Node",
                    lanIp = GetLocalLanIp(),
                    totalTickets = _state.TotalTicketsSoldCount,
                    pendingOrders = _state.PendingOrdersCount,
                    pendingTicketRequests = _state.PendingTicketRequestsCount
                });
                return;
            }

            // Paso 1 del canal seguro: llave pública del banco + prueba de posesión firmada.
            if (path == "/api/channel/info" && httpMethod == "GET")
            {
                var ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var proof = _state.Security.Sign($"BANK-CHANNEL|{_state.Security.PublicKeyFingerprint}|{ts}");
                await WriteJsonAsync(stream, 200, new
                {
                    ok = true,
                    publicKey = _state.Security.PublicKeySpkiBase64,
                    fingerprint = _state.Security.PublicKeyFingerprint,
                    serverTime = ts,
                    proof
                });
                return;
            }

            // Paso 2 del canal seguro: el cliente envía una llave de sesión envuelta con la llave pública.
            if (path == "/api/channel/open" && httpMethod == "POST")
            {
                var body = ParseJsonBody(rawBody);
                var wrappedKey = GetStringProp(body, "wrappedKey", "");
                var clientName = GetStringProp(body, "client", "app");
                var clientNonce = GetStringProp(body, "clientNonce", "");

                var key = _state.Security.UnwrapSessionKey(wrappedKey);
                if (key == null)
                {
                    _state.AddAuditLog("SEC", "#FF3B30", $"[Canal] Apertura rechazada desde {remoteIp}: llave de sesión inválida o corrupta.");
                    await WriteJsonAsync(stream, 400, new
                    {
                        ok = false,
                        code = "HANDSHAKE_FAILED",
                        error = "No fue posible establecer una conexión segura con el Banco Central."
                    });
                    return;
                }

                var session = _sessions.Create(key, clientName);
                var ackJson = JsonSerializer.Serialize(new
                {
                    ok = true,
                    sessionId = session.Id,
                    clientNonce,
                    serverTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
                var (iv, data) = SecurityService.Encrypt(session.Key, ackJson, session.Id);

                await WriteJsonAsync(stream, 200, new
                {
                    ok = true,
                    sessionId = session.Id,
                    iv,
                    data
                });
                return;
            }

            // Paso 3: transporte protegido para todas las operaciones de negocio.
            if (path == "/api/secure" && httpMethod == "POST")
            {
                await HandleEncryptedRequestAsync(stream, rawBody, remoteIp);
                return;
            }

            // Cualquier intento de llamar rutas en texto plano se rechaza.
            if (path.StartsWith("/api/", StringComparison.Ordinal))
            {
                await WriteJsonAsync(stream, 426, new
                {
                    ok = false,
                    code = "PROTECTED_CHANNEL_REQUIRED",
                    error = "Esta operación requiere un canal seguro con el Banco Central."
                });
                return;
            }

            await WriteJsonAsync(stream, 404, new { ok = false, code = "NOT_FOUND", error = "Ruta no encontrada." });
        }
        catch
        {
            await WriteJsonAsync(stream, 500, new { ok = false, code = "INTERNAL_ERROR", error = "No se pudo procesar la solicitud." });
        }
    }

    // =========================================================================
    // DESCIFRADO AUTENTICADO, ANTI-REENVÍO Y DESPACHO DE ACCIONES
    // =========================================================================

    private async Task HandleEncryptedRequestAsync(NetworkStream stream, string rawBody, string remoteIp)
    {
        var outer = ParseJsonBody(rawBody);
        var sid = GetStringProp(outer, "sid", "");
        var iv = GetStringProp(outer, "iv", "");
        var data = GetStringProp(outer, "data", "");

        var session = _sessions.Get(sid);
        if (session == null)
        {
            await WriteJsonAsync(stream, 401, new
            {
                ok = false,
                code = "SESSION_EXPIRED",
                error = "La sesión con el Banco Central caducó. Se reconectará automáticamente."
            });
            return;
        }

        // Si el atacante modifica un solo bit del texto cifrado, del IV o del identificador de sesión (AAD),
        // la etiqueta de autenticación de AES-GCM no coincide, Decrypt devuelve null y la sesión se destruye.
        var plaintext = SecurityService.Decrypt(session.Key, iv, data, session.Id);
        if (plaintext == null)
        {
            _sessions.Remove(session.Id);
            _state.AddAuditLog("SEC", "#FF3B30", $"[Canal] Mensaje cifrado alterado o corrupto desde {remoteIp}. Sesión cerrada y operación descartada.");
            await WriteJsonAsync(stream, 400, new
            {
                ok = false,
                code = "MESSAGE_TAMPERED",
                error = "El mensaje recibido fue alterado durante el envío y fue descartado por seguridad."
            });
            return;
        }

        JsonElement inner;
        try { inner = JsonSerializer.Deserialize<JsonElement>(plaintext); }
        catch
        {
            _sessions.Remove(session.Id);
            await WriteJsonAsync(stream, 400, new { ok = false, code = "MALFORMED_PAYLOAD", error = "El contenido del mensaje es inválido." });
            return;
        }

        var action = GetStringProp(inner, "action", "").ToLowerInvariant();
        var nonce = GetStringProp(inner, "nonce", "");
        var ts = GetLongProp(inner, "ts", 0);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        if (nonce.Length < 12 || Math.Abs(now - ts) > MaxClockSkewMs)
        {
            _state.AddAuditLog("SEC", "#FF9500", $"[Canal] Mensaje fuera de ventana de tiempo desde {remoteIp}.");
            await WriteEncryptedAsync(stream, session, 400, new
            {
                ok = false,
                code = "STALE_MESSAGE",
                error = "La solicitud caducó antes de ser procesada. Inténtalo de nuevo."
            });
            return;
        }

        lock (session.Sync)
        {
            foreach (var old in session.SeenNonces.Where(kv => now - kv.Value > MaxClockSkewMs * 2).ToList())
                session.SeenNonces.TryRemove(old.Key, out _);

            if (!session.SeenNonces.TryAdd(nonce, now))
            {
                _state.AddAuditLog("SEC", "#FF3B30", $"[Canal] Reenvío de mensaje duplicado bloqueado desde {remoteIp} ({action}).");
                _ = WriteEncryptedAsync(stream, session, 409, new
                {
                    ok = false,
                    code = "REPLAY_DETECTED",
                    error = "Esta solicitud ya había sido procesada (reenvío bloqueado)."
                });
                return;
            }
        }

        var payload = inner.TryGetProperty("payload", out var p) && p.ValueKind == JsonValueKind.Object
            ? p
            : ParseJsonBody("{}");

        var (status, responseObj) = DispatchSecureAction(session, action, payload, remoteIp);
        await WriteEncryptedAsync(stream, session, status, responseObj);
    }

    private static async Task WriteEncryptedAsync(NetworkStream stream, SecureSession session, int statusCode, object responsePayload)
    {
        var plainJson = JsonSerializer.Serialize(responsePayload);
        var (iv, data) = SecurityService.Encrypt(session.Key, plainJson, session.Id);
        await WriteJsonAsync(stream, statusCode, new
        {
            ok = statusCode is >= 200 and < 300,
            sid = session.Id,
            iv,
            data
        });
    }

    // =========================================================================
    // ACCIONES DE NEGOCIO (todas dentro del canal cifrado)
    // =========================================================================

    private (int Status, object Body) DispatchSecureAction(SecureSession session, string action, JsonElement payload, string remoteIp)
    {
        switch (action)
        {
            case "directory.list":
            {
                _state.ReloadFromDatabase();
                // Directorio público mínimo para el selector de acceso: sin saldos ni conteos financieros.
                var directory = _state.Users.Select(MapUserForDirectory).ToList();
                return (200, new { ok = true, users = directory });
            }

            case "auth.register":
            {
                var email = GetStringProp(payload, "email", "").Trim().ToLowerInvariant();
                var name = GetStringProp(payload, "name", "").Trim();
                var password = GetStringProp(payload, "password", "");
                var role = GetStringProp(payload, "roleCode", "buyer");
                var storeName = GetStringProp(payload, "storeName", "");

                var (ok, err, user) = _state.RegisterUser(email, name, password, role, storeName);
                if (!ok || user == null)
                {
                    return (400, new { ok = false, code = "REGISTER_FAILED", error = err });
                }

                session.UserEmail = user.Email;
                session.Role = user.Role;
                session.FailedAuthAttempts = 0;
                var deviceToken = _state.IssueDeviceToken(user.Email);
                return (200, BuildAuthenticatedBundle(user, deviceToken));
            }

            case "auth.login":
            {
                var email = GetStringProp(payload, "email", "").Trim().ToLowerInvariant();
                var password = GetStringProp(payload, "password", "");
                var role = GetStringProp(payload, "roleCode", "");
                var storeName = GetStringProp(payload, "storeName", "");
                var throttleKey = $"{remoteIp}|{email}";

                if (_throttle.IsLocked(throttleKey, out var remaining))
                {
                    var secs = Math.Max(1, (int)Math.Ceiling(remaining.TotalSeconds));
                    _state.AddAuditLog("SEC", "#FF3B30", $"[Acceso] Intento bloqueado para {email} desde {remoteIp} ({secs}s restantes).");
                    return (429, new
                    {
                        ok = false,
                        code = "ACCOUNT_LOCKED",
                        retryAfterSeconds = secs,
                        error = $"Demasiados intentos fallidos. Espera {secs} segundos antes de volver a intentarlo."
                    });
                }

                var (ok, user, _) = _state.AuthenticateUser(email, password);
                if (!ok || user == null)
                {
                    var left = _throttle.RegisterFailure(throttleKey);
                    session.FailedAuthAttempts++;
                    _state.AddAuditLog("SEC", "#FF3B30", $"[Acceso] Credenciales inválidas para '{email}' desde {remoteIp} ({left} intentos restantes).");
                    return (401, new
                    {
                        ok = false,
                        code = "INVALID_CREDENTIALS",
                        remainingAttempts = left,
                        error = left > 0
                            ? $"Correo o contraseña incorrectos. Te quedan {left} intento(s) antes del bloqueo temporal."
                            : "Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta de nuevo en 5 minutos."
                    });
                }

                _throttle.Reset(throttleKey);
                session.FailedAuthAttempts = 0;
                if (!string.IsNullOrWhiteSpace(role))
                {
                    user = _state.SetUserRole(user.Email, role, storeName);
                }

                session.UserEmail = user.Email;
                session.Role = user.Role;
                var deviceToken = _state.IssueDeviceToken(user.Email);
                _state.AddAuditLog("SEC", "#34C759", $"[Acceso] Sesión iniciada para {user.Name} ({user.Email}).");
                return (200, BuildAuthenticatedBundle(user, deviceToken));
            }

            case "auth.biometric":
            {
                var email = GetStringProp(payload, "email", "").Trim().ToLowerInvariant();
                var deviceToken = GetStringProp(payload, "deviceToken", "");
                var role = GetStringProp(payload, "roleCode", "");
                var throttleKey = $"{remoteIp}|{email}";

                if (_throttle.IsLocked(throttleKey, out var remaining))
                {
                    var secs = Math.Max(1, (int)Math.Ceiling(remaining.TotalSeconds));
                    return (429, new
                    {
                        ok = false,
                        code = "ACCOUNT_LOCKED",
                        retryAfterSeconds = secs,
                        error = $"Acceso bloqueado temporalmente. Espera {secs} segundos."
                    });
                }

                if (!_state.ConsumeDeviceToken(email, deviceToken))
                {
                    _throttle.RegisterFailure(throttleKey);
                    _state.AddAuditLog("SEC", "#FF9500", $"[Acceso] Pase de dispositivo inválido o vencido para '{email}'. Se solicitó contraseña.");
                    return (401, new
                    {
                        ok = false,
                        code = "DEVICE_UNLOCK_REQUIRED",
                        error = "Por seguridad, ingresa tu contraseña para vincular este dispositivo."
                    });
                }

                _state.ReloadFromDatabase();
                var user = _state.FindUser(email);
                if (user == null)
                {
                    return (401, new { ok = false, code = "INVALID_CREDENTIALS", error = "La cuenta ya no existe." });
                }

                _throttle.Reset(throttleKey);
                if (!string.IsNullOrWhiteSpace(role))
                {
                    user = _state.SetUserRole(user.Email, role, null);
                }

                session.UserEmail = user.Email;
                session.Role = user.Role;
                var nextToken = _state.IssueDeviceToken(user.Email);
                return (200, BuildAuthenticatedBundle(user, nextToken));
            }

            case "auth.handoff.create":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para continuar." });

                var handoffToken = _handoffs.Issue(session.UserEmail);
                return (200, new { ok = true, handoffToken });
            }

            case "auth.handoff.redeem":
            {
                var token = GetStringProp(payload, "handoffToken", "");
                var email = _handoffs.Redeem(token);
                if (email == null)
                {
                    _state.AddAuditLog("SEC", "#FF3B30", $"[Acceso] Enlace de traspaso inválido o ya utilizado desde {remoteIp}.");
                    return (401, new
                    {
                        ok = false,
                        code = "INVALID_HANDOFF",
                        error = "El enlace de acceso desde WalletPay expiró o ya fue utilizado. Inicia sesión con tu contraseña."
                    });
                }

                _state.ReloadFromDatabase();
                var user = _state.FindUser(email);
                if (user == null)
                    return (401, new { ok = false, code = "INVALID_HANDOFF", error = "Cuenta no encontrada." });

                session.UserEmail = user.Email;
                session.Role = "buyer";
                var deviceToken = _state.IssueDeviceToken(user.Email);
                return (200, BuildAuthenticatedBundle(user, deviceToken));
            }

            case "auth.role":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Sesión no autenticada." });

                var role = GetStringProp(payload, "roleCode", "buyer");
                var storeName = GetStringProp(payload, "storeName", "");
                var user = _state.SetUserRole(session.UserEmail, role, storeName);
                session.Role = user.Role;
                return (200, BuildAuthenticatedBundle(user, null));
            }

            case "auth.logout":
            {
                session.UserEmail = null;
                return (200, new { ok = true });
            }

            case "state.sync":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Sesión no autenticada." });

                _state.ReloadFromDatabase();
                var user = _state.FindUser(session.UserEmail);
                if (user == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Cuenta no encontrada." });

                var isSeller = session.Role == "seller";
                // Un comprador recibe SUS tickets y aquellos que un amigo le haya compartido vía QR.
                var tickets = _state.Tickets
                    .Where(t => t.CanBeAccessedBy(user.Email))
                    .Select(t => MapTicketForFrontend(t, user.Email))
                    .ToList();

                var ticketRequests = _state.TicketRequests
                    .Where(r => r.UserEmail.Equals(user.Email, StringComparison.OrdinalIgnoreCase))
                    .Select(MapTicketRequestForFrontend)
                    .ToList();

                var txs = _state.Transactions
                    .Where(tx => tx.UserEmail.Equals(user.Email, StringComparison.OrdinalIgnoreCase))
                    .Select(MapTxForWalletPay)
                    .ToList();

                var orders = _state.Orders
                    .Where(o => o.ApprovalStatus == "approved" &&
                                (isSeller || o.BuyerEmail.Equals(user.Email, StringComparison.OrdinalIgnoreCase)))
                    .Select(MapOrderForMarketStore)
                    .ToList();

                return (200, new
                {
                    ok = true,
                    storeCredit = user.StoreCredit,
                    user = MapUserForFrontend(user),
                    users = _state.Users.Select(MapUserForDirectory).ToList(),
                    tickets,
                    ticketRequests,
                    transactions = txs,
                    orders
                });
            }

            case "tickets.purchase":
            case "tickets.purchase.request":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para adquirir tickets." });

                var amount = GetIntProp(payload, "amount", 0);
                var paymentMethod = GetStringProp(payload, "paymentMethod", "Tarjeta de Débito/Crédito Visa •••• 4821");

                if (!CentralBankStateService.AllowedDenominations.Contains(amount))
                {
                    _state.AddAuditLog("SEC", "#FF3B30", $"[Emisión] Monto inválido rechazado (${amount}) para {session.UserEmail}.");
                    return (400, new
                    {
                        ok = false,
                        code = "INVALID_DENOMINATION",
                        error = "Denominación inválida. Solo se emiten tickets de $50, $100, $200 y $500 MXN."
                    });
                }

                // Toda compra de ticket pasa por la validación y aprobación de tarjeta del Administrador del Banco Central
                var pendingReq = _state.CreatePendingTicketPurchaseRequest(session.UserEmail, amount, paymentMethod);

                return (200, new
                {
                    ok = true,
                    pendingApproval = true,
                    requestId = pendingReq.RequestId,
                    approvalStatus = pendingReq.ApprovalStatus,
                    request = MapTicketRequestForFrontend(pendingReq),
                    message = "Solicitud enviada al Banco Central. Esperando aprobación del pago con tarjeta por el Administrador."
                });
            }

            case "tickets.purchase.status":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Sesión no autenticada." });

                var requestId = GetStringProp(payload, "requestId", "").Trim().ToUpperInvariant();
                _state.ReloadFromDatabase();
                var req = _state.TicketRequests.FirstOrDefault(r =>
                    r.RequestId.Equals(requestId, StringComparison.OrdinalIgnoreCase) &&
                    r.UserEmail.Equals(session.UserEmail, StringComparison.OrdinalIgnoreCase));

                if (req == null)
                {
                    return (404, new { ok = false, code = "REQUEST_NOT_FOUND", error = "Solicitud de compra de ticket no encontrada." });
                }

                var mintedTicket = !string.IsNullOrEmpty(req.MintedTicketId)
                    ? _state.Tickets.FirstOrDefault(t => t.Id == req.MintedTicketId)
                    : null;

                var createdTx = mintedTicket != null
                    ? _state.Transactions.FirstOrDefault(tx => tx.Id == mintedTicket.PurchaseTransactionId)
                    : null;

                return (200, new
                {
                    ok = true,
                    requestId = req.RequestId,
                    approvalStatus = req.ApprovalStatus,
                    statusReport = req.StatusReport,
                    bankAuthCode = req.BankAuthCode,
                    mintedTicketId = req.MintedTicketId,
                    request = MapTicketRequestForFrontend(req),
                    ticket = mintedTicket != null ? MapTicketForFrontend(mintedTicket, session.UserEmail) : null,
                    transaction = createdTx != null ? MapTxForWalletPay(createdTx) : null
                });
            }

            case "tickets.share.scan":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para escanear el código QR de un ticket." });

                var qrData = GetStringProp(payload, "qrData", "");
                if (string.IsNullOrWhiteSpace(qrData))
                {
                    qrData = GetStringProp(payload, "folio", "");
                }

                var (ok, code, msg, sharedTk) = _state.ShareTicketViaQrScan(session.UserEmail, qrData);
                return (200, new
                {
                    ok,
                    code,
                    message = msg,
                    error = ok ? "" : msg,
                    ticket = sharedTk != null ? MapTicketForFrontend(sharedTk, session.UserEmail) : null
                });
            }

            case "tickets.verify":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para verificar un ticket." });

                var folio = GetStringProp(payload, "folio", "").Trim().ToUpperInvariant();
                _state.ReloadFromDatabase();
                var found = _state.FindTicketByFolio(folio);
                if (found == null)
                {
                    return (200, new
                    {
                        ok = false,
                        code = "TICKET_NOT_FOUND",
                        message = $"El folio {folio} no fue emitido por el Banco Central."
                    });
                }

                if (!_state.IsTicketRecordAuthentic(found))
                {
                    _state.AddAuditLog("ALERT", "#FF3B30", $"[Verificación] El ticket {found.Id} presenta datos alterados y fue rechazado.");
                    return (200, new
                    {
                        ok = false,
                        code = "TICKET_TAMPERED",
                        message = $"El ticket {found.Id} fue alterado y no es válido."
                    });
                }

                // Si el cliente o la tienda adjuntan los datos del ticket que tienen en pantalla, se comprueba que no hayan sido modificados.
                if (payload.TryGetProperty("ticket", out var presentedEl) && presentedEl.ValueKind == JsonValueKind.Object)
                {
                    var pAmount = GetIntProp(presentedEl, "amount", found.Amount);
                    var pOwner = GetStringProp(presentedEl, "ownerEmail", found.OwnerEmail);
                    var pEpoch = GetLongProp(presentedEl, "issuedEpoch", found.IssuedEpoch);
                    var pSig = GetStringProp(presentedEl, "signature", "");
                    var canonical = SecurityService.TicketCanonical(found.Id, pAmount, pOwner, pEpoch);

                    if (!_state.Security.Verify(canonical, pSig) || pAmount != found.Amount || pEpoch != found.IssuedEpoch)
                    {
                        _state.AddAuditLog("ALERT", "#FF3B30", $"[Verificación] Ticket {found.Id} modificado en el cliente (monto o sello alterado).");
                        return (200, new
                        {
                            ok = false,
                            code = "TICKET_TAMPERED",
                            message = $"El ticket {found.Id} fue modificado o su sello de autenticidad es inválido."
                        });
                    }
                }

                if (session.Role != "seller" && !found.CanBeAccessedBy(session.UserEmail))
                {
                    return (200, new
                    {
                        ok = false,
                        code = "NOT_TICKET_OWNER",
                        message = $"El ticket {found.Id} pertenece a otra cuenta ({found.OwnerName}) y no ha sido compartido contigo."
                    });
                }

                if (found.Status == TicketStatus.Used)
                {
                    var usedBy = found.UsedByName ?? found.OwnerName;
                    return (200, new
                    {
                        ok = false,
                        code = "TICKET_ALREADY_USED",
                        message = $"ALERTA ANTI-DOBLE GASTO: El ticket {found.Id} ya fue utilizado por {usedBy} en la orden #{found.OrderId} y no puede volver a usarse.",
                        ticket = MapTicketForFrontend(found, session.UserEmail)
                    });
                }

                return (200, new
                {
                    ok = true,
                    code = "TICKET_VALID",
                    message = $"Ticket {found.Id} (${found.Amount} MXN) verificado ante el Banco Central.",
                    ticket = MapTicketForFrontend(found, session.UserEmail)
                });
            }

            case "orders.request":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para realizar una compra." });

                var presented = new List<PresentedTicketDto>();
                if (payload.TryGetProperty("tickets", out var tksEl) && tksEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in tksEl.EnumerateArray())
                    {
                        presented.Add(new PresentedTicketDto
                        {
                            id = GetStringProp(el, "id", ""),
                            amount = GetIntProp(el, "amount", 0),
                            ownerEmail = GetStringProp(el, "ownerEmail", ""),
                            issuedEpoch = GetLongProp(el, "issuedEpoch", 0),
                            signature = GetStringProp(el, "signature", "")
                        });
                    }
                }

                var items = new List<OrderItemDto>();
                if (payload.TryGetProperty("items", out var itemsEl) && itemsEl.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in itemsEl.EnumerateArray())
                    {
                        items.Add(new OrderItemDto
                        {
                            productId = GetStringProp(el, "productId", "PRD-100"),
                            title = GetStringProp(el, "title", "Producto"),
                            quantity = GetIntProp(el, "quantity", 1),
                            unitPrice = GetDecimalProp(el, "unitPrice", 0m),
                            symbolName = GetStringProp(el, "symbolName", "cube.box")
                        });
                    }
                }

                var (ok, msg, kind, orderRec) = _state.CreatePendingOrderRequest(session.UserEmail, presented, items);
                if (!ok || orderRec == null)
                {
                    var code = kind switch
                    {
                        CentralBankStateService.OrderRejection.Tampered => "TICKET_TAMPERED",
                        CentralBankStateService.OrderRejection.Reused => "TICKET_ALREADY_USED",
                        CentralBankStateService.OrderRejection.Reserved => "TICKET_RESERVED",
                        CentralBankStateService.OrderRejection.NotOwner => "NOT_TICKET_OWNER",
                        CentralBankStateService.OrderRejection.Insufficient => "INSUFFICIENT_FUNDS",
                        _ => "ORDER_INVALID"
                    };
                    if (kind is CentralBankStateService.OrderRejection.Tampered or CentralBankStateService.OrderRejection.Reused)
                    {
                        _state.AddAuditLog("ALERT", "#FF3B30", $"[MarketStore] Orden rechazada para {session.UserEmail}: {msg}");
                    }
                    return (200, new { ok = false, code, error = msg });
                }

                return (200, new
                {
                    ok = true,
                    orderId = orderRec.OrderId,
                    approvalStatus = orderRec.ApprovalStatus,
                    message = msg
                });
            }

            case "orders.status":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Sesión no autenticada." });

                var orderId = GetStringProp(payload, "orderId", "").Trim().ToUpperInvariant();
                _state.ReloadFromDatabase();
                var order = _state.Orders.FirstOrDefault(o => o.OrderId.Equals(orderId, StringComparison.OrdinalIgnoreCase));
                if (order == null || (session.Role != "seller" && !order.BuyerEmail.Equals(session.UserEmail, StringComparison.OrdinalIgnoreCase)))
                {
                    return (404, new { ok = false, code = "ORDER_NOT_FOUND", error = "Orden no encontrada en el Banco Central." });
                }

                return (200, new
                {
                    ok = true,
                    orderId = order.OrderId,
                    approvalStatus = order.ApprovalStatus,
                    isAuthenticityVerified = order.IsAuthenticityVerified,
                    isAuthenticityValid = order.IsAuthenticityValid,
                    verificationReport = order.VerificationReport,
                    bankVerificationCode = order.BankVerificationCode,
                    changeCredited = order.ChangeCredited,
                    order = MapOrderForMarketStore(order),
                    receipt = _state.BuildOrderReceipt(order)
                });
            }

            default:
                return (404, new { ok = false, code = "UNKNOWN_ACTION", error = "Operación no reconocida." });
        }
    }

    private object BuildAuthenticatedBundle(BankUser user, string? deviceToken)
    {
        var userTickets = _state.Tickets
            .Where(t => t.CanBeAccessedBy(user.Email))
            .Select(t => MapTicketForFrontend(t, user.Email))
            .ToList();

        var userTicketRequests = _state.TicketRequests
            .Where(r => r.UserEmail.Equals(user.Email, StringComparison.OrdinalIgnoreCase))
            .Select(MapTicketRequestForFrontend)
            .ToList();

        var userTxs = _state.Transactions
            .Where(tx => tx.UserEmail.Equals(user.Email, StringComparison.OrdinalIgnoreCase))
            .Select(MapTxForWalletPay)
            .ToList();

        return new
        {
            ok = true,
            deviceToken,
            user = MapUserForFrontend(user),
            users = _state.Users.Select(MapUserForDirectory).ToList(),
            tickets = userTickets,
            ticketRequests = userTicketRequests,
            transactions = userTxs
        };
    }

    private static object MapUserForDirectory(BankUser u) => new
    {
        id = u.Id,
        name = u.Name,
        email = u.Email,
        role = string.IsNullOrWhiteSpace(u.Role) ? "buyer" : u.Role,
        storeName = u.StoreName,
        verifiedLevel = u.VerifiedLevel,
        avatarInitials = u.AvatarInitials,
        avatarHex = u.AvatarHex
    };

    private static object MapUserForFrontend(BankUser u) => new
    {
        id = u.Id,
        name = u.Name,
        email = u.Email,
        role = string.IsNullOrWhiteSpace(u.Role) ? "buyer" : u.Role,
        storeName = u.StoreName,
        verifiedLevel = u.VerifiedLevel,
        avatarInitials = u.AvatarInitials,
        avatarHex = u.AvatarHex,
        storeCredit = u.StoreCredit,
        unusedTicketsCount = u.UnusedTicketsCount,
        unusedBalance = u.UnusedBalance,
        usedTicketsCount = u.UsedTicketsCount,
        totalCapitalContributed = u.TotalCapitalContributed
    };

    private static object MapTicketForFrontend(BankTicketRecord t, string? viewerEmail = null)
    {
        var isSharedWithViewer = !string.IsNullOrWhiteSpace(viewerEmail) &&
                                 !t.OwnerEmail.Equals(viewerEmail, StringComparison.OrdinalIgnoreCase);
        return new
        {
            id = t.Id,
            serialMasked = t.SerialMasked,
            amount = t.Amount,
            tier = t.Tier,
            colorClass = t.ColorClass,
            status = t.Status == TicketStatus.Used ? "used" : "active",
            issuedAt = $"{t.PurchaseDate}, {t.PurchaseTime}",
            issuedEpoch = t.IssuedEpoch,
            usedAt = t.IsUsed ? $"{t.UsedDate}, {t.UsedTime}" : null,
            usedByName = t.UsedByName,
            usedByEmail = t.UsedByEmail,
            orderId = t.OrderId,
            signatureHash = t.SignatureHash,
            signature = t.Signature,
            qrRevealed = false,
            ownerName = t.OwnerName,
            ownerEmail = t.OwnerEmail,
            isShared = t.IsShared,
            isSharedWithMe = isSharedWithViewer,
            sharedWithEmails = t.GetSharedEmailsList(),
            qrPayload = $"WPTKT1|{t.Id}|{t.Amount}|{t.OwnerEmail}|{t.IssuedEpoch}|{t.SignatureHash}"
        };
    }

    private static object MapTicketRequestForFrontend(PendingTicketPurchaseRecord r) => new
    {
        requestId = r.RequestId,
        amount = r.Amount,
        tier = r.Tier,
        colorClass = r.ColorClass,
        paymentMethod = r.PaymentMethod,
        createdAt = $"{r.CreatedDate}, {r.CreatedTime}",
        approvalStatus = r.ApprovalStatus,
        mintedTicketId = r.MintedTicketId,
        bankAuthCode = r.BankAuthCode,
        statusReport = r.StatusReport
    };

    private static object MapTxForWalletPay(BankTransactionRecord tx) => new
    {
        id = tx.Id,
        type = tx.IsPurchase ? "buy" : "redeem",
        iconType = tx.IsPurchase
            ? (tx.PaymentOrChannel.Contains("SPEI") ? "bank" : tx.PaymentOrChannel.Contains("OXXO") ? "card" : "arrow-up-right")
            : "bag",
        title = $"Ticket de ${tx.Amount}",
        subtitle = tx.PaymentOrChannel,
        date = $"{tx.DateLabel}, {tx.TimeLabel}",
        amount = tx.Amount
    };

    private object MapOrderForMarketStore(PendingOrderApprovalRecord o)
    {
        object? itemsObj;
        object? ticketsObj;
        try { itemsObj = JsonSerializer.Deserialize<JsonElement>(o.ItemsJson); }
        catch { itemsObj = Array.Empty<object>(); }

        try { ticketsObj = JsonSerializer.Deserialize<JsonElement>(o.TicketsJson); }
        catch { ticketsObj = Array.Empty<object>(); }

        return new
        {
            id = o.OrderId,
            createdAt = $"{o.CreatedDate}, {o.CreatedTime}",
            buyerName = o.BuyerName,
            buyerEmail = o.BuyerEmail,
            items = itemsObj,
            subtotal = o.Subtotal,
            ticketsUsed = ticketsObj,
            totalPaidWithTickets = o.TicketsTotal,
            changeCredited = o.ChangeCredited,
            bankVerificationCode = o.BankVerificationCode,
            status = o.DeliveryStatus,
            receipt = _state.BuildOrderReceipt(o)
        };
    }

    private static JsonElement ParseJsonBody(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return JsonSerializer.Deserialize<JsonElement>("{}");
        try { return JsonSerializer.Deserialize<JsonElement>(raw); }
        catch { return JsonSerializer.Deserialize<JsonElement>("{}"); }
    }

    private static string GetStringProp(JsonElement el, string propName, string fallback)
    {
        if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(propName, out var val) && val.ValueKind == JsonValueKind.String)
            return val.GetString() ?? fallback;
        return fallback;
    }

    private static int GetIntProp(JsonElement el, string propName, int fallback)
    {
        if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(propName, out var val))
        {
            if (val.ValueKind == JsonValueKind.Number && val.TryGetInt32(out var num)) return num;
            if (val.ValueKind == JsonValueKind.String && int.TryParse(val.GetString(), out var parsed)) return parsed;
        }
        return fallback;
    }

    private static long GetLongProp(JsonElement el, string propName, long fallback)
    {
        if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(propName, out var val))
        {
            if (val.ValueKind == JsonValueKind.Number && val.TryGetInt64(out var num)) return num;
            if (val.ValueKind == JsonValueKind.String && long.TryParse(val.GetString(), out var parsed)) return parsed;
        }
        return fallback;
    }

    private static decimal GetDecimalProp(JsonElement el, string propName, decimal fallback)
    {
        if (el.ValueKind == JsonValueKind.Object && el.TryGetProperty(propName, out var val))
        {
            if (val.ValueKind == JsonValueKind.Number && val.TryGetDecimal(out var num)) return num;
            if (val.ValueKind == JsonValueKind.String && decimal.TryParse(val.GetString(), out var parsed)) return parsed;
        }
        return fallback;
    }

    private static async Task WriteJsonAsync(NetworkStream stream, int statusCode, object payload)
    {
        var json = JsonSerializer.Serialize(payload);
        await WriteHttpResponseAsync(stream, statusCode, json);
    }

    private static async Task WriteHttpResponseAsync(NetworkStream stream, int statusCode, string body)
    {
        var statusText = statusCode switch
        {
            200 => "OK",
            204 => "No Content",
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            409 => "Conflict",
            413 => "Payload Too Large",
            426 => "Upgrade Required",
            429 => "Too Many Requests",
            _ => "Internal Server Error"
        };

        var bodyBytes = Encoding.UTF8.GetBytes(body);
        var headerSb = new StringBuilder();
        headerSb.Append($"HTTP/1.1 {statusCode} {statusText}\r\n");
        headerSb.Append("Content-Type: application/json; charset=utf-8\r\n");
        headerSb.Append($"Content-Length: {bodyBytes.Length}\r\n");
        headerSb.Append("Access-Control-Allow-Origin: *\r\n");
        headerSb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        headerSb.Append("Access-Control-Allow-Headers: Content-Type, Authorization, X-Client-Platform, Access-Control-Request-Private-Network\r\n");
        headerSb.Append("Access-Control-Allow-Private-Network: true\r\n");
        headerSb.Append("Cache-Control: no-store\r\n");
        headerSb.Append("Connection: close\r\n\r\n");

        var headerBytes = Encoding.UTF8.GetBytes(headerSb.ToString());
        await stream.WriteAsync(headerBytes, 0, headerBytes.Length);
        if (bodyBytes.Length > 0)
        {
            await stream.WriteAsync(bodyBytes, 0, bodyBytes.Length);
        }
        await stream.FlushAsync();
    }

    public void Dispose()
    {
        try
        {
            _cts.Cancel();
            _tcpListener?.Stop();
        }
        catch { }
    }
}
