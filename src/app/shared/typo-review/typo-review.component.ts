import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { TypoDomain } from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../confirm/confirm.service';
import { apiErrorMessage } from '../server-errors/server-errors';
import { ToastService } from '../toast/toast.service';

interface ReviewRow extends TypoDomain {
  /** Domínio de destino, editável: a sugestão vem preenchida. */
  target: string;
  busy: 'fix' | 'keep' | null;
  /** Saindo da tabela: a linha some com transição antes de ser removida. */
  leaving: boolean;
}

/** Mesmo formato que o backend aceita no destino da correção. */
const DOMAIN_FORMAT = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LEAVE_MS = 220;

/**
 * Revisão dos domínios com possível erro de digitação (`docs/prd-erro-digitacao.md` no
 * backend). Corrigir troca o domínio de todos os contatos dele; manter aceita o domínio
 * para o cliente. Só o admin chega aqui; a autorização de verdade é da API.
 */
@Component({
  selector: 'app-typo-review',
  templateUrl: './typo-review.component.html',
  styleUrls: ['./typo-review.component.scss'],
  standalone: false,
})
export class TypoReviewComponent implements OnInit {
  /** Algum domínio foi corrigido ou mantido: a listagem de contatos mudou. */
  @Output() changed = new EventEmitter<void>();

  rows: ReviewRow[] = [];
  loading = false;
  error: string | null = null;

  constructor(
    private api: ApiService,
    private confirm: ConfirmService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get totalContacts(): number {
    return this.rows.reduce((sum, r) => sum + r.count, 0);
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getTypoDomains().subscribe({
      next: (domains) => {
        this.rows = domains.map((d) => ({ ...d, target: d.suggestion, busy: null, leaving: false }));
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  normalizedTarget(row: ReviewRow): string {
    return row.target.trim().toLowerCase().replace(/^@/, '').replace(/\.+$/, '');
  }

  targetError(row: ReviewRow): string | null {
    const target = this.normalizedTarget(row);
    if (!target) return 'Informe o domínio certo.';
    if (!DOMAIN_FORMAT.test(target)) return 'Domínio inválido.';
    if (target === row.domain) return 'É o mesmo domínio.';
    return null;
  }

  trackByDomain(_: number, row: ReviewRow): string {
    return row.domain;
  }

  async fix(row: ReviewRow): Promise<void> {
    if (row.busy || this.targetError(row)) return;
    const target = this.normalizedTarget(row);
    const ok = await this.confirm.ask({
      title: 'Corrigir domínio',
      message:
        `Trocar @${row.domain} por @${target} em ${row.count} contato(s)?\n\n` +
        'O endereço corrigido volta a receber campanhas e pode ser verificado de novo.',
      confirmLabel: `Corrigir ${row.count}`,
    });
    if (!ok) return;

    row.busy = 'fix';
    this.api.fixTypoDomain(row.domain, target).subscribe({
      next: (res) => {
        row.busy = null;
        if (res.conflicts) {
          this.toast.warn(
            `${res.fixed} contato(s) corrigido(s). ${res.conflicts} já existiam com o email corrigido e ficaram como estavam.`
          );
          row.count = res.conflicts;
        } else {
          this.toast.success(`${res.fixed} contato(s) corrigido(s) para @${target}.`);
          this.removeRow(row);
        }
        this.changed.emit();
      },
      error: (err) => {
        row.busy = null;
        this.toast.apiError(err);
      },
    });
  }

  async keep(row: ReviewRow): Promise<void> {
    if (row.busy) return;
    const ok = await this.confirm.ask({
      title: 'Manter domínio',
      message:
        `@${row.domain} é um domínio real e está certo?\n\n` +
        `Os ${row.count} contato(s) dele voltam a receber campanhas, e o domínio deixa de ser apontado como erro.`,
      confirmLabel: 'Manter',
    });
    if (!ok) return;

    row.busy = 'keep';
    this.api.acceptTypoDomain(row.domain).subscribe({
      next: () => {
        row.busy = null;
        this.toast.success(`@${row.domain} mantido.`);
        this.removeRow(row);
        this.changed.emit();
      },
      error: (err) => {
        row.busy = null;
        this.toast.apiError(err);
      },
    });
  }

  private removeRow(row: ReviewRow): void {
    row.leaving = true;
    setTimeout(() => {
      this.rows = this.rows.filter((r) => r !== row);
    }, LEAVE_MS);
  }
}
