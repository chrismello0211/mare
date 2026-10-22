// Maré — testes de interface dos avisos dos amigos (1.1.1; avisos opcionais e nova aba na 1.2.0). Rodar: npm run test:e2e
// Aqui: o que a pessoa vê e toca (a chave em Ajustes, o cartão na aba Amigos, o pedido de permissão, o registro do aparelho, o toque na
// notificação) e o sw.js de verdade num Chromium. A decisão e o texto de cada aviso são cobertos por tests/push.test.js, o servidor e as
// regras por tests/rules/friend-push.test.js, e o sw.js sem navegador por tests/sw.test.js.
// A permissão de notificação, o "app instalado" e o iPhone são de mentira (device()): o resultado é o mesmo em qualquer aparelho de teste.
// Qualquer erro de JavaScript na página reprova.
import { test, expect } from '@playwright/test';
import { seed } from './helpers/seed.js';
import { stubFriendsCloud, CREW, UID, SOCIAL_ON } from './helpers/friends.js';
import { messageOf, payloadOf } from '../functions/social-push.js';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
});
test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

const bar = (page) => page.locator('#tabbar');
const tabF = (page) => bar(page).getByRole('button', { name: /^Amigos/ }); // com bolinha o nome vira "Amigos (novidades)"
const tab = (page, name) => bar(page).getByRole('button', { name: name, exact: true });
const sheet = (page) => page.locator('#sheetBody');
const toast = (page) => page.locator('#toast');
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
const alertSw = (page) => page.getByRole('switch', { name: 'Avisos dos amigos', exact: true });
const alertNote = (page) => page.locator('#frAlertNote');
const fpush = (page) => page.locator('#view section.tip:not(.goalq)'); // o cartão "Receba avisos da turma" (a pergunta da meta, .goalq, é outra dica)
const perm = (page) => page.evaluate(() => window.__notif.permission);
const asked = (page) => page.evaluate(() => ({ n: window.__notif.asked, ev: window.__notif.ev.slice() }));
const pushReg = (page) => page.evaluate(() => window.__pushEnabled || 0); // quantas vezes o app registrou o aparelho para receber push
const metaN = (page) => page.evaluate(() => window.__metaSynced || 0); // quantas vezes o app mandou as preferências para a nuvem
const OFF = Object.assign({}, SOCIAL_ON, { push: false });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1';
const IPHONE_15 = IPHONE.replace('16_4', '15_4').replace('Version/16.4', 'Version/15.4'); // iOS antes do 16.4: sem notificação na web
const NOTES = {
  default: 'Desligados: ative para saber na hora de pedidos e acenos',
  on: 'Pedido de amizade, aceite, acenos e novos amigos na turma chegam como notificação',
  off: 'Desligados',
  denied: 'Bloqueados no navegador: toque no botão para ver como liberar',
  install: 'No iPhone, instale o Maré na Tela de Início para ativar',
  none: 'Este navegador só mostra os avisos com o Maré aberto',
};

// O aparelho de mentira. o = { perm: 'default' | 'granted' | 'denied' | 'none' (sem a API de notificação), answer: o que a pessoa responde ao
// pedido de permissão ('granted' | 'denied' | 'default' = fechou o pedido sem escolher), standalone: app instalado (padrão: sim), ua: texto do
// navegador (para fingir um iPhone) }. A permissão sobrevive a um recarregamento, como no navegador de verdade.
async function device(page, o) {
  await page.addInitScript((o) => {
    let saved = null;
    try { saved = sessionStorage.getItem('mare:perm'); } catch (e) { /* sem armazenamento */ }
    const N = window.__notif = { permission: saved || o.perm, answer: o.answer, asked: 0, ev: [] };
    if (o.perm === 'none') {
      try { delete window.Notification; } catch (e) { /* já não existe */ }
    } else {
      const Fake = function Notification() {};
      Object.defineProperty(Fake, 'permission', { get: () => N.permission });
      Fake.requestPermission = function (cb) {
        N.asked++;
        N.ev.push(window.event ? window.event.type : ''); // 'click' = o pedido saiu direto do toque (exigência do Safari)
        N.permission = N.answer;
        try { sessionStorage.setItem('mare:perm', N.permission); } catch (e) { /* sem armazenamento */ }
        if (typeof cb === 'function') cb(N.answer);
        return Promise.resolve(N.answer);
      };
      Object.defineProperty(window, 'Notification', { value: Fake, writable: true, configurable: true });
    }
    Object.defineProperty(navigator, 'standalone', { get: () => o.standalone, configurable: true });
    if (o.ua) Object.defineProperty(navigator, 'userAgent', { get: () => o.ua, configurable: true });
    if (!('serviceWorker' in navigator)) { // navegador de teste sem Service Worker: um contêiner de mentira, só para as mensagens
      const sw = new EventTarget();
      sw.register = () => Promise.reject(new Error('Service Worker bloqueado no teste'));
      sw.ready = new Promise(() => {}); sw.controller = null;
      Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
    }
  }, Object.assign({ perm: 'default', answer: 'granted', standalone: true, ua: '' }, o || {}));
}

// Abre o app num aparelho que já usa os amigos. d = aparelho, f = o que a nuvem de mentira já sabe, o = estado do app
async function launch(page, d, f, o) {
  await device(page, d);
  await stubFriendsCloud(page, Object.assign({ code: 'ABCD2345' }, f || {}));
  await seed(page, Object.assign({ todayMl: 1400, social: SOCIAL_ON }, o || {}));
  await page.goto('/');
}
async function ajustes(page, d, f, o) { await launch(page, d, f, o); await tab(page, 'Ajustes').click(); }
async function amigos(page, d, f, o) { await launch(page, d, f, o); await tabF(page).click(); }
// espera a nuvem de mentira ligar e dá um tempo para o app fazer (ou não) o que tiver de fazer
async function settle(page) {
  await page.waitForFunction(() => !!window.__fake); // a nuvem de mentira foi criada ao ligar a nuvem
  await page.waitForTimeout(300);
}

/* ---------- Ajustes ---------- */
test.describe('Ajustes: Avisos dos amigos', () => {
  const CASES = [
    { t: 'sem a permissão ainda: desligado, e a nota diz o que falta', d: { perm: 'default' }, on: false, note: NOTES.default },
    { t: 'com a permissão: ligado', d: { perm: 'granted' }, on: true, note: NOTES.on },
    { t: 'com a permissão, mas a pessoa desligou: desligado', d: { perm: 'granted' }, s: OFF, on: false, note: NOTES.off },
    { t: 'sem a permissão e desligado: só "Desligados"', d: { perm: 'default' }, s: OFF, on: false, note: NOTES.off },
    { t: 'bloqueado no navegador: desligado, e a nota explica', d: { perm: 'denied' }, on: false, note: NOTES.denied },
    { t: 'bloqueado e desligado: continua explicando o bloqueio', d: { perm: 'denied' }, s: OFF, on: false, note: NOTES.denied },
    { t: 'iPhone sem instalar: desligado, e pede a instalação', d: { perm: 'default', standalone: false, ua: IPHONE }, on: false, note: NOTES.install },
  ];
  for (const c of CASES) {
    test(c.t, async ({ page }) => {
      await ajustes(page, c.d, {}, { social: c.s || SOCIAL_ON });
      await expect(alertSw(page)).toHaveAttribute('aria-checked', String(c.on));
      await expect(alertNote(page)).toHaveText(c.note);
    });
  }

  test('navegador sem notificações, ou iPhone antigo: só o aviso, sem chave que não faria nada', async ({ page }) => {
    await ajustes(page, { perm: 'none' });
    await expect(alertNote(page)).toHaveText(NOTES.none);
    await expect(alertSw(page)).toHaveCount(0);
    await page.reload();
    await tab(page, 'Ajustes').click();
    await expect(alertNote(page)).toHaveText(NOTES.none);
  });

  test('iPhone com iOS anterior ao 16.4 (sem notificação na web): também só o aviso', async ({ page }) => {
    await ajustes(page, { perm: 'default', standalone: false, ua: IPHONE_15 });
    await expect(alertNote(page)).toHaveText(NOTES.none);
    await expect(alertSw(page)).toHaveCount(0);
  });

  test('fica entre "Mostrar minha meta em ml" e "Novo código de convite", com os dois avisos opcionais logo depois, dentro do grupo Amigos', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    const labels = await page.locator('h2.sec-t', { hasText: 'Amigos' }).locator('xpath=following-sibling::div[1]').locator('.row-l > span').allTextContents();
    expect(labels).toEqual(['Meu perfil público', 'Mostrar meu progresso do dia', 'Mostrar minha meta em ml', 'Avisos dos amigos',
      'Avisar quando um amigo bater a meta', 'Resumo da semana da turma', 'Novo código de convite', 'Sair da turma']);
  });

  test('sem os amigos ligados, a linha não existe (nada para avisar)', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: { on: false } });
    await expect(page.getByRole('button', { name: 'Conhecer' })).toBeVisible();
    await expect(page.getByText('Avisos dos amigos', { exact: true })).toHaveCount(0);
    await expect(alertSw(page)).toHaveCount(0);
    await expect(page.getByText('Resumo da semana da turma', { exact: true })).toHaveCount(0); // os avisos opcionais também só existem com a turma ligada
    await expect(page.getByText('Avisar quando um amigo bater a meta', { exact: true })).toHaveCount(0);
  });

  test('bloqueado: tocar na chave abre a ajuda para liberar (nada é pedido ao navegador)', async ({ page }) => {
    await ajustes(page, { perm: 'denied' });
    await alertSw(page).click();
    await expect(sheet(page)).toContainText('Notificações bloqueadas');
    expect((await asked(page)).n).toBe(0);
    expect((await stored(page)).social.push).toBe(true); // a escolha continua como estava
    await sheet(page).getByRole('button', { name: 'Entendi' }).click();
    await expect(sheet(page)).toBeHidden();
  });

  test('iPhone sem instalar: tocar na chave abre o "Instalar no iPhone"', async ({ page }) => {
    await ajustes(page, { perm: 'default', standalone: false, ua: IPHONE });
    await alertSw(page).click();
    await expect(sheet(page)).toContainText('Instalar no iPhone');
    await expect(sheet(page)).toContainText('Adicionar à Tela de Início');
    expect((await asked(page)).n).toBe(0);
  });

  test('sem suporte, o toque na linha não faz nada de estranho (só a nota)', async ({ page }) => {
    await ajustes(page, { perm: 'none' });
    await alertNote(page).click();
    await expect(sheet(page)).toBeHidden();
    await expect(toast(page)).toBeHidden();
  });
  test('sem suporte, até um botão de uma tela velha que ainda chama a ação só explica (nunca pede permissão)', async ({ page }) => {
    await ajustes(page, { perm: 'none' });
    await page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'fantasma'; b.type = 'button'; b.setAttribute('data-action', 'fr-alerts'); b.textContent = 'ativar';
      document.getElementById('view').appendChild(b);
    });
    await page.locator('#fantasma').click();
    await expect(toast(page)).toContainText('Este navegador só mostra os avisos com o Maré aberto.');
    await expect(sheet(page)).toBeHidden();
  });
});

/* ---------- ligar e desligar ---------- */
test.describe('chave "Avisos dos amigos"', () => {
  test('desligar: guarda a escolha, avisa a nuvem e não pede permissão', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await expect.poll(() => pushReg(page)).toBe(1); // o aparelho já foi registrado ao abrir
    const m0 = await metaN(page);
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(toast(page)).toContainText('Avisos dos amigos desligados');
    await expect(alertNote(page)).toHaveText(NOTES.off);
    expect((await stored(page)).social.push).toBe(false);
    expect(await metaN(page)).toBeGreaterThan(m0);
    expect((await asked(page)).n).toBe(0);
    expect(await pushReg(page)).toBe(1); // desligar não registra nada
  });

  test('ligar de novo: a escolha volta e o aparelho é registrado outra vez', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: OFF });
    await settle(page);
    expect(await pushReg(page)).toBe(0); // desligado desde o início: nunca se registrou
    const m0 = await metaN(page);
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(toast(page)).toContainText('Avisos dos amigos ligados');
    await expect(alertNote(page)).toHaveText(NOTES.on);
    expect((await stored(page)).social.push).toBe(true);
    expect(await metaN(page)).toBeGreaterThan(m0);
    await expect.poll(() => pushReg(page)).toBe(1);
  });

  test('desligado e ligado de novo na mesma sessão: a nuvem recebe as duas mudanças', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await settle(page);
    const m0 = await metaN(page);
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    expect(await metaN(page)).toBeGreaterThanOrEqual(m0 + 2);
    expect((await stored(page)).social.push).toBe(true);
  });

  test('a escolha de desligar sobrevive ao recarregar (e o aparelho não se registra de novo)', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await page.reload();
    await tab(page, 'Ajustes').click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(alertNote(page)).toHaveText(NOTES.off);
    await settle(page);
    expect(await pushReg(page)).toBe(0);
  });

  test('sem permissão: ligar pede a permissão DIRETO do toque e, aceita, liga e registra o aparelho', async ({ page }) => {
    await ajustes(page, { perm: 'default', answer: 'granted' });
    await settle(page);
    expect((await asked(page)).n).toBe(0); // nada é pedido sozinho
    expect(await pushReg(page)).toBe(0);
    const m0 = await metaN(page);
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(toast(page)).toContainText('Avisos dos amigos ligados');
    await expect(alertNote(page)).toHaveText(NOTES.on);
    const a = await asked(page);
    expect(a.n).toBe(1);
    expect(a.ev, 'o pedido de permissão tem de sair do próprio toque').toEqual(['click']);
    expect((await stored(page)).social.push).toBe(true);
    expect(await metaN(page)).toBeGreaterThan(m0);
    await expect.poll(() => pushReg(page)).toBe(1);
  });

  test('sem permissão e a pessoa nega: continua desligado, explica e não registra nada', async ({ page }) => {
    await ajustes(page, { perm: 'default', answer: 'denied' });
    await settle(page);
    const m0 = await metaN(page);
    await alertSw(page).click();
    await expect(toast(page)).toContainText('Sem permissão, os avisos dos amigos ficam desligados.');
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(alertNote(page)).toHaveText(NOTES.denied); // agora o navegador bloqueou: a nota ensina a liberar
    expect(await perm(page)).toBe('denied');
    expect(await pushReg(page)).toBe(0);
    expect(await metaN(page)).toBe(m0); // nada foi mudado, nada foi mandado
    expect((await stored(page)).social.push).toBe(true);
  });

  test('sem permissão e a pessoa fecha o pedido sem escolher: continua dando para tentar de novo', async ({ page }) => {
    await ajustes(page, { perm: 'default', answer: 'default' });
    await alertSw(page).click();
    await expect(toast(page)).toContainText('Sem permissão, os avisos dos amigos ficam desligados.');
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(alertNote(page)).toHaveText(NOTES.default);
    await page.evaluate(() => { window.__notif.answer = 'granted'; });
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    expect((await asked(page)).n).toBe(2);
  });

  test('ligar já com a permissão (depois de ter desligado) não faz o navegador perguntar de novo à pessoa', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: OFF });
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    expect(await perm(page)).toBe('granted');
  });

  test('a chave acompanha o teclado: espaço e Enter ligam e desligam', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await alertSw(page).focus();
    await page.keyboard.press('Enter');
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(alertSw(page)).toBeFocused(); // a chave muda no lugar: quem usa o teclado não perde o foco
    await page.keyboard.press('Space');
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(alertSw(page)).toBeFocused();
    await page.waitForTimeout(300); // nem o registro do aparelho, que termina depois, redesenha a tela
    await expect(alertSw(page)).toBeFocused();
  });

  test('o que a pessoa vê na aba Amigos muda junto: desligar esconde o cartão que convida a ligar', async ({ page }) => {
    await ajustes(page, { perm: 'default' });
    await alertSw(page).click(); // concede e liga
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    await alertSw(page).click(); // desliga
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await tabF(page).click();
    await expect(page.getByRole('heading', { name: 'Sua turma' })).toBeVisible();
    await expect(fpush(page)).toHaveCount(0); // quem desligou não é convidado a ligar de novo
  });
});

/* ---------- avisos opcionais (1.2.0): "um amigo bateu a meta" e "resumo da semana da turma" ---------- */
// Só valem com os avisos dos amigos ligados e a permissão dada. O aviso de meta batida começa desligado (é escolha de quem quer);
// o resumo da semana começa ligado (domingo, 19h). Quem manda é o servidor: aqui se vê a chave, a nota, a escolha guardada e o que vai para a nuvem.
test.describe('Ajustes: avisos opcionais da turma', () => {
  const hitSw = (page) => page.getByRole('switch', { name: 'Avisar quando um amigo bater a meta', exact: true });
  const weekSw = (page) => page.getByRole('switch', { name: 'Resumo da semana da turma', exact: true });
  const hitNote = (page) => page.locator('#frHitNote');
  const weekNote = (page) => page.locator('#frWeekNote');
  const HIT = { on: 'Uma notificação quando alguém da turma bater a meta do dia', off: 'Desligado: só avisa quem você escolher' };
  const WEEK = { on: 'Domingo, às 19h, um resumo de como foi a semana da turma', off: 'Desligado' };
  const BOTH = Object.assign({}, SOCIAL_ON, { hit: true, week: true });

  test('com a permissão: o resumo da semana já vem ligado e o aviso de meta batida, desligado', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitNote(page)).toHaveText(HIT.off);
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekNote(page)).toHaveText(WEEK.on);
  });

  const CASES = [
    { t: 'sem a permissão ainda: os dois desligados, sem nenhum pedido ao navegador', d: { perm: 'default' }, hit: HIT.off, week: WEEK.off },
    { t: 'bloqueado no navegador: os dois desligados e a nota ensina a liberar', d: { perm: 'denied' }, hit: NOTES.denied, week: NOTES.denied },
    { t: 'iPhone sem instalar: os dois desligados e a nota pede a instalação', d: { perm: 'default', standalone: false, ua: IPHONE }, hit: NOTES.install, week: NOTES.install },
  ];
  for (const c of CASES) {
    test(c.t, async ({ page }) => {
      await ajustes(page, c.d);
      await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
      await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
      await expect(hitNote(page)).toHaveText(c.hit);
      await expect(weekNote(page)).toHaveText(c.week);
      expect((await asked(page)).n).toBe(0);
    });
  }

  test('com os avisos dos amigos desligados, as duas chaves ficam desligadas (a escolha de cada uma fica guardada)', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: Object.assign({}, BOTH, { push: false }) });
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    const st = (await stored(page)).social;
    expect([st.hit, st.week]).toEqual([true, true]);
  });

  test('navegador sem notificações: nenhuma das duas linhas aparece (a nota do aviso principal já explica)', async ({ page }) => {
    await ajustes(page, { perm: 'none' });
    await expect(alertNote(page)).toHaveText(NOTES.none);
    await expect(hitSw(page)).toHaveCount(0);
    await expect(weekSw(page)).toHaveCount(0);
  });

  test('ligar o aviso de meta batida: guarda, avisa a nuvem e não pergunta nada (a permissão já existe)', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await settle(page);
    const m0 = await metaN(page);
    await hitSw(page).click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(hitNote(page)).toHaveText(HIT.on);
    await expect(toast(page)).toContainText('Aviso de meta batida ligado');
    expect((await stored(page)).social.hit).toBe(true);
    expect(await metaN(page)).toBeGreaterThan(m0);
    expect((await asked(page)).n).toBe(0);
    expect((await stored(page)).social.week).toBe(true); // a outra escolha não mexe
  });

  test('desligar o aviso de meta batida: guarda e avisa a nuvem', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: BOTH });
    await settle(page);
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    const m0 = await metaN(page);
    await hitSw(page).click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitNote(page)).toHaveText(HIT.off);
    await expect(toast(page)).toContainText('Aviso de meta batida desligado');
    expect((await stored(page)).social.hit).toBe(false);
    expect(await metaN(page)).toBeGreaterThan(m0);
  });

  test('desligar o resumo da semana e ligar de novo: a nuvem recebe as duas mudanças', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await settle(page);
    const m0 = await metaN(page);
    await weekSw(page).click();
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(weekNote(page)).toHaveText(WEEK.off);
    await expect(toast(page)).toContainText('Resumo da semana desligado');
    expect((await stored(page)).social.week).toBe(false);
    await weekSw(page).click();
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekNote(page)).toHaveText(WEEK.on);
    await expect(toast(page)).toContainText('Resumo da semana ligado');
    expect((await stored(page)).social.week).toBe(true);
    expect(await metaN(page)).toBeGreaterThanOrEqual(m0 + 2);
  });

  test('sem a permissão: ligar um aviso pede a permissão DIRETO do toque e, aceita, liga o aviso e os avisos dos amigos', async ({ page }) => {
    await ajustes(page, { perm: 'default', answer: 'granted' });
    await settle(page);
    expect((await asked(page)).n).toBe(0);
    await hitSw(page).click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(toast(page)).toContainText('Aviso de meta batida ligado');
    const a = await asked(page);
    expect(a.n).toBe(1);
    expect(a.ev, 'o pedido de permissão tem de sair do próprio toque').toEqual(['click']);
    const st = (await stored(page)).social;
    expect([st.hit, st.push]).toEqual([true, true]);
    await expect.poll(() => pushReg(page)).toBe(1); // o aparelho passa a receber
  });

  test('sem a permissão e a pessoa nega: tudo continua desligado e nada vai para a nuvem', async ({ page }) => {
    await ajustes(page, { perm: 'default', answer: 'denied' });
    await settle(page);
    const m0 = await metaN(page);
    await weekSw(page).click();
    await expect(toast(page)).toContainText('Sem permissão, os avisos ficam desligados.');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(weekNote(page)).toHaveText(NOTES.denied); // agora o navegador bloqueou: a nota ensina a liberar
    expect(await metaN(page)).toBe(m0);
    expect(await pushReg(page)).toBe(0);
    expect((await stored(page)).social.week).toBe(true); // a escolha antiga continua (só não vale sem a permissão)
  });

  test('com os avisos dos amigos desligados pela pessoa, ligar um aviso opcional religa os avisos juntos', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: OFF });
    await settle(page);
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await hitSw(page).click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'true'); // o resumo, que já estava escolhido, volta a valer
    expect((await stored(page)).social.push).toBe(true);
    expect((await asked(page)).n).toBe(0);
  });

  test('desligar os avisos dos amigos desliga as duas chaves na tela; ligar de novo traz a escolha de cada uma', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: BOTH });
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'true');
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitNote(page)).toHaveText(HIT.off);
    await expect(weekNote(page)).toHaveText(WEEK.off);
    await alertSw(page).click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('bloqueado: tocar numa das chaves abre a ajuda (nada é pedido e nada é guardado)', async ({ page }) => {
    await ajustes(page, { perm: 'denied' });
    await hitSw(page).click();
    await expect(sheet(page)).toContainText('Notificações bloqueadas');
    await sheet(page).getByRole('button', { name: 'Entendi' }).click();
    await weekSw(page).click();
    await expect(sheet(page)).toContainText('Notificações bloqueadas');
    expect((await asked(page)).n).toBe(0);
    const st = (await stored(page)).social;
    expect([st.hit, st.week]).toEqual([false, true]);
  });

  test('iPhone sem instalar: tocar numa das chaves abre o "Instalar no iPhone"', async ({ page }) => {
    await ajustes(page, { perm: 'default', standalone: false, ua: IPHONE });
    await weekSw(page).click();
    await expect(sheet(page)).toContainText('Instalar no iPhone');
    expect((await asked(page)).n).toBe(0);
  });

  test('as escolhas sobrevivem ao recarregar', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await hitSw(page).click();
    await weekSw(page).click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    await page.reload();
    await tab(page, 'Ajustes').click();
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitNote(page)).toHaveText(HIT.on);
    await expect(weekNote(page)).toHaveText(WEEK.off);
  });

  test('as chaves acompanham o teclado e mudam no lugar (o foco não se perde)', async ({ page }) => {
    await ajustes(page, { perm: 'granted' });
    await hitSw(page).focus();
    await page.keyboard.press('Enter');
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'true');
    await expect(hitSw(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(hitSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(hitSw(page)).toBeFocused();
    await weekSw(page).focus();
    await page.keyboard.press('Enter');
    await expect(weekSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(weekSw(page)).toBeFocused();
    await page.waitForTimeout(300);
    await expect(weekSw(page)).toBeFocused();
  });

  test('a nota e a chave de cada aviso cabem na tela', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, {}, { social: BOTH });
    for (const n of [hitNote(page), weekNote(page)]) {
      expect(await n.evaluate((e) => e.scrollWidth - e.clientWidth), 'nota cortada').toBeLessThanOrEqual(1);
    }
    const vw = page.viewportSize().width;
    for (const sw of [hitSw(page), weekSw(page)]) {
      const b = await sw.boundingBox();
      expect(b.x + b.width, 'chave saindo pela direita').toBeLessThanOrEqual(vw + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral').toBeLessThanOrEqual(0);
  });
});

/* ---------- cartão na aba Amigos ---------- */
test.describe('cartão "Receba avisos dos amigos"', () => {
  test('aparece enquanto falta a permissão, logo depois dos pedidos, e explica o que chega', async ({ page }) => {
    await amigos(page, { perm: 'default' }, { friends: CREW, reqIn: [{ uid: UID.gabi, prof: { nm: 'Gabi' } }] });
    const c = fpush(page);
    await expect(c).toBeVisible();
    await expect(c).toContainText('Receba avisos da turma');
    await expect(c).toContainText('pedir amizade, aceitar o seu pedido ou acenar para você');
    await expect(c.getByRole('button', { name: 'Ativar avisos' })).toBeVisible();
    // ordem na tela: pedidos de amizade, depois o cartão, depois o ranking da turma
    const heads = await page.locator('#view h2').allTextContents();
    expect(heads.indexOf('Pedidos de amizade')).toBeLessThan(heads.indexOf('Ranking da turma'));
    const at = await page.evaluate(() => {
      const y = (t) => { const h = [...document.querySelectorAll('#view h2')].find((x) => x.textContent === t); return h ? h.getBoundingClientRect().top : -1; };
      const tip = document.querySelector('#view section.tip:not(.goalq)');
      return { req: y('Pedidos de amizade'), tip: tip ? tip.getBoundingClientRect().top : -1, crew: y('Ranking da turma') };
    });
    expect(at.req).toBeLessThan(at.tip);
    expect(at.tip).toBeLessThan(at.crew);
  });

  test('"Ativar avisos": pede a permissão no toque, liga, registra o aparelho e o cartão some', async ({ page }) => {
    await amigos(page, { perm: 'default', answer: 'granted' }, { friends: CREW });
    await settle(page);
    expect((await asked(page)).n).toBe(0);
    await fpush(page).getByRole('button', { name: 'Ativar avisos' }).click();
    await expect(toast(page)).toContainText('Avisos dos amigos ligados');
    await expect(fpush(page)).toHaveCount(0);
    const a = await asked(page);
    expect(a.n).toBe(1);
    expect(a.ev).toEqual(['click']);
    expect((await stored(page)).social.push).toBe(true);
    await expect.poll(() => pushReg(page)).toBe(1);
    await tab(page, 'Ajustes').click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('"Ativar avisos" e a pessoa nega: o cartão some (não insiste) e Ajustes passa a explicar o bloqueio', async ({ page }) => {
    await amigos(page, { perm: 'default', answer: 'denied' }, { friends: CREW });
    await fpush(page).getByRole('button', { name: 'Ativar avisos' }).click();
    await expect(toast(page)).toContainText('Sem permissão, os avisos dos amigos ficam desligados.');
    await expect(fpush(page)).toHaveCount(0);
    expect(await pushReg(page)).toBe(0);
    await tab(page, 'Ajustes').click();
    await expect(alertNote(page)).toHaveText(NOTES.denied);
  });

  test('"Ativar avisos" e a pessoa fecha o pedido sem escolher: o cartão fica, para tentar de novo', async ({ page }) => {
    await amigos(page, { perm: 'default', answer: 'default' }, { friends: CREW });
    await fpush(page).getByRole('button', { name: 'Ativar avisos' }).click();
    await expect(toast(page)).toContainText('Sem permissão');
    await expect(fpush(page)).toBeVisible();
  });

  test('dispensar (×): some na hora, a escolha fica guardada e o cartão não volta ao recarregar', async ({ page }) => {
    await amigos(page, { perm: 'default' }, { friends: CREW });
    await fpush(page).getByRole('button', { name: 'Dispensar dica' }).click();
    await expect(fpush(page)).toHaveCount(0);
    expect((await stored(page)).ui.tip_fpush).toBe(1);
    expect((await asked(page)).n).toBe(0); // dispensar não é aceitar nem negar
    await page.reload();
    await tabF(page).click();
    await expect(page.getByRole('heading', { name: 'Ranking da turma' })).toBeVisible();
    await expect(fpush(page)).toHaveCount(0);
    await tab(page, 'Ajustes').click(); // quem dispensou ainda liga quando quiser, em Ajustes
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false');
    await expect(alertNote(page)).toHaveText(NOTES.default);
  });

  test('dispensar não desliga os avisos: continuam valendo assim que a permissão existir', async ({ page }) => {
    await amigos(page, { perm: 'default', answer: 'granted' }, { friends: CREW });
    await fpush(page).getByRole('button', { name: 'Dispensar dica' }).click();
    expect((await stored(page)).social.push).toBe(true);
    await tab(page, 'Ajustes').click();
    await alertSw(page).click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'true');
  });

  for (const c of [
    { t: 'não aparece com a permissão já dada', d: { perm: 'granted' } },
    { t: 'não aparece se o navegador bloqueou (Ajustes explica)', d: { perm: 'denied' } },
    { t: 'não aparece sem suporte a notificações', d: { perm: 'none' } },
    { t: 'não aparece para quem desligou os avisos', d: { perm: 'default' }, o: { social: OFF } },
    { t: 'não aparece para quem já dispensou', d: { perm: 'default' }, o: { ui: { tip_fpush: 1 } } },
    { t: 'não aparece no iPhone antigo (sem notificação na web)', d: { perm: 'default', standalone: false, ua: IPHONE_15 } },
  ]) {
    test(c.t, async ({ page }) => {
      await amigos(page, c.d, { friends: CREW }, c.o);
      await expect(page.getByRole('heading', { name: 'Ranking da turma' })).toBeVisible();
      await expect(fpush(page)).toHaveCount(0);
    });
  }

  test('iPhone sem instalar: o cartão pede a instalação e "Como instalar" abre o passo a passo', async ({ page }) => {
    await amigos(page, { perm: 'default', standalone: false, ua: IPHONE }, { friends: CREW });
    const c = fpush(page);
    await expect(c).toContainText('Avisos da turma no iPhone');
    await expect(c).toContainText('instale o app na Tela de Início');
    await expect(c.getByRole('button', { name: 'Ativar avisos' })).toHaveCount(0); // não adianta pedir: só vale instalado
    await c.getByRole('button', { name: 'Como instalar' }).click();
    await expect(sheet(page)).toContainText('Instalar no iPhone');
    expect((await asked(page)).n).toBe(0);
    await sheet(page).getByRole('button', { name: 'Entendi' }).click();
    await expect(c).toBeVisible(); // fechar o passo a passo não dispensa o cartão
    await c.getByRole('button', { name: 'Dispensar dica' }).click();
    await expect(fpush(page)).toHaveCount(0);
  });

  test('a lista vazia (sem amigos ainda) também mostra o cartão: é quando mais ajuda', async ({ page }) => {
    await amigos(page, { perm: 'default' });
    await expect(page.getByText('Seu recife ainda está sozinho')).toBeVisible();
    await expect(fpush(page)).toBeVisible();
  });

  test('a permissão muda por fora (nas configurações do navegador): o cartão some na próxima atualização da aba', async ({ page }) => {
    await amigos(page, { perm: 'default' }, { friends: CREW });
    await expect(fpush(page)).toBeVisible();
    await page.evaluate(() => { window.__notif.permission = 'granted'; });
    await page.waitForFunction(() => !!window.__fake); // o cartão aparece sem a nuvem; a nuvem de mentira nasce quando ela liga
    await page.evaluate((u) => { window.__fake.person(u, {}); }, UID.caio); // uma atualização que não muda nada do que a aba mostra
    await expect(fpush(page)).toHaveCount(0);
    expect((await asked(page)).n).toBe(0);
  });

  test('a aba Amigos não pisca nem refaz o cartão quando um amigo muda (nada de pedido repetido)', async ({ page }) => {
    await amigos(page, { perm: 'default', answer: 'denied' }, { friends: CREW });
    await expect(fpush(page)).toBeVisible();
    await page.waitForFunction(() => !!window.__fake); // o cartão aparece sem a nuvem; a nuvem de mentira nasce quando ela liga
    await page.evaluate((u) => { window.__fake.person(u, { pct: 80 }); }, UID.caio);
    await page.waitForTimeout(300);
    await expect(fpush(page)).toBeVisible();
    expect((await asked(page)).n).toBe(0);
  });
});

/* ---------- registro do aparelho ---------- */
test.describe('registro do aparelho para receber push', () => {
  test('amigos ligados, avisos ligados e permissão dada: registra ao abrir (uma vez)', async ({ page }) => {
    await launch(page, { perm: 'granted' }, { friends: CREW });
    await expect.poll(() => pushReg(page)).toBe(1);
    await page.waitForTimeout(400);
    expect(await pushReg(page)).toBe(1);
    expect((await asked(page)).n).toBe(0); // nunca pergunta sozinho
  });

  test('sem a permissão: não registra e não pergunta nada ao abrir', async ({ page }) => {
    await launch(page, { perm: 'default' }, { friends: CREW });
    await settle(page);
    expect(await pushReg(page)).toBe(0);
    expect((await asked(page)).n).toBe(0);
  });

  test('permissão bloqueada: não registra nem pergunta', async ({ page }) => {
    await launch(page, { perm: 'denied' }, { friends: CREW });
    await settle(page);
    expect(await pushReg(page)).toBe(0);
    expect((await asked(page)).n).toBe(0);
  });

  test('avisos desligados pela pessoa: não registra (e sem lembretes, nada mais pede o registro)', async ({ page }) => {
    await launch(page, { perm: 'granted' }, { friends: CREW }, { social: OFF });
    await settle(page);
    expect(await pushReg(page)).toBe(0);
  });

  test('lembretes ligados continuam registrando o aparelho, com ou sem os amigos', async ({ page }) => {
    await launch(page, { perm: 'granted' }, {}, { social: { on: false }, reminders: { enabled: true } });
    await expect.poll(() => pushReg(page)).toBe(1);
  });

  test('lembretes ligados e avisos dos amigos desligados: o registro continua (é dos lembretes)', async ({ page }) => {
    await launch(page, { perm: 'granted' }, { friends: CREW }, { social: OFF, reminders: { enabled: true } });
    await expect.poll(() => pushReg(page)).toBe(1);
  });

  test('sem amigos e sem lembretes: o aparelho não se registra (ninguém para avisar)', async ({ page }) => {
    await launch(page, { perm: 'granted' }, {}, { social: { on: false } });
    await settle(page);
    expect(await pushReg(page)).toBe(0);
  });

  test('entrar nos amigos com a permissão já dada registra o aparelho na hora', async ({ page }) => {
    await device(page, { perm: 'granted' });
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/');
    await page.waitForFunction(() => !!window.__fake); // a nuvem de mentira ligou
    await tabF(page).click();
    expect(await pushReg(page)).toBe(0);
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    await expect.poll(() => pushReg(page)).toBe(1);
    expect((await stored(page)).social.push).toBe(true); // começa ligado
    expect((await asked(page)).n).toBe(0);
  });

  test('entrar nos amigos sem a permissão: não pergunta nada (o cartão convida, a pessoa decide)', async ({ page }) => {
    await device(page, { perm: 'default' });
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/');
    await tabF(page).click();
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    await expect(fpush(page)).toContainText('Receba avisos da turma');
    expect(await pushReg(page)).toBe(0);
    expect((await asked(page)).n).toBe(0);
  });

  test('sair da turma tira a linha de Ajustes e o cartão; entrar de novo traz a escolha de antes', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, { friends: CREW }, { social: OFF });
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu da turma');
    await expect(alertSw(page)).toHaveCount(0);
    await tabF(page).click();
    await expect(page.getByRole('heading', { name: 'Beba água em boa companhia' })).toBeVisible();
    await expect(fpush(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    await tab(page, 'Ajustes').click();
    await expect(alertSw(page)).toHaveAttribute('aria-checked', 'false'); // quem tinha desligado os avisos continua sem eles
    expect(await pushReg(page)).toBe(0);
  });
});

/* ---------- toque na notificação ---------- */
// O Service Worker, ao tocar numa notificação de amigos com o Maré aberto, manda { type: 'go', tab: 'friends' }; com o Maré fechado, abre ?tab=friends.
test.describe('toque na notificação', () => {
  const swMsg = (page, d) => page.evaluate((m) => { navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: m })); }, d);

  test('com o Maré aberto em Hoje: abre a aba Amigos', async ({ page }) => {
    await launch(page, { perm: 'granted' }, { friends: CREW });
    await expect(page.locator('#drop')).toBeVisible();
    await swMsg(page, { type: 'go', tab: 'friends' });
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Ranking da turma' })).toBeVisible();
  });

  test('com o Maré aberto em outra aba (Ajustes): também vai para Amigos', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, { friends: CREW });
    await swMsg(page, { type: 'go', tab: 'friends' });
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
  });

  test('já na aba Amigos: continua nela (e não recarrega nada)', async ({ page }) => {
    await amigos(page, { perm: 'granted' }, { friends: CREW });
    await page.evaluate(() => { window.__marker = 'mesma página'; });
    await swMsg(page, { type: 'go', tab: 'friends' });
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => window.__marker)).toBe('mesma página');
  });

  test('com um painel aberto: o painel fecha e a aba Amigos aparece', async ({ page }) => {
    await ajustes(page, { perm: 'granted' }, { friends: CREW });
    await page.getByRole('button', { name: 'Trocar', exact: true }).click();
    await expect(sheet(page)).toContainText('os pedidos que já chegaram continuam como estão');
    await swMsg(page, { type: 'go', tab: 'friends' });
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#sheet')).toBeHidden();
  });

  test('o botão voltar, depois do toque, leva de volta a Hoje (como em qualquer aba)', async ({ page }) => {
    await launch(page, { perm: 'granted' }, { friends: CREW });
    await swMsg(page, { type: 'go', tab: 'friends' });
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(tab(page, 'Hoje')).toHaveAttribute('aria-current', 'page');
  });

  test('aba que não existe, tipo desconhecido ou mensagem vazia: ignorados (nada quebra)', async ({ page }) => {
    await launch(page, { perm: 'granted' }, { friends: CREW });
    await expect(page.locator('#drop')).toBeVisible();
    for (const m of [{ type: 'go', tab: 'xyz' }, { type: 'go', tab: '__proto__' }, { type: 'go' }, { type: 'go', tab: 7 }, { type: 'outro', tab: 'friends' }, {}, null]) {
      await swMsg(page, m);
    }
    await page.waitForTimeout(300);
    await expect(tab(page, 'Hoje')).toHaveAttribute('aria-current', 'page');
  });

  test('durante o onboarding o aviso é ignorado (ninguém é tirado da configuração)', async ({ page }) => {
    await device(page, { perm: 'default' });
    await stubFriendsCloud(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Começar', exact: true })).toBeVisible();
    await swMsg(page, { type: 'go', tab: 'friends' });
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: 'Começar', exact: true })).toBeVisible();
    await expect(bar(page)).toBeHidden();
  });

  test('com o Maré fechado: ?tab=friends abre direto na aba Amigos e o endereço fica limpo', async ({ page }) => {
    await device(page, { perm: 'granted' });
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { todayMl: 1400, social: SOCIAL_ON });
    await page.goto('/?tab=friends');
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Ranking da turma' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('?tab=friends sem os amigos ligados: abre a entrada dos amigos (nada de tela vazia)', async ({ page }) => {
    await device(page, { perm: 'granted' });
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/?tab=friends');
    await expect(page.getByRole('heading', { name: 'Beba água em boa companhia' })).toBeVisible();
  });
});

/* ---------- o sw.js de verdade ---------- */
// O mesmo pacote que o servidor manda ao FCM (payloadOf, em functions/social-push.js) entregue ao sw.js num Chromium: o que tests/sw.test.js
// prova com um navegador de mentira, aqui vale com o de verdade (as opções da notificação são validadas pelo navegador).
test.describe('Service Worker de verdade', () => {
  test.use({ serviceWorkers: 'allow' });

  async function boot(page, context, browserName) {
    test.skip(browserName !== 'chromium', 'push simulado só no Chromium');
    await context.grantPermissions(['notifications']);
    await seed(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    await page.evaluate(async () => { // o push só chega a um Service Worker já ativado (com a máquina cheia, isso demora)
      const w = (await navigator.serviceWorker.ready).active;
      if (w && w.state !== 'activated') await new Promise((ok) => { w.addEventListener('statechange', () => { if (w.state === 'activated') ok(); }); });
    });
    const cdp = await context.newCDPSession(page), regs = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { e.registrations.forEach((r) => { regs.push(r); }); });
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => regs.length, { timeout: 15000 }).toBeGreaterThan(0);
    const reg = regs[regs.length - 1];
    return {
      // entrega um push ao Service Worker, como o navegador faria (data = o texto que o FCM entregou). done = como saber que ele chegou: o Chromium
      // de teste, sob carga, perde um push de vez em quando (1 em ~50); com done, o push é reenviado (até 2 vezes) se o efeito não aparecer em 5 s
      push: async (data, done) => {
        const send = () => cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(reg.scopeURL).origin, registrationId: reg.registrationId, data: data });
        await send();
        for (let i = 0; done && i < 2; i++) {
          let ok = false;
          for (const t0 = Date.now(); !ok && Date.now() - t0 < 5000;) { ok = await done(); if (!ok) await page.waitForTimeout(150); }
          if (ok) return;
          await send();
        }
      },
      shown: () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({
        title: n.title, body: n.body, tag: n.tag, data: n.data, renotify: n.renotify, actions: (n.actions || []).map((a) => a.action + ':' + a.title) }))),
    };
  }
  // o envelope do FCM: { data: {...}, from, priority, fcmMessageId }
  const fcm = (data) => JSON.stringify({ data: data, from: '1234567890', priority: 'high', fcmMessageId: '0:1700000000000000%abcdef' });

  test('aviso de aceno: título e texto do servidor, sem o botão "+250 ml", destino na aba Amigos', async ({ page, context, browserName }) => {
    const sw = await boot(page, context, browserName);
    const ev = { kind: 'wave', from: UID.bia, to: UID.ze, wave: 'hi', again: false };
    const m = messageOf(ev, 'Bia');
    await sw.push(fcm(payloadOf(ev, m)), async () => (await sw.shown()).length === 1);
    await expect.poll(async () => (await sw.shown()).length, { timeout: 15000 }).toBe(1);
    const n = (await sw.shown())[0];
    expect(n.title).toBe('Bia acenou para você 👋');
    expect(n.body).toBe('Toque para acenar de volta.');
    expect(n.tag).toBe('mare-amigo-wave-' + UID.bia);
    expect(n.actions).toEqual([]);
    expect(n.renotify).toBe(true);
    expect(n.data).toEqual({ url: './?tab=friends', go: 'friends' });
  });

  test('os três avisos (pedido, aceite e aceno) chegam, cada um com o seu texto e o seu tag', async ({ page, context, browserName }) => {
    const sw = await boot(page, context, browserName);
    const evs = [{ kind: 'request', from: UID.gabi, to: UID.ze }, { kind: 'accepted', from: UID.hugo, to: UID.ze },
      { kind: 'wave', from: UID.bia, to: UID.ze, wave: 'cheer', again: true }];
    const names = ['Gabi', 'Hugo', 'Bia'], want = {};
    for (let i = 0; i < evs.length; i++) {
      const m = messageOf(evs[i], names[i]);
      want[m.tag] = m.title;
      await sw.push(fcm(payloadOf(evs[i], m)), async () => (await sw.shown()).length === i + 1);
    }
    await expect.poll(async () => (await sw.shown()).length, { timeout: 15000 }).toBe(3);
    const got = await sw.shown();
    expect(Object.keys(want)).toHaveLength(3);
    expect(got.map((n) => n.tag).sort()).toEqual(Object.keys(want).sort());
    got.forEach((n) => {
      expect(n.title).toBe(want[n.tag]);
      expect(n.actions).toEqual([]);
      expect(n.data).toEqual({ url: './?tab=friends', go: 'friends' });
    });
    expect(got.map((n) => n.title).sort()).toEqual(['Bia mandou parabéns pra você\u00A0🎉', 'Hugo aceitou seu pedido\u00A0🤗', 'Pedido de amizade\u00A0💌'].sort());
  });

  test('o mesmo aceno da mesma pessoa substitui o aviso anterior (não empilha)', async ({ page, context, browserName }) => {
    const sw = await boot(page, context, browserName);
    const hi = { kind: 'wave', from: UID.bia, to: UID.ze, wave: 'hi', again: false }, ch = { kind: 'wave', from: UID.bia, to: UID.ze, wave: 'cheer', again: false };
    await sw.push(fcm(payloadOf(hi, messageOf(hi, 'Bia'))), async () => (await sw.shown()).length === 1);
    await expect.poll(async () => (await sw.shown()).length, { timeout: 15000 }).toBe(1);
    await sw.push(fcm(payloadOf(ch, messageOf(ch, 'Bia'))), async () => ((await sw.shown())[0] || {}).title === messageOf(ch, 'Bia').title);
    await expect.poll(async () => (await sw.shown())[0].title, { timeout: 15000 }).toBe('Bia mandou parabéns pra você 🎉');
    expect(await sw.shown()).toHaveLength(1);
  });

  test('lembrete: continua com o botão "+250 ml" e o tag de sempre', async ({ page, context, browserName }) => {
    const sw = await boot(page, context, browserName);
    await sw.push(fcm({ kind: 'reminder', tag: 'mare-lembrete', url: './?source=push', badge: '3', title: 'Hora de um gole 💧', action: '+250 ml', body: 'Faltam 750 ml para a meta de hoje.' }),
      async () => (await sw.shown()).length === 1);
    await expect.poll(async () => (await sw.shown()).length, { timeout: 15000 }).toBe(1);
    const n = (await sw.shown())[0];
    expect(n).toMatchObject({ title: 'Hora de um gole 💧', body: 'Faltam 750 ml para a meta de hoje.', tag: 'mare-lembrete', actions: ['add250:+250 ml'] });
    expect(n.data).toEqual({ url: './?source=push' });
  });

  test('push sem dados: ainda aparece uma notificação (o iPhone exige uma por push)', async ({ page, context, browserName }) => {
    const sw = await boot(page, context, browserName);
    await sw.push('', async () => (await sw.shown()).length === 1);
    await expect.poll(async () => (await sw.shown()).length, { timeout: 15000 }).toBe(1);
    expect((await sw.shown())[0].title).toBe('Hora de beber água 💧');
  });
});

/* ---------- layout ---------- */
test('layout: o cartão dos avisos e a linha de Ajustes cabem em qualquer tela', async ({ page }, info) => {
  await device(page, { perm: 'default' });
  await stubFriendsCloud(page, { friends: CREW, reqIn: [{ uid: UID.gabi, prof: { nm: 'Gabi', mc: 'polvo' } }], code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, history: [30, 2800], insignias: { concha: 30, estrela: 25 } });
  await page.goto('/');
  const over = async (n) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral em ' + n).toBeLessThanOrEqual(0);
  const shot = (n) => page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + n + '.png', fullPage: true });
  await tabF(page).click();
  await expect(fpush(page)).toBeVisible();
  await page.waitForTimeout(700);
  await over('Amigos com o cartão dos avisos');
  const vw = page.viewportSize().width, box = await fpush(page).boundingBox();
  expect(box.x, 'cartão saindo pela esquerda').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'cartão saindo pela direita').toBeLessThanOrEqual(vw + 1);
  const b = await fpush(page).getByRole('button', { name: 'Ativar avisos' }).boundingBox();
  expect(b.height, 'botão do cartão baixo demais para o toque').toBeGreaterThanOrEqual(36);
  const x = await fpush(page).getByRole('button', { name: 'Dispensar dica' }).boundingBox();
  expect(x.width, 'botão de dispensar estreito').toBeGreaterThanOrEqual(36);
  expect(x.height, 'botão de dispensar baixo').toBeGreaterThanOrEqual(36);
  expect(x.x + x.width, 'botão de dispensar saindo do cartão').toBeLessThanOrEqual(box.x + box.width);
  expect(x.y, 'botão de dispensar saindo do cartão').toBeGreaterThanOrEqual(box.y);
  await shot('Amigos com cartão dos avisos');
  await tab(page, 'Ajustes').click();
  await page.waitForTimeout(500);
  await over('Ajustes (avisos dos amigos)');
  const sw = await alertSw(page).boundingBox();
  expect(sw.x + sw.width, 'chave saindo pela direita').toBeLessThanOrEqual(vw + 1);
  expect(await page.evaluate(() => { const n = document.getElementById('frAlertNote'); return n.scrollWidth - n.clientWidth; }), 'nota cortada').toBeLessThanOrEqual(1);
  await shot('Ajustes com avisos dos amigos');
  // o estado mais comprido da nota (bloqueado) e o cartão do iPhone também cabem
  await page.evaluate(() => { sessionStorage.setItem('mare:perm', 'denied'); }); // o aparelho de mentira lembra a permissão ao recarregar
  await page.reload();
  await tab(page, 'Ajustes').click();
  await expect(alertNote(page)).toHaveText(NOTES.denied);
  await over('Ajustes (avisos bloqueados)');
  await shot('Ajustes com avisos bloqueados');
});

test('layout: o cartão dos avisos no iPhone sem instalar cabe em qualquer tela', async ({ page }, info) => {
  await device(page, { perm: 'default', standalone: false, ua: IPHONE });
  await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON });
  await page.goto('/');
  await tabF(page).click();
  await expect(fpush(page)).toContainText('Avisos da turma no iPhone');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral').toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Amigos cartão iPhone.png', fullPage: true });
  await fpush(page).getByRole('button', { name: 'Como instalar' }).click();
  await page.waitForTimeout(500);
  const box = await page.locator('#sheet .sheet, #sheet').first().boundingBox();
  expect(box && box.width, 'painel mais largo que a tela').toBeLessThanOrEqual(page.viewportSize().width + 1);
});
