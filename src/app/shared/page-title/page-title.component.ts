import { Component, Input } from '@angular/core';

/**
 * Cabeçalho de página: título + subtítulo opcional.
 * `<app-page-title subtitle="...">Contatos</app-page-title>`
 */
@Component({
    selector: 'app-page-title',
    template: `
    <h1 class="pg-title"><ng-content></ng-content></h1>
    <p class="pg-sub" *ngIf="subtitle">{{ subtitle }}</p>
  `,
    styles: [':host{display:block}'],
    standalone: false
})
export class PageTitleComponent {
  @Input() subtitle = '';
}
