import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../core/services/market-state.service';
import { StoreOrder, TicketDenomination } from '../core/models/market.models';
import { SfSymbolComponent } from './sf-symbol.component';

type CheckoutStep = 'bag' | 'tickets' | 'verifying' | 'receipt';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  templateUrl: './cart-drawer.component.html',
  styleUrl: './cart-drawer.component.scss'
})
export class CartDrawerComponent {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  readonly step = signal<CheckoutStep>('bag');
  readonly selectedTicketIds = signal<string[]>([]);
  readonly showManualInput = signal<boolean>(false);
  readonly bankHelperMode = signal<'mint' | 'folio'>('mint');
  readonly denominations: TicketDenomination[] = [50, 100, 200, 500];

  manualFolio = '';
  manualAmount: TicketDenomination = 100;
  readonly folioFeedback = signal<string>('');
  readonly checkoutError = signal<string>('');
  readonly verificationStageText = signal<string>('Conectando con Banco Central...');
  readonly completedOrder = signal<StoreOrder | null>(null);

  readonly selectedTicketsTotal = computed(() => {
    const ids = new Set(this.selectedTicketIds());
    return this.market
      .activeTickets()
      .filter((t) => ids.has(t.id))
      .reduce((acc, t) => acc + t.amount, 0);
  });

  readonly totalSelectedAndCredit = computed(
    () => this.selectedTicketsTotal() + this.market.storeCredit()
  );

  readonly isCovered = computed(
    () =>
      this.market.cartSubtotal() > 0 &&
      this.totalSelectedAndCredit() >= this.market.cartSubtotal()
  );

  readonly missingAmount = computed(() =>
    Math.max(0, this.market.cartSubtotal() - this.totalSelectedAndCredit())
  );

  readonly projectedChange = computed(() =>
    Math.max(0, this.totalSelectedAndCredit() - this.market.cartSubtotal())
  );

  readonly coveragePercent = computed(() => {
    const sub = this.market.cartSubtotal();
    if (sub <= 0) return 0;
    return Math.min(100, Math.round((this.totalSelectedAndCredit() / sub) * 100));
  });

  constructor() {
    effect(
      () => {
        if (!this.market.cartOpen()) {
          this.step.set('bag');
          this.checkoutError.set('');
        }
      },
      { allowSignalWrites: true }
    );
  }

  close(): void {
    if (this.step() === 'verifying') return;
    this.market.cartOpen.set(false);
  }

  goToTicketSelection(): void {
    this.market.haptic('light');
    this.autoSelectOptimal();
    this.step.set('tickets');
  }

  autoSelectOptimal(): void {
    const optimal = this.market.findOptimalTicketsForAmount(this.market.cartSubtotal());
    this.selectedTicketIds.set(optimal);
    this.checkoutError.set('');
  }

  isTicketSelected(id: string): boolean {
    return this.selectedTicketIds().includes(id);
  }

  toggleTicket(id: string): void {
    this.market.haptic('selection');
    this.checkoutError.set('');
    this.selectedTicketIds.update((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async quickMintTicket(amount: TicketDenomination): Promise<void> {
    const created = await this.market.acquireBankTicket(amount, 'Emisión Rápida en Checkout');
    this.selectedTicketIds.update((prev) => [...prev, created.id]);
  }

  async importManualFolio(): Promise<void> {
    const res = await this.market.importExternalTicketFolio(this.manualFolio, this.manualAmount);
    this.folioFeedback.set(res.message);
    if (res.ok && res.ticket) {
      this.manualFolio = '';
      this.selectedTicketIds.update((prev) =>
        prev.includes(res.ticket!.id) ? prev : [...prev, res.ticket!.id]
      );
    }
  }

  async confirmAndVerifyPurchase(): Promise<void> {
    this.checkoutError.set('');
    this.step.set('verifying');

    const result = await this.market.verifyAndCheckoutWithTickets(
      this.selectedTicketIds(),
      (stage) => this.verificationStageText.set(stage)
    );

    if (!result.ok || !result.order) {
      this.checkoutError.set(result.error || 'No se pudo verificar el ticket.');
      this.step.set('tickets');
      return;
    }

    this.completedOrder.set(result.order);
    this.selectedTicketIds.set([]);
    this.step.set('receipt');
  }

  viewOrders(): void {
    this.market.cartOpen.set(false);
    this.router.navigateByUrl('/orders');
  }
}
