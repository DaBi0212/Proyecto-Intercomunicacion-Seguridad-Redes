import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarketStateService } from '../../core/services/market-state.service';
import { BankTicket, OrderStatus, Product } from '../../core/models/market.models';
import { SfSymbolComponent } from '../../shared/sf-symbol.component';

@Component({
  selector: 'app-seller',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, SfSymbolComponent],
  templateUrl: './seller.page.html',
  styleUrl: './seller.page.scss'
})
export class SellerPage {
  readonly market = inject(MarketStateService);

  readonly tab = signal<'inventory' | 'orders' | 'verifier'>('inventory');
  readonly queryFolio = signal<string>('');
  readonly verifierMessage = signal<string>('');
  readonly bankVerifiedTicket = signal<BankTicket | null>(null);

  readonly modalOpen = signal<boolean>(false);
  readonly editingId = signal<string | undefined>(undefined);

  formTitle = '';
  formSubtitle = '';
  formDesc = '';
  formCategory: Product['category'] = 'magsafe';
  formPrice = 150;
  formStock = 15;
  formSymbol = 'bolt.fill';
  readonly formImages = signal<string[]>([]);
  readonly formMainImage = signal<string>('');

  readonly inspectedTicket = computed<BankTicket | null>(() => {
    const remote = this.bankVerifiedTicket();
    const q = this.queryFolio().trim().toUpperCase();
    if (!q) return remote;
    if (remote && remote.id.toUpperCase() === q) return remote;
    return this.market.tickets().find((t) => t.id.toUpperCase().includes(q)) ?? null;
  });

  selectFolioForAudit(id: string): void {
    this.queryFolio.set(id);
    this.verifierMessage.set('');
    this.bankVerifiedTicket.set(null);
  }

  async verifyFolioWithBank(): Promise<void> {
    const res = await this.market.importExternalTicketFolio(this.queryFolio(), 100);
    this.verifierMessage.set(res.message);
    this.bankVerifiedTicket.set(res.ticket ?? null);
  }

  setTab(t: 'inventory' | 'orders' | 'verifier'): void {
    this.market.haptic('selection');
    this.tab.set(t);
  }

  openProductModal(): void {
    this.market.haptic('light');
    this.editingId.set(undefined);
    this.formTitle = '';
    this.formSubtitle = '';
    this.formDesc = '';
    this.formCategory = 'magsafe';
    this.formPrice = 150;
    this.formStock = 15;
    this.formSymbol = 'bolt.fill';
    this.formImages.set([]);
    this.formMainImage.set('');
    this.modalOpen.set(true);
  }

  editProduct(p: Product): void {
    this.market.haptic('light');
    this.editingId.set(p.id);
    this.formTitle = p.title;
    this.formSubtitle = p.subtitle;
    this.formDesc = p.description;
    this.formCategory = p.category;
    this.formPrice = p.price;
    this.formStock = p.stock;
    this.formSymbol = p.symbolName;
    const imgs = p.images && p.images.length > 0 ? [...p.images] : p.imageUrl ? [p.imageUrl] : [];
    this.formImages.set(imgs);
    this.formMainImage.set(p.imageUrl || imgs[0] || '');
    this.modalOpen.set(true);
  }

  async onProductImagesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    const loaded: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await this.resizeImageToDataUrl(file, 760, 0.85);
        if (dataUrl) loaded.push(dataUrl);
      } catch {}
    }
    if (loaded.length > 0) {
      const updated = [...this.formImages(), ...loaded];
      this.formImages.set(updated);
      if (!this.formMainImage()) {
        this.formMainImage.set(updated[0]);
      }
      this.market.haptic('selection');
    }
    input.value = '';
  }

  setMainImage(img: string): void {
    this.formMainImage.set(img);
    this.market.haptic('selection');
  }

  removeUploadedImage(index: number): void {
    const current = this.formImages();
    const removed = current[index];
    const next = current.filter((_, idx) => idx !== index);
    this.formImages.set(next);
    if (this.formMainImage() === removed) {
      this.formMainImage.set(next[0] || '');
    }
    this.market.haptic('light');
  }

  private resizeImageToDataUrl(file: File, maxDim = 760, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagen inválido'));
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const outMime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
          resolve(canvas.toDataURL(outMime, quality));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async saveProduct(): Promise<void> {
    if (!this.formTitle.trim()) return;

    const surfaceMap: Record<Product['category'], string> = {
      magsafe: 'prod-surface-blue',
      audio: 'prod-surface-purple',
      hogar: 'prod-surface-amber',
      estudio: 'prod-surface-titanium',
      digital: 'prod-surface-emerald'
    };

    const imgs = this.formImages();
    const mainImg = this.formMainImage() || imgs[0] || undefined;

    await this.market.createOrUpdateProduct({
      id: this.editingId(),
      title: this.formTitle.trim(),
      subtitle: this.formSubtitle.trim() || 'Edición oficial verificada Market Store',
      description:
        this.formDesc.trim() ||
        'Producto oficial disponible para compra con tickets electrónicos emitidos por el Banco Central.',
      category: this.formCategory,
      price: Math.max(50, Number(this.formPrice) || 100),
      stock: Math.max(0, Number(this.formStock) || 10),
      symbolName: this.formSymbol,
      surfaceClass: surfaceMap[this.formCategory],
      imageUrl: mainImg,
      images: imgs,
      specs: [
        'Pago verificado con Tickets del Banco Central',
        'Envío asegurado sin costo adicional',
        'Garantía directa con comercio verificado'
      ]
    });

    this.modalOpen.set(false);
  }

  statusLabel(s: OrderStatus): string {
    const map: Record<OrderStatus, string> = {
      verified: 'Ticket Verificado',
      preparing: 'En preparación',
      shipped: 'Enviado',
      delivered: 'Entregado'
    };
    return map[s];
  }

  nextStatusLabel(s: OrderStatus): string {
    const map: Record<OrderStatus, string> = {
      verified: 'En preparación',
      preparing: 'Enviado',
      shipped: 'Entregado',
      delivered: 'Entregado'
    };
    return map[s];
  }
}
