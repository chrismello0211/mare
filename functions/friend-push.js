// Maré — avisos de amigos (1.1.1): a parte que conversa com o Firestore e com o FCM. Recebe tudo pronto (db, messaging, FieldValue, relógio,
// log), então roda igual na nuvem (index.js passa o Admin SDK de verdade) e nos testes (tests/rules/friend-push.test.js passa o mesmo
// Admin SDK contra o emulador e um FCM de mentira). A lógica de decisão, o texto e o limite estão em social-push.js (puro).
// 1.2.0: route() é o caminho de TODO aviso (pedido, aceite, aceno, entrada na turma, meta batida, resumo da semana) e respeita o horário de
// silêncio: se a pessoa está dormindo, o aviso espera em pushq/{uid} e flushHeld() o entrega ao acordar (a parte pura está em quiet.js).
import { eventsOf, messageOf, payloadOf, cleanName, tokensOf, wantsAlerts, wantsKind, admit, TTL } from './social-push.js';
import { awakeNow, nextWake } from './clock.js';
import { heldItem, addHeld, takeHeld, readyOf } from './quiet.js';

// Aparelhos que o FCM diz não existirem mais saem do cadastro (como em sendReminders); qualquer outro erro mantém o aparelho
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];
const EXP_MS = 2 * 24 * 3600e3; // o registro de limite (pushlog) só precisa viver o bastante para valer a janela de 24 h

// ch = { before, after }: o documento friendships/{par} antes e depois (objetos simples, ou null se não existia).
// Devolve quantos pushes o FCM aceitou. Um aviso que falha não derruba os outros (nem a função).
export async function notifyFriendship(ch, d) {
  let sent = 0;
  for (const ev of eventsOf(ch.before, ch.after)) {
    try { sent += await route(ev, messageOf(ev, await nameOf(ev, ch.after, d)), d); } catch (e) { d.log.error('aviso de amigos falhou', { kind: ev.kind, err: e && e.message }); }
  }
  return sent;
}

// Nome de quem fez, do jeito que a tela de quem recebe o mostra: o do perfil (o mais novo), senão o que a amizade guardou
async function nameOf(ev, A, d) {
  if (ev.kind === 'request') return cleanName(A.nm); // na lista de pedidos o app mostra o nome que veio no pedido
  let nm = '';
  try { const s = await d.db.doc('profiles/' + ev.from).get(); if (s.exists) nm = cleanName(s.data().nm); } catch (e) { /* usa o da amizade */ }
  return nm || cleanName(ev.from === A.by ? A.nm : A.tn);
}

// Manda o push já montado: um envio só, com todos os aparelhos da pessoa. Só "data", como os lembretes: quem monta a notificação é o sw.js do
// app (kind 'friend': sem o botão "+250 ml", e o toque abre os amigos). Aparelho que o FCM diz não existir mais sai do cadastro.
async function send(tokens, ev, m, ttl, uref, d, extra) {
  const res = await d.messaging.sendEachForMulticast({
    tokens: tokens.map((x) => x.token),
    data: payloadOf(ev, m),
    webpush: { headers: { Urgency: 'high', TTL: String(ttl) } },
  });
  const dead = {};
  res.responses.forEach((x, i) => { if (!x.success && x.error && DEAD.indexOf(x.error.code) >= 0) dead['fcm.' + tokens[i].h] = d.FieldValue.delete(); });
  if (Object.keys(dead).length) await uref.update(dead).catch(() => {}); // a conta pode ter sido apagada nesse meio tempo
  d.log.info('aviso de amigos', Object.assign({ kind: ev.kind, sent: res.successCount, failed: res.failureCount }, extra || {}));
  return res.successCount;
}

// Entrega UM aviso a UMA pessoa. ev = { kind, from, to, ... } (kind: um de KINDS em social-push.js; from: quem fez, ou 'crew' no resumo da
// semana), m = { title, body, tag, url }. Devolve quantos pushes o FCM aceitou: 0 se não houve envio (sem aparelho, aviso desligado, limite,
// ou a pessoa está dormindo e o aviso foi para a fila: ver pushq/{uid}).
export async function route(ev, m, d) {
  const uref = d.db.doc('users/' + ev.to), lref = d.db.doc('pushlog/' + ev.to), qref = d.db.doc('pushq/' + ev.to);
  // Quem recebe tem aparelho e quer este aviso? Este aviso passa do limite? Está acordada? Tudo na mesma transação: duas entregas do mesmo
  // evento ao mesmo tempo (o servidor pode repetir) não passam as duas.
  const r = await d.db.runTransaction(async (tx) => {
    const got = await tx.getAll(uref, lref, qref), us = got[0], ls = got[1], qs = got[2];
    const u = us.exists ? us.data() : null, tokens = tokensOf(u), now = d.now();
    if (!tokens.length) return { skip: 'sem aparelho' };
    if (!wantsKind(u, ev.kind)) return { skip: 'desligado' };
    const a = admit(ls.exists ? ls.data() : null, ev, now);
    if (!a.ok) return { skip: a.why };
    tx.set(lref, Object.assign({ exp: new Date(now + EXP_MS) }, a.log));
    if (awakeNow(u, now).awake) return { tokens: tokens };
    // dormindo: o aviso espera (o limite acima já foi gasto, então a repetição do mesmo evento não entra duas vezes)
    tx.set(qref, addHeld(qs.exists ? qs.data() : null, heldItem(ev, m, now), now, nextWake(now, u && u.tz, u && u.wake)));
    return { held: true };
  });
  if (r.held) { d.log.info('aviso de amigos guardado', { kind: ev.kind, why: 'silêncio' }); return 0; }
  if (!r.tokens) { d.log.info('aviso de amigos não enviado', { kind: ev.kind, why: r.skip }); return 0; }
  return send(r.tokens, ev, m, TTL[ev.kind], uref, d);
}

// Entrega o que esperou o silêncio de UMA pessoa (flushHeld em index.js chama uma vez por fila vencida). Devolve quantos pushes o FCM aceitou.
// A fila é reivindicada (apagada) na mesma transação que decide: duas execuções ao mesmo tempo não mandam duas vezes (melhor perder um aviso
// que mandar dois, como no resto). Ainda dormindo (ela mudou o horário de sono) → só marca a nova hora; sem aparelho ou com os avisos
// desligados → joga a fila fora; tudo vencido → idem.
export async function flushQueue(uid, d) {
  const uref = d.db.doc('users/' + uid), qref = d.db.doc('pushq/' + uid);
  const r = await d.db.runTransaction(async (tx) => {
    const got = await tx.getAll(qref, uref), qs = got[0], us = got[1];
    if (!qs.exists) return { skip: 'vazia' };
    const u = us.exists ? us.data() : null, tokens = tokensOf(u), now = d.now();
    if (!tokens.length || !wantsAlerts(u)) { tx.delete(qref); return { skip: tokens.length ? 'desligado' : 'sem aparelho' }; }
    if (!awakeNow(u, now).awake) { tx.update(qref, { due: nextWake(now, u && u.tz, u && u.wake) }); return { skip: 'dormindo' }; }
    const t = takeHeld(qs.data(), now), items = t.items.filter((x) => wantsKind(u, x.k)); // quem desligou um tipo no meio da noite não o recebe
    tx.delete(qref);
    return items.length ? { tokens: tokens, items: items, dropped: t.dropped + (t.items.length - items.length) } : { skip: 'vencidos' };
  });
  if (!r.tokens) { d.log.info('fila de avisos não entregue', { why: r.skip }); return 0; }
  const out = readyOf(r.items);
  return send(r.tokens, out.ev, out.m, out.ttl, uref, d, { held: r.items.length, dropped: r.dropped });
}

// Entrega as filas que já podem sair (due vencido): é o que o job flushHeld faz de 15 em 15 minutos, página por página (opts.page: só os testes mexem).
// Uma fila que falha não derruba as outras. Devolve { seen, sent }: quantas filas vencidas viu e quantos pushes o FCM aceitou.
export async function flushDue(d, opts) {
  const PAGE = (opts && opts.page) || 300, out = { seen: 0, sent: 0 };
  let last = null;
  for (;;) {
    let q = d.db.collection('pushq').where('due', '<=', d.now()).orderBy('due').limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (let i = 0; i < snap.docs.length; i += 10) {
      const got = await Promise.all(snap.docs.slice(i, i + 10).map((x) => flushQueue(x.id, d)
        .catch((e) => { d.log.error('fila de avisos falhou', { uid: x.id, err: e && e.message }); return 0; })));
      out.sent += got.reduce((a, b) => a + b, 0);
    }
    out.seen += snap.size;
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  d.log.info('filas de avisos', out);
  return out;
}
