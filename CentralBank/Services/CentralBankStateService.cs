using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CentralBank.Models;
using Microsoft.Data.Sqlite;

namespace CentralBank.Services;

public class OrderItemDto
{
    public string productId { get; set; } = string.Empty;
    public string title { get; set; } = string.Empty;
    public int quantity { get; set; }
    public decimal unitPrice { get; set; }
    public string symbolName { get; set; } = "cube.box";
}

public class PresentedTicketDto
{
    public string id { get; set; } = string.Empty;
    public int amount { get; set; }
    public string ownerEmail { get; set; } = string.Empty;
    public long issuedEpoch { get; set; }
    public string signature { get; set; } = string.Empty;
}

public class CentralBankStateService
{
    private readonly string _dbFilePath;
    private readonly string _connectionString;
    private readonly object _dbLock = new();

    public List<BankUser> Users { get; private set; } = new();
    public List<BankTicketRecord> Tickets { get; private set; } = new();
    public List<BankTransactionRecord> Transactions { get; private set; } = new();
    public List<PendingTicketPurchaseRecord> TicketRequests { get; private set; } = new();
    public List<PendingOrderApprovalRecord> Orders { get; private set; } = new();
    public List<AuditLogEntry> AuditLogs { get; private set; } = new();

    public object SyncRoot => _dbLock;

    public event Action<string>? StateChanged;
    public event Action<PendingOrderApprovalRecord>? PendingOrderCreated;
    public event Action<PendingTicketPurchaseRecord>? PendingTicketRequestCreated;

    public string DatabaseFilePath => _dbFilePath;

    public CentralBankStateService()
    {
        var projectRoot = ResolveProjectRootDirectory();
        var dbDir = Path.Combine(projectRoot, "Database");
        Directory.CreateDirectory(dbDir);

        // Eliminar cualquier archivo JSON de prueba anterior si existiera
        var legacyJson = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_ledger.json");
        if (File.Exists(legacyJson))
        {
            try { File.Delete(legacyJson); } catch { }
        }

        _dbFilePath = Path.Combine(dbDir, "centralbank.db");
        _connectionString = $"Data Source={_dbFilePath};Default Timeout=10;Pooling=True";

        Security = new SecurityService(dbDir);

        InitializeDatabaseSchema();
        ReloadFromDatabase();
        SealLegacyRecords();
    }

    /// <summary>Identidad del banco: llaves, firmas, hash y cifrado.</summary>
    public SecurityService Security { get; }

    public static readonly int[] AllowedDenominations = { 50, 100, 200, 500 };

    private static string ResolveProjectRootDirectory()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var dir = new DirectoryInfo(baseDir);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "CentralBank.csproj")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        return baseDir;
    }

    // =========================================================================
    // BASE DE DATOS SQLITE REAL (SIN DATOS DE PRUEBA)
    // =========================================================================

    private void InitializeDatabaseSchema()
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                PRAGMA journal_mode=WAL;
                PRAGMA synchronous=NORMAL;
                PRAGMA busy_timeout=10000;

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'buyer',
                    store_name TEXT NOT NULL DEFAULT '',
                    role_label TEXT NOT NULL,
                    verified_level TEXT NOT NULL,
                    avatar_initials TEXT NOT NULL,
                    avatar_hex TEXT NOT NULL,
                    store_credit REAL NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS tickets (
                    id TEXT PRIMARY KEY,
                    serial_masked TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    tier TEXT NOT NULL,
                    color_class TEXT NOT NULL,
                    owner_user_id TEXT NOT NULL,
                    owner_name TEXT NOT NULL,
                    owner_email TEXT NOT NULL,
                    owner_initials TEXT NOT NULL,
                    status TEXT NOT NULL,
                    purchase_date TEXT NOT NULL,
                    purchase_time TEXT NOT NULL,
                    payment_method TEXT NOT NULL,
                    purchase_tx_id TEXT NOT NULL,
                    used_date TEXT,
                    used_time TEXT,
                    order_id TEXT,
                    merchant_name TEXT,
                    bank_verification_code TEXT,
                    signature_hash TEXT NOT NULL,
                    created_epoch INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    ticket_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    user_initials TEXT NOT NULL,
                    user_avatar_hex TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    ticket_tier TEXT NOT NULL,
                    date_label TEXT NOT NULL,
                    time_label TEXT NOT NULL,
                    purchase_time_label TEXT NOT NULL,
                    payment_or_channel TEXT NOT NULL,
                    order_id TEXT,
                    bank_auth_code TEXT NOT NULL,
                    signature_hash TEXT NOT NULL,
                    current_ticket_status TEXT NOT NULL,
                    ticket_used_at_label TEXT,
                    created_epoch INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS orders (
                    order_id TEXT PRIMARY KEY,
                    buyer_user_id TEXT NOT NULL,
                    buyer_name TEXT NOT NULL,
                    buyer_email TEXT NOT NULL,
                    buyer_initials TEXT NOT NULL,
                    created_date TEXT NOT NULL,
                    created_time TEXT NOT NULL,
                    subtotal REAL NOT NULL,
                    tickets_total REAL NOT NULL,
                    store_credit_used REAL NOT NULL,
                    change_credited REAL NOT NULL,
                    items_summary TEXT NOT NULL,
                    items_json TEXT NOT NULL,
                    ticket_ids_csv TEXT NOT NULL,
                    tickets_json TEXT NOT NULL,
                    approval_status TEXT NOT NULL,
                    is_authenticity_verified INTEGER NOT NULL DEFAULT 0,
                    is_authenticity_valid INTEGER NOT NULL DEFAULT 0,
                    verification_report TEXT NOT NULL,
                    bank_verification_code TEXT NOT NULL,
                    delivery_status TEXT NOT NULL DEFAULT 'verified',
                    created_epoch INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    time TEXT NOT NULL,
                    category TEXT NOT NULL,
                    accent_hex TEXT NOT NULL,
                    message TEXT NOT NULL
                );
            ";
            cmd.ExecuteNonQuery();

            // Migración segura si la tabla users ya existía sin password/role/store_name
            TryAlterColumn(conn, "ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT '';");
            TryAlterColumn(conn, "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'buyer';");
            TryAlterColumn(conn, "ALTER TABLE users ADD COLUMN store_name TEXT NOT NULL DEFAULT '';");
            TryAlterColumn(conn, "ALTER TABLE users ADD COLUMN saved_cards_json TEXT NOT NULL DEFAULT '[]';");
            TryAlterColumn(conn, "ALTER TABLE tickets ADD COLUMN signature TEXT NOT NULL DEFAULT '';");
            TryAlterColumn(conn, "ALTER TABLE tickets ADD COLUMN shared_with_emails TEXT NOT NULL DEFAULT '';");
            TryAlterColumn(conn, "ALTER TABLE tickets ADD COLUMN used_by_email TEXT;");
            TryAlterColumn(conn, "ALTER TABLE tickets ADD COLUMN used_by_name TEXT;");
            TryAlterColumn(conn, "ALTER TABLE orders ADD COLUMN integrity_sig TEXT NOT NULL DEFAULT '';");
            TryAlterColumn(conn, "ALTER TABLE orders ADD COLUMN receipt_sig TEXT NOT NULL DEFAULT '';");

            using var extra = conn.CreateCommand();
            extra.CommandText = @"
                CREATE TABLE IF NOT EXISTS ticket_requests (
                    request_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    user_initials TEXT NOT NULL,
                    user_avatar_hex TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    tier TEXT NOT NULL,
                    color_class TEXT NOT NULL,
                    payment_method TEXT NOT NULL,
                    created_date TEXT NOT NULL,
                    created_time TEXT NOT NULL,
                    approval_status TEXT NOT NULL DEFAULT 'pending',
                    minted_ticket_id TEXT,
                    bank_auth_code TEXT NOT NULL DEFAULT 'PENDIENTE',
                    status_report TEXT NOT NULL,
                    created_epoch INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS device_tokens (
                    token_hash TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    expires_epoch INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS admin_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );";
            extra.ExecuteNonQuery();
        }
    }

    /// <summary>
    /// Migración: registros creados antes de incorporar el sellado (tickets sin firma, órdenes sin sello,
    /// contraseñas en texto plano) se protegen una única vez al iniciar.
    /// </summary>
    private void SealLegacyRecords()
    {
        var changed = false;
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var tx = conn.BeginTransaction();

            foreach (var t in Tickets.Where(t => string.IsNullOrWhiteSpace(t.Signature) || t.SignatureHash.StartsWith("SHA256:", StringComparison.OrdinalIgnoreCase)))
            {
                var canonical = SecurityService.TicketCanonical(t.Id, t.Amount, t.OwnerEmail, t.IssuedEpoch);
                var fp = SecurityService.Fingerprint(canonical);
                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = "UPDATE tickets SET signature = $sig, signature_hash = $fp WHERE id = $id; UPDATE transactions SET signature_hash = $fp WHERE ticket_id = $id;";
                cmd.Parameters.AddWithValue("$sig", Security.Sign(canonical));
                cmd.Parameters.AddWithValue("$fp", fp);
                cmd.Parameters.AddWithValue("$id", t.Id);
                cmd.ExecuteNonQuery();
                changed = true;
            }

            foreach (var o in Orders.Where(o => string.IsNullOrWhiteSpace(o.IntegritySig)))
            {
                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = "UPDATE orders SET integrity_sig = $sig WHERE order_id = $id;";
                cmd.Parameters.AddWithValue("$sig", Security.Sign(OrderCanonicalOf(o)));
                cmd.Parameters.AddWithValue("$id", o.OrderId);
                cmd.ExecuteNonQuery();
                changed = true;
            }

            foreach (var u in Users.Where(u => !string.IsNullOrEmpty(u.Password) && !SecurityService.IsHashedPassword(u.Password)))
            {
                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = "UPDATE users SET password = $pwd WHERE id = $id;";
                cmd.Parameters.AddWithValue("$pwd", SecurityService.HashPassword(u.Password));
                cmd.Parameters.AddWithValue("$id", u.Id);
                cmd.ExecuteNonQuery();
                changed = true;
            }

            tx.Commit();
        }

        if (changed)
        {
            AddAuditLog("DB", "#5856D6", "[Mantenimiento] Registros anteriores protegidos con el sello del Banco Central.");
            ReloadFromDatabase();
        }
    }

    private static string OrderCanonicalOf(PendingOrderApprovalRecord o) =>
        SecurityService.OrderCanonical(o.OrderId, o.BuyerEmail, o.Subtotal, o.TicketsTotal, o.StoreCreditUsed, o.ChangeCredited, o.TicketIdsCsv, o.ItemsJson);

    /// <summary>Comprueba que el registro del ticket en la BD no haya sido alterado desde su emisión.</summary>
    public bool IsTicketRecordAuthentic(BankTicketRecord t) =>
        Security.Verify(SecurityService.TicketCanonical(t.Id, t.Amount, t.OwnerEmail, t.IssuedEpoch), t.Signature);

    public bool IsOrderRecordAuthentic(PendingOrderApprovalRecord o) =>
        Security.Verify(OrderCanonicalOf(o), o.IntegritySig);

    private bool HasRedemptionRecord(string ticketId) =>
        Transactions.Any(tx => tx.Type == TransactionType.Redemption && tx.TicketId.Equals(ticketId, StringComparison.OrdinalIgnoreCase));

    private static List<string> ParseTicketIds(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries)
           .Select(s => s.Trim().Split(' ')[0].Trim())
           .Where(s => s.Length > 0)
           .ToList();

    private static void TryAlterColumn(SqliteConnection conn, string sql)
    {
        try
        {
            using var c = conn.CreateCommand();
            c.CommandText = sql;
            c.ExecuteNonQuery();
        }
        catch { }
    }

    /// <summary>
    /// Vacía por completo la base de datos SQLite (0 usuarios de prueba, 0 tickets, 0 transacciones, 0 órdenes).
    /// </summary>
    public void ClearAllDatabaseData()
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                DELETE FROM transactions;
                DELETE FROM tickets;
                DELETE FROM ticket_requests;
                DELETE FROM orders;
                DELETE FROM users;
                DELETE FROM audit_logs;
                DELETE FROM device_tokens;
            ";
            cmd.ExecuteNonQuery();
        }

        AddAuditLog("DB", "#007AFF", "[Base de Datos SQLite] Base de datos inicializada en limpio (0 datos de prueba). Esperando operaciones reales desde WalletPay y MarketStore.");
        ReloadFromDatabase();
        NotifyStateChanged("Base de datos reiniciada en limpio (0 registros)");
    }

    public void ReloadFromDatabase()
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();

            // 1. Cargar Usuarios
            var users = new List<BankUser>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT id, name, email, role_label, verified_level, avatar_initials, avatar_hex, store_credit, password, role, store_name, saved_cards_json FROM users;";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    users.Add(new BankUser
                    {
                        Id = r.GetString(0),
                        Name = r.GetString(1),
                        Email = r.GetString(2),
                        RoleLabel = r.GetString(3),
                        VerifiedLevel = r.GetString(4),
                        AvatarInitials = r.GetString(5),
                        AvatarHex = r.GetString(6),
                        StoreCredit = (decimal)r.GetDouble(7),
                        Password = r.IsDBNull(8) ? "" : r.GetString(8),
                        Role = r.IsDBNull(9) ? "buyer" : r.GetString(9),
                        StoreName = r.IsDBNull(10) ? "" : r.GetString(10),
                        SavedCardsJson = r.IsDBNull(11) ? "[]" : r.GetString(11)
                    });
                }
            }

            // 2. Cargar Tickets
            var tickets = new List<BankTicketRecord>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT id, serial_masked, amount, tier, color_class,
                           owner_user_id, owner_name, owner_email, owner_initials,
                           status, purchase_date, purchase_time, payment_method, purchase_tx_id,
                           used_date, used_time, order_id, merchant_name, bank_verification_code, signature_hash,
                           signature, created_epoch, shared_with_emails, used_by_email, used_by_name
                    FROM tickets
                    ORDER BY created_epoch DESC;";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    tickets.Add(new BankTicketRecord
                    {
                        Id = r.GetString(0),
                        SerialMasked = r.GetString(1),
                        Amount = r.GetInt32(2),
                        Tier = r.GetString(3),
                        ColorClass = r.GetString(4),
                        OwnerUserId = r.GetString(5),
                        OwnerName = r.GetString(6),
                        OwnerEmail = r.GetString(7),
                        OwnerInitials = r.GetString(8),
                        Status = r.GetString(9) == "used" ? TicketStatus.Used : TicketStatus.Active,
                        PurchaseDate = r.GetString(10),
                        PurchaseTime = r.GetString(11),
                        PaymentMethod = r.GetString(12),
                        PurchaseTransactionId = r.GetString(13),
                        UsedDate = r.IsDBNull(14) ? null : r.GetString(14),
                        UsedTime = r.IsDBNull(15) ? null : r.GetString(15),
                        OrderId = r.IsDBNull(16) ? null : r.GetString(16),
                        MerchantName = r.IsDBNull(17) ? null : r.GetString(17),
                        BankVerificationCode = r.IsDBNull(18) ? null : r.GetString(18),
                        SignatureHash = r.GetString(19),
                        Signature = r.IsDBNull(20) ? "" : r.GetString(20),
                        IssuedEpoch = r.GetInt64(21),
                        SharedWithEmails = r.IsDBNull(22) ? "" : r.GetString(22),
                        UsedByEmail = r.IsDBNull(23) ? null : r.GetString(23),
                        UsedByName = r.IsDBNull(24) ? null : r.GetString(24)
                    });
                }
            }

            // 3. Cargar Transacciones
            var txs = new List<BankTransactionRecord>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT id, ticket_id, type, user_id, user_name, user_email, user_initials, user_avatar_hex,
                           amount, ticket_tier, date_label, time_label, purchase_time_label, payment_or_channel,
                           order_id, bank_auth_code, signature_hash, current_ticket_status, ticket_used_at_label
                    FROM transactions
                    ORDER BY created_epoch DESC;";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    txs.Add(new BankTransactionRecord
                    {
                        Id = r.GetString(0),
                        TicketId = r.GetString(1),
                        Type = r.GetString(2) == "redeem" ? TransactionType.Redemption : TransactionType.Purchase,
                        UserId = r.GetString(3),
                        UserName = r.GetString(4),
                        UserEmail = r.GetString(5),
                        UserInitials = r.GetString(6),
                        UserAvatarHex = r.GetString(7),
                        Amount = r.GetInt32(8),
                        TicketTier = r.GetString(9),
                        DateLabel = r.GetString(10),
                        TimeLabel = r.GetString(11),
                        PurchaseTimeLabel = r.GetString(12),
                        PaymentOrChannel = r.GetString(13),
                        OrderId = r.IsDBNull(14) ? null : r.GetString(14),
                        BankAuthCode = r.GetString(15),
                        SignatureHash = r.GetString(16),
                        CurrentTicketStatus = r.GetString(17) == "used" ? TicketStatus.Used : TicketStatus.Active,
                        TicketUsedAtLabel = r.IsDBNull(18) ? null : r.GetString(18)
                    });
                }
            }

            // 4. Cargar Órdenes / Solicitudes de Compra de MarketStore
            var orders = new List<PendingOrderApprovalRecord>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT order_id, buyer_user_id, buyer_name, buyer_email, buyer_initials,
                           created_date, created_time, subtotal, tickets_total, store_credit_used, change_credited,
                           items_summary, items_json, ticket_ids_csv, tickets_json, approval_status,
                           is_authenticity_verified, is_authenticity_valid, verification_report,
                           bank_verification_code, delivery_status, integrity_sig, receipt_sig
                    FROM orders
                    ORDER BY created_epoch DESC;";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    orders.Add(new PendingOrderApprovalRecord
                    {
                        OrderId = r.GetString(0),
                        BuyerUserId = r.GetString(1),
                        BuyerName = r.GetString(2),
                        BuyerEmail = r.GetString(3),
                        BuyerInitials = r.GetString(4),
                        CreatedDate = r.GetString(5),
                        CreatedTime = r.GetString(6),
                        Subtotal = (decimal)r.GetDouble(7),
                        TicketsTotal = (decimal)r.GetDouble(8),
                        StoreCreditUsed = (decimal)r.GetDouble(9),
                        ChangeCredited = (decimal)r.GetDouble(10),
                        ItemsSummary = r.GetString(11),
                        ItemsJson = r.GetString(12),
                        TicketIdsCsv = r.GetString(13),
                        TicketsJson = r.GetString(14),
                        ApprovalStatus = r.GetString(15),
                        IsAuthenticityVerified = r.GetInt32(16) == 1,
                        IsAuthenticityValid = r.GetInt32(17) == 1,
                        VerificationReport = r.GetString(18),
                        BankVerificationCode = r.GetString(19),
                        DeliveryStatus = r.GetString(20),
                        IntegritySig = r.IsDBNull(21) ? "" : r.GetString(21),
                        ReceiptSig = r.IsDBNull(22) ? "" : r.GetString(22)
                    });
                }
            }

            // 4b. Cargar Solicitudes de Compra de Tickets (Validación de Tarjeta / Pago en WalletPay)
            var ticketRequests = new List<PendingTicketPurchaseRecord>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    SELECT request_id, user_id, user_name, user_email, user_initials, user_avatar_hex,
                           amount, tier, color_class, payment_method, created_date, created_time,
                           approval_status, minted_ticket_id, bank_auth_code, status_report, created_epoch
                    FROM ticket_requests
                    ORDER BY created_epoch DESC;";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    ticketRequests.Add(new PendingTicketPurchaseRecord
                    {
                        RequestId = r.GetString(0),
                        UserId = r.GetString(1),
                        UserName = r.GetString(2),
                        UserEmail = r.GetString(3),
                        UserInitials = r.GetString(4),
                        UserAvatarHex = r.GetString(5),
                        Amount = r.GetInt32(6),
                        Tier = r.GetString(7),
                        ColorClass = r.GetString(8),
                        PaymentMethod = r.GetString(9),
                        CreatedDate = r.GetString(10),
                        CreatedTime = r.GetString(11),
                        ApprovalStatus = r.GetString(12),
                        MintedTicketId = r.IsDBNull(13) ? null : r.GetString(13),
                        BankAuthCode = r.GetString(14),
                        StatusReport = r.GetString(15),
                        CreatedEpoch = r.GetInt64(16)
                    });
                }
            }

            // 5. Cargar Bitácora HSM
            var logs = new List<AuditLogEntry>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT time, category, accent_hex, message FROM audit_logs ORDER BY id DESC LIMIT 40;";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    logs.Add(new AuditLogEntry
                    {
                        Time = r.GetString(0),
                        Category = r.GetString(1),
                        AccentHex = r.GetString(2),
                        Message = r.GetString(3)
                    });
                }
            }

            Users = users;
            Tickets = tickets;
            Transactions = txs;
            TicketRequests = ticketRequests;
            Orders = orders;
            AuditLogs = logs;

            RecalculateUserMetrics();
        }
    }

    // =========================================================================
    // MÉTRICAS FINANCIERAS DEL BANCO CENTRAL
    // =========================================================================

    public decimal TotalCapitalFromTicketSales => Tickets.Sum(t => (decimal)t.Amount);
    public decimal UnusedTicketsCapital => Tickets.Where(t => t.Status == TicketStatus.Active).Sum(t => (decimal)t.Amount);
    public decimal UsedTicketsCapital => Tickets.Where(t => t.Status == TicketStatus.Used).Sum(t => (decimal)t.Amount);

    public int TotalTicketsSoldCount => Tickets.Count;
    public int UnusedTicketsCount => Tickets.Count(t => t.Status == TicketStatus.Active);
    public int UsedTicketsCount => Tickets.Count(t => t.Status == TicketStatus.Used);
    public int PendingOrdersCount => Orders.Count(o => o.ApprovalStatus == "pending");
    public int PendingTicketRequestsCount => TicketRequests.Count(r => r.ApprovalStatus == "pending");
    public int TotalPendingApprovalsCount => PendingOrdersCount + PendingTicketRequestsCount;

    public double RedemptionRatePercent => TotalTicketsSoldCount == 0
        ? 0
        : (double)UsedTicketsCount / TotalTicketsSoldCount * 100.0;

    public double UnusedRatePercent => TotalTicketsSoldCount == 0
        ? 0
        : (double)UnusedTicketsCount / TotalTicketsSoldCount * 100.0;

    public void RecalculateUserMetrics()
    {
        foreach (var u in Users)
        {
            var userTickets = Tickets.Where(t =>
                t.OwnerUserId == u.Id ||
                t.OwnerEmail.Equals(u.Email, StringComparison.OrdinalIgnoreCase)).ToList();

            u.TotalTicketsPurchased = userTickets.Count;
            u.UnusedTicketsCount = userTickets.Count(t => t.Status == TicketStatus.Active);
            u.UsedTicketsCount = userTickets.Count(t => t.Status == TicketStatus.Used);
            u.TotalCapitalContributed = userTickets.Sum(t => (decimal)t.Amount);
            u.UnusedBalance = userTickets.Where(t => t.Status == TicketStatus.Active).Sum(t => (decimal)t.Amount);
            u.UsedBalance = userTickets.Where(t => t.Status == TicketStatus.Used).Sum(t => (decimal)t.Amount);

            var latest = userTickets.FirstOrDefault();
            u.LastPurchaseTime = latest != null ? $"{latest.PurchaseDate} · {latest.PurchaseTime}" : "Sin compras";
        }
    }

    public List<DenominationBreakdownItem> GetDenominationBreakdown()
    {
        var tiers = new (int Amount, string Name, string Hex)[]
        {
            (50, "Estándar", "#007AFF"),
            (100, "Plata", "#7C3AED"),
            (200, "Oro", "#EA580C"),
            (500, "Titanium", "#1C1C1E")
        };

        var totalCap = Math.Max(1m, TotalCapitalFromTicketSales);
        var result = new List<DenominationBreakdownItem>();

        foreach (var tier in tiers)
        {
            var matching = Tickets.Where(t => t.Amount == tier.Amount).ToList();
            var unused = matching.Where(t => t.Status == TicketStatus.Active).ToList();
            var used = matching.Where(t => t.Status == TicketStatus.Used).ToList();
            var cap = matching.Sum(t => (decimal)t.Amount);
            var share = TotalCapitalFromTicketSales == 0 ? 0.0 : (double)(cap / totalCap * 100m);

            result.Add(new DenominationBreakdownItem
            {
                Denomination = tier.Amount,
                TierName = tier.Name,
                AccentHex = tier.Hex,
                TotalSoldCount = matching.Count,
                UnusedCount = unused.Count,
                UsedCount = used.Count,
                TotalCapital = cap,
                UnusedCapital = unused.Sum(t => (decimal)t.Amount),
                UsedCapital = used.Sum(t => (decimal)t.Amount),
                SharePercentage = share,
                BarWidth = share <= 0 ? 8 : Math.Max(14, share * 2.4)
            });
        }

        return result;
    }

    // =========================================================================
    // GESTIÓN DE USUARIOS (SINCRONIZACIÓN AUTOMÁTICA WALLETPAY & MARKETSTORE)
    // =========================================================================

    // =========================================================================
    // AUTENTICACIÓN DE CLIENTES (contraseñas con hash + sal, tokens de dispositivo)
    // =========================================================================

    public BankUser? FindUser(string? email)
    {
        var clean = email?.Trim().ToLowerInvariant() ?? "";
        if (clean.Length == 0) return null;
        return Users.FirstOrDefault(u => u.Email.Equals(clean, StringComparison.OrdinalIgnoreCase));
    }

    public static bool IsValidEmail(string email) =>
        email.Length is > 5 and <= 120 &&
        !email.Any(char.IsWhiteSpace) &&
        email.IndexOf('@') > 0 &&
        email.LastIndexOf('.') > email.IndexOf('@') + 1 &&
        email.LastIndexOf('.') < email.Length - 1;

    public (bool Ok, string Error, BankUser? User) RegisterUser(string email, string name, string password, string role, string storeName)
    {
        var clean = (email ?? "").Trim().ToLowerInvariant();
        if (!IsValidEmail(clean)) return (false, "Escribe un correo electrónico válido.", null);
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length < 2 || name.Contains('@'))
            return (false, "Escribe el nombre completo de la persona.", null);
        if (string.IsNullOrEmpty(password) || password.Length < 6)
            return (false, "La contraseña debe tener al menos 6 caracteres.", null);

        ReloadFromDatabase();
        if (FindUser(clean) != null)
            return (false, "Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña.", null);

        var user = EnsureUserExists(clean, name.Trim(), null, SecurityService.HashPassword(password), role, storeName);
        return (true, "", user);
    }

    /// <summary>Verifica la contraseña contra su hash PBKDF2. Nunca revela si el correo existe.</summary>
    public (bool Ok, BankUser? User, bool LegacyClaimed) AuthenticateUser(string email, string password)
    {
        ReloadFromDatabase();
        var user = FindUser(email);
        if (user == null || string.IsNullOrEmpty(password))
        {
            // Mismo costo de cómputo que un intento real para no filtrar qué correos existen.
            SecurityService.VerifyPassword(password ?? "", "pbkdf2$120000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
            return (false, null, false);
        }

        if (string.IsNullOrEmpty(user.Password))
        {
            // Cuenta creada antes de exigir contraseña: se protege con la primera contraseña válida.
            if (password.Length < 6) return (false, null, false);
            UpdatePasswordHash(user.Id, SecurityService.HashPassword(password));
            ReloadFromDatabase();
            return (true, FindUser(email), true);
        }

        return SecurityService.VerifyPassword(password, user.Password)
            ? (true, user, false)
            : (false, null, false);
    }

    private void UpdatePasswordHash(string userId, string hash)
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE users SET password = $pwd WHERE id = $id;";
            cmd.Parameters.AddWithValue("$pwd", hash);
            cmd.Parameters.AddWithValue("$id", userId);
            cmd.ExecuteNonQuery();
        }
    }

    /// <summary>Emite un token de acceso rápido (desbloqueo biométrico) ligado al dispositivo. Solo se guarda su hash.</summary>
    public string IssueDeviceToken(string email)
    {
        var token = SecurityService.NewToken(32);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                DELETE FROM device_tokens WHERE expires_epoch < $now;
                INSERT INTO device_tokens (token_hash, email, expires_epoch) VALUES ($h, $e, $exp);";
            cmd.Parameters.AddWithValue("$now", now);
            cmd.Parameters.AddWithValue("$h", SecurityService.Sha256Hex(token));
            cmd.Parameters.AddWithValue("$e", email.Trim().ToLowerInvariant());
            cmd.Parameters.AddWithValue("$exp", now + (long)TimeSpan.FromDays(30).TotalMilliseconds);
            cmd.ExecuteNonQuery();
        }
        return token;
    }

    /// <summary>Consume (y por tanto invalida) el token de dispositivo. Un token reutilizado o robado ya no sirve.</summary>
    public bool ConsumeDeviceToken(string email, string token)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(email)) return false;
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM device_tokens WHERE token_hash = $h AND email = $e AND expires_epoch >= $now;";
            cmd.Parameters.AddWithValue("$h", SecurityService.Sha256Hex(token));
            cmd.Parameters.AddWithValue("$e", email.Trim().ToLowerInvariant());
            cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            return cmd.ExecuteNonQuery() == 1;
        }
    }

    public BankUser SetUserRole(string email, string role, string? storeName) =>
        EnsureUserExists(email, null, null, null, role, string.IsNullOrWhiteSpace(storeName) ? null : storeName);

    public string UpdateUserSavedCards(string email, string cardsJson)
    {
        var cleanEmail = (email ?? "").Trim().ToLowerInvariant();
        var safeJson = string.IsNullOrWhiteSpace(cardsJson) ? "[]" : cardsJson.Trim();
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE users SET saved_cards_json = $cards WHERE LOWER(email) = $email;";
            cmd.Parameters.AddWithValue("$cards", safeJson);
            cmd.Parameters.AddWithValue("$email", cleanEmail);
            cmd.ExecuteNonQuery();
        }
        ReloadFromDatabase();
        return FindUser(cleanEmail)?.SavedCardsJson ?? "[]";
    }

    // ---------------- Administrador de la consola ----------------

    private string? GetConfig(string key)
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT value FROM admin_config WHERE key = $k;";
            cmd.Parameters.AddWithValue("$k", key);
            return cmd.ExecuteScalar() as string;
        }
    }

    private void SetConfig(string key, string value)
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "INSERT INTO admin_config (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = excluded.value;";
            cmd.Parameters.AddWithValue("$k", key);
            cmd.Parameters.AddWithValue("$v", value);
            cmd.ExecuteNonQuery();
        }
    }

    public bool HasAdminPassword => !string.IsNullOrEmpty(GetConfig("admin_password"));

    public bool SetInitialAdminPassword(string password)
    {
        if (HasAdminPassword || string.IsNullOrEmpty(password) || password.Length < 8) return false;
        SetConfig("admin_password", SecurityService.HashPassword(password));
        return true;
    }

    public bool VerifyAdminPassword(string password) =>
        SecurityService.VerifyPassword(password ?? "", GetConfig("admin_password") ?? "");

    public BankUser EnsureUserExists(
        string email,
        string? name = null,
        string? roleLabel = null,
        string? password = null,
        string? role = null,
        string? storeName = null)
    {
        var cleanEmail = string.IsNullOrWhiteSpace(email) ? "cliente@marketstore.mx" : email.Trim().ToLowerInvariant();
        var cleanRole = (role?.Trim().ToLowerInvariant() == "seller") ? "seller" : "buyer";

        lock (_dbLock)
        {
            var existing = Users.FirstOrDefault(u => u.Email.Equals(cleanEmail, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                var updated = false;
                if (!string.IsNullOrWhiteSpace(name) && name != existing.Name && !name.Contains("@"))
                {
                    existing.Name = name.Trim();
                    existing.AvatarInitials = DeriveInitials(existing.Name);
                    updated = true;
                }
                if (!string.IsNullOrWhiteSpace(role))
                {
                    existing.Role = cleanRole;
                    updated = true;
                }
                if (!string.IsNullOrWhiteSpace(storeName))
                {
                    existing.StoreName = storeName.Trim();
                    updated = true;
                }

                if (updated)
                {
                    using var conn = new SqliteConnection(_connectionString);
                    conn.Open();
                    using var upCmd = conn.CreateCommand();
                    upCmd.CommandText = "UPDATE users SET name = $name, avatar_initials = $init, role = $role, store_name = $store WHERE id = $id;";
                    upCmd.Parameters.AddWithValue("$name", existing.Name);
                    upCmd.Parameters.AddWithValue("$init", existing.AvatarInitials);
                    upCmd.Parameters.AddWithValue("$role", existing.Role);
                    upCmd.Parameters.AddWithValue("$store", existing.StoreName);
                    upCmd.Parameters.AddWithValue("$id", existing.Id);
                    upCmd.ExecuteNonQuery();
                }
                return existing;
            }

            var displayName = !string.IsNullOrWhiteSpace(name)
                ? name.Trim()
                : DeriveNameFromEmail(cleanEmail);

            var initials = DeriveInitials(displayName);
            var palette = new[] { "#007AFF", "#7C3AED", "#EA580C", "#34C759", "#5856D6", "#E11D48" };
            var avatarHex = palette[Math.Abs(cleanEmail.GetHashCode()) % palette.Length];
            var userId = $"USR-{Users.Count + 1:D2}-{initials}";

            using (var conn = new SqliteConnection(_connectionString))
            {
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    INSERT INTO users (id, name, email, password, role, store_name, role_label, verified_level, avatar_initials, avatar_hex, store_credit)
                    VALUES ($id, $name, $email, $pwd, $roleCode, $store, $roleLbl, $verified, $initials, $hex, 0);";
                cmd.Parameters.AddWithValue("$id", userId);
                cmd.Parameters.AddWithValue("$name", displayName);
                cmd.Parameters.AddWithValue("$email", cleanEmail);
                cmd.Parameters.AddWithValue("$pwd", password ?? "");
                cmd.Parameters.AddWithValue("$roleCode", cleanRole);
                cmd.Parameters.AddWithValue("$store", storeName ?? (cleanRole == "seller" ? $"{displayName} Store" : ""));
                cmd.Parameters.AddWithValue("$roleLbl", roleLabel ?? (cleanRole == "seller" ? "Comercio Verificado MarketStore" : "Titular WalletPay · MarketStore"));
                cmd.Parameters.AddWithValue("$verified", "Face ID + Llavero iOS");
                cmd.Parameters.AddWithValue("$initials", initials);
                cmd.Parameters.AddWithValue("$hex", avatarHex);
                cmd.ExecuteNonQuery();
            }

            AddAuditLog("USER", "#007AFF", $"[Registro Multi-Usuario] Nueva cuenta registrada: {displayName} ({cleanEmail} · {(cleanRole == "seller" ? "Vendedor" : "Comprador")}).");
        }

        ReloadFromDatabase();
        NotifyStateChanged($"Usuario conectado: {cleanEmail}");
        return Users.First(u => u.Email.Equals(cleanEmail, StringComparison.OrdinalIgnoreCase));
    }

    private static string DeriveNameFromEmail(string email)
    {
        if (email.Equals("cliente@marketstore.mx", StringComparison.OrdinalIgnoreCase))
            return "Alejandro Mendoza";
        if (email.Equals("vendedor@marketstore.mx", StringComparison.OrdinalIgnoreCase))
            return "Sofía Valdés";

        var local = email.Split('@')[0].Replace('.', ' ').Replace('_', ' ').Replace('-', ' ');
        var parts = local.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "Usuario WalletPay";
        return string.Join(" ", parts.Select(p => char.ToUpperInvariant(p[0]) + p.Substring(1)));
    }

    private static string DeriveInitials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "US";
        if (parts.Length == 1) return parts[0].Substring(0, Math.Min(2, parts[0].Length)).ToUpperInvariant();
        return $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[1][0])}";
    }

    // =========================================================================
    // PASO 1 Y 2: COMPRA DE TICKET EN WALLETPAY -> GUARDADO EN SQLITE Y BANCO
    // =========================================================================

    public BankTicketRecord PurchaseTicketForUser(string userEmail, int denomination, string paymentMethod)
    {
        if (!AllowedDenominations.Contains(denomination))
        {
            throw new InvalidOperationException("Denominación no permitida. Solo se emiten tickets de $50, $100, $200 o $500.");
        }

        ReloadFromDatabase();
        var user = FindUser(userEmail) ?? throw new InvalidOperationException("Cuenta no encontrada.");
        paymentMethod = string.IsNullOrWhiteSpace(paymentMethod) ? "Tarjeta" : paymentMethod.Trim();
        if (paymentMethod.Length > 120) paymentMethod = paymentMethod[..120];

        var (tierName, colorClass) = denomination switch
        {
            50 => ("Estándar", "card-tier-50"),
            100 => ("Plata", "card-tier-100"),
            200 => ("Oro", "card-tier-200"),
            _ => ("Titanium", "card-tier-500")
        };

        // Folios impredecibles (generador criptográfico) y sin colisiones.
        string ticketId;
        int num;
        string hex;
        do
        {
            num = SecurityService.NewInt(1000, 10000);
            hex = SecurityService.NewHex(2);
            ticketId = $"TKT-{num}-{hex}";
        } while (Tickets.Any(t => t.Id == ticketId));
        var txId = $"TX-{SecurityService.NewHex(4)}";

        var now = DateTime.Now;
        var dateStr = now.ToString("dd MMM yyyy");
        var timeStr = now.ToString("HH:mm:ss 'hrs'");
        var epoch = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // El banco firma los datos esenciales del ticket: cualquier modificación posterior invalida la firma.
        var canonical = SecurityService.TicketCanonical(ticketId, denomination, user.Email, epoch);
        var signature = Security.Sign(canonical);
        var signatureHash = SecurityService.Fingerprint(canonical);

        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();

            // 1. Insertar Ticket en SQLite
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    INSERT INTO tickets (
                        id, serial_masked, amount, tier, color_class,
                        owner_user_id, owner_name, owner_email, owner_initials,
                        status, purchase_date, purchase_time, payment_method, purchase_tx_id,
                        signature_hash, signature, created_epoch
                    ) VALUES (
                        $id, $masked, $amount, $tier, $cls,
                        $uid, $uname, $uemail, $uinit,
                        'active', $pdate, $ptime, $method, $txid,
                        $hash, $sig, $epoch
                    );";
                cmd.Parameters.AddWithValue("$sig", signature);
                cmd.Parameters.AddWithValue("$id", ticketId);
                cmd.Parameters.AddWithValue("$masked", $"•••• •••• {num} {hex}");
                cmd.Parameters.AddWithValue("$amount", denomination);
                cmd.Parameters.AddWithValue("$tier", tierName);
                cmd.Parameters.AddWithValue("$cls", colorClass);
                cmd.Parameters.AddWithValue("$uid", user.Id);
                cmd.Parameters.AddWithValue("$uname", user.Name);
                cmd.Parameters.AddWithValue("$uemail", user.Email);
                cmd.Parameters.AddWithValue("$uinit", user.AvatarInitials);
                cmd.Parameters.AddWithValue("$pdate", dateStr);
                cmd.Parameters.AddWithValue("$ptime", timeStr);
                cmd.Parameters.AddWithValue("$method", paymentMethod);
                cmd.Parameters.AddWithValue("$txid", txId);
                cmd.Parameters.AddWithValue("$hash", signatureHash);
                cmd.Parameters.AddWithValue("$epoch", epoch);
                cmd.ExecuteNonQuery();
            }

            // 2. Insertar Transacción de Compra en SQLite
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    INSERT INTO transactions (
                        id, ticket_id, type, user_id, user_name, user_email, user_initials, user_avatar_hex,
                        amount, ticket_tier, date_label, time_label, purchase_time_label, payment_or_channel,
                        order_id, bank_auth_code, signature_hash, current_ticket_status, ticket_used_at_label, created_epoch
                    ) VALUES (
                        $id, $tkid, 'buy', $uid, $uname, $uemail, $uinit, $uhex,
                        $amount, $tier, $dlabel, $tlabel, $ptlabel, $channel,
                        NULL, $auth, $hash, 'active', NULL, $epoch
                    );";
                cmd.Parameters.AddWithValue("$id", txId);
                cmd.Parameters.AddWithValue("$tkid", ticketId);
                cmd.Parameters.AddWithValue("$uid", user.Id);
                cmd.Parameters.AddWithValue("$uname", user.Name);
                cmd.Parameters.AddWithValue("$uemail", user.Email);
                cmd.Parameters.AddWithValue("$uinit", user.AvatarInitials);
                cmd.Parameters.AddWithValue("$uhex", user.AvatarHex);
                cmd.Parameters.AddWithValue("$amount", denomination);
                cmd.Parameters.AddWithValue("$tier", tierName);
                cmd.Parameters.AddWithValue("$dlabel", dateStr);
                cmd.Parameters.AddWithValue("$tlabel", timeStr);
                cmd.Parameters.AddWithValue("$ptlabel", $"{dateStr} · {timeStr}");
                cmd.Parameters.AddWithValue("$channel", $"{paymentMethod} • WalletPay");
                cmd.Parameters.AddWithValue("$auth", $"MINT-{num}-{hex}");
                cmd.Parameters.AddWithValue("$hash", signatureHash);
                cmd.Parameters.AddWithValue("$epoch", epoch);
                cmd.ExecuteNonQuery();
            }
        }

        AddAuditLog(
            "MINT",
            "#34C759",
            $"[Compra en WalletPay] {user.Name} adquirió Ticket {ticketId} (${denomination} MXN · {tierName}) a las {timeStr} vía {paymentMethod}."
        );

        ReloadFromDatabase();
        var created = Tickets.First(t => t.Id == ticketId);
        NotifyStateChanged($"Nueva compra de ticket en WalletPay: {ticketId} (${denomination} MXN) por {user.Name}");
        return created;
    }

    // =========================================================================
    // VALIDACIÓN DE TARJETA / PAGO PARA COMPRA DE TICKETS (APROBACIÓN BANCARIA)
    // =========================================================================

    public PendingTicketPurchaseRecord CreatePendingTicketPurchaseRequest(string userEmail, int denomination, string paymentMethod)
    {
        if (!AllowedDenominations.Contains(denomination))
        {
            throw new InvalidOperationException("Denominación no permitida. Solo se emiten tickets de $50, $100, $200 o $500.");
        }

        ReloadFromDatabase();
        var user = FindUser(userEmail) ?? throw new InvalidOperationException("Cuenta no encontrada.");
        paymentMethod = string.IsNullOrWhiteSpace(paymentMethod) ? "Tarjeta de Débito/Crédito Visa •••• 4821" : paymentMethod.Trim();
        if (paymentMethod.Length > 120) paymentMethod = paymentMethod[..120];

        var (tierName, colorClass) = denomination switch
        {
            50 => ("Estándar", "card-tier-50"),
            100 => ("Plata", "card-tier-100"),
            200 => ("Oro", "card-tier-200"),
            _ => ("Titanium", "card-tier-500")
        };

        string requestId;
        do
        {
            requestId = $"REQ-{SecurityService.NewInt(100000, 1000000)}";
        } while (TicketRequests.Any(r => r.RequestId == requestId));

        var now = DateTime.Now;
        var dateStr = now.ToString("dd MMM yyyy");
        var timeStr = now.ToString("HH:mm:ss 'hrs'");
        var epoch = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO ticket_requests (
                    request_id, user_id, user_name, user_email, user_initials, user_avatar_hex,
                    amount, tier, color_class, payment_method, created_date, created_time,
                    approval_status, minted_ticket_id, bank_auth_code, status_report, created_epoch
                ) VALUES (
                    $rid, $uid, $uname, $uemail, $uinit, $uhex,
                    $amt, $tier, $cls, $method, $cdate, $ctime,
                    'pending', NULL, 'PENDIENTE',
                    'Solicitud de compra de ticket recibida. Esperando que el Administrador del Banco valide y apruebe el pago con tarjeta.',
                    $epoch
                );";
            cmd.Parameters.AddWithValue("$rid", requestId);
            cmd.Parameters.AddWithValue("$uid", user.Id);
            cmd.Parameters.AddWithValue("$uname", user.Name);
            cmd.Parameters.AddWithValue("$uemail", user.Email);
            cmd.Parameters.AddWithValue("$uinit", user.AvatarInitials);
            cmd.Parameters.AddWithValue("$uhex", user.AvatarHex);
            cmd.Parameters.AddWithValue("$amt", denomination);
            cmd.Parameters.AddWithValue("$tier", tierName);
            cmd.Parameters.AddWithValue("$cls", colorClass);
            cmd.Parameters.AddWithValue("$method", paymentMethod);
            cmd.Parameters.AddWithValue("$cdate", dateStr);
            cmd.Parameters.AddWithValue("$ctime", timeStr);
            cmd.Parameters.AddWithValue("$epoch", epoch);
            cmd.ExecuteNonQuery();
        }

        AddAuditLog(
            "CARD-REQ",
            "#FF9500",
            $"[Validación de Tarjeta] {user.Name} ({user.Email}) solicitó comprar Ticket {tierName} de ${denomination} MXN vía {paymentMethod} (#{requestId}). Esperando aprobación del Administrador."
        );

        ReloadFromDatabase();
        var record = TicketRequests.First(r => r.RequestId == requestId);
        PendingTicketRequestCreated?.Invoke(record);
        NotifyStateChanged($"¡Nueva solicitud de compra de Ticket (${denomination} MXN) #{requestId} espera aprobación bancaria!");
        return record;
    }

    public (bool Ok, string Message, BankTicketRecord? Ticket) ApproveTicketPurchaseRequest(string requestId)
    {
        lock (_approvalLock)
        {
            ReloadFromDatabase();
            var req = TicketRequests.FirstOrDefault(r => r.RequestId.Equals(requestId, StringComparison.OrdinalIgnoreCase));
            if (req == null) return (false, "Solicitud no encontrada.", null);
            if (req.IsApproved)
            {
                var existingTk = Tickets.FirstOrDefault(t => t.Id == req.MintedTicketId);
                return (false, "Otro administrador ya aprobó esta solicitud.", existingTk);
            }
            if (req.IsRejected) return (false, "Otro administrador ya rechazó esta solicitud.", null);

            // Reclamo atómico en SQLite: si varias consolas de administrador pulsan "Aprobar" al mismo tiempo,
            // solo una obtiene la solicitud; las demás reciben el aviso de que ya fue procesada.
            if (!TryClaimTicketRequest(req.RequestId))
            {
                ReloadFromDatabase();
                var current = TicketRequests.FirstOrDefault(r => r.RequestId == req.RequestId);
                return (false, current?.IsRejected == true
                    ? "Otro administrador ya rechazó esta solicitud."
                    : "Otro administrador ya está procesando o aprobó esta solicitud.", null);
            }

            BankTicketRecord minted;
            try
            {
                minted = PurchaseTicketForUser(req.UserEmail, req.Amount, req.PaymentMethod);
            }
            catch (Exception ex)
            {
                ReleaseTicketRequestClaim(req.RequestId);
                return (false, $"No se pudo emitir el ticket: {ex.Message}", null);
            }

            var authCode = $"CARD-OK-{SecurityService.NewInt(10000, 100000)}";
            var report = $"Pago con tarjeta ({req.PaymentMethod}) validado y aprobado por el Administrador ({authCode}). Ticket {minted.Id} emitido.";

            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    UPDATE ticket_requests
                    SET approval_status = 'approved',
                        minted_ticket_id = $tid,
                        bank_auth_code = $code,
                        status_report = $rep
                    WHERE request_id = $rid AND approval_status = 'processing';";
                cmd.Parameters.AddWithValue("$tid", minted.Id);
                cmd.Parameters.AddWithValue("$code", authCode);
                cmd.Parameters.AddWithValue("$rep", report);
                cmd.Parameters.AddWithValue("$rid", req.RequestId);
                cmd.ExecuteNonQuery();
            }

            AddAuditLog(
                "CARD-OK",
                "#34C759",
                $"[Pago de Tarjeta Aprobado] Solicitud #{req.RequestId} de {req.UserName} por ${req.Amount} MXN aprobada ({authCode}). Ticket {minted.Id} emitido a su bóveda."
            );

            ReloadFromDatabase();
            NotifyStateChanged($"Pago de tarjeta aprobado (#{req.RequestId}) · Ticket {minted.Id} (${req.Amount} MXN) emitido");
            return (true, authCode, minted);
        }
    }

    private bool TryClaimTicketRequest(string requestId)
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE ticket_requests SET approval_status = 'processing' WHERE request_id = $rid AND approval_status = 'pending';";
            cmd.Parameters.AddWithValue("$rid", requestId);
            return cmd.ExecuteNonQuery() == 1;
        }
    }

    private void ReleaseTicketRequestClaim(string requestId)
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE ticket_requests SET approval_status = 'pending' WHERE request_id = $rid AND approval_status = 'processing';";
            cmd.Parameters.AddWithValue("$rid", requestId);
            cmd.ExecuteNonQuery();
        }
    }

    /// <summary>Rechaza la solicitud solo si sigue pendiente. Devuelve false si otro administrador ya la procesó.</summary>
    public bool RejectTicketPurchaseRequest(string requestId, string reason = "Pago con tarjeta rechazado por el Administrador del Banco Central.")
    {
        int affected;
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE ticket_requests
                SET approval_status = 'rejected',
                    bank_auth_code = 'CARD-DECLINED',
                    status_report = $rep
                WHERE request_id = $rid AND approval_status = 'pending';";
            cmd.Parameters.AddWithValue("$rep", reason);
            cmd.Parameters.AddWithValue("$rid", requestId);
            affected = cmd.ExecuteNonQuery();
        }

        if (affected != 1)
        {
            ReloadFromDatabase();
            return false;
        }

        AddAuditLog("CARD-REJ", "#FF3B30", $"[Pago de Tarjeta Rechazado] Solicitud #{requestId} denegada por el Administrador: {reason}");
        ReloadFromDatabase();
        NotifyStateChanged($"Solicitud de compra de ticket #{requestId} rechazada");
        return true;
    }

    // =========================================================================
    // COMPARTIR TICKET ENTRE AMIGOS MEDIANTE ESCANEO DE QR + ANTI-DOBLE GASTO
    // =========================================================================

    public (bool Ok, string Code, string Message, BankTicketRecord? Ticket) ShareTicketViaQrScan(string scannerEmail, string rawQrOrFolio)
    {
        ReloadFromDatabase();
        var scanner = FindUser(scannerEmail);
        if (scanner == null)
            return (false, "UNAUTHORIZED", "Debes iniciar sesión para escanear un ticket.", null);

        var raw = (rawQrOrFolio ?? "").Trim();
        if (string.IsNullOrEmpty(raw))
            return (false, "INVALID_QR", "El código QR escaneado está vacío.", null);

        string folio = raw;
        int? qrAmount = null;
        string? qrSigHash = null;

        // Formato QR oficial: WPTKT1|<id>|<amount>|<ownerEmail>|<issuedEpoch>|<signatureHash>
        if (raw.StartsWith("WPTKT1|", StringComparison.OrdinalIgnoreCase))
        {
            var parts = raw.Split('|');
            if (parts.Length < 6)
                return (false, "INVALID_QR", "El formato del código QR del ticket es inválido o está incompleto.", null);

            folio = parts[1].Trim().ToUpperInvariant();
            if (int.TryParse(parts[2].Trim(), out var amt)) qrAmount = amt;
            qrSigHash = parts[5].Trim();
        }
        else
        {
            folio = raw.ToUpperInvariant();
        }

        var tk = FindTicketByFolio(folio);
        if (tk == null)
        {
            AddAuditLog("ALERT", "#FF3B30", $"[Escaneo QR] {scanner.Name} escaneó un folio inexistente ({folio}).");
            return (false, "TICKET_NOT_FOUND", $"El ticket {folio} no existe ni fue emitido por el Banco Central.", null);
        }

        if (!IsTicketRecordAuthentic(tk) ||
            (qrAmount.HasValue && qrAmount.Value != tk.Amount) ||
            (!string.IsNullOrEmpty(qrSigHash) && !tk.SignatureHash.Equals(qrSigHash, StringComparison.OrdinalIgnoreCase)))
        {
            AddAuditLog("ALERT", "#FF3B30", $"[Escaneo QR] Alerta de integridad en el ticket {tk.Id} escaneado por {scanner.Name}.");
            return (false, "TICKET_TAMPERED", $"El código QR del ticket {tk.Id} presenta alteraciones en su sello criptográfico y fue rechazado.", null);
        }

        // PROTECCIÓN ANTI-DOBLE GASTO: Si el propietario original o un amigo ya usó el ticket, nadie más puede usarlo.
        if (tk.Status == TicketStatus.Used || tk.OrderId != null || HasRedemptionRecord(tk.Id))
        {
            var usedBy = tk.UsedByName ?? tk.OwnerName;
            AddAuditLog(
                "ALERT",
                "#FF3B30",
                $"[Anti-Doble Gasto · QR] {scanner.Name} intentó escanear/usar el ticket {tk.Id} de {tk.OwnerName}, pero YA FUE USADO por {usedBy} en #{tk.OrderId}. Bloqueado."
            );
            return (
                false,
                "TICKET_ALREADY_USED",
                $"ALERTA DE SEGURIDAD ANTI-DOBLE GASTO: El ticket {tk.Id} (${tk.Amount} MXN) de {tk.OwnerName} ya fue utilizado por {usedBy} en la orden #{tk.OrderId} y ya no puede volver a usarse.",
                tk
            );
        }

        // Comprobar si está comprometido en una orden pendiente de aprobación
        var reservedInOrder = Orders
            .Where(o => o.IsPending)
            .FirstOrDefault(o => ParseTicketIds(o.TicketIdsCsv).Any(id => id.Equals(tk.Id, StringComparison.OrdinalIgnoreCase)));
        if (reservedInOrder != null)
        {
            return (
                false,
                "TICKET_RESERVED",
                $"El ticket {tk.Id} ya está siendo utilizado en la compra #{reservedInOrder.OrderId} pendiente de aprobación bancaria.",
                tk
            );
        }

        if (tk.OwnerEmail.Equals(scanner.Email, StringComparison.OrdinalIgnoreCase))
        {
            return (false, "OWN_TICKET", $"El ticket {tk.Id} (${tk.Amount} MXN) ya fue comprado por tu cuenta y está en tu bóveda.", tk);
        }

        var sharedList = tk.GetSharedEmailsList();
        if (!sharedList.Any(e => e.Equals(scanner.Email, StringComparison.OrdinalIgnoreCase)))
        {
            sharedList.Add(scanner.Email.ToLowerInvariant());
            var updatedCsv = string.Join(",", sharedList);

            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE tickets SET shared_with_emails = $sh WHERE id = $id;";
                cmd.Parameters.AddWithValue("$sh", updatedCsv);
                cmd.Parameters.AddWithValue("$id", tk.Id);
                cmd.ExecuteNonQuery();
            }

            AddAuditLog(
                "SHARE-QR",
                "#007AFF",
                $"[Ticket Compartido por QR] {tk.OwnerName} ({tk.OwnerEmail}) compartió el Ticket {tk.Id} (${tk.Amount} MXN) con {scanner.Name} ({scanner.Email}). Protección anti-doble gasto activa."
            );
        }

        ReloadFromDatabase();
        var updatedTk = Tickets.First(t => t.Id == tk.Id);
        NotifyStateChanged($"Ticket {tk.Id} (${tk.Amount} MXN) compartido vía QR con {scanner.Name}");
        return (
            true,
            "TICKET_SHARED_OK",
            $"¡Ticket {tk.Id} (${tk.Amount} MXN) de {tk.OwnerName} vinculado exitosamente por QR! Recuerda: si tu amigo o tú lo usan en una compra, el otro ya no podrá utilizarlo.",
            updatedTk
        );
    }

    // =========================================================================
    // PASO 4: SOLICITUD DE COMPRA DESDE MARKETSTORE -> VERIFICACIÓN Y APROBACIÓN EN CENTRALBANK
    // =========================================================================

    private readonly object _approvalLock = new();

    public enum OrderRejection { None, Invalid, Tampered, Reused, Reserved, NotOwner, Insufficient }

    public (bool Ok, string Message, OrderRejection Kind, PendingOrderApprovalRecord? Order) CreatePendingOrderRequest(
        string buyerEmail,
        List<PresentedTicketDto> presented,
        List<OrderItemDto> items)
    {
        ReloadFromDatabase();
        var user = FindUser(buyerEmail);
        if (user == null) return (false, "Cuenta no encontrada.", OrderRejection.Invalid, null);

        if (items.Count == 0 || items.Count > 50)
            return (false, "La bolsa de compras está vacía o es inválida.", OrderRejection.Invalid, null);
        if (items.Any(i => i.quantity <= 0 || i.quantity > 99 || i.unitPrice <= 0 || i.unitPrice > 100000))
            return (false, "La orden contiene productos con cantidad o precio inválido.", OrderRejection.Invalid, null);
        if (presented.Count > 30)
            return (false, "Demasiados tickets en una sola orden.", OrderRejection.Invalid, null);

        // El subtotal lo calcula el banco; no se confía en el total enviado por el cliente.
        var subtotal = items.Sum(i => i.unitPrice * i.quantity);

        if (presented.Select(p => p.id.Trim().ToUpperInvariant()).Distinct().Count() != presented.Count)
            return (false, "El mismo ticket se presentó más de una vez en la orden.", OrderRejection.Reused, null);

        var reserved = Orders
            .Where(o => o.IsPending)
            .SelectMany(o => ParseTicketIds(o.TicketIdsCsv).Select(id => (TicketId: id, o.OrderId)))
            .ToList();

        var chosenTickets = new List<BankTicketRecord>();
        foreach (var p in presented)
        {
            var tid = p.id.Trim();

            // 1) El ticket tal como lo presenta el cliente debe conservar el sello original del banco.
            var presentedCanonical = SecurityService.TicketCanonical(tid, p.amount, p.ownerEmail, p.issuedEpoch);
            if (!Security.Verify(presentedCanonical, p.signature))
                return (false, $"El ticket {tid} fue alterado o no fue emitido por el Banco Central. Compra rechazada.", OrderRejection.Tampered, null);

            var tk = Tickets.FirstOrDefault(t => t.Id.Equals(tid, StringComparison.Ordinal));
            if (tk == null)
                return (false, $"El ticket {tid} no existe en el registro del Banco Central.", OrderRejection.Invalid, null);

            // 2) Debe coincidir exactamente con el registro del banco y el registro no debe haber sido manipulado.
            if (tk.Amount != p.amount ||
                tk.IssuedEpoch != p.issuedEpoch ||
                !tk.OwnerEmail.Equals(p.ownerEmail.Trim(), StringComparison.OrdinalIgnoreCase) ||
                !IsTicketRecordAuthentic(tk))
                return (false, $"Los datos del ticket {tid} no coinciden con el registro del Banco Central.", OrderRejection.Tampered, null);

            // 3) Solo el titular o un amigo con quien se haya compartido por QR puede gastarlo.
            if (!tk.CanBeAccessedBy(user.Email))
                return (false, $"El ticket {tid} pertenece a otra persona ({tk.OwnerName}) y no ha sido compartido con tu cuenta.", OrderRejection.NotOwner, null);

            // 4) Protección contra doble gasto (incluyendo tickets compartidos ya usados por el amigo).
            if (tk.Status == TicketStatus.Used || tk.OrderId != null || HasRedemptionRecord(tk.Id))
            {
                var whoUsed = tk.UsedByName ?? tk.OwnerName;
                return (false, $"ALERTA ANTI-DOBLE GASTO: El ticket {tid} ya fue utilizado por {whoUsed} en la orden #{tk.OrderId ?? "anterior"} y ya no puede volver a usarse.", OrderRejection.Reused, null);
            }

            var reservation = reserved.FirstOrDefault(r => r.TicketId.Equals(tk.Id, StringComparison.OrdinalIgnoreCase));
            if (reservation.TicketId != null)
                return (false, $"El ticket {tid} ya está comprometido en la orden #{reservation.OrderId}, pendiente de aprobación.", OrderRejection.Reserved, null);

            chosenTickets.Add(tk);
        }

        var ticketsSum = chosenTickets.Sum(t => (decimal)t.Amount);
        var creditAvailable = Math.Max(0m, user.StoreCredit);
        var storeCreditUsed = Math.Min(creditAvailable, subtotal);
        if (ticketsSum + storeCreditUsed < subtotal)
        {
            return (false, $"Los tickets presentados (${ticketsSum:N0}) más tu saldo a favor (${creditAvailable:N2}) no cubren el total de la orden (${subtotal:N2} MXN).", OrderRejection.Insufficient, null);
        }

        string orderId;
        do { orderId = $"ORD-{SecurityService.NewInt(100000, 1000000)}"; }
        while (Orders.Any(o => o.OrderId == orderId));

        var now = DateTime.Now;
        var dateStr = now.ToString("dd MMM yyyy");
        var timeStr = now.ToString("HH:mm:ss 'hrs'");
        var epoch = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var change = Math.Max(0m, (ticketsSum + storeCreditUsed) - subtotal);

        var itemsSummary = string.Join(", ", items.Select(i => $"{i.quantity}× {i.title} (${i.unitPrice * i.quantity:N0})"));
        var itemsJson = JsonSerializer.Serialize(items);
        var ticketsDto = chosenTickets.Select(t => new
        {
            id = t.Id,
            amount = t.Amount,
            tier = t.Tier,
            colorClass = t.ColorClass,
            signatureHash = t.SignatureHash
        }).ToList();
        var ticketsJson = JsonSerializer.Serialize(ticketsDto);
        var ticketIdsCsv = string.Join(", ", chosenTickets.Select(t => $"{t.Id} (${t.Amount})"));

        // Sello de integridad de la orden: si alguien modifica montos o tickets en la BD, la aprobación lo detecta.
        var integritySig = Security.Sign(SecurityService.OrderCanonical(orderId, user.Email, subtotal, ticketsSum, storeCreditUsed, change, ticketIdsCsv, itemsJson));

        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO orders (
                    order_id, buyer_user_id, buyer_name, buyer_email, buyer_initials,
                    created_date, created_time, subtotal, tickets_total, store_credit_used, change_credited,
                    items_summary, items_json, ticket_ids_csv, tickets_json,
                    approval_status, is_authenticity_verified, is_authenticity_valid,
                    verification_report, bank_verification_code, delivery_status, created_epoch, integrity_sig, receipt_sig
                ) VALUES (
                    $oid, $uid, $uname, $uemail, $uinit,
                    $cdate, $ctime, $sub, $tktotal, $credit, $change,
                    $isum, $ijson, $tkcsv, $tkjson,
                    'pending', 0, 0,
                    'Solicitud recibida desde MarketStore. Verificando automáticamente la autenticidad de los tickets con el Banco Central...',
                    'PENDIENTE', 'verified', $epoch, $isig, ''
                );";
            cmd.Parameters.AddWithValue("$oid", orderId);
            cmd.Parameters.AddWithValue("$uid", user.Id);
            cmd.Parameters.AddWithValue("$uname", user.Name);
            cmd.Parameters.AddWithValue("$uemail", user.Email);
            cmd.Parameters.AddWithValue("$uinit", user.AvatarInitials);
            cmd.Parameters.AddWithValue("$cdate", dateStr);
            cmd.Parameters.AddWithValue("$ctime", timeStr);
            cmd.Parameters.AddWithValue("$sub", (double)subtotal);
            cmd.Parameters.AddWithValue("$tktotal", (double)ticketsSum);
            cmd.Parameters.AddWithValue("$credit", (double)storeCreditUsed);
            cmd.Parameters.AddWithValue("$change", (double)change);
            cmd.Parameters.AddWithValue("$isum", itemsSummary);
            cmd.Parameters.AddWithValue("$ijson", itemsJson);
            cmd.Parameters.AddWithValue("$tkcsv", ticketIdsCsv);
            cmd.Parameters.AddWithValue("$tkjson", ticketsJson);
            cmd.Parameters.AddWithValue("$epoch", epoch);
            cmd.Parameters.AddWithValue("$isig", integritySig);
            cmd.ExecuteNonQuery();
        }

        AddAuditLog(
            "REQ",
            "#FF9500",
            $"[MarketStore -> Banco] Solicitud de compra #{orderId} de {user.Name} por ${subtotal:N2} MXN con tickets [{ticketIdsCsv}]. Validación automática en curso."
        );

        ReloadFromDatabase();
        var record = Orders.First(o => o.OrderId == orderId);
        return (true, "Solicitud recibida por el Banco Central.", OrderRejection.None, record);
    }

    /// <summary>
    /// Paso 1 del Administrador en CentralBank: comprobar la autenticidad de la orden y de cada ticket.
    /// </summary>
    public (bool Valid, string Report) VerifyOrderTicketsAuthenticity(string orderId)
    {
        ReloadFromDatabase();
        var order = Orders.FirstOrDefault(o => o.OrderId == orderId);
        if (order == null) return (false, "Orden no encontrada.");
        if (!order.IsPending) return (order.IsApproved, order.VerificationReport);

        string Fail(string report, string shortMsg)
        {
            UpdateOrderVerificationInDb(orderId, true, false, report);
            AddAuditLog("ALERT", "#FF3B30", $"[Verificación] Orden #{orderId}: {report}");
            ReloadFromDatabase();
            NotifyStateChanged($"Problema de autenticidad en la orden #{orderId}");
            return shortMsg;
        }

        if (!IsOrderRecordAuthentic(order))
            return (false, Fail("ALERTA: Los datos de la orden (montos, productos o tickets) fueron modificados después de su registro.", "Orden alterada."));

        var buyer = FindUser(order.BuyerEmail);
        if (buyer == null)
            return (false, Fail("ALERTA: El comprador de la orden no existe en el registro.", "Comprador inexistente."));

        var rawIds = ParseTicketIds(order.TicketIdsCsv);
        foreach (var tid in rawIds)
        {
            var tk = Tickets.FirstOrDefault(t => t.Id.Equals(tid, StringComparison.OrdinalIgnoreCase));
            if (tk == null)
                return (false, Fail($"ALERTA: El folio {tid} NO fue emitido por el Banco Central (falsificación).", $"Folio {tid} apócrifo."));
            if (!IsTicketRecordAuthentic(tk))
                return (false, Fail($"ALERTA: El registro del ticket {tid} fue modificado (monto, titular o fecha no coinciden con la emisión).", $"Ticket {tid} alterado."));
            if (!tk.CanBeAccessedBy(buyer.Email))
                return (false, Fail($"ALERTA: El ticket {tid} no pertenece al comprador ni fue compartido con su cuenta.", $"Ticket {tid} ajeno."));
            if (tk.Status == TicketStatus.Used || tk.OrderId != null || HasRedemptionRecord(tk.Id))
                return (false, Fail($"ALERTA DE DOBLE GASTO: El ticket {tid} ya fue utilizado por {tk.UsedByName ?? tk.OwnerName} en #{tk.OrderId ?? "otra orden"}.", $"Ticket {tid} ya usado."));
        }

        if (buyer.StoreCredit + 0.005m < order.StoreCreditUsed)
            return (false, Fail("ALERTA: El saldo a favor aplicado ya no está disponible (posible uso duplicado).", "Saldo a favor insuficiente."));

        var report = $"Autenticidad confirmada: {rawIds.Count} ticket(s) legítimos, íntegros, del titular y sin uso previo.";
        UpdateOrderVerificationInDb(orderId, true, true, report);
        AddAuditLog("VERIFY", "#007AFF", $"[Verificación] Orden #{orderId}: {report}");

        ReloadFromDatabase();
        NotifyStateChanged($"Tickets de la orden #{orderId} verificados con éxito");
        return (true, report);
    }

    private void UpdateOrderVerificationInDb(string orderId, bool verified, bool valid, string report)
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE orders
                SET is_authenticity_verified = $ver,
                    is_authenticity_valid = $val,
                    verification_report = $rep
                WHERE order_id = $oid;";
            cmd.Parameters.AddWithValue("$ver", verified ? 1 : 0);
            cmd.Parameters.AddWithValue("$val", valid ? 1 : 0);
            cmd.Parameters.AddWithValue("$rep", report);
            cmd.Parameters.AddWithValue("$oid", orderId);
            cmd.ExecuteNonQuery();
        }
    }

    /// <summary>
    /// Paso 2 del Administrador: aprobar la compra. Los tickets se marcan como USADOS de forma atómica
    /// (UPDATE condicionado a status='active'); si alguno ya fue gastado, toda la operación se revierte.
    /// </summary>
    public (bool Ok, string Message) ApprovePendingOrder(string orderId)
    {
        lock (_approvalLock)
        {
            ReloadFromDatabase();
            var order = Orders.FirstOrDefault(o => o.OrderId == orderId);
            if (order == null) return (false, "Orden no encontrada.");
            if (order.IsApproved) return (true, "La orden ya estaba aprobada.");
            if (order.IsRejected) return (false, "La orden ya había sido rechazada.");

            var (valid, report) = VerifyOrderTicketsAuthenticity(orderId);
            if (!valid)
            {
                RejectPendingOrder(orderId, report);
                return (false, report);
            }

            ReloadFromDatabase();
            order = Orders.First(o => o.OrderId == orderId);
            var rawIds = ParseTicketIds(order.TicketIdsCsv);

            var authCode = $"BC-AUTH-{SecurityService.NewInt(10000, 100000)}-OK";
            var receiptSig = Security.Sign(SecurityService.ReceiptCanonical(orderId, "approved", authCode, order.Subtotal, rawIds, order.BuyerEmail));

            var now = DateTime.Now;
            var dateStr = now.ToString("dd MMM yyyy");
            var timeStr = now.ToString("HH:mm:ss 'hrs'");
            var epoch = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string? doubleSpentTicket = null;

            lock (_dbLock)
            {
                using var conn = new SqliteConnection(_connectionString);
                conn.Open();
                using var dbTx = conn.BeginTransaction();

                var user = Users.FirstOrDefault(u => u.Id == order.BuyerUserId);
                var avatarHex = user?.AvatarHex ?? "#007AFF";

                foreach (var tid in rawIds)
                {
                    var tk = Tickets.FirstOrDefault(t => t.Id.Equals(tid, StringComparison.OrdinalIgnoreCase));
                    if (tk == null)
                    {
                        doubleSpentTicket = tid;
                        break;
                    }

                    using (var upTk = conn.CreateCommand())
                    {
                        upTk.Transaction = dbTx;
                        upTk.CommandText = @"
                            UPDATE tickets
                            SET status = 'used',
                                used_date = $udate,
                                used_time = $utime,
                                order_id = $oid,
                                merchant_name = 'MarketStore',
                                bank_verification_code = $code,
                                used_by_email = $ubyemail,
                                used_by_name = $ubyname
                            WHERE id = $tid AND status = 'active' AND order_id IS NULL;";
                        upTk.Parameters.AddWithValue("$udate", dateStr);
                        upTk.Parameters.AddWithValue("$utime", timeStr);
                        upTk.Parameters.AddWithValue("$oid", orderId);
                        upTk.Parameters.AddWithValue("$code", authCode);
                        upTk.Parameters.AddWithValue("$ubyemail", order.BuyerEmail);
                        upTk.Parameters.AddWithValue("$ubyname", order.BuyerName);
                        upTk.Parameters.AddWithValue("$tid", tk.Id);
                        if (upTk.ExecuteNonQuery() != 1)
                        {
                            doubleSpentTicket = tk.Id;
                            break;
                        }
                    }

                    using (var upTx = conn.CreateCommand())
                    {
                        upTx.Transaction = dbTx;
                        upTx.CommandText = @"
                            UPDATE transactions
                            SET current_ticket_status = 'used',
                                order_id = $oid,
                                ticket_used_at_label = $ulabel
                            WHERE ticket_id = $tid;";
                        upTx.Parameters.AddWithValue("$oid", orderId);
                        upTx.Parameters.AddWithValue("$ulabel", $"{dateStr} · {timeStr} (#{orderId})");
                        upTx.Parameters.AddWithValue("$tid", tk.Id);
                        upTx.ExecuteNonQuery();
                    }

                    using (var insTx = conn.CreateCommand())
                    {
                        insTx.Transaction = dbTx;
                        insTx.CommandText = @"
                            INSERT INTO transactions (
                                id, ticket_id, type, user_id, user_name, user_email, user_initials, user_avatar_hex,
                                amount, ticket_tier, date_label, time_label, purchase_time_label, payment_or_channel,
                                order_id, bank_auth_code, signature_hash, current_ticket_status, ticket_used_at_label, created_epoch
                            ) VALUES (
                                $id, $tkid, 'redeem', $uid, $uname, $uemail, $uinit, $uhex,
                                $amount, $tier, $dlabel, $tlabel, $ptlabel, $channel,
                                $oid, $auth, $hash, 'used', $ulabel, $epoch
                            );";
                        insTx.Parameters.AddWithValue("$id", $"TX-{SecurityService.NewHex(4)}");
                        insTx.Parameters.AddWithValue("$tkid", tk.Id);
                        insTx.Parameters.AddWithValue("$uid", tk.OwnerUserId);
                        insTx.Parameters.AddWithValue("$uname", tk.OwnerName);
                        insTx.Parameters.AddWithValue("$uemail", tk.OwnerEmail);
                        insTx.Parameters.AddWithValue("$uinit", tk.OwnerInitials);
                        insTx.Parameters.AddWithValue("$uhex", avatarHex);
                        insTx.Parameters.AddWithValue("$amount", tk.Amount);
                        insTx.Parameters.AddWithValue("$tier", tk.Tier);
                        insTx.Parameters.AddWithValue("$dlabel", dateStr);
                        insTx.Parameters.AddWithValue("$tlabel", timeStr);
                        insTx.Parameters.AddWithValue("$ptlabel", $"Comprado: {tk.PurchaseDate}, {tk.PurchaseTime}");
                        insTx.Parameters.AddWithValue("$channel", $"MarketStore • #{orderId} ({order.ItemsSummary})");
                        insTx.Parameters.AddWithValue("$oid", orderId);
                        insTx.Parameters.AddWithValue("$auth", authCode);
                        insTx.Parameters.AddWithValue("$hash", tk.SignatureHash);
                        insTx.Parameters.AddWithValue("$ulabel", $"{dateStr} · {timeStr}");
                        insTx.Parameters.AddWithValue("$epoch", epoch++);
                        insTx.ExecuteNonQuery();
                    }
                }

                if (doubleSpentTicket != null)
                {
                    dbTx.Rollback();
                }
                else
                {
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = dbTx;
                        cmd.CommandText = @"
                            UPDATE orders
                            SET approval_status = 'approved',
                                is_authenticity_verified = 1,
                                is_authenticity_valid = 1,
                                verification_report = $rep,
                                bank_verification_code = $code,
                                receipt_sig = $rsig
                            WHERE order_id = $oid AND approval_status = 'pending';";
                        cmd.Parameters.AddWithValue("$rep", $"Aprobada automáticamente por el Banco Central ({authCode}): tickets auténticos, del titular y sin uso previo. Tickets liquidados.");
                        cmd.Parameters.AddWithValue("$code", authCode);
                        cmd.Parameters.AddWithValue("$rsig", receiptSig);
                        cmd.Parameters.AddWithValue("$oid", orderId);
                        if (cmd.ExecuteNonQuery() != 1)
                        {
                            dbTx.Rollback();
                            return (false, "La orden ya no estaba pendiente.");
                        }
                    }

                    // Saldo a favor: se descuenta lo aplicado y se abona el cambio de los tickets de valor fijo.
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = dbTx;
                        cmd.CommandText = "UPDATE users SET store_credit = MAX(0, store_credit - $used + $change) WHERE id = $uid;";
                        cmd.Parameters.AddWithValue("$used", (double)order.StoreCreditUsed);
                        cmd.Parameters.AddWithValue("$change", (double)order.ChangeCredited);
                        cmd.Parameters.AddWithValue("$uid", order.BuyerUserId);
                        cmd.ExecuteNonQuery();
                    }

                    dbTx.Commit();
                }
            }

            if (doubleSpentTicket != null)
            {
                var reason = $"ALERTA DE DOBLE GASTO: el ticket {doubleSpentTicket} ya había sido canjeado. Operación revertida.";
                RejectPendingOrder(orderId, reason);
                return (false, reason);
            }

            AddAuditLog(
                "APPROVE",
                "#34C759",
                $"[Compra Aprobada Automáticamente] Orden #{orderId} de {order!.BuyerName} por ${order.Subtotal:N2} MXN validada por el Banco Central con sello {authCode}. Tickets marcados como YA USADOS."
            );

            ReloadFromDatabase();
            NotifyStateChanged($"Orden #{orderId} aprobada ({authCode}) · Tickets liquidados");
            return (true, authCode);
        }
    }

    public void RejectPendingOrder(string orderId, string reason = "Rechazada por el Administrador del Banco Central.")
    {
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE orders
                SET approval_status = 'rejected',
                    verification_report = $rep,
                    bank_verification_code = 'BC-REJECTED'
                WHERE order_id = $oid AND approval_status = 'pending';";
            cmd.Parameters.AddWithValue("$rep", reason);
            cmd.Parameters.AddWithValue("$oid", orderId);
            cmd.ExecuteNonQuery();
        }

        AddAuditLog("REJECT", "#FF3B30", $"[Compra Rechazada] Orden #{orderId} denegada: {reason}");
        ReloadFromDatabase();
        NotifyStateChanged($"Orden #{orderId} rechazada");
    }

    /// <summary>Datos del comprobante sellado que MarketStore valida antes de entregar el pedido.</summary>
    public object BuildOrderReceipt(PendingOrderApprovalRecord o) => new
    {
        orderId = o.OrderId,
        status = o.ApprovalStatus,
        bankCode = o.BankVerificationCode,
        subtotalCents = SecurityService.ToCents(o.Subtotal),
        ticketIds = ParseTicketIds(o.TicketIdsCsv).OrderBy(x => x, StringComparer.Ordinal).ToList(),
        buyerEmail = o.BuyerEmail.Trim().ToLowerInvariant(),
        signature = o.IsApproved ? o.ReceiptSig : ""
    };

    public BankTicketRecord? FindTicketByFolio(string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return null;
        var clean = query.Trim().ToUpperInvariant();
        return Tickets.FirstOrDefault(t =>
            t.Id.ToUpperInvariant() == clean ||
            t.PurchaseTransactionId.ToUpperInvariant() == clean);
    }

    public void AddAuditLog(string category, string accentHex, string message)
    {
        var time = DateTime.Now.ToString("HH:mm:ss");
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "INSERT INTO audit_logs (time, category, accent_hex, message) VALUES ($t, $c, $a, $m);";
            cmd.Parameters.AddWithValue("$t", time);
            cmd.Parameters.AddWithValue("$c", category);
            cmd.Parameters.AddWithValue("$a", accentHex);
            cmd.Parameters.AddWithValue("$m", message);
            cmd.ExecuteNonQuery();
        }
    }

    public string ExportReportToCsv()
    {
        var exportPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, $"Reporte_BancoCentral_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
        var sb = new StringBuilder();
        sb.AppendLine("Folio_Transaccion,Tipo_Operacion,Folio_Ticket,Denominacion_MXN,Tier,Estado_Actual_Ticket,ID_Usuario,Nombre_Usuario,Email_Usuario,Fecha_Compra_Operacion,Hora_Compra_Operacion,Metodo_Canal,Orden_MarketStore,Codigo_Autorizacion_Banco,Sello_Autenticidad");

        foreach (var tx in Transactions)
        {
            var estado = tx.CurrentTicketStatus == TicketStatus.Used ? "YA USADO" : "SIN USAR (ACTIVO)";
            var tipo = tx.IsPurchase ? "COMPRA DE TICKET" : "CANJE APROBADO EN TIENDA";
            sb.AppendLine($"{tx.Id},{tipo},{tx.TicketId},{tx.Amount},{tx.TicketTier},{estado},{tx.UserId},\"{tx.UserName}\",{tx.UserEmail},\"{tx.DateLabel}\",\"{tx.TimeLabel}\",\"{tx.PaymentOrChannel}\",{tx.OrderId ?? "N/A"},{tx.BankAuthCode},{tx.SignatureHash}");
        }

        sb.AppendLine();
        sb.AppendLine("RESUMEN FINANCIERO DEL BANCO CENTRAL,,,");
        sb.AppendLine($"Capital Total Obtenido (Venta de Tickets),${TotalCapitalFromTicketSales:N2} MXN,{TotalTicketsSoldCount} tickets emitidos,");
        sb.AppendLine($"Capital en Tickets Sin Usar (En Circulacion),${UnusedTicketsCapital:N2} MXN,{UnusedTicketsCount} tickets activos,");
        sb.AppendLine($"Capital en Tickets Ya Usados (Canjeados),${UsedTicketsCapital:N2} MXN,{UsedTicketsCount} tickets canjeados,");

        File.WriteAllText(exportPath, sb.ToString(), Encoding.UTF8);
        AddAuditLog("EXPORT", "#5856D6", $"[Auditoría] Reporte exportado a CSV: {Path.GetFileName(exportPath)}");
        ReloadFromDatabase();
        return exportPath;
    }

    private void NotifyStateChanged(string summary)
    {
        StateChanged?.Invoke(summary);
    }
}
