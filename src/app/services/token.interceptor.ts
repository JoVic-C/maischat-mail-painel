import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpHeaders,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const SESSION_TOKEN_HEADER = 'X-Session-Token';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const headers: Record<string, string> = {};

    const token = this.auth.token;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Só o superadmin escolhe o cliente; para os demais o backend usa o tenant do próprio usuário.
    const tenantId = this.auth.activeTenantId;
    if (tenantId && this.auth.isSuperadmin) headers['X-Tenant-Id'] = tenantId;

    const authReq = Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;

    return next.handle(authReq).pipe(
      tap((event) => {
        if (event instanceof HttpResponse) this.adoptRenewedToken(event.headers);
      }),
      catchError((err: HttpErrorResponse) => {
        // Sem token salvo, outra requisição já encerrou a sessão; deslogar de novo apagaria o aviso.
        if (err.status === 401 && this.auth.token) this.auth.logout('encerrada');
        else if (err.headers) this.adoptRenewedToken(err.headers);
        return throwError(() => err);
      })
    );
  }

  private adoptRenewedToken(headers: HttpHeaders): void {
    const renewed = headers.get(SESSION_TOKEN_HEADER);
    if (renewed) this.auth.renewToken(renewed);
  }
}
