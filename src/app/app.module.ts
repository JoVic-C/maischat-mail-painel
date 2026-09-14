import { registerLocaleData } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';

import { ButtonComponent } from './shared/button/button.component';
import { RowMenuComponent } from './shared/row-menu/row-menu.component';
import { ConfirmComponent } from './shared/confirm/confirm.component';
import { CsvImportComponent } from './shared/csv-import/csv-import.component';
import { DataStateComponent } from './shared/data-state/data-state.component';
import { EmptyStateComponent } from './shared/empty-state/empty-state.component';
import { LogoComponent } from './shared/logo/logo.component';
import { ModalComponent } from './shared/modal/modal.component';
import { MultiSelectComponent } from './shared/multi-select/multi-select.component';
import { NavbarComponent } from './shared/navbar/navbar.component';
import { PageTitleComponent } from './shared/page-title/page-title.component';
import { PaginatorComponent } from './shared/paginator/paginator.component';
import { PromptComponent } from './shared/prompt/prompt.component';
import { SkeletonComponent } from './shared/skeleton/skeleton.component';
import { StatusBadgeComponent } from './shared/status-badge/status-badge.component';
import { ToastContainerComponent } from './shared/toast/toast-container.component';

import { adminGuard, authGuard, superadminGuard, tenantGuard } from './guards/auth.guard';
import { TokenInterceptor } from './services/token.interceptor';

import { AccountComponent } from './pages/account/account.component';
import { CampaignsComponent } from './pages/campaigns/campaigns.component';
import { ContactsComponent } from './pages/contacts/contacts.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { ListsComponent } from './pages/lists/lists.component';
import { InviteComponent } from './pages/invite/invite.component';
import { LoginComponent } from './pages/login/login.component';
import { OperacaoComponent } from './pages/operacao/operacao.component';
import { PlatformComponent } from './pages/platform/platform.component';
import { SegmentsComponent } from './pages/segments/segments.component';
import { SmtpComponent } from './pages/smtp/smtp.component';
import { DomainsComponent } from './pages/domains/domains.component';
import { TemplatesComponent } from './pages/templates/templates.component';
import { TenantsComponent } from './pages/tenants/tenants.component';
import { UsersComponent } from './pages/users/users.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  // Público: quem abre o link do convite ainda não tem sessão.
  { path: 'definir-senha', component: InviteComponent, data: { mode: 'invite' } },
  { path: 'redefinir-senha', component: InviteComponent, data: { mode: 'reset' } },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

  { path: 'dashboard', component: DashboardComponent, canActivate: [tenantGuard] },
  { path: 'lists', component: ListsComponent, canActivate: [tenantGuard] },
  { path: 'contacts', component: ContactsComponent, canActivate: [tenantGuard] },
  { path: 'templates', component: TemplatesComponent, canActivate: [tenantGuard] },
  { path: 'campaigns', component: CampaignsComponent, canActivate: [tenantGuard] },
  { path: 'segments', component: SegmentsComponent, canActivate: [tenantGuard] },

  { path: 'smtp', component: SmtpComponent, canActivate: [adminGuard] },
  { path: 'dominios', component: DomainsComponent, canActivate: [adminGuard] },
  { path: 'equipe', component: UsersComponent, canActivate: [adminGuard] },

  { path: 'clientes', component: TenantsComponent, canActivate: [superadminGuard] },
  { path: 'operacao', component: OperacaoComponent, canActivate: [superadminGuard] },
  { path: 'plataforma', component: PlatformComponent, canActivate: [superadminGuard] },
  { path: 'conta', component: AccountComponent, canActivate: [authGuard] },

  { path: '**', redirectTo: 'dashboard' },
];

// Sem isto os pipes number/date formatam em en-US ("10,000" em vez de "10.000").
registerLocaleData(localePt);

@NgModule({
  declarations: [
    AppComponent,
    ButtonComponent,
    RowMenuComponent,
    ModalComponent,
    MultiSelectComponent,
    LogoComponent,
    NavbarComponent,
    PageTitleComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    DataStateComponent,
    SkeletonComponent,
    PaginatorComponent,
    ToastContainerComponent,
    ConfirmComponent,
    PromptComponent,
    CsvImportComponent,
    LoginComponent,
    InviteComponent,
    DashboardComponent,
    ListsComponent,
    ContactsComponent,
    TemplatesComponent,
    CampaignsComponent,
    SegmentsComponent,
    SmtpComponent,
    DomainsComponent,
    UsersComponent,
    TenantsComponent,
    PlatformComponent,
    OperacaoComponent,
    AccountComponent,
  ],
  imports: [BrowserModule, HttpClientModule, FormsModule, ReactiveFormsModule, RouterModule.forRoot(routes)],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
