import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketStateService } from '../../core/services/market-state.service';
import { BankTicket, SavedUserCard, TicketDenomination } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';
import { generateQrSvgData } from '../../core/utils/qr-generator';

interface DenominationCard {
  amount: TicketDenomination;
  tier: string;
  badge: string;
  desc: string;
  code: string;
  cls: string;
  isTitanium?: boolean;
}

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [CurrencyPipe, UpperCasePipe, FormsModule, SfSymbolComponent],
  templateUrl: './wallet.page.html',
  styleUrl: './wallet.page.scss'
})
export class WalletPage {
  readonly market = inject(MarketStateService);
  private readonly router = inject(Router);

  readonly segment = signal<'active' | 'used' | 'buy'>('active');
  externalFolio = '';
  externalDenom: TicketDenomination = 100;
  customCardNumber = '';
  customCardExpiry = '';
  customCardCvc = '';
  readonly addingNewCard = signal<boolean>(false);
  readonly selectedCardId = signal<string>('');
  readonly cardFormError = signal<string>('');
  readonly importFeedback = signal<string>('');
  private qrSvgCache = new Map<string, { viewBox: string; path: string; size: number }>();

  readonly activeCardId = computed<string>(() => {
    const cards = this.market.savedUserCards();
    const sel = this.selectedCardId();
    if (sel && cards.some((c) => c.id === sel)) return sel;
    return cards.length > 0 ? cards[0].id : '';
  });

  formatCardNumber(): void {
    const digits = this.customCardNumber.replace(/\D/g, '').substring(0, 16);
    this.customCardNumber = (digits.match(/.{1,4}/g) || []).join(' ');
    if (this.cardFormError()) this.cardFormError.set('');
  }

  formatCardExpiry(): void {
    const digits = this.customCardExpiry.replace(/\D/g, '').substring(0, 4);
    this.customCardExpiry = digits.length >= 3 ? `${digits.substring(0, 2)}/${digits.substring(2)}` : digits;
    if (this.cardFormError()) this.cardFormError.set('');
  }

  formatCardCvc(): void {
    this.customCardCvc = this.customCardCvc.replace(/\D/g, '').substring(0, 4);
    if (this.cardFormError()) this.cardFormError.set('');
  }

  private detectCardBrand(digits: string): { name: string; icon: string; bg: string } {
    if (digits.startsWith('4')) {
      return { name: 'Tarjeta Visa', icon: 'creditcard', bg: '#111111' };
    }
    if (digits.startsWith('5') || digits.startsWith('2')) {
      return { name: 'Tarjeta Mastercard', icon: 'creditcard.fill', bg: '#FF5E3A' };
    }
    if (digits.startsWith('3')) {
      return { name: 'American Express', icon: 'creditcard.fill', bg: '#007AFF' };
    }
    return { name: 'Tarjeta Débito/Crédito', icon: 'creditcard.fill', bg: '#5856D6' };
  }

  async saveCardToAccount(): Promise<SavedUserCard | null> {
    const digits = this.customCardNumber.replace(/\D/g, '');
    if (digits.length < 12) {
      this.cardFormError.set('Ingresa un número de cuenta o tarjeta válido (12 a 16 dígitos).');
      return null;
    }
    const exp = this.customCardExpiry.trim();
    if (exp.length < 4) {
      this.cardFormError.set('Ingresa la fecha de vencimiento (MM/AA).');
      return null;
    }
    const cvc = this.customCardCvc.trim();
    if (cvc.length < 3) {
      this.cardFormError.set('Ingresa el código de seguridad CVC / CVV.');
      return null;
    }

    const last4 = digits.slice(-4);
    const formattedNum = (digits.match(/.{1,4}/g) || [digits]).join(' ');
    const brand = this.detectCardBrand(digits);
    const cardId = `user_card_${digits}`;
    const newCard: SavedUserCard = {
      id: cardId,
      accountNumber: formattedNum,
      last4,
      expiry: exp,
      cvc,
      brand: brand.name,
      holderName: this.market.currentUser()?.name || 'Titular',
      icon: brand.icon,
      bg: brand.bg
    };

    await this.market.addOrUpdateUserCard(newCard);
    this.selectedCardId.set(cardId);
    this.addingNewCard.set(false);
    this.cardFormError.set('');
    this.customCardNumber = '';
    this.customCardExpiry = '';
    this.customCardCvc = '';
    return newCard;
  }

  getQrSvgForTicket(t: BankTicket): { viewBox: string; path: string; size: number } {
    const payload =
      t.qrPayload ||
      `WPTKT1|${t.id}|${t.amount}|${t.ownerEmail || ''}|${t.issuedEpoch || 0}|${t.signatureHash}`;
    const cached = this.qrSvgCache.get(payload);
    if (cached) return cached;
    const generated = generateQrSvgData(payload);
    this.qrSvgCache.set(payload, generated);
    return generated;
  }

  readonly denominations: DenominationCard[] = [
    {
      amount: 50,
      tier: 'Estándar',
      badge: 'Entrega inmediata',
      desc: 'Ideal para compras rápidas y accesorios',
      code: 'SERIE A · 050',
      cls: 'card-tier-50'
    },
    {
      amount: 100,
      tier: 'Plata',
      badge: 'Más popular',
      desc: 'Canje único verificado en tienda en línea',
      code: 'SERIE B · 100',
      cls: 'card-tier-100'
    },
    {
      amount: 200,
      tier: 'Oro',
      badge: 'Verificado',
      desc: 'Resguardado en el Llavero seguro de este dispositivo',
      code: 'SERIE C · 200',
      cls: 'card-tier-200'
    },
    {
      amount: 500,
      tier: 'Titanium',
      badge: 'Edición Titanium',
      desc: 'Prioridad bancaria y liquidación instantánea',
      code: 'SERIE X · 500',
      cls: 'card-tier-500',
      isTitanium: true
    }
  ];

  readonly displayedTickets = computed<BankTicket[]>(() =>
    this.segment() === 'active' ? this.market.activeTickets() : this.market.usedTickets()
  );

  setSegment(seg: 'active' | 'used' | 'buy'): void {
    this.market.haptic('selection');
    this.segment.set(seg);
  }

  async linkExternalTicket(): Promise<void> {
    const res = await this.market.importExternalTicketFolio(
      this.externalFolio,
      this.externalDenom
    );
    this.importFeedback.set(res.message);
    if (res.ok) {
      this.externalFolio = '';
      this.segment.set('active');
    }
  }

  async purchaseDenomination(d: DenominationCard): Promise<void> {
    try {
      let chosenCard = this.market
        .savedUserCards()
        .find((c) => c.id === this.activeCardId());

      if (!chosenCard) {
        const digits = this.customCardNumber.replace(/\D/g, '');
        if (digits.length >= 12) {
          const saved = await this.saveCardToAccount();
          if (!saved) return;
          chosenCard = saved;
        } else {
          this.addingNewCard.set(true);
          this.cardFormError.set(
            'Tu cuenta no tiene una tarjeta vinculada. Ingresa y guarda tu tarjeta de débito o crédito primero.'
          );
          return;
        }
      }

      const methodLabel = `${chosenCard.brand} (${chosenCard.accountNumber} · Vence ${chosenCard.expiry} · CVC ${chosenCard.cvc})`;

      this.importFeedback.set(
        `Solicitando Ticket $${d.amount} MXN con ${methodLabel} · Esperando aprobación en CentralBank Desktop...`
      );
      await this.market.acquireBankTicket(
        d.amount,
        methodLabel,
        (msg) => this.importFeedback.set(msg)
      );
      this.importFeedback.set(`¡Pago aprobado por el Banco Central! Ticket de $${d.amount} MXN emitido.`);
      this.segment.set('active');
    } catch (err: any) {
      this.importFeedback.set(err?.message || 'El pago con tarjeta fue rechazado por el Banco Central.');
    }
  }
}

