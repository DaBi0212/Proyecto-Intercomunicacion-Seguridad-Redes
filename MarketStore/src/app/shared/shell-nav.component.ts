import { Component, HostListener, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MarketStateService } from '../core/services/market-state.service';
import { ProductCategory } from '../core/models/market.models';
import { SfSymbolComponent } from './sf-symbol.component';

@Component({
  selector: 'app-shell-nav',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, RouterLinkActive, SfSymbolComponent],
  template: `
    <!-- ============================================================================
         ARQUITECTURA DE NAVEGACIÓN ESTILO NEW ERA MÉXICO (NEWERA.MX) CON ESTÉTICA iOS
         1. Barra Superior de Anuncios (Top Promo Marquee)
         2. Header Principal en 3 Zonas (Logo Oficial Market Store + Menú Editorial + Buscador/Bolsa/Tickets)
         3. Mega-Menú Desplegable de Colecciones y Guía de Siluetas de Tickets ($50-$500)
         ============================================================================ -->

    <!-- 1. TOP PROMO & ANNOUNCEMENT BAR (ESTILO NEWERA.MX) -->
    <div class="ne-promo-bar">
      <div class="ne-promo-inner">
        <div class="ne-promo-left">
          <img src="assets/logos/marketstore-icon.png" alt="Market Store" class="ne-promo-mark" />
          <span class="ne-promo-pill">OFICIAL</span>
          <span class="ne-promo-text">
            CANJE INSTANTÁNEO CON TICKETS WALLETPAY ($50 · $100 · $200 · $500 MXN) · VALIDACIÓN AUTOMÁTICA BANCO CENTRAL
          </span>
        </div>

        <div class="ne-promo-right">
          <span class="ne-bank-status" [class.ok]="market.bankConnected()">
            <span class="net-dot"></span>
            {{ market.bankConnected() ? 'BANCO CENTRAL ONLINE' : 'SINCRONIZANDO BANCO…' }}
          </span>
          <span class="ne-sep">|</span>
          <button type="button" class="ne-top-link" (click)="goToWallet()">
            PODER DE COMPRA: <strong>{{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} MXN</strong>
          </button>
          <span class="ne-sep">|</span>
          <div class="ne-role-toggle">
            <button
              type="button"
              [class.active]="market.currentUser()?.role === 'buyer'"
              (click)="switchRole('buyer')"
            >
              COMPRADOR
            </button>
            <button
              type="button"
              [class.active]="market.currentUser()?.role === 'seller'"
              (click)="switchRole('seller')"
            >
              VENDEDOR
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. HEADER PRINCIPAL STICKY ESTILO NEW ERA MX CON MATERIAL TRANSLÚCIDO iOS -->
    <header class="ne-header ios-translucent">
      <div class="ne-header-inner">
        <!-- IZQUIERDA: Botón Hamburguesa Móvil + Logo Oficial Market Store (Variante 1 Horizontal + Variante 2 Icono) -->
        <div class="ne-brand-zone">
          <button
            type="button"
            class="ne-hamburger continuous apple-pressable"
            (click)="toggleMobileDrawer()"
            aria-label="Abrir menú de colecciones"
          >
            <sf-symbol [name]="mobileDrawerOpen() ? 'xmark' : 'line.3.horizontal'" [size]="20" [weight]="2.2" />
          </button>

          <a routerLink="/catalog" class="ne-brand-link apple-pressable" (click)="resetAndGoCatalog()">
            <!-- Variante 1: Logo Horizontal Oficial con icono de tienda y tipografía Market Store -->
            <div class="ne-logo-horizontal-badge continuous">
              <img
                src="assets/logos/marketstore-horizontal.png"
                alt="Market Store"
                class="ne-logo-horizontal-img"
              />
            </div>
            <!-- Variante 2: Icono compacto para pantallas reducidas -->
            <div class="ne-logo-compact-badge continuous">
              <img
                src="assets/logos/marketstore-icon.png"
                alt="Market Store"
                class="ne-logo-compact-img"
              />
            </div>
          </a>
        </div>

        <!-- CENTRO: NAVEGACIÓN EDITORIAL EN MAYÚSCULAS ESTILO NEWERA.MX -->
        <nav class="ne-main-nav" aria-label="Navegación principal Market Store">
          <button
            type="button"
            class="ne-nav-item apple-pressable"
            [class.active]="router.url === '/catalog' && market.selectedCategory() === 'all' && !market.onlyAffordable()"
            (click)="resetAndGoCatalog()"
          >
            <span>NUEVOS LANZAMIENTOS</span>
            <span class="ne-hot-dot"></span>
          </button>

          <div class="ne-mega-trigger-wrap" (click)="$event.stopPropagation()">
            <button
              type="button"
              class="ne-nav-item apple-pressable"
              [class.active]="categoriesOpen() || market.selectedCategory() !== 'all'"
              (click)="toggleCategoriesDropdown()"
            >
              <span>COLECCIONES</span>
              <sf-symbol name="chevron.down" [size]="11" [weight]="2.5" />
            </button>
          </div>

          <button
            type="button"
            class="ne-nav-item apple-pressable"
            [class.active]="market.onlyAffordable()"
            (click)="market.toggleAffordableFromNavbar()"
          >
            <span>ALCANZA CON MIS TICKETS</span>
          </button>

          <a
            routerLink="/wallet"
            routerLinkActive="active"
            class="ne-nav-item apple-pressable"
            (click)="market.haptic('selection')"
          >
            <span>MIS TICKETS</span>
            @if (market.activeTickets().length > 0) {
              <span class="ne-nav-badge">{{ market.activeTickets().length }}</span>
            }
          </a>

          <a
            routerLink="/orders"
            routerLinkActive="active"
            class="ne-nav-item apple-pressable"
            (click)="market.haptic('selection')"
          >
            <span>MIS COMPRAS</span>
          </a>

          <a
            routerLink="/seller"
            routerLinkActive="active"
            class="ne-nav-item apple-pressable"
            (click)="switchRole('seller')"
          >
            <span>ESTUDIO VENDEDOR</span>
          </a>
        </nav>

        <!-- DERECHA: Buscador iOS + Píldora de Saldo WalletPay + Cuenta + Tema + Bolsa de Compras -->
        <div class="ne-actions-zone">
          <form class="ne-search-pill continuous" (submit)="onSearchSubmit($event)">
            <sf-symbol name="magnifyingglass" [size]="15" [weight]="2.2" />
            <input
              type="search"
              class="ne-search-input"
              placeholder="Buscar colección, producto, SKU…"
              [ngModel]="market.searchQuery()"
              (ngModelChange)="onSearchInput($event)"
              name="globalSearch"
              autocomplete="off"
            />
            @if (market.searchQuery()) {
              <button
                type="button"
                class="ne-search-clear"
                (click)="clearSearch()"
                aria-label="Limpiar búsqueda"
              >
                <sf-symbol name="xmark" [size]="11" [weight]="2.6" />
              </button>
            }
          </form>

          <button
            type="button"
            class="ne-wallet-pill continuous apple-pressable"
            (click)="goToWallet()"
            title="Bóveda sincronizada con WalletPay"
          >
            <sf-symbol name="wallet.pass" [size]="15" [weight]="2.1" />
            <span>{{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }}</span>
          </button>

          @if (market.currentUser(); as u) {
            <button
              type="button"
              class="ne-user-btn continuous apple-pressable"
              (click)="market.lockSession('Cambio de cuenta en MarketStore')"
              title="Cambiar de cuenta ({{ u.email }})"
            >
              <span class="ne-avatar" [style.background]="u.avatarHex || '#2B70EA'">{{ u.avatarInitials }}</span>
              <span class="ne-uname">{{ u.name.split(' ')[0] }}</span>
            </button>
          }

          <button
            type="button"
            class="ne-icon-btn continuous apple-pressable"
            (click)="market.toggleTheme()"
            title="Cambiar apariencia Claro / Oscuro"
            aria-label="Cambiar apariencia"
          >
            <sf-symbol name="circle.lefthalf.filled" [size]="17" />
          </button>

          <button
            type="button"
            class="ne-bag-btn continuous apple-pressable"
            (click)="openBag()"
            title="Abrir bolsa de compras"
            aria-label="Bolsa de compras"
          >
            <sf-symbol name="bag.fill" [size]="17" />
            <span class="ne-bag-label">BOLSA</span>
            <span class="ne-bag-count">{{ market.cartCount() }}</span>
          </button>

          <button
            type="button"
            class="ne-icon-btn continuous apple-pressable"
            (click)="market.lockSession('Bloqueo manual de sesión')"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <sf-symbol name="lock.fill" [size]="16" />
          </button>
        </div>
      </div>

      <!-- 3. MEGA-MENÚ DESPLEGABLE DE COLECCIONES Y GUÍA DE TICKETS (ESTILO NEW ERA MX) -->
      @if (categoriesOpen()) {
        <div class="ne-megamenu continuous" (click)="$event.stopPropagation()" role="menu">
          <div class="ne-mega-inner">
            <div class="ne-mega-col">
              <span class="ne-mega-eyebrow">EXPLORAR POR COLECCIÓN</span>
              <div class="ne-mega-grid">
                @for (cat of categories; track cat.id) {
                  <button
                    type="button"
                    class="ne-mega-card continuous apple-pressable"
                    [class.selected]="market.selectedCategory() === cat.id"
                    (click)="pickCategory(cat.id)"
                  >
                    <span class="nmc-icon">
                      <sf-symbol [name]="cat.icon" [size]="18" />
                    </span>
                    <div class="nmc-copy">
                      <strong>{{ cat.label }}</strong>
                      <span>{{ cat.tagline }}</span>
                    </div>
                    <sf-symbol name="chevron.right" [size]="12" [weight]="2.4" />
                  </button>
                }
              </div>
            </div>

            <div class="ne-mega-brand-card continuous">
              <div class="nmb-top">
                <img src="assets/logos/marketstore-horizontal.png" alt="Market Store" class="nmb-logo" />
                <span class="nmb-tag">GUÍA DE SILUETAS BANCARIAS</span>
              </div>
              <p>
                Adquiere tus tickets en la app móvil <strong>WalletPay</strong> y canjéalos automáticamente en cualquiera de nuestras colecciones oficiales:
              </p>
              <div class="nmb-tiers">
                <span class="nmb-tier card-tier-50">$50 Estándar</span>
                <span class="nmb-tier card-tier-100">$100 Plata</span>
                <span class="nmb-tier card-tier-200">$200 Oro</span>
                <span class="nmb-tier card-tier-500">$500 Titanium</span>
              </div>
              <button type="button" class="nmb-cta continuous apple-pressable" (click)="categoriesOpen.set(false); goToWallet()">
                <span>Ver mi Bóveda de Tickets ({{ market.activeTickets().length }})</span>
                <sf-symbol name="arrow.up.right" [size]="13" [weight]="2.5" />
              </button>
            </div>
          </div>
        </div>
      }
    </header>

    <!-- ============================================================================
         DRAWER LATERAL MÓVIL ESTILO NEW ERA MX + iOS
         ============================================================================ -->
    @if (mobileDrawerOpen()) {
      <div class="ne-scrim" (click)="mobileDrawerOpen.set(false)" role="presentation"></div>
      <aside class="ne-mobile-drawer continuous" role="dialog" aria-label="Menú principal">
        <div class="nmd-brand-head">
          <img src="assets/logos/marketstore-horizontal.png" alt="Market Store" class="nmd-brand-logo" />
          <button type="button" class="nmd-close" (click)="mobileDrawerOpen.set(false)">
            <sf-symbol name="xmark" [size]="14" [weight]="2.6" />
          </button>
        </div>

        @if (market.currentUser(); as u) {
          <div class="nmd-profile">
            <div class="nmd-user-row">
              <span class="nmd-avatar" [style.background]="u.avatarHex || '#2B70EA'">{{ u.avatarInitials }}</span>
              <div class="nmd-user-meta">
                <strong>{{ u.name }}</strong>
                <span>{{ u.email }}</span>
              </div>
            </div>

            <div class="nmd-wallet-box continuous" (click)="goToWallet(); mobileDrawerOpen.set(false)">
              <div>
                <small>PODER DE COMPRA WALLETPAY</small>
                <strong>{{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} MXN</strong>
              </div>
              <span class="nmd-tk-count">{{ market.activeTickets().length }} tickets ›</span>
            </div>

            <div class="nmd-role-seg">
              <button
                type="button"
                [class.active]="u.role === 'buyer'"
                (click)="switchRole('buyer'); mobileDrawerOpen.set(false)"
              >
                Comprador
              </button>
              <button
                type="button"
                [class.active]="u.role === 'seller'"
                (click)="switchRole('seller'); mobileDrawerOpen.set(false)"
              >
                Vendedor
              </button>
            </div>
          </div>
        }

        <nav class="nmd-list">
          <div class="nmd-sec-title">COLECCIONES NEW ERA · MARKET STORE</div>
          @for (cat of categories; track cat.id) {
            <button
              type="button"
              class="nmd-item"
              [class.active]="market.selectedCategory() === cat.id"
              (click)="pickCategory(cat.id); mobileDrawerOpen.set(false)"
            >
              <sf-symbol [name]="cat.icon" [size]="17" />
              <span>{{ cat.label }}</span>
            </button>
          }

          <div class="nmd-sec-title">MI CUENTA Y BÓVEDA</div>
          <button
            type="button"
            class="nmd-item"
            [class.active]="market.onlyAffordable()"
            (click)="market.toggleAffordableFromNavbar(); mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="checkmark.seal.fill" [size]="18" />
            <span>Alcanza con mis Tickets</span>
          </button>

          <a routerLink="/wallet" routerLinkActive="active" class="nmd-item" (click)="mobileDrawerOpen.set(false)">
            <sf-symbol name="wallet.pass" [size]="18" />
            <span>Mis Tickets WalletPay</span>
            @if (market.activeTickets().length > 0) {
              <span class="nmd-badge">{{ market.activeTickets().length }}</span>
            }
          </a>

          <a routerLink="/orders" routerLinkActive="active" class="nmd-item" (click)="mobileDrawerOpen.set(false)">
            <sf-symbol name="bag.fill" [size]="18" />
            <span>Mis Compras</span>
          </a>

          <a routerLink="/seller" routerLinkActive="active" class="nmd-item" (click)="switchRole('seller'); mobileDrawerOpen.set(false)">
            <sf-symbol name="chart.bar.fill" [size]="18" />
            <span>Estudio Vendedor</span>
          </a>

          <button type="button" class="nmd-item" (click)="market.toggleTheme()">
            <sf-symbol name="circle.lefthalf.filled" [size]="18" />
            <span>Cambiar Apariencia (Claro / Oscuro)</span>
          </button>

          <button
            type="button"
            class="nmd-item danger"
            (click)="mobileDrawerOpen.set(false); market.lockSession('Cierre de sesión desde menú móvil')"
          >
            <sf-symbol name="lock.fill" [size]="18" />
            <span>Cerrar Sesión / Cambiar Cuenta</span>
          </button>
        </nav>
      </aside>
    }

    <!-- BARRA INFERIOR MÓVIL ESTILO iOS (< 960px) -->
    <nav class="mobile-tab-bar ios-translucent" aria-label="Navegación móvil inferior">
      <a routerLink="/catalog" routerLinkActive="active" class="tab-btn" (click)="market.haptic('selection')">
        <sf-symbol name="house.fill" [size]="21" />
        <span>Tienda</span>
      </a>
      <button type="button" class="tab-btn" [class.active]="mobileDrawerOpen()" (click)="toggleMobileDrawer()">
        <sf-symbol name="square.grid.2x2" [size]="21" />
        <span>Colecciones</span>
      </button>
      <a routerLink="/wallet" routerLinkActive="active" class="tab-btn" (click)="market.haptic('selection')">
        <div class="tab-icon-wrap">
          <sf-symbol name="wallet.pass" [size]="21" />
          @if (market.activeTickets().length > 0) {
            <span class="tab-badge">{{ market.activeTickets().length }}</span>
          }
        </div>
        <span>Tickets</span>
      </a>
      <a routerLink="/orders" routerLinkActive="active" class="tab-btn" (click)="market.haptic('selection')">
        <sf-symbol name="bag" [size]="21" />
        <span>Pedidos</span>
      </a>
      <a routerLink="/seller" routerLinkActive="active" class="tab-btn" (click)="switchRole('seller')">
        <sf-symbol name="chart.bar.fill" [size]="21" />
        <span>Vender</span>
      </a>
    </nav>
  `,
  styles: [`
    /* 1. TOP PROMO BAR (ESTILO NEW ERA MX) */
    .ne-promo-bar {
      background: #0B132B;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      border-bottom: 0.5px solid rgba(255, 255, 255, 0.12);
    }
    .ne-promo-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 7px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }
    .ne-promo-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .ne-promo-mark {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .ne-promo-pill {
      padding: 2px 7px;
      border-radius: 999px;
      background: #2B70EA;
      color: #fff;
      font-size: 9.5px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .ne-promo-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.92;
    }
    .ne-promo-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .ne-bank-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #F59E0B;
    }
    .ne-bank-status.ok {
      color: #30D158;
    }
    .net-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .ne-sep {
      opacity: 0.25;
    }
    .ne-top-link {
      border: 0;
      background: transparent;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      cursor: pointer;
      padding: 0;
    }
    .ne-top-link strong {
      color: #60A5FA;
      font-weight: 800;
    }
    .ne-role-toggle {
      display: inline-flex;
      background: rgba(255, 255, 255, 0.1);
      padding: 2px;
      border-radius: 6px;
      gap: 2px;
    }
    .ne-role-toggle button {
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      padding: 3px 7px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ne-role-toggle button.active {
      background: #2B70EA;
      color: #fff;
    }

    /* 2. HEADER PRINCIPAL ESTILO NEW ERA MX + iOS */
    .ne-header {
      position: sticky;
      top: 0;
      z-index: 600;
      background: var(--ion-toolbar-background);
      -webkit-backdrop-filter: saturate(180%) blur(24px);
      backdrop-filter: saturate(180%) blur(24px);
      border-bottom: 0.5px solid var(--ion-toolbar-border-color);
    }
    .ne-header-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 11px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }

    .ne-brand-zone {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .ne-hamburger {
      display: none;
      --r: 10px;
      width: 38px;
      height: 38px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      align-items: center;
      justify-content: center;
    }
    .ne-brand-link {
      display: flex;
      align-items: center;
      text-decoration: none;
    }
    .ne-logo-horizontal-badge {
      --r: 14px;
      height: 44px;
      padding: 5px 14px;
      background: #3572DC;
      box-shadow: 0 6px 16px rgba(53, 114, 220, 0.26);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ne-logo-horizontal-img {
      height: 32px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .ne-logo-compact-badge {
      display: none;
      --r: 12px;
      width: 40px;
      height: 40px;
      overflow: hidden;
      background: #2B70EA;
      box-shadow: 0 4px 12px rgba(43, 112, 234, 0.26);
    }
    .ne-logo-compact-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* NAVEGACIÓN CENTRAL ESTILO NEW ERA */
    .ne-main-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      justify-content: center;
    }
    .ne-nav-item {
      position: relative;
      border: 0;
      background: transparent;
      text-decoration: none;
      color: var(--ios-label);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.055em;
      padding: 9px 12px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 150ms ease, color 150ms ease;
    }
    .ne-nav-item:hover,
    .ne-nav-item.active {
      background: rgba(43, 112, 234, 0.12);
      color: #2B70EA;
    }
    .ne-hot-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #2B70EA;
    }
    .ne-nav-badge {
      padding: 1px 6px;
      border-radius: 999px;
      background: #2B70EA;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
    }

    /* ACCIONES DERECHAS */
    .ne-actions-zone {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .ne-search-pill {
      --r: 999px;
      width: 230px;
      height: 38px;
      padding: 0 12px;
      background: var(--ios-cell);
      border: 0.5px solid var(--ios-separator);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: width 200ms ease, border-color 200ms ease;
    }
    .ne-search-pill:focus-within {
      width: 270px;
      border-color: #2B70EA;
    }
    .ne-search-input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 13px;
      font-weight: 500;
      outline: none;
    }
    .ne-search-clear {
      width: 19px;
      height: 19px;
      border-radius: 50%;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }

    .ne-wallet-pill {
      --r: 999px;
      height: 38px;
      padding: 0 13px;
      border: 0;
      background: rgba(43, 112, 234, 0.14);
      color: #2B70EA;
      font-size: 12.5px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
    }

    .ne-user-btn {
      --r: 999px;
      height: 36px;
      padding: 0 10px 0 4px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ne-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      color: #fff;
      font-size: 10.5px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ne-uname {
      font-size: 12.5px;
      font-weight: 700;
    }

    .ne-icon-btn {
      --r: 10px;
      width: 36px;
      height: 36px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .ne-bag-btn {
      --r: 999px;
      height: 38px;
      padding: 0 13px;
      border: 0;
      background: #2B70EA;
      color: #fff;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      box-shadow: 0 4px 12px rgba(43, 112, 234, 0.28);
    }
    .ne-bag-count {
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.22);
      font-size: 11px;
      font-weight: 800;
    }

    /* 3. MEGA-MENÚ DESPLEGABLE */
    .ne-megamenu {
      border-top: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      padding: 22px;
    }
    .ne-mega-inner {
      max-width: 1360px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1.55fr 0.95fr;
      gap: 22px;
      align-items: stretch;
    }
    .ne-mega-eyebrow {
      display: block;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--ios-label-2);
      margin-bottom: 10px;
    }
    .ne-mega-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .ne-mega-card {
      --r: 14px;
      padding: 12px 14px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;
      cursor: pointer;
    }
    .ne-mega-card.selected,
    .ne-mega-card:hover {
      border-color: #2B70EA;
      background: rgba(43, 112, 234, 0.1);
    }
    .nmc-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(43, 112, 234, 0.14);
      color: #2B70EA;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .nmc-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .nmc-copy strong {
      font-size: 13.5px;
      font-weight: 700;
    }
    .nmc-copy span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }

    .ne-mega-brand-card {
      --r: 20px;
      padding: 20px;
      background: linear-gradient(135deg, #1E3A8A 0%, #2B70EA 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
    }
    .nmb-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .nmb-logo {
      height: 34px;
      width: auto;
      object-fit: contain;
    }
    .nmb-tag {
      padding: 4px 9px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .ne-mega-brand-card p {
      margin: 0;
      font-size: 13px;
      line-height: 1.4;
      opacity: 0.92;
    }
    .nmb-tiers {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .nmb-tier {
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 800;
      color: #fff;
    }
    .nmb-cta {
      --r: 11px;
      height: 38px;
      padding: 0 14px;
      border: 0;
      background: #fff;
      color: #1E3A8A;
      font-size: 12.5px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
    }

    /* DRAWER MÓVIL Y TAB BAR */
    .ne-scrim {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: var(--ios-scrim);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
    }
    .ne-mobile-drawer {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 810;
      width: min(320px, 86vw);
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .nmd-brand-head {
      padding: 14px 16px;
      background: #3572DC;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nmd-brand-logo {
      height: 34px;
      width: auto;
      object-fit: contain;
    }
    .nmd-close {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nmd-profile {
      padding: 14px 16px;
      background: var(--ios-cell);
      border-bottom: 0.5px solid var(--ios-separator);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .nmd-user-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nmd-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      color: #fff;
      font-size: 13px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nmd-user-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .nmd-user-meta strong {
      font-size: 14px;
    }
    .nmd-user-meta span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }
    .nmd-wallet-box {
      --r: 12px;
      padding: 10px 12px;
      background: rgba(43, 112, 234, 0.14);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
    }
    .nmd-wallet-box small {
      display: block;
      font-size: 9px;
      font-weight: 800;
      color: #2B70EA;
    }
    .nmd-wallet-box strong {
      font-size: 14.5px;
    }
    .nmd-tk-count {
      font-size: 12px;
      font-weight: 700;
      color: #2B70EA;
    }
    .nmd-role-seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      background: var(--ios-fill);
      padding: 3px;
      border-radius: 9px;
    }
    .nmd-role-seg button {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 12px;
      font-weight: 700;
      padding: 6px;
      border-radius: 7px;
    }
    .nmd-role-seg button.active {
      background: var(--ios-sheet-cell);
      color: #2B70EA;
    }
    .nmd-list {
      padding: 10px 12px 28px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nmd-sec-title {
      margin: 10px 8px 4px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ios-label-2);
    }
    .nmd-item {
      border: 0;
      background: transparent;
      text-decoration: none;
      color: var(--ios-label);
      font-size: 13.5px;
      font-weight: 600;
      padding: 10px 12px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 11px;
      width: 100%;
      text-align: left;
    }
    .nmd-item.active {
      background: rgba(43, 112, 234, 0.12);
      color: #2B70EA;
    }
    .nmd-item.danger {
      color: var(--ion-color-danger);
    }
    .nmd-badge {
      margin-left: auto;
      padding: 2px 7px;
      border-radius: 999px;
      background: #2B70EA;
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
    }

    .mobile-tab-bar {
      display: none;
    }

    @media (max-width: 1140px) {
      .ne-main-nav {
        display: none;
      }
      .ne-hamburger {
        display: inline-flex;
      }
    }

    @media (max-width: 780px) {
      .ne-promo-inner {
        padding: 5px 12px;
      }
      .ne-promo-right,
      .ne-wallet-pill,
      .ne-uname,
      .ne-bag-label {
        display: none;
      }
      .ne-header-inner {
        padding: 8px 12px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .ne-brand-zone {
        gap: 8px;
      }
      .ne-logo-horizontal-badge {
        height: 36px;
        padding: 4px 10px;
      }
      .ne-logo-horizontal-img {
        height: 26px;
      }
      .ne-actions-zone {
        flex: 1;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
      }
      .ne-search-pill,
      .ne-search-pill:focus-within {
        order: 10;
        width: 100%;
        flex: 1 1 100%;
        height: 36px;
      }
      .ne-icon-btn,
      .ne-user-btn,
      .ne-bag-btn {
        height: 34px;
      }
      .ne-icon-btn {
        width: 34px;
      }
      .ne-user-btn {
        padding: 0 4px;
      }
      .ne-bag-btn {
        padding: 0 10px;
      }
      .mobile-tab-bar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 600;
        height: calc(56px + env(safe-area-inset-bottom, 0px));
        padding-bottom: env(safe-area-inset-bottom, 0px);
        background: var(--ion-toolbar-background);
        -webkit-backdrop-filter: saturate(180%) blur(22px);
        backdrop-filter: saturate(180%) blur(22px);
        border-top: 0.5px solid var(--ion-toolbar-border-color);
        display: grid;
        grid-template-columns: repeat(5, 1fr);
      }
      .tab-btn {
        border: 0;
        background: transparent;
        text-decoration: none;
        color: var(--ios-label-2);
        font-size: 10px;
        font-weight: 600;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }
      .tab-btn.active {
        color: #2B70EA;
      }
      .tab-icon-wrap {
        position: relative;
        display: inline-flex;
      }
      .tab-badge {
        position: absolute;
        top: -4px;
        right: -8px;
        min-width: 15px;
        height: 15px;
        padding: 0 3px;
        border-radius: 999px;
        background: #2B70EA;
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }
  `]
})
export class ShellNavComponent {
  readonly market = inject(MarketStateService);
  readonly router = inject(Router);

  readonly categoriesOpen = signal<boolean>(false);
  readonly mobileDrawerOpen = signal<boolean>(false);

  readonly categories: { id: ProductCategory; label: string; icon: string; tagline: string }[] = [
    { id: 'all', label: 'Todo el Catálogo', icon: 'storefront', tagline: 'Todos los lanzamientos oficiales' },
    { id: 'magsafe', label: 'Colección MagSafe', icon: 'bolt.fill', tagline: 'Energía y acoplamiento magnético' },
    { id: 'audio', label: 'Audio Spatial', icon: 'headphones', tagline: 'Acústica adaptativa de estudio' },
    { id: 'hogar', label: 'Hogar Inteligente', icon: 'speaker.wave.2', tagline: 'Automatización Thread & Matter' },
    { id: 'estudio', label: 'Cómputo y Estudio', icon: 'laptopcomputer', tagline: 'Workstations y titanio grado 5' },
    { id: 'digital', label: 'Tarjetas y Cloud', icon: 'shield.checkered', tagline: 'Suscripciones y bóveda en la nube' }
  ];

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.categoriesOpen()) {
      this.categoriesOpen.set(false);
    }
  }

  toggleCategoriesDropdown(): void {
    this.market.haptic('selection');
    this.categoriesOpen.update((v) => !v);
  }

  toggleMobileDrawer(): void {
    this.market.haptic('light');
    this.mobileDrawerOpen.update((v) => !v);
  }

  pickCategory(cat: ProductCategory): void {
    this.categoriesOpen.set(false);
    this.market.selectCategoryFromNavbar(cat);
  }

  resetAndGoCatalog(): void {
    this.categoriesOpen.set(false);
    this.market.searchQuery.set('');
    this.market.selectedCategory.set('all');
    this.market.onlyAffordable.set(false);
    this.router.navigateByUrl('/catalog');
  }

  onSearchInput(val: string): void {
    this.market.searchFromNavbar(val);
  }

  onSearchSubmit(ev: Event): void {
    ev.preventDefault();
    this.market.searchFromNavbar(this.market.searchQuery());
  }

  clearSearch(): void {
    this.market.searchFromNavbar('');
  }

  openBag(): void {
    this.market.haptic('light');
    this.market.cartOpen.set(true);
  }

  goToWallet(): void {
    this.market.haptic('selection');
    this.router.navigateByUrl('/wallet');
  }

  switchRole(role: 'buyer' | 'seller'): void {
    this.market.haptic('selection');
    this.market.switchRole(role);
  }
}
