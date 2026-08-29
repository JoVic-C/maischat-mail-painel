import { Component, HostListener } from '@angular/core';
import { ConfirmService } from './confirm.service';

/** Renderiza o modal de confirmação global (montado uma vez no app.component). */
@Component({
    selector: 'app-confirm',
    templateUrl: './confirm.component.html',
    standalone: false
})
export class ConfirmComponent {
  constructor(public svc: ConfirmService) {}

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.svc.state) this.svc.resolve(false);
  }
}
