import { Component, Input } from '@angular/core';

export type LogoVariant = 'mark' | 'full';

/**
 * Marca do mMail.
 *
 * - `variant="mark"` → só o símbolo (bolha de conversa que forma o "M").
 * - `variant="full"` → assinatura completa: m + símbolo + ail.
 *
 * As cores vêm do contexto: o símbolo usa `currentColor`, então basta definir
 * `color` no elemento pai (ou usar `markColor="brand"` para forçar o laranja).
 */
@Component({
    selector: 'app-logo',
    templateUrl: './logo.component.html',
    styleUrls: ['./logo.component.scss'],
    standalone: false
})
export class LogoComponent {
  @Input() variant: LogoVariant = 'full';
  /** Altura da assinatura (o símbolo acompanha). Ex.: '20px', '1.4rem'. */
  @Input() size = '20px';
  /** 'brand' pinta o símbolo de laranja; 'inherit' usa a cor do texto ao redor. */
  @Input() markColor: 'brand' | 'inherit' = 'inherit';
}
