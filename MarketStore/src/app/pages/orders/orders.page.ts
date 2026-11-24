import { Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MarketStateService } from '../../core/services/market-state.service';
import { OrderStatus } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CurrencyPipe, SfSymbolComponent],
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.scss'
})
export class OrdersPage {
  readonly market = inject(MarketStateService);

  statusLabel(s: OrderStatus): string {
    const map: Record<OrderStatus, string> = {
      verified: 'Ticket Verificado por Banco',
      preparing: 'En preparación',
      shipped: 'En camino',
      delivered: 'Entregado'
    };
    return map[s];
  }
}
