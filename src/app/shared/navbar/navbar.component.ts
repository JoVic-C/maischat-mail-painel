import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/** Barra de navegação superior — identidade do mMail (roxo sobre navy). */
@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrls: ['./navbar.component.scss'],
    standalone: false
})
export class NavbarComponent {
  constructor(
    public auth: AuthService,
    private router: Router
  ) {}

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
