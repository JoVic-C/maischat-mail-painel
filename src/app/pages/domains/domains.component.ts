import { Component, OnInit } from '@angular/core';
import { DnsCheck, SendingDomain, SendingDomainsOverview } from '../../models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-domains',
  templateUrl: './domains.component.html',
  styleUrls: ['./domains.component.scss'],
  standalone: false,
})
export class DomainsComponent implements OnInit {
  overview: SendingDomainsOverview | null = null;
  loading = false;
  error: string | null = null;
  readonly verifying = new Set<string>();

  readonly labels: Record<DnsCheck, string> = { spf: 'SPF', dkim: 'DKIM', dmarc: 'DMARC' };
  readonly purposes: Record<DnsCheck, string> = {
    spf: 'autoriza o servidor a enviar pelo domínio',
    dkim: 'assina as mensagens com a chave do servidor',
    dmarc: 'orienta os provedores sobre mensagens não autenticadas',
  };

  constructor(
    private api: ApiService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getSendingDomains().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  verify(domain: SendingDomain): void {
    if (this.verifying.has(domain.domain)) return;
    this.verifying.add(domain.domain);
    this.api.verifySendingDomain(domain.domain).subscribe({
      next: (res) => {
        this.verifying.delete(domain.domain);
        if (this.overview) {
          this.overview = {
            ...this.overview,
            domains: this.overview.domains.map((d) => (d.domain === res.domain.domain ? res.domain : d)),
          };
        }
        if (res.domain.status === 'verified') this.toast.success(res.message);
        else this.toast.warn(res.message);
      },
      error: (err) => {
        this.verifying.delete(domain.domain);
        this.toast.apiError(err);
      },
    });
  }

  copy(value: string): void {
    navigator.clipboard?.writeText(value).then(
      () => this.toast.success('Copiado.'),
      () => this.toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    );
  }

  trackByDomain(_: number, domain: SendingDomain): string {
    return domain.domain;
  }
}
