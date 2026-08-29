import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Paginação simples (anterior/próxima) para listagens paginadas pelo backend. */
@Component({
    selector: 'app-paginator',
    template: `
    <nav class="pager" *ngIf="pages > 1" aria-label="Paginação">
      <button class="btn btn-o btn-sm" [disabled]="page <= 1" (click)="go(page - 1)" aria-label="Página anterior">
        ‹ anterior
      </button>
      <span class="muted" aria-live="polite">
        Página <b>{{ page }}</b> de <b>{{ pages }}</b> · {{ total }} registro(s)
      </span>
      <button class="btn btn-o btn-sm" [disabled]="page >= pages" (click)="go(page + 1)" aria-label="Próxima página">
        próxima ›
      </button>
    </nav>
  `,
    styles: [
        `
      .pager {
        display: flex; align-items: center; justify-content: center;
        gap: 14px; padding: 14px 4px 2px;
      }
    `,
    ],
    standalone: false
})
export class PaginatorComponent {
  @Input() page = 1;
  @Input() total = 0;
  @Input() limit = 50;

  @Output() pageChange = new EventEmitter<number>();

  get pages(): number {
    return Math.max(1, Math.ceil(this.total / Math.max(1, this.limit)));
  }

  go(target: number): void {
    if (target >= 1 && target <= this.pages && target !== this.page) this.pageChange.emit(target);
  }
}
