// Maré — o que os testes do servidor da 1.2.0 contra o emulador têm em comum (tests/rules/quiet-hours, network e crew-push):
//   o emulador do Firestore, o Admin SDK de verdade (o de functions/node_modules, o mesmo que a nuvem usa), um FCM de mentira que confere o
//   formato como o FCM confere, um relógio nosso e pessoas de verdade (o app de cada uma, com as regras de segurança de verdade).
// Uso, no topo do arquivo de teste:   const E = serverEnv('demo-mare-algo');  E.setup();   e depois  E.suite('...', () => { ... });
// O estado muda a cada teste (E.fcm, E.clock, E.logs, E.adb, E.env): leia sempre de E, na hora de usar.
import { describe, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSocial } from '../../public/js/social-cloud.js';
import { profilePayload, pairId as pid } from '../../public/js/social.js';
import * as C from '../../public/js/core.js';

FS.setLogLevel('silent');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'functions');
export const HAVE = existsSync(path.join(FN, 'node_modules', 'firebase-admin', 'package.json'));
export const suite = HAVE ? describe : describe.skip;
const req = HAVE ? createRequire(path.join(FN, 'package.json')) : null;
export const A = HAVE ? { app: req('firebase-admin/app'), fs: req('firebase-admin/firestore'), msg: req('firebase-admin/messaging') } : null;

export const T0 = Date.UTC(2026, 9, 19, 14, 0, 0); // segunda, 19/10/2026, 14:00 em Greenwich = 11:00 em Fortaleza (acordada)
export const TODAY = '2026-10-19';
export const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
export const U = (n) => n + 'x'.repeat(28 - n.length); // um uid de teste a partir de um nome curto
export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/* ---------- FCM de mentira: confere o formato como o FCM confere e responde por aparelho ---------- */
export function fakeFcm() {
  const f = {
    calls: [], violations: [], dead: new Set(), invalid: new Set(), flaky: new Set(), down: null, hook: null, failNext: 0, failFor: null,
    async sendEachForMulticast(msg) {
      if (f.down) throw f.down;
      if (f.failNext > 0) { f.failNext--; throw new Error('FCM caiu'); }
      if (f.failFor && msg.tokens.some((t) => f.failFor(t))) throw new Error('FCM caiu para ' + msg.tokens[0]);
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

export function serverEnv(project) {
  if (!HAVE) console.warn('[' + project + '] firebase-admin não está instalado em functions/: estes testes foram pulados. Para rodá-los: cd functions && npm install');
  const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const RULES = readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const people = [], ctxs = [];
  const E = { HAVE: HAVE, suite: suite, A: A, project: project, env: null, app: null, adb: null, fcm: null, clock: null, logs: null, people: people, pid: pid };

  /* ---------- ciclo de vida ---------- */
  function track(e) { // cada login de teste abre conexões próprias: encerradas no afterEach
    ['authenticatedContext', 'unauthenticatedContext'].forEach((k) => {
      const orig = e[k].bind(e);
      e[k] = function () { const c = orig.apply(null, arguments); ctxs.push(c); return c; };
    });
    return e;
  }
  E.setup = () => {
    beforeAll(async () => {
      if (!HAVE) return;
      process.env.FIRESTORE_EMULATOR_HOST = hp[0] + ':' + hp[1]; // o Admin SDK nunca fala com o Firestore de verdade
      E.env = track(await initializeTestEnvironment({ projectId: project, firestore: { host: hp[0], port: +hp[1], rules: RULES } }));
      E.app = A.app.initializeApp({ projectId: project }, project + '-test');
      E.adb = A.fs.getFirestore(E.app);
    });
    afterAll(async () => {
      if (!HAVE) return;
      if (E.env) await E.env.cleanup();
      if (E.app) await A.app.deleteApp(E.app).catch(() => {});
    });
    beforeEach(async () => {
      if (!HAVE) return;
      await E.env.clearFirestore();
      E.clock = { t: T0 }; E.fcm = fakeFcm(); E.logs = [];
    });
    afterEach(() => {
      if (!HAVE) return;
      while (people.length) people.pop().sc.stop();
      ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } });
      expect(E.fcm.violations).toEqual([]); // nenhum aviso saiu num formato que o FCM recusaria
    });
  };

  /* ---------- o servidor ---------- */
  E.log = { info: (m, x) => { E.logs.push(Object.assign({ lvl: 'info', m: m }, x)); }, error: (m, x) => { E.logs.push(Object.assign({ lvl: 'error', m: m }, x)); } };
  E.deps = (over) => Object.assign({ db: E.adb, FieldValue: A.fs.FieldValue, Timestamp: A.fs.Timestamp, messaging: E.fcm, now: () => E.clock.t, log: E.log }, over || {});
  E.TS = (ms) => A.fs.Timestamp.fromMillis(ms);
  E.at = (h, m) => T0 + (h || 0) * HOUR + (m || 0) * MIN; // T0 + h horas e m minutos
  E.logOf = (why) => E.logs.filter((l) => l.why === why);
  E.errors = () => E.logs.filter((l) => l.lvl === 'error');

  /* ---------- o que foi enviado ---------- */
  E.tokenOf = (uid, n) => 'tok-' + uid + '-' + (n || 1);
  E.sentTo = (uid) => E.fcm.calls.filter((c) => c.tokens.every((t) => t.indexOf('tok-' + uid + '-') === 0));
  E.lastTo = (uid) => { const s = E.sentTo(uid); return s[s.length - 1]; };
  E.titles = (uid) => E.sentTo(uid).map((c) => c.data.title);

  /* ---------- documentos escritos à mão (Admin SDK: ignora as regras, como o servidor de verdade) ---------- */
  // Aparelhos de uma pessoa, como o app grava (fcm.<hash> = { token, ua, at }); extra = campos do documento users/{uid} (social, wake, sleep, tz…)
  E.phone = (uid, n, extra) => {
    const f = {};
    for (let i = 1; i <= (n == null ? 1 : n); i++) f['h' + i] = { token: E.tokenOf(uid, i), ua: 'teste', at: E.TS(T0 - DAY) };
    return E.adb.doc('users/' + uid).set(Object.assign({ tz: 'America/Fortaleza', unit: 'ml', goal: 2000, fcm: f }, extra || {}));
  };
  E.AWAKE = { wake: '00:00', sleep: '00:00' }; // wake igual a sleep: nunca dorme (para testes que usam o relógio de verdade)
  E.pushlog = async (uid) => { const s = await E.adb.doc('pushlog/' + uid).get(); return s.exists ? s.data() : null; };
  E.pushq = async (uid) => { const s = await E.adb.doc('pushq/' + uid).get(); return s.exists ? s.data() : null; };
  E.userDoc = async (uid) => { const s = await E.adb.doc('users/' + uid).get(); return s.exists ? s.data() : null; };
  E.profile = (uid, nm, over) => E.adb.doc('profiles/' + uid).set(Object.assign({ v: 1, nm: nm, mc: 'concha', ins: ['concha'], pct: 0, met: false, st: 0, day: TODAY, sh: true, gl: 2000, wm: 0 }, over || {}));
  E.pairDoc = (by, other, o) => Object.assign({ m: [by, other], by: by, st: 'pending', nm: 'Fulano', mc: 'concha', tn: 'Ciclano', tc: 'concha', cd: 'ABCDEFGH', at: E.TS(T0) }, o || {});
  E.activeDoc = (a, b, o) => E.pairDoc(a, b, Object.assign({ st: 'active', ok: E.TS(T0 + 1000) }, o || {}));
  // Uma amizade ativa no Firestore, no formato que os aplicativos criam (m na ordem do id)
  E.link = (a, b, o) => { const id = pid(a, b), m = id.split('_'); return E.adb.doc('friendships/' + id).set(E.activeDoc(m[0], m[1], o)); };
  E.pending = (by, other, o) => { const id = pid(by, other); return E.adb.doc('friendships/' + id).set(E.pairDoc(by, other, Object.assign({ m: id.split('_') }, o || {}))); };
  // Uma turma completa montada à mão: cada um com perfil e todos amigos de todos. names: { uid: nome }. Devolve os ids.
  E.crew = async (names, over) => {
    const ids = Object.keys(names);
    for (const id of ids) await E.profile(id, names[id], over && over[id]);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) await E.link(ids[i], ids[j]);
    return ids;
  };
  E.snap = async (id) => { const s = await E.adb.doc('friendships/' + id).get(); return s.exists ? s.data() : null; };
  E.friendshipIds = async () => (await E.adb.collection('friendships').get()).docs.map((d) => d.id).sort();
  E.friendshipDocs = async () => { const o = {}; (await E.adb.collection('friendships').get()).forEach((d) => { o[d.id] = d.data(); }); return o; };

  /* ---------- pessoas de verdade (o app de cada uma, com as regras de verdade) ---------- */
  E.person = (nick, uid) => {
    const S = C.defaults(1);
    S.onboarded = true; S.insignias = { concha: 1 }; S.social = Object.assign({}, S.social, { on: true, nick: nick, share: true, code: '' });
    const sc = createSocial({ FS: FS, db: E.env.authenticatedContext(uid).firestore(), uid: uid });
    const p = { nick: nick, uid: uid, S: S, sc: sc, payload: () => profilePayload(S, TODAY) };
    p.hooks = { payload: p.payload };
    people.push(p);
    return p;
  };
  E.join = (p) => p.sc.join({ payload: p.payload() });
  return E;
}
