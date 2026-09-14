import { Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from '@angular/core';

const GAP = 6;

/**
 * Painel `position: fixed` porque o `overflow-x: auto` do `.tbl-wrap` também recorta
 * na vertical; a posição é recalculada a partir do gatilho a cada rolagem.
 */

@Component({
  selector: 'app-row-menu',
  templateUrl: './row-menu.component.html',
  styleUrls: ['./row-menu.component.scss'],
  standalone: false,
})
export class RowMenuComponent implements OnDestroy {
  /** Rótulo acessível do gatilho — diga de QUEM são as ações, não só "ações". */
  @Input() label = 'Mais ações';

  /** Vazio mantém o "⋯"; preenchido vira item com seta (agrupamentos da navbar). */
  @Input() triggerText = '';

  /** Só o gatilho muda de tom; o painel continua claro nos dois casos. */
  @Input() tone: 'row' | 'nav' = 'row';

  /** A rota aberta está dentro deste menu. */
  @Input() active = false;

  open = false;
  /** Coordenadas de viewport; uma das âncoras verticais fica nula (abre para cima ou para baixo). */
  top: number | null = null;
  bottom: number | null = null;
  right = 0;
  /** Falso enquanto o painel está no DOM mas ainda não foi medido — fica invisível. */
  positioned = false;

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;

  constructor(private host: ElementRef<HTMLElement>) {}

  /** Evita recalcular mais de uma vez por quadro. */
  private frame = 0;

  /**
   * Captura: `scroll` de elemento não borbulha até a window. Reposiciona em vez de
   * fechar porque o foco ao abrir já rola o container em telas estreitas.
   */
  private readonly onAnyScroll = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.place();
    });
  };

  toggle(): void {
    if (this.open) {
      this.close();
      return;
    }
    this.positioned = false;
    this.open = true;
    document.addEventListener('scroll', this.onAnyScroll, true);

    // O conteúdo é projetado dentro do *ngIf: abre invisível, mede e só então mostra.
    setTimeout(() => this.place(), 0);
  }

  /** Fecha só quando o gatilho sai da tela. */
  private place(): void {
    if (!this.open) return;
    const btn = this.trigger?.nativeElement.getBoundingClientRect();
    if (!btn) return;

    if (btn.bottom < 0 || btn.top > window.innerHeight) {
      this.close();
      return;
    }

    // Ancorado pela direita: o menu cresce para a esquerda e nunca vaza da tela.
    this.right = Math.max(8, window.innerWidth - btn.right);

    const painel = this.host.nativeElement.querySelector('.rm-panel') as HTMLElement | null;
    const altura = painel?.offsetHeight ?? 0;
    const espacoAbaixo = window.innerHeight - btn.bottom;

    if (altura && espacoAbaixo < altura + GAP && btn.top > espacoAbaixo) {
      // Sem espaço embaixo: abre para cima (últimas linhas de uma tabela longa).
      this.top = null;
      this.bottom = window.innerHeight - btn.top + GAP;
    } else {
      this.top = btn.bottom + GAP;
      this.bottom = null;
    }
    this.positioned = true;
  }

  close(focusTrigger = false): void {
    if (!this.open) return;
    this.open = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    document.removeEventListener('scroll', this.onAnyScroll, true);
    if (focusTrigger) this.trigger?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    document.removeEventListener('scroll', this.onAnyScroll, true);
  }

  onPanelClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.menu-item')) this.close(true);
  }

  /**
   * Sem backdrop, que engoliria o clique seguinte. O touchstart cobre o iOS, onde
   * clique em área não interativa nem sempre chega ao document.
   */
  @HostListener('document:click', ['$event'])
  @HostListener('document:touchstart', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) return;
    const alvo = event.target as Node;
    // O painel é filho do host no DOM, então basta perguntar ao host.
    if (!this.host.nativeElement.contains(alvo)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close(true);
  }

  // Redimensionar fecha em vez de reposicionar a cada quadro.
  @HostListener('window:resize')
  onViewportChange(): void {
    this.close();
  }
}
