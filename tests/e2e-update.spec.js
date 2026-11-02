// Maré — atualização automática de ponta a ponta (1.5.1), com um Service Worker de verdade num Chromium de verdade.
// Um servidor de teste imita o GitHub Pages (o app em /mare/, tudo com Cache-Control: max-age=600) e cada "deploy" é a troca da pasta do site no
// meio do teste. Nenhum teste clica em "Atualizar": o que se prova é o que acontece sozinho depois que a pessoa abre ou volta para o app.
// A tela ANTIGA é uma "casca" fiel de uma versão que já foi ao ar: o sw.js real da 1.5.0 (tests/fixtures/sw-1.5.0.js, sem skipWaiting) e o
// registro de atualização dela (o que a 1.5.0 fazia em platform.js), sem saber nada do aviso novo. O mesmo teste foi feito à mão com os ZIPs
// reais da 1.4.0 e da 1.5.0 (HANDOFF, Parte 15). Só roda no Pixel 5: o Service Worker é o mesmo em todos os perfis e cada teste leva alguns segundos.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { seed } from './helpers/seed.js';

const PUB = fileURL('../public');
const CURRENT = /const VERSION = '([^']+)'/.exec(fs.readFileSync(PUB + '/sw.js', 'utf8'))[1];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
function fileURL(rel) { return path.resolve(path.dirname(new URL(import.meta.url).pathname), rel); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.use({ serviceWorkers: 'allow' });
test.describe.configure({ timeout: 90000 });

let tmp = [], servers = [];
test.beforeEach(async ({}, testInfo) => { test.skip(testInfo.project.name !== 'Pixel 5', 'Service Worker de verdade: um perfil basta'); });
test.afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => { s.close(r); })));
  tmp.splice(0).forEach((d) => { fs.rmSync(d, { recursive: true, force: true }); });
});

// O "GitHub Pages": o app em /mare/, Cache-Control: max-age=600, e uma pasta de site que se troca no meio do teste (um deploy novo)
async function site() {
  const st = { root: null, over: {}, down: false };
  const srv = http.createServer((req, res) => {
    if (st.down) { req.socket.destroy(); return; }
    const u = new URL(req.url, 'http://x');
    if (u.pathname.indexOf('/mare/') !== 0) { res.writeHead(404); res.end('nao encontrado'); return; }
    let rel = u.pathname.slice('/mare/'.length) || 'index.html';
    if (rel.slice(-1) === '/') rel += 'index.html';
    const file = st.over[rel] || path.join(st.root, rel);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('nao encontrado'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=600' });
      res.end(buf);
    });
  });
  await new Promise((r) => { srv.listen(0, '127.0.0.1', r); });
  servers.push(srv);
  return { base: 'http://127.0.0.1:' + srv.address().port + '/mare/',
    deploy(dir) { st.root = dir; st.over = {}; }, over(rel, file) { if (file) st.over[rel] = file; else delete st.over[rel]; }, down(v) { st.down = !!v; } };
}
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mare-upd-')); tmp.push(d); return d; };
// uma versão fabricada: o app de hoje com os números de versão trocados (o worker dela anota num cache "proof" cada tela que ELE recarrega)
function next(ver) {
  const d = mk();
  fs.cpSync(PUB, d, { recursive: true });
  fs.writeFileSync(d + '/sw.js', fs.readFileSync(d + '/sw.js', 'utf8').replace("const VERSION = '" + CURRENT + "'", "const VERSION = '" + ver + "'")
    .replace('c.navigate(NEXT)', "(caches.open('proof').then((pc) => pc.put('/nav/' + c.id, new Response('1'))), c.navigate(NEXT))"));
  fs.writeFileSync(d + '/js/app.js', fs.readFileSync(d + '/js/app.js', 'utf8').replace("APP_VERSION = '" + CURRENT + "'", "APP_VERSION = '" + ver + "'"));
  return d;
}
// a tela de uma versão ANTIGA: sw.js real da 1.5.0 + o registro de atualização da 1.5.0 (copiado do platform.js dela) + uma faixa "Nova versão disponível"
function oldApp() {
  const d = mk();
  fs.mkdirSync(d + '/js'); fs.mkdirSync(d + '/css'); fs.mkdirSync(d + '/icons');
  fs.copyFileSync(fileURL('fixtures/sw-1.5.0.js'), d + '/sw.js');
  const sw = fs.readFileSync(d + '/sw.js', 'utf8');
  const core = (/const CORE = \[([^\]]*)\]/.exec(sw)[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));
  core.forEach((f) => { if (f !== './' && f !== './js/app.js') fs.writeFileSync(d + '/' + f.slice(2), f.endsWith('.webmanifest') ? '{}' : ''); }); // o que o sw.js da 1.5.0 exige no cache
  fs.writeFileSync(d + '/index.html', '<!doctype html><meta charset="utf-8"><title>Maré antigo</title><div id="tabbar">app antigo</div><script type="module" src="js/app.js"></script>');
  fs.writeFileSync(d + '/js/app.js', `export const APP_VERSION = '1.5.0';
let waitingSW = null, updating = false;
function registerSW(h) { // exatamente o que o platform.js da 1.5.0 fazia
  h = h || {};
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  sw.addEventListener('controllerchange', function () { if (updating) location.reload(); });
  sw.addEventListener('message', function (e) { if (h.onMessage) h.onMessage(e.data || {}); });
  const found = function (w) { waitingSW = w; if (h.onUpdate) h.onUpdate(); };
  sw.register('./sw.js').then(function (reg) {
    if (reg.waiting && sw.controller) found(reg.waiting);
    reg.addEventListener('updatefound', function () {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', function () { if (w.state === 'installed' && sw.controller) found(w); });
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
  });
}
registerSW({ onUpdate: function () { const b = document.createElement('div'); b.className = 'banner'; b.textContent = 'Nova versão disponível'; document.body.appendChild(b); },
  onMessage: function (m) { window.__msgs = (window.__msgs || []).concat(m.type); } });
`);
  return d;
}

const version = (page) => page.evaluate(() => import('./js/app.js').then((m) => m.APP_VERSION)).catch(() => null);
async function becomes(page, want, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 25000)) { if ((await version(page)) === want) return true; await sleep(150); }
  return false;
}
async function ready(page) {
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 15000 });
  await page.waitForFunction(async () => { const r = await navigator.serviceWorker.ready; return !!(r.active && r.active.state === 'activated'); }, null, { timeout: 15000 });
}
const comeBack = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // a pessoa volta para o app (o que dispara a checagem)
const workerReloads = (page) => page.evaluate(async () => (await (await caches.open('proof')).keys()).length);
const upd = (urls) => urls.filter((u) => /upd=1/.test(u)).length;
// o worker novo já assumiu: o cache novo existe e os caches de versões antigas foram apagados (é nesse instante que ele avisa as telas, "sw-updated")
const took = (page, ver) => expect.poll(() => page.evaluate((v) => caches.keys().then((k) => k.indexOf('mare-' + v) >= 0 && !k.some((n) => /^mare-\d/.test(n) && n !== 'mare-' + v)), ver),
  { timeout: 20000, message: 'o worker ' + ver + ' não assumiu' }).toBe(true);

test('a tela de uma versão antiga (sem skipWaiting, sem conhecer o aviso novo) é atualizada pelo worker novo sem nenhum clique', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 }); // a pessoa já usa o app (o aviso "Maré atualizado" só aparece para quem já passou do onboarding)
  s.deploy(oldApp());
  await page.goto(s.base);
  await ready(page);
  expect(await version(page)).toBe('1.5.0');
  s.deploy(PUB); // o deploy do app de hoje
  await comeBack(page);
  expect(await becomes(page, CURRENT), 'a tela antiga virou ' + CURRENT + ' sozinha').toBe(true);
  expect(upd(urls)).toBe(1); // uma recarga só, no endereço limpo do app
  await expect(page.locator('#toast')).toContainText('Maré atualizado para a versão ' + CURRENT);
  await expect.poll(() => page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.indexOf('mare-') === 0 && n !== 'mare-sdk')))).toEqual(['mare-' + CURRENT]);
});

test('a situação "travada" de uma versão antiga (um worker esperando e ninguém tocou na faixa) também se resolve sozinha', async ({ page }) => {
  const s = await site();
  await seed(page, { todayMl: 500 });
  s.deploy(oldApp());
  await page.goto(s.base);
  await ready(page);
  // sai uma versão intermediária (também antiga, sem skipWaiting) e fica esperando, com a faixa na tela
  const mid = mk();
  fs.cpSync(oldApp(), mid, { recursive: true });
  fs.writeFileSync(mid + '/sw.js', fs.readFileSync(mid + '/sw.js', 'utf8').replace("const VERSION = '1.5.0'", "const VERSION = '1.5.0-b'"));
  s.deploy(mid);
  await comeBack(page);
  await expect(page.locator('.banner')).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(true);
  s.deploy(PUB); // a versão com atualização automática passa por cima da que esperava
  await comeBack(page);
  expect(await becomes(page, CURRENT)).toBe(true);
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(false);
});

test('a tela nova (1.5.1 em diante) recarrega sozinha quando está tranquila, e o worker não precisa recarregá-la (ela responde "sw-ack")', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  await page.locator('#tabbar').waitFor();
  s.deploy(next('9.9.1'));
  await comeBack(page);
  expect(await becomes(page, '9.9.1')).toBe(true);
  await expect(page.locator('#toast')).toContainText('Maré atualizado para a versão 9.9.1');
  await sleep(3500); // passa o prazo (2,5 s) que o worker dá às telas para responderem
  expect(await workerReloads(page)).toBe(0);
  expect(upd(urls)).toBe(1);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('mare:ar'))).v).toBe(CURRENT); // anotou quem recarregou (a trava anti-laço)
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mare:v1'))).days).toBeTruthy(); // os dados continuam lá
});

test('com um painel aberto a tela espera (o valor digitado fica), mostra a faixa depois de alguns segundos e recarrega assim que o painel fecha', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  await page.locator('#eMl').fill('333');
  await page.evaluate(() => { document.activeElement.blur(); }); // sem o cursor no campo: o que segura a recarga é o painel aberto, não a digitação
  s.deploy(next('9.9.1'));
  await comeBack(page);
  await took(page, '9.9.1');
  await sleep(1500);
  expect(await page.locator('.banner').count(), 'a faixa apareceu cedo demais').toBe(0); // um painel aberto por poucos segundos não vira "aviso"
  await expect(page.locator('.banner')).toBeVisible({ timeout: 25000 }); // plano B: a faixa aparece depois de uns 6 s sem sossego
  expect(await version(page)).toBe(CURRENT);
  expect(upd(urls)).toBe(0);
  await expect(page.locator('#eMl')).toHaveValue('333');
  await page.locator('#sheetBody').getByRole('button', { name: 'Cancelar' }).click();
  expect(await becomes(page, '9.9.1', 12000)).toBe(true);
});

test('1ª instalação: nada recarrega, nem atrapalha quem está preenchendo o onboarding', async ({ page }) => {
  const s = await site();
  s.deploy(PUB);
  await page.goto(s.base);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await page.locator('#obName').fill('Carol');
  await page.evaluate(() => { window.__mesma = 'pagina'; });
  await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 15000 });
  await sleep(5000);
  expect(await page.evaluate(() => window.__mesma)).toBe('pagina'); // uma recarga apagaria isto
  await expect(page.locator('#obName')).toHaveValue('Carol');
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('CDN atrasado (o sw.js já é o novo e o app.js ainda é o velho): a instalação falha, nada muda; com o arquivo certo, a próxima checagem atualiza', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  const nova = next('9.9.1');
  s.deploy(nova);
  s.over('js/app.js', PUB + '/js/app.js'); // o app.js ainda é o da versão antiga
  await comeBack(page);
  await sleep(5000);
  expect(await version(page)).toBe(CURRENT);
  expect(upd(urls)).toBe(0);
  expect(await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r.waiting || r.installing); })).toBe(false);
  s.over('js/app.js', null); // o CDN alcançou o deploy
  await comeBack(page);
  expect(await becomes(page, '9.9.1')).toBe(true);
});

test('sem internet na hora da checagem nada quebra; quando a internet volta, atualiza; e depois o app abre offline', async ({ page, context }) => {
  const s = await site();
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  s.deploy(next('9.9.1'));
  s.down(true);
  await comeBack(page);
  await sleep(3000);
  expect(await version(page)).toBe(CURRENT);
  s.down(false);
  await comeBack(page);
  expect(await becomes(page, '9.9.1')).toBe(true);
  await page.locator('#tabbar').waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.locator('#tabbar').waitFor({ timeout: 10000 });
  expect(await version(page)).toBe('9.9.1');
  await context.setOffline(false);
});

test('trava anti-laço: uma versão que já recarregou sozinha há pouco e continua aqui não recarrega de novo; fica só a faixa, e o botão "Atualizar" funciona', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  await page.evaluate((v) => sessionStorage.setItem('mare:ar', JSON.stringify({ v: v, t: Date.now() })), CURRENT);
  s.deploy(next('9.9.1'));
  await comeBack(page);
  await expect(page.locator('.banner')).toBeVisible({ timeout: 25000 });
  await sleep(3500);
  expect(await version(page)).toBe(CURRENT);
  expect(upd(urls)).toBe(0);
  await page.locator('.banner button').click();
  expect(await becomes(page, '9.9.1', 12000)).toBe(true);
});

// "Tranquila" (app.js, calm): cada coisa que a recarga estragaria faz a tela esperar; ao acabar, ela recarrega sozinha
test('com o teclado aberto num campo a tela espera; ao sair do campo, recarrega', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'campo'; document.body.appendChild(i); i.focus(); });
  s.deploy(next('9.9.1'));
  await comeBack(page);
  await sleep(6500);
  expect(await version(page)).toBe(CURRENT);
  expect(upd(urls)).toBe(0);
  await page.evaluate(() => document.getElementById('campo').blur());
  expect(await becomes(page, '9.9.1', 12000)).toBe(true);
});

test('onboarding em andamento: a tela espera (o que a pessoa preenche não se perde) e mostra a faixa', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  s.deploy(PUB);
  await page.goto(s.base);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await page.locator('#obName').fill('Carol');
  await ready(page);
  await page.evaluate(() => { window.__mesma = 'pagina'; document.activeElement.blur(); }); // sem o cursor no campo: o que segura a recarga é o onboarding em si
  s.deploy(next('9.9.1'));
  await comeBack(page);
  await expect(page.locator('.banner')).toBeVisible({ timeout: 25000 });
  await sleep(2500);
  expect(await page.evaluate(() => window.__mesma)).toBe('pagina'); // nenhuma recarga
  expect(upd(urls)).toBe(0);
  await expect(page.locator('#obName')).toHaveValue('Carol');
});

test('com o app em segundo plano (tela escondida) ela espera; ao voltar para o app, recarrega', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  const vis = (v) => page.evaluate((x) => { Object.defineProperty(document, 'visibilityState', { get: () => x, configurable: true }); }, v);
  s.deploy(next('9.9.1'));
  await comeBack(page); // a checagem sai com o app à vista...
  await vis('hidden');  // ...e o app vai para o segundo plano antes de a atualização assumir
  await took(page, '9.9.1');
  await sleep(7000);
  expect(await version(page)).toBe(CURRENT);
  expect(upd(urls)).toBe(0);
  await expect(page.locator('.banner')).toHaveCount(0); // a faixa de reserva só conta o tempo com o app à vista (ninguém a veria)
  await vis('visible');
  await comeBack(page);
  expect(await becomes(page, '9.9.1', 12000)).toBe(true);
});

test('com um aviso na tela (o "Desfazer" do último registro) a tela espera ele sumir antes de recarregar', async ({ page }) => {
  const s = await site();
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  s.deploy(next('9.9.1'));
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Adicionar 250 ml', exact: true }).click(); // o aviso com "Desfazer" fica ~5 s na tela
  await comeBack(page);
  expect(await becomes(page, '9.9.1', 20000)).toBe(true);
  expect(Date.now() - t0, 'recarregou antes de o aviso sumir').toBeGreaterThan(4500);
  const days = JSON.parse(await page.evaluate(() => localStorage.getItem('mare:v1'))).days;
  expect(Object.values(days)[0].entries.map((e) => e.ml)).toEqual([500, 250]); // o registro que a pessoa acabou de fazer está salvo
});

test('com cartões de conquista na tela (e na fila) a tela espera o último sumir antes de recarregar', async ({ page }) => {
  const s = await site();
  const urls = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); });
  await seed(page, { todayMl: 500 });
  s.deploy(PUB);
  await page.goto(s.base);
  await ready(page);
  await page.locator('#tabbar').waitFor();
  s.deploy(next('9.9.1'));
  const t0 = Date.now();
  await page.evaluate(() => import('./js/ui.js').then((m) => { for (let i = 1; i <= 3; i++) m.pop('🏅', 'Medalha', 'Teste ' + i, 'cartão ' + i); })); // 3 cartões em fila: de 6,5 a 8 s na tela
  await comeBack(page);
  await sleep(4500);
  expect(await version(page)).toBe(CURRENT);
  expect(upd(urls)).toBe(0);
  expect(await becomes(page, '9.9.1', 20000)).toBe(true);
  expect(Date.now() - t0, 'recarregou com a fila de cartões ainda na tela').toBeGreaterThan(6000);
});
