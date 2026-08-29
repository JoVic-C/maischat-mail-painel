import { Component, HostBinding, Input } from '@angular/core';

export type ButtonVariant = 'primary' | 'outline' | 'success' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Botão padrão do mMail — encapsula as classes .btn do design system. */
@Component({
    selector: 'app-button',
    templateUrl: './button.component.html',
    styleUrls: ['./button.component.scss'],
    standalone: false
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() fullWidth = false;
  @Input() disabled = false;
  @Input() loading = false;

  @HostBinding('class.is-full') get _full(): boolean {
    return this.fullWidth;
  }

  private readonly variantClass: Record<ButtonVariant, string> = {
    primary: 'btn-p',
    outline: 'btn-o',
    success: 'btn-g',
    danger: 'btn-r',
    ghost: 'btn-ghost',
    link: 'btn-link',
  };

  get classes(): string {
    const parts = ['btn', this.variantClass[this.variant]];
    if (this.size === 'sm') parts.push('btn-sm');
    if (this.size === 'lg') parts.push('btn-lg');
    if (this.fullWidth) parts.push('btn-full');
    return parts.join(' ');
  }
}
