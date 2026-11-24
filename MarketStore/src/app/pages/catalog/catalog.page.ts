import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../../core/services/market-state.service';
import { Product, ProductCategory, TicketDenomination } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  templateUrl: './catalog.page.html',
  styleUrl: './catalog.page.scss'
})
export class CatalogPage {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  readonly searchQuery = this.market.searchQuery;
  readonly selectedCategory = this.market.selectedCategory;
  readonly onlyAffordable = this.market.onlyAffordable;
  readonly selectedProduct = signal<Product | null>(null);
  readonly activeDetailImage = signal<string>('');

  readonly selectedDenom = signal<TicketDenomination | null>(null);
  readonly onlyInStock = signal<boolean>(false);
  readonly sortBy = signal<SortOption>('featured');
  readonly filterDrawerOpen = signal<boolean>(false);
  readonly gridMode = signal<'multi' | 'single'>('multi');

  readonly sortOptions: { id: SortOption; label: string }[] = [
    { id: 'featured', label: 'Destacados' },
    { id: 'price-asc', label: 'Menor precio' },
    { id: 'price-desc', label: 'Mayor precio' },
    { id: 'rating', label: 'Mejor calificados' }
  ];

  readonly ticketDenominations: { amount: TicketDenomination; name: string }[] = [
    { amount: 50, name: 'Estándar' },
    { amount: 100, name: 'Plata' },
    { amount: 200, name: 'Oro' },
    { amount: 500, name: 'Titanium' }
  ];

  readonly categories: { id: ProductCategory; label: string; icon: string; title: string }[] = [
    { id: 'all', label: 'Todos', icon: 'storefront', title: 'CATÁLOGO' },
    { id: 'magsafe', label: 'MagSafe', icon: 'bolt.fill', title: 'ACCESORIOS MAGSAFE' },
    { id: 'audio', label: 'Audio', icon: 'headphones', title: 'AUDIO Y MÚSICA' },
    { id: 'hogar', label: 'Hogar', icon: 'speaker.wave.2', title: 'HOGAR INTELIGENTE' },
    { id: 'estudio', label: 'Estudio', icon: 'laptopcomputer', title: 'CÓMPUTO Y ESTUDIO' },
    { id: 'digital', label: 'Digital', icon: 'shield.checkered', title: 'TARJETAS Y DIGITAL' }
  ];

  readonly activeCategoryTitle = computed(() => {
    const found = this.categories.find((c) => c.id === this.selectedCategory());
    return found ? found.title : 'CATÁLOGO';
  });

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();
    const afford = this.onlyAffordable();
    const denom = this.selectedDenom();
    const inStock = this.onlyInStock();
    const sort = this.sortBy();
    const maxPower = this.market.totalPurchasingPower();

    const list = this.market.activeProducts().filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (afford && p.price > maxPower) return false;
      if (denom !== null && !p.recommendedTickets.includes(denom)) return false;
      if (inStock && p.stock <= 0) return false;
      if (
        q &&
        !p.title.toLowerCase().includes(q) &&
        !p.subtitle.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    if (sort === 'price-asc') {
      return [...list].sort((a, b) => a.price - b.price);
    }
    if (sort === 'price-desc') {
      return [...list].sort((a, b) => b.price - a.price);
    }
    if (sort === 'rating') {
      return [...list].sort((a, b) => b.rating - a.rating);
    }
    return list;
  });

  getCategoryCount(cat: ProductCategory): number {
    const all = this.market.activeProducts();
    if (cat === 'all') return all.length;
    return all.filter((p) => p.category === cat).length;
  }

  activeFiltersCount(): number {
    let count = 0;
    if (this.selectedCategory() !== 'all') count++;
    if (this.onlyAffordable()) count++;
    if (this.selectedDenom() !== null) count++;
    if (this.onlyInStock()) count++;
    return count;
  }

  hasActiveFilters(): boolean {
    return this.activeFiltersCount() > 0 || this.searchQuery().trim().length > 0;
  }

  selectCategory(cat: ProductCategory): void {
    this.market.haptic('selection');
    this.selectedCategory.set(cat);
  }

  selectDenom(denom: TicketDenomination | null): void {
    this.market.haptic('selection');
    this.selectedDenom.set(denom);
  }

  toggleAffordable(): void {
    this.market.haptic('selection');
    this.onlyAffordable.update((v) => !v);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('all');
    this.onlyAffordable.set(false);
    this.selectedDenom.set(null);
    this.onlyInStock.set(false);
    this.sortBy.set('featured');
  }

  openDetail(p: Product): void {
    this.market.haptic('light');
    this.activeDetailImage.set(p.imageUrl || (p.images && p.images[0]) || '');
    this.selectedProduct.set(p);
  }

  goToPublishProduct(): void {
    this.market.haptic('selection');
    this.market.switchRole('seller');
    this.router.navigateByUrl('/seller');
  }

  addToBag(p: Product): void {
    this.market.addToCart(p, 1, false);
  }

  buyNowWithTicket(p: Product): void {
    this.market.addToCart(p, 1, true);
  }

  goToWallet(): void {
    this.router.navigateByUrl('/wallet');
  }
}
