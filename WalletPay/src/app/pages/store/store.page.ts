import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonModal,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonSpinner
} from '@ionic/angular/standalone';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { SavedUserCard, TicketDenomination } from '../../core/models/wallet.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

interface Denomination {
  amount: TicketDenomination;
  tier: string;
  badge: string;
  desc: string;
  code: string;
  cls: string;
  isTitanium?: boolean;
}

interface PaymentMethod {
  id: string;
  title: string;
  sub: string;
  icon: string;
  tint: string;
  isCustom?: boolean;
  fullCardNumber?: string;
  expiry?: string;
  cvc?: string;
}

type SheetState = 'idle' | 'adding_card' | 'waiting_approval' | 'done' | 'rejected';

@Component({
  selector: 'app-store',
  standalone: true,
  imports: [
    CurrencyPipe,
    UpperCasePipe,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonModal,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
    SfSymbolComponent
  ],
  templateUrl: './store.page.html',
  styleUrl: './store.page.scss'
})
export class StorePage {
  readonly wallet = inject(WalletStateService);
  private readonly router = inject(Router);

  readonly denominations: Denomination[] = [
    {
      amount: 50,
      tier: 'Estándar',
      badge: 'Validación bancaria',
      desc: 'Ideal para compras rápidas y envíos',
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

  readonly speiMethod: PaymentMethod = {
    id: 'Transferencia SPEI',
    title: 'Transferencia SPEI',
    sub: 'CLABE interbancaria · Validación Banco Central',
    icon: 'building.columns',
    tint: '#007AFF'
  };

  readonly allPaymentMethods = computed<PaymentMethod[]>(() => [
    ...this.wallet.savedUserCards().map((c) => ({
      ...c,
      isCustom: true
    })),
    this.speiMethod
  ]);

  newCardNumber = '';
  newCardExpiry = '';
  newCardCvc = '';
  newCardAlias = '';
  readonly cardFormError = signal('');

  readonly sheetOpen = signal(false);
  readonly selected = signal<Denomination | null>(null);
  readonly ticketQuantity = signal<number>(1);
  readonly quickQuantities = [1, 2, 3, 5, 10];
  readonly payment = signal('');
  readonly state = signal<SheetState>('idle');
  readonly approvalProgressText = signal('Enviando solicitud de pago al Banco Central...');
  readonly currentRequestId = signal('');
  readonly rejectionReason = signal('');
  private cancelWaitingFlag = false;

  readonly payLabel = computed(() => {
    const d = this.selected();
    const qty = this.ticketQuantity();
    if (!d) return 'Realizar Pago';
    return qty > 1
      ? `Autorizar ${qty} tickets ($${d.amount * qty}.00 MXN)`
      : `Realizar Pago ($${d.amount}.00 MXN)`;
  });

  setQuantity(qty: number): void {
    const clean = Math.max(1, Math.min(50, Math.floor(qty || 1)));
    if (this.ticketQuantity() !== clean) {
      this.wallet.haptic('selection');
      this.ticketQuantity.set(clean);
    }
  }

  adjustQuantity(delta: number): void {
    this.setQuantity(this.ticketQuantity() + delta);
  }

  previewCardBrand(): { name: string; tint: string; gradient: string } {
    const digits = this.newCardNumber.replace(/\D/g, '');
    if (digits.startsWith('5') || digits.startsWith('2')) {
      return {
        name: this.newCardAlias.trim() || 'Mastercard Débito / Crédito',
        tint: '#EA580C',
        gradient: 'linear-gradient(135deg, #EA580C 0%, #9A1B1B 100%)'
      };
    }
    if (digits.startsWith('3')) {
      return {
        name: this.newCardAlias.trim() || 'American Express',
        tint: '#0284C7',
        gradient: 'linear-gradient(135deg, #0284C7 0%, #1E3A8A 100%)'
      };
    }
    return {
      name: this.newCardAlias.trim() || 'Visa Débito / Crédito',
      tint: '#204DC5',
      gradient: 'linear-gradient(135deg, #204DC5 0%, #0F256E 100%)'
    };
  }

  formatCardNumberInput(): void {
    const digits = this.newCardNumber.replace(/\D/g, '').substring(0, 16);
    const groups = digits.match(/.{1,4}/g) || [];
    this.newCardNumber = groups.join(' ');
    this.cardFormError.set('');
  }

  formatCardExpiryInput(): void {
    let digits = this.newCardExpiry.replace(/\D/g, '').substring(0, 4);
    if (digits.length >= 3) {
      this.newCardExpiry = `${digits.substring(0, 2)}/${digits.substring(2)}`;
    } else {
      this.newCardExpiry = digits;
    }
    this.cardFormError.set('');
  }

  formatCardCvcInput(): void {
    this.newCardCvc = this.newCardCvc.replace(/\D/g, '').substring(0, 4);
    this.cardFormError.set('');
  }

  openAddCardForm(): void {
    this.wallet.haptic('selection');
    this.newCardNumber = '';
    this.newCardExpiry = '';
    this.newCardCvc = '';
    this.newCardAlias = '';
    this.cardFormError.set('');
    this.state.set('adding_card');
  }

  cancelAddCard(): void {
    this.wallet.haptic('light');
    this.state.set('idle');
  }

  useSpeiWithoutCard(): void {
    this.wallet.haptic('selection');
    this.payment.set(this.speiMethod.id);
    this.state.set('idle');
  }

  async saveCustomCard(): Promise<void> {
    const digits = this.newCardNumber.replace(/\D/g, '');
    if (digits.length < 12) {
      this.cardFormError.set('Ingresa al menos 12 a 16 dígitos del número de tarjeta o cuenta.');
      this.wallet.haptic('error');
      return;
    }
    const exp = this.newCardExpiry.trim();
    if (!/^\d{2}\/\d{2}$/.test(exp)) {
      this.cardFormError.set('Ingresa la fecha de vencimiento en formato MM/AA (ej. 08/29).');
      this.wallet.haptic('error');
      return;
    }
    const cvc = this.newCardCvc.trim();
    if (cvc.length < 3) {
      this.cardFormError.set('Ingresa el código CVC / CVV de 3 o 4 dígitos.');
      this.wallet.haptic('error');
      return;
    }

    const brand = this.previewCardBrand();
    const formattedNum = (digits.match(/.{1,4}/g) || [digits]).join(' ');
    // Este ID viaja a CentralBank Desktop y permanece visible en la cuenta del usuario
    const methodId = `${brand.name} (${formattedNum} · Vence ${exp} · CVC ${cvc})`;

    const newCard: SavedUserCard = {
      id: methodId,
      title: `${brand.name} · ${formattedNum}`,
      sub: `Cuenta vinculada · Vence ${exp} · CVC ${cvc}`,
      icon: 'creditcard.fill',
      tint: brand.tint,
      fullCardNumber: formattedNum,
      expiry: exp,
      cvc,
      alias: this.newCardAlias.trim() || brand.name
    };

    await this.wallet.addOrUpdateUserCard(newCard);
    this.payment.set(methodId);
    this.wallet.haptic('success');
    this.state.set('idle');
  }

  async removeCustomCard(id: string): Promise<void> {
    this.wallet.haptic('light');
    await this.wallet.removeUserCard(id);
    const remaining = this.wallet.savedUserCards();
    if (this.payment() === id) {
      this.payment.set(remaining[0]?.id || '');
    }
  }

  open(d: Denomination): void {
    this.wallet.haptic('light');
    this.selected.set(d);
    this.ticketQuantity.set(1);
    this.cancelWaitingFlag = false;
    const saved = this.wallet.savedUserCards();
    if (saved.length === 0) {
      // Si el usuario aún no tiene ninguna tarjeta vinculada a su cuenta, pedirle que agregue su tarjeta primero
      this.payment.set('');
      this.openAddCardForm();
    } else {
      this.state.set('idle');
      if (!this.allPaymentMethods().some((m) => m.id === this.payment())) {
        this.payment.set(saved[0].id);
      }
    }
    this.sheetOpen.set(true);
  }

  close(): void {
    this.cancelWaitingFlag = true;
    this.sheetOpen.set(false);
  }

  selectMethod(id: string): void {
    if (this.payment() !== id) this.wallet.haptic('selection');
    this.payment.set(id);
  }

  async confirm(): Promise<void> {
    const d = this.selected();
    if (!d || this.state() === 'waiting_approval') return;

    // Si intenta pagar con tarjeta pero aún no tiene ninguna tarjeta vinculada ni seleccionó SPEI, abrir formulario para vincular su tarjeta
    if (!this.payment() || (this.payment() !== this.speiMethod.id && this.wallet.savedUserCards().length === 0)) {
      this.openAddCardForm();
      return;
    }

    this.cancelWaitingFlag = false;
    this.currentRequestId.set('');
    this.state.set('waiting_approval');
    this.approvalProgressText.set(
      'Conectando con CentralBank Desktop (:7070) para validar tu tarjeta...'
    );

    const result = await this.wallet.requestAndWaitTicketPurchaseApproval(
      d.amount,
      this.payment(),
      (progressMsg, reqId) => {
        this.approvalProgressText.set(progressMsg);
        if (reqId) this.currentRequestId.set(reqId);
      },
      () => this.cancelWaitingFlag,
      this.ticketQuantity()
    );

    if (this.cancelWaitingFlag) return;

    if (!result.ok) {
      this.rejectionReason.set(
        result.error || 'El Administrador del Banco Central rechazó el pago con tarjeta.'
      );
      this.state.set('rejected');
      this.wallet.haptic('error');
      return;
    }

    this.state.set('done');
    this.wallet.haptic('success');

    setTimeout(() => {
      this.sheetOpen.set(false);
      this.router.navigateByUrl('/tabs/vault');
    }, 1200);
  }

  onDismiss(): void {
    this.cancelWaitingFlag = true;
    this.sheetOpen.set(false);
    this.state.set('idle');
  }

  goToVault(): void {
    this.router.navigateByUrl('/tabs/vault');
  }
}
