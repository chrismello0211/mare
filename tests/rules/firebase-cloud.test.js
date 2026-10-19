// Maré — a nuvem do app (public/js/firebase.js) de ponta a ponta contra o emulador do Firestore, com as regras de segurança de verdade.
// O firebase.js é o de verdade. O que o navegador baixaria do CDN do Firebase é trocado aqui por: o Firestore do npm ligado ao emulador (com
// o login de quem o teste escolher), um login de mentira e um FCM de mentira (permissão, suporte e token controlados pelo teste).
// Prova, entre outras coisas, o caminho que faltava aos avisos dos amigos: o aparelho de quem usa SÓ os amigos (sem lembretes) é registrado do
// jeito que a função onFriendship lê. Rodar: npm run test:rules. A parte do servidor precisa do Admin SDK (cd functions && npm install).
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as C from '../../public/js/core.js';
import { notifyFriendship } from '../../functions/friend-push.js';

// vi.mock sobe para o topo do arquivo: o que as trocas usam precisa nascer junto (vi.hoisted)
const H = vi.hoisted(() => ({ db: null, uid: '', token: 'tok-1', supported: true, deleted: 0, gets: [] }));
vi.mock('../../public/js/firebase-config.js', () => ({ firebaseConfig: { apiKey: 'chave-de-teste', projectId: 'demo-mare-cloud' }, VAPID_KEY: 'vapid-de-teste', USE_EMULATORS: false }));
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js', () => ({ initializeApp: () => ({ app: 'de-mentira' }) }));
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js', () => ({
  initializeAuth: () => ({}), getAuth: () => ({}), indexedDBLocalPersistence: {}, browserLocalPersistence: {}, connectAuthEmulator: () => {},
  onAuthStateChanged: (auth, cb) => { setTimeout(() => { cb({ uid: H.uid }); }, 0); return () => {}; },
  signInAnonymously: () => Promise.resolve(),
}));
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js', async () => {
  const real = await import('firebase/firestore');
  return Object.assign({}, real, { initializeFirestore: () => H.db, getFirestore: () => H.db, persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}), connectFirestoreEmulator: () => {} });
});
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js', () => ({
  isSupported: async () => H.supported, getMessaging: () => ({}), getToken: async () => H.token, deleteToken: async () => { H.deleted++; return true; },
}));

FS.setLogLevel('silent');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'functions');
const HAVE = existsSync(path.join(FN, 'node_modules', 'firebase-admin', 'package.json'));
const req = HAVE ? createRequire(path.join(FN, 'package.json')) : null;
const A = HAVE ? { app: req('firebase-admin/app'), fs: req('firebase-admin/firestore') } : null;
const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const RULES = readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
// as regras de antes dos avisos (1.1.0): sem o campo "social" em users
const OLD_RULES = RULES.replace("'stats', 'social', 'updatedAt'", "'stats', 'updatedAt'").replace(/\n\s*&& \(!\('social' in d\)[^\n]*/, '');
const PROJECT = 'demo-mare-cloud';
const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), BRU = U('bruno');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, what, ms) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > (ms || 6000)) throw new Error('esperei e não aconteceu: ' + what);
    await sleep(25);
  }
}

let env, envOld, app, adb, store, listeners, warns;
const ctxs = [];
function track(e) {
  ['authenticatedContext', 'unauthenticatedContext'].forEach((k) => {
    const orig = e[k].bind(e);
    e[k] = function () { const c = orig.apply(null, arguments); ctxs.push(c); return c; };
  });
  return e;
}
beforeAll(async () => {
  env = track(await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: hp[0], port: +hp[1], rules: RULES } }));
  envOld = track(await initializeTestEnvironment({ projectId: PROJECT + '-old', firestore: { host: hp[0], port: +hp[1], rules: OLD_RULES } }));
  if (HAVE) {
    process.env.FIRESTORE_EMULATOR_HOST = hp[0] + ':' + hp[1];
    app = A.app.initializeApp({ projectId: PROJECT }, 'firebase-cloud-test');
    adb = A.fs.getFirestore(app);
  }
});
afterAll(async () => {
  if (env) await env.cleanup();
  if (envOld) await envOld.cleanup();
  if (app) await A.app.deleteApp(app).catch(() => {});
});
beforeEach(async () => {
  await env.clearFirestore(); await envOld.clearFirestore();
  // o "navegador" do teste: armazenamento do aparelho, a página, a permissão de notificação e o Service Worker
  store = new Map(); listeners = {}; warns = [];
  vi.stubGlobal('localStorage', { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); } });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('navigator', { userAgent: 'aparelho-de-teste', serviceWorker: { ready: Promise.resolve({ scope: '/' }) } });
  vi.stubGlobal('Notification', { permission: 'granted' });
  H.token = 'tok-1'; H.supported = true; H.deleted = 0;
  vi.spyOn(console, 'warn').mockImplementation((...a) => { warns.push(a.join(' ')); });
});
afterEach(async () => {
  // o app grava ao ir para o fundo e cancela o relógio das gravações: faz o mesmo antes de encerrar a conexão (senão o relógio dispararia depois)
  try { hidden(); } catch (e) { /* nada a gravar */ }
  await sleep(150);
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } });
});

const readDoc = async (e, p) => { let out; await e.withSecurityRulesDisabled(async (ctx) => { const s = await FS.getDoc(FS.doc(ctx.firestore(), p)); out = s.exists() ? s.data() : null; }); return out; };
const userDoc = (uid, e) => readDoc(e || env, 'users/' + uid);
// o app grava ao ir para o fundo (cada nuvem aberta no teste escuta isso)
const hidden = () => { document.visibilityState = 'hidden'; (listeners.visibilitychange || []).forEach((fn) => { fn(); }); document.visibilityState = 'visible'; };

// Abre a nuvem como o app faz. o = { uid, social, reminders, envOf: o emulador/regras a usar }
async function boot(o) {
  o = o || {};
  H.uid = o.uid || ANA;
  H.db = (o.envOf || env).authenticatedContext(H.uid).firestore();
  const S = C.defaults(1);
  S.onboarded = true;
  Object.assign(S.social, o.social || {}); Object.assign(S.reminders, o.reminders || {});
  const status = [], remote = [];
  const mod = await import('../../public/js/firebase.js');
  const cloud = await mod.initCloud({ state: () => S, onRemote: (d) => { remote.push(d); }, onStatus: (s) => { status.push(s); } });
  await sleep(250); // o primeiro "puxar" da nuvem termina e agenda a primeira gravação
  return { S: S, cloud: cloud, status: status, remote: remote, uid: H.uid };
}
const save = async (a) => { a.cloud.syncMeta(); hidden(); await sleep(0); };

describe('abrir a nuvem e gravar o resumo', () => {
  test('liga, traz os dias e grava o resumo (fuso, meta, lembretes, estatísticas): as regras aceitam tudo', async () => {
    const a = await boot();
    expect(a.status).toEqual(['on']);
    await save(a);
    const d = await until(() => userDoc(ANA), 'o resumo na nuvem');
    expect(Object.keys(d).sort()).toEqual(['goal', 'reminder', 'sleep', 'stats', 'today', 'tz', 'unit', 'updatedAt', 'wake']); // nada de social, nada de fcm
    expect(d.reminder).toMatchObject({ enabled: false, nextAt: null });
    await sleep(150);
    expect(a.status).not.toContain('error'); // nenhuma gravação recusada
    expect(warns).toEqual([]);
  });
  test('os dias vão para users/{uid}/days com a soma', async () => {
    const a = await boot();
    const k = C.dayKey();
    a.S.days[k] = { goal: 2800, u: Date.now(), entries: [{ id: 'e1', t: Date.now() - 60000, ml: 400, d: 'water' }] };
    a.cloud.syncDays([k]); hidden();
    const day = await until(() => readDoc(env, 'users/' + ANA + '/days/' + k), 'o dia na nuvem');
    expect(day).toMatchObject({ goal: 2800, total: 400 });
    expect(a.status).not.toContain('error');
  });
});

describe('avisos dos amigos: a escolha vai para users/{uid}.social.push', () => {
  test('quem nunca mexeu na chave nunca grava o campo (o servidor já assume ligado)', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } });
    await save(a);
    await until(() => userDoc(ANA), 'o resumo');
    await sleep(200);
    expect(await userDoc(ANA)).not.toHaveProperty('social');
    expect(JSON.parse(store.get('mare:cloud') || '{}').social).toBeUndefined();
  });
  test('desligar grava push = false; ligar de novo grava true; a marca no aparelho acompanha', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } });
    a.S.social.push = false;
    await save(a);
    await until(async () => ((await userDoc(ANA)) || {}).social, 'o desligado na nuvem');
    expect((await userDoc(ANA)).social).toEqual({ push: false });
    await until(() => JSON.parse(store.get('mare:cloud')).social === false, 'a marca no aparelho');
    a.S.social.push = true;
    await save(a);
    await until(async () => (((await userDoc(ANA)) || {}).social || {}).push === true, 'o ligado na nuvem');
    expect(JSON.parse(store.get('mare:cloud')).social).toBe(true);
    expect(a.status).not.toContain('error');
  });
  test('o app é fechado e reaberto com a chave desligada: a nuvem já sabe, nada é regravado', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } });
    a.S.social.push = false;
    await save(a);
    await until(() => JSON.parse(store.get('mare:cloud') || '{}').social === false, 'a marca');
    const t1 = (await userDoc(ANA)).updatedAt.toMillis();
    await sleep(60);
    const b = await boot({ social: { on: true, nick: 'Ana', push: false } }); // mesma "memória" do aparelho (store)
    await save(b);
    await sleep(300);
    const d = await userDoc(ANA);
    expect(d.social).toEqual({ push: false });
    expect(b.status).not.toContain('error');
    expect(d.updatedAt.toMillis()).toBeGreaterThanOrEqual(t1); // o resumo continua sendo atualizado; só o "social" não é reenviado
  });
  test('apagar tudo na nuvem esquece a escolha já enviada: desligar de novo depois grava de novo', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } });
    a.S.social.push = false;
    await save(a);
    await until(async () => (((await userDoc(ANA)) || {}).social || {}).push === false, 'o desligado na nuvem');
    await until(() => JSON.parse(store.get('mare:cloud')).social === false, 'a marca no aparelho');
    await a.cloud.wipe();
    expect(await userDoc(ANA)).toBeNull();
    expect(JSON.parse(store.get('mare:cloud')).social).toBeUndefined(); // a nuvem voltou do zero: o servidor assume ligado de novo
    await save(a); // a pessoa continua com os avisos desligados: a nuvem nova precisa saber
    await until(async () => (((await userDoc(ANA)) || {}).social || {}).push === false, 'o desligado de novo na nuvem');
    expect(a.status).not.toContain('error');
  });
  test('amigos desligados neste aparelho: a chave não grava nada', async () => {
    const a = await boot({ social: { on: false, push: false } });
    await save(a);
    await until(() => userDoc(ANA), 'o resumo');
    await sleep(200);
    expect(await userDoc(ANA)).not.toHaveProperty('social');
  });
  test('regras antigas ainda no ar (sem "social"): a gravação da chave é recusada sozinha; lembretes e resumo seguem normais', async () => {
    const a = await boot({ envOf: envOld, social: { on: true, nick: 'Ana', push: false }, reminders: { enabled: true, interval: 60, smart: true, nextAt: Date.now() + 3600e3 } });
    await save(a);
    const d = await until(() => userDoc(ANA, envOld), 'o resumo com as regras antigas');
    expect(d.reminder).toMatchObject({ enabled: true, interval: 60 }); // os lembretes continuam sincronizando
    expect(d).not.toHaveProperty('social');
    await until(() => warns.some((w) => w.indexOf('avisos dos amigos') >= 0), 'o aviso no console');
    expect(a.status).not.toContain('error'); // e o app não mostra "erro de sincronização" por isso
    expect(JSON.parse(store.get('mare:cloud')).social).toBeUndefined(); // a marca só muda quando o servidor aceita: tenta de novo na próxima
    a.S.social.push = false; // próxima gravação do app: tenta outra vez (continua recusada, sem estragar nada)
    await save(a);
    await sleep(300);
    expect(warns.filter((w) => w.indexOf('avisos dos amigos') >= 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe('registro do aparelho para receber push', () => {
  test('com a permissão dada: grava o aparelho em fcm.<hash> (token, ua, data) e marca o push como ativo', async () => {
    const a = await boot();
    H.token = 'tok-ana-1';
    expect(await a.cloud.enablePush()).toBe(true);
    expect(a.cloud.push).toBe(true);
    const d = await until(async () => ((await userDoc(ANA)) || {}).fcm, 'o aparelho na nuvem');
    const hs = Object.keys(d);
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatch(/^t[0-9a-z]+$/);
    expect(d[hs[0]]).toMatchObject({ token: 'tok-ana-1', ua: 'aparelho-de-teste' });
    expect(d[hs[0]].at).toBeTruthy();
  });
  test('sem a permissão, sem suporte do navegador ou com a permissão recusada: não grava nada', async () => {
    for (const how of ['default', 'denied', 'sem-suporte']) {
      const a = await boot();
      if (how === 'sem-suporte') H.supported = false; else Notification.permission = how;
      expect(await a.cloud.enablePush(), how).toBe(false);
      expect(a.cloud.push).toBe(false);
      await sleep(80);
      expect(await userDoc(ANA), how).toBeNull();
      H.supported = true; Notification.permission = 'granted';
    }
  });
  test('token renovado: o aparelho antigo sai e o novo entra (continua sendo um só)', async () => {
    const a = await boot();
    H.token = 'tok-velho'; await a.cloud.enablePush();
    await until(async () => Object.keys(((await userDoc(ANA)) || {}).fcm || {}).length === 1, 'o primeiro token');
    H.token = 'tok-novo'; await a.cloud.enablePush();
    const d = await until(async () => { const x = ((await userDoc(ANA)) || {}).fcm || {}; return Object.values(x).some((v) => v.token === 'tok-novo') ? x : null; }, 'o token novo');
    expect(Object.values(d).map((v) => v.token)).toEqual(['tok-novo']);
  });
  test('apagar tudo na nuvem: o documento e o token somem', async () => {
    const a = await boot();
    await a.cloud.enablePush();
    await save(a);
    await until(async () => (((await userDoc(ANA)) || {}).fcm), 'o aparelho');
    await a.cloud.wipe();
    expect(await userDoc(ANA)).toBeNull();
    expect(H.deleted).toBe(1);
    expect(a.cloud.push).toBe(false);
  });
});

/* O caminho que não existia: quem usa SÓ os amigos (sem lembretes) tem o aparelho registrado, e a função manda o push para ESSE aparelho. */
const TS = (ms) => A.fs.Timestamp.fromMillis(ms);
const pair = (by, other, nm) => ({ m: [by, other].sort(), by: by, st: 'pending', nm: nm, mc: 'concha', tn: 'Ana', tc: 'concha', cd: 'ABCDEFGH', at: TS(Date.now()) });
const server = (calls) => ({ db: adb, FieldValue: A.fs.FieldValue, now: Date.now, log: { info: () => {}, error: () => {} },
  messaging: { sendEachForMulticast: async (m) => { calls.push(m); return { responses: m.tokens.map(() => ({ success: true })), successCount: m.tokens.length, failureCount: 0 }; } } });
const suite = HAVE ? describe : describe.skip;
suite('do aparelho ao push: o que o app grava é o que a função lê', () => {
  test('só amigos, sem lembretes: o aparelho registrado recebe o aviso de pedido de amizade', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } }); // lembretes desligados (padrão)
    expect(a.S.reminders.enabled).toBe(false);
    H.token = 'tok-ana-amigos';
    expect(await a.cloud.enablePush()).toBe(true); // é o que o app faz ao ligar os amigos com a permissão dada (ensurePush)
    await until(async () => Object.keys(((await userDoc(ANA)) || {}).fcm || {}).length === 1, 'o aparelho na nuvem');
    const calls = [];
    const sent = await notifyFriendship({ before: null, after: pair(BRU, ANA, 'Bruno') }, server(calls));
    expect(sent).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].tokens).toEqual(['tok-ana-amigos']);
    expect(calls[0].data).toMatchObject({ kind: 'friend', ev: 'request' });
    expect(calls[0].data.title).toBe('Pedido de amizade 💌');
  });
  test('quem desligou "Avisos dos amigos" no app deixa de receber, mesmo com o aparelho registrado', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } });
    H.token = 'tok-ana-amigos'; await a.cloud.enablePush();
    a.S.social.push = false;
    await save(a);
    await until(async () => (((await userDoc(ANA)) || {}).social || {}).push === false, 'o desligado na nuvem');
    await until(async () => Object.keys(((await userDoc(ANA)) || {}).fcm || {}).length === 1, 'o aparelho continua registrado');
    const calls = [];
    expect(await notifyFriendship({ before: null, after: pair(BRU, ANA, 'Bruno') }, server(calls))).toBe(0);
    expect(calls).toHaveLength(0);
    a.S.social.push = true; await save(a); // ligou de novo
    await until(async () => (((await userDoc(ANA)) || {}).social || {}).push === true, 'o ligado na nuvem');
    expect(await notifyFriendship({ before: null, after: pair(BRU, ANA, 'Bruno') }, server(calls))).toBe(1);
  });
  test('sem permissão no aparelho (nunca registrou): a função não tem para onde mandar e não quebra', async () => {
    const a = await boot({ social: { on: true, nick: 'Ana' } });
    Notification.permission = 'default';
    expect(await a.cloud.enablePush()).toBe(false);
    await save(a);
    await until(() => userDoc(ANA), 'o resumo');
    const calls = [];
    expect(await notifyFriendship({ before: null, after: pair(BRU, ANA, 'Bruno') }, server(calls))).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
