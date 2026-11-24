import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { WalletStateService } from './core/services/wallet-state.service';
import { SfSymbolComponent } from './shared/sf-symbol.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, SfSymbolComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly wallet = inject(WalletStateService);
}
