import { Component, inject } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonLabel,
  IonBadge
} from '@ionic/angular/standalone';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonLabel, IonBadge, SfSymbolComponent],
  template: `
    <ion-tabs (ionTabsDidChange)="wallet.haptic('selection')">
      <ion-tab-bar slot="bottom" [translucent]="true">
        <ion-tab-button tab="store">
          <sf-symbol name="creditcard" [size]="23" />
          <ion-label>Comprar</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="vault">
          <sf-symbol name="wallet.pass" [size]="23" />
          <ion-label>Mis Tickets</ion-label>
          @if (wallet.activeTickets().length > 0) {
            <ion-badge color="primary">{{ wallet.activeTickets().length }}</ion-badge>
          }
        </ion-tab-button>

        <ion-tab-button tab="history">
          <sf-symbol name="clock.arrow.circlepath" [size]="23" />
          <ion-label>Actividad</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
  styles: [`
    ion-tab-bar {
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
    }
    ion-tab-button {
      --color: var(--ios-label-2);
      --color-selected: var(--ion-color-primary);
      gap: 2px;
    }
    ion-label {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }
  `]
})
export class TabsPage {
  readonly wallet = inject(WalletStateService);
}
