import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarketStateService } from '../../core/services/market-state.service';
import { UserAccount, UserRole } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, SfSymbolComponent],
  template: `
    <div class="auth-page">
      <!-- Barra superior minimalista con estado de conexión automática al Banco Central y control de tema -->
      <header class="auth-topbar">
        <div class="topbar-left">

          <div
            class="topbar-badge net-btn continuous"
            [class.ok]="market.bankConnected()"
          >
            <span class="net-dot"></span>
            <span>
              {{
                market.bankConnected()
                  ? 'Banco Central Conectado Automáticamente'
                  : 'Conectando Automáticamente con Banco Central…'
              }}
            </span>
          </div>
        </div>

        <button
          type="button"
          class="theme-btn continuous apple-pressable"
          (click)="market.toggleTheme()"
          aria-label="Cambiar apariencia claro u oscuro"
        >
          <sf-symbol name="circle.lefthalf.filled" [size]="20" />
        </button>
      </header>

      <main class="auth-grid">
        <!-- Tarjeta de Control de Acceso Multi-Usuario tipo iOS -->
        <section class="auth-card continuous">
          <div class="brand">
            <div class="app-icon-logo continuous" aria-hidden="true">
              <img src="assets/logos/marketstore-icon.png" alt="Market Store Icono" />
            </div>
            <h1>Market Store</h1>
            <p>
              {{
                selectedRole() === 'buyer'
                  ? 'Selecciona tu cuenta personal o registra una nueva persona para comprar con tus tickets de WalletPay.'
                  : 'Inicia sesión como Vendedor para gestionar colecciones, inventario y auditar órdenes.'
              }}
            </p>
          </div>

          <!-- Segmented Control nativo de iOS para elegir Rol: Comprador vs Vendedor -->
          <div class="role-selector-wrap">
            <span class="role-label">1. SELECCIONA TU PERFIL DE ACCESO</span>
            <div class="role-segmented continuous" role="tablist" aria-label="Tipo de cuenta">
              <button
                type="button"
                role="tab"
                class="seg-option apple-pressable"
                [class.active]="selectedRole() === 'buyer'"
                [attr.aria-selected]="selectedRole() === 'buyer'"
                (click)="selectRole('buyer')"
              >
                <sf-symbol name="bag" [size]="16" [weight]="2" />
                <span>Cliente Comprador</span>
              </button>
              <button
                type="button"
                role="tab"
                class="seg-option apple-pressable"
                [class.active]="selectedRole() === 'seller'"
                [attr.aria-selected]="selectedRole() === 'seller'"
                (click)="selectRole('seller')"
              >
                <sf-symbol name="storefront" [size]="16" [weight]="2" />
                <span>Cliente Vendedor</span>
              </button>
            </div>
          </div>

          <!-- Lista de Personas Guardadas Localmente en ESTE Dispositivo (Privacidad Multi-Dispositivo) -->
          @if (market.registeredUsers().length > 0 && !isRegistering()) {
            <div class="registered-box">
              <span class="role-label">2. MI CUENTA GUARDADA EN ESTE DISPOSITIVO</span>
              <div class="registered-list">
                @for (u of market.registeredUsers(); track u.email) {
                  <div
                    class="reg-user-pill continuous apple-pressable"
                    [class.selected]="email.toLowerCase() === u.email.toLowerCase()"
                    (click)="selectRegisteredUser(u)"
                  >
                    <div class="avatar continuous" [style.background]="u.avatarHex || '#007AFF'">
                      {{ u.avatarInitials }}
                    </div>
                    <div class="prof-meta">
                      <strong>{{ u.name }}</strong>
                      <span>
                        {{ u.email }} · Este dispositivo
                      </span>
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
            </div>
          }

          <div class="actions">
            <!-- Campos de Identidad del Usuario (Permite que cualquier persona ingrese o se registre) -->
            <div class="ios-inset-group continuous">
              @if (isRegistering() || showNameInput()) {
                <label class="ios-field">
                  <span class="field-lbl">Nombre</span>
                  <input
                    type="text"
                    placeholder="Nombre completo de la persona"
                    [(ngModel)]="customName"
                    (input)="error.set('')"
                  />
                </label>
              }
              <label class="ios-field">
                <span class="field-lbl">Correo</span>
                <input
                  type="email"
                  inputmode="email"
                  autocomplete="username"
                  placeholder="usuario@correo.mx"
                  [(ngModel)]="email"
                  (input)="error.set('')"
                />
              </label>
              @if (usePassword() || isRegistering()) {
                <label class="ios-field">
                  <span class="field-lbl">Contraseña</span>
                  <input
                    type="password"
                    autocomplete="current-password"
                    placeholder="Mínimo 6 caracteres"
                    [(ngModel)]="password"
                    (input)="error.set('')"
                    (keyup.enter)="loginWithPassword()"
                  />
                </label>
              }
            </div>

            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }

            @if (!usePassword() && !isRegistering()) {
              <button
                type="button"
                class="btn-filled continuous apple-pressable"
                [disabled]="busy()"
                (click)="loginWithFaceId()"
              >
                <sf-symbol name="faceid" [size]="22" [weight]="2" />
                <span>
                  Iniciar como {{ displaySelectedName() }} ({{ selectedRole() === 'buyer' ? 'Comprador' : 'Vendedor' }})
                </span>
              </button>
              <div class="sub-links">
                <button type="button" class="btn-plain apple-pressable" (click)="openPasswordForm()">
                  Usar contraseña
                </button>
                <button type="button" class="btn-plain apple-pressable" (click)="toggleRegisterMode()">
                  + Registrar nueva persona
                </button>
              </div>
            } @else {
              <button
                type="button"
                class="btn-filled continuous apple-pressable"
                [disabled]="busy()"
                (click)="loginWithPassword()"
              >
                {{
                  isRegistering()
                    ? 'Registrar Persona e Iniciar Sesión'
                    : 'Iniciar sesión como ' + (selectedRole() === 'buyer' ? 'Comprador' : 'Vendedor')
                }}
              </button>

              <div class="sub-links">
                <button type="button" class="btn-plain" (click)="useFaceIdMode()">
                  <sf-symbol name="faceid" [size]="17" />
                  <span>Usar Face ID</span>
                </button>
                <button type="button" class="btn-plain" (click)="toggleRegisterMode()">
                  {{ isRegistering() ? 'Elegir cuenta existente' : '+ Registrar nueva persona' }}
                </button>
              </div>
            }

            <p class="legal">
              Usa el mismo correo con el que compraste tus tickets en <strong>WalletPay</strong>.
            </p>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px);
      background:
        radial-gradient(80% 60% at 15% 10%, rgba(0, 122, 255, 0.08) 0%, transparent 60%),
        radial-gradient(70% 50% at 85% 90%, rgba(124, 58, 237, 0.08) 0%, transparent 60%),
        var(--ion-background-color);
    }

    .auth-topbar {
      max-width: 480px;
      width: 100%;
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }

    .topbar-badge {
      --r: 999px;
      padding: 6px 12px;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-size: 11.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 0;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .net-btn {
      cursor: pointer;
    }
    .net-btn.ok {
      color: var(--ion-color-success);
    }
    .net-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #FF9500;
    }
    .net-btn.ok .net-dot {
      background: #30D158;
    }

    .net-config-bar {
      --r: 18px;
      max-width: 1120px;
      width: 100%;
      margin: 0 auto 16px;
      padding: 14px 18px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-card);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ncb-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ncb-copy strong {
      font-size: 13.5px;
    }
    .ncb-copy span {
      font-size: 12px;
      color: var(--ios-label-2);
    }
    .ncb-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ncb-input {
      flex: 1;
      min-width: 220px;
      height: 38px;
      border-radius: 10px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label);
      padding: 0 12px;
      font-family: var(--font-mono);
      font-size: 13px;
      outline: none;
    }
    .ncb-preset {
      border: 0;
      height: 38px;
      padding: 0 12px;
      border-radius: 10px;
      background: var(--ios-cell);
      color: var(--ion-color-primary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .ncb-save {
      border: 0;
      height: 38px;
      padding: 0 16px;
      border-radius: 10px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .ncb-msg {
      font-size: 12px;
      font-weight: 600;
      color: var(--ion-color-danger);
    }
    .ncb-msg.ok {
      color: var(--ion-color-success);
    }

    .theme-btn {
      --r: 12px;
      width: 40px;
      height: 40px;
      border: 0;
      background: var(--ios-cell);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .auth-grid {
      max-width: 460px;
      width: 100%;
      margin: auto;
      display: flex;
      flex-direction: column;
    }

    .ecosystem-showcase {
      --r: 28px;
      padding: 30px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 22px;
    }

    .eco-brand-banner {
      --r: 18px;
      padding: 12px 16px;
      background: #2B70EA;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 8px 22px rgba(43, 112, 234, 0.25);
    }
    .eco-horizontal-logo {
      height: 44px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .eco-official-tag {
      padding: 5px 11px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }

    .app-icon-logo {
      --r: 20px;
      width: 74px;
      height: 74px;
      margin-bottom: 12px;
      overflow: hidden;
      background: #2B70EA;
      box-shadow: 0 10px 24px rgba(43, 112, 234, 0.28);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .app-icon-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .eco-eyebrow {
      display: inline-block;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: var(--ion-color-primary);
      margin-bottom: 8px;
    }
    .eco-header h2 {
      margin: 0 0 10px;
      font-size: clamp(24px, 2.6vw, 32px);
      font-weight: 800;
      line-height: 1.12;
      letter-spacing: -0.03em;
    }
    .eco-header p {
      margin: 0;
      font-size: 15px;
      line-height: 1.45;
      color: var(--ios-label-2);
    }

    .tickets-fan {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .fan-card {
      --r: 16px;
      padding: 14px 12px;
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 92px;
      box-shadow: var(--ios-shadow-card);
    }
    .fan-card span {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      opacity: 0.85;
    }
    .fan-card strong {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .fan-card small {
      font-size: 11px;
      opacity: 0.8;
    }

    .eco-steps {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .eco-step {
      display: flex;
      align-items: center;
      gap: 13px;
    }
    .step-icon {
      --r: 12px;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .eco-step div {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .eco-step strong {
      font-size: 14px;
      font-weight: 600;
    }
    .eco-step span {
      font-size: 12.5px;
      color: var(--ios-label-2);
    }

    .auth-card {
      --r: 28px;
      padding: 28px 26px;
      background: var(--ios-card-elevated);
      box-shadow: var(--ios-shadow-card);
      border: 0.5px solid var(--ios-separator);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    }

    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .app-icon {
      --r: 20px;
      position: relative;
      width: 72px;
      height: 72px;
      margin-bottom: 12px;
      overflow: hidden;
      background: linear-gradient(180deg, #2C2C2E 0%, #000 100%);
      box-shadow: var(--ios-shadow-card);
    }
    .pass {
      position: absolute;
      left: 12px;
      right: 12px;
      height: 20px;
      border-radius: 5px;
    }
    .p1 { top: 10px; background: #0A84FF; }
    .p2 { top: 19px; background: #FF9F0A; }
    .p3 { top: 28px; background: #30D158; }
    .pocket {
      position: absolute;
      left: 9px;
      right: 9px;
      bottom: 9px;
      height: 30px;
      border-radius: 7px;
      background: #3A3A3C;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.45);
    }

    h1 {
      margin: 0 0 4px;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.025em;
    }
    .brand p {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.38;
      color: var(--ios-label-2);
      max-width: 340px;
    }

    .role-selector-wrap,
    .registered-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .role-label {
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--ios-label-2);
      padding-left: 4px;
    }
    .role-segmented {
      --r: 12px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 3px;
      background: var(--ios-fill);
      gap: 3px;
    }
    .seg-option {
      border: 0;
      background: transparent;
      color: var(--ios-label-2);
      font-size: 13px;
      font-weight: 600;
      padding: 8px 10px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .seg-option.active {
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }

    .registered-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 145px;
      overflow-y: auto;
    }
    .reg-user-pill {
      --r: 14px;
      border: 1.5px solid transparent;
      padding: 9px 12px;
      background: var(--ios-cell);
      color: var(--ios-label);
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      width: 100%;
    }
    .reg-user-pill.selected {
      border-color: var(--ion-color-primary);
      background: rgba(0, 122, 255, 0.1);
    }
    .avatar {
      --r: 11px;
      width: 36px;
      height: 36px;
      background: var(--ion-color-primary);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .prof-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .prof-meta strong {
      font-size: 13.5px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .prof-meta span {
      font-size: 11.5px;
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
      cursor: pointer;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .btn-filled {
      --r: 14px;
      height: 48px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn-filled:disabled { opacity: 0.5; }

    .btn-plain {
      height: 34px;
      border: 0;
      background: transparent;
      color: var(--ion-color-primary);
      font-size: 13.5px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
    }

    .sub-links {
      display: flex;
      justify-content: space-between;
      padding: 0 4px;
    }

    .ios-inset-group {
      --r: 14px;
      background: var(--ios-cell);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .ios-field {
      display: flex;
      align-items: center;
      padding: 0 14px;
      height: 42px;
      border-bottom: 0.5px solid var(--ios-separator);
    }
    .ios-field:last-child {
      border-bottom: 0;
    }
    .field-lbl {
      width: 88px;
      font-size: 14px;
      font-weight: 500;
      color: var(--ios-label);
      flex-shrink: 0;
    }
    .ios-field input {
      flex: 1;
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 14px;
      outline: none;
    }

    .error {
      margin: 0 4px;
      font-size: 13px;
      color: var(--ion-color-danger);
    }

    .legal {
      margin: 2px 0 0;
      text-align: center;
      font-size: 12px;
      color: var(--ios-label-2);
    }

    @media (max-width: 520px) {
      .auth-page {
        padding: calc(env(safe-area-inset-top, 0px) + 12px) 14px calc(env(safe-area-inset-bottom, 0px) + 20px);
      }
      .auth-card {
        padding: 22px 16px;
      }
      .sub-links {
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
      }
    }
  `]
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
