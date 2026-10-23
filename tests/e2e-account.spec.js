// Maré — testes de interface da conta com e-mail e senha (1.3.0). Rodar: npm run test:e2e
// O login e a nuvem são os de mentira de tests/helpers/fake-cloud.browser.js (accountKit e initCloud com o mesmo contrato do firebase.js).
// O firebase.js de verdade, as regras e o servidor são cobertos por tests/rules/ (npm run test:rules). Qualquer erro de JavaScript na página reprova.
import { test, expect } from '@playwright/test';
import { seed } from './helpers/seed.js';
import { stubFriendsCloud } from './helpers/friends.js';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
});
test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

const tabS = (page) => page.locator('#tabbar').getByRole('button', { name: 'Ajustes', exact: true });
const sheet = (page) => page.locator('#sheetBody');
const toast = (page) => page.locator('#toast');
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
const hint = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mare:acct') || 'null'));
const acct = (page) => page.evaluate(() => {
  const a = window.__acct;
  return a ? { user: a.user, calls: a.calls.slice(), sent: a.sent.slice(), resets: a.resets.slice(), users: Object.keys(a.users), linked: a.linked, detached: a.detached,
    disposed: a.disposed, wiped: a.wiped, resynced: a.resynced, prefsSynced: a.prefsSynced,
    detachForce: a.detachForce, wipeOpts: a.wipeOpts.slice(), atSignIn: a.atSignIn.slice(), synced: a.synced.slice(), strayOut: a.strayOut, watching: a.watching,
    signInDuringWipe: a.signInDuringWipe } : null;
});
const fakeCalls = (page) => page.evaluate(() => (window.__fake ? window.__fake.calls.slice() : []));
const cloudInits = (page) => page.evaluate(() => window.__cloudInit || 0);
// quantos dias o aparelho guardava quando cada saída da turma chegou à nuvem (a nuvem de mentira tira uma cópia a cada saída)
const leaveDays = (page) => page.evaluate(() => ((window.__fake && window.__fake.leaveSnaps) || []).map((s) => Object.keys(s.days || {}).length));
const SOCIAL = { on: true, nick: 'Ana', share: true, code: 'ABCD2345' };
// a chave de um dia, N dias antes de outra (ao meio-dia local, sem depender do fuso de quem roda o teste)
const shiftKey = (key, n) => {
  const d = new Date(key + 'T12:00:00'), p = (x) => (x < 10 ? '0' : '') + x;
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};
const ME_UID = 'fakemeuid0000000000000000001'; // o login anônimo da nuvem de mentira

const EMAIL = 'ana@exemplo.com', PW = 'Maré-segura-77';
const MARI = 'marianne@exemplo.com', MARI_PW = 'Senha-da-Mari-1', MARI_UID = 'marianneuid000000000000000001';

const dkey = (n) => { const d = new Date(Date.now() - n * 864e5), p = (x) => (x < 10 ? '0' : '') + x; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
// registros que a conta guardava: n dias seguidos (de anteontem para trás), 2,5 L cada um
const cloudDays = (n) => {
  const o = {};
  for (let i = 1; i <= n; i++) o[dkey(i + 1)] = { goal: 2600, u: Date.now() - i * 864e5, entries: [{ id: 'c' + i, t: Date.now() - (i + 1) * 864e5, ml: 2500, d: 'water' }] };
  return o;
};
// o backup dos ajustes (users/{uid}/backup/prefs) como o app grava
const PREFS = (patch) => ({
  v: 1, u: Date.now() - 3600e3,
  j: JSON.stringify(Object.assign({
    createdAt: Date.now() - 40 * 864e5,
    profile: { name: 'Mariana', weight: 58, activity: 'high', wake: '06:30', sleep: '22:30', unit: 'ml', theme: 'dark', others: true, mix: false, mascot: '' },
    goal: { mode: 'manual', manual: 2400, climate: false }, cups: [200, 300, 400, 600], last: 'water', lastO: 'tea', reminders: { interval: 60, smart: true },
    social: { on: true, nick: 'Mari', share: true, goal: null, push: true, hit: false, week: true }, ui: { tip_install: 1, tip_climate: 1 },
  }, patch || {})),
});
// uma conta que já existe na nuvem de mentira
const account = (o) => Object.assign({ pw: MARI_PW, uid: MARI_UID, verified: true, cloud: { prefs: PREFS(), user: { wake: '06:30', sleep: '22:30', unit: 'ml' },
  profile: { nm: 'Mari', mc: 'concha', sh: true }, days: cloudDays(5) } }, o || {});

// Aparelho já configurado, sem conta (ou com, se acct.user for uma conta)
async function openSettings(page, cloud, st) {
  await stubFriendsCloud(page, cloud || {});
  await seed(page, Object.assign({ history: [3, 2000], todayMl: 500 }, st || {}));
  await page.goto('/');
  await tabS(page).click();
}
// Aparelho novo (nunca abriu o app): a tela de boas-vindas. acct.user = null: ainda não há nenhum login neste aparelho
async function openFresh(page, users, extra) {
  await stubFriendsCloud(page, Object.assign({ acct: Object.assign({ user: null, users: users || {} }, extra || {}) }));
  await page.goto('/');
}
// Aparelho com conta criada: a dica local e o login da nuvem de mentira
async function withAccount(page, st, o) {
  const opt = o || {};
  const email = opt.email || EMAIL, uid = opt.uid || ME_UID;
  // serverVerified: o servidor já sabe que o e-mail foi confirmado, o aparelho ainda não. serverUid: o e-mail hoje pertence a OUTRA conta (foi recadastrado)
  const rec = { pw: PW, uid: opt.serverUid || uid, verified: opt.serverVerified != null ? !!opt.serverVerified : !!opt.verified, cloud: null };
  await page.addInitScript((h) => { if (!sessionStorage.getItem('mare:hint')) { sessionStorage.setItem('mare:hint', '1'); localStorage.setItem('mare:acct', JSON.stringify(h)); } },
    { uid: uid, email: email, verified: !!opt.verified });
  const users = {}; users[email] = rec;
  // noLogin: o login sumiu; stray: o aparelho tem um login anônimo de outra pessoa (que não é o da conta lembrada)
  const acctSeed = { users: users, user: opt.noLogin ? null : opt.stray ? { uid: 'strayuid00000000000000000001', email: '', verified: false, anon: true } : { uid: uid, email: email, verified: !!opt.verified, anon: false } };
  if (opt.dialect) acctSeed.dialect = opt.dialect;
  if (opt.remotePrefs) acctSeed.remotePrefs = opt.remotePrefs;
  await stubFriendsCloud(page, Object.assign({ acct: acctSeed }, opt.cloud || {}));
  await seed(page, Object.assign({ history: [3, 2000], todayMl: 500 }, st || {}));
}
const fill = async (page, email, pw) => {
  if (email != null) await page.locator('#acEmail').fill(email);
  if (pw != null) await page.locator('#acPw').fill(pw);
};
const primary = (page) => sheet(page).locator('[data-primary]');
const err = (page) => page.locator('#acErr');
const card = (page) => page.locator('.group', { has: page.locator('.acct-email, [data-action="ac-create"]') });

/* ---------- sem conta ---------- */
test.describe('sem conta', () => {
  test('Ajustes oferece criar conta ou entrar numa que já existe, e "Apagar tudo" continua lá', async ({ page }) => {
    await openSettings(page);
    const c = page.locator('.group', { hasText: 'Proteja seus dados' });
    await expect(c).toBeVisible();
    await expect(c).toContainText('Sem conta, se o celular quebrar');
    await expect(c.getByRole('button', { name: 'Criar conta' })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Já tenho conta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apagar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excluir', exact: true })).toHaveCount(0);
    await expect(page.locator('.about')).toContainText('a cópia na nuvem só volta com uma conta'); // sem conta, a cópia na nuvem não ajuda quem perde o aparelho
    await expect(page.locator('.about')).toContainText('v1.3.0');
  });

  test('a dica da conta vem primeiro, só a partir do segundo dia; dispensar não tira o cartão de Ajustes', async ({ page }) => {
    // um dia só: ainda não há o que perder
    await stubFriendsCloud(page);
    await seed(page, { todayMl: 500, ui: { tip_account: 0, tip_news12: 0 } });
    await page.goto('/');
    await expect(page.locator('.tip')).toContainText('Novidades no Maré');
    await page.evaluate(() => sessionStorage.clear());
    // dois dias ou mais: a dica da conta passa na frente das outras
    const p2 = await page.context().newPage();
    p2.on('pageerror', (e) => { errors.push(e.message); });
    await stubFriendsCloud(p2);
    await seed(p2, { history: [2, 1500], todayMl: 500, ui: { tip_account: 0, tip_news12: 0 } });
    await p2.goto('/');
    await expect(p2.locator('.tip')).toHaveCount(1);
    await expect(p2.locator('.tip')).toContainText('Proteja seus dados');
    await p2.locator('.tip').getByRole('button', { name: 'Criar conta' }).click();
    await expect(sheet(p2).getByRole('heading', { name: 'Criar conta' })).toBeVisible();
    await p2.keyboard.press('Escape');
    await p2.getByRole('button', { name: 'Dispensar dica' }).click();
    await expect(p2.locator('.tip')).toContainText('Novidades no Maré'); // a próxima da fila
    expect((await stored(p2)).ui.tip_account).toBe(1);
    await tabS(p2).click();
    await expect(p2.locator('.group', { hasText: 'Proteja seus dados' })).toBeVisible();
    await p2.close();
  });

  // O botão "Já tenho conta" só existe sem conta e com o onboarding feito. Um toque atrasado (a tela mudou entre o dedo descer e o app ler) não pode abrir
  // a troca de conta nos outros casos: trocar o login de quem já tem conta, ou de um aparelho que ainda nem começou, largaria o que está aqui.
  const staleTap = (page) => page.evaluate(() => {
    const b = document.createElement('button'); b.setAttribute('data-action', 'ac-switch'); document.body.appendChild(b); b.click(); b.remove();
  });
  test('um toque atrasado em "Já tenho conta" não abre a troca de conta para quem já tem conta', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await staleTap(page);
    await expect(page.locator('#sheet')).toBeHidden();
    expect((await acct(page)).calls).not.toContain('signIn');
  });
  test('um toque atrasado em "Já tenho conta" não abre a troca de conta quando a conta saiu do aparelho', async ({ page }) => {
    await withAccount(page, null, { noLogin: true, verified: true });
    await page.goto('/');
    await tabS(page).click();
    await expect(page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' })).toBeVisible();
    await staleTap(page);
    await expect(page.locator('#sheet')).toBeHidden();
  });
  test('um toque atrasado em "Já tenho conta" não abre a troca de conta antes de o onboarding terminar', async ({ page }) => {
    await openFresh(page);
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    await staleTap(page);
    await expect(page.locator('#sheet')).toBeHidden();
  });
});

/* ---------- criar conta ---------- */
test.describe('criar conta', () => {
  test('o formulário confere e-mail e senha antes de falar com o servidor', async ({ page }) => {
    await openSettings(page);
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Criar conta' })).toBeVisible();
    await primary(page).click();
    await expect(err(page)).toHaveText('Digite o e-mail.');
    await fill(page, 'ana@', 'qualquer-coisa');
    await primary(page).click();
    await expect(err(page)).toContainText('não parece certo');
    await fill(page, EMAIL, 'abc');
    await primary(page).click();
    await expect(err(page)).toHaveText('A senha precisa ter pelo menos 8 caracteres.');
    await fill(page, null, '12345678');
    await primary(page).click();
    await expect(err(page)).toContainText('fácil de adivinhar');
    await fill(page, null, EMAIL);
    await primary(page).click();
    await expect(err(page)).toHaveText('A senha não pode ser igual ao e-mail.');
    expect((await acct(page)) ? (await acct(page)).calls : []).not.toContain('create'); // nada saiu do aparelho
    // mostrar e ocultar a senha
    await fill(page, null, 'minha-senha-1');
    const eye = sheet(page).getByRole('button', { name: 'Mostrar a senha' });
    await expect(page.locator('#acPw')).toHaveAttribute('type', 'password');
    await eye.click();
    await expect(page.locator('#acPw')).toHaveAttribute('type', 'text');
    await expect(sheet(page).getByRole('button', { name: 'Ocultar a senha' })).toHaveAttribute('aria-pressed', 'true');
    await sheet(page).getByRole('button', { name: 'Ocultar a senha' }).click();
    await expect(page.locator('#acPw')).toHaveAttribute('type', 'password');
  });

  test('criar a conta mantém os dados e os amigos, grava a dica e troca o cartão (e-mail ainda sem confirmar)', async ({ page }) => {
    await openSettings(page, null, { social: { on: true, nick: 'Ana', share: true, code: 'ABCD2345' } });
    const before = await stored(page);
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, '  Ana@Exemplo.com ', PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta criada');
    await expect(page.locator('#sheet')).toBeHidden();
    const c = page.locator('.group', { has: page.locator('.acct-email') });
    await expect(c.locator('.acct-email')).toHaveText(EMAIL); // sem espaços, em minúsculas
    await expect(c).toContainText('E-mail ainda não confirmado');
    await expect(c.getByRole('button', { name: 'Reenviar' })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Trocar' })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Sair' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apagar', exact: true })).toHaveCount(0); // com conta, apagar é "Excluir conta"
    await expect(page.getByRole('button', { name: 'Excluir', exact: true })).toBeVisible();
    await expect(page.locator('.about')).toContainText('seus dados ficam no aparelho e na sua conta');
    const a = await acct(page);
    expect(a.calls).toContain('create');
    expect(a.linked).toBe(1);
    expect(a.sent).toEqual([EMAIL]); // o e-mail de confirmação
    expect(a.user).toMatchObject({ uid: ME_UID, email: EMAIL, anon: false }); // o MESMO uid: os dados e os amigos ficam como estavam
    expect(await hint(page)).toEqual({ uid: ME_UID, email: EMAIL, verified: false });
    const after = await stored(page);
    expect(Object.keys(after.days).sort()).toEqual(Object.keys(before.days).sort());
    expect(after.social).toEqual(before.social);
    expect(JSON.stringify(await page.evaluate(() => localStorage.getItem('mare:acct')))).not.toContain(PW); // a senha não é guardada em lugar nenhum
    // nada do que o APP guarda no aparelho tem a senha (a "nuvem de mentira" guarda a dela em fake:auth, que não conta)
    expect(JSON.stringify(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'fake:auth').map((k) => localStorage.getItem(k))))).not.toContain(PW);
  });

  test('depois de criar a conta, as alterações passam a levar os ajustes para a nuvem e a dica da conta some', async ({ page }) => {
    await stubFriendsCloud(page);
    await seed(page, { history: [3, 2000], todayMl: 500, ui: { tip_account: 0 } });
    await page.goto('/');
    await expect(page.locator('.tip')).toContainText('Proteja seus dados');
    await page.locator('.tip').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, EMAIL, PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta criada');
    await expect(page.locator('.tip')).toHaveCount(0);
    const n0 = (await acct(page)).prefsSynced;
    await page.getByRole('button', { name: 'Adicionar 250 ml' }).click();
    await expect.poll(async () => (await acct(page)).prefsSynced).toBeGreaterThan(n0); // salvar → cloud.syncPrefs()
  });

  test('e-mail que já existe, internet fora e erro do servidor viram frases em português; o formulário continua aberto', async ({ page }) => {
    const users = {}; users[EMAIL] = { pw: 'outra-senha-1', uid: 'outrauid0000000000000000001', verified: true, cloud: null };
    await openSettings(page, { acct: { users: users } });
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, EMAIL, PW);
    await primary(page).click();
    await expect(err(page)).toHaveText('Já existe uma conta com este e-mail. Toque em “Já tenho conta” para entrar nela.');
    await expect(primary(page)).toBeEnabled();
    await page.evaluate(() => { window.__acct.fail.create = 'auth/network-request-failed'; });
    await fill(page, 'ana.nova@exemplo.com', PW);
    await primary(page).click();
    await expect(err(page)).toHaveText('Sem conexão com a internet. Confira a rede e tente de novo.');
    await page.evaluate(() => { window.__acct.fail.create = 'auth/internal-error'; });
    await primary(page).click();
    await expect(err(page)).toHaveText('O serviço de login falhou. Tente de novo em instantes.');
    await page.evaluate(() => { window.__acct.fail.create = 'auth/operation-not-allowed'; });
    await primary(page).click();
    await expect(err(page)).toContainText('login por e-mail ainda não foi ligado');
    expect((await hint(page))).toBeNull(); // nenhuma dessas tentativas criou conta
    expect((await acct(page)).user.anon).toBe(true);
    await primary(page).click(); // sem falha: agora dá certo
    await expect(toast(page)).toContainText('Conta criada');
  });

  test('a resposta se perdeu no caminho mas a conta foi criada: o app percebe e segue como sucesso', async ({ page }) => {
    await openSettings(page);
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, EMAIL, PW);
    // a criação aconteceu no servidor, mas a chamada devolveu erro de rede: o login do aparelho já está na conta
    await page.evaluate(() => {
      const A = window.__acct;
      const orig = A.chk;
      A.chk = async (name) => {
        if (name !== 'create') return orig(name);
        A.calls.push(name);
        const u = A.user;
        A.users['ana@exemplo.com'] = { pw: 'Maré-segura-77', uid: u.uid, verified: false, cloud: null };
        A.user = { uid: u.uid, email: 'ana@exemplo.com', verified: false, anon: false };
        const e = new Error('mare/slow'); e.code = 'mare/slow'; throw e;
      };
    });
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta criada');
    expect((await hint(page)).email).toBe(EMAIL);
  });

  test('criar conta com a nuvem fora do ar (sem internet ao abrir o app): avisa, e na segunda tentativa a nuvem sobe e a conta nasce', async ({ page }) => {
    await openSettings(page, { initFail: 2 }); // a abertura e a primeira nova tentativa falham
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, EMAIL, PW);
    await primary(page).click();
    await expect(err(page)).toHaveText('A nuvem do Maré não está disponível agora. Confira a internet e tente de novo.');
    expect(await hint(page)).toBeNull();
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta criada');
    expect((await acct(page)).user).toMatchObject({ email: EMAIL, anon: false });
    expect(await hint(page)).toEqual({ uid: ME_UID, email: EMAIL, verified: false });
  });

  test('se a pessoa fecha o painel no meio e o servidor recusa, o erro aparece num aviso (nunca em silêncio)', async ({ page }) => {
    await openSettings(page);
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, EMAIL, PW);
    await page.evaluate(() => { window.__acct.lat = 700; window.__acct.fail.create = 'auth/email-already-in-use'; });
    await primary(page).click();
    await page.keyboard.press('Escape'); // o painel fecha enquanto o botão ainda diz "Criando…"
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(toast(page)).toContainText('Já existe uma conta com este e-mail');
    expect(await hint(page)).toBeNull();
  });
});

/* ---------- entrar ---------- */
test.describe('entrar', () => {
  test('aparelho novo: entrar com uma conta que tem os ajustes salvos pula o onboarding e traz registros, ajustes e amigos', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openFresh(page, users);
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar na conta' })).toBeVisible();
    await fill(page, ' ' + MARI.toUpperCase() + ' ', MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
    await expect(toast(page)).toContainText('5 dias de registros voltaram');
    await expect(page.locator('#tabbar')).toBeVisible(); // direto para o app: sem onboarding
    const s = await stored(page);
    expect(s.onboarded).toBe(true);
    expect(s.profile).toMatchObject({ name: 'Mariana', weight: 58, activity: 'high', wake: '06:30', sleep: '22:30', theme: 'dark' });
    expect(s.goal).toMatchObject({ mode: 'manual', manual: 2400 });
    expect(s.cups).toEqual([200, 300, 400, 600]);
    expect(s.lastO).toBe('tea');
    expect(s.reminders).toMatchObject({ enabled: false, interval: 60, smart: true }); // ligar lembretes é do aparelho (permissão)
    expect(s.social).toMatchObject({ on: true, nick: 'Mari', share: true });
    expect(Object.keys(s.days)).toHaveLength(5);
    expect(s.ui.tip_news12).toBe(1);
    expect(await hint(page)).toEqual({ uid: MARI_UID, email: MARI, verified: true });
    expect((await acct(page)).user).toMatchObject({ uid: MARI_UID, email: MARI });
    await tabS(page).click();
    await expect(page.locator('.acct-email')).toHaveText(MARI);
    await expect(page.locator('.group', { has: page.locator('.acct-email') })).toContainText('E-mail confirmado');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('conta criada pelo administrador (sem ajustes salvos): os registros voltam e o onboarding vem preenchido', async ({ page }) => {
    const users = {}; users[MARI] = account({ cloud: { prefs: null, user: { wake: '06:30', sleep: '23:30', unit: 'ml' }, profile: { nm: 'Mari', mc: 'concha', sh: true }, days: cloudDays(4) } });
    await openFresh(page, users);
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta encontrada');
    await expect(page.getByRole('heading', { name: 'Encontramos sua conta' })).toBeVisible();
    await expect(page.locator('.ob-text')).toContainText('Seus 4 dias de registros já estão aqui');
    await expect(page.getByRole('button', { name: 'Entrar na conta' })).toHaveCount(0);
    expect((await stored(page)).onboarded).toBe(false);
    expect(Object.keys((await stored(page)).days)).toHaveLength(4);
    await page.getByRole('button', { name: 'Continuar' }).click(); // 1: nome e peso (o apelido da nuvem vira o nome)
    await expect(page.locator('#obName')).toHaveValue('Mari');
    await page.locator('#obWeight').fill('61,5');
    await page.getByRole('button', { name: 'Continuar' }).click(); // 2: atividade
    await page.getByRole('button', { name: 'Continuar' }).click(); // 3: horários (os que a nuvem já sabia)
    await expect(page.locator('#obWake')).toHaveValue('06:30');
    await expect(page.locator('#obSleep')).toHaveValue('23:30');
    await page.getByRole('button', { name: 'Continuar' }).click(); // 4: meta
    await page.getByRole('button', { name: 'Perfeito, continuar' }).click(); // 5: lembretes
    await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click();
    await expect(page.locator('#tabbar')).toBeVisible();
    const s = await stored(page);
    expect(s).toMatchObject({ onboarded: true });
    expect(s.profile).toMatchObject({ name: 'Mari', weight: 61.5, wake: '06:30', sleep: '23:30' });
    expect(s.social).toMatchObject({ on: true, nick: 'Mari' }); // o perfil dos amigos existia na nuvem: a turma volta
    expect(Object.keys(s.days)).toHaveLength(4);
  });

  test('conta sem nada guardado: entra, avisa e segue o onboarding normal', async ({ page }) => {
    const users = {}; users[MARI] = account({ cloud: { prefs: null, user: null, profile: null, days: {} } });
    await openFresh(page, users);
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Ela ainda não tinha registros');
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    expect((await stored(page)).social.on).toBe(false);
    expect((await hint(page)).email).toBe(MARI);
  });

  test('senha errada ou e-mail sem conta: a mesma frase nos dois dialetos do servidor, e nada muda no aparelho', async ({ page }) => {
    const users = {}; users[MARI] = account();
    for (const dialect of ['new', 'old']) {
      const p = await page.context().newPage();
      p.on('pageerror', (e) => { errors.push(e.message); });
      await openFresh(p, users, { dialect: dialect });
      await p.getByRole('button', { name: 'Entrar na conta' }).click();
      await fill(p, MARI, 'senha-errada-1');
      await primary(p).click();
      await expect(err(p)).toHaveText('E-mail ou senha incorretos. Se esqueceu a senha, toque em “Esqueci a senha”.');
      await fill(p, 'ninguem@exemplo.com', 'qualquer-senha-1');
      await primary(p).click();
      await expect(err(p)).toHaveText('E-mail ou senha incorretos. Se esqueceu a senha, toque em “Esqueci a senha”.');
      await expect(primary(p)).toBeEnabled();
      expect(await hint(p)).toBeNull();
      const st = await stored(p);
      expect(!st || st.onboarded === false, 'o aparelho continua virgem').toBe(true);
      await p.close();
    }
  });

  test('o formulário de entrar confere os campos e Enter vai do e-mail à senha e envia', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openFresh(page, users);
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await primary(page).click();
    await expect(err(page)).toHaveText('Digite o e-mail.');
    await fill(page, MARI, null);
    await primary(page).click();
    await expect(err(page)).toHaveText('Digite a senha.');
    await page.locator('#acEmail').press('Enter');
    await expect(page.locator('#acPw')).toBeFocused();
    await page.locator('#acPw').fill(MARI_PW);
    await page.locator('#acPw').press('Enter');
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
  });

  test('sem internet depois do login: o painel oferece "Tentar de novo" sem pedir a senha outra vez', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openFresh(page, users, { fail: { fetchData: 'auth/network-request-failed' } }); // a primeira baixada dos dados falha
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(sheet(page).getByRole('heading', { name: 'Quase lá' })).toBeVisible();
    await expect(err(page)).toContainText('Sem conexão com a internet');
    await expect(page.locator('#acPw')).toHaveCount(0); // não pede a senha de novo
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
    const a = await acct(page);
    expect(a.calls.filter((c) => c === 'signIn')).toHaveLength(1);
    expect(a.calls.filter((c) => c === 'fetchData')).toHaveLength(2);
  });

  test('"Já tenho conta" em Ajustes: nada sai deste aparelho até a senha estar certa; depois a troca vem em ordem', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openSettings(page, { acct: { users: users } }, { social: SOCIAL });
    await page.locator('.group').getByRole('button', { name: 'Já tenho conta' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar numa conta que já existe' })).toBeVisible(); // o painel de entrar, sem confirmação antes
    await expect(sheet(page)).toContainText('4 dias');
    await expect(sheet(page)).toContainText('Seu perfil nos amigos também sai');
    await expect(sheet(page)).toContainText('faça um backup antes');
    // senha errada: nada foi apagado, nem aqui nem na nuvem, e a turma continua
    await fill(page, MARI, 'senha-errada-1');
    await primary(page).click();
    await expect(err(page)).toContainText('E-mail ou senha incorretos');
    let a = await acct(page);
    expect(a.calls).toContain('check');
    expect(a.calls).not.toContain('signIn');
    expect(a.wiped).toBe(0);
    expect(a.disposed).toBe(0);
    expect(a.user).toMatchObject({ uid: ME_UID, anon: true }); // o login do aparelho nem foi tocado (a senha foi conferida num login à parte)
    expect(await fakeCalls(page)).not.toContain('leave');
    expect(Object.keys((await stored(page)).days)).toHaveLength(4);
    expect((await stored(page)).social.on).toBe(true);
    // senha certa
    await fill(page, null, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
    await expect(page.locator('#sheet')).toBeHidden();
    a = await acct(page);
    expect(a.atSignIn).toEqual([{ wiped: 1, left: true, days: 4, user: ME_UID }]); // ao entrar: a cópia anônima já tinha sido limpa, a turma já tinha saído, e os 4 dias ainda estavam aqui
    expect(a.calls.indexOf('check')).toBeLessThan(a.calls.indexOf('signIn'));
    expect(a.disposed).toBeGreaterThanOrEqual(1); // a nuvem do login anônimo foi solta antes de entrar
    expect(await leaveDays(page)).toEqual([4, 4]); // quando a saída da turma chegou à nuvem, os registros daqui ainda não tinham saído
    expect(a.user).toMatchObject({ uid: MARI_UID, email: MARI, anon: false });
    expect(await hint(page)).toEqual({ uid: MARI_UID, email: MARI, verified: true });
    const s = await stored(page);
    expect(Object.keys(s.days)).toHaveLength(5); // só os da conta: nada se mistura
    expect(Object.keys(s.days).sort()).toEqual(Object.keys(cloudDays(5)).sort());
    expect(s.social).toMatchObject({ on: true, nick: 'Mari' }); // a turma é a da conta
  });

  test('"Já tenho conta": internet fora, ou a saída da turma que falha, não mudam nada; os registros e a turma ficam', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openSettings(page, { acct: { users: users } }, { social: SOCIAL });
    await page.locator('.group').getByRole('button', { name: 'Já tenho conta' }).click();
    await fill(page, MARI, MARI_PW);
    // 1) a conferência da senha não chegou ao servidor
    await page.evaluate(() => { window.__acct.fail.check = 'auth/network-request-failed'; });
    await primary(page).click();
    await expect(err(page)).toHaveText('Sem conexão com a internet. Confira a rede e tente de novo.');
    expect(await fakeCalls(page)).not.toContain('leave');
    expect((await acct(page)).wiped).toBe(0);
    // 2) a senha confere, mas não dá para sair da turma: tudo ou nada, então nada mudou
    await page.evaluate(() => { window.__fake.fail.leave = 'unavailable'; });
    await primary(page).click();
    await expect(err(page)).toHaveText('Não consegui sair da turma agora, então nada mudou. Confira a internet e tente de novo.');
    const a = await acct(page);
    expect(a.wiped).toBe(0);
    expect(a.calls).not.toContain('signIn');
    expect(a.user).toMatchObject({ uid: ME_UID, anon: true });
    expect(Object.keys((await stored(page)).days)).toHaveLength(4);
    expect((await stored(page)).social.on).toBe(true); // a turma continua deste aparelho
    expect(await hint(page)).toBeNull();
    // 3) a internet voltou: agora entra
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
    expect(Object.keys((await stored(page)).days)).toHaveLength(5);
  });

  test('"Já tenho conta" com a nuvem que não subiu ao abrir o app: a senha confere, a troca acontece e a nuvem sobe com a conta', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openSettings(page, { acct: { users: users }, initFail: 1 }, {}); // a primeira tentativa de ligar a nuvem falha (sem internet ao abrir)
    await page.locator('.group').getByRole('button', { name: 'Já tenho conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
    expect(Object.keys((await stored(page)).days)).toHaveLength(5);
    await expect.poll(() => cloudInits(page)).toBe(2); // a nuvem subiu de novo, já com o login da conta
    expect((await acct(page)).user).toMatchObject({ uid: MARI_UID, email: MARI });
  });

  test('sem registros no aparelho, o aviso do "Já tenho conta" é mais curto; cancelar não apaga nada', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await stubFriendsCloud(page, { acct: { users: users } });
    await seed(page, { social: { on: false } }); // aparelho configurado, sem nenhum registro
    await page.goto('/');
    await tabS(page).click();
    await page.locator('.group').getByRole('button', { name: 'Já tenho conta' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar numa conta que já existe' })).toBeVisible();
    await expect(sheet(page)).toContainText('os dados deste aparelho são trocados pelos da conta');
    await expect(sheet(page)).not.toContainText(/\d dias?\b/);
    await expect(sheet(page)).not.toContainText('Seu perfil nos amigos');
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    expect((await stored(page)).onboarded).toBe(true); // cancelar não apaga nada
    const a = await acct(page);
    expect(a.calls).not.toContain('check');
    expect(a.calls).not.toContain('signIn');
    expect(a.wiped).toBe(0);
  });

  test('"Já tem conta? Entrar nela", no painel de criar conta, leva ao painel de entrar com o e-mail já digitado', async ({ page }) => {
    await openSettings(page);
    await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
    await fill(page, '  Mari@Exemplo.com ', null);
    await sheet(page).getByRole('button', { name: 'Entrar nela' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar numa conta que já existe' })).toBeVisible();
    await expect(page.locator('#acEmail')).toHaveValue('mari@exemplo.com');
  });

  test('o app abre sem internet ao entrar e a pessoa fecha o "Quase lá": o aparelho sai desse login e segue como era', async ({ page }) => {
    // a) tela de boas-vindas: o aparelho continua virgem e dá para tentar de novo
    const users = {}; users[MARI] = account();
    await openFresh(page, users, { fail: { fetchData: 'auth/network-request-failed' } });
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(sheet(page).getByRole('heading', { name: 'Quase lá' })).toBeVisible();
    await sheet(page).locator('button.btn', { hasText: 'Fechar' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    await expect.poll(async () => (await acct(page)).calls.filter((c) => c === 'signOut').length).toBe(1);
    expect((await acct(page)).user).toBeNull(); // o aparelho não ficou escondido numa conta que a tela não mostra
    expect(await hint(page)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
  });

  test('troca de conta com o "Quase lá" fechado: os registros daqui continuam e a nuvem volta com um login novo', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openSettings(page, { acct: { users: users, fail: { fetchData: 'auth/network-request-failed' } } }, {});
    await page.locator('.group').getByRole('button', { name: 'Já tenho conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(sheet(page).getByRole('heading', { name: 'Quase lá' })).toBeVisible();
    await page.keyboard.press('Escape'); // fechar de outro jeito: é o mesmo caminho
    await expect(page.locator('#sheet')).toBeHidden();
    await expect.poll(async () => { const u = (await acct(page)).user; return !!(u && u.anon); }).toBe(true); // um login anônimo novo, depois de sair do da conta
    expect((await acct(page)).calls).toContain('signOut');
    expect(await hint(page)).toBeNull();
    expect(Object.keys((await stored(page)).days)).toHaveLength(4); // nada foi trocado
    expect((await stored(page)).onboarded).toBe(true);
    await expect.poll(() => cloudInits(page)).toBe(2);
    await tabS(page).click();
    await expect(page.locator('.group', { hasText: 'Proteja seus dados' })).toBeVisible(); // continua sem conta, como antes
  });

  test('a pessoa fecha o painel enquanto os dados baixam e a baixada falha: um aviso conta o que houve e o aparelho sai desse login (não fica escondido numa conta)', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openFresh(page, users, { fail: { fetchData: 'auth/network-request-failed' }, lat: 400 }); // cada passo do servidor demora: dá tempo de fechar o painel
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await page.keyboard.press('Escape'); // o painel fecha com o botão ainda dizendo "Entrando…"
    await expect(page.locator('#sheet')).toBeHidden();
    await expect(toast(page)).toContainText('não consegui baixar seus dados'); // sem painel para oferecer "Tentar de novo", o aviso vai num toast
    await expect.poll(async () => (await acct(page)).user).toBeNull(); // o login da conta não ficou por baixo dos panos (a saída do servidor leva 400 ms)
    expect((await acct(page)).calls.filter((c) => c === 'signOut')).toHaveLength(1);
    expect(await hint(page)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
  });

  test('"Apagar tudo" e logo "Entrar na conta", com a limpeza da nuvem ainda em andamento: o login só troca depois de a limpeza terminar', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openSettings(page, { acct: { users: users } }, {});
    await page.evaluate(() => { window.__fake.wipeLat = 900; }); // a limpeza da nuvem (do login anônimo de agora) demora a terminar
    await page.getByRole('button', { name: 'Apagar', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Apagar tudo' }).click();
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
    const a = await acct(page);
    expect(a.wiped).toBe(1);
    expect(a.signInDuringWipe).toBe(0); // se o login trocasse no meio, a limpeza perderia a permissão e a cópia anônima ficaria na nuvem
  });
});

/* ---------- esqueci a senha ---------- */
test.describe('esqueci a senha', () => {
  test('o link vai para o e-mail da conta e a resposta é a mesma para um e-mail sem conta', async ({ page }) => {
    const users = {}; users[MARI] = account();
    await openFresh(page, users, { dialect: 'old' }); // o dialeto que denunciaria quem tem conta: o app não pode mostrar a diferença
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await fill(page, MARI.toUpperCase(), null);
    await sheet(page).getByRole('button', { name: 'Esqueci a senha' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Esqueci a senha' })).toBeVisible();
    await expect(page.locator('#acEmail')).toHaveValue(MARI); // o e-mail digitado vem junto
    await primary(page).click();
    await expect(sheet(page).getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
    await expect(sheet(page)).toContainText(MARI);
    expect((await acct(page)).resets).toEqual([MARI]);
    // e-mail sem conta: a mesma tela, e nenhum e-mail sai
    await sheet(page).getByRole('button', { name: 'Já criei a senha, entrar' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar na conta' })).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Esqueci a senha' }).click();
    await fill(page, 'ninguem@exemplo.com', null);
    await primary(page).click();
    await expect(sheet(page).getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
    await expect(sheet(page)).toContainText('ninguem@exemplo.com');
    expect((await acct(page)).resets).toEqual([MARI]);
    // volta ao login e entra
    await sheet(page).getByRole('button', { name: 'Já criei a senha, entrar' }).click();
    await fill(page, MARI, MARI_PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Bem-vindo de volta!');
  });

  test('e-mail inválido é recusado no painel; "Voltar" leva ao login com o e-mail digitado', async ({ page }) => {
    await openFresh(page, {});
    await page.getByRole('button', { name: 'Entrar na conta' }).click();
    await sheet(page).getByRole('button', { name: 'Esqueci a senha' }).click();
    await fill(page, 'sem-arroba', null);
    await primary(page).click();
    await expect(err(page)).toContainText('não parece certo');
    const a0 = await acct(page);
    expect(a0 ? a0.resets : []).toEqual([]); // nada foi pedido ao servidor
    await fill(page, 'ana@exemplo.com', null);
    await sheet(page).getByRole('button', { name: 'Voltar' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar na conta' })).toBeVisible();
    await expect(page.locator('#acEmail')).toHaveValue('ana@exemplo.com');
  });

  test('quem já está na conta troca a senha pelo link no próprio e-mail', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.locator('.group').getByRole('button', { name: 'Trocar' }).click();
    await expect(toast(page)).toContainText('Enviamos o link para ' + EMAIL);
    expect((await acct(page)).resets).toEqual([EMAIL]);
  });
});

/* ---------- a conta no dia a dia ---------- */
test.describe('com conta', () => {
  test('e-mail ainda sem confirmar: o cartão avisa e "Reenviar" manda outro link', async ({ page }) => {
    await withAccount(page, null, { verified: false });
    await page.goto('/');
    await tabS(page).click();
    const c = page.locator('.group', { has: page.locator('.acct-email') });
    await expect(c).toContainText('E-mail ainda não confirmado');
    await expect(c).toContainText('Confirme o e-mail');
    await c.getByRole('button', { name: 'Reenviar' }).click();
    await expect(toast(page)).toContainText('Enviamos o link para ' + EMAIL);
    expect((await acct(page)).sent).toEqual([EMAIL]);
    await expect(c).toContainText('E-mail ainda não confirmado'); // o servidor ainda não viu o toque no link
  });

  test('ao abrir o app já com o e-mail confirmado no servidor, o cartão mostra "confirmado"', async ({ page }) => {
    await withAccount(page, null, { verified: false, serverVerified: true }); // a pessoa tocou no link do e-mail com o app fechado
    await page.goto('/');
    await tabS(page).click();
    await expect(page.locator('.group', { has: page.locator('.acct-email') })).toContainText('E-mail confirmado');
    await expect(page.getByRole('button', { name: 'Reenviar' })).toHaveCount(0);
    expect((await hint(page)).verified).toBe(true);
  });

  test('e-mail ainda sem confirmar: voltar ao app várias vezes seguidas só pergunta ao servidor uma vez (no máximo a cada 30 s)', async ({ page }) => {
    await withAccount(page, null, { verified: false });
    await page.goto('/');
    await tabS(page).click();
    const asked = async () => (await acct(page)).calls.filter((c) => c === 'refresh').length;
    await expect.poll(asked).toBe(1); // ao abrir o app, uma conferência
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); }); // o app volta ao primeiro plano
      await page.waitForTimeout(150);
    }
    expect(await asked()).toBe(1); // as voltas seguintes, dentro dos 30 s, não perguntam de novo
  });

  test('sair da conta: envia o que falta, volta às boas-vindas e não mexe na nuvem nem nos amigos', async ({ page }) => {
    await withAccount(page, { social: { on: true, nick: 'Ana', share: true, code: 'ABCD2345' } }, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Sair da conta?' })).toBeVisible();
    await expect(sheet(page)).toContainText('continuam guardados na conta');
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu da conta');
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
    const a = await acct(page);
    expect(a.calls).toEqual(expect.arrayContaining(['detach', 'signOut']));
    expect(a.calls.indexOf('detach')).toBeLessThan(a.calls.indexOf('signOut'));
    expect(a.user).toBeNull();
    expect(a.wiped).toBe(0); // a conta e os dados na nuvem ficam intactos
    expect(a.users).toEqual([EMAIL]);
    expect(await fakeCalls(page)).not.toContain('leave'); // nem a turma
    expect(await hint(page)).toBeNull();
    expect((await stored(page)).onboarded).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('mare:social'))).toBeNull();
  });

  test('sair sem internet: avisa que há registros por enviar e só sai se a pessoa insistir', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.evaluate(() => { window.__acct.fail.detach = 'mare/pending'; });
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Ainda há registros por enviar' })).toBeVisible();
    expect((await stored(page)).onboarded).toBe(true); // nada saiu ainda
    expect((await acct(page)).user).not.toBeNull();
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
    expect((await hint(page)).email).toBe(EMAIL);
    // insistindo
    await page.evaluate(() => { window.__acct.fail.detach = 'mare/pending'; });
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair mesmo assim' }).click();
    await expect(toast(page)).toContainText('Você saiu da conta');
    const a = await acct(page);
    expect(a.user).toBeNull();
    expect(a.detachForce).toBe(1); // insistir pula as esperas, mas o aparelho ainda é tirado dos avisos da conta
    expect((await stored(page)).onboarded).toBe(false);
  });

  test('sair da conta quando a nuvem não subiu ao abrir o app: tenta subir antes; se não der, não deixa sair sem avisar', async ({ page }) => {
    await withAccount(page, null, { verified: true, cloud: { initFail: 2 } }); // a abertura e a primeira nova tentativa falham
    await page.goto('/');
    await tabS(page).click();
    const sair = () => page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sair();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Ainda há registros por enviar' })).toBeVisible(); // sem a nuvem não dá para saber se o que há aqui já está na conta
    const a0 = await acct(page); // sem nuvem, o login de mentira nem chegou a existir: o que importa é que nada saiu
    expect(a0 ? a0.calls : []).not.toContain('signOut');
    expect((await hint(page)).email).toBe(EMAIL);
    expect((await stored(page)).onboarded).toBe(true);
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click();
    // a internet voltou: a nuvem sobe, envia o que falta e só então sai
    await sair();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu da conta');
    const a = await acct(page);
    expect(a.calls.indexOf('detach')).toBeGreaterThan(-1);
    expect(a.calls.indexOf('detach')).toBeLessThan(a.calls.indexOf('signOut'));
    expect(a.user).toBeNull();
    expect((await stored(page)).onboarded).toBe(false);
  });

  test('sair sem a nuvem e insistindo: sai mesmo assim, sem esperar nada, e o aparelho volta ao início', async ({ page }) => {
    await withAccount(page, null, { verified: true, cloud: { initFail: 9 } }); // a nuvem não sobe de jeito nenhum
    await page.goto('/');
    await tabS(page).click();
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await sheet(page).getByRole('button', { name: 'Sair mesmo assim' }).click();
    await expect(toast(page)).toContainText('Você saiu da conta');
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    const a = await acct(page);
    expect(a.calls).toContain('signOut');
    expect(a.calls).not.toContain('detach'); // não havia nuvem para soltar
    expect(a.user).toBeNull();
    expect(await hint(page)).toBeNull();
  });

  test('sair da conta e o servidor não encerra o login (rede cai no fim): avisa, a conta continua neste aparelho e a nuvem volta a sincronizar; tentar de novo termina', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    const sair = async () => {
      await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
      await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    };
    await page.evaluate(() => { window.__acct.fail.signOut = 'auth/network-request-failed'; });
    await sair();
    await expect(toast(page)).toContainText('Sem conexão com a internet');
    expect((await hint(page)).email).toBe(EMAIL); // a conta continua neste aparelho
    expect((await stored(page)).onboarded).toBe(true);
    expect((await acct(page)).user).not.toBeNull();
    await expect.poll(() => cloudInits(page)).toBe(2); // a nuvem já tinha sido solta para sair: sobe de novo e a sincronização não fica parada
    await sair(); // sem falha: agora termina
    await expect(toast(page)).toContainText('Você saiu da conta');
    expect((await acct(page)).user).toBeNull();
    expect((await stored(page)).onboarded).toBe(false);
  });

  test('sair da conta: um segundo toque enquanto a saída ainda anda só pede para aguardar (não começa outra saída)', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.evaluate(() => { window.__acct.lat = 600; }); // cada passo do servidor demora: a saída leva mais de 1 s
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Saindo…');
    // o segundo toque (o botão do cartão e o "Sair" do painel, como faz quem toca de novo sem esperar)
    await page.evaluate(() => { const b = document.querySelector('[data-action="ac-out"]'); if (b) b.click(); });
    await page.evaluate(() => { const b = document.querySelector('[data-action="confirm-ok"]'); if (b) b.click(); });
    await expect(toast(page)).toContainText('Você saiu da conta');
    const a = await acct(page);
    expect(a.calls.filter((c) => c === 'detach')).toHaveLength(1);
    expect(a.calls.filter((c) => c === 'signOut')).toHaveLength(1);
  });

  test('o login some no meio de "Sair da conta": quem está saindo já sabe, a saída termina normalmente e o aviso de "conta que saiu" não aparece', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await expect.poll(async () => { const a = await acct(page); return !!(a && a.watching); }).toBe(true);
    await page.evaluate(() => { window.__acct.lat = 600; }); // a saída leva mais de 1 s
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Saindo…');
    await page.evaluate(() => window.__acct.end()); // a senha foi trocada em outro lugar bem agora
    await page.waitForTimeout(250);
    const agora = await toast(page).innerText(); // uma foto do aviso (não uma espera): "Sua conta saiu" apareceria e sumiria sozinho logo depois
    expect(agora).toContain('Saindo');
    expect(agora).not.toContain('Sua conta saiu'); // durante uma operação da conta, o aviso fica por conta de quem a faz
    await expect(toast(page)).toContainText('Você saiu da conta');
    expect((await stored(page)).onboarded).toBe(false);
    expect(await hint(page)).toBeNull();
  });

  test('excluir a conta: pede a senha, sai da turma, limpa a nuvem, apaga o login e o aparelho', async ({ page }) => {
    await withAccount(page, { social: { on: true, nick: 'Ana', share: true, code: 'ABCD2345' } }, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    const d = sheet(page);
    await expect(d.getByRole('heading', { name: 'Excluir conta' })).toBeVisible();
    await expect(d).toContainText(EMAIL);
    await primary(page).click();
    await expect(err(page)).toHaveText('Digite a senha.');
    await fill(page, null, 'senha-errada-99');
    await primary(page).click();
    await expect(err(page)).toHaveText('Senha incorreta. Confira e tente de novo.');
    let a = await acct(page);
    expect(a.users).toEqual([EMAIL]); // nada foi apagado com a senha errada
    expect(a.wiped).toBe(0);
    expect(await fakeCalls(page)).not.toContain('leave');
    await fill(page, null, PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta excluída');
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    a = await acct(page);
    expect(a.users).toEqual([]);
    expect(a.user).toBeNull();
    expect(a.wiped).toBe(1);
    expect(await fakeCalls(page)).toContain('leave'); // saiu da turma antes
    expect(a.calls.indexOf('reauth')).toBeLessThan(a.calls.indexOf('deleteUser'));
    // a ordem: senha → limpa a nuvem (só o que o servidor tem; a turma fica para depois) → sai da turma, que não tem volta → apaga o login
    expect(a.calls.slice(a.calls.lastIndexOf('reauth')).filter((c) => ['reauth', 'wipe', 'leave', 'deleteUser'].indexOf(c) >= 0)).toEqual(['reauth', 'wipe', 'leave', 'deleteUser']);
    expect(a.wipeOpts).toEqual([{ social: false, strict: true }]);
    await page.waitForTimeout(200); // o aviso do SDK de que o login sumiu chega depois: não pode virar "sua conta saiu deste aparelho"
    await expect(toast(page)).not.toContainText('Sua conta saiu');
    expect(await hint(page)).toBeNull();
    expect((await stored(page)).onboarded).toBe(false);
  });

  test('excluir a conta sem a nuvem no ar: nada é apagado (excluir só o login deixaria os dados para trás)', async ({ page }) => {
    await withAccount(page, { social: SOCIAL }, { verified: true, cloud: { initFail: 9 } });
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await fill(page, null, PW);
    await primary(page).click();
    await expect(err(page)).toHaveText('A nuvem do Maré não está disponível agora. Confira a internet e tente de novo.');
    const a = await acct(page);
    expect(a.users).toEqual([EMAIL]);
    expect(a.calls).not.toContain('wipe');
    expect(a.calls).not.toContain('deleteUser');
    expect(await fakeCalls(page)).not.toContain('leave');
    expect((await stored(page)).onboarded).toBe(true);
    expect((await stored(page)).social.on).toBe(true);
    expect(await hint(page)).not.toBeNull();
  });

  test('excluir a conta e a saída da turma falha: a conta e o aparelho ficam, a nuvem é reenviada, e tentar de novo termina', async ({ page }) => {
    await withAccount(page, { social: SOCIAL }, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await fill(page, null, PW);
    await page.evaluate(() => { window.__fake.fail.leave = 'unavailable'; });
    await primary(page).click();
    await expect(err(page)).toHaveText('Não consegui sair da turma agora, então nada mudou. Confira a internet e tente de novo.');
    let a = await acct(page);
    expect(a.calls).toContain('wipe'); // a limpeza já tinha acontecido: a saída da turma vem depois e é a que falhou
    expect(a.calls).not.toContain('deleteUser');
    expect(a.users).toEqual([EMAIL]); // o login ficou: a conta nunca fica sem dono
    await expect.poll(async () => (await acct(page)).resynced).toBe(1); // o aparelho devolveu à nuvem o que tinha
    expect((await stored(page)).onboarded).toBe(true);
    expect((await stored(page)).social.on).toBe(true); // a turma continua deste aparelho
    await primary(page).click(); // sem falha: agora a saída funciona e a exclusão termina
    await expect(toast(page)).toContainText('Conta excluída');
    a = await acct(page);
    expect(a.users).toEqual([]);
    expect(a.calls.filter((c) => c === 'deleteUser')).toHaveLength(1);
  });

  test('excluir a conta com a nuvem falhando no meio: a conta continua e o aparelho reenvia o que tem', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await page.evaluate(() => { window.__acct.fail.wipe = 'unavailable'; });
    await fill(page, null, PW);
    await primary(page).click();
    await expect(err(page)).toHaveText('Sem conexão com a nuvem agora. Tente de novo quando a internet voltar.');
    const a = await acct(page);
    expect(a.users).toEqual([EMAIL]); // o login NÃO foi apagado: a nuvem ficaria sem dono
    expect(a.calls).not.toContain('deleteUser');
    await expect.poll(async () => (await acct(page)).resynced).toBe(1);
    expect((await stored(page)).onboarded).toBe(true);
    expect(await hint(page)).not.toBeNull();
    await primary(page).click(); // de novo, agora sem falha
    await expect(toast(page)).toContainText('Conta excluída');
  });

  test('excluir a conta e apagar o login falha DEPOIS de a turma sair: o aviso conta isso, o aparelho já reflete que saiu da turma e tentar de novo termina', async ({ page }) => {
    await withAccount(page, { social: SOCIAL }, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await fill(page, null, PW);
    await page.evaluate(() => { window.__acct.fail.deleteUser = 'auth/network-request-failed'; });
    await primary(page).click();
    await expect(err(page)).toContainText('A sua turma já tinha saído da nuvem');
    expect(await fakeCalls(page)).toContain('leave');
    let a = await acct(page);
    expect(a.users).toEqual([EMAIL]); // o login ficou: a conta nunca fica sem dono
    expect((await stored(page)).social.on).toBe(false); // a turma já saiu da nuvem: a tela e o aparelho refletem isso
    expect((await stored(page)).onboarded).toBe(true);
    await primary(page).click(); // sem falha: agora o login é apagado e a exclusão termina
    await expect(toast(page)).toContainText('Conta excluída');
    a = await acct(page);
    expect(a.users).toEqual([]);
    expect(a.calls.filter((c) => c === 'deleteUser')).toHaveLength(2);
  });

  test('excluir a conta com a nuvem que não subiu ao abrir o app, mas a internet voltou: a nuvem sobe de novo e a exclusão termina', async ({ page }) => {
    await withAccount(page, null, { verified: true, cloud: { initFail: 1 } }); // só a abertura falha
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await fill(page, null, PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Conta excluída');
    const a = await acct(page);
    expect(a.users).toEqual([]);
    expect(a.wiped).toBe(1);
    expect(await hint(page)).toBeNull();
  });

  test('o "Apagar tudo" antigo não existe para quem tem conta (excluir é o caminho)', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await expect(page.locator('[data-action="reset"]')).toHaveCount(0);
    await expect(page.locator('[data-action="ac-del"]')).toHaveCount(1);
  });

  test('ajustes gravados por outro aparelho da mesma conta chegam ao abrir o app (os amigos e os lembretes não mudam)', async ({ page }) => {
    const remote = { u: Date.now() + 5000, prefs: JSON.parse(PREFS({ profile: { name: 'Ana Clara', weight: 64.5, activity: 'athlete', wake: '05:30', sleep: '22:00', unit: 'ml', theme: 'dark', others: true, mix: false, mascot: '' },
      goal: { mode: 'manual', manual: 3100, climate: false }, social: { on: true, nick: 'Outra', share: false, goal: null, push: true, hit: false, week: true } }).j) };
    // o app recebe os ajustes já limpos (cleanPrefs): o fake os entrega como o firebase.js entregaria (a leitura do documento é testada em tests/rules/)
    await withAccount(page, { reminders: { enabled: true, interval: 90, smart: true, nextAt: Date.now() + 3600e3 } }, { verified: true, remotePrefs: remote });
    await page.goto('/');
    await tabS(page).click();
    await expect.poll(async () => (await stored(page)).profile.name).toBe('Ana Clara');
    const s = await stored(page);
    expect(s.profile).toMatchObject({ weight: 64.5, activity: 'athlete', wake: '05:30', sleep: '22:00', theme: 'dark' });
    expect(s.goal).toMatchObject({ mode: 'manual', manual: 3100 });
    expect(s.reminders.enabled).toBe(true); // ligar ou desligar lembretes é deste aparelho
    expect(s.social.on).toBe(false); // e os amigos só ligam pelo fluxo dos amigos
    await expect(page.locator('input[data-field="name"]')).toHaveValue('Ana Clara');
  });

  test('ajustes de outro aparelho que chegam tarde, depois de a pessoa já ter saído da conta: o aparelho que voltou ao início não é preenchido com eles', async ({ page }) => {
    const remote = { u: Date.now() + 5000, prefs: JSON.parse(PREFS({ profile: { name: 'Ana Clara', weight: 64.5, activity: 'athlete', wake: '05:30', sleep: '22:00', unit: 'ml', theme: 'dark', others: true, mix: false, mascot: '' } }).j) };
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.locator('.group', { has: page.locator('.acct-email') }).getByRole('button', { name: 'Sair' }).click();
    await sheet(page).getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(toast(page)).toContainText('Você saiu da conta');
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    await page.evaluate((r) => { window.__acct.hooks.onPrefs(r.prefs, r.u); }, remote); // a leitura que ainda estava a caminho chega só agora
    const s = await stored(page);
    expect(s.onboarded).toBe(false);
    expect(s.profile.name).not.toBe('Ana Clara');
    expect(s.profile.weight).not.toBe(64.5);
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
  });

  test('com conta, "Importar" junta o backup aos registros: o dia mais recente vence, nada some e os ajustes ficam como estão', async ({ page }) => {
    await withAccount(page, null, { verified: true });
    await page.goto('/');
    await tabS(page).click();
    const before = await stored(page);
    const keys = Object.keys(before.days).sort(); // hoje e os 3 dias de antes
    const oldest = keys[0], mid = keys[1];
    const n1 = shiftKey(oldest, 1), n2 = shiftKey(oldest, 2); // dois dias que o aparelho não tem
    const e = (id, ml) => ({ id: id, t: Date.now() - 864e5, ml: ml, d: 'water' });
    const days = {};
    days[n1] = { goal: 2500, u: 5, entries: [e('bk1', 1800)] };
    days[n2] = { goal: 2500, u: 5, entries: [e('bk2', 1600)] };
    days[mid] = { goal: 2700, u: 7, entries: [e('bk3', 900)] }; // um dia que o aparelho já tem, com a versão do arquivo mais nova
    days[oldest] = { goal: 2500, entries: [e('bk4', 100)] }; // outro, sem data de alteração: o do aparelho vale mais
    const backup = { app: 'mare', v: 1, data: { v: 1, onboarded: true, profile: { name: 'Outra Pessoa', weight: 99, theme: 'dark' }, days: days } };
    const file = { name: 'mare-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
    const importar = async () => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar' }).click()]);
      await chooser.setFiles(file);
    };
    await importar();
    await expect(sheet(page).getByRole('heading', { name: 'Juntar o backup à sua conta?' })).toBeVisible(); // não "Restaurar": o aparelho tem conta
    await expect(sheet(page)).toContainText('nada do que já está aqui é apagado');
    await sheet(page).getByRole('button', { name: 'Juntar' }).click();
    await expect(toast(page)).toContainText('3 dias do backup entraram na sua conta');
    const s = await stored(page);
    expect(Object.keys(s.days).sort()).toEqual([n2, n1].concat(keys).sort()); // nada saiu, dois dias entraram
    expect(s.days[n1].entries[0].ml).toBe(1800);
    expect(s.days[mid].entries[0].ml).toBe(900); // o do arquivo era mais novo
    expect(s.days[oldest].entries[0].ml).toBe(before.days[oldest].entries[0].ml); // o do aparelho ficou
    expect(s.profile).toMatchObject({ name: before.profile.name, weight: before.profile.weight, theme: before.profile.theme }); // os ajustes não são tocados
    expect(s.days[n1].u).toBeGreaterThan(Date.now() - 60000); // passa a ser o mais recente: sobe para a conta e vence nos outros aparelhos
    const a = await acct(page);
    const sent = [].concat.apply([], a.synced);
    [n1, n2, mid].forEach((k) => { expect(sent, 'dia enviado à conta: ' + k).toContain(k); });
    expect(sent).not.toContain(oldest);
    // o mesmo arquivo de novo: nada a juntar
    await importar();
    await sheet(page).getByRole('button', { name: 'Juntar' }).click();
    await expect(toast(page)).toContainText('Nada novo no arquivo');
  });

  test('sem conta, "Importar" continua substituindo os dados do aparelho (o aviso é outro)', async ({ page }) => {
    await openSettings(page);
    const backup = { app: 'mare', v: 1, data: { v: 1, onboarded: true, profile: { name: 'Bia', weight: 60 }, days: {} } };
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar' }).click()]);
    await chooser.setFiles({ name: 'mare-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(sheet(page).getByRole('heading', { name: 'Restaurar backup?' })).toBeVisible();
    await expect(sheet(page)).toContainText('serão substituídos');
  });
});

/* ---------- a conta saiu do aparelho ---------- */
test.describe('conta que saiu do aparelho', () => {
  test('o app avisa, mostra o cartão em Ajustes e a aba Amigos pede para entrar; os dados continuam no aparelho', async ({ page }) => {
    await withAccount(page, { social: { on: true, nick: 'Ana', share: true, code: 'ABCD2345' }, ui: { tip_account: 0 } }, { noLogin: true, verified: true });
    await page.goto('/');
    await expect(toast(page)).toContainText('Sua conta saiu deste aparelho');
    await expect(page.locator('.tip')).toHaveCount(0); // a dica "Proteja seus dados" não aparece: o problema é outro, e o aviso já está na tela
    await expect(toast(page).getByRole('button', { name: 'Entrar de novo' })).toBeVisible();
    await tabS(page).click();
    const c = page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' });
    await expect(c).toBeVisible();
    await expect(c).toContainText(EMAIL);
    expect(Object.keys((await stored(page)).days).length).toBeGreaterThan(0);
    expect((await acct(page)).user).toBeNull(); // nenhum login anônimo novo foi criado por baixo dos panos
    await page.locator('#tabbar').getByRole('button', { name: /^Amigos/ }).click();
    await expect(page.locator('.notice')).toContainText('Sua conta saiu deste aparelho');
    await page.locator('.notice').getByRole('button', { name: 'Entrar de novo' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Entrar de novo' })).toBeVisible();
  });

  test('entrar de novo: o e-mail é fixo, a senha reconecta e os dados do aparelho ficam como estavam', async ({ page }) => {
    await withAccount(page, null, { noLogin: true, verified: true });
    await page.goto('/');
    await tabS(page).click();
    const before = await stored(page);
    await page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' }).getByRole('button', { name: 'Entrar de novo' }).click();
    await expect(page.locator('#acEmail')).toHaveValue(EMAIL);
    await expect(page.locator('#acEmail')).toHaveAttribute('readonly', '');
    await fill(page, null, 'senha-errada-1');
    await primary(page).click();
    await expect(err(page)).toContainText('E-mail ou senha incorretos');
    await fill(page, null, PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Pronto, você voltou para a sua conta');
    await expect(page.locator('.group', { has: page.locator('.acct-email') })).toBeVisible();
    await expect(page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' })).toHaveCount(0);
    const after = await stored(page);
    expect(Object.keys(after.days).sort()).toEqual(Object.keys(before.days).sort()); // nada foi apagado nem trocado
    expect((await acct(page)).user).toMatchObject({ email: EMAIL, anon: false });
    expect(await page.evaluate(() => window.__cloudInit)).toBe(2); // a nuvem foi religada com o login de volta
  });

  test('esqueci a senha a partir do "entrar de novo" e voltar mantém o e-mail fixo', async ({ page }) => {
    await withAccount(page, null, { noLogin: true, verified: true });
    await page.goto('/');
    await tabS(page).click();
    await page.getByRole('button', { name: 'Entrar de novo' }).first().click();
    await sheet(page).getByRole('button', { name: 'Esqueci a senha' }).click();
    await expect(page.locator('#acEmail')).toHaveValue(EMAIL);
    await sheet(page).getByRole('button', { name: 'Voltar' }).click();
    await expect(page.locator('#acEmail')).toHaveAttribute('readonly', '');
    await expect(sheet(page).getByRole('heading', { name: 'Entrar de novo' })).toBeVisible();
  });

  test('o login some com o app aberto (a senha foi trocada em outro lugar): o app avisa na hora e não apaga nada', async ({ page }) => {
    await withAccount(page, { social: SOCIAL }, { verified: true });
    await page.goto('/');
    await expect.poll(async () => { const a = await acct(page); return !!(a && a.watching); }).toBe(true); // a nuvem subiu e o app está de olho no login
    await page.evaluate(() => window.__acct.end());
    await expect(toast(page)).toContainText('Sua conta saiu deste aparelho');
    await expect(toast(page).getByRole('button', { name: 'Entrar de novo' })).toBeVisible();
    await tabS(page).click();
    await expect(page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' })).toBeVisible();
    expect(Object.keys((await stored(page)).days).length).toBeGreaterThan(0); // os registros ficam
    expect((await stored(page)).social.on).toBe(true);
    expect((await hint(page)).email).toBe(EMAIL); // e o aparelho lembra de quem é a conta
    await page.waitForTimeout(400);
    expect((await acct(page)).user).toBeNull(); // nenhum login anônimo apareceu por baixo dos panos
    expect(await cloudInits(page)).toBe(1);
    await page.getByRole('button', { name: 'Entrar de novo' }).first().click();
    await fill(page, null, PW);
    await primary(page).click();
    await expect(toast(page)).toContainText('Pronto, você voltou para a sua conta');
    await expect(page.locator('.group', { has: page.locator('.acct-email') })).toBeVisible();
  });

  test('um login de outra pessoa no aparelho (que lembra de uma conta): sai, e o app pede para entrar de novo', async ({ page }) => {
    await withAccount(page, { social: SOCIAL }, { verified: true, stray: true });
    await page.goto('/');
    await expect(toast(page)).toContainText('Sua conta saiu deste aparelho');
    const a = await acct(page);
    expect(a.strayOut).toBe(1); // o login estranho foi descartado
    expect(a.user).toBeNull(); // e nenhum outro foi criado: virar "outra pessoa" na nuvem deixaria amigos e registros para trás
    expect((await hint(page)).email).toBe(EMAIL);
    expect(Object.keys((await stored(page)).days).length).toBeGreaterThan(0);
  });

  test('conta que saiu do aparelho: restaurar um backup não liga a nuvem de novo por baixo dos panos (nenhuma tentativa, nenhum login anônimo)', async ({ page }) => {
    await withAccount(page, null, { noLogin: true, verified: true });
    await page.goto('/');
    await expect(toast(page)).toContainText('Sua conta saiu deste aparelho');
    const inits = await cloudInits(page);
    await tabS(page).click();
    const backup = { app: 'mare', v: 1, data: { v: 1, onboarded: true, profile: { name: 'Bia', weight: 60 }, days: {} } };
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar' }).click()]);
    await chooser.setFiles({ name: 'mare-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(sheet(page).getByRole('heading', { name: 'Restaurar backup?' })).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Restaurar' }).click();
    await expect(toast(page)).toContainText('Backup restaurado');
    await page.waitForTimeout(300); // se algo fosse tentar ligar a nuvem, já teria tentado
    expect(await cloudInits(page)).toBe(inits);
    expect((await acct(page)).user).toBeNull();
    expect((await hint(page)).email).toBe(EMAIL); // o aparelho continua lembrando de quem é a conta
  });

  test('entrar de novo com um e-mail que hoje é de outra conta: recusa e explica o caminho, sem mexer em nada', async ({ page }) => {
    await withAccount(page, null, { noLogin: true, verified: true, serverUid: 'outrauid0000000000000000009' }); // o e-mail foi recadastrado
    await page.goto('/');
    await tabS(page).click();
    const before = await stored(page);
    await page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' }).getByRole('button', { name: 'Entrar de novo' }).click();
    await fill(page, null, PW);
    await primary(page).click();
    await expect(err(page)).toContainText('Este e-mail é de outra conta');
    await expect(err(page)).toContainText('Apagar tudo');
    const a = await acct(page);
    expect(a.calls).toContain('check');
    expect(a.calls).not.toContain('signIn');
    expect(a.user).toBeNull();
    expect((await hint(page)).uid).toBe(ME_UID);
    expect(Object.keys((await stored(page)).days).sort()).toEqual(Object.keys(before.days).sort());
  });

  test('conta que saiu do aparelho: "Apagar tudo" volta ao início de verdade; o onboarding sobe a nuvem anônima', async ({ page }) => {
    await withAccount(page, null, { noLogin: true, verified: true });
    await page.goto('/');
    await page.evaluate(() => { localStorage.setItem('mare:cloud', JSON.stringify({ uid: 'fakemeuid0000000000000000001', pullAt: 1, pushAt: 1 })); }); // a marca de sincronização da conta antiga
    await tabS(page).click();
    await expect(page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' })).toBeVisible();
    await page.getByRole('button', { name: 'Apagar', exact: true }).click();
    await expect(sheet(page)).toContainText('A sua conta e os dados dela na nuvem não são tocados');
    await sheet(page).getByRole('button', { name: 'Apagar tudo' }).click();
    await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
    expect(await hint(page)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('mare:cloud'))).toBeNull(); // sem a marca, ao entrar de novo na conta o histórico volta inteiro
    const a0 = await acct(page);
    expect(a0.users).toEqual([EMAIL]); // a conta na nuvem não foi tocada
    // um aparelho novo de verdade: o onboarding comum liga a nuvem, com um login anônimo (e não "conta que saiu")
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await page.locator('#obName').fill('Ana');
    await page.locator('#obWeight').fill('70');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
    await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click();
    await expect(page.locator('#tabbar')).toBeVisible();
    await expect.poll(async () => { const a = await acct(page); return !!(a.user && a.user.anon); }).toBe(true);
    await tabS(page).click();
    await expect(page.locator('.group', { hasText: 'Proteja seus dados' })).toBeVisible();
    await expect(page.locator('.group', { hasText: 'Sua conta saiu deste aparelho' })).toHaveCount(0);
  });
});

/* ---------- layout ---------- */
test('layout: o cartão da conta e todos os painéis cabem em qualquer tela, com botões confortáveis', async ({ page }, info) => {
  const users = {}; users[MARI] = account();
  await stubFriendsCloud(page, { acct: { users: users } });
  await seed(page, { history: [3, 2000], todayMl: 500, social: { on: true, nick: 'Ana', share: true, code: 'ABCD2345' } });
  await page.goto('/');
  const over = async (n) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral em ' + n).toBeLessThanOrEqual(0);
  const shot = (n) => page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + n + '.png', fullPage: true });
  await tabS(page).click();
  await page.waitForTimeout(500);
  await over('Ajustes sem conta');
  await shot('Conta sem conta');
  const small = await page.$$eval('.group [data-action^="ac-"]', (els) => els.filter((e) => e.getBoundingClientRect().height < 32).length);
  expect(small, 'botões da conta baixos').toBe(0);
  // criar conta (com erro visível para o pior caso de altura)
  await page.locator('.group').getByRole('button', { name: 'Criar conta' }).click();
  await page.locator('#acEmail').fill('um.email.bem.comprido.para.testar@dominio-comprido-demais.com.br');
  await page.locator('#acPw').fill('x');
  await primary(page).click();
  await expect(err(page)).toBeVisible();
  await page.waitForTimeout(400);
  await over('criar conta com erro');
  await shot('Conta criar');
  const box = async (sel) => page.locator(sel).first().boundingBox();
  const vw = page.viewportSize().width;
  for (const sel of ['#sheet .sheet, #sheet', '#acEmail', '#acPw', '[data-primary]']) {
    const b = await box(sel);
    expect(b && b.width, 'mais largo que a tela: ' + sel).toBeLessThanOrEqual(vw + 1);
  }
  expect((await box('[data-primary]')).height, 'botão principal baixo').toBeGreaterThanOrEqual(44);
  expect((await box('#acEmail')).height, 'campo de e-mail baixo').toBeGreaterThanOrEqual(40);
  const eye = await box('.pw-eye');
  expect(eye.height, 'botão Mostrar baixo').toBeGreaterThanOrEqual(40);
  const pw = await box('#acPw');
  expect(eye.x + eye.width, 'o Mostrar sai do campo').toBeLessThanOrEqual(pw.x + pw.width + 1);
  // "Já tem conta? Entrar nela" leva ao painel de entrar, com o aviso mais comprido (registros que vão ser trocados, turma, backup)
  await sheet(page).getByRole('button', { name: 'Entrar nela' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Entrar numa conta que já existe' })).toBeVisible();
  await page.waitForTimeout(300);
  await over('entrar numa conta que já existe');
  await shot('Conta entrar');
  await page.locator('#acEmail').fill('um.email.bem.comprido.para.testar@dominio-comprido-demais.com.br');
  await page.locator('#acPw').fill('senha-errada-1');
  await primary(page).click();
  await expect(err(page)).toBeVisible(); // com o erro visível: o pior caso de altura
  await page.waitForTimeout(300);
  await over('entrar com erro');
  const vh = page.viewportSize().height;
  const sb = await page.locator('#sheet .sheet, #sheet').first().boundingBox();
  expect(sb.height, 'o painel de entrar passa da altura da tela').toBeLessThanOrEqual(vh + 1);
  expect((await box('[data-primary]')).height, 'botão Entrar baixo').toBeGreaterThanOrEqual(44);
  await sheet(page).getByRole('button', { name: 'Esqueci a senha' }).click();
  await page.waitForTimeout(300);
  await over('esqueci a senha');
  await shot('Conta esqueci');
  await page.locator('#acEmail').fill('');
  await primary(page).click();
  await expect(err(page)).toHaveText('Digite o e-mail.');
  await over('esqueci a senha com erro');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
});

test('layout: o cartão da conta criada, o aviso de conta que saiu e a tela de boas-vindas cabem em qualquer tela', async ({ page }, info) => {
  const over = async (n) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral em ' + n).toBeLessThanOrEqual(0);
  const shot = (n) => page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + n + '.png', fullPage: true });
  // boas-vindas com o link de entrar
  await openFresh(page, {});
  await page.waitForTimeout(500);
  await over('boas-vindas');
  await shot('Conta boas-vindas');
  const link = await page.getByRole('button', { name: 'Entrar na conta' }).boundingBox();
  expect(link.height, 'link de entrar baixo demais para tocar').toBeGreaterThanOrEqual(28);
  // conta criada, com um e-mail comprido
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await withAccount(p2, { social: { on: true, nick: 'Ana', share: true, code: 'ABCD2345' } }, { verified: false, email: 'um.email.bem.comprido.para.testar.quebra@dominio-comprido-demais.com.br' });
  await p2.goto('/');
  await tabS(p2).click();
  await p2.waitForTimeout(500);
  expect(await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral com a conta criada').toBeLessThanOrEqual(0);
  await p2.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Conta criada.png', fullPage: true });
  expect(await p2.$$eval('.group [data-action^="ac-"]', (els) => els.filter((e) => e.getBoundingClientRect().height < 32).length), 'botões da conta baixos').toBe(0);
  await p2.close();
  // conta que saiu
  const p3 = await page.context().newPage();
  p3.on('pageerror', (e) => { errors.push(e.message); });
  await withAccount(p3, null, { noLogin: true, verified: true });
  await p3.goto('/');
  await tabS(p3).click();
  await p3.waitForTimeout(500);
  expect(await p3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem lateral com a conta que saiu').toBeLessThanOrEqual(0);
  await p3.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Conta saiu.png', fullPage: true });
  await p3.close();
});
