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
  IonModal,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonSpinner
} from '@ionic/angular/standalone';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { TicketDenomination } from '../../core/models/wallet.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

interface Denomination {
  amount: TicketDenomination;
  tier: string;
  badge: string;
  desc: string;
  code: string;
  cls: string;
  isTitanium?: boolean;
}

interface PaymentMethod {
  id: string;
  title: string;
  sub: string;
  icon: string;
  tint: string;
}

type SheetState = 'idle' | 'waiting_approval' | 'done' | 'rejected';

@Component({
  selector: 'app-store',
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
    IonModal,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonSpinner,
    SfSymbolComponent
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="wallet.toggleTheme()" aria-label="Cambiar apariencia">
            <sf-symbol name="circle.lefthalf.filled" [size]="22" />
          </ion-button>
        </ion-buttons>
        <ion-title>Comprar Tickets</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="goToVault()" aria-label="Mis Tickets y Escáner QR">
            <sf-symbol name="qrcode.viewfinder" [size]="21" />
          </ion-button>
          <ion-button (click)="wallet.lockSession('Bloqueo manual')" aria-label="Bloquear">
            <sf-symbol name="lock.fill" [size]="20" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Comprar Tickets</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Tarjeta de Persona Activa (Soporte Multi-Usuario) -->
      <section class="user-strip continuous">
        <div class="us-left">
          <span class="us-avatar">{{ wallet.currentUserInitials() }}</span>
          <div class="us-copy">
            <strong>{{ wallet.currentUserName() || 'Usuario Activo' }}</strong>
            <span>{{ wallet.currentUserEmail() }}</span>
          </div>
        </div>
        <button class="us-switch continuous apple-pressable" (click)="wallet.lockSession('Cambio de cuenta')">
          <sf-symbol name="person.crop.circle" [size]="15" />
          <span>Cambiar</span>
        </button>
      </section>

      <!-- Aviso en vivo si hay solicitudes de compra de ticket pendientes de aprobación del Banco -->
      @if (wallet.pendingTicketRequests().length > 0) {
        <section class="pending-req-banner continuous">
          <sf-symbol name="clock.fill" [size]="19" />
          <div class="prb-copy">
            <strong>{{ wallet.pendingTicketRequests().length }} compra(s) esperando aprobación del Banco</strong>
            <span>El Administrador de CentralBank debe aceptar el pago de tu tarjeta para emitir el ticket.</span>
          </div>
        </section>
      }

      <!-- Tarjeta resumen de saldo disponible en bóveda -->
      <section class="balance-card continuous">
        <div class="bal-main">
          <span class="balance-label">Saldo disponible en bóveda</span>
          <span class="balance-amount">
            {{ wallet.availableBalance() | currency: 'MXN' : 'symbol-narrow' }}<small>MXN</small>
          </span>
        </div>
        <button class="balance-pill continuous apple-pressable" (click)="goToVault()">
          <span>{{ wallet.activeTickets().length }} activos</span>
          <sf-symbol name="chevron.right" [size]="13" [weight]="2.4" />
        </button>
      </section>

      <header class="section-head">
        <div>
          <h2>Denominaciones oficiales</h2>
          <p>Certificados emitidos tras aprobación bancaria de tu tarjeta</p>
        </div>
      </header>

      <!-- Tarjetas estilo Apple Card / App Store Gift Card -->
      <div class="cards-stack">
        @for (d of denominations; track d.amount) {
          <article
            class="ticket-card continuous apple-pressable"
            [class]="'ticket-card continuous apple-pressable ' + d.cls"
            [attr.aria-label]="'Comprar ticket de ' + d.amount + ' pesos'"
            (click)="open(d)"
          >
            <svg class="card-watermark" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <circle cx="150" cy="100" r="88" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 5" />
              <circle cx="150" cy="100" r="64" stroke="currentColor" stroke-width="1.2" />
              <circle cx="150" cy="100" r="40" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4" />
              <path d="M90 100h120M150 40v120" stroke="currentColor" stroke-width="0.8" />
            </svg>

            <span class="notch notch-left" aria-hidden="true"></span>
            <span class="notch notch-right" aria-hidden="true"></span>

            <div class="tc-top">
              <div class="tc-issuer">
                <span class="tc-emblem">
                  <sf-symbol name="building.columns" [size]="14" [weight]="2.1" />
                </span>
                <div class="tc-issuer-copy">
                  <strong>BANCO CENTRAL</strong>
                  <span>CERTIFICADO DIGITAL · {{ d.tier | uppercase }}</span>
                </div>
              </div>

              <span class="tc-badge" [class.gold-badge]="d.isTitanium">
                {{ d.badge }}
              </span>
            </div>

            <div class="tc-middle">
              <div class="tc-price-block">
                <div class="tc-amount">
                  <span class="cur">$</span>{{ d.amount }}<span class="dec">.00</span>
                </div>
                <span class="tc-currency-tag">MXN · Valor Fijo</span>
              </div>

              <div class="tc-hardware" aria-hidden="true">
                <div class="emv-chip" [class.gold-chip]="d.isTitanium">
                  <span></span><span></span><span></span><span></span>
                </div>
              </div>
            </div>

            <div class="tc-perforation" aria-hidden="true"></div>

            <div class="tc-bottom">
              <div class="tc-meta">
                <span class="tc-desc">{{ d.desc }}</span>
                <span class="tc-serial">{{ d.code }}</span>
              </div>

              <div class="tc-cta" [class.gold-cta]="d.isTitanium">
                <span>Adquirir</span>
                <sf-symbol name="plus" [size]="14" [weight]="2.6" />
              </div>
            </div>
          </article>
        }
      </div>

      <p class="footnote">
        <sf-symbol name="shield.checkered" [size]="16" />
        <span>
          Cada compra de ticket es validada y aprobada por el Administrador en CentralBank Desktop (simulando la autorización bancaria de tu tarjeta sin requerir datos reales).
        </span>
      </p>

      <!-- Bottom Sheet deslizable de confirmación y aprobación bancaria -->
      <ion-modal
        class="sheet-auto"
        [isOpen]="sheetOpen()"
        [initialBreakpoint]="1"
        [breakpoints]="[0, 1]"
        [handle]="true"
        (didDismiss)="onDismiss()"
      >
        <ng-template>
          <div class="sheet">
            @if (selected(); as d) {
              <div class="sheet-head">
                <span class="sheet-title">
                  @switch (state()) {
                    @case ('done') { ¡Pago Aprobado! }
                    @case ('waiting_approval') { Validando Tarjeta en Banco }
                    @case ('rejected') { Pago Rechazado }
                    @default { Confirmar compra de ticket }
                  }
                </span>
                <button class="sheet-close" aria-label="Cerrar" (click)="close()">
                  <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
                </button>
              </div>

              <!-- Mini tarjeta en el modal -->
              <div class="sheet-card continuous" [class]="'sheet-card continuous ' + d.cls">
                <div class="sc-top">
                  <span class="sc-issuer">
                    <sf-symbol name="building.columns" [size]="13" [weight]="2" />
                    Banco Central
                  </span>
                  <span class="emv-mini"></span>
                </div>
                <span class="sheet-card-amount"><span class="cur">$</span>{{ d.amount }}<small>.00</small></span>
                <div class="sc-bottom">
                  <span>Ticket {{ d.tier }} · MXN</span>
                  <span class="sc-code">{{ d.code }}</span>
                </div>
              </div>

              @if (state() === 'done') {
                <div class="done">
                  <sf-symbol class="done-icon" name="checkmark.circle.fill" [size]="56" />
                  <strong>Pago Aprobado por el Banco Central</strong>
                  <span>El Administrador autorizó tu tarjeta y el ticket se guardó en Mis Tickets.</span>
                </div>
              } @else if (state() === 'waiting_approval') {
                <div class="waiting-box continuous">
                  <div class="wait-orb">
                    <ion-spinner name="crescent" />
                  </div>
                  <strong>Esperando Aprobación del Administrador</strong>
                  <p>{{ approvalProgressText() }}</p>
                  <div class="wait-steps">
                    <div class="ws-row ok">
                      <sf-symbol name="checkmark.circle.fill" [size]="16" />
                      <span>Solicitud {{ currentRequestId() ? '#' + currentRequestId() : '' }} enviada por canal seguro</span>
                    </div>
                    <div class="ws-row active">
                      <sf-symbol name="building.columns" [size]="16" />
                      <span>El Administrador en CentralBank acepta o rechaza el cargo a tarjeta</span>
                    </div>
                  </div>
                </div>
              } @else if (state() === 'rejected') {
                <div class="rejected-box continuous">
                  <sf-symbol class="rej-icon" name="exclamationmark.triangle.fill" [size]="48" />
                  <strong>Pago Rechazado por el Banco Central</strong>
                  <p>{{ rejectionReason() }}</p>
                  <button class="pay-btn continuous apple-pressable" (click)="state.set('idle')">
                    Intentar con otro método de pago
                  </button>
                </div>
              } @else {
                <ion-list [inset]="true">
                  @for (m of methods; track m.id) {
                    <ion-item button [detail]="false" (click)="selectMethod(m.id)">
                      <span slot="start" class="method-icon" [style.background]="m.tint">
                        <sf-symbol [name]="m.icon" [size]="17" [weight]="2" />
                      </span>
                      <ion-label>
                        <h3>{{ m.title }}</h3>
                        <p>{{ m.sub }}</p>
                      </ion-label>
                      @if (payment() === m.id) {
                        <sf-symbol slot="end" class="check" name="checkmark" [size]="18" [weight]="2.6" />
                      }
                    </ion-item>
                  }
                </ion-list>

                <ion-list [inset]="true">
                  <ion-item>
                    <ion-label>Ticket {{ d.tier }}</ion-label>
                    <ion-note slot="end">{{ d.amount | currency: 'MXN' : 'symbol-narrow' }}</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-label>Validación Bancaria</ion-label>
                    <ion-note slot="end">Administrador CentralBank</ion-note>
                  </ion-item>
                  <ion-item lines="none">
                    <ion-label><strong>Total a autorizar</strong></ion-label>
                    <ion-note slot="end" class="total">{{ d.amount | currency: 'MXN' : 'symbol-narrow' }}</ion-note>
                  </ion-item>
                </ion-list>

                <div class="pay-wrap">
                  <button
                    class="pay-btn continuous apple-pressable"
                    (click)="confirm()"
                  >
                    <sf-symbol name="faceid" [size]="22" [weight]="2" />
                    <span>{{ payLabel() }}</span>
                  </button>
                  <p class="sheet-foot">
                    El Administrador del Banco Central validará y aprobará el pago de tu tarjeta antes de emitir el ticket.
                  </p>
                </div>
              }
            }
          </div>
        </ng-template>
      </ion-modal>
    </ion-content>
  `,
  styles: [`
    .user-strip {
      --r: 16px;
      margin: 2px 20px 10px;
      padding: 10px 14px;
      background: var(--ios-cell);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .us-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .us-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 12.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .us-copy {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .us-copy strong {
      font-size: 14px;
      font-weight: 600;
      color: var(--ios-label);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .us-copy span {
      font-size: 11.5px;
      color: var(--ios-label-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .us-switch {
      --r: 999px;
      border: 0;
      padding: 6px 11px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .pending-req-banner {
      --r: 16px;
      margin: 0 20px 12px;
      padding: 12px 14px;
      background: rgba(255, 149, 0, 0.16);
      border: 1px solid rgba(255, 149, 0, 0.4);
      color: #EA580C;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .prb-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .prb-copy strong {
      font-size: 13px;
      font-weight: 700;
      color: var(--ios-label);
    }
    .prb-copy span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }

    .balance-card {
      --r: 20px;
      margin: 4px 20px 22px;
      padding: 16px 18px;
      background: var(--ios-cell);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .bal-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .balance-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--ios-label-2);
    }
    .balance-amount {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      color: var(--ios-label);
    }
    .balance-amount small {
      margin-left: 5px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0;
      color: var(--ios-label-2);
    }
    .balance-pill {
      --r: 999px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 13px;
      border: 0;
      background: rgba(10, 132, 255, 0.14);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--ion-color-primary);
    }

    .section-head {
      padding: 0 20px 14px;
    }
    .section-head h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ios-label);
    }
    .section-head p {
      margin: 2px 0 0;
      font-size: 14px;
      color: var(--ios-label-2);
    }

    .cards-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 0 20px;
    }

    .ticket-card {
      --r: 24px;
      position: relative;
      overflow: hidden;
      padding: 18px 20px 16px;
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow:
        var(--ios-shadow-card),
        inset 0 1px 0 rgba(255, 255, 255, 0.32),
        inset 0 -1px 0 rgba(0, 0, 0, 0.25);
    }
    .ticket-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(125deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.04) 38%, transparent 60%);
      pointer-events: none;
    }

    .card-watermark {
      position: absolute;
      right: -28px;
      top: -18px;
      width: 195px;
      height: 195px;
      color: rgba(255, 255, 255, 0.11);
      pointer-events: none;
    }

    .notch {
      position: absolute;
      bottom: 58px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--ion-background-color);
      z-index: 3;
      pointer-events: none;
    }
    .notch-left { left: -9px; }
    .notch-right { right: -9px; }

    .tc-top,
    .tc-middle,
    .tc-perforation,
    .tc-bottom {
      position: relative;
      z-index: 2;
    }

    .tc-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .tc-issuer {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .tc-emblem {
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
    .tc-issuer-copy {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .tc-issuer-copy strong {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
    }
    .tc-issuer-copy span {
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.04em;
      opacity: 0.8;
    }

    .tc-badge {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      background: rgba(255, 255, 255, 0.2);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.3);
    }
    .tc-badge.gold-badge {
      background: rgba(255, 214, 10, 0.18);
      color: #FFD60A;
      box-shadow: inset 0 0 0 0.5px rgba(255, 214, 10, 0.45);
    }

    .tc-middle {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin: 14px 0 12px;
    }
    .tc-price-block {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tc-amount {
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
    .tc-currency-tag {
      font-size: 12.5px;
      font-weight: 600;
      opacity: 0.88;
    }

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

    .tc-perforation {
      border-top: 1px dashed rgba(255, 255, 255, 0.26);
      margin: 2px -4px 10px;
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
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tc-serial {
      font-family: var(--font-mono);
      font-size: 10px;
      opacity: 0.7;
      letter-spacing: 0.02em;
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
      letter-spacing: -0.01em;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
    }
    .tc-cta.gold-cta {
      background: linear-gradient(135deg, #FFE066 0%, #F59E0B 100%);
      color: #111;
    }

    .footnote {
      display: flex;
      gap: 8px;
      margin: 0;
      padding: 22px 24px 32px;
      font-size: 13px;
      line-height: 1.4;
      color: var(--ios-label-2);
    }

    /* Mini tarjeta en el Bottom Sheet */
    .sheet-card {
      --r: 18px;
      position: relative;
      overflow: hidden;
      width: 248px;
      aspect-ratio: 1.586;
      margin: 10px auto 8px;
      padding: 14px 16px;
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow:
        var(--ios-shadow-card),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }
    .sc-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
    }
    .sc-issuer {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .emv-mini {
      width: 24px;
      height: 17px;
      border-radius: 3.5px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.45));
    }
    .sheet-card-amount {
      font-size: 38px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .sheet-card-amount small {
      font-size: 16px;
      font-weight: 700;
      opacity: 0.85;
    }
    .sc-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      opacity: 0.9;
    }
    .sc-code {
      font-family: var(--font-mono);
      font-size: 10px;
      opacity: 0.8;
    }

    .method-icon {
      width: 32px;
      height: 32px;
      margin-right: 12px;
      border-radius: 8px;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.18);
    }
    ion-label h3 {
      font-size: 16px !important;
      font-weight: 500 !important;
      color: var(--ios-label) !important;
    }
    ion-label p {
      font-size: 12.5px !important;
      color: var(--ios-label-2) !important;
    }
    .check { color: var(--ion-color-primary); }
    ion-note {
      font-size: 16px;
      color: var(--ios-label-2);
    }
    ion-note.total {
      font-weight: 600;
      color: var(--ios-label);
    }

    .pay-wrap { padding: 4px 16px 0; }
    .pay-btn {
      --r: 14px;
      width: 100%;
      height: 54px;
      border: 0;
      background: var(--ios-pay-bg);
      color: var(--ios-pay-fg);
      font-family: inherit;
      font-size: 16.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .sheet-foot {
      margin: 10px 8px 0;
      text-align: center;
      font-size: 12px;
      color: var(--ios-label-2);
    }

    /* Waiting approval state */
    .waiting-box,
    .rejected-box {
      --r: 18px;
      margin: 10px 16px 16px;
      padding: 20px 18px;
      background: var(--ios-cell);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .wait-orb {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: rgba(0, 122, 255, 0.14);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .waiting-box strong,
    .rejected-box strong {
      font-size: 18px;
      font-weight: 700;
      color: var(--ios-label);
    }
    .waiting-box p,
    .rejected-box p {
      margin: 0;
      font-size: 13.5px;
      line-height: 1.4;
      color: var(--ios-label-2);
    }
    .wait-steps {
      width: 100%;
      margin-top: 8px;
      padding: 12px;
      border-radius: 14px;
      background: var(--ios-sheet-cell);
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }
    .ws-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--ios-label-2);
    }
    .ws-row.ok {
      color: var(--ion-color-success);
      font-weight: 600;
    }
    .ws-row.active {
      color: var(--ion-color-primary);
      font-weight: 600;
    }
    .rej-icon {
      color: var(--ion-color-danger);
    }

    .done {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 22px 20px 28px;
      text-align: center;
      animation: pop 420ms cubic-bezier(0.34, 1.4, 0.64, 1);
    }
    .done-icon {
      margin-bottom: 8px;
      color: var(--ion-color-success);
    }
    .done strong {
      font-size: 20px;
      font-weight: 600;
      color: var(--ios-label);
    }
    .done span {
      font-size: 15px;
      color: var(--ios-label-2);
    }
    @keyframes pop {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }
  `]
})
export class StorePage {
  readonly wallet = inject(WalletStateService);
  private readonly router = inject(Router);

  readonly denominations: Denomination[] = [
    {
      amount: 50,
      tier: 'Estándar',
      badge: 'Validación bancaria',
      desc: 'Ideal para compras rápidas y envíos',
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

  readonly methods: PaymentMethod[] = [
    {
      id: 'Tarjeta Visa •••• 4821',
      title: 'Tarjeta de Débito o Crédito',
      sub: 'Visa •••• 4821 · Validación por Administrador Banco',
      icon: 'creditcard',
      tint: '#000000'
    },
    {
      id: 'Tarjeta Mastercard •••• 8814',
      title: 'Tarjeta Mastercard Oro',
      sub: 'Mastercard •••• 8814 · Validación por Administrador Banco',
      icon: 'creditcard.fill',
      tint: '#EA580C'
    },
    {
      id: 'Transferencia SPEI',
      title: 'Transferencia SPEI',
      sub: 'CLABE interbancaria · Validación Banco Central',
      icon: 'building.columns',
      tint: '#007AFF'
    }
  ];

  readonly sheetOpen = signal(false);
  readonly selected = signal<Denomination | null>(null);
  readonly payment = signal('Tarjeta Visa •••• 4821');
  readonly state = signal<SheetState>('idle');
  readonly approvalProgressText = signal('Enviando solicitud de pago al Banco Central...');
  readonly currentRequestId = signal('');
  readonly rejectionReason = signal('');
  private cancelWaitingFlag = false;

  readonly payLabel = computed(() => 'Solicitar Aprobación del Banco Central');

  open(d: Denomination): void {
    this.wallet.haptic('light');
    this.selected.set(d);
    this.state.set('idle');
    this.cancelWaitingFlag = false;
    this.sheetOpen.set(true);
  }

  close(): void {
    this.cancelWaitingFlag = true;
    this.sheetOpen.set(false);
  }

  selectMethod(id: string): void {
    if (this.payment() !== id) this.wallet.haptic('selection');
    this.payment.set(id);
  }

  async confirm(): Promise<void> {
    const d = this.selected();
    if (!d || this.state() === 'waiting_approval') return;

    this.cancelWaitingFlag = false;
    this.currentRequestId.set('');
    this.state.set('waiting_approval');
    this.approvalProgressText.set(
      'Conectando con CentralBank Desktop (:5050) para validar tu tarjeta...'
    );

    const result = await this.wallet.requestAndWaitTicketPurchaseApproval(
      d.amount,
      this.payment(),
      (progressMsg, reqId) => {
        this.approvalProgressText.set(progressMsg);
        if (reqId) this.currentRequestId.set(reqId);
      },
      () => this.cancelWaitingFlag
    );

    if (this.cancelWaitingFlag) return;

    if (!result.ok) {
      this.rejectionReason.set(
        result.error || 'El Administrador del Banco Central rechazó el pago con tarjeta.'
      );
      this.state.set('rejected');
      this.wallet.haptic('error');
      return;
    }

    this.state.set('done');
    this.wallet.haptic('success');

    setTimeout(() => {
      this.sheetOpen.set(false);
      this.router.navigateByUrl('/tabs/vault');
    }, 1200);
  }

  onDismiss(): void {
    this.cancelWaitingFlag = true;
    this.sheetOpen.set(false);
    this.state.set('idle');
  }

  goToVault(): void {
    this.router.navigateByUrl('/tabs/vault');
  }
}
