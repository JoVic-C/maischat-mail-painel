# mMail — Frontend

SPA da plataforma de email marketing mMail (Mais Chat Tecnologia).

**Stack:** Angular 20 (NgModule) + TypeScript strict + SCSS.
As convenções seguem o **Portal de Parceiros**: pasta por componente, `shared/` com
componentes reutilizáveis, `models/` fatiado e ReactiveForms com erro por campo.

## Estrutura

```
src/
├── index.html          # design tokens (:root) — identidade laranja/navy do mMail
├── styles.scss         # design system global (botões, tabelas, estados, form-em-modal, a11y)
├── environments/       # environment.ts (dev) · environment.prod.ts — importados por @env/*
└── app/
    ├── app.component.*      # shell: navbar + router-outlet + sobreposições globais
    ├── app.module.ts        # declarações + rotas (com guards por papel)
    ├── models/
    │   ├── interfaces.ts    # contratos da API
    │   ├── labels.ts        # rótulos/cores de status num lugar só
    │   └── index.ts         # barrel
    ├── guards/auth.guard.ts # authGuard · tenantGuard · adminGuard · superadminGuard
    ├── services/            # api.service · auth.service · token.interceptor
    ├── shared/              # um componente por pasta (.ts + .html + .scss)
    │   ├── button/ modal/ page-title/ empty-state/ status-badge/
    │   ├── data-state/ skeleton/ paginator/ navbar/
    │   ├── toast/           # toast.service + toast-container (fila com kinds)
    │   ├── confirm/ prompt/ # substituem confirm()/prompt() nativos
    │   ├── csv-import/      # importador com validação ao vivo (SSE)
    │   └── server-errors/   # ServerErrorsHandler + apiErrorMessage
    └── pages/               # uma pasta por tela (.ts + .html + .scss)
        ├── login/ dashboard/ lists/ contacts/ templates/ campaigns/ segments/
        └── smtp/ users/ tenants/ account/
```

## Rodando

```bash
npm install
npm start           # http://localhost:4200
npm run build:prod  # build de produção (AOT + budgets)
```

A API é lida de `environment.apiUrl` (dev: `http://localhost:3000/api`; prod: `/api`,
servido pelo nginx do próprio container — veja **Deploy**).

## Testes E2E (Playwright)

```bash
npm run e2e:install   # baixa o chromium (uma vez por máquina)
npm run test:e2e      # sobe o ng serve sozinho e roda a suíte
npm run test:e2e:ui   # modo interativo, para depurar um cenário
npm run test:e2e:report
```

A API é **dublada no navegador** por `e2e/fixtures/api-mock.ts` — o quality gate proíbe
teste que dependa de Mongo, Redis, SMTP ou DNS reais, e o contrato do backend já é
coberto pelos testes de integração do Jest (`../backend`). Aqui o alvo é a interface:
rotas, guards, validação, estados e o fluxo de disparo.

O `ApiMock` guarda estado em memória (criar campanha realmente aparece na listagem
seguinte), grava as chamadas recebidas para asserção (`lastCallTo('/start')?.body`) e
permite forçar falha por rota (`api.fail('login', 401, {...})`). Rota não dublada
responde **501** de propósito, para a suíte falhar alto em vez de mascarar a chamada.

Cobertura atual — `e2e/login.spec.ts`, `e2e/campaigns.spec.ts` e `e2e/templates.spec.ts`:

- **Login:** guard sem sessão, validação local, credencial inválida, erro por campo,
  destino por papel (`admin`/`user` → dashboard, `superadmin` → `/clientes`),
  `401` no meio da sessão derrubando a sessão, e `tenantGuard` barrando o superadmin
  sem cliente escolhido.
- **Campanhas:** estado vazio, progresso e taxas, erro de carga com retry, validação
  do formulário, criação com asserção do payload, erro de campo do servidor,
  disparo nos dois escopos (`onlyDelivered`), pausar/retomar, agendamento no passado,
  detalhe com envios individuais e filtro por situação, e usuário comum sem SMTP.
- **Templates:** regressão de XSS armazenado — payloads não executam ao abrir o template
  nem na prévia, marcação legítima de email sobrevive, e o aviso do condicional do
  Outlook aparece só quando é o caso (ver **Segurança**).

> Em `<select multiple>` com `formControlName`, o Angular sobrescreve o `value` de cada
> `<option>` por um id interno — nesses campos selecione pelo rótulo visível
> (`selectOption({ label })`), nunca pelo `_id`.

## Auditoria de dependências

```bash
npm run audit:ci     # só dependências de produção (o que é servido ao navegador)
npm run audit:full   # inclui a cadeia de build — informativo
```

O gate é `audit:ci` de propósito — só o que é servido ao navegador. O `npm audit` cru
inclui a cadeia de build (`@angular/cli`, `vite`, `rollup`, `postcss`, `webpack-dev-server`),
que não chega a usuário nenhum; bloquear merge nisso seria ruído.

**Estado atual: `audit:ci` verde — 0 vulnerabilidades em produção.**

Isso é consequência da migração **Angular 18 → 20**. A 18 saiu do LTS e não recebia
backport (`18.2.14` era a última 18.x, e os avisos cobriam até `19.2.25`), então havia 8
*high* no próprio framework — entre elas bypasses do sanitizador de HTML e vazamento de
token XSRF por URL protocolo-relativa no `HttpClient`. A menor versão limpa era a 20.

`npm run audit:full` ainda acusa 6 (3 *high*, 3 *moderate*), todas na cadeia de build.
Só saem com major do toolchain e não representam exposição em produção.

> Ao subir de major, rode `npm run test:e2e` — foi essa suíte que validou a migração 18 →
> 19 → 20 sem regressão.

## Segurança — HTML de template

O conteúdo do template é escrito por usuários do cliente e o backend o guarda **cru**
(é HTML de email; precisa sair intacto no disparo). Por isso, todo ponto que injeta esse
HTML no documento passa por `shared/html/sanitize-html.ts` (DOMPurify):

- `templates.component.ts` → `seedEditor()`, que faz `innerHTML` **direto no DOM** — este
  caminho não passa pelo sanitizador do Angular;
- `templates.component.ts` → `preview()`, cujo resultado vai para `[innerHTML]`. O Angular
  já sanitiza aí; o DOMPurify vem antes como defesa em profundidade — foi o que cobriu os
  bypasses do sanitizador que existiam na 18, e continua valendo para o próximo que surgir.

Sem isso, um usuário comum do cliente salvava `<img src=x onerror=...>` e o script rodava
na sessão de quem abrisse o template — inclusive um admin, cujo JWT está no `localStorage`.
`e2e/templates.spec.ts` é a regressão: falha se a sanitização sair.

> **Limitação conhecida:** comentário condicional do Outlook (`<!--[if mso]>…<![endif]-->`)
> não sobrevive à sanitização — o DOMPurify 3.x descarta comentário com marcação dentro
> como proteção contra mXSS, e desligar (`SAFE_FOR_XML: false`) reabriria o vetor. O editor
> avisa quando isso acontece; o modo **HTML avançado** preserva o original, porque só o
> editor visual reescreve o campo.

## Papéis e multi-tenant

O backend escopa todo dado por cliente (tenant). O frontend acompanha:

| Papel | Vê no painel | Rotas extras |
|---|---|---|
| `user` | dashboard, listas, contatos, templates, campanhas, segmentos | — |
| `admin` | tudo do `user` + SMTP e equipe | `/smtp`, `/equipe` |
| `superadmin` | tudo, dentro do cliente escolhido | `/clientes` |

- O `TokenInterceptor` anexa o JWT em toda requisição e, **para o superadmin**, o
  header `X-Tenant-Id` com o cliente em operação (escolhido em `/clientes`).
- O `tenantGuard` impede abrir telas do painel sem cliente em contexto — sem ele o
  superadmin receberia 400 em todas as chamadas.
- Em `401` (token inválido, expirado ou revogado pelo `tokenVersion`) o interceptor
  desloga e volta para o login.

## Padrões de tela

**Listagens** usam `<app-data-state>`, que resolve os três estados numa fonte só:

```html
<app-data-state [loading]="loading" [error]="error" [empty]="!items.length"
                emptyText="Nenhum item ainda." (retry)="load()">
  <table class="tbl">...</table>
</app-data-state>
```

carregando → skeleton animado (evita o "falso vazio"); erro → mensagem traduzida por
`apiErrorMessage()` + botão de tentar novamente; vazio → `<app-empty-state>`.
Listagens paginadas pelo backend usam `<app-paginator>`.

**Formulários** são ReactiveForms com `ServerErrorsHandler`:

```ts
this.serverErrors = new ServerErrorsHandler(this.form);       // no construtor
this.formError = this.serverErrors.apply(err, FIELD_LABELS);  // no erro da API
fieldError(f: string) { return this.serverErrors.messageFor(f, this.LOCAL_ERRORS); }
```

O 400 do backend (`{ errors: [{field, message}] }`) vira borda vermelha **no campo**
mais o banner `.error-msg`; `messageFor()` cai na mensagem local quando o erro é da
validação do Angular. `ServerErrorsHandler.scrollToFirstInvalid()` rola até o primeiro.

**Modais** usam `<app-modal>` com o slot `modal-actions`; **botões**, `<app-button>`
(variant/size/loading); **status**, `<app-status-badge kind="campaign" [value]="...">`,
que lê rótulo, cor e tooltip de `models/labels.ts`.

**Avisos** vão pelo `ToastService` (`success` / `error` / `warn` / `info` / `apiError`).
Diálogos nativos não são usados: `ConfirmService` confirma, `PromptService` pede texto.

> As classes de formulário dentro do modal (`.ff`, `.rw`, `.hint`, `.error-msg`) moram
> no `styles.scss` global de propósito: o conteúdo é projetado pelo componente pai, e o
> CSS encapsulado do `app-modal` não o alcançaria.

## Design system

Cores vêm de variáveis CSS em `index.html`: `--o` = laranja da marca (#FF5000) e
`--n` = navy (#16264F), com os mesmos nomes de token do Portal de Parceiros. Trocar a
paleta é editar o `:root`.

A marca fica em `shared/logo/` (`<app-logo variant="full|mark">`) e em `public/favicon.svg`.
O símbolo usa `currentColor`, então herda a cor do contexto — `markColor="brand"` força o laranja.

## Deploy

`Dockerfile` multi-stage: compila em produção e serve os estáticos por nginx.
O `nginx.conf` faz o SPA fallback, cache imutável de assets e proxy de `/api` e
`/uploads` para o serviço `backend` (com buffering desligado na rota de SSE).

```bash
cd ../backend && docker compose up -d --build   # sobe mongo, redis, backend e frontend
# painel em http://localhost:8080
```

## Ainda fora (Tier 1 do Quality Gate)

Não incluídos: Biome, Sentry e lazy loading por rota — o Portal de Parceiros já tem os
dois primeiros e serve de referência para trazê-los.

Playwright já está no lugar (veja **Testes E2E**), mas ainda sem testes das telas de
contatos, listas, templates, segmentos, SMTP, equipe e clientes — e sem execução em CI.
