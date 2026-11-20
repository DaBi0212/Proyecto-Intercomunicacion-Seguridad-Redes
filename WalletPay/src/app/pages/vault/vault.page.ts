import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonModal,
  IonList,
  IonItem,
  IonNote,
  IonSpinner
} from '@ionic/angular/standalone';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { BankTicket } from '../../core/models/wallet.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';
import { AppleSpring, VelocityTracker, projectMomentum, rubberband } from '../../core/utils/apple-spring';

type RedeemState = 'idle' | 'verifying' | 'done';

@Component({
  selector: 'app-vault',
  standalone: true,
  imports: [
    CurrencyPipe,
    UpperCasePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonModal,
    IonList,
    IonItem,
    IonNote,
    IonSpinner,
    SfSymbolComponent
  ],
  template: `
    <!-- Barra de navegación superior translúcida -->
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="wallet.toggleTheme()" aria-label="Cambiar apariencia">
            <sf-symbol name="circle.lefthalf.filled" [size]="22" />
          </ion-button>
        </ion-buttons>
        <ion-title>Mis Tickets</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="wallet.lockSession('Bloqueo manual')" aria-label="Bloquear">
            <sf-symbol name="lock.fill" [size]="20" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <!-- Encabezado Large Title nativo de iOS que se reduce al hacer scroll -->
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Mis Tickets</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Segmented Control nativo de iOS (Disponibles vs Usados) -->
      <div class="segment-wrap">
        <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event)" mode="ios">
          <ion-segment-button value="active">
            <ion-label>Disponibles ({{ wallet.activeTickets().length }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="used">
            <ion-label>Usados ({{ wallet.usedTickets().length }})</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      @if (tickets().length === 0) {
        <div class="empty-state">
          <div class="empty-icon continuous">
            <sf-symbol name="wallet.pass" [size]="34" />
          </div>
          <h3>{{ segment() === 'active' ? 'Sin tickets disponibles' : 'Sin tickets usados' }}</h3>
          <p>
            {{
              segment() === 'active'
                ? 'Adquiere un ticket del Banco Central para pagar en la tienda virtual.'
                : 'Los tickets que canjees en la tienda aparecerán aquí.'
            }}
          </p>
          @if (segment() === 'active') {
            <button class="btn-buy continuous apple-pressable" (click)="goToStore()">
              Comprar Tickets
            </button>
          }
        </div>
      } @else {
        <!-- Carrusel tipo Apple Wallet con consistencia visual 1:1 respecto a Comprar Tickets -->
        <section
          class="carousel-stage"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="onPointerUp($event)"
        >
          <div
            class="carousel-track"
            [style.transform]="'translate3d(' + offset() + 'px, 0, 0)'"
          >
            @for (t of tickets(); track t.id; let i = $index) {
              <article
                class="pass continuous"
                [class]="'pass continuous ' + t.colorClass"
                [class.is-used]="t.status === 'used'"
                [class.is-inactive]="i !== index()"
              >
                <!-- Marca de agua geométrica de seguridad (idéntica a las tarjetas de tienda) -->
                <svg class="pass-watermark" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                  <circle cx="150" cy="85" r="88" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 5" />
                  <circle cx="150" cy="85" r="64" stroke="currentColor" stroke-width="1.2" />
                  <circle cx="150" cy="85" r="40" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4" />
                  <path d="M90 85h120M150 25v120" stroke="currentColor" stroke-width="0.8" />
                </svg>

                <!-- Muescas laterales de boleto alineadas con la perforación -->
                <span class="notch notch-left" aria-hidden="true"></span>
                <span class="notch notch-right" aria-hidden="true"></span>

                <!-- Cabecera del pase: Emblema + CERTIFICADO DIGITAL + Estado -->
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
                    {{ t.status === 'used' ? 'USADO' : 'ACTIVO' }}
                  </span>
                </header>

                <!-- Bloque central: Valor nominal con .00 + Chip metálico EMV -->
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

                <!-- Metadatos enmascarados + Firma RSA -->
                <div class="pass-meta">
                  <div>
                    <span class="meta-k">FOLIO DE SEGURIDAD</span>
                    <span class="meta-v mono">{{ t.qrRevealed ? t.id : t.serialMasked }}</span>
                  </div>
                  <div>
                    <span class="meta-k">{{ t.status === 'used' ? 'CANJEADO' : 'EMITIDO' }}</span>
                    <span class="meta-v">{{ t.status === 'used' ? t.usedAt : t.issuedAt }}</span>
                  </div>
                </div>

                <!-- Línea divisoria perforada de boleto -->
                <div class="pass-perforation" aria-hidden="true"></div>

                <!-- Talón inferior del ticket: Código QR difuminado por seguridad -->
                <button
                  type="button"
                  class="qr-well continuous apple-pressable"
                  (click)="toggleQr(t, $event)"
                  [attr.aria-label]="t.qrRevealed ? 'Ocultar código QR' : 'Desbloquear código QR con Face ID'"
                >
                  <div class="qr-frame">
                    <svg
                      class="qr-code"
                      [class.blurred]="!t.qrRevealed"
                      viewBox="0 0 84 84"
                      width="64"
                      height="64"
                      aria-hidden="true"
                    >
                      <rect x="6" y="6" width="20" height="20" rx="3" fill="#000"/>
                      <rect x="10" y="10" width="12" height="12" rx="1.5" fill="#fff"/>
                      <rect x="13" y="13" width="6" height="6" fill="#000"/>
                      <rect x="58" y="6" width="20" height="20" rx="3" fill="#000"/>
                      <rect x="62" y="10" width="12" height="12" rx="1.5" fill="#fff"/>
                      <rect x="65" y="13" width="6" height="6" fill="#000"/>
                      <rect x="6" y="58" width="20" height="20" rx="3" fill="#000"/>
                      <rect x="10" y="62" width="12" height="12" rx="1.5" fill="#fff"/>
                      <rect x="13" y="65" width="6" height="6" fill="#000"/>
                      <rect x="32" y="10" width="8" height="8" rx="1.5" fill="#000"/>
                      <rect x="44" y="16" width="8" height="8" rx="1.5" fill="#000"/>
                      <rect x="30" y="30" width="14" height="14" rx="2" fill="#000"/>
                      <rect x="48" y="34" width="10" height="10" rx="1.5" fill="#000"/>
                      <rect x="14" y="36" width="10" height="10" rx="1.5" fill="#000"/>
                      <rect x="62" y="38" width="12" height="12" rx="2" fill="#000"/>
                      <rect x="34" y="52" width="12" height="12" rx="2" fill="#000"/>
                      <rect x="52" y="56" width="10" height="10" rx="1.5" fill="#000"/>
                      <rect x="66" y="64" width="12" height="12" rx="2" fill="#000"/>
                    </svg>
                    @if (!t.qrRevealed) {
                      <span class="qr-lock">
                        <sf-symbol name="lock.fill" [size]="18" />
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
                          ? 'Ticket redimido y verificado ante el Banco Central'
                          : t.qrRevealed
                          ? 'Folio visible · Toca para bloquear'
                          : 'Código protegido · Toca para ver con Face ID'
                      }}
                    </span>
                  </div>
                </button>
              </article>
            }
          </div>
        </section>

        <!-- Indicadores de página -->
        <div class="dots" role="tablist" aria-label="Selector de ticket">
          @for (t of tickets(); track t.id; let i = $index) {
            <button
              type="button"
              class="dot"
              [class.active]="i === index()"
              [attr.aria-label]="'Ticket ' + (i + 1)"
              (click)="snapTo(i, 0)"
            ></button>
          }
        </div>

        <!-- Acción contextual para el ticket activo -->
        @if (current(); as sel) {
          <section class="pass-actions">
            @if (sel.status === 'active') {
              <button class="redeem-btn continuous apple-pressable" (click)="openRedeem(sel)">
                <sf-symbol name="storefront" [size]="20" [weight]="2" />
                <span>Usar en Tienda Virtual</span>
              </button>
              <p class="pass-caption">
                Al pagar en la tienda, el banco verifica la validez de este ticket antes de autorizar la compra.
              </p>
            } @else {
              <div class="used-banner continuous">
                <sf-symbol name="checkmark.seal.fill" [size]="20" />
                <span>Validado y canjeado el {{ sel.usedAt }}</span>
              </div>
            }
          </section>
        }
      }

      <!-- Bottom Sheet deslizable para confirmar el canje del ticket en la tienda -->
      <ion-modal
        class="sheet-auto"
        [isOpen]="redeemOpen()"
        [initialBreakpoint]="1"
        [breakpoints]="[0, 1]"
        [handle]="true"
        [canDismiss]="redeemState() !== 'verifying'"
        (didDismiss)="onRedeemDismiss()"
      >
        <ng-template>
          <div class="sheet">
            @if (current(); as sel) {
              <div class="sheet-head">
                <span class="sheet-title">
                  {{ redeemState() === 'done' ? 'Redirigiendo a MarketStore' : 'Usar en Tienda Virtual' }}
                </span>
                <button class="sheet-close" aria-label="Cerrar" (click)="closeRedeem()">
                  <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
                </button>
              </div>

              @if (redeemState() === 'done') {
                <div class="redeem-done">
                  <sf-symbol class="done-icon" name="checkmark.circle.fill" [size]="56" />
                  <strong>Abriendo MarketStore</strong>
                  <span>Selecciona tus productos en la tienda; el Banco Central verificará y aprobará tu compra.</span>
                </div>
              } @else {
                <ion-list [inset]="true">
                  <ion-item>
                    <ion-label>Comercio</ion-label>
                    <ion-note slot="end">MarketStore (Tienda Web)</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-label>Ticket seleccionado</ion-label>
                    <ion-note slot="end" class="mono">{{ sel.id }}</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-label>Emisor</ion-label>
                    <ion-note slot="end">Banco Central</ion-note>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-label><strong>Valor disponible</strong></ion-label>
                    <ion-note slot="end" class="total">
                      {{ sel.amount | currency: 'MXN' : 'symbol-narrow' }}
                    </ion-note>
                  </ion-item>
                </ion-list>

                <div class="sheet-cta">
                  <button
                    class="pay-btn continuous apple-pressable"
                    [disabled]="redeemState() === 'verifying'"
                    (click)="confirmRedeem()"
                  >
                    @if (redeemState() === 'verifying') {
                      <ion-spinner name="crescent" />
                      <span>Sincronizando con MarketStore…</span>
                    } @else {
                      <sf-symbol name="storefront" [size]="20" [weight]="2" />
                      <span>Ir a MarketStore y Elegir Productos</span>
                    }
                  </button>
                </div>
              }
            }
          </div>
        </ng-template>
      </ion-modal>
    </ion-content>
  `,
  styles: [`
    .segment-wrap {
      padding: 4px 20px 14px;
    }

    /* Carrusel tipo Apple Wallet */
    .carousel-stage {
      overflow: hidden;
      padding: 6px 20px 14px;
      touch-action: pan-y;
      cursor: grab;
    }
    .carousel-stage:active {
      cursor: grabbing;
    }
    .carousel-track {
      display: flex;
      gap: 14px;
      will-change: transform;
    }

    .pass {
      --r: 24px;
      position: relative;
      overflow: hidden;
      width: 306px;
      min-height: 382px;
      flex-shrink: 0;
      padding: 20px 20px 18px;
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow:
        var(--ios-shadow-card),
        inset 0 1px 0 rgba(255, 255, 255, 0.32),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25);
      transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 280ms ease, filter 280ms ease;
    }

    /* Brillo especular diagonal idéntico a las tarjetas de Tienda */
    .pass::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(125deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.04) 38%, transparent 60%);
      pointer-events: none;
    }

    /* Marca de agua geométrica de seguridad (Guilloché) */
    .pass-watermark {
      position: absolute;
      right: -28px;
      top: -12px;
      width: 200px;
      height: 200px;
      color: rgba(255, 255, 255, 0.11);
      pointer-events: none;
    }

    /* Muescas circulares laterales de boleto alineadas con la perforación */
    .notch {
      position: absolute;
      bottom: 112px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ion-background-color);
      z-index: 3;
      pointer-events: none;
    }
    .notch-left { left: -9px; }
    .notch-right { right: -9px; }

    .pass.is-inactive {
      transform: scale(0.96);
      opacity: 0.86;
    }
    .pass.is-used {
      filter: saturate(0.2);
    }

    .pass-head,
    .pass-middle,
    .pass-meta,
    .pass-perforation,
    .qr-well {
      position: relative;
      z-index: 2;
    }

    /* Cabecera consistente con StorePage */
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
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.32);
    }
    .status-pill.gold-pill {
      background: rgba(255, 214, 10, 0.2);
      color: #FFD60A;
      box-shadow: inset 0 0 0 0.5px rgba(255, 214, 10, 0.45);
    }
    .status-pill.used {
      background: rgba(0, 0, 0, 0.32);
    }

    /* Bloque central: Monto + Chip EMV */
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
      opacity: 0.8;
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
      letter-spacing: 0;
      opacity: 0.9;
    }

    /* Chip EMV estilo Apple Card */
    .emv-chip {
      width: 34px;
      height: 25px;
      border-radius: 5px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(220, 225, 235, 0.55) 100%);
      box-shadow:
        inset 0 0 0 0.5px rgba(255, 255, 255, 0.9),
        0 2px 6px rgba(0, 0, 0, 0.2);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 1.5px;
      padding: 4px;
      opacity: 0.92;
    }
    .emv-chip span {
      border: 0.5px solid rgba(0, 0, 0, 0.22);
      border-radius: 1.5px;
    }
    .emv-chip.gold-chip {
      background: linear-gradient(135deg, #FFE57F 0%, #D4AF37 55%, #AA7C11 100%);
    }

    /* Metadatos enmascarados */
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
    .mono {
      font-family: var(--font-mono);
    }

    /* Línea perforada del ticket */
    .pass-perforation {
      border-top: 1px dashed rgba(255, 255, 255, 0.28);
      margin: 2px -4px 10px;
    }

    /* Talón inferior con QR difuminado por seguridad */
    .qr-well {
      --r: 16px;
      width: 100%;
      border: 0;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.96);
      color: #000;
      text-align: left;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    }
    .qr-frame {
      position: relative;
      width: 64px;
      height: 64px;
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

    /* Dots */
    .dots {
      display: flex;
      justify-content: center;
      gap: 7px;
      padding: 4px 0 18px;
    }
    .dot {
      width: 7px;
      height: 7px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: var(--ios-label-3);
      transition: width 220ms cubic-bezier(0.2, 0.8, 0.2, 1), background 220ms ease;
    }
    .dot.active {
      width: 18px;
      background: var(--ios-label);
    }

    /* Acciones bajo el carrusel */
    .pass-actions {
      padding: 0 20px 32px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .redeem-btn {
      --r: 14px;
      width: 100%;
      height: 52px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-family: inherit;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .pass-caption {
      margin: 0;
      text-align: center;
      font-size: 13px;
      color: var(--ios-label-2);
    }
    .used-banner {
      --r: 14px;
      padding: 14px 16px;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    /* Estado vacío */
    .empty-state {
      padding: 56px 32px;
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
      background: var(--ios-cell);
      color: var(--ios-label-2);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }
    .empty-state h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--ios-label);
    }
    .empty-state p {
      margin: 0;
      max-width: 260px;
      font-size: 15px;
      line-height: 1.38;
      color: var(--ios-label-2);
    }
    .btn-buy {
      --r: 12px;
      margin-top: 10px;
      padding: 12px 20px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      font-weight: 600;
    }

    /* Sheet de redención */
    ion-note {
      font-size: 16px;
      color: var(--ios-label-2);
    }
    ion-note.total {
      font-weight: 600;
      color: var(--ios-label);
    }
    .sheet-cta {
      padding: 4px 16px 8px;
    }
    .pay-btn {
      --r: 14px;
      width: 100%;
      height: 54px;
      border: 0;
      background: var(--ios-pay-bg);
      color: var(--ios-pay-fg);
      font-family: inherit;
      font-size: 17px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .pay-btn ion-spinner {
      width: 20px;
      height: 20px;
      color: var(--ios-pay-fg);
    }
    .redeem-done {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 24px 20px 28px;
      text-align: center;
    }
    .done-icon {
      margin-bottom: 8px;
      color: var(--ion-color-success);
    }
    .redeem-done strong {
      font-size: 20px;
      font-weight: 600;
      color: var(--ios-label);
    }
    .redeem-done span {
      font-size: 15px;
      color: var(--ios-label-2);
    }
  `]
})
export class VaultPage {
  readonly wallet = inject(WalletStateService);
  private readonly router = inject(Router);

  readonly segment = signal<'active' | 'used'>('active');
  readonly index = signal(0);
  readonly offset = signal(0);

  readonly redeemOpen = signal(false);
  readonly redeemState = signal<RedeemState>('idle');

  readonly tickets = computed(() =>
    this.segment() === 'active' ? this.wallet.activeTickets() : this.wallet.usedTickets()
  );

  readonly current = computed<BankTicket | null>(() => {
    const list = this.tickets();
    return list[this.index()] ?? list[0] ?? null;
  });

  // Física de resortes de Apple (§2 1:1 tracking, §3 interrumpible, §5 velocity handoff, §6 momentum)
  private readonly spring = new AppleSpring(0, { damping: 0.84, response: 0.36 });
  private readonly tracker = new VelocityTracker();
  private dragging = false;
  private startX = 0;
  private grabStart = 0;
  private moved = 0;
  private readonly STRIDE = 320; // 306px tarjeta + 14px gap

  onSegmentChange(ev: CustomEvent): void {
    const next = ev.detail.value as 'active' | 'used';
    this.wallet.haptic('selection');
    this.segment.set(next);
    this.snapTo(0, 0);
  }

  onPointerDown(e: PointerEvent): void {
    if (this.tickets().length === 0) return;
    this.dragging = true;
    this.moved = 0;
    this.startX = e.clientX;
    this.grabStart = this.spring.position;
    this.spring.stop();
    this.tracker.reset();
    this.tracker.addSample(this.grabStart);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.startX;
    this.moved = Math.abs(dx);

    const count = this.tickets().length;
    const min = -Math.max(0, count - 1) * this.STRIDE;
    const max = 0;

    let pos = this.grabStart + dx;
    if (pos > max) pos = max + rubberband(pos - max, 280);
    else if (pos < min) pos = min + rubberband(pos - min, 280);

    this.spring.set(pos);
    this.offset.set(pos);
    this.tracker.addSample(pos);
  }

  onPointerUp(_e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;

    if (this.moved < 6) {
      this.snapTo(this.index(), 0);
      return;
    }

    const v = this.tracker.getVelocity();
    const projected = this.spring.position + projectMomentum(v, 0.994);
    const targetIdx = Math.round(-projected / this.STRIDE);
    this.snapTo(targetIdx, v);
  }

  snapTo(idx: number, velocity = 0): void {
    const count = this.tickets().length;
    const clamped = Math.max(0, Math.min(idx, Math.max(0, count - 1)));
    if (clamped !== this.index()) this.wallet.haptic('selection');
    this.index.set(clamped);

    const targetX = -clamped * this.STRIDE;
    this.spring.animateTo(targetX, {
      velocity,
      damping: Math.abs(velocity) > 150 ? 0.82 : 1.0,
      response: 0.35,
      onUpdate: (p) => this.offset.set(p)
    });
  }

  toggleQr(ticket: BankTicket, ev: Event): void {
    ev.stopPropagation();
    if (this.moved > 8) return;
    this.wallet.haptic('light');
    this.wallet.toggleTicketQrReveal(ticket.id);
  }

  openRedeem(ticket: BankTicket): void {
    if (ticket.status !== 'active') return;
    this.wallet.haptic('light');
    this.redeemState.set('idle');
    this.redeemOpen.set(true);
  }

  closeRedeem(): void {
    if (this.redeemState() !== 'verifying') this.redeemOpen.set(false);
  }

  async confirmRedeem(): Promise<void> {
    const sel = this.current();
    if (!sel || this.redeemState() === 'verifying') return;

    this.redeemState.set('verifying');
    await this.wallet.triggerBiometricPulse('Abriendo MarketStore...', 650);
    await this.wallet.redirectToMarketStoreWithTicket(sel.id);
    this.redeemState.set('done');
    this.wallet.haptic('success');

    setTimeout(() => {
      this.redeemOpen.set(false);
    }, 900);
  }

  onRedeemDismiss(): void {
    this.redeemOpen.set(false);
    this.redeemState.set('idle');
  }

  goToStore(): void {
    this.router.navigateByUrl('/tabs/store');
  }
}
