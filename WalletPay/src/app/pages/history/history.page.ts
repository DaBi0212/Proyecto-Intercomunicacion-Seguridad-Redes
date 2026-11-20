import { Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel
} from '@ionic/angular/standalone';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { WalletTransaction } from '../../core/models/wallet.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CurrencyPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    SfSymbolComponent
  ],
  template: `
    <!-- Barra de navegación superior translúcida -->
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="wallet.toggleTheme()" aria-label="Cambiar apariencia">
            <sf-symbol name="circle.lefthalf.filled" [size]="22" />
          </ion-button>
        </ion-buttons>
        <ion-title>Actividad</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="wallet.lockSession('Bloqueo manual')" aria-label="Bloquear">
            <sf-symbol name="lock.fill" [size]="20" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <!-- Encabezado Large Title nativo de iOS -->
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Actividad</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Resumen limpio de compras vs. canjes -->
      <section class="summary">
        <div class="summary-cell continuous">
          <span class="sum-label">Adquirido</span>
          <strong class="sum-value is-buy">
            {{ wallet.totalBought() | currency: 'MXN' : 'symbol-narrow' }}
          </strong>
        </div>
        <div class="summary-cell continuous">
          <span class="sum-label">Canjeado</span>
          <strong class="sum-value">
            {{ wallet.totalRedeemed() | currency: 'MXN' : 'symbol-narrow' }}
          </strong>
        </div>
      </section>

      <ion-list-header>
        <ion-label>Transacciones recientes</ion-label>
      </ion-list-header>

      <!-- Lista nativa de iOS con estilo inset grouped -->
      <ion-list [inset]="true">
        @for (tx of wallet.transactions(); track tx.id; let last = $last) {
          <ion-item [lines]="last ? 'none' : 'inset'">
            <span
              slot="start"
              class="tx-glyph continuous"
              [class.is-buy]="tx.type === 'buy'"
            >
              <sf-symbol [name]="symbolFor(tx)" [size]="19" [weight]="2" />
            </span>

            <ion-label>
              <h3>{{ tx.title }}</h3>
              <p>{{ tx.subtitle }} · {{ tx.date }}</p>
            </ion-label>

            <div slot="end" class="tx-trailing">
              <span class="tx-amount" [class.is-buy]="tx.type === 'buy'">
                {{ tx.type === 'buy' ? '+' : '−' }}{{ tx.amount | currency: 'MXN' : 'symbol-narrow' }}
              </span>
              <span class="tx-folio">{{ tx.id }}</span>
            </div>
          </ion-item>
        }
      </ion-list>

      <p class="list-foot">
        Cada operación está respaldada por un folio auditable emitido por el Banco Central.
      </p>
    </ion-content>
  `,
  styles: [`
    .summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 4px 16px 12px;
    }
    .summary-cell {
      --r: 14px;
      padding: 14px 16px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sum-label {
      font-size: 13px;
      color: var(--ios-label-2);
    }
    .sum-value {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
      font-variant-numeric: tabular-nums;
      color: var(--ios-label);
    }
    .sum-value.is-buy {
      color: var(--ion-color-success);
    }

    ion-list-header {
      padding-left: 20px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ios-label-2);
    }

    .tx-glyph {
      --r: 10px;
      width: 38px;
      height: 38px;
      margin-right: 12px;
      background: var(--ios-fill);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tx-glyph.is-buy {
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }

    ion-label h3 {
      font-size: 17px !important;
      font-weight: 600 !important;
      letter-spacing: -0.015em;
      color: var(--ios-label) !important;
    }
    ion-label p {
      font-size: 13px !important;
      color: var(--ios-label-2) !important;
      margin-top: 2px;
    }

    .tx-trailing {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .tx-amount {
      font-size: 17px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.015em;
      color: var(--ios-label-2);
    }
    .tx-amount.is-buy {
      color: var(--ion-color-success);
    }
    .tx-folio {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ios-label-3);
    }

    .list-foot {
      margin: 0;
      padding: 6px 24px 32px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--ios-label-2);
    }
  `]
})
export class HistoryPage {
  readonly wallet = inject(WalletStateService);

  symbolFor(tx: WalletTransaction): string {
    if (tx.type === 'redeem') return 'bag';
    if (tx.iconType === 'bank') return 'building.columns';
    if (tx.iconType === 'card') return 'creditcard';
    return 'ticket';
  }
}
