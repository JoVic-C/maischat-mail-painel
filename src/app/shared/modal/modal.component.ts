import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type ModalVariant = 'default' | 'warning' | 'danger';

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
