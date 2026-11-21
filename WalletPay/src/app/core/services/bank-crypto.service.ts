import { Injectable } from '@angular/core';
import * as forge from 'node-forge';
import { environment } from '../../../environments/environment';
import { BankTicket } from '../models/wallet.models';

@Injectable({
  providedIn: 'root'
})
export class BankCryptoService {
  private bankPublicKey: forge.pki.rsa.PublicKey | null = null;
  private bankFingerprint = '';
  private sessionId = '';
  private sessionKeyBytes = '';
  private activeBaseUrl = '';
  private handshakePromise: Promise<void> | null = null;
  private localVaultKeyBytes = '';

  static normalizeBankApiUrl(raw: string): string {
    let clean = (raw || '').trim();
    if (!clean) return '';
    if (!/^https?:\/\//i.test(clean)) {
      clean = `http://${clean}`;
    }
    clean = clean.replace(/\/+$/, '');
    // Si solo escribió la IP o host sin puerto (y es http/IP local), agregar :5050
    try {
      const u = new URL(clean);
      if (!u.port && u.protocol === 'http:' && (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname === 'localhost')) {
        u.port = '5050';
      }
      if (!u.pathname || u.pathname === '/') {
        u.pathname = '/api';
      } else if (!u.pathname.endsWith('/api')) {
        u.pathname = u.pathname.replace(/\/+$/, '') + '/api';
      }
      return u.toString().replace(/\/+$/, '');
    } catch {
      if (!clean.includes(':5050') && !clean.startsWith('https://')) {
        clean += ':5050';
      }
      if (!clean.endsWith('/api')) {
        clean += '/api';
      }
      return clean;
    }
  }

  getCustomBankUrl(): string {
    return localStorage.getItem('wp_custom_bank_url') || environment.bankApiUrl;
  }

  setCustomBankUrl(rawUrl: string): string {
    const normalized = BankCryptoService.normalizeBankApiUrl(rawUrl);
    if (normalized) {
      localStorage.setItem('wp_custom_bank_url', normalized);
    } else {
      localStorage.removeItem('wp_custom_bank_url');
    }
    this.resetChannel();
    this.activeBaseUrl = '';
    return normalized || environment.bankApiUrl;
  }

  getActiveBankUrl(): string {
    return this.activeBaseUrl || this.getCustomBankUrl() || environment.bankApiUrl;
  }

  getMarketStoreUrl(): string {
    return (localStorage.getItem('wp_custom_store_url') || environment.marketStoreUrl).replace(/\/+$/, '');
  }

  setMarketStoreUrl(rawUrl: string): string {
    let clean = (rawUrl || '').trim();
    if (!clean) {
      localStorage.removeItem('wp_custom_store_url');
      return environment.marketStoreUrl;
    }
    if (!/^https?:\/\//i.test(clean)) {
      clean = clean.includes('vercel.app') ? `https://${clean}` : `http://${clean}`;
    }
    clean = clean.replace(/\/+$/, '');
    localStorage.setItem('wp_custom_store_url', clean);
    return clean;
  }

  private getCandidateApiUrls(): string[] {
    const urls = new Set<string>();
    const custom = localStorage.getItem('wp_custom_bank_url');
    if (custom) {
      urls.add(BankCryptoService.normalizeBankApiUrl(custom));
    }
    urls.add(environment.bankApiUrl);
    urls.add('http://192.168.1.74:5050/api');
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('vercel.app')) {
        urls.add(`http://${host}:5050/api`);
      }
    }
    urls.add('http://localhost:5050/api');
    urls.add('http://127.0.0.1:5050/api');
    urls.add('http://10.0.2.2:5050/api'); // Android Emulator loopback
    return Array.from(urls).filter((u) => !!u);
  }

  private async fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 2600): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{ ok: boolean; activeUrl: string; lanIp?: string; error?: string }> {
    try {
      this.resetChannel();
      this.activeBaseUrl = '';
      await this.ensureChannel();
      const healthResp = await this.fetchWithTimeout(`${this.activeBaseUrl}/health`, undefined, 2200).catch(() => null);
      const health = healthResp ? await healthResp.json().catch(() => null) : null;
      return {
        ok: true,
        activeUrl: this.activeBaseUrl,
        lanIp: health?.lanIp
      };
    } catch {
      return {
        ok: false,
        activeUrl: this.getCustomBankUrl(),
        error: 'No se pudo conectar con CentralBank (:5050). Verifica la IP de la PC donde corre CentralBank.exe y que ambos dispositivos estén en la misma red Wi-Fi.'
      };
    }
  }

  static ticketCanonical(id: string, amount: number, ownerEmail: string, issuedEpoch: number): string {
    return `TKT1|${id}|${amount}|${(ownerEmail || '').trim().toLowerCase()}|${issuedEpoch}`;
  }

  static sha256Hex(text: string): string {
    const md = forge.md.sha256.create();
    md.update(text, 'utf8');
    return md.digest().toHex().toLowerCase();
  }

  static fingerprint(canonical: string): string {
    return `BC-${BankCryptoService.sha256Hex(canonical).toUpperCase().substring(0, 24)}`;
  }

  verifyBankSignature(canonical: string, signatureB64?: string): boolean {
    if (!this.bankPublicKey || !signatureB64) return false;
    try {
      const md = forge.md.sha256.create();
      md.update(canonical, 'utf8');
      const sigBytes = forge.util.decode64(signatureB64);
      return this.bankPublicKey.verify(md.digest().bytes(), sigBytes);
    } catch {
      return false;
    }
  }

  isTicketAuthentic(ticket: BankTicket): boolean {
    if (!ticket || !ticket.id || !ticket.signature || !ticket.issuedEpoch || !ticket.ownerEmail) {
      return false;
    }
    const canonical = BankCryptoService.ticketCanonical(
      ticket.id,
      ticket.amount,
      ticket.ownerEmail,
      ticket.issuedEpoch
    );
    const expectedFp = BankCryptoService.fingerprint(canonical);
    if (ticket.signatureHash && ticket.signatureHash !== expectedFp) {
      return false;
    }
    return this.verifyBankSignature(canonical, ticket.signature);
  }

  resetChannel(): void {
    this.sessionId = '';
    this.sessionKeyBytes = '';
  }

  private async ensureChannel(): Promise<void> {
    if (this.sessionId && this.sessionKeyBytes && this.bankPublicKey && this.activeBaseUrl) {
      return;
    }
    if (this.handshakePromise) {
      return this.handshakePromise;
    }
    this.handshakePromise = this.performHandshake().finally(() => {
      this.handshakePromise = null;
    });
    return this.handshakePromise;
  }

  private async performHandshake(): Promise<void> {
    let lastError: unknown;
    for (const base of this.getCandidateApiUrls()) {
      try {
        const infoResp = await this.fetchWithTimeout(`${base}/channel/info`, undefined, 2600);
        if (!infoResp.ok) continue;
        const info = await infoResp.json();
        if (!info.ok || !info.publicKey) continue;

        const spkiDer = forge.util.decode64(info.publicKey);
        const computedFp = forge.md.sha256.create().update(spkiDer).digest().toHex().toLowerCase();
        if (computedFp !== String(info.fingerprint || '').toLowerCase()) {
          throw new Error('La identidad del servidor no coincide.');
        }

        const pem = `-----BEGIN PUBLIC KEY-----\n${info.publicKey}\n-----END PUBLIC KEY-----`;
        const pubKey = forge.pki.publicKeyFromPem(pem) as forge.pki.rsa.PublicKey;

        const proofMd = forge.md.sha256.create();
        proofMd.update(`BANK-CHANNEL|${computedFp}|${info.serverTime}`, 'utf8');
        if (!pubKey.verify(proofMd.digest().bytes(), forge.util.decode64(info.proof))) {
          throw new Error('No se pudo verificar la identidad del Banco Central.');
        }

        const pinned = sessionStorage.getItem('cb_bank_fp');
        if (pinned && pinned !== computedFp) {
          sessionStorage.setItem('cb_bank_fp', computedFp);
        } else if (!pinned) {
          sessionStorage.setItem('cb_bank_fp', computedFp);
        }

        const aesKey = forge.random.getBytesSync(32);
        const clientNonce = forge.util.bytesToHex(forge.random.getBytesSync(12));
        const wrappedBytes = pubKey.encrypt(aesKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });

        const openResp = await this.fetchWithTimeout(
          `${base}/channel/open`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wrappedKey: forge.util.encode64(wrappedBytes),
              client: 'WalletPay',
              clientNonce
            })
          },
          2600
        );
        if (!openResp.ok) continue;
        const openData = await openResp.json();
        if (!openData.ok || !openData.sessionId || !openData.iv || !openData.data) continue;

        const ackPlain = this.decryptWithKey(aesKey, openData.iv, openData.data, openData.sessionId);
        if (!ackPlain) {
          throw new Error('La confirmación del canal fue alterada.');
        }
        const ack = JSON.parse(ackPlain);
        if (ack.clientNonce !== clientNonce || ack.sessionId !== openData.sessionId) {
          throw new Error('Desajuste en la confirmación del canal.');
        }

        this.bankPublicKey = pubKey;
        this.bankFingerprint = computedFp;
        this.sessionId = openData.sessionId;
        this.sessionKeyBytes = aesKey;
        this.activeBaseUrl = base;
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('CentralBank unreachable');
  }

  async request<T = any>(action: string, payload: Record<string, unknown> = {}, retry = true): Promise<T> {
    await this.ensureChannel();

    const innerJson = JSON.stringify({
      action,
      nonce: forge.util.bytesToHex(forge.random.getBytesSync(16)),
      ts: Date.now(),
      payload
    });

    const { iv, data } = this.encryptWithKey(this.sessionKeyBytes, innerJson, this.sessionId);
    let resp: Response;
    try {
      resp = await fetch(`${this.activeBaseUrl}/secure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sid: this.sessionId,
          iv,
          data
        })
      });
    } catch (err) {
      this.resetChannel();
      if (retry) return this.request<T>(action, payload, false);
      throw err;
    }

    const body = await resp.json().catch(() => null);
    if (!body) {
      throw new Error('Respuesta inválida del servidor.');
    }

    if (resp.status === 401 && body.code === 'SESSION_EXPIRED' && retry) {
      this.resetChannel();
      return this.request<T>(action, payload, false);
    }

    if (!body.iv || !body.data) {
      if (body.code === 'MESSAGE_TAMPERED') {
        this.resetChannel();
      }
      return body as T;
    }

    const plain = this.decryptWithKey(this.sessionKeyBytes, body.iv, body.data, this.sessionId);
    if (plain === null) {
      this.resetChannel();
      throw new Error('La respuesta recibida fue alterada durante la transmisión y fue descartada.');
    }

    return JSON.parse(plain) as T;
  }

  private encryptWithKey(keyBytes: string, utf8Plaintext: string, aad: string): { iv: string; data: string } {
    const ivBytes = forge.random.getBytesSync(12);
    const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
    cipher.start({
      iv: ivBytes,
      additionalData: forge.util.encodeUtf8(aad),
      tagLength: 128
    });
    cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(utf8Plaintext)));
    cipher.finish();

    const encrypted = cipher.output.getBytes();
    const tag = cipher.mode.tag.getBytes();
    return {
      iv: forge.util.encode64(ivBytes),
      data: forge.util.encode64(encrypted + tag)
    };
  }

  private decryptWithKey(keyBytes: string, ivB64: string, dataB64: string, aad: string): string | null {
    try {
      const ivBytes = forge.util.decode64(ivB64);
      const combined = forge.util.decode64(dataB64);
      if (ivBytes.length !== 12 || combined.length < 16) return null;

      const ct = combined.slice(0, combined.length - 16);
      const tag = combined.slice(combined.length - 16);

      const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);
      decipher.start({
        iv: ivBytes,
        additionalData: forge.util.encodeUtf8(aad),
        tagLength: 128,
        tag: forge.util.createBuffer(tag)
      });
      decipher.update(forge.util.createBuffer(ct));
      const pass = decipher.finish();
      if (!pass) return null;
      return forge.util.decodeUtf8(decipher.output.getBytes());
    } catch {
      return null;
    }
  }

  private getLocalKey(): string {
    if (this.localVaultKeyBytes) return this.localVaultKeyBytes;
    let seed = localStorage.getItem('wp_device_seed');
    if (!seed) {
      seed = forge.util.encode64(forge.random.getBytesSync(32));
      localStorage.setItem('wp_device_seed', seed);
    }
    this.localVaultKeyBytes = forge.pkcs5.pbkdf2(
      seed,
      `WalletPay.DeviceVault.${this.bankFingerprint || 'v1'}`,
      10000,
      32,
      forge.md.sha256.create()
    );
    return this.localVaultKeyBytes;
  }

  saveProtectedItem(slot: string, value: string): void {
    const key = this.getLocalKey();
    const sealed = this.encryptWithKey(key, value, slot);
    localStorage.setItem(`wp_sec_${slot}`, JSON.stringify(sealed));
  }

  loadProtectedItem(slot: string): string | null {
    const raw = localStorage.getItem(`wp_sec_${slot}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return this.decryptWithKey(this.getLocalKey(), parsed.iv, parsed.data, slot);
    } catch {
      return null;
    }
  }

  removeProtectedItem(slot: string): void {
    localStorage.removeItem(`wp_sec_${slot}`);
  }
}
