import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';
import { ApiMessage, AuthUser, LoginResult } from '../models';

const TOKEN_KEY = 'mmail_token';
const USER_KEY = 'mmail_user';
const TENANT_KEY = 'mmail_tenant';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = environment.apiUrl;
  /** Cache em memória: o navbar lê o usuário a cada ciclo de detecção de mudanças. */
  private user: AuthUser | null = null;

  constructor(private http: HttpClient, private router: Router) {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        this.user = JSON.parse(raw) as AuthUser;
      } catch {
        localStorage.removeItem(USER_KEY); // conteúdo corrompido — trata como deslogado
      }
    }
  }

  login(email: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResult>(`${this.api}/auth/login`, { email, password }).pipe(
      tap((res) => {
        this.persist(res.token, res.user);
        // Via setActiveTenant para id e nome nunca saírem de sincronia; o superadmin escolhe depois.
        this.setActiveTenant(res.user.role !== 'superadmin' ? res.user.tenantId : null);
      })
    );
  }

  logout(): void {
    this.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.setActiveTenant(null);
    this.router.navigate(['/login']);
  }

  /** Derruba as sessões deste usuário em todos os dispositivos (inclusive esta). */
  logoutAll(): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/auth/logout-all`, {});
  }

  /** O backend devolve um token novo — o antigo é revogado. */
  changePassword(currentPassword: string, newPassword: string): Observable<ApiMessage & { token: string }> {
    return this.http
      .post<ApiMessage & { token: string }>(`${this.api}/auth/change-password`, { currentPassword, newPassword })
      .pipe(tap((res) => localStorage.setItem(TOKEN_KEY, res.token)));
  }

  refreshUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.api}/auth/me`).pipe(
      tap((user) => {
        this.user = user;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      })
    );
  }

  /** Sessão já emitida pelo backend (aceite de convite); mesma lógica de tenant do login. */
  adoptSession(token: string, user: AuthUser): void {
    this.persist(token, user);
    this.setActiveTenant(user.role !== 'superadmin' ? user.tenantId : null);
  }

  private persist(token: string, user: AuthUser): void {
    this.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  get currentUser(): AuthUser | null {
    return this.user;
  }

  get isSuperadmin(): boolean {
    return this.user?.role === 'superadmin';
  }

  /** Superadmin conta como admin: ele administra o cliente em que está operando. */
  get isAdmin(): boolean {
    return this.user?.role === 'admin' || this.user?.role === 'superadmin';
  }

  /** Superadmin: o cliente escolhido na tela de Clientes (vai no header X-Tenant-Id). */
  get activeTenantId(): string | null {
    return localStorage.getItem(TENANT_KEY);
  }

  /** Id e nome andam sempre juntos. */
  setActiveTenant(tenantId: string | null, name = ''): void {
    if (tenantId) {
      localStorage.setItem(TENANT_KEY, tenantId);
      localStorage.setItem(`${TENANT_KEY}_name`, name);
    } else {
      localStorage.removeItem(TENANT_KEY);
      localStorage.removeItem(`${TENANT_KEY}_name`);
    }
  }

  get activeTenantName(): string {
    // Nome sem id é resquício de estado antigo.
    if (!this.activeTenantId) return '';
    return localStorage.getItem(`${TENANT_KEY}_name`) || '';
  }

  /** O painel só funciona com um cliente em contexto — o superadmin precisa escolher um. */
  get hasTenantContext(): boolean {
    return !this.isSuperadmin || !!this.activeTenantId;
  }
}
