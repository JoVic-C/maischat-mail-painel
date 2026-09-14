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

/** Palpite só para o primeiro quadro, evita piscar antes da medição. */
const PALPITE_COMPACTO = 1080;

/** Folga exigida para voltar da barra compacta — evita oscilar na fronteira. */
const FOLGA = 40;

/**
 * O ponto de virada para a barra compacta é medido, não um breakpoint: a largura
 * necessária muda com o papel do usuário e o nome do cliente no chip.
 */
@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: false,
})
export class NavbarComponent implements OnInit, AfterViewInit, OnDestroy {
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

  /** Os três blocos são recriados a cada troca de modo da barra. */
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
   * Na barra compacta os links não estão no DOM; guarda-se a largura em que não
   * couberam e, passando dela com folga, a barra larga volta e se remede.
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

  /** Marca o gatilho do grupo, já que o link ativo fica escondido no painel. */
  emGrupo(rotas: string[]): boolean {
    return rotas.some((rota) => this.url === rota || this.url.startsWith(`${rota}/`) || this.url.startsWith(`${rota}?`));
  }

  /** Sai do modo "operando em um cliente" e volta para a administração da plataforma. */
  exitTenant(): void {
    this.auth.setActiveTenant(null);
    this.router.navigate(['/clientes']);
  }
}
