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
  templateUrl: './vault.page.html',
  styleUrl: './vault.page.scss'
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
