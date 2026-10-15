// Maré — Playwright (Parte 5): cada teste roda nestes aparelhos (iPhones/iPad no WebKit, Androids no Chromium).
import { defineConfig, devices } from '@playwright/test';

const PHONES = ['iPhone SE', 'iPhone 8', 'iPhone 12', 'iPhone 14 Pro Max', 'Pixel 5', 'Galaxy S9+', 'Moto G4', 'iPad Mini'];

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block', // o SW serve tudo do cache; só o teste "offline" o libera
    trace: 'retain-on-failure',
  },
  projects: PHONES.map((name) => ({ name: name, use: { ...devices[name] } })),
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
