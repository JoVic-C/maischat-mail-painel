import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../shared/toast/toast.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn) return true;
  auth.redirectToLogin();
  return false;
};

/** O backend escopa toda query por tenant: sem cliente escolhido, a API responderia 400. */
export const tenantGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isLoggedIn) {
    auth.redirectToLogin();
    return false;
  }
  if (auth.hasTenantContext) return true;

  toast.warn('Escolha o cliente em que você quer operar.');
  router.navigate(['/clientes']);
  return false;
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isLoggedIn) {
    auth.redirectToLogin();
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

export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isLoggedIn) {
    auth.redirectToLogin();
    return false;
  }
  if (!auth.isSuperadmin) {
    toast.warn('Acesso restrito à administração da plataforma.');
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
