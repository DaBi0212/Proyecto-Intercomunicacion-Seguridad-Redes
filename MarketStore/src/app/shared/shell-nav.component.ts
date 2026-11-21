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
         SISTEMA DE NAVEGACIÓN ESTRUCTURAL TIPO MERCADOLIBRE (ESCRITORIO Y MÓVIL)
         Mantiene el lenguaje visual oscuro/claro translúcido del proyecto.
         ============================================================================ -->
    <header class="ml-header ios-translucent">
      <div class="ml-container">
        <!-- FILA 1: Barra Principal (Menú Móvil + Logo + Buscador Global Central + Píldora WalletPay / Carrito Móvil) -->
        <div class="ml-row-main">
          <!-- Botón Hamburguesa (Visible en Móvil/Tablet) -->
          <button
            type="button"
            class="ml-hamburger continuous apple-pressable"
            (click)="toggleMobileDrawer()"
            aria-label="Abrir menú de navegación"
          >
            <sf-symbol [name]="mobileDrawerOpen() ? 'xmark' : 'line.3.horizontal'" [size]="20" [weight]="2.2" />
          </button>

          <!-- Logo / Marca -->
          <a routerLink="/catalog" class="ml-brand apple-pressable" (click)="resetAndGoCatalog()">
            <div class="brand-icon continuous" aria-hidden="true">
              <span class="pass p1"></span>
              <span class="pass p2"></span>
              <span class="pass p3"></span>
              <span class="pocket">
                <sf-symbol name="bag.fill" [size]="12" />
              </span>
            </div>
            <div class="brand-copy">
              <strong>MarketStore</strong>
              <span>Red WalletPay</span>
            </div>
          </a>

          <!-- Buscador Global Central (Arquitectura MercadoLibre: siempre presente en cabecera) -->
          <form class="ml-search-form continuous" (submit)="onSearchSubmit($event)">
            <input
              type="search"
              class="ml-search-input"
              placeholder="Buscar productos, marcas, accesorios MagSafe y más…"
              [ngModel]="market.searchQuery()"
              (ngModelChange)="onSearchInput($event)"
              name="globalSearch"
              autocomplete="off"
            />
            @if (market.searchQuery()) {
              <button
                type="button"
                class="ml-search-clear"
                (click)="clearSearch()"
                aria-label="Limpiar búsqueda"
              >
                <sf-symbol name="xmark" [size]="12" [weight]="2.6" />
              </button>
            }
            <span class="ml-search-divider" aria-hidden="true"></span>
            <button type="submit" class="ml-search-btn apple-pressable" aria-label="Buscar">
              <sf-symbol name="magnifyingglass" [size]="17" [weight]="2.1" />
            </button>
          </form>

          <!-- Acciones Derechas Fila 1 (Escritorio: Banner de Saldo en Tickets + Estado Banco; Móvil: Carrito) -->
          <div class="ml-top-right">
            <button
              type="button"
              class="ml-promo-pill continuous apple-pressable"
              (click)="goToWallet()"
              title="Ver mis tickets electrónicos sincronizados con WalletPay"
            >
              <span class="mpp-icon">
                <sf-symbol name="ticket" [size]="16" [weight]="2.1" />
              </span>
              <div class="mpp-copy">
                <small>PODER DE COMPRA WALLETPAY</small>
                <strong>
                  {{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} MXN · {{ market.activeTickets().length }} tickets
                </strong>
              </div>
            </button>

            <button
              type="button"
              class="ml-net-btn continuous apple-pressable"
              [class.ok]="market.bankConnected()"
              (click)="openNetModal()"
              title="Configurar IP del Banco Central (:5050)"
            >
              <span class="net-dot"></span>
              <span class="net-lbl">Banco :5050</span>
            </button>

            <!-- Botón de Carrito directo en Fila 1 para Móvil -->
            <button
              type="button"
              class="ml-mobile-cart continuous apple-pressable"
              (click)="openBag()"
              aria-label="Abrir carrito de compras"
            >
              <sf-symbol name="cart.fill" [size]="20" />
              @if (market.cartCount() > 0) {
                <span class="cart-badge">{{ market.cartCount() }}</span>
              }
            </button>
          </div>
        </div>

        <!-- FILA 2 (ESCRITORIO): Ubicación/Destinatario + Menú de Categorías y Secciones + Cuenta/Compras/Carrito -->
        <div class="ml-row-sub">
          <!-- Izquierda: "Enviar a [Usuario]" estilo MercadoLibre -->
          @if (market.currentUser(); as u) {
            <button
              type="button"
              class="ml-location-btn continuous apple-pressable"
              (click)="goToWallet()"
              title="Cuenta y bóveda sincronizada con WalletPay"
            >
              <sf-symbol name="mappin.and.ellipse" [size]="17" [weight]="2" />
              <div class="loc-copy">
                <small>Enviar a {{ u.name.split(' ')[0] }}</small>
                <strong>{{ u.email }}</strong>
              </div>
            </button>
          }

          <!-- Centro: Enlaces de Navegación tipo MercadoLibre (Categorías Dropdown, Ofertas/Tickets, Historial, Vender) -->
          <nav class="ml-nav-links" aria-label="Navegación principal">
            <div class="cat-dropdown-wrap" (click)="$event.stopPropagation()">
              <button
                type="button"
                class="ml-nav-link apple-pressable"
                [class.active]="categoriesOpen() || market.selectedCategory() !== 'all'"
                (click)="toggleCategoriesDropdown()"
              >
                <span>Categorías</span>
                <sf-symbol name="chevron.down" [size]="12" [weight]="2.4" />
              </button>

              @if (categoriesOpen()) {
                <div class="cat-dropdown-menu continuous" role="menu">
                  <div class="cdm-head">CATEGORÍAS DE PRODUCTOS</div>
                  @for (cat of categories; track cat.id) {
                    <button
                      type="button"
                      class="cdm-item apple-pressable"
                      [class.selected]="market.selectedCategory() === cat.id"
                      (click)="pickCategory(cat.id)"
                    >
                      <sf-symbol [name]="cat.icon" [size]="16" />
                      <span>{{ cat.label }}</span>
                      @if (market.selectedCategory() === cat.id) {
                        <sf-symbol name="checkmark" [size]="14" [weight]="2.6" />
                      }
                    </button>
                  }
                </div>
              }
            </div>

            <a
              routerLink="/catalog"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              class="ml-nav-link apple-pressable"
              (click)="market.haptic('selection')"
            >
              Catálogo
            </a>

            <button
              type="button"
              class="ml-nav-link apple-pressable"
              [class.active]="market.onlyAffordable()"
              (click)="market.toggleAffordableFromNavbar()"
            >
              <span>Alcanza con mis Tickets</span>
            </button>

            <a
              routerLink="/wallet"
              routerLinkActive="active"
              class="ml-nav-link apple-pressable"
              (click)="market.haptic('selection')"
            >
              <span>Mis Tickets</span>
              @if (market.activeTickets().length > 0) {
                <span class="nav-count-badge">{{ market.activeTickets().length }}</span>
              }
            </a>

            <a
              routerLink="/orders"
              routerLinkActive="active"
              class="ml-nav-link apple-pressable"
              (click)="market.haptic('selection')"
            >
              Historial
            </a>

            <a
              routerLink="/seller"
              routerLinkActive="active"
              class="ml-nav-link apple-pressable"
              (click)="switchRole('seller')"
            >
              Vender
            </a>
          </nav>

          <!-- Derecha: Menú de Usuario, Selector de Rol, Mis Compras, Tema, Carrito y Salir -->
          <div class="ml-user-links">
            @if (market.currentUser(); as u) {
              <button
                type="button"
                class="ml-account-pill continuous apple-pressable"
                (click)="market.lockSession('Cambio de cuenta en MarketStore')"
                title="Cambiar de cuenta ({{ u.email }})"
              >
                <span class="u-av" [style.background]="u.avatarHex || '#007AFF'">{{ u.avatarInitials }}</span>
                <span class="u-name">{{ u.name.split(' ')[0] }}</span>
              </button>
            }

            <div class="role-mini-switch">
              <button
                type="button"
                class="rms-btn"
                [class.active]="market.currentUser()?.role === 'buyer'"
                (click)="switchRole('buyer')"
              >
                Comprador
              </button>
              <button
                type="button"
                class="rms-btn"
                [class.active]="market.currentUser()?.role === 'seller'"
                (click)="switchRole('seller')"
              >
                Vendedor
              </button>
            </div>

            <a routerLink="/orders" routerLinkActive="active" class="ml-util-link apple-pressable">
              Mis compras
            </a>

            <button
              type="button"
              class="ml-icon-action continuous apple-pressable"
              (click)="market.toggleTheme()"
              title="Cambiar apariencia Claro / Oscuro"
              aria-label="Cambiar apariencia"
            >
              <sf-symbol name="circle.lefthalf.filled" [size]="18" />
            </button>

            <button
              type="button"
              class="ml-icon-action cart-action continuous apple-pressable"
              (click)="openBag()"
              title="Abrir carrito de compras"
              aria-label="Carrito de compras"
            >
              <sf-symbol name="cart.fill" [size]="19" />
              @if (market.cartCount() > 0) {
                <span class="cart-badge">{{ market.cartCount() }}</span>
              }
            </button>

            <button
              type="button"
              class="ml-icon-action continuous apple-pressable"
              (click)="market.lockSession('Bloqueo manual de sesión')"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <sf-symbol name="lock.fill" [size]="17" />
            </button>
          </div>
        </div>

        <!-- SUB-FRANJA MÓVIL ESTILO MERCADOLIBRE: "Enviar a [Usuario] · Saldo en Tickets: $X.XX ›" -->
        <div class="ml-mobile-substrip">
          <button type="button" class="mms-loc apple-pressable" (click)="goToWallet()">
            <sf-symbol name="mappin.and.ellipse" [size]="14" />
            <span>
              Enviar a <strong>{{ market.currentUser()?.name || 'Usuario' }}</strong> · Tickets:
              <strong>{{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }}</strong>
              ({{ market.activeTickets().length }})
            </span>
            <sf-symbol name="chevron.right" [size]="12" />
          </button>

          <button
            type="button"
            class="mms-net"
            [class.ok]="market.bankConnected()"
            (click)="openNetModal()"
          >
            <span class="net-dot"></span>
            <span>:5050</span>
          </button>
        </div>
      </div>
    </header>

    <!-- ============================================================================
         DRAWER LATERAL MÓVIL ESTILO MERCADOLIBRE (MENÚ HAMBURGUESA DESLIZABLE)
         ============================================================================ -->
    @if (mobileDrawerOpen()) {
      <div class="ml-drawer-scrim" (click)="mobileDrawerOpen.set(false)" role="presentation"></div>
      <aside class="ml-mobile-drawer continuous" role="dialog" aria-label="Menú principal">
        <!-- Cabecera de perfil del usuario estilo app MercadoLibre -->
        @if (market.currentUser(); as u) {
          <div class="mmd-profile">
            <div class="mmd-prof-top">
              <span class="mmd-avatar" [style.background]="u.avatarHex || '#007AFF'">
                {{ u.avatarInitials }}
              </span>
              <div class="mmd-user-info">
                <strong>Hola, {{ u.name }}</strong>
                <span>{{ u.email }}</span>
              </div>
              <button type="button" class="mmd-close" (click)="mobileDrawerOpen.set(false)">
                <sf-symbol name="xmark" [size]="14" [weight]="2.6" />
              </button>
            </div>

            <!-- Tarjeta de saldo WalletPay en el Drawer -->
            <div class="mmd-wallet-card continuous" (click)="goToWallet(); mobileDrawerOpen.set(false)">
              <div>
                <small>PODER DE COMPRA WALLETPAY</small>
                <strong>{{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }} MXN</strong>
              </div>
              <span class="mmd-tk-pill">{{ market.activeTickets().length }} activos ›</span>
            </div>

            <!-- Selector de rol Comprador / Vendedor -->
            <div class="mmd-role-switch">
              <button
                type="button"
                [class.active]="u.role === 'buyer'"
                (click)="switchRole('buyer'); mobileDrawerOpen.set(false)"
              >
                Modo Comprador
              </button>
              <button
                type="button"
                [class.active]="u.role === 'seller'"
                (click)="switchRole('seller'); mobileDrawerOpen.set(false)"
              >
                Modo Vendedor
              </button>
            </div>
          </div>
        }

        <!-- Lista de navegación vertical estilo MercadoLibre Móvil -->
        <nav class="mmd-list">
          <a
            routerLink="/catalog"
            routerLinkActive="active"
            class="mmd-item"
            (click)="mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="house.fill" [size]="19" />
            <span>Inicio y Catálogo</span>
          </a>

          <button
            type="button"
            class="mmd-item"
            [class.active]="market.onlyAffordable()"
            (click)="market.toggleAffordableFromNavbar(); mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="checkmark.seal.fill" [size]="19" />
            <span>Alcanza con mis Tickets</span>
          </button>

          <a
            routerLink="/wallet"
            routerLinkActive="active"
            class="mmd-item"
            (click)="mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="wallet.pass" [size]="19" />
            <span>Mis Tickets (WalletPay)</span>
            @if (market.activeTickets().length > 0) {
              <span class="mmd-badge">{{ market.activeTickets().length }}</span>
            }
          </a>

          <a
            routerLink="/orders"
            routerLinkActive="active"
            class="mmd-item"
            (click)="mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="bag.fill" [size]="19" />
            <span>Mis Compras y Auditoría</span>
          </a>

          <button
            type="button"
            class="mmd-item"
            (click)="openBag(); mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="cart.fill" [size]="19" />
            <span>Mi Carrito / Bolsa</span>
            @if (market.cartCount() > 0) {
              <span class="mmd-badge">{{ market.cartCount() }}</span>
            }
          </button>

          <a
            routerLink="/seller"
            routerLinkActive="active"
            class="mmd-item"
            (click)="switchRole('seller'); mobileDrawerOpen.set(false)"
          >
            <sf-symbol name="chart.bar.fill" [size]="19" />
            <span>Vender / Panel Vendedor</span>
          </a>

          <div class="mmd-section-title">CATEGORÍAS</div>
          @for (cat of categories; track cat.id) {
            <button
              type="button"
              class="mmd-item sub-cat"
              [class.active]="market.selectedCategory() === cat.id"
              (click)="pickCategory(cat.id); mobileDrawerOpen.set(false)"
            >
              <sf-symbol [name]="cat.icon" [size]="17" />
              <span>{{ cat.label }}</span>
            </button>
          }

          <div class="mmd-section-title">CONFIGURACIÓN Y CUENTA</div>
          <button
            type="button"
            class="mmd-item"
            (click)="mobileDrawerOpen.set(false); openNetModal()"
          >
            <sf-symbol name="wifi" [size]="18" />
            <span>IP Banco Central (:5050)</span>
          </button>

          <button
            type="button"
            class="mmd-item"
            (click)="market.toggleTheme()"
          >
            <sf-symbol name="circle.lefthalf.filled" [size]="18" />
            <span>Cambiar Tema (Claro / Oscuro)</span>
          </button>

          <button
            type="button"
            class="mmd-item danger"
            (click)="mobileDrawerOpen.set(false); market.lockSession('Cierre de sesión desde menú móvil')"
          >
            <sf-symbol name="lock.fill" [size]="18" />
            <span>Salir / Cambiar de Cuenta</span>
          </button>
        </nav>
      </aside>
    }

    <!-- ============================================================================
         BARRA INFERIOR MÓVIL DE ACCESO RÁPIDO (< 960px)
         ============================================================================ -->
    <nav class="mobile-tab-bar ios-translucent" aria-label="Navegación móvil inferior">
      <a
        routerLink="/catalog"
        routerLinkActive="active"
        class="tab-btn"
        (click)="market.haptic('selection')"
      >
        <sf-symbol name="house.fill" [size]="21" />
        <span>Inicio</span>
      </a>

      <button
        type="button"
        class="tab-btn"
        [class.active]="mobileDrawerOpen()"
        (click)="toggleMobileDrawer()"
      >
        <sf-symbol name="square.grid.2x2" [size]="21" />
        <span>Categorías</span>
      </button>

      <a
        routerLink="/wallet"
        routerLinkActive="active"
        class="tab-btn"
        (click)="market.haptic('selection')"
      >
        <div class="tab-icon-wrap">
          <sf-symbol name="wallet.pass" [size]="21" />
          @if (market.activeTickets().length > 0) {
            <span class="tab-badge">{{ market.activeTickets().length }}</span>
          }
        </div>
        <span>Mis Tickets</span>
      </a>

      <a
        routerLink="/orders"
        routerLinkActive="active"
        class="tab-btn"
        (click)="market.haptic('selection')"
      >
        <sf-symbol name="bag" [size]="21" />
        <span>Mis Compras</span>
      </a>

      <a
        routerLink="/seller"
        routerLinkActive="active"
        class="tab-btn"
        (click)="switchRole('seller')"
      >
        <sf-symbol name="chart.bar.fill" [size]="21" />
        <span>Vender</span>
      </a>
    </nav>

    <!-- ============================================================================
         MODAL DE CONFIGURACIÓN DE IP DEL BANCO CENTRAL (:5050) DESDE VERCEL
         ============================================================================ -->
    @if (netModalOpen()) {
      <div class="ml-drawer-scrim" (click)="netModalOpen.set(false)" role="presentation"></div>
      <div class="net-config-modal continuous" role="dialog" aria-modal="true">
        <div class="ncm-head">
          <strong>Conexión con Banco Central (:5050)</strong>
          <button type="button" class="mmd-close" (click)="netModalOpen.set(false)">
            <sf-symbol name="xmark" [size]="13" [weight]="2.6" />
          </button>
        </div>

        <p class="ncm-desc">
          MarketStore (desplegado en Vercel) se comunica en tiempo real con el ejecutable
          <strong>CentralBank.exe</strong>. Ingresa la IP local o dirección del servidor:
        </p>

        <label class="ncm-field">
          <span>DIRECCIÓN IP / URL DEL BANCO CENTRAL</span>
          <input
            type="text"
            class="mono"
            placeholder="http://192.168.1.74:5050/api"
            [(ngModel)]="bankUrlInput"
          />
        </label>

        <div class="ncm-presets">
          <button type="button" class="ncm-chip" (click)="bankUrlInput = 'http://192.168.1.74:5050/api'">
            Wi-Fi PC (192.168.1.74:5050)
          </button>
          <button type="button" class="ncm-chip" (click)="bankUrlInput = 'http://localhost:5050/api'">
            Localhost (:5050)
          </button>
        </div>

        @if (netFeedback()) {
          <p class="ncm-feedback" [class.ok]="market.bankConnected()">{{ netFeedback() }}</p>
        }

        <button
          type="button"
          class="ncm-save continuous apple-pressable"
          [disabled]="testingNet()"
          (click)="saveBankUrl()"
        >
          <sf-symbol name="wifi" [size]="17" />
          <span>{{ testingNet() ? 'Verificando...' : 'Guardar y Conectar con CentralBank' }}</span>
        </button>
      </div>
    }
  `,
  styles: [`
    .ml-header {
      position: sticky;
      top: 0;
      z-index: 600;
      background: var(--ion-toolbar-background);
      -webkit-backdrop-filter: saturate(180%) blur(22px);
      backdrop-filter: saturate(180%) blur(22px);
      border-bottom: 0.5px solid var(--ion-toolbar-border-color);
      padding-top: env(safe-area-inset-top, 0px);
    }

    .ml-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 8px 20px 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /* FILA 1: Logo + Buscador Central + Promo WalletPay */
    .ml-row-main {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .ml-hamburger,
    .ml-mobile-cart,
    .ml-mobile-substrip {
      display: none;
    }

    .ml-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--ios-label);
      flex-shrink: 0;
    }

    .brand-icon {
      --r: 10px;
      position: relative;
      width: 38px;
      height: 38px;
      overflow: hidden;
      background: linear-gradient(180deg, #2C2C2E 0%, #000 100%);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    .pass {
      position: absolute;
      left: 6px;
      right: 6px;
      height: 10px;
      border-radius: 3px;
    }
    .p1 { top: 5px; background: #0A84FF; }
    .p2 { top: 9px; background: #FF9F0A; }
    .p3 { top: 13px; background: #30D158; }
    .pocket {
      position: absolute;
      left: 4px;
      right: 4px;
      bottom: 4px;
      height: 16px;
      border-radius: 4px;
      background: #3A3A3C;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-copy {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .brand-copy strong {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.025em;
    }
    .brand-copy span {
      font-size: 10.5px;
      color: var(--ios-label-2);
      font-weight: 600;
    }

    /* Buscador Global estilo MercadoLibre */
    .ml-search-form {
      --r: 12px;
      flex: 1;
      height: 40px;
      background: var(--ios-sheet-cell);
      border: 0.5px solid var(--ios-separator);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      display: flex;
      align-items: center;
      padding: 0 4px 0 14px;
      gap: 6px;
    }
    .ml-search-input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 14px;
      outline: none;
    }
    .ml-search-clear {
      width: 22px;
      height: 22px;
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
    .ml-search-divider {
      width: 1px;
      height: 20px;
      background: var(--ios-separator);
    }
    .ml-search-btn {
      width: 34px;
      height: 32px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .ml-top-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .ml-promo-pill {
      --r: 12px;
      height: 40px;
      padding: 0 12px;
      border: 0;
      background: rgba(0, 122, 255, 0.12);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-align: left;
    }
    .mpp-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--ion-color-primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mpp-copy {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
    }
    .mpp-copy small {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ion-color-primary);
    }
    .mpp-copy strong {
      font-size: 12.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .ml-net-btn {
      --r: 10px;
      height: 36px;
      padding: 0 10px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label-2);
      font-size: 11.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .ml-net-btn.ok {
      color: var(--ion-color-success);
    }
    .net-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #FF9500;
    }
    .ok .net-dot {
      background: #30D158;
    }

    /* FILA 2: Ubicación + Enlaces Centrales + Cuenta/Carrito */
    .ml-row-sub {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding-top: 2px;
    }

    .ml-location-btn {
      --r: 10px;
      border: 0;
      padding: 4px 10px 4px 8px;
      background: transparent;
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      gap: 7px;
      text-align: left;
      flex-shrink: 0;
    }
    .ml-location-btn:hover {
      background: var(--ios-fill);
    }
    .ml-location-btn sf-symbol {
      color: var(--ion-color-primary);
    }
    .loc-copy {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
    }
    .loc-copy small {
      font-size: 10.5px;
      color: var(--ios-label-2);
      font-weight: 500;
    }
    .loc-copy strong {
      font-size: 12px;
      font-weight: 600;
      max-width: 155px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Enlaces centrales estilo MercadoLibre */
    .ml-nav-links {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }

    .ml-nav-link {
      border: 0;
      background: transparent;
      text-decoration: none;
      color: var(--ios-label-2);
      font-size: 13px;
      font-weight: 600;
      padding: 6px 11px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: background 150ms ease, color 150ms ease;
    }
    .ml-nav-link:hover,
    .ml-nav-link.active {
      color: var(--ios-label);
      background: var(--ios-fill);
    }

    .nav-count-badge {
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
    }

    /* Dropdown de Categorías */
    .cat-dropdown-wrap {
      position: relative;
    }
    .cat-dropdown-menu {
      --r: 16px;
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      width: 240px;
      padding: 8px;
      background: var(--ios-sheet-bg);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-float);
      display: flex;
      flex-direction: column;
      gap: 2px;
      z-index: 700;
    }
    .cdm-head {
      padding: 6px 10px 4px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--ios-label-2);
    }
    .cdm-item {
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 13px;
      font-weight: 600;
      padding: 9px 10px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 9px;
      text-align: left;
      cursor: pointer;
    }
    .cdm-item:hover,
    .cdm-item.selected {
      background: rgba(0, 122, 255, 0.12);
      color: var(--ion-color-primary);
    }
    .cdm-item sf-symbol:last-child {
      margin-left: auto;
    }

    /* Enlaces derechos de usuario y carrito */
    .ml-user-links {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .ml-account-pill {
      --r: 999px;
      height: 32px;
      border: 0;
      padding: 0 10px 0 4px;
      background: var(--ios-fill);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .u-av {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .u-name {
      font-size: 12.5px;
      font-weight: 600;
    }

    .role-mini-switch {
      display: inline-flex;
      background: var(--ios-fill);
      padding: 2px;
      border-radius: 8px;
    }
    .rms-btn {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .rms-btn.active {
      background: var(--ios-sheet-cell);
      color: var(--ion-color-primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .ml-util-link {
      text-decoration: none;
      color: var(--ios-label-2);
      font-size: 12.5px;
      font-weight: 600;
      padding: 5px 8px;
      border-radius: 8px;
    }
    .ml-util-link.active,
    .ml-util-link:hover {
      color: var(--ios-label);
      background: var(--ios-fill);
    }

    .ml-icon-action {
      --r: 9px;
      position: relative;
      width: 32px;
      height: 32px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .cart-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Drawer Móvil y Modal de Red */
    .ml-drawer-scrim {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: var(--ios-scrim);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
    }
    .ml-mobile-drawer {
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
      padding-top: env(safe-area-inset-top, 0px);
    }
    .mmd-profile {
      padding: 16px;
      background: var(--ios-cell);
      border-bottom: 0.5px solid var(--ios-separator);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .mmd-prof-top {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mmd-avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .mmd-user-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .mmd-user-info strong {
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mmd-user-info span {
      font-size: 12px;
      color: var(--ios-label-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mmd-close {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mmd-wallet-card {
      --r: 12px;
      padding: 10px 12px;
      background: rgba(0, 122, 255, 0.14);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
    }
    .mmd-wallet-card small {
      display: block;
      font-size: 9px;
      font-weight: 800;
      color: var(--ion-color-primary);
    }
    .mmd-wallet-card strong {
      font-size: 15px;
      color: var(--ios-label);
    }
    .mmd-tk-pill {
      font-size: 12px;
      font-weight: 700;
      color: var(--ion-color-primary);
    }
    .mmd-role-switch {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      background: var(--ios-fill);
      padding: 3px;
      border-radius: 10px;
    }
    .mmd-role-switch button {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 12px;
      font-weight: 600;
      padding: 6px;
      border-radius: 8px;
    }
    .mmd-role-switch button.active {
      background: var(--ios-sheet-cell);
      color: var(--ion-color-primary);
    }

    .mmd-list {
      padding: 10px 12px 32px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .mmd-section-title {
      margin: 12px 8px 4px;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--ios-label-2);
    }
    .mmd-item {
      border: 0;
      background: transparent;
      text-decoration: none;
      color: var(--ios-label);
      font-size: 14px;
      font-weight: 600;
      padding: 11px 12px;
      border-radius: 11px;
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;
      width: 100%;
    }
    .mmd-item.sub-cat {
      padding: 8px 12px;
      font-size: 13.5px;
      color: var(--ios-label-2);
    }
    .mmd-item.active {
      background: rgba(0, 122, 255, 0.12);
      color: var(--ion-color-primary);
    }
    .mmd-item.danger {
      color: var(--ion-color-danger);
    }
    .mmd-badge {
      margin-left: auto;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }

    /* Modal Configuración IP */
    .net-config-modal {
      --r: 22px;
      position: fixed;
      z-index: 820;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(440px, calc(100vw - 28px));
      padding: 20px;
      background: var(--ios-sheet-bg);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-float);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ncm-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 17px;
    }
    .ncm-desc {
      margin: 0;
      font-size: 13px;
      line-height: 1.4;
      color: var(--ios-label-2);
    }
    .ncm-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .ncm-field span {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .ncm-field input {
      height: 42px;
      border-radius: 11px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label);
      padding: 0 12px;
      font-size: 13.5px;
      outline: none;
    }
    .ncm-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ncm-chip {
      border: 0;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .ncm-feedback {
      margin: 0;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--ion-color-danger);
    }
    .ncm-feedback.ok {
      color: var(--ion-color-success);
    }
    .ncm-save {
      --r: 12px;
      height: 46px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 14.5px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    /* Tab bar inferior en móviles */
    .mobile-tab-bar {
      display: none;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 500;
      height: calc(56px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--ion-tab-bar-background);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      border-top: 0.5px solid var(--ion-toolbar-border-color);
      grid-template-columns: repeat(5, 1fr);
    }
    .tab-btn {
      border: 0;
      background: transparent;
      text-decoration: none;
      color: var(--ios-label-2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      font-size: 10px;
      font-weight: 500;
      padding: 0;
    }
    .tab-btn.active {
      color: var(--ion-color-primary);
      font-weight: 600;
    }
    .tab-icon-wrap {
      position: relative;
      display: inline-flex;
    }
    .tab-badge {
      position: absolute;
      top: -4px;
      right: -10px;
      min-width: 15px;
      height: 15px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 9.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Adaptación Móvil estilo MercadoLibre (< 960px) */
    @media (max-width: 960px) {
      .ml-container {
        padding: 8px 12px 6px;
        gap: 6px;
      }
      .ml-row-sub,
      .ml-promo-pill,
      .ml-net-btn,
      .brand-copy {
        display: none;
      }
      .ml-hamburger,
      .ml-mobile-cart {
        --r: 10px;
        width: 38px;
        height: 38px;
        border: 0;
        background: var(--ios-fill);
        color: var(--ios-label);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        flex-shrink: 0;
      }
      .ml-row-main {
        gap: 8px;
      }
      .ml-mobile-substrip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-top: 2px;
      }
      .mms-loc {
        border: 0;
        background: transparent;
        color: var(--ios-label-2);
        font-size: 11.5px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 2px 0;
        text-align: left;
        min-width: 0;
      }
      .mms-loc span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mms-loc strong {
        color: var(--ios-label);
      }
      .mms-net {
        border: 0;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--ios-fill);
        color: var(--ios-label-2);
        font-size: 10.5px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .mobile-tab-bar {
        display: grid;
      }
    }
  `]
})
export class ShellNavComponent {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  readonly categoriesOpen = signal(false);
  readonly mobileDrawerOpen = signal(false);
  readonly netModalOpen = signal(false);
  readonly testingNet = signal(false);
  readonly netFeedback = signal('');
  bankUrlInput = '';

  readonly categories: { id: ProductCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'Todas las categorías', icon: 'storefront' },
    { id: 'magsafe', label: 'Accesorios MagSafe', icon: 'bolt.fill' },
    { id: 'audio', label: 'Audio y Música', icon: 'headphones' },
    { id: 'hogar', label: 'Hogar Inteligente', icon: 'speaker.wave.2' },
    { id: 'estudio', label: 'Cómputo y Estudio', icon: 'laptopcomputer' },
    { id: 'digital', label: 'Tarjetas y Digital', icon: 'shield.checkered' }
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
    this.market.haptic('selection');
    this.mobileDrawerOpen.update((v) => !v);
  }

  pickCategory(cat: ProductCategory): void {
    this.categoriesOpen.set(false);
    this.market.selectCategoryFromNavbar(cat);
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

  resetAndGoCatalog(): void {
    this.market.selectedCategory.set('all');
    this.market.onlyAffordable.set(false);
  }

  openBag(): void {
    this.market.haptic('light');
    this.market.cartOpen.set(true);
  }

  goToWallet(): void {
    this.market.haptic('light');
    this.router.navigateByUrl('/wallet');
  }

  openNetModal(): void {
    this.bankUrlInput = this.market.crypto.getCustomBankUrl();
    this.netFeedback.set('');
    this.netModalOpen.set(true);
  }

  async saveBankUrl(): Promise<void> {
    this.testingNet.set(true);
    const res = await this.market.saveBankConnectionUrl(this.bankUrlInput);
    this.testingNet.set(false);
    this.netFeedback.set(res.message);
    if (res.ok) {
      this.market.haptic('success');
      setTimeout(() => this.netModalOpen.set(false), 700);
    } else {
      this.market.haptic('error');
    }
  }

  async switchRole(role: 'buyer' | 'seller'): Promise<void> {
    if (this.market.currentUser()?.role === role) {
      if (role === 'seller') this.router.navigateByUrl('/seller');
      else this.router.navigateByUrl('/catalog');
      return;
    }
    await this.market.switchRole(role);
  }
}
