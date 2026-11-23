import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  BankTicket,
  TicketDenomination,
  TicketPurchaseRequest,
  WalletTransaction,
  AuditLogItem,
  WalletUserAccount,
  SavedUserCard
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

  readonly bankConnected = signal<boolean>(false);
  readonly activeBankUrl = signal<string>(environment.bankApiUrl);
  readonly activeStoreUrl = signal<string>(environment.marketStoreUrl);
  readonly networkModalOpen = signal<boolean>(false);

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
  readonly ticketRequests = signal<TicketPurchaseRequest[]>([]);
  readonly transactions = signal<WalletTransaction[]>([]);
  readonly savedUserCards = signal<SavedUserCard[]>([]);
  readonly auditLogs = signal<AuditLogItem[]>([]);

  readonly activeTickets = computed(() => this.tickets().filter((t) => t.status === 'active'));
  readonly usedTickets = computed(() => this.tickets().filter((t) => t.status === 'used'));
  readonly pendingTicketRequests = computed(() =>
    this.ticketRequests().filter((r) => r.approvalStatus === 'pending')
  );
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
    public crypto: BankCryptoService
  ) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    this.applyTheme(media.matches);
    media.addEventListener('change', (e) => {
      if (!this.themeOverridden) this.applyTheme(e.matches);
    });
    this.activeBankUrl.set(this.crypto.getCustomBankUrl());
    this.activeStoreUrl.set(this.crypto.getMarketStoreUrl());
    this.loadLocalDeviceAccounts();
    this.fetchRegisteredUsers();
  }

  /**
   * Carga únicamente las cuentas que han iniciado sesión físicamente en ESTE dispositivo móvil,
   * garantizando privacidad absoluta: ninguna cuenta de otro dispositivo aparece aquí.
   */
  private loadLocalDeviceAccounts(): void {
    try {
      const raw = localStorage.getItem('wp_local_device_accounts_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.registeredUsers.set(parsed);
          return;
        }
      }
    } catch {}
    this.registeredUsers.set([]);
  }

  private rememberLocalDeviceAccount(user: Partial<WalletUserAccount> & { email: string }): void {
    if (!user || !user.email) return;
    const cleanEmail = user.email.trim().toLowerCase();
    const current = this.registeredUsers().filter((u) => u.email.trim().toLowerCase() !== cleanEmail);
    const updated: WalletUserAccount[] = [
      {
        id: user.id || `USR-${cleanEmail.substring(0, 4).toUpperCase()}`,
        name: user.name || cleanEmail.split('@')[0],
        email: cleanEmail,
        avatarInitials: user.avatarInitials || this.currentUserInitials(),
        avatarHex: user.avatarHex || '#007AFF',
        unusedTicketsCount: user.unusedTicketsCount || 0,
        unusedBalance: user.unusedBalance || 0
      },
      ...current
    ];
    this.registeredUsers.set(updated);
    try {
      localStorage.setItem('wp_local_device_accounts_v2', JSON.stringify(updated));
    } catch {}
  }

  removeLocalDeviceAccount(email: string): void {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return;
    this.crypto.removeProtectedItem(`devpass_${clean}`);
    const filtered = this.registeredUsers().filter((u) => u.email.trim().toLowerCase() !== clean);
    this.registeredUsers.set(filtered);
    try {
      localStorage.setItem('wp_local_device_accounts_v2', JSON.stringify(filtered));
    } catch {}
  }

  private loadAccountCards(email: string, serverSavedCardsJson?: string): void {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) {
      this.savedUserCards.set([]);
      return;
    }

    // 1. Si el servidor devolvió tarjetas vinculadas a la cuenta en SQLite, usarlas y guardarlas en caché local de la cuenta
    if (serverSavedCardsJson && serverSavedCardsJson !== '[]') {
      try {
        const parsed = JSON.parse(serverSavedCardsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.savedUserCards.set(parsed);
          localStorage.setItem(`wp_account_cards_${clean}`, JSON.stringify(parsed));
          return;
        }
      } catch {}
    }

    // 2. Cargar del almacenamiento local exclusivo de este correo
    try {
      const localRaw = localStorage.getItem(`wp_account_cards_${clean}`);
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed)) {
          this.savedUserCards.set(parsed);
          // Sincronizar hacia el servidor si el servidor aún no las tenía
          if (parsed.length > 0 && (!serverSavedCardsJson || serverSavedCardsJson === '[]')) {
            this.crypto.request('user.cards.save', { cards: parsed }).catch(() => {});
          }
          return;
        }
      }
    } catch {}

    this.savedUserCards.set([]);
  }

  async addOrUpdateUserCard(card: SavedUserCard): Promise<void> {
    const cleanEmail = this.currentUserEmail().trim().toLowerCase();
    if (!cleanEmail) return;
    const updated = [card, ...this.savedUserCards().filter((c) => c.id !== card.id)];
    this.savedUserCards.set(updated);
    try {
      localStorage.setItem(`wp_account_cards_${cleanEmail}`, JSON.stringify(updated));
    } catch {}
    try {
      await this.crypto.request('user.cards.save', { cards: updated });
    } catch {}
  }

  async removeUserCard(cardId: string): Promise<void> {
    const cleanEmail = this.currentUserEmail().trim().toLowerCase();
    if (!cleanEmail) return;
    const updated = this.savedUserCards().filter((c) => c.id !== cardId);
    this.savedUserCards.set(updated);
    try {
      localStorage.setItem(`wp_account_cards_${cleanEmail}`, JSON.stringify(updated));
    } catch {}
    try {
      await this.crypto.request('user.cards.save', { cards: updated });
    } catch {}
  }

  async saveNetworkSettings(bankUrl: string, storeUrl: string): Promise<{ ok: boolean; message: string }> {
    const normBank = this.crypto.setCustomBankUrl(bankUrl);
    const normStore = this.crypto.setMarketStoreUrl(storeUrl);
    this.activeBankUrl.set(normBank);
    this.activeStoreUrl.set(normStore);

    const probe = await this.crypto.testConnection();
    this.bankConnected.set(probe.ok);
    if (probe.ok) {
      this.activeBankUrl.set(probe.activeUrl);
      await this.fetchRegisteredUsers();
      return {
        ok: true,
        message: `Conectado exitosamente a CentralBank en ${probe.activeUrl}`
      };
    }
    return {
      ok: false,
      message: probe.error || 'No se pudo conectar con CentralBank en esa dirección IP.'
    };
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
    this.loadLocalDeviceAccounts();
    try {
      const probe = await this.crypto.testConnection();
      this.bankConnected.set(probe.ok);
      if (probe.ok && probe.activeUrl) {
        this.activeBankUrl.set(probe.activeUrl);
      }
    } catch {
      this.bankConnected.set(false);
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

      this.bankConnected.set(true);
      this.activeBankUrl.set(this.crypto.getActiveBankUrl());

      const resolvedName = data.user?.name || params.name?.trim() || email.split('@')[0];
      this.currentUserEmail.set(email);
      this.currentUserName.set(resolvedName);
      this.loadAccountCards(email, data.user?.savedCardsJson);
      if (data.user) {
        this.rememberLocalDeviceAccount(data.user);
        if (data.user.savedCardsJson && data.user.savedCardsJson !== '[]' && this.savedUserCards().length === 0) {
          this.loadAccountCards(this.currentUserEmail(), data.user.savedCardsJson);
        }
      } else {
        this.rememberLocalDeviceAccount({
          id: `USR-${email.substring(0, 4).toUpperCase()}`,
          name: resolvedName,
          email,
          avatarInitials: this.currentUserInitials(),
          avatarHex: '#007AFF',
          unusedTicketsCount: 0,
          unusedBalance: 0
        });
      }
      if (Array.isArray(data.tickets)) this.tickets.set(this.filterAuthenticTickets(data.tickets));
      if (Array.isArray(data.ticketRequests)) this.ticketRequests.set(data.ticketRequests);
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
      this.bankConnected.set(false);
      this.addAuditLog('warn', 'No se pudo conectar con CentralBank (:7070).');
      return {
        ok: false,
        error: `No se pudo conectar con CentralBank (${this.crypto.getCustomBankUrl()}). Verifica que CentralBank.exe esté abierto.`
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

      this.bankConnected.set(true);
      this.activeBankUrl.set(this.crypto.getActiveBankUrl());

      if (data.user) {
        this.rememberLocalDeviceAccount(data.user);
        if (data.user.savedCardsJson && data.user.savedCardsJson !== '[]' && this.savedUserCards().length === 0) {
          this.loadAccountCards(this.currentUserEmail(), data.user.savedCardsJson);
        }
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

      if (Array.isArray(data.ticketRequests)) {
        this.ticketRequests.set(data.ticketRequests);
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
    this.ticketRequests.set([]);
    this.transactions.set([]);
    this.savedUserCards.set([]);
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

  /**
   * Solicita al Banco Central la compra de un ticket con tarjeta.
   * El Administrador del Banco Central debe aceptar o rechazar el pago en CentralBank Desktop.
   */
  async requestAndWaitTicketPurchaseApproval(
    amount: TicketDenomination,
    paymentMethod: string,
    onProgress?: (statusText: string, requestId?: string) => void,
    shouldCancel?: () => boolean
  ): Promise<{ ok: boolean; ticket?: BankTicket; requestId?: string; error?: string }> {
    this.resetInactivityWatchdog();
    await this.triggerBiometricPulse('Enviando pago al Banco Central...', 800);

    let requestId = '';
    try {
      const data = await this.crypto.request('tickets.purchase.request', {
        amount,
        paymentMethod
      });

      if (!data?.ok) {
        return {
          ok: false,
          error: data?.error || 'El Banco Central rechazó la solicitud de compra.'
        };
      }

      // Si el servidor emitió directamente (compatibilidad)
      if (data.ticket && !data.pendingApproval) {
        const minted = data.ticket as BankTicket;
        if (!this.crypto.isTicketAuthentic(minted)) {
          return { ok: false, error: 'El ticket recibido no superó la validación de autenticidad.' };
        }
        await this.syncWithCentralBank();
        return { ok: true, ticket: minted };
      }

      requestId = data.requestId;
      await this.syncWithCentralBank();
    } catch {
      return {
        ok: false,
        error: 'No se pudo conectar con CentralBank (:7070). Verifica que el software del banco esté abierto.'
      };
    }

    if (onProgress) {
      onProgress(
        `Solicitud #${requestId} recibida en CentralBank · Esperando que el Administrador del Banco acepte el pago de tu tarjeta (${paymentMethod})...`,
        requestId
      );
    }

    while (true) {
      if (shouldCancel && shouldCancel()) {
        return { ok: false, requestId, error: 'Espera en segundo plano. El ticket aparecerá en Mis Tickets cuando el Banco lo apruebe.' };
      }

      await new Promise((r) => setTimeout(r, 1200));

      if (shouldCancel && shouldCancel()) {
        return { ok: false, requestId, error: 'Espera en segundo plano.' };
      }

      try {
        const statusData = await this.crypto.request('tickets.purchase.status', { requestId });
        if (!statusData?.ok) continue;

        if (statusData.approvalStatus === 'pending') {
          if (onProgress) {
            onProgress(
              `Validando tarjeta en CentralBank Desktop (Solicitud #${requestId}) · En la pestaña "Aprobar Tarjetas y Compras", acepta o rechaza el pago...`,
              requestId
            );
          }
          continue;
        }

        if (statusData.approvalStatus === 'rejected') {
          await this.syncWithCentralBank();
          this.addAuditLog(
            'warn',
            `[Pago Rechazado] El Administrador del Banco Central rechazó la compra del ticket de $${amount} (#${requestId}).`
          );
          return {
            ok: false,
            requestId,
            error: statusData.statusReport || 'El Administrador del Banco Central rechazó el pago de la tarjeta.'
          };
        }

        if (statusData.approvalStatus === 'approved' && statusData.ticket) {
          const minted = statusData.ticket as BankTicket;
          if (!this.crypto.isTicketAuthentic(minted)) {
            return {
              ok: false,
              requestId,
              error: 'El ticket recibido no superó la validación criptográfica RSA-2048.'
            };
          }

          await this.triggerBiometricPulse(`Ticket $${amount} Aprobado`, 800);
          await this.syncWithCentralBank();
          this.addAuditLog(
            'bank',
            `[Pago Aprobado] Solicitud #${requestId} autorizada (${statusData.bankAuthCode}). Ticket ${minted.id} ($${amount} MXN) emitido.`
          );
          return {
            ok: true,
            requestId,
            ticket: minted
          };
        }
      } catch {
        // Continuar esperando si hubo micro-corte
      }
    }
  }

  /**
   * Escanea el código QR del ticket de un amigo y lo vincula con validación anti-doble gasto en el Banco Central.
   */
  async scanAndClaimSharedTicket(rawQrData: string): Promise<{
    ok: boolean;
    code?: string;
    message: string;
    ticket?: BankTicket;
  }> {
    this.resetInactivityWatchdog();
    const clean = (rawQrData || '').trim();
    if (!clean) {
      return { ok: false, message: 'No se detectó ningún código QR válido.' };
    }

    await this.triggerBiometricPulse('Verificando QR con Banco Central...', 750);

    try {
      const data = await this.crypto.request('tickets.share.scan', {
        qrData: clean
      });

      if (!data?.ok) {
        this.addAuditLog('warn', `[Escaneo QR Rechazado] ${data?.message || data?.error || 'Ticket inválido o ya usado'}.`);
        await this.haptic('error');
        return {
          ok: false,
          code: data?.code,
          message: data?.message || data?.error || 'El Banco Central rechazó el ticket escaneado.'
        };
      }

      if (data.ticket && !this.crypto.isTicketAuthentic(data.ticket)) {
        await this.haptic('error');
        return {
          ok: false,
          code: 'TICKET_TAMPERED',
          message: 'El ticket escaneado tiene un sello alterado y fue rechazado por seguridad.'
        };
      }

      await this.syncWithCentralBank();
      this.addAuditLog('bank', `[Ticket Compartido por QR] ${data.message}`);
      await this.haptic('success');

      return {
        ok: true,
        code: data.code,
        message: data.message,
        ticket: data.ticket
      };
    } catch {
      await this.haptic('error');
      return {
        ok: false,
        message: 'No se pudo conectar con el Banco Central (:7070) para verificar el código QR.'
      };
    }
  }

  async redeemTicketWithBank(ticketId: string): Promise<boolean> {
    await this.redirectToMarketStoreWithTicket(ticketId);
    return true;
  }

  async redirectToMarketStoreWithTicket(ticketId?: string): Promise<void> {
    this.resetInactivityWatchdog();
    const storeBase = this.crypto.getMarketStoreUrl();
    const bankParam = `&bank=${encodeURIComponent(this.crypto.getActiveBankUrl())}`;
    const tkParam = ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : '';

    try {
      const res = await this.crypto.request('auth.handoff.create');
      if (res?.ok && res.handoffToken) {
        const targetUrl = `${storeBase}/catalog?handoff=${encodeURIComponent(res.handoffToken)}${tkParam}${bankParam}`;
        window.open(targetUrl, '_blank');
        return;
      }
    } catch {
      // Si el banco no pudo emitir el pase, abrir la pantalla de acceso de la tienda con el parámetro bank
    }
    window.open(`${storeBase}/auth?bank=${encodeURIComponent(this.crypto.getActiveBankUrl())}`, '_blank');
  }

  async toggleTicketQrReveal(ticketId: string): Promise<void> {
    const target = this.tickets().find((t) => t.id === ticketId);
    if (!target) return;

    if (!target.qrRevealed) {
      await this.triggerBiometricPulse('Desbloqueando QR Oficial', 750);
    }

    this.tickets.update((list) =>
      list.map((t) => (t.id === ticketId ? { ...t, qrRevealed: !t.qrRevealed } : t))
    );
  }
}
