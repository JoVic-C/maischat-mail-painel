import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../shared/toast/toast.service';

/** Bloqueia rotas do painel para quem não está logado. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn) return true;
  router.navigate(['/login']);
  return false;
};

/**
 * Rotas do painel exigem um cliente em contexto: o backend escopa toda query por
 * tenant. Admin/usuário já têm o seu; o superadmin precisa escolher em /clientes,
 * senão a API responderia 400 em todas as telas.
 */
export const tenantGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isLoggedIn) {
    router.navigate(['/login']);
    return false;
  }
  if (auth.hasTenantContext) return true;

  toast.warn('Escolha o cliente em que você quer operar.');
  router.navigate(['/clientes']);
  return false;
};

/** Telas de administração do cliente (SMTP, equipe, bounces). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isLoggedIn) {
    router.navigate(['/login']);
    return false;
  }
  if (!auth.isAdmin) {
    toast.warn('Acesso restrito a administradores.');
    router.navigate(['/dashboard']);
    return false;
  }
  if (!auth.hasTenantContext) {
    toast.warn('Escolha o cliente em que você quer operar.');
    router.navigate(['/clientes']);
    return false;
  }
  return true;
};

/** Administração da plataforma — só superadmin. */
export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isLoggedIn) {
    router.navigate(['/login']);
    return false;
  }
  if (!auth.isSuperadmin) {
    toast.warn('Acesso restrito à administração da plataforma.');
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
