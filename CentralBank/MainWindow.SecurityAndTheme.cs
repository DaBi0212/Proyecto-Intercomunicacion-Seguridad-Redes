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
