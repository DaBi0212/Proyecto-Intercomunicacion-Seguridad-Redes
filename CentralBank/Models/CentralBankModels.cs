using System;
using System.Collections.Generic;
using System.Linq;

namespace CentralBank.Models;

public enum TicketStatus
{
    Active, // Comprado pero aún NO usado (En circulación)
    Used    // Ya usado / Canjeado y aprobado en MarketStore
}

public enum TransactionType
{
    Purchase,   // Compra / Emisión de ticket al usuario en WalletPay
    Redemption  // Uso / Canje de ticket aprobado para MarketStore
}

public class BankUser
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = "buyer"; // "buyer" | "seller"
    public string StoreName { get; set; } = string.Empty;
    public string RoleLabel { get; set; } = "Cliente WalletPay";
    public string VerifiedLevel { get; set; } = "Face ID + Llavero iOS";
    public string AvatarInitials { get; set; } = string.Empty;
    public string AvatarHex { get; set; } = "#007AFF";
    public decimal StoreCredit { get; set; }
    public string SavedCardsJson { get; set; } = "[]";

    // Estadísticas calculadas en tiempo real desde la base de datos SQLite
    public int TotalTicketsPurchased { get; set; }
    public int UnusedTicketsCount { get; set; }
    public int UsedTicketsCount { get; set; }
    public decimal TotalCapitalContributed { get; set; }
    public decimal UnusedBalance { get; set; }
    public decimal UsedBalance { get; set; }
    public string LastPurchaseTime { get; set; } = "Sin compras";
}

public class BankTicketRecord
{
    public string Id { get; set; } = string.Empty;
    public string SerialMasked { get; set; } = string.Empty;
    public int Amount { get; set; }
    public string Tier { get; set; } = string.Empty;
    public string ColorClass { get; set; } = string.Empty;

    public string OwnerUserId { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public string OwnerEmail { get; set; } = string.Empty;
    public string OwnerInitials { get; set; } = string.Empty;

    // Usuarios con los que se compartió este ticket mediante escaneo de QR
    public string SharedWithEmails { get; set; } = string.Empty;
    public string? UsedByEmail { get; set; }
    public string? UsedByName { get; set; }

    public TicketStatus Status { get; set; } = TicketStatus.Active;

    public string PurchaseDate { get; set; } = string.Empty;
    public string PurchaseTime { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public string PurchaseTransactionId { get; set; } = string.Empty;

    public string? UsedDate { get; set; }
    public string? UsedTime { get; set; }
    public string? OrderId { get; set; }
    public string? MerchantName { get; set; }
    public string? BankVerificationCode { get; set; }

    public string SignatureHash { get; set; } = string.Empty;
    public string Signature { get; set; } = string.Empty;
    public long IssuedEpoch { get; set; }
    public bool IsSerialRevealed { get; set; }

    public List<string> GetSharedEmailsList() =>
        string.IsNullOrWhiteSpace(SharedWithEmails)
            ? new List<string>()
            : SharedWithEmails
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(e => e.Trim().ToLowerInvariant())
                .Where(e => e.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

    public bool CanBeAccessedBy(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var clean = email.Trim().ToLowerInvariant();
        if (OwnerEmail.Equals(clean, StringComparison.OrdinalIgnoreCase)) return true;
        return GetSharedEmailsList().Any(e => e.Equals(clean, StringComparison.OrdinalIgnoreCase));
    }

    // Propiedades de presentación XAML
    public bool IsUsed => Status == TicketStatus.Used;
    public bool IsUnused => Status == TicketStatus.Active;
    public bool IsShared => GetSharedEmailsList().Count > 0;

    public string AmountFormatted => $"${Amount:N0}.00";
    public string TierUpper => $"CERTIFICADO DIGITAL · {Tier.ToUpperInvariant()}";
    public string StatusBadgeText => IsUsed
        ? "YA USADO · CANJEADO"
        : (IsShared ? "SIN USAR · COMPARTIDO QR" : "SIN USAR · ACTIVO");
    public string DisplayedSerial => IsSerialRevealed ? Id : SerialMasked;
    public string PurchaseTimestampFull => $"{PurchaseDate} · {PurchaseTime}";
    public string UsageSummaryText => IsUsed
        ? $"Usado el {UsedDate} a las {UsedTime} por {UsedByName ?? OwnerName} en {MerchantName ?? "MarketStore"} (#{OrderId})"
        : (IsShared
            ? $"Activo · Compartido por QR con: {string.Join(", ", GetSharedEmailsList())}"
            : "Disponible en bóveda WalletPay del usuario (Aún no utilizado)");
    public double CardOpacity => IsUsed ? 0.82 : 1.0;
}

public class PendingTicketPurchaseRecord
{
    public string RequestId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public string UserInitials { get; set; } = "US";
    public string UserAvatarHex { get; set; } = "#007AFF";

    public int Amount { get; set; }
    public string Tier { get; set; } = string.Empty;
    public string ColorClass { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;

    public string CreatedDate { get; set; } = string.Empty;
    public string CreatedTime { get; set; } = string.Empty;

    // "pending" | "approved" | "rejected"
    public string ApprovalStatus { get; set; } = "pending";
    public string? MintedTicketId { get; set; }
    public string BankAuthCode { get; set; } = "PENDIENTE";
    public string StatusReport { get; set; } = "Esperando validación de tarjeta/pago por el Administrador del Banco Central.";
    public long CreatedEpoch { get; set; }

    public bool IsPending => ApprovalStatus == "pending";
    public bool IsApproved => ApprovalStatus == "approved";
    public bool IsRejected => ApprovalStatus == "rejected";

    public string AmountFormatted => $"${Amount:N2} MXN";
    public string TicketTitle => $"Ticket {Tier} de ${Amount:N0}.00 MXN";
    public string TimestampFull => $"{CreatedDate} · {CreatedTime}";
    public string StatusPillText => ApprovalStatus switch
    {
        "approved" => $"PAGO APROBADO · TICKET {MintedTicketId}",
        "rejected" => "PAGO DE TARJETA RECHAZADO",
        _ => "VALIDACIÓN DE TARJETA PENDIENTE"
    };
}

public class BankTransactionRecord
{
    public string Id { get; set; } = string.Empty;
    public string TicketId { get; set; } = string.Empty;
    public TransactionType Type { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public string UserInitials { get; set; } = string.Empty;
    public string UserAvatarHex { get; set; } = "#007AFF";

    public int Amount { get; set; }
    public string TicketTier { get; set; } = string.Empty;

    public string DateLabel { get; set; } = string.Empty;
    public string TimeLabel { get; set; } = string.Empty;
    public string PurchaseTimeLabel { get; set; } = string.Empty;

    public string PaymentOrChannel { get; set; } = string.Empty;
    public string? OrderId { get; set; }
    public string BankAuthCode { get; set; } = string.Empty;
    public string SignatureHash { get; set; } = string.Empty;

    public TicketStatus CurrentTicketStatus { get; set; }
    public string? TicketUsedAtLabel { get; set; }

    public bool IsPurchase => Type == TransactionType.Purchase;
    public bool IsTicketCurrentlyUsed => CurrentTicketStatus == TicketStatus.Used;
    public bool CanRedeemNow => CurrentTicketStatus == TicketStatus.Active;

    public string OperationTitle => IsPurchase
        ? $"Compra de Ticket ${Amount} ({TicketTier})"
        : $"Compra Aprobada en MarketStore con Ticket ${Amount}";

    public string TypeBadgeText => IsPurchase ? "COMPRA DE TICKET" : "COMPRA APROBADA";
    public string AmountFormatted => IsPurchase ? $"+${Amount:N0}.00 MXN" : $"${Amount:N0}.00 MXN";
    public string TicketStateBadge => CurrentTicketStatus == TicketStatus.Used
        ? $"TICKET YA USADO (#{OrderId ?? "Liquidado"})"
        : "TICKET SIN USAR (ACTIVO)";
}

public class PendingOrderApprovalRecord
{
    public string OrderId { get; set; } = string.Empty;
    public string BuyerUserId { get; set; } = string.Empty;
    public string BuyerName { get; set; } = string.Empty;
    public string BuyerEmail { get; set; } = string.Empty;
    public string BuyerInitials { get; set; } = "AM";
    public string CreatedDate { get; set; } = string.Empty;
    public string CreatedTime { get; set; } = string.Empty;

    public decimal Subtotal { get; set; }
    public decimal TicketsTotal { get; set; }
    public decimal StoreCreditUsed { get; set; }
    public decimal ChangeCredited { get; set; }

    public string ItemsSummary { get; set; } = string.Empty;
    public string ItemsJson { get; set; } = "[]";
    public string TicketIdsCsv { get; set; } = string.Empty;
    public string TicketsJson { get; set; } = "[]";

    // "pending" | "approved" | "rejected"
    public string ApprovalStatus { get; set; } = "pending";
    public bool IsAuthenticityVerified { get; set; }
    public bool IsAuthenticityValid { get; set; }
    public string VerificationReport { get; set; } = "Pendiente de verificación de autenticidad por el Administrador.";
    public string BankVerificationCode { get; set; } = string.Empty;
    public string DeliveryStatus { get; set; } = "verified";
    public string IntegritySig { get; set; } = string.Empty;
    public string ReceiptSig { get; set; } = string.Empty;

    public bool IsPending => ApprovalStatus == "pending";
    public bool IsApproved => ApprovalStatus == "approved";
    public bool IsRejected => ApprovalStatus == "rejected";

    public string SubtotalFormatted => $"${Subtotal:N2} MXN";
    public string TicketsAppliedFormatted => $"${TicketsTotal:N2} MXN en tickets ({TicketIdsCsv})";
    public string TimestampFull => $"{CreatedDate} · {CreatedTime}";
    public string StatusPillText => ApprovalStatus switch
    {
        "approved" => $"APROBADA ({BankVerificationCode})",
        "rejected" => "RECHAZADA POR EL BANCO",
        _ => IsAuthenticityVerified
            ? (IsAuthenticityValid ? "AUTENTICIDAD CONFIRMADA · LISTA PARA APROBAR" : "ERROR DE AUTENTICIDAD DETECTADO")
            : "PENDIENTE DE VERIFICACIÓN Y APROBACIÓN"
    };
}

public class DenominationBreakdownItem
{
    public int Denomination { get; set; }
    public string TierName { get; set; } = string.Empty;
    public string AccentHex { get; set; } = "#007AFF";
    public int TotalSoldCount { get; set; }
    public int UnusedCount { get; set; }
    public int UsedCount { get; set; }
    public decimal TotalCapital { get; set; }
    public decimal UnusedCapital { get; set; }
    public decimal UsedCapital { get; set; }
    public double SharePercentage { get; set; }
    public double BarWidth { get; set; }

    public string Title => $"Tickets de ${Denomination} MXN · {TierName}";
    public string TotalCapitalFormatted => $"${TotalCapital:N2} MXN";
    public string CountsSummary => $"{TotalSoldCount} vendidos ({UnusedCount} sin usar · {UsedCount} usados)";
    public string ShareText => $"{SharePercentage:F1}% del capital";
}

public class AuditLogEntry
{
    public string Time { get; set; } = string.Empty;
    public string Category { get; set; } = "BANK";
    public string Message { get; set; } = string.Empty;
    public string AccentHex { get; set; } = "#007AFF";
}
