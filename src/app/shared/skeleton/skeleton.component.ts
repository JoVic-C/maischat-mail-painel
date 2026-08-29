import { Component, Input } from '@angular/core';

/**
 * Placeholder animado no formato de tabela, exibido enquanto os dados carregam.
 * Evita o "falso vazio": sem ele, a tela mostra o empty state por uma fração de
 * segundo antes da resposta chegar.
 */
@Component({
    selector: 'app-skeleton',
    template: `
    <div class="sk" role="status" aria-live="polite" aria-busy="true">
      <span class="sr-only">Carregando...</span>
      <div class="sk-row" *ngFor="let r of rowsArray">
        <span class="sk-cell" *ngFor="let c of colsArray" [style.flex]="c === 0 ? '2' : '1'"></span>
      </div>
    </div>
  `,
    styles: [
        `
      .sk { padding: 4px 0; }
      .sk-row { display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid var(--br); }
      .sk-cell {
        height: 12px; border-radius: 6px;
        background: linear-gradient(90deg, var(--nl) 25%, #f4f2f9 50%, var(--nl) 75%);
        background-size: 200% 100%;
        animation: sk-shimmer 1.4s ease-in-out infinite;
      }
      /* Respeita quem pediu menos movimento no sistema. */
      @media (prefers-reduced-motion: reduce) {
        .sk-cell { animation: none; background: var(--nl); }
      }
      @keyframes sk-shimmer {
        from { background-position: 200% 0; }
        to { background-position: -200% 0; }
      }
    `,
    ],
    standalone: false
})
export class SkeletonComponent {
  @Input() rows = 5;
  @Input() cols = 4;

  get rowsArray(): number[] {
    return Array.from({ length: this.rows }, (_, i) => i);
  }

  get colsArray(): number[] {
    return Array.from({ length: this.cols }, (_, i) => i);
  }
}
