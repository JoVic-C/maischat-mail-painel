import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SaveTemplateInput, Template } from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { PromptService } from '../../shared/prompt/prompt.service';
import { sanitizeEmailHtml } from '../../shared/html/sanitize-html';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
    selector: 'app-templates',
    templateUrl: './templates.component.html',
    styleUrls: ['./templates.component.scss'],
    standalone: false
})
export class TemplatesComponent implements OnInit, OnDestroy {
  @ViewChild('editorEl') editorRef?: ElementRef<HTMLDivElement>;

  templates: Template[] = [];
  loading = false;
  error: string | null = null;

  editor = false;
  saving = false;
  advanced = false;
  uploadingImg = false;
  editingId: string | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  previewHtml = '';

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    subject: 'Assunto',
    html: 'Conteúdo do email',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
    subject: 'Escreva o assunto do email.',
    html: 'Escreva o conteúdo do email.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }


  private previewTimer?: ReturnType<typeof setTimeout>;
  private seedTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private prompt: PromptService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      subject: ['', Validators.required],
      // Preenchido pelo editor visual (contenteditable) ou pelo modo HTML avançado.
      html: ['', Validators.required],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.previewTimer);
    clearTimeout(this.seedTimer);
    this.serverErrors.destroy();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: '', subject: '', html: '' });
    this.previewHtml = '';
    this.advanced = false;
    this.editor = true;
    this.seedEditor();
  }

  openEdit(t: Template): void {
    this.editingId = t._id;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: t.name, subject: t.subject, html: t.html });
    this.previewHtml = '';
    this.advanced = false;
    this.editor = true;
    this.seedEditor();
    this.preview();
  }

  closeEditor(): void {
    this.editor = false;
  }

  /**
   * Coloca o HTML atual dentro do editor visual (depois que o modal renderiza).
   *
   * O `innerHTML` aqui é atribuição direta no DOM: o sanitizador do Angular não passa
   * por este caminho. Como o HTML vem de um template salvo por outro usuário do cliente,
   * sanitizar é obrigatório — sem isso, `<img src=x onerror=...>` gravado por um usuário
   * comum executaria na sessão do admin que abrisse o template para editar.
   */
  private seedEditor(): void {
    clearTimeout(this.seedTimer);
    this.seedTimer = setTimeout(() => {
      if (!this.editorRef) return;
      const original = String(this.form.value.html || '');
      const safe = sanitizeEmailHtml(original);
      this.editorRef.nativeElement.innerHTML = safe;

      // Condicional do Outlook não passa pelo sanitizador (ver sanitize-html.ts). Sem
      // este aviso o fallback sumiria calado assim que a pessoa digitasse no visual,
      // porque o syncFromEditor grava de volta o que está no DOM.
      if (original.includes('<!--[if') && !safe.includes('<!--[if')) {
        this.toast.warn(
          'Este template tem trechos condicionais do Outlook, que o editor visual não suporta. ' +
            'Edite no modo HTML avançado para não perdê-los.'
        );
      }
    }, 0);
  }

  toggleAdvanced(): void {
    this.advanced = !this.advanced;
    if (!this.advanced) this.seedEditor(); // voltou pro visual → recarrega o conteúdo
  }

  /** Aplica um comando de formatação e sincroniza o HTML. */
  exec(cmd: string, value?: string): void {
    document.execCommand(cmd, false, value);
    this.syncFromEditor();
  }

  insertVar(name: string): void {
    document.execCommand('insertText', false, `{{${name}}}`);
    this.syncFromEditor();
  }

  addLink(): void {
    this.prompt
      .ask({
        title: 'Inserir link',
        label: 'Endereço',
        type: 'url',
        initialValue: 'https://',
        placeholder: 'https://site.com',
        confirmLabel: 'Inserir',
      })
      .then((url) => {
        if (!url) return;
        this.editorRef?.nativeElement.focus();
        this.exec('createLink', url);
      });
  }

  /** Faz upload da imagem escolhida e a insere no editor. */
  onImageSelected(event: Event, input: HTMLInputElement): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingImg = true;
    this.api.uploadImage(file).subscribe({
      next: (res) => {
        this.uploadingImg = false;
        input.value = ''; // permite reenviar a mesma imagem depois
        this.editorRef?.nativeElement.focus();
        document.execCommand('insertImage', false, res.url);
        this.syncFromEditor();
        this.toast.success('Imagem inserida.');
      },
      error: (err) => {
        this.uploadingImg = false;
        input.value = '';
        this.toast.apiError(err);
      },
    });
  }

  /** Lê o HTML gerado pelo editor visual para o form e atualiza a prévia. */
  syncFromEditor(): void {
    if (this.editorRef) {
      this.form.patchValue({ html: this.editorRef.nativeElement.innerHTML }, { emitEvent: true });
      this.form.controls['html'].markAsTouched();
    }
    this.preview();
  }

  preview(): void {
    clearTimeout(this.previewTimer);
    const html = String(this.form.value.html || '');
    if (!html) {
      this.previewHtml = '';
      return;
    }
    this.previewTimer = setTimeout(() => {
      this.api.previewTemplate({ html, subject: String(this.form.value.subject || '') }).subscribe({
        // O binding [innerHTML] da prévia já passa pelo sanitizador do Angular; o
        // DOMPurify vem antes como defesa em profundidade (bypasses do sanitizador
        // aparecem de tempos em tempos — a 18 tinha vários).
        next: (res) => (this.previewHtml = sanitizeEmailHtml(res.html)),
        error: () => (this.previewHtml = '<em style="color:var(--r)">Erro no template</em>'),
      });
    }, 350);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    const payload: SaveTemplateInput = { ...this.form.value };
    if (this.editingId) payload.id = this.editingId;

    this.saving = true;
    this.formError = '';
    this.api.saveTemplate(payload).subscribe({
      next: () => {
        this.saving = false;
        this.editor = false;
        this.toast.success('Template salvo.');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  duplicate(t: Template): void {
    this.api.duplicateTemplate(t._id).subscribe({
      next: () => {
        this.toast.success('Template duplicado.');
        this.load();
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  remove(t: Template): void {
    this.confirm
      .ask({
        title: 'Excluir template',
        message: `Excluir o template "${t.name}"?\n\nCampanhas que já usam este template continuam funcionando apenas se ainda não foram disparadas.`,
        confirmLabel: 'Excluir',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteTemplate(t._id).subscribe({
          next: () => {
            this.toast.success('Template excluído.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }
}
