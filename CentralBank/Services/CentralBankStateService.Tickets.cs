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

public partial class CentralBankStateService
{
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

    public PendingTicketPurchaseRecord CreatePendingTicketPurchaseRequest(string userEmail, int denomination, string paymentMethod, int quantity = 1)
    {
        if (!AllowedDenominations.Contains(denomination))
        {
            throw new InvalidOperationException("Denominación no permitida. Solo se emiten tickets de $50, $100, $200 o $500.");
        }

        quantity = Math.Clamp(quantity, 1, 50);

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
        var totalAmount = denomination * quantity;

        lock (_dbLock)
        {
            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO ticket_requests (
                    request_id, user_id, user_name, user_email, user_initials, user_avatar_hex,
                    amount, quantity, tier, color_class, payment_method, created_date, created_time,
                    approval_status, minted_ticket_id, bank_auth_code, status_report, created_epoch
                ) VALUES (
                    $rid, $uid, $uname, $uemail, $uinit, $uhex,
                    $amt, $qty, $tier, $cls, $method, $cdate, $ctime,
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
            cmd.Parameters.AddWithValue("$qty", quantity);
            cmd.Parameters.AddWithValue("$tier", tierName);
            cmd.Parameters.AddWithValue("$cls", colorClass);
            cmd.Parameters.AddWithValue("$method", paymentMethod);
            cmd.Parameters.AddWithValue("$cdate", dateStr);
            cmd.Parameters.AddWithValue("$ctime", timeStr);
            cmd.Parameters.AddWithValue("$epoch", epoch);
            cmd.ExecuteNonQuery();
        }

        var qtyLabel = quantity > 1 ? $"{quantity}× Ticket {tierName} de ${denomination} MXN (Total: ${totalAmount} MXN)" : $"Ticket {tierName} de ${denomination} MXN";
        AddAuditLog(
            "CARD-REQ",
            "#FF9500",
            $"[Validación de Tarjeta] {user.Name} ({user.Email}) solicitó comprar {qtyLabel} vía {paymentMethod} (#{requestId}). Esperando aprobación del Administrador."
        );

        ReloadFromDatabase();
        var record = TicketRequests.First(r => r.RequestId == requestId);
        PendingTicketRequestCreated?.Invoke(record);
        NotifyStateChanged($"¡Nueva solicitud de compra ({qtyLabel}) #{requestId} espera aprobación bancaria!");
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
                var firstId = req.MintedTicketId?.Split(',')[0].Trim();
                var existingTk = Tickets.FirstOrDefault(t => t.Id == firstId);
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

            var qty = Math.Clamp(req.Quantity, 1, 50);
            var mintedList = new List<BankTicketRecord>(qty);
            try
            {
                for (var i = 0; i < qty; i++)
                {
                    mintedList.Add(PurchaseTicketForUser(req.UserEmail, req.Amount, req.PaymentMethod));
                }
            }
            catch (Exception ex)
            {
                ReleaseTicketRequestClaim(req.RequestId);
                return (false, $"No se pudo emitir el ticket: {ex.Message}", null);
            }

            var firstMinted = mintedList[0];
            var allMintedIdsCsv = string.Join(", ", mintedList.Select(t => t.Id));
            var authCode = $"CARD-OK-{SecurityService.NewInt(10000, 100000)}";
            var report = qty > 1
                ? $"Pago con tarjeta ({req.PaymentMethod}) por ${req.TotalAmount:N2} MXN validado y aprobado por el Administrador ({authCode}). {qty} tickets emitidos ({allMintedIdsCsv})."
                : $"Pago con tarjeta ({req.PaymentMethod}) validado y aprobado por el Administrador ({authCode}). Ticket {firstMinted.Id} emitido.";

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
                cmd.Parameters.AddWithValue("$tid", allMintedIdsCsv);
                cmd.Parameters.AddWithValue("$code", authCode);
                cmd.Parameters.AddWithValue("$rep", report);
                cmd.Parameters.AddWithValue("$rid", req.RequestId);
                cmd.ExecuteNonQuery();
            }

            AddAuditLog(
                "CARD-OK",
                "#34C759",
                qty > 1
                    ? $"[Pago de Tarjeta Aprobado] Solicitud #{req.RequestId} de {req.UserName} por ${req.TotalAmount} MXN ({qty}× ${req.Amount}) aprobada ({authCode}). Tickets emitidos: {allMintedIdsCsv}."
                    : $"[Pago de Tarjeta Aprobado] Solicitud #{req.RequestId} de {req.UserName} por ${req.Amount} MXN aprobada ({authCode}). Ticket {firstMinted.Id} emitido a su bóveda."
            );

            ReloadFromDatabase();
            NotifyStateChanged(qty > 1
                ? $"Pago aprobado (#{req.RequestId}) · {qty} tickets de ${req.Amount} MXN emitidos"
                : $"Pago de tarjeta aprobado (#{req.RequestId}) · Ticket {firstMinted.Id} (${req.Amount} MXN) emitido");
            return (true, authCode, firstMinted);
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

}
