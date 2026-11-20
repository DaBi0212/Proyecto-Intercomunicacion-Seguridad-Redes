import { Injectable } from '@angular/core';
import * as forge from 'node-forge';
import { environment } from '../../../environments/environment';
import { BankTicket, OrderReceipt } from '../models/market.models';

/**
 * Canal de comunicación seguro entre MarketStore y el Banco Central.
 *
 *  - Negocia una llave de sesión efímera protegida con la llave pública del banco.
 *  - Cifra y autentica cada mensaje con AES-256-GCM (etiqueta de 128 bits y AAD = sessionId),
 *    más nonce único y marca de tiempo contra ataques de reenvío.
 *  - Verifica la firma digital del banco en cada ticket y en cada comprobante de aprobación
 *    antes de que la tienda acepte o libere una compra.
 */
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

  private getCandidateApiUrls(): string[] {
    const urls = new Set<string>();
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        urls.add(`http://${host}:5050/api`);
      }
    }
    urls.add('http://localhost:5050/api');
    urls.add('http://127.0.0.1:5050/api');
    urls.add(environment.bankApiUrl);
    urls.add('http://192.168.1.218:5050/api');
    return Array.from(urls);
  }

  // =========================================================================
  // FORMAS CANÓNICAS Y VERIFICACIÓN DE FIRMAS DEL BANCO CENTRAL
  // =========================================================================

  static ticketCanonical(id: string, amount: number, ownerEmail: string, issuedEpoch: number): string {
    return `TKT1|${id}|${amount}|${(ownerEmail || '').trim().toLowerCase()}|${issuedEpoch}`;
  }

  static receiptCanonical(
    orderId: string,
    status: string,
    bankCode: string,
    subtotalCents: number,
    ticketIds: string[],
    buyerEmail: string
  ): string {
    const sorted = [...ticketIds].sort();
    return `RCP1|${orderId}|${status}|${bankCode}|${subtotalCents}|${sorted.join(',')}|${(buyerEmail || '').trim().toLowerCase()}`;
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

  /**
   * Comprueba en la tienda que un ticket no haya sido modificado (folio, monto, titular o fecha)
   * y que su firma corresponda a la llave del Banco Central.
   */
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

  /**
   * Comprueba que el comprobante de aprobación recibido para una orden fue firmado por el Banco Central
   * para esa orden, ese monto y esos tickets exactos.
   */
  isOrderReceiptAuthentic(
    receipt: OrderReceipt | undefined,
    expectedOrderId: string,
    expectedSubtotal: number,
    expectedTicketIds: string[],
    expectedBuyerEmail: string
  ): boolean {
    if (!receipt || receipt.status !== 'approved' || !receipt.signature) return false;
    if (receipt.orderId !== expectedOrderId) return false;

    const expectedCents = Math.round(expectedSubtotal * 100);
    if (receipt.subtotalCents !== expectedCents) return false;

    const a = [...expectedTicketIds].sort().join(',');
    const b = [...(receipt.ticketIds || [])].sort().join(',');
    if (a !== b) return false;

    const canonical = BankCryptoService.receiptCanonical(
      receipt.orderId,
      receipt.status,
      receipt.bankCode,
      receipt.subtotalCents,
      receipt.ticketIds,
      expectedBuyerEmail
    );
    return this.verifyBankSignature(canonical, receipt.signature);
  }

  // =========================================================================
  // APERTURA DE CANAL Y TRANSPORTE PROTEGIDO
  // =========================================================================

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
        const infoResp = await fetch(`${base}/channel/info`);
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

        const aesKey = forge.random.getBytesSync(32);
        const clientNonce = forge.util.bytesToHex(forge.random.getBytesSync(12));
        const wrappedBytes = pubKey.encrypt(aesKey, 'RSA-OAEP', {
          md: forge.md.sha256.create(),
          mgf1: { md: forge.md.sha256.create() }
        });

        const openResp = await fetch(`${base}/channel/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wrappedKey: forge.util.encode64(wrappedBytes),
            client: 'MarketStore',
            clientNonce
          })
        });
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
    let seed = localStorage.getItem('ms_device_seed');
    if (!seed) {
      seed = forge.util.encode64(forge.random.getBytesSync(32));
      localStorage.setItem('ms_device_seed', seed);
    }
    this.localVaultKeyBytes = forge.pkcs5.pbkdf2(
      seed,
      `MarketStore.DeviceVault.${this.bankFingerprint || 'v1'}`,
      10000,
      32,
      forge.md.sha256.create()
    );
    return this.localVaultKeyBytes;
  }

  saveProtectedItem(slot: string, value: string): void {
    const key = this.getLocalKey();
    const sealed = this.encryptWithKey(key, value, slot);
    localStorage.setItem(`ms_sec_${slot}`, JSON.stringify(sealed));
  }

  loadProtectedItem(slot: string): string | null {
    const raw = localStorage.getItem(`ms_sec_${slot}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return this.decryptWithKey(this.getLocalKey(), parsed.iv, parsed.data, slot);
    } catch {
      return null;
    }
  }

  removeProtectedItem(slot: string): void {
    localStorage.removeItem(`ms_sec_${slot}`);
  }
}
