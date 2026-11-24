import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarketStateService } from '../../core/services/market-state.service';
import { UserAccount, UserRole } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, SfSymbolComponent],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss'
})
export class AuthPage implements OnInit {
  readonly market = inject(MarketStateService);

  readonly selectedRole = signal<UserRole>('buyer');
  readonly usePassword = signal(true);
  readonly isRegistering = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly netConfigOpen = signal(false);
  readonly netConfigMsg = signal('');
  bankUrlInput = '';

  customName = '';
  email = '';
  password = '';

  private autoDiscoverTimer?: ReturnType<typeof setInterval>;

  async ngOnInit(): Promise<void> {
    await this.tryFetchAndSelectFirstUser();
    this.autoDiscoverTimer = setInterval(async () => {
      if (!this.market.isAuthenticated() && !this.market.bankConnected()) {
        await this.tryFetchAndSelectFirstUser();
      }
    }, 3500);
  }

  private async tryFetchAndSelectFirstUser(): Promise<void> {
    await this.market.fetchRegisteredUsers();
    const users = this.market.registeredUsers();
    if (users.length > 0 && !this.email) {
      this.selectRegisteredUser(users[0]);
    } else if (users.length === 0) {
      this.usePassword.set(true);
    }
  }

  openNetConfig(): void {
    this.bankUrlInput = this.market.crypto.getCustomBankUrl();
    this.netConfigMsg.set('');
    this.netConfigOpen.update((v) => !v);
  }

  async saveNetConfig(): Promise<void> {
    const res = await this.market.saveBankConnectionUrl(this.bankUrlInput);
    this.netConfigMsg.set(res.message);
    if (res.ok) {
      const users = this.market.registeredUsers();
      if (users.length > 0) {
        this.selectRegisteredUser(users[0]);
      }
      setTimeout(() => this.netConfigOpen.set(false), 900);
    }
  }

  showNameInput(): boolean {
    return this.isRegistering();
  }

  forgetDeviceAccount(emailToRemove: string): void {
    this.market.haptic('light');
    this.market.removeLocalDeviceAccount(emailToRemove);
    if (this.email.trim().toLowerCase() === emailToRemove.trim().toLowerCase()) {
      this.email = '';
      this.customName = '';
      this.password = '';
      this.usePassword.set(true);
    }
  }

  displaySelectedName(): string {
    if (this.customName.trim()) return this.customName.trim();
    const clean = this.email.trim().toLowerCase();
    const found = this.market.registeredUsers().find((u) => u.email.toLowerCase() === clean);
    if (found) return found.name;
    if (clean.includes('@')) return clean.split('@')[0];
    return 'Usuario';
  }

  selectRole(role: UserRole): void {
    this.market.haptic('selection');
    this.selectedRole.set(role);
    this.error.set('');
  }

  selectRegisteredUser(u: UserAccount): void {
    this.market.haptic('selection');
    this.customName = u.name;
    this.email = u.email;
    if (u.role === 'seller' || u.role === 'buyer') {
      this.selectedRole.set(u.role);
    }
    this.isRegistering.set(false);
    this.usePassword.set(!this.market.hasSavedDevicePass(u.email));
    this.error.set('');
  }

  openPasswordForm(): void {
    this.market.haptic('light');
    this.usePassword.set(true);
  }

  useFaceIdMode(): void {
    this.market.haptic('light');
    this.usePassword.set(false);
    this.isRegistering.set(false);
  }

  toggleRegisterMode(): void {
    this.market.haptic('selection');
    const next = !this.isRegistering();
    this.isRegistering.set(next);
    this.error.set('');
    if (next) {
      this.customName = '';
      this.email = '';
      this.password = '';
    }
  }

  async loginWithFaceId(): Promise<void> {
    const cleanEmail = this.email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      this.error.set('Ingresa tu correo electrónico o selecciona una cuenta registrada.');
      this.market.haptic('error');
      return;
    }

    this.market.haptic('light');
    this.busy.set(true);
    const res = await this.market.authenticateAccount({
      mode: 'biometric',
      role: this.selectedRole(),
      email: cleanEmail,
      name: this.customName.trim() || undefined
    });
    this.busy.set(false);

    if (!res.ok) {
      if (res.requirePassword) {
        this.usePassword.set(true);
      }
      this.error.set(res.error || 'No se pudo iniciar sesión.');
      this.market.haptic('error');
    }
  }

  async loginWithPassword(): Promise<void> {
    if ((this.isRegistering() || this.showNameInput()) && this.customName.trim().length < 2) {
      this.error.set('Escribe el nombre completo de la persona.');
      this.market.haptic('error');
      return;
    }
    if (!this.email.trim().includes('@')) {
      this.error.set('Escribe un correo electrónico válido.');
      this.market.haptic('error');
      return;
    }
    if (this.password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      this.market.haptic('error');
      return;
    }

    this.busy.set(true);
    const isNewAccount = this.isRegistering();
    const res = await this.market.authenticateAccount({
      mode: isNewAccount ? 'register' : 'login',
      role: this.selectedRole(),
      email: this.email.trim(),
      name: this.customName.trim() || undefined,
      password: this.password
    });
    this.busy.set(false);

    if (!res.ok) {
      this.error.set(res.error || 'Credenciales inválidas.');
      this.market.haptic('error');
    }
  }
}
