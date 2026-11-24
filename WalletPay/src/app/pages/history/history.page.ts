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
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss'
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
