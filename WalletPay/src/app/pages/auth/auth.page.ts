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
  template: `
    <ion-content [fullscreen]="true">
      <main class="auth">
        <!-- Barra superior de estado de conexión automática con CentralBank y Vercel -->
        <header class="net-bar">
          <div class="net-pill continuous" [class.ok]="wallet.bankConnected()">
            <span class="net-dot"></span>
            <span>
              {{
                wallet.bankConnected()
                  ? 'Banco Central Conectado Automáticamente'
                  : 'Descubriendo Banco Central Automáticamente…'
              }}
            </span>
          </div>

          <button
            type="button"
            class="theme-pill continuous apple-pressable"
            (click)="wallet.toggleTheme()"
            aria-label="Cambiar apariencia"
          >
            <sf-symbol name="circle.lefthalf.filled" [size]="18" />
          </button>
        </header>

        <section class="brand">
          <div class="app-icon-img-wrap" aria-hidden="true">
            <img src="assets/walletpay-icon.png" alt="WalletPay" class="app-icon-img" />
          </div>
          <h1>WalletPay</h1>
          <p>Bóveda móvil de tickets del Banco Central sincronizada con MarketStore en Vercel.</p>
        </section>

        @if (wallet.registeredUsers().length > 0 && !isRegistering()) {
          <section class="accounts-box">
            <span class="sec-label">MI CUENTA GUARDADA EN ESTE DISPOSITIVO</span>
            <div class="accounts-list">
              @for (u of wallet.registeredUsers(); track u.email) {
                <div
                  class="account-pill continuous apple-pressable"
                  [class.selected]="email.toLowerCase() === u.email.toLowerCase()"
                  (click)="selectRegisteredUser(u)"
                >
                  <span class="av" [style.background]="u.avatarHex || '#007AFF'">
                    {{ u.avatarInitials }}
                  </span>
                  <div class="ac-meta">
                    <strong>{{ u.name }}</strong>
                    <span>{{ u.email }} · Este dispositivo</span>
                  </div>
                  @if (email.toLowerCase() === u.email.toLowerCase()) {
                    <sf-symbol name="checkmark" [size]="16" [weight]="2.6" />
                  }
                  <button
                    type="button"
                    class="forget-btn"
                    title="Olvidar cuenta de este dispositivo"
                    (click)="$event.stopPropagation(); forgetDeviceAccount(u.email)"
                  >
                    <sf-symbol name="xmark" [size]="12" [weight]="2.4" />
                  </button>
                </div>
              }
            </div>
          </section>
        }

        <section class="actions">
          <div class="mode-segmented continuous">
            <button
              type="button"
              class="seg-btn"
              [class.active]="!isRegistering()"
              (click)="setRegisterMode(false)"
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              class="seg-btn"
              [class.active]="isRegistering()"
              (click)="setRegisterMode(true)"
            >
              + Nueva Persona
            </button>
          </div>

          <ion-list [inset]="true" class="credentials">
            @if (isRegistering() || showNameField()) {
              <ion-item>
                <ion-input
                  label="Nombre"
                  labelPlacement="fixed"
                  type="text"
                  placeholder="Ej. Valeria Ríos"
                  [(ngModel)]="fullName"
                  (ionInput)="error.set('')"
                />
              </ion-item>
            }
            <ion-item>
              <ion-input
                label="Correo"
                labelPlacement="fixed"
                type="email"
                inputmode="email"
                autocomplete="username"
                placeholder="usuario@correo.mx"
                [(ngModel)]="email"
                (ionInput)="error.set('')"
              />
            </ion-item>
            @if (usePassword() || isRegistering()) {
              <ion-item lines="none">
                <ion-input
                  label="Contraseña"
                  labelPlacement="fixed"
                  type="password"
                  autocomplete="current-password"
                  placeholder="Mínimo 6 caracteres"
                  [(ngModel)]="password"
                  (ionInput)="error.set('')"
                  (keyup.enter)="submitAuth()"
                />
              </ion-item>
            }
          </ion-list>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          @if (isRegistering()) {
            <button
              class="btn-filled continuous apple-pressable"
              [disabled]="busy()"
              (click)="submitAuth()"
            >
              <sf-symbol name="checkmark.circle.fill" [size]="20" />
              <span>Crear Cuenta Personal e Ingresar</span>
            </button>
          } @else if (!usePassword()) {
            <button
              class="btn-filled continuous apple-pressable"
              [disabled]="busy()"
              (click)="loginWithFaceId()"
            >
              <sf-symbol name="faceid" [size]="22" [weight]="2" />
              <span>Iniciar con Face ID ({{ displayActiveName() }})</span>
            </button>
            <button class="btn-plain" (click)="usePassword.set(true)">
              Ingresar con correo y contraseña
            </button>
          } @else {
            <button
              class="btn-filled continuous apple-pressable"
              [disabled]="busy()"
              (click)="submitAuth()"
            >
              Iniciar sesión
            </button>
            <button class="btn-plain" (click)="usePassword.set(false)">
              <sf-symbol name="faceid" [size]="18" />
              <span>Usar Face ID</span>
            </button>
          }

          <p class="legal">
            Sincronización automática con <strong>CentralBank</strong> y <strong>MarketStore (Vercel)</strong>.
          </p>
        </section>
      </main>
    </ion-content>
  `,
  styles: [`
    .auth {
      min-height: 100%;
      max-width: 460px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: calc(env(safe-area-inset-top, 0px) + 12px) 0 calc(env(safe-area-inset-bottom, 0px) + 20px);
      gap: 12px;
    }

    .net-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
    }
    .net-pill {
      --r: 999px;
      border: 0;
      padding: 6px 12px;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .net-pill.ok {
      color: var(--ion-color-success);
    }
    .net-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #FF9500;
    }
    .net-pill.ok .net-dot {
      background: #30D158;
    }
    .theme-pill {
      --r: 11px;
      width: 34px;
      height: 34px;
      border: 0;
      background: var(--ios-cell);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 4px 28px 4px;
    }

    .app-icon-img-wrap {
      width: 88px;
      height: 88px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 10px 22px rgba(32, 77, 197, 0.34));
    }
    .app-icon-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    h1 {
      margin: 0 0 6px;
      font-size: 29px;
      font-weight: 700;
      letter-spacing: -0.022em;
      color: var(--ios-label);
    }
    .brand p {
      margin: 0;
      max-width: 320px;
      font-size: 14px;
      line-height: 1.35;
      color: var(--ios-label-2);
    }

    .accounts-box {
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sec-label {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
      padding-left: 4px;
    }
    .accounts-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 165px;
      overflow-y: auto;
    }
    .account-pill {
      --r: 14px;
      border: 1px solid transparent;
      background: var(--ios-cell);
      color: var(--ios-label);
      padding: 9px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      font-family: inherit;
    }
    .account-pill.selected {
      border-color: var(--ion-color-primary);
      background: rgba(0, 122, 255, 0.1);
    }
    .av {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      color: #fff;
      font-size: 12.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .ac-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .ac-meta strong {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ac-meta span {
      font-size: 12px;
      color: var(--ios-label-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .forget-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 0;
      background: rgba(142, 142, 147, 0.18);
      color: var(--ios-label-2);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .mode-segmented {
      --r: 11px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--ios-fill);
      padding: 3px;
      gap: 3px;
      margin-bottom: 4px;
    }
    .seg-btn {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 10px;
      border-radius: 8.5px;
    }
    .seg-btn.active {
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0 20px;
    }

    .btn-filled {
      --r: 14px;
      height: 50px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-family: inherit;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn-filled:disabled { opacity: 0.5; }

    .btn-plain {
      height: 40px;
      border: 0;
      background: transparent;
      color: var(--ion-color-primary);
      font-family: inherit;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .credentials {
      margin: 0 0 6px !important;
    }

    .error {
      margin: 0 4px 6px;
      font-size: 13px;
      color: var(--ion-color-danger);
    }

    .legal {
      margin: 4px 0 0;
      text-align: center;
      font-size: 11.5px;
      color: var(--ios-label-2);
    }

    /* Sheet de red */
    .net-sheet {
      padding: 12px 18px 26px;
    }
    .net-desc {
      margin: 6px 0 14px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--ios-label-2);
    }
    .net-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .net-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .net-field span {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--ios-label-2);
    }
    .net-field input {
      height: 42px;
      border-radius: 11px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label);
      padding: 0 12px;
      font-size: 13.5px;
      font-family: var(--font-mono);
      outline: none;
    }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .p-chip {
      border: 0;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 11.5px;
      font-weight: 600;
    }
    .net-msg {
      margin: 2px 0;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--ion-color-danger);
    }
    .net-msg.ok {
      color: var(--ion-color-success);
    }
  `]
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
