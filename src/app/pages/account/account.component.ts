import { Component, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { USER_ROLE_LABELS } from '../../models';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

/** Confirmação precisa bater com a nova senha. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const novo = group.get('newPassword')?.value;
  const confirma = group.get('confirmPassword')?.value;
  return !confirma || novo === confirma ? null : { mismatch: true };
}

@Component({
    selector: 'app-account',
    templateUrl: './account.component.html',
    styleUrls: ['./account.component.scss'],
    standalone: false
})
export class AccountComponent implements OnDestroy {
  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  changing = false;
  revoking = false;

  private readonly FIELD_LABELS: Record<string, string> = {
    currentPassword: 'Senha atual',
    newPassword: 'Nova senha',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    currentPassword: 'Informe a senha atual.',
    newPassword: 'A nova senha deve ter ao menos 8 caracteres.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    public auth: AuthService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group(
      {
        currentPassword: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
      },
      { validators: passwordsMatch }
    );
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  get roleLabel(): string {
    const role = this.auth.currentUser?.role;
    return role ? (USER_ROLE_LABELS[role]?.label ?? role) : '—';
  }

  get mismatch(): boolean {
    return !!this.form.errors?.['mismatch'] && !!this.form.controls['confirmPassword'].touched;
  }

  changePassword(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    this.changing = true;
    this.formError = '';
    const { currentPassword, newPassword } = this.form.value;
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: (res) => {
        this.changing = false;
        this.form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        this.toast.success(res.message);
      },
      error: (err) => {
        this.changing = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  logoutAll(): void {
    this.confirm
      .ask({
        title: 'Encerrar todas as sessões',
        message: 'Você será desconectado aqui também e precisará entrar de novo. Continuar?',
        confirmLabel: 'Encerrar sessões',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.revoking = true;
        this.auth.logoutAll().subscribe({
          next: () => {
            this.revoking = false;
            this.toast.success('Sessões encerradas.');
            this.auth.logout();
          },
          error: (err) => {
            this.revoking = false;
            this.toast.apiError(err);
          },
        });
      });
  }
}
