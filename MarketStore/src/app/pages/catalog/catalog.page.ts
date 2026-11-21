import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../../core/services/market-state.service';
import { Product, ProductCategory } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  template: `
    <div class="page-container">
      <!-- HERO BANNER ESTILO APPLE STORE + RESUMEN DE BÓVEDA WALLETPAY -->
      <section class="hero-grid">
        <div class="hero-main continuous">
          <div class="hero-copy">
            <span class="eyebrow">TIENDA VIRTUAL · MODELO DE TICKETS BANCARIOS</span>
            <h1>Tus productos favoritos, pagados con Tickets de Valor Fijo.</h1>
            <p>
              Selecciona cualquier artículo del catálogo y liquida tu compra al instante con tus
              certificados de <strong>$50, $100, $200 y $500 MXN</strong> emitidos por el Banco Central.
            </p>
            <div class="hero-actions">
              <button type="button" class="hero-btn-primary continuous apple-pressable" (click)="goToWallet()">
                <sf-symbol name="wallet.pass" [size]="18" [weight]="2" />
                <span>Adquirir o Ver Tickets ({{ market.activeTickets().length }})</span>
              </button>
              <button type="button" class="hero-btn-secondary continuous apple-pressable" (click)="market.cartOpen.set(true)">
                <sf-symbol name="bag" [size]="18" />
                <span>Ver Bolsa ({{ market.cartCount() }})</span>
              </button>
            </div>
          </div>

          <!-- Tarjeta visual flotante de Ticket en el Hero -->
          <div class="hero-ticket-preview card-tier-100 continuous" aria-hidden="true">
            <div class="ht-top">
              <span class="ht-issuer">
                <sf-symbol name="building.columns" [size]="12" [weight]="2.2" />
                BANCO CENTRAL
              </span>
              <span class="ht-pill">VERIFICADO</span>
            </div>
            <div class="ht-amount">
              <span class="cur">$</span>100<span class="dec">.00</span>
              <small>MXN</small>
            </div>
            <div class="ht-foot">
              <span class="mono">•••• 4410 C3B9</span>
              <span class="ht-chip"></span>
            </div>
          </div>
        </div>

        <!-- Tarjeta lateral de Saldo Disponible sincronizado con WalletPay (Consistencia 1:1) -->
        <aside class="vault-summary-card continuous">
          <div class="vs-top">
            <span class="vs-label">Poder de compra en WalletPay</span>
            <span class="vs-amount">
              {{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }}<small>MXN</small>
            </span>
            @if (market.storeCredit() > 0) {
              <span class="vs-credit">
                Incluye {{ market.storeCredit() | currency: 'MXN' : 'symbol-narrow' }} de saldo a favor
              </span>
            }
          </div>

          <div class="vs-mini-tickets">
            @for (t of market.activeTickets().slice(0, 4); track t.id) {
              <span class="vs-tk-chip continuous" [class]="'vs-tk-chip continuous ' + t.colorClass">
                {{ '$' + t.amount }}
              </span>
            }
            @if (market.activeTickets().length === 0) {
              <span class="vs-empty">Sin tickets activos</span>
            }
          </div>

          <button type="button" class="vs-cta continuous apple-pressable" (click)="goToWallet()">
            <span>Administrar Bóveda de Tickets</span>
            <sf-symbol name="chevron.right" [size]="14" [weight]="2.4" />
          </button>
        </aside>
      </section>

      <!-- BARRA DE BÚSQUEDA Y FILTROS ESTILO iOS -->
      <section class="controls-bar">
        <div class="search-box continuous">
          <sf-symbol name="magnifyingglass" [size]="18" />
          <input
            type="search"
            placeholder="Buscar productos, accesorios MagSafe, audio o SKU..."
            [(ngModel)]="searchQuery"
          />
          @if (searchQuery()) {
            <button type="button" class="clear-btn" (click)="searchQuery.set('')" aria-label="Limpiar búsqueda">
              <sf-symbol name="xmark" [size]="12" [weight]="2.6" />
            </button>
          }
        </div>

        <div class="filter-toggle-wrap">
          <button
            type="button"
            class="afford-pill continuous apple-pressable"
            [class.active]="onlyAffordable()"
            (click)="toggleAffordable()"
          >
            <sf-symbol name="checkmark.seal.fill" [size]="15" />
            <span>Alcanza con mis tickets ({{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }})</span>
          </button>
        </div>
      </section>

      <!-- PÍLDORAS DE CATEGORÍAS -->
      <div class="categories-scroll" role="tablist" aria-label="Categorías de productos">
        @for (cat of categories; track cat.id) {
          <button
            type="button"
            role="tab"
            class="cat-pill continuous apple-pressable"
            [class.active]="selectedCategory() === cat.id"
            (click)="selectCategory(cat.id)"
          >
            <sf-symbol [name]="cat.icon" [size]="15" />
            <span>{{ cat.label }}</span>
          </button>
        }
      </div>

      <!-- ENCABEZADO DE SECCIÓN -->
      <header class="catalog-head">
        <div>
          <h2>Catálogo de la Tienda</h2>
          <p>{{ filteredProducts().length }} productos verificados listos para canje con tickets bancarios</p>
        </div>
      </header>

      <!-- GRID RESPONSIVE DE PRODUCTOS -->
      @if (filteredProducts().length === 0) {
        <div class="empty-catalog continuous">
          <sf-symbol name="magnifyingglass" [size]="36" />
          <h3>No encontramos productos con ese filtro</h3>
          <p>Intenta cambiar la categoría o desactivar el filtro de saldo actual.</p>
          <button type="button" class="reset-btn continuous apple-pressable" (click)="resetFilters()">
            Mostrar todo el catálogo
          </button>
        </div>
      } @else {
        <div class="product-grid">
          @for (p of filteredProducts(); track p.id) {
            <article class="product-card continuous">
              <!-- Cabecera visual del producto -->
              <div
                class="prod-visual continuous apple-pressable"
                [class]="'prod-visual continuous apple-pressable ' + p.surfaceClass"
                (click)="openDetail(p)"
              >
                <div class="pv-top">
                  <span class="ticket-rec-pill">
                    <sf-symbol name="ticket" [size]="12" [weight]="2.2" />
                    {{ p.badge }}
                  </span>
                  <span class="rating-pill">
                    <sf-symbol name="star.fill" [size]="11" />
                    {{ p.rating }}
                  </span>
                </div>

                <div class="pv-glyph" [style.color]="p.accentColor">
                  <sf-symbol [name]="p.symbolName" [size]="54" [weight]="1.6" />
                </div>

                <div class="pv-bottom">
                  <span class="cat-tag">{{ p.categoryLabel }}</span>
                  <span class="stock-tag" [class.low]="p.stock <= 5">
                    {{ p.stock > 0 ? p.stock + ' disp.' : 'Agotado' }}
                  </span>
                </div>
              </div>

              <!-- Cuerpo del producto -->
              <div class="prod-body">
                <div class="prod-copy" (click)="openDetail(p)">
                  <h3>{{ p.title }}</h3>
                  <p>{{ p.subtitle }}</p>
                </div>

                <div class="prod-footer">
                  <div class="price-block">
                    <span class="price-label">PRECIO EN TICKETS</span>
                    <strong class="price-val">
                      {{ p.price | currency: 'MXN' : 'symbol-narrow' }}<small>MXN</small>
                    </strong>
                  </div>

                  <div class="card-btns">
                    <button
                      type="button"
                      class="btn-quick-buy continuous apple-pressable"
                      [disabled]="p.stock <= 0"
                      (click)="buyNowWithTicket(p)"
                      title="Comprar ahora con Ticket"
                    >
                      <sf-symbol name="wallet.pass" [size]="16" />
                      <span>Canjear</span>
                    </button>
                    <button
                      type="button"
                      class="btn-add-bag continuous apple-pressable"
                      [disabled]="p.stock <= 0"
                      (click)="addToBag(p)"
                      aria-label="Agregar a la bolsa"
                    >
                      <sf-symbol name="plus" [size]="17" [weight]="2.5" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          }
        </div>
      }

      <!-- MODAL / SHEET DE DETALLE DE PRODUCTO ESTILO iOS -->
      @if (selectedProduct(); as prod) {
        <div class="modal-scrim" (click)="selectedProduct.set(null)" role="presentation"></div>
        <div class="detail-sheet continuous" role="dialog" aria-modal="true">
          <div class="sheet-head">
            <span class="sheet-title">Detalle del Producto</span>
            <button type="button" class="sheet-close apple-pressable" (click)="selectedProduct.set(null)">
              <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
            </button>
          </div>

          <div class="detail-content">
            <div class="detail-visual continuous" [class]="'detail-visual continuous ' + prod.surfaceClass">
              <div class="dv-glyph" [style.color]="prod.accentColor">
                <sf-symbol [name]="prod.symbolName" [size]="68" [weight]="1.6" />
              </div>
              <div class="dv-badges">
                <span class="dv-badge">{{ prod.categoryLabel }}</span>
                <span class="dv-badge mono">{{ prod.sku }}</span>
                <span class="dv-badge">★ {{ prod.rating }} ({{ prod.reviewsCount }} reseñas)</span>
              </div>
            </div>

            <div class="detail-info">
              <h2>{{ prod.title }}</h2>
              <p class="detail-desc">{{ prod.description }}</p>

              <!-- Equivalencia sugerida en Tickets del Banco Central -->
              <div class="ticket-match-box continuous">
                <span class="tm-label">COMBINACIÓN SUGERIDA DE TICKETS BANCARIOS</span>
                <div class="tm-pills">
                  @for (denom of prod.recommendedTickets; track $index) {
                    <span class="tm-ticket continuous" [class]="'tm-ticket continuous card-tier-' + denom">
                      <sf-symbol name="ticket" [size]="13" />
                      Ticket de {{ '$' + denom }} MXN
                    </span>
                  }
                </div>
              </div>

              <!-- Especificaciones en lista agrupada iOS -->
              <div class="specs-list continuous">
                @for (spec of prod.specs; track spec) {
                  <div class="spec-item">
                    <sf-symbol name="checkmark.circle.fill" [size]="16" />
                    <span>{{ spec }}</span>
                  </div>
                }
                <div class="spec-item">
                  <sf-symbol name="shield.checkered" [size]="16" />
                  <span>Vendido por <strong>{{ prod.sellerName }}</strong> · Garantía y verificación bancaria</span>
                </div>
              </div>

              <div class="detail-cta-row">
                <div class="detail-price">
                  <span>Total</span>
                  <strong>{{ prod.price | currency: 'MXN' : 'symbol-narrow' }} <small>MXN</small></strong>
                </div>
                <div class="detail-btns">
                  <button
                    type="button"
                    class="btn-secondary continuous apple-pressable"
                    (click)="addToBag(prod); selectedProduct.set(null)"
                  >
                    Agregar a la Bolsa
                  </button>
                  <button
                    type="button"
                    class="btn-primary continuous apple-pressable"
                    (click)="buyNowWithTicket(prod); selectedProduct.set(null)"
                  >
                    <sf-symbol name="wallet.pass" [size]="18" />
                    <span>Pagar con Ticket</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 96px);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Hero Grid */
    .hero-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 18px;
      align-items: stretch;
    }

    .hero-main {
      --r: 26px;
      padding: 28px 30px;
      background:
        radial-gradient(90% 90% at 95% 10%, rgba(0, 122, 255, 0.16) 0%, transparent 60%),
        var(--ios-cell);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      overflow: hidden;
    }

    .hero-copy {
      max-width: 540px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .eyebrow {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ion-color-primary);
    }

    .hero-copy h1 {
      margin: 0;
      font-size: clamp(24px, 2.8vw, 34px);
      font-weight: 800;
      line-height: 1.08;
      letter-spacing: -0.03em;
      color: var(--ios-label);
    }

    .hero-copy p {
      margin: 0;
      font-size: 15px;
      line-height: 1.42;
      color: var(--ios-label-2);
    }

    .hero-actions {
      margin-top: 6px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .hero-btn-primary {
      --r: 13px;
      height: 44px;
      padding: 0 18px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .hero-btn-secondary {
      --r: 13px;
      height: 44px;
      padding: 0 16px;
      border: 0;
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    /* Tarjeta decorativa de Ticket en el Hero */
    .hero-ticket-preview {
      --r: 20px;
      width: 230px;
      flex-shrink: 0;
      padding: 16px 18px;
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      box-shadow: var(--ios-shadow-card);
      transform: rotate(-2deg);
    }
    .ht-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
    }
    .ht-issuer {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ht-pill {
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.22);
    }
    .ht-amount {
      font-size: 38px;
      font-weight: 800;
      line-height: 0.95;
      letter-spacing: -0.04em;
    }
    .ht-amount .cur {
      font-size: 18px;
      vertical-align: super;
    }
    .ht-amount .dec {
      font-size: 16px;
      opacity: 0.85;
    }
    .ht-amount small {
      font-size: 12px;
      margin-left: 4px;
      opacity: 0.85;
    }
    .ht-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10.5px;
      opacity: 0.88;
    }
    .ht-chip {
      width: 24px;
      height: 17px;
      border-radius: 3.5px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.45));
    }

    /* Resumen de Bóveda lateral */
    .vault-summary-card {
      --r: 26px;
      padding: 22px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    }
    .vs-top {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .vs-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--ios-label-2);
    }
    .vs-amount {
      font-size: 34px;
      font-weight: 800;
      letter-spacing: -0.035em;
      font-variant-numeric: tabular-nums;
      color: var(--ios-label);
    }
    .vs-amount small {
      margin-left: 4px;
      font-size: 14px;
      font-weight: 600;
      color: var(--ios-label-2);
    }
    .vs-credit {
      font-size: 12px;
      font-weight: 600;
      color: var(--ion-color-success);
    }
    .vs-mini-tickets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .vs-tk-chip {
      --r: 8px;
      padding: 5px 10px;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16);
    }
    .vs-empty {
      font-size: 12.5px;
      color: var(--ios-label-2);
    }
    .vs-cta {
      --r: 12px;
      height: 40px;
      padding: 0 14px;
      border: 0;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Buscador y filtros */
    .controls-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .search-box {
      --r: 14px;
      flex: 1;
      min-width: 260px;
      height: 44px;
      padding: 0 14px;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .search-box input {
      flex: 1;
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 15px;
      outline: none;
    }
    .clear-btn {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 0;
      background: var(--ios-fill-2);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }

    .afford-pill {
      --r: 14px;
      height: 44px;
      padding: 0 15px;
      border: 0;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .afford-pill.active {
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }

    /* Píldoras de categorías */
    .categories-scroll {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
    }
    .categories-scroll::-webkit-scrollbar {
      display: none;
    }

    .cat-pill {
      --r: 999px;
      height: 38px;
      padding: 0 16px;
      border: 0;
      flex-shrink: 0;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-size: 13.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .cat-pill.active {
      background: var(--ion-color-primary);
      color: #fff;
      box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
    }

    .catalog-head h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .catalog-head p {
      margin: 2px 0 0;
      font-size: 14px;
      color: var(--ios-label-2);
    }

    /* Grid de Productos */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(276px, 1fr));
      gap: 18px;
    }

    .product-card {
      --r: 24px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-card);
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .product-card:hover {
      transform: translateY(-2px);
    }

    .prod-visual {
      --r: 18px;
      height: 178px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }

    .pv-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .ticket-rec-pill {
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--ios-sheet-cell);
      color: var(--ion-color-primary);
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    }
    .rating-pill {
      padding: 3px 8px;
      border-radius: 999px;
      background: var(--ios-sheet-cell);
      color: #F59E0B;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .pv-glyph {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: auto 0;
    }

    .pv-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      color: var(--ios-label-2);
    }
    .stock-tag.low {
      color: var(--ios-warning);
    }

    .prod-body {
      padding: 0 4px 4px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      flex: 1;
    }
    .prod-copy {
      cursor: pointer;
    }
    .prod-copy h3 {
      margin: 0 0 4px;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: var(--ios-label);
    }
    .prod-copy p {
      margin: 0;
      font-size: 13px;
      line-height: 1.35;
      color: var(--ios-label-2);
    }

    .prod-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8px;
      padding-top: 10px;
      border-top: 0.5px solid var(--ios-separator);
    }
    .price-label {
      display: block;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .price-val {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      color: var(--ios-label);
    }
    .price-val small {
      font-size: 11px;
      font-weight: 600;
      margin-left: 3px;
      color: var(--ios-label-2);
    }

    .card-btns {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-quick-buy {
      --r: 11px;
      height: 36px;
      padding: 0 12px;
      border: 0;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .btn-add-bag {
      --r: 11px;
      width: 36px;
      height: 36px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    /* Empty state */
    .empty-catalog {
      --r: 22px;
      padding: 48px 24px;
      background: var(--ios-cell);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: var(--ios-label-2);
    }
    .empty-catalog h3 {
      margin: 4px 0 0;
      color: var(--ios-label);
    }
    .reset-btn {
      --r: 12px;
      margin-top: 8px;
      padding: 10px 18px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
    }

    /* Modal de Detalle */
    .modal-scrim {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: var(--ios-scrim);
      -webkit-backdrop-filter: blur(5px);
      backdrop-filter: blur(5px);
    }
    .detail-sheet {
      --r: 28px;
      position: fixed;
      z-index: 810;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 28px));
      max-height: 88vh;
      overflow-y: auto;
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      padding-bottom: 20px;
    }
    .detail-content {
      padding: 6px 20px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .detail-visual {
      --r: 20px;
      padding: 28px 18px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
    }
    .dv-badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px;
    }
    .dv-badge {
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--ios-sheet-cell);
      font-size: 11.5px;
      font-weight: 600;
      color: var(--ios-label-2);
    }
    .detail-info h2 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .detail-desc {
      margin: 0 0 14px;
      font-size: 14.5px;
      line-height: 1.45;
      color: var(--ios-label-2);
    }
    .ticket-match-box {
      --r: 14px;
      padding: 12px 14px;
      background: var(--ios-sheet-cell);
      margin-bottom: 12px;
    }
    .tm-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
      margin-bottom: 8px;
    }
    .tm-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tm-ticket {
      --r: 9px;
      padding: 6px 12px;
      color: #fff;
      font-size: 12.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .specs-list {
      --r: 14px;
      background: var(--ios-sheet-cell);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .spec-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      color: var(--ios-label);
    }
    .spec-item sf-symbol {
      color: var(--ion-color-success);
    }
    .detail-cta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .detail-price span {
      display: block;
      font-size: 11px;
      color: var(--ios-label-2);
    }
    .detail-price strong {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .detail-btns {
      display: flex;
      gap: 8px;
    }
    .btn-secondary {
      --r: 12px;
      height: 46px;
      padding: 0 16px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      font-size: 14px;
      font-weight: 600;
    }
    .btn-primary {
      --r: 12px;
      height: 46px;
      padding: 0 18px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 980px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }
      .hero-ticket-preview {
        display: none;
      }
    }
  `]
})
export class CatalogPage {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  readonly searchQuery = this.market.searchQuery;
  readonly selectedCategory = this.market.selectedCategory;
  readonly onlyAffordable = this.market.onlyAffordable;
  readonly selectedProduct = signal<Product | null>(null);

  readonly categories: { id: ProductCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'Todos', icon: 'storefront' },
    { id: 'magsafe', label: 'Accesorios MagSafe', icon: 'bolt.fill' },
    { id: 'audio', label: 'Audio y Música', icon: 'headphones' },
    { id: 'hogar', label: 'Hogar Inteligente', icon: 'speaker.wave.2' },
    { id: 'estudio', label: 'Cómputo y Estudio', icon: 'laptopcomputer' },
    { id: 'digital', label: 'Tarjetas y Digital', icon: 'shield.checkered' }
  ];

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();
    const afford = this.onlyAffordable();
    const maxPower = this.market.totalPurchasingPower();

    return this.market.activeProducts().filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (afford && p.price > maxPower) return false;
      if (
        q &&
        !p.title.toLowerCase().includes(q) &&
        !p.subtitle.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  });

  selectCategory(cat: ProductCategory): void {
    this.market.haptic('selection');
    this.selectedCategory.set(cat);
  }

  toggleAffordable(): void {
    this.market.haptic('selection');
    this.onlyAffordable.update((v) => !v);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('all');
    this.onlyAffordable.set(false);
  }

  openDetail(p: Product): void {
    this.market.haptic('light');
    this.selectedProduct.set(p);
  }

  addToBag(p: Product): void {
    this.market.addToCart(p, 1, false);
  }

  buyNowWithTicket(p: Product): void {
    this.market.addToCart(p, 1, true);
  }

  goToWallet(): void {
    this.router.navigateByUrl('/wallet');
  }
}
