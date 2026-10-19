// Maré — avisos de amigos (1.1.1) de ponta a ponta no servidor. A amizade muda de verdade (pelo MESMO código que o app usa, com as regras de
// segurança de verdade, no emulador do Firestore); o que a função faria em seguida roda aqui com o Admin SDK de verdade (functions/friend-push.js)
// e um FCM de mentira. Só o gatilho (Eventarc) e o envio real pelo Google ficam de fora: o primeiro é testado no ar, depois de publicar.
// Rodar: npm run test:rules. Precisa do Admin SDK da pasta functions/ (cd functions && npm install); sem ele, estes testes são pulados.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSocial } from '../../public/js/social-cloud.js';
import { profilePayload, pairId as pid } from '../../public/js/social.js';
import * as C from '../../public/js/core.js';
import { notifyFriendship } from '../../functions/friend-push.js';

FS.setLogLevel('silent');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'functions');
const HAVE = existsSync(path.join(FN, 'node_modules', 'firebase-admin', 'package.json'));
if (!HAVE) console.warn('[friend-push] firebase-admin não está instalado em functions/: estes testes foram pulados. Para rodá-los: cd functions && npm install');
const suite = HAVE ? describe : describe.skip;
const req = HAVE ? createRequire(path.join(FN, 'package.json')) : null;
const A = HAVE ? { app: req('firebase-admin/app'), fs: req('firebase-admin/firestore'), msg: req('firebase-admin/messaging') } : null;

const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const RULES = readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const PROJECT = 'demo-mare-push';
const TODAY = '2026-10-19';
const T0 = Date.UTC(2026, 9, 19, 14, 0, 0);
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), BRU = U('bruno'), CAI = U('caio');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

let env, app, adb, fcm, clock, logs;
const people = [];
const ctxs = []; // cada login de teste abre conexões próprias: encerradas no afterEach (como em social-cloud.test.js)
function track(e) {
  ['authenticatedContext', 'unauthenticatedContext'].forEach((k) => {
    const orig = e[k].bind(e);
    e[k] = function () { const c = orig.apply(null, arguments); ctxs.push(c); return c; };
  });
  return e;
}

/* ---------- FCM de mentira: confere o formato como o FCM confere e responde por aparelho ---------- */
function fakeFcm() {
  const f = {
    calls: [], violations: [], dead: new Set(), invalid: new Set(), flaky: new Set(), down: null, hook: null, failNext: 0,
    async sendEachForMulticast(msg) {
      if (f.down) throw f.down;
      if (f.failNext > 0) { f.failNext--; throw new Error('FCM caiu'); }
      const bad = (why) => f.violations.push(why + ' — ' + JSON.stringify(msg).slice(0, 200));
      if (!Array.isArray(msg.tokens) || !msg.tokens.length || msg.tokens.length > 500 || msg.tokens.some((t) => typeof t !== 'string' || !t)) bad('tokens inválidos');
      Object.keys(msg.data || {}).forEach((k) => {
        if (typeof msg.data[k] !== 'string') bad('data.' + k + ' não é texto');
        if (/^(from|notification|message_type)$/i.test(k) || /^(google|gcm)/i.test(k)) bad('chave reservada: ' + k);
      });
      if (Buffer.byteLength(JSON.stringify(msg.data || {})) > 4000) bad('payload grande demais');
      const h = (msg.webpush && msg.webpush.headers) || {};
      Object.keys(h).forEach((k) => { if (typeof h[k] !== 'string') bad('header ' + k + ' não é texto'); });
      if (h.TTL !== undefined && !(/^\d+$/.test(h.TTL) && +h.TTL <= 2419200)) bad('TTL inválido: ' + h.TTL);
      if (h.Urgency !== undefined && ['very-low', 'low', 'normal', 'high'].indexOf(h.Urgency) < 0) bad('Urgency inválido');
      f.calls.push(JSON.parse(JSON.stringify(msg)));
      if (f.hook) await f.hook(msg);
      const responses = msg.tokens.map((t, i) => (f.dead.has(t) ? { success: false, error: Object.assign(new Error('registration-token-not-registered'), { code: 'messaging/registration-token-not-registered' }) }
        : f.invalid.has(t) ? { success: false, error: Object.assign(new Error('invalid-registration-token'), { code: 'messaging/invalid-registration-token' }) }
          : f.flaky.has(t) ? { success: false, error: Object.assign(new Error('internal'), { code: 'messaging/internal-error' }) }
          : { success: true, messageId: 'm' + f.calls.length + '-' + i }));
      const ok = responses.filter((r) => r.success).length;
      return { responses, successCount: ok, failureCount: responses.length - ok };
    },
  };
  return f;
}
const tokenOf = (uid, n) => 'tok-' + uid + '-' + (n || 1);
const sentTo = (uid) => fcm.calls.filter((c) => c.tokens.every((t) => t.indexOf('tok-' + uid + '-') === 0));
const lastTo = (uid) => { const s = sentTo(uid); return s[s.length - 1]; };

/* ---------- o servidor ---------- */
const log = { info: (m, x) => { logs.push(Object.assign({ lvl: 'info', m: m }, x)); }, error: (m, x) => { logs.push(Object.assign({ lvl: 'error', m: m }, x)); } };
const deps = (over) => Object.assign({ db: adb, FieldValue: A.fs.FieldValue, messaging: fcm, now: () => clock.t, log: log }, over || {});
const notify = (before, after, over) => notifyFriendship({ before: before, after: after }, deps(over));
const snap = async (id) => { const s = await adb.doc('friendships/' + id).get(); return s.exists ? s.data() : null; };
// "o gatilho": lê a amizade como está agora e entrega o par antes/depois à função
const fire = async (id, before, over) => notify(before, await snap(id), over);
const TS = (ms) => A.fs.Timestamp.fromMillis(ms);
// Aparelhos de uma pessoa, como o app grava (fcm.<hash> = { token, ua, at }) — cada um com um token que diz de quem é
const phone = (uid, n, extra) => {
  const f = {};
  for (let i = 1; i <= (n == null ? 1 : n); i++) f['h' + i] = { token: tokenOf(uid, i), ua: 'teste', at: TS(T0 - DAY) };
  return adb.doc('users/' + uid).set(Object.assign({ tz: 'America/Fortaleza', unit: 'ml', goal: 2000, fcm: f }, extra || {}));
};
const pushlog = async (uid) => { const s = await adb.doc('pushlog/' + uid).get(); return s.exists ? s.data() : null; };
const fcmOf = async (uid) => { const s = await adb.doc('users/' + uid).get(); return s.exists ? s.data().fcm : undefined; };
// Uma amizade montada à mão (o servidor escreve como quiser; aqui é só para provocar a função)
const pairDoc = (by, other, o) => Object.assign({ m: [by, other], by: by, st: 'pending', nm: 'Fulano', mc: 'concha', tn: 'Ciclano', tc: 'concha', cd: 'ABCDEFGH', at: TS(T0) }, o || {});
const activeDoc = (a, b, o) => pairDoc(a, b, Object.assign({ st: 'active', ok: TS(T0 + 1000) }, o || {}));
const wv = (k, ms) => ({ k: k, d: TODAY, at: TS(ms) });
const logOf = (why) => logs.filter((l) => l.why === why);

/* ---------- pessoas de verdade (o app de cada uma, com as regras de verdade) ---------- */
function person(nick, uid) {
  const S = C.defaults(1);
  S.onboarded = true; S.insignias = { concha: 1 }; S.social = Object.assign({}, S.social, { on: true, nick: nick, share: true, code: '' });
  const sc = createSocial({ FS: FS, db: env.authenticatedContext(uid).firestore(), uid: uid });
  const p = { nick: nick, uid: uid, S: S, sc: sc, payload: () => profilePayload(S, TODAY) };
  p.hooks = { payload: p.payload };
  people.push(p);
  return p;
}
const join = (p) => p.sc.join({ payload: p.payload() });

beforeAll(async () => {
  if (!HAVE) return;
  process.env.FIRESTORE_EMULATOR_HOST = hp[0] + ':' + hp[1]; // o Admin SDK nunca fala com o Firestore de verdade
  env = track(await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: hp[0], port: +hp[1], rules: RULES } }));
  app = A.app.initializeApp({ projectId: PROJECT }, 'friend-push-test');
  adb = A.fs.getFirestore(app);
});
afterAll(async () => {
  if (!HAVE) return;
  if (env) await env.cleanup();
  if (app) await A.app.deleteApp(app).catch(() => {});
});
beforeEach(async () => {
  if (!HAVE) return;
  await env.clearFirestore();
  clock = { t: T0 }; fcm = fakeFcm(); logs = [];
});
afterEach(() => {
  if (!HAVE) return;
  while (people.length) people.pop().sc.stop();
  ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } });
  expect(fcm.violations).toEqual([]); // nenhum aviso saiu num formato que o FCM recusaria
});

/* ============================== pelo caminho de verdade: app → regras → função ============================== */
suite('do pedido ao push: o app grava, as regras aceitam, a função avisa', () => {
  const ID = pid(ANA, BRU);
  test('pedido de amizade: quem recebeu é avisado, com o nome de quem pediu; quem pediu não recebe nada', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA); await phone(BRU);
    const c = await join(ana); await join(bru);
    const before = await snap(ID);
    expect(before).toBeNull();
    await bru.sc.request(c);
    const sent = await fire(ID, before);
    expect(sent).toBe(1);
    expect(fcm.calls).toHaveLength(1);
    expect(fcm.calls[0].tokens).toEqual([tokenOf(ANA)]);
    expect(fcm.calls[0].data).toEqual({ kind: 'friend', ev: 'request', tag: 'mare-amigo-request-' + BRU, url: './?tab=friends',
      title: 'Pedido de amizade 💌', body: 'Bruno quer acompanhar o dia com você. Toque para responder.' });
    expect(fcm.calls[0].webpush).toEqual({ headers: { Urgency: 'high', TTL: '172800' } });
    expect(sentTo(BRU)).toHaveLength(0);
  });
  test('aceite: quem pediu é avisado, com o nome de quem aceitou', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA); await phone(BRU);
    const c = await join(ana); await join(bru);
    await bru.sc.request(c);
    const pending = await snap(ID);
    await ana.sc.accept(BRU);
    expect(await fire(ID, pending)).toBe(1);
    expect(sentTo(ANA)).toHaveLength(0);
    expect(sentTo(BRU)).toHaveLength(1);
    expect(lastTo(BRU).data).toMatchObject({ ev: 'accepted', tag: 'mare-amigo-accepted-' + ANA, url: './?tab=friends',
      title: 'Ana aceitou seu pedido 🤗', body: 'Agora vocês se acompanham. Que tal um aceno?' });
    expect(lastTo(BRU).webpush.headers.TTL).toBe('172800');
  });
  test('aceno "oi" e "parabéns": o outro lado é avisado; quem já tinha acenado há pouco não é chamado a "acenar de volta"', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA); await phone(BRU);
    const c = await join(ana); await join(bru);
    await bru.sc.request(c); await ana.sc.accept(BRU);
    let before = await snap(ID);
    await ana.sc.wave(BRU, 'hi', TODAY);
    expect(await fire(ID, before)).toBe(1);
    expect(lastTo(BRU).data).toMatchObject({ ev: 'wave', tag: 'mare-amigo-wave-' + ANA, title: 'Ana acenou para você 👋', body: 'Toque para acenar de volta.' });
    expect(lastTo(BRU).webpush.headers.TTL).toBe('21600');
    before = await snap(ID);
    await bru.sc.wave(ANA, 'cheer', TODAY); // Ana acenou há segundos: nada de "acenar de volta"
    expect(await fire(ID, before)).toBe(1);
    expect(lastTo(ANA).data).toMatchObject({ ev: 'wave', tag: 'mare-amigo-wave-' + BRU, title: 'Bruno mandou parabéns pra você 🎉', body: 'Toque para ver seus amigos.' });
    expect(sentTo(ANA)).toHaveLength(1);
    expect(sentTo(BRU)).toHaveLength(1);
  });
  test('recusar, cancelar e desfazer a amizade não avisam ninguém', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA); await phone(BRU);
    const c = await join(ana); await join(bru);
    await bru.sc.request(c);
    let before = await snap(ID);
    await ana.sc.decline(BRU); // recusa
    expect(await fire(ID, before)).toBe(0);
    await bru.sc.request(c);
    before = await snap(ID);
    await bru.sc.cancel(ANA); // cancela o que mandou
    expect(await fire(ID, before)).toBe(0);
    await bru.sc.request(c); await ana.sc.accept(BRU);
    before = await snap(ID);
    await ana.sc.remove(BRU); // desfaz a amizade
    expect(await fire(ID, before)).toBe(0);
    expect(fcm.calls).toHaveLength(0);
  });
  test('os dois pediram um ao outro: o segundo pedido vira aceite, e quem pediu primeiro é avisado disso', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA); await phone(BRU);
    const ac = await join(ana), bc = await join(bru);
    await ana.sc.request(bc);
    const pending = await snap(ID);
    expect(pending).toMatchObject({ st: 'pending', by: ANA });
    expect(await bru.sc.request(ac)).toMatchObject({ kind: 'accepted' });
    expect(await fire(ID, pending)).toBe(1);
    expect(lastTo(ANA).data).toMatchObject({ ev: 'accepted', title: 'Bruno aceitou seu pedido 🤗' });
  });
  test('nome atual do perfil, não o da hora do pedido: quem trocou de apelido depois é chamado pelo novo', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA); await phone(BRU);
    const c = await join(ana); await join(bru);
    await bru.sc.request(c); await ana.sc.accept(BRU);
    ana.S.social.nick = 'Aninha';
    await ana.sc.publish(ana.payload());
    const before = await snap(ID);
    await ana.sc.wave(BRU, 'hi', TODAY);
    await fire(ID, before);
    expect(lastTo(BRU).data.title).toBe('Aninha acenou para você 👋');
  });
  test('o registro de limite da pessoa avisada guarda só o necessário (nada de nome, volume ou texto)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await phone(ANA);
    const c = await join(ana); await join(bru);
    await bru.sc.request(c);
    await fire(ID, null, {});
    const lg = await pushlog(ANA);
    expect(Object.keys(lg).sort()).toEqual(['exp', 'h', 'q', 't']);
    expect(lg.t).toEqual({ ['request_' + BRU]: T0 });
    expect(lg.h).toEqual([T0]);
    expect(lg.q).toEqual([T0]);
    expect(lg.exp.toMillis()).toBe(T0 + 2 * DAY); // data para o Firestore apagar sozinho, se a política de validade estiver ligada
    expect(await pushlog(BRU)).toBeNull();
  });
});

/* ============================== quem recebe ============================== */
suite('quem recebe o aviso', () => {
  test('sem aparelho cadastrado, sem documento ou sem token: nada é enviado e nada é gravado', async () => {
    await adb.doc('users/' + ANA).set({ tz: 'America/Fortaleza' });
    await adb.doc('users/' + BRU).set({ fcm: { h1: { ua: 'x' }, h2: { token: '' }, h3: null } });
    expect(await notify(null, pairDoc(CAI, ANA))).toBe(0);  // Ana: sem fcm
    expect(await notify(null, pairDoc(CAI, BRU))).toBe(0);  // Bruno: fcm sem token
    expect(await notify(null, pairDoc(ANA, CAI))).toBe(0);  // Caio: nem tem documento
    expect(fcm.calls).toHaveLength(0);
    expect(await pushlog(ANA)).toBeNull(); expect(await pushlog(BRU)).toBeNull(); expect(await pushlog(CAI)).toBeNull();
    expect(logOf('sem aparelho')).toHaveLength(3);
  });
  test('"Avisos dos amigos" desligado (social.push = false): nada é enviado, nem gravado', async () => {
    await phone(ANA, 1, { social: { push: false } });
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(0);
    expect(fcm.calls).toHaveLength(0);
    expect(await pushlog(ANA)).toBeNull();
    expect(logOf('desligado')).toHaveLength(1);
  });
  test('ligado de verdade ou sem o campo (conta antiga): o aviso sai', async () => {
    await phone(ANA, 1, { social: { push: true } });
    await phone(BRU, 1);
    expect(await notify(null, pairDoc(CAI, ANA))).toBe(1);
    expect(await notify(null, pairDoc(CAI, BRU))).toBe(1);
  });
  test('vários aparelhos da mesma pessoa: um envio só, com todos os tokens', async () => {
    await phone(ANA, 3);
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(3);
    expect(fcm.calls).toHaveLength(1);
    expect(fcm.calls[0].tokens).toEqual([tokenOf(ANA, 1), tokenOf(ANA, 2), tokenOf(ANA, 3)]);
  });
  test('no máximo 10 aparelhos por pessoa (o mesmo limite das regras)', async () => {
    await phone(ANA, 14);
    await notify(null, pairDoc(BRU, ANA));
    expect(fcm.calls[0].tokens).toHaveLength(10);
  });
});

/* ============================== repetição e spam ============================== */
suite('limite contra repetição e spam', () => {
  test('o mesmo evento entregue duas vezes seguidas (o servidor pode repetir): um aviso só', async () => {
    await phone(ANA);
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(1);
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(0);
    expect(fcm.calls).toHaveLength(1);
    expect(logOf('repetido')).toHaveLength(1);
  });
  test('o mesmo evento entregue por três instâncias AO MESMO TEMPO: um aviso só (a transação decide)', async () => {
    await phone(ANA);
    const out = await Promise.all([notify(null, pairDoc(BRU, ANA)), notify(null, pairDoc(BRU, ANA)), notify(null, pairDoc(BRU, ANA))]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(1);
    expect(fcm.calls).toHaveLength(1);
    expect((await pushlog(ANA)).h).toEqual([T0]);
  });
  test('aceno: o mesmo remetente só avisa de novo depois de 5 minutos', async () => {
    await phone(BRU);
    const before = activeDoc(ANA, BRU), after = (ms) => activeDoc(ANA, BRU, { w: { [ANA]: wv('hi', ms) } });
    expect(await notify(before, after(T0))).toBe(1);
    clock.t = T0 + 4 * MIN; expect(await notify(before, after(T0 + 4 * MIN))).toBe(0);
    clock.t = T0 + 5 * MIN; expect(await notify(before, after(T0 + 5 * MIN))).toBe(1);
    expect(fcm.calls).toHaveLength(2);
  });
  test('pedido: a mesma pessoa só avisa de novo depois de 24 horas (o pedido continua aparecendo no app)', async () => {
    await phone(ANA);
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(1);
    clock.t = T0 + 23 * HOUR; expect(await notify(null, pairDoc(BRU, ANA))).toBe(0);
    clock.t = T0 + 24 * HOUR + 1000; expect(await notify(null, pairDoc(BRU, ANA))).toBe(1);
  });
  test('seis pessoas pedindo amizade na mesma hora: só os cinco primeiros viram aviso', async () => {
    await phone(ANA);
    const out = [];
    for (let i = 0; i < 6; i++) { clock.t = T0 + i * 1000; out.push(await notify(null, pairDoc(U('pessoa' + i), ANA))); }
    expect(out).toEqual([1, 1, 1, 1, 1, 0]);
    expect(logOf('limite')).toHaveLength(1);
    clock.t = T0 + HOUR + 10000; // passou uma hora: de novo
    expect(await notify(null, pairDoc(U('pessoa7'), ANA))).toBe(1);
  });
  test('o teto por hora (20) vale para tudo junto, e é por pessoa: outra pessoa não é afetada', async () => {
    await phone(ANA); await phone(BRU);
    let n = 0;
    for (let i = 0; i < 22; i++) { clock.t = T0 + i * 1000; n += await notify(activeDoc(U('amigo' + i), ANA), activeDoc(U('amigo' + i), ANA, { w: { [U('amigo' + i)]: wv('hi', T0 + i * 1000) } })); }
    expect(n).toBe(20);
    expect(logOf('limite')).toHaveLength(2);
    expect(await notify(null, pairDoc(CAI, BRU))).toBe(1); // Bruno continua recebendo
  });
  test('o aviso a um amigo não "gasta" o limite de outro, nem o de outro tipo', async () => {
    await phone(ANA);
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(1); // pedido do Bruno
    expect(await notify(null, pairDoc(CAI, ANA))).toBe(1); // pedido do Caio
    expect(await notify(activeDoc(BRU, ANA), activeDoc(BRU, ANA, { w: { [BRU]: wv('hi', T0) } }))).toBe(1); // aceno do Bruno
    expect(fcm.calls).toHaveLength(3);
  });
});

/* ============================== quando algo falha ============================== */
suite('quando algo dá errado', () => {
  test('aparelho que o FCM diz não existir mais sai do cadastro; os outros ficam, inclusive o que deu outro erro', async () => {
    await phone(ANA, 3);
    fcm.dead.add(tokenOf(ANA, 2)); fcm.flaky.add(tokenOf(ANA, 3));
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(1);
    expect(Object.keys(await fcmOf(ANA)).sort()).toEqual(['h1', 'h3']);
    expect(logs.filter((l) => l.m === 'aviso de amigos')[0]).toMatchObject({ kind: 'request', sent: 1, failed: 2 });
  });
  test('token que o FCM chama de inválido também sai do cadastro (e só ele)', async () => {
    await phone(ANA, 3);
    fcm.invalid.add(tokenOf(ANA, 1));
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(2);
    expect(Object.keys(await fcmOf(ANA)).sort()).toEqual(['h2', 'h3']);
  });
  test('todos os aparelhos mortos: o cadastro esvazia e o aviso seguinte nem tenta', async () => {
    await phone(ANA, 2);
    fcm.dead.add(tokenOf(ANA, 1)); fcm.dead.add(tokenOf(ANA, 2));
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(0);
    expect(await fcmOf(ANA)).toEqual({});
    expect(await notify(null, pairDoc(CAI, ANA))).toBe(0);
    expect(fcm.calls).toHaveLength(1);
    expect(logOf('sem aparelho')).toHaveLength(1);
  });
  test('conta apagada no meio do envio: nada quebra e o documento da pessoa não "ressuscita"', async () => {
    await phone(ANA, 1);
    fcm.dead.add(tokenOf(ANA, 1));
    fcm.hook = () => adb.doc('users/' + ANA).delete();
    await expect(notify(null, pairDoc(BRU, ANA))).resolves.toBe(0);
    expect((await adb.doc('users/' + ANA).get()).exists).toBe(false);
  });
  test('a limpeza dos aparelhos mortos falha (a conta sumiu): o envio que o FCM aceitou conta e nada vira erro', async () => {
    await phone(ANA, 2);
    fcm.dead.add(tokenOf(ANA, 2));
    const gone = { doc: (p) => { const r = adb.doc(p); if (/^users\//.test(p)) r.update = () => Promise.reject(Object.assign(new Error('NOT_FOUND'), { code: 5 })); return r; }, runTransaction: (f) => adb.runTransaction(f) };
    expect(await notify(null, pairDoc(BRU, ANA), { db: gone })).toBe(1);
    expect(logs.filter((l) => l.lvl === 'error')).toEqual([]);
    expect(logs.filter((l) => l.m === 'aviso de amigos')[0]).toMatchObject({ kind: 'request', sent: 1, failed: 1 });
  });
  test('FCM fora do ar: a função não quebra, registra o erro e o limite fica gravado (melhor perder um aviso que mandar dois)', async () => {
    await phone(ANA);
    fcm.down = new Error('fcm indisponível');
    await expect(notify(null, pairDoc(BRU, ANA))).resolves.toBe(0);
    expect(logs.filter((l) => l.lvl === 'error')).toEqual([{ lvl: 'error', m: 'aviso de amigos falhou', kind: 'request', err: 'fcm indisponível' }]);
    fcm.down = null;
    expect(await notify(null, pairDoc(BRU, ANA))).toBe(0); // a repetição do mesmo evento não passa
    expect(logOf('repetido')).toHaveLength(1);
  });
  test('dois avisos na mesma gravação: se o primeiro falha, o segundo sai mesmo assim', async () => {
    await phone(ANA); await phone(BRU);
    fcm.failNext = 1;
    const before = activeDoc(ANA, BRU), after = activeDoc(ANA, BRU, { w: { [ANA]: wv('hi', T0 + 1), [BRU]: wv('cheer', T0 + 2) } });
    expect(await notify(before, after)).toBe(1);
    expect(fcm.calls).toHaveLength(1);
    expect(logs.filter((l) => l.lvl === 'error')).toHaveLength(1);
  });
  test('o nome: o do perfil (mais novo), senão o que a amizade guardou, senão "Alguém"', async () => {
    await phone(BRU);
    const before = activeDoc(ANA, BRU, { nm: 'Ana da amizade', tn: 'Bruno da amizade' }), after = activeDoc(ANA, BRU, { nm: 'Ana da amizade', tn: 'Bruno da amizade', w: { [ANA]: wv('hi', T0 + 5) } });
    delete before.w;
    await adb.doc('profiles/' + ANA).set({ nm: 'Ana do perfil', v: 1 });
    await notify(before, after);
    expect(lastTo(BRU).data.title).toBe('Ana do perfil acenou para você 👋');
    clock.t = T0 + HOUR; await adb.doc('profiles/' + ANA).delete();
    await notify(before, after);
    expect(lastTo(BRU).data.title).toBe('Ana da amizade acenou para você 👋'); // quem pediu: "nm" da amizade
    clock.t = T0 + 2 * HOUR;
    await notify(before, Object.assign({}, after, { nm: '​' }));
    expect(lastTo(BRU).data.title).toBe('Alguém acenou para você 👋');
  });
  test('o nome de quem foi pedido (e não pediu) vem do campo certo da amizade', async () => {
    await phone(ANA);
    const before = activeDoc(ANA, BRU, { nm: 'Ana', tn: 'Bruno da amizade' }), after = activeDoc(ANA, BRU, { nm: 'Ana', tn: 'Bruno da amizade', w: { [BRU]: wv('hi', T0 + 5) } });
    await notify(before, after);
    expect(lastTo(ANA).data.title).toBe('Bruno da amizade acenou para você 👋');
  });
  test('pedido: o nome é o que veio no pedido (o mesmo que a lista de pedidos do app mostra), mesmo que o perfil de quem pediu tenha outro', async () => {
    await phone(BRU);
    await adb.doc('profiles/' + ANA).set({ nm: 'Ana do perfil', v: 1 });
    await notify(null, pairDoc(ANA, BRU, { nm: 'Ana do pedido' }));
    expect(lastTo(BRU).data.body).toBe('Ana do pedido quer acompanhar o dia com você. Toque para responder.');
  });
  test('perfil ilegível (falha ao ler): usa o nome da amizade e o aviso sai', async () => {
    await phone(BRU);
    const flaky = { doc: (p) => (/^profiles\//.test(p) ? { get: () => Promise.reject(new Error('indisponível')) } : adb.doc(p)), runTransaction: (f) => adb.runTransaction(f) };
    const after = activeDoc(ANA, BRU, { nm: 'Ana', w: { [ANA]: wv('hi', T0 + 5) } });
    expect(await notify(activeDoc(ANA, BRU, { nm: 'Ana' }), after, { db: flaky })).toBe(1);
    expect(lastTo(BRU).data.title).toBe('Ana acenou para você 👋');
  });
  test('nome esquisito no perfil sai limpo (sem invisíveis, sem < >, no máximo 20 caracteres)', async () => {
    await phone(BRU);
    await adb.doc('profiles/' + ANA).set({ nm: '  <b>An​a</b>  ' + 'x'.repeat(40), v: 1 });
    await notify(activeDoc(ANA, BRU), activeDoc(ANA, BRU, { w: { [ANA]: wv('hi', T0 + 5) } }));
    const t = lastTo(BRU).data.title;
    expect(t).toBe('bAna/b ' + 'x'.repeat(13) + ' acenou para você\u00A0👋'); // 20 caracteres de nome
    expect(Array.from(t.split(' acenou')[0])).toHaveLength(20);
  });
  test('documentos de amizade estranhos nunca derrubam a função', async () => {
    await phone(ANA);
    const lixo = [null, undefined, {}, { m: 'x' }, { m: [ANA] }, { m: [ANA, ANA], st: 'pending', by: ANA }, { m: [ANA, BRU], st: 'banida', by: BRU }, 'texto', 7, [], { m: [ANA, BRU], st: 'pending', by: CAI }];
    for (const x of lixo) { await expect(notify(null, x)).resolves.toBe(0); await expect(notify(x, x)).resolves.toBe(0); }
    expect(fcm.calls).toHaveLength(0);
  });
});

/* ============================== o que vai para o FCM de verdade ============================== */
suite('o SDK de verdade (firebase-admin) aceita a mensagem', () => {
  test('passa pela validação do SDK e chega ao transporte com token, data em texto e cabeçalhos web push', async (ctx) => {
    const m = A.msg.getMessaging(app);
    if (typeof m.enableLegacyHttpTransport !== 'function' || !m.messagingRequestHandler || typeof m.messagingRequestHandler.invokeHttpRequestHandlerForSendResponse !== 'function') ctx.skip();
    m.enableLegacyHttpTransport(); // sem sessão HTTP/2: nada sai para a rede
    const sent = [];
    m.messagingRequestHandler.invokeHttpRequestHandlerForSendResponse = async (host, p, request) => {
      sent.push(request.message);
      return request.message.token === tokenOf(ANA, 2)
        ? { success: false, error: Object.assign(new Error('x'), { code: 'messaging/registration-token-not-registered' }) }
        : { success: true, messageId: 'projects/demo/messages/' + sent.length };
    };
    await phone(ANA, 2);
    expect(await notify(null, pairDoc(BRU, ANA, { nm: 'Bruno' }), { messaging: m })).toBe(1);
    expect(logs.filter((l) => l.lvl === 'error')).toEqual([]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({ token: tokenOf(ANA, 1), data: { kind: 'friend', ev: 'request', tag: 'mare-amigo-request-' + BRU, url: './?tab=friends',
      title: 'Pedido de amizade 💌', body: 'Bruno quer acompanhar o dia com você. Toque para responder.' }, webpush: { headers: { Urgency: 'high', TTL: '172800' } } });
    expect(Object.keys(await fcmOf(ANA))).toEqual(['h1']); // o morto (h2) saiu
  });
});

/* ============================== o gatilho de verdade (functions/index.js) ============================== */
// O que o Eventarc entrega à função: { data: { before, after } } com dois DocumentSnapshot. Aqui é o index.js de verdade (o mesmo arquivo que o
// firebase deploy publica), ligado ao emulador e ao Admin SDK de verdade, com o transporte do FCM trocado por um que só anota o envio.
const snapOf = (d) => ({ exists: d != null, data: () => d });
suite('o gatilho onFriendship de verdade (functions/index.js)', () => {
  let mod, sent;
  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = PROJECT;
    mod = await import('../../functions/index.js'); // inicia o app padrão do Admin SDK, como na nuvem
  });
  afterAll(async () => { await A.app.deleteApp(A.app.getApp()).catch(() => {}); });
  beforeEach((ctx) => {
    const m = A.msg.getMessaging(); // o mesmo que o index.js usa (app padrão)
    if (typeof m.enableLegacyHttpTransport !== 'function' || !m.messagingRequestHandler || typeof m.messagingRequestHandler.invokeHttpRequestHandlerForSendResponse !== 'function') ctx.skip();
    m.enableLegacyHttpTransport();
    sent = [];
    m.messagingRequestHandler.invokeHttpRequestHandlerForSendResponse = async (host, p, request) => { sent.push(request.message); return { success: true, messageId: 'projects/demo/messages/' + sent.length }; };
  });
  const run = (before, after) => mod.onFriendship.run({ data: { before: snapOf(before), after: snapOf(after) }, params: { pair: pid(ANA, BRU) } });

  test('declara os dois gatilhos', () => {
    expect(typeof mod.onFriendship).toBe('function');
    expect(typeof mod.onFriendship.run).toBe('function');
    expect(typeof mod.sendReminders).toBe('function');
  });
  test('pedido novo: o aviso sai para o aparelho de quem recebeu, com o texto e o pacote certos', async () => {
    await phone(ANA);
    await run(null, pairDoc(BRU, ANA, { nm: 'Bruno' }));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ token: tokenOf(ANA, 1), data: { kind: 'friend', ev: 'request', tag: 'mare-amigo-request-' + BRU, url: './?tab=friends',
      title: 'Pedido de amizade\u00A0💌', body: 'Bruno quer acompanhar o dia com você. Toque para responder.' }, webpush: { headers: { Urgency: 'high', TTL: '172800' } } });
    expect((await pushlog(ANA)).t).toHaveProperty('request_' + BRU); // o limite foi anotado no Firestore de verdade
  });
  test('aceite e aceno também saem; o mesmo evento entregue duas vezes não avisa duas vezes', async () => {
    await phone(BRU);
    await phone(ANA);
    await run(pairDoc(BRU, ANA), activeDoc(BRU, ANA)); // Ana aceitou: avisa Bruno
    expect(sent).toHaveLength(1);
    expect(sent[0].token).toBe(tokenOf(BRU, 1));
    expect(sent[0].data).toMatchObject({ ev: 'accepted', title: 'Ciclano aceitou seu pedido\u00A0🤗' }); // o nome de quem aceitou: o do convidado no pedido
    sent.length = 0;
    const before = activeDoc(BRU, ANA), after = activeDoc(BRU, ANA, { w: { [ANA]: wv('hi', T0 + 5000) } });
    await run(before, after); // Ana acenou: avisa Bruno
    await run(before, after); // o Eventarc entregou outra vez: o limite segura
    expect(sent.map((x) => x.data.ev)).toEqual(['wave']);
    expect(sent[0].token).toBe(tokenOf(BRU, 1));
  });
  test('documento apagado, mudança sem novidade e evento vazio: nada é enviado e nada quebra', async () => {
    await phone(ANA);
    await run(pairDoc(BRU, ANA), null); // recusou ou cancelou
    await run(activeDoc(BRU, ANA), activeDoc(BRU, ANA)); // sem aceno novo
    await run(null, null);
    await expect(mod.onFriendship.run({ data: undefined, params: {} })).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });
  test('quem desligou os avisos (users.social.push = false) não recebe', async () => {
    await phone(ANA, 1, { social: { push: false } });
    await run(null, pairDoc(BRU, ANA, { nm: 'Bruno' }));
    expect(sent).toHaveLength(0);
    expect(await pushlog(ANA)).toBeNull(); // nem o limite foi mexido
  });
});

/* ============================== o pacote que vai para a nuvem ============================== */
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
suite('o pacote das funções (o que o firebase deploy vai ler)', () => {
  test('carrega sem erro e declara onFriendship (gatilho em friendships, na região do banco) e sendReminders', async () => {
    const port = await freePort();
    const env2 = { PATH: process.env.PATH, HOME: process.env.HOME || process.env.USERPROFILE || '', SystemRoot: process.env.SystemRoot || '', FUNCTIONS_CONTROL_API: 'true', GCLOUD_PROJECT: 'mare-hidratacao', PORT: String(port) };
    // o carregador do Firebase lê a pasta ATUAL como a das funções (o argumento só vale com dois ou mais), por isso o cwd
    const child = spawn(process.execPath, [path.join(FN, 'node_modules', 'firebase-functions', 'lib', 'bin', 'firebase-functions.js')], { cwd: FN, env: env2, stdio: 'ignore' });
    try {
      let man = null;
      const t0 = Date.now();
      while (!man && Date.now() - t0 < 25000) {
        try { const r = await fetch('http://127.0.0.1:' + port + '/__/functions.yaml'); if (r.ok) man = JSON.parse(await r.text()); } catch (e) { /* ainda subindo */ }
        if (!man) await sleep(200);
      }
      expect(man).not.toBeNull();
      const ep = man.endpoints;
      expect(Object.keys(ep).sort()).toEqual(['onFriendship', 'sendReminders']);
      expect(ep.onFriendship).toMatchObject({ platform: 'gcfv2', region: ['southamerica-east1'], maxInstances: 1, availableMemoryMb: 256, timeoutSeconds: 60 });
      expect(ep.onFriendship.eventTrigger).toMatchObject({ eventType: 'google.cloud.firestore.document.v1.written', retry: false,
        eventFilters: { database: '(default)', namespace: '(default)' }, eventFilterPathPatterns: { document: 'friendships/{pair}' } });
      expect(ep.sendReminders).toMatchObject({ platform: 'gcfv2', region: ['southamerica-east1'], scheduleTrigger: { schedule: 'every 15 minutes' } });
    } finally { child.kill(); }
  }, 45000);
});
