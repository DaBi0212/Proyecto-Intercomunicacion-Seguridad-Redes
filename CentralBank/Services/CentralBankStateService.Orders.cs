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
