import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonList, IonItem, IonInput, IonModal } from '@ionic/angular/standalone';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { WalletUserAccount } from '../../core/models/wallet.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, IonContent, IonList, IonItem, IonInput, IonModal, SfSymbolComponent],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss'
})
export class AuthPage implements OnInit {
  readonly wallet = inject(WalletStateService);

  readonly usePassword = signal(true);
  readonly isRegistering = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly netModalOpen = signal(false);
  readonly testingNet = signal(false);
  readonly netFeedback = signal('');
  bankUrlInput = '';
  storeUrlInput = '';

  fullName = '';
  email = '';
  password = '';

  private autoDiscoverTimer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.wallet.fetchRegisteredUsers();
    const localAccs = this.wallet.registeredUsers();
    if (localAccs.length > 0 && !this.email) {
      this.selectRegisteredUser(localAccs[0]);
    } else {
      this.usePassword.set(true);
    }
    this.autoDiscoverTimer = setInterval(() => {
      if (!this.wallet.isAuthenticated() && !this.wallet.bankConnected()) {
        this.wallet.fetchRegisteredUsers();
      }
    }, 3500);
  }

  openNetModal(): void {
    this.bankUrlInput = this.wallet.crypto.getCustomBankUrl();
    this.storeUrlInput = this.wallet.crypto.getMarketStoreUrl();
    this.netFeedback.set('');
    this.netModalOpen.set(true);
  }

  async saveAndTestNet(): Promise<void> {
    this.testingNet.set(true);
    const res = await this.wallet.saveNetworkSettings(this.bankUrlInput, this.storeUrlInput);
    this.testingNet.set(false);
    this.netFeedback.set(res.message);
    if (res.ok) {
      this.wallet.haptic('success');
      setTimeout(() => this.netModalOpen.set(false), 750);
    } else {
      this.wallet.haptic('error');
    }
  }

  showNameField(): boolean {
    return this.isRegistering();
  }

  forgetDeviceAccount(emailToRemove: string): void {
    this.wallet.haptic('light');
    this.wallet.removeLocalDeviceAccount(emailToRemove);
    if (this.email.trim().toLowerCase() === emailToRemove.trim().toLowerCase()) {
      this.email = '';
      this.fullName = '';
      this.password = '';
      this.usePassword.set(true);
    }
  }

  displayActiveName(): string {
    if (this.fullName.trim()) return this.fullName.trim();
    const clean = this.email.trim().toLowerCase();
    const found = this.wallet.registeredUsers().find((u) => u.email.toLowerCase() === clean);
    if (found) return found.name;
    if (clean.includes('@')) return clean.split('@')[0];
    return 'Titular';
  }

  setRegisterMode(reg: boolean): void {
    this.wallet.haptic('selection');
    this.isRegistering.set(reg);
    this.error.set('');
    if (reg) {
      this.fullName = '';
      this.email = '';
      this.password = '';
    }
  }

  selectRegisteredUser(u: WalletUserAccount): void {
    this.wallet.haptic('selection');
    this.email = u.email;
    this.fullName = u.name;
    this.isRegistering.set(false);
    this.usePassword.set(!this.wallet.hasSavedDevicePass(u.email));
    this.error.set('');
  }

  async loginWithFaceId(): Promise<void> {
    const cleanEmail = this.email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      this.error.set('Ingresa tu correo electrónico o selecciona una persona registrada.');
      this.wallet.haptic('error');
      return;
    }
    this.wallet.haptic('light');
    this.busy.set(true);
    const res = await this.wallet.authenticateAccount({
      mode: 'biometric',
      email: cleanEmail,
      name: this.fullName.trim()
    });
    this.busy.set(false);

    if (!res.ok) {
      if (res.requirePassword) {
        this.usePassword.set(true);
      }
      this.error.set(res.error || 'No se pudo iniciar sesión.');
      this.wallet.haptic('error');
    }
  }

  async submitAuth(): Promise<void> {
    if (this.isRegistering() && this.fullName.trim().length < 2) {
      this.error.set('Escribe el nombre completo de la persona.');
      this.wallet.haptic('error');
      return;
    }
    if (!this.email.trim().includes('@')) {
      this.error.set('Escribe un correo electrónico válido.');
      this.wallet.haptic('error');
      return;
    }
    if (this.password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      this.wallet.haptic('error');
      return;
    }

    this.busy.set(true);
    const res = await this.wallet.authenticateAccount({
      mode: this.isRegistering() ? 'register' : 'login',
      email: this.email.trim(),
      name: this.fullName.trim(),
      password: this.password
    });
    this.busy.set(false);

    if (!res.ok) {
      this.error.set(res.error || 'Credenciales inválidas.');
      this.wallet.haptic('error');
    }
  }
}
