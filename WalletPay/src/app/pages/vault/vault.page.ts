import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import jsQR from 'jsqr';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { BankTicket } from '../../core/models/wallet.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';
import { AppleSpring, VelocityTracker, projectMomentum, rubberband } from '../../core/utils/apple-spring';
import { generateQrSvgData } from '../../core/utils/qr-generator';

type RedeemState = 'idle' | 'verifying' | 'done';

@Component({
  selector: 'app-vault',
  standalone: true,
  imports: [
    CurrencyPipe,
    UpperCasePipe,
    FormsModule,
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
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="wallet.toggleTheme()" aria-label="Cambiar apariencia">
            <sf-symbol name="circle.lefthalf.filled" [size]="22" />
          </ion-button>
        </ion-buttons>
        <ion-title>Mis Tickets</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="openCameraScanner()" aria-label="Escanear QR de amigo">
            <sf-symbol name="qrcode.viewfinder" [size]="22" />
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
          <ion-title size="large">Mis Tickets</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Barra de Acción Rápida: Escanear QR de Ticket de Amigo con Cámara Nativa -->
      <div class="qr-share-bar">
        <button type="button" class="scan-friend-btn continuous apple-pressable" (click)="openCameraScanner()">
          <span class="sfb-icon">
            <sf-symbol name="camera.viewfinder" [size]="20" [weight]="2.1" />
          </span>
          <div class="sfb-copy">
            <strong>Escanear QR de Ticket de Amigo</strong>
            <span>Usa la cámara nativa para recibir un ticket compartido</span>
          </div>
          <sf-symbol name="chevron.right" [size]="15" [weight]="2.4" />
        </button>
      </div>

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
                ? 'Adquiere un ticket aprobado por el Banco Central o escanea el código QR del ticket de un amigo.'
                : 'Los tickets que tú o tu amigo canjeen en la tienda aparecerán aquí.'
            }}
          </p>
          @if (segment() === 'active') {
            <div class="empty-ctas">
              <button class="btn-buy continuous apple-pressable" (click)="goToStore()">
                Comprar Tickets
              </button>
              <button class="btn-scan-empty continuous apple-pressable" (click)="openCameraScanner()">
                <sf-symbol name="camera.fill" [size]="16" />
                <span>Escanear QR de Amigo</span>
              </button>
            </div>
          }
        </div>
      } @else {
        <!-- Carrusel tipo Apple Wallet con QR Real ISO/IEC 18004 -->
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
                <svg class="pass-watermark" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                  <circle cx="150" cy="85" r="88" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 5" />
                  <circle cx="150" cy="85" r="64" stroke="currentColor" stroke-width="1.2" />
                  <circle cx="150" cy="85" r="40" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4" />
                  <path d="M90 85h120M150 25v120" stroke="currentColor" stroke-width="0.8" />
                </svg>

                <span class="notch notch-left" aria-hidden="true"></span>
                <span class="notch notch-right" aria-hidden="true"></span>

                <header class="pass-head">
                  <div class="issuer">
                    <span class="issuer-badge">
                      <sf-symbol name="building.columns" [size]="14" [weight]="2.1" />
                    </span>
                    <div class="issuer-text">
                      <strong>BANCO CENTRAL</strong>
                      <span>
                        @if (t.isSharedWithMe) {
                          COMPARTIDO POR {{ (t.ownerName || 'AMIGO') | uppercase }}
                        } @else if (t.isShared) {
                          COMPARTIDO VÍA QR · {{ t.tier | uppercase }}
                        } @else {
                          CERTIFICADO DIGITAL · {{ t.tier | uppercase }}
                        }
                      </span>
                    </div>
                  </div>
                  <span
                    class="status-pill"
                    [class.used]="t.status === 'used'"
                    [class.gold-pill]="t.amount === 500 && t.status === 'active'"
                  >
                    {{ t.status === 'used' ? 'USADO' : (t.isShared ? 'QR COMPARTIDO' : 'ACTIVO') }}
                  </span>
                </header>

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

                <div class="pass-meta">
                  <div>
                    <span class="meta-k">FOLIO DE SEGURIDAD</span>
                    <span class="meta-v mono">{{ t.qrRevealed ? t.id : t.serialMasked }}</span>
                  </div>
                  <div>
                    <span class="meta-k">{{ t.status === 'used' ? 'USADO POR' : 'TITULAR' }}</span>
                    <span class="meta-v">
                      {{ t.status === 'used' ? (t.usedByName || t.ownerName || 'Titular') : (t.ownerName || 'Tú') }}
                    </span>
                  </div>
                </div>

                <div class="pass-perforation" aria-hidden="true"></div>

                <!-- Talón inferior del ticket: Código QR Real ISO/IEC 18004 -->
                <button
                  type="button"
                  class="qr-well continuous apple-pressable"
                  (click)="toggleQr(t, $event)"
                  [attr.aria-label]="t.qrRevealed ? 'Ver QR para compartir' : 'Desbloquear código QR con Face ID'"
                >
                  <div class="qr-frame">
                    @let qrSvg = getQrSvgForTicket(t);
                    <svg
                      class="qr-code"
                      [class.blurred]="!t.qrRevealed"
                      [attr.viewBox]="qrSvg.viewBox"
                      width="64"
                      height="64"
                      shape-rendering="crispEdges"
                      aria-hidden="true"
                    >
                      <rect width="100%" height="100%" fill="#fff" />
                      <path [attr.d]="qrSvg.path" fill="#000" />
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
                      <span class="rsa-tag">{{ t.isShared ? 'COMPARTIDO' : 'QR OFICIAL' }}</span>
                    </div>
                    <span>
                      {{
                        t.status === 'used'
                          ? t.qrRevealed
                            ? 'Folio y QR visibles · Ticket ya utilizado (Anti-doble gasto activo)'
                            : 'Ticket ya utilizado · Toca para revelar Folio TKT y Código QR'
                          : t.qrRevealed
                          ? 'QR activo · Tu amigo puede escanearlo con su cámara'
                          : 'Código QR protegido · Toca para desbloquear y compartir'
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

        <!-- Acciones contextuales para el ticket activo -->
        @if (current(); as sel) {
          <section class="pass-actions">
            @if (sel.status === 'active') {
              <button class="redeem-btn continuous apple-pressable" (click)="openRedeem(sel)">
                <sf-symbol name="storefront" [size]="20" [weight]="2" />
                <span>Usar en Tienda Virtual (MarketStore)</span>
              </button>

              <button class="share-qr-btn continuous apple-pressable" (click)="openShareQrModal(sel)">
                <sf-symbol name="qrcode" [size]="19" [weight]="2" />
                <span>Compartir Ticket con Amigo (Mostrar QR)</span>
              </button>

              <p class="pass-caption">
                @if (sel.isSharedWithMe) {
                  Ticket compartido por <strong>{{ sel.ownerName }}</strong>. Si tú o tu amigo lo usan primero en MarketStore, el otro ya no podrá utilizarlo.
                } @else if (sel.isShared) {
                  Compartido por QR. Recuerda: el primero en canjearlo en la tienda lo consumirá y quedará inhabilitado para el otro.
                } @else {
                  Puedes usar este ticket en MarketStore o mostrar su QR para que un amigo lo escanee con su cámara.
                }
              </p>
            } @else {
              <button class="share-qr-btn continuous apple-pressable" (click)="openShareQrModal(sel)">
                <sf-symbol name="qrcode" [size]="19" [weight]="2" />
                <span>Ver Código TKT ({{ sel.id }}) y QR Oficial</span>
              </button>

              <div class="used-banner continuous">
                <sf-symbol name="checkmark.seal.fill" [size]="20" />
                <span>
                  Ya usado por {{ sel.usedByName || sel.ownerName || 'Titular' }}
                  {{ sel.orderId ? 'en #' + sel.orderId : '' }} ({{ sel.usedAt }}) · Inhabilitado para reuso
                </span>
              </div>
            }
          </section>
        }
      }

      <!-- MODAL 1: MOSTRAR QR EN GRANDE PARA QUE UN AMIGO LO ESCANEE CON SU CÁMARA -->
      <ion-modal
        class="sheet-auto"
        [isOpen]="shareQrOpen()"
        [initialBreakpoint]="1"
        [breakpoints]="[0, 1]"
        [handle]="true"
        (didDismiss)="shareQrOpen.set(false)"
      >
        <ng-template>
          <div class="sheet qr-share-sheet">
            @if (current(); as sel) {
              <div class="sheet-head">
                <span class="sheet-title">
                  {{ sel.status === 'used' ? 'Código TKT y QR de Ticket Usado' : 'Compartir Ticket con Amigo' }}
                </span>
                <button class="sheet-close" aria-label="Cerrar" (click)="shareQrOpen.set(false)">
                  <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
                </button>
              </div>

              <div class="qr-hero-box continuous">
                <div class="qhb-badge">
                  <sf-symbol name="building.columns" [size]="14" />
                  <span>BANCO CENTRAL · {{ sel.tier | uppercase }} · {{ '$' + sel.amount }}.00 MXN</span>
                </div>

                <div class="qr-large-frame">
                  @let bigQr = getQrSvgForTicket(sel);
                  <svg
                    [attr.viewBox]="bigQr.viewBox"
                    width="228"
                    height="228"
                    shape-rendering="crispEdges"
                    aria-label="Código QR oficial del ticket"
                  >
                    <rect width="100%" height="100%" fill="#ffffff" />
                    <path [attr.d]="bigQr.path" fill="#000000" />
                  </svg>
                </div>

                <strong class="mono qhb-folio">{{ sel.id }}</strong>
                <span class="qhb-owner">Comprado por: {{ sel.ownerName || wallet.currentUserName() }}</span>
              </div>

              <div class="security-notice continuous">
                <sf-symbol name="shield.checkered" [size]="19" />
                <div>
                  <strong>Protección Anti-Doble Gasto Activa</strong>
                  <span>
                    Pídele a tu amigo que abra <strong>WalletPay</strong> en su celular y pulse
                    <strong>"Escanear QR de Ticket de Amigo"</strong>. Si tú o tu amigo ya usaron este ticket, el Banco Central bloqueará su uso.
                  </span>
                </div>
              </div>
            }
          </div>
        </ng-template>
      </ion-modal>

      <!-- MODAL 2: ESCÁNER DE CÁMARA NATIVA PARA RECIBIR TICKET QR DE UN AMIGO -->
      <ion-modal
        class="sheet-auto"
        [isOpen]="scannerOpen()"
        [initialBreakpoint]="1"
        [breakpoints]="[0, 1]"
        [handle]="true"
        (didDismiss)="closeCameraScanner()"
      >
        <ng-template>
          <div class="sheet scanner-sheet">
            <div class="sheet-head">
              <span class="sheet-title">Escanear QR de Ticket de Amigo</span>
              <button class="sheet-close" aria-label="Cerrar" (click)="closeCameraScanner()">
                <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
              </button>
            </div>

            <div class="camera-stage continuous">
              <video
                #cameraVideo
                class="camera-video"
                autoplay
                playsinline
                muted
              ></video>
              <canvas #cameraCanvas class="camera-canvas"></canvas>

              <!-- Marco guía de escaneo láser -->
              <div class="viewfinder-overlay">
                <div class="vf-box">
                  <span class="vf-corner tl"></span>
                  <span class="vf-corner tr"></span>
                  <span class="vf-corner bl"></span>
                  <span class="vf-corner br"></span>
                  <div class="vf-laser"></div>
                </div>
                <span class="vf-hint">
                  {{
                    cameraActive()
                      ? 'Apunta la cámara al código QR del ticket de tu amigo'
                      : 'Iniciando cámara nativa del dispositivo...'
                  }}
                </span>
              </div>
            </div>

            <!-- Botón alternativo para tomar foto con la app de Cámara Nativa de Android -->
            <div class="native-cam-actions">
              <label class="native-capture-btn continuous apple-pressable">
                <sf-symbol name="camera.fill" [size]="18" />
                <span>Capturar Foto con Cámara Nativa</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  (change)="onNativeCameraPhotoCaptured($event)"
                />
              </label>
            </div>

            <!-- Resultado de validación de seguridad con el Banco Central -->
            @if (scanFeedback()) {
              <div
                class="scan-result-banner continuous"
                [class.ok]="scanSuccess()"
                [class.err]="!scanSuccess()"
              >
                <sf-symbol
                  [name]="scanSuccess() ? 'checkmark.seal.fill' : 'exclamationmark.triangle.fill'"
                  [size]="22"
                />
                <div class="srb-copy">
                  <strong>
                    {{
                      scanSuccess()
                        ? '¡Ticket Verificado y Vinculado!'
                        : 'Operación Bloqueada por Seguridad Bancaria'
                    }}
                  </strong>
                  <span>{{ scanFeedback() }}</span>
                </div>
              </div>
            }

            <!-- Respaldo manual de folio en caso de prueba sin segundo teléfono -->
            <div class="manual-qr-box continuous">
              <span class="mqb-label">¿PROBAR CON FOLIO O CÓDIGO QR MANUALMENTE?</span>
              <div class="mqb-row">
                <input
                  type="text"
                  class="mqb-input mono"
                  placeholder="Ej. TKT-8420-A1B2"
                  [(ngModel)]="manualQrInput"
                />
                <button
                  type="button"
                  class="mqb-btn continuous apple-pressable"
                  [disabled]="scanningBusy()"
                  (click)="submitManualQr()"
                >
                  Validar
                </button>
              </div>
            </div>
          </div>
        </ng-template>
      </ion-modal>

      <!-- MODAL 3: CONFIRMAR USO EN TIENDA VIRTUAL (MARKETSTORE EN VERCEL) -->
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
                  <strong>Abriendo MarketStore en Vercel</strong>
                  <span>Selecciona tus productos en la tienda; el Banco Central verificará y aprobará tu compra.</span>
                </div>
              } @else {
                <ion-list [inset]="true">
                  <ion-item>
                    <ion-label>Comercio Web</ion-label>
                    <ion-note slot="end">MarketStore (Vercel)</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-label>Ticket seleccionado</ion-label>
                    <ion-note slot="end" class="mono">{{ sel.id }}</ion-note>
                  </ion-item>
                  <ion-item>
                    <ion-label>Origen</ion-label>
                    <ion-note slot="end">
                      {{ sel.isSharedWithMe ? 'Compartido por ' + sel.ownerName : 'Tu Bóveda WalletPay' }}
                    </ion-note>
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
    .qr-share-bar {
      padding: 4px 20px 10px;
    }
    .scan-friend-btn {
      --r: 16px;
      width: 100%;
      border: 0;
      padding: 11px 14px;
      background: var(--ios-cell);
      color: var(--ios-label);
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 11px;
      text-align: left;
    }
    .sfb-icon {
      width: 38px;
      height: 38px;
      border-radius: 11px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sfb-copy {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .sfb-copy strong {
      font-size: 14px;
      font-weight: 600;
    }
    .sfb-copy span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }

    .segment-wrap {
      padding: 2px 20px 12px;
    }

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
    .pass::before {
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
      opacity: 0.86;
    }

    .status-pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10px;
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

    .pass-meta {
      display: grid;
      grid-template-columns: 1.25fr 0.75fr;
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
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .mono {
      font-family: var(--font-mono);
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
      font-size: 11px;
      line-height: 1.28;
      color: rgba(60, 60, 67, 0.78);
    }

    .dots {
      display: flex;
      justify-content: center;
      gap: 7px;
      padding: 4px 0 16px;
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

    .pass-actions {
      padding: 0 20px 32px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .redeem-btn {
      --r: 14px;
      width: 100%;
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
    .share-qr-btn {
      --r: 14px;
      width: 100%;
      height: 48px;
      border: 0;
      background: var(--ios-cell);
      color: var(--ios-label);
      font-family: inherit;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .pass-caption {
      margin: 0;
      text-align: center;
      font-size: 12.5px;
      line-height: 1.38;
      color: var(--ios-label-2);
    }
    .used-banner {
      --r: 14px;
      padding: 14px 16px;
      background: var(--ios-cell);
      color: var(--ios-label-2);
      font-size: 13.5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
    }

    /* Empty State */
    .empty-state {
      padding: 46px 28px;
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
      max-width: 280px;
      font-size: 14.5px;
      line-height: 1.38;
      color: var(--ios-label-2);
    }
    .empty-ctas {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
    }
    .btn-buy {
      --r: 12px;
      padding: 12px 18px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-family: inherit;
      font-size: 14.5px;
      font-weight: 600;
    }
    .btn-scan-empty {
      --r: 12px;
      padding: 12px 16px;
      border: 0;
      background: var(--ios-cell);
      color: var(--ios-label);
      font-family: inherit;
      font-size: 14.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    /* Modal Compartir QR */
    .qr-share-sheet {
      padding-bottom: 24px;
    }
    .qr-hero-box {
      --r: 22px;
      margin: 8px 16px 14px;
      padding: 18px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .qhb-badge {
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .qr-large-frame {
      padding: 12px;
      border-radius: 18px;
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qhb-folio {
      font-size: 18px;
      color: var(--ios-label);
    }
    .qhb-owner {
      font-size: 12.5px;
      color: var(--ios-label-2);
    }
    .security-notice {
      --r: 16px;
      margin: 0 16px;
      padding: 12px 14px;
      background: rgba(52, 199, 89, 0.14);
      color: var(--ion-color-success);
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .security-notice div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .security-notice strong {
      font-size: 13px;
      color: var(--ios-label);
    }
    .security-notice span {
      font-size: 12px;
      line-height: 1.38;
      color: var(--ios-label-2);
    }

    /* Modal Escáner Cámara Nativa */
    .scanner-sheet {
      padding-bottom: 24px;
    }
    .camera-stage {
      --r: 20px;
      position: relative;
      margin: 8px 16px 12px;
      height: 250px;
      background: #000;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .camera-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .camera-canvas {
      display: none;
    }
    .viewfinder-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: radial-gradient(circle, transparent 45%, rgba(0, 0, 0, 0.58) 100%);
      pointer-events: none;
    }
    .vf-box {
      position: relative;
      width: 168px;
      height: 168px;
    }
    .vf-corner {
      position: absolute;
      width: 24px;
      height: 24px;
      border-color: #30D158;
      border-style: solid;
      border-width: 0;
    }
    .vf-corner.tl { top: 0; left: 0; border-top-width: 3.5px; border-left-width: 3.5px; border-top-left-radius: 10px; }
    .vf-corner.tr { top: 0; right: 0; border-top-width: 3.5px; border-right-width: 3.5px; border-top-right-radius: 10px; }
    .vf-corner.bl { bottom: 0; left: 0; border-bottom-width: 3.5px; border-left-width: 3.5px; border-bottom-left-radius: 10px; }
    .vf-corner.br { bottom: 0; right: 0; border-bottom-width: 3.5px; border-right-width: 3.5px; border-bottom-right-radius: 10px; }
    .vf-laser {
      position: absolute;
      left: 10px;
      right: 10px;
      height: 2px;
      background: #30D158;
      box-shadow: 0 0 8px #30D158;
      animation: laserScan 1.6s infinite alternate ease-in-out;
    }
    @keyframes laserScan {
      from { top: 14px; }
      to { top: 150px; }
    }
    .vf-hint {
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      font-size: 11.5px;
      font-weight: 600;
    }

    .native-cam-actions {
      padding: 0 16px 10px;
    }
    .native-capture-btn {
      --r: 14px;
      width: 100%;
      height: 44px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
    }

    .scan-result-banner {
      --r: 16px;
      margin: 0 16px 12px;
      padding: 12px 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .scan-result-banner.ok {
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }
    .scan-result-banner.err {
      background: rgba(255, 59, 48, 0.16);
      color: var(--ion-color-danger);
    }
    .srb-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .srb-copy strong {
      font-size: 13.5px;
    }
    .srb-copy span {
      font-size: 12.5px;
      line-height: 1.35;
      color: var(--ios-label);
    }

    .manual-qr-box {
      --r: 16px;
      margin: 0 16px;
      padding: 12px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mqb-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .mqb-row {
      display: flex;
      gap: 8px;
    }
    .mqb-input {
      flex: 1;
      height: 38px;
      border-radius: 10px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      padding: 0 12px;
      font-size: 13.5px;
      outline: none;
    }
    .mqb-btn {
      --r: 10px;
      border: 0;
      padding: 0 14px;
      background: var(--ion-color-primary);
      color: #fff;
      font-family: inherit;
      font-size: 13.5px;
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
export class VaultPage implements OnDestroy {
  readonly wallet = inject(WalletStateService);
  private readonly router = inject(Router);

  @ViewChild('cameraVideo') cameraVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraCanvas') cameraCanvasRef?: ElementRef<HTMLCanvasElement>;

  readonly segment = signal<'active' | 'used'>('active');
  readonly index = signal(0);
  readonly offset = signal(0);

  readonly redeemOpen = signal(false);
  readonly redeemState = signal<RedeemState>('idle');

  readonly shareQrOpen = signal(false);
  readonly scannerOpen = signal(false);
  readonly cameraActive = signal(false);
  readonly scanningBusy = signal(false);
  readonly scanFeedback = signal('');
  readonly scanSuccess = signal(false);
  manualQrInput = '';

  private mediaStream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private qrSvgCache = new Map<string, { viewBox: string; path: string; size: number }>();

  readonly tickets = computed(() =>
    this.segment() === 'active' ? this.wallet.activeTickets() : this.wallet.usedTickets()
  );

  readonly current = computed<BankTicket | null>(() => {
    const list = this.tickets();
    return list[this.index()] ?? list[0] ?? null;
  });

  private readonly spring = new AppleSpring(0, { damping: 0.84, response: 0.36 });
  private readonly tracker = new VelocityTracker();
  private dragging = false;
  private startX = 0;
  private grabStart = 0;
  private moved = 0;
  private readonly STRIDE = 320;

  ngOnDestroy(): void {
    this.stopCameraStream();
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

  async toggleQr(ticket: BankTicket, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (this.moved > 8) return;
    this.wallet.haptic('light');
    await this.wallet.toggleTicketQrReveal(ticket.id);
  }

  async openShareQrModal(ticket: BankTicket): Promise<void> {
    this.wallet.haptic('light');
    if (!ticket.qrRevealed) {
      await this.wallet.toggleTicketQrReveal(ticket.id);
    }
    this.shareQrOpen.set(true);
  }

  async openCameraScanner(): Promise<void> {
    this.wallet.haptic('light');
    this.scanFeedback.set('');
    this.scanSuccess.set(false);
    this.manualQrInput = '';
    this.scannerOpen.set(true);
    setTimeout(() => this.startCameraStream(), 220);
  }

  closeCameraScanner(): void {
    this.stopCameraStream();
    this.scannerOpen.set(false);
  }

  private async startCameraStream(): Promise<void> {
    this.stopCameraStream();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.scanFeedback.set('Usa el botón "Capturar Foto con Cámara Nativa" para escanear el código QR.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.mediaStream = stream;
      const videoEl = this.cameraVideoRef?.nativeElement;
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => { });
        this.cameraActive.set(true);
      }

      // Escaneo continuo de cuadros de video (BarcodeDetector nativo + jsQR)
      const NativeBarcodeDetector = (window as any).BarcodeDetector;
      const detector = NativeBarcodeDetector
        ? new NativeBarcodeDetector({ formats: ['qr_code'] })
        : null;

      this.scanTimer = setInterval(async () => {
        if (this.scanningBusy() || !this.cameraVideoRef?.nativeElement) return;
        const video = this.cameraVideoRef.nativeElement;
        if (video.readyState < 2 || video.videoWidth === 0) return;

        try {
          if (detector) {
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              await this.handleDecodedQrPayload(barcodes[0].rawValue);
              return;
            }
          }

          const canvas = this.cameraCanvasRef?.nativeElement;
          if (!canvas) return;
          const w = 420;
          const h = Math.round((video.videoHeight / video.videoWidth) * w) || 320;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code && code.data) {
            await this.handleDecodedQrPayload(code.data);
          }
        } catch {
          // Continuar siguiente cuadro
        }
      }, 180);
    } catch {
      this.cameraActive.set(false);
    }
  }

  private stopCameraStream(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    this.cameraActive.set(false);
  }

  async onNativeCameraPhotoCaptured(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          await this.handleDecodedQrPayload(code.data);
        } else {
          this.scanSuccess.set(false);
          this.scanFeedback.set('No se detectó un código QR claro en la fotografía. Acerca más la cámara al QR del ticket.');
          this.wallet.haptic('error');
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
        input.value = '';
      }
    };
    img.src = objectUrl;
  }

  async submitManualQr(): Promise<void> {
    if (!this.manualQrInput.trim()) return;
    await this.handleDecodedQrPayload(this.manualQrInput.trim());
  }

  private async handleDecodedQrPayload(rawText: string): Promise<void> {
    if (this.scanningBusy()) return;
    this.scanningBusy.set(true);

    const res = await this.wallet.scanAndClaimSharedTicket(rawText);
    this.scanSuccess.set(res.ok);
    this.scanFeedback.set(res.message);

    if (res.ok) {
      this.stopCameraStream();
      this.segment.set('active');
      this.snapTo(0, 0);
      setTimeout(() => {
        this.closeCameraScanner();
      }, 1500);
    }

    setTimeout(() => {
      this.scanningBusy.set(false);
    }, 1400);
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
