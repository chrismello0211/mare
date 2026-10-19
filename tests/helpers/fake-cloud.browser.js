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

export async function initCloud() {
  window.__cloudInit = (window.__cloudInit || 0) + 1;
  // seed.initFail = quantas das primeiras tentativas de ligar a nuvem falham (como abrir o app sem internet); depois ela sobe normalmente
  if (window.__cloudInit <= ((window.__fakeSeed && window.__fakeSeed.initFail) || 0)) throw new Error('sem rede (simulado)');
  const W = window.__fake || (window.__fake = makeWorld());
  return {
    uid: ME, push: false, syncDays() {}, syncMeta() {},
    enablePush: async () => { window.__pushEnabled = (window.__pushEnabled || 0) + 1; return true; },
    // wipeHang (teste): o apagar da nuvem nunca responde (sem internet). O app não pode depender dele para largar as escutas do aparelho
    wipe: async () => { if (W.wipeHang) await new Promise(() => {}); try { await W.api.leave(); } catch (e) { /* como o firebase.js real */ } },
    // como o createSocial real: a cópia guardada no aparelho é o estado de partida (a lista continua à vista enquanto a nuvem não responde)
    social: (cache) => {
      if (cache && !W.cacheUsed) { W.cacheUsed = true; if (!W.st.friends.length && !W.st.reqIn.length && !W.st.reqOut.length) W.st = Object.assign({}, W.st, cleanState(cache)); }
      return W.api;
    },
  };
}
