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
  template: `
    <div class="page-container">
      <!-- ENCABEZADO DEL PORTAL DE VENDEDOR -->
      <header class="seller-head">
        <div>
          <span class="eyebrow">CENTRO DE COMERCIO · CONTROL DE ACCESO VENDEDOR</span>
          <h1>Panel de Vendedor · {{ market.currentUser()?.storeName || 'Aether Studio Oficial' }}</h1>
          <p>Administra tu catálogo, gestiona envíos y audita la liquidación de tickets con el Banco Central.</p>
        </div>

        <div class="head-actions">
          <div class="ios-segmented" role="tablist">
            <button
              type="button"
              class="ios-segment-btn"
              [class.active]="tab() === 'inventory'"
              (click)="setTab('inventory')"
            >
              Mis Productos ({{ market.products().length }})
            </button>
            <button
              type="button"
              class="ios-segment-btn"
              [class.active]="tab() === 'orders'"
              (click)="setTab('orders')"
            >
              Ventas y Tickets ({{ market.orders().length }})
            </button>
            <button
              type="button"
              class="ios-segment-btn"
              [class.active]="tab() === 'verifier'"
              (click)="setTab('verifier')"
            >
              Auditar Ticket
            </button>
          </div>

          <button type="button" class="new-prod-btn continuous apple-pressable" (click)="openProductModal()">
            <sf-symbol name="plus" [size]="16" [weight]="2.6" />
            <span>Publicar Producto</span>
          </button>
        </div>
      </header>

      <!-- WIDGETS KPI ESTILO iOS -->
      <section class="kpi-grid">
        <div class="kpi-card continuous">
          <div class="kpi-top">
            <span class="kpi-icon green continuous">
              <sf-symbol name="building.columns" [size]="18" />
            </span>
            <span class="kpi-tag">Liquidado Banco Central</span>
          </div>
          <strong class="kpi-val is-green">
            {{ market.totalSellerRevenue() | currency: 'MXN' : 'symbol-narrow' }}
          </strong>
          <span class="kpi-sub">100% respaldado por tickets verificados</span>
        </div>

        <div class="kpi-card continuous">
          <div class="kpi-top">
            <span class="kpi-icon blue continuous">
              <sf-symbol name="ticket" [size]="18" />
            </span>
            <span class="kpi-tag">Sello Bancario</span>
          </div>
          <strong class="kpi-val">{{ market.totalVerifiedTicketsCount() }} Tickets</strong>
          <span class="kpi-sub">0 rechazos por doble gasto</span>
        </div>

        <div class="kpi-card continuous">
          <div class="kpi-top">
            <span class="kpi-icon purple continuous">
              <sf-symbol name="cube.box" [size]="18" />
            </span>
            <span class="kpi-tag">Catálogo Activo</span>
          </div>
          <strong class="kpi-val">
            {{ market.activeProducts().length }} / {{ market.products().length }}
          </strong>
          <span class="kpi-sub">Productos visibles en tienda</span>
        </div>

        <div class="kpi-card continuous">
          <div class="kpi-top">
            <span class="kpi-icon amber continuous">
              <sf-symbol name="truck.box" [size]="18" />
            </span>
            <span class="kpi-tag">Logística</span>
          </div>
          <strong class="kpi-val">{{ market.orders().length }} Órdenes</strong>
          <span class="kpi-sub">Verificadas para despacho</span>
        </div>
      </section>

      <!-- PESTAÑA 1: INVENTARIO DE PRODUCTOS -->
      @if (tab() === 'inventory') {
        <section class="inventory-section">
          @if (market.products().length === 0) {
            <div class="empty-inv-card continuous">
              <div class="eic-icon continuous">
                <sf-symbol name="photo.on.rectangle" [size]="34" />
              </div>
              <h3>El catálogo está vacío</h3>
              <p>Publica tus propios productos subiendo sus fotografías o imágenes oficiales para mostrarlos en Market Store.</p>
              <button type="button" class="new-prod-btn continuous apple-pressable" (click)="openProductModal()">
                <sf-symbol name="plus" [size]="16" [weight]="2.6" />
                <span>Subir Imagen y Publicar Producto</span>
              </button>
            </div>
          } @else {
            <div class="inv-grid">
              @for (p of market.products(); track p.id) {
                <article class="inv-card continuous" [class.paused]="!p.active">
                  <div class="inv-top">
                    <div class="inv-thumb continuous" [class]="'inv-thumb continuous ' + p.surfaceClass">
                      @if (p.imageUrl) {
                        <img [src]="p.imageUrl" [alt]="p.title" class="inv-thumb-img" />
                      } @else {
                        <sf-symbol [name]="p.symbolName" [size]="28" />
                      }
                    </div>
                    <div class="inv-title-wrap">
                      <div class="inv-badges">
                        <span class="sku-pill mono">{{ p.sku }}</span>
                        <span class="state-pill" [class.off]="!p.active">
                          {{ p.active ? 'En venta' : 'Pausado' }}
                        </span>
                      </div>
                      <h3>{{ p.title }}</h3>
                      <span class="inv-cat">{{ p.categoryLabel }} · Equivalencia: {{ p.badge }}</span>
                    </div>
                  </div>

                  <div class="inv-metrics">
                    <div>
                      <span class="m-lbl">PRECIO OFICIAL</span>
                      <strong class="m-val">{{ p.price | currency: 'MXN' : 'symbol-narrow' }} MXN</strong>
                    </div>
                    <div>
                      <span class="m-lbl">INVENTARIO</span>
                      <strong class="m-val" [class.low]="p.stock <= 5">{{ p.stock }} unidades</strong>
                    </div>
                  </div>

                  <div class="inv-actions">
                    <button type="button" class="act-btn continuous apple-pressable" (click)="editProduct(p)">
                      <sf-symbol name="pencil" [size]="14" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      class="act-btn continuous apple-pressable"
                      (click)="market.toggleProductActive(p.id)"
                    >
                      <span>{{ p.active ? 'Pausar' : 'Activar' }}</span>
                    </button>
                    <button
                      type="button"
                      class="act-btn danger continuous apple-pressable"
                      (click)="market.deleteProduct(p.id)"
                      aria-label="Eliminar producto"
                    >
                      <sf-symbol name="trash" [size]="14" />
                    </button>
                  </div>
                </article>
              }
            </div>
          }
        </section>
      }

      <!-- PESTAÑA 2: ÓRDENES Y LIQUIDACIÓN DE TICKETS -->
      @if (tab() === 'orders') {
        <section class="seller-orders">
          @for (ord of market.orders(); track ord.id) {
            <article class="s-order-card continuous">
              <div class="so-header">
                <div>
                  <span class="mono so-id">Orden #{{ ord.id }}</span>
                  <h3>Cliente: {{ ord.buyerName }} ({{ ord.buyerEmail }})</h3>
                  <span class="so-date">{{ ord.createdAt }} · Autorización Banco: <strong class="mono">{{ ord.bankVerificationCode }}</strong></span>
                </div>

                <div class="so-status-box">
                  <span class="status-pill" [attr.data-status]="ord.status">{{ statusLabel(ord.status) }}</span>
                  @if (ord.status !== 'delivered') {
                    <button
                      type="button"
                      class="advance-btn continuous apple-pressable"
                      (click)="market.advanceOrderStatus(ord.id)"
                    >
                      <sf-symbol name="truck.box" [size]="15" />
                      <span>Avanzar a: {{ nextStatusLabel(ord.status) }}</span>
                    </button>
                  }
                </div>
              </div>

              <div class="so-body">
                <div class="so-col">
                  <span class="col-label">PRODUCTOS VENDIDOS</span>
                  @for (it of ord.items; track it.productId) {
                    <div class="so-line">
                      <span>{{ it.quantity }}× {{ it.title }}</span>
                      <strong>{{ it.unitPrice * it.quantity | currency: 'MXN' : 'symbol-narrow' }}</strong>
                    </div>
                  }
                </div>

                <div class="so-col">
                  <span class="col-label">TICKETS BANCARIOS RECIBIDOS Y VALIDADOS</span>
                  @for (tk of ord.ticketsUsed; track tk.id) {
                    <div class="so-ticket-row">
                      <span class="tk-badge" [class]="'tk-badge ' + tk.colorClass">{{ '$' + tk.amount }}</span>
                      <strong class="mono">{{ tk.id }}</strong>
                      <span class="mono hash">{{ tk.signatureHash }}</span>
                    </div>
                  }
                </div>
              </div>
            </article>
          }
        </section>
      }

      <!-- PESTAÑA 3: AUDITOR / VERIFICADOR DE TICKETS CON EL BANCO CENTRAL -->
      @if (tab() === 'verifier') {
        <section class="verifier-box continuous">
          <div class="ver-head">
            <span class="ver-icon continuous">
              <sf-symbol name="shield.checkered" [size]="28" />
            </span>
            <div>
              <h2>Verificador de Validez de Tickets (Paso 6)</h2>
              <p>
                Comprueba en tiempo real con el Banco Central la autenticidad, vigencia y estado de no-doble-gasto de cualquier ticket presentado.
              </p>
            </div>
          </div>

          <div class="ver-search">
            <input
              type="text"
              class="ver-input mono"
              placeholder="Escribe o selecciona un folio (ej. TKT-9941-A8F2)"
              [(ngModel)]="queryFolio"
            />
            <button type="button" class="advance-btn continuous apple-pressable" (click)="verifyFolioWithBank()">
              <sf-symbol name="checkmark.seal.fill" [size]="15" />
              <span>Consultar al Banco</span>
            </button>
          </div>

          @if (verifierMessage()) {
            <p class="so-date" style="margin: 6px 0 10px;">{{ verifierMessage() }}</p>
          }

          <div class="ver-quick-pills">
            <span>Probar con folios registrados:</span>
            @for (t of market.tickets(); track t.id) {
              <button type="button" class="q-folio mono apple-pressable" (click)="selectFolioForAudit(t.id)">
                {{ t.id }} ({{ t.status === 'active' ? 'Activo' : 'Usado' }})
              </button>
            }
          </div>

          @if (inspectedTicket(); as tk) {
            <div class="ver-result continuous" [class.used]="tk.status === 'used'">
              <div class="vr-top">
                <div>
                  <span class="vr-label">RESULTADO DE AUDITORÍA EN BANCO CENTRAL</span>
                  <h3>
                    {{
                      !market.isTicketAuthentic(tk)
                        ? 'Ticket Inválido (Datos o Sello Alterados)'
                        : tk.status === 'active'
                        ? 'Ticket Válido y Vigente para Compra'
                        : 'Ticket Ya Canjeado (Protección Anti-Doble-Gasto Activa)'
                    }}
                  </h3>
                </div>
                <span class="vr-Amount">{{ '$' + tk.amount }}.00 MXN</span>
              </div>

              <div class="vr-grid">
                <div>
                  <span>Folio Oficial</span>
                  <strong class="mono">{{ tk.id }}</strong>
                </div>
                <div>
                  <span>Nivel / Serie</span>
                  <strong>{{ tk.tier }}</strong>
                </div>
                <div>
                  <span>Emisión</span>
                  <strong>{{ tk.issuedAt }}</strong>
                </div>
                <div>
                  <span>Sello de Autenticidad</span>
                  <strong class="mono">{{ tk.signatureHash }}</strong>
                </div>
              </div>
            </div>
          }
        </section>
      }

      <!-- MODAL iOS PARA PUBLICAR O EDITAR PRODUCTO -->
      @if (modalOpen()) {
        <div class="modal-scrim" (click)="modalOpen.set(false)" role="presentation"></div>
        <div class="prod-modal continuous" role="dialog" aria-modal="true">
          <div class="sheet-head">
            <span class="sheet-title">{{ editingId() ? 'Editar Producto' : 'Publicar Nuevo Producto' }}</span>
            <button type="button" class="sheet-close apple-pressable" (click)="modalOpen.set(false)">
              <sf-symbol name="xmark" [size]="13" [weight]="2.8" />
            </button>
          </div>

          <div class="modal-body">
            <!-- SECCIÓN DE SUBIDA DE IMÁGENES DEL PRODUCTO -->
            <div class="img-upload-section continuous">
              <div class="ius-head">
                <div>
                  <strong>Imágenes del Producto</strong>
                  <span>Sube una o varias fotos desde tu dispositivo para mostrarlas en el catálogo.</span>
                </div>
                <label class="ius-upload-btn continuous apple-pressable">
                  <sf-symbol name="plus" [size]="14" [weight]="2.6" />
                  <span>Subir Imagen</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    (change)="onProductImagesSelected($event)"
                  />
                </label>
              </div>

              @if (formImages().length === 0) {
                <label class="ius-dropzone continuous apple-pressable">
                  <sf-symbol name="photo.on.rectangle" [size]="30" />
                  <strong>Toca aquí para seleccionar fotos del producto</strong>
                  <span>Formatos soportados: JPG, PNG, WEBP · Puedes elegir varias imágenes</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    (change)="onProductImagesSelected($event)"
                  />
                </label>
              } @else {
                <div class="ius-gallery">
                  @for (img of formImages(); track $index; let idx = $index) {
                    <div
                      class="ius-thumb continuous"
                      [class.is-main]="formMainImage() === img"
                      (click)="setMainImage(img)"
                    >
                      <img [src]="img" alt="Vista previa del producto" />
                      @if (formMainImage() === img) {
                        <span class="ius-main-badge">PORTADA</span>
                      }
                      <button
                        type="button"
                        class="ius-remove-btn"
                        title="Quitar imagen"
                        (click)="$event.stopPropagation(); removeUploadedImage(idx)"
                      >
                        <sf-symbol name="xmark" [size]="10" [weight]="2.8" />
                      </button>
                    </div>
                  }
                  <label class="ius-add-more continuous apple-pressable" title="Agregar otra imagen">
                    <sf-symbol name="plus" [size]="20" />
                    <span>Agregar</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      (change)="onProductImagesSelected($event)"
                    />
                  </label>
                </div>
              }
            </div>

            <div class="ios-form-group continuous">
              <label class="f-row">
                <span>Título</span>
                <input type="text" placeholder="Ej. Gorra New Era 59FIFTY / Base MagSafe" [(ngModel)]="formTitle" />
              </label>
              <label class="f-row">
                <span>Subtítulo</span>
                <input type="text" placeholder="Ej. Edición oficial verificada" [(ngModel)]="formSubtitle" />
              </label>
              <label class="f-row">
                <span>Categoría</span>
                <select [(ngModel)]="formCategory">
                  <option value="magsafe">Accesorios MagSafe</option>
                  <option value="audio">Audio y Música</option>
                  <option value="hogar">Hogar Inteligente</option>
                  <option value="estudio">Cómputo y Estudio</option>
                  <option value="digital">Tarjetas y Digital</option>
                </select>
              </label>
              <label class="f-row">
                <span>Precio (MXN)</span>
                <input type="number" step="50" min="50" [(ngModel)]="formPrice" />
              </label>
              <label class="f-row">
                <span>Stock</span>
                <input type="number" min="1" [(ngModel)]="formStock" />
              </label>
            </div>

            <!-- Botones rápidos de precio alineado con denominaciones de Tickets ($50, $100, $200, $500) -->
            <div class="price-presets">
              <span>Precios sugeridos en Tickets:</span>
              @for (p of [50, 100, 150, 200, 250, 500]; track p) {
                <button type="button" class="preset-chip" [class.active]="formPrice === p" (click)="formPrice = p">
                  {{ '$' + p }}
                </button>
              }
            </div>

            <textarea
              class="ios-textarea continuous"
              rows="3"
              placeholder="Descripción detallada del producto..."
              [(ngModel)]="formDesc"
            ></textarea>

            <button type="button" class="save-btn continuous apple-pressable" (click)="saveProduct()">
              <sf-symbol name="checkmark.circle.fill" [size]="19" />
              <span>{{ editingId() ? 'Guardar Cambios' : 'Publicar en Catálogo' }}</span>
            </button>
          </div>
        </div>
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

    .seller-head {
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
    .seller-head h1 {
      margin: 4px 0 6px;
      font-size: clamp(24px, 2.8vw, 32px);
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .seller-head p {
      margin: 0;
      font-size: 14.5px;
      color: var(--ios-label-2);
    }

    .head-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .new-prod-btn {
      --r: 12px;
      height: 40px;
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

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 14px;
    }
    .kpi-card {
      --r: 20px;
      padding: 18px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .kpi-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-icon {
      --r: 10px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .kpi-icon.green { background: rgba(52, 199, 89, 0.16); color: var(--ion-color-success); }
    .kpi-icon.blue { background: rgba(0, 122, 255, 0.16); color: var(--ion-color-primary); }
    .kpi-icon.purple { background: rgba(175, 82, 222, 0.16); color: var(--ios-purple); }
    .kpi-icon.amber { background: rgba(255, 149, 0, 0.16); color: var(--ios-warning); }

    .kpi-tag {
      font-size: 11px;
      font-weight: 600;
      color: var(--ios-label-2);
    }
    .kpi-val {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .kpi-val.is-green {
      color: var(--ion-color-success);
    }
    .kpi-sub {
      font-size: 12px;
      color: var(--ios-label-2);
    }

    /* Inventario */
    .inv-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
      gap: 16px;
    }
    .inv-card {
      --r: 22px;
      padding: 16px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-card);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    }
    .inv-card.paused {
      opacity: 0.65;
    }
    .inv-top {
      display: flex;
      gap: 12px;
    }
    .inv-thumb {
      --r: 14px;
      width: 58px;
      height: 58px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ion-color-primary);
      overflow: hidden;
    }
    .inv-thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .empty-inv-card {
      --r: 22px;
      padding: 48px 24px;
      background: var(--ios-cell);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .eic-icon {
      --r: 18px;
      width: 64px;
      height: 64px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .empty-inv-card h3 {
      margin: 4px 0 0;
      font-size: 20px;
    }
    .empty-inv-card p {
      margin: 0 0 6px;
      font-size: 14px;
      color: var(--ios-label-2);
      max-width: 420px;
    }

    /* Subida de imágenes en el modal */
    .img-upload-section {
      --r: 16px;
      padding: 14px;
      background: var(--ios-sheet-cell);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ius-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .ius-head div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ius-head strong {
      font-size: 14px;
      font-weight: 700;
    }
    .ius-head span {
      font-size: 11.5px;
      color: var(--ios-label-2);
    }
    .ius-upload-btn {
      --r: 10px;
      height: 34px;
      padding: 0 12px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      font-size: 12.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .ius-dropzone {
      --r: 14px;
      padding: 22px 16px;
      border: 1.5px dashed var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label-2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 5px;
      cursor: pointer;
    }
    .ius-dropzone strong {
      font-size: 13.5px;
      color: var(--ios-label);
    }
    .ius-dropzone span {
      font-size: 11.5px;
    }
    .ius-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
      gap: 10px;
    }
    .ius-thumb {
      --r: 12px;
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border: 2px solid transparent;
      background: var(--ios-cell);
      cursor: pointer;
    }
    .ius-thumb.is-main {
      border-color: var(--ion-color-primary);
    }
    .ius-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ius-main-badge {
      position: absolute;
      left: 5px;
      bottom: 5px;
      padding: 2px 6px;
      border-radius: 5px;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    .ius-remove-btn {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 0;
      background: rgba(0, 0, 0, 0.65);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }
    .ius-add-more {
      --r: 12px;
      aspect-ratio: 1;
      border: 1.5px dashed var(--ios-separator);
      background: var(--ios-cell);
      color: var(--ios-label-2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .inv-title-wrap {
      flex: 1;
      min-width: 0;
    }
    .inv-badges {
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    }
    .sku-pill,
    .state-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--ios-fill);
      color: var(--ios-label-2);
    }
    .state-pill {
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }
    .state-pill.off {
      background: rgba(255, 149, 0, 0.16);
      color: var(--ios-warning);
    }
    .inv-title-wrap h3 {
      margin: 0 0 2px;
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .inv-cat {
      font-size: 12px;
      color: var(--ios-label-2);
    }

    .inv-metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--ios-cell);
    }
    .m-lbl {
      display: block;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .m-val {
      font-size: 15px;
      font-weight: 700;
    }
    .m-val.low {
      color: var(--ios-warning);
    }

    .inv-actions {
      display: flex;
      gap: 8px;
    }
    .act-btn {
      --r: 10px;
      flex: 1;
      height: 36px;
      border: 0;
      background: var(--ios-fill);
      color: var(--ios-label);
      font-size: 13px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .act-btn.danger {
      flex: 0 0 38px;
      background: rgba(255, 59, 48, 0.14);
      color: var(--ion-color-danger);
    }

    /* Órdenes del vendedor */
    .seller-orders {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .s-order-card {
      --r: 22px;
      padding: 20px;
      background: var(--ios-card-elevated);
      border: 0.5px solid var(--ios-separator);
      box-shadow: var(--ios-shadow-card);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .so-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 0.5px solid var(--ios-separator);
    }
    .so-id {
      font-size: 12px;
      font-weight: 700;
      color: var(--ion-color-primary);
    }
    .so-header h3 {
      margin: 2px 0;
      font-size: 17px;
    }
    .so-date {
      font-size: 12.5px;
      color: var(--ios-label-2);
    }
    .so-status-box {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .status-pill {
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: rgba(52, 199, 89, 0.16);
      color: var(--ion-color-success);
    }
    .advance-btn {
      --r: 10px;
      height: 36px;
      padding: 0 14px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 12.5px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .so-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .so-col {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .col-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .so-line,
    .so-ticket-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 10px;
      background: var(--ios-cell);
      font-size: 13px;
    }
    .tk-badge {
      padding: 2px 8px;
      border-radius: 6px;
      color: #fff;
      font-weight: 700;
      font-size: 11.5px;
    }
    .hash {
      font-size: 10.5px;
      color: var(--ios-label-2);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Verificador */
    .verifier-box {
      --r: 24px;
      padding: 24px;
      background: var(--ios-cell);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .ver-head {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .ver-icon {
      --r: 14px;
      width: 52px;
      height: 52px;
      background: rgba(0, 122, 255, 0.14);
      color: var(--ion-color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .ver-head h2 {
      margin: 0 0 4px;
      font-size: 20px;
    }
    .ver-head p {
      margin: 0;
      font-size: 13.5px;
      color: var(--ios-label-2);
    }
    .ver-input {
      width: 100%;
      height: 46px;
      border-radius: 12px;
      border: 0.5px solid var(--ios-separator);
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      padding: 0 14px;
      font-size: 15px;
      outline: none;
    }
    .ver-quick-pills {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--ios-label-2);
    }
    .q-folio {
      border: 0;
      padding: 5px 10px;
      border-radius: 8px;
      background: var(--ios-sheet-cell);
      color: var(--ion-color-primary);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .ver-result {
      --r: 18px;
      padding: 18px;
      background: rgba(52, 199, 89, 0.12);
      border: 1px solid rgba(52, 199, 89, 0.35);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ver-result.used {
      background: rgba(255, 149, 0, 0.12);
      border-color: rgba(255, 149, 0, 0.35);
    }
    .vr-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .vr-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ios-label-2);
    }
    .vr-top h3 {
      margin: 4px 0 0;
      font-size: 18px;
    }
    .vr-Amount {
      font-size: 26px;
      font-weight: 800;
    }
    .vr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .vr-grid span {
      display: block;
      font-size: 11px;
      color: var(--ios-label-2);
    }

    /* Modal Producto */
    .modal-scrim {
      position: fixed;
      inset: 0;
      z-index: 800;
      background: var(--ios-scrim);
      -webkit-backdrop-filter: blur(5px);
      backdrop-filter: blur(5px);
    }
    .prod-modal {
      --r: 28px;
      position: fixed;
      z-index: 810;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(500px, calc(100vw - 28px));
      max-height: 90vh;
      overflow-y: auto;
      background: var(--ios-sheet-bg);
      box-shadow: var(--ios-shadow-float);
      padding-bottom: 20px;
    }
    .modal-body {
      padding: 8px 20px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ios-form-group {
      --r: 14px;
      background: var(--ios-sheet-cell);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .f-row {
      display: flex;
      align-items: center;
      padding: 0 14px;
      height: 44px;
      border-bottom: 0.5px solid var(--ios-separator);
    }
    .f-row:last-child {
      border-bottom: 0;
    }
    .f-row span {
      width: 105px;
      font-size: 14px;
      font-weight: 500;
      color: var(--ios-label);
      flex-shrink: 0;
    }
    .f-row input,
    .f-row select {
      flex: 1;
      border: 0;
      background: transparent;
      color: var(--ios-label);
      font-size: 14px;
      outline: none;
    }

    .price-presets {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 12px;
      color: var(--ios-label-2);
    }
    .preset-chip {
      border: 0;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .preset-chip.active {
      background: var(--ion-color-primary);
      color: #fff;
    }

    .ios-textarea {
      --r: 14px;
      border: 0;
      background: var(--ios-sheet-cell);
      color: var(--ios-label);
      padding: 12px 14px;
      font-size: 14px;
      outline: none;
      resize: vertical;
    }
    .save-btn {
      --r: 14px;
      height: 50px;
      border: 0;
      background: var(--ion-color-primary);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    @media (max-width: 820px) {
      .so-body {
        grid-template-columns: 1fr;
      }
    }
  `]
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
