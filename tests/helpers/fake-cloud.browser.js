// Maré — "nuvem de mentira" para os testes de interface dos amigos. Roda NO NAVEGADOR, no lugar de js/firebase.js (o teste a serve com
// page.route). Entrega à tela o mesmo que o social-cloud.js: o mesmo formato de estado (os amigos passam pelas mesmas funções de
// limpeza de social.js), os mesmos códigos de erro e o mesmo comportamento das operações, só que tudo em memória e controlável pelo
// teste em window.__fake. As regras e o servidor de verdade são cobertos por tests/rules/social-cloud.test.js.
import { cleanFriend, cleanRequest, cleanInvite, cleanState, normCode, validCode, byName, MAX_FRIENDS } from './social.js';
import { dayKey, addDays } from './core.js';

const ME = 'fakemeuid0000000000000000001';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
function mkErr(code, extra) { const e = new Error(code); e.name = 'SocialError'; e.code = code; if (extra) Object.assign(e, extra); return e; }

function makeWorld() {
  const seed = window.__fakeSeed || {};
  const W = {
    me: ME, joined: null, hooks: null, subs: [], started: false, lat: 15, fail: {}, calls: [], payloads: [], touches: 0, flushes: 0,
    codes: Object.assign({ ZZZZ2222: { uid: 'zeuidzeuidzeuid0000000000001', nm: 'Zé', mc: 'polvo' } }, seed.codes || {}),
    people: {}, pairs: {}, nextCode: seed.nextCode || 'ABCD2345', codeN: 0, startErr: seed.startErr || '', st: null,
  };
  W.st = Object.assign({ ready: false, err: '', code: '' }, cleanState(seed.cache || null));
  const today = () => dayKey();
  const emit = () => { setTimeout(() => { W.subs.slice().forEach((f) => { try { f(W.st); } catch (e) { /* ouvinte ruim */ } }); }, 5); };
  const set = (patch) => { W.st = Object.assign({}, W.st, patch); emit(); };
  function rebuild() {
    const friends = [], reqIn = [], reqOut = [];
    Object.keys(W.pairs).forEach((o) => {
      const p = W.pairs[o];
      if (p.st === 'active') { const c = cleanFriend(o, W.people[o], p, ME); if (c) friends.push(c); }
      else { const r = cleanRequest(o, p, ME); if (r) (r.mine ? reqOut : reqIn).push(r); }
    });
    friends.sort(byName); reqIn.sort((a, b) => b.at - a.at); reqOut.sort((a, b) => b.at - a.at);
    set({ friends, reqIn, reqOut, at: Date.now() });
  }
  const chk = async (name) => {
    W.calls.push(name);
    await sleep(W.lat);
    if (W.fail[name]) { const c = W.fail[name]; if (!W.fail.keep) delete W.fail[name]; throw mkErr(c); }
  };
  const active = () => Object.keys(W.pairs).filter((o) => W.pairs[o].st === 'active').length;
  const outs = () => Object.keys(W.pairs).filter((o) => W.pairs[o].st === 'pending' && W.pairs[o].by === ME).length;

  // ---- controles para o teste ----
  // prof.ago = há quantos dias o amigo apareceu pela última vez (0 = hoje)
  W.person = (uid, prof) => {
    const p = Object.assign({}, prof);
    if (p.ago != null) { p.day = addDays(today(), -p.ago); delete p.ago; }
    W.people[uid] = Object.assign({ v: 1, nm: 'Amigo', mc: 'concha', ins: ['concha'], pct: 0, met: false, st: 0, day: today(), sh: true }, W.people[uid], p);
    rebuild();
  };
  W.befriend = (uid, prof, pair) => { W.person(uid, prof); W.pairs[uid] = Object.assign({ m: [ME, uid], st: 'active', by: uid, nm: W.people[uid].nm, mc: W.people[uid].mc, at: Date.now() - 864e5 * 3, ok: Date.now() - 864e5 * 3, w: {} }, pair); rebuild(); };
  W.incoming = (uid, prof) => { W.people[uid] = Object.assign({ v: 1, nm: 'Amigo', mc: 'concha', ins: ['concha'], pct: 0, met: false, st: 0, day: today(), sh: true }, prof); W.pairs[uid] = { m: [ME, uid], st: 'pending', by: uid, nm: W.people[uid].nm, mc: W.people[uid].mc, tn: 'Eu', tc: 'concha', at: Date.now() }; rebuild(); };
  // pedido que EU mandei e ainda não foi aceito
  W.outgoing = (uid, prof) => { const nm = (prof && prof.nm) || 'Amigo'; W.pairs[uid] = { m: [ME, uid], st: 'pending', by: ME, nm: 'Eu', mc: 'concha', tn: nm, tc: (prof && prof.mc) || 'concha', at: Date.now() }; rebuild(); };
  W.accepted = (uid) => { const p = W.pairs[uid]; if (p) { p.st = 'active'; p.ok = Date.now(); } rebuild(); };
  W.waveFrom = (uid, kind, day) => { const p = W.pairs[uid]; if (p) { p.w = Object.assign({}, p.w, { [uid]: { k: kind || 'hi', d: day || today() } }); rebuild(); } };
  W.unfriend = (uid) => { delete W.pairs[uid]; rebuild(); };
  W.setErr = (c) => { set({ err: c || '' }); };
  W.registerCode = (code, who) => { W.codes[code] = who; };

  // ---- a mesma API do social-cloud.js ----
  const api = {
    me: ME,
    state: () => W.st,
    on: (fn) => { W.subs.push(fn); return () => { W.subs = W.subs.filter((x) => x !== fn); }; },
    start: (h) => {
      W.calls.push('start'); W.hooks = h || W.hooks; W.started = true;
      setTimeout(() => { if (!W.started) return; set({ ready: true, err: W.startErr }); if (!W.startErr) rebuild(); }, 30);
    },
    stop: () => { W.calls.push('stop'); W.started = false; },
    refresh: async () => { await chk('refresh'); return W.st; },
    join: async (o) => {
      await chk('join');
      if (!o || !o.payload) throw mkErr('bad');
      W.joined = o.payload; W.payloads.push(o.payload);
      const c = W.st.code || o.code || W.nextCode;
      set({ code: c });
      return c;
    },
    publish: async (p) => { await chk('publish'); if (!p) return false; W.joined = p; W.payloads.push(p); return true; },
    touch: () => { W.touches++; },
    flush: async () => { W.flushes++; const p = W.hooks && W.hooks.payload ? W.hooks.payload() : null; if (p) { W.payloads.push(p); W.joined = p; } return !!p; },
    // código novo só com letras e números do alfabeto de convite (sem I, L, O, 0, 1)
    newCode: async () => { await chk('newCode'); W.codeN++; const c = 'NEWC' + (2222 + W.codeN); set({ code: c }); return c; },
    lookup: async (raw) => {
      await chk('lookup');
      const code = normCode(raw);
      if (!validCode(code)) return null;
      const x = code === W.st.code ? { uid: ME, nm: (W.joined && W.joined.nm) || 'Eu', mc: 'concha' } : W.codes[code];
      return x ? cleanInvite(code, x, ME) : null;
    },
    request: async (raw) => {
      await chk('request');
      if (!W.joined) throw mkErr('notjoined');
      const who = await api.lookup(raw);
      if (!who) throw mkErr('notfound');
      if (who.self) throw mkErr('self', { who });
      const cur = W.pairs[who.uid];
      if (cur) {
        if (cur.st === 'active') throw mkErr('exists', { who });
        if (cur.by === ME) throw mkErr('pending', { who });
        cur.st = 'active'; cur.ok = Date.now(); W.people[who.uid] = W.people[who.uid] || { nm: who.nm, mc: who.mc };
        rebuild();
        return { kind: 'accepted', uid: who.uid, nm: who.nm, mc: who.mc };
      }
      if (active() + outs() >= MAX_FRIENDS) throw mkErr('full');
      W.pairs[who.uid] = { m: [ME, who.uid], st: 'pending', by: ME, nm: W.joined.nm, mc: W.joined.mc, tn: who.nm, tc: who.mc, at: Date.now() };
      rebuild();
      return { kind: 'sent', uid: who.uid, nm: who.nm, mc: who.mc };
    },
    accept: async (uid) => {
      await chk('accept');
      const p = W.pairs[uid];
      if (!p || p.st !== 'pending' || p.by === ME) throw mkErr('gone');
      p.st = 'active'; p.ok = Date.now(); rebuild();
    },
    wave: async (uid, kind, day) => {
      await chk('wave');
      const p = W.pairs[uid];
      if (!p || p.st !== 'active') throw mkErr('gone');
      p.w = Object.assign({}, p.w, { [ME]: { k: kind, d: day } }); W.lastWave = { uid, kind, day }; rebuild();
    },
    // recusa todos os pedidos que recebi (os meus pedidos e as amizades ficam) e devolve quantos eram
    declineAll: async () => {
      await chk('declineAll');
      const ids = Object.keys(W.pairs).filter((o) => W.pairs[o].st === 'pending' && W.pairs[o].by !== ME);
      ids.forEach((o) => { delete W.pairs[o]; });
      rebuild();
      return ids.length;
    },
    leave: async () => {
      W.calls.push('stop'); W.started = false; // como o leave() real: desliga a escuta ANTES de tentar (quem chama é que a religa se a saída falhar)
      await chk('leave');
      if (W.acct) W.acct.calls.push('leave'); // a ordem entre a saída da turma, a limpeza da nuvem e o login é conferida pelos testes
      // o que o aparelho ainda tinha guardado quando cada saída chegou à nuvem (o teste confere que o app só apaga depois de sair)
      try { (W.leaveSnaps = W.leaveSnaps || []).push(JSON.parse(localStorage.getItem('mare:v1'))); } catch (e) { /* sem cópia */ }
      W.started = false; W.pairs = {}; W.joined = null;
      W.st = { ready: false, err: '', code: '', friends: [], reqIn: [], reqOut: [], at: 0 }; emit();
    },
  };
  const drop = (name) => async (uid) => { await chk(name); delete W.pairs[uid]; rebuild(); };
  api.decline = drop('decline'); api.cancel = drop('cancel'); api.remove = drop('remove');
  W.api = api;

  // estado inicial pedido pelo teste (um aparelho que já usava os amigos)
  (seed.friends || []).forEach((f) => { W.befriend(f.uid, f.prof, f.pair); });
  (seed.reqIn || []).forEach((f) => { W.incoming(f.uid, f.prof); });
  if (seed.code) W.st = Object.assign({}, W.st, { code: seed.code });
  return W;
}

// ---- conta (1.3.0): o login por e-mail e senha de mentira ----
// seed.acct = { users: { 'ana@exemplo.com': { pw, uid, verified, cloud: { prefs, user, profile, days } } }, user: { uid, email, verified, anon } | null,
//   dialect: 'new' | 'old' (como o Firebase responde a senha errada: invalid-credential, ou wrong-password e user-not-found), remotePrefs: { u, prefs },
//   lat: quanto cada passo do login demora, em ms (12 por padrão; window.__acct.lat muda no meio do teste) }.
// seed.acct.fail = { operação: código } faz a primeira chamada daquela operação falhar. Sem seed.acct.user o aparelho nasce com o login anônimo (o uid de sempre). O login e as contas criadas ficam em localStorage ('fake:auth'): recarregar a
// página mantém tudo, como o IndexedDB do Firebase. window.__acct dá ao teste o que aconteceu (calls, sent, resets…) e os controles (fail, verify, end).
// calls também recebe 'wipe' e 'leave' (a ordem entre login, limpeza da nuvem e saída da turma é o que os testes conferem); atSignIn guarda, a cada
// signIn, o que já tinha acontecido (limpezas, saída da turma e quantos dias o aparelho ainda tinha); end() imita o login que some com o app aberto.
const mkAuthErr = (code) => { const e = new Error(code); e.code = code; return e; };
const whoOf = (u) => (u ? { uid: u.uid, email: u.email || '', verified: !!u.verified, anon: !!u.anon } : null);
function makeAcct() {
  const seed = (window.__fakeSeed && window.__fakeSeed.acct) || {};
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem('fake:auth') || 'null'); } catch (e) { kept = null; }
  const A = {
    users: kept ? kept.users : Object.assign({}, seed.users || {}),
    user: kept ? kept.user : (seed.user === undefined ? { uid: ME, email: '', verified: false, anon: true } : seed.user),
    dialect: seed.dialect || 'new', lat: seed.lat || 12, fail: Object.assign({}, seed.fail || {}), calls: [], sent: [], resets: [], linked: 0, detached: 0, disposed: 0, resynced: 0, wiped: 0, prefsSynced: 0,
    detachForce: 0, wipeOpts: [], atSignIn: [], synced: [], watching: false, hooks: null, strayOut: 0, wipeBusy: 0, signInDuringWipe: 0,
    remotePrefs: seed.remotePrefs || null,
  };
  // como o firebase.js: com conta, o app é avisado quando o login some com o app aberto (a escuta termina em dispose/detach)
  A.fire = () => { setTimeout(() => { if (A.watching && A.hooks && A.hooks.onEnded) A.hooks.onEnded(); }, 0); };
  A.end = () => { A.user = null; A.save(); A.fire(); };
  A.localDays = () => { try { return Object.keys((JSON.parse(localStorage.getItem('mare:v1')) || {}).days || {}).length; } catch (e) { return -1; } };
  A.save = () => { try { localStorage.setItem('fake:auth', JSON.stringify({ users: A.users, user: A.user })); } catch (e) { /* sem espaço */ } };
  A.verify = (email) => { if (A.users[email]) A.users[email].verified = true; A.save(); }; // "a pessoa tocou no link do e-mail"
  A.chk = async (name) => {
    A.calls.push(name);
    await sleep(A.lat);
    if (A.fail[name]) { const c = A.fail[name]; if (!A.fail.keep) delete A.fail[name]; throw mkAuthErr(c); }
  };
  A.bad = (known) => mkAuthErr(A.dialect === 'old' ? (known ? 'auth/wrong-password' : 'auth/user-not-found') : 'auth/invalid-credential');
  A.save();
  return A;
}

export async function accountKit() {
  const W = window.__fake || (window.__fake = makeWorld());
  const A = window.__acct || (window.__acct = makeAcct());
  W.acct = A;
  return {
    current: () => whoOf(A.user),
    async create(email, pw) {
      await A.chk('create');
      if (!A.user) throw mkAuthErr('mare/no-session');
      if (!A.user.anon) throw mkAuthErr('auth/provider-already-linked');
      const e = String(email).toLowerCase();
      if (A.users[e]) throw mkAuthErr('auth/email-already-in-use');
      A.users[e] = { pw: pw, uid: A.user.uid, verified: false, cloud: null };
      A.user = { uid: A.user.uid, email: e, verified: false, anon: false };
      A.sent.push(e);
      A.save();
      return whoOf(A.user);
    },
    // confere e-mail e senha SEM mexer no login do aparelho (o firebase.js entra num segundo app, só na memória, e sai em seguida)
    async check(email, pw) {
      await A.chk('check');
      const e = String(email).toLowerCase(), rec = A.users[e];
      if (!rec || rec.pw !== pw) throw A.bad(!!rec);
      return whoOf({ uid: rec.uid, email: e, verified: !!rec.verified, anon: false });
    },
    async signIn(email, pw) {
      await A.chk('signIn');
      const e = String(email).toLowerCase(), rec = A.users[e];
      if (!rec || rec.pw !== pw) throw A.bad(!!rec);
      if (A.wipeBusy) A.signInDuringWipe++; // a limpeza da nuvem do login anterior ainda não terminou: o app tem que esperar por ela antes de trocar de login
      A.atSignIn.push({ wiped: A.wiped, left: W.calls.indexOf('leave') >= 0, days: A.localDays(), user: A.user ? A.user.uid : null });
      A.user = { uid: rec.uid, email: e, verified: !!rec.verified, anon: false };
      A.save();
      return whoOf(A.user);
    },
    // como o SDK: as operações de login andam em fila. Quem religa a nuvem logo depois (initCloud) espera esta saída terminar antes de olhar o login
    async signOut() {
      const p = (async () => { await A.chk('signOut'); A.user = null; A.save(); A.fire(); })();
      A.outP = p;
      try { await p; } finally { if (A.outP === p) A.outP = null; }
    },
    async reset(email) {
      await A.chk('reset');
      const e = String(email).toLowerCase();
      if (!A.users[e] && A.dialect === 'old') throw mkAuthErr('auth/user-not-found');
      A.resets.push(e);
    },
    async resend() {
      await A.chk('resend');
      if (!A.user || A.user.anon) throw mkAuthErr('mare/no-session');
      if (!A.users[A.user.email].verified) A.sent.push(A.user.email);
      return whoOf(Object.assign({}, A.user, { verified: !!A.users[A.user.email].verified }));
    },
    async refresh() {
      await A.chk('refresh');
      if (!A.user) return null;
      if (!A.user.anon && A.users[A.user.email]) { A.user.verified = !!A.users[A.user.email].verified; A.save(); }
      return whoOf(A.user);
    },
    async reauth(pw) {
      await A.chk('reauth');
      if (!A.user || A.user.anon) throw mkAuthErr('mare/no-session');
      if (A.users[A.user.email].pw !== pw) throw A.bad(true);
    },
    async deleteUser() {
      await A.chk('deleteUser');
      if (!A.user) throw mkAuthErr('mare/no-session'); // como o firebase.js: sem login não há o que apagar (e não finge que apagou)
      if (A.user.email) delete A.users[A.user.email];
      A.user = null; A.save(); A.fire(); // o SDK avisa a escuta do login: o app não pode tratar isso como "a conta saiu"
    },
    async fetchData() {
      await A.chk('fetchData');
      if (!A.user) throw mkAuthErr('mare/no-session');
      const c = (A.users[A.user.email] && A.users[A.user.email].cloud) || {};
      return { uid: A.user.uid, prefs: c.prefs || null, user: c.user || null, profile: c.profile || null, days: c.days || {} };
    },
  };
}

export async function initCloud(hooks) {
  window.__cloudInit = (window.__cloudInit || 0) + 1;
  // seed.initFail = quantas das primeiras tentativas de ligar a nuvem falham (como abrir o app sem internet); depois ela sobe normalmente
  if (window.__cloudInit <= ((window.__fakeSeed && window.__fakeSeed.initFail) || 0)) throw new Error('sem rede (simulado)');
  const W = window.__fake || (window.__fake = makeWorld());
  const A = window.__acct || (window.__acct = makeAcct());
  W.acct = A;
  if (A.outP) { try { await A.outP; } catch (e) { /* quem pediu a saída trata o erro */ } }
  // como o firebase.js de verdade: o login que o aparelho pode usar é o que combina com o que ele sabe de si (com conta lembrada, só o login DESSA conta;
  // sem conta, só o anônimo); qualquer outro é descartado. Sem login e COM uma conta lembrada, não cria um login anônimo por baixo dos panos.
  let hint = null;
  try { hint = JSON.parse(localStorage.getItem('mare:acct') || 'null'); } catch (e) { hint = null; }
  if (hint && !hint.uid) hint = null;
  const mine = (u) => (hint ? !u.anon && u.uid === hint.uid : !!u.anon);
  if (A.user && !mine(A.user)) { A.user = null; A.save(); A.strayOut++; }
  if (!A.user) {
    if (hint) { const e = new Error('mare/session-ended'); e.code = 'mare/session-ended'; throw e; }
    A.user = { uid: ME, email: '', verified: false, anon: true };
    A.save();
  }
  A.hooks = hooks;
  A.watching = !!(A.user && !A.user.anon && A.user.email);
  const cloud = {
    uid: A.user.uid, acct: whoOf(A.user), push: false,
    syncDays(keys) { A.synced.push((keys || []).slice()); },
    syncMeta() { window.__metaSynced = (window.__metaSynced || 0) + 1; },
    syncPrefs() { A.prefsSynced++; }, flush() {}, resync() { A.resynced++; },
    // criar a conta acabou de acontecer: a nuvem passa a enxergar o login com e-mail (e a escuta do login começa)
    afterLink: async () => { await A.chk('afterLink'); A.linked++; cloud.acct = whoOf(A.user); A.watching = true; },
    // sair da conta: envia o que falta e espera; o teste pode fazer falhar com A.fail.detach = 'mare/pending'. force = a pessoa insistiu: não espera nada
    detach: async (wait, force) => {
      if (force) { A.calls.push('detach'); A.detachForce++; } else await A.chk('detach');
      A.detached++; cloud.dispose();
    },
    dispose() { A.disposed++; A.watching = false; },
    enablePush: async () => { window.__pushEnabled = (window.__pushEnabled || 0) + 1; return true; },
    // wipeHang (teste): o apagar da nuvem nunca responde (sem internet). O app não pode depender dele para largar as escutas do aparelho.
    // opts.social = false: quem chama sai da turma depois (excluir a conta); sem isso o wipe sai da turma por conta própria, como o firebase.js real
    wipe: async (opts) => {
      A.wiped++; A.wipeBusy++; A.calls.push('wipe'); A.wipeOpts.push(opts || null);
      try {
        if (W.wipeHang) await new Promise(() => {});
        if (W.wipeLat) await sleep(W.wipeLat); // wipeLat (teste): a limpeza demora esse tanto (ms) para terminar
        if (A.fail.wipe) { const c = A.fail.wipe; delete A.fail.wipe; throw mkAuthErr(c); }
        if (!(opts && opts.social === false)) { try { await W.api.leave(); } catch (e) { /* como o firebase.js real */ } }
      } finally { A.wipeBusy--; }
    },
    // como o createSocial real: a cópia guardada no aparelho é o estado de partida (a lista continua à vista enquanto a nuvem não responde)
    social: (cache) => {
      if (cache && !W.cacheUsed) { W.cacheUsed = true; if (!W.st.friends.length && !W.st.reqIn.length && !W.st.reqOut.length) W.st = Object.assign({}, W.st, cleanState(cache)); }
      return W.api;
    },
  };
  // ajustes mais novos gravados por outro aparelho da mesma conta: chegam logo depois que a nuvem sobe
  if (A.remotePrefs && A.user && !A.user.anon && hooks && hooks.onPrefs) setTimeout(() => { hooks.onPrefs(A.remotePrefs.prefs, A.remotePrefs.u); A.remotePrefs = null; }, 40);
  return cloud;
}
