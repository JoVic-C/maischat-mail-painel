import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { PromptService } from './prompt.service';

@Component({
    selector: 'app-prompt',
    templateUrl: './prompt.component.html',
    standalone: false
})
export class PromptComponent implements AfterViewChecked {
  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;
  private focused = false;

  constructor(public svc: PromptService) {}

  /** Rearma o foco quando o modal fecha. */
  ngAfterViewChecked(): void {
    if (this.svc.state && this.inputRef && !this.focused) {
      this.inputRef.nativeElement.focus();
      this.focused = true;
    } else if (!this.svc.state && this.focused) {
      this.focused = false;
    }
  }

  submit(): void {
    const value = this.svc.value.trim();
    if (value) this.svc.resolve(value);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.svc.state) this.svc.resolve(null);
  }
}
