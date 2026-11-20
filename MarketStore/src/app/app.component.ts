import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MarketStateService } from './core/services/market-state.service';
import { SfSymbolComponent } from './shared/sf-symbol.component';
import { ShellNavComponent } from './shared/shell-nav.component';
import { CartDrawerComponent } from './shared/cart-drawer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SfSymbolComponent, ShellNavComponent, CartDrawerComponent],
  template: `
    <!-- HUD biométrico y criptográfico nativo de iOS (idéntico a WalletPay) -->
    @if (market.hudState().expanded) {
      <div class="faceid-backdrop" role="status" aria-live="polite">
        <div class="faceid-hud continuous">
          <sf-symbol
            class="faceid-glyph"
            [name]="market.hudState().symbol"
            [size]="48"
            [weight]="1.9"
          />
          <span class="faceid-label">{{ market.hudState().label }}</span>
        </div>
      </div>
    }

    <!-- Barra de navegación superior + Tab Bar móvil cuando la sesión está activa -->
    @if (market.isAuthenticated()) {
      <app-shell-nav />
    }

    <main class="app-main">
      <router-outlet />
    </main>

    <!-- Bolsa de compras y Checkout con Verificación Bancaria -->
    @if (market.isAuthenticated()) {
      <app-cart-drawer />
    }
  `,
  styles: [`
    .faceid-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      animation: hudIn 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .faceid-hud {
      --r: 24px;
      width: 168px;
      height: 168px;
      padding: 18px;
      background: var(--ios-hud);
      -webkit-backdrop-filter: saturate(180%) blur(28px);
      backdrop-filter: saturate(180%) blur(28px);
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
      color: var(--ios-label);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
    }
    .faceid-glyph {
      color: var(--ion-color-primary);
    }
    .faceid-label {
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }
    @keyframes hudIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
  `]
})
export class AppComponent {
  readonly market = inject(MarketStateService);
}

