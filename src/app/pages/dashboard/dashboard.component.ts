import { Component, OnInit } from '@angular/core';
import { Agrupamento, DashboardStats, PontoEnvio, RelatorioEnvios } from '../../models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage } from '../../shared/server-errors/server-errors';

/**
 * Atalhos de período.
 *
 * Cada um já traz o agrupamento que faz sentido para a janela: um ano por dia daria
 * 365 barras ilegíveis, e um dia por mês daria uma barra só.
 */
interface Preset {
  id: string;
  rotulo: string;
  dias: number;
  agrupamento: Agrupamento;
}

const PRESETS: Preset[] = [
  { id: 'hoje', rotulo: 'Hoje', dias: 0, agrupamento: 'day' },
  { id: '7d', rotulo: '7 dias', dias: 6, agrupamento: 'day' },
  { id: '30d', rotulo: '30 dias', dias: 29, agrupamento: 'day' },
  { id: '90d', rotulo: '3 meses', dias: 89, agrupamento: 'week' },
  { id: '12m', rotulo: '12 meses', dias: 364, agrupamento: 'month' },
];

const FUSO = 'America/Sao_Paulo';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Ano/mês/dia do instante, lidos no fuso de Brasília — que é onde o backend cortou os baldes. */
const partesBrasilia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function emBrasilia(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = partesBrasilia.format(new Date(iso)).split('-').map(Number);
  return { ano, mes, dia };
}

/** Instante de início de um balde: meia-noite em Brasília, no mesmo formato que o backend devolve. */
function inicioBrasilia(ano: number, mes: number, dia: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${ano}-${pad(mes)}-${pad(dia)}T00:00:00-03:00`).toISOString();
}

function proximoBalde(iso: string, agrupamento: Agrupamento): string {
  const { ano, mes, dia } = emBrasilia(iso);
  if (agrupamento === 'month') {
    return mes === 12 ? inicioBrasilia(ano + 1, 1, 1) : inicioBrasilia(ano, mes + 1, 1);
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia + (agrupamento === 'week' ? 7 : 1)));
  return inicioBrasilia(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Reintroduz os baldes sem nenhum envio.
 *
 * O backend só devolve os períodos que têm registro. No gráfico isso mente: janeiro e
 * setembro sairiam como duas barras vizinhas, escondendo os sete meses parados entre
 * elas. Aqui a linha do tempo volta a ser contínua.
 */
function preencherVazios(serie: PontoEnvio[], agrupamento: Agrupamento): PontoEnvio[] {
  if (serie.length < 2) return serie;

  const porInicio = new Map(serie.map((p) => [p.inicio, p]));
  const fim = serie[serie.length - 1].inicio;
  const cheia: PontoEnvio[] = [];

  // O backend já recusa janelas com mais de 400 baldes; o teto aqui é só um freio de mão
  // para nunca girar sem fim caso a data volte malformada.
  let atual = serie[0].inicio;
  for (let i = 0; i < 500 && atual <= fim; i++) {
    cheia.push(
      porInicio.get(atual) ?? {
        inicio: atual,
        registros: 0,
        enviados: 0,
        abertos: 0,
        clicados: 0,
        falhas: 0,
        bounces: 0,
        descadastros: 0,
      }
    );
    atual = proximoBalde(atual, agrupamento);
  }
  return cheia;
}

/**
 * Topo da escala vertical: o próximo número redondo acima do maior valor (1, 2 ou 5
 * vezes uma potência de dez), para que as marcas do eixo sejam legíveis.
 */
function escalaRedonda(maior: number): number {
  const potencia = 10 ** Math.floor(Math.log10(maior));
  for (const passo of [1, 2, 5, 10]) {
    if (maior <= passo * potencia) return passo * potencia;
  }
  return maior;
}

/** Data local no formato que o <input type="date"> entende. */
function paraInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: false,
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;

  loadingStats = false;
  statsError: string | null = null;

  // ─── Relatório de envios ───
  relatorio: RelatorioEnvios | null = null;
  loadingEnvios = false;
  enviosError: string | null = null;

  readonly presets = PRESETS;
  presetAtivo = '30d';

  /** Período personalizado, no formato do input de data. */
  de = '';
  ate = '';
  agrupamento: Agrupamento = 'day';

  private maiorBarra = 1;

  /** Valores das linhas de grade, de baixo para cima. */
  marcasEixoY: number[] = [0, 0, 0];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadStats();
    this.aplicarPreset('30d');
  }

  loadStats(): void {
    this.loadingStats = true;
    this.statsError = null;
    this.api.dashboardStats().subscribe({
      next: (stats) => {
        this.stats = stats;
        this.loadingStats = false;
      },
      error: (err) => {
        this.loadingStats = false;
        this.statsError = apiErrorMessage(err);
      },
    });
  }

  /** Atalho de período: preenche as datas e recarrega. */
  aplicarPreset(id: string): void {
    const preset = this.presets.find((p) => p.id === id);
    if (!preset) return;

    const hoje = new Date();
    const inicio = new Date(hoje.getTime() - preset.dias * 86_400_000);

    this.presetAtivo = id;
    this.agrupamento = preset.agrupamento;
    this.de = paraInput(inicio);
    this.ate = paraInput(hoje);
    this.carregarEnvios();
  }

  /** Mudou data ou agrupamento na mão: sai do atalho e recarrega. */
  aplicarPeriodo(): void {
    this.presetAtivo = '';
    this.carregarEnvios();
  }

  carregarEnvios(): void {
    this.loadingEnvios = true;
    this.enviosError = null;

    // As datas do input são só o dia; o fim vai até o último instante, senão o próprio
    // dia de hoje entraria vazio no relatório.
    const de = this.de ? `${this.de}T00:00:00` : undefined;
    const ate = this.ate ? `${this.ate}T23:59:59` : undefined;

    this.api.dashboardSends(de, ate, this.agrupamento).subscribe({
      next: (relatorio) => {
        this.relatorio = { ...relatorio, serie: preencherVazios(relatorio.serie, relatorio.agrupamento) };
        this.loadingEnvios = false;
        // O topo da escala é arredondado para cima: uma grade marcada em 668 não
        // ajuda ninguém a ler o gráfico; marcada em 800, sim.
        this.maiorBarra = escalaRedonda(Math.max(1, ...relatorio.serie.map((p) => p.enviados)));
        this.marcasEixoY = [0, this.maiorBarra / 2, this.maiorBarra];
      },
      error: (err) => {
        this.loadingEnvios = false;
        this.relatorio = null;
        this.enviosError = apiErrorMessage(err);
      },
    });
  }

  /** Rótulo do ponto, conforme o agrupamento — o backend só devolve a data de início. */
  rotulo(ponto: PontoEnvio): string {
    const { ano, mes, dia } = emBrasilia(ponto.inicio);

    // O toLocaleDateString devolveria "ago. de 26" para o mês — verboso demais para um eixo.
    if (this.relatorio?.agrupamento === 'month') return `${MESES[mes - 1]}/${String(ano).slice(-2)}`;
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
  }

  /** Texto de apoio abaixo do gráfico, explicando o que a barra representa. */
  get descricaoAgrupamento(): string {
    const mapa: Record<Agrupamento, string> = { day: 'por dia', week: 'por semana', month: 'por mês' };
    return mapa[this.relatorio?.agrupamento ?? 'day'];
  }

  /**
   * Quais baldes ganham data no eixo X. Com 90 barras, uma data por barra vira
   * borrão: mostramos no máximo umas oito, sempre incluindo a última.
   */
  mostraRotulo(indice: number): boolean {
    const total = this.relatorio?.serie.length ?? 0;
    if (total <= 8) return true;
    const passo = Math.ceil(total / 8);
    // Conta a partir do fim para que o balde mais recente nunca fique sem rótulo.
    return (total - 1 - indice) % passo === 0;
  }

  alturaBarra(enviados: number): number {
    // Zero não desenha nada: um traço mínimo faria o mês parado parecer igual ao mês
    // de um envio só. Acima de zero, o mínimo garante que um envio ainda apareça.
    if (!enviados) return 0;
    return Math.max(3, (enviados / this.maiorBarra) * 100);
  }

  pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }
}
