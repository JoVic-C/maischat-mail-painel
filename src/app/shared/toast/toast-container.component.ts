import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Toast, ToastService } from './toast.service';

/** Pilha de toasts — montada uma única vez no app.component. */
@Component({
    selector: 'app-toast-container',
    templateUrl: './toast-container.component.html',
    styleUrls: ['./toast-container.component.scss'],
    standalone: false
})
export class ToastContainerComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  private subs = new Subscription();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.add(
      this.toast.toasts$.subscribe((t) => {
        this.toasts = [...this.toasts, t];
        this.cdr.markForCheck();
        if (t.durationMs > 0) {
          this.timers.set(
            t.id,
            setTimeout(() => this.dismiss(t.id), t.durationMs)
          );
        }
      })
    );
    this.subs.add(this.toast.dismiss$.subscribe((id) => this.dismiss(id)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  dismiss(id: number): void {
    const handle = this.timers.get(id);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(id);
    }
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.cdr.markForCheck();
  }

  iconFor(kind: Toast['kind']): string {
    switch (kind) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warn':
        return '⚠';
      default:
        return 'ℹ';
    }
  }
}
