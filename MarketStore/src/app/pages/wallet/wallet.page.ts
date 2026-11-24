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
  template: `
    <div class="page-container">
      <!-- ENCABEZADO Y SEGMENTED CONTROL ESTILO iOS -->
      <header class="page-head">
        <div>
          <span class="eyebrow">SINCRONIZACIÓN EN TIEMPO REAL CON WALLETPAY</span>
          <h1>Mis Tickets Electrónicos</h1>
          <p>Certificados digitales de valor fijo emitidos por el Banco Central para pagar en MarketStore.</p>
        </div>

        <div class="ios-segmented" role="tablist">
          <button
            type="button"
            class="ios-segment-btn"
            [class.active]="segment() === 'active'"
            (click)="setSegment('active')"
          >
            Disponibles ({{ market.activeTickets().length }})
          </button>
          <button
            type="button"
            class="ios-segment-btn"
            [class.active]="segment() === 'used'"
            (click)="setSegment('used')"
          >
            Canjeados ({{ market.usedTickets().length }})
          </button>
        </div>
      </header>

      <!-- TARJETA RESUMEN DE SALDO Y VINCULACIÓN DE FOLIO EXTERNO -->
      <section class="balance-strip continuous">
        <div class="bs-left">
          <span class="bs-label">Saldo disponible en Tickets Activos</span>
          <div class="bs-amount-row">
            <strong class="bs-amount">
              {{ market.availableTicketBalance() | currency: 'MXN' : 'symbol-narrow' }}<small>MXN</small>
            </strong>
            @if (market.storeCredit() > 0) {
              <span class="credit-badge continuous">
                + {{ market.storeCredit() | currency: 'MXN' : 'symbol-narrow' }} saldo a favor
              </span>
            }
          </div>
        </div>

        <div class="bs-right">
          <div class="folio-import-bar">
            <input
              type="text"
              class="folio-in mono"
              placeholder="Vincular folio de app WalletPay (ej. TKT-9012-B4F1)"
              [(ngModel)]="externalFolio"
            />
            <select class="folio-sel" [(ngModel)]="externalDenom">
              <option [ngValue]="50">$50</option>
              <option [ngValue]="100">$100</option>
              <option [ngValue]="200">$200</option>
              <option [ngValue]="500">$500</option>
            </select>
            <button type="button" class="folio-submit continuous apple-pressable" (click)="linkExternalTicket()">
              <sf-symbol name="qrcode" [size]="16" />
              <span>Vincular</span>
            </button>
          </div>
          @if (importFeedback()) {
            <span class="import-feedback">{{ importFeedback() }}</span>
          }
        </div>
      </section>

      <!-- VISTA 1 y 2: PASES ACTIVOS O USADOS (DISEÑO 1:1 CON WALLETPAY VAULTPAGE) -->
      @if (segment() !== 'buy') {
        @if (displayedTickets().length === 0) {
          <div class="empty-state continuous">
            <div class="empty-icon continuous">
              <sf-symbol name="wallet.pass" [size]="34" />
            </div>
            <h3>{{ segment() === 'active' ? 'Sin tickets disponibles' : 'Sin tickets canjeados' }}</h3>
            <p>
              {{
                segment() === 'active'
                  ? 'La compra de tickets se realiza exclusivamente desde la aplicación móvil WalletPay. Tus tickets adquiridos en WalletPay se sincronizan aquí automáticamente.'
                  : 'Los tickets que utilices como medio de pago aparecerán aquí con su sello de verificación.'
              }}
            </p>
          </div>
        } @else {
          <div class="passes-grid">
            @for (t of displayedTickets(); track t.id) {
              <article
                class="pass continuous"
                [class]="'pass continuous ' + t.colorClass"
                [class.is-used]="t.status === 'used'"
              >
                <!-- Marca de agua geométrica de seguridad (Guilloché idéntica a WalletPay) -->
                <svg class="pass-watermark" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                  <circle cx="150" cy="85" r="88" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 5" />
                  <circle cx="150" cy="85" r="64" stroke="currentColor" stroke-width="1.2" />
                  <circle cx="150" cy="85" r="40" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4" />
                  <path d="M90 85h120M150 25v120" stroke="currentColor" stroke-width="0.8" />
                </svg>

                <!-- Muescas laterales de boleto -->
                <span class="notch notch-left" aria-hidden="true"></span>
                <span class="notch notch-right" aria-hidden="true"></span>

                <!-- Cabecera del pase -->
                <header class="pass-head">
                  <div class="issuer">
                    <span class="issuer-badge">
                      <sf-symbol name="building.columns" [size]="14" [weight]="2.1" />
                    </span>
                    <div class="issuer-text">
                      <strong>BANCO CENTRAL</strong>
                      <span>CERTIFICADO DIGITAL · {{ t.tier | uppercase }}</span>
                    </div>
                  </div>
                  <span
                    class="status-pill"
                    [class.used]="t.status === 'used'"
                    [class.gold-pill]="t.amount === 500 && t.status === 'active'"
                  >
                    {{ t.status === 'used' ? 'CANJEADO' : 'ACTIVO' }}
                  </span>
                </header>

                <!-- Valor nominal + Chip EMV -->
                <div class="pass-middle">
                  <div class="pass-price-block">
                    <span class="pass-label">VALOR NOMINAL FIJO</span>
                    <div class="pass-amount">
                      <span class="cur">$</span>{{ t.amount }}<span class="dec">.00</span>
                      <small>MXN</small>
                    </div>
                  </div>

                  <div class="emv-chip" [class.gold-chip]="t.amount === 500" aria-hidden="true">
                    <span></span><span></span><span></span><span></span>
                  </div>
                </div>

                <!-- Metadatos enmascarados -->
                <div class="pass-meta">
                  <div>
                    <span class="meta-k">FOLIO DE SEGURIDAD</span>
                    <span class="meta-v mono">{{ t.qrRevealed ? t.id : t.serialMasked }}</span>
                  </div>
                  <div>
                    <span class="meta-k">{{ t.status === 'used' ? 'ORDEN / USO' : 'EMITIDO' }}</span>
                    <span class="meta-v">{{ t.status === 'used' ? (t.orderId || t.usedAt) : t.issuedAt }}</span>
                  </div>
                </div>

                <!-- Línea divisoria perforada -->
                <div class="pass-perforation" aria-hidden="true"></div>

                <!-- Talón inferior del ticket con QR difuminado por seguridad -->
                <button
                  type="button"
                  class="qr-well continuous apple-pressable"
                  (click)="market.toggleTicketQrReveal(t.id)"
                >
                  <div class="qr-frame">
                    @let qrSvg = getQrSvgForTicket(t);
                    <svg
                      class="qr-code"
                      [class.blurred]="!t.qrRevealed"
                      [attr.viewBox]="qrSvg.viewBox"
                      width="60"
                      height="60"
                      shape-rendering="crispEdges"
                      aria-hidden="true"
                    >
                      <rect width="100%" height="100%" fill="#fff" />
                      <path [attr.d]="qrSvg.path" fill="#000" />
                    </svg>
                    @if (!t.qrRevealed) {
                      <span class="qr-lock">
                        <sf-symbol name="lock.fill" [size]="17" />
                      </span>
                    }
                  </div>

                  <div class="qr-copy">
                    <div class="qr-title-row">
                      <strong class="mono">{{ t.qrRevealed ? t.id : t.serialMasked }}</strong>
                      <span class="rsa-tag">OFICIAL</span>
                    </div>
                    <span>
                      {{
                        t.status === 'used'
                          ? t.qrRevealed
                            ? 'Folio TKT y QR visibles · Ticket ya canjeado (Anti-doble gasto)'
                            : 'Ticket ya canjeado · Toca para revelar Folio TKT y Código QR'
                          : t.qrRevealed
                          ? 'Folio visible · Toca para ocultar'
                          : 'Código protegido · Toca para ver con Face ID'
                      }}
                    </span>
                  </div>
                </button>
              </article>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 20px calc(env(safe-area-inset-bottom, 0px) + 96px);
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .page-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.07em;
      color: var(--ion-color-primary);
    }
    .page-head h1 {
      margin: 4px 0 6px;
      font-size: clamp(26px, 3vw, 34px);
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .page-head p {
      margin: 0;
      font-size: 14.5px;
      color: var(--ios-label-2);
    }

    /* Balance Strip */
    .balance-strip {
      --r: 22px;
      padding: 20px 22px;
      background: var(--ios-cell);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
    }
    .bs-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--ios-label-2);
    }
    .bs-amount-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bs-amount {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.035em;
      font-variant-numeric: tabular-nums;
    }
    .bs-amount small {
      font-size: 15px;
      font-weight: 600;
      margin-left: 4px;
      color: var(--ios-label-2);
    }
    .credit-badge {
      --r: 999px;
      padding: 5px 11px;
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
      font-size: 12.5px;
      font-weight: 700;
    }

    .bs-right {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
      max-width: 520px;
    }
    .folio-import-bar {
      display: flex;
      gap: 8px;
    }
    .folio-in,
    .folio-sel {
      height: 42px;
      border-radius: 12px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      padding: 0 12px;
      font-size: 13.5px;
      outline: none;
    }
    .folio-in {
      flex: 1;
      min-width: 0;
    }
    .folio-submit {
      --r: 12px;
      height: 42px;
      padding: 0 16px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 13.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .import-feedback {
      font-size: 12px;
      font-weight: 600;
      color: var(--ion-color-primary);
    }

    /* Passes Grid (1:1 con WalletPay) */
    .passes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
      gap: 18px;
    }

    @media (max-width: 640px) {
      .page-container {
        padding: 14px 12px calc(env(safe-area-inset-bottom, 0px) + 86px);
        gap: 16px;
      }
      .page-head {
        flex-direction: column;
        align-items: stretch;
      }
      .ios-segmented {
        width: 100%;
      }
      .ios-segment-btn {
        flex: 1;
      }
      .balance-strip {
        padding: 16px 14px;
      }
      .bs-amount {
        font-size: 28px;
      }
      .folio-import-bar {
        flex-wrap: wrap;
      }
      .folio-in {
        flex: 1 1 100%;
      }
      .folio-sel {
        flex: 1;
      }
      .folio-submit {
        flex: 1;
        justify-content: center;
      }
    }

    .pass,
    .ticket-card {
      --r: 24px;
      position: relative;
      overflow: hidden;
      padding: 20px 20px 18px;
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow:
        var(--ios-shadow-card),
        inset 0 1px 0 rgba(255, 255, 255, 0.32),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25);
    }
    .pass {
      min-height: 368px;
    }
    .pass.is-used {
      filter: saturate(0.22);
    }
    .pass::before,
    .ticket-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(125deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.04) 38%, transparent 60%);
      pointer-events: none;
    }

    .pass-watermark {
      position: absolute;
      right: -28px;
      top: -12px;
      width: 200px;
      height: 200px;
      color: rgba(255, 255, 255, 0.11);
      pointer-events: none;
    }

    .notch {
      position: absolute;
      bottom: 108px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ion-background-color);
      z-index: 3;
      pointer-events: none;
    }
    .notch-left { left: -9px; }
    .notch-right { right: -9px; }
    .notch-left-sm { left: -9px; bottom: 56px; }
    .notch-right-sm { right: -9px; bottom: 56px; }

    .pass-head,
    .pass-middle,
    .pass-meta,
    .pass-perforation,
    .qr-well,
    .tc-bottom {
      position: relative;
      z-index: 2;
    }

    .pass-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .issuer {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .issuer-badge {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: rgba(255, 255, 255, 0.2);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .issuer-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .issuer-text strong {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .issuer-text span {
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      opacity: 0.82;
    }

    .status-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      background: rgba(255, 255, 255, 0.22);
      box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.32);
    }
    .status-pill.gold-pill {
      background: rgba(255, 214, 10, 0.2);
      color: #FFD60A;
      box-shadow: inset 0 0 0 0.5px rgba(255, 214, 10, 0.45);
    }
    .status-pill.used {
      background: rgba(0, 0, 0, 0.35);
    }

    .pass-middle {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin: 14px 0 10px;
    }
    .pass-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      opacity: 0.82;
      margin-bottom: 4px;
    }
    .pass-amount {
      font-size: 46px;
      font-weight: 800;
      line-height: 0.95;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
    }
    .cur {
      position: relative;
      top: -0.42em;
      margin-right: 2px;
      font-size: 0.48em;
      font-weight: 700;
    }
    .dec {
      font-size: 0.42em;
      font-weight: 700;
      opacity: 0.82;
      margin-left: 1px;
    }
    .pass-amount small {
      margin-left: 5px;
      font-size: 14px;
      font-weight: 700;
      opacity: 0.9;
    }

    .emv-chip {
      width: 34px;
      height: 25px;
      border-radius: 5px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(220, 225, 235, 0.55) 100%);
      box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.9), 0 2px 6px rgba(0, 0, 0, 0.2);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 1.5px;
      padding: 4px;
    }
    .emv-chip span {
      border: 0.5px solid rgba(0, 0, 0, 0.22);
      border-radius: 1.5px;
    }
    .emv-chip.gold-chip {
      background: linear-gradient(135deg, #FFE57F 0%, #D4AF37 55%, #AA7C11 100%);
    }

    .pass-meta {
      display: grid;
      grid-template-columns: 1.3fr 0.7fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .meta-k {
      display: block;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      opacity: 0.75;
      margin-bottom: 2px;
    }
    .meta-v {
      font-size: 12.5px;
      font-weight: 600;
    }

    .pass-perforation {
      border-top: 1px dashed rgba(255, 255, 255, 0.28);
      margin: 2px -4px 10px;
    }

    .qr-well {
      --r: 16px;
      width: 100%;
      border: 0;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.96);
      color: #000;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    }
    .qr-frame {
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 10px;
      overflow: hidden;
      flex-shrink: 0;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-code {
      transition: filter 240ms ease;
    }
    .qr-code.blurred {
      filter: blur(5px);
    }
    .qr-lock {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.24);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-copy {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }
    .qr-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .qr-copy strong {
      font-size: 11.5px;
      color: #000;
    }
    .rsa-tag {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.07);
      color: rgba(0, 0, 0, 0.65);
    }
    .qr-copy > span {
      font-size: 11.5px;
      line-height: 1.3;
      color: rgba(60, 60, 67, 0.75);
    }

    /* Denominations Grid */
    .denominations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 18px;
    }
    .tc-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .tc-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .tc-desc {
      font-size: 12px;
      font-weight: 500;
      opacity: 0.92;
    }
    .tc-serial {
      font-size: 10px;
      opacity: 0.75;
    }
    .tc-cta {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 7px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: #000;
      font-size: 13px;
      font-weight: 700;
    }
    .tc-cta.gold-cta {
      background: linear-gradient(135deg, #FFE066 0%, #F59E0B 100%);
      color: #111;
    }

    .empty-state {
      --r: 22px;
      padding: 56px 28px;
      background: var(--ios-cell);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .empty-icon {
      --r: 18px;
      width: 64px;
      height: 64px;
      background: var(--ios-fill);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-buy {
      --r: 12px;
      margin-top: 8px;
      padding: 12px 20px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
    }

    .custom-card-strip {
      --r: 20px;
      padding: 18px 20px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ccs-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .ccs-head div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ccs-head strong {
      font-size: 15px;
      font-weight: 700;
    }
    .ccs-head span {
      font-size: 12.5px;
      color: var(--ios-label-2);
    }
    .saved-cards-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .saved-card-pill {
      --r: 14px;
      border: 1px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 11px;
      text-align: left;
      flex: 1;
      min-width: 260px;
    }
    .saved-card-pill.selected {
      border-color: var(--ion-color-primary);
      box-shadow: 0 0 0 1px var(--ion-color-primary);
    }
    .scp-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .scp-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .scp-copy strong {
      font-size: 13.5px;
      font-weight: 700;
    }
    .scp-copy span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }
    .scp-check {
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
    }
    .ccs-actions {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    .btn-save-card {
      --r: 11px;
      height: 40px;
      padding: 0 14px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      font-size: 13px;
      font-weight: 600;
    }
    .btn-save-card.primary {
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
    }
    .card-error-msg {
      font-size: 12.5px;
      font-weight: 600;
      color: #FF3B30;
    }
    .ccs-inputs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .ccs-field {
      flex: 2;
      min-width: 210px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ccs-field.small {
      flex: 1;
      min-width: 120px;
    }
    .ccs-field span {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .ccs-field input {
      height: 40px;
      border-radius: 11px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      padding: 0 12px;
      font-size: 13.5px;
      font-weight: 600;
      outline: none;
    }
  `]
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

