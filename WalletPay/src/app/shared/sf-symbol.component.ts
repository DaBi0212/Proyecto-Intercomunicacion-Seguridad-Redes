import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { SF_SYMBOLS } from './sf-symbols.data';

@Component({
  selector: 'sf-symbol',
  standalone: true,
  host: { class: 'sf-symbol' },
  templateUrl: './sf-symbol.component.html',
  styleUrl: './sf-symbol.component.scss'
})
export class SfSymbolComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly weight = input<number>(1.8);

  readonly body = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(SF_SYMBOLS[this.name()] ?? SF_SYMBOLS['ticket'])
  );
}
