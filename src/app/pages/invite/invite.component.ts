import { Component, type OnDestroy, type OnInit } from '@angular/core';
import { type AbstractControl, FormBuilder, type FormGroup, type ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { InvitePreview } from '../../models/interfaces';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ServerErrorsHandler } from '../../shared/server-errors/server-errors';

/**
 * Serve aos fluxos `invite` e `reset` (via `data.mode` da rota). O token é validado
 * no servidor antes de o formulário aparecer.
 */
@Component({
    selector: 'app-invite',
    templateUrl: './invite.component.html',
    styleUrls: ['./invite.component.scss'],
    standalone: false
})
export class InviteComponent implements OnInit, OnDestroy {
  mode: 'invite' | 'reset' = 'invite';
  state: 'loading' | 'ready' | 'invalid' = 'loading';
  invite: InvitePreview | null = null;
  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;
  loading = false;

  private token = '';

  private readonly FIELD_LABELS: Record<string, string> = { password: 'Senha' };

  private readonly LOCAL_ERRORS: Record<string, string> = {
    password: 'A senha deve ter ao menos 8 caracteres.',
    confirm: 'As senhas não conferem.',
  };

  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirm: ['', Validators.required],
      },
      { validators: passwordsMatch }
    );
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  get isReset(): boolean {
    return this.mode === 'reset';
  }

  ngOnInit(): void {
    this.mode = (this.route.snapshot.data['mode'] as 'invite' | 'reset') ?? 'invite';
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.state = 'invalid';
      this.formError = this.isReset ? 'Link de redefinição incompleto.' : 'Link de convite incompleto.';
      return;
    }

    const consulta = this.isReset ? this.api.getReset(this.token) : this.api.getInvite(this.token);
    consulta.subscribe({
      next: (invite) => {
        this.invite = invite;
        this.state = 'ready';
      },
      error: (err) => {
        this.state = 'invalid';
        this.formError = err?.error?.error ?? 'Não foi possível validar este link.';
      },
    });
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    this.loading = true;
    this.formError = '';

    const acao = this.isReset
      ? this.api.resetPassword(this.token, this.form.value.password)
      : this.api.acceptInvite(this.token, this.form.value.password);

    acao.subscribe({
      next: (res) => {
        this.loading = false;
        this.auth.adoptSession(res.token, res.user);
        this.router.navigate([res.user.role === 'superadmin' ? '/clientes' : '/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        // Token consumido/expirado enquanto a pessoa preenchia: volta ao estado de erro.
        if (err?.status === 400 && !err?.error?.errors) {
          this.state = 'invalid';
          this.formError = err?.error?.error ?? 'Link inválido ou expirado.';
          return;
        }
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
      },
    });
  }
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  if (!confirm || password === confirm) return null;
  group.get('confirm')?.setErrors({ mismatch: true });
  return { mismatch: true };
}
