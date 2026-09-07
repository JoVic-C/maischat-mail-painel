import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do painel mMail.
 *
 * A API é dublada no próprio navegador (ver e2e/fixtures/api-mock.ts): o quality gate
 * do projeto proíbe teste que dependa de Mongo, Redis, SMTP ou DNS reais. O contrato
 * do backend já é coberto pelos testes de integração do Jest (../backend); aqui o alvo
 * é o comportamento da interface — rotas, guards, validação, estados e fluxo de disparo.
 */
export default defineConfig({
  testDir: './e2e',
  /* Cada spec instala seu próprio dublê de API, então não há estado compartilhado. */
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /* Sobe o dev server sozinho; reaproveita um já aberto durante o desenvolvimento. */
  webServer: {
    command: 'npm run start -- --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
