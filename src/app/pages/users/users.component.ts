import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InviteLink, ManagedUser, SaveUserInput } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
    selector: 'app-users',
    templateUrl: './users.component.html',
    styleUrls: ['./users.component.scss'],
    standalone: false
})
export class UsersComponent implements OnInit, OnDestroy {
  users: ManagedUser[] = [];
  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;
  editingId: string | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  private readonly FIELD_LABELS: Record<string, string> = {
    email: 'Email',
    name: 'Nome',
    password: 'Senha',
    role: 'Papel',
    isActive: 'Situação',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    email: 'Informe um email válido.',
    password: 'A senha deve ter ao menos 8 caracteres.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      name: [''],
      password: ['', [Validators.minLength(8)]],
      role: ['user'],
      isActive: [true],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  isSelf(user: ManagedUser): boolean {
    return user.id === this.auth.currentUser?.id;
  }

  get editingSelf(): boolean {
    return !!this.editingId && this.editingId === this.auth.currentUser?.id;
  }

  openCreate(): void {
    this.editingId = null;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ email: '', name: '', password: '', role: 'user', isActive: true });
    // Senha obrigatória só na criação — na edição, vazio significa "manter a atual".
    // Sem senha o usuário nasce com convite pendente e define a própria — é o padrão.
    this.form.controls['password'].setValidators([Validators.minLength(8)]);
    this.form.controls['password'].updateValueAndValidity();
    this.form.controls['role'].enable();
    this.form.controls['isActive'].enable();
    this.modal = true;
  }

  openEdit(user: ManagedUser): void {
    this.editingId = user.id;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      isActive: user.isActive,
    });
    this.form.controls['password'].setValidators([Validators.minLength(8)]);
    this.form.controls['password'].updateValueAndValidity();
    // O backend recusa alterar o próprio papel ou desativar a própria conta.
    if (this.editingSelf) {
      this.form.controls['role'].disable();
      this.form.controls['isActive'].disable();
    } else {
      this.form.controls['role'].enable();
      this.form.controls['isActive'].enable();
    }
    this.modal = true;
  }

  /** Convite recém-gerado, exibido para o admin poder repassar o link. */
  invite: InviteLink | null = null;
  inviteFor = '';
  linkCopied = false;

  /**
   * Gera um link de redefinição de senha (suporte a quem não recebe o email).
   * Quem gera não fica sabendo a senha — o dono do link é que a define.
   */
  gerarLinkSenha(user: ManagedUser): void {
    this.api.userResetLink(user.id).subscribe({
      next: (res) => {
        this.toast.success(res.message);
        this.showInvite({ ...res.reset, emailSent: res.reset.emailSent }, user.email);
        this.inviteKind = 'reset';
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  /** Reenvia o convite de quem ainda não definiu a senha (invalida o link anterior). */
  resendInvite(user: ManagedUser): void {
    this.api.resendInvite(user.id).subscribe({
      next: (res) => {
        this.toast.success(res.message);
        this.showInvite(res.invite, user.email);
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  /** Distingue os dois tipos de link no painel — o texto e o aviso mudam. */
  inviteKind: 'invite' | 'reset' = 'invite';

  private showInvite(invite: InviteLink, email: string): void {
    this.inviteKind = 'invite';
    this.invite = invite;
    this.inviteFor = email;
    this.linkCopied = false;
  }

  /** Copia o link para a área de transferência, com retorno visual. */
  async copyInviteLink(): Promise<void> {
    if (!this.invite) return;
    try {
      await navigator.clipboard.writeText(this.invite.url);
      this.linkCopied = true;
      setTimeout(() => (this.linkCopied = false), 2200);
    } catch {
      this.toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    // getRawValue inclui os controls desabilitados (papel/situação ao editar a si mesmo).
    const payload: SaveUserInput = { ...this.form.getRawValue() };
    if (this.editingId) payload.id = this.editingId;
    if (payload.id && !payload.password) delete payload.password;

    this.saving = true;
    this.formError = '';
    this.api.saveUser(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.modal = false;
        this.toast.success(res.message);
        // Criado sem senha: mostra o link para o admin repassar caso o email não saia.
        if (res.invite) this.showInvite(res.invite, payload.email);
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  revokeSessions(user: ManagedUser): void {
    this.confirm
      .ask({
        title: 'Encerrar sessões',
        message: `Desconectar ${user.email} de todos os dispositivos?\n\nEle precisará entrar de novo. Use quando suspeitar que o acesso foi comprometido.`,
        confirmLabel: 'Encerrar sessões',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.revokeUserSessions(user.id).subscribe({
          next: (res) => this.toast.success(res.message),
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  remove(user: ManagedUser): void {
    this.confirm
      .ask({
        title: 'Excluir usuário',
        message: `Excluir ${user.email}?\n\nEsta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteUser(user.id).subscribe({
          next: () => {
            this.toast.success('Usuário excluído.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }
}
