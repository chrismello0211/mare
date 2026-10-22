// Maré — amigos: a parte que conversa com o Firestore (convite, pedidos, aceite, acenos, perfil público e as atualizações ao vivo).
// Recebe o Firestore já pronto (FS = módulos do SDK, db, uid), então roda igual no navegador (SDK do CDN, via firebase.js) e nos
// testes (SDK do npm contra o emulador: tests/rules/social-cloud.test.js). Quem usa só enxerga o que passou por social.js (limpeza).
// Modelo de dados e regras de segurança: firestore.rules (profiles, codes, friendships) e HANDOFF.md, Parte 9.
import { MAX_FRIENDS, WAVE_KINDS, DAY_RE, UID_RE, genCode, normCode, validCode, pairId, otherOf, samePayload, cleanFriend, cleanRequest,
  cleanInvite, profileOfCached, cleanState, byName } from './social.js';

// Erros que a tela entende (e.code): rules (regras não publicadas ou recusa do servidor), offline, notfound, self, exists, pending, full,
// gone (já não existe), wave (aceno repetido), notjoined, bad, auth, busy, unknown. Nunca vaza texto técnico do Firestore.
export class SocialError extends Error {
  constructor(code, extra) { super(code); this.name = 'SocialError'; this.code = code; if (extra) Object.assign(this, extra); }
}
const err = (code, extra) => new SocialError(code, extra);
export function mapErr(e) {
  if (e && e.name === 'SocialError') return e;
  const c = e && e.code ? String(e.code).replace(/^firestore\//, '') : '';
  if (c === 'permission-denied') return err('rules');
  if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'cancelled' || /offline/i.test((e && e.message) || '')) return err('offline');
  if (c === 'not-found') return err('gone');
  if (c === 'unauthenticated') return err('auth');
  if (c === 'resource-exhausted') return err('busy');
  return err('unknown');
}

const noop = () => {};
const RETRY = [4000, 12000, 40000, 120000, 300000]; // espera antes de tentar de novo quando a escuta cai: cresce até 5 min
const RETRY_PROFILE = [2000, 6000, 20000, 60000, 180000]; // idem, para a escuta do perfil de UM amigo
// "Não existe" ou "recusado": as regras respondem com recusa quando o documento já não existe (não há "não encontrado" para quem não pode ler)
const gone = (e) => !!e && (e.code === 'permission-denied' || e.code === 'not-found');

export function createSocial(opt) {
  const FS = opt.FS, db = opt.db, me = String(opt.uid), rand = opt.rand;
  const LEAVE_MS = opt.leaveMs || 15000; // depois disso a saída não começa nenhuma etapa nova: ela termina (ou falha) antes de a tela desistir
  if (!UID_RE.test(me)) throw new Error('uid inválido');
  const col = (n) => FS.collection(db, n);
  const pairRef = (o) => FS.doc(db, 'friendships', pairId(me, o));
  const profRef = (u) => FS.doc(db, 'profiles', u);
  const codeRef = (c) => FS.doc(db, 'codes', c);
  const PAGE = 200;
  const pairsQ = () => FS.query(col('friendships'), FS.where('m', 'array-contains', me)); // a escuta ao vivo
  // Leitura única: o limit faz dela OUTRA consulta. Sem ele, o SDK reaproveita a escuta aberta da mesma consulta e devolve a visão que ela
  // tem agora, que pode estar um instante atrasada em relação ao servidor (e uma decisão como "já existe um pedido?" não pode errar assim).
  const pairsOnce = () => FS.query(col('friendships'), FS.where('m', 'array-contains', me), FS.limit(PAGE));
  const codesQ = () => FS.query(col('codes'), FS.where('uid', '==', me));
  // Gravação atômica que NÃO espera na fila: sem internet ela falha na hora e nada muda. (Um lote entraria na fila do SDK e só sairia depois,
  // quando a tela já tivesse dito que não deu.) Usada onde "tudo ou nada" é a promessa: trocar de código e sair dos amigos.
  const atomic = (fn) => FS.runTransaction(db, async (tx) => { fn(tx); });

  // Cópia do aparelho: primeira pintura e uso sem internet. Só vale para a conta que a gravou (se o login mudou, ela não é desta conta)
  const saved = cleanState(opt.cache), cache = saved.uid === me ? saved : cleanState(null);
  let st = { uid: me, ready: false, err: '', code: cache.code, friends: cache.friends, reqIn: cache.reqIn, reqOut: cache.reqOut, at: cache.at };
  let pairs = {};          // outro uid → documento da amizade (bruto)
  let profs = {};          // outro uid → perfil bruto | null (não publicou) ; ausente = ainda carregando
  let profOff = {};        // outro uid → cancela a escuta do perfil
  let pairOff = null, listening = false, started = false, leaving = false;
  const idle = () => { if (leaving) throw err('busy'); }; // enquanto sai dos amigos, nenhuma outra gravação passa na frente
  let profTry = {}, profTimer = {}; // outro uid → tentativas / temporizador da nova tentativa da escuta do perfil
  let hooks = {}, subs = [], emitT = 0, pubT = 0, retryT = 0, retryN = 0, waiters = [];
  let lastPub = null, card = null; // lastPub: último perfil enviado; card: meu nome e mascote (vão nos pedidos e no convite)
  const cached = {};       // uid → perfil de reserva (da cópia do aparelho)
  cache.friends.forEach((f) => { cached[f.uid] = profileOfCached(f); });

  /* ---------- estado ---------- */
  function emit() {
    clearTimeout(emitT);
    emitT = setTimeout(() => { subs.slice().forEach((fn) => { try { fn(st); } catch (e) { /* um ouvinte ruim não derruba os outros */ } }); }, 40);
  }
  function set(patch) { st = Object.assign({}, st, patch); emit(); }
  function rebuild() {
    const friends = [], reqIn = [], reqOut = [];
    Object.keys(pairs).forEach((o) => {
      const p = pairs[o];
      if (p.st === 'active') {
        const c = cleanFriend(o, o in profs ? profs[o] : cached[o], p, me);
        if (c) friends.push(c);
      } else if (p.st === 'pending') {
        const r = cleanRequest(o, p, me);
        if (r) (r.mine ? reqOut : reqIn).push(r);
      }
    });
    friends.sort(byName);
    reqIn.sort((a, b) => b.at - a.at); reqOut.sort((a, b) => b.at - a.at);
    set({ friends: friends.slice(0, MAX_FRIENDS), reqIn: reqIn.slice(0, MAX_FRIENDS), reqOut: reqOut.slice(0, MAX_FRIENDS), at: Date.now() });
  }
  function readPairs(snap) {
    const next = {};
    snap.forEach((d) => {
      const x = d.data(), o = x && Array.isArray(x.m) && x.m.length === 2 ? otherOf(x.m, me) : ''; // uma amizade tem exatamente dois membros
      if (!UID_RE.test(o) || d.id !== pairId(me, o)) return; // documento que não é uma amizade minha de verdade: ignora
      next[o] = x;
    });
    pairs = next;
  }
  const activeIds = () => Object.keys(pairs).filter((o) => pairs[o].st === 'active');
  const outCount = () => Object.keys(pairs).filter((o) => pairs[o].st === 'pending' && pairs[o].by === me).length;

  // Espera a primeira resposta da nuvem (ou desiste depois de ms, para a tela nunca ficar travada sem internet)
  function whenReady(ms) {
    if (st.ready) return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(res, ms), done = () => { clearTimeout(t); res(); };
      waiters.push(done);
    });
  }
  const ready = (patch) => { st = Object.assign({}, st, patch, { ready: true }); waiters.splice(0).forEach((f) => { f(); }); };

  /* ---------- escuta ao vivo ---------- */
  function clearProfile(o) {
    if (profOff[o]) { profOff[o](); delete profOff[o]; }
    clearTimeout(profTimer[o]); delete profTimer[o]; delete profTry[o];
  }
  // A escuta do perfil de um amigo pode ser recusada por um instante (ex.: logo depois de aceitar, o servidor ainda não registrou o aceite).
  // Em vez de ficar sem o perfil dele até o app reabrir, tenta de novo com espera crescente; sai quando a amizade acaba.
  function retryProfile(o) {
    if (profTimer[o] || !listening) return;
    const n = profTry[o] = (profTry[o] || 0) + 1;
    profTimer[o] = setTimeout(() => { delete profTimer[o]; if (listening) syncProfiles(); }, RETRY_PROFILE[Math.min(n - 1, RETRY_PROFILE.length - 1)]);
  }
  function syncProfiles() {
    Object.keys(profOff).concat(Object.keys(profTimer)).forEach((o) => { if (!pairs[o] || pairs[o].st !== 'active') { clearProfile(o); delete profs[o]; } });
    activeIds().forEach((o) => {
      if (profOff[o]) return;
      profOff[o] = FS.onSnapshot(profRef(o), (s) => { delete profTry[o]; profs[o] = s.exists() ? s.data() : null; rebuild(); },
        () => { // recusa: fica só com o que a amizade sabe e tenta de novo daqui a pouco
          if (profOff[o]) { profOff[o](); delete profOff[o]; }
          profs[o] = null; rebuild(); retryProfile(o);
        });
    });
  }
  function listen() {
    if (listening) return;
    listening = true;
    pairOff = FS.onSnapshot(pairsQ(), (snap) => {
      retryN = 0; clearTimeout(retryT);
      readPairs(snap);
      syncProfiles();
      ready({ err: '' });
      rebuild();
    }, (e) => {
      listening = false; pairOff = null;
      Object.keys(profOff).concat(Object.keys(profTimer)).forEach(clearProfile);
      ready({ err: mapErr(e).code }); emit();
      clearTimeout(retryT);
      if (started) retryT = setTimeout(listen, RETRY[Math.min(retryN++, RETRY.length - 1)]);
    });
  }
  function start(h) {
    if (leaving) return; // saindo: nada de voltar a escutar no meio
    hooks = h || hooks;
    started = true;
    listen();
  }
  function stop() {
    started = false; listening = false;
    clearTimeout(retryT); clearTimeout(pubT);
    if (pairOff) { pairOff(); pairOff = null; }
    Object.keys(profOff).concat(Object.keys(profTimer)).forEach(clearProfile);
  }
  // Atualiza agora. Com a escuta ligada ela já mantém tudo em dia (só espera a primeira resposta); sem ela (não ligada, ou caiu),
  // lê direto do servidor, uma vez. As duas fontes nunca se misturam: assim uma leitura atrasada não desfaz uma novidade da escuta.
  async function refresh() {
    if (listening) { await whenReady(4000); return st; }
    let snap;
    // sem escuta aberta não há visão antiga para reaproveitar: lê a consulta inteira (o limite da página cortaria uma enxurrada)
    try { snap = await FS.getDocsFromServer(pairsQ()); } catch (e) { const m = mapErr(e); ready({ err: m.code }); emit(); throw m; }
    readPairs(snap);
    await Promise.all(activeIds().map((o) => FS.getDocFromServer(profRef(o)).then((s) => { profs[o] = s.exists() ? s.data() : null; }, noop)));
    ready({ err: '' });
    if (started && !listening) { retryN = 0; listen(); }
    rebuild();
    return st;
  }

  /* ---------- meu perfil e meu convite ---------- */
  // Convites: um por vez vale. Trocar de código REVOGA o antigo (rv: true) em vez de apagá-lo: o identificador fica ocupado para sempre,
  // então ninguém consegue recriar o código antigo com outro dono e se passar por quem trocou (as regras impedem; ver firestore.rules).
  async function myCodes() {
    const snap = await FS.getDocsFromServer(codesQ()), out = [];
    snap.forEach((d) => { if (validCode(d.id)) { const x = d.data(); out.push({ id: d.id, nm: x.nm, mc: x.mc, rv: x.rv === true }); } });
    return out;
  }
  const liveCodes = async () => (await myCodes()).filter((x) => !x.rv);
  // Nenhum documento público leva horário (nem o perfil nem o convite): quem tem o código ou é amigo não fica sabendo quando você abre o app
  const codeDoc = (p) => ({ uid: me, nm: p.nm, mc: p.mc });
  const revokeCode = (id) => FS.updateDoc(codeRef(id), { rv: true });
  // Acerta nome e mascote do convite. Só ATUALIZA o que já existe e é meu: nunca cria nem reabre um código (um código trocado em outra
  // aba ou aparelho continua trocado). false = o convite já não existe/não é mais meu.
  async function syncCode(id, p) {
    try { await FS.updateDoc(codeRef(id), { nm: p.nm, mc: p.mc }); return true; }
    catch (e) { if (gone(e)) return false; throw mapErr(e); }
  }
  // Cria um código novo. Se o sorteio cair num código que já é de outra pessoa, o servidor recusa (não é um update meu): sorteia de novo.
  async function createCode(p) {
    for (let i = 0; i < 6; i++) {
      const c = genCode(rand);
      try { await FS.setDoc(codeRef(c), codeDoc(p)); return c; } catch (e) { if (!(e && e.code === 'permission-denied')) throw mapErr(e); }
    }
    throw err('rules');
  }
  // Garante UM código meu: reaproveita o que já vale (o sugerido, senão um qualquer, sempre o mesmo), revoga as sobras e mantém nome e mascote em dia
  async function ensureCode(p, hint) {
    let mine;
    try { mine = await liveCodes(); } catch (e) { throw mapErr(e); }
    if (!mine.length) return createCode(p);
    mine.sort((a, b) => (a.id === hint ? -1 : b.id === hint ? 1 : a.id < b.id ? -1 : 1));
    const keep = mine[0];
    await Promise.all(mine.slice(1).map((x) => revokeCode(x.id).catch(noop)));
    if ((keep.nm !== p.nm || keep.mc !== p.mc) && !(await syncCode(keep.id, p))) return createCode(p); // sumiu no meio do caminho: cria outro
    return keep.id;
  }
  // Grava o perfil. O site sai sozinho em cerca de 1 minuto e as regras do Firestore vão à parte: se o site novo chegar antes delas, o perfil com
  // "gl" e "wm" (1.2.0) é recusado. Então tenta de novo no formato da 1.1.x, que as regras de antes e as de agora aceitam: os amigos seguem
  // funcionando (só sem a meta em ml e sem os 7 dias) até as regras novas entrarem, e a próxima abertura do app já publica o perfil completo.
  async function putProfile(p) {
    try { await FS.setDoc(profRef(me), p); } catch (e) {
      if (!e || e.code !== 'permission-denied' || !('gl' in p || 'wm' in p)) throw e;
      const old = Object.assign({}, p);
      delete old.gl; delete old.wm;
      await FS.setDoc(profRef(me), old);
    }
  }
  // Envia o perfil que os amigos veem (só se mudou). payload vem de social.profilePayload. Nome e mascote também vão para o convite.
  async function publish(p, force) {
    if (!p || leaving) return false;
    if (!force && lastPub && samePayload(lastPub, p)) return false;
    const prev = lastPub, before = card;
    lastPub = p; card = { nm: p.nm, mc: p.mc };
    try {
      await putProfile(p);
      // O convite só é tocado quando nome ou mascote MUDAM (no primeiro envio da sessão, quem acerta o convite é o join, via ensureCode):
      // uma gravação a cada abertura do app mostraria a quem tem o código quando você aparece.
      if (st.code && before && (before.nm !== p.nm || before.mc !== p.mc)) await syncCode(st.code, p);
    } catch (e) { lastPub = prev; card = before; throw mapErr(e); }
    return true;
  }
  // Agenda o envio do perfil para daqui a pouco (junta várias mudanças seguidas). Quem muda o app chama touch().
  function touch() { clearTimeout(pubT); pubT = setTimeout(() => { flush().catch(noop); }, 1200); }
  async function flush() {
    clearTimeout(pubT); pubT = 0;
    const p = hooks.payload ? hooks.payload() : null;
    if (!p) return false;
    try { return await publish(p); } catch (e) { if (e.code === 'rules') set({ err: 'rules' }); throw e; }
  }
  // Primeira vez (ou voltando): publica o perfil e garante o código de convite. Devolve o código.
  async function join(o) {
    idle();
    const p = o && o.payload;
    if (!p) throw err('bad');
    await publish(p, true);
    const c = await ensureCode(p, o.code || st.code);
    set({ code: c });
    return c;
  }
  // Troca o código de convite (quem tinha o antigo não consegue mais usar). Cria o novo e revoga os antigos numa gravação só: ou acontece
  // tudo ou nada (nunca fica com os dois valendo nem sem nenhum). Se falhar, o antigo continua valendo e o erro chega à tela. Devolve o novo.
  async function newCode() {
    idle();
    if (!card) throw err('notjoined');
    for (let i = 0; i < 6; i++) {
      let old;
      try { old = await liveCodes(); } catch (e) { throw mapErr(e); } // lê de novo a cada volta: o que mudou no meio do caminho entra na conta
      const c = genCode(rand);
      if (old.some((x) => x.id === c)) continue;
      try {
        await atomic((tx) => {
          tx.set(codeRef(c), codeDoc(card));
          old.forEach((x) => { tx.update(codeRef(x.id), { rv: true }); });
        });
      } catch (e) {
        if (e && e.code === 'permission-denied') continue; // o sorteio caiu num código de outra pessoa, ou um código antigo já tinha sumido: de novo
        throw mapErr(e);
      }
      set({ code: c });
      return c;
    }
    throw err('rules');
  }

  /* ---------- pedidos ---------- */
  // Quem é o dono do código: { code, uid, nm, mc, self } ou null (não existe, ou foi revogado). Só nome e mascote: nada mais é público.
  async function lookup(raw) {
    const code = normCode(raw);
    if (!validCode(code)) return null;
    let s;
    try { s = await FS.getDocFromServer(codeRef(code)); } catch (e) { throw mapErr(e); }
    return s.exists() ? cleanInvite(code, s.data(), me) : null;
  }
  // O que existe agora entre mim e o outro (do servidor): documento da amizade ou null. A leitura direta de um documento que não existe
  // é recusada pelas regras, por isso a consulta "amizades em que estou".
  async function pairNow(o) {
    let snap;
    try { snap = await FS.getDocsFromServer(pairsOnce()); } catch (e) { throw mapErr(e); }
    const id = pairId(me, o);
    let found = null;
    snap.forEach((d) => { if (d.id === id) found = d.data(); });
    if (found || snap.size < PAGE) return found;
    // A página veio cheia (uma enxurrada de pedidos, por exemplo): o documento pode estar depois dela. A leitura direta acha; se não existe, é recusada.
    try { const one = await FS.getDocFromServer(pairRef(o)); return one.exists() ? one.data() : null; }
    catch (e) { if (gone(e)) return null; throw mapErr(e); }
  }
  // Pede amizade a quem tem o código. Se a pessoa JÁ tinha me convidado, os dois querem: vira amizade na hora (kind 'accepted').
  async function request(raw) {
    idle();
    if (!card) throw err('notjoined');
    const who = await lookup(raw);
    if (!who) throw err('notfound');
    if (who.self) throw err('self', { who: who });
    const o = who.uid;
    for (let tries = 0; tries < 2; tries++) {
      const cur = await pairNow(o);
      if (cur) {
        if (cur.st === 'active') throw err('exists', { who: who });
        if (cur.by === me) throw err('pending', { who: who });
        await acceptFrom(o, true);
        return { kind: 'accepted', uid: o, nm: who.nm, mc: who.mc };
      }
      if (activeIds().length + outCount() >= MAX_FRIENDS) throw err('full');
      try {
        // "cd": o código de convite usado. As regras só aceitam o pedido se esse código ainda valer e for de quem vai receber.
        await FS.setDoc(pairRef(o), { m: pairId(me, o).split('_'), by: me, st: 'pending', nm: card.nm, mc: card.mc, tn: who.nm, tc: who.mc, cd: who.code, at: FS.serverTimestamp() });
        return { kind: 'sent', uid: o, nm: who.nm, mc: who.mc };
      } catch (e) {
        const denied = !!e && e.code === 'permission-denied';
        // Corrida: a outra pessoa pediu no mesmo instante e o documento já existe (vira "atualização", que as regras recusam).
        // Olha de novo uma vez: agora o pedido dela aparece e o caminho acima aceita.
        if (denied && !tries) continue;
        // Recusado de novo: se a pessoa trocou o código no meio do caminho, o convite deixou de valer ("não encontrei"). Não é falha das regras.
        if (denied && (await lookup(who.code).then((w) => !w, () => false))) throw err('notfound');
        throw mapErr(e);
      }
    }
    throw err('unknown');
  }
  // Aceita o pedido de o. Só recusa de antemão o que se SABE inválido (o pedido é meu); no resto o servidor decide, porque o estado
  // daqui pode estar atrasado (ex.: logo depois de abrir o app, antes da primeira resposta da nuvem).
  async function acceptFrom(o, known) {
    idle();
    if (!UID_RE.test(String(o))) throw err('bad');
    const p = pairs[o];
    if (p && !known && (p.st !== 'pending' || p.by === me)) throw err('gone');
    if (activeIds().length >= MAX_FRIENDS) throw err('full');
    try { await FS.updateDoc(pairRef(o), { st: 'active', ok: FS.serverTimestamp() }); } catch (e) {
      const m = mapErr(e);
      if (m.code === 'rules' || m.code === 'gone') { // recusa ou "não existe": vê o que há de verdade antes de responder
        let cur;
        try { cur = await pairNow(o); } catch (e2) { throw m; }
        if (!cur) throw err('gone');
        if (cur.st === 'active') return; // já era amizade: está feito
      }
      throw m;
    }
  }
  const accept = (o) => acceptFrom(o, false);
  // Recusar um pedido, cancelar o que eu mandei e desfazer uma amizade são a mesma coisa: apagar o documento da amizade.
  async function drop(o) {
    idle();
    if (!UID_RE.test(String(o))) throw err('bad');
    try { await FS.deleteDoc(pairRef(o)); } catch (e) {
      // Apagar o que já não existe também é "feito", mas as regras respondem com recusa em vez de "não encontrado": confere.
      if (e && e.code === 'permission-denied') {
        let cur;
        try { cur = await pairNow(o); } catch (e2) { throw mapErr(e); }
        if (cur === null) return;
      }
      throw mapErr(e);
    }
  }
  // Apaga vários documentos de amizade: num lote só e, se um deles tiver sumido no meio do caminho (o outro lado desfez agora mesmo),
  // um por um. Sem isso, um único documento a menos faria o lote inteiro falhar.
  async function dropAll(refs) {
    if (!refs.length) return;
    try {
      const b = FS.writeBatch(db);
      refs.forEach((r) => { b.delete(r); });
      await b.commit();
      return;
    } catch (e) { if (!(e && e.code === 'permission-denied')) throw mapErr(e); }
    for (let i = 0; i < refs.length; i += 10) {
      await Promise.all(refs.slice(i, i + 10).map((r) => FS.deleteDoc(r).catch((e) => { if (!gone(e)) throw mapErr(e); })));
    }
  }
  // Recusa de uma vez todos os pedidos que recebi (arrumar a casa depois de um convite espalhado demais). Devolve quantos eram.
  // Em lotes de PAGE: um lote do Firestore aceita no máximo 500 gravações, e uma enxurrada pode ter mais pedidos que isso.
  async function declineAll() {
    idle();
    // A tela pode mostrar os pedidos da cópia do aparelho antes da primeira resposta da nuvem: sem ela, não há o que recusar de verdade
    if (!st.ready) { await refresh(); if (!st.ready) throw err('offline'); }
    const ids = Object.keys(pairs).filter((o) => pairs[o].st === 'pending' && pairs[o].by !== me);
    for (let i = 0; i < ids.length; i += PAGE) await dropAll(ids.slice(i, i + PAGE).map((o) => pairRef(o)));
    return ids.length;
  }

  /* ---------- acenos ---------- */
  async function wave(o, kind, day) {
    idle();
    if (WAVE_KINDS.indexOf(kind) < 0 || !DAY_RE.test(String(day)) || !UID_RE.test(String(o))) throw err('bad');
    const p = pairs[o];
    if (p && p.st !== 'active') throw err('gone');
    try { await FS.updateDoc(pairRef(o), new FS.FieldPath('w', me), { k: kind, d: day, at: FS.serverTimestamp() }); } catch (e) {
      const m = mapErr(e);
      if (m.code !== 'rules') throw m;
      // As regras recusam o 2º aceno em menos de 10 min, mas também recusam quando a amizade acabou: confere qual dos dois é
      let cur;
      try { cur = await pairNow(o); } catch (e2) { throw err('wave'); }
      throw !cur || cur.st !== 'active' ? err('gone') : err('wave');
    }
  }

  /* ---------- sair ---------- */
  // Apaga tudo o que é meu nos amigos: perfil, convites e todas as amizades e pedidos (os outros veem a amizade acabar).
  // TUDO OU NADA: a parte que importa (perfil + convites + as últimas amizades) vai numa transação só, que não entra na fila do SDK:
  // sem internet ela falha na hora e NADA muda (o perfil continua como estava e a tela pode dizer a verdade: "não apaguei nada").
  // Só uma enxurrada de mais de 200 amizades precisa de várias gravações; nesse caso as amizades saem primeiro, e perfil e convites por
  // último, então uma falha no meio deixa a pessoa nos amigos, só com menos amizades (um estado válido), nunca sem perfil e sem convite.
  // A saída nunca continua em segundo plano: depois de LEAVE_MS nenhuma etapa nova começa, e cada etapa tem tempo limitado.
  async function leaveNow() {
    stop();
    hooks = {}; leaving = true; // um envio agendado ou atrasado não pode recriar o perfil que está sendo apagado
    const until = Date.now() + LEAVE_MS, time = () => { if (Date.now() > until) throw err('offline'); };
    try {
      time();
      const codes = await FS.getDocsFromServer(codesQ());
      for (let round = 0, tries = 0; ;) {
        time();
        const ps = await FS.getDocsFromServer(pairsOnce());
        const last = ps.size < PAGE; // cabe tudo numa gravação só (até 200 amizades + perfil + convites)
        time();
        try {
          await atomic((tx) => {
            ps.docs.forEach((d) => { tx.delete(d.ref); });
            if (last) {
              tx.delete(profRef(me));
              codes.docs.forEach((d) => { tx.update(d.ref, { nm: '-', mc: '-', rv: true }); });
            }
          });
        } catch (e) {
          // Uma amizade que sumiu entre a leitura e a gravação (o outro lado desfez agora) é recusada pelas regras e derruba a transação
          // inteira: lê de novo e repete. Se continuar recusando, são as regras de verdade e o erro chega à tela.
          if (e && e.code === 'permission-denied' && ++tries < 4) continue;
          throw e;
        }
        tries = 0;
        if (last) break;
        if (++round >= 25) throw err('unknown');
      }
    } catch (e) { throw mapErr(e); } finally { leaving = false; }
    pairs = {}; profs = {}; lastPub = null; card = null;
    st = { uid: me, ready: false, err: '', code: '', friends: [], reqIn: [], reqOut: [], at: 0 };
    emit();
  }
  // Pedir para sair de novo enquanto a saída ainda corre (a tela desistiu de esperar e a pessoa tocou outra vez) não começa uma segunda
  // saída por cima da primeira: as duas chamadas esperam a mesma, que termina uma vez só.
  let leaveP = null;
  function leave() {
    if (!leaveP) leaveP = leaveNow().then((v) => { leaveP = null; return v; }, (e) => { leaveP = null; throw e; });
    return leaveP;
  }

  return {
    me: me,
    state: () => st,
    on: (fn) => { subs.push(fn); return () => { subs = subs.filter((x) => x !== fn); }; },
    start: start, stop: stop, refresh: refresh,
    join: join, publish: publish, touch: touch, flush: flush, newCode: newCode,
    lookup: lookup, request: request, accept: accept, decline: drop, cancel: drop, remove: drop, declineAll: declineAll,
    wave: wave, leave: leave,
  };
}
