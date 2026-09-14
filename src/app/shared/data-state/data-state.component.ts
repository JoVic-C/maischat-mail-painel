import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
    selector: 'app-data-state',
    templateUrl: './data-state.component.html',
    styles: [':host{display:block}'],
    standalone: false
})
export class DataStateComponent {
  @Input() loading = false;
  /** Mensagem de erro já traduzida; vazio/null = sem erro. */
  @Input() error: string | null = null;
  @Input() empty = false;
  @Input() emptyText = 'Nada por aqui ainda.';
  @Input() skeletonRows = 5;
  @Input() skeletonCols = 4;

  @Output() retry = new EventEmitter<void>();
}
