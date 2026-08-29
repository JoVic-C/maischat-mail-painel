import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PlatformSettings } from '../../models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * Motor de envio da plataforma.
 *
 * Diferente das outras telas, o que se edita aqui não pertence a um cliente: vale para
 * todos. Por isso a tela é do superadmin e mostra o impacto de cada campo — quem mexe
 * precisa entender que está mexendo no envio de todo mundo.
 */
@Component({
  selector: 'app-platform',
  templateUrl: './platform.component.html',
  styleUrls: ['./platform.component.scss'],
  standalone: false,
})
export class PlatformComponent implements OnInit, OnDestroy {
  settings: PlatformSettings | null = null;
  loading = false;
  error: string | null = null;
  saving = false;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  private readonly FIELD_LABELS: Record<string, string> = {
    workerConcurrency: 'Envios simultâneos',
    ratePerMinute: 'Emails por minuto',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    workerConcurrency: 'Informe um número inteiro dentro da faixa permitida.',
    ratePerMinute: 'Informe um número inteiro dentro da faixa permitida.',
  };

  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      workerConcurrency: [5, [Validators.required, Validators.min(1)]],
      ratePerMinute: [600, [Validators.required, Validators.min(1)]],
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
    this.api.getPlatformSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
        this.loading = false;
        // As faixas vêm do backend — a tela não repete os números, para não divergirem.
        this.form.controls['workerConcurrency'].setValidators([
          Validators.required,
          Validators.min(settings.bounds.workerConcurrency.min),
          Validators.max(settings.bounds.workerConcurrency.max),
        ]);
        this.form.controls['ratePerMinute'].setValidators([
          Validators.required,
          Validators.min(settings.bounds.ratePerMinute.min),
          Validators.max(settings.bounds.ratePerMinute.max),
        ]);
        this.form.reset({
          workerConcurrency: settings.workerConcurrency,
          ratePerMinute: settings.ratePerMinute,
        });
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  /** Estimativa por hora, para o número por minuto ganhar significado prático. */
  get perHour(): number {
    return Number(this.form.value.ratePerMinute || 0) * 60;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    this.saving = true;
    this.formError = '';
    this.api
      .savePlatformSettings({
        workerConcurrency: Number(this.form.value.workerConcurrency),
        ratePerMinute: Number(this.form.value.ratePerMinute),
      })
      .subscribe({
        next: (res) => {
          this.saving = false;
          this.settings = res.settings;
          this.form.markAsPristine();
          this.toast.success(res.message);
        },
        error: (err) => {
          this.saving = false;
          this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
          ServerErrorsHandler.scrollToFirstInvalid();
        },
      });
  }
}
