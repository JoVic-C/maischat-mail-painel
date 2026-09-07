import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';

/**
 * Palpite inicial, só para o primeiro quadro: abaixo disto a barra larga quase nunca
 * cabe, e começar por ela causaria um piscar antes da medição corrigir.
 */
const PALPITE_COMPACTO = 1080;

/** Folga exigida para voltar da barra compacta — evita oscilar na fronteira. */
const FOLGA = 40;

/**
 * Barra de navegação superior — identidade do mMail (roxo sobre navy).
 *
 * O agrupamento aqui não é enfeite. Com o superadmin operando dentro de um cliente
 * eram onze links de mesmo peso numa fileira só, e a partir de ~1440px os últimos
 * saíam da vista atrás de uma rolagem horizontal sem indicação — "motor de envio"
 * simplesmente não existia para quem não soubesse arrastar a barra.
 *
 * Agora a fileira mostra só o trabalho do dia a dia. O que é configuração do cliente
 * (smtp, equipe) e o que é administração da plataforma (clientes, operação, motor de
 * envio) vive atrás de um agrupamento cada, e quando nem isso cabe tudo vai para um
 * painel recolhido — nenhum caminho depende de rolar algo que não se vê.
 *
 * O ponto de virada é MEDIDO, não fixado num breakpoint: a largura necessária muda com
 * o papel do usuário e com o tamanho do nome do cliente no chip. Medido, o mesmo
 * layout cabia até 1300px com um nome curto e só até 1440px com um nome longo — um
 * número fixo estaria errado num dos dois casos.
 */
@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: false,
})
export class NavbarComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Painel recolhido (barra compacta). */
  menuAberto = false;

  compacto = window.innerWidth < PALPITE_COMPACTO;

  private url = '';
  private sub?: Subscription;
  private observador?: ResizeObserver;

  /** Largura de janela em que os links comprovadamente não couberam. */
  private limiteColapso = 0;

  @ViewChild('links') private set links(ref: ElementRef<HTMLElement> | undefined) {
    this.refLinks = ref;
    this.observar();
  }
  @ViewChild('barra') private set barra(ref: ElementRef<HTMLElement> | undefined) {
    this.refBarra = ref;
    this.observar();
  }
  /** O bloco do usuário muda de largura sozinho: trocar de cliente troca o chip. */
  @ViewChild('usuario') private set usuario(ref: ElementRef<HTMLElement> | undefined) {
    this.refUsuario = ref;
    this.observar();
  }

  private refLinks?: ElementRef<HTMLElement>;
  private refBarra?: ElementRef<HTMLElement>;
  private refUsuario?: ElementRef<HTMLElement>;

  /** Reassina os três blocos — eles são recriados a cada troca de modo da barra. */
  private observar(): void {
    this.observador?.disconnect();
    this.observador = new ResizeObserver(() => this.avaliarEspaco());
    for (const ref of [this.refLinks, this.refBarra, this.refUsuario]) {
      if (ref) this.observador.observe(ref.nativeElement);
    }
  }

  constructor(
    public auth: AuthService,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.url = this.router.url;
    this.sub = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.url = e.urlAfterRedirects;
      // Navegou: o painel recolhido cumpriu o papel e sai da frente sozinho.
      this.menuAberto = false;
      // A navegação pode ter mudado quais links existem (entrar/sair de um cliente).
      setTimeout(() => this.avaliarEspaco());
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.avaliarEspaco());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.observador?.disconnect();
  }

  /**
   * Decide entre a barra larga e a compacta olhando se a barra transborda.
   *
   * Os três blocos ficam no fluxo e nenhum encolhe abaixo do próprio conteúdo: quando
   * o conjunto não cabe, a barra transborda em vez de um bloco entrar por baixo do
   * outro. Ancorar o menu no centro por posicionamento absoluto centralizava também,
   * mas aí ele crescia POR CIMA dos vizinhos, e o mesmo layout que cabia em 1600px
   * passava a recolher a barra por falta de 5px de folga.
   *
   * Na barra compacta não há o que medir — os links não estão no DOM. Por isso
   * guardamos a largura em que eles não couberam: passando dela com folga, a barra
   * larga volta e se remede sozinha.
   */
  private avaliarEspaco(): void {
    const largura = window.innerWidth;

    if (this.compacto) {
      if (largura > this.limiteColapso + FOLGA) {
        this.compacto = false;
        this.cd.detectChanges();
        // Medir agora seria medir um elemento recém-inserido; o observador chama de volta.
      }
      return;
    }

    const barra = this.refBarra?.nativeElement;
    if (!barra || !this.refLinks) return;

    // Os três blocos não encolhem abaixo do próprio conteúdo, então "não coube" é
    // exatamente "a barra transbordou".
    if (barra.scrollWidth - barra.clientWidth > 1) {
      this.limiteColapso = largura;
      this.compacto = true;
      this.cd.detectChanges();
    }
  }

  @HostListener('window:resize')
  aoRedimensionar(): void {
    this.avaliarEspaco();
  }

  alternarMenu(): void {
    this.menuAberto = !this.menuAberto;
  }

  @HostListener('document:keydown.escape')
  fecharMenu(): void {
    this.menuAberto = false;
  }

  /**
   * A rota aberta está dentro deste grupo?
   *
   * Serve para marcar o gatilho de um menu recolhido: sem isso, entrar em "smtp"
   * apagaria qualquer indicação de onde o usuário está, já que o link ativo ficou
   * escondido dentro do painel.
   */
  emGrupo(rotas: string[]): boolean {
    return rotas.some((rota) => this.url === rota || this.url.startsWith(`${rota}/`) || this.url.startsWith(`${rota}?`));
  }

  /**
   * Sai do modo "operando em um cliente" e volta para a administração da plataforma.
   * Sem isso o superadmin ficava preso no último cliente que escolheu, sem caminho
   * de volta a não ser deslogar.
   */
  exitTenant(): void {
    this.auth.setActiveTenant(null);
    this.router.navigate(['/clientes']);
  }
}
