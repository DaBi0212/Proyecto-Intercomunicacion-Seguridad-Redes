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
        AdaptWindowToComputerScreen();
        SizeChanged += (_, _) => UpdateResponsiveWindowScale();
        Loaded += (_, _) => UpdateResponsiveWindowScale();

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

    /// <summary>
    /// Redimensiona y ajusta automáticamente la ventana de CentralBank a las dimensiones
    /// reales y escala DPI del monitor/computador donde se abra.
    /// </summary>
    private void AdaptWindowToComputerScreen()
    {
        try
        {
            var workArea = SystemParameters.WorkArea;
            var targetWidth = Math.Min(1420.0, Math.Max(820.0, workArea.Width * 0.96));
            var targetHeight = Math.Min(900.0, Math.Max(560.0, workArea.Height * 0.94));

            MinWidth = Math.Min(800.0, workArea.Width * 0.75);
            MinHeight = Math.Min(540.0, workArea.Height * 0.75);
            Width = targetWidth;
            Height = targetHeight;
            Left = workArea.Left + (workArea.Width - targetWidth) / 2.0;
            Top = workArea.Top + (workArea.Height - targetHeight) / 2.0;
            WindowState = WindowState.Maximized;
        }
        catch { }
    }

    private void UpdateResponsiveWindowScale()
    {
        try
        {
            if (MainDashboardGrid == null) return;
            var effectiveWidth = ActualWidth > 100 ? ActualWidth : (Width > 100 ? Width : SystemParameters.WorkArea.Width);
            var effectiveHeight = ActualHeight > 100 ? ActualHeight : (Height > 100 ? Height : SystemParameters.WorkArea.Height);

            var scaleX = effectiveWidth < 1340.0 ? effectiveWidth / 1340.0 : 1.0;
            var scaleY = effectiveHeight < 800.0 ? effectiveHeight / 800.0 : 1.0;
            var scale = Math.Clamp(Math.Min(scaleX, scaleY), 0.65, 1.0);

            MainDashboardGrid.LayoutTransform = Math.Abs(scale - 1.0) < 0.01
                ? Transform.Identity
                : new ScaleTransform(scale, scale);
        }
        catch { }
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

}
