// Maré — avisos de amigos (1.1.1): a parte PURA, sem Firebase. Decide que mudanças numa amizade merecem um aviso, monta o texto e
// aplica o limite contra repetição e spam. Coberta por tests/push.test.js. Quem conversa com o Firestore e com o FCM é friend-push.js.
//
// O que gera aviso (e para quem):
//   request   alguém pediu amizade                           → avisa quem RECEBEU o pedido
//   accepted  quem recebeu o pedido aceitou                  → avisa quem PEDIU
//   wave      um aceno ("oi" ou "parabéns") novo             → avisa o outro lado
// Nada mais avisa: recusar, cancelar, desfazer amizade e atualizar o perfil são silenciosos (de propósito: ninguém é avisado de "não").

export const NICK_MAX = 20; // igual a NICK_MAX de public/js/social.js
export const WAVE_KINDS = ['hi', 'cheer'];
export const UID_RE = /^[A-Za-z0-9]{10,64}$/;

/* ---------- nomes ---------- */
// Cópia fiel de tidy()/cleanNick() de public/js/social.js (o servidor não importa nada de public/): o nome que o aviso mostra passa
// pela MESMA limpeza que o app faz, então o aviso nunca mostra o que a tela não mostraria (invisíveis, texto "zalgo", < >…).
// tests/push.test.js compara as duas versões em dezenas de nomes: se uma mudar e a outra não, o teste reprova.
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFE00-\uFE0E\uFEFF\uFFA0\uFFF9-\uFFFB]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC00-\uDDEF]/g;
const FORMAT = /[\p{Cf}]/gu;
const MARK = /[\p{Mn}\p{Me}]/u;
const NO_NAME = /^[\s\p{Mn}\p{Me}]*$/u;
function capMarks(t, n) {
  let run = 0;
  return Array.from(t).filter((ch) => { if (MARK.test(ch)) { run++; return run <= n; } run = 0; return true; }).join('');
}
function tidy(v, max) {
  const t = capMarks(String(v).replace(/\s/g, ' ').replace(/[\u0000-\u001F\u007F-\u009F<>]/g, '').replace(INVISIBLE, '').replace(FORMAT, '').replace(/ +/g, ' ').trim(), 2);
  return NO_NAME.test(t) ? '' : Array.from(t).slice(0, max).join('').trim();
}
// Só texto vale como nome (como o app: str()). Vazio se não sobrar nada visível.
export const cleanName = (v) => (typeof v === 'string' ? tidy(v, NICK_MAX) : '');

/* ---------- que mudanças viram aviso ---------- */
// Carimbo do Firestore (Timestamp do Admin SDK) ou número, em ms. Qualquer outra coisa vale 0.
export const tsMs = (t) => (t && typeof t.toMillis === 'function' ? +t.toMillis() || 0 : typeof t === 'number' && isFinite(t) ? t : 0);
// Uma amizade como o servidor guarda: dois ids diferentes em "m" e um estado conhecido. null para qualquer outra coisa.
function pairOf(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.m) || x.m.length !== 2) return null;
  const a = x.m[0], b = x.m[1];
  if (!UID_RE.test(String(a)) || !UID_RE.test(String(b)) || a === b) return null;
  return x.st === 'pending' || x.st === 'active' ? x : null;
}
const otherOf = (m, u) => (m[0] === u ? m[1] : m[0]);
const waveAt = (w, u) => {
  const x = w && typeof w === 'object' ? w[u] : null;
  return x && typeof x === 'object' && WAVE_KINDS.indexOf(x.k) >= 0 && tsMs(x.at) > 0 ? { k: x.k, at: tsMs(x.at) } : null;
};
export const BACK_MS = 12 * 3600e3; // se quem recebe já tinha acenado nas últimas 12 h, o aviso não sugere "acenar de volta"

// before/after: o documento friendships/{par} antes e depois da gravação (null = não existia). Devolve a lista de avisos:
// [{ kind: 'request'|'accepted'|'wave', from, to, wave?: 'hi'|'cheer', again?: bool }]. from = quem fez; to = quem recebe o aviso.
export function eventsOf(before, after) {
  const A = pairOf(after), B = pairOf(before);
  if (!A) return []; // apagada (recusar, cancelar, desfazer) ou documento estranho: nenhum aviso
  const m = A.m, out = [];
  if (!B) { // acabou de nascer: só um pedido novo (pendente, feito por um dos dois) avisa
    if (A.st === 'pending' && m.indexOf(A.by) >= 0) out.push({ kind: 'request', from: A.by, to: otherOf(m, A.by) });
    return out;
  }
  if (B.st === 'pending' && A.st === 'active' && m.indexOf(B.by) >= 0) out.push({ kind: 'accepted', from: otherOf(m, B.by), to: B.by });
  if (A.st === 'active') {
    m.forEach((u) => {
      const a = waveAt(A.w, u), b = waveAt(B.w, u);
      if (!a || (b && a.at <= b.at)) return; // sem aceno, ou o mesmo de antes
      const to = otherOf(m, u), mine = waveAt(A.w, to);
      out.push({ kind: 'wave', from: u, to: to, wave: a.k, again: !!mine && Math.abs(a.at - mine.at) < BACK_MS });
    });
  }
  return out;
}

/* ---------- o texto ---------- */
const NB = '\u00A0'; // espaço que não quebra: o emoji nunca fica sozinho na linha (o app faz igual)
export const TTL = { request: 172800, accepted: 172800, wave: 21600 }; // quanto tempo o push espera por um aparelho desligado (s)
export const URL_FRIENDS = './?tab=friends';
// ev: um item de eventsOf. name: o nome de quem fez (qualquer texto; é limpo aqui). Devolve o que vai no push: title, body, tag e url.
// tag: um aviso do mesmo tipo e da mesma pessoa SUBSTITUI o anterior na tela do aparelho em vez de empilhar.
export function messageOf(ev, name) {
  const n = cleanName(name) || 'Alguém';
  let title, body;
  if (ev.kind === 'request') {
    title = 'Pedido de amizade' + NB + '💌';
    body = n + ' quer acompanhar o dia com você. Toque para responder.';
  } else if (ev.kind === 'accepted') {
    title = n + ' aceitou seu pedido' + NB + '🤗';
    body = 'Agora vocês se acompanham. Que tal um aceno?';
  } else if (ev.wave === 'cheer') {
    title = n + ' mandou parabéns pra você' + NB + '🎉';
    body = ev.again ? 'Toque para ver seus amigos.' : 'Continue assim! Toque para ver seus amigos.';
  } else {
    title = n + ' acenou para você' + NB + '👋';
    body = ev.again ? 'Toque para ver seus amigos.' : 'Toque para acenar de volta.';
  }
  return { title: title, body: body, tag: 'mare-amigo-' + ev.kind + '-' + ev.from, url: URL_FRIENDS };
}
// O que vai ao FCM, só em "data" (todo valor é texto, como o FCM exige): quem monta a notificação é o sw.js (kind 'friend': sem o botão
// "+250 ml", sem mexer no selo, e o toque abre os amigos). Os testes de tela mandam este mesmo pacote ao sw.js de verdade.
export const payloadOf = (ev, m) => ({ kind: 'friend', ev: ev.kind, tag: m.tag, url: m.url, title: m.title, body: m.body });

/* ---------- quem recebe ---------- */
// Aparelhos registrados em users/{uid}.fcm (no máximo 10, como as regras do servidor): [{ h, token }]
export function tokensOf(u) {
  const f = u && typeof u === 'object' && u.fcm && typeof u.fcm === 'object' ? u.fcm : {};
  return Object.keys(f).filter((h) => f[h] && typeof f[h].token === 'string' && f[h].token).slice(0, 10).map((h) => ({ h: h, token: f[h].token }));
}
// "Avisos dos amigos" em Ajustes grava users/{uid}.social.push. Sem o campo (versão antiga do app, ou nunca mexeu) vale ligado:
// quem já tem aparelho registrado passa a receber assim que a função entra no ar. Só um false explícito desliga.
export const wantsAlerts = (u) => !(u && typeof u === 'object' && u.social && typeof u.social === 'object' && u.social.push === false);

/* ---------- limite contra repetição e spam ---------- */
// O servidor entrega cada evento pelo menos uma vez (pode repetir), e um pedido de amizade só exige o código de convite de quem recebe.
// Por isso cada pessoa tem um registro (pushlog/{uid}) com:
//   t: { "tipo_quem": ms }  o último aviso de cada tipo vindo de cada pessoa → a mesma coisa não avisa duas vezes em pouco tempo
//   h: [ms]                 os avisos da última hora → no máximo CAP.all
//   q: [ms]                 os PEDIDOS da última hora → no máximo CAP.request (é por onde alguém poderia encher o celular de outra pessoa)
// O pedido continua aparecendo no app: o limite só segura o push. Os acenos já têm limite próprio nas regras (1 a cada 10 min por amigo).
const HOUR = 3600e3, DAY = 24 * HOUR;
export const WINDOW = { request: DAY, accepted: 60e3, wave: 5 * 60e3 };
export const CAP = { all: 20, request: 5 };
export const KEEP = 100; // entradas em "t": o registro nunca cresce sem fim
const recent = (a, now, span) => (Array.isArray(a) ? a.map(Number).filter((v) => isFinite(v) && now - v < span && v <= now + 60e3) : []);
// log: o registro guardado (ou null). Devolve { ok, why?, log }. Com ok = true, grave log no lugar do antigo; senão não grave nada.
export function admit(log, ev, now) {
  const src = log && typeof log === 'object' ? log : {}, old = src.t && typeof src.t === 'object' ? src.t : {}, t = {};
  Object.keys(old).forEach((k) => { const v = +old[k]; if (isFinite(v) && now - v < DAY && v <= now + 60e3) t[k] = v; });
  const h = recent(src.h, now, HOUR), q = recent(src.q, now, HOUR), key = ev.kind + '_' + ev.from;
  if (t[key] != null && now - t[key] < WINDOW[ev.kind]) return { ok: false, why: 'repetido' };
  if (h.length >= CAP.all) return { ok: false, why: 'limite' };
  if (ev.kind === 'request' && q.length >= CAP.request) return { ok: false, why: 'limite' };
  t[key] = now; h.push(now);
  if (ev.kind === 'request') q.push(now);
  const ks = Object.keys(t);
  if (ks.length > KEEP) ks.sort((a, b) => t[a] - t[b]).slice(0, ks.length - KEEP).forEach((k) => { delete t[k]; });
  return { ok: true, log: { t: t, h: h, q: q } };
}
