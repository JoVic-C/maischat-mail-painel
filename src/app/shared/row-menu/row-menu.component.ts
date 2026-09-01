import { Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from '@angular/core';

/**
 * Menu de ações secundárias de uma linha de tabela.
 *
 * Existe para resolver um problema concreto: quando toda ação da linha vira um botão
 * visível, cinco deles brigam pelo mesmo espaço, quebram em duas fileiras e a ação
 * destrutiva acaba sendo a mais chamativa da tela. Aqui a linha mostra só a ação
 * principal; o resto vive atrás do "⋯".
 *
 * O painel é `position: fixed` de propósito. A tabela fica dentro de um `.tbl-wrap`
 * com `overflow-x: auto`, e isso também recorta o que transborda na vertical — um
 * painel absoluto sumiria pela borda de baixo. Como fixed sai do fluxo de recorte, a
 * posição é calculada a partir do botão e o menu fecha ao rolar, em vez de flutuar
 * descolado do gatilho.
 *
 * Uso:
 *   <app-row-menu label="Ações de Fulano">
 *     <button class="menu-item" (click)="editar()">Renomear</button>
 *     <button class="menu-item danger" (click)="excluir()">excluir</button>
 *   </app-row-menu>
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

  open = false;
  /** Coordenadas do painel, em viewport (position: fixed). */
  top = 0;
  right = 0;

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;

  constructor(private host: ElementRef<HTMLElement>) {}

  /**
   * Fecha em qualquer rolagem, inclusive a de um container interno.
   *
   * Precisa ser em fase de CAPTURA: evento `scroll` de elemento não borbulha até a
   * window, e a tabela rola dentro do próprio `.tbl-wrap` — um listener comum na
   * window nunca saberia que ela se mexeu.
   */
  private readonly onAnyScroll = (): void => this.close();

  toggle(): void {
    if (this.open) {
      this.close();
      return;
    }
    const btn = this.trigger?.nativeElement.getBoundingClientRect();
    if (btn) {
      this.top = btn.bottom + 6;
      // Ancorado pela direita: o menu cresce para a esquerda e nunca vaza da tela.
      this.right = Math.max(8, window.innerWidth - btn.right);
    }
    this.open = true;
    document.addEventListener('scroll', this.onAnyScroll, true);
  }

  close(focusTrigger = false): void {
    if (!this.open) return;
    this.open = false;
    document.removeEventListener('scroll', this.onAnyScroll, true);
    if (focusTrigger) this.trigger?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.onAnyScroll, true);
  }

  /** Qualquer ação escolhida fecha o menu — o clique já foi tratado pelo próprio item. */
  onPanelClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.menu-item')) this.close(true);
  }

  /**
   * Fechar no clique fora, sem um fundo invisível cobrindo a tela.
   *
   * Um backdrop resolveria em uma linha, mas ele engole o clique seguinte: trocar do
   * menu de uma linha para o de outra passaria a custar dois cliques, e o próprio
   * gatilho deixaria de alternar. O touchstart acompanha porque no iOS um clique em
   * área não interativa nem sempre chega ao document.
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

  // Redimensionar move o gatilho e o painel fixo ficaria para trás. Fechar é mais
  // honesto (e mais barato) que reposicionar a cada quadro. A rolagem é tratada pelo
  // listener de captura acima.
  @HostListener('window:resize')
  onViewportChange(): void {
    this.close();
  }
}
