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
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly market = inject(MarketStateService);
}

