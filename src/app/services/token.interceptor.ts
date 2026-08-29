import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Anexa o JWT (e, para o superadmin, o cliente em operação) em toda requisição
 * do HttpClient. Em 401 — token inválido, expirado ou revogado — desloga.
 */
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
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) this.auth.logout(); // token inválido/expirado → volta pro login
        return throwError(() => err);
      })
    );
  }
}
