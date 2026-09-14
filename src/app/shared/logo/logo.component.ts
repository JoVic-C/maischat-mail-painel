import { Component, Input } from '@angular/core';

export type LogoVariant = 'mark' | 'full';

/** O símbolo usa `currentColor`: a cor vem do elemento pai. */
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
