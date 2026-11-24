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
    private const int MaxRequestBytes = 8_388_608;
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
    public const string BackupDiscoveryChannelUrl = "https://ntfy.sh/marketstore_cb_dabi0212_v2";
    public const string VercelStoreProductionUrl = "https://proyecto-intercomunicacion-segurida.vercel.app";

    private string _lastGitPublishedHttpsUrl = string.Empty;
    private DateTime _lastNtfyPublishedAt = DateTime.MinValue;

    public const int DefaultPort = 7070;
    public string BaseUrl { get; } = $"http://0.0.0.0:{DefaultPort}/";
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

    /// <summary>
    /// true si esta ventana de CentralBank es la que atiende el puerto 7070 (nodo principal).
    /// Las demás ventanas abiertas funcionan como consolas de administrador adicionales que comparten
    /// la misma base SQLite y se actualizan en tiempo real.
    /// </summary>
    public bool IsRunning => _isRunning;

    public bool Start(bool quiet = false)
    {
        if (_isRunning) return true;
        var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
        TcpListener? listener = null;
        try
        {
            if (!quiet)
            {
                try { File.AppendAllText(logPath, $"[APISERVER START {DateTime.Now}] Intentando abrir puerto {DefaultPort}...\n"); } catch { }
                TryOpenWindowsFirewallPort();
            }

            listener = new TcpListener(IPAddress.Any, DefaultPort);
            // Uso exclusivo del puerto: evita que dos consolas abiertas atiendan el mismo puerto a la vez.
            listener.ExclusiveAddressUse = true;
            listener.Start();
            _tcpListener = listener;
            _isRunning = true;

            try { File.AppendAllText(logPath, $"[APISERVER START {DateTime.Now}] Puerto {DefaultPort} ABIERTO Y ESCUCHANDO EXITOSAMENTE.\n"); } catch { }
            if (quiet)
            {
                _state.AddAuditLog("NET", "#34C759", $"[Multi-Administrador] Esta consola tomó el control del servidor API :{DefaultPort} (la consola principal anterior se cerró).");
            }

            _ = Task.Run(() => AcceptClientsLoopAsync(_cts.Token));
            _ = Task.Run(() => StartAutomaticPublicTunnelAndDiscoveryAsync(_cts.Token));
            return true;
        }
        catch (SocketException) when (IsPortServedByAnotherConsole())
        {
            try { listener?.Stop(); } catch { }
            if (!quiet)
            {
                _state.AddAuditLog("NET", "#007AFF", $"[Multi-Administrador] Consola de administrador adicional conectada. El servidor API :{DefaultPort} ya lo atiende otra consola de CentralBank; esta ventana comparte la misma base SQLite en tiempo real.");
            }
            return false;
        }
        catch (Exception ex)
        {
            try { listener?.Stop(); } catch { }
            if (!quiet)
            {
                try { File.AppendAllText(logPath, $"[APISERVER START ERROR {DateTime.Now}] {ex}\n"); } catch { }
                _state.AddAuditLog("WARN", "#FF9500", $"[Servidor API] No se pudo iniciar en puerto {DefaultPort}: {ex.Message}");
            }
            return false;
        }
    }

    private static bool IsPortServedByAnotherConsole()
    {
        try
        {
            using var client = new TcpClient();
            var connectTask = client.ConnectAsync(IPAddress.Loopback, DefaultPort);
            return connectTask.Wait(800) && client.Connected;
        }
        catch
        {
            return false;
        }
    }

    private static void TryOpenWindowsFirewallPort()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netsh",
                Arguments = $"advfirewall firewall add rule name=\"CentralBank_API_{DefaultPort}\" dir=in action=allow protocol=TCP localport={DefaultPort}",
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
                Arguments = $"tunnel --url http://127.0.0.1:{DefaultPort} --no-autoupdate",
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

            // Republicar periódicamente cada 5 minutos para no exceder límites de ntfy.sh
            while (!token.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromMinutes(5), token);
                await PublishDiscoveryEndpointsAsync(PublicHttpsTunnelUrl, forcePublish: false);
            }
        }
        catch
        {
            // Si no hay internet para túnel público, continúa operando en red local automáticamente
        }
    }

    private async Task PublishDiscoveryEndpointsAsync(string httpsApiUrl, bool forcePublish = true)
    {
        try
        {
            var lanIp = GetLocalLanIp();
            var lanUrl = $"http://{lanIp}:{DefaultPort}/api";
            var allLanUrls = GetAllLocalLanIps().Select(ip => $"http://{ip}:{DefaultPort}/api").ToArray();

            var payloadObj = new
            {
                httpsUrl = httpsApiUrl,
                lanUrl,
                allLanUrls,
                storeUrl = VercelStoreProductionUrl,
                ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            var json = JsonSerializer.Serialize(payloadObj);

            // 1. Guardar archivo local bank-discovery.json en la raíz del repositorio y sincronizarlo con GitHub raw
            // cuando se obtiene una nueva URL de túnel HTTPS (para que GitHub API y GitHub Raw siempre tengan el túnel activo)
            try
            {
                var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
                while (dir != null)
                {
                    if (Directory.Exists(Path.Combine(dir.FullName, ".git")))
                    {
                        var discoveryPath = Path.Combine(dir.FullName, "bank-discovery.json");
                        await File.WriteAllTextAsync(discoveryPath, json, Encoding.UTF8);

                        if (!string.IsNullOrWhiteSpace(httpsApiUrl) &&
                            !string.Equals(_lastGitPublishedHttpsUrl, httpsApiUrl, StringComparison.OrdinalIgnoreCase))
                        {
                            _lastGitPublishedHttpsUrl = httpsApiUrl;
                            _ = Task.Run(() => TryPushDiscoveryToGitHubRepository(dir.FullName));
                        }
                        break;
                    }
                    dir = dir.Parent;
                }
            }
            catch { }

            // 2. Publicar en los canales de descubrimiento HTTPS con control de frecuencia para evitar HTTP 429
            if (!forcePublish && (DateTime.UtcNow - _lastNtfyPublishedAt).TotalMinutes < 4.5)
            {
                return;
            }
            _lastNtfyPublishedAt = DateTime.UtcNow;

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            foreach (var channel in new[] { DiscoveryChannelUrl, BackupDiscoveryChannelUrl })
            {
                try
                {
                    using var content = new StringContent(json, Encoding.UTF8, "text/plain");
                    await http.PostAsync(channel, content);
                }
                catch { }
            }
        }
        catch { }
    }

    private static void TryPushDiscoveryToGitHubRepository(string repoRoot)
    {
        try
        {
            void RunGit(string args)
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "git",
                    Arguments = args,
                    WorkingDirectory = repoRoot,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using var p = Process.Start(psi);
                p?.WaitForExit(8000);
            }

            RunGit("add bank-discovery.json");
            RunGit("commit -m \"chore: auto-sync active CentralBank tunnel endpoint [skip ci]\" --only bank-discovery.json");
            RunGit("push origin main");
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
                    httpsTunnelUrl = PublicHttpsTunnelUrl,
                    storeUrl = VercelStoreProductionUrl,
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
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        if (nonce.Length < 12)
        {
            await WriteEncryptedAsync(stream, session, 400, new
            {
                ok = false,
                code = "STALE_MESSAGE",
                error = "Solicitud inválida. Inténtalo de nuevo."
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

        (int status, object responseObj) result;
        lock (_state.SyncRoot)
        {
            result = DispatchSecureAction(session, action, payload, remoteIp);
        }
        await WriteEncryptedAsync(stream, session, result.status, result.responseObj);
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
                // Por privacidad y aislamiento multi-dispositivo, no se devuelve la lista global de cuentas de otros dispositivos.
                return (200, new { ok = true, users = Array.Empty<object>() });
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
                return (200, BuildAuthenticatedBundle(user, deviceToken));
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

            case "user.cards.save":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para guardar tu tarjeta." });

                var cardsJson = "[]";
                if (payload.TryGetProperty("cards", out var cardsEl))
                {
                    cardsJson = cardsEl.GetRawText();
                }
                else
                {
                    cardsJson = GetStringProp(payload, "cardsJson", "[]");
                }

                var updatedJson = _state.UpdateUserSavedCards(session.UserEmail, cardsJson);
                _state.AddAuditLog("CARD", "#007AFF", $"[Tarjeta Vinculada] El usuario {session.UserEmail} actualizó sus tarjetas vinculadas en su cuenta.");
                return (200, new { ok = true, savedCardsJson = updatedJson });
            }

            case "catalog.products.save":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para actualizar el catálogo." });

                var productsJson = "[]";
                if (payload.TryGetProperty("products", out var prodsEl))
                {
                    productsJson = prodsEl.GetRawText();
                }
                else
                {
                    productsJson = GetStringProp(payload, "productsJson", "[]");
                }

                var savedJson = _state.SaveMarketStoreProductsJson(productsJson);
                _state.AddAuditLog("STORE", "#007AFF", $"[Catálogo MarketStore] {session.UserEmail} actualizó el catálogo de productos.");
                return (200, new { ok = true, productsJson = savedJson });
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
                    users = new[] { MapUserForDirectory(user) },
                    tickets,
                    ticketRequests,
                    transactions = txs,
                    orders,
                    productsJson = _state.GetMarketStoreProductsJson()
                });
            }

            case "tickets.purchase":
            case "tickets.purchase.request":
            {
                if (!session.IsAuthenticated || session.UserEmail == null)
                    return (401, new { ok = false, code = "UNAUTHORIZED", error = "Inicia sesión para adquirir tickets." });

                // La compra de tickets se realiza exclusivamente desde la app móvil WalletPay.
                if (!string.Equals(session.Client, "WalletPay", StringComparison.OrdinalIgnoreCase))
                {
                    _state.AddAuditLog("SEC", "#FF9500", $"[Emisión] Intento de compra de ticket desde {session.Client} bloqueado para {session.UserEmail}. Solo se permite desde WalletPay.");
                    return (403, new
                    {
                        ok = false,
                        code = "WALLETPAY_ONLY",
                        error = "Los tickets solo pueden comprarse desde la app WalletPay."
                    });
                }

                var amount = GetIntProp(payload, "amount", 0);
                var quantity = Math.Clamp(GetIntProp(payload, "quantity", 1), 1, 50);
                var paymentMethod = GetStringProp(payload, "paymentMethod", "Tarjeta de Débito/Crédito");

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
                var pendingReq = _state.CreatePendingTicketPurchaseRequest(session.UserEmail, amount, paymentMethod, quantity);

                return (200, new
                {
                    ok = true,
                    pendingApproval = true,
                    requestId = pendingReq.RequestId,
                    quantity = pendingReq.Quantity,
                    totalAmount = pendingReq.TotalAmount,
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

                var mintedIds = !string.IsNullOrEmpty(req.MintedTicketId)
                    ? req.MintedTicketId.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    : Array.Empty<string>();

                var mintedTickets = mintedIds
                    .Select(id => _state.Tickets.FirstOrDefault(t => t.Id == id))
                    .Where(t => t != null)
                    .Cast<BankTicketRecord>()
                    .ToList();

                var mintedTicket = mintedTickets.FirstOrDefault();

                var createdTx = mintedTicket != null
                    ? _state.Transactions.FirstOrDefault(tx => tx.Id == mintedTicket.PurchaseTransactionId)
                    : null;

                return (200, new
                {
                    ok = true,
                    requestId = req.RequestId,
                    quantity = req.Quantity,
                    totalAmount = req.TotalAmount,
                    approvalStatus = req.ApprovalStatus,
                    statusReport = req.StatusReport,
                    bankAuthCode = req.BankAuthCode,
                    mintedTicketId = req.MintedTicketId,
                    request = MapTicketRequestForFrontend(req),
                    ticket = mintedTicket != null ? MapTicketForFrontend(mintedTicket, session.UserEmail) : null,
                    tickets = mintedTickets.Select(t => MapTicketForFrontend(t, session.UserEmail)).ToList(),
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

                // Validación AUTOMÁTICA: el banco verifica la autenticidad, titularidad y no-doble-gasto de cada
                // ticket y liquida la compra sin intervención del Administrador.
                var (approved, approveMsg) = _state.ApprovePendingOrder(orderRec.OrderId);
                _state.ReloadFromDatabase();
                var finalOrder = _state.Orders.FirstOrDefault(o => o.OrderId == orderRec.OrderId) ?? orderRec;

                if (!approved)
                {
                    return (200, new
                    {
                        ok = false,
                        code = "ORDER_REJECTED",
                        orderId = finalOrder.OrderId,
                        approvalStatus = finalOrder.ApprovalStatus,
                        error = string.IsNullOrWhiteSpace(finalOrder.VerificationReport) ? approveMsg : finalOrder.VerificationReport
                    });
                }

                return (200, new
                {
                    ok = true,
                    orderId = finalOrder.OrderId,
                    approvalStatus = finalOrder.ApprovalStatus,
                    bankVerificationCode = finalOrder.BankVerificationCode,
                    changeCredited = finalOrder.ChangeCredited,
                    order = MapOrderForMarketStore(finalOrder),
                    receipt = _state.BuildOrderReceipt(finalOrder),
                    message = "Compra verificada y aprobada automáticamente por el Banco Central."
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
            users = new[] { MapUserForDirectory(user) },
            tickets = userTickets,
            ticketRequests = userTicketRequests,
            transactions = userTxs,
            productsJson = _state.GetMarketStoreProductsJson()
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
        savedCardsJson = string.IsNullOrWhiteSpace(u.SavedCardsJson) ? "[]" : u.SavedCardsJson,
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
        quantity = r.Quantity,
        totalAmount = r.TotalAmount,
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
            if (_tunnelProcess != null && !_tunnelProcess.HasExited)
            {
                _tunnelProcess.Kill();
            }
        }
        catch { }
    }
}
