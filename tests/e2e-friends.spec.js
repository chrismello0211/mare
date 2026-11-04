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
const turmaCard = (page) => page.locator('section.card', { has: page.getByRole('heading', { name: 'Sua turma' }) }); // o cartão da turma ainda sozinha
const rank = (page) => page.locator('section.rk'); // o ranking da turma: pódio + linhas
const inRank = (page, name) => rank(page).locator('li.rk-r, li.pd', { hasText: name }); // a pessoa no pódio ou numa linha
const openFriend = (page, uid) => page.locator('[data-action="fr-open"][data-id="' + uid + '"]').first().click(); // pódio e linhas abrem o mesmo painel
// o que o aparelho mandaria agora para a nuvem (espera a nuvem de mentira subir: no aparelho mais lento, logo depois de abrir, ela ainda podia não existir)
const payload = async (page) => { await page.waitForFunction(() => window.__fake && window.__fake.hooks && window.__fake.hooks.payload); return page.evaluate(() => window.__fake.hooks.payload()); };
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
    await expect(page.locator('.see')).toContainText('Os registros de cada gole');
    await expect(page.locator('.see')).toContainText('Só se você deixar'); // a meta em ml: a turma só vê com um "sim"
    await expect(page.locator('.see')).toContainText('A sua meta do dia em ml');
    await expect(page.locator('.see')).toContainText('as medalhas que você conquistou'); // 1.5.0: as medalhas fazem parte do que a turma vê
    await expect(page.locator('.see')).toContainText('a porcentagem da meta de hoje (até 150%, ou só até 100% se você preferir)'); // 1.8.0: a % vai até 150; 1.9.0: a pessoa pode limitar a 100, e a tela de entrada avisa
    await expect(page.getByText('os últimos 7 dias e as medalhas. Desligado, seus amigos veem só o apelido e as insígnias.')).toBeVisible(); // e a chave do progresso diz isso
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
    expect(Object.keys(sent).sort()).toEqual(['day', 'gl', 'ins', 'mc', 'md', 'met', 'nm', 'pct', 'sh', 'st', 'v', 'wm']); // nada de litros, peso, horários…
    expect(sent).toMatchObject({ nm: 'Aninha', pct: null, met: false, st: 0, sh: false, gl: null, wm: null, md: null }); // em pausa: nem a semana, nem a meta, nem as medalhas saem
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

  test('sem a nuvem do Maré, a entrada avisa; o botão continua ativo, tocar explica de novo e nada liga nem trava', async ({ page }) => {
    await seed(page, { social: { on: false } }); // sem stub: a nuvem fica desligada nos testes (navigator.webdriver)
    await page.goto('/');
    await tabF(page).click();
    await expect(page.locator('#frErr')).toContainText('precisam da nuvem');
    const cta = page.getByRole('button', { name: 'Ativar amigos' });
    await expect(cta, 'um botão apagado não deixaria tentar de novo quando a internet voltasse').toBeEnabled();
    await cta.click();
    await expect(page.locator('#frErr')).toContainText('precisam da nuvem');
    await expect(cta).toBeEnabled(); // não ficou preso em "Ativando…"
    expect((await stored(page)).social.on).toBe(false);
  });

  // A nuvem não subiu ao abrir o app (sem internet) e depois a internet volta: o app tenta de novo sozinho, sem precisar fechar e abrir.
  // initFail = quantas das primeiras tentativas de ligar a nuvem falham (a página conta as tentativas em window.__cloudInit).
  async function openDown(page, f, o) {
    await stubFriendsCloud(page, Object.assign({ code: 'ABCD2345', initFail: 1 }, f || {}));
    await seed(page, o || { social: { on: false } });
    await page.goto('/');
    await page.waitForFunction(() => window.__cloudInit === 1);
  }
  const tries = (page) => page.evaluate(() => window.__cloudInit);
  test('abriu sem internet e a internet voltou ("online"): a nuvem sobe sozinha, o aviso da entrada some e dá para ativar', async ({ page }) => {
    await openDown(page);
    await tabF(page).click();
    await expect(page.locator('#frErr')).toContainText('precisam da nuvem');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => window.__cloudInit === 2);
    await expect(page.locator('#frErr'), 'a entrada para de dizer que não há nuvem').toHaveText('');
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    expect(await tries(page), 'uma única tentativa nova').toBe(2);
    expect((await stored(page)).social.on).toBe(true);
  });

  test('quem já usa os amigos: ao voltar para o app com a nuvem fora, ela sobe e a turma aparece sem tocar em "Tentar de novo"', async ({ page }) => {
    await openDown(page, { friends: CREW }, { todayMl: 1400, social: SOCIAL_ON });
    await tabF(page).click();
    await expect(page.getByText('Sem conexão com a nuvem do Maré')).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // a página está visível: conta como "voltou ao app"
    await page.waitForFunction(() => window.__cloudInit === 2);
    await expect(rank(page)).toBeVisible();
    await expect(inRank(page, 'Bia')).toHaveCount(1);
    await expect(page.getByText('Sem conexão com a nuvem do Maré')).toHaveCount(0);
    expect(await page.evaluate(() => window.__fake.started), 'a escuta da turma ligou').toBe(true);
  });

  test('uma tentativa por evento: se ela falhar de novo, espera o próximo (nada de laço)', async ({ page }) => {
    await openDown(page, { initFail: 2 }); // a 1ª e a 2ª tentativas falham
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => window.__cloudInit === 2);
    await page.waitForTimeout(500);
    expect(await tries(page), 'sem tentar sozinho de novo').toBe(2);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => window.__cloudInit === 3);
    await tabF(page).click();
    await expect(page.locator('#frErr')).toHaveText('');
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(500);
    expect(await tries(page), 'com a nuvem de pé, os eventos não religam nada').toBe(3);
  });

  test('o navegador ainda diz que está sem rede: nada de tentar; quando a rede volta, tenta', async ({ page }) => {
    await openDown(page);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); });
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(500);
    expect(await tries(page)).toBe(1);
    await page.evaluate(() => { delete navigator.onLine; }); // volta o valor de verdade (com rede)
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => window.__cloudInit === 2);
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
  test('todos os estados no ranking de hoje: pódio, lista e quem fica fora da conta (ninguém é "o último")', async ({ page }) => {
    await open(page, { friends: CREW, reqIn: REQS });
    const rk = rank(page);
    await expect(rk.getByRole('heading', { name: 'Ranking da turma' })).toBeVisible();
    await expect(rk).toContainText('6 pessoas'); // eu + 5 amigos
    // pódio com o primeiro no meio: eu (50%) em 2º, Bia (100%) em 1º e Caio (45%) em 3º
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Você', 'Bia', 'Caio']);
    await expect(rk.locator('li.pd.r1')).toContainText('100%');
    await expect(rk.locator('li.pd.r2')).toContainText('50%');
    await expect(rk.locator('li.pd.r3')).toContainText('45%');
    await expect(rk.locator('li.pd.r1')).toContainText('meta 2.800 ml'); // quem liberou a meta em ml mostra
    await expect(rk.locator('li.pd.r3')).toContainText('meta 3.200 ml');
    // abaixo do pódio: quem está na conta de hoje (Duda: 0%, sem posição) e, à parte, quem não está
    const lists = rk.locator('ul.rk-l');
    await expect(lists.first().locator('.rk-t b')).toHaveText(['Duda']);
    await expect(lists.first().locator('li.rk-r').first().locator('.rk-n')).toHaveText('–');
    await expect(lists.first().locator('li.rk-r').first()).toContainText('Ainda sem registros hoje');
    await expect(lists.first().locator('li.rk-r').first()).not.toContainText('meta '); // Duda não liberou a meta em ml
    await expect(rk.locator('.rk-rest')).toHaveText('Sem dados de hoje');
    await expect(lists.nth(1).locator('.rk-t b')).toHaveText(['Edu', 'Fê']);
    await expect(lists.nth(1).locator('li.rk-r').nth(0)).toContainText('Progresso do dia em pausa');
    await expect(lists.nth(1).locator('li.rk-r').nth(1)).toContainText('Sem novidades há 4 dias');
    // os 7 dias: bolinhas só de quem manda a semana (Edu, em pausa, não); Fê parou há 4 dias, então só 3 dias entram na janela
    await expect(lists.nth(1).locator('li.rk-r').nth(0).locator('.dots')).toHaveCount(0);
    await expect(lists.nth(1).locator('li.rk-r').nth(1).locator('.dt.on')).toHaveCount(3);
    await expect(lists.first().locator('li.rk-r').first().locator('.dots .dt')).toHaveCount(7);
    await expect(lists.first().locator('li.rk-r').first().locator('.dt.on')).toHaveCount(0);
    // a meta em ml só aparece onde a pessoa liberou; o que foi bebido nunca aparece
    const txt = await page.locator('#view').innerText();
    expect(txt.replace(/meta\s[\d.,]+\s?(ml|L|oz)/g, ''), 'a tela mostra volumes que não são a meta liberada').not.toMatch(/\d[\d.,]*\s?(ml|mL|L|oz)\b/);
    expect(txt, 'texto que humilha').not.toMatch(/último|ultimo|lanterna|pior|perdeu/i);
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
    await expect(page.locator('.medal-pop')).toBeHidden({ timeout: 12000 }); // 1.7.0: depois da festa vem na fila o cartão da medalha Turma completa (2 cartões, uns 5,5 s)
    await tabF(page).click();
    await expect(page.locator('.tide.all')).toContainText('Turma completa!');
    await page.reload();
    await tabF(page).click();
    await expect(page.locator('.tide.all')).toContainText('Turma completa!'); // a turma chegou da nuvem: a checagem do dia já rodou (ela vem antes de a tela se refazer)
    await page.waitForTimeout(600);
    await expect(page.locator('.medal-pop')).toHaveCount(0); // já comemorou hoje
  });

  // 1.7.0: a medalha "Turma completa" só nasce aqui, ao vivo: o histórico não sabe o que os amigos fizeram
  test('medalha Turma completa: sai quando você e pelo menos 2 amigos batem a meta no mesmo dia, uma única vez, e vai no perfil que a turma vê (md2)', async ({ page }) => {
    await stubFriendsCloud(page, { friends: ALLMET, code: 'ABCD2345' }); // Bia, Caio e Duda na meta + eu (2900 ml): 4 pessoas
    await seed(page, { todayMl: 2900, social: SOCIAL_ON });
    await page.goto('/');
    await expect.poll(async () => (await stored(page)).achievements.crew, 'a medalha nasce quando a turma chega da nuvem').toBeGreaterThan(0);
    const t0 = (await stored(page)).achievements.crew;
    await expect(page.locator('.medal-pop')).toContainText('Turma completa!'); // primeiro a festa do dia…
    await expect(page.locator('.medal-pop').filter({ hasText: 'Nova medalha' })).toBeVisible({ timeout: 15000 }); // …e depois, na fila, o cartão da medalha
    await expect(page.locator('.medal-pop')).toContainText('Você e pelo menos 2 amigos bateram a meta no mesmo dia');
    expect((await payload(page)).md2 & 32, 'a turma passa a ver a medalha (bit 5 de md2)').toBe(32);
    await page.reload();
    await tabF(page).click();
    await expect(page.locator('.tide.all')).toContainText('Turma completa!'); // a turma voltou da nuvem e a checagem já rodou
    await page.waitForTimeout(600);
    expect((await stored(page)).achievements.crew, 'a data da medalha não muda').toBe(t0);
    await expect(page.locator('.medal-pop')).toHaveCount(0); // nem festa nem cartão: os dois são de uma vez só (por dia e por vida)
  });

  test('medalha Turma completa: com só você e 1 amigo na meta (2 pessoas) a festa do dia acontece, mas a medalha não sai', async ({ page }) => {
    await stubFriendsCloud(page, { friends: ALLMET.slice(0, 1), code: 'ABCD2345' });
    await seed(page, { todayMl: 2900, social: SOCIAL_ON });
    await page.goto('/');
    await expect(page.locator('.medal-pop')).toContainText('Turma completa!');
    expect((await stored(page)).achievements.crew).toBeUndefined();
    await expect(page.locator('.medal-pop')).toBeHidden({ timeout: 6000 });
    await page.waitForTimeout(800);
    await expect(page.locator('.medal-pop')).toHaveCount(0); // nenhum cartão de medalha depois da festa
    expect((await stored(page)).achievements.crew).toBeUndefined();
    const md2 = (await payload(page)).md2 || 0;
    expect(md2 & 32, 'a turma não vê uma medalha que não saiu').toBe(0);
  });

  test('medalha Turma completa: se um dos amigos não bateu a meta, não sai; quando ele bate, com o app aberto, sai na hora', async ({ page }) => {
    const faltou = ALLMET.map((f, i) => (i === 2 ? { uid: f.uid, prof: Object.assign({}, f.prof, { pct: 60, met: false }) } : f));
    await stubFriendsCloud(page, { friends: faltou, code: 'ABCD2345' });
    await seed(page, { todayMl: 2900, social: SOCIAL_ON });
    await page.goto('/');
    await tabF(page).click();
    await expect(page.getByText('3 de 4 já bateram a meta hoje')).toBeVisible();
    await page.waitForTimeout(1200);
    expect((await stored(page)).achievements.crew).toBeUndefined();
    await expect(page.locator('.medal-pop')).toHaveCount(0);
    const t0 = await page.evaluate(() => window.__fake.touches);
    await page.evaluate((u) => window.__fake.person(u, { pct: 100, met: true }), faltou[2].uid); // ele bate a meta com o app aberto
    await expect.poll(async () => (await stored(page)).achievements.crew, 'a medalha sai na hora, ao vivo').toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__fake.touches), 'o perfil que a turma vê é enviado de novo, com a medalha').toBeGreaterThan(t0);
    expect(((await payload(page)).md2 & 32)).toBe(32);
  });

  test('medalha Turma completa: se a turma só chega a 3 pessoas depois da festa do dia, a medalha sai na hora, sem uma segunda festa', async ({ page }) => {
    await stubFriendsCloud(page, { friends: ALLMET.slice(0, 1), code: 'ABCD2345' }); // eu e a Bia, as duas na meta: há festa, mas ainda não há medalha
    await seed(page, { todayMl: 2900, social: SOCIAL_ON });
    await page.goto('/');
    await expect(page.locator('.medal-pop')).toContainText('Turma completa!');
    await expect(page.locator('.medal-pop')).toBeHidden({ timeout: 6000 });
    expect((await stored(page)).achievements.crew).toBeUndefined();
    await page.evaluate((a) => { window.__fake.befriend(a.uid, a.prof); }, ALLMET[1]); // o Caio entra na turma, já na meta
    await expect.poll(async () => (await stored(page)).achievements.crew, 'a medalha sai quando a turma chega a 3').toBeGreaterThan(0);
    await expect(page.locator('.medal-pop')).toContainText('Nova medalha');
    await expect(page.locator('.medal-pop')).not.toContainText('Todo mundo bateu a meta hoje'); // a festa do dia já foi (é uma por dia)
  });

  test('medalha Turma completa: com a Jornada aberta, o cartão da medalha acende na hora', async ({ page }) => {
    const faltou = ALLMET.map((f, i) => (i === 2 ? { uid: f.uid, prof: Object.assign({}, f.prof, { pct: 60, met: false }) } : f));
    await stubFriendsCloud(page, { friends: faltou, code: 'ABCD2345' });
    await seed(page, { todayMl: 2900, social: SOCIAL_ON });
    await page.goto('/');
    await tab(page, 'Jornada').click();
    const crew = page.locator('.medals .medal').filter({ has: page.locator('b', { hasText: /^Turma completa$/ }) });
    await expect(crew).toHaveClass(/off/);
    await page.evaluate((u) => window.__fake.person(u, { pct: 100, met: true }), faltou[2].uid);
    await expect(crew).not.toHaveClass(/off/); // sem sair da aba
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
    await expect(inRank(page, 'Bia')).toHaveCount(1);
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

/* ---------- o ranking da turma ---------- */
test.describe('ranking da turma', () => {
  const view = (page, v) => page.locator('#view [data-action="fr-rank"][data-v="' + v + '"]');

  test('as três visões: Hoje, Semana e Sequência; a escolha fica guardada ao reabrir', async ({ page }) => {
    // eu: os 6 dias anteriores na meta e hoje em 50%. Os 18 L de água já deram a concha e a estrela-do-mar: sem elas guardadas, o painel
    // "Você desbloqueou" abre sozinho uns 2 s depois de o app carregar e, num aparelho lento, cobre os cliques no meio do teste
    await open(page, { friends: CREW }, { history: [6, 2800], insignias: { concha: 8, estrela: 7 } });
    const rk = rank(page), lists = rk.locator('ul.rk-l');
    await expect(rk.getByRole('radio')).toHaveText(['Hoje', 'Semana', 'Sequência']);
    await expect(view(page, 'day')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.tide')).toContainText('Maré da turma');
    // Semana: dias na meta nos últimos 7. Eu 6, Bia 7, Caio 5, Fê 3 (parou há 4 dias: só 3 dias entram na janela), Duda 0; Edu (em pausa) fica de fora
    await view(page, 'week').click();
    await expect(view(page, 'week')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.tide')).toContainText('Semana da turma');
    await expect(page.locator('.tide-t')).toHaveText('A turma bateu a meta 21 vezes'); // 6 + 7 + 5 + 3 + 0
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Você', 'Bia', 'Caio']);
    await expect(rk.locator('li.pd.r1')).toContainText('7/7');
    await expect(rk.locator('li.pd.r2')).toContainText('6/7');
    await expect(rk.locator('li.pd.r3')).toContainText('5/7');
    await expect(lists.first().locator('.rk-t b')).toHaveText(['Fê', 'Duda']);
    await expect(lists.first().locator('li.rk-r').nth(0)).toContainText('3/7');
    await expect(lists.first().locator('li.rk-r').nth(0).locator('.rk-n')).toHaveText('4');
    await expect(lists.first().locator('li.rk-r').nth(1)).toContainText('0/7');
    await expect(lists.first().locator('li.rk-r').nth(1).locator('.rk-n')).toHaveText('–'); // quem tem zero não ganha posição
    await expect(rk.locator('.rk-rest')).toHaveText('Sem dados da semana');
    await expect(lists.nth(1).locator('.rk-t b')).toHaveText(['Edu']);
    // Sequência: Bia 12, eu 6, Caio 3; quem parou (Duda e Fê) fica com "–"
    await view(page, 'streak').click();
    await expect(view(page, 'streak')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.tide')).toContainText('Sequências da turma');
    await expect(page.locator('.tide-t')).toHaveText('A maior sequência da turma: 12 dias');
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Você', 'Bia', 'Caio']);
    await expect(rk.locator('li.pd.r1')).toContainText('12');
    await expect(rk.locator('li.pd.r2')).toContainText('6');
    await expect(rk.locator('li.pd.r3')).toContainText('3');
    expect((await lists.first().locator('.rk-t b').allTextContents()).sort()).toEqual(['Duda', 'Fê']);
    await expect(rk.locator('.rk-rest')).toHaveText('Sem dados de sequência');
    // a escolha fica guardada
    expect((await stored(page)).ui.frRank).toBe('streak');
    await page.reload();
    await tabF(page).click();
    await expect(view(page, 'streak')).toHaveAttribute('aria-checked', 'true');
    await view(page, 'day').click();
    await expect(page.locator('.tide')).toContainText('Maré da turma');
    expect((await stored(page)).ui.frRank).toBe('day');
  });

  test('quem manda uma versão antiga (sem os 7 dias) entra no "Hoje" e fica à parte na "Semana"', async ({ page }) => {
    await open(page, { friends: [{ uid: UID.ze, prof: { nm: 'Zé', mc: 'polvo', pct: 10 } }] });
    await expect(inRank(page, 'Zé').locator('.dots')).toHaveCount(0);
    await expect(rank(page).locator('.rk-rest')).toHaveCount(0);
    await view(page, 'week').click();
    await expect(rank(page).locator('.rk-rest')).toHaveText('Sem dados da semana');
    await expect(rank(page).locator('ul.rk-l').nth(1).locator('.rk-t b')).toHaveText(['Zé']);
  });

  test('com menos de três pessoas com algo a mostrar não há pódio: só a lista, com as posições', async ({ page }) => {
    await open(page, { friends: [CREW[0]] }); // eu e a Bia
    await expect(rank(page).locator('li.pd')).toHaveCount(0);
    await expect(rank(page).locator('ul.rk-l li.rk-r .rk-n')).toHaveText(['1', '2']);
    await expect(rank(page).locator('ul.rk-l li.rk-r .rk-t b')).toHaveText(['Bia', 'Ana você']);
    await page.evaluate((u) => window.__fake.befriend(u, { nm: 'Duda', pct: 0 }), UID.duda); // com a terceira em 0%, ainda não é pódio
    await expect(inRank(page, 'Duda')).toHaveCount(1);
    await expect(rank(page).locator('li.pd')).toHaveCount(0);
    await page.evaluate((u) => window.__fake.person(u, { pct: 10 }), UID.duda); // com algo a mostrar, vira pódio
    await expect(rank(page).locator('li.pd')).toHaveCount(3);
    await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Você', 'Bia', 'Duda']);
  });

  test('empate divide a posição: os dois no mesmo degrau e o próximo pula uma posição', async ({ page }) => {
    const F = (uid, nm, pct) => ({ uid: uid, prof: { nm: nm, pct: pct, st: 1, wm: 1 } });
    await open(page, { friends: [F(UID.bia, 'Bia', 70), F(UID.caio, 'Caio', 70), F(UID.duda, 'Duda', 20)] });
    await expect(rank(page).locator('li.pd.r1 .pd-n')).toHaveText(['Bia', 'Caio']); // 1º lugar dividido (desempate pelo nome)
    await expect(rank(page).locator('li.pd.r3 .pd-n')).toHaveText(['Você']); // eu, com 50%, em 3º (o 2º lugar não existe)
    await expect(rank(page).locator('ul.rk-l li.rk-r .rk-n')).toHaveText(['4']);
    await expect(rank(page).locator('li.pd.r1').first().getByRole('button', { name: /1º lugar: Bia, 70% da meta de hoje/ })).toBeVisible();
  });

  test('com o progresso em pausa para os amigos, eu continuo no meu ranking e nada do progresso sai', async ({ page }) => {
    await open(page, { friends: CREW }, { social: Object.assign({}, SOCIAL_ON, { share: false }) });
    await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Você', 'Bia', 'Caio']); // a minha posição é calculada no aparelho
    expect(await payload(page)).toMatchObject({ sh: false, pct: null, met: false, st: 0, wm: null, gl: null });
  });

  test('o ranking acompanha a turma ao vivo: quem passa à frente sobe, e a lista não pisca por mudança irrelevante', async ({ page }) => {
    await open(page, { friends: CREW });
    await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Você', 'Bia', 'Caio']);
    await page.evaluate((u) => window.__fake.person(u, { pct: 60 }), UID.caio); // Caio passa de 45% para 60%: passa à minha frente
    await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Caio', 'Bia', 'Você']);
    await expect(rank(page).locator('li.pd.r2')).toContainText('60%');
    await expect(rank(page).locator('li.pd.r3 .pd-n')).toHaveText(['Você']);
  });
});

/* ---------- a meta em ml (só com um "sim") ---------- */
test.describe('meta em ml', () => {
  test('sem ninguém na turma ainda não há pergunta; com amigos ela aparece uma vez', async ({ page }) => {
    await open(page);
    await expect(page.locator('.goalq')).toHaveCount(0);
    await page.evaluate((u) => window.__fake.befriend(u, { nm: 'Bia', pct: 20 }), UID.bia);
    await expect(page.locator('.goalq')).toContainText('Mostrar sua meta aos amigos?');
    await expect(page.locator('.goalq')).toContainText('meta 2.800 ml'); // a meta de hoje
    await expect(page.locator('.goalq')).toContainText('dá para estimar quanto você bebeu'); // diz a verdade sobre o que a meta revela
  });

  test('"Agora não": a meta fica só com você, a pergunta some e não volta', async ({ page }) => {
    await open(page, { friends: CREW });
    const q = page.locator('.goalq');
    await expect(q).toBeVisible();
    expect((await payload(page)).gl, 'enquanto não responde, nada sai').toBeNull();
    await q.getByRole('button', { name: 'Agora não' }).click();
    await expect(toast(page)).toContainText('Sua meta fica só com você');
    await expect(q).toHaveCount(0);
    expect((await stored(page)).social.goal).toBe(false);
    expect((await payload(page)).gl).toBeNull();
    await page.reload();
    await tabF(page).click();
    await expect(rank(page)).toBeVisible();
    await expect(q).toHaveCount(0); // a escolha fica guardada
  });

  test('"Mostrar": a meta do dia vai para a turma (e só ela, nunca o que foi bebido)', async ({ page }) => {
    await open(page, { friends: CREW }, { todayMl: 1400 });
    await page.locator('.goalq').getByRole('button', { name: 'Mostrar' }).click();
    await expect(toast(page)).toContainText('Sua meta aparece para a turma');
    await expect(page.locator('.goalq')).toHaveCount(0);
    expect((await stored(page)).social.goal).toBe(true);
    const p = await payload(page);
    expect(p.gl).toBe(2800);
    expect(JSON.stringify(p)).not.toContain('1400'); // o que foi bebido não sai
    expect(await page.evaluate(() => window.__fake.touches), 'o perfil é enviado de novo').toBeGreaterThan(0);
    // eu me vejo com a meta no ranking (e os amigos que também liberaram)
    await expect(rank(page).locator('li.pd.r2')).toContainText('meta 2.800 ml');
  });

  test('a chave no perfil e em Ajustes liga e desliga, e cada toque republica o perfil', async ({ page }) => {
    await open(page, { friends: CREW }, { social: Object.assign({}, SOCIAL_ON, { goal: true }) });
    expect((await payload(page)).gl).toBe(2800);
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    const sw = sheet(page).getByRole('switch', { name: /Mostrar minha meta em ml/ });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sheet(page)).toContainText('Seus amigos veem a meta do dia ao lado da porcentagem');
    await expect(sheet(page)).toContainText('e a sua meta em ml'); // o resumo do que a turma vê
    await sw.click();
    await expect(sheet(page).getByRole('switch', { name: /Mostrar minha meta em ml/ })).toHaveAttribute('aria-checked', 'false');
    await expect(sheet(page)).toContainText('Desligado: seus amigos não veem a sua meta em ml');
    expect((await payload(page)).gl).toBeNull();
    expect((await stored(page)).social.goal).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toBeHidden();
    await tab(page, 'Ajustes').click();
    const sw2 = page.getByRole('switch', { name: /Mostrar minha meta em ml/ });
    await expect(sw2).toHaveAttribute('aria-checked', 'false');
    await sw2.click();
    await expect(sw2).toHaveAttribute('aria-checked', 'true');
    expect((await payload(page)).gl).toBe(2800);
    expect((await stored(page)).social.goal).toBe(true);
    await expect(toast(page)).toContainText('Sua meta aparece para a turma');
  });

  test('sair da turma zera a escolha: numa turma nova a meta não vai antes do "sim" e a pergunta volta', async ({ page }) => {
    await open(page, { friends: CREW }, { social: Object.assign({}, SOCIAL_ON, { goal: true }) });
    expect((await payload(page)).gl, 'com o "sim" dado à turma de antes').toBe(2800);
    await tab(page, 'Ajustes').click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu da turma');
    expect((await stored(page)).social).toMatchObject({ on: false, code: '', goal: null });
    await tabF(page).click(); // entra de novo, numa turma que ainda não existe
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    expect((await lastPayload(page)).gl, 'o perfil novo não leva a meta de antes').toBeNull();
    expect((await stored(page)).social.goal).toBeNull();
    await expect(page.locator('.goalq'), 'sem amigos ainda, sem pergunta').toHaveCount(0);
    await tab(page, 'Ajustes').click();
    await expect(page.getByRole('switch', { name: /Mostrar minha meta em ml/ })).toHaveAttribute('aria-checked', 'false');
    await page.evaluate((u) => window.__fake.befriend(u, { nm: 'Bia', pct: 20 }), UID.bia);
    await tabF(page).click();
    await expect(page.locator('.goalq')).toContainText('Mostrar sua meta aos amigos?'); // pergunta de novo
    expect((await payload(page)).gl).toBeNull(); // e enquanto não responde, nada sai
  });

  test('com o progresso em pausa a meta também não sai, mesmo com o "sim"', async ({ page }) => {
    await open(page, { friends: CREW }, { social: Object.assign({}, SOCIAL_ON, { goal: true, share: false }) });
    expect((await payload(page)).gl).toBeNull();
  });

  test('a meta dos amigos aparece em ml na unidade de cada um (oz inclusive) e só de quem liberou', async ({ page }) => {
    await open(page, { friends: CREW }, { profile: { unit: 'oz' } });
    const txt = await rank(page).innerText();
    expect(txt).toMatch(/meta\s[\d.,]+\s?oz/); // Bia e Caio liberaram
    expect(txt).not.toMatch(/\bml\b/);
    expect((txt.match(/meta\s[\d.,]+/g) || []).length, 'Bia, Caio e eu').toBe(3);
  });
});

/* ---------- uma turma só ---------- */
test.describe('uma turma só', () => {
  async function started(page, friends) {
    await stubFriendsCloud(page, { friends: friends, code: 'ABCD2345' });
    await seed(page, { todayMl: 1400, social: SOCIAL_ON });
    await page.goto('/');
    await page.waitForFunction(() => window.__fake && window.__fake.started);
    await page.waitForTimeout(300);
  }

  test('gente nova na turma (que aceitou outra pessoa): aviso "entrou na turma" com atalho, sem festa de aceite', async ({ page }) => {
    await started(page, [CREW[0]]);
    await page.evaluate((u) => window.__fake.befriend(u, { nm: 'Caio', mc: 'estrela', pct: 45 }), UID.caio);
    await expect(toast(page)).toContainText('Caio entrou na turma');
    await expect(page.locator('.medal-pop')).toHaveCount(0);
    await toast(page).getByRole('button', { name: 'Ver' }).click();
    await expect(tabF(page)).toHaveAttribute('aria-current', 'page');
    await expect(inRank(page, 'Caio')).toHaveCount(1);
  });

  test('dois ao mesmo tempo: o aviso junta os nomes', async ({ page }) => {
    await started(page, [CREW[0]]);
    await page.evaluate((u) => { window.__fake.befriend(u.caio, { nm: 'Caio' }); window.__fake.befriend(u.duda, { nm: 'Duda' }); }, UID);
    await expect(toast(page)).toContainText('Caio e Duda entraram na turma');
  });

  test('na aba Amigos o aviso aparece sem atalho (a pessoa já está lá)', async ({ page }) => {
    await started(page, [CREW[0]]);
    await tabF(page).click();
    await page.evaluate((u) => window.__fake.befriend(u, { nm: 'Caio' }), UID.caio);
    await expect(toast(page)).toContainText('Caio entrou na turma');
    await expect(toast(page).getByRole('button', { name: 'Ver' })).toHaveCount(0);
    await expect(inRank(page, 'Caio')).toHaveCount(1);
  });

  test('quem aceitou o meu convite traz a turma dele junto: festa de aceite com o tamanho novo da turma', async ({ page }) => {
    await started(page, [CREW[0]]);
    await page.evaluate((u) => window.__fake.outgoing(u.ze, { nm: 'Zé', mc: 'polvo' }), UID);
    await tabF(page).click();
    await expect(page.locator('li.fr', { hasText: 'Zé' })).toContainText('convite enviado'); // o app já viu o pedido pendente
    await page.evaluate((u) => {
      window.__fake.person(u.ze, { nm: 'Zé', mc: 'polvo', pct: 10 });
      window.__fake.accepted(u.ze);
      window.__fake.befriend(u.hugo, { nm: 'Hugo', pct: 10 }); // o Hugo já estava na turma do Zé
    }, UID);
    await expect(page.locator('.medal-pop')).toContainText('Zé aceitou seu pedido');
    await expect(page.locator('.medal-pop')).toContainText('Sua turma agora tem 4 pessoas'); // eu, Bia, Zé e Hugo
    await tabF(page).click();
    await expect(inRank(page, 'Hugo')).toHaveCount(1);
    await expect(rank(page)).toContainText('4 pessoas');
  });

  test('abrir o app num aparelho novo não anuncia a turma inteira como "nova"', async ({ page }) => {
    await started(page, CREW);
    await page.waitForTimeout(500);
    await expect(toast(page)).not.toContainText('entrou na turma');
    await expect(toast(page)).not.toContainText('entraram na turma');
  });
});

/* ---------- pedidos ---------- */
test.describe('pedidos de amizade', () => {
  test('aceitar pede confirmação (as turmas se juntam), vira amizade com festa; "Agora não" recusa; a bolinha da aba some', async ({ page }) => {
    await open(page, { friends: CREW, reqIn: REQS });
    await expect(page.getByRole('heading', { name: 'Pedidos de amizade' })).toBeVisible();
    await expect(tabF(page)).toHaveAccessibleName('Amigos (novidades)');
    const rq = (n) => page.locator('li.rq', { hasText: n });
    // "Aceitar" abre a confirmação: aceitar junta as turmas dos dois lados, então a pessoa precisa saber disso
    await rq('Gabi').getByRole('button', { name: 'Aceitar' }).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Aceitar o pedido de Gabi?');
    await expect(sheet(page)).toContainText('turma só');
    await expect(sheet(page)).toContainText('passam a ver o progresso uns dos outros');
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click(); // desistir não aceita nada
    await expect(page.locator('#sheet')).toBeHidden();
    expect(await calls(page)).not.toContain('accept');
    await expect(rq('Gabi')).toBeVisible();
    await rq('Gabi').getByRole('button', { name: 'Aceitar' }).click();
    await sheet(page).getByRole('button', { name: 'Aceitar', exact: true }).click();
    await expect(page.locator('.medal-pop')).toContainText('Gabi');
    await expect(page.locator('.medal-pop')).toContainText('Nova amizade');
    await expect(inRank(page, 'Gabi')).toHaveCount(1); // já está no ranking da turma
    await expect(rank(page)).toContainText('7 pessoas');
    await rq('Hugo').getByRole('button', { name: /Agora não/ }).click();
    await expect(toast(page)).toContainText('Pedido recusado');
    await expect(page.getByRole('heading', { name: 'Pedidos de amizade' })).toHaveCount(0);
    await expect(tabF(page)).toHaveAccessibleName('Amigos');
    const c = await calls(page);
    expect(c.filter((x) => x === 'accept')).toHaveLength(1);
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
    await expect(inRank(page, 'Zé')).toHaveCount(1);
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
    await expect(inRank(page, 'Gabi')).toHaveCount(1);
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

  test('aceno recebido: bolinha na aba, texto na lista (emoji no pódio) e a bolinha some ao ver', async ({ page }) => {
    await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
    await seed(page, { todayMl: 1400, social: SOCIAL_ON }); // com 50% eu entro no ranking e há pódio (Bia, eu e Caio)
    await page.goto('/');
    await page.waitForFunction(() => window.__fake && window.__fake.started);
    await page.waitForTimeout(300);
    await expect(tabF(page)).toHaveAccessibleName('Amigos');
    await page.evaluate((u) => { window.__fake.waveFrom(u.caio, 'hi'); window.__fake.waveFrom(u.bia, 'cheer'); }, UID);
    await expect(tabF(page)).toHaveAccessibleName('Amigos (novidades)');
    await tabF(page).click();
    // quem está numa linha mostra o texto; quem está no pódio (Bia e Caio) mostra o emoji no avatar, e o nome acessível diz o que foi
    await page.evaluate((u) => window.__fake.waveFrom(u.duda, 'hi'), UID);
    await expect(inRank(page, 'Duda')).toContainText('acenou para você');
    await expect(rank(page).locator('li.pd', { hasText: 'Caio' }).locator('.pd-in')).toHaveText('👋');
    await expect(rank(page).locator('li.pd', { hasText: 'Bia' }).locator('.pd-in')).toHaveText('🎉');
    await expect(rank(page).locator('li.pd', { hasText: 'Caio' }).getByRole('button', { name: /Caio acenou para você/ })).toBeVisible();
    await expect(rank(page).locator('li.pd', { hasText: 'Bia' }).getByRole('button', { name: /Bia mandou parabéns pra você/ })).toBeVisible();
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
  test('painel do amigo: meta, últimos 7 dias, insígnias com silhuetas, aceno, e se ele muda ou sai com o painel aberto', async ({ page }) => {
    await open(page, { friends: CREW });
    await openFriend(page, UID.caio);
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Caio');
    await expect(sheet(page)).toContainText('45% da meta de hoje');
    await expect(sheet(page)).toContainText('Meta do dia: 3.200 ml'); // ele liberou a meta em ml
    await expect(sheet(page)).toContainText('5 de 7 na meta');
    await expect(sheet(page).locator('.wk-row .dt')).toHaveCount(7);
    await expect(sheet(page).locator('.wk-row .dt.on')).toHaveCount(5);
    await expect(sheet(page).locator('.wk-row small')).toHaveCount(7); // a letra do dia da semana embaixo de cada bolinha
    await expect(sheet(page)).toContainText('2 de 15');
    await expect(sheet(page).locator('.reef .rf')).toHaveCount(15);
    await expect(sheet(page).locator('.reef .rf.off')).toHaveCount(13);
    await expect(sheet(page)).not.toContainText('Remover'); // a turma é uma só: não dá para tirar uma pessoa só
    await page.evaluate((u) => window.__fake.person(u, { pct: 80 }), UID.caio); // ele bebeu mais com o painel aberto
    await expect(sheet(page)).toContainText('80% da meta de hoje');
    await sheet(page).getByRole('button', { name: /Acenar/ }).click();
    await expect(sheet(page).getByRole('button', { name: /Aceno enviado hoje/ })).toBeDisabled();
    await page.evaluate((u) => window.__fake.unfriend(u), UID.caio); // e sai da turma
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(inRank(page, 'Caio')).toHaveCount(0);
  });

  // 1.5.0: as medalhas (as da Jornada, não as insígnias) de cada amigo, em fichas logo depois das insígnias
  test('painel do amigo: as medalhas dele (só as conquistadas, na ordem do app); sem bloco para quem não tem, está em pausa ou usa um app sem medalhas', async ({ page }) => {
    await open(page, { friends: CREW });
    await openFriend(page, UID.bia); // 8 medalhas
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(sheet(page).getByRole('heading', { name: 'Medalhas' })).toBeVisible();
    await expect(sheet(page)).toContainText('8 de 30');
    await expect(chips).toHaveCount(8);
    await expect(chips).toContainText(['Primeira gota', 'Na mosca', 'Pegando o ritmo', 'Semana fluida', 'Madrugador', 'Antes do pôr do sol', 'Missão cumprida', 'Dez na meta']);
    await expect(chips.nth(3)).toHaveAttribute('title', '7 dias seguidos na meta'); // a descrição vai junto (toque longo, mouse e leitor de tela)
    await expect(chips.nth(3).locator('.sr')).toHaveText(': 7 dias seguidos na meta');
    await expect(sheet(page).locator('.reef.mini + .card-h + .mchips')).toHaveCount(1); // logo depois das insígnias
    await expect(sheet(page)).not.toContainText('Quinzena firme'); // ninguém vê o que falta a alguém
    await expect(sheet(page)).not.toContainText('Maré alta');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toBeHidden();
    await openFriend(page, UID.caio); // 3 medalhas
    await expect(chips).toHaveCount(3);
    await expect(sheet(page)).toContainText('3 de 30');
    await page.evaluate((u) => window.__fake.person(u, { md: 7 | 8 }), UID.caio); // ganhou a Semana fluida com o painel aberto
    await expect(chips).toHaveCount(4);
    await expect(sheet(page)).toContainText('4 de 30');
    await page.evaluate((u) => window.__fake.person(u, { sh: false, pct: null, md: null }), UID.caio); // e pausou o progresso: as medalhas somem junto
    await expect(sheet(page)).toContainText('Progresso do dia em pausa');
    await expect(sheet(page).locator('.mchips')).toHaveCount(0);
    await expect(sheet(page).getByRole('heading', { name: 'Medalhas' })).toHaveCount(0);
    for (const u of [UID.duda, UID.edu, UID.fe]) { // nenhuma medalha, progresso em pausa e app sem medalhas (campo ausente): nada de bloco
      await page.keyboard.press('Escape');
      await expect(page.locator('#sheet')).toBeHidden();
      await openFriend(page, u);
      await expect(sheet(page).getByRole('heading', { name: 'Insígnias' })).toBeVisible();
      await expect(sheet(page).locator('.mchips')).toHaveCount(0);
      await expect(sheet(page).getByRole('heading', { name: 'Medalhas' })).toHaveCount(0);
    }
  });

  test('painel do amigo com as 30 medalhas: todas aparecem, em ordem, sem estourar o painel', async ({ page }) => {
    // 1.7.0: as medalhas 0 a 23 vão em md (16777215) e as 24 a 29 em md2 (63 = as seis novas)
    const all = CREW.map((f) => (f.uid === UID.bia ? { uid: f.uid, prof: Object.assign({}, f.prof, { md: 16777215, md2: 63 }) } : f));
    await open(page, { friends: all });
    await openFriend(page, UID.bia);
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(chips).toHaveCount(30);
    await expect(sheet(page)).toContainText('30 de 30');
    await expect(chips.first()).toContainText('Primeira gota');
    await expect(chips.nth(11)).toContainText('Dez na meta'); // a última da 1.5: os bits 0 a 11
    await expect(chips.nth(12)).toContainText('Maré viva'); // a primeira da 1.6: o bit 12
    await expect(chips.nth(23)).toContainText('Dia Mundial da Água'); // a última da 1.6: o bit 23, o último de md
    await expect(chips.nth(24)).toContainText('Um mês de Maré'); // a primeira da 1.7: o bit 0 de md2
    await expect(chips.nth(26)).toContainText('Verão em dia');
    await expect(chips.nth(28)).toContainText('Dia dos Oceanos');
    await expect(chips.last()).toContainText('Turma completa');
    const out = await page.$$eval('#sheetBody .mchip', (els) => {
      const panel = document.querySelector('#sheetBody').getBoundingClientRect();
      return els.filter((e) => { const r = e.getBoundingClientRect(); return r.right > panel.right + 0.5 || r.left < panel.left - 0.5; }).map((e) => e.textContent);
    });
    expect(out, 'fichas fora do painel').toEqual([]);
  });

  test('amigo que ainda usa a 1.6.0 (só md, 24 medalhas) mostra 24 de 30, sem as novas; quando ele atualiza, as da segunda palavra (md2) entram no fim da lista', async ({ page }) => {
    const mk = (prof) => CREW.map((f) => (f.uid === UID.bia ? { uid: f.uid, prof: Object.assign({}, f.prof, prof) } : f));
    await open(page, { friends: mk({ md: 16777215 }) }); // sem md2: o perfil de antes da 1.7.0
    await openFriend(page, UID.bia);
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(chips).toHaveCount(24);
    await expect(sheet(page)).toContainText('24 de 30');
    await expect(chips.last()).toContainText('Dia Mundial da Água');
    await expect(sheet(page)).not.toContainText('Um mês de Maré');
    await expect(sheet(page)).not.toContainText('Turma completa');
    await page.evaluate((u) => window.__fake.person(u, { md2: 1 | 32 }), UID.bia); // ele atualizou: ganhou o Um mês de Maré e a Turma completa
    await expect(chips).toHaveCount(26);
    await expect(sheet(page)).toContainText('26 de 30');
    await expect(chips.nth(24)).toContainText('Um mês de Maré');
    await expect(chips.last()).toContainText('Turma completa');
    await page.evaluate((u) => window.__fake.person(u, { md2: 2147483647 }), UID.bia); // um perfil com bits além das 30 medalhas: os que não existem são ignorados
    await expect(chips).toHaveCount(30);
    await expect(sheet(page)).toContainText('30 de 30');
  });

  test('só medalhas da segunda palavra (md = 0, md2 > 0): o bloco aparece com as novas e nada mais', async ({ page }) => {
    const mk = (prof) => CREW.map((f) => (f.uid === UID.duda ? { uid: f.uid, prof: Object.assign({}, f.prof, prof) } : f));
    await open(page, { friends: mk({ md: 0, md2: 2 | 16 }) }); // Cem dias de Maré e Dia dos Oceanos
    await openFriend(page, UID.duda);
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(chips).toHaveCount(2);
    await expect(chips).toContainText(['Cem dias de Maré', 'Dia dos Oceanos']);
    await expect(sheet(page)).toContainText('2 de 30');
  });

  test('amigo que ainda usa a 1.5 (12 medalhas, máscara 4095) aparece com 12 de 30; quando ele atualiza, as medalhas novas entram na lista, na ordem do app', async ({ page }) => {
    const mk = (md) => CREW.map((f) => (f.uid === UID.bia ? { uid: f.uid, prof: Object.assign({}, f.prof, { md: md }) } : f));
    await open(page, { friends: mk(4095) });
    await openFriend(page, UID.bia);
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(chips).toHaveCount(12);
    await expect(sheet(page)).toContainText('12 de 30');
    await expect(chips.last()).toContainText('Dez na meta');
    await expect(sheet(page)).not.toContainText('Maré viva');
    await page.evaluate((u) => window.__fake.person(u, { md: (1 << 23) | (1 << 12) | 1 }), UID.bia); // ele atualizou: first, s60 (bit 12) e wwd (bit 23)
    await expect(chips).toHaveCount(3);
    await expect(chips).toContainText(['Primeira gota', 'Maré viva', 'Dia Mundial da Água']);
  });

  test('quem não liberou a meta em ml não mostra meta nenhuma; quem está em pausa não mostra os 7 dias', async ({ page }) => {
    await open(page, { friends: CREW });
    await openFriend(page, UID.duda); // não liberou a meta em ml
    await expect(sheet(page)).toContainText('Ainda sem registros hoje');
    await expect(sheet(page)).not.toContainText('Meta do dia');
    await expect(sheet(page)).toContainText('0 de 7 na meta');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toBeHidden();
    await openFriend(page, UID.edu); // em pausa: nem % nem semana
    await expect(sheet(page)).toContainText('Progresso do dia em pausa');
    await expect(sheet(page)).not.toContainText('Meta do dia');
    await expect(sheet(page).locator('.wk-row')).toHaveCount(0);
  });

  test('meu perfil: apelido, mascote e progresso do dia', async ({ page }) => {
    await open(page, { friends: CREW }, { history: [30, 2800], insignias: { concha: 30, estrela: 25, baiacu: 20, tartaruga: 12, cavalo: 3 } });
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).locator('#sheetTitle')).toHaveText('Meu perfil');
    await expect(sheet(page)).toContainText('50% da meta de hoje');
    await expect(sheet(page).locator('.wk-row .dt.on')).toHaveCount(6); // meus 7 dias: os 6 anteriores bateram a meta; hoje ainda está em andamento
    await expect(sheet(page).locator('.wk-row .dt.now')).toHaveCount(1);
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
    expect(p).toMatchObject({ sh: false, pct: null, met: false, st: 0, wm: null, gl: null, md: null }); // em pausa: nem a semana, nem a meta, nem as medalhas saem
    await expect(sheet(page)).toContainText('Progresso do dia em pausa');
  });

  test('meu perfil: minhas medalhas aparecem como a turma as vê e vão no perfil; com o progresso em pausa, nenhuma sai', async ({ page }) => {
    await open(page, { friends: CREW }, { medals: ['first', 'goal', 's7'] });
    expect((await payload(page)).md).toBe(1 + 2 + 8);
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(chips).toHaveCount(3);
    await expect(chips).toContainText(['Primeira gota', 'Na mosca', 'Semana fluida']);
    await expect(sheet(page)).toContainText('3 de 30');
    expect('md2' in (await payload(page)), 'sem medalha da segunda palavra, o perfil segue no formato de antes (sem md2)').toBe(false);
    await expect(sheet(page)).toContainText('as medalhas, a porcentagem da meta de hoje'); // o aviso do que a turma vê já cita as medalhas
    await expect(sheet(page).getByText('os últimos 7 dias e as medalhas.', { exact: false }).first()).toBeVisible(); // e a chave do progresso também
    await sheet(page).getByRole('switch', { name: /Mostrar meu progresso/ }).click(); // pausa
    await expect(sheet(page)).toContainText('Progresso do dia em pausa');
    await expect(sheet(page).locator('.mchips')).toHaveCount(0);
    await expect(sheet(page)).not.toContainText('as medalhas, a porcentagem');
    expect((await payload(page)).md).toBeNull();
    await sheet(page).getByRole('switch', { name: /Mostrar meu progresso/ }).click(); // volta
    await expect(chips).toHaveCount(3);
    expect((await payload(page)).md).toBe(1 + 2 + 8);
  });

  test('meu perfil: as medalhas novas (24 a 29) vão em md2 e as antigas continuam em md; com o progresso em pausa, nenhuma das duas sai', async ({ page }) => {
    await open(page, { friends: CREW }, { medals: ['first', 'm1', 'summer', 'crew'] });
    const p = await payload(page);
    expect(p.md).toBe(1); // só a Primeira gota é das 24 primeiras
    expect(p.md2).toBe(1 + 4 + 32); // Um mês de Maré (bit 0), Verão em dia (bit 2) e Turma completa (bit 5)
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    const chips = sheet(page).locator('.mchips .mchip');
    await expect(chips).toHaveCount(4);
    await expect(chips).toContainText(['Primeira gota', 'Um mês de Maré', 'Verão em dia', 'Turma completa']);
    await expect(sheet(page)).toContainText('4 de 30');
    await sheet(page).getByRole('switch', { name: /Mostrar meu progresso/ }).click(); // pausa
    await expect(sheet(page).locator('.mchips')).toHaveCount(0);
    const q = await payload(page);
    expect(q.md).toBeNull();
    expect('md2' in q, 'em pausa o perfil não leva md2').toBe(false);
    await sheet(page).getByRole('switch', { name: /Mostrar meu progresso/ }).click(); // volta
    await expect(chips).toHaveCount(4);
    expect((await payload(page)).md2).toBe(1 + 4 + 32);
  });

  test('meu perfil: sem nenhuma medalha ainda, o bloco não aparece e o perfil leva md = 0', async ({ page }) => {
    await open(page, { friends: CREW }, { todayMl: 0 }); // nenhum registro: com água registrada a Primeira gota já viria do histórico, ao abrir o app (1.6.0)
    expect((await payload(page)).md).toBe(0);
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Meu mascote' })).toBeVisible();
    await expect(sheet(page).locator('.mchips')).toHaveCount(0);
    await expect(sheet(page).getByRole('heading', { name: 'Medalhas' })).toHaveCount(0);
  });

  test('ganhar uma medalha atualiza o perfil que a turma vê (md) na hora do registro', async ({ page }) => {
    await open(page, { friends: CREW }, { todayMl: 0 });
    expect((await payload(page)).md).toBe(0);
    const t0 = await page.evaluate(() => window.__fake.touches);
    await tab(page, 'Hoje').click();
    await page.getByRole('button', { name: 'Adicionar 250 ml', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__fake.touches), 'o perfil foi enviado de novo').toBeGreaterThan(t0);
    expect((await payload(page)).md).toBe(1); // a Primeira gota
    expect(Object.keys((await stored(page)).achievements)).toEqual(['first']);
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
    await expect(sheet(page)).toContainText('os registros de cada gole nem os horários');
    await expect(sheet(page)).toContainText('sua localização');
    await expect(sheet(page)).toContainText('a sua meta do dia em ml'); // só se a pessoa deixar
    await expect(sheet(page)).toContainText('as medalhas que você conquistou'); // 1.5.0: com o progresso ligado
    await expect(sheet(page)).toContainText('a porcentagem da meta de hoje que você fez (até 150%, ou só até 100% se você escolher)'); // 1.8.0; 1.9.0: com a chave
    await expect(sheet(page)).toContainText('nunca o dia nem a hora em que cada uma veio');
    await expect(sheet(page)).toContainText('as turmas dos dois se juntam'); // como a turma cresce
    await expect(sheet(page)).toContainText('Sair da turma');
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
    await expect(toast(page)).toContainText('Você saiu da turma');
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
    expect(Object.keys(p).sort()).toEqual(['day', 'gl', 'ins', 'mc', 'md', 'met', 'nm', 'pct', 'sh', 'st', 'v', 'wm']);
    expect(p.wm, 'os 6 dias na meta (hoje + 5 anteriores)').toBe(63);
    const got = (await stored(page)).achievements; // as medalhas que o aparelho guardou, na ordem combinada com a nuvem (cada uma é um bit)
    const want = ['first', 'goal', 's3', 's7', 's14', 's30', 'early', 'sunset', 'mission', 'm10', 'weekend', 'd10', 's60', 's100', 'd30', 'd100', 'm30', 'early7', 'sunset5', 'thirds7', 'win25', 'back', 'weekends4', 'wwd'].reduce((m, id, i) => (got[id] ? m + Math.pow(2, i) : m), 0);
    expect(p.md, 'as medalhas do aparelho viram a máscara md').toBe(want);
    expect(p.gl, 'sem o "sim" da pessoa, a meta em ml não sai').toBeNull();
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
    await expect(rank(page)).toContainText('6 pessoas'); // as amizades continuam: eu + 5
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
    await expect(toast(page)).toContainText('Você saiu da turma', { timeout: 15000 });
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
    await expect(toast(page)).toContainText('Saindo da turma');
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
// O cartão de novidades da 1.9.0 (tip_news18): discreto, uma vez só, e só para quem está na turma com o progresso ligado, que é a quem a novidade interessa
// (a turma passou a ver a % de verdade, até 150%, e agora dá para mostrar só até 100%). Quem não está nela não vê cartão algum, nem o da 1.7.0.
test('o cartão de novidades da turma (1.9.0) é curto, abre o painel, e o painel leva a "Meu perfil", onde está a chave', async ({ page }) => {
  await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, ui: { tip_news18: 0 } }); // 0 = a dica ainda não foi dispensada
  await page.goto('/');
  const card = page.locator('#tTips .tip');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Novidade na turma');
  await expect(card).toContainText('Seus amigos agora veem quanto você passou da meta, até 150%. Se preferir, dá para mostrar só até 100%.');
  await card.getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheet(page).locator('#sheetTitle')).toHaveText('Novidades do Maré');
  await expect(sheet(page)).toContainText('A porcentagem vai além de 100%');
  await expect(sheet(page)).toContainText('118% aparece como 118%, até 150% (acima disso, “150%+”)');
  await expect(sheet(page)).toContainText('Mostrar só até 100%');
  await expect(sheet(page)).toContainText('Desligue “Mostrar quanto passei da meta” em Meu perfil ou em Ajustes → Amigos');
  await expect(sheet(page)).toContainText('Seus amigos passam a ver só “Meta batida hoje”');
  await sheet(page).getByRole('button', { name: 'Escolher o que a turma vê' }).click();
  await expect(sheet(page).locator('#sheetTitle')).toHaveText('Meu perfil');
  await expect(page.getByRole('switch', { name: 'Mostrar aos amigos quanto passei da meta' })).toHaveAttribute('aria-checked', 'true'); // o padrão: como na 1.8.0
  await expect(sheet(page)).toContainText('Mostrar quanto passei da meta');
  await expect(page.locator('#tTips')).not.toContainText('Novidade na turma'); // abrir o painel já tinha apagado o cartão
});

test('o painel de novidades traz o que a turma ganhou em cima e, embaixo, as versões anteriores; "Depois" dispensa o cartão para sempre, também os antigos', async ({ page }) => {
  await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, ui: { tip_news18: 0, tip_news17: 0, tip_news16: 0, tip_news15: 0, tip_news12: 0 }, insignias: { concha: 30, estrela: 25, baiacu: 20, tartaruga: 12 } });
  await page.goto('/');
  await page.locator('#tTips .tip').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheet(page).locator('#sheetTitle')).toHaveText('Novidades do Maré');
  const itens = await sheet(page).locator('.news-i b, .news-h').allTextContents();
  expect(itens.slice(0, 3)).toEqual(['A porcentagem vai além de 100%', 'Mostrar só até 100%', 'Das versões anteriores']); // o novo vem primeiro; o resto fica embaixo
  expect(itens).toContain('6 medalhas novas');
  await expect(sheet(page)).toContainText('Elas também aparecem no seu perfil para a turma.');
  await expect(sheet(page)).toContainText('Seus meses');
  await expect(sheet(page)).toContainText('Medalhas na conta');
  await expect(sheet(page)).toContainText('Quanto falta e seus padrões');
  await expect(sheet(page)).toContainText('Uma turma, um ranking');
  await expect(sheet(page)).toContainText('Avisos mais espertos');
  await expect(sheet(page)).toContainText('Mais cinco bichinhos no recife'); // o que a 1.5.0 trouxe, para quem pulou direto para esta versão
  await expect(sheet(page)).toContainText('Arraia-manta, orca, peixe-pescador, lula-gigante e a pérola');
  await expect(sheet(page)).toContainText('Você já tem 4 de 15');
  await expect(sheet(page).getByRole('button', { name: 'Conhecer a turma' })).toHaveCount(0); // quem chega aqui já está na turma
  await sheet(page).getByRole('button', { name: 'Depois' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#tTips .tip')).toHaveCount(0);
  const ui = (await stored(page)).ui;
  expect([ui.tip_news18, ui.tip_news17, ui.tip_news16, ui.tip_news15, ui.tip_news12]).toEqual([1, 1, 1, 1, 1]);
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips .tip')).toHaveCount(0);
});

test('o cartão de novidades só aparece para quem está na turma com o progresso ligado: fora dela, ou com o progresso em pausa, ninguém o vê', async ({ page }) => {
  const ui = { tip_news18: 0, tip_news17: 0, tip_news16: 0, tip_news15: 0, tip_news12: 0 }; // quem nunca dispensou nenhum
  await stubFriendsCloud(page);
  await seed(page, { social: { on: false }, ui: ui });
  await page.goto('/');
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips .tip')).toHaveCount(0); // sem a turma: nenhum cartão de novidades (nem o da 1.7.0)
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await stubFriendsCloud(p2, { friends: CREW, code: 'ABCD2345' });
  await seed(p2, { todayMl: 1400, social: Object.assign({}, SOCIAL_ON, { share: false }), ui: ui });
  await p2.goto('/');
  await expect(p2.locator('#view')).toBeVisible();
  await expect(p2.locator('#tTips .tip')).toHaveCount(0); // na turma, mas sem mostrar nada do dia: a novidade não é com ela
  await p2.close();
  const p3 = await page.context().newPage();
  p3.on('pageerror', (e) => { errors.push(e.message); });
  await stubFriendsCloud(p3, { friends: CREW, code: 'ABCD2345' });
  await seed(p3, { todayMl: 1400, social: SOCIAL_ON, ui: ui });
  await p3.goto('/');
  await expect(p3.locator('#tTips .tip')).toContainText('Novidade na turma'); // na turma, mostrando o progresso: aparece
  await tab(p3, 'Ajustes').click();
  await p3.getByRole('switch', { name: 'Mostrar meu progresso do dia aos amigos' }).click(); // esconde o progresso: o cartão sai da tela Hoje
  await tab(p3, 'Hoje').click();
  await expect(p3.locator('#tTips .tip')).toHaveCount(0);
  await tab(p3, 'Ajustes').click();
  await p3.getByRole('switch', { name: 'Mostrar meu progresso do dia aos amigos' }).click(); // e volta a mostrar: o cartão (ainda não dispensado) volta com ele
  await tab(p3, 'Hoje').click();
  await expect(p3.locator('#tTips .tip')).toContainText('Novidade na turma');
  await p3.close();
});

test('dispensar o cartão de novidades (o X) não abre o painel, apaga o cartão e ele não volta; os cartões antigos (1.2, 1.5, 1.6 e 1.7) nunca mais aparecem', async ({ page }) => {
  await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, ui: { tip_news18: 0, tip_news17: 0, tip_news16: 0, tip_news15: 0, tip_news12: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Novidade na turma');
  await page.getByRole('button', { name: 'Dispensar dica' }).click();
  await expect(page.locator('#tTips .tip')).toHaveCount(0);
  await expect(page.locator('#sheet')).toBeHidden();
  expect((await stored(page)).ui.tip_news18).toBe(1);
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips .tip')).toHaveCount(0);
  // quem já viu o de agora mas nunca dispensou os antigos: nenhum deles ressurge
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await stubFriendsCloud(p2, { friends: CREW, code: 'ABCD2345' });
  await seed(p2, { todayMl: 1400, social: SOCIAL_ON, ui: { tip_news18: 1, tip_news17: 0, tip_news16: 0, tip_news15: 0, tip_news12: 0 } });
  await p2.goto('/');
  await expect(p2.locator('#view')).toBeVisible();
  await expect(p2.locator('#tTips .tip')).toHaveCount(0);
  await p2.close();
});

test('mexer na chave "Mostrar quanto passei da meta" já dispensa o cartão (quem a achou não precisa dele), e entrar na turma também', async ({ page }) => {
  await stubFriendsCloud(page, { friends: CREW, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, ui: { tip_news18: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Novidade na turma');
  await tab(page, 'Ajustes').click();
  await page.getByRole('switch', { name: 'Mostrar aos amigos quanto passei da meta' }).click();
  expect((await stored(page)).ui.tip_news18).toBe(1);
  await tab(page, 'Hoje').click();
  await expect(page.locator('#tTips .tip')).toHaveCount(0);
  // quem acabou de entrar na turma leu "O que a turma vê" e já nasce com o cartão dispensado
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await stubFriendsCloud(p2);
  await seed(p2, { social: { on: false }, ui: { tip_news18: 0 } });
  await p2.goto('/');
  await tabF(p2).click();
  await p2.getByRole('button', { name: 'Ativar amigos' }).click();
  await expect(p2.locator('#toast')).toContainText('Amigos ativados');
  expect((await stored(p2)).social.on).toBe(true);
  expect((await stored(p2)).ui.tip_news18).toBe(1);
  await p2.close();
});

test('layout: o painel de novidades e as medalhas do perfil cabem em qualquer tela', async ({ page }, info) => {
  const all = CREW.map((f) => (f.uid === UID.bia ? { uid: f.uid, prof: Object.assign({}, f.prof, { md: 16777215, md2: 63 }) } : f));
  await stubFriendsCloud(page, { friends: all, code: 'ABCD2345' });
  await seed(page, { todayMl: 1400, social: SOCIAL_ON, medals: true, history: [30, 2800], ui: { tip_news18: 0 }, insignias: { concha: 30, estrela: 25, baiacu: 20, tartaruga: 12, cavalo: 3 } });
  await page.goto('/');
  const over = async (n) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral em ' + n).toBeLessThanOrEqual(0);
  const shot = (n) => page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + n + '.png', fullPage: true });
  await over('Hoje com o cartão de novidades');
  await shot('Hoje com novidades');
  await page.getByRole('button', { name: 'Ver as novidades' }).click();
  await page.waitForTimeout(500);
  await over('painel de novidades');
  const sb = await page.locator('#sheetBody').boundingBox();
  const wide = await page.$$eval('#sheetBody .news-i, #sheetBody .news-h', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(wide, 'item de novidade mais largo que o painel').toBe(0);
  expect(sb && sb.width, 'painel mais largo que a tela').toBeLessThanOrEqual(page.viewportSize().width + 1);
  await shot('painel de novidades');
  await sheet(page).getByRole('button', { name: 'Escolher o que a turma vê' }).click(); // o painel leva a "Meu perfil", onde está a chave nova
  await page.waitForTimeout(500);
  await over('meu perfil aberto pelo painel de novidades');
  await expect(sheet(page).locator('#sheetTitle')).toHaveText('Meu perfil');
  await shot('meu perfil pelo painel de novidades');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await tabF(page).click();
  await page.waitForTimeout(500);
  await openFriend(page, UID.bia);
  await page.waitForTimeout(500);
  await over('painel do amigo com 30 medalhas');
  await expect(sheet(page).locator('.mchips .mchip')).toHaveCount(30);
  const box = await page.locator('#sheetBody').boundingBox();
  const tall = await page.$$eval('#sheetBody .mchip', (els) => els.filter((e) => e.getBoundingClientRect().height > 40).map((e) => e.textContent)); // uma ficha nunca quebra em duas linhas
  expect(tall, 'fichas quebradas em duas linhas').toEqual([]);
  expect(box && box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  await shot('painel do amigo com medalhas');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await page.getByRole('button', { name: 'Meu perfil' }).click();
  await page.waitForTimeout(500);
  await over('meu perfil com 30 medalhas');
  await expect(sheet(page).locator('.mchips .mchip')).toHaveCount(30);
  await shot('meu perfil com medalhas');
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

/* ---------- a % acima da meta (1.8.0) ---------- */
// Até a 1.7.0 a turma só via "100%" de quem batia a meta. Na 1.8.0 vê a % real, de 100 a 150 ("150%+" no teto): o ranking de Hoje, a ficha do amigo e "Meu perfil".
// Um amigo de um app mais antigo manda 100 (é o caso da Duda abaixo) e continua aparecendo como antes.
test.describe('a % acima da meta (1.8.0)', () => {
  const OVER = [
    { uid: UID.caio, prof: { nm: 'Caio', mc: 'estrela', ins: ['concha', 'estrela'], pct: 150, met: true, st: 5 } }, // passou muito da meta: o teto
    { uid: UID.bia, prof: { nm: 'Bia', mc: 'tartaruga', ins: ['concha', 'estrela', 'baiacu', 'tartaruga'], pct: 118, met: true, st: 12 } },
    { uid: UID.edu, prof: { nm: 'Edu', mc: 'concha', ins: ['concha'], pct: 102, met: true, st: 2 } }, // passou só um pouco
    { uid: UID.duda, prof: { nm: 'Duda', mc: 'cavalo', ins: ['concha'], pct: 100, met: true, st: 1 } }, // o app dela é de antes da 1.8.0: manda 100
    { uid: UID.fe, prof: { nm: 'Fê', mc: 'baiacu', ins: ['concha'], pct: 60, st: 0 } }, // ainda no caminho
  ];
  // 2.800 ml é a meta do dia nos testes; 2.940 ml = 105% e 3.304 ml = 118%. Ordem de Hoje: Caio 150%+, Bia 118%, eu 105%, Edu 102%, Duda 100%, Fê 60%

  test('o ranking de Hoje usa a % real de quem passou da meta: 150%+ no teto, 118%, 105% (eu), 102%, 100% (app antigo) e 60%, nessa ordem', async ({ page }) => {
    await open(page, { friends: OVER }, { todayMl: 2940 });
    const rk = rank(page);
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Bia', 'Caio', 'Você']); // o pódio põe o 1º no meio: Bia em 2º, Caio em 1º e eu em 3º
    await expect(rk.locator('li.pd.r1 .pd-s b')).toHaveText('150%+');
    await expect(rk.locator('li.pd.r2 .pd-s b')).toHaveText('118%');
    await expect(rk.locator('li.pd.r3 .pd-s b')).toHaveText('105%');
    await expect(rk.locator('li.pd.r1 .pd-b')).toHaveAttribute('aria-label', '1º lugar: Caio, 150% ou mais da meta de hoje'); // quem lê a tela em voz alta ouve o teto por extenso
    await expect(rk.locator('li.pd.r2 .pd-b')).toHaveAttribute('aria-label', '2º lugar: Bia, 118% da meta de hoje');
    const rows = rk.locator('ul.rk-l').first().locator('li.rk-r');
    await expect(rows.locator('.rk-t b')).toHaveText(['Edu', 'Duda', 'Fê']);
    await expect(rows.locator('.rk-v b')).toHaveText(['102%', '100%', '60%']);
    await expect(rows.nth(0).locator('.rk-main')).toHaveAttribute('aria-label', '4º lugar: Edu, 102% da meta de hoje');
    await expect(rows.nth(0).locator('.fr-s')).toHaveText('Meta batida hoje 🎉'); // o número grande já diz 102%: a nota embaixo do nome não repete
    await expect(rows.nth(1).locator('.fr-s')).toHaveText('Meta batida hoje 🎉'); // quem manda 100 aparece como sempre apareceu
    await expect(rows.nth(0).locator('.rk-v b')).toHaveClass('ok'); // quem bateu a meta continua em verde
    await expect(page.getByText('5 de 6 já bateram a meta hoje')).toBeVisible(); // eu, Caio, Bia, Edu e Duda
  });

  test('ao vivo: quem bate a meta e passa dela com o app aberto sobe no ranking com o número real', async ({ page }) => {
    await open(page, { friends: OVER }, { todayMl: 2940 });
    const rk = rank(page);
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Bia', 'Caio', 'Você']);
    await page.evaluate((u) => window.__fake.person(u, { pct: 130, met: true }), UID.fe); // a Fê bate a meta e vai a 130%
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Fê', 'Caio', 'Bia']); // Fê em 2º (130%), Bia em 3º (118%)
    await expect(rk.locator('li.pd.r2 .pd-s b')).toHaveText('130%');
    const rows = rk.locator('ul.rk-l').first().locator('li.rk-r');
    await expect(rows.locator('.rk-t b')).toHaveText([/^Ana/, 'Edu', 'Duda']); // eu (105%), Edu (102%) e Duda (100%) logo abaixo do pódio
    await expect(rows.locator('.rk-v b')).toHaveText(['105%', '102%', '100%']);
    await page.evaluate((u) => window.__fake.person(u, { pct: 400, met: true }), UID.fe); // um perfil com número maluco (outro app, dado ruim) nunca passa do teto
    await expect(rk.locator('li.pd .pd-s b')).toHaveText(['150%+', '150%+', '118%']);
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Caio', 'Fê', 'Bia']); // Caio e Fê empatam em 150 (a sequência de Caio é maior): posições 1 e 1
  });

  test('a ficha do amigo diz quanto ele passou da meta ("Meta batida hoje 🎉 · 118%", "· 150%+"); quem manda 100 fica só em "Meta batida hoje 🎉"', async ({ page }) => {
    await open(page, { friends: OVER }, { todayMl: 2940 });
    for (const [uid, want] of [[UID.bia, 'Meta batida hoje 🎉 · 118%'], [UID.caio, 'Meta batida hoje 🎉 · 150%+'], [UID.edu, 'Meta batida hoje 🎉 · 102%'], [UID.duda, 'Meta batida hoje 🎉'], [UID.fe, '60% da meta de hoje']]) {
      await openFriend(page, uid);
      await expect(sheet(page).locator('.fs-s')).toHaveText(want);
      await page.keyboard.press('Escape');
      await expect(page.locator('#sheet')).toBeHidden();
    }
  });

  test('Meu perfil mostra a % que os amigos veem (118%) e o que o aparelho publica é o mesmo número, sem volumes', async ({ page }) => {
    await open(page, { friends: OVER }, { todayMl: 3304 });
    const p = await payload(page);
    expect(p).toMatchObject({ pct: 118, met: true, sh: true });
    expect(JSON.stringify(p)).not.toMatch(/3304|2800|ml/);
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).locator('.fs-s')).toHaveText('Meta batida hoje 🎉 · 118%');
    await expect(sheet(page)).toContainText('a porcentagem da meta de hoje (até 150%)');
    await page.keyboard.press('Escape');
    await expect(rank(page).locator('li.rk-r.me .rk-v b, li.pd.me .pd-s b').first()).toHaveText('118%'); // e na minha linha do ranking
  });

  test('com mais do que o dobro da meta, o número publicado trava em 150 e a tela diz "150%+"; a tela Hoje segue com o número real', async ({ page }) => {
    await stubFriendsCloud(page, { friends: OVER, code: 'ABCD2345' });
    await seed(page, { todayMl: 7000, social: SOCIAL_ON }); // 7.000 de 2.800 = 250%
    await page.goto('/');
    await expect(page.locator('#view')).toContainText('250%'); // a tela Hoje não tem teto
    expect(await payload(page)).toMatchObject({ pct: 150, met: true });
    await tabF(page).click();
    await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Caio', 'Você', 'Bia']); // eu e Caio empatamos no teto (Caio tem a sequência maior)
    await expect(rank(page).locator('li.pd.r1 .pd-s b').first()).toHaveText('150%+');
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).locator('.fs-s')).toHaveText('Meta batida hoje 🎉 · 150%+');
  });

  test('o progresso em pausa continua escondendo tudo: sem % para os amigos, mesmo com a meta batida e passada', async ({ page }) => {
    await open(page, { friends: OVER }, { todayMl: 3304, social: Object.assign({}, SOCIAL_ON, { share: false }) });
    expect(await payload(page)).toMatchObject({ sh: false, pct: null, met: false, st: 0 });
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).locator('.fs-s')).toHaveText('Progresso do dia em pausa');
    await expect(sheet(page)).not.toContainText('118%');
  });

  test('Semana e Sequência: a nota de quem passou da meta diz quanto ("Meta batida hoje 🎉 · 150%+"), quem manda 100 fica sem número e a % de hoje só desempata', async ({ page }) => {
    const WK = [ // Caio (150%+) e eu (105%) ficam com pouca semana e pouca sequência: nas linhas do ranking, onde a nota aparece (o pódio não tem nota)
      { uid: UID.caio, prof: { nm: 'Caio', mc: 'estrela', ins: ['concha'], pct: 150, met: true, st: 1, wm: 1 } },
      { uid: UID.bia, prof: { nm: 'Bia', mc: 'tartaruga', ins: ['concha'], pct: 118, met: true, st: 12, wm: 127 } },
      { uid: UID.duda, prof: { nm: 'Duda', mc: 'cavalo', ins: ['concha'], pct: 100, met: true, st: 4, wm: 63 } },
      { uid: UID.edu, prof: { nm: 'Edu', mc: 'concha', ins: ['concha'], pct: 60, st: 3, wm: 31 } },
    ];
    await open(page, { friends: WK }, { todayMl: 2940 });
    const rows = rank(page).locator('li.rk-r');
    for (const v of ['week', 'streak']) {
      await page.locator('#view [data-action="fr-rank"][data-v="' + v + '"]').click();
      await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Duda', 'Bia', 'Edu']);
      await expect(rows.locator('.rk-t b')).toHaveText(['Caio', /^Ana/]); // empate no valor: quem passou mais da meta hoje vem primeiro (Caio, 150%+; eu, 105%)
      await expect(rows.nth(0).locator('.fr-s')).toHaveText('Meta batida hoje 🎉 · 150%+');
      await expect(rows.nth(1).locator('.fr-s')).toHaveText('Meta batida hoje 🎉 · 105%');
    }
    await page.locator('#view [data-action="fr-rank"][data-v="day"]').click();
    await expect(rank(page).locator('li.pd .pd-n')).toHaveText(['Bia', 'Caio', 'Você']);
    await expect(rows.locator('.fr-s').first()).toHaveText('Meta batida hoje 🎉'); // no ranking de Hoje o número já é o grande: a nota não repete
  });
});

/* ---------- "Mostrar quanto passei da meta" (1.9.0) ---------- */
// Quem não quer que a turma saiba quanto passou da meta (até a 1.8.0 só dava para esconder o progresso inteiro) desliga a chave: o perfil sai com a % em 100 e a turma vê só
// "Meta batida hoje 🎉", como na 1.7.0. Ligada (o padrão) é a 1.8.0: a % de verdade, até 150%. A tela Hoje é só da pessoa e segue com o número real.
// A chave não cria campo novo no perfil: é só um teto de 100 no número que já saía. Por isso não precisa de regra nova no Firebase (tests/rules/ cobre isso).
test.describe('"Mostrar quanto passei da meta" (1.9.0)', () => {
  const OVR = [ // a mesma turma da 1.8.0: Caio 150%, Bia 118%, Edu 102%, Duda 100% (app antigo) e Fê 60%
    { uid: UID.caio, prof: { nm: 'Caio', mc: 'estrela', ins: ['concha', 'estrela'], pct: 150, met: true, st: 5 } },
    { uid: UID.bia, prof: { nm: 'Bia', mc: 'tartaruga', ins: ['concha', 'estrela', 'baiacu', 'tartaruga'], pct: 118, met: true, st: 12 } },
    { uid: UID.edu, prof: { nm: 'Edu', mc: 'concha', ins: ['concha'], pct: 102, met: true, st: 2 } },
    { uid: UID.duda, prof: { nm: 'Duda', mc: 'cavalo', ins: ['concha'], pct: 100, met: true, st: 1 } },
    { uid: UID.fe, prof: { nm: 'Fê', mc: 'baiacu', ins: ['concha'], pct: 60, st: 0 } },
  ];
  const KEYS = ['day', 'gl', 'ins', 'mc', 'md', 'met', 'nm', 'pct', 'sh', 'st', 'v', 'wm']; // os campos de sempre: a chave nunca vira campo do perfil
  const SW = 'Mostrar aos amigos quanto passei da meta';
  const SHARE = 'Mostrar meu progresso do dia aos amigos';
  const mine = (page) => rank(page).locator('li.rk-r.me .rk-v b, li.pd.me .pd-s b').first(); // o número grande da minha linha (ou do meu lugar no pódio)
  const heard = (page) => page.evaluate(() => window.__fake.touches); // quantas vezes o app avisou a nuvem de que o perfil mudou
  // 2.800 ml é a meta do dia nos testes: 3.304 ml = 118%, 1.400 ml = 50%

  test('Ajustes → Amigos: a chave vem ligada e explica os dois lados; desligar publica a % em 100 (met segue verdadeiro), sem campo novo, e a escolha fica guardada', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 3304 });
    expect(await payload(page)).toMatchObject({ pct: 118, met: true, sh: true });
    await tab(page, 'Ajustes').click();
    const sw = page.getByRole('switch', { name: SW });
    await expect(page.getByText('Mostrar quanto passei da meta', { exact: true })).toBeVisible();
    await expect(page.getByText('Ligado, seus amigos veem a porcentagem de verdade, até 150%. Desligado, veem só “Meta batida hoje”, sem saber quanto você passou.')).toBeVisible();
    await expect(sw).toHaveAttribute('aria-checked', 'true'); // o padrão é a 1.8.0: a turma vê o número de verdade
    const t0 = await heard(page);
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect((await stored(page)).social.over).toBe(false);
    await expect.poll(() => heard(page), 'o perfil que a turma vê é enviado de novo').toBeGreaterThan(t0);
    const p = await payload(page);
    expect(p).toMatchObject({ pct: 100, met: true, sh: true });
    expect(Object.keys(p).sort()).toEqual(KEYS);
    expect(JSON.stringify(p)).not.toMatch(/over|3304|2800/);
    await tab(page, 'Hoje').click();
    await expect(page.locator('#view')).toContainText('118%'); // a tela Hoje é só da pessoa: o número real continua lá
    await page.reload();
    await expect(page.locator('#view')).toBeVisible();
    await tab(page, 'Ajustes').click();
    await expect(page.getByRole('switch', { name: SW })).toHaveAttribute('aria-checked', 'false'); // sobrevive a fechar e abrir o app
    expect(await payload(page)).toMatchObject({ pct: 100, met: true });
    await page.getByRole('switch', { name: SW }).click(); // e ligar de novo traz o número de volta
    await expect(page.getByRole('switch', { name: SW })).toHaveAttribute('aria-checked', 'true');
    expect(await payload(page)).toMatchObject({ pct: 118, met: true });
    expect((await stored(page)).social.over).toBe(true);
  });

  test('Meu perfil: a mesma chave, com a nota certa para cada lado; o texto sob o avatar e a frase final mudam na hora, e o meu lugar no ranking acompanha', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 3304 });
    await expect(mine(page)).toHaveText('118%'); // o número grande do meu lugar no pódio (empatado em 2º com a Bia, que também tem 118%)
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    const sw = () => sheet(page).getByRole('switch', { name: SW });
    await expect(sheet(page).getByText('Mostrar quanto passei da meta', { exact: true })).toBeVisible();
    await expect(sw()).toHaveAttribute('aria-checked', 'true');
    await expect(sheet(page)).toContainText('Seus amigos veem a porcentagem de verdade, até 150%.');
    await expect(sheet(page).locator('.fs-s')).toHaveText('Meta batida hoje\u00A0🎉 · 118%');
    await expect(sheet(page)).toContainText('a porcentagem da meta de hoje (até 150%)');
    await sw().click();
    await expect(sw()).toHaveAttribute('aria-checked', 'false');
    await expect(sheet(page).locator('.fs-s')).toHaveText('Meta batida hoje\u00A0🎉'); // sem o número: é o que a turma passa a ver
    await expect(sheet(page)).toContainText('Desligado: seus amigos veem só “Meta batida hoje”, sem saber quanto você passou.');
    await expect(sheet(page)).toContainText('a porcentagem da meta de hoje (só até 100%)');
    expect(await payload(page)).toMatchObject({ pct: 100, met: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(mine(page)).toHaveText('100%'); // o meu lugar no ranking usa o mesmo número que os amigos veem
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await sw().click(); // ligar de novo
    await expect(sheet(page).locator('.fs-s')).toHaveText('Meta batida hoje\u00A0🎉 · 118%');
    await page.keyboard.press('Escape');
    await expect(mine(page)).toHaveText('118%');
  });

  test('o ranking de Hoje: desligada a chave, eu valho 100 (os amigos me veem assim) e quem passou de 100 fica na minha frente; ligada, volto para o meu lugar', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 3304 });
    const rk = rank(page);
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Caio', 'Bia', 'Você']); // Caio 150%+ em 1º; Bia e eu empatamos em 118% e dividimos o 2º lugar (no empate o pódio segue a ordem da lista: a sequência maior da Bia vem antes)
    await tab(page, 'Ajustes').click();
    await page.getByRole('switch', { name: SW }).click();
    await tabF(page).click();
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Bia', 'Caio', 'Edu']); // eu caí para 100: Edu (102%) passa na minha frente e, sem empate no pódio, ele volta à ordem 2º, 1º, 3º
    const rows = rk.locator('ul.rk-l').first().locator('li.rk-r');
    await expect(rows.locator('.rk-t b')).toHaveText([/^Ana/, 'Duda', 'Fê']); // eu e Duda empatamos em 100: a semana decide (eu bati a meta hoje; a Duda ainda não manda a semana)
    await expect(rows.locator('.rk-v b')).toHaveText(['100%', '100%', '60%']);
    await expect(rk.locator('li.pd.r2 .pd-s b')).toHaveText('118%'); // os amigos seguem como são: o corte é só no que EU publico
    await expect(rk.locator('li.pd.r1 .pd-s b')).toHaveText('150%+');
    await tab(page, 'Ajustes').click();
    await page.getByRole('switch', { name: SW }).click();
    await tabF(page).click();
    await expect(rk.locator('li.pd .pd-n')).toHaveText(['Caio', 'Bia', 'Você']); // ligada de novo: de volta ao empate em 118%
  });

  test('quem está abaixo da meta não muda nada com a chave: o perfil sai idêntico', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 1400 }); // 50%: ainda no caminho
    const antes = await payload(page);
    expect(antes).toMatchObject({ pct: 50, met: false });
    await tab(page, 'Ajustes').click();
    const sw = page.getByRole('switch', { name: SW });
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(await payload(page)).toEqual(antes);
  });

  test('quem está exatamente na meta já saía com 100: a chave não muda o perfil', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 2800 }); // 100% exatos, nem um gole a mais
    const antes = await payload(page);
    expect(antes).toMatchObject({ pct: 100, met: true });
    await tab(page, 'Ajustes').click();
    const sw = page.getByRole('switch', { name: SW });
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(await payload(page)).toEqual(antes);
  });

  test('com o progresso em pausa a chave espera: nada de % sai, a nota avisa, a escolha fica guardada e, quando o progresso volta, já volta com o teto de 100', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 3304, social: Object.assign({}, SOCIAL_ON, { share: false }) });
    expect(await payload(page)).toMatchObject({ sh: false, pct: null, met: false });
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page)).toContainText('Vale quando o progresso do dia estiver ligado.');
    await sheet(page).getByRole('switch', { name: SW }).click();
    await expect(sheet(page).getByRole('switch', { name: SW })).toHaveAttribute('aria-checked', 'false');
    await expect(sheet(page)).toContainText('Vale quando o progresso do dia estiver ligado.'); // com o progresso em pausa a nota segue sendo essa
    expect(await payload(page)).toMatchObject({ sh: false, pct: null, met: false });
    expect((await stored(page)).social.over).toBe(false);
    await sheet(page).getByRole('switch', { name: SHARE }).click(); // o progresso volta
    expect(await payload(page)).toMatchObject({ sh: true, pct: 100, met: true }); // e já sai com o teto de 100
    await expect(sheet(page)).toContainText('Desligado: seus amigos veem só “Meta batida hoje”, sem saber quanto você passou.');
  });

  test('a chave de Ajustes e a de Meu perfil andam juntas', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 3304 });
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await sheet(page).getByRole('switch', { name: SW }).click();
    await page.keyboard.press('Escape');
    await tab(page, 'Ajustes').click();
    await expect(page.getByRole('switch', { name: SW })).toHaveAttribute('aria-checked', 'false'); // o que se fez no perfil aparece em Ajustes
    await page.getByRole('switch', { name: SW }).click();
    await tabF(page).click();
    await page.getByRole('button', { name: 'Meu perfil' }).click();
    await expect(sheet(page).getByRole('switch', { name: SW })).toHaveAttribute('aria-checked', 'true'); // e o contrário
  });

  test('sair da turma não religa o que a pessoa desligou: a escolha de privacidade é dela, e numa turma nova o perfil já sai com o teto de 100', async ({ page }) => {
    await open(page, { friends: OVR }, { todayMl: 3304 });
    await tab(page, 'Ajustes').click();
    await page.getByRole('switch', { name: SW }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu da turma');
    expect((await stored(page)).social).toMatchObject({ on: false, code: '', goal: null, over: false });
    await tabF(page).click(); // entra de novo, numa turma que ainda não existe
    await page.getByRole('button', { name: 'Ativar amigos' }).click();
    await expect(toast(page)).toContainText('Amigos ativados');
    expect(await lastPayload(page)).toMatchObject({ pct: 100, met: true });
    expect((await stored(page)).social.over).toBe(false);
  });
});

/* ---------- layout ---------- */
test('layout: amigos sem rolagem lateral, alvos de toque confortáveis e screenshots', async ({ page }, info) => {
  // o 3º lugar (Caio) com a meta mais comprida que existe (10.000 ml): o texto do degrau tem de ficar numa linha só
  const longGoal = CREW.map((f) => (f.uid === UID.caio ? { uid: f.uid, prof: Object.assign({}, f.prof, { gl: 10000 }) } : f));
  await stubFriendsCloud(page, { friends: longGoal, reqIn: REQS, code: 'ABCD2345' });
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
  expect(await page.$$eval('.rk-main', (els) => els.filter((e) => e.getBoundingClientRect().height < 48).length), 'linhas do ranking baixas').toBe(0);
  expect(await page.$$eval('.pd-b', (els) => els.filter((e) => e.getBoundingClientRect().height < 48).length), 'pódio baixo').toBe(0);
  expect(await page.$$eval('#view [data-action="fr-rank"]', (els) => els.filter((e) => e.getBoundingClientRect().height < 32).length), 'abas do ranking baixas').toBe(0);
  // nomes curtos nunca podem ser cortados com reticências (em 280 px o número e a meta descem para baixo do nome)
  expect(await page.$$eval('.rk-t b, .pd-n', (els) => els.filter((e) => e.textContent.length <= 8 && e.scrollWidth > e.clientWidth).map((e) => e.textContent)), 'nomes curtos cortados').toEqual([]);
  expect(await page.$$eval('.rk-r', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length), 'linha do ranking maior que o cartão').toBe(0);
  // o pódio é uma escada: o 1º é o degrau mais alto e o 3º o mais baixo (com ou sem botão de aceno)
  const steps = await page.$$eval('.pd-s', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(steps.length).toBe(3);
  expect(steps[1], 'o 1º (no meio) é mais alto que o 2º').toBeGreaterThan(steps[0]);
  expect(steps[0], 'o 2º é mais alto que o 3º').toBeGreaterThan(steps[2]);
  // a meta do degrau (ex.: "meta 10.000 ml") cabe numa linha e dentro do degrau, em qualquer largura de tela
  const goals = await page.$$eval('.pd-s small', (els) => els.map((e) => ({ t: e.textContent, h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, box: e.parentElement.getBoundingClientRect().width })));
  expect(goals.length, 'as metas do pódio (Bia, eu e Caio: a minha meta eu sempre vejo)').toBe(3);
  expect(goals.find((g) => /10\.000/.test(g.t)), 'a meta de cinco dígitos está no pódio').toBeTruthy();
  goals.forEach((g) => {
    expect(g.h, 'meta do degrau quebrou em duas linhas: ' + g.t).toBeLessThan(18);
    expect(g.w, 'meta do degrau mais larga que o degrau: ' + g.t).toBeLessThanOrEqual(g.box + 0.5);
  });
  for (const [label, open2] of [['painel do amigo', () => openFriend(page, UID.bia)],
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
  // as outras visões do ranking
  await tabF(page).click();
  for (const v of ['week', 'streak', 'day']) {
    await page.locator('#view [data-action="fr-rank"][data-v="' + v + '"]').click();
    await page.waitForTimeout(400);
    await over('ranking ' + v);
    if (v !== 'day') await shot('Amigos ' + v);
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

test('layout: a % acima da meta ("150%+", "118%") cabe em qualquer tela, no ranking, na ficha do amigo e em Meu perfil', async ({ page }, info) => {
  // os piores casos juntos: o teto (150%+), a meta mais comprida (10.000 ml), uma sequência de três dígitos e a nota mais longa ("Meta batida hoje 🎉 · 150%+")
  const F = [
    { uid: UID.caio, prof: { nm: 'Caio', mc: 'estrela', ins: ['concha', 'estrela'], pct: 150, met: true, st: 365, gl: 10000, wm: 127 } },
    { uid: UID.bia, prof: { nm: 'Bia', mc: 'tartaruga', ins: ['concha', 'estrela', 'baiacu', 'tartaruga'], pct: 118, met: true, st: 99, gl: 2800, wm: 127 } },
    { uid: UID.duda, prof: { nm: 'Duda', mc: 'cavalo', ins: ['concha'], pct: 100, met: true, st: 12, wm: 63 } },
    { uid: UID.edu, prof: { nm: 'Edu', mc: 'concha', ins: ['concha'], pct: 60, st: 3, wm: 7 } },
  ];
  await stubFriendsCloud(page, { friends: F, reqIn: REQS, code: 'ABCD2345' });
  await seed(page, { todayMl: 9000, social: Object.assign({}, SOCIAL_ON, { goal: true }), history: [30, 2800], insignias: { concha: 30, estrela: 25, baiacu: 20, tartaruga: 12, cavalo: 3 } });
  await page.goto('/');
  const over = async (n) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral em ' + n).toBeLessThanOrEqual(0);
  const shot = (n) => page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + n + '.png', fullPage: true });
  // nada fica mais largo do que o espaço que tem (o número grande, a nota, a linha inteira)
  const cut = (n) => page.$$eval('.pd-s, .pd-s b, .rk-v b, .rk-t, .fr-s, .rk-r, .fs-s', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className + ':' + e.textContent.slice(0, 40)));
  await tabF(page).click();
  await page.waitForTimeout(700);
  await over('Amigos com 150%+');
  expect(await cut(), 'texto cortado no ranking de Hoje').toEqual([]);
  await expect(rank(page).locator('li.pd .pd-s b').filter({ hasText: '150%+' })).toHaveCount(2); // Caio e eu
  // o número grande cabe numa linha só
  expect(await page.$$eval('.pd-s b, .rk-v b', (els) => els.filter((e) => e.getBoundingClientRect().height > 26).map((e) => e.textContent)), 'número grande quebrou em duas linhas').toEqual([]);
  await shot('Amigos 150');
  for (const v of ['week', 'streak', 'day']) {
    await page.locator('#view [data-action="fr-rank"][data-v="' + v + '"]').click();
    await page.waitForTimeout(400);
    await over('ranking ' + v + ' com 150%+');
    expect(await cut(), 'texto cortado no ranking ' + v).toEqual([]);
    if (v !== 'day') await shot('Amigos 150 ' + v);
  }
  for (const [label, open2] of [['ficha do amigo no teto', () => openFriend(page, UID.caio)], ['ficha do amigo 118%', () => openFriend(page, UID.bia)],
    ['meu perfil no teto', () => page.getByRole('button', { name: 'Meu perfil' }).click()]]) {
    await open2();
    await page.waitForTimeout(500);
    await over(label);
    expect(await cut(), 'texto cortado em ' + label).toEqual([]);
    const st = await sheet(page).locator('.fs-s').boundingBox();
    expect(st && st.height, 'a linha de situação ocupou mais de duas linhas em ' + label).toBeLessThan(64);
    await shot(label);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet')).toBeHidden();
  }
});
