// Maré — testes de interface (Parte 5). Rodar: npm run test:e2e
// Cada teste roda em todos os aparelhos do playwright.config.js. Qualquer erro de JavaScript na página reprova.
import { test, expect } from '@playwright/test';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
});
test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

// Estado pronto, pulando o onboarding. É montado dentro do navegador para usar o fuso do aparelho emulado.
async function seed(page, o) {
  await page.addInitScript((opt) => {
    if (sessionStorage.getItem('mare:seeded')) return; // só na 1ª carga: recarregar mantém o que o teste fez
    sessionStorage.setItem('mare:seeded', '1');
    const p2 = (n) => (n < 10 ? '0' : '') + n, now = new Date(), days = {};
    const k = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    if (opt.todayMl) days[k] = { goal: 2800, entries: [{ id: 'seed', t: now.getTime() - 60000, ml: opt.todayMl, d: 'water' }] };
    if (opt.entries) days[k] = { goal: 2800, entries: opt.entries.map((e, i) => ({ id: 'seed' + i, t: now.getTime() - (opt.entries.length - i) * 60000, ml: e[0], d: e[1] })) };
    localStorage.setItem('mare:v1', JSON.stringify({
      v: 1, onboarded: true, createdAt: now.getTime() - 10 * 864e5,
      profile: { name: 'Ana', weight: 70, activity: 'moderate', wake: '07:00', sleep: '23:00', unit: 'ml', theme: 'light' },
      goal: { mode: 'manual', manual: 2800, climate: false, bonus: 0, temp: null, day: '' },
      cups: [150, 250, 350, 500], last: opt.last || 'water', reminders: { enabled: false, interval: 90, smart: true, nextAt: 0 },
      days: days, achievements: {}, missions: {}, ui: { tip_install: 1, tip_climate: 1 },
    }));
  }, o || {});
}
const tab = (page, name) => page.locator('#tabbar').getByRole('button', { name: name, exact: true });
const cup = (page, label) => page.getByRole('button', { name: 'Adicionar ' + label, exact: true });

test('onboarding completo, primeiro registro e desfazer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await page.locator('#obName').fill('Ana');
  await page.locator('#obWeight').fill('72,5');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('radio', { name: /Ativo/ }).click();
  await page.getByRole('button', { name: 'Voltar' }).click(); // volta e confere que o peso ficou guardado
  await expect(page.locator('#obWeight')).toHaveValue('72,5');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Ativo/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); // atividade
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); // horários
  await expect(page.locator('#obGoal')).toHaveText('3,3 L'); // 72,5 × 35 + 700, arredondado: 3.250 ml
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click(); // depende do suporte a notificação
  await expect(page.locator('.h1')).toContainText('Ana');
  await expect(page.locator('#tabbar')).toBeVisible();
  await cup(page, '250 ml').click();
  await expect(page.locator('#toast')).toContainText('+250 ml de água');
  await expect(page.locator('#drop svg')).toHaveAttribute('aria-label', /^250 ml de 3\.250 ml/);
  await expect(page.locator('#tLog')).toContainText('1 registro');
  await page.locator('#toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('#tLog')).toContainText('Nada por aqui ainda');
});

test('histórico: registro retroativo, edição e exclusão', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await tab(page, 'Histórico').click();
  await page.getByRole('button', { name: /^Ontem:/ }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.locator('#sheetTitle')).toHaveText('Ontem');
  await sheet.getByRole('button', { name: '+ Adicionar registro' }).click();
  await page.locator('#eMl').fill('500');
  await page.locator('#eTime').fill('10:00');
  await sheet.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(sheet.locator('.day-sum b')).toHaveText('500 ml');
  await sheet.locator('.log-item').first().click();
  await page.locator('#eMl').fill('300');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet.locator('.day-sum b')).toHaveText('300 ml');
  await sheet.locator('.log-item').first().click();
  await sheet.getByRole('button', { name: 'Excluir' }).click();
  await expect(sheet).toContainText('Nenhum registro neste dia.');
  await expect(page.locator('#toast')).toContainText('Registro excluído');
});

test('bater a meta mostra a comemoração', async ({ page }) => {
  await seed(page, { todayMl: 2550 });
  await page.goto('/');
  await cup(page, '250 ml').click();
  await expect(page.locator('.medal-pop')).toContainText('Você bateu a meta!');
  await expect(page.locator('#tMeta .pace')).toContainText('Meta batida');
});

test('ajustes: onças e tema escuro', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await tab(page, 'Ajustes').click();
  await page.getByRole('radio', { name: 'Onças (oz)' }).click();
  await page.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await tab(page, 'Hoje').click();
  await expect(cup(page, '8 oz')).toBeVisible();
});

test('voltar do Android fecha o painel e depois volta para Hoje', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.evaluate(() => { history.back(); });
  await expect(page.locator('#sheet')).toBeHidden();
  await tab(page, 'Jornada').click();
  await expect(page.getByRole('heading', { name: 'Jornada' })).toBeVisible();
  await page.evaluate(() => { history.back(); });
  await expect(tab(page, 'Hoje')).toHaveAttribute('aria-current', 'page');
});

test('atalho do ícone ?add=250 registra e limpa o endereço', async ({ page }) => {
  await seed(page);
  await page.goto('/?add=250');
  await expect(page.locator('#tLog')).toContainText('1 registro');
  await expect(page).toHaveURL(/\/$/);
});

test('layout: sem rolagem lateral, alvos de toque confortáveis e screenshots', async ({ page }, info) => {
  await seed(page, { todayMl: 1200 });
  await page.goto('/');
  for (const name of ['Hoje', 'Histórico', 'Jornada', 'Ajustes']) {
    await tab(page, name).click();
    await page.waitForTimeout(700); // animações de entrada
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, 'rolagem lateral em ' + name).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + name + '.png', fullPage: true });
  }
  expect(await page.$$eval('#tabbar .tab', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0);
  await tab(page, 'Hoje').click();
  expect(await page.$$eval('.cup', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0);
  // segunda gota: dentro da tela, à direita da parte mais larga da gota principal e com área de toque confortável
  const g = await page.evaluate(() => {
    const b = document.querySelector('#drop2btn').getBoundingClientRect(), m = document.querySelector('#drop').getBoundingClientRect();
    return { left: b.left, right: b.right, w: b.width, h: b.height, iw: window.innerWidth, edge: m.left + m.width / 2 + m.width * 0.41 };
  });
  expect(g.right, 'segunda gota passa da borda da tela').toBeLessThanOrEqual(g.iw - 2);
  expect(g.left, 'segunda gota encosta na gota principal').toBeGreaterThanOrEqual(g.edge + 2);
  expect(g.w).toBeGreaterThanOrEqual(44);
  expect(g.h).toBeGreaterThanOrEqual(44);
});

// Segunda gota: café, chá, suco etc. ficam numa contagem à parte e não entram na meta de água
const mainLabel = (page) => page.locator('#drop svg');
const other = (page) => page.locator('#drop2 .t-num').first();

test('outros líquidos: registro à parte, sem mexer na meta de água', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^0 ml de 2\.800 ml/);
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.locator('#sheetTitle')).toHaveText('Outros líquidos');
  await expect(sheet.getByRole('radio')).toHaveCount(6); // coco, chá, café, suco, leite, isotônico
  await sheet.getByRole('radio', { name: /Chá/ }).click();
  await expect(sheet.getByRole('radio', { name: /Chá/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Adicionar 150 ml de chá' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('+150 ml de chá');
  await expect(page.locator('#toast')).toContainText('à parte');
  await expect(other(page)).toHaveText('150', { timeout: 6000 });
  await expect(page.getByRole('button', { name: /^Outros líquidos: 150 ml hoje/ })).toBeVisible();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^0 ml de 2\.800 ml/); // a água não mexeu
  await expect(page.locator('#tLog')).toContainText('Chá');
  await expect(page.locator('#tLog')).toContainText('outros líquidos');
  await page.locator('#toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('#tLog')).toContainText('Nada por aqui ainda');
  await expect(other(page)).toHaveText('0', { timeout: 6000 });
});

test('água com gás conta na meta, como a água comum', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('radio', { name: /Com gás/ }).click();
  await expect(page.getByRole('radio', { name: /Com gás/ })).toHaveAttribute('aria-checked', 'true');
  await cup(page, '250 ml').click();
  await expect(page.locator('#toast')).toContainText('+250 ml de água com gás');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^250 ml de 2\.800 ml/);
  await expect(other(page)).toHaveText('0');
});

test('registro com data e hora: o editor separa água de outros líquidos', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.getByRole('button', { name: /Água$/ })).toBeVisible();
  await expect(sheet.locator('#eNote')).toHaveText('');
  await sheet.getByRole('button', { name: /Café/ }).click();
  await expect(sheet.locator('#eNote')).toContainText('não entram na meta de água');
  await page.locator('#eMl').fill('120');
  await sheet.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.locator('#tLog')).toContainText('Café');
  await expect(other(page)).toHaveText('120', { timeout: 6000 });
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^0 ml de 2\.800 ml/);
});

test('ajustes: esconder e mostrar a segunda gota', async ({ page }) => {
  await seed(page, { entries: [[500, 'water'], [200, 'coffee']] });
  await page.goto('/');
  await expect(page.locator('#drop2')).toBeVisible();
  await expect(page.locator('#tLog')).toContainText('2 registros');
  await tab(page, 'Ajustes').click();
  const sw = page.getByRole('switch', { name: 'Registrar outros líquidos' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await tab(page, 'Hoje').click();
  await expect(page.locator('#drop2')).toHaveCount(0);
  await expect(page.locator('#tLog')).toContainText('1 registro'); // o café fica guardado, mas escondido
  await expect(page.locator('#tLog')).not.toContainText('Café');
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  await expect(page.locator('#sheetBody').getByRole('button', { name: /Café/ })).toHaveCount(0);
  await page.locator('#sheetBody').getByRole('button', { name: 'Cancelar' }).click();
  await tab(page, 'Ajustes').click();
  await page.getByRole('switch', { name: 'Registrar outros líquidos' }).click();
  await tab(page, 'Hoje').click();
  await expect(page.locator('#drop2')).toBeVisible();
  await expect(page.locator('#tLog')).toContainText('2 registros');
  await expect(other(page)).toHaveText('200', { timeout: 6000 });
});

test('dados antigos: refrigerante e álcool saem; café vira "outros líquidos"', async ({ page }) => {
  await seed(page, { entries: [[500, 'water'], [350, 'soda'], [300, 'alcohol'], [100, 'coffee']], last: 'coffee' });
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^500 ml de 2\.800 ml/); // nem o refri nem o álcool viram "água"
  await expect(other(page)).toHaveText('100', { timeout: 6000 });
  await expect(page.locator('#tLog')).toContainText('2 registros');
  await expect(page.locator('#tLog')).not.toContainText('Refrigerante');
  await expect(page.locator('#tLog')).not.toContainText('alcoólica');
  await expect(page.getByRole('radio', { name: /^💧/ })).toHaveAttribute('aria-checked', 'true'); // copos rápidos voltam para a água
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  await expect(page.locator('#sheetBody').getByRole('radio', { name: /Café/ })).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => { history.back(); });
  await expect(page.locator('#sheet')).toBeHidden();
  // o app só regrava o aparelho quando algo muda: ao registrar um copo, o que ficou salvo já vem limpo
  await cup(page, '250 ml').click();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^750 ml de 2\.800 ml/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
  expect(saved.last).toBe('water');
  expect(saved.lastO).toBe('coffee');
  const tipos = [];
  Object.keys(saved.days).forEach((k) => { saved.days[k].entries.forEach((e) => { tipos.push(e.d); }); });
  expect(tipos.sort()).toEqual(['coffee', 'water', 'water']);
});

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });
  test('registra sem a animação da gota caindo', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await cup(page, '250 ml').click();
    await expect(page.locator('#tLog')).toContainText('1 registro');
    await expect(page.locator('.fx-drop')).toHaveCount(0);
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('abre sem internet depois da primeira visita', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service Worker testado no Chromium');
    await seed(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#drop')).toBeVisible();
    await context.setOffline(false);
  });

  // No github.io vários apps dividem a mesma origem e alguns Service Workers apagam todos os caches que não são deles
  test('refaz o cache se outro app da mesma origem o apagar', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service Worker testado no Chromium');
    await seed(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
    await page.reload(); // online: abre pela rede e refaz o cache em segundo plano
    await expect(page.locator('#drop')).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.match(new URL('./', location.href).href).then(Boolean))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#drop')).toBeVisible();
    await context.setOffline(false);
  });
});

// A nuvem (login anônimo + documento no Firestore) só deve ligar depois do onboarding: quem apenas abre a tela de
// boas-vindas (ou um robô) não cria conta nem documento. Os módulos do Firebase são trocados por stubs.
async function stubCloud(page) {
  await page.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: 'export const FIREBASE_ENABLED = true; export const firebaseConfig = {}; export const VAPID_KEY = ""; export const USE_EMULATORS = false;' }));
  await page.route('**/js/firebase.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: 'export async function initCloud() { window.__cloudInit = (window.__cloudInit || 0) + 1; return { push: false, syncDays() {}, syncMeta() {}, enablePush: async () => { window.__pushEnabled = (window.__pushEnabled || 0) + 1; return true; }, wipe: async () => {} }; }' }));
}
const cloudInits = (page) => page.evaluate(() => window.__cloudInit || 0);

test('a nuvem só liga depois do onboarding', async ({ page }) => {
  await stubCloud(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await cloudInits(page)).toBe(0);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click(); // perfil, atividade, horários
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  expect(await cloudInits(page)).toBe(0); // ainda no onboarding
  await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click();
  await expect(page.locator('#tabbar')).toBeVisible();
  await expect.poll(() => cloudInits(page)).toBe(1);
});

test('com o app já configurado, a nuvem liga na abertura', async ({ page }) => {
  await stubCloud(page);
  await seed(page);
  await page.goto('/');
  await expect(page.locator('#drop')).toBeVisible();
  await expect.poll(() => cloudInits(page)).toBe(1);
});

test('lembretes ativados no onboarding registram o push quando a nuvem liga', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'permissão de notificação simulada só no Chromium');
  await context.grantPermissions(['notifications']);
  await stubCloud(page);
  await page.goto('/');
  test.skip(/iPhone|iPad/.test(await page.evaluate(() => navigator.userAgent)), 'no iOS as notificações exigem o app instalado');
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  await page.getByRole('button', { name: 'Ativar lembretes' }).click();
  await expect(page.locator('#tabbar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__pushEnabled || 0)).toBe(1);
});
