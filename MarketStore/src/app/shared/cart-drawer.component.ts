import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../core/services/market-state.service';
import { StoreOrder, TicketDenomination } from '../core/models/market.models';
import { SfSymbolComponent } from './sf-symbol.component';

type CheckoutStep = 'bag' | 'tickets' | 'verifying' | 'receipt';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  template: `
    @if (market.cartOpen()) {
      <div class="scrim" (click)="close()" role="presentation"></div>

      <aside class="drawer continuous" role="dialog" aria-modal="true" aria-label="Bolsa de compras y pago con tickets">
        <div class="sheet-grabber" aria-hidden="true"></div>

        <!-- Cabecera del Sheet -->
        <header class="drawer-head">
          @if (step() === 'tickets') {
            <button class="nav-back apple-pressable" (click)="step.set('bag')">
              <sf-symbol name="chevron.left" [size]="16" [weight]="2.4" />
              <span>Bolsa</span>
            </button>
          } @else {
            <span></span>
          }

          <span class="drawer-title">
            @switch (step()) {
              @case ('bag') { Bolsa de Compras }
              @case ('tickets') { Pagar con Tickets }
              @case ('verifying') { Verificando Tickets }
              @case ('receipt') { Compra Verificada }
            }
          </span>

          <button class="sheet-close apple-pressable" aria-label="Cerrar" (click)="close()">
            <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
          </button>
        </header>

        <div class="drawer-body">
          <!-- PASO 1: ARTÍCULOS EN LA BOLSA -->
          @if (step() === 'bag') {
            @if (market.cart().length === 0) {
              <div class="empty-bag">
                <div class="empty-icon continuous">
                  <sf-symbol name="bag" [size]="32" />
                </div>
                <h3>Tu bolsa está vacía</h3>
                <p>Explora el catálogo y agrega productos para pagarlos con tus tickets electrónicos del Banco Central.</p>
              </div>
            } @else {
              <div class="bag-banner continuous">
                <sf-symbol name="shield.checkered" [size]="18" />
                <div>
                  <strong>Pago exclusivo con Tickets Bancarios</strong>
                  <span>Tus tickets de $50, $100, $200 y $500 se validan en tiempo real ante el Banco Central.</span>
                </div>
              </div>

              <div class="cart-list continuous">
                @for (item of market.cart(); track item.product.id) {
                  <div class="cart-item">
                    <div class="item-thumb continuous" [class]="'item-thumb continuous ' + item.product.surfaceClass">
                      <sf-symbol [name]="item.product.symbolName" [size]="24" />
                    </div>

                    <div class="item-info">
                      <h4>{{ item.product.title }}</h4>
                      <span class="item-sku mono">{{ item.product.sku }} · {{ item.product.sellerName }}</span>
                      <div class="item-price-row">
                        <strong class="item-price">
                          {{ item.product.price * item.quantity | currency: 'MXN' : 'symbol-narrow' }}
                        </strong>
                        <div class="qty-stepper">
                          <button type="button" class="step-btn apple-pressable" (click)="market.updateCartQuantity(item.product.id, -1)" aria-label="Disminuir cantidad">
                            <sf-symbol name="minus" [size]="12" [weight]="2.6" />
                          </button>
                          <span class="qty-num">{{ item.quantity }}</span>
                          <button type="button" class="step-btn apple-pressable" (click)="market.updateCartQuantity(item.product.id, 1)" aria-label="Aumentar cantidad">
                            <sf-symbol name="plus" [size]="12" [weight]="2.6" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>

              <!-- Resumen financiero -->
              <div class="summary-card continuous">
                <div class="sum-row">
                  <span>Subtotal ({{ market.cartCount() }} artículos)</span>
                  <span>{{ market.cartSubtotal() | currency: 'MXN' : 'symbol-narrow' }}</span>
                </div>
                <div class="sum-row">
                  <span>Envío Express Asegurado</span>
                  <span class="free-tag">Gratis</span>
                </div>
                <div class="sum-row">
                  <span>Verificación con Banco Central</span>
                  <span>Incluida</span>
                </div>
                <div class="sum-divider"></div>
                <div class="sum-row total-row">
                  <strong>Total a cubrir con Tickets</strong>
                  <strong>{{ market.cartSubtotal() | currency: 'MXN' : 'symbol-narrow' }} <small>MXN</small></strong>
                </div>
              </div>

              <button class="primary-cta continuous apple-pressable" (click)="goToTicketSelection()">
                <sf-symbol name="wallet.pass" [size]="20" [weight]="2" />
                <span>Seleccionar Tickets de Pago</span>
              </button>
            }
          }

          <!-- PASO 2: SELECCIÓN Y VERIFICACIÓN DE TICKETS ELECTRÓNICOS -->
          @if (step() === 'tickets') {
            <div class="coverage-card continuous" [class.is-covered]="isCovered()">
              <div class="cov-top">
                <div>
                  <span class="cov-label">TOTAL DEL PEDIDO</span>
                  <strong class="cov-total">{{ market.cartSubtotal() | currency: 'MXN' : 'symbol-narrow' }}</strong>
                </div>
                <div class="cov-right">
                  <span class="cov-label">CUBIERTO CON TICKETS</span>
                  <strong class="cov-paid" [class.ok]="isCovered()">
                    {{ totalSelectedAndCredit() | currency: 'MXN' : 'symbol-narrow' }}
                  </strong>
                </div>
              </div>

              <div class="cov-bar">
                <div class="cov-fill" [style.width.%]="coveragePercent()"></div>
              </div>

              <div class="cov-foot">
                @if (isCovered()) {
                  <span class="cov-status ok">
                    <sf-symbol name="checkmark.circle.fill" [size]="15" />
                    Monto cubierto ({{ selectedTicketIds().length }} ticket{{ selectedTicketIds().length === 1 ? '' : 's' }})
                    @if (projectedChange() > 0) {
                      · Cambio a favor: +{{ projectedChange() | currency: 'MXN' : 'symbol-narrow' }}
                    }
                  </span>
                } @else {
                  <span class="cov-status pending">
                    Faltan {{ missingAmount() | currency: 'MXN' : 'symbol-narrow' }} MXN por cubrir con tickets
                  </span>
                }
                <button type="button" class="auto-pick-btn apple-pressable" (click)="autoSelectOptimal()">
                  Auto-seleccionar
                </button>
              </div>
            </div>

            <!-- Lista de Tickets Activos en Bóveda WalletPay -->
            <div class="sec-head-inline">
              <span>Mis Tickets en WalletPay ({{ market.activeTickets().length }} disponibles)</span>
              <button type="button" class="link-btn" (click)="showManualInput.set(!showManualInput())">
                {{ showManualInput() ? 'Ocultar folio manual' : '+ Ingresar folio o adquirir' }}
              </button>
            </div>

            <!-- Panel desplegable para importar folio externo o emitir ticket rápido del Banco Central -->
            @if (showManualInput() || market.activeTickets().length === 0) {
              <div class="quick-bank-box continuous">
                <div class="qb-tabs">
                  <button
                    type="button"
                    class="qb-tab"
                    [class.active]="bankHelperMode() === 'mint'"
                    (click)="bankHelperMode.set('mint')"
                  >
                    Adquirir Ticket Rápido
                  </button>
                  <button
                    type="button"
                    class="qb-tab"
                    [class.active]="bankHelperMode() === 'folio'"
                    (click)="bankHelperMode.set('folio')"
                  >
                    Validar Folio TKT
                  </button>
                </div>

                @if (bankHelperMode() === 'mint') {
                  <p class="qb-desc">Adquiere al instante un ticket electrónico emitido por el Banco Central:</p>
                  <div class="denom-pills">
                    @for (amt of denominations; track amt) {
                      <button
                        type="button"
                        class="denom-pill continuous apple-pressable"
                        (click)="quickMintTicket(amt)"
                      >
                        <span>+{{ '$' + amt }}</span>
                        <small>MXN</small>
                      </button>
                    }
                  </div>
                } @else {
                  <p class="qb-desc">Ingresa el folio de seguridad de tu ticket de WalletPay:</p>
                  <div class="folio-form">
                    <input
                      type="text"
                      class="ios-input mono"
                      placeholder="Ej. TKT-8420-A1B2"
                      [(ngModel)]="manualFolio"
                    />
                    <select class="ios-select" [(ngModel)]="manualAmount">
                      <option [ngValue]="50">$50 MXN</option>
                      <option [ngValue]="100">$100 MXN</option>
                      <option [ngValue]="200">$200 MXN</option>
                      <option [ngValue]="500">$500 MXN</option>
                    </select>
                    <button type="button" class="folio-btn apple-pressable" (click)="importManualFolio()">
                      Verificar
                    </button>
                  </div>
                  @if (folioFeedback()) {
                    <span class="folio-msg">{{ folioFeedback() }}</span>
                  }
                }
              </div>
            }

            <div class="tickets-selector-list">
              @for (t of market.activeTickets(); track t.id) {
                <button
                  type="button"
                  class="mini-pass continuous apple-pressable"
                  [class]="'mini-pass continuous apple-pressable ' + t.colorClass"
                  [class.selected]="isTicketSelected(t.id)"
                  (click)="toggleTicket(t.id)"
                >
                  <div class="mp-left">
                    <div class="mp-issuer">
                      <sf-symbol name="building.columns" [size]="12" [weight]="2.2" />
                      <span>BANCO CENTRAL · {{ t.tier }}</span>
                    </div>
                    <div class="mp-amount">
                      <span class="cur">$</span>{{ t.amount }}<small>.00 MXN</small>
                    </div>
                    <span class="mp-serial mono">{{ t.id }} · Oficial</span>
                  </div>

                  <div class="mp-right">
                    <div class="emv-mini" [class.gold]="t.amount === 500"></div>
                    <span class="check-circle" [class.checked]="isTicketSelected(t.id)">
                      @if (isTicketSelected(t.id)) {
                        <sf-symbol name="checkmark" [size]="13" [weight]="2.8" />
                      }
                    </span>
                  </div>
                </button>
              }
            </div>

            @if (checkoutError()) {
              <p class="error-msg" role="alert">{{ checkoutError() }}</p>
            }

            <div class="pay-footer">
              <button
                type="button"
                class="pay-btn continuous apple-pressable"
                [disabled]="!isCovered()"
                (click)="confirmAndVerifyPurchase()"
              >
                <sf-symbol name="faceid" [size]="22" [weight]="2" />
                <span>Verificar con Banco y Pagar {{ market.cartSubtotal() | currency: 'MXN' : 'symbol-narrow' }}</span>
              </button>
              <p class="pay-caption">
                La tienda verificará la validez y autenticidad de tus tickets con el Banco Central antes de aceptar el cargo.
              </p>
            </div>
          }

          <!-- PASO 3: VERIFICACIÓN EN CURSO CON EL BANCO CENTRAL -->
          @if (step() === 'verifying') {
            <div class="verifying-stage">
              <div class="verify-orb continuous">
                <sf-symbol name="shield.checkered" [size]="42" />
              </div>
              <h3>Verificando validez con el Banco Central</h3>
              <p class="verify-status">{{ verificationStageText() }}</p>

              <div class="verify-steps continuous">
                <div class="v-step done">
                  <sf-symbol name="checkmark.circle.fill" [size]="18" />
                  <span>Lectura de folios y certificados de valor fijo</span>
                </div>
                <div class="v-step done">
                  <sf-symbol name="checkmark.circle.fill" [size]="18" />
                  <span>Comprobación de autenticidad e integridad del ticket</span>
                </div>
                <div class="v-step active">
                  <sf-symbol name="building.columns" [size]="18" />
                  <span>Autorización anti-doble-gasto del Banco Central</span>
                </div>
              </div>
            </div>
          }

          <!-- PASO 4: RECIBO DIGITAL VERIFICADO -->
          @if (step() === 'receipt' && completedOrder(); as ord) {
            <div class="receipt-stage">
              <div class="receipt-badge">
                <sf-symbol name="checkmark.seal.fill" [size]="54" />
              </div>
              <h3>Compra Aprobada</h3>
              <p class="receipt-sub">El Banco Central verificó y liquidó tus tickets electrónicos.</p>

              <div class="receipt-card continuous">
                <div class="rc-row">
                  <span>Folio de Orden</span>
                  <strong class="mono">#{{ ord.id }}</strong>
                </div>
                <div class="rc-row">
                  <span>Sello Bancario</span>
                  <strong class="mono ok-text">{{ ord.bankVerificationCode }}</strong>
                </div>
                <div class="rc-row">
                  <span>Tickets Canjeados</span>
                  <strong>{{ ord.ticketsUsed.length }} ({{ ord.totalPaidWithTickets | currency: 'MXN' : 'symbol-narrow' }})</strong>
                </div>
                <div class="rc-tickets-pills">
                  @for (tk of ord.ticketsUsed; track tk.id) {
                    <span class="rc-tk-pill mono">{{ tk.id }} ({{ '$' + tk.amount }})</span>
                  }
                </div>
                @if (ord.changeCredited > 0) {
                  <div class="rc-row">
                    <span>Saldo a favor acreditado</span>
                    <strong class="ok-text">+{{ ord.changeCredited | currency: 'MXN' : 'symbol-narrow' }}</strong>
                  </div>
                }
                <div class="sum-divider"></div>
                <div class="rc-row total">
                  <span>Total Pagado</span>
                  <strong>{{ ord.subtotal | currency: 'MXN' : 'symbol-narrow' }} MXN</strong>
                </div>
              </div>

              <div class="receipt-actions">
                <button type="button" class="primary-cta continuous apple-pressable" (click)="viewOrders()">
                  Ver en Mis Pedidos
                </button>
                <button type="button" class="secondary-cta continuous apple-pressable" (click)="close()">
                  Seguir explorando la tienda
                </button>
              </div>
            </div>
          }
        </div>
      </aside>
    }
  `,
  styles: [`
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 900;
      background: var(--ios-scrim);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      animation: fadeIn 200ms ease;
    }

    .drawer {
      --r: 28px;
      position: fixed;
      z-index: 910;
      right: 16px;
      top: 16px;
      bottom: 16px;
      width: min(460px, calc(100vw - 32px));
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideInRight 300ms cubic-bezier(0.2, 0.85, 0.2, 1);
    }

    .sheet-grabber {
      display: none;
      width: 38px;
      height: 5px;
      border-radius: 999px;
      background: var(--ios-label-3);
      margin: 8px auto 0;
    }

    @media (max-width: 767px) {
      .drawer {
        right: 0;
        left: 0;
        bottom: 0;
        top: auto;
        width: 100%;
        max-height: 90vh;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
        animation: slideUpSheet 300ms cubic-bezier(0.2, 0.85, 0.2, 1);
      }
      .sheet-grabber {
        display: block;
      }
    }

    .drawer-head {
      display: grid;
      grid-template-columns: 80px 1fr 80px;
      align-items: center;
      padding: 16px 20px 12px;
      border-bottom: 0.5px solid var(--ios-separator);
    }

    .drawer-head .sheet-close {
      justify-self: end;
    }

    .nav-back {
      border: 0;
      background: transparent;
      color: var(--ion-color-primary);
      font-size: 15px;
      font-weight: 600;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .drawer-title {
      text-align: center;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--ios-label);
    }

    .drawer-body {
      padding: 18px 20px calc(env(safe-area-inset-bottom, 0px) + 22px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex: 1;
    }

    .bag-banner {
      --r: 14px;
      padding: 12px 14px;
      background: rgba(0, 122, 255, 0.1);
      color: var(--ion-color-primary);
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .bag-banner div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bag-banner strong {
      font-size: 13px;
      font-weight: 600;
    }
    .bag-banner span {
      font-size: 12px;
      color: var(--ios-label-2);
      line-height: 1.35;
    }

    .cart-list {
      --r: 16px;
      background: var(--ios-sheet-cell);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .cart-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border-bottom: 0.5px solid var(--ios-separator);
    }
    .cart-item:last-child {
      border-bottom: 0;
    }

    .item-thumb {
      --r: 12px;
      width: 56px;
      height: 56px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ion-color-primary);
    }

    .item-info {
      flex: 1;
      min-width: 0;
    }
    .item-info h4 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--ios-label);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-sku {
      font-size: 11px;
      color: var(--ios-label-2);
    }
    .item-price-row {
      margin-top: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .item-price {
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .qty-stepper {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--ios-fill);
      padding: 3px 6px;
      border-radius: 999px;
    }
    .step-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 0;
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .qty-num {
      font-size: 13px;
      font-weight: 600;
      min-width: 16px;
      text-align: center;
    }

    .summary-card {
      --r: 16px;
      background: var(--ios-sheet-cell);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sum-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: var(--ios-label-2);
    }
    .free-tag {
      color: var(--ion-color-success);
      font-weight: 600;
    }
    .sum-divider {
      height: 0.5px;
      background: var(--ios-separator);
      margin: 4px 0;
    }
    .total-row {
      font-size: 17px;
      color: var(--ios-label);
    }

    .primary-cta {
      --r: 14px;
      width: 100%;
      height: 52px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .secondary-cta {
      --r: 14px;
      width: 100%;
      height: 48px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      font-size: 15px;
      font-weight: 600;
    }

    /* Paso 2: Cobertura de Tickets */
    .coverage-card {
      --r: 18px;
      background: var(--ios-sheet-cell);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cov-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .cov-right {
      text-align: right;
    }
    .cov-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .cov-total {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .cov-paid {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--ios-warning);
    }
    .cov-paid.ok {
      color: var(--ion-color-success);
    }
    .cov-bar {
      height: 6px;
      border-radius: 999px;
      background: var(--ios-fill);
      overflow: hidden;
    }
    .cov-fill {
      height: 100%;
      background: var(--ion-color-primary);
      transition: width 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .coverage-card.is-covered .cov-fill {
      background: var(--ion-color-success);
    }
    .cov-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .cov-status {
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--ios-label-2);
    }
    .cov-status.ok {
      color: var(--ion-color-success);
    }
    .auto-pick-btn {
      border: 0;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 999px;
    }

    .sec-head-inline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      color: var(--ios-label-2);
      padding: 0 4px;
    }
    .link-btn {
      border: 0;
      background: transparent;
      color: var(--ion-color-primary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }

    .quick-bank-box {
      --r: 16px;
      background: var(--ios-sheet-cell);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .qb-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--ios-fill);
      padding: 2px;
      border-radius: 9px;
    }
    .qb-tab {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 12px;
      font-weight: 600;
      padding: 6px;
      border-radius: 7px;
      cursor: pointer;
    }
    .qb-tab.active {
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }
    .qb-desc {
      margin: 0;
      font-size: 12px;
      color: var(--ios-label-2);
    }
    .denom-pills {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .denom-pill {
      --r: 10px;
      border: 0;
      padding: 8px 4px;
      background: rgba(0, 122, 255, 0.12);
      color: var(--ion-color-primary);
      display: flex;
      flex-direction: column;
      align-items: center;
      font-weight: 700;
      font-size: 14px;
    }
    .denom-pill small {
      font-size: 9px;
      opacity: 0.75;
    }

    .folio-form {
      display: flex;
      gap: 6px;
    }
    .ios-input,
    .ios-select {
      height: 36px;
      border-radius: 9px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-fill);
      color: var(--ios-label);
      padding: 0 10px;
      font-size: 13px;
    }
    .ios-input {
      flex: 1;
      min-width: 0;
    }
    .folio-btn {
      border: 0;
      border-radius: 9px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      padding: 0 12px;
    }
    .folio-msg {
      font-size: 11.5px;
      color: var(--ion-color-primary);
    }

    /* Mini Passes de selección de Tickets */
    .tickets-selector-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mini-pass {
      --r: 18px;
      width: 100%;
      border: 0;
      padding: 14px 16px;
      color: #fff;
      text-align: left;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
      box-shadow: var(--ios-shadow-card);
      opacity: 0.88;
      transition: transform 200ms ease, opacity 200ms ease, box-shadow 200ms ease;
    }
    .mini-pass.selected {
      opacity: 1;
      box-shadow: 0 0 0 2.5px var(--ion-color-primary), var(--ios-shadow-card);
    }
    .mp-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .mp-issuer {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      opacity: 0.9;
    }
    .mp-amount {
      font-size: 28px;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }
    .mp-amount .cur {
      font-size: 15px;
      vertical-align: super;
      margin-right: 1px;
    }
    .mp-amount small {
      font-size: 12px;
      font-weight: 600;
      margin-left: 4px;
      opacity: 0.85;
    }
    .mp-serial {
      font-size: 10.5px;
      opacity: 0.8;
    }
    .mp-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
    }
    .emv-mini {
      width: 26px;
      height: 19px;
      border-radius: 4px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.45));
    }
    .emv-mini.gold {
      background: linear-gradient(135deg, #FFE57F 0%, #D4AF37 60%, #AA7C11 100%);
    }
    .check-circle {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 1.8px solid rgba(255, 255, 255, 0.75);
      background: rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .check-circle.checked {
      background: #fff;
      border-color: #fff;
      color: #000;
    }

    .pay-footer {
      margin-top: auto;
      padding-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pay-btn {
      --r: 14px;
      width: 100%;
      height: 54px;
      border: 0;
      background: var(--ios-pay-bg);
      color: var(--ios-pay-fg);
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .pay-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .pay-caption {
      margin: 0;
      text-align: center;
      font-size: 11.5px;
      color: var(--ios-label-2);
      line-height: 1.35;
    }

    /* Paso 3 y 4: Verificación y Recibo */
    .verifying-stage,
    .receipt-stage {
      padding: 24px 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .verify-orb {
      --r: 22px;
      width: 76px;
      height: 76px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: pulseOrb 1.1s infinite alternate ease-in-out;
    }
    .verify-status {
      margin: 0;
      font-size: 14px;
      color: var(--ios-label-2);
    }
    .verify-steps {
      --r: 16px;
      width: 100%;
      margin-top: 12px;
      padding: 14px;
      background: var(--ios-sheet-cell);
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;
    }
    .v-step {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--ios-label-2);
    }
    .v-step.done {
      color: var(--ion-color-success);
      font-weight: 600;
    }
    .v-step.active {
      color: var(--ion-color-primary);
      font-weight: 600;
    }

    .receipt-badge {
      color: var(--ion-color-success);
    }
    .receipt-stage h3 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .receipt-sub {
      margin: 0;
      font-size: 14px;
      color: var(--ios-label-2);
    }
    .receipt-card {
      --r: 16px;
      width: 100%;
      background: var(--ios-sheet-cell);
      padding: 16px;
      margin: 8px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }
    .rc-row {
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
      color: var(--ios-label-2);
    }
    .rc-row strong {
      color: var(--ios-label);
    }
    .rc-row.total {
      font-size: 16px;
      color: var(--ios-label);
    }
    .ok-text {
      color: var(--ion-color-success) !important;
    }
    .rc-tickets-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .rc-tk-pill {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--ios-fill);
      color: var(--ios-label);
    }
    .receipt-actions {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .empty-bag {
      padding: 48px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .empty-icon {
      --r: 18px;
      width: 64px;
      height: 64px;
      background: var(--ios-fill);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .empty-bag h3 {
      margin: 6px 0 0;
      font-size: 19px;
    }
    .empty-bag p {
      margin: 0;
      font-size: 14px;
      color: var(--ios-label-2);
      max-width: 280px;
    }

    .error-msg {
      margin: 0;
      font-size: 13px;
      color: var(--ion-color-danger);
      text-align: center;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0.5; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideUpSheet {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes pulseOrb {
      from { transform: scale(0.95); }
      to { transform: scale(1.05); }
    }
  `]
})
export class CartDrawerComponent {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  readonly step = signal<CheckoutStep>('bag');
  readonly selectedTicketIds = signal<string[]>([]);
  readonly showManualInput = signal<boolean>(false);
  readonly bankHelperMode = signal<'mint' | 'folio'>('mint');
  readonly denominations: TicketDenomination[] = [50, 100, 200, 500];

  manualFolio = '';
  manualAmount: TicketDenomination = 100;
  readonly folioFeedback = signal<string>('');
  readonly checkoutError = signal<string>('');
  readonly verificationStageText = signal<string>('Conectando con Banco Central...');
  readonly completedOrder = signal<StoreOrder | null>(null);

  readonly selectedTicketsTotal = computed(() => {
    const ids = new Set(this.selectedTicketIds());
    return this.market
      .activeTickets()
      .filter((t) => ids.has(t.id))
      .reduce((acc, t) => acc + t.amount, 0);
  });

  readonly totalSelectedAndCredit = computed(
    () => this.selectedTicketsTotal() + this.market.storeCredit()
  );

  readonly isCovered = computed(
    () =>
      this.market.cartSubtotal() > 0 &&
      this.totalSelectedAndCredit() >= this.market.cartSubtotal()
  );

  readonly missingAmount = computed(() =>
    Math.max(0, this.market.cartSubtotal() - this.totalSelectedAndCredit())
  );

  readonly projectedChange = computed(() =>
    Math.max(0, this.totalSelectedAndCredit() - this.market.cartSubtotal())
  );

  readonly coveragePercent = computed(() => {
    const sub = this.market.cartSubtotal();
    if (sub <= 0) return 0;
    return Math.min(100, Math.round((this.totalSelectedAndCredit() / sub) * 100));
  });

  constructor() {
    effect(
      () => {
        if (!this.market.cartOpen()) {
          this.step.set('bag');
          this.checkoutError.set('');
        }
      },
      { allowSignalWrites: true }
    );
  }

  close(): void {
    if (this.step() === 'verifying') return;
    this.market.cartOpen.set(false);
  }

  goToTicketSelection(): void {
    this.market.haptic('light');
    this.autoSelectOptimal();
    this.step.set('tickets');
  }

  autoSelectOptimal(): void {
    const optimal = this.market.findOptimalTicketsForAmount(this.market.cartSubtotal());
    this.selectedTicketIds.set(optimal);
    this.checkoutError.set('');
  }

  isTicketSelected(id: string): boolean {
    return this.selectedTicketIds().includes(id);
  }

  toggleTicket(id: string): void {
    this.market.haptic('selection');
    this.checkoutError.set('');
    this.selectedTicketIds.update((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async quickMintTicket(amount: TicketDenomination): Promise<void> {
    const created = await this.market.acquireBankTicket(amount, 'Emisión Rápida en Checkout');
    this.selectedTicketIds.update((prev) => [...prev, created.id]);
  }

  async importManualFolio(): Promise<void> {
    const res = await this.market.importExternalTicketFolio(this.manualFolio, this.manualAmount);
    this.folioFeedback.set(res.message);
    if (res.ok && res.ticket) {
      this.manualFolio = '';
      this.selectedTicketIds.update((prev) =>
        prev.includes(res.ticket!.id) ? prev : [...prev, res.ticket!.id]
      );
    }
  }

  async confirmAndVerifyPurchase(): Promise<void> {
    this.checkoutError.set('');
    this.step.set('verifying');

    const result = await this.market.verifyAndCheckoutWithTickets(
      this.selectedTicketIds(),
      (stage) => this.verificationStageText.set(stage)
    );

    if (!result.ok || !result.order) {
      this.checkoutError.set(result.error || 'No se pudo verificar el ticket.');
      this.step.set('tickets');
      return;
    }

    this.completedOrder.set(result.order);
    this.selectedTicketIds.set([]);
    this.step.set('receipt');
  }

  viewOrders(): void {
    this.market.cartOpen.set(false);
    this.router.navigateByUrl('/orders');
  }
}
