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

public partial class MainWindow : Window
{
    private readonly CentralBankStateService _state = new();
    private readonly CentralBankApiServer _apiServer;

    private bool _isDarkMode;
    private string _currentMainTab = "TRANSACTIONS";

    private string _selectedUserId = "ALL";
    private string _selectedTxType = "ALL";
    private string _selectedTicketState = "ALL";
    private int _selectedDenomination = 0;
    private string _searchQuery = string.Empty;

    private string _vaultSegmentFilter = "ALL";

    private readonly System.Windows.Threading.DispatcherTimer _liveSyncTimer;

    public MainWindow()
    {
        try
        {
            var logPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
            System.IO.File.AppendAllText(logPath, $"[MAINWINDOW CTOR {DateTime.Now}] Entrando al constructor...\n");
        }
        catch { }

        InitializeComponent();

        try
        {
            var logPath = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "centralbank_crash.log");
            System.IO.File.AppendAllText(logPath, $"[MAINWINDOW CTOR {DateTime.Now}] InitializeComponent completado.\n");
        }
        catch { }

        // Iniciar servidor API embebido en http://0.0.0.0:7070/ respaldado por SQLite.
        // Si otra consola de CentralBank ya atiende el puerto, esta ventana funciona como
        // consola de administrador adicional sobre la misma base SQLite (multi-administrador).
        _apiServer = new CentralBankApiServer(_state);
        var isPrimaryConsole = _apiServer.Start();

        _state.StateChanged += summary =>
        {
            Dispatcher.InvokeAsync(() =>
            {
                try
                {
                    lock (_state.SyncRoot)
                    {
                        _state.ReloadFromDatabase();
                        _lastStateFingerprint = ComputeStateFingerprint();
                        RefreshAllViews();
                    }
                    _ = TriggerDynamicIslandHudAsync(summary);
                }
                catch { }
            });
        };

        // Temporizador de sincronización continua con SQLite: refleja al instante en TODAS las consolas
        // abiertas las aprobaciones, rechazos, auditorías y compras realizadas por cualquier administrador.
        _liveSyncTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1.2)
        };
        _liveSyncTimer.Tick += (_, _) =>
        {
            try
            {
                List<string> newPending;
                List<string> resolvedElsewhere;
                lock (_state.SyncRoot)
                {
                    var prevPending = _state.TicketRequests.Where(r => r.IsPending).Select(r => r.RequestId).ToHashSet();
                    _state.ReloadFromDatabase();
                    var fingerprint = ComputeStateFingerprint();
                    if (fingerprint == _lastStateFingerprint) return;
                    _lastStateFingerprint = fingerprint;

                    var nowPending = _state.TicketRequests.Where(r => r.IsPending).Select(r => r.RequestId).ToHashSet();
                    newPending = nowPending.Where(id => !prevPending.Contains(id)).ToList();
                    resolvedElsewhere = prevPending
                        .Where(id => !nowPending.Contains(id) && !_locallyProcessedRequests.Contains(id))
                        .ToList();

                    RefreshAllViews();
                }

                if (newPending.Count > 0)
                {
                    var req = _state.TicketRequests.FirstOrDefault(r => r.RequestId == newPending[0]);
                    if (req != null)
                    {
                        _ = TriggerDynamicIslandHudAsync($"¡Validar tarjeta! {req.UserName} solicita Ticket de ${req.Amount} (#{req.RequestId})");
                    }
                }
                else if (resolvedElsewhere.Count > 0)
                {
                    var req = _state.TicketRequests.FirstOrDefault(r => r.RequestId == resolvedElsewhere[0]);
                    var verb = req?.IsRejected == true ? "rechazó" : "aprobó";
                    _ = TriggerDynamicIslandHudAsync($"Otro administrador {verb} la solicitud #{resolvedElsewhere[0]}");
                }
            }
            catch { }
        };
        _liveSyncTimer.Start();

        // Si la consola principal se cierra, una consola adicional toma automáticamente el servidor API :7070.
        _serverFailoverTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(4)
        };
        _serverFailoverTimer.Tick += async (_, _) =>
        {
            if (_apiServer.IsRunning || _failoverAttemptInFlight) return;
            _failoverAttemptInFlight = true;
            try
            {
                var tookOver = await Task.Run(() => _apiServer.Start(quiet: true));
                if (tookOver)
                {
                    UpdateConsoleRoleTitle(true);
                    _ = TriggerDynamicIslandHudAsync("Esta consola ahora atiende el servidor API :7070");
                }
            }
            catch { }
            finally
            {
                _failoverAttemptInFlight = false;
            }
        };
        _serverFailoverTimer.Start();

        Closing += (_, _) =>
        {
            _liveSyncTimer.Stop();
            _serverFailoverTimer.Stop();
            _apiServer.Dispose();
        };

        ApplyActiveTabVisuals();
        RefreshAllViews();
        _lastStateFingerprint = ComputeStateFingerprint();
        UpdateConsoleRoleTitle(isPrimaryConsole);
        _ = TriggerDynamicIslandHudAsync(isPrimaryConsole
            ? "Consola principal · Servidor API :7070 activo"
            : "Consola de administrador adicional · Sincronizada en tiempo real");
    }

    private readonly System.Windows.Threading.DispatcherTimer _serverFailoverTimer;
    private bool _failoverAttemptInFlight;
    private string _lastStateFingerprint = string.Empty;
    private readonly HashSet<string> _locallyProcessedRequests = new(StringComparer.OrdinalIgnoreCase);

    private void UpdateConsoleRoleTitle(bool isPrimary)
    {
        const string marker = " · ";
        var baseTitle = Title.Contains(marker + "Administrador adicional") || Title.Contains(marker + "Consola principal")
            ? Title[..Title.LastIndexOf(marker, StringComparison.Ordinal)]
            : Title;
        Title = baseTitle + marker + (isPrimary ? "Consola principal" : "Administrador adicional");
    }

    /// <summary>Huella del estado compartido para detectar cambios hechos por cualquier administrador.</summary>
    private string ComputeStateFingerprint()
    {
        var sb = new System.Text.StringBuilder();
        sb.Append(_state.Users.Count).Append('|')
          .Append(_state.Tickets.Count).Append('|')
          .Append(_state.UsedTicketsCount).Append('|')
          .Append(_state.Transactions.Count).Append('|')
          .Append(_state.Orders.Count).Append('|')
          .Append(_state.Users.Sum(u => u.StoreCredit)).Append('|');
        foreach (var r in _state.TicketRequests)
            sb.Append(r.RequestId).Append(':').Append(r.ApprovalStatus).Append(';');
        foreach (var o in _state.Orders)
            sb.Append(o.OrderId).Append(':').Append(o.ApprovalStatus).Append(o.IsAuthenticityVerified ? 'V' : '-').Append(';');
        var lastLog = _state.AuditLogs.FirstOrDefault();
        if (lastLog != null)
            sb.Append(_state.AuditLogs.Count).Append(lastLog.Time).Append(lastLog.Message);
        return sb.ToString();
    }

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

    // =========================================================================
    // EVENTOS DE NAVEGACIÓN Y FILTROS
    // =========================================================================

    private void OnMainTabTransactionsClick(object sender, RoutedEventArgs e) => SwitchMainTab("TRANSACTIONS");
    private void OnMainTabApprovalsClick(object sender, RoutedEventArgs e) => SwitchMainTab("APPROVALS");
    private void OnMainTabTicketsClick(object sender, RoutedEventArgs e) => SwitchMainTab("TICKETS");
    private void OnMainTabCapitalClick(object sender, RoutedEventArgs e) => SwitchMainTab("CAPITAL");
    private void OnMainTabAuditorClick(object sender, RoutedEventArgs e) => SwitchMainTab("AUDITOR");

    private void SwitchMainTab(string tab)
    {
        _currentMainTab = tab;
        ViewTransactionsPanel.Visibility = tab == "TRANSACTIONS" ? Visibility.Visible : Visibility.Collapsed;
        ViewApprovalsPanel.Visibility = tab == "APPROVALS" ? Visibility.Visible : Visibility.Collapsed;
        ViewTicketsPanel.Visibility = tab == "TICKETS" ? Visibility.Visible : Visibility.Collapsed;
        ViewCapitalPanel.Visibility = tab == "CAPITAL" ? Visibility.Visible : Visibility.Collapsed;
        ViewAuditorPanel.Visibility = tab == "AUDITOR" ? Visibility.Visible : Visibility.Collapsed;
        ApplyActiveTabVisuals();
    }

    private void ApplyActiveTabVisuals()
    {
        UpdateSegmentButtonHighlight(TabBtnTransactions, _currentMainTab == "TRANSACTIONS");
        UpdateSegmentButtonHighlight(TabBtnApprovals, _currentMainTab == "APPROVALS");
        UpdateSegmentButtonHighlight(TabBtnTickets, _currentMainTab == "TICKETS");
        UpdateSegmentButtonHighlight(TabBtnCapital, _currentMainTab == "CAPITAL");
        UpdateSegmentButtonHighlight(TabBtnAuditor, _currentMainTab == "AUDITOR");
    }

    private void UpdateSegmentButtonHighlight(Button btn, bool active)
    {
        if (active)
        {
            btn.Background = (Brush)FindResource("BgSheetCell");
            btn.Foreground = (Brush)FindResource("IosBlue");
        }
        else
        {
            btn.Background = Brushes.Transparent;
            btn.Foreground = (Brush)FindResource("TextPrimary");
        }
    }

    private void OnFilterTxTypeClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string tag)
        {
            _selectedTxType = tag;
            RefreshTransactionsList();
        }
    }

    private void OnFilterTxTicketStateClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string tag)
        {
            _selectedTicketState = tag;
            RefreshTransactionsList();
        }
    }

    private void OnFilterDenomClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string tag && int.TryParse(tag, out var denom))
        {
            _selectedDenomination = denom;
            RefreshTransactionsList();
        }
    }

    private void OnTxSearchTextChanged(object sender, TextChangedEventArgs e)
    {
        _searchQuery = TxSearchBox.Text;
        RefreshTransactionsList();
    }

    private void OnVaultFilterSegmentClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string tag)
        {
            _vaultSegmentFilter = tag;
            RefreshTicketsVaultList();
        }
    }

    private void OnInspectUserHistoryClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string userId)
        {
            _selectedUserId = userId;
            SwitchMainTab("TRANSACTIONS");
            RebuildUserFilterPills();
            RefreshTransactionsList();
            _ = TriggerDynamicIslandHudAsync("Filtrando historial del usuario seleccionado...");
        }
    }

    private void OnAuditTicketFromRowClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string ticketId)
        {
            AuditFolioInput.Text = ticketId;
            RunAuditForFolio(ticketId);
            SwitchMainTab("AUDITOR");
            _ = TriggerDynamicIslandHudAsync($"Verificando autenticidad de {ticketId}...");
        }
    }

    private void OnToggleRevealTicketSerialClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string ticketId)
        {
            var ticket = _state.Tickets.FirstOrDefault(t => t.Id == ticketId);
            if (ticket != null)
            {
                ticket.IsSerialRevealed = !ticket.IsSerialRevealed;
                RefreshTicketsVaultList();
                _ = TriggerDynamicIslandHudAsync(ticket.IsSerialRevealed
                    ? $"Folio {ticket.Id} revelado"
                    : $"Folio {ticket.Id} protegido");
            }
        }
    }

    private void OnRunAuditVerifyClick(object sender, RoutedEventArgs e)
    {
        var query = AuditFolioInput.Text;
        RunAuditForFolio(query);
        _ = TriggerDynamicIslandHudAsync($"Auditoría de ticket completada ({query})");
    }

    private void OnClearDatabaseClick(object sender, RoutedEventArgs e)
    {
        var answer = MessageBox.Show(
            "¿Deseas vaciar todos los registros de la base de datos SQLite (usuarios, tickets, transacciones y órdenes) para iniciar desde cero?",
            "Banco Central · Limpiar Base de Datos SQLite",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question
        );

        if (answer == MessageBoxResult.Yes)
        {
            _state.ClearAllDatabaseData();
            _selectedUserId = "ALL";
            RefreshAllViews();
        }
    }

    private void OnExportCsvClick(object sender, RoutedEventArgs e)
    {
        var filePath = _state.ExportReportToCsv();
        RefreshAllViews();
        _ = TriggerDynamicIslandHudAsync("Reporte CSV exportado correctamente");
        MessageBox.Show(
            $"Se ha exportado el historial completo de transacciones por usuario, estado de tickets (usados y sin usar) y el balance de capital total a:\n\n{filePath}",
            "Banco Central · Reporte Exportado",
            MessageBoxButton.OK,
            MessageBoxImage.Information
        );
    }

    // =========================================================================
    // TEMA CLARO / OSCURO (CONSISTENCIA 1:1 CON WALLETPAY Y MARKETSTORE)
    // =========================================================================

    private void OnToggleThemeClick(object sender, RoutedEventArgs e)
    {
        _isDarkMode = !_isDarkMode;
        var res = Application.Current.Resources;

        if (_isDarkMode)
        {
            res["BgPrimary"] = BrushFromHex("#000000");
            res["BgGrouped"] = BrushFromHex("#000000");
            res["BgCell"] = BrushFromHex("#2C2C2E");
            res["BgCardElevated"] = BrushFromHex("#1C1C1E");
            res["BgToolbar"] = BrushFromHex("#161618");
            res["BgSheetCell"] = BrushFromHex("#2C2C2E");

            res["TextPrimary"] = BrushFromHex("#FFFFFF");
            res["TextSecondary"] = BrushFromHex("#AEAEB2");
            res["TextTertiary"] = BrushFromHex("#8E8E93");

            res["IosFill"] = new SolidColorBrush(Color.FromArgb(62, 118, 118, 128));
            res["IosSeparator"] = new SolidColorBrush(Color.FromArgb(140, 84, 84, 88));
            res["IosBlue"] = BrushFromHex("#0A84FF");

            ThemeToggleBtn.Content = "Modo Claro";
        }
        else
        {
            res["BgPrimary"] = BrushFromHex("#FFFFFF");
            res["BgGrouped"] = BrushFromHex("#F5F5F7");
            res["BgCell"] = BrushFromHex("#F2F2F7");
            res["BgCardElevated"] = BrushFromHex("#FFFFFF");
            res["BgToolbar"] = BrushFromHex("#F9F9FB");
            res["BgSheetCell"] = BrushFromHex("#FFFFFF");

            res["TextPrimary"] = BrushFromHex("#000000");
            res["TextSecondary"] = BrushFromHex("#636366");
            res["TextTertiary"] = BrushFromHex("#8E8E93");

            res["IosFill"] = new SolidColorBrush(Color.FromArgb(31, 120, 120, 128));
            res["IosSeparator"] = new SolidColorBrush(Color.FromArgb(45, 60, 60, 67));
            res["IosBlue"] = BrushFromHex("#007AFF");

            ThemeToggleBtn.Content = "Modo Oscuro";
        }

        ApplyActiveTabVisuals();
        RefreshAllViews();
        _ = TriggerDynamicIslandHudAsync(_isDarkMode ? "Apariencia Oscura iOS Activada" : "Apariencia Clara iOS Activada");
    }

    private static SolidColorBrush BrushFromHex(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        return brush;
    }

    private int _adminFailedAttempts;
    private DateTime _adminLockedUntil = DateTime.MinValue;

    private void OnLockSessionClick(object sender, RoutedEventArgs e)
    {
        AdminPasswordBox.Password = "";
        AdminLockErrorText.Visibility = Visibility.Collapsed;
        AdminLockSubtitle.Text = _state.HasAdminPassword
            ? "Ingresa tu clave de administrador para desbloquear el Libro Mayor."
            : "Define una clave de administrador (mínimo 8 caracteres) para proteger esta consola.";
        AdminUnlockBtn.Content = _state.HasAdminPassword
            ? "Desbloquear Consola de Administrador"
            : "Guardar Clave y Desbloquear";
        AdminLockOverlay.Visibility = Visibility.Visible;
        _state.AddAuditLog("SEC", "#FF9500", "[Seguridad] Consola bloqueada manualmente por el Administrador.");
    }

    private void OnAdminPasswordKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Enter)
        {
            OnUnlockAdminConsoleClick(sender, e);
        }
    }

    private void OnUnlockAdminConsoleClick(object sender, RoutedEventArgs e)
    {
        if (_adminLockedUntil > DateTime.UtcNow)
        {
            var secs = Math.Max(1, (int)Math.Ceiling((_adminLockedUntil - DateTime.UtcNow).TotalSeconds));
            AdminLockErrorText.Text = $"Consola bloqueada por intentos fallidos. Espera {secs} segundos.";
            AdminLockErrorText.Visibility = Visibility.Visible;
            return;
        }

        var pwd = AdminPasswordBox.Password ?? "";
        if (!_state.HasAdminPassword)
        {
            if (pwd.Length < 8)
            {
                AdminLockErrorText.Text = "La nueva clave debe tener al menos 8 caracteres.";
                AdminLockErrorText.Visibility = Visibility.Visible;
                return;
            }
            _state.SetInitialAdminPassword(pwd);
        }
        else if (!_state.VerifyAdminPassword(pwd))
        {
            _adminFailedAttempts++;
            if (_adminFailedAttempts >= 5)
            {
                _adminLockedUntil = DateTime.UtcNow.AddMinutes(2);
                _adminFailedAttempts = 0;
                AdminLockErrorText.Text = "Demasiados intentos inválidos. Consola bloqueada por 2 minutos.";
            }
            else
            {
                AdminLockErrorText.Text = $"Clave incorrecta. Intentos restantes: {5 - _adminFailedAttempts}.";
            }
            AdminLockErrorText.Visibility = Visibility.Visible;
            AdminPasswordBox.Password = "";
            _state.AddAuditLog("SEC", "#FF3B30", "[Control de Acceso] Intento fallido de desbloqueo de consola con credenciales inválidas.");
            return;
        }

        _adminFailedAttempts = 0;
        AdminPasswordBox.Password = "";
        AdminLockErrorText.Visibility = Visibility.Collapsed;
        AdminLockOverlay.Visibility = Visibility.Collapsed;
        _state.AddAuditLog("SEC", "#34C759", "[Control de Acceso] Sesión de Administrador desbloqueada.");
        RefreshAllViews();
        _ = TriggerDynamicIslandHudAsync("Sesión de Administrador Verificada");
    }

    private async Task TriggerDynamicIslandHudAsync(string message)
    {
        HudStatusText.Text = message;
        HudPulseDot.Fill = BrushFromHex("#0A84FF");
        await Task.Delay(2600);
        HudPulseDot.Fill = BrushFromHex("#30D158");
    }
}
