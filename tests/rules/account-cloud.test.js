// Maré — a conta (1.3.0) no código de verdade da nuvem (public/js/firebase.js), contra o emulador do Firestore e as regras de segurança de verdade.
// O firebase.js é o de verdade. O que o navegador baixaria do CDN do Firebase é trocado aqui por: o Firestore do npm ligado ao emulador (com o login,
// e a claim "email" das contas, que o teste escolher), um login de mentira em memória (com as mesmas funções do SDK: vincular e-mail e senha, entrar,
// sair, redefinir, reautenticar, excluir) e um FCM de mentira. Prova o que o app usa para a conta: criar (vincular), entrar num aparelho novo e
// baixar tudo, os ajustes indo e vindo da nuvem, sair, excluir e a recuperação de uma conta criada pelo administrador. Rodar: npm run test:rules.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import * as AUR from 'firebase/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as C from '../../public/js/core.js';
import * as ACC from '../../public/js/account.js';
import { rules12x } from '../helpers/old-rules.js';

// vi.mock sobe para o topo do arquivo: o que as trocas usam precisa nascer junto (vi.hoisted)
const H = vi.hoisted(() => {
  const h = { db: null, user: null, user2: null, apps: new Map(), listeners: [], calls: [], accounts: new Map(), minted: '', token: 'tok-1', deleted: 0, supported: true,
    denyPrefs: 0, denyDays: 0, reads: 0, docServer: 0, docCache: 0, mailFail: false, reloadFail: '', serverVerified: false, sets: [], hangPull: false, hangDelete: false };
  const err = (code) => { const e = new Error(code); e.code = code; return e; };
  h.err = err;
  h.fire = () => { h.listeners.slice().forEach((fn) => { fn(h.user); }); };
  // um usuário do login: w = { uid, email?, verified?, anon? }
  h.mk = (w) => {
    const u = { uid: w.uid, email: w.email || null, isAnonymous: !!w.anon, emailVerified: !!w.verified };
    u.reload = async () => { h.calls.push('reload'); if (h.reloadFail) throw err(h.reloadFail); if (h.serverVerified) u.emailVerified = true; };
    u.getIdToken = async (force) => { h.calls.push(force ? 'token-novo' : 'token'); return 'jwt'; };
    return u;
  };
  const auth = { languageCode: '' };
  Object.defineProperty(auth, 'currentUser', { get: () => h.user });
  h.auth = auth;
  // o segundo "app" do Firebase (nome mare-check, persistência só na memória): onde o app confere e-mail e senha sem mexer no login do aparelho
  const auth2 = { languageCode: '' };
  Object.defineProperty(auth2, 'currentUser', { get: () => h.user2 });
  h.auth2 = auth2;
  h.initApp = (cfg, name) => { const k = name || '[DEFAULT]'; if (!h.apps.has(k)) { h.calls.push('app:' + k); h.apps.set(k, { app: 'de-mentira', name: k }); } return h.apps.get(k); };
  h.getApp = (name) => { const k = name || '[DEFAULT]'; if (!h.apps.has(k)) throw err('app/no-app'); return h.apps.get(k); };
  h.memory = {};
  h.AU = {
    initializeAuth: (app, opts) => { if (app && app.name === 'mare-check') { h.calls.push('auth2' + (opts && opts.persistence === h.memory ? ':memoria' : '')); return auth2; } return auth; },
    getAuth: (app) => (app && app.name === 'mare-check' ? auth2 : auth), indexedDBLocalPersistence: {}, browserLocalPersistence: {}, inMemoryPersistence: h.memory, connectAuthEmulator: () => {},
    onAuthStateChanged: (a, cb) => {
      if (a === auth2) return () => {};
      h.listeners.push(cb);
      setTimeout(() => { if (h.listeners.indexOf(cb) >= 0) cb(h.user); }, 0);
      return () => { h.listeners = h.listeners.filter((x) => x !== cb); };
    },
    signInAnonymously: async () => { h.calls.push('anon'); h.user = h.mk({ uid: h.minted, anon: true }); h.fire(); },
    EmailAuthProvider: { credential: (email, pw) => ({ email: email, pw: pw }) },
    linkWithCredential: async (u, cred) => {
      h.calls.push('link:' + cred.email);
      if (!u.isAnonymous) throw err('auth/provider-already-linked');
      if (h.accounts.has(cred.email)) throw err('auth/email-already-in-use');
      h.accounts.set(cred.email, { uid: u.uid, pw: cred.pw });
      u.email = cred.email; u.isAnonymous = false;
      h.fire();
      return { user: u };
    },
    sendEmailVerification: async (u) => { h.calls.push('verify:' + u.email); if (h.mailFail) throw err('auth/too-many-requests'); },
    signInWithEmailAndPassword: async (a, email, pw) => {
      const acc = h.accounts.get(email);
      if (!acc || acc.pw !== pw) throw err('auth/invalid-credential');
      if (a === auth2) { h.calls.push('signin2:' + email); h.user2 = h.mk({ uid: acc.uid, email: email, verified: !!acc.verified }); return { user: h.user2 }; }
      h.calls.push('signin:' + email);
      h.user = h.mk({ uid: acc.uid, email: email, verified: !!acc.verified });
      h.fire();
      return { user: h.user };
    },
    signOut: async (a) => {
      if (a === auth2) { h.calls.push('signout2'); h.user2 = null; return; }
      h.calls.push('signout'); h.user = null; h.fire();
    },
    sendPasswordResetEmail: async (a, email) => { h.calls.push('reset:' + email); },
    reauthenticateWithCredential: async (u, cred) => {
      const acc = h.accounts.get(cred.email);
      if (!acc || acc.pw !== cred.pw) throw err('auth/wrong-password');
      h.calls.push('reauth');
    },
    deleteUser: async (u) => { h.calls.push('deleteUser'); h.accounts.forEach((v, k) => { if (v.uid === u.uid) h.accounts.delete(k); }); h.user = null; h.fire(); },
  };
  return h;
});
vi.mock('../../public/js/firebase-config.js', () => ({ firebaseConfig: { apiKey: 'chave-de-teste', projectId: 'demo-mare-conta' }, VAPID_KEY: 'vapid-de-teste', USE_EMULATORS: false }));
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js', () => ({ initializeApp: (c, n) => H.initApp(c, n), getApp: (n) => H.getApp(n) }));
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js', () => H.AU);
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js', async () => {
  const real = await import('firebase/firestore');
  return Object.assign({}, real, {
    initializeFirestore: () => H.db, getFirestore: () => H.db, persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), connectFirestoreEmulator: () => {},
    // conta as gravações (para provar "só grava quando muda") e, quando o teste pede, recusa as primeiras gravações dos ajustes
    // conta as leituras dos registros da conta e, quando o teste pede, recusa as primeiras (a conexão ainda com o login anterior)
    getDocsFromServer: (q) => {
      H.reads++;
      if (H.denyDays > 0) { H.denyDays--; return Promise.reject(H.err('permission-denied')); }
      return real.getDocsFromServer(q);
    },
    // conta como cada documento solto é lido: do servidor (certo) ou do que o aparelho já tinha guardado (cache)
    getDocFromServer: (r) => { H.docServer++; return real.getDocFromServer(r); },
    getDoc: (r) => { H.docCache++; return real.getDoc(r); },
    // hangPull: o primeiro contato com a nuvem (a leitura dos registros) nunca termina, como numa rede que parou no meio
    getDocs: (q) => (H.hangPull ? new Promise(() => {}) : real.getDocs(q)),
    setDoc: (ref, data, opts) => {
      H.sets.push(ref.path);
      if (H.denyPrefs > 0 && /\/backup\/prefs$/.test(ref.path)) { H.denyPrefs--; return Promise.reject(H.err('permission-denied')); }
      return real.setDoc(ref, data, opts);
    },
  });
});
vi.mock('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js', () => ({
  isSupported: async () => H.supported, getMessaging: () => ({}), getToken: async () => H.token,
  deleteToken: async () => { if (H.hangDelete) return new Promise(() => {}); H.deleted++; return true; },
}));

FS.setLogLevel('silent');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RULES = readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const OLD_RULES = rules12x(RULES); // as regras de antes da conta: sem users/{uid}/backup
const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const PROJECT = 'demo-mare-conta';
const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), MARI = U('mari'), NOVO = U('novo');
const MAIL = 'ana@exemplo.com', PW = 'senha-segura-1';
const ACCT = { uid: ANA, email: MAIL, verified: false }; // quem está logado com conta
const PREFS = 'users/' + ANA + '/backup/prefs';
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

let env, envOld, store, listeners, warns;
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
});
afterAll(async () => {
  if (env) await env.cleanup();
  if (envOld) await envOld.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore(); await envOld.clearFirestore();
  // o "navegador" do teste: armazenamento do aparelho, a página e a permissão de notificação
  store = new Map(); listeners = {}; warns = [];
  vi.stubGlobal('localStorage', { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((x) => x !== fn); },
  });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('navigator', { userAgent: 'aparelho-de-teste', serviceWorker: { ready: Promise.resolve({ scope: '/' }) } });
  vi.stubGlobal('Notification', { permission: 'granted' });
  H.db = null; H.user = null; H.user2 = null; H.apps = new Map(); H.listeners = []; H.calls = []; H.accounts = new Map(); H.minted = NOVO; H.token = 'tok-1'; H.deleted = 0; H.supported = true;
  H.denyPrefs = 0; H.denyDays = 0; H.reads = 0; H.docServer = 0; H.docCache = 0; H.mailFail = false; H.reloadFail = ''; H.serverVerified = false; H.sets = []; H.hangPull = false; H.hangDelete = false;
  vi.spyOn(console, 'warn').mockImplementation((...a) => { warns.push(a.join(' ')); });
});
afterEach(async () => {
  try { hidden(); } catch (e) { /* nada a gravar */ }
  await sleep(150);
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } });
  // vale para todos os testes: o app nunca lê um documento solto do cache do aparelho (que pode estar velho ou vazio), só do servidor
  expect(H.docCache, 'documento lido do cache do aparelho').toBe(0);
});

const readDoc = async (e, p) => { let out; await e.withSecurityRulesDisabled(async (ctx) => { const s = await FS.getDoc(FS.doc(ctx.firestore(), p)); out = s.exists() ? s.data() : null; }); return out; };
const ids = async (e, p) => { let out = []; await e.withSecurityRulesDisabled(async (ctx) => { out = (await FS.getDocs(FS.collection(ctx.firestore(), p))).docs.map((d) => d.id); }); return out.sort(); };
const seed = (e, fn) => e.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); });
const hidden = () => { document.visibilityState = 'hidden'; (listeners.visibilitychange || []).slice().forEach((fn) => { fn(); }); document.visibilityState = 'visible'; };
const getMod = () => import('../../public/js/firebase.js');
const claims = (w) => (w && w.email ? { email: w.email, email_verified: !!w.verified } : {});
// Quem está logado neste aparelho (w = { uid, email?, verified?, anon? }, ou null: ninguém) e o Firestore com o login desse alguém (as = quem o Firestore enxerga, se for outro)
function login(w, e, as) {
  H.user = w ? H.mk(w) : null;
  const c = as || w;
  H.db = (e || env).authenticatedContext(c ? c.uid : H.minted, claims(c)).firestore();
}
async function kitFor(w, e) { login(w, e); return (await getMod()).accountKit(); }
const nPrefs = () => H.sets.filter((p) => /\/backup\/prefs$/.test(p)).length;

const T1 = Date.now() - 2 * 864e5, T2 = Date.now() - 3600e3;
const dayDoc = (goal, ml, t) => ({ goal: goal, entries: [{ id: 'e' + t, t: t, ml: ml, d: 'water' }], u: t });
const stateFor = (over) => { const S = C.defaults(Date.now() - 30 * 864e5); S.onboarded = true; Object.assign(S.profile, over || {}); return S; };
const packOf = (over, u) => ACC.prefsPack(stateFor(over), u);
const PACK = packOf({ name: 'Ana', weight: 64, wake: '06:30', sleep: '22:30', unit: 'oz' }, 777000);
// O que um aparelho antigo já deixou na nuvem desta conta
async function seedAna(e, withPrefs) {
  await seed(e || env, async (db) => {
    await FS.setDoc(FS.doc(db, 'users', ANA), { wake: '06:30', sleep: '22:30', unit: 'oz', goal: 2400, tz: 'America/Fortaleza', social: { push: false, hit: true, week: true }, updatedAt: FS.Timestamp.fromMillis(T2) });
    await FS.setDoc(FS.doc(db, 'profiles', ANA), { nm: 'Ana', mc: 'concha', sh: true });
    await FS.setDoc(FS.doc(db, 'users', ANA, 'days', '2026-10-20'), Object.assign({ total: 600 }, dayDoc(2400, 600, T1), { updatedAt: FS.Timestamp.fromMillis(T1) }));
    await FS.setDoc(FS.doc(db, 'users', ANA, 'days', '2026-10-21'), Object.assign({ total: 900 }, dayDoc(2400, 900, T2), { updatedAt: FS.Timestamp.fromMillis(T2) }));
    if (withPrefs !== false) await FS.setDoc(FS.doc(db, 'users', ANA, 'backup', 'prefs'), PACK);
  });
}

// Abre a nuvem como o app faz. o = { user: { uid, email?, verified?, anon? } | null (ninguém logado), dbAs, envOf, hint, mark, onboarded, profile, social, reminders, days, onPrefs: false,
// offline: true (a rede cai antes de ligar a nuvem) }. Quem tem conta tem a dica local (mare:acct), como no app: hint: null abre sem ela.
async function boot(o) {
  o = o || {};
  const user = o.user === undefined ? { uid: ANA, anon: true } : o.user;
  login(user, o.envOf, o.dbAs);
  const hint = o.hint !== undefined ? o.hint : (user && user.email ? { uid: user.uid, email: user.email, verified: !!user.verified } : null);
  if (hint) store.set('mare:acct', JSON.stringify(hint));
  if (o.offline) await FS.disableNetwork(H.db);
  if (o.mark) store.set('mare:cloud', JSON.stringify(o.mark));
  const S = stateFor(o.profile);
  S.onboarded = o.onboarded !== false;
  Object.assign(S.social, o.social || {}); Object.assign(S.reminders, o.reminders || {}); Object.assign(S.days, o.days || {});
  const status = [], remote = [], prefs = [];
  const ended = [];
  const hooks = { state: () => S, onRemote: (d) => { remote.push(d); }, onStatus: (s) => { status.push(s); }, onEnded: () => { ended.push(Date.now()); } };
  if (o.onPrefs !== false) hooks.onPrefs = (p, u) => { prefs.push({ p: p, u: u }); ACC.applyPrefs(S, p, 'sync'); };
  const mod = await getMod();
  const cloud = await mod.initCloud(hooks);
  await sleep(250); // o primeiro "puxar" da nuvem termina e agenda a primeira gravação
  return { S: S, cloud: cloud, status: status, remote: remote, prefs: prefs, ended: ended, mod: mod, uid: cloud.uid };
}

describe('o que o firebase.js chama existe nos pacotes de verdade do Firebase', () => {
  const names = (file, v) => {
    const s = readFileSync(path.join(ROOT, 'public/js', file), 'utf8'), out = new Set();
    s.replace(new RegExp('\\b' + v + '\\.([A-Za-z]+)', 'g'), (m, n) => { out.add(n); return m; });
    return Array.from(out).sort();
  };
  test('login: toda função usada como AU.… existe em firebase/auth (mesma versão do CDN) e o teste a tem na troca', () => {
    const used = names('firebase.js', 'AU');
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((n) => !(n in AUR))).toEqual([]);
    expect(used.filter((n) => !(n in H.AU))).toEqual([]);
  });
  test('Firestore: toda função usada como FS.… (nuvem, amigos e avisos) existe em firebase/firestore', () => {
    const used = new Set();
    ['firebase.js', 'social-cloud.js', 'alerts-sync.js'].forEach((f) => { names(f, 'FS').forEach((n) => used.add(n)); });
    expect(used.size).toBeGreaterThan(20);
    expect(Array.from(used).filter((n) => !(n in FS))).toEqual([]);
  });
});

describe('accountKit: o login por e-mail e senha', () => {
  test('criar a conta = vincular e-mail e senha ao login anônimo: o uid não muda, o e-mail de confirmação sai e o token é renovado', async () => {
    const kit = await kitFor({ uid: ANA, anon: true });
    expect(H.auth.languageCode).toBe('pt-BR'); // os e-mails do Firebase saem em português
    const r = await kit.create(MAIL, PW);
    expect(r).toEqual({ uid: ANA, email: MAIL, verified: false, anon: false });
    expect(H.calls.filter((c) => /^(link|verify|token-novo)/.test(c))).toEqual(['link:' + MAIL, 'verify:' + MAIL, 'token-novo']);
    expect(H.accounts.get(MAIL)).toMatchObject({ uid: ANA });
    expect(kit.current()).toEqual({ uid: ANA, email: MAIL, verified: false, anon: false });
  });
  test('o e-mail de confirmação que falha não desfaz a conta (dá para reenviar depois)', async () => {
    H.mailFail = true;
    const kit = await kitFor({ uid: ANA, anon: true });
    const r = await kit.create(MAIL, PW);
    expect(r).toMatchObject({ uid: ANA, email: MAIL, anon: false });
    expect(H.accounts.has(MAIL)).toBe(true);
  });
  test('e-mail já usado, aparelho que já tem conta e aparelho sem login: o erro tem o código certo e nada muda', async () => {
    H.accounts.set(MAIL, { uid: MARI, pw: 'outra-senha-1' });
    let kit = await kitFor({ uid: ANA, anon: true });
    await expect(kit.create(MAIL, PW)).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
    expect(kit.current()).toEqual({ uid: ANA, email: '', verified: false, anon: true });
    kit = await kitFor({ uid: MARI, email: 'mari@exemplo.com' });
    await expect(kit.create('outro@exemplo.com', PW)).rejects.toMatchObject({ code: 'auth/provider-already-linked' });
    kit = await kitFor(null);
    await expect(kit.create(MAIL, PW)).rejects.toMatchObject({ code: 'mare/no-session' });
  });
  test('entrar: troca o login do aparelho pelo da conta (o mesmo uid de sempre); senha errada não muda nada; sair solta o login', async () => {
    H.accounts.set(MAIL, { uid: ANA, pw: PW, verified: true });
    const kit = await kitFor(null);
    await expect(kit.signIn(MAIL, 'errada-errada')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(kit.current()).toBeNull();
    expect(await kit.signIn(MAIL, PW)).toEqual({ uid: ANA, email: MAIL, verified: true, anon: false });
    await kit.signOut();
    expect(kit.current()).toBeNull();
  });
  test('esqueci a senha: pede o link ao Firebase, com ou sem login no aparelho, igual para qualquer e-mail', async () => {
    let kit = await kitFor(null);
    await kit.reset(MAIL);
    kit = await kitFor({ uid: ANA, anon: true });
    await kit.reset('outra@exemplo.com');
    expect(H.calls.filter((c) => c.indexOf('reset:') === 0)).toEqual(['reset:' + MAIL, 'reset:outra@exemplo.com']);
  });
  test('reenviar e conferir a confirmação do e-mail', async () => {
    let kit = await kitFor({ uid: ANA, email: MAIL });
    expect((await kit.resend()).verified).toBe(false);
    expect(H.calls).toContain('verify:' + MAIL);
    H.calls.length = 0; H.serverVerified = true; // a pessoa tocou no link: o servidor já sabe
    expect((await kit.refresh()).verified).toBe(true);
    expect((await kit.resend()).verified).toBe(true);
    expect(H.calls.filter((c) => c.indexOf('verify:') === 0)).toEqual([]); // confirmado: não manda outro e-mail
    H.reloadFail = 'auth/network-request-failed';
    expect(await kit.refresh()).toMatchObject({ email: MAIL, error: 'auth/network-request-failed' });
    kit = await kitFor({ uid: ANA, anon: true });
    await expect(kit.resend()).rejects.toMatchObject({ code: 'mare/no-session' });
    kit = await kitFor(null);
    expect(await kit.refresh()).toBeNull();
  });
  test('excluir a conta: a senha é conferida antes (reauth) e depois o login some', async () => {
    H.accounts.set(MAIL, { uid: ANA, pw: PW });
    let kit = await kitFor({ uid: ANA, email: MAIL });
    await expect(kit.reauth('errada-errada')).rejects.toMatchObject({ code: 'auth/wrong-password' });
    await kit.reauth(PW);
    await kit.deleteUser();
    expect(kit.current()).toBeNull();
    expect(H.accounts.has(MAIL)).toBe(false);
    kit = await kitFor({ uid: ANA, anon: true });
    await expect(kit.reauth(PW)).rejects.toMatchObject({ code: 'mare/no-session' });
  });
});

describe('accountKit.check: conferir e-mail e senha sem mexer no login do aparelho', () => {
  test('entra num segundo login, só na memória, e sai em seguida; o login do aparelho não é tocado', async () => {
    H.accounts.set(MAIL, { uid: MARI, pw: PW, verified: true });
    const kit = await kitFor({ uid: ANA, anon: true });
    expect(await kit.check(MAIL, PW)).toEqual({ uid: MARI, email: MAIL, verified: true, anon: false });
    expect(kit.current()).toEqual({ uid: ANA, email: '', verified: false, anon: true }); // o aparelho continua com o login que tinha
    expect(H.calls).toEqual(expect.arrayContaining(['app:mare-check', 'auth2:memoria', 'signin2:' + MAIL, 'signout2']));
    expect(H.calls.filter((c) => c.indexOf('signin:') === 0 || c === 'signout')).toEqual([]); // nada no login principal
    expect(H.user2).toBeNull();
    await expect(kit.check(MAIL, 'errada-errada')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    await expect(kit.check('ninguem@exemplo.com', PW)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(kit.current()).toMatchObject({ uid: ANA, anon: true });
    expect(H.user2).toBeNull();
    await kit.check(MAIL, PW); // de novo: reaproveita o segundo app
    expect(H.calls.filter((c) => c === 'app:mare-check')).toHaveLength(1);
  });
  test('funciona sem nenhum login no aparelho (tela de boas-vindas) e não cria nenhum', async () => {
    H.accounts.set(MAIL, { uid: ANA, pw: PW });
    const kit = await kitFor(null);
    expect(await kit.check(MAIL, PW)).toMatchObject({ uid: ANA, email: MAIL, anon: false });
    expect(kit.current()).toBeNull();
    expect(H.calls).not.toContain('anon');
  });
  test('excluir sem login no aparelho: mare/no-session (não finge que apagou)', async () => {
    const kit = await kitFor(null);
    await expect(kit.deleteUser()).rejects.toMatchObject({ code: 'mare/no-session' });
    expect(H.calls).not.toContain('deleteUser');
  });
});

describe('fetchData: o que um aparelho novo baixa da conta (com as regras de verdade)', () => {
  test('traz ajustes, resumo, perfil e TODOS os registros; guarda a marca de sincronização deste aparelho', async () => {
    await seedAna();
    const kit = await kitFor(ACCT);
    const d = await kit.fetchData();
    expect(d.uid).toBe(ANA);
    expect(d.prefs).toEqual(PACK);
    expect(d.user).toMatchObject({ wake: '06:30', sleep: '22:30', unit: 'oz' });
    expect(d.profile).toMatchObject({ nm: 'Ana', mc: 'concha' });
    expect(Object.keys(d.days).sort()).toEqual(['2026-10-20', '2026-10-21']);
    expect(d.days['2026-10-21']).toEqual({ goal: 2400, entries: [{ id: 'e' + T2, t: T2, ml: 900, d: 'water' }], u: T2 });
    const mk = JSON.parse(store.get('mare:cloud'));
    expect(mk).toMatchObject({ uid: ANA, pullAt: T2, pu: 777000, ph: 0, fcm: '', social: { push: false, hit: true, week: true } });
    expect(mk.pushAt).toBeGreaterThan(Date.now() - 5000);
  });
  test('conta sem nada guardado (o administrador criou só o login): tudo vem vazio, sem erro', async () => {
    const kit = await kitFor(ACCT);
    const d = await kit.fetchData();
    expect(d).toMatchObject({ uid: ANA, prefs: null, user: null, profile: null, days: {} });
    expect(JSON.parse(store.get('mare:cloud'))).toMatchObject({ uid: ANA, pullAt: 0, pu: 0 });
  });
  test('regras novas ainda não publicadas: os ajustes vêm vazios (permissão recusada) e o resto vem', async () => {
    await seedAna(envOld);
    const kit = await kitFor(ACCT, envOld);
    const d = await kit.fetchData();
    expect(d.prefs).toBeNull();
    expect(d.user).toMatchObject({ unit: 'oz' });
    expect(Object.keys(d.days)).toHaveLength(2);
  });
  test('sem internet a leitura FALHA (não devolve "conta vazia" do cache do aparelho): o app mostra "tentar de novo"', async () => {
    await seedAna();
    const kit = await kitFor(ACCT);
    await kit.fetchData(); // com internet: a leitura enche o cache
    await FS.disableNetwork(H.db);
    await expect(kit.fetchData()).rejects.toMatchObject({ code: 'unavailable' });
    await FS.enableNetwork(H.db);
  });
  test('os documentos soltos (ajustes, resumo e perfil) também vêm direto do servidor, nunca do que o aparelho já tinha guardado', async () => {
    await seedAna();
    const kit = await kitFor(ACCT);
    await kit.fetchData();
    expect(H.docServer).toBe(3); // users/{uid}/backup/prefs, users/{uid} e profiles/{uid}
    expect(H.docCache).toBe(0);
    expect(H.reads).toBe(1); // e os dias, uma leitura só (sem repetir)
  });
  test('sem login no aparelho: mare/no-session', async () => {
    const kit = await kitFor(null);
    await expect(kit.fetchData()).rejects.toMatchObject({ code: 'mare/no-session' });
  });
  test('logo depois de entrar a conexão pode ainda levar o login anterior (leitura recusada): reinicia a conexão e lê de novo, UMA vez só', async () => {
    await seedAna();
    const kit = await kitFor(ACCT);
    H.denyDays = 1;
    const d = await kit.fetchData();
    expect(Object.keys(d.days)).toHaveLength(2);
    expect(H.reads).toBe(2);
    H.denyDays = 5; H.reads = 0;
    await expect(kit.fetchData()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(H.reads).toBe(2); // uma tentativa e uma repetição: sem laço
  });
  test('recusa de verdade das regras (o Firestore está com o login de outra pessoa): tenta duas vezes e entrega o erro', async () => {
    await seedAna();
    login(ACCT, env, { uid: MARI }); // o app acha que é a Ana, mas a conexão leva o login da Mari
    const kit = await (await getMod()).accountKit();
    await expect(kit.fetchData()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(H.reads).toBe(2);
  });
});

describe('initCloud: os ajustes da conta', () => {
  test('sem conta (login anônimo): nada de ajustes na nuvem; o resumo e os lembretes seguem como sempre', async () => {
    const a = await boot({ profile: { name: 'Ana', weight: 64 } });
    expect(a.cloud.acct).toEqual({ uid: ANA, email: '', verified: false, anon: true });
    a.cloud.syncPrefs(); a.cloud.syncMeta(); hidden();
    const d = await until(() => readDoc(env, 'users/' + ANA), 'o resumo');
    expect(d.reminder).toMatchObject({ enabled: false });
    await sleep(200);
    expect(await readDoc(env, PREFS)).toBeNull();
    expect(nPrefs()).toBe(0);
    expect(a.status).not.toContain('error');
  });
  test('com conta: grava users/{uid}/backup/prefs (as regras aceitam: o login tem e-mail) e só grava de novo quando algo muda', async () => {
    const a = await boot({ user: ACCT, profile: { name: 'Ana', weight: 64, activity: 'high' } });
    expect(a.cloud.acct).toEqual({ uid: ANA, email: MAIL, verified: false, anon: false });
    a.cloud.syncPrefs(); hidden();
    const d = await until(() => readDoc(env, PREFS), 'os ajustes na nuvem');
    expect(Object.keys(d).sort()).toEqual(['j', 'u', 'v']);
    expect(d.v).toBe(1);
    expect(d.j.length).toBeLessThanOrEqual(4000);
    expect(ACC.prefsParse(d).prefs.profile).toMatchObject({ name: 'Ana', weight: 64, activity: 'high' });
    expect(a.status).not.toContain('error');
    expect(nPrefs()).toBe(1);
    a.cloud.syncPrefs(); hidden(); await sleep(300);
    expect(nPrefs()).toBe(1); // nada mudou: não regrava
    a.S.profile.weight = 65; a.cloud.syncPrefs(); hidden();
    await until(async () => { const x = await readDoc(env, PREFS); return x && ACC.prefsParse(x).prefs.profile.weight === 65; }, 'o peso novo na nuvem');
    expect(nPrefs()).toBe(2);
  });
  test('o onboarding ainda não foi feito: não grava ajustes (ainda não são da pessoa)', async () => {
    const a = await boot({ user: ACCT, onboarded: false });
    a.cloud.syncPrefs(); hidden(); await sleep(300);
    expect(nPrefs()).toBe(0);
    expect(await readDoc(env, PREFS)).toBeNull();
  });
  test('aparelho de conta sem push e com lembretes desligados NÃO grava "reminder" (não desliga o outro aparelho); com lembretes ligados, grava', async () => {
    await seed(env, async (db) => { await FS.setDoc(FS.doc(db, 'users', ANA), { reminder: { enabled: true, interval: 60, smart: true, nextAt: null }, unit: 'ml' }); });
    const a = await boot({ user: ACCT });
    a.cloud.syncMeta(); hidden();
    const d = await until(async () => { const x = await readDoc(env, 'users/' + ANA); return x && x.stats ? x : null; }, 'o resumo');
    expect(d.reminder).toEqual({ enabled: true, interval: 60, smart: true, nextAt: null }); // intacto: é do outro aparelho
    a.S.reminders.enabled = true; a.S.reminders.interval = 90; a.S.reminders.nextAt = Date.now() + 3600e3;
    a.cloud.syncMeta(); hidden();
    const d2 = await until(async () => { const x = await readDoc(env, 'users/' + ANA); return x && x.reminder && x.reminder.interval === 90 ? x : null; }, 'o lembrete deste aparelho');
    expect(d2.reminder).toMatchObject({ enabled: true, interval: 90, smart: true });
  });
  test('ajustes mais novos de OUTRO aparelho chegam ao abrir (onPrefs) e não voltam para a nuvem', async () => {
    const remote = packOf({ name: 'Ana Remota', weight: 80, unit: 'oz' }, Date.now() + 60000);
    await seed(env, async (db) => { await FS.setDoc(FS.doc(db, PREFS), remote); });
    const a = await boot({ user: ACCT, profile: { name: 'Ana', weight: 64 } });
    expect(a.prefs).toHaveLength(1);
    expect(a.prefs[0].u).toBe(remote.u);
    expect(a.S.profile).toMatchObject({ name: 'Ana Remota', weight: 80, unit: 'oz' });
    expect(JSON.parse(store.get('mare:cloud')).pu).toBe(remote.u);
    hidden(); await sleep(400); // o app grava ao ir para o fundo: o que acabou de chegar não volta
    expect(nPrefs()).toBe(0);
  });
  test('ajustes mais velhos que os deste aparelho são ignorados', async () => {
    await seed(env, async (db) => { await FS.setDoc(FS.doc(db, PREFS), packOf({ name: 'Velha', weight: 90 }, 5000)); });
    const a = await boot({ user: ACCT, profile: { name: 'Ana', weight: 64 }, mark: { uid: ANA, pullAt: 0, pushAt: 0, fcm: '', pu: Date.now() } });
    expect(a.prefs).toHaveLength(0);
    expect(a.S.profile).toMatchObject({ name: 'Ana', weight: 64 });
  });
  test('regras novas fora do ar: a leitura dos ajustes já é recusada, então nem tenta gravar; o resumo segue normal e nada mostra erro', async () => {
    const a = await boot({ user: ACCT, envOf: envOld });
    a.cloud.syncMeta(); a.cloud.syncPrefs(); hidden();
    await until(async () => { const x = await readDoc(envOld, 'users/' + ANA); return x && x.stats ? x : null; }, 'o resumo');
    await sleep(600);
    expect(nPrefs()).toBe(0); // sem saber o que a nuvem guarda, os ajustes daqui não sobem
    expect(warns.filter((w) => w.indexOf('[nuvem] ajustes:') >= 0)).toEqual([]);
    expect(await readDoc(envOld, 'users/' + ANA)).toMatchObject({ unit: 'ml' });
    expect(a.status).not.toContain('error');
  });
  test('o servidor ainda não vê o e-mail do login (token sem a claim): a gravação dos ajustes é recusada, tenta de novo UMA vez e para', async () => {
    const a = await boot({ user: ACCT, dbAs: { uid: ANA } }); // o app sabe que é conta; o Firestore ainda leva o login sem a claim "email"
    a.cloud.syncMeta(); a.cloud.syncPrefs(); hidden();
    await until(() => nPrefs() >= 2, 'a segunda tentativa', 8000);
    await sleep(3600); // mais que dois ciclos de espera (1,5 s cada): se a segunda recusa reabrisse o laço, haveria uma terceira tentativa
    expect(nPrefs()).toBe(2);
    expect(warns.some((w) => w.indexOf('[nuvem] ajustes:') >= 0)).toBe(true);
    expect(await readDoc(env, PREFS)).toBeNull();
    expect(a.status).not.toContain('error');
  }, 20000);
  test('sem saber o que a nuvem guarda (rede fora ao abrir), os ajustes DESTE aparelho não sobem por cima dos de outro aparelho', async () => {
    const remote = packOf({ name: 'Ana Remota', weight: 80 }, Date.now() + 60000);
    await seed(env, async (db) => { await FS.setDoc(FS.doc(db, PREFS), remote); });
    const a = await boot({ user: ACCT, profile: { name: 'Ana', weight: 64 }, offline: true });
    a.cloud.syncPrefs(); hidden(); await sleep(400);
    expect(nPrefs()).toBe(0); // não sabe o que a nuvem tem: não grava
    expect((await readDoc(env, PREFS)).u).toBe(remote.u);
    await FS.enableNetwork(H.db); // a rede volta
    a.cloud.syncPrefs(); hidden();
    await until(() => a.prefs.length === 1, 'os ajustes do outro aparelho chegaram');
    expect(a.S.profile).toMatchObject({ name: 'Ana Remota', weight: 80 });
    await sleep(500);
    expect(nPrefs()).toBe(0); // e o que chegou não volta
    expect((await readDoc(env, PREFS)).u).toBe(remote.u);
  });
  test('conta nova sem ajustes na nuvem: depois da primeira resposta do servidor, os ajustes daqui sobem', async () => {
    const a = await boot({ user: ACCT, profile: { name: 'Ana', weight: 64 } });
    a.cloud.syncPrefs(); hidden();
    const d = await until(() => readDoc(env, PREFS), 'os ajustes na nuvem');
    expect(ACC.prefsParse(d).prefs.profile).toMatchObject({ name: 'Ana', weight: 64 });
  });
  test('criar a conta neste aparelho: afterLink() passa a gravar os ajustes (o uid é o mesmo)', async () => {
    const a = await boot({ user: { uid: ANA, anon: true }, dbAs: ACCT, profile: { name: 'Ana' } });
    a.cloud.syncPrefs(); hidden(); await sleep(300);
    expect(nPrefs()).toBe(0); // anônimo: nada de ajustes
    await (await a.mod.accountKit()).create(MAIL, PW); // vincula o e-mail ao MESMO login
    await a.cloud.afterLink();
    expect(a.cloud.acct).toEqual({ uid: ANA, email: MAIL, verified: false, anon: false });
    const d = await until(() => readDoc(env, PREFS), 'os ajustes depois de criar a conta', 8000);
    expect(ACC.prefsParse(d).prefs.profile.name).toBe('Ana');
    expect(a.cloud.uid).toBe(ANA);
  });
  test('logo depois de criar a conta a primeira gravação pode ser recusada (a conexão ainda leva o login antigo): reinicia a conexão e a segunda passa', async () => {
    const a = await boot({ user: { uid: ANA, anon: true }, dbAs: ACCT });
    H.denyPrefs = 1;
    await (await a.mod.accountKit()).create(MAIL, PW);
    await a.cloud.afterLink();
    await until(() => readDoc(env, PREFS), 'a segunda tentativa passou', 8000);
    expect(nPrefs()).toBe(2);
  });
});

describe('initCloud: o login do aparelho', () => {
  test('tinha conta e o login sumiu: NÃO cria um login anônimo por baixo dos panos (viraria outra pessoa na nuvem)', async () => {
    await expect(boot({ user: null, hint: { uid: ANA, email: MAIL, verified: true } })).rejects.toMatchObject({ code: 'mare/session-ended' });
    expect(H.calls).not.toContain('anon');
    expect(H.user).toBeNull();
  });
  test('com conta lembrada e um login ANÔNIMO de outra pessoa no armazenamento: sai desse login e não cria outro (o app pede para entrar de novo)', async () => {
    await expect(boot({ user: { uid: MARI, anon: true }, hint: { uid: ANA, email: MAIL, verified: true } })).rejects.toMatchObject({ code: 'mare/session-ended' });
    expect(H.calls).toContain('signout');
    expect(H.calls).not.toContain('anon');
    expect(H.user).toBeNull();
  });
  test('com conta lembrada e o login de OUTRA conta no armazenamento: também sai, e nada do que há aqui vai para aquela conta', async () => {
    await expect(boot({ user: { uid: MARI, email: 'mari@exemplo.com' }, hint: { uid: ANA, email: MAIL, verified: true } })).rejects.toMatchObject({ code: 'mare/session-ended' });
    expect(H.calls).toContain('signout');
    expect(H.user).toBeNull();
    expect(nPrefs()).toBe(0);
    expect(await readDoc(env, 'users/' + MARI)).toBeNull();
  });
  test('sem conta lembrada e um login COM e-mail no armazenamento (uma entrada que não terminou): sai dele e cria um login anônimo novo', async () => {
    const a = await boot({ user: { uid: MARI, email: 'mari@exemplo.com' }, hint: null });
    expect(H.calls.indexOf('signout')).toBeGreaterThan(-1);
    expect(H.calls.indexOf('anon')).toBeGreaterThan(H.calls.indexOf('signout'));
    expect(a.uid).toBe(NOVO);
    expect(a.cloud.acct).toMatchObject({ uid: NOVO, anon: true });
  });
  test('com conta lembrada e o login DESSA conta: é adotado, sem sair nem criar nada (o caminho de todo dia)', async () => {
    const a = await boot({ user: ACCT });
    expect(a.uid).toBe(ANA);
    expect(a.cloud.acct).toEqual({ uid: ANA, email: MAIL, verified: false, anon: false });
    expect(H.calls).not.toContain('signout');
    expect(H.calls).not.toContain('anon');
  });
  test('primeiro uso (sem dica de conta): cria o login anônimo e segue', async () => {
    const a = await boot({ user: null });
    expect(H.calls).toContain('anon');
    expect(a.uid).toBe(NOVO);
    expect(a.cloud.acct).toMatchObject({ uid: NOVO, anon: true });
    expect(a.status).toEqual(['on']);
  });
});

describe('initCloud: o login some com o app aberto (onEnded)', () => {
  test('com conta: o app é avisado UMA vez quando o login some', async () => {
    const a = await boot({ user: ACCT });
    expect(a.ended).toHaveLength(0);
    H.user = null; H.fire();
    await sleep(60);
    expect(a.ended).toHaveLength(1);
  });
  test('sem conta (login anônimo) ninguém fica de olho: nada a avisar', async () => {
    const a = await boot({ user: { uid: ANA, anon: true } });
    H.user = null; H.fire(); await sleep(60);
    expect(a.ended).toHaveLength(0);
  });
  test('depois de criar a conta (afterLink) o app passa a ficar de olho', async () => {
    const a = await boot({ user: { uid: ANA, anon: true }, dbAs: ACCT });
    await (await a.mod.accountKit()).create(MAIL, PW);
    await a.cloud.afterLink();
    await sleep(40); // o SDK entrega o estado atual ao novo ouvinte (logado: nada a avisar)
    expect(a.ended).toHaveLength(0);
    H.user = null; H.fire(); await sleep(60);
    expect(a.ended).toHaveLength(1);
  });
  test('ao sair (detach) o aviso é desligado: o signOut que vem em seguida não vira "conta que saiu"', async () => {
    const a = await boot({ user: ACCT });
    await a.cloud.detach();
    H.user = null; H.fire(); await sleep(60);
    expect(a.ended).toHaveLength(0);
  });
  test('durante a limpeza para excluir a conta o login some de propósito: sem aviso', async () => {
    const a = await boot({ user: ACCT, profile: { name: 'Ana' } });
    const w = a.cloud.wipe({ social: false, strict: true });
    H.user = null; H.fire();
    await w; await sleep(60);
    expect(a.ended).toHaveLength(0);
  });
});

describe('sair da conta neste aparelho (detach)', () => {
  const day = (ml) => ({ goal: 2000, u: Date.now(), entries: [{ id: 'z' + ml, t: Date.now() - 1000, ml: ml, d: 'water' }] });
  test('envia o que falta, tira o push DESTE aparelho, apaga a marca e solta tudo; a conta continua inteira na nuvem', async () => {
    const a = await boot({ user: ACCT, profile: { name: 'Ana' } });
    a.S.days['2026-10-22'] = day(400);
    H.token = 'tok-ana-1';
    expect(await a.cloud.enablePush()).toBe(true);
    await until(async () => Object.keys(((await readDoc(env, 'users/' + ANA)) || {}).fcm || {}).length === 1, 'o aparelho registrado');
    a.cloud.syncDays(['2026-10-22']); a.cloud.syncPrefs();
    await a.cloud.detach();
    expect(Object.keys(((await readDoc(env, 'users/' + ANA)) || {}).fcm || {})).toEqual([]); // o push deste aparelho saiu da conta
    expect(H.deleted).toBe(1);
    expect(store.has('mare:cloud')).toBe(false);
    expect(await readDoc(env, 'users/' + ANA + '/days/2026-10-22')).toMatchObject({ total: 400 }); // chegou à nuvem antes de sair
    expect(await readDoc(env, PREFS)).not.toBeNull();
    a.S.days['2026-01-02'] = day(100); // solto: o que acontecer depois de sair não vai para a nuvem
    a.cloud.syncDays(['2026-01-02']); hidden(); await sleep(300);
    expect(await readDoc(env, 'users/' + ANA + '/days/2026-01-02')).toBeNull();
  });
  test('sem internet: avisa (mare/pending) e não solta nada; quando a internet volta o registro chega à nuvem', async () => {
    const a = await boot({ user: ACCT });
    a.S.days['2026-10-22'] = day(300);
    await FS.disableNetwork(H.db);
    a.cloud.syncDays(['2026-10-22']);
    await expect(a.cloud.detach(400)).rejects.toMatchObject({ code: 'mare/pending' });
    expect(JSON.parse(store.get('mare:cloud')).uid).toBe(ANA); // a marca continua: o aparelho ainda é desta conta
    await FS.enableNetwork(H.db);
    await until(() => readDoc(env, 'users/' + ANA + '/days/2026-10-22'), 'o registro depois que a internet voltou');
  });
  test('sem internet e só um AJUSTE por gravar (nenhum registro no ar): sair também avisa (mare/pending), porque o servidor ainda não confirmou o ajuste; a internet volta e o ajuste chega', async () => {
    const a = await boot({ user: ACCT, profile: { name: 'Ana', weight: 64 } });
    await FS.disableNetwork(H.db);
    a.S.profile.weight = 71; a.cloud.syncPrefs();
    await expect(a.cloud.detach(400)).rejects.toMatchObject({ code: 'mare/pending' });
    expect(JSON.parse(store.get('mare:cloud')).uid).toBe(ANA); // nada foi solto
    await FS.enableNetwork(H.db);
    await until(async () => { const x = await readDoc(env, PREFS); return x && ACC.prefsParse(x).prefs.profile.weight === 71; }, 'o ajuste depois que a internet voltou');
  });
  test('o primeiro contato com a nuvem ainda não terminou (rede parada): não deixa sair, porque o que foi mexido com a nuvem fora ainda não está na fila; insistindo, sai', async () => {
    H.hangPull = true;
    const a = await boot({ user: ACCT });
    a.S.days['2026-10-22'] = day(250);
    await expect(a.cloud.detach(300)).rejects.toMatchObject({ code: 'mare/pending' });
    expect((listeners.visibilitychange || []).length).toBe(1); // nada foi solto: o aparelho continua ligado à nuvem
    await a.cloud.detach(300, true);
    expect((listeners.visibilitychange || []).length).toBe(0); // insistindo, solta tudo
  });
  test('um envio de registros recusado pelo servidor não conta como enviado: sair avisa e a marca de "enviado até" fica em zero (o próximo começo reenvia)', async () => {
    const a = await boot({ user: ACCT, dbAs: { uid: MARI, email: 'mari@exemplo.com' } }); // o Firestore leva o login de outra pessoa: toda gravação em users/{ANA} é recusada
    a.S.days['2026-10-22'] = day(300);
    a.cloud.syncDays(['2026-10-22']);
    await expect(a.cloud.detach(3000)).rejects.toMatchObject({ code: 'mare/pending' });
    expect(JSON.parse(store.get('mare:cloud')).pushAt).toBe(0);
    // um envio NOVO depois da perda também não adianta a marca (senão o próximo começo pularia os registros que a nuvem nunca recebeu)
    a.S.days['2026-10-23'] = day(400);
    a.cloud.syncDays(['2026-10-23']); hidden();
    expect(JSON.parse(store.get('mare:cloud')).pushAt).toBe(0); // logo depois de enviar, antes de a nuvem responder (a recusa que chega depois também zeraria)
    await sleep(300);
    expect(JSON.parse(store.get('mare:cloud')).pushAt).toBe(0);
    await a.cloud.detach(3000, true);
    expect(store.has('mare:cloud')).toBe(false);
  });
  test('sair insistindo (force) sem internet: não espera os registros, mas ainda tira o push deste aparelho (apaga o token no FCM)', async () => {
    const a = await boot({ user: ACCT });
    H.token = 'tok-ana-2';
    expect(await a.cloud.enablePush()).toBe(true);
    await until(async () => Object.keys(((await readDoc(env, 'users/' + ANA)) || {}).fcm || {}).length === 1, 'o aparelho registrado');
    await FS.disableNetwork(H.db);
    const t0 = Date.now();
    await a.cloud.detach(12000, true);
    expect(Date.now() - t0).toBeLessThan(9000); // não esperou os 12 s dos registros
    expect(H.deleted).toBe(1);
    expect(store.has('mare:cloud')).toBe(false);
    await FS.enableNetwork(H.db);
  });
  test('aparelho sem push registrado: sair não chama o FCM (não há o que tirar)', async () => {
    const a = await boot({ user: ACCT });
    await a.cloud.detach();
    expect(H.deleted).toBe(0);
    expect(store.has('mare:cloud')).toBe(false);
  });
  test('o FCM que não responde não prende a saída: desiste em poucos segundos e solta tudo', async () => {
    const a = await boot({ user: ACCT });
    H.token = 'tok-ana-3';
    expect(await a.cloud.enablePush()).toBe(true);
    await until(async () => Object.keys(((await readDoc(env, 'users/' + ANA)) || {}).fcm || {}).length === 1, 'o aparelho registrado');
    H.hangDelete = true;
    const t0 = Date.now();
    await a.cloud.detach();
    expect(Date.now() - t0).toBeLessThan(12000);
    expect(store.has('mare:cloud')).toBe(false);
  }, 25000);
});

describe('apagar na nuvem (excluir a conta) e reenviar', () => {
  test('wipe leva registros, ajustes, resumo e push; resync reenvia tudo (se a exclusão do login falhou depois da limpeza)', async () => {
    const days = { '2026-10-20': dayDoc(2400, 600, T1), '2026-10-21': dayDoc(2400, 900, T2) };
    const a = await boot({ user: ACCT, profile: { name: 'Ana' }, days: days });
    a.cloud.syncDays(Object.keys(days)); a.cloud.syncMeta(); a.cloud.syncPrefs();
    expect(await a.cloud.enablePush()).toBe(true);
    hidden();
    await until(async () => (await ids(env, 'users/' + ANA + '/days')).length === 2 && (await readDoc(env, PREFS)), 'tudo na nuvem');
    await a.cloud.wipe();
    expect(await ids(env, 'users/' + ANA + '/days')).toEqual([]);
    expect(await readDoc(env, PREFS)).toBeNull();
    expect(await readDoc(env, 'users/' + ANA)).toBeNull();
    expect(H.deleted).toBeGreaterThanOrEqual(1);
    expect(a.cloud.push).toBe(false);
    a.cloud.resync(); hidden();
    await until(async () => (await ids(env, 'users/' + ANA + '/days')).length === 2 && (await readDoc(env, PREFS)) && (await readDoc(env, 'users/' + ANA)), 'tudo de volta na nuvem');
  });
  test('wipe({ social: false }) não sai da turma (quem chama sai depois, e por último); o wipe comum sai', async () => {
    await seed(env, async (db) => { await FS.setDoc(FS.doc(db, 'profiles', ANA), { nm: 'Ana', mc: 'concha', sh: true }); });
    const a = await boot({ user: ACCT, profile: { name: 'Ana' } });
    await a.cloud.wipe({ social: false });
    expect(await readDoc(env, 'profiles/' + ANA)).toMatchObject({ nm: 'Ana' }); // a turma ficou
    await a.cloud.wipe();
    expect(await readDoc(env, 'profiles/' + ANA)).toBeNull(); // saiu
  });
  test('wipe({ strict: true }) sem internet FALHA (não apaga "o que o cache conhece") e deixa a marca zerada para reenviar; nada some da nuvem', async () => {
    const days = { '2026-10-20': dayDoc(2400, 600, T1) };
    const a = await boot({ user: ACCT, days: days });
    a.cloud.syncDays(Object.keys(days)); hidden();
    await until(async () => (await ids(env, 'users/' + ANA + '/days')).length === 1, 'o registro na nuvem');
    await FS.disableNetwork(H.db);
    await expect(a.cloud.wipe({ social: false, strict: true })).rejects.toMatchObject({ code: 'unavailable' });
    expect(JSON.parse(store.get('mare:cloud')).pushAt).toBe(0);
    expect(await ids(env, 'users/' + ANA + '/days')).toEqual(['2026-10-20']);
    await FS.enableNetwork(H.db);
  });
});

describe('de um aparelho para outro: a recuperação', () => {
  test('o aparelho antigo grava; o novo entra com e-mail e senha, baixa tudo do jeito que estava e não regrava nada', async () => {
    H.accounts.set(MAIL, { uid: ANA, pw: PW, verified: true });
    const days = { '2026-10-20': dayDoc(2400, 600, T1), '2026-10-21': dayDoc(2400, 900, T2) };
    const A = await boot({ user: { uid: ANA, email: MAIL, verified: true }, profile: { name: 'Ana', weight: 64, wake: '06:30', sleep: '22:30', unit: 'oz' }, days: days });
    A.cloud.syncDays(Object.keys(days)); A.cloud.syncMeta(); A.cloud.syncPrefs(); hidden();
    await until(async () => (await ids(env, 'users/' + ANA + '/days')).length === 2 && (await readDoc(env, PREFS)), 'tudo na nuvem');
    A.cloud.dispose();
    const before = {};
    for (const k of Object.keys(days)) before[k] = (await readDoc(env, 'users/' + ANA + '/days/' + k)).updatedAt.toMillis();

    // aparelho B: nada guardado e ninguém logado (o Firestore já é o da conta, que é quem vai entrar)
    store.clear(); H.calls.length = 0;
    login({ uid: ANA, email: MAIL, verified: true }); H.user = null;
    const mod = await getMod();
    const kit = await mod.accountKit();
    expect(await kit.signIn(MAIL, PW)).toMatchObject({ uid: ANA, email: MAIL, anon: false });
    const data = await kit.fetchData();
    const plan = ACC.restorePlan(data);
    expect(plan).toMatchObject({ complete: true, days: 2, found: true });
    const S2 = C.defaults(Date.now());
    Object.keys(data.days).forEach((k) => { S2.days[k] = data.days[k]; });
    expect(ACC.applyPlan(S2, plan)).toBe(true); // com o backup dos ajustes, o onboarding não aparece
    expect(S2.profile).toMatchObject({ name: 'Ana', weight: 64, wake: '06:30', sleep: '22:30', unit: 'oz' });
    expect(Object.keys(S2.days).sort()).toEqual(['2026-10-20', '2026-10-21']);

    // a nuvem do aparelho B: nada novo para baixar e nenhum registro reenviado
    const remote = [];
    const cloud = await mod.initCloud({ state: () => S2, onRemote: (d) => { remote.push(d); }, onStatus: () => {}, onPrefs: () => {} });
    await sleep(300); cloud.syncMeta(); hidden(); await sleep(500);
    expect(remote).toHaveLength(0);
    for (const k of Object.keys(days)) expect((await readDoc(env, 'users/' + ANA + '/days/' + k)).updatedAt.toMillis()).toBe(before[k]);
    cloud.dispose();
  });
  test('conta feita pelo administrador (e-mail ligado ao uid antigo, sem backup de ajustes): entra e traz registros, horários e apelido; o onboarding vem pré-preenchido', async () => {
    await seed(env, async (db) => {
      await FS.setDoc(FS.doc(db, 'users', MARI), { wake: '08:00', sleep: '00:30', unit: 'ml', goal: 2000, tz: 'America/Fortaleza', updatedAt: FS.Timestamp.fromMillis(T2) });
      await FS.setDoc(FS.doc(db, 'profiles', MARI), { nm: 'Mari', mc: 'concha', sh: true });
      for (const [k, t] of [['2026-10-19', T1], ['2026-10-20', T1 + 1000], ['2026-10-21', T2]]) {
        await FS.setDoc(FS.doc(db, 'users', MARI, 'days', k), Object.assign({ total: 500 }, dayDoc(2000, 500, t), { updatedAt: FS.Timestamp.fromMillis(t) }));
      }
    });
    H.accounts.set('mari@exemplo.com', { uid: MARI, pw: PW });
    login({ uid: MARI, email: 'mari@exemplo.com' }); H.user = null;
    const kit = await (await getMod()).accountKit();
    await kit.signIn('mari@exemplo.com', PW);
    const data = await kit.fetchData();
    expect(data.prefs).toBeNull();
    const plan = ACC.restorePlan(data);
    expect(plan).toMatchObject({ complete: false, days: 3, found: true, base: { wake: '08:00', sleep: '00:30', unit: 'ml', name: 'Mari' }, social: { on: true, nick: 'Mari' } });
    const S2 = C.defaults(Date.now());
    expect(ACC.applyPlan(S2, plan)).toBe(false); // o onboarding continua: peso e atividade a pessoa informa de novo
    expect(S2.onboarded).toBe(false);
    expect(S2.profile).toMatchObject({ name: 'Mari', wake: '08:00', sleep: '00:30' });
  });
});

describe('o começo do app: o que foi mexido neste aparelho enquanto a nuvem estava fora', () => {
  test('os dias com "u" depois da marca de "enviado até" sobem sozinhos ao abrir; os que já tinham sido enviados não sobem de novo', async () => {
    const enviado = Date.now() - 3600e3;
    const a = await boot({
      user: ACCT, mark: { uid: ANA, pullAt: 0, pushAt: enviado, fcm: '', pu: Date.now() },
      days: { '2026-10-20': dayDoc(2400, 600, enviado - 5000), '2026-10-21': dayDoc(2400, 700, enviado + 5000) },
    });
    const doc = await until(async () => await readDoc(env, 'users/' + ANA + '/days/2026-10-21'), 'o dia mexido com a nuvem fora sobe sozinho');
    expect(doc.entries[0].ml).toBe(700);
    expect(await readDoc(env, 'users/' + ANA + '/days/2026-10-20')).toBeNull(); // este já estava na nuvem (antes da marca): não é reenviado
    expect(a.status).toContain('on');
  });
});
