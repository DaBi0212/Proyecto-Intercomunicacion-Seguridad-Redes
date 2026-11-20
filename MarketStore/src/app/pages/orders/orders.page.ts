import { Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MarketStateService } from '../../core/services/market-state.service';
import { OrderStatus } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CurrencyPipe, SfSymbolComponent],
  template: `
    <div class="page-container">
      <header class="page-head">
        <div>
          <span class="eyebrow">HISTORIAL AUDITABLE · BANCO CENTRAL</span>
          <h1>Pedidos y Actividad de Tickets</h1>
          <p>Cada compra registra el sello de autorización de los tickets validados ante el Banco Central.</p>
        </div>
      </header>

      <!-- Resumen estilo HistoryPage de WalletPay -->
      <section class="summary-grid">
        <div class="summary-cell continuous">
          <span class="sum-label">Saldo Disponible en Tickets</span>
          <strong class="sum-value is-buy">
            {{ market.availableTicketBalance() | currency: 'MXN' : 'symbol-narrow' }}
          </strong>
        </div>

        <div class="summary-cell continuous">
          <span class="sum-label">Total Canjeado en Tienda</span>
          <strong class="sum-value">
            {{ market.totalSellerRevenue() | currency: 'MXN' : 'symbol-narrow' }}
          </strong>
        </div>

        <div class="summary-cell continuous">
          <span class="sum-label">Tickets Verificados</span>
          <strong class="sum-value">
            {{ market.totalVerifiedTicketsCount() }} certificados
          </strong>
        </div>
      </section>

      <div class="split-columns">
        <!-- Columna izquierda: Órdenes y Tickets aplicados -->
        <section class="orders-col">
          <h2 class="sec-title">Órdenes liquidadas con Tickets ({{ market.orders().length }})</h2>

          <div class="orders-list">
            @for (ord of market.orders(); track ord.id) {
              <article class="order-card continuous">
                <header class="oc-head">
                  <div class="oc-id-block">
                    <span class="oc-icon continuous">
                      <sf-symbol name="bag.fill" [size]="18" />
                    </span>
                    <div>
                      <strong class="mono">#{{ ord.id }}</strong>
                      <span>{{ ord.createdAt }} · {{ ord.buyerName }}</span>
                    </div>
                  </div>

                  <span class="status-badge" [attr.data-status]="ord.status">
                    {{ statusLabel(ord.status) }}
                  </span>
                </header>

                <!-- Artículos comprados -->
                <div class="oc-items">
                  @for (it of ord.items; track it.productId) {
                    <div class="oc-item-row">
                      <span class="it-name">{{ it.quantity }}× {{ it.title }}</span>
                      <strong class="it-price">{{ it.unitPrice * it.quantity | currency: 'MXN' : 'symbol-narrow' }}</strong>
                    </div>
                  }
                </div>

                <!-- Certificados Bancarios utilizados en la orden -->
                <div class="oc-tickets-box continuous">
                  <div class="oct-head">
                    <span>
                      <sf-symbol name="checkmark.seal.fill" [size]="14" />
                      Tickets verificados por Banco Central
                    </span>
                    <span class="mono auth-code">{{ ord.bankVerificationCode }}</span>
                  </div>

                  <div class="oct-list">
                    @for (tk of ord.ticketsUsed; track tk.id) {
                      <div class="oct-pill">
                        <span class="tk-dot" [class]="'tk-dot ' + tk.colorClass"></span>
                        <strong class="mono">{{ tk.id }}</strong>
                        <span>Ticket {{ tk.tier }} ({{ '$' + tk.amount }})</span>
                        <small class="mono">{{ tk.signatureHash.slice(0, 20) }}…</small>
                      </div>
                    }
                  </div>
                </div>

                <footer class="oc-foot">
                  <span>Total liquidado con tickets: <strong>{{ ord.totalPaidWithTickets | currency: 'MXN' : 'symbol-narrow' }}</strong></span>
                  <strong class="oc-total">Total orden: {{ ord.subtotal | currency: 'MXN' : 'symbol-narrow' }} MXN</strong>
                </footer>
              </article>
            }
          </div>
        </section>

        <!-- Columna derecha: Bitácora de Seguridad y Verificación -->
        <aside class="audit-col">
          <h2 class="sec-title">Bitácora de Operaciones y Seguridad</h2>

          <div class="audit-card continuous">
            <div class="security-pills">
              <span class="sec-pill">
                <sf-symbol name="lock.fill" [size]="12" />
                Sesión Protegida
              </span>
              <span class="sec-pill">
                <sf-symbol name="shield.checkered" [size]="12" />
                Verificación Bancaria Activa
              </span>
            </div>

            <div class="log-items">
              @for (log of market.auditLogs(); track $index) {
                <div class="log-row">
                  <span class="log-time mono">{{ log.time }}</span>
                  <span class="log-cat" [attr.data-cat]="log.category">{{ log.category.toUpperCase() }}</span>
                  <p class="log-msg">{{ log.message }}</p>
                </div>
              }
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 20px calc(env(safe-area-inset-bottom, 0px) + 96px);
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .eyebrow {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ion-color-primary);
    }
    .page-head h1 {
      margin: 4px 0 6px;
      font-size: clamp(26px, 3vw, 34px);
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .page-head p {
      margin: 0;
      font-size: 14.5px;
      color: var(--ios-label-2);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }
    .summary-cell {
      --r: 18px;
      padding: 16px 18px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sum-label {
      font-size: 13px;
      color: var(--ios-label-2);
    }
    .sum-value {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      color: var(--ios-label);
    }
    .sum-value.is-buy {
      color: var(--ion-color-success);
    }

    .split-columns {
      display: grid;
      grid-template-columns: 1.35fr 0.65fr;
      gap: 22px;
      align-items: start;
    }

    .sec-title {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.015em;
    }

    .orders-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .order-card {
      --r: 22px;
      padding: 18px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-card);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .oc-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .oc-id-block {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .oc-icon {
      --r: 11px;
      width: 38px;
      height: 38px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .oc-id-block strong {
      display: block;
      font-size: 16px;
    }
    .oc-id-block span {
      font-size: 12.5px;
      color: var(--ios-label-2);
    }

    .status-badge {
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }
    .status-badge[data-status='preparing'] {
      background: rgba(255, 149, 0, 0.16);
      color: var(--ios-warning);
    }
    .status-badge[data-status='shipped'] {
      background: rgba(0, 122, 255, 0.16);
      color: var(--ion-color-primary);
    }

    .oc-items {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 0;
      border-top: 0.5px solid var(--ios-separator);
      border-bottom: 0.5px solid var(--ios-separator);
    }
    .oc-item-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
    }

    .oc-tickets-box {
      --r: 14px;
      padding: 12px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .oct-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      color: var(--ion-color-success);
    }
    .oct-head span:first-child {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .auth-code {
      font-size: 11px;
      color: var(--ios-label-2);
    }

    .oct-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .oct-pill {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 7px 10px;
      border-radius: 10px;
      background: var(--ios-sheet-cell);
      font-size: 12px;
    }
    .tk-dot {
      width: 12px;
      height: 12px;
      border-radius: 4px;
    }
    .oct-pill small {
      margin-left: auto;
      font-size: 10.5px;
      color: var(--ios-label-2);
    }

    .oc-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: var(--ios-label-2);
    }
    .oc-total {
      font-size: 16px;
      color: var(--ios-label);
    }

    /* Bitácora de Seguridad */
    .audit-card {
      --r: 22px;
      padding: 16px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .security-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .sec-pill {
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--ios-sheet-cell);
      font-size: 11px;
      font-weight: 600;
      color: var(--ion-color-primary);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .log-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .log-row {
      padding: 10px;
      border-radius: 12px;
      background: var(--ios-sheet-cell);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .log-time {
      font-size: 11px;
      color: var(--ios-label-2);
    }
    .log-cat {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 5px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
    }
    .log-cat[data-cat='bank'] {
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }
    .log-cat[data-cat='warn'] {
      background: rgba(255, 59, 48, 0.16);
      color: var(--ion-color-danger);
    }
    .log-msg {
      width: 100%;
      margin: 2px 0 0;
      font-size: 12.5px;
      line-height: 1.35;
      color: var(--ios-label);
    }

    @media (max-width: 960px) {
      .split-columns {
        grid-template-columns: 1fr;
      }
    }
  `]
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
