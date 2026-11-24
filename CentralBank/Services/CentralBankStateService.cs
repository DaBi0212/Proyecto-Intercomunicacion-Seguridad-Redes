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

public partial class CentralBankStateService
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
            TryAlterColumn(conn, "ALTER TABLE ticket_requests ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;");
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
                           approval_status, minted_ticket_id, bank_auth_code, status_report, created_epoch,
                           quantity
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
                        CreatedEpoch = r.GetInt64(16),
                        Quantity = r.FieldCount > 17 && !r.IsDBNull(17) ? Math.Max(1, r.GetInt32(17)) : 1
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

    /// <summary>Emite un token de acceso rápido (desbloqueo biométrico y sesión persistente) ligado al dispositivo. Solo se guarda su hash.</summary>
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
            cmd.Parameters.AddWithValue("$exp", now + (long)TimeSpan.FromDays(365).TotalMilliseconds);
            cmd.ExecuteNonQuery();
        }
        return token;
    }

    /// <summary>Valida y renueva la vigencia del token de dispositivo para mantener la sesión abierta sin cierres automáticos.</summary>
    public bool ConsumeDeviceToken(string email, string token)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(email)) return false;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var nextExp = now + (long)TimeSpan.FromDays(365).TotalMilliseconds;
        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "UPDATE device_tokens SET expires_epoch = $exp WHERE token_hash = $h AND email = $e AND expires_epoch >= $now;";
            cmd.Parameters.AddWithValue("$exp", nextExp);
            cmd.Parameters.AddWithValue("$h", SecurityService.Sha256Hex(token));
            cmd.Parameters.AddWithValue("$e", email.Trim().ToLowerInvariant());
            cmd.Parameters.AddWithValue("$now", now);
            return cmd.ExecuteNonQuery() >= 1;
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

    public string GetMarketStoreProductsJson() => GetConfig("marketstore_products_json") ?? "[]";

    public string SaveMarketStoreProductsJson(string productsJson)
    {
        var normalized = string.IsNullOrWhiteSpace(productsJson) ? "[]" : productsJson.Trim();
        SetConfig("marketstore_products_json", normalized);
        return normalized;
    }

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

}
