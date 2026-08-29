import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type ModalVariant = 'default' | 'warning' | 'danger';

/**
 * Wrapper de modal reutilizável.
 *
 * ```html
 * <app-modal *ngIf="show" title="Excluir lista" variant="danger"
 *            [busy]="saving" (close)="close()">
 *   <p>Conteúdo do corpo</p>
 *   <ng-container modal-actions>
 *     <app-button variant="outline" (click)="close()">Cancelar</app-button>
 *     <app-button variant="danger" [loading]="saving" (click)="confirm()">Excluir</app-button>
 *   </ng-container>
 * </app-modal>
 * ```
 */
@Component({
    selector: 'app-modal',
    templateUrl: './modal.component.html',
    styleUrls: ['./modal.component.scss'],
    standalone: false
})
export class ModalComponent {
  @Input() title = '';
  @Input() busy = false;
  @Input() size: ModalSize = 'md';
  @Input() variant: ModalVariant = 'default';
  @Input() dismissOnBackdrop = true;
  @Output() close = new EventEmitter<void>();

  @HostBinding('class') get hostClass(): string {
    return `variant-${this.variant}`;
  }

  get titleIcon(): string {
    return this.variant === 'default' ? '' : '⚠';
  }

  onBackdropClick(): void {
    if (this.busy || !this.dismissOnBackdrop) return;
    this.close.emit();
  }

  onCloseClick(): void {
    if (this.busy) return;
    this.close.emit();
  }
}
