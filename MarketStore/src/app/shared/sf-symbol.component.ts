import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const SYMBOLS: Record<string, string> = {
  faceid:
    '<path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/>' +
    '<path d="M8.5 9v1.5M15.5 9v1.5M12 9v4.2h-1"/><path d="M9 16c.8.7 1.8 1 3 1s2.2-.3 3-1"/>',
  'lock.fill':
    '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  'lock.open':
    '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
  creditcard: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6 15h4"/>',
  'creditcard.fill':
    '<rect x="2.5" y="5" width="19" height="14" rx="3" fill="currentColor" stroke="none"/><path d="M2.5 9.5h19" stroke="var(--sf-cut, #fff)" stroke-width="2.4"/>',
  'wallet.pass':
    '<rect x="4.5" y="2.5" width="15" height="19" rx="3"/><path d="M4.5 8.5h15"/><path d="M9 14h6M9 17h4"/>',
  'wallet.pass.fill':
    '<rect x="4.5" y="2.5" width="15" height="19" rx="3" fill="currentColor" stroke="none"/><path d="M4.5 8.5h15M9 14h6M9 17h4" stroke="var(--sf-cut, #fff)"/>',
  'clock.arrow.circlepath':
    '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
  'clock.fill':
    '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.2 2"/>',
  checkmark: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'checkmark.circle.fill':
    '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7.5 12.4l3 3 6-6.4" stroke="#fff" stroke-width="2.2"/>',
  'checkmark.seal.fill':
    '<path d="M12 2.5l2.3 1.6 2.8-.2.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.2L12 21.5l-2.3-1.6-2.8.2-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.2z" fill="currentColor" stroke="none"/>' +
    '<path d="M8.5 12.2l2.4 2.4 4.6-5" stroke="#fff" stroke-width="2"/>',
  xmark: '<path d="M7 7l10 10M17 7L7 17"/>',
  'building.columns':
    '<path d="M3 9.5L12 4l9 5.5z"/><path d="M5.5 11v7M10 11v7M14 11v7M18.5 11v7M3 20.5h18"/>',
  banknote: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  'circle.lefthalf.filled':
    '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  'chevron.right': '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  'chevron.left': '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  'chevron.down': '<path d="M6 9.5L12 15.5l6-6"/>',
  ticket:
    '<path d="M4 5.5h16a1 1 0 0 1 1 1v3a2.5 2.5 0 0 0 0 5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2.5 2.5 0 0 0 0-5v-3a1 1 0 0 1 1-1z"/><path d="M14.5 6v12" stroke-dasharray="1.6 2.2"/>',
  bag: '<path d="M5 8h14l-1.1 12.5H6.1z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  'bag.fill':
    '<path d="M5 8h14l-1.1 12.5H6.1z" fill="currentColor" stroke="none"/><path d="M9 8V6.8a3 3 0 0 1 6 0V8"/>',
  'cart.fill':
    '<circle cx="9" cy="19.5" r="1.6" fill="currentColor"/><circle cx="17.5" cy="19.5" r="1.6" fill="currentColor"/><path d="M3 4.5h2.4l2.2 10.5h10.6l2-7.5H6.2"/>',
  'shield.checkered':
    '<path d="M12 2.8l7.5 2.9v5.9c0 4.6-3.2 8.4-7.5 9.6-4.3-1.2-7.5-5-7.5-9.6V5.7z"/><path d="M8.7 12l2.3 2.3 4.4-4.8"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  storefront:
    '<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5L4.6 4h14.8L21 9.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M10 20v-5h4v5"/>',
  'person.crop.circle':
    '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.2c1.3-2 3.4-3 5.7-3s4.4 1 5.7 3"/>',
  'person.2.fill':
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 18.5c1-2.5 3-3.8 5.5-3.8s4.5 1.3 5.5 3.8"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15 18.5c.6-1.8 2-2.8 4-2.8 1 0 1.8.3 2.5.9"/>',
  magnifyingglass:
    '<circle cx="10.8" cy="10.8" r="6.8"/><path d="M15.8 15.8L20.5 20.5"/>',
  'star.fill':
    '<path d="M12 2.8l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z" fill="currentColor" stroke="none"/>',
  'cube.box':
    '<path d="M12 2.8L3.8 7.3v9.4L12 21.2l8.2-4.5V7.3z"/><path d="M3.8 7.3L12 11.8l8.2-4.5M12 11.8v9.4"/>',
  'chart.bar.fill':
    '<rect x="4" y="12" width="3.8" height="8" rx="1.2" fill="currentColor" stroke="none"/><rect x="10.1" y="7.5" width="3.8" height="12.5" rx="1.2" fill="currentColor" stroke="none"/><rect x="16.2" y="4" width="3.8" height="16" rx="1.2" fill="currentColor" stroke="none"/>',
  'arrow.triangle.2.circlepath':
    '<path d="M4.2 10.5A8 8 0 0 1 18.5 7.5M19.8 13.5A8 8 0 0 1 5.5 16.5"/><path d="M19 4v4h-4M5 20v-4h4"/>',
  qrcode:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM17 17h3.5v3.5H17zM14 20h2M20 14v2"/>',
  sparkles:
    '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15.2l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  'truck.box':
    '<rect x="2.5" y="6.5" width="11.5" height="9.5" rx="1.8"/><path d="M14 9.5h4.2l2.8 3.2V16h-7z"/><circle cx="6.8" cy="17.2" r="2"/><circle cx="17.5" cy="17.2" r="2"/>',
  trash:
    '<path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6.5 6.5l1 13a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-13"/>',
  pencil:
    '<path d="M15.8 4.2l4 4L8 20H4v-4z"/><path d="M13.5 6.5l4 4"/>',
  headphones:
    '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="7" rx="2"/><rect x="17" y="13" width="4" height="7" rx="2"/>',
  laptopcomputer:
    '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 18.5h20"/>',
  watch:
    '<rect x="6.5" y="6" width="11" height="12" rx="3.2"/><path d="M9 6V3.2h6V6M9 18v2.8h6V18"/>',
  'bolt.fill':
    '<path d="M13.2 2.5L5.5 13.2h5.6l-1.1 8.3 8.5-11.2h-5.6z" fill="currentColor" stroke="none"/>',
  'speaker.wave.2':
    '<path d="M5 9.5h3.2L13 5.5v13l-4.8-4H5a1.5 1.5 0 0 1-1.5-1.5v-2A1.5 1.5 0 0 1 5 9.5z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.8 6.8a8 8 0 0 1 0 10.4"/>',
  'tag.fill':
    '<path d="M3.5 11.2V5.5a2 2 0 0 1 2-2h5.7a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-5.7 5.7a2 2 0 0 1-2.8 0l-7.3-7.3a2 2 0 0 1-.6-1.4z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
  'line.3.horizontal':
    '<path d="M4 7h16M4 12h16M4 17h16"/>',
  'mappin.and.ellipse':
    '<path d="M12 17c3.5-3.8 5.5-6.6 5.5-9.2a5.5 5.5 0 1 0-11 0c0 2.6 2 5.4 5.5 9.2z"/><circle cx="12" cy="7.8" r="2"/><ellipse cx="12" cy="19.5" rx="6" ry="1.8"/>',
  wifi:
    '<path d="M2.5 9.5a14.5 14.5 0 0 1 19 0M5.8 13a10 10 0 0 1 12.4 0M9.2 16.4a5.2 5.2 0 0 1 5.6 0"/><circle cx="12" cy="19.5" r="1.2" fill="currentColor"/>',
  'gearshape.fill':
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.2 2.1 2.3.5 1.9-1.3 1.8 1.8-1.3 1.9.5 2.3 2.1 1.2v2.5l-2.1 1.2-.5 2.3 1.3 1.9-1.8 1.8-1.9-1.3-2.3.5-1.2 2.1H9.5l-1.2-2.1-2.3-.5-1.9 1.3-1.8-1.8 1.3-1.9-.5-2.3-2.1-1.2v-2.5l2.1-1.2.5-2.3-1.3-1.9 1.8-1.8 1.9 1.3 2.3-.5 1.2-2.1z"/>',
  'house.fill':
    '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/>',
  'square.grid.2x2':
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>'
};

@Component({
  selector: 'sf-symbol',
  standalone: true,
  host: { class: 'sf-symbol', style: 'display:inline-flex;line-height:0;flex-shrink:0' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="weight()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      [innerHTML]="body()"
    ></svg>
  `
})
export class SfSymbolComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly weight = input<number>(1.8);

  readonly body = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(SYMBOLS[this.name()] ?? SYMBOLS['cube.box'])
  );
}
