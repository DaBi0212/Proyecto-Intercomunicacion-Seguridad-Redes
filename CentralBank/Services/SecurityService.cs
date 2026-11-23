using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace CentralBank.Services;

/// <summary>
/// Núcleo de protección del Banco Central.
///
///  ┌───────────────────────┬──────────────────────────────────────────────┬─────────────────────────────────────────────┐
///  │ Mecanismo             │ Dónde se aplica                              │ Amenaza que mitiga                          │
///  ├───────────────────────┼──────────────────────────────────────────────┼─────────────────────────────────────────────┤
///  │ Asimétrico RSA-OAEP   │ Apertura de sesión: el cliente envuelve una  │ Robo de la llave de sesión / MitM pasivo.   │
///  │ (2048, SHA-256)       │ llave AES aleatoria con la llave pública.    │                                             │
///  │ Simétrico AES-256-GCM │ Todo el tráfico de negocio (/api/secure).    │ Espionaje y modificación de mensajes        │
///  │                       │ AAD = id de sesión; tag de 128 bits.         │ (tag inválido ⇒ mensaje rechazado).         │
///  │ Hash SHA-256 / PBKDF2 │ Contraseñas (PBKDF2-SHA256 + sal), tokens de │ Robo de BD con contraseñas, tokens          │
///  │                       │ dispositivo, huella de tickets y de órdenes. │ reutilizables, alteración de datos.         │
///  │ Firma RSA PKCS#1 v1.5 │ Emisión de tickets, sellado de órdenes y     │ Tickets falsificados o modificados, recibos │
///  │ (SHA-256)             │ recibos de aprobación enviados a la tienda.  │ de aprobación forjados.                     │
///  │ Nonce + timestamp     │ Cada mensaje cifrado.                        │ Reenvío (replay) de mensajes capturados.    │
///  └───────────────────────┴──────────────────────────────────────────────┴─────────────────────────────────────────────┘
/// </summary>
public sealed class SecurityService
{
    public const int AesKeySize = 32;
    public const int GcmNonceSize = 12;
    public const int GcmTagSize = 16;
    private const int Pbkdf2Iterations = 120_000;
    private const int Pbkdf2SaltSize = 16;
    private const int Pbkdf2HashSize = 32;

    private readonly RSA _rsa;
    private readonly byte[] _spki;

    public string PublicKeySpkiBase64 { get; }
    public string PublicKeyFingerprint { get; }

    public SecurityService(string storageDirectory)
    {
        Directory.CreateDirectory(storageDirectory);
        var keyFile = Path.Combine(storageDirectory, "bank_identity.bin");
        _rsa = LoadOrCreateIdentity(keyFile);
        _spki = _rsa.ExportSubjectPublicKeyInfo();
        PublicKeySpkiBase64 = Convert.ToBase64String(_spki);
        PublicKeyFingerprint = Convert.ToHexString(SHA256.HashData(_spki)).ToLowerInvariant();
    }

    /// <summary>
    /// La llave privada nunca se guarda en claro: se protege con DPAPI (ligada al usuario de Windows).
    /// </summary>
    private static RSA LoadOrCreateIdentity(string keyFile)
    {
        var rsa = RSA.Create();
        if (File.Exists(keyFile))
        {
            try
            {
                var protectedBytes = File.ReadAllBytes(keyFile);
                var pkcs8 = ProtectedData.Unprotect(protectedBytes, Encoding.UTF8.GetBytes("CentralBank.Identity.v1"), DataProtectionScope.CurrentUser);
                rsa.ImportPkcs8PrivateKey(pkcs8, out _);
                CryptographicOperations.ZeroMemory(pkcs8);
                return rsa;
            }
            catch
            {
                // Archivo corrupto o de otro usuario: se regenera la identidad.
            }
        }

        rsa.Dispose();
        var created = RSA.Create(2048);
        var raw = created.ExportPkcs8PrivateKey();
        var sealedBytes = ProtectedData.Protect(raw, Encoding.UTF8.GetBytes("CentralBank.Identity.v1"), DataProtectionScope.CurrentUser);
        File.WriteAllBytes(keyFile, sealedBytes);
        CryptographicOperations.ZeroMemory(raw);
        return created;
    }

    // =====================================================================
    // FIRMA DIGITAL
    // =====================================================================

    public string Sign(string canonical)
    {
        var sig = _rsa.SignData(Encoding.UTF8.GetBytes(canonical), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return Convert.ToBase64String(sig);
    }

    public bool Verify(string canonical, string? signatureB64)
    {
        if (string.IsNullOrWhiteSpace(signatureB64)) return false;
        try
        {
            var sig = Convert.FromBase64String(signatureB64);
            return _rsa.VerifyData(Encoding.UTF8.GetBytes(canonical), sig, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        catch
        {
            return false;
        }
    }

    // =====================================================================
    // CIFRADO ASIMÉTRICO (intercambio de llave de sesión)
    // =====================================================================

    public byte[]? UnwrapSessionKey(string wrappedB64)
    {
        try
        {
            var key = _rsa.Decrypt(Convert.FromBase64String(wrappedB64), RSAEncryptionPadding.OaepSHA256);
            if (key.Length != AesKeySize)
            {
                CryptographicOperations.ZeroMemory(key);
                return null;
            }
            return key;
        }
        catch
        {
            return null;
        }
    }

    // =====================================================================
    // CIFRADO SIMÉTRICO AUTENTICADO
    // =====================================================================

    public static (string IvB64, string DataB64) Encrypt(byte[] key, string plaintext, string aad)
    {
        var nonce = RandomNumberGenerator.GetBytes(GcmNonceSize);
        var pt = Encoding.UTF8.GetBytes(plaintext);
        var ct = new byte[pt.Length];
        var tag = new byte[GcmTagSize];
        using (var gcm = new AesGcm(key, GcmTagSize))
        {
            gcm.Encrypt(nonce, pt, ct, tag, Encoding.UTF8.GetBytes(aad));
        }
        var combined = new byte[ct.Length + tag.Length];
        Buffer.BlockCopy(ct, 0, combined, 0, ct.Length);
        Buffer.BlockCopy(tag, 0, combined, ct.Length, tag.Length);
        return (Convert.ToBase64String(nonce), Convert.ToBase64String(combined));
    }

    /// <summary>Devuelve null si el mensaje fue alterado (tag GCM inválido) o está mal formado.</summary>
    public static string? Decrypt(byte[] key, string ivB64, string dataB64, string aad)
    {
        try
        {
            var nonce = Convert.FromBase64String(ivB64);
            var combined = Convert.FromBase64String(dataB64);
            if (nonce.Length != GcmNonceSize || combined.Length < GcmTagSize) return null;

            var ctLen = combined.Length - GcmTagSize;
            var ct = combined.AsSpan(0, ctLen);
            var tag = combined.AsSpan(ctLen, GcmTagSize);
            var pt = new byte[ctLen];
            using var gcm = new AesGcm(key, GcmTagSize);
            gcm.Decrypt(nonce, ct, tag, pt, Encoding.UTF8.GetBytes(aad));
            return Encoding.UTF8.GetString(pt);
        }
        catch
        {
            return null;
        }
    }

    // =====================================================================
    // HASH
    // =====================================================================

    public static string Sha256Hex(string input) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(Pbkdf2SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Pbkdf2Iterations, HashAlgorithmName.SHA256, Pbkdf2HashSize);
        return $"pbkdf2${Pbkdf2Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool IsHashedPassword(string stored) => stored.StartsWith("pbkdf2$", StringComparison.Ordinal);

    public static bool VerifyPassword(string password, string stored)
    {
        if (!IsHashedPassword(stored)) return false;
        var parts = stored.Split('$');
        if (parts.Length != 4 || !int.TryParse(parts[1], out var iterations)) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch
        {
            return false;
        }
    }

    public static bool FixedTimeEqualsText(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    public static string NewToken(int bytes = 32) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string NewHex(int bytes) => Convert.ToHexString(RandomNumberGenerator.GetBytes(bytes)).ToUpperInvariant();

    public static int NewInt(int minInclusive, int maxExclusive) => RandomNumberGenerator.GetInt32(minInclusive, maxExclusive);

    // =====================================================================
    // FORMAS CANÓNICAS (deben coincidir byte a byte con WalletPay y MarketStore)
    // =====================================================================

    public static string TicketCanonical(string id, int amount, string ownerEmail, long issuedEpoch) =>
        $"TKT1|{id}|{amount}|{ownerEmail.Trim().ToLowerInvariant()}|{issuedEpoch}";

    public static string ReceiptCanonical(string orderId, string status, string bankCode, decimal subtotal, IEnumerable<string> ticketIds, string buyerEmail) =>
        $"RCP1|{orderId}|{status}|{bankCode}|{ToCents(subtotal)}|{string.Join(",", ticketIds.OrderBy(x => x, StringComparer.Ordinal))}|{buyerEmail.Trim().ToLowerInvariant()}";

    public static string OrderCanonical(string orderId, string buyerEmail, decimal subtotal, decimal ticketsTotal, decimal creditUsed, decimal change, string ticketIdsCsv, string itemsJson) =>
        $"ORD1|{orderId}|{buyerEmail.Trim().ToLowerInvariant()}|{ToCents(subtotal)}|{ToCents(ticketsTotal)}|{ToCents(creditUsed)}|{ToCents(change)}|{ticketIdsCsv}|{Sha256Hex(itemsJson)}";

    public static long ToCents(decimal value) => (long)Math.Round(value * 100m, MidpointRounding.AwayFromZero);

    public static string Fingerprint(string canonical) => $"BC-{Sha256Hex(canonical).ToUpperInvariant()[..24]}";
}

// =========================================================================
// SESIONES CIFRADAS
// =========================================================================

public sealed class SecureSession
{
    public string Id { get; init; } = string.Empty;
    public byte[] Key { get; init; } = Array.Empty<byte>();
    public DateTime CreatedUtc { get; init; } = DateTime.UtcNow;
    public DateTime LastSeenUtc { get; set; } = DateTime.UtcNow;
    public string? UserEmail { get; set; }
    public string Role { get; set; } = "buyer";
    public string Client { get; set; } = "unknown";
    public int FailedAuthAttempts { get; set; }
    public readonly ConcurrentDictionary<string, long> SeenNonces = new();
    public readonly object Sync = new();

    public bool IsAuthenticated => !string.IsNullOrWhiteSpace(UserEmail);
}

public sealed class SessionStore
{
    // Las sesiones de WalletPay y MarketStore no caducan por inactividad: permanecen abiertas
    // hasta que el usuario cierre sesión manualmente (solo se purgan canales abandonados por semanas).
    private static readonly TimeSpan IdleTimeout = TimeSpan.FromDays(30);
    private readonly ConcurrentDictionary<string, SecureSession> _sessions = new();

    public SecureSession Create(byte[] key, string client)
    {
        Sweep();
        var s = new SecureSession { Id = SecurityService.NewToken(18), Key = key, Client = client };
        _sessions[s.Id] = s;
        return s;
    }

    public SecureSession? Get(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        if (!_sessions.TryGetValue(id, out var s)) return null;
        if (DateTime.UtcNow - s.LastSeenUtc > IdleTimeout)
        {
            Remove(id);
            return null;
        }
        s.LastSeenUtc = DateTime.UtcNow;
        return s;
    }

    public void Remove(string id)
    {
        if (_sessions.TryRemove(id, out var s))
        {
            CryptographicOperations.ZeroMemory(s.Key);
        }
    }

    private void Sweep()
    {
        var now = DateTime.UtcNow;
        foreach (var kv in _sessions.Where(kv => now - kv.Value.LastSeenUtc > IdleTimeout).ToList())
        {
            Remove(kv.Key);
        }
    }
}

/// <summary>Bloqueo progresivo ante credenciales inválidas (fuerza bruta).</summary>
public sealed class LoginThrottle
{
    private const int MaxFailures = 5;
    private static readonly TimeSpan LockDuration = TimeSpan.FromMinutes(5);
    private readonly ConcurrentDictionary<string, (int Failures, DateTime LockedUntil)> _state = new();

    public bool IsLocked(string key, out TimeSpan remaining)
    {
        remaining = TimeSpan.Zero;
        if (_state.TryGetValue(key, out var st) && st.LockedUntil > DateTime.UtcNow)
        {
            remaining = st.LockedUntil - DateTime.UtcNow;
            return true;
        }
        return false;
    }

    public int RegisterFailure(string key)
    {
        var st = _state.AddOrUpdate(key,
            _ => (1, DateTime.MinValue),
            (_, prev) =>
            {
                var failures = prev.LockedUntil > DateTime.MinValue && prev.LockedUntil <= DateTime.UtcNow ? 1 : prev.Failures + 1;
                return failures >= MaxFailures ? (failures, DateTime.UtcNow.Add(LockDuration)) : (failures, prev.LockedUntil);
            });
        return Math.Max(0, MaxFailures - st.Failures);
    }

    public void Reset(string key) => _state.TryRemove(key, out _);
}

/// <summary>Tokens de un solo uso para pasar la sesión de WalletPay a MarketStore sin exponer credenciales.</summary>
public sealed class HandoffStore
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(120);
    private readonly ConcurrentDictionary<string, (string Email, DateTime ExpiresUtc)> _tokens = new();

    public string Issue(string email)
    {
        foreach (var kv in _tokens.Where(kv => kv.Value.ExpiresUtc < DateTime.UtcNow).ToList())
            _tokens.TryRemove(kv.Key, out _);

        var token = SecurityService.NewToken(24);
        _tokens[SecurityService.Sha256Hex(token)] = (email, DateTime.UtcNow.Add(Ttl));
        return token;
    }

    /// <summary>Consume el token (uso único). Un segundo intento con el mismo token falla.</summary>
    public string? Redeem(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        if (!_tokens.TryRemove(SecurityService.Sha256Hex(token), out var entry)) return null;
        return entry.ExpiresUtc >= DateTime.UtcNow ? entry.Email : null;
    }
}
