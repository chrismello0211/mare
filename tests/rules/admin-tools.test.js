// Maré — as ferramentas do administrador (scripts/admin/lib.mjs: inspect, attach-email, migrate-days) contra o emulador do Firestore, com o Admin SDK de verdade
// e um "Auth" de mentira em memória (o Admin SDK do Auth precisa do emulador do Auth, que não vem no npm install; aqui só se simula o que as ferramentas usam).
// Prova: o retrato das contas mostra só nomes e contagens; achar a conta certa (uid, começo do uid, apelido) sem chute (e só o uid inteiro grava); ligar o
// e-mail ao MESMO uid sem pisar em outra conta; a senha e o link de redefinição nunca aparecem; e o plano B (copiar registros) não perde, não duplica e não
// pisa no que o destino registrou no meio do caminho.
import { describe, test, expect } from 'vitest';
import * as L from '../../scripts/admin/lib.mjs';
import { serverEnv, U, T0, DAY } from '../helpers/server-env.js';

const E = serverEnv('demo-mare-admintools');
E.setup();

const ANA = U('ana'), BIA = U('bia'), MARI = U('mari'), VAZIA = U('vazia'), CARLA = U('carla'), SEM = U('semnome'), ORFA = U('orfa');
const SECRET_ML = 4321, SECRET_ID = 'registro-secreto-77', SECRET_W = 91.5;

// Um Auth de mentira com o que as ferramentas usam: listUsers (com páginas), getUser, getUserByEmail, createUser, updateUser, generatePasswordResetLink
function fakeAuth() {
  const users = new Map(), calls = [];
  const code = (c) => Object.assign(new Error(c), { code: c });
  const a = {
    users: users, calls: calls, linkFails: '', breakUpdate: false, failUpdate: '', pageSize: 1000,
    add(uid, o) {
      o = o || {};
      const u = { uid: uid, email: o.email || undefined, disabled: !!o.disabled, providerData: (o.providers || []).map((p) => ({ providerId: p })),
        metadata: { creationTime: new Date(T0 - 30 * DAY).toUTCString(), lastSignInTime: new Date(T0 - (o.ago || 1) * DAY).toUTCString(), lastRefreshTime: new Date(T0 - (o.ago || 1) * DAY + 3600e3).toUTCString() } };
      users.set(uid, u);
      return u;
    },
    async listUsers(max, tok) {
      const all = Array.from(users.values()), from = tok ? +tok : 0, n = Math.min(max || 1000, a.pageSize), page = all.slice(from, from + n);
      return { users: page, pageToken: from + n < all.length ? String(from + n) : undefined };
    },
    async getUser(uid) { const u = users.get(uid); if (!u) throw code('auth/user-not-found'); return u; },
    async getUserByEmail(email) { const u = Array.from(users.values()).find((x) => (x.email || '').toLowerCase() === email.toLowerCase()); if (!u) throw code('auth/user-not-found'); return u; },
    async createUser(props) {
      calls.push({ create: Object.assign({}, props) });
      if (users.has(props.uid)) throw code('auth/uid-already-exists');
      if (props.email && Array.from(users.values()).some((x) => (x.email || '').toLowerCase() === props.email.toLowerCase())) throw code('auth/email-already-exists');
      const u = a.add(props.uid, { email: props.email });
      if (props.password) u.providerData.push({ providerId: 'password' });
      return u;
    },
    async updateUser(uid, patch) {
      calls.push({ uid: uid, patch: Object.assign({}, patch) });
      if (a.failUpdate) throw code(a.failUpdate);
      const u = await a.getUser(uid);
      if (a.breakUpdate) return u;
      if (patch.email) {
        const other = Array.from(users.values()).find((x) => x.uid !== uid && (x.email || '').toLowerCase() === patch.email.toLowerCase());
        if (other) throw code('auth/email-already-exists');
        u.email = patch.email;
      }
      if (patch.password) u.providerData.push({ providerId: 'password' });
      return u;
    },
    async generatePasswordResetLink(email) {
      if (a.linkFails) throw code(a.linkFails);
      await a.getUserByEmail(email).catch(() => { throw code('auth/email-not-found'); });
      return 'https://link-secreto.example/oob/abc123';
    },
  };
  return a;
}
const day = (goal, list) => ({ goal: goal, total: list.reduce((s, x) => s + x[1], 0), u: T0 - DAY, updatedAt: E.TS(T0 - DAY), entries: list.map((x) => ({ id: x[0], t: T0 - DAY + (x[2] || 0), ml: x[1], d: 'water' })) });
async function setDays(uid, days) { for (const k of Object.keys(days)) await E.adb.doc('users/' + uid + '/days/' + k).set(days[k]); }
const ctx = (auth) => ({ auth: auth, db: E.adb, FieldValue: E.A.fs.FieldValue, emulated: true });
const dayDoc = async (uid, k) => (await E.adb.doc('users/' + uid + '/days/' + k).get()).data();

// Três pessoas com registros (e uma sem nada), como o projeto de verdade teria
async function world() {
  const auth = fakeAuth();
  auth.add(ANA, { ago: 1 }); auth.add(BIA, { ago: 3 }); auth.add(MARI, { ago: 2 }); auth.add(VAZIA, { ago: 20 }); auth.add(SEM, { ago: 4 });
  auth.add(CARLA, { email: 'carla.souza@gmail.com', providers: ['password'], ago: 5 });
  await E.profile(ANA, 'Ana'); await E.profile(BIA, 'Bia'); await E.profile(CARLA, 'Carla'); await E.profile(MARI, 'Mari');
  await E.link(ANA, BIA);
  await E.pending(MARI, ANA); // um pedido ainda não aceito não é amizade
  await setDays(ANA, { '2026-10-19': day(2400, [['a1', 500], ['a2', SECRET_ML]]), '2026-10-20': day(2400, [['b1', 700]]), '2026-10-21': day(2400, [['c1', 600]]) });
  await setDays(BIA, { '2026-10-21': day(2000, [['c1', 600]]), '2026-10-20': day(2000, [['b2', 300]]), '2026-10-22': day(2000, [['z1', 250]]) });
  await setDays(MARI, { '2026-10-17': day(2000, [[SECRET_ID, 400]]), '2026-10-18': day(2000, [['m2', 450]]), '2026-10-19': day(2000, [['m3', 350]]), '2026-10-20': day(2000, [['m4', 800]]), '2026-10-21': day(2000, [['m5', 900]]) });
  await setDays(CARLA, { '2026-10-21': day(2000, [['k1', 500]]) });
  await setDays(SEM, { '2026-10-18': day(2000, [['s1', 200]]) }); // alguém que nunca ligou os amigos: aparece só pelos registros
  await E.adb.doc('users/' + MARI).set({ wake: '08:00', sleep: '00:30', unit: 'ml', goal: 2000, weight: SECRET_W });
  return auth;
}
const failsWith = async (p, re) => { let err = null; try { await p; } catch (e) { err = e; } expect(err).toBeInstanceOf(L.Fail); expect(err.message).toMatch(re); return err; };

E.suite('ferramentas do administrador (scripts/admin)', () => {
  describe('inspect: o retrato das contas', () => {
    test('só nomes e contagens: nenhum volume, peso, id de registro nem e-mail inteiro aparece; vazias ficam de fora', async () => {
      const auth = await world();
      const rows = await L.snapshot(ctx(auth));
      expect(rows).toHaveLength(6);
      const ana = rows.find((r) => r.uid === ANA);
      expect(ana).toMatchObject({ nick: 'Ana', days: 3, first: '2026-10-19', last: '2026-10-21', prefs: false, anon: true, login: 'anônimo', orphan: false });
      expect(ana.friends).toEqual([BIA]);
      expect(rows.find((r) => r.uid === MARI).friends).toEqual([]);
      expect(rows.find((r) => r.uid === CARLA)).toMatchObject({ anon: false, login: 'e-mail e senha (ca***@gmail.com)' });
      const text = L.formatRows(rows, { friends: true });
      expect(text).toContain('1) Ana');
      expect(text).toContain('3 dias de registro (19/10/26 a 21/10/26)');
      expect(text).toContain('amigos: Bia');
      expect(text).toContain('uid: ' + ANA);
      expect(text).toContain('(1 conta vazia omitida; --all mostra)');
      expect(text).not.toContain(VAZIA);
      expect(text).toContain('(sem apelido)');
      [String(SECRET_ML), SECRET_ID, String(SECRET_W), 'carla.souza', '08:00'].forEach((s) => { expect(text).not.toContain(s); });
      expect(L.formatRows(rows, { all: true })).toContain(VAZIA);
    });
    test('--name filtra pelo apelido (sem acento, sem maiúscula) e avisa quando não há nenhuma', async () => {
      const auth = await world();
      await E.profile(MARI, 'Marí');
      const rows = await L.snapshot(ctx(auth));
      const one = L.formatRows(rows, { name: 'MARI' });
      expect(one).toContain('1) Marí');
      expect(one).not.toContain('Ana');
      expect(L.formatRows(rows, { name: 'zzz' })).toContain('Nenhuma conta encontrada com o apelido "zzz"');
    });
    test('com ajustes guardados na nuvem a linha diz "sim"', async () => {
      const auth = await world();
      await E.adb.doc('users/' + CARLA + '/backup/prefs').set({ v: 1, u: T0, j: '{"x":1}' });
      const rows = await L.snapshot(ctx(auth));
      expect(rows.find((r) => r.uid === CARLA).prefs).toBe(true);
      expect(L.formatRows(rows)).toContain('ajustes guardados: sim');
    });
    test('conta que perdeu o LOGIN mas ainda tem dados (uma limpeza automática de contas anônimas): aparece como "sem login", sem confundir com as outras', async () => {
      const auth = await world();
      await E.profile(ORFA, 'Orfã');
      await setDays(ORFA, { '2026-10-20': day(2000, [['o1', 300]]), '2026-10-21': day(2000, [['o2', 300]]) });
      await E.adb.doc('users/' + ORFA + '/backup/prefs').set({ v: 1, u: T0, j: '{"x":1}' });
      const rows = await L.snapshot(ctx(auth));
      expect(rows).toHaveLength(7);
      expect(rows.find((r) => r.uid === ORFA)).toMatchObject({ orphan: true, nick: 'Orfã', days: 2, prefs: true, seen: 0, anon: false });
      expect(rows.filter((r) => r.orphan)).toHaveLength(1);
      expect(L.formatRows(rows)).toContain('sem login (o login foi apagado; só restam os dados)');
    });
    test('mais de uma página de contas e mais de 100 contas: lê todas (nenhuma some do retrato)', async () => {
      const auth = await world();
      auth.pageSize = 7;
      for (let i = 0; i < 110; i++) auth.add('extra' + i + 'x'.repeat(20), { ago: 9 });
      const last = 'extra109' + 'x'.repeat(20);
      await E.adb.doc('users/' + last + '/backup/prefs').set({ v: 1, u: T0, j: '{"x":1}' }); // a 116ª conta: depois do primeiro bloco de 100 que o getAll lê
      const rows = await L.snapshot(ctx(auth));
      expect(rows).toHaveLength(6 + 110);
      expect(rows.find((r) => r.uid === MARI).days).toBe(5);
      expect(rows.find((r) => r.uid === last).prefs).toBe(true);
      expect(rows.filter((r) => r.prefs)).toHaveLength(1);
      expect((await L.listAll(auth))).toHaveLength(116);
    });
  });

  describe('achar a conta certa', () => {
    test('pelo uid inteiro, pelo começo do uid (8 letras ou mais) e pelo apelido (sem acento nem maiúscula)', async () => {
      const auth = await world();
      await E.profile(MARI, 'Marí');
      const c = ctx(auth);
      expect((await L.resolveUser(c, ANA)).uid).toBe(ANA);
      expect((await L.resolveUser(c, ANA.slice(0, 8))).uid).toBe(ANA);
      expect((await L.resolveUser(c, 'bia')).uid).toBe(BIA);
      expect((await L.resolveUser(c, 'MARI')).uid).toBe(MARI);
    });
    test('apelido que serve para duas contas, começo curto demais e nome que não existe: para e lista, sem chutar', async () => {
      const auth = await world();
      await E.profile(ANA, 'Ana Lu'); await E.profile(MARI, 'Ana Maria');
      const c = ctx(auth);
      const err = await failsWith(L.resolveUser(c, 'ana'), /mais de uma conta/);
      expect(err.message).toContain(ANA);
      expect(err.message).toContain(MARI);
      await failsWith(L.resolveUser(c, 'xx'), /pelo menos 3 letras/);
      await failsWith(L.resolveUser(c, 'zzz'), /Não achei nenhuma conta/);
      await failsWith(L.resolveUser(c, ''), /Faltou dizer qual conta/);
    });
    test('um apelido IGUAL ao digitado não vence outro só parecido: "mari" com "Mari" (conta nova) e "Marianne" (conta antiga) pergunta, e não escolhe a nova', async () => {
      const auth = await world();
      await E.profile(ANA, 'Marianne'); await E.profile(MARI, 'Mari');
      const err = await failsWith(L.resolveUser(ctx(auth), 'mari'), /mais de uma conta/);
      expect(err.message).toContain(ANA);
      expect(err.message).toContain(MARI);
      expect((await L.resolveUser(ctx(auth), 'marian')).uid).toBe(ANA); // um pedaço que só serve para uma conta: ela
    });
    test('para gravar (exact) só vale o uid inteiro: apelido e começo do uid são recusados, com o motivo', async () => {
      const auth = await world();
      const c = ctx(auth), rows = await L.snapshot(c);
      expect((await L.resolveUser(c, MARI, rows, { exact: true })).uid).toBe(MARI);
      await failsWith(L.resolveUser(c, 'mari', rows, { exact: true }), /uid inteiro.*só servem para a prévia/);
      await failsWith(L.resolveUser(c, MARI.slice(0, 10), rows, { exact: true }), /uid inteiro/);
      await failsWith(L.resolveUser(c, 'naoexiste00', rows, { exact: true }), /Não achei nenhuma conta com o uid/);
    });
  });

  describe('attach-email: ligar o e-mail ao uid antigo', () => {
    test('a prévia mostra o que faria (inclusive quando a conta foi usada e quem são os amigos) e não muda nada; a conta anônima com registros está liberada', async () => {
      const auth = await world();
      const plan = await L.planAttach(ctx(auth), 'mari', ' Mari@Exemplo.com ');
      expect(plan).toMatchObject({ uid: MARI, email: 'mari@exemplo.com', days: 5, problems: [], noop: false, conflict: null, orphan: false, friends: [] });
      expect(plan.warnings.join(' ')).toContain('Não há ajustes guardados');
      const text = L.describeAttach(plan, T0);
      expect(text).toContain('mari@exemplo.com');
      expect(text).toContain('5 dias');
      expect(text).toContain('usada pela última vez');
      expect(text).toContain('Amigos:    nenhum');
      const ana = await L.planAttach(ctx(auth), ANA, 'ana@exemplo.com');
      expect(ana.friends).toEqual(['Bia']);
      expect(L.describeAttach(ana, T0)).toContain('Amigos:    1 (Bia)');
      expect(L.describeAttach(await L.planAttach(ctx(auth), BIA, 'bia@exemplo.com'), T0)).toContain('há 2 dias');
      expect(auth.calls).toEqual([]); // só olhou
    });
    test('o comando exato para gravar leva o uid inteiro (nunca o apelido) e as mesmas opções', async () => {
      const auth = await world();
      const opts = { replace: true, tempPassword: true, forgetDevices: true };
      const plan = await L.planAttach(ctx(auth), 'mari', 'mari@exemplo.com', opts);
      expect(L.applyCommand(plan, opts)).toBe('node scripts/admin/attach-email.mjs ' + MARI + ' mari@exemplo.com --apply --replace --with-temp-password --forget-devices');
      expect(L.applyCommand(plan)).toBe('node scripts/admin/attach-email.mjs ' + MARI + ' mari@exemplo.com --apply');
    });
    test('para gravar, o apelido não vale (exactUid): a prévia achou por apelido, o --apply exige o uid', async () => {
      const auth = await world();
      await failsWith(L.planAttach(ctx(auth), 'mari', 'mari@exemplo.com', { exactUid: true }), /uid inteiro/);
      expect((await L.planAttach(ctx(auth), MARI, 'mari@exemplo.com', { exactUid: true })).uid).toBe(MARI);
    });
    test('e-mail malformado, conta que já tem login, conta sem registros e conta com outro e-mail: não dá (com o motivo)', async () => {
      const auth = await world();
      const c = ctx(auth);
      await failsWith(L.planAttach(c, 'mari', 'isto-nao-e-email'), /não parece certo/);
      await failsWith(L.planAttach(c, 'mari', 'a@b'), /não parece certo/);
      await failsWith(L.planAttach(c, 'mari', 'ponto@exemplo.com.'), /não parece certo/);
      expect((await L.planAttach(c, CARLA, 'outra@exemplo.com')).problems.join(' ')).toMatch(/já tem login por e-mail e senha \(ca\*\*\*@gmail\.com\).*--replace/);
      expect((await L.planAttach(c, VAZIA, 'vazia@exemplo.com')).problems.join(' ')).toMatch(/nenhum registro.*--even-empty/);
      expect((await L.planAttach(c, VAZIA, 'vazia@exemplo.com', { evenEmpty: true })).problems).toEqual([]);
      auth.users.get(MARI).email = 'velho@exemplo.com';
      expect((await L.planAttach(c, 'mari', 'novo@exemplo.com')).problems.join(' ')).toMatch(/já tem o e-mail ve\*\*\*@exemplo\.com.*--replace/);
      expect((await L.planAttach(c, 'mari', 'novo@exemplo.com', { replace: true })).problems).toEqual([]);
      expect((await L.planAttach(c, 'mari', 'velho@exemplo.com')).noop).toBe(true);
    });
    test('conta com Google (ou outro login que não seja e-mail e senha): nunca, nem com --replace', async () => {
      const auth = await world();
      auth.add(ANA, { email: 'ana@gmail.com', providers: ['google.com'], ago: 1 });
      const p = await L.planAttach(ctx(auth), ANA, 'ana@exemplo.com', { replace: true });
      expect(p.problems.join(' ')).toMatch(/já tem login \(google\.com\)/);
    });
    test('e-mail e senha com o MESMO e-mail passa como "já ligado" (serve para conferir de novo depois do --with-temp-password); com outro e-mail só com --replace', async () => {
      const auth = await world();
      const c = ctx(auth);
      const same = await L.planAttach(c, CARLA, 'carla.souza@gmail.com');
      expect(same).toMatchObject({ noop: true, problems: [] });
      const r = await L.applyAttach(c, same);
      expect(auth.calls).toEqual([]); // nada a gravar
      expect(r.check.ok).toBe(true);
      expect((await L.planAttach(c, CARLA, 'outra@exemplo.com', { replace: true })).problems).toEqual([]);
    });
    test('o e-mail com espaço e caracteres invisíveis (copiar e colar) é limpo como o app faz, e a prévia avisa', async () => {
      const auth = await world();
      const plan = await L.planAttach(ctx(auth), MARI, 'mari​@Exemplo.com ');
      expect(plan.email).toBe('mari@exemplo.com');
      expect(plan.warnings.join(' ')).toContain('caracteres invisíveis');
      const clean = await L.planAttach(ctx(auth), MARI, ' MARI@exemplo.com ');
      expect(clean.warnings.join(' ')).not.toContain('invisíveis'); // só espaço e maiúscula não assustam
    });
    test('o e-mail já é de OUTRA conta (a pessoa criou uma conta nova no aparelho novo): não pisa nela e aponta o plano B', async () => {
      const auth = await world();
      auth.users.get(BIA).email = 'bia.nova@exemplo.com';
      const plan = await L.planAttach(ctx(auth), 'mari', 'BIA.nova@exemplo.com');
      expect(plan.conflict).toMatchObject({ uid: BIA, days: 3 });
      expect(plan.problems.join(' ')).toContain('node scripts/admin/migrate-days.mjs ' + MARI + ' ' + BIA);
      await failsWith(L.applyAttach(ctx(auth), plan), /Não posso aplicar/);
      expect(auth.calls).toEqual([]);
    });
    test('aplicar: grava o e-mail no MESMO uid, confere, e o link de redefinição nunca sai da função', async () => {
      const auth = await world();
      const c = ctx(auth);
      const r = await L.applyAttach(c, await L.planAttach(c, MARI, 'mari@exemplo.com'));
      expect(auth.calls).toEqual([{ uid: MARI, patch: { email: 'mari@exemplo.com', emailVerified: false } }]);
      expect(r).toMatchObject({ uid: MARI, email: 'mari@exemplo.com', providers: [], tempPassword: false, recreated: false, forgot: 0, check: { ok: true, code: '' } });
      expect(JSON.stringify(r)).not.toMatch(/link-secreto|abc123/);
      expect(await E.userDoc(MARI)).toMatchObject({ wake: '08:00' }); // nada do Firestore foi mexido
    });
    test('as instruções para a pessoa usam os nomes que existem na tela ("Entrar na conta" nas boas-vindas) e mandam NÃO tocar em "Começar"', () => {
      const t = L.instructions({ email: 'mari@exemplo.com' });
      expect(t).toContain('"Entrar na conta"');
      expect(t).toContain('NÃO tocar em "Começar" nem em "Criar conta"');
      expect(t).toContain('"Esqueci a senha", digitar mari@exemplo.com');
      expect(t).toContain('"Já criei a senha, entrar"');
      expect(t).not.toContain('tela de boas-vindas, "Já tenho conta"');
    });
    test('o Firebase não reconhece o e-mail para redefinir a senha: o resultado avisa (e --with-temp-password dá uma senha que ninguém conhece)', async () => {
      const auth = await world();
      const c = ctx(auth);
      auth.linkFails = 'auth/operation-not-allowed';
      const r1 = await L.applyAttach(c, await L.planAttach(c, MARI, 'mari@exemplo.com'));
      expect(r1.check).toEqual({ ok: false, code: 'auth/operation-not-allowed' });
      auth.linkFails = '';
      const r2 = await L.applyAttach(c, await L.planAttach(c, MARI, 'mari@exemplo.com'), { tempPassword: true });
      expect(r2).toMatchObject({ providers: ['password'], tempPassword: true, check: { ok: true } });
      const patch = auth.calls[auth.calls.length - 1].patch;
      expect(Object.keys(patch)).toEqual(['password']); // o e-mail já estava ligado: só a senha aleatória foi gravada
      expect(patch.password.length).toBeGreaterThanOrEqual(24);
      expect(JSON.stringify(r2)).not.toContain(patch.password); // a senha nunca é devolvida (nem mostrada)
      // depois disso a conta tem "e-mail e senha" com o MESMO e-mail: dá para rodar de novo só para conferir
      expect((await L.planAttach(c, MARI, 'mari@exemplo.com')).problems).toEqual([]);
    });
    test('se, depois de gravar, o e-mail não ficou como esperado, para e diz (não finge que deu certo)', async () => {
      const auth = await world();
      const c = ctx(auth);
      auth.breakUpdate = true;
      await failsWith(L.applyAttach(c, await L.planAttach(c, MARI, 'mari@exemplo.com')), /Conferi depois de gravar/);
    });
    test('o e-mail passou a ser de outra conta entre a prévia e o --apply (ou o Firebase recusa por outro motivo): explica que NADA mudou, sem despejar erro técnico', async () => {
      const auth = await world();
      const c = ctx(auth);
      const plan = await L.planAttach(c, MARI, 'mari@exemplo.com');
      auth.failUpdate = 'auth/email-already-exists';
      await failsWith(L.applyAttach(c, plan), /passou a pertencer a OUTRA conta depois da prévia.*Nada foi alterado/);
      auth.failUpdate = 'auth/internal-error';
      await failsWith(L.applyAttach(c, plan), /recusou a gravação \(auth\/internal-error\)\. Nada foi alterado/);
      auth.failUpdate = 'auth/user-not-found';
      await failsWith(L.applyAttach(c, plan), /não existe mais.*Nada foi alterado/);
    });
    test('--forget-devices tira só os avisos push do aparelho antigo (users/{uid}.fcm); o resto do documento fica', async () => {
      const auth = await world();
      const c = ctx(auth);
      await E.adb.doc('users/' + MARI).update({ fcm: { t1: { token: 'tok-a' }, t2: { token: 'tok-b' } }, reminder: { enabled: true } });
      const plan = await L.planAttach(c, MARI, 'mari@exemplo.com');
      const sem = await L.applyAttach(c, plan);
      expect(sem.forgot).toBe(0);
      expect((await E.userDoc(MARI)).fcm).toBeTruthy(); // sem a opção, nada é mexido
      const r = await L.applyAttach(c, plan, { forgetDevices: true });
      expect(r.forgot).toBe(2);
      const d = await E.userDoc(MARI);
      expect(d.fcm).toBeUndefined();
      expect(d).toMatchObject({ wake: '08:00', reminder: { enabled: true } });
      const again = await L.applyAttach(c, plan, { forgetDevices: true }); // já limpo: não falha
      expect(again.forgot).toBe(0);
    });
    test('conta sem login (só dados): a prévia diz como recriar; com --recreate-login o login nasce com o MESMO uid e o e-mail, e os dados ficam onde estavam', async () => {
      const auth = await world();
      const c = ctx(auth);
      await E.profile(ORFA, 'Orfã');
      await setDays(ORFA, { '2026-10-20': day(2000, [['o1', 300]]) });
      const bare = await L.planAttach(c, 'orfã', 'orfa@exemplo.com');
      expect(bare).toMatchObject({ orphan: true, uid: ORFA });
      expect(bare.problems.join(' ')).toContain('--recreate-login');
      await failsWith(L.applyAttach(c, bare), /Não posso aplicar/);
      const ok = await L.planAttach(c, ORFA, 'orfa@exemplo.com', { recreateLogin: true, exactUid: true });
      expect(ok.problems).toEqual([]);
      expect(ok.warnings.join(' ')).toContain('RECRIADO');
      const r = await L.applyAttach(c, ok);
      expect(r).toMatchObject({ uid: ORFA, email: 'orfa@exemplo.com', recreated: true, check: { ok: true } });
      expect(auth.calls).toEqual([{ create: { uid: ORFA, email: 'orfa@exemplo.com', emailVerified: false } }]);
      expect((await dayDoc(ORFA, '2026-10-20')).entries.map((e) => e.id)).toEqual(['o1']);
      expect((await L.snapshot(c)).find((x) => x.uid === ORFA)).toMatchObject({ orphan: false, login: 'e-mail ainda sem senha (or***@exemplo.com)' });
    });
  });

  describe('migrate-days: o plano B (copiar os registros de uma conta para outra)', () => {
    test('copia o que falta, junta o dia que os dois tinham e não mexe no que já estava completo; a origem fica intacta', async () => {
      const auth = await world();
      const c = ctx(auth);
      const plan = await L.planMigrate(c, ANA, BIA);
      expect(plan.copy).toEqual(['2026-10-19']);
      expect(plan.merge).toEqual(['2026-10-20']);
      expect(plan.same).toEqual(['2026-10-21']);
      const text = L.describeMigrate(plan, T0);
      expect(text).toContain('1 dia será copiado');
      expect(text).toContain('nada é apagado na conta de origem');
      expect(text).toContain('vale o do destino');
      expect(L.migrateCommand(plan)).toBe('node scripts/admin/migrate-days.mjs ' + ANA + ' ' + BIA + ' --apply');
      const before = await dayDoc(BIA, '2026-10-22');
      expect(await L.applyMigrate(c, plan)).toBe(2);
      const d19 = await dayDoc(BIA, '2026-10-19');
      expect(Object.keys(d19).sort()).toEqual(['entries', 'goal', 'total', 'u', 'updatedAt']);
      expect(d19.entries.map((e) => e.id)).toEqual(['a1', 'a2']);
      expect(d19.total).toBe(500 + SECRET_ML);
      expect(d19.goal).toBe(2400);
      const d20 = await dayDoc(BIA, '2026-10-20');
      expect(d20.entries.map((e) => e.id).sort()).toEqual(['b1', 'b2']);
      expect(d20.total).toBe(1000);
      expect(d20.goal).toBe(2000); // a meta do destino vale
      expect(d20.updatedAt.toMillis()).toBeGreaterThan(T0 - DAY); // atualizado agora: o app do destino puxa na próxima abertura
      expect(await dayDoc(BIA, '2026-10-22')).toEqual(before); // o dia só do destino não mudou
      expect((await dayDoc(ANA, '2026-10-20')).entries.map((e) => e.id)).toEqual(['b1']); // a origem não mudou
    });
    test('o dia juntado ganha a marca "u" de AGORA: o app do destino só adota um dia da nuvem quando o u dele é maior que o do aparelho, e com o u antigo ignoraria a união', async () => {
      const auth = await world();
      const c = ctx(auth);
      const aparelho = { u: T0 - DAY }; // o aparelho do destino guarda o u que enviou (o mesmo que está no documento do destino antes da junção)
      const merged = L.mergeDay({ entries: [{ id: 'a', t: 1, ml: 100 }], u: T0 - 5 * DAY }, { entries: [{ id: 'b', t: 2, ml: 200 }], u: T0 - DAY }, T0);
      expect(merged.u).toBeGreaterThan(aparelho.u); // a regra do app (fillDays): remoto > local
      expect(merged.u).toBe(T0);
      expect(L.mergeDay({ u: 9e15 }, { u: 5 }).u).toBe(9e15); // nunca menor que o de nenhum dos lados
      const antes = Date.now();
      await L.applyMigrate(c, await L.planMigrate(c, ANA, BIA));
      const d20 = await dayDoc(BIA, '2026-10-20');
      expect(d20.u).toBeGreaterThanOrEqual(antes);
      expect(d20.u).toBeGreaterThan(T0 - DAY);
      expect((await dayDoc(BIA, '2026-10-19')).u).toBe(T0 - DAY); // dia só copiado: fica com o u da origem (o destino não tinha nada ali)
    });
    test('o mesmo registro (mesmo id) nos dois lados: vale o do DESTINO, nunca o da origem', async () => {
      const merged = L.mergeDay({ entries: [{ id: 'k', t: 5, ml: 200 }], goal: 2400, u: 1 }, { entries: [{ id: 'k', t: 5, ml: 350 }], goal: 2000, u: 2 }, 3);
      expect(merged.entries).toEqual([{ id: 'k', t: 5, ml: 350 }]);
      expect(merged.goal).toBe(2000);
      const auth = await world();
      const c = ctx(auth);
      await setDays(ANA, { '2026-10-25': day(2400, [['x', 200, 1000]]) });
      await setDays(BIA, { '2026-10-25': day(2000, [['x', 350, 1000], ['y', 100, 2000]]) });
      const plan = await L.planMigrate(c, ANA, BIA);
      expect(plan.same).toContain('2026-10-25'); // o destino já tem o registro 'x': nada a juntar
      await L.applyMigrate(c, plan);
      expect((await dayDoc(BIA, '2026-10-25')).entries.map((e) => e.ml)).toEqual([350, 100]);
    });
    test('o dia em que os dois lados têm registros diferentes (alguns iguais) fica com a união, sem repetir nenhum', async () => {
      const auth = await world();
      const c = ctx(auth);
      await setDays(ANA, { '2026-10-25': day(2400, [['x1', 100, 1000], ['x2', 200, 2000]]) });
      await setDays(BIA, { '2026-10-25': day(2000, [['x2', 200, 2000], ['x3', 300, 3000]]) });
      const plan = await L.planMigrate(c, ANA, BIA);
      expect(plan.merge).toContain('2026-10-25');
      await L.applyMigrate(c, plan);
      const d = await dayDoc(BIA, '2026-10-25');
      expect(d.entries.map((e) => e.id)).toEqual(['x1', 'x2', 'x3']); // em ordem de horário, x2 uma vez só
      expect(d.total).toBe(600);
    });
    test('rodar de novo não grava nada (nada duplicado)', async () => {
      const auth = await world();
      const c = ctx(auth);
      await L.applyMigrate(c, await L.planMigrate(c, ANA, BIA));
      const again = await L.planMigrate(c, ANA, BIA);
      expect(again.copy).toEqual([]);
      expect(again.merge).toEqual([]);
      expect(again.same).toHaveLength(3);
      expect(await L.applyMigrate(c, again)).toBe(0);
      const d20 = await dayDoc(BIA, '2026-10-20');
      expect(d20.entries).toHaveLength(2);
    });
    test('o destino registrou algo ENTRE a prévia e a cópia: nada é pisado (o lote falha inteiro), e repetir o comando recalcula e junta tudo', async () => {
      const auth = await world();
      const c = ctx(auth);
      const plan = await L.planMigrate(c, ANA, BIA);
      // o aparelho do destino acabou de sincronizar um registro novo no dia que seria juntado
      await E.adb.doc('users/' + BIA + '/days/2026-10-20').update({ entries: [{ id: 'b2', t: T0 - DAY, ml: 300, d: 'water' }, { id: 'novo', t: T0, ml: 150, d: 'water' }], u: T0 });
      await failsWith(L.applyMigrate(c, plan), /O destino mudou durante a cópia.*Nada foi gravado.*seguro repetir/);
      expect((await dayDoc(BIA, '2026-10-20')).entries.map((e) => e.id)).toEqual(['b2', 'novo']); // o registro novo continua lá
      expect((await E.adb.doc('users/' + BIA + '/days/2026-10-19').get()).exists).toBe(false); // o lote é tudo ou nada
      expect(await L.applyMigrate(c, await L.planMigrate(c, ANA, BIA))).toBe(2);
      expect((await dayDoc(BIA, '2026-10-20')).entries.map((e) => e.id).sort()).toEqual(['b1', 'b2', 'novo']);
    });
    test('um dia que o destino não tinha e alguém criou no meio do caminho: o create() recusa, em vez de sobrescrever', async () => {
      const auth = await world();
      const c = ctx(auth);
      const plan = await L.planMigrate(c, ANA, BIA);
      await setDays(BIA, { '2026-10-19': day(2000, [['intruso', 111]]) });
      await failsWith(L.applyMigrate(c, plan), /O destino mudou durante a cópia/);
      expect((await dayDoc(BIA, '2026-10-19')).entries.map((e) => e.id)).toEqual(['intruso']);
    });
    test('registros ilegíveis na origem (null, número, texto) não derrubam a cópia: ficam de fora e a prévia conta quantos', async () => {
      const auth = await world();
      const c = ctx(auth);
      await E.adb.doc('users/' + ANA + '/days/2026-10-27').set({ goal: 2000, u: T0, entries: [null, 7, 'x', { id: 'g1', t: T0, ml: 100, d: 'water' }], updatedAt: E.TS(T0) });
      const plan = await L.planMigrate(c, ANA, BIA);
      expect(plan.bad).toBe(3);
      expect(L.describeMigrate(plan)).toContain('3 registros ilegíveis na origem ficaram de fora');
      await L.applyMigrate(c, plan);
      const d = await dayDoc(BIA, '2026-10-27');
      expect(d.entries.map((e) => e.id)).toEqual(['g1']);
      expect(d.total).toBe(100);
    });
    test('a mesma conta nos dois lados, contas que não existem e destino sem login: para', async () => {
      const auth = await world();
      const c = ctx(auth);
      await failsWith(L.planMigrate(c, ANA, ANA), /mesma conta/);
      await failsWith(L.planMigrate(c, ANA, 'ninguem-com-esse-nome'), /Não achei nenhuma conta/);
      await E.profile(ORFA, 'Orfã');
      await setDays(ORFA, { '2026-10-23': day(2000, [['o1', 300]]) });
      await failsWith(L.planMigrate(c, ANA, ORFA), /não tem login/);
      expect((await L.planMigrate(c, ORFA, ANA)).copy).toEqual(['2026-10-23']); // mas uma conta sem login pode ser a ORIGEM (é o caso de uso)
    });
    test('para copiar de verdade (exactUid) os dois lados têm que ser o uid inteiro', async () => {
      const auth = await world();
      const c = ctx(auth);
      await failsWith(L.planMigrate(c, 'ana', BIA, { exactUid: true }), /uid inteiro/);
      await failsWith(L.planMigrate(c, ANA, 'bia', { exactUid: true }), /uid inteiro/);
      expect((await L.planMigrate(c, ANA, BIA, { exactUid: true })).copy).toEqual(['2026-10-19']);
    });
    test('mais de 400 dias: grava em lotes (o Firestore aceita 500 por lote)', async () => {
      const auth = await world();
      const c = ctx(auth);
      const start = Date.UTC(2025, 0, 1), days = {};
      for (let i = 0; i < 450; i++) days[new Date(start + i * DAY).toISOString().slice(0, 10)] = day(2000, [['d' + i, 100 + i]]);
      const big = U('grande');
      auth.add(big, {});
      await E.profile(big, 'Grande');
      const wb = E.adb.batch();
      Object.keys(days).forEach((k) => { wb.set(E.adb.doc('users/' + big + '/days/' + k), days[k]); });
      await wb.commit();
      const plan = await L.planMigrate(c, big, MARI);
      expect(plan.copy).toHaveLength(450);
      const sizes = []; // quantas gravações cada lote levou
      const spy = Object.assign({}, c, { db: new Proxy(E.adb, { get(t, k) {
        if (k === 'batch') return () => {
          const b = t.batch(), at = sizes.push(0) - 1;
          return new Proxy(b, { get(bt, bk) {
            const v = bt[bk];
            if (bk === 'create' || bk === 'update' || bk === 'set') return (...a) => { sizes[at]++; return v.apply(bt, a); };
            return typeof v === 'function' ? v.bind(bt) : v;
          } });
        };
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      } }) });
      expect(await L.applyMigrate(spy, plan)).toBe(450);
      expect(sizes).toEqual([400, 50]);
      expect((await E.adb.collection('users/' + MARI + '/days').get()).size).toBe(5 + 450);
    });
  });

  describe('linha de comando', () => {
    test('parseArgs separa o que é interruptor, o que leva valor e o que é posição', () => {
      expect(L.parseArgs(['mari', 'a@b.co', '--apply', '--name', 'Ana', '--all'], ['name'])).toEqual({ pos: ['mari', 'a@b.co'], flags: { apply: true, name: 'Ana', all: true } });
      expect(L.parseArgs(['--name'], ['name']).flags).toEqual({ name: true }); // sem valor: vira interruptor
    });
    test('maskEmail e datas', () => {
      expect(L.maskEmail('mariana@gmail.com')).toBe('ma***@gmail.com');
      expect(L.maskEmail('a@b.co')).toBe('a***@b.co');
      expect(L.maskEmail('jo@gmail.com')).toBe('j***@gmail.com'); // local curto: só a primeira letra
      expect(L.maskEmail('ana@gmail.com')).toBe('a***@gmail.com');
      expect(L.maskEmail('anas@gmail.com')).toBe('an***@gmail.com');
      expect(L.maskEmail('')).toBe('-');
      expect(L.dayBr('2026-10-22')).toBe('22/10/26');
      expect(L.dayBr('lixo')).toBe('-');
    });
    test('o e-mail é normalizado e validado pelas MESMAS funções do app (o que o app aceita é o que a ferramenta liga)', () => {
      expect(L.normMail(' Marí​anne@Gmail.COM ')).toBe('marí\u0000anne@gmail.com'.replace('\u0000', ''));
      expect(L.validMail('marianne@gmail.com')).toBe(true);
      expect(L.validMail('a@b')).toBe(false);
      expect(L.validMail('ponto@exemplo.com.')).toBe(false);
      expect(L.validMail('com espaço@exemplo.com')).toBe(false);
    });
  });
});
