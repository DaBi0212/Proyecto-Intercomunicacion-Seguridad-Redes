import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../../core/services/market-state.service';
import { Product, ProductCategory, TicketDenomination } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

interface HeroSlide {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  category: ProductCategory;
  denomFilter: TicketDenomination | null;
  ticketPreviewAmount: TicketDenomination;
  ticketPreviewTier: string;
  ticketPreviewClass: string;
}

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  template: `
    <div class="ne-storefront">
      <!-- ==========================================================================
           1. HERO CAMPAIGN SHOWCASE ESTILO NEW ERA MX (NEWERA.MX) CON ESTÉTICA iOS
           Incluye las 2 variantes del logo oficial de Market Store + Selector de Drops
           ========================================================================== -->
      <section class="ne-hero-wrap">
        @let slide = activeHeroSlide();
        <div class="ne-hero-banner continuous">
          <div class="ne-hero-left">
            <div class="ne-hero-brand-row">
              <!-- Variante 1 del Logo: Horizontal Market Store -->
              <img
                src="assets/logos/marketstore-horizontal.png"
                alt="Market Store"
                class="ne-hero-logo-h"
              />
              <span class="ne-drop-pill">{{ slide.tag }}</span>
            </div>

            <h1>{{ slide.title }}</h1>
            <p>{{ slide.subtitle }}</p>

            <div class="ne-hero-ctas">
              <button
                type="button"
                class="ne-btn-primary continuous apple-pressable"
                (click)="applyHeroSlideFilter(slide)"
              >
                <span>{{ slide.ctaLabel }}</span>
                <sf-symbol name="arrow.up.right" [size]="15" [weight]="2.4" />
              </button>

              <button
                type="button"
                class="ne-btn-glass continuous apple-pressable"
                (click)="goToWallet()"
              >
                <sf-symbol name="wallet.pass" [size]="17" [weight]="2" />
                <span>Mis Tickets WalletPay ({{ market.activeTickets().length }})</span>
              </button>
            </div>

            <!-- Tabs de campañas tipo New Era MX (01 / 02 / 03) -->
            <div class="ne-hero-tabs" role="tablist">
              @for (s of heroSlides; track s.id; let idx = $index) {
                <button
                  type="button"
                  class="ne-hero-tab apple-pressable"
                  [class.active]="heroSlideIndex() === idx"
                  (click)="selectHeroSlide(idx)"
                >
                  <span class="nht-num">0{{ idx + 1 }}</span>
                  <span class="nht-lbl">{{ s.tag }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Derecha del Hero: Escaparate Visual + Bóveda WalletPay + Variante 2 del Logo -->
          <div class="ne-hero-right">
            <div class="ne-floating-ticket continuous" [class]="'ne-floating-ticket continuous ' + slide.ticketPreviewClass">
              <div class="nft-head">
                <span class="nft-issuer">
                  <sf-symbol name="building.columns" [size]="12" [weight]="2.2" />
                  BANCO CENTRAL · {{ slide.ticketPreviewTier }}
                </span>
                <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="nft-brand-mark" />
              </div>
              <div class="nft-val">
                <span class="cur">$</span>{{ slide.ticketPreviewAmount }}<span class="dec">.00</span>
                <small>MXN</small>
              </div>
              <div class="nft-foot">
                <span class="mono">CERTIFICADO OFICIAL · CANJE AUTOMÁTICO</span>
                <span class="nft-chip"></span>
              </div>
            </div>

            <!-- Tarjeta iOS de Poder de Compra sincronizado con WalletPay -->
            <div class="ne-hero-vault continuous">
              <div class="nhv-head">
                <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="nhv-icon" />
                <div>
                  <span class="nhv-eyebrow">PODER DE COMPRA WALLETPAY</span>
                  <strong class="nhv-total">
                    {{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} <small>MXN</small>
                  </strong>
                </div>
              </div>

              <div class="nhv-chips">
                @for (t of market.activeTickets().slice(0, 4); track t.id) {
                  <span class="nhv-chip continuous" [class]="'nhv-chip continuous ' + t.colorClass">
                    {{ '$' + t.amount }}
                  </span>
                }
                @if (market.activeTickets().length === 0) {
                  <span class="nhv-empty">Adquiere tickets en la app WalletPay</span>
                }
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ==========================================================================
           2. "COMPRA POR COLECCIÓN Y SILUETA DE TICKET" (ESTILO NEW ERA MX)
           ========================================================================== -->
      <section class="ne-collections-strip">
        <div class="ncs-header">
          <div>
            <span class="ncs-eyebrow">NAVEGACIÓN RÁPIDA · ESTILO NEW ERA</span>
            <h2>EXPLORA POR COLECCIÓN O SILUETA DE TICKET</h2>
          </div>
          <div class="ncs-ticket-silhouettes">
            <span class="nts-label">FILTRAR POR TICKET:</span>
            <button
              type="button"
              class="nts-pill continuous apple-pressable"
              [class.active]="selectedDenom() === null"
              (click)="selectDenom(null)"
            >
              Todos
            </button>
            @for (d of ticketDenominations; track d.amount) {
              <button
                type="button"
                class="nts-pill continuous apple-pressable"
                [class.active]="selectedDenom() === d.amount"
                (click)="selectDenom(d.amount)"
              >
                <span>Ticket {{ '$' + d.amount }}</span>
                <small>{{ d.name }}</small>
              </button>
            }
          </div>
        </div>

        <!-- Tarjetas Visuales de Colección (Grid horizontal New Era) -->
        <div class="ne-cat-cards">
          @for (cat of categories; track cat.id) {
            <button
              type="button"
              class="ne-cat-card continuous apple-pressable"
              [class.active]="selectedCategory() === cat.id"
              (click)="selectCategory(cat.id)"
            >
              <div class="ncc-top">
                <span class="ncc-icon">
                  <sf-symbol [name]="cat.icon" [size]="20" />
                </span>
                <span class="ncc-count">{{ getCategoryCount(cat.id) }}</span>
              </div>
              <div class="ncc-bottom">
                <strong>{{ cat.label }}</strong>
                <span>{{ cat.code }}</span>
              </div>
            </button>
          }
        </div>
      </section>

      <!-- ==========================================================================
           3. BARRA SUPERIOR DE COLECCIÓN (BREADCRUMB + FILTROS + ORDENAR POR + COLUMNAS)
           ========================================================================== -->
      <section class="ne-toolbar continuous">
        <div class="ntb-left">
          <button
            type="button"
            class="ntb-filter-btn continuous apple-pressable"
            [class.active]="sidebarOpen()"
            (click)="sidebarOpen.set(!sidebarOpen())"
          >
            <sf-symbol name="line.3.horizontal" [size]="15" [weight]="2.2" />
            <span>{{ sidebarOpen() ? 'OCULTAR FILTROS' : 'MOSTRAR FILTROS' }}</span>
          </button>

          <div class="ntb-breadcrumb">
            <span>MARKET STORE</span>
            <span>/</span>
            <strong>{{ activeCategoryLabel() }}</strong>
            <span class="ntb-count">({{ filteredProducts().length }} productos)</span>
          </div>
        </div>

        <div class="ntb-right">
          @if (hasActiveFilters()) {
            <button type="button" class="ntb-clear apple-pressable" (click)="resetFilters()">
              <sf-symbol name="xmark" [size]="11" [weight]="2.6" />
              <span>Limpiar filtros</span>
            </button>
          }

          <label class="ntb-sort">
            <span>ORDENAR POR:</span>
            <select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)">
              <option value="featured">Destacados / Lanzamientos</option>
              <option value="price-asc">Precio: Menor a Mayor</option>
              <option value="price-desc">Precio: Mayor a Menor</option>
              <option value="rating">Mejor Calificados</option>
            </select>
          </label>

          <div class="ntb-grid-toggle" aria-label="Densidad de cuadrícula">
            <button
              type="button"
              [class.active]="denseGrid() === false"
              (click)="denseGrid.set(false)"
              title="Vista 3 columnas"
            >
              3×
            </button>
            <button
              type="button"
              [class.active]="denseGrid() === true"
              (click)="denseGrid.set(true)"
              title="Vista 4 columnas"
            >
              4×
            </button>
          </div>
        </div>
      </section>

      <!-- ==========================================================================
           4. WORKSPACE DE 2 COLUMNAS ESTILO NEW ERA MX:
              SIDEBAR LATERAL DE FILTROS (IZQUIERDA) + GRID DE PRODUCTOS (DERECHA)
           ========================================================================== -->
      <div class="ne-catalog-workspace" [class.no-sidebar]="!sidebarOpen()">
        @if (sidebarOpen()) {
          <aside class="ne-filter-sidebar continuous" aria-label="Filtros de colección">
            <!-- Sello de Marca Oficial en el Sidebar -->
            <div class="nfs-brand-card continuous">
              <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="nfs-brand-icon" />
              <div>
                <strong>MARKET STORE</strong>
                <span>Validación Automática Banco Central</span>
              </div>
            </div>

            <!-- Filtro 1: Poder de Compra WalletPay -->
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
                  <span>Saldo actual: {{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} MXN</span>
                </div>
                <span class="ios-switch" [class.on]="onlyAffordable()">
                  <span class="ios-knob"></span>
                </span>
              </button>
            </div>

            <!-- Filtro 2: Colecciones -->
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

            <!-- Filtro 3: Silueta / Denominación de Ticket -->
            <div class="nfs-group">
              <div class="nfs-group-title">SILUETA DE TICKET RECOMENDADO</div>
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

            <!-- Filtro 4: Disponibilidad -->
            <div class="nfs-group">
              <div class="nfs-group-title">DISPONIBILIDAD</div>
              <button
                type="button"
                class="nfs-check-row apple-pressable"
                [class.selected]="onlyInStock()"
                (click)="onlyInStock.set(!onlyInStock())"
              >
                <span class="nfs-radio" [class.checked]="onlyInStock()"></span>
                <span class="nfs-lbl">Solo en existencia inmediata</span>
              </button>
            </div>
          </aside>
        }

        <!-- GRID DE PRODUCTOS ESTILO NEW ERA MX CON ACABADO iOS -->
        <div class="ne-products-area">
          @if (filteredProducts().length === 0) {
            <div class="ne-empty-state continuous">
              <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="nes-logo" />
              <h3>No encontramos artículos con esos filtros</h3>
              <p>Prueba seleccionando otra colección, otra denominación de ticket o restablece los filtros.</p>
              <button type="button" class="ne-btn-primary continuous apple-pressable" (click)="resetFilters()">
                Ver toda la colección Market Store
              </button>
            </div>
          } @else {
            <div class="ne-product-grid" [class.dense]="denseGrid()">
              @for (p of filteredProducts(); track p.id) {
                <article class="ne-product-card continuous">
                  <!-- Zona Visual Superior estilo New Era MX -->
                  <div
                    class="npc-visual continuous apple-pressable"
                    [class]="'npc-visual continuous apple-pressable ' + p.surfaceClass"
                    (click)="openDetail(p)"
                  >
                    <div class="npc-top-badges">
                      <span class="npc-ticket-badge">
                        <sf-symbol name="ticket" [size]="11" [weight]="2.3" />
                        {{ p.badge }}
                      </span>
                      <!-- Variante 2 del Logo como sello oficial de autenticidad en cada tarjeta -->
                      <span class="npc-brand-seal" title="Producto Oficial Market Store">
                        <img src="assets/logos/marketstore-icon.png" alt="Market Store" />
                      </span>
                    </div>

                    <div class="npc-art" [style.color]="p.accentColor">
                      <sf-symbol [name]="p.symbolName" [size]="60" [weight]="1.55" />
                    </div>

                    <div class="npc-bottom-meta">
                      <span class="npc-sku mono">{{ p.sku }}</span>
                      <span class="npc-stock" [class.low]="p.stock <= 5">
                        {{ p.stock > 0 ? p.stock + ' EN STOCK' : 'AGOTADO' }}
                      </span>
                    </div>
                  </div>

                  <!-- Información Editorial del Producto + Acciones de Canje -->
                  <div class="npc-body">
                    <div class="npc-meta-row">
                      <span class="npc-category">{{ p.categoryLabel }}</span>
                      <span class="npc-rating">★ {{ p.rating }} ({{ p.reviewsCount }})</span>
                    </div>

                    <div class="npc-copy" (click)="openDetail(p)">
                      <h3>{{ p.title }}</h3>
                      <p>{{ p.subtitle }}</p>
                    </div>

                    <!-- Combinación de Tickets sugerida -->
                    <div class="npc-ticket-pills">
                      @for (tk of p.recommendedTickets; track $index) {
                        <span class="npc-tk-chip" [class]="'npc-tk-chip card-tier-' + tk">
                          Ticket {{ '$' + tk }}
                        </span>
                      }
                    </div>

                    <div class="npc-footer">
                      <div class="npc-price">
                        <span class="npc-price-lbl">PRECIO OFICIAL</span>
                        <strong>{{ p.price | currency: 'MXN' : 'symbol-narrow' }} <small>MXN</small></strong>
                      </div>

                      <div class="npc-actions">
                        <button
                          type="button"
                          class="npc-btn-redeem continuous apple-pressable"
                          [disabled]="p.stock <= 0"
                          (click)="buyNowWithTicket(p)"
                        >
                          <sf-symbol name="wallet.pass" [size]="15" />
                          <span>Canjear</span>
                        </button>
                        <button
                          type="button"
                          class="npc-btn-bag continuous apple-pressable"
                          [disabled]="p.stock <= 0"
                          (click)="addToBag(p)"
                          title="Agregar a la Bolsa"
                          aria-label="Agregar a la Bolsa"
                        >
                          <sf-symbol name="plus" [size]="16" [weight]="2.6" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              }
            </div>
          }
        </div>
      </div>

      <!-- ==========================================================================
           5. FOOTER EDITORIAL ESTILO NEW ERA MX CON AMBAS VARIANTES DEL LOGO
           ========================================================================== -->
      <footer class="ne-footer continuous">
        <div class="nef-top">
          <div class="nef-brand-col">
            <div class="nef-logos-row">
              <!-- Variante 1 y Variante 2 juntas en el cierre de marca -->
              <img src="assets/logos/marketstore-horizontal.png" alt="Market Store" class="nef-logo-h" />
              <img src="assets/logos/marketstore-icon.png" alt="Market Store Icono" class="nef-logo-sq" />
            </div>
            <p>
              Tienda oficial de colecciones sincronizada en tiempo real con la bóveda móvil
              <strong>WalletPay</strong> y validación criptográfica automática del <strong>Banco Central</strong>.
            </p>
          </div>

          <div class="nef-links-col">
            <strong>COLECCIONES</strong>
            @for (cat of categories; track cat.id) {
              <button type="button" (click)="selectCategory(cat.id)">{{ cat.label }}</button>
            }
          </div>

          <div class="nef-links-col">
            <strong>SILUETAS DE TICKETS</strong>
            @for (d of ticketDenominations; track d.amount) {
              <button type="button" (click)="selectDenom(d.amount)">
                Ticket {{ '$' + d.amount }} MXN · {{ d.name }}
              </button>
            }
          </div>

          <div class="nef-links-col">
            <strong>ECOSISTEMA WALLETPAY</strong>
            <button type="button" (click)="goToWallet()">Mi Bóveda de Tickets</button>
            <button type="button" (click)="market.cartOpen.set(true)">Bolsa de Compras ({{ market.cartCount() }})</button>
            <span class="nef-sec-note">✓ Compra de tickets exclusiva en app WalletPay</span>
            <span class="nef-sec-note">✓ Liquidación automática sin esperas</span>
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
              <span class="sheet-title">Market Store · Ficha Oficial</span>
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
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px 22px calc(env(safe-area-inset-bottom, 0px) + 96px);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* 1. HERO CAMPAIGN BANNER ESTILO NEW ERA MX */
    .ne-hero-banner {
      --r: 28px;
      padding: 34px 36px;
      background: linear-gradient(130deg, #0B132B 0%, #1D3557 48%, #2B70EA 100%);
      color: #fff;
      display: grid;
      grid-template-columns: 1.35fr 0.85fr;
      gap: 28px;
      align-items: center;
      box-shadow: 0 20px 44px rgba(11, 19, 43, 0.24);
      position: relative;
      overflow: hidden;
    }
    .ne-hero-left {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ne-hero-brand-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .ne-hero-logo-h {
      height: 44px;
      width: auto;
      border-radius: 10px;
      object-fit: contain;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
    }
    .ne-drop-pill {
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .ne-hero-left h1 {
      margin: 0;
      font-size: clamp(28px, 3.2vw, 44px);
      font-weight: 900;
      line-height: 1.04;
      letter-spacing: -0.03em;
      text-transform: uppercase;
    }
    .ne-hero-left p {
      margin: 0;
      font-size: 15px;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.86);
      max-width: 580px;
    }
    .ne-hero-ctas {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }
    .ne-btn-primary {
      --r: 12px;
      height: 44px;
      padding: 0 20px;
      border: 0;
      background: #FFFFFF;
      color: #0B132B;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .ne-btn-glass {
      --r: 12px;
      height: 44px;
      padding: 0 18px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .ne-hero-tabs {
      margin-top: 8px;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.14);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .ne-hero-tab {
      border: 0;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.72);
      padding: 7px 12px;
      border-radius: 9px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      cursor: pointer;
    }
    .ne-hero-tab.active {
      background: #fff;
      color: #0B132B;
    }
    .nht-num {
      font-family: var(--font-mono);
      opacity: 0.7;
    }

    .ne-hero-right {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ne-floating-ticket {
      --r: 22px;
      padding: 18px 20px;
      color: #fff;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);
    }
    .nft-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .nft-issuer {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .nft-brand-mark {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      object-fit: cover;
    }
    .nft-val {
      font-size: 42px;
      font-weight: 900;
      line-height: 0.95;
      letter-spacing: -0.04em;
    }
    .nft-val .cur,
    .nft-val .dec {
      font-size: 18px;
    }
    .nft-val small {
      font-size: 13px;
      margin-left: 5px;
    }
    .nft-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      opacity: 0.9;
    }
    .nft-chip {
      width: 26px;
      height: 18px;
      border-radius: 4px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.4));
    }

    .ne-hero-vault {
      --r: 20px;
      padding: 16px 18px;
      background: rgba(255, 255, 255, 0.12);
      -webkit-backdrop-filter: blur(16px);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .nhv-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .nhv-icon {
      width: 40px;
      height: 40px;
      border-radius: 11px;
      object-fit: cover;
    }
    .nhv-eyebrow {
      display: block;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      opacity: 0.82;
    }
    .nhv-total {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.03em;
    }
    .nhv-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .nhv-chip {
      --r: 8px;
      padding: 4px 10px;
      font-size: 11.5px;
      font-weight: 800;
      color: #fff;
    }
    .nhv-empty {
      font-size: 12px;
      opacity: 0.85;
    }

    /* 2. STRIP DE COLECCIONES Y SILUETAS */
    .ne-collections-strip {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ncs-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
    }
    .ncs-eyebrow {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #2B70EA;
    }
    .ncs-header h2 {
      margin: 2px 0 0;
      font-size: 21px;
      font-weight: 900;
      letter-spacing: -0.02em;
    }
    .ncs-ticket-silhouettes {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    .nts-label {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--ios-label-2);
      margin-right: 4px;
    }
    .nts-pill {
      --r: 10px;
      height: 34px;
      padding: 0 12px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label);
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .nts-pill small {
      color: var(--ios-label-2);
      font-weight: 600;
    }
    .nts-pill.active {
      background: #2B70EA;
      border-color: #2B70EA;
      color: #fff;
    }
    .nts-pill.active small {
      color: rgba(255, 255, 255, 0.85);
    }

    .ne-cat-cards {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 10px;
    }
    .ne-cat-card {
      --r: 18px;
      padding: 14px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-card-elevated);
      color: var(--ios-label);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      text-align: left;
    }
    .ne-cat-card.active {
      background: #2B70EA;
      border-color: #2B70EA;
      color: #fff;
      box-shadow: 0 10px 22px rgba(43, 112, 234, 0.26);
    }
    .ncc-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ncc-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(43, 112, 234, 0.12);
      color: #2B70EA;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ne-cat-card.active .ncc-icon {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }
    .ncc-count {
      font-size: 11px;
      font-weight: 800;
      opacity: 0.7;
    }
    .ncc-bottom {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ncc-bottom strong {
      font-size: 13.5px;
      font-weight: 800;
    }
    .ncc-bottom span {
      font-size: 10.5px;
      opacity: 0.72;
      font-weight: 600;
    }

    /* 3. TOOLBAR DE COLECCIÓN */
    .ne-toolbar {
      --r: 16px;
      padding: 12px 16px;
      background: var(--ios-cell);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .ntb-left,
    .ntb-right {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .ntb-filter-btn {
      --r: 10px;
      height: 36px;
      padding: 0 13px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .ntb-filter-btn.active {
      border-color: #2B70EA;
      color: #2B70EA;
    }
    .ntb-breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--ios-label-2);
    }
    .ntb-breadcrumb strong {
      color: var(--ios-label);
      font-weight: 800;
      text-transform: uppercase;
    }
    .ntb-clear {
      border: 0;
      background: rgba(255, 59, 48, 0.12);
      color: #FF3B30;
      padding: 6px 11px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }
    .ntb-sort {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 800;
      color: var(--ios-label-2);
    }
    .ntb-sort select {
      height: 34px;
      padding: 0 10px;
      border-radius: 9px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      font-size: 12.5px;
      font-weight: 600;
      outline: none;
    }
    .ntb-grid-toggle {
      display: inline-flex;
      background: var(--ios-fill);
      padding: 2px;
      border-radius: 8px;
    }
    .ntb-grid-toggle button {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 11.5px;
      font-weight: 800;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .ntb-grid-toggle button.active {
      background: var(--ios-sheet-cell);
      color: #2B70EA;
    }

    /* 4. WORKSPACE DE 2 COLUMNAS */
    .ne-catalog-workspace {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 20px;
      align-items: start;
    }
    .ne-catalog-workspace.no-sidebar {
      grid-template-columns: 1fr;
    }

    .ne-filter-sidebar {
      --r: 22px;
      position: sticky;
      top: 76px;
      padding: 16px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .nfs-brand-card {
      --r: 14px;
      padding: 10px 12px;
      background: #2B70EA;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nfs-brand-icon {
      width: 34px;
      height: 34px;
      border-radius: 9px;
      object-fit: cover;
    }
    .nfs-brand-card strong {
      display: block;
      font-size: 12.5px;
      font-weight: 900;
      letter-spacing: 0.04em;
    }
    .nfs-brand-card span {
      font-size: 10.5px;
      opacity: 0.88;
    }

    .nfs-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
      border-top: 0.5px solid var(--ios-separator);
    }
    .nfs-group-title {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ios-label-2);
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
      font-size: 12.5px;
    }
    .nat-copy span {
      font-size: 11px;
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
      padding: 7px 8px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
    }
    .nfs-check-row.selected {
      background: rgba(43, 112, 234, 0.12);
      color: #2B70EA;
    }
    .nfs-radio {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1.5px solid var(--ios-label-2);
      flex-shrink: 0;
    }
    .nfs-radio.checked {
      border-color: #2B70EA;
      background: #2B70EA;
      box-shadow: inset 0 0 0 3px var(--ios-sheet-cell);
    }
    .nfs-lbl {
      flex: 1;
    }
    .nfs-badge {
      font-size: 11px;
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
      background: #2B70EA;
      border-color: #2B70EA;
      color: #fff;
    }
    .nfs-denom-btn strong {
      font-size: 12.5px;
    }
    .nfs-denom-btn span {
      font-size: 10.5px;
      opacity: 0.78;
    }

    /* GRID DE PRODUCTOS ESTILO NEW ERA */
    .ne-product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(276px, 1fr));
      gap: 18px;
    }
    .ne-product-grid.dense {
      grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
    }

    .ne-product-card {
      --r: 22px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-card);
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      transition: transform 220ms ease;
    }
    .ne-product-card:hover {
      transform: translateY(-3px);
    }
    .npc-visual {
      --r: 16px;
      height: 190px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }
    .npc-top-badges {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .npc-ticket-badge {
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--ios-sheet-cell);
      color: #2B70EA;
      font-size: 10.5px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .npc-brand-seal {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    }
    .npc-brand-seal img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .npc-art {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: auto 0;
    }
    .npc-bottom-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .npc-stock.low {
      color: #F59E0B;
    }

    .npc-body {
      padding: 0 4px 4px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }
    .npc-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #2B70EA;
    }
    .npc-rating {
      color: #F59E0B;
    }
    .npc-copy {
      cursor: pointer;
    }
    .npc-copy h3 {
      margin: 0 0 4px;
      font-size: 16.5px;
      font-weight: 800;
      letter-spacing: -0.015em;
    }
    .npc-copy p {
      margin: 0;
      font-size: 12.5px;
      color: var(--ios-label-2);
      line-height: 1.35;
    }
    .npc-ticket-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .npc-tk-chip {
      padding: 3px 8px;
      border-radius: 6px;
      color: #fff;
      font-size: 10.5px;
      font-weight: 800;
    }
    .npc-footer {
      margin-top: auto;
      padding-top: 10px;
      border-top: 0.5px solid var(--ios-separator);
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8px;
    }
    .npc-price-lbl {
      display: block;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--ios-label-2);
    }
    .npc-price strong {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.03em;
    }
    .npc-price small {
      font-size: 11px;
      color: var(--ios-label-2);
    }
    .npc-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .npc-btn-redeem {
      --r: 10px;
      height: 36px;
      padding: 0 12px;
      border: 0;
      background: rgba(43, 112, 234, 0.14);
      color: #2B70EA;
      font-size: 12.5px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .npc-btn-bag {
      --r: 10px;
      width: 36px;
      height: 36px;
      border: 0;
      background: #2B70EA;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .ne-empty-state {
      --r: 22px;
      padding: 48px 24px;
      background: var(--ios-cell);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .nes-logo {
      width: 56px;
      height: 56px;
      border-radius: 15px;
    }

    /* 5. FOOTER EDITORIAL ESTILO NEW ERA */
    .ne-footer {
      --r: 26px;
      margin-top: 12px;
      padding: 30px 32px;
      background: #0B132B;
      color: #fff;
    }
    .nef-top {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1fr;
      gap: 24px;
    }
    .nef-logos-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .nef-logo-h {
      height: 40px;
      width: auto;
      border-radius: 9px;
    }
    .nef-logo-sq {
      width: 40px;
      height: 40px;
      border-radius: 9px;
    }
    .nef-brand-col p {
      margin: 0;
      font-size: 13px;
      line-height: 1.45;
      color: rgba(255, 255, 255, 0.76);
    }
    .nef-links-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 7px;
    }
    .nef-links-col strong {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #60A5FA;
      margin-bottom: 3px;
    }
    .nef-links-col button {
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.84);
      font-size: 12.5px;
      font-weight: 600;
      padding: 0;
      cursor: pointer;
    }
    .nef-sec-note {
      font-size: 11.5px;
      color: #30D158;
      font-weight: 700;
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
      font-weight: 800;
    }
    .detail-desc {
      margin: 0 0 14px;
      font-size: 14px;
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
      font-weight: 800;
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
    }
    .detail-btns {
      display: flex;
      gap: 8px;
    }
    .btn-secondary {
      --r: 12px;
      height: 44px;
      padding: 0 16px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      font-size: 13.5px;
      font-weight: 700;
    }
    .btn-primary {
      --r: 12px;
      height: 44px;
      padding: 0 18px;
      border: 0;
      background: #2B70EA;
      color: #fff;
      font-size: 13.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 1040px) {
      .ne-hero-banner {
        grid-template-columns: 1fr;
      }
      .ne-cat-cards {
        grid-template-columns: repeat(3, 1fr);
      }
      .ne-catalog-workspace {
        grid-template-columns: 1fr;
      }
      .ne-filter-sidebar {
        position: static;
      }
      .nef-top {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 640px) {
      .ne-cat-cards,
      .nef-top {
        grid-template-columns: 1fr 1fr;
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

  readonly heroSlideIndex = signal<number>(0);
  readonly selectedDenom = signal<TicketDenomination | null>(null);
  readonly onlyInStock = signal<boolean>(false);
  readonly sortBy = signal<SortOption>('featured');
  readonly sidebarOpen = signal<boolean>(true);
  readonly denseGrid = signal<boolean>(false);

  readonly heroSlides: HeroSlide[] = [
    {
      id: 'drops',
      tag: 'NUEVOS LANZAMIENTOS',
      title: 'Colecciones Oficiales Market Store · Red WalletPay',
      subtitle:
        'Explora nuestros nuevos lanzamientos y liquida tu pedido de forma inmediata con tus certificados de $50, $100, $200 y $500 MXN validados automáticamente por el Banco Central.',
      ctaLabel: 'Explorar Nuevos Lanzamientos',
      category: 'all',
      denomFilter: null,
      ticketPreviewAmount: 100,
      ticketPreviewTier: 'PLATA',
      ticketPreviewClass: 'card-tier-100'
    },
    {
      id: 'titanium',
      tag: 'EDICIÓN TITANIUM $500',
      title: 'Cómputo, Estudio & Titanio Grado Aeroespacial',
      subtitle:
        'Ingeniería de precisión y monitores Mini LED listos para canje directo con certificados Titanium de $500 MXN o combinación de tickets.',
      ctaLabel: 'Ver Colección Estudio',
      category: 'estudio',
      denomFilter: 500,
      ticketPreviewAmount: 500,
      ticketPreviewTier: 'TITANIUM',
      ticketPreviewClass: 'card-tier-500'
    },
    {
      id: 'magsafe-audio',
      tag: 'MAGSAFE & AUDIO SPATIAL',
      title: 'Accesorios Magnéticos Qi2 & Audio de Estudio',
      subtitle:
        'Desde localizadores UWB de $50 MXN hasta auriculares con audio espacial de $200 MXN. Filtra por tu silueta de ticket favorita.',
      ctaLabel: 'Explorar MagSafe',
      category: 'magsafe',
      denomFilter: null,
      ticketPreviewAmount: 200,
      ticketPreviewTier: 'ORO',
      ticketPreviewClass: 'card-tier-200'
    }
  ];

  readonly activeHeroSlide = computed(() => this.heroSlides[this.heroSlideIndex()] || this.heroSlides[0]);

  readonly ticketDenominations: { amount: TicketDenomination; name: string }[] = [
    { amount: 50, name: 'Estándar' },
    { amount: 100, name: 'Plata' },
    { amount: 200, name: 'Oro' },
    { amount: 500, name: 'Titanium' }
  ];

  readonly categories: { id: ProductCategory; label: string; icon: string; code: string }[] = [
    { id: 'all', label: 'Todo el Catálogo', icon: 'storefront', code: 'FULL COLLECTION' },
    { id: 'magsafe', label: 'Accesorios MagSafe', icon: 'bolt.fill', code: 'QI2 & UWB SERIES' },
    { id: 'audio', label: 'Audio y Música', icon: 'headphones', code: 'SPATIAL SOUND' },
    { id: 'hogar', label: 'Hogar Inteligente', icon: 'speaker.wave.2', code: 'MATTER & THREAD' },
    { id: 'estudio', label: 'Cómputo y Estudio', icon: 'laptopcomputer', code: 'PRO WORKSTATION' },
    { id: 'digital', label: 'Tarjetas y Digital', icon: 'shield.checkered', code: 'CLOUD VAULT' }
  ];

  readonly activeCategoryLabel = computed(() => {
    const found = this.categories.find((c) => c.id === this.selectedCategory());
    return found ? found.label : 'Todo el Catálogo';
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

  hasActiveFilters(): boolean {
    return (
      this.selectedCategory() !== 'all' ||
      this.onlyAffordable() ||
      this.selectedDenom() !== null ||
      this.onlyInStock() ||
      this.searchQuery().trim().length > 0
    );
  }

  selectHeroSlide(idx: number): void {
    this.market.haptic('selection');
    this.heroSlideIndex.set(idx);
  }

  applyHeroSlideFilter(slide: HeroSlide): void {
    this.market.haptic('selection');
    this.selectedCategory.set(slide.category);
    this.selectedDenom.set(slide.denomFilter);
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
