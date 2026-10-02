import { Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SaveTemplateInput, Template } from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { PromptService } from '../../shared/prompt/prompt.service';
import { abrirLinksEmNovaAba, sanitizeEmailDocument, sanitizeEmailHtml } from '../../shared/html/sanitize-html';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

/** Só marcas de documento contam; `<table>` ou `<div>` soltas continuam sendo coladas no visual. */
function pareceDocumentoHtml(texto: string): boolean {
  const inicio = texto.trimStart().slice(0, 500).toLowerCase();
  return inicio.startsWith('<!doctype html') || inicio.startsWith('<html') || /<body[\s>]/.test(inicio);
}

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
    // Email completo no editor visual vira uma segunda prévia e perde o <head> ao ser editado.
    this.advanced = pareceDocumentoHtml(t.html);
    this.editor = true;
    if (!this.advanced) this.seedEditor();
    this.preview();
  }

  closeEditor(): void {
    this.editor = false;
  }

  /**
   * `innerHTML` direto não passa pelo sanitizador do Angular, e o HTML vem de outro
   * usuário do cliente: sanitizar é obrigatório para evitar XSS armazenado.
   */
  private seedEditor(): void {
    clearTimeout(this.seedTimer);
    this.seedTimer = setTimeout(() => {
      if (!this.editorRef) return;
      const original = String(this.form.value.html || '');
      const safe = sanitizeEmailHtml(original);
      this.editorRef.nativeElement.innerHTML = safe;

      // Condicional do Outlook não sobrevive ao sanitizador (ver sanitize-html.ts) e o
      // syncFromEditor gravaria o DOM sem ela: avisa o usuário.
      if (original.includes('<!--[if') && !safe.includes('<!--[if')) {
        this.toast.warn(
          'Este template tem trechos condicionais do Outlook, que o editor visual não suporta. ' +
            'Edite no modo HTML avançado para não perdê-los.'
        );
      }
    }, 0);
  }

  async toggleAdvanced(): Promise<void> {
    if (!this.advanced) {
      this.advanced = true;
      return;
    }

    if (pareceDocumentoHtml(String(this.form.value.html || ''))) {
      const ok = await this.confirm.ask({
        title: 'Abrir no editor visual?',
        message:
          'Este template é um email completo, com layout e CSS próprios. O editor visual não preserva ' +
          'essa estrutura: ao editar por ele, o layout pode se perder.\n\nPara alterar textos, prefira o HTML avançado.',
        confirmLabel: 'Abrir mesmo assim',
        danger: true,
      });
      if (!ok) return;
    }

    this.advanced = false;
    this.seedEditor();
  }

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

  syncFromEditor(): void {
    if (this.editorRef) {
      this.form.patchValue({ html: this.editorRef.nativeElement.innerHTML }, { emitEvent: true });
      this.form.controls['html'].markAsTouched();
    }
    this.preview();
  }

  /**
   * O contenteditable insere código colado como texto escapado; um documento HTML
   * completo vai direto para o modo HTML avançado.
   */
  onPaste(event: ClipboardEvent): void {
    const texto = event.clipboardData?.getData('text/plain') ?? '';
    if (!pareceDocumentoHtml(texto)) return;

    event.preventDefault();
    this.advanced = true;
    this.form.patchValue({ html: texto.trim() });
    this.form.controls['html'].markAsTouched();
    this.preview();
    this.toast.info('Você colou um email em HTML. Ele foi aberto no modo HTML avançado para manter o layout.');
  }

  /** Prévia pronta para o iframe: já sanitizada e marcada como confiável. */
  previewDoc: SafeHtml | null = null;
  private readonly domSanitizer = inject(DomSanitizer);

  preview(): void {
    clearTimeout(this.previewTimer);
    const html = String(this.form.value.html || '');
    if (!html) {
      this.previewHtml = '';
      this.previewDoc = null;
      return;
    }
    this.previewTimer = setTimeout(() => {
      this.api.previewTemplate({ html, subject: String(this.form.value.subject || '') }).subscribe({
        next: (res) => this.mostrarPrevia(abrirLinksEmNovaAba(sanitizeEmailDocument(res.html))),
        error: () => this.mostrarPrevia('<p style="font-family:sans-serif;color:#c0392b">Erro no template.</p>'),
      });
    }, 350);
  }

  /**
   * O iframe em `sandbox` isola o CSS do email e bloqueia script; a única permissão é abrir
   * links em nova aba. O bypass só existe porque o Angular exige para `srcdoc`, e é aplicado
   * sobre o que o DOMPurify já limpou.
   */
  private mostrarPrevia(documento: string): void {
    this.previewHtml = documento;
    this.previewDoc = this.domSanitizer.bypassSecurityTrustHtml(documento);
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
