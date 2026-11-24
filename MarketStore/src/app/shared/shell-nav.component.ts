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
  templateUrl: './shell-nav.component.html',
  styleUrl: './shell-nav.component.scss'
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
