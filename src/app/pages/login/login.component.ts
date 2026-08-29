import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ServerErrorsHandler } from '../../shared/server-errors/server-errors';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    standalone: false
})
export class LoginComponent implements OnDestroy {
  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;
  loading = false;

  private readonly FIELD_LABELS: Record<string, string> = { email: 'E-mail', password: 'Senha' };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    email: 'Informe um email válido.',
    password: 'Informe a senha.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  /** A tela alterna entre login e pedido de recuperação, sem trocar de rota. */
  forgotMode = false;
  forgotEmail = '';
  forgotSent = false;
  forgotLoading = false;

  constructor(
    private auth: AuthService,
    private api: ApiService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  abrirRecuperacao(): void {
    this.forgotMode = true;
    this.forgotSent = false;
    this.formError = '';
    // Aproveita o email já digitado no login — quem esqueceu a senha costuma ter tentado antes.
    this.forgotEmail = this.form.value.email ?? '';
  }

  voltarAoLogin(): void {
    this.forgotMode = false;
    this.forgotSent = false;
  }

  /**
   * Pede a recuperação. A tela mostra SEMPRE a mesma confirmação, exista o email ou
   * não — é o que impede a página de virar ferramenta para descobrir quem tem conta.
   */
  enviarRecuperacao(): void {
    if (!this.forgotEmail.trim()) return;
    this.forgotLoading = true;
    this.api.forgotPassword(this.forgotEmail.trim()).subscribe({
      next: () => {
        this.forgotLoading = false;
        this.forgotSent = true;
      },
      error: () => {
        this.forgotLoading = false;
        this.forgotSent = true; // mesma resposta em qualquer desfecho
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    this.loading = true;
    this.formError = '';
    const { email, password } = this.form.value;
    this.auth.login(email, password).subscribe({
      next: (res) => {
        this.loading = false;
        // O superadmin não pertence a um cliente: manda escolher em qual vai operar.
        this.router.navigate([res.user.role === 'superadmin' ? '/clientes' : '/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
      },
    });
  }
}
