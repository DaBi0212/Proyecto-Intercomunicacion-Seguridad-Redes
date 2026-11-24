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

}
