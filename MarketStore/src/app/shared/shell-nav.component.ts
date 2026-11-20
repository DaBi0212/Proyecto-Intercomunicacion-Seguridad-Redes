import { Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MarketStateService } from '../core/services/market-state.service';
import { SfSymbolComponent } from './sf-symbol.component';

@Component({
  selector: 'app-shell-nav',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, RouterLinkActive, SfSymbolComponent],
  template: `
    <!-- BARRA DE NAVEGACIÓN SUPERIOR TRANSLÚCIDA (Desktop, Laptop, Tablet y Móvil) -->
    <header class="top-nav ios-translucent">
      <div class="nav-inner">
        <!-- Marca con ícono squircle coherente con WalletPay -->
        <a routerLink="/catalog" class="brand apple-pressable">
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
            <span>Tienda Virtual · Red WalletPay</span>
          </div>
        </a>

        <!-- Navegación central en escritorio/laptop -->
        <nav class="desktop-links" aria-label="Navegación principal">
          <a
            routerLink="/catalog"
            routerLinkActive="active"
            class="nav-pill apple-pressable"
            (click)="market.haptic('selection')"
          >
            <sf-symbol name="storefront" [size]="17" />
            <span>Catálogo</span>
          </a>

          <a
            routerLink="/wallet"
            routerLinkActive="active"
            class="nav-pill apple-pressable"
            (click)="market.haptic('selection')"
          >
            <sf-symbol name="wallet.pass" [size]="17" />
            <span>Mis Tickets</span>
            @if (market.activeTickets().length > 0) {
              <span class="pill-badge">{{ market.activeTickets().length }}</span>
            }
          </a>

          <a
            routerLink="/orders"
            routerLinkActive="active"
            class="nav-pill apple-pressable"
            (click)="market.haptic('selection')"
          >
            <sf-symbol name="clock.arrow.circlepath" [size]="17" />
            <span>Pedidos y Auditoría</span>
          </a>

          @if (market.currentUser()?.role === 'seller') {
            <a
              routerLink="/seller"
              routerLinkActive="active"
              class="nav-pill seller-pill apple-pressable"
              (click)="market.haptic('selection')"
            >
              <sf-symbol name="chart.bar.fill" [size]="17" />
              <span>Panel Vendedor</span>
            </a>
          }
        </nav>

        <!-- Acciones derechas: Usuario Activo, Selector de Rol, Saldo en Tickets, Tema, Bolsa y Bloqueo -->
        <div class="nav-actions">
          @if (market.currentUser(); as u) {
            <button
              type="button"
              class="user-chip continuous apple-pressable"
              (click)="market.lockSession('Cambio de usuario en MarketStore')"
              title="Usuario activo ({{ u.email }}) · Haz clic para cambiar de cuenta"
            >
              <span class="uc-av" [style.background]="u.avatarHex || '#007AFF'">{{ u.avatarInitials }}</span>
              <span class="uc-name">{{ u.name }}</span>
            </button>
          }

          <!-- Control de Acceso: Selector de Rol (Comprador / Vendedor) -->
          <div class="role-switcher" role="group" aria-label="Rol activo">
            <button
              type="button"
              class="role-btn apple-pressable"
              [class.active]="market.currentUser()?.role === 'buyer'"
              (click)="switchRole('buyer')"
              title="Vista de Cliente Comprador"
            >
              Comprador
            </button>
            <button
              type="button"
              class="role-btn apple-pressable"
              [class.active]="market.currentUser()?.role === 'seller'"
              (click)="switchRole('seller')"
              title="Vista de Cliente Vendedor"
            >
              Vendedor
            </button>
          </div>

          <!-- Píldora de Saldo en Bóveda WalletPay -->
          <button
            type="button"
            class="wallet-chip continuous apple-pressable"
            (click)="goToWallet()"
            title="Saldo disponible en Tickets Electrónicos"
          >
            <sf-symbol name="ticket" [size]="15" [weight]="2" />
            <span>{{ market.totalPurchasingPower() | currency: 'MXN' : 'symbol-narrow' }}</span>
          </button>

          <!-- Botón de Bolsa de Compras -->
          <button
            type="button"
            class="icon-btn bag-btn continuous apple-pressable"
            (click)="openBag()"
            aria-label="Abrir bolsa de compras"
          >
            <sf-symbol name="bag" [size]="20" />
            @if (market.cartCount() > 0) {
              <span class="bag-badge">{{ market.cartCount() }}</span>
            }
          </button>

          <!-- Cambiar apariencia Claro / Oscuro (idéntico a WalletPay) -->
          <button
            type="button"
            class="icon-btn continuous apple-pressable"
            (click)="market.toggleTheme()"
            aria-label="Cambiar apariencia claro u oscuro"
            title="Cambiar tema Claro / Oscuro"
          >
            <sf-symbol name="circle.lefthalf.filled" [size]="20" />
          </button>

          <!-- Bloquear sesión / Cerrar sesión (idéntico a WalletPay) -->
          <button
            type="button"
            class="icon-btn continuous apple-pressable"
            (click)="market.lockSession('Bloqueo manual de sesión')"
            aria-label="Cerrar o bloquear sesión"
            title="Bloquear sesión"
          >
            <sf-symbol name="lock.fill" [size]="18" />
          </button>
        </div>
      </div>
    </header>

    <!-- TAB BAR INFERIOR TRANSLÚCIDA ESTILO iOS PARA MÓVILES Y TABLETS (< 900px) -->
    <nav class="mobile-tab-bar ios-translucent" aria-label="Navegación móvil">
      <a
        routerLink="/catalog"
        routerLinkActive="active"
        class="tab-btn"
        (click)="market.haptic('selection')"
      >
        <sf-symbol name="storefront" [size]="22" />
        <span>Tienda</span>
      </a>

      <a
        routerLink="/wallet"
        routerLinkActive="active"
        class="tab-btn"
        (click)="market.haptic('selection')"
      >
        <div class="tab-icon-wrap">
          <sf-symbol name="wallet.pass" [size]="22" />
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
        <sf-symbol name="clock.arrow.circlepath" [size]="22" />
        <span>Actividad</span>
      </a>

      <a
        routerLink="/seller"
        routerLinkActive="active"
        class="tab-btn"
        (click)="switchRole('seller')"
      >
        <sf-symbol name="chart.bar.fill" [size]="22" />
        <span>Vendedor</span>
      </a>
    </nav>
  `,
  styles: [`
    .top-nav {
      position: sticky;
      top: 0;
      z-index: 500;
      background: var(--ion-toolbar-background);
      -webkit-backdrop-filter: saturate(180%) blur(22px);
      backdrop-filter: saturate(180%) blur(22px);
      border-bottom: 0.5px solid var(--ion-toolbar-border-color);
      padding-top: env(safe-area-inset-top, 0px);
    }

    .nav-inner {
      max-width: 1280px;
      margin: 0 auto;
      height: 64px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
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
      line-height: 1.15;
    }
    .brand-copy strong {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-copy span {
      font-size: 11px;
      color: var(--ios-label-2);
      font-weight: 500;
    }

    .desktop-links {
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--ios-fill);
      padding: 4px;
      border-radius: 14px;
    }

    .nav-pill {
      text-decoration: none;
      color: var(--ios-label-2);
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
      padding: 7px 14px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 180ms ease, color 180ms ease, box-shadow 180ms ease;
    }
    .nav-pill.active {
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .nav-pill.seller-pill.active {
      color: var(--ion-color-primary);
    }

    .pill-badge {
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      line-height: 1.3;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .user-chip {
      --r: 999px;
      height: 36px;
      border: 0;
      padding: 0 11px 0 5px;
      background: var(--ios-fill);
      color: var(--ios-label);
      display: inline-flex;
      align-items: center;
      gap: 7px;
      max-width: 170px;
    }
    .uc-av {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .uc-name {
      font-size: 12.5px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .role-switcher {
      display: inline-flex;
      background: var(--ios-fill);
      padding: 3px;
      border-radius: 10px;
      gap: 2px;
    }
    .role-btn {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 7.5px;
      cursor: pointer;
      transition: all 180ms ease;
    }
    .role-btn.active {
      background: var(--ios-sheet-cell);
      color: var(--ion-color-primary);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    }

    .wallet-chip {
      --r: 999px;
      height: 36px;
      border: 0;
      padding: 0 12px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .icon-btn {
      --r: 11px;
      position: relative;
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

    .bag-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0, 122, 255, 0.4);
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
      grid-template-columns: repeat(4, 1fr);
    }

    .tab-btn {
      text-decoration: none;
      color: var(--ios-label-2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: -0.01em;
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

    @media (max-width: 960px) {
      .desktop-links {
        display: none;
      }
      .mobile-tab-bar {
        display: grid;
      }
    }

    @media (max-width: 600px) {
      .nav-inner {
        padding: 0 14px;
        height: 56px;
      }
      .brand-copy span {
        display: none;
      }
      .wallet-chip span {
        font-size: 12px;
      }
      .role-btn {
        padding: 4px 7px;
        font-size: 11px;
      }
    }
  `]
})
export class ShellNavComponent {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  openBag(): void {
    this.market.haptic('light');
    this.market.cartOpen.set(true);
  }

  goToWallet(): void {
    this.market.haptic('light');
    this.router.navigateByUrl('/wallet');
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

