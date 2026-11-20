import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  BankTicket,
  TicketDenomination,
  WalletTransaction,
  AuditLogItem,
  WalletUserAccount
} from '../models/wallet.models';
import { environment } from '../../../environments/environment';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { BankCryptoService } from './bank-crypto.service';

@Injectable({
  providedIn: 'root'
})
export class WalletStateService {
  readonly isAuthenticated = signal<boolean>(false);
  readonly isDarkMode = signal<boolean>(false);
  readonly currentUserEmail = signal<string>('');
  readonly currentUserName = signal<string>('');
  readonly registeredUsers = signal<WalletUserAccount[]>([]);

  readonly currentUserInitials = computed(() => {
    const name = this.currentUserName().trim();
    if (!name) return 'US';
    return (
      name
        .split(' ')
        .filter((w) => w.length > 0)
        .map((w) => w[0])
        .join('')
        .substring(0, 2)
        .toUpperCase() || 'US'
    );
  });

  readonly dynamicIslandState = signal<{ expanded: boolean; label: string }>({
    expanded: false,
    label: 'Face ID'
  });

  readonly pointerVelocity = signal<number>(0);
  readonly springStateLabel = signal<string>('Settled (d=1.0)');

  private jwtToken: string | null = null;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private syncPollingTimer?: ReturnType<typeof setInterval>;

  // Todo proviene en tiempo real del Banco Central y se verifica antes de aceptarse
  readonly tickets = signal<BankTicket[]>([]);
  readonly transactions = signal<WalletTransaction[]>([]);
  readonly auditLogs = signal<AuditLogItem[]>([]);

  readonly activeTickets = computed(() => this.tickets().filter((t) => t.status === 'active'));
  readonly usedTickets = computed(() => this.tickets().filter((t) => t.status === 'used'));
  readonly availableBalance = computed(() =>
    this.activeTickets().reduce((acc, t) => acc + t.amount, 0)
  );
  readonly totalBought = computed(() =>
    this.transactions()
      .filter((tx) => tx.type === 'buy')
      .reduce((acc, tx) => acc + tx.amount, 0)
  );
  readonly totalRedeemed = computed(() =>
    this.transactions()
      .filter((tx) => tx.type === 'redeem')
      .reduce((acc, tx) => acc + tx.amount, 0)
  );

  private themeOverridden = false;

  constructor(
    private router: Router,
    private crypto: BankCryptoService
  ) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    this.applyTheme(media.matches);
    media.addEventListener('change', (e) => {
      if (!this.themeOverridden) this.applyTheme(e.matches);
    });
    this.fetchRegisteredUsers();
  }

  toggleTheme(): void {
    this.themeOverridden = true;
    this.applyTheme(!this.isDarkMode());
    this.haptic('light');
  }

  private applyTheme(dark: boolean): void {
    this.isDarkMode.set(dark);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
  }

  async haptic(kind: 'light' | 'medium' | 'selection' | 'success' | 'error' = 'light'): Promise<void> {
    try {
      if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'error') await Haptics.notification({ type: NotificationType.Error });
      else if (kind === 'selection') await Haptics.selectionChanged();
      else await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } catch {
      /* sin soporte háptico */
    }
  }

  getJwtSessionToken(): string | null {
    return this.jwtToken;
  }

  addAuditLog(category: AuditLogItem['category'], message: string): void {
    const time = new Date().toTimeString().split(' ')[0];
    this.auditLogs.update((prev) => [{ time, category, message }, ...prev]);
  }

  async triggerBiometricPulse(label: string, durationMs = 1000): Promise<void> {
    this.dynamicIslandState.set({ expanded: true, label });
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        this.dynamicIslandState.set({ expanded: false, label: 'Face ID' });
        setTimeout(resolve, 150);
      }, durationMs);
    });
  }

  async fetchRegisteredUsers(): Promise<void> {
    try {
      const data = await this.crypto.request('directory.list');
      if (data?.ok && Array.isArray(data.users)) {
        this.registeredUsers.set(data.users);
      }
    } catch {
      // CentralBank puede no estar iniciado aún
    }
  }

  private filterAuthenticTickets(raw: BankTicket[]): BankTicket[] {
    const valid: BankTicket[] = [];
    for (const t of raw) {
      if (this.crypto.isTicketAuthentic(t)) {
        valid.push(t);
      } else {
        this.addAuditLog('warn', `[Integridad] Ticket ${t?.id || 'desconocido'} descartado por datos alterados.`);
      }
    }
    return valid;
  }

  hasSavedDevicePass(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return false;
    return !!this.crypto.loadProtectedItem(`devpass_${clean}`);
  }

  async authenticateAccount(params: {
    mode: 'login' | 'register' | 'biometric';
    email: string;
    name?: string;
    password?: string;
  }): Promise<{ ok: boolean; error?: string; requirePassword?: boolean }> {
    const email = (params.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { ok: false, error: 'Escribe un correo electrónico válido.' };
    }

    try {
      let data: any;
      if (params.mode === 'register') {
        data = await this.crypto.request('auth.register', {
          email,
          name: (params.name || '').trim(),
          password: params.password || '',
          roleCode: 'buyer'
        });
      } else if (params.mode === 'biometric') {
        const deviceToken = this.crypto.loadProtectedItem(`devpass_${email}`);
        if (!deviceToken) {
          return {
            ok: false,
            requirePassword: true,
            error: 'Ingresa tu contraseña la primera vez en este dispositivo para activar Face ID.'
          };
        }
        data = await this.crypto.request('auth.biometric', {
          email,
          deviceToken,
          roleCode: 'buyer'
        });
      } else {
        data = await this.crypto.request('auth.login', {
          email,
          password: params.password || '',
          roleCode: 'buyer'
        });
      }

      if (!data?.ok) {
        if (data?.code === 'DEVICE_UNLOCK_REQUIRED') {
          this.crypto.removeProtectedItem(`devpass_${email}`);
          return {
            ok: false,
            requirePassword: true,
            error: data.error || 'Ingresa tu contraseña para continuar.'
          };
        }
        this.addAuditLog('warn', `[Acceso] Intento rechazado para ${email}: ${data?.error || 'Credenciales inválidas'}.`);
        return {
          ok: false,
          error: data?.error || 'Credenciales inválidas. Verifica tu correo y contraseña.'
        };
      }

      if (data.deviceToken) {
        this.crypto.saveProtectedItem(`devpass_${email}`, data.deviceToken);
      }

      const resolvedName = data.user?.name || params.name?.trim() || email.split('@')[0];
      this.currentUserEmail.set(email);
      this.currentUserName.set(resolvedName);
      if (Array.isArray(data.users)) this.registeredUsers.set(data.users);
      if (Array.isArray(data.tickets)) this.tickets.set(this.filterAuthenticTickets(data.tickets));
      if (Array.isArray(data.transactions)) this.transactions.set(data.transactions);

      await this.triggerBiometricPulse(`Hola, ${resolvedName.split(' ')[0]}`, 850);
      this.jwtToken = data.deviceToken || 'session-active';
      this.isAuthenticated.set(true);
      this.resetInactivityWatchdog();
      this.startRealtimeBankSync();
      this.addAuditLog('sec', `[Acceso] Sesión verificada para ${resolvedName} (${email}).`);
      this.router.navigateByUrl('/tabs/store');
      return { ok: true };
    } catch {
      this.addAuditLog('warn', 'No se pudo conectar con CentralBank (:5050).');
      return {
        ok: false,
        error: 'No se pudo conectar con el Banco Central (:5050). Asegúrate de que CentralBank esté abierto.'
      };
    }
  }

  private startRealtimeBankSync(): void {
    if (this.syncPollingTimer) clearInterval(this.syncPollingTimer);
    this.syncWithCentralBank();
    this.syncPollingTimer = setInterval(() => {
      if (this.isAuthenticated() && this.currentUserEmail()) {
        this.syncWithCentralBank();
      }
    }, 2000);
  }

  async syncWithCentralBank(): Promise<void> {
    if (!this.isAuthenticated() || !this.currentUserEmail()) return;

    try {
      const data = await this.crypto.request('state.sync');
      if (!data?.ok) {
        if (data?.code === 'UNAUTHORIZED') {
          this.lockSession('La sesión expiró en el Banco Central');
        }
        return;
      }

      if (Array.isArray(data.users)) {
        this.registeredUsers.set(data.users);
      }

      const revealedIds = new Set(
        this.tickets()
          .filter((t) => t.qrRevealed)
          .map((t) => t.id)
      );

      if (Array.isArray(data.tickets)) {
        const verified = this.filterAuthenticTickets(data.tickets).map((t) => ({
          ...t,
          qrRevealed: revealedIds.has(t.id)
        }));
        this.tickets.set(verified);
      }

      if (Array.isArray(data.transactions)) {
        this.transactions.set(data.transactions);
      }
    } catch {
      // Silenciar si CentralBank se está reiniciando
    }
  }

  lockSession(reason = 'Cambio de usuario / Cierre de sesión'): void {
    this.crypto.request('auth.logout').catch(() => {});
    this.jwtToken = null;
    this.isAuthenticated.set(false);
    this.tickets.set([]);
    this.transactions.set([]);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.syncPollingTimer) clearInterval(this.syncPollingTimer);
    this.addAuditLog('warn', `[Seguridad] ${reason}.`);
    this.fetchRegisteredUsers();
    this.router.navigateByUrl('/auth');
  }

  resetInactivityWatchdog(): void {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      if (this.isAuthenticated()) {
        this.lockSession('Caducidad automática tras 5 minutos de inactividad');
      }
    }, environment.sessionTimeoutMs);
  }

  async purchaseAndMintTicket(
    amount: TicketDenomination,
    _tier: string,
    _colorClass: string,
    paymentMethod: string
  ): Promise<BankTicket> {
    this.resetInactivityWatchdog();
    await this.triggerBiometricPulse('Emitiendo con Banco Central...', 950);

    const data = await this.crypto.request('tickets.purchase', {
      amount,
      paymentMethod
    });

    if (!data?.ok || !data.ticket) {
      throw new Error(data?.error || 'El Banco Central rechazó la emisión del ticket.');
    }

    const minted = data.ticket as BankTicket;
    if (!this.crypto.isTicketAuthentic(minted)) {
      throw new Error('El ticket recibido no superó la validación de autenticidad.');
    }

    await this.syncWithCentralBank();
    return minted;
  }

  async redeemTicketWithBank(ticketId: string): Promise<boolean> {
    await this.redirectToMarketStoreWithTicket(ticketId);
    return true;
  }

  async redirectToMarketStoreWithTicket(ticketId?: string): Promise<void> {
    this.resetInactivityWatchdog();
    const tkParam = ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : '';

    try {
      const res = await this.crypto.request('auth.handoff.create');
      if (res?.ok && res.handoffToken) {
        const targetUrl = `${environment.marketStoreUrl}/catalog?handoff=${encodeURIComponent(res.handoffToken)}${tkParam}`;
        window.open(targetUrl, '_blank');
        return;
      }
    } catch {
      // Si el banco no pudo emitir el pase, abrir la pantalla de acceso de la tienda
    }
    window.open(`${environment.marketStoreUrl}/auth`, '_blank');
  }

  async toggleTicketQrReveal(ticketId: string): Promise<void> {
    const target = this.tickets().find((t) => t.id === ticketId);
    if (!target || target.status !== 'active') return;

    if (!target.qrRevealed) {
      await this.triggerBiometricPulse('Desbloqueando QR', 850);
    }

    this.tickets.update((list) =>
      list.map((t) => (t.id === ticketId ? { ...t, qrRevealed: !t.qrRevealed } : t))
    );
  }
}
