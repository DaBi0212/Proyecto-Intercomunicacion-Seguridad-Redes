import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../../core/services/market-state.service';
import { Product, ProductCategory, TicketDenomination } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  template: `
    <div class="ne-storefront">
      <!-- ==========================================================================
           1. PÍLDORAS RÁPIDAS DE COLECCIÓN (DESLIZABLES EN MÓVIL Y ESCRITORIO)
           ========================================================================== -->
      <div class="ne-categories-scroll" role="tablist" aria-label="Colecciones Market Store">
        @for (cat of categories; track cat.id) {
          <button
            type="button"
            role="tab"
            class="ne-cat-pill continuous apple-pressable"
            [class.active]="selectedCategory() === cat.id"
            (click)="selectCategory(cat.id)"
          >
            <sf-symbol [name]="cat.icon" [size]="14" />
            <span>{{ cat.label }}</span>
          </button>
        }
      </div>

      <!-- ==========================================================================
           2. ENCABEZADO CENTRADO + BARRA "FILTRAR | X PRODUCTOS | [2x2] [1x1]"
              (DISPOSICIÓN Y ORGANIZACIÓN 1:1 CON LA IMAGEN DE REFERENCIA DE NEW ERA)
           ========================================================================== -->
      <header class="ne-collection-header">
        <h1 class="ne-collection-title">{{ activeCategoryTitle() }}</h1>

        <div class="ne-control-bar">
          <!-- Izquierda: Botón Filtrar con icono de controles deslizantes -->
          <button
            type="button"
            class="ne-filter-trigger apple-pressable"
            [class.active]="filterDrawerOpen() || hasActiveFilters()"
            (click)="filterDrawerOpen.update((v) => !v)"
          >
            <svg class="ne-sliders-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <circle cx="9" cy="7" r="2.3" fill="var(--ion-background-color)" />
              <line x1="4" y1="17" x2="20" y2="17" />
              <circle cx="15" cy="17" r="2.3" fill="var(--ion-background-color)" />
            </svg>
            <span>Filtrar</span>
            @if (activeFiltersCount() > 0) {
              <span class="ne-filter-count">{{ activeFiltersCount() }}</span>
            }
          </button>

          <!-- Centro: Contador de productos -->
          <span class="ne-products-count">{{ filteredProducts().length }} productos</span>

          <!-- Derecha: Selector de vista Cuadrícula (2x2) vs Columna única (1x1) idéntico a la imagen -->
          <div class="ne-view-switcher" role="group" aria-label="Cambiar disposición de cuadrícula">
            <button
              type="button"
              class="ne-view-btn apple-pressable"
              [class.active]="gridMode() === 'multi'"
              (click)="gridMode.set('multi')"
              aria-label="Vista de 2 columnas en móvil y 4 en escritorio"
              title="Vista cuadrícula"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
                <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
                <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
                <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              class="ne-view-btn apple-pressable"
              [class.active]="gridMode() === 'single'"
              (click)="gridMode.set('single')"
              aria-label="Vista de 1 columna amplia"
              title="Vista ampliada"
            >
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                <rect x="2.5" y="2.5" width="15" height="15" rx="1.4" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Chips de filtros activos (si el usuario aplicó algún filtro) -->
        @if (hasActiveFilters()) {
          <div class="ne-active-chips">
            @if (onlyAffordable()) {
              <button type="button" class="ne-chip continuous" (click)="toggleAffordable()">
                <span>Alcanza con mi saldo ({{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }})</span>
                <sf-symbol name="xmark" [size]="10" [weight]="2.6" />
              </button>
            }
            @if (selectedDenom(); as d) {
              <button type="button" class="ne-chip continuous" (click)="selectDenom(null)">
                <span>Ticket {{ '$' + d }} MXN</span>
                <sf-symbol name="xmark" [size]="10" [weight]="2.6" />
              </button>
            }
            @if (onlyInStock()) {
              <button type="button" class="ne-chip continuous" (click)="onlyInStock.set(false)">
                <span>En existencia</span>
                <sf-symbol name="xmark" [size]="10" [weight]="2.6" />
              </button>
            }
            <button type="button" class="ne-chip-reset" (click)="resetFilters()">
              Limpiar todo
            </button>
          </div>
        }
      </header>

      <!-- ==========================================================================
           3. DRAWER / SHEET DESPLEGABLE DE FILTROS Y ORDENAMIENTO (ESTILO iOS + NEW ERA)
           ========================================================================== -->
      @if (filterDrawerOpen()) {
        <div class="modal-scrim" (click)="filterDrawerOpen.set(false)" role="presentation"></div>
        <aside class="ne-filter-drawer continuous" role="dialog" aria-modal="true" aria-label="Filtros y ordenamiento">
          <div class="nfd-head">
            <div class="nfd-title-row">
              <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="nfd-logo" />
              <strong>Filtrar y Ordenar</strong>
            </div>
            <button type="button" class="sheet-close apple-pressable" (click)="filterDrawerOpen.set(false)">
              <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
            </button>
          </div>

          <div class="nfd-body">
            <!-- Ordenar por -->
            <div class="nfs-group">
              <div class="nfs-group-title">ORDENAR POR</div>
              <div class="nfs-sort-grid">
                @for (opt of sortOptions; track opt.id) {
                  <button
                    type="button"
                    class="nfs-sort-btn continuous apple-pressable"
                    [class.selected]="sortBy() === opt.id"
                    (click)="sortBy.set(opt.id)"
                  >
                    <span>{{ opt.label }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Poder de compra WalletPay -->
            <div class="nfs-group">
              <div class="nfs-group-title">PODER DE COMPRA WALLETPAY</div>
              <button
                type="button"
                class="nfs-afford-toggle continuous apple-pressable"
                [class.active]="onlyAffordable()"
                (click)="toggleAffordable()"
              >
                <div class="nat-copy">
                  <strong>Alcanza con mis tickets</strong>
                  <span>Saldo disponible: {{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} MXN</span>
                </div>
                <span class="ios-switch" [class.on]="onlyAffordable()">
                  <span class="ios-knob"></span>
                </span>
              </button>
            </div>

            <!-- Colección -->
            <div class="nfs-group">
              <div class="nfs-group-title">COLECCIÓN</div>
              <div class="nfs-list">
                @for (cat of categories; track cat.id) {
                  <button
                    type="button"
                    class="nfs-check-row apple-pressable"
                    [class.selected]="selectedCategory() === cat.id"
                    (click)="selectCategory(cat.id)"
                  >
                    <span class="nfs-radio" [class.checked]="selectedCategory() === cat.id"></span>
                    <span class="nfs-lbl">{{ cat.label }}</span>
                    <span class="nfs-badge">{{ getCategoryCount(cat.id) }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Silueta de Ticket -->
            <div class="nfs-group">
              <div class="nfs-group-title">DENOMINACIÓN DE TICKET</div>
              <div class="nfs-denom-grid">
                @for (d of ticketDenominations; track d.amount) {
                  <button
                    type="button"
                    class="nfs-denom-btn continuous apple-pressable"
                    [class.selected]="selectedDenom() === d.amount"
                    (click)="selectDenom(selectedDenom() === d.amount ? null : d.amount)"
                  >
                    <strong>{{ '$' + d.amount }} MXN</strong>
                    <span>Ticket {{ d.name }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Disponibilidad -->
            <div class="nfs-group">
              <div class="nfs-group-title">DISPONIBILIDAD</div>
              <button
                type="button"
                class="nfs-check-row apple-pressable"
                [class.selected]="onlyInStock()"
                (click)="onlyInStock.set(!onlyInStock())"
              >
                <span class="nfs-radio" [class.checked]="onlyInStock()"></span>
                <span class="nfs-lbl">Solo productos en existencia</span>
              </button>
            </div>
          </div>

          <div class="nfd-foot">
            <button type="button" class="nfd-clear continuous apple-pressable" (click)="resetFilters()">
              Limpiar
            </button>
            <button type="button" class="nfd-apply continuous apple-pressable" (click)="filterDrawerOpen.set(false)">
              Ver {{ filteredProducts().length }} productos
            </button>
          </div>
        </aside>
      }

      <!-- ==========================================================================
           4. CUADRÍCULA DE PRODUCTOS (DISPOSICIÓN 1:1 CON LA IMAGEN ADJUNTADA:
              2 COLUMNAS EN MÓVIL / 4 EN ESCRITORIO, IMAGEN + LÍNEA + TÍTULO + PRECIO + BOTÓN [+])
           ========================================================================== -->
      @if (filteredProducts().length === 0) {
        <div class="ne-empty-state continuous">
          <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="nes-logo" />
          <h3>No encontramos artículos con esos filtros</h3>
          <p>Prueba seleccionando otra categoría o restablece los filtros activos.</p>
          <button type="button" class="btn-primary continuous apple-pressable" (click)="resetFilters()">
            Mostrar todos los productos
          </button>
        </div>
      } @else {
        <section class="ne-product-grid" [class.single-col]="gridMode() === 'single'">
          @for (p of filteredProducts(); track p.id) {
            <article class="ne-card continuous">
              <!-- Contenedor visual del producto con icono/sello en esquina superior derecha -->
              <div
                class="ne-card-visual continuous apple-pressable"
                [class]="'ne-card-visual continuous apple-pressable ' + p.surfaceClass"
                (click)="openDetail(p)"
              >
                <span class="ne-corner-seal" title="Ver detalle del producto">
                  <img src="assets/logos/marketstore-icon.png" alt="Market Store" />
                </span>

                <div class="ne-card-glyph" [style.color]="p.accentColor">
                  <sf-symbol [name]="p.symbolName" [size]="52" [weight]="1.55" />
                </div>
              </div>

              <!-- Línea divisoria horizontal estilo New Era MX (debajo del producto) -->
              <div class="ne-card-Rule" aria-hidden="true">
                <span class="ne-card-rule-active"></span>
              </div>

              <!-- Cuerpo de tarjeta: Etiqueta superior + Título + Fila inferior (Precio a la izquierda y botón [+] a la derecha) -->
              <div class="ne-card-info">
                <span class="ne-card-eyebrow">{{ p.badge || p.categoryLabel }}</span>

                <h3 class="ne-card-title" (click)="openDetail(p)">
                  {{ p.title }}
                </h3>

                <div class="ne-card-bottom">
                  <strong class="ne-card-price">
                    {{ p.price | currency: 'MXN' : 'symbol-narrow' }}
                  </strong>

                  <button
                    type="button"
                    class="ne-plus-btn continuous apple-pressable"
                    [disabled]="p.stock <= 0"
                    (click)="buyNowWithTicket(p)"
                    [attr.aria-label]="'Agregar ' + p.title + ' a la bolsa'"
                    title="Canjear o agregar a la bolsa"
                  >
                    <sf-symbol name="plus" [size]="15" [weight]="2.4" />
                  </button>
                </div>
              </div>
            </article>
          }
        </section>
      }

      <!-- ==========================================================================
           5. FOOTER COMPACTO CON LAS 2 VARIANTES DEL LOGO DE MARKET STORE
           ========================================================================== -->
      <footer class="ne-footer continuous">
        <div class="nef-top">
          <div class="nef-brand-col">
            <div class="nef-logos-row">
              <img src="assets/logos/marketstore-horizontal.png" alt="Market Store" class="nef-logo-h" />
              <img src="assets/logos/marketstore-icon.png" alt="Market Store Icono" class="nef-logo-sq" />
            </div>
            <p>
              Tienda oficial sincronizada con la bóveda móvil <strong>WalletPay</strong> y validación automática del <strong>Banco Central</strong>.
            </p>
          </div>

          <div class="nef-links-col">
            <strong>COLECCIONES</strong>
            @for (cat of categories; track cat.id) {
              <button type="button" (click)="selectCategory(cat.id)">{{ cat.label }}</button>
            }
          </div>

          <div class="nef-links-col">
            <strong>TICKETS WALLETPAY</strong>
            @for (d of ticketDenominations; track d.amount) {
              <button type="button" (click)="selectDenom(d.amount)">
                Ticket {{ '$' + d.amount }} MXN · {{ d.name }}
              </button>
            }
          </div>

          <div class="nef-links-col">
            <strong>MI CUENTA</strong>
            <button type="button" (click)="goToWallet()">Mis Tickets ({{ market.activeTickets().length }})</button>
            <button type="button" (click)="market.cartOpen.set(true)">Bolsa de Compras ({{ market.cartCount() }})</button>
          </div>
        </div>
      </footer>

      <!-- MODAL / SHEET DE DETALLE DE PRODUCTO ESTILO iOS -->
      @if (selectedProduct(); as prod) {
        <div class="modal-scrim" (click)="selectedProduct.set(null)" role="presentation"></div>
        <div class="detail-sheet continuous" role="dialog" aria-modal="true">
          <div class="sheet-head">
            <div class="sh-brand">
              <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="sh-logo" />
              <span class="sheet-title">Detalle del Producto</span>
            </div>
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

              <div class="ticket-match-box continuous">
                <span class="tm-label">COMBINACIÓN SUGERIDA DE TICKETS WALLETPAY</span>
                <div class="tm-pills">
                  @for (denom of prod.recommendedTickets; track $index) {
                    <span class="tm-ticket continuous" [class]="'tm-ticket continuous card-tier-' + denom">
                      <sf-symbol name="ticket" [size]="13" />
                      Ticket de {{ '$' + denom }} MXN
                    </span>
                  }
                </div>
              </div>

              <div class="specs-list continuous">
                @for (spec of prod.specs; track spec) {
                  <div class="spec-item">
                    <sf-symbol name="checkmark.circle.fill" [size]="16" />
                    <span>{{ spec }}</span>
                  </div>
                }
                <div class="spec-item">
                  <sf-symbol name="shield.checkered" [size]="16" />
                  <span>Vendido por <strong>{{ prod.sellerName }}</strong> · Validación automática Banco Central</span>
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
    .ne-storefront {
      max-width: 1360px;
      margin: 0 auto;
      padding: 14px 20px calc(env(safe-area-inset-bottom, 0px) + 92px);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* 1. PÍLDORAS DESLIZABLES DE COLECCIÓN */
    .ne-categories-scroll {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      padding: 2px 0 4px;
      scrollbar-width: none;
    }
    .ne-categories-scroll::-webkit-scrollbar {
      display: none;
    }
    .ne-cat-pill {
      --r: 999px;
      height: 36px;
      padding: 0 15px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .ne-cat-pill.active {
      background: var(--ion-color-primary);
      border-color: var(--ion-color-primary);
      color: #fff;
    }

    /* 2. CABECERA CENTRADA + BARRA "FILTRAR | X PRODUCTOS | [2x2] [1x1]" (1:1 IMAGEN 1) */
    .ne-collection-header {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ne-collection-title {
      margin: 4px 0 2px;
      text-align: center;
      font-size: clamp(20px, 2.5vw, 28px);
      font-weight: 900;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--ios-label);
    }

    .ne-control-bar {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 8px 2px;
      border-top: 0.5px solid var(--ios-separator);
      border-bottom: 0.5px solid var(--ios-separator);
    }

    .ne-filter-trigger {
      justify-self: start;
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 14px;
      font-weight: 600;
      padding: 6px 4px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
    }
    .ne-filter-trigger.active {
      color: var(--ion-color-primary);
    }
    .ne-filter-count {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 10.5px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .ne-products-count {
      justify-self: center;
      font-size: 13.5px;
      font-weight: 500;
      color: var(--ios-label-2);
      white-space: nowrap;
    }

    .ne-view-switcher {
      justify-self: end;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ne-view-btn {
      width: 32px;
      height: 32px;
      border-radius: 7px;
      border: 1px solid var(--ios-separator);
      background: transparent;
      color: var(--ios-label-2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }
    .ne-view-btn.active {
      border-color: var(--ios-label);
      color: var(--ios-label);
      background: var(--ios-cell);
    }

    .ne-active-chips {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ne-chip {
      --r: 999px;
      border: 0;
      padding: 5px 11px;
      background: rgba(0, 122, 255, 0.12);
      color: var(--ion-color-primary);
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .ne-chip-reset {
      border: 0;
      background: transparent;
      color: var(--ion-color-danger);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 6px;
    }

    /* 3. CUADRÍCULA DE PRODUCTOS (1:1 CON LA IMAGEN ADJUNTADA) */
    .ne-product-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 20px 16px;
    }
    .ne-product-grid.single-col {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ne-card {
      --r: 18px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      padding: 10px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      transition: transform 200ms ease, box-shadow 200ms ease;
    }
    .ne-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--ios-shadow-card);
    }

    .ne-card-visual {
      --r: 14px;
      position: relative;
      aspect-ratio: 1 / 0.92;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .ne-corner-seal {
      position: absolute;
      top: 9px;
      right: 9px;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.14);
    }
    .ne-corner-seal img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ne-card-glyph {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Línea divisoria horizontal debajo de la imagen (igual que en la captura) */
    .ne-card-Rule {
      width: 100%;
      height: 1.5px;
      background: var(--ios-separator);
      margin: 10px 0 8px;
      position: relative;
      overflow: hidden;
    }
    .ne-card-rule-active {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 28%;
      background: var(--ios-label-2);
    }

    .ne-card-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .ne-card-eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ios-label-2);
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ne-card-title {
      margin: 0 0 10px;
      font-size: 13.5px;
      font-weight: 500;
      line-height: 1.32;
      color: var(--ios-label);
      cursor: pointer;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 2.64em;
    }

    .ne-card-bottom {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .ne-card-price {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--ios-label);
    }

    /* Botón rectangular [ + ] en la esquina inferior derecha (1:1 con la imagen) */
    .ne-plus-btn {
      --r: 8px;
      width: 44px;
      height: 32px;
      border: 1px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      flex-shrink: 0;
    }
    .ne-plus-btn:hover {
      border-color: var(--ion-color-primary);
      color: var(--ion-color-primary);
    }
    .ne-plus-btn:disabled {
      opacity: 0.4;
    }

    /* 4. DRAWER / SHEET DE FILTROS */
    .ne-filter-drawer {
      --r: 24px;
      position: fixed;
      z-index: 820;
      top: 14px;
      left: 14px;
      bottom: 14px;
      width: min(360px, calc(100vw - 28px));
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .nfd-head {
      padding: 16px 18px 12px;
      border-bottom: 0.5px solid var(--ios-separator);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nfd-title-row {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 17px;
    }
    .nfd-logo {
      width: 26px;
      height: 26px;
      border-radius: 7px;
    }
    .nfd-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .nfd-foot {
      padding: 12px 18px calc(env(safe-area-inset-bottom, 0px) + 14px);
      border-top: 0.5px solid var(--ios-separator);
      display: grid;
      grid-template-columns: 0.8fr 1.2fr;
      gap: 10px;
    }
    .nfd-clear {
      --r: 12px;
      height: 44px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      font-size: 14px;
      font-weight: 600;
    }
    .nfd-apply {
      --r: 12px;
      height: 44px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
    }

    .nfs-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .nfs-group-title {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ios-label-2);
    }
    .nfs-sort-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .nfs-sort-btn {
      --r: 10px;
      padding: 9px 10px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      font-size: 12.5px;
      font-weight: 600;
      text-align: left;
    }
    .nfs-sort-btn.selected {
      border-color: var(--ion-color-primary);
      background: rgba(0, 122, 255, 0.12);
      color: var(--ion-color-primary);
    }

    .nfs-afford-toggle {
      --r: 13px;
      padding: 10px 12px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      text-align: left;
    }
    .nat-copy strong {
      display: block;
      font-size: 13px;
    }
    .nat-copy span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }
    .ios-switch {
      width: 40px;
      height: 24px;
      border-radius: 999px;
      background: var(--ios-fill);
      padding: 2px;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }
    .ios-switch.on {
      background: #30D158;
    }
    .ios-knob {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      transition: transform 180ms ease;
    }
    .ios-switch.on .ios-knob {
      transform: translateX(16px);
    }

    .nfs-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .nfs-check-row {
      border: 0;
      background: transparent;
      color: var(--ios-label);
      padding: 8px 10px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
    }
    .nfs-check-row.selected {
      background: rgba(0, 122, 255, 0.12);
      color: var(--ion-color-primary);
    }
    .nfs-radio {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1.5px solid var(--ios-label-2);
      flex-shrink: 0;
    }
    .nfs-radio.checked {
      border-color: var(--ion-color-primary);
      background: var(--ion-color-primary);
      box-shadow: inset 0 0 0 3px var(--ios-sheet-cell);
    }
    .nfs-lbl {
      flex: 1;
    }
    .nfs-badge {
      font-size: 11.5px;
      color: var(--ios-label-2);
      font-weight: 700;
    }

    .nfs-denom-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .nfs-denom-btn {
      --r: 10px;
      padding: 8px 10px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .nfs-denom-btn.selected {
      background: var(--ion-color-primary);
      border-color: var(--ion-color-primary);
      color: #fff;
    }
    .nfs-denom-btn strong {
      font-size: 12.5px;
    }
    .nfs-denom-btn span {
      font-size: 10.5px;
      opacity: 0.8;
    }

    .ne-empty-state {
      --r: 22px;
      padding: 44px 20px;
      background: var(--ios-cell);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .nes-logo {
      width: 52px;
      height: 52px;
      border-radius: 14px;
    }

    /* 5. FOOTER */
    .ne-footer {
      --r: 22px;
      margin-top: 12px;
      padding: 24px 26px;
      background: var(--ios-cell);
      border: 0.5px solid var(--ios-separator);
    }
    .nef-top {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1fr;
      gap: 20px;
    }
    .nef-logos-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .nef-logo-h {
      height: 36px;
      width: auto;
      border-radius: 8px;
    }
    .nef-logo-sq {
      width: 36px;
      height: 36px;
      border-radius: 8px;
    }
    .nef-brand-col p {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.42;
      color: var(--ios-label-2);
    }
    .nef-links-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .nef-links-col strong {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ion-color-primary);
      margin-bottom: 2px;
    }
    .nef-links-col button {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 12.5px;
      font-weight: 600;
      padding: 0;
      cursor: pointer;
      text-align: left;
    }

    /* MODAL DETALLE */
    .modal-scrim {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: var(--ios-scrim);
      -webkit-backdrop-filter: blur(5px);
      backdrop-filter: blur(5px);
    }
    .detail-sheet {
      --r: 26px;
      position: fixed;
      z-index: 810;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(540px, calc(100vw - 24px));
      max-height: 88vh;
      overflow-y: auto;
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      padding-bottom: 20px;
    }
    .sh-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sh-logo {
      width: 24px;
      height: 24px;
      border-radius: 6px;
    }
    .detail-content {
      padding: 6px 18px 0;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .detail-visual {
      --r: 18px;
      padding: 24px 16px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
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
      font-size: 11px;
      font-weight: 600;
      color: var(--ios-label-2);
    }
    .detail-info h2 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 800;
    }
    .detail-desc {
      margin: 0 0 12px;
      font-size: 13.5px;
      line-height: 1.42;
      color: var(--ios-label-2);
    }
    .ticket-match-box {
      --r: 14px;
      padding: 12px;
      background: var(--ios-sheet-cell);
      margin-bottom: 12px;
    }
    .tm-label {
      display: block;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
      margin-bottom: 8px;
    }
    .tm-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tm-ticket {
      --r: 8px;
      padding: 5px 10px;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .specs-list {
      --r: 14px;
      background: var(--ios-sheet-cell);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 14px;
    }
    .spec-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .spec-item sf-symbol {
      color: var(--ion-color-success);
    }
    .detail-cta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .detail-price span {
      display: block;
      font-size: 11px;
      color: var(--ios-label-2);
    }
    .detail-price strong {
      font-size: 24px;
      font-weight: 800;
    }
    .detail-btns {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn-secondary {
      --r: 12px;
      height: 42px;
      padding: 0 14px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      font-size: 13px;
      font-weight: 700;
    }
    .btn-primary {
      --r: 12px;
      height: 42px;
      padding: 0 16px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    /* ==========================================================================
       RESPONSIVE MÓVIL Y TABLET (1:1 CON LA DISPOSICIÓN DE LA IMAGEN 1)
       ========================================================================== */
    @media (max-width: 980px) {
      .ne-product-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .nef-top {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 720px) {
      .ne-storefront {
        padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 84px);
        gap: 12px;
      }
      /* 2 columnas en móvil igual que en la imagen adjuntada */
      .ne-product-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px 10px;
      }
      /* 1 columna cuando el usuario toca el icono de cuadrado simple */
      .ne-product-grid.single-col {
        grid-template-columns: 1fr;
      }
      .ne-card {
        padding: 8px;
      }
      .ne-card-title {
        font-size: 12.5px;
        margin-bottom: 8px;
      }
      .ne-card-price {
        font-size: 14px;
      }
      .ne-plus-btn {
        width: 40px;
        height: 30px;
      }
      .ne-filter-drawer {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: 86vh;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }
      .detail-sheet {
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        transform: none;
        width: 100%;
        max-height: 90vh;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }
      .detail-cta-row {
        flex-direction: column;
        align-items: stretch;
      }
      .detail-btns {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .nef-top {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      .ne-footer {
        padding: 18px 16px;
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

  readonly selectedDenom = signal<TicketDenomination | null>(null);
  readonly onlyInStock = signal<boolean>(false);
  readonly sortBy = signal<SortOption>('featured');
  readonly filterDrawerOpen = signal<boolean>(false);
  readonly gridMode = signal<'multi' | 'single'>('multi');

  readonly sortOptions: { id: SortOption; label: string }[] = [
    { id: 'featured', label: 'Destacados' },
    { id: 'price-asc', label: 'Menor precio' },
    { id: 'price-desc', label: 'Mayor precio' },
    { id: 'rating', label: 'Mejor calificados' }
  ];

  readonly ticketDenominations: { amount: TicketDenomination; name: string }[] = [
    { amount: 50, name: 'Estándar' },
    { amount: 100, name: 'Plata' },
    { amount: 200, name: 'Oro' },
    { amount: 500, name: 'Titanium' }
  ];

  readonly categories: { id: ProductCategory; label: string; icon: string; title: string }[] = [
    { id: 'all', label: 'Todos', icon: 'storefront', title: 'CATÁLOGO' },
    { id: 'magsafe', label: 'MagSafe', icon: 'bolt.fill', title: 'ACCESORIOS MAGSAFE' },
    { id: 'audio', label: 'Audio', icon: 'headphones', title: 'AUDIO Y MÚSICA' },
    { id: 'hogar', label: 'Hogar', icon: 'speaker.wave.2', title: 'HOGAR INTELIGENTE' },
    { id: 'estudio', label: 'Estudio', icon: 'laptopcomputer', title: 'CÓMPUTO Y ESTUDIO' },
    { id: 'digital', label: 'Digital', icon: 'shield.checkered', title: 'TARJETAS Y DIGITAL' }
  ];

  readonly activeCategoryTitle = computed(() => {
    const found = this.categories.find((c) => c.id === this.selectedCategory());
    return found ? found.title : 'CATÁLOGO';
  });

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();
    const afford = this.onlyAffordable();
    const denom = this.selectedDenom();
    const inStock = this.onlyInStock();
    const sort = this.sortBy();
    const maxPower = this.market.totalPurchasingPower();

    const list = this.market.activeProducts().filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (afford && p.price > maxPower) return false;
      if (denom !== null && !p.recommendedTickets.includes(denom)) return false;
      if (inStock && p.stock <= 0) return false;
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

    if (sort === 'price-asc') {
      return [...list].sort((a, b) => a.price - b.price);
    }
    if (sort === 'price-desc') {
      return [...list].sort((a, b) => b.price - a.price);
    }
    if (sort === 'rating') {
      return [...list].sort((a, b) => b.rating - a.rating);
    }
    return list;
  });

  getCategoryCount(cat: ProductCategory): number {
    const all = this.market.activeProducts();
    if (cat === 'all') return all.length;
    return all.filter((p) => p.category === cat).length;
  }

  activeFiltersCount(): number {
    let count = 0;
    if (this.selectedCategory() !== 'all') count++;
    if (this.onlyAffordable()) count++;
    if (this.selectedDenom() !== null) count++;
    if (this.onlyInStock()) count++;
    return count;
  }

  hasActiveFilters(): boolean {
    return this.activeFiltersCount() > 0 || this.searchQuery().trim().length > 0;
  }

  selectCategory(cat: ProductCategory): void {
    this.market.haptic('selection');
    this.selectedCategory.set(cat);
  }

  selectDenom(denom: TicketDenomination | null): void {
    this.market.haptic('selection');
    this.selectedDenom.set(denom);
  }

  toggleAffordable(): void {
    this.market.haptic('selection');
    this.onlyAffordable.update((v) => !v);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('all');
    this.onlyAffordable.set(false);
    this.selectedDenom.set(null);
    this.onlyInStock.set(false);
    this.sortBy.set('featured');
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
