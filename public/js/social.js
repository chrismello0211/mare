// Maré — amigos: lógica pura (sem DOM e sem Firebase). Coberta por tests/social.test.js.
// Princípios: só amigos aprovados veem o perfil; nada de ranking nem de volumes (só % da meta, no máximo 100, e sequência);
// e tudo o que vem da nuvem passa por cleanFriend() antes de chegar à tela (um amigo mal-intencionado não pode quebrar o app).
import { INSIGNIAS, insigniaById, addDays, keyToDate, goalToday, dayTotal, isMet, streak, mascotOf, unlockedInsignias } from './core.js';

export const MAX_FRIENDS = 30; // limite combinado no app (as regras do servidor não contam documentos)
export const NICK_MAX = 20;
export const CODE_LEN = 8;
// Alfabeto do código: sem I, L, O, 0 e 1, que se confundem na hora de digitar ou ler em voz alta (31 símbolos, ~40 bits)
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export const UID_RE = /^[A-Za-z0-9]{10,64}$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const WAVE_KINDS = ['hi', 'cheer'];

/* ---------- código de convite ---------- */
function cryptoRand() {
  try {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; }
  } catch (e) { /* cai no Math.random */ }
  return Math.random();
}
export function genCode(rand) {
  const r = rand || cryptoRand;
  let s = '';
  while (s.length < CODE_LEN) s += CODE_CHARS.charAt(Math.min(CODE_CHARS.length - 1, Math.floor(r() * CODE_CHARS.length)));
  return s;
}
// Aceita "abcd-efgh", " ABCD EFGH " e afins. Devolve o código em maiúsculas, sem traço (pode ainda ser inválido: use validCode)
export const normCode = (s) => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
export const validCode = (c) => CODE_RE.test(String(c));
export const fmtCode = (c) => (validCode(c) ? c.slice(0, 4) + '-' + c.slice(4) : String(c || ''));
// Código vindo do endereço (?amigo=ABCD-EFGH). '' se não houver ou for inválido
export function codeFromURL(search) {
  const m = /[?&]amigo=([^&#]*)/.exec(String(search || ''));
  if (!m) return '';
  let v = m[1];
  try { v = decodeURIComponent(v); } catch (e) { /* usa como veio */ }
  const c = normCode(v);
  return validCode(c) ? c : '';
}
export const inviteLink = (base, code) => String(base).split(/[?#]/)[0] + '?amigo=' + code;

/* ---------- nomes e pares ---------- */
// Caracteres que não se enxergam ou que mudam o sentido da leitura: largura zero, marcas e "override" de direção, BOM, hífen suave,
// enchimentos (Hangul, Braille em branco), seletores de variação (menos o FE0F, do emoji), "etiquetas" e formatadores invisíveis.
// Ficam de fora do nome, senão dá para se passar por outra pessoa ou esconder o nome. A lista explícita deixa claro o que sai; FORMAT
// (\p{Cf}, que iOS 12 e Chrome 70 entendem) pega os formatadores de qualquer outra escrita que a lista não cite.
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0E\uFEFF\uFFA0\uFFF9-\uFFFB]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC00-\uDDEF]/g;
const FORMAT = /[\p{Cf}]/gu; // (entre colchetes de propósito: é a mesma coisa, e o guarda de compatibilidade do esbuild só reescreve o \p{} solto)
// Marcas combinantes empilhadas ("texto zalgo", letras altíssimas que invadem a tela): no máximo 2 em seguida; só marcas e espaços não é nome.
// Valem as marcas que não ocupam espaço (\p{Mn}: acentos de qualquer escrita, inclusive os de hebraico, árabe e cirílico) e as que cercam a
// letra (\p{Me}). As que ocupam espaço (\p{Mc}, como as vogais do devanágari) não empilham e ficam.
const MARK = /[\p{Mn}\p{Me}]/u;
const NO_NAME = /^[\s\p{Mn}\p{Me}]*$/u;
function capMarks(t, n) {
  let run = 0;
  return Array.from(t).filter((ch) => { if (MARK.test(ch)) { run++; return run <= n; } run = 0; return true; }).join('');
}
// Nome que os amigos veem: sem controles nem < >, espaços simples, até NICK_MAX caracteres (sem cortar emoji no meio). Vazio se não sobrar nada visível.
function tidy(v, max) {
  // controles (C0, DEL e C1, que alguns navegadores desenham como nada), < > e invisíveis saem; depois as marcas empilhadas e os espaços
  const t = capMarks(String(v).replace(/\s/g, ' ').replace(/[\u0000-\u001F\u007F-\u009F<>]/g, '').replace(INVISIBLE, '').replace(FORMAT, '').replace(/ +/g, ' ').trim(), 2);
  return NO_NAME.test(t) ? '' : Array.from(t).slice(0, max).join('').trim();
}
// Carimbo de hora do Firestore (Timestamp) ou número em ms, em ms. Qualquer outra coisa (inclusive um "toMillis" que não é função) vale 0.
export const tsMs = (t) => (t && typeof t.toMillis === 'function' ? +t.toMillis() || 0 : typeof t === 'number' && isFinite(t) ? t : 0);
export function cleanNick(s) { return tidy(s == null ? '' : s, NICK_MAX); }
// O mesmo id para os dois lados de uma amizade; as regras do servidor calculam igual. Compara em minúsculas: os ids do login
// misturam maiúsculas e minúsculas e assim a ordem não depende de como o servidor ordena letras de caixas diferentes.
export const pairId = (a, b) => {
  const x = String(a).toLowerCase(), y = String(b).toLowerCase();
  return (x < y || (x === y && a < b) ? a + '_' + b : b + '_' + a);
};
export const otherOf = (m, me) => (Array.isArray(m) ? m.filter((x) => x !== me)[0] || '' : '');

/* ---------- o que vai para a nuvem ---------- */
// Só isto sai do aparelho: nome escolhido, mascote, insígnias, % da meta de hoje (0–100), se bateu a meta e a sequência.
// Sem peso, sem meta em ml, sem volumes, sem horários, sem localização. share = false esconde o progresso (só nome e insígnias).
export function profilePayload(S, k) {
  // A meta é a do dia (a mesma da tela e de isMet); sem registro do dia, a de hoje pelas configurações
  const sc = S.social || {}, share = sc.share !== false, day = S.days[k], goal = (day && day.goal) || goalToday(S, k) || 2000, total = dayTotal(day);
  return {
    v: 1,
    nm: cleanNick(sc.nick) || 'Amigo',
    mc: mascotOf(S).id,
    ins: unlockedInsignias(S).map((x) => x.id),
    pct: share ? Math.max(0, Math.min(100, Math.floor((total / goal) * 100))) : null,
    met: share ? isMet(S.days[k]) : false,
    st: share ? Math.min(9999, streak(S.days, k)) : 0,
    day: k,
    sh: share,
  };
}
export function samePayload(a, b) {
  if (!a || !b) return false;
  return a.nm === b.nm && a.mc === b.mc && a.pct === b.pct && a.met === b.met && a.st === b.st && a.day === b.day && a.sh === b.sh &&
    (a.ins || []).join(',') === (b.ins || []).join(',');
}

/* ---------- o que chega da nuvem (nunca confiar) ---------- */
const int = (v, lo, hi) => { const n = Math.floor(+v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
const str = (v, max) => (typeof v === 'string' ? tidy(v, max) : '');
const mascotId = (v) => { const x = insigniaById(typeof v === 'string' ? v : ''); return x ? x.id : INSIGNIAS[0].id; };
const dayOk = (v) => (typeof v === 'string' && DAY_RE.test(v) ? v : '');
const waveOf = (w) => (w && typeof w === 'object' && WAVE_KINDS.indexOf(w.k) >= 0 && dayOk(w.d) ? { k: w.k, d: w.d } : null);
// Um amigo: perfil (profiles/{uid}) + dados da amizade (friendships/{par}). Qualquer parte pode faltar. me = meu uid
export function cleanFriend(uid, prof, pair, me) {
  if (!UID_RE.test(String(uid))) return null;
  const p = prof && typeof prof === 'object' ? prof : {}, q = pair && typeof pair === 'object' ? pair : {};
  const w = q.w && typeof q.w === 'object' ? q.w : {}, ms = tsMs;
  const fromReq = q.by === uid; // se ele fez o pedido, o nome de reserva é o do pedido; senão, o do convite
  const nm = str(p.nm, NICK_MAX) || str(fromReq ? q.nm : q.tn, NICK_MAX) || 'Amigo';
  const ins = Array.isArray(p.ins) ? INSIGNIAS.filter((x) => p.ins.indexOf(x.id) >= 0).map((x) => x.id) : [];
  return {
    uid: uid, nm: nm, mc: mascotId(p.mc || (fromReq ? q.mc : q.tc)), ins: ins,
    pct: p.pct == null ? null : int(p.pct, 0, 100), met: p.met === true, st: int(p.st, 0, 9999), day: dayOk(p.day), sh: p.sh !== false,
    since: ms(q.ok) || ms(q.at),
    mine: waveOf(w[String(me || '')]), theirs: waveOf(w[uid]), // mine: o aceno que eu mandei; theirs: o que ele mandou
  };
}
// Pedido (pendente) de amizade. mine = true quando fui eu quem pediu
export function cleanRequest(uid, pair, me) {
  if (!UID_RE.test(String(uid)) || !pair) return null;
  const mine = pair.by === me;
  return { uid: uid, mine: mine, nm: str(mine ? pair.tn : pair.nm, NICK_MAX) || 'Amigo', mc: mascotId(mine ? pair.tc : pair.mc),
    at: tsMs(pair.at) };
}

// Convite lido de codes/{código}: quem convidou (nome e mascote) e se sou eu mesmo. null se não for um convite de verdade ou se foi
// revogado (rv: o dono trocou o código ou saiu dos amigos): para quem procura, é como se nunca tivesse existido.
export function cleanInvite(code, raw, me) {
  if (!validCode(code) || !raw || typeof raw !== 'object' || raw.rv === true || !UID_RE.test(String(raw.uid))) return null;
  return { code: code, uid: raw.uid, nm: str(raw.nm, NICK_MAX) || 'Amigo', mc: mascotId(raw.mc), self: raw.uid === me };
}
// Perfil "de reserva" montado a partir da cópia guardada no aparelho: enquanto o perfil novo não chega da nuvem, a tela continua
// mostrando o que já se sabia do amigo, em vez de piscar em branco.
export function profileOfCached(f) {
  return f ? { nm: f.nm, mc: f.mc, ins: f.ins, pct: f.pct, met: f.met, st: f.st, day: f.day, sh: f.sh } : null;
}

/* ---------- leitura do estado de um amigo ---------- */
export function daysBetween(a, b) {
  if (!DAY_RE.test(String(a)) || !DAY_RE.test(String(b))) return 99;
  const n = Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 864e5);
  return isFinite(n) ? Math.max(0, n) : 99;
}
// today = o dia de quem olha. Quem está uma casa de fuso à frente (day > today) conta como "hoje"; mais que isso (nem o fuso explica:
// 2 dias ou mais) é um dia que ainda nem chegou: dado inventado, que não vale como "hoje para sempre".
const ahead = (d, today) => DAY_RE.test(String(d)) && DAY_RE.test(String(today)) && daysBetween(today, d) > 2;
export function liveOf(p, today) {
  // sem perfil publicado (ainda), ou com um dia que ainda nem chegou: nada a mostrar, e não conta como "ausente"
  if (!p || !p.day || ahead(p.day, today)) return { kind: 'unknown', pct: 0, st: 0, away: 99 };
  const away = daysBetween(p.day, today), st = away <= 1 ? p.st || 0 : 0;
  if (p.sh === false) return { kind: 'paused', pct: 0, st: 0, away: away };
  if (away > 0) return { kind: 'away', pct: 0, st: st, away: away };
  if (p.met) return { kind: 'met', pct: 100, st: st, away: 0 };
  const pct = p.pct || 0;
  return { kind: pct > 0 ? 'going' : 'idle', pct: pct, st: st, away: 0 };
}
export function statusText(l) {
  if (l.kind === 'met') return 'Meta batida hoje\u00A0🎉'; // espaço que não quebra: em telas estreitas o emoji não fica sozinho na linha
  if (l.kind === 'going') return l.pct + '% da meta de hoje';
  if (l.kind === 'idle') return 'Ainda sem registros hoje';
  if (l.kind === 'paused') return 'Progresso do dia em pausa';
  if (l.kind === 'away') return l.away === 1 ? 'Esteve por aqui ontem' : l.away <= 30 ? 'Sem novidades há ' + l.away + ' dias' : 'Sem novidades há mais de um mês';
  if (l.kind === 'unknown') return 'Ainda sem novidades';
  return '';
}
// Ordem neutra (alfabética): a lista não vira ranking
export const byName = (a, b) => String(a.nm).toLowerCase().localeCompare(String(b.nm).toLowerCase(), 'pt-BR') || (a.uid < b.uid ? -1 : 1);

// Resumo da turma, contando comigo. Só entram os amigos que mostram o progresso e apareceram nos últimos 3 dias.
// Texto sempre positivo: sem placar, sem "fulano está na frente".
export function turma(me, lives) {
  const act = lives.filter((l) => l.kind !== 'paused' && l.kind !== 'unknown' && l.away <= 3);
  const total = act.length + 1, met = act.filter((l) => l.kind === 'met').length + (me.kind === 'met' ? 1 : 0);
  if (!act.length) return { kind: 'quiet', met: met, total: total, text: 'Sua turma está quieta por enquanto', sub: 'Que tal acenar para alguém?' };
  if (met === total) return { kind: 'all', met: met, total: total, text: 'Turma completa!', sub: 'Todo mundo bateu a meta hoje. A maré está cheia\u00A0🌊' };
  if (!met) return { kind: 'none', met: met, total: total, text: 'A maré da turma está começando', sub: 'Cada gole conta. Quem abre o dia?' };
  return { kind: 'some', met: met, total: total, text: met + ' de ' + total + (met === 1 ? ' já bateu' : ' já bateram') + ' a meta hoje',
    sub: total - met === 1 ? 'Só falta 1 pessoa para a turma completa!' : 'Falta pouco para a turma completa!' };
}

/* ---------- acenos ---------- */
// Quem bateu a meta recebe um "parabéns"; os outros, um "oi". Um por amigo por dia (o servidor ainda limita a 1 a cada 10 min).
export function waveFor(f, today) {
  const kind = liveOf(f, today).kind === 'met' ? 'cheer' : 'hi';
  return { kind: kind, done: !!(f.mine && f.mine.d >= today && !ahead(f.mine.d, today)) };
}
// Aceno que ele me mandou hoje ou ontem. Um aceno de um dia que ainda nem chegou (2 dias ou mais à frente: nem o fuso explica) não vale:
// seria dado inventado, ou relógio errado, e ficaria "de hoje" até lá.
export function waveIn(f, today) { return f.theirs && f.theirs.d >= addDays(today, -1) && !ahead(f.theirs.d, today) ? f.theirs : null; }
export const WAVE_TEXT = { hi: 'acenou para você\u00A0👋', cheer: 'mandou parabéns pra você\u00A0🎉' };

/* ---------- peças da interface (puras, para testar sem navegador) ---------- */
// Meu próprio estado de hoje, calculado com os dados do aparelho mesmo quando o progresso está em pausa para os amigos
export function myLive(S, k) {
  const sc = S.social || {};
  return liveOf(profilePayload(Object.assign({}, S, { social: Object.assign({}, sc, { share: true }) }), k), k);
}
// Anel de progresso do avatar: pct = quanto do anel preenche (null = sem anel de progresso) e cls = a cor
export function ringOf(l) {
  if (l.kind === 'met') return { pct: 100, cls: 'met' };
  if (l.kind === 'going') return { pct: Math.max(1, Math.min(99, l.pct)), cls: 'go' };
  if (l.kind === 'idle') return { pct: 0, cls: 'idle' };
  return { pct: null, cls: 'off' };
}
// Apelido de partida para a tela de entrada: o primeiro nome da pessoa
export function firstNick(name) {
  return cleanNick(String(name == null ? '' : name).trim().split(/\s+/)[0]);
}
// Texto do convite (o link vai separado, no compartilhamento do aparelho)
export const inviteText = (code) => 'Vem beber água comigo no Maré! 💧 Me adicione pelo link' + (validCode(code) ? ' (ou use o código ' + fmtCode(code) + ')' : '') + ':';
// Acenos que eu ainda não vi: o aceno de hoje ou de ontem cuja chave (dia:tipo) ainda não está em seen = { uid: 'dia:tipo' }
export const waveKey = (w) => w.d + ':' + w.k;
export function unseenWaves(friends, seen, today) {
  const sn = seen && typeof seen === 'object' ? seen : {};
  return friends.filter((f) => { const w = waveIn(f, today); return !!w && sn[f.uid] !== waveKey(w); });
}
// O mapa "visto" depois de abrir a aba Amigos: todos os acenos de agora viram vistos (e só amigos de hoje ficam no mapa)
export function seenWaves(friends, today) {
  const o = {};
  friends.forEach((f) => { const w = waveIn(f, today); if (w) o[f.uid] = waveKey(w); });
  return o;
}
// O que mudou de um estado para o outro e merece aviso: quem aceitou um pedido meu e quem me pediu amizade agora
export function arrivals(prev, next) {
  const had = (list) => { const o = {}; (list || []).forEach((x) => { o[x.uid] = 1; }); return o; };
  const out = had(prev && prev.reqOut), inn = had(prev && prev.reqIn);
  return { accepted: next.friends.filter((f) => out[f.uid]), requests: next.reqIn.filter((r) => !inn[r.uid]) };
}
// Mensagens para a pessoa (nunca texto técnico). Chaves: os códigos de SocialError (social-cloud.js) mais off e slow, da tela
const ERR = {
  off: 'Os amigos precisam da nuvem do Maré, que não está disponível agora. Confira a internet e tente de novo.',
  slow: 'Está demorando mais que o normal. Confira sua conexão e tente de novo.',
  rules: 'Os amigos ainda não foram liberados no servidor do Maré. Tente de novo mais tarde.',
  offline: 'Sem conexão no momento. Tente de novo quando a internet voltar.',
  notfound: 'Não encontrei esse código. Confira se está certinho.',
  self: 'Esse é o seu próprio código 😄',
  exists: 'Vocês já são amigos!',
  pending: 'Você já enviou um pedido para essa pessoa. É só aguardar.',
  full: 'Você chegou ao limite de ' + MAX_FRIENDS + ' amigos.',
  gone: 'Essa amizade ou esse pedido não existe mais.',
  wave: 'Não deu para acenar agora. Tente de novo daqui a pouco.',
  notjoined: 'Ative os amigos primeiro.',
  bad: 'Algo deu errado. Tente de novo.',
  auth: 'Não consegui entrar na nuvem agora. Tente de novo mais tarde.',
  busy: 'O servidor está ocupado. Tente de novo em instantes.',
  unknown: 'Algo deu errado. Tente de novo.',
};
export const errText = (code) => ERR[code] || ERR.unknown;
export const ERR_CODES = Object.keys(ERR);

/* ---------- cópia guardada no aparelho (primeira pintura e uso sem internet) ---------- */
export const CACHE_KEY = 'mare:social';
// uid: a conta que gravou a cópia. A camada de nuvem só a usa se for a conta de agora (se o login mudou, a lista antiga não é desta conta).
export function cleanState(raw) {
  const o = { uid: '', code: '', friends: [], reqIn: [], reqOut: [], at: 0 };
  if (!raw || typeof raw !== 'object') return o;
  o.uid = typeof raw.uid === 'string' && UID_RE.test(raw.uid) ? raw.uid : '';
  o.code = validCode(raw.code) ? raw.code : '';
  o.at = +raw.at || 0;
  (Array.isArray(raw.friends) ? raw.friends : []).slice(0, MAX_FRIENDS).forEach((f) => {
    if (!f || typeof f !== 'object') return;
    const c = cleanFriend(f.uid, f, { ok: f.since }, '');
    if (!c) return;
    c.mine = waveOf(f.mine); c.theirs = waveOf(f.theirs); c.since = +f.since || 0;
    o.friends.push(c);
  });
  ['reqIn', 'reqOut'].forEach((k) => {
    (Array.isArray(raw[k]) ? raw[k] : []).slice(0, MAX_FRIENDS).forEach((r) => {
      if (!r || !UID_RE.test(String(r.uid))) return;
      o[k].push({ uid: r.uid, mine: k === 'reqOut', nm: str(r.nm, NICK_MAX) || 'Amigo', mc: mascotId(r.mc), at: +r.at || 0 });
    });
  });
  return o;
}
