import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subscription, switchMap, timer } from 'rxjs';
import { ImportCounters, ImportJob, ImportSampleRow, List } from '../../models';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../toast/toast.service';

/** Primeiro intervalo entre consultas de progresso — o início precisa responder rápido. */
const POLL_INICIAL_MS = 1200;

/** Teto do intervalo: uma importação longa não precisa ser consultada a cada segundo. */
const POLL_MAX_MS = 10_000;

/** Quanto o intervalo cresce a cada consulta sem desfecho. */
const POLL_FATOR = 1.6;

function emptyCounters(): ImportCounters {
  return { rows: 0, new: 0, addToList: 0, inList: 0, already: 0, invalid: 0 };
}

/**
 * Importador de contatos reutilizável.
 * Usado tanto na tela de Contatos quanto no passo 2 de "Nova lista".
 *
 * - Sem `fixedListId`: mostra o seletor de lista de destino.
 * - Com `fixedListId`: destino travado nessa lista (esconde o seletor).
 *
 * O arquivo sobe para o servidor e é processado por um worker; esta tela só
 * acompanha contadores. Nenhuma linha de contato passa por aqui, o que é o que
 * permite importar listas de centenas de milhares de contatos sem travar o
 * navegador nem estourar o limite de corpo da requisição.
 */
@Component({
  selector: 'app-csv-import',
  templateUrl: './csv-import.component.html',
  styleUrls: ['./csv-import.component.scss'],
  standalone: false,
})
export class CsvImportComponent implements OnInit, OnDestroy {
  /** Listas disponíveis para o seletor de destino (ignorado quando fixedListId está setado). */
  @Input() lists: List[] = [];
  /** Quando setado, o destino fica travado nessa lista e o seletor some. */
  @Input() fixedListId: string | null = null;
  /** Texto do botão de fechar/cancelar (fase inicial). */
  @Input() cancelLabel = 'Cancelar';
  /** Texto do botão de fechar (fase final). */
  @Input() doneCancelLabel = 'Fechar';

  /** Emitido após importar com sucesso. */
  @Output() finished = new EventEmitter<{ imported: number }>();
  /** Emitido quando o usuário cancela/fecha. */
  @Output() cancel = new EventEmitter<void>();

  form: FormGroup;
  /**
   * form       → escolhendo arquivo/colando
   * validating → worker classificando as linhas
   * done       → validado, esperando a confirmação
   * importing  → worker gravando no banco
   * finished   → concluído
   */
  phase: 'form' | 'validating' | 'done' | 'importing' | 'finished' = 'form';

  jobId = '';
  jobName = '';
  counters: ImportCounters = emptyCounters();
  sample: ImportSampleRow[] = [];
  imported = 0;
  skipped = 0;

  file: File | null = null;
  uploading = false;
  downloading = false;
  /** Lista com que a validação foi feita — trocar de lista invalida o resultado. */
  validatedListId = '';

  private poll?: Subscription;
  /** Falso assim que o job termina — impede reagendar sobre um acompanhamento encerrado. */
  private pollAtivo = false;
  private intervaloPoll = POLL_INICIAL_MS;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({ csv: [''], listId: [''] });
  }

  ngOnInit(): void {
    if (this.fixedListId) this.form.patchValue({ listId: this.fixedListId });
    this.resumeOpenImport();
  }

  ngOnDestroy(): void {
    // Só para de acompanhar — o job continua no servidor, e é assim que ele
    // sobrevive a fechar o modal ou recarregar a página.
    this.stopPolling();
  }

  get importListId(): string {
    return String(this.form.value.listId || '');
  }

  get listIds(): string[] {
    return this.importListId ? [this.importListId] : [];
  }

  get importableCount(): number {
    return this.counters.new + this.counters.addToList;
  }

  get ignoredCount(): number {
    return this.counters.inList + this.counters.already;
  }

  get busy(): boolean {
    return this.phase === 'validating' || this.phase === 'importing';
  }

  /** Nome do arquivo escolhido, ou o rótulo do conteúdo colado. */
  get sourceLabel(): string {
    if (this.file) return this.file.name;
    return this.form.value.csv ? 'Conteúdo colado' : '';
  }

  get canSubmit(): boolean {
    return !this.uploading && (!!this.file || !!String(this.form.value.csv || '').trim());
  }

  /**
   * Trocar a lista de destino muda a classificação de quem já existe na base
   * ("já na lista" vs "+ à lista"), então o resultado anterior deixa de valer.
   */
  get needsRevalidate(): boolean {
    return (
      this.phase === 'done' &&
      this.importListId !== this.validatedListId &&
      this.counters.addToList + this.counters.inList + this.counters.already > 0
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    // Arquivo e texto colado são a mesma entrada por caminhos diferentes: escolher
    // um limpa o outro, para não restar dúvida sobre o que será enviado.
    if (this.file) this.form.patchValue({ csv: '' });
  }

  /** Sobe o CSV e passa a acompanhar o job. */
  startValidation(): void {
    const pasted = String(this.form.value.csv || '').trim();
    if (!this.file && !pasted) return;

    // O conteúdo colado vira arquivo: um único caminho no servidor, e o texto
    // deixa de trafegar dentro de um JSON (que era o que estourava o limite).
    const blob = this.file ?? new Blob([pasted], { type: 'text/csv' });
    const filename = this.file?.name ?? 'contatos-colados.csv';

    this.uploading = true;
    this.resetProgress();
    this.validatedListId = this.importListId;

    this.api.startImport(blob, filename, this.listIds).subscribe({
      next: (res) => {
        this.uploading = false;
        this.jobId = res.id;
        this.jobName = filename;
        this.phase = 'validating';
        this.startPolling();
      },
      error: (err) => {
        this.uploading = false;
        this.toast.apiError(err);
      },
    });
  }

  confirmImport(): void {
    if (!this.jobId || !this.importableCount) return;
    this.phase = 'importing';
    this.api.confirmImport(this.jobId, this.listIds).subscribe({
      next: () => this.startPolling(),
      error: (err) => {
        this.phase = 'done';
        this.toast.apiError(err);
      },
    });
  }

  cancelJob(): void {
    if (!this.jobId) {
      this.phase = 'form';
      return;
    }
    this.api.cancelImport(this.jobId).subscribe({
      next: () => {
        this.stopPolling();
        this.resetProgress();
        this.phase = 'form';
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  /** Volta ao formulário mantendo o arquivo, para revalidar com outra lista. */
  revalidate(): void {
    this.stopPolling();
    this.resetProgress();
    this.phase = 'form';
  }

  downloadInvalid(): void {
    if (!this.jobId) return;
    this.downloading = true;
    this.api.downloadImportInvalid(this.jobId).subscribe({
      next: (blob) => {
        this.downloading = false;
        // Acima de 20 mil recusados o servidor devolve CSV em vez de xlsx.
        const isCsv = blob.type.includes('csv') || blob.type.includes('text');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contatos-incorretos.${isCsv ? 'csv' : 'xlsx'}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.downloading = false;
        this.toast.apiError(err);
      },
    });
  }

  /** O motivo da recusa entra como tooltip do badge. */
  rowHint(row: ImportSampleRow): string {
    return row.reason ?? '';
  }

  /**
   * Reencontra uma importação deixada em aberto (fechou o modal, recarregou a
   * página, caiu a rede) e volta a acompanhá-la de onde estava.
   */
  private resumeOpenImport(): void {
    this.api.getOpenImports().subscribe({
      next: (open) => {
        // Com destino travado (wizard de nova lista), não se retoma nada: o job
        // mais recente pode ser de OUTRA lista, e prender a tela a ele importaria
        // contatos para o lugar errado. A lista acabou de ser criada, então não há
        // importação anterior dela para recuperar.
        const job = this.fixedListId ? undefined : open[0];
        if (!job || this.jobId) return;
        this.jobId = job.id;
        this.jobName = job.originalName;
        this.phase = job.status === 'importing' ? 'importing' : 'validating';
        this.startPolling();
      },
      // Falhar aqui não impede começar uma importação nova: segue em silêncio.
      error: () => undefined,
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollAtivo = true;
    // Cada fase (validar, importar) recomeça rápido: é quando o usuário está olhando.
    this.intervaloPoll = POLL_INICIAL_MS;
    this.consultarProgresso(0);
  }

  /**
   * Consulta o progresso e reagenda a próxima com intervalo crescente.
   *
   * Em intervalo fixo de 1,2s eram 50 requisições por minuto: uma importação de dez
   * minutos gastava umas 500, e a cota geral da API — 200 por 15 minutos, contada por
   * IP — acabava no meio do caminho. A tela levava 429 e parava de acompanhar,
   * enquanto o worker terminava a importação normalmente no servidor.
   *
   * Crescendo até 10s, a mesma importação faz cerca de 60 consultas.
   */
  private consultarProgresso(atraso: number): void {
    this.poll = timer(atraso)
      .pipe(switchMap(() => this.api.getImport(this.jobId)))
      .subscribe({
        next: (job) => {
          this.applyJob(job);
          // applyJob encerra o acompanhamento quando o job chega ao fim.
          if (!this.pollAtivo) return;
          // Agenda com o intervalo atual e só então cresce: crescer antes faria a
          // primeira espera ser 1,9s em vez do 1,2s prometido pela constante.
          const proxima = this.intervaloPoll;
          this.intervaloPoll = Math.min(this.intervaloPoll * POLL_FATOR, POLL_MAX_MS);
          this.consultarProgresso(proxima);
        },
        error: (err) => {
          this.stopPolling();
          this.toast.apiError(err);
        },
      });
  }

  private stopPolling(): void {
    this.pollAtivo = false;
    this.poll?.unsubscribe();
    this.poll = undefined;
  }

  private applyJob(job: ImportJob): void {
    this.counters = job.counters ?? emptyCounters();
    this.sample = job.sample ?? [];
    this.imported = job.imported ?? 0;
    this.skipped = job.skipped ?? 0;
    if (job.originalName) this.jobName = job.originalName;
    // A lista com que o servidor validou é a verdade — inclusive ao retomar um
    // job que esta aba nunca viu começar.
    this.validatedListId = job.listIds?.[0] ?? '';
    if (!this.fixedListId && this.busy) this.form.patchValue({ listId: this.validatedListId }, { emitEvent: false });

    switch (job.status) {
      case 'validated':
        this.stopPolling();
        this.phase = 'done';
        break;
      case 'done':
        this.stopPolling();
        this.phase = 'finished';
        this.toast.success(`${this.imported} contato(s) importado(s).`);
        this.finished.emit({ imported: this.imported });
        break;
      case 'failed':
        this.stopPolling();
        this.phase = 'form';
        this.toast.error(job.error || 'Falha ao processar a importação.');
        break;
      case 'canceled':
        this.stopPolling();
        this.phase = 'form';
        break;
      case 'importing':
        this.phase = 'importing';
        break;
      default:
        this.phase = 'validating';
    }
  }

  private resetProgress(): void {
    this.jobId = '';
    this.jobName = '';
    this.counters = emptyCounters();
    this.sample = [];
    this.imported = 0;
    this.skipped = 0;
  }
}
