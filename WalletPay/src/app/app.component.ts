import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { WalletStateService } from './core/services/wallet-state.service';
import { SfSymbolComponent } from './shared/sf-symbol.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, SfSymbolComponent],
  template: `
    <ion-app>
      <!-- HUD biométrico nativo de iOS (Face ID) con material translúcido -->
      @if (wallet.dynamicIslandState().expanded) {
        <div class="faceid-backdrop" role="status" aria-live="polite">
          <div class="faceid-hud continuous">
            <sf-symbol class="faceid-glyph" name="faceid" [size]="48" [weight]="1.9" />
            <span class="faceid-label">{{ wallet.dynamicIslandState().label }}</span>
          </div>
        </div>
      }

      <ion-router-outlet></ion-router-outlet>
    </ion-app>
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
      width: 156px;
      height: 156px;
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
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    @keyframes hudIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
  `]
})
export class AppComponent {
  readonly wallet = inject(WalletStateService);
}
