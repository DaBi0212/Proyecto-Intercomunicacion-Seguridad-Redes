using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using CentralBank.Models;
using CentralBank.Services;

namespace CentralBank;

public partial class MainWindow
{
    // =========================================================================
    // REFRESCO GENERAL DESDE LA BASE DE DATOS SQLITE
    // =========================================================================

    private void RefreshAllViews()
    {
        lock (_state.SyncRoot)
        {
            _state.RecalculateUserMetrics();

        var totalCap = _state.TotalCapitalFromTicketSales;
        var unusedCap = _state.UnusedTicketsCapital;
        var usedCap = _state.UsedTicketsCapital;
        var totalTickets = _state.TotalTicketsSoldCount;
        var unusedCount = _state.UnusedTicketsCount;
        var usedCount = _state.UsedTicketsCount;
        var pendingOrders = _state.PendingOrdersCount;
        var pendingTicketReqs = _state.PendingTicketRequestsCount;
        var totalPending = _state.TotalPendingApprovalsCount;

        KpiTotalCapitalValue.Text = $"${totalCap:N2} MXN";
        KpiTotalCapitalSub.Text = $"{totalTickets} tickets vendidos en WalletPay";

        KpiUnusedTicketsValue.Text = $"{unusedCount} Tickets (${unusedCap:N0})";
        KpiUnusedTicketsSub.Text = totalTickets == 0
            ? "Comprados en WalletPay pendientes de uso"
            : $"{_state.UnusedRatePercent:F1}% comprados aún sin usar (en circulación)";

        KpiUsedTicketsValue.Text = $"{usedCount} Tickets (${usedCap:N0})";
        KpiUsedTicketsSub.Text = totalTickets == 0
            ? "Verificados y aprobados en MarketStore"
            : $"{_state.RedemptionRatePercent:F1}% ya usados en MarketStore · 0 doble gasto";

        KpiUsersAndTxValue.Text = $"{_state.Users.Count} Usuarios · {pendingTicketReqs} Pendientes";
        KpiUsersAndTxSub.Text = $"{pendingTicketReqs} tarjeta(s) por aprobar · {_state.Orders.Count} compras auto-validadas";

        // Actualizar banner de alerta superior cuando hay pagos de tickets en WalletPay esperando aprobación
        if (pendingTicketReqs > 0)
        {
            LivePendingOrdersAlertBanner.Visibility = Visibility.Visible;
            LivePendingAlertTitle.Text = $"Hay {pendingTicketReqs} solicitud(es) de compra de ticket en WalletPay esperando aprobación del Administrador";
        }
        else
        {
            LivePendingOrdersAlertBanner.Visibility = Visibility.Collapsed;
        }

        // Actualizar textos de pestañas
        TabBtnTransactions.Content = $"Historial de Transacciones ({_state.Transactions.Count})";
        TabBtnApprovals.Content = pendingTicketReqs > 0
            ? $"Aprobar Compra de Tickets ({pendingTicketReqs} Pend.)"
            : $"Aprobar Compra de Tickets ({_state.TicketRequests.Count})";
        TabBtnTickets.Content = $"Tickets ({unusedCount} Sin Usar · {usedCount} Usados)";

        RebuildUserFilterPills();
        RefreshTransactionsList();
        RefreshApprovalsList();
        RefreshTicketsVaultList();
        RefreshCapitalAndUsersView();
        RebuildQuickAuditPills();

            AuditLogsItemsControl.ItemsSource = null;
            AuditLogsItemsControl.ItemsSource = _state.AuditLogs.Take(15).ToList();
        }
    }

    // =========================================================================
    // VISTA 1: HISTORIAL DE TRANSACCIONES POR USUARIO, MONTO Y HORA
    // =========================================================================

    private void RebuildUserFilterPills()
    {
        UserFilterPillsPanel.Children.Clear();

        var allBtn = CreateUserPillButton(
            "ALL",
            $"Todos los Usuarios ({_state.Users.Count})",
            $"${_state.TotalCapitalFromTicketSales:N0} MXN",
            _selectedUserId == "ALL"
        );
        UserFilterPillsPanel.Children.Add(allBtn);

        foreach (var u in _state.Users)
        {
            var btn = CreateUserPillButton(
                u.Id,
                u.Name,
                $"${u.TotalCapitalContributed:N0} ({u.UnusedTicketsCount} sin usar / {u.UsedTicketsCount} usados)",
                _selectedUserId == u.Id
            );
            UserFilterPillsPanel.Children.Add(btn);
        }

        if (_selectedUserId == "ALL")
        {
            SelectedUserSummaryCard.Visibility = Visibility.Collapsed;
        }
        else
        {
            var selUser = _state.Users.FirstOrDefault(x => x.Id == _selectedUserId);
            if (selUser != null)
            {
                SelectedUserSummaryCard.Visibility = Visibility.Visible;
                SelUserAvatarBorder.Background = (Brush)new BrushConverter().ConvertFromString(selUser.AvatarHex)!;
                SelUserInitialsText.Text = selUser.AvatarInitials;
                SelUserNameText.Text = selUser.Name;
                SelUserEmailText.Text = $"{selUser.Email} · {selUser.RoleLabel} · {selUser.VerifiedLevel}";
                SelUserTotalBoughtText.Text = $"${selUser.TotalCapitalContributed:N2} MXN ({selUser.TotalTicketsPurchased} tickets)";
                SelUserUnusedText.Text = $"{selUser.UnusedTicketsCount} tickets (${selUser.UnusedBalance:N0} MXN)";
                SelUserUsedText.Text = $"{selUser.UsedTicketsCount} tickets (${selUser.UsedBalance:N0} MXN)";
            }
            else
            {
                SelectedUserSummaryCard.Visibility = Visibility.Collapsed;
            }
        }
    }

    private Button CreateUserPillButton(string userId, string title, string subtitle, bool isActive)
    {
        var sp = new StackPanel { Orientation = Orientation.Horizontal };
        sp.Children.Add(new TextBlock
        {
            Text = title,
            FontWeight = FontWeights.Bold,
            FontSize = 12,
            Margin = new Thickness(0, 0, 6, 0)
        });
        sp.Children.Add(new TextBlock
        {
            Text = subtitle,
            FontWeight = FontWeights.SemiBold,
            FontSize = 11,
            Opacity = 0.82
        });

        var btn = new Button
        {
            Style = (Style)FindResource(isActive ? "ApplePrimaryBtn" : "AppleSecondaryBtn"),
            Content = sp,
            Tag = userId,
            Padding = new Thickness(12, 7, 12, 7),
            Margin = new Thickness(0, 0, 8, 8)
        };

        btn.Click += (_, _) =>
        {
            _selectedUserId = userId;
            RebuildUserFilterPills();
            RefreshTransactionsList();
        };

        return btn;
    }

    private void RefreshTransactionsList()
    {
        UpdateSegmentButtonHighlight(FilterTxAllBtn, _selectedTxType == "ALL");
        UpdateSegmentButtonHighlight(FilterTxBuyBtn, _selectedTxType == "BUY");
        UpdateSegmentButtonHighlight(FilterTxRedeemBtn, _selectedTxType == "REDEEM");

        UpdateSegmentButtonHighlight(FilterTxTicketAllBtn, _selectedTicketState == "ALL");
        UpdateSegmentButtonHighlight(FilterTxTicketUnusedBtn, _selectedTicketState == "UNUSED");
        UpdateSegmentButtonHighlight(FilterTxTicketUsedBtn, _selectedTicketState == "USED");

        UpdateSegmentButtonHighlight(FilterDenomAllBtn, _selectedDenomination == 0);
        UpdateSegmentButtonHighlight(FilterDenom50Btn, _selectedDenomination == 50);
        UpdateSegmentButtonHighlight(FilterDenom100Btn, _selectedDenomination == 100);
        UpdateSegmentButtonHighlight(FilterDenom200Btn, _selectedDenomination == 200);
        UpdateSegmentButtonHighlight(FilterDenom500Btn, _selectedDenomination == 500);

        IEnumerable<BankTransactionRecord> query = _state.Transactions;

        if (_selectedUserId != "ALL")
            query = query.Where(tx => tx.UserId == _selectedUserId);

        if (_selectedTxType == "BUY")
            query = query.Where(tx => tx.Type == TransactionType.Purchase);
        else if (_selectedTxType == "REDEEM")
            query = query.Where(tx => tx.Type == TransactionType.Redemption);

        if (_selectedTicketState == "UNUSED")
            query = query.Where(tx => tx.CurrentTicketStatus == TicketStatus.Active);
        else if (_selectedTicketState == "USED")
            query = query.Where(tx => tx.CurrentTicketStatus == TicketStatus.Used);

        if (_selectedDenomination > 0)
            query = query.Where(tx => tx.Amount == _selectedDenomination);

        if (!string.IsNullOrWhiteSpace(_searchQuery))
        {
            var q = _searchQuery.Trim().ToLowerInvariant();
            query = query.Where(tx =>
                tx.UserName.ToLowerInvariant().Contains(q) ||
                tx.UserEmail.ToLowerInvariant().Contains(q) ||
                tx.TicketId.ToLowerInvariant().Contains(q) ||
                tx.Id.ToLowerInvariant().Contains(q) ||
                tx.PaymentOrChannel.ToLowerInvariant().Contains(q) ||
                tx.TimeLabel.ToLowerInvariant().Contains(q) ||
                tx.DateLabel.ToLowerInvariant().Contains(q) ||
                tx.TicketTier.ToLowerInvariant().Contains(q));
        }

        var filtered = query.ToList();
        TransactionsItemsControl.ItemsSource = filtered;
        EmptyTransactionsState.Visibility = filtered.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var totalShownAmount = filtered.Sum(x => (decimal)x.Amount);
        var purchasesSum = filtered.Where(x => x.IsPurchase).Sum(x => (decimal)x.Amount);

        TxListHeaderCountText.Text = $"MOSTRANDO {filtered.Count} TRANSACCIONES REGISTRADAS";
        TxListHeaderSumText.Text = $"Capital en compras mostradas: ${purchasesSum:N2} MXN · Volumen en vista: ${totalShownAmount:N2} MXN";
    }

    // =========================================================================
    // VISTA 2: VERIFICACIÓN DE AUTENTICIDAD Y APROBACIÓN DE COMPRAS DE MARKETSTORE
    // =========================================================================

    private void RefreshApprovalsList()
    {
        var ticketReqs = _state.TicketRequests.ToList();
        TicketRequestsItemsControl.ItemsSource = null;
        TicketRequestsItemsControl.ItemsSource = ticketReqs;
        EmptyTicketRequestsState.Visibility = ticketReqs.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var orders = _state.Orders.ToList();
        OrdersApprovalItemsControl.ItemsSource = null;
        OrdersApprovalItemsControl.ItemsSource = orders;
        EmptyOrdersApprovalState.Visibility = orders.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnApproveTicketPurchaseRequestClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string requestId)
        {
            btn.IsEnabled = false;
            _locallyProcessedRequests.Add(requestId);
            var (ok, msg, minted) = _state.ApproveTicketPurchaseRequest(requestId);
            RefreshAllViews();
            _ = TriggerDynamicIslandHudAsync(ok && minted != null
                ? $"Pago aprobado (#{requestId}) · Ticket {minted.Id} (${minted.Amount}) emitido"
                : $"#{requestId}: {msg}");
        }
    }

    private void OnRejectTicketPurchaseRequestClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string requestId)
        {
            btn.IsEnabled = false;
            _locallyProcessedRequests.Add(requestId);
            var rejected = _state.RejectTicketPurchaseRequest(requestId, "Pago de tarjeta rechazado manualmente por el Administrador del Banco Central.");
            RefreshAllViews();
            _ = TriggerDynamicIslandHudAsync(rejected
                ? $"Pago de tarjeta #{requestId} rechazado"
                : $"#{requestId}: otro administrador ya procesó esta solicitud");
        }
    }

    private void OnVerifyOrderTicketsAuthenticityClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string orderId)
        {
            var (valid, report) = _state.VerifyOrderTicketsAuthenticity(orderId);
            RefreshAllViews();
            _ = TriggerDynamicIslandHudAsync(valid
                ? $"Autenticidad verificada para #{orderId}"
                : $"Error de autenticidad en #{orderId}: {report}");
        }
    }

    private void OnApproveOrderPurchaseClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string orderId)
        {
            var (ok, msg) = _state.ApprovePendingOrder(orderId);
            RefreshAllViews();
            _ = TriggerDynamicIslandHudAsync(ok
                ? $"Compra #{orderId} APROBADA ({msg}) · MarketStore actualizado"
                : $"No se pudo aprobar #{orderId}: {msg}");
        }
    }

    private void OnRejectOrderPurchaseClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string orderId)
        {
            _state.RejectPendingOrder(orderId, "Compra rechazada manualmente por el Administrador del Banco Central.");
            RefreshAllViews();
            _ = TriggerDynamicIslandHudAsync($"Compra #{orderId} rechazada");
        }
    }

    // =========================================================================
    // VISTA 3: BÓVEDA DE TICKETS (COMPRADOS SIN USAR VS. YA USADOS)
    // =========================================================================

    private void RefreshTicketsVaultList()
    {
        VaultSegAllBtn.Content = $"Todos ({_state.TotalTicketsSoldCount})";
        VaultSegUnusedBtn.Content = $"Sin Usar · Activos ({_state.UnusedTicketsCount})";
        VaultSegUsedBtn.Content = $"Ya Usados · Canjeados ({_state.UsedTicketsCount})";

        UpdateSegmentButtonHighlight(VaultSegAllBtn, _vaultSegmentFilter == "ALL");
        UpdateSegmentButtonHighlight(VaultSegUnusedBtn, _vaultSegmentFilter == "UNUSED");
        UpdateSegmentButtonHighlight(VaultSegUsedBtn, _vaultSegmentFilter == "USED");

        IEnumerable<BankTicketRecord> list = _state.Tickets;
        if (_vaultSegmentFilter == "UNUSED")
            list = list.Where(t => t.Status == TicketStatus.Active);
        else if (_vaultSegmentFilter == "USED")
            list = list.Where(t => t.Status == TicketStatus.Used);

        var finalList = list.ToList();
        TicketsVaultItemsControl.ItemsSource = null;
        TicketsVaultItemsControl.ItemsSource = finalList;
        EmptyTicketsVaultState.Visibility = finalList.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    // =========================================================================
    // VISTA 4: CAPITAL TOTAL OBTENIDO Y RENDIMIENTO POR USUARIO
    // =========================================================================

    private void RefreshCapitalAndUsersView()
    {
        var totalCap = _state.TotalCapitalFromTicketSales;
        var unusedCap = _state.UnusedTicketsCapital;
        var usedCap = _state.UsedTicketsCapital;

        CapHeroTotalText.Text = $"${totalCap:N2} MXN";
        CapUnusedAmountText.Text = $"${unusedCap:N2} MXN ({_state.UnusedRatePercent:F1}%)";
        CapUnusedCountText.Text = $"{_state.UnusedTicketsCount} tickets comprados aún sin usar";

        CapUsedAmountText.Text = $"${usedCap:N2} MXN ({_state.RedemptionRatePercent:F1}%)";
        CapUsedCountText.Text = $"{_state.UsedTicketsCount} tickets ya usados en compras";

        var unusedWeight = totalCap == 0 ? 1.0 : Math.Max(0.05, (double)unusedCap);
        var usedWeight = totalCap == 0 ? 1.0 : Math.Max(0.05, (double)usedCap);
        CapUnusedBarCol.Width = new GridLength(unusedWeight, GridUnitType.Star);
        CapUsedBarCol.Width = new GridLength(usedWeight, GridUnitType.Star);

        DenominationBreakdownItemsControl.ItemsSource = _state.GetDenominationBreakdown();
        UsersCapitalItemsControl.ItemsSource = null;
        UsersCapitalItemsControl.ItemsSource = _state.Users
            .OrderByDescending(u => u.TotalCapitalContributed)
            .ToList();
    }

    // =========================================================================
    // VISTA 5: AUDITOR CRIPTOGRÁFICO RSA-2048
    // =========================================================================

    private void RebuildQuickAuditPills()
    {
        QuickAuditFoliosPanel.Children.Clear();
        foreach (var t in _state.Tickets.Take(10))
        {
            var stateTag = t.IsUsed ? "Usado" : "Sin Usar";
            var btn = new Button
            {
                Style = (Style)FindResource("AppleSecondaryBtn"),
                Content = $"{t.Id} (${t.Amount} · {stateTag})",
                Tag = t.Id,
                FontFamily = new FontFamily("Consolas"),
                FontSize = 11,
                Padding = new Thickness(9, 5, 9, 5),
                Margin = new Thickness(0, 0, 6, 6)
            };
            btn.Click += (_, _) =>
            {
                AuditFolioInput.Text = t.Id;
                RunAuditForFolio(t.Id);
            };
            QuickAuditFoliosPanel.Children.Add(btn);
        }
    }

    private void RunAuditForFolio(string rawFolio)
    {
        if (string.IsNullOrWhiteSpace(rawFolio))
        {
            return;
        }

        _state.ReloadFromDatabase();
        var ticket = _state.FindTicketByFolio(rawFolio);
        if (ticket == null)
        {
            AuditResultStatusBanner.Background = (Brush)FindResource("SoftRed");
            AuditResultBannerText.Text = "FOLIO NO ENCONTRADO EN LA BASE DE DATOS DEL BANCO CENTRAL";
            AuditResultBannerText.Foreground = (Brush)FindResource("IosRed");

            AuditResFolioVal.Text = $"{rawFolio} (Inexistente)";
            AuditResOwnerVal.Text = "Sin titular";
            AuditResPurchaseTimeVal.Text = "—";
            AuditResUsageVal.Text = "Rechazado por no existir en el registro";
            AuditResHashVal.Text = "NINGUNA COINCIDENCIA EN EL LIBRO MAYOR";
            return;
        }

        if (!_state.IsTicketRecordAuthentic(ticket))
        {
            AuditResultStatusBanner.Background = (Brush)FindResource("SoftRed");
            AuditResultBannerText.Text = "ALERTA DE INTEGRIDAD · LOS DATOS DEL TICKET FUERON ALTERADOS";
            AuditResultBannerText.Foreground = (Brush)FindResource("IosRed");
            AuditResUsageVal.Text = "Inválido (monto, titular o fecha no coinciden con la emisión)";
        }
        else if (ticket.IsUnused)
        {
            AuditResultStatusBanner.Background = (Brush)FindResource("SoftGreen");
            AuditResultBannerText.Text = "CERTIFICADO AUTÉNTICO Y ACTIVO · COMPRADO Y AÚN SIN USAR";
            AuditResultBannerText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#248A3D"));
            AuditResUsageVal.Text = "Aún sin usar (En bóveda WalletPay del usuario)";
        }
        else
        {
            AuditResultStatusBanner.Background = (Brush)FindResource("SoftAmber");
            AuditResultBannerText.Text = $"TICKET YA USADO EN #{ticket.OrderId} · PROTECCIÓN ANTI-DOBLE GASTO ACTIVA";
            AuditResultBannerText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#D97706"));
            AuditResUsageVal.Text = $"Ya usado el {ticket.UsedDate} a las {ticket.UsedTime} ({ticket.BankVerificationCode})";
        }

        AuditResFolioVal.Text = $"{ticket.Id} · ${ticket.Amount:N2} MXN ({ticket.Tier})";
        AuditResOwnerVal.Text = $"{ticket.OwnerName} ({ticket.OwnerEmail})";
        AuditResPurchaseTimeVal.Text = $"{ticket.PurchaseDate} · {ticket.PurchaseTime} ({ticket.PaymentMethod})";
        AuditResHashVal.Text = ticket.SignatureHash;
    }

}
