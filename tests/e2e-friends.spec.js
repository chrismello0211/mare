// Maré — testes de interface dos amigos (Parte 9). Rodar: npm run test:e2e
// A nuvem é a "nuvem de mentira" de tests/helpers/fake-cloud.browser.js (mesmo formato de estado e mesmos códigos de erro do social-cloud.js).
// As regras e o servidor de verdade são cobertos por tests/rules/ (npm run test:rules). Qualquer erro de JavaScript na página reprova.
import { test, expect } from '@playwright/test';
import { seed } from './helpers/seed.js';
import { stubFriendsCloud, CREW, UID, SOCIAL_ON } from './helpers/friends.js';

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
const calls = (page) => page.evaluate(() => (window.__fake ? window.__fake.calls.slice() : []));
const lastPayload = (page) => page.evaluate(() => { const p = window.__fake.payloads; return p[p.length - 1]; });
const dayNow = (page) => page.evaluate(() => { const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); });
const turmaCard = (page) => page.locator('section.card', { has: page.getByRole('heading', { name: 'Sua turma' }) });
const REQS = [
  { uid: UID.gabi, prof: { nm: 'Gabi', mc: 'polvo', ins: ['concha', 'estrela', 'baiacu', 'tartaruga', 'cavalo', 'polvo'] } },
  { uid: UID.hugo, prof: { nm: 'Hugo' } },
];
const ALLMET = CREW.slice(0, 3).map((f) => ({ uid: f.uid, prof: Object.assign({}, f.prof, { pct: 100, met: true, st: 5 }) }));

// Abre a aba Amigos num aparelho que já usa os amigos. f = o que a nuvem de mentira já sabe; o = estado do app
async function open(page, f, o) {
  await stubFriendsCloud(page, Object.assign({ code: 'ABCD2345' }, f || {}));
  await seed(page, Object.assign({ todayMl: 1400, social: SOCIAL_ON }, o || {}));
  await page.goto('/');
  await tabF(page).click();
}

/* ---------- entrar nos amigos ---------- */
test.describe('entrada', () => {
  test('a tela de entrada explica o que é visto e não liga nada sozinha', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/');
    await tabF(page).click();
    await expect(page.getByRole('heading', { name: 'Beba água em boa companhia' })).toBeVisible();
    await expect(page.locator('.see')).toContainText('Nunca veem');
    await expect(page.locator('.see')).toContainText('Quantos litros você bebeu');
    await expect(page.locator('#frNick')).toHaveValue('Ana'); // o primeiro nome vira o apelido de partida
    await expect(page.getByRole('switch', { name: /Mostrar meu progresso/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Ativar amigos' })).toBeEnabled();
    expect(await calls(page)).not.toContain('join');
    expect((await stored(page)).social.on).toBe(false);
  });

  test('ativar com apelido próprio e progresso escondido: só o necessário vai para a nuvem', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false }, todayMl: 1400 });
    await page.goto('/');
    await tabF(page).click();
    await page.locator('#frNick').fill('  Aninha  ');
    const share = page.getByRole('switch', { name: /Mostrar meu progresso/ });
    await share.click();
    await expect(share).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    await expect(page.getByRole('heading', { name: 'Sua turma' })).toBeVisible();
    await expect(page.locator('.code')).toHaveText('ABCD-2345');
    expect((await stored(page)).social).toMatchObject({ on: true, nick: 'Aninha', share: false, code: 'ABCD2345' });
    const sent = await lastPayload(page);
    expect(Object.keys(sent).sort()).toEqual(['day', 'ins', 'mc', 'met', 'nm', 'pct', 'sh', 'st', 'v']); // nada de litros, peso, horários…
    expect(sent).toMatchObject({ nm: 'Aninha', pct: null, met: false, st: 0, sh: false });
    expect(JSON.stringify(sent)).not.toContain('1400');
  });

  test('sem apelido não ativa; se o servidor recusar, a tela explica e dá para tentar de novo', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/');
    await tabF(page).click();
    await page.locator('#frNick').fill('   ');
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(page.locator('#frErr')).toContainText('Escolha um apelido');
    expect(await calls(page)).not.toContain('join');
    await page.locator('#frNick').fill('Ana');
    await page.evaluate(() => { window.__fake.fail.join = 'rules'; });
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(page.locator('#frErr')).toContainText('ainda não foram liberados');
    expect((await stored(page)).social.on).toBe(false);
    await page.getByRole('button', { name: 'Ativar amigos' }).click(); // segunda tentativa funciona
    await expect(toast(page)).toContainText('Amigos ativados');
    expect((await stored(page)).social.on).toBe(true);
  });

  test('sem a nuvem do Maré, a entrada avisa e não deixa ativar (nada trava)', async ({ page }) => {
    await seed(page, { social: { on: false } }); // sem stub: a nuvem fica desligada nos testes (navigator.webdriver)
    await page.goto('/');
    await tabF(page).click();
    await expect(page.locator('#frErr')).toContainText('precisam da nuvem');
    await expect(page.getByRole('button', { name: 'Ativar amigos' })).toBeDisabled();
  });

  test('convite por link com os amigos desligados: mostra quem convidou e pede amizade ao ativar', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/?amigo=ZZZZ2222');
    await expect(page).toHaveURL(/\/$/); // o código sai do endereço
    await expect(page.getByText('Zé convidou você!')).toBeVisible();
    await page.getByRole('button', { name: 'Ativar e pedir amizade' }).click();
    await expect(toast(page)).toContainText('Pedido enviado para Zé');
    const c = await calls(page);
    expect(c.indexOf('join')).toBeGreaterThanOrEqual(0);
    expect(c.indexOf('request')).toBeGreaterThan(c.indexOf('join'));
    await expect(page.getByRole('heading', { name: 'Convites enviados' })).toBeVisible();
  });

  test('convite por link: quem ainda não fez o onboarding cai nos amigos no fim dele', async ({ page }) => {
    await stubFriendsCloud(page);
    await page.goto('/?amigo=ZZZZ2222');
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
    await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click();
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page', { timeout: 6000 });
    await expect(page.getByText('Zé convidou você!')).toBeVisible();
  });

  test('"Ignorar convite" tira o aviso e deixa a tela de entrada como estava', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/?amigo=ZZZZ2222');
    await expect(page.getByText('Zé convidou você!')).toBeVisible();
    await page.getByRole('button', { name: 'Ignorar convite' }).click();
    await expect(page.getByText('Zé convidou você!')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ativar amigos' })).toBeVisible();
  });
});

/* ---------- a lista ---------- */
test.describe('lista da turma', () => {
  test('todos os estados, em ordem alfabética e sem litros nem ranking', async ({ page }) => {
    await open(page, { friends: CREW, reqIn: REQS });
    const names = await turmaCard(page).locator('.fr-t b').allTextContents();
    expect(names).toEqual(['Bia', 'Caio', 'Duda', 'Edu', 'Fê']); // alfabética: a lista não vira ranking
    const row = (n) => page.locator('li.fr', { has: page.locator('.fr-t b', { hasText: new RegExp('^' + n + '$') }) });
    await expect(row('Bia')).toContainText('Meta batida hoje');
    await expect(row('Bia')).toContainText('12 dias seguidos');
    await expect(row('Caio')).toContainText('45% da meta de hoje');
    await expect(row('Caio')).toContainText('3 dias seguidos');
    await expect(row('Duda')).toContainText('Ainda sem registros hoje');
    await expect(row('Edu')).toContainText('Progresso do dia em pausa');
    await expect(row('Fê')).toContainText('Sem novidades há 4 dias');
    const txt = await page.locator('#view').innerText();
    expect(txt, 'a tela mostra volumes').not.toMatch(/\d[\d.,]*\s?(ml|mL|L|oz)\b/);
    expect(txt, 'a tela parece um ranking').not.toMatch(/ranking:|posição|#\d|\b\d+º\b/i);
    await expect(page.getByText('Maré da turma')).toBeVisible();
    await expect(page.getByText('1 de 4 já bateu a meta hoje')).toBeVisible(); // eu + Bia + Caio + Duda; Edu (em pausa) e Fê (ausente) ficam de fora
  });

  test('turma quieta: texto acolhedor, sem barra de progresso', async ({ page }) => {
    await open(page, { friends: [CREW[3], CREW[4]] });
    await expect(page.getByText('Sua turma está quieta por enquanto')).toBeVisible();
    await expect(page.locator('.tide .bar')).toHaveCount(0);
  });

  test('turma completa: card verde na aba e festa uma única vez por dia', async ({ page }) => {
    await stubFriendsCloud(page, { friends: ALLMET, code: 'ABCD2345' });
    await seed(page, { todayMl: 2900, social: SOCIAL_ON });
    await page.goto('/');
    await expect(page.locator('.medal-pop')).toContainText('Turma completa!');
    await expect(page.locator('.medal-pop')).toBeHidden({ timeout: 6000 });
    await tabF(page).click();
    await expect(page.locator('.tide.all')).toContainText('Turma completa!');
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.locator('.medal-pop')).toHaveCount(0); // já comemorou hoje
  });

  test('sem amigos ainda: convite e estado vazio simpático', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Seu recife ainda está sozinho')).toBeVisible();
    await expect(page.locator('.code')).toHaveText('ABCD-2345');
    await expect(page.locator('.tide')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Compartilhar convite/ })).toBeEnabled();
  });

  test('aviso de "sem internet" mantém a lista guardada no aparelho e permite tentar de novo', async ({ page }) => {
    await page.addInitScript(() => {
      const p = (n) => (n < 10 ? '0' : '') + n, d = new Date(), k = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      localStorage.setItem('mare:social', JSON.stringify({ code: 'ABCD2345', at: Date.now(), reqIn: [], reqOut: [],
        friends: [{ uid: 'biauid00000000000000000001', nm: 'Bia', mc: 'tartaruga', ins: ['concha', 'estrela', 'baiacu', 'tartaruga'], pct: 100, met: true, st: 12, day: k, sh: true, since: Date.now() - 864e5 * 3, mine: null, theirs: null }] }));
    });
    await open(page, { startErr: 'offline' });
    await expect(page.getByText('Sem internet agora')).toBeVisible();
    await expect(turmaCard(page).locator('.fr-t b')).toHaveText(['Bia']);
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect.poll(async () => (await calls(page)).filter((c) => c === 'refresh').length).toBeGreaterThan(0);
  });

  test('sem a nuvem do Maré, a aba mostra o que foi guardado e oferece tentar de novo', async ({ page }) => {
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/');
    await tabF(page).click();
    await expect(page.getByText('Sem conexão com a nuvem do Maré')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
    await expect(page.locator('.code')).toHaveText('ABCD-2345'); // o código guardado no aparelho continua à vista
  });
});

/* ---------- pedidos ---------- */
test.describe('pedidos de amizade', () => {
  test('aceitar vira amizade com festa; "Agora não" recusa; a bolinha da aba some', async ({ page }) => {
    await open(page, { friends: CREW, reqIn: REQS });
    await expect(page.getByRole('heading', { name: 'Pedidos de amizade' })).toBeVisible();
    await expect(tabF(page)).toHaveAccessibleName('Amigos (novidades)');
    const rq = (n) => page.locator('li.rq', { hasText: n });
    await rq('Gabi').getByRole('button', { name: 'Aceitar' }).click();
    await expect(page.locator('.medal-pop')).toContainText('Gabi');
    await expect(page.locator('.medal-pop')).toContainText('Nova amizade');
    await expect(turmaCard(page).locator('.fr-t b')).toHaveText(['Bia', 'Caio', 'Duda', 'Edu', 'Fê', 'Gabi']);
    await rq('Hugo').getByRole('button', { name: /Agora não/ }).click();
    await expect(toast(page)).toContainText('Pedido recusado');
    await expect(page.getByRole('heading', { name: 'Pedidos de amizade' })).toHaveCount(0);
    await expect(tabF(page)).toHaveAccessibleName('Amigos');
    const c = await calls(page);
    expect(c).toContain('accept');
    expect(c).toContain('decline');
  });

  test('pedido novo chega com a aba fechada: aviso com atalho e bolinha na aba', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/');
    await expect(page.locator('#tabbar')).toBeVisible();
    await page.waitForFunction(() => window.__fake && window.__fake.started);
    await page.waitForTimeout(300);
    await page.evaluate((u) => window.__fake.incoming(u, { nm: 'Hugo' }), UID.hugo);
    await expect(toast(page)).toContainText('Hugo quer acompanhar o dia com você');
    await expect(tabF(page)).toHaveAccessibleName('Amigos (novidades)');
    await toast(page).getByRole('button', { name: 'Ver' }).click();
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('li.rq')).toContainText('Hugo');
  });
});

/* ---------- convidar por código ---------- */
test.describe('inserir código', () => {
  const code = (page) => page.locator('#frCode');
  const find = (page) => page.getByRole('button', { name: 'Procurar' });
  test('código válido: encontra a pessoa, envia o pedido e o convite aparece como enviado', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Inserir código');
    await code(page).fill('zzzz 2222');
    await find(page).click();
    await expect(sheet(page)).toContainText('Encontrei!');
    await expect(sheet(page)).toContainText('Zé');
    await sheet(page).getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(toast(page)).toContainText('Pedido enviado para Zé');
    await expect(page.getByRole('heading', { name: 'Convites enviados' })).toBeVisible();
    await expect(page.locator('li.fr', { hasText: 'Zé' })).toContainText('convite enviado');
    // do outro lado, a pessoa aceita: festa e amizade
    await page.evaluate((u) => window.__fake.accepted(u), UID.ze);
    await expect(page.locator('.medal-pop')).toContainText('Zé aceitou seu pedido');
    await expect(turmaCard(page).locator('.fr-t b')).toHaveText(['Zé']);
    await expect(page.getByRole('heading', { name: 'Convites enviados' })).toHaveCount(0);
  });

  test('cancelar o convite enviado', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await code(page).fill('ZZZZ2222');
    await find(page).click();
    await sheet(page).getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page.getByRole('heading', { name: 'Convites enviados' })).toBeVisible();
    await page.getByRole('button', { name: /Cancelar o convite para Zé/ }).click();
    await expect(toast(page)).toContainText('Convite cancelado');
    await expect(page.getByRole('heading', { name: 'Convites enviados' })).toHaveCount(0);
  });

  test('códigos que não servem: curto, inexistente e o próprio', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await code(page).fill('abc');
    await find(page).click();
    await expect(page.locator('#frErr')).toContainText('8 letras e números');
    expect(await calls(page)).not.toContain('lookup');
    await code(page).fill('AAAA-3333');
    await find(page).click();
    await expect(page.locator('#frErr')).toContainText('Não encontrei esse código');
    await code(page).fill('abcd 2345');
    await find(page).click();
    await expect(page.locator('#frErr')).toContainText('seu próprio código');
    await expect(find(page)).toBeEnabled();
  });

  test('aceita o link inteiro do convite colado no campo', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await code(page).fill('https://chrismello0211.github.io/mare/?amigo=ZZZZ-2222');
    await find(page).click();
    await expect(sheet(page)).toContainText('Encontrei!');
  });

  test('"Voltar" refaz a busca sem perder o que foi digitado', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await code(page).fill('ZZZZ2222');
    await find(page).click();
    await sheet(page).getByRole('button', { name: 'Voltar' }).click();
    await expect(code(page)).toHaveValue('ZZZZ2222');
  });

  test('pedido cruzado: quem já tinha pedido a minha amizade vira amigo na hora', async ({ page }) => {
    await open(page, { reqIn: [REQS[0]] });
    await page.evaluate((u) => window.__fake.registerCode('GABE2222', { uid: u, nm: 'Gabi', mc: 'polvo' }), UID.gabi); // (sem I, L, O, 0, 1: o alfabeto do convite)
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await code(page).fill('GABE2222');
    await find(page).click();
    await sheet(page).getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page.locator('.medal-pop')).toContainText('Você e Gabi agora se acompanham');
    await expect(turmaCard(page).locator('.fr-t b')).toHaveText(['Gabi']);
    await expect(page.getByRole('heading', { name: 'Pedidos de amizade' })).toHaveCount(0);
  });

  test('limite de amigos e falhas do servidor viram mensagens, não erros', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Inserir código' }).click();
    await code(page).fill('ZZZZ2222');
    await page.evaluate(() => { window.__fake.fail.lookup = 'offline'; });
    await find(page).click();
    await expect(page.locator('#frErr')).toContainText('Sem conexão no momento');
    await find(page).click(); // funciona na segunda
    await page.evaluate(() => { window.__fake.fail.request = 'full'; });
    await sheet(page).getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(sheet(page)).toContainText('limite de 30 amigos');
  });

  test('convite por link com os amigos ligados abre o painel já com o resultado', async ({ page }) => {
    await stubFriendsCloud(page, { code: 'ABCD2345' });
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/?amigo=ZZZZ2222');
    await expect(sheet(page)).toContainText('Encontrei!', { timeout: 6000 });
    await expect(sheet(page)).toContainText('Zé');
    await expect(page).toHaveURL(/\/$/);
  });

  test('compartilhar o convite e copiar o código', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'permissões da área de transferência só no Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await page.getByRole('button', { name: 'Copiar código' }).click();
    await expect(toast(page)).toContainText('Código copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ABCD-2345');
  });
});

/* ---------- acenos ---------- */
test.describe('acenos', () => {
  test('um aceno por amigo por dia: "oi" para quem está no caminho, "parabéns" para quem bateu a meta', async ({ page }) => {
    await open(page, { friends: CREW });
    const hoje = await dayNow(page);
    await page.getByRole('button', { name: 'Acenar para Caio' }).dblclick(); // dois toques rápidos: vale um só
    await expect(toast(page)).toContainText('Aceno enviado para Caio');
    await expect(page.getByRole('button', { name: 'Aceno enviado para Caio hoje' })).toBeDisabled();
    await page.getByRole('button', { name: 'Dar parabéns a Bia' }).click();
    await expect(toast(page)).toContainText('Parabéns enviado para Bia');
    const c = await calls(page);
    expect(c.filter((x) => x === 'wave').length).toBe(2);
    await expect.poll(() => page.evaluate(() => window.__fake.lastWave)).toEqual({ uid: UID.bia, kind: 'cheer', day: hoje }); // o servidor leva um instante
  });

  test('aceno recebido: bolinha na aba, texto na lista e a bolinha some ao ver', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/');
    await page.waitForFunction(() => window.__fake && window.__fake.started);
    await page.waitForTimeout(300);
    await expect(tabF(page)).toHaveAccessibleName('Amigos');
    await page.evaluate((u) => { window.__fake.waveFrom(u.caio, 'hi'); window.__fake.waveFrom(u.bia, 'cheer'); }, UID);
    await expect(tabF(page)).toHaveAccessibleName('Amigos (novidades)');
    await tabF(page).click();
    await expect(page.locator('li.fr', { hasText: 'Caio' })).toContainText('acenou para você');
    await expect(page.locator('li.fr', { hasText: 'Bia' })).toContainText('mandou parabéns pra você');
    await tab(page, 'Hoje').click();
    await expect(tabF(page)).toHaveAccessibleName('Amigos'); // já viu: sem bolinha
  });

  test('falha ao acenar vira aviso e o botão não fica preso', async ({ page }) => {
    await open(page, { friends: CREW });
    await page.evaluate(() => { window.__fake.fail.wave = 'wave'; });
    await page.getByRole('button', { name: 'Acenar para Duda' }).click();
    await expect(toast(page).last()).toContainText('Não deu para acenar agora');
  });
});

/* ---------- painéis ---------- */
test.describe('painéis', () => {
  test('painel do amigo: insígnias com silhuetas, aceno, e se ele muda ou sai com o painel aberto', async ({ page }) => {
    await open(page, { friends: CREW });
    await page.locator('li.fr', { hasText: 'Caio' }).locator('.fr-main').click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Caio');
    await expect(sheet(page)).toContainText('45% da meta de hoje');
    await expect(sheet(page)).toContainText('2 de 10');
    await expect(sheet(page).locator('.reef .rf')).toHaveCount(10);
    await expect(sheet(page).locator('.reef .rf.off')).toHaveCount(8);
    await page.evaluate((u) => window.__fake.person(u, { pct: 80 }), UID.caio); // ele bebeu mais com o painel aberto
    await expect(sheet(page)).toContainText('80% da meta de hoje');
    await sheet(page).getByRole('button', { name: /Acenar/ }).click();
    await expect(sheet(page).getByRole('button', { name: /Aceno enviado hoje/ })).toBeDisabled();
    await page.evaluate((u) => window.__fake.unfriend(u), UID.caio); // e desfaz a amizade
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(turmaCard(page).locator('.fr-t b')).not.toContainText(['Caio']);
  });

  test('remover amizade pede confirmação e dá para voltar atrás', async ({ page }) => {
    await open(page, { friends: CREW });
    await page.locator('li.fr', { hasText: 'Bia' }).locator('.fr-main').click();
    await sheet(page).getByRole('button', { name: 'Remover amizade' }).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Remover amizade?');
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(turmaCard(page).locator('.fr-t b').first()).toHaveText('Bia');
    await page.locator('li.fr', { hasText: 'Bia' }).locator('.fr-main').click();
    await sheet(page).getByRole('button', { name: 'Remover amizade' }).click();
    await sheet(page).getByRole('button', { name: 'Remover', exact: true }).click();
    await expect(toast(page)).toContainText('Amizade desfeita');
    await expect(turmaCard(page).locator('.fr-t b')).toHaveText(['Caio', 'Duda', 'Edu', 'Fê']);
  });

  test('meu perfil: apelido, mascote e progresso do dia', async ({ page }) => {
    await open(page, { friends: CREW }, { history: [30, 2800], insignias: { concha: 30, estrela: 25, baiacu: 20, tartaruga: 12, cavalo: 3 } });
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Meu perfil');
    await expect(sheet(page)).toContainText('50% da meta de hoje');
    const nick = page.locator('#frNickIn');
    await nick.fill('Aninha');
    await nick.blur();
    await expect(page.locator('#frNm')).toHaveText('Aninha');
    expect((await stored(page)).social.nick).toBe('Aninha');
    expect(await page.evaluate(() => window.__fake.touches)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__fake.hooks.payload().nm)).toBe('Aninha');
    // mascote: só as insígnias conquistadas viram botão
    await expect(sheet(page).getByRole('button', { name: /usar como mascote/ })).toHaveCount(4);
    await sheet(page).getByRole('button', { name: 'Baiacu, usar como mascote' }).click();
    await expect(toast(page)).toContainText('Mascote trocado');
    expect((await stored(page)).profile.mascot).toBe('baiacu');
    expect(await page.evaluate(() => window.__fake.hooks.payload().mc)).toBe('baiacu');
    // pausar o progresso: os amigos passam a ver só nome e insígnias
    await sheet(page).getByRole('switch', { name: /Mostrar meu progresso/ }).click();
    const p = await page.evaluate(() => window.__fake.hooks.payload());
    expect(p).toMatchObject({ sh: false, pct: null, met: false, st: 0 });
    await expect(sheet(page)).toContainText('Progresso do dia em pausa');
  });

  test('apelido apagado volta ao anterior com um aviso', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await page.locator('#frNickIn').fill('   ');
    await page.locator('#frNickIn').blur();
    await expect(toast(page)).toContainText('Escolha um apelido');
    await expect(page.locator('#frNickIn')).toHaveValue('Ana');
  });

  test('como funciona a privacidade lista o que se vê e o que nunca sai', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Como funciona a privacidade' }).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Como funciona a privacidade');
    await expect(sheet(page)).toContainText('quantos litros ou mililitros você bebeu');
    await expect(sheet(page)).toContainText('sua localização');
    await sheet(page).getByRole('button', { name: 'Entendi' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
  });
});

/* ---------- Hoje e Ajustes ---------- */
test.describe('em outras telas', () => {
  test('Hoje: a faixa da turma só aparece com amigos e abre a aba Amigos', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { todayMl: 1400, social: SOCIAL_ON });
    await page.goto('/');
    const strip = page.locator('.crew');
    await expect(strip).toContainText('Maré da turma');
    await expect(strip).toContainText('1 de 4 já bateu a meta hoje');
    await strip.getByRole('button').click();
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
  });

  test('Hoje: sem amigos, nada de faixa (sem cobrança)', async ({ page }) => {
    await stubFriendsCloud(page, { code: 'ABCD2345' });
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/');
    await page.waitForFunction(() => window.__fake && window.__fake.started);
    await page.waitForTimeout(300);
    await expect(page.locator('.crew')).toHaveCount(0);
  });

  test('Ajustes: sem os amigos, "Conhecer" leva à entrada', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { social: { on: false } });
    await page.goto('/');
    await tab(page, 'Ajustes').click();
    await page.getByRole('button', { name: 'Conhecer' }).click();
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Beba água em boa companhia' })).toBeVisible();
  });

  test('Ajustes: perfil, novo código de convite e sair dos amigos', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/');
    await tab(page, 'Ajustes').click();
    await expect(page.getByText('Ana · o que seus amigos veem')).toBeVisible();
    await page.getByRole('button', { name: 'Trocar', exact: true }).click();
    await expect(sheet(page)).toContainText('os pedidos que já chegaram continuam como estão');
    await sheet(page).getByRole('button', { name: 'Trocar', exact: true }).click();
    await expect(toast(page)).toContainText('Novo código: NEWC-2223');
    await tabF(page).click();
    await expect(page.locator('.code')).toHaveText('NEWC-2223');
    await tab(page, 'Ajustes').click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu dos amigos');
    const st = await stored(page);
    expect(st.social).toMatchObject({ on: false, code: '' });
    expect(await page.evaluate(() => localStorage.getItem('mare:social'))).toBeNull(); // a cópia local dos amigos também some
    expect(await calls(page)).toContain('leave');
    await expect(page.getByRole('button', { name: 'Conhecer' })).toBeVisible();
    await tabF(page).click();
    await expect(page.getByRole('heading', { name: 'Beba água em boa companhia' })).toBeVisible();
    expect(await bar(page).locator('.td').count()).toBe(0);
  });

  test('Ajustes: se sair falhar, continua nos amigos e avisa', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { social: SOCIAL_ON });
    await page.goto('/');
    await tab(page, 'Ajustes').click();
    await page.evaluate(() => { window.__fake.fail.leave = 'offline'; });
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Sem conexão no momento');
    expect((await stored(page)).social.on).toBe(true);
    await expect(page.getByRole('button', { name: 'Abrir' })).toBeVisible();
  });

  test('o que sai do aparelho acompanha o dia: % da meta e sequência, sem volumes', async ({ page }) => {
    await open(page, { friends: CREW }, { todayMl: 2800, history: [5, 2800] });
    const p = await page.evaluate(() => window.__fake.hooks.payload());
    expect(p).toMatchObject({ pct: 100, met: true, sh: true });
    expect(p.st).toBeGreaterThanOrEqual(5);
    expect(Object.keys(p).sort()).toEqual(['day', 'ins', 'mc', 'met', 'nm', 'pct', 'sh', 'st', 'v']);
    expect(JSON.stringify(p)).not.toMatch(/2800|ml/);
  });
});

/* ---------- recusar todos os pedidos ---------- */
test.describe('recusar todos os pedidos', () => {
  const MANY = REQS.concat([{ uid: 'ivouid00000000000000000008', prof: { nm: 'Ivo' } }]); // 3 pedidos
  const all = (page) => page.locator('#view').getByRole('button', { name: 'Recusar todos' }); // o da tela (o do painel de confirmação tem o mesmo nome)
  const confirmAll = (page) => sheet(page).getByRole('button', { name: 'Recusar todos' });

  test('só aparece com 3 pedidos ou mais; pede confirmação, recusa todos e preserva amigos e convites enviados', async ({ page }, info) => {
    await open(page, { friends: CREW, reqIn: REQS });
    await page.evaluate((u) => window.__fake.outgoing(u, { nm: 'Zé', mc: 'polvo' }), UID.ze);
    await expect(page.locator('li.rq')).toHaveCount(2);
    await expect(all(page)).toHaveCount(0); // com 2 pedidos, o botão de cada um basta
    await page.evaluate(() => window.__fake.incoming('ivouid00000000000000000008', { nm: 'Ivo' }));
    await expect(page.locator('li.rq')).toHaveCount(3); // os recebidos (o convite que EU mandei é outra lista)
    await expect(all(page)).toHaveCount(1); // só na lista dos que RECEBI, nunca em "Convites enviados"
    const box = await all(page).boundingBox();
    expect(box && box.height, 'alvo de toque do "Recusar todos"').toBeGreaterThanOrEqual(43.5); // 44 px, menos o arredondamento do layout
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral').toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Amigos com 3 pedidos.png', fullPage: true });
    // pede confirmação (e explica como fechar a porta); cancelar não recusa nada
    await all(page).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Recusar todos os pedidos?');
    await expect(sheet(page)).toContainText('troque o código');
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(page.locator('li.rq')).toHaveCount(3);
    expect(await calls(page)).not.toContain('declineAll');
    // confirma: todos os recebidos saem; o pedido que EU mandei e as amizades continuam
    await all(page).click();
    await confirmAll(page).click();
    await expect(toast(page)).toContainText('3 pedidos recusados');
    await expect(page.getByRole('heading', { name: 'Pedidos de amizade' })).toHaveCount(0);
    await expect(all(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Convites enviados' })).toBeVisible();
    await expect(page.locator('li.fr', { hasText: 'Zé' })).toContainText('convite enviado');
    await expect(turmaCard(page).locator('.fr-t b')).toHaveText(['Bia', 'Caio', 'Duda', 'Edu', 'Fê']);
    await expect(tabF(page)).toHaveAccessibleName('Amigos'); // sem pedidos: sem bolinha
    expect((await calls(page)).filter((c) => c === 'declineAll')).toHaveLength(1);
  });

  test('se a recusa falhar, os pedidos continuam e a tela explica; tentar de novo funciona', async ({ page }) => {
    await open(page, { reqIn: MANY });
    await expect(page.locator('li.rq')).toHaveCount(3);
    await page.evaluate(() => { window.__fake.fail.declineAll = 'offline'; });
    await all(page).click();
    await confirmAll(page).click();
    await expect(toast(page)).toContainText('Sem conexão no momento');
    await expect(page.locator('li.rq')).toHaveCount(3);
    await expect(page.locator('#sheet')).toBeHidden();
    await all(page).click();
    await confirmAll(page).click();
    await expect(toast(page)).toContainText('3 pedidos recusados');
    await expect(page.locator('li.rq')).toHaveCount(0);
  });

  test('a lista de convites enviados nunca ganha o botão, por maior que seja', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      ['ivouid00000000000000000008', 'julouid0000000000000000009', 'kaiouid0000000000000000010', 'leouid000000000000000000011'].forEach((u, i) => { window.__fake.outgoing(u, { nm: 'Conv' + i }); });
    });
    await expect(page.locator('li.fr', { hasText: 'convite enviado' })).toHaveCount(4);
    await expect(all(page)).toHaveCount(0);
  });
});

/* ---------- apagar tudo ---------- */
test.describe('apagar tudo', () => {
  const eraseBtn = (page) => page.getByRole('button', { name: 'Apagar', exact: true });
  const begin = (page) => page.getByRole('button', { name: 'Começar', exact: true });
  async function erase(page) {
    await eraseBtn(page).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Apagar todos os dados?');
    await sheet(page).getByRole('button', { name: 'Apagar tudo' }).click();
  }
  async function ready(page, f, o) {
    await stubFriendsCloud(page, f);
    await seed(page, Object.assign({ todayMl: 1400 }, o || {}));
    await page.goto('/');
    // com os amigos ligados espera a escuta começar; sem eles, basta a nuvem ter subido
    await page.waitForFunction((j) => window.__fake && (!j || window.__fake.started), !!(o && o.social && o.social.on));
    await tab(page, 'Ajustes').click();
  }

  test('com amigos: primeiro sai da rede (perfil, convite, amizades) e só depois apaga o aparelho', async ({ page }) => {
    await ready(page, { friends: CREW, code: 'ABCD2345' }, { social: SOCIAL_ON });
    await page.evaluate(() => { window.__fake.lat = 1200; }); // a saída demora: dá para ver o que o app faz enquanto espera
    await erase(page);
    await expect(toast(page)).toContainText('Apagando');
    expect((await stored(page)).onboarded, 'nada é apagado antes da nuvem confirmar').toBe(true);
    expect((await stored(page)).social.on).toBe(true);
    await expect(begin(page)).toBeVisible({ timeout: 10000 });
    const snaps = await page.evaluate(() => window.__fake.leaveSnaps);
    expect(snaps[0].onboarded, 'quando a nuvem recebeu a saída, o aparelho ainda tinha tudo').toBe(true);
    expect(Object.keys(snaps[0].days).length).toBeGreaterThan(0);
    const st = await stored(page);
    expect(st.onboarded).toBe(false);
    expect(st.social).toMatchObject({ on: false, code: '' });
    expect(Object.keys(st.days)).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('mare:social'))).toBeNull();
  });

  test('com amigos e sem internet: não apaga nada, explica o motivo, volta a escutar e dá para tentar de novo', async ({ page }) => {
    await ready(page, { friends: CREW, code: 'ABCD2345' }, { social: SOCIAL_ON });
    await page.evaluate(() => { window.__fake.fail.leave = 'offline'; });
    await erase(page);
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Não consegui sair dos amigos'); // explica o motivo e oferece o que fazer
    await expect(sheet(page)).toContainText('Confira a internet e tente de novo');
    // uma olhada só, sem esperar: o "Apagando…" some sozinho em ~3 s, e esperar esconderia o defeito
    expect(await page.evaluate(() => document.getElementById('toast').classList.contains('show')), 'o "Apagando…" não fica por cima do aviso').toBe(false);
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    let st = await stored(page);
    expect(st.onboarded).toBe(true);
    expect(st.social.on).toBe(true);
    expect(Object.keys(st.days).length).toBeGreaterThan(0);
    await expect(eraseBtn(page)).toBeVisible(); // continua em Ajustes, com tudo no lugar
    expect((await calls(page)).filter((c) => c === 'start').length, 'voltou a escutar os amigos').toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => window.__fake.started)).toBe(true);
    await erase(page); // a internet voltou
    await expect(begin(page)).toBeVisible({ timeout: 10000 });
    st = await stored(page);
    expect(st.onboarded).toBe(false);
    expect(st.social.on).toBe(false);
  });

  test('um segundo "Apagar tudo" enquanto ainda está saindo dos amigos não repete a saída', async ({ page }) => {
    await ready(page, { friends: CREW, code: 'ABCD2345' }, { social: SOCIAL_ON });
    await page.evaluate(() => { window.__fake.lat = 1500; });
    await erase(page);
    await expect(toast(page)).toContainText('Apagando');
    await erase(page); // outro toque, com a primeira saída ainda a caminho
    await expect(begin(page)).toBeVisible({ timeout: 12000 });
    const leaves = (await calls(page)).filter((c) => c === 'leave').length;
    expect(leaves, 'uma saída do app e a do apagar da nuvem, nunca mais que isso').toBeLessThanOrEqual(2);
  });

  test('sem os amigos ligados, apagar nunca fica preso à nuvem de amigos (mesmo com ela fora do ar)', async ({ page }) => {
    await ready(page, {}, { social: { on: false } });
    await page.evaluate(() => { window.__fake.fail.leave = 'offline'; window.__fake.fail.keep = true; });
    await erase(page);
    await expect(begin(page)).toBeVisible({ timeout: 10000 });
    expect((await stored(page)).onboarded).toBe(false);
  });

  test('sem como sair dos amigos, oferece "Apagar só neste aparelho": cancelar não apaga nada; confirmar apaga o aparelho', async ({ page }) => {
    await ready(page, { friends: CREW, code: 'ABCD2345' }, { social: SOCIAL_ON });
    await page.evaluate(() => { window.__fake.fail.leave = 'offline'; window.__fake.fail.keep = true; }); // a saída falha sempre
    await erase(page);
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Não consegui sair dos amigos');
    await expect(sheet(page)).toContainText('continua na nuvem'); // diz a verdade sobre o que fica
    await expect(sheet(page)).toContainText('ativar os amigos de novo e sair');
    // cancelar: nada foi apagado e os amigos continuam ligados
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    let st = await stored(page);
    expect(st.onboarded).toBe(true);
    expect(st.social.on).toBe(true);
    expect(Object.keys(st.days).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__fake.started), 'voltou a escutar').toBe(true);
    // tenta de novo e, desta vez, apaga só o que é do aparelho
    await erase(page);
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Não consegui sair dos amigos');
    await page.evaluate(() => { window.__fake.wipeHang = true; }); // e o apagar da nuvem não responde: largar a escuta é coisa do próprio aparelho
    await sheet(page).getByRole('button', { name: 'Apagar só neste aparelho' }).click();
    await expect(begin(page)).toBeVisible({ timeout: 10000 });
    st = await stored(page);
    expect(st.onboarded).toBe(false);
    expect(st.social).toMatchObject({ on: false, code: '' });
    expect(Object.keys(st.days)).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('mare:social'))).toBeNull();
    expect(await page.evaluate(() => window.__fake.started), 'sem escuta sobrando depois de apagar (mesmo com a nuvem sem responder)').toBe(false);
  });

  test('abriu o app sem internet e ela voltou: apagar tudo religa a nuvem e sai dos amigos antes de apagar', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345', initFail: 1 }); // a 1ª tentativa de ligar a nuvem falha
    await seed(page, { todayMl: 1400, social: SOCIAL_ON });
    await page.goto('/');
    await page.waitForFunction(() => window.__cloudInit === 1);
    await tab(page, 'Ajustes').click();
    await erase(page);
    await expect(begin(page)).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => window.__cloudInit), 'a nuvem foi religada uma vez').toBe(2);
    const snaps = await page.evaluate(() => window.__fake.leaveSnaps);
    expect(snaps[0].onboarded, 'a saída chegou à nuvem com o aparelho ainda inteiro').toBe(true);
    const st = await stored(page);
    expect(st.onboarded).toBe(false);
    expect(st.social.on).toBe(false);
  });

  test('abriu o app sem internet e ela voltou: sair dos amigos também religa a nuvem', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345', initFail: 1 });
    await seed(page, { todayMl: 1400, social: SOCIAL_ON });
    await page.goto('/');
    await page.waitForFunction(() => window.__cloudInit === 1);
    await tab(page, 'Ajustes').click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu dos amigos', { timeout: 15000 });
    expect(await page.evaluate(() => window.__cloudInit)).toBe(2);
    expect((await stored(page)).social).toMatchObject({ on: false, code: '' });
    expect(await calls(page)).toContain('leave');
  });

  test('sem nuvem de verdade (desligada na configuração), sair dos amigos explica e não trava', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345', initFail: 9 }); // todas as tentativas falham
    await seed(page, { todayMl: 1400, social: SOCIAL_ON });
    await page.goto('/');
    await page.waitForFunction(() => window.__cloudInit === 1);
    await tab(page, 'Ajustes').click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('precisam da nuvem do Maré', { timeout: 15000 });
    expect(await page.evaluate(() => window.__cloudInit), 'uma única segunda chance, sem laço').toBe(2);
    expect((await stored(page)).social.on).toBe(true); // nada mudou
  });

  // Rede travada: o relógio da página é controlado, para "passar" os 40 s que a tela espera sem esperar de verdade
  const leaveBtn = (page) => page.getByRole('button', { name: 'Sair', exact: true });
  async function startSlowLeave(page, o) {
    await page.clock.install();
    await ready(page, { friends: CREW, code: 'ABCD2345' }, { social: SOCIAL_ON });
    await page.evaluate((x) => { window.__fake.lat = 90000; if (x && x.fail) window.__fake.fail.leave = x.fail; }, o || null); // a nuvem só responde 90 s depois
  }
  test('sair dos amigos com a rede travada: avisa que está demorando e, quando a saída termina depois, a tela acompanha', async ({ page }) => {
    await startSlowLeave(page);
    await leaveBtn(page).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Saindo dos amigos');
    await page.clock.fastForward('00:45'); // passou o tempo que a tela espera
    await expect(toast(page)).toContainText('demorando mais que o normal');
    expect((await stored(page)).social.on, 'por enquanto nada mudou na tela').toBe(true);
    await page.clock.fastForward('01:30'); // a nuvem termina a saída
    await expect.poll(async () => (await stored(page)).social.on, 'a tela passa a refletir que saiu').toBe(false);
    expect((await stored(page)).social).toMatchObject({ on: false, code: '' });
    expect(await page.evaluate(() => localStorage.getItem('mare:social')), 'a cópia dos amigos também some').toBeNull();
    await expect(leaveBtn(page), 'Ajustes se redesenha sem o "Sair dos amigos"').toHaveCount(0);
    await tabF(page).click();
    await expect(page.getByRole('button', { name: 'Ativar amigos' })).toBeVisible(); // volta para a entrada, sem lista de amigos
  });
  test('sair dos amigos com a rede travada e a saída falhando depois: o app volta a escutar e a pessoa continua nos amigos', async ({ page }) => {
    await startSlowLeave(page, { fail: 'offline' });
    await leaveBtn(page).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await page.clock.fastForward('00:45');
    await expect(toast(page)).toContainText('demorando mais que o normal');
    expect(await page.evaluate(() => window.__fake.started), 'a saída desligou a escuta enquanto durou').toBe(false);
    await page.clock.fastForward('01:30'); // a saída falha de vez
    await expect.poll(() => page.evaluate(() => window.__fake.started), 'a escuta volta sozinha').toBe(true);
    expect((await stored(page)).social.on).toBe(true);
    await expect(leaveBtn(page)).toBeVisible(); // continua nos amigos
  });
  test('"Apagar tudo" com a rede travada: avisa que não deu e não apaga o aparelho; se a saída termina depois, a tela acompanha sem perder nada', async ({ page }) => {
    await startSlowLeave(page);
    await erase(page);
    await expect(toast(page)).toContainText('Apagando');
    await page.clock.fastForward('00:45');
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Não consegui sair dos amigos');
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    let st = await stored(page);
    expect(st.onboarded).toBe(true);
    expect(st.social.on).toBe(true);
    await page.clock.fastForward('01:30'); // a saída termina depois da espera
    await expect.poll(async () => (await stored(page)).social.on).toBe(false);
    st = await stored(page);
    expect(st.onboarded, 'o aparelho não foi apagado (a pessoa cancelou)').toBe(true);
    expect(Object.keys(st.days).length).toBeGreaterThan(0);
  });

  test('a cópia local dos amigos guarda de quem é (a lista de outra conta nunca vale)', async ({ page }) => {
    await open(page, { friends: CREW, reqIn: REQS });
    await expect.poll(() => page.evaluate(() => { const c = JSON.parse(localStorage.getItem('mare:social') || 'null'); return c ? c.friends.length + ':' + c.reqIn.length : ''; })).toBe('5:2');
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('mare:social')));
    expect(c.uid).toBe(await page.evaluate(() => window.__fake.me));
    expect(Object.keys(c).sort()).toEqual(['at', 'code', 'friends', 'reqIn', 'reqOut', 'uid']);
  });
});

/* ---------- novidades e backup ---------- */
test('a janela de novidades apresenta os amigos e leva até eles', async ({ page }) => {
  await stubFriendsCloud(page);
  await seed(page, { social: { on: false }, ui: { tip_news: 0 } }); // 0 = a dica ainda não foi dispensada
  await page.goto('/');
  await page.getByRole('button', { name: /Ver as novidades/ }).click();
  await expect(sheet(page)).toContainText('Amigos, sem competição');
  await sheet(page).getByRole('button', { name: /amigos/i }).first().click();
  await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
});

test('exportar o backup não leva os amigos (são deste aparelho)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'download simulado só no Chromium');
  await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
  await seed(page, { social: SOCIAL_ON });
  await page.goto('/');
  await tab(page, 'Ajustes').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()]);
  const txt = await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8');
  const j = JSON.parse(txt);
  expect(JSON.stringify(j)).not.toContain('ABCD2345');
  expect(j.social == null || j.social.on !== true).toBe(true);
});

/* ---------- layout ---------- */
test('layout: amigos sem rolagem lateral, alvos de toque confortáveis e screenshots', async ({ page }, info) => {
  await stubFriendsCloud(page, { friends: CREW, reqIn: REQS, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, history: [30, 2800], insignias: { concha: 30, estrela: 25, baiacu: 20, tartaruga: 12, cavalo: 3 } });
  await page.goto('/');
  const over = async (n) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral em ' + n).toBeLessThanOrEqual(0);
  const shot = (n) => page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + n + '.png', fullPage: true });
  await over('Hoje (faixa da turma)');
  await tabF(page).click();
  await page.waitForTimeout(700);
  await over('Amigos');
  await shot('Amigos');
  expect(await page.$$eval('#tabbar .tab', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0);
  expect(await page.$$eval('.fr-wave', (els) => els.filter((e) => e.getBoundingClientRect().width < 40 || e.getBoundingClientRect().height < 40).length), 'botões de aceno pequenos').toBe(0);
  expect(await page.$$eval('.fr-main', (els) => els.filter((e) => e.getBoundingClientRect().height < 48).length), 'linhas da lista baixas').toBe(0);
  for (const [label, open2] of [['painel do amigo', () => page.locator('li.fr', { hasText: 'Bia' }).locator('.fr-main').click()],
    ['meu perfil', () => page.getByRole('button', { name: 'Meu perfil' }).click()],
    ['inserir código', () => page.getByRole('button', { name: 'Inserir código' }).click()],
    ['privacidade', () => page.getByRole('button', { name: 'Como funciona a privacidade' }).click()]]) {
    await open2();
    await page.waitForTimeout(500);
    await over(label);
    const box = await page.locator('#sheet .sheet, #sheet').first().boundingBox();
    expect(box && box.width, 'painel mais largo que a tela: ' + label).toBeLessThanOrEqual(page.viewportSize().width + 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toBeHidden();
  }
  await tab(page, 'Ajustes').click();
  await page.waitForTimeout(500);
  await over('Ajustes (grupo Amigos)');
  await shot('Ajustes com amigos');
});

test('layout: a entrada dos amigos cabe em qualquer tela', async ({ page }, info) => {
  await stubFriendsCloud(page);
  await seed(page, { social: { on: false } });
  await page.goto('/?amigo=ZZZZ2222');
  await expect(page.getByText('Zé convidou você!')).toBeVisible();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral na entrada').toBeLessThanOrEqual(0);
  const cta = await page.locator('#frCta').boundingBox();
  expect(cta && cta.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Amigos entrada.png', fullPage: true });
});
