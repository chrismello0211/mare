// Maré — avisos de amigos (1.1.1): a parte que conversa com o Firestore e com o FCM. Recebe tudo pronto (db, messaging, FieldValue, relógio,
// log), então roda igual na nuvem (index.js passa o Admin SDK de verdade) e nos testes (tests/rules/friend-push.test.js passa o mesmo
// Admin SDK contra o emulador e um FCM de mentira). A lógica de decisão, o texto e o limite estão em social-push.js (puro).
import { eventsOf, messageOf, payloadOf, cleanName, tokensOf, wantsAlerts, admit, TTL } from './social-push.js';

// Aparelhos que o FCM diz não existirem mais saem do cadastro (como em sendReminders); qualquer outro erro mantém o aparelho
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];
const EXP_MS = 2 * 24 * 3600e3; // o registro de limite (pushlog) só precisa viver o bastante para valer a janela de 24 h

// ch = { before, after }: o documento friendships/{par} antes e depois (objetos simples, ou null se não existia).
// Devolve quantos pushes o FCM aceitou. Um aviso que falha não derruba os outros (nem a função).
export async function notifyFriendship(ch, d) {
  let sent = 0;
  for (const ev of eventsOf(ch.before, ch.after)) {
    try { sent += await deliver(ev, ch.after, d); } catch (e) { d.log.error('aviso de amigos falhou', { kind: ev.kind, err: e && e.message }); }
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

async function deliver(ev, A, d) {
  const uref = d.db.doc('users/' + ev.to), lref = d.db.doc('pushlog/' + ev.to);
  // Quem recebe tem aparelho e quer os avisos? E este aviso passa do limite? Tudo na mesma transação: duas entregas do mesmo evento
  // ao mesmo tempo (o servidor pode repetir) não passam as duas.
  const r = await d.db.runTransaction(async (tx) => {
    const got = await tx.getAll(uref, lref), us = got[0], ls = got[1];
    const u = us.exists ? us.data() : null, tokens = tokensOf(u);
    if (!tokens.length) return { skip: 'sem aparelho' };
    if (!wantsAlerts(u)) return { skip: 'desligado' };
    const a = admit(ls.exists ? ls.data() : null, ev, d.now());
    if (!a.ok) return { skip: a.why };
    tx.set(lref, Object.assign({ exp: new Date(d.now() + EXP_MS) }, a.log));
    return { tokens: tokens };
  });
  if (!r.tokens) { d.log.info('aviso de amigos não enviado', { kind: ev.kind, why: r.skip }); return 0; }
  const m = messageOf(ev, await nameOf(ev, A, d));
  const res = await d.messaging.sendEachForMulticast({
    tokens: r.tokens.map((x) => x.token),
    // Só "data", como os lembretes: quem monta a notificação é o sw.js do app (kind 'friend': sem o botão "+250 ml", e o toque abre os amigos)
    data: payloadOf(ev, m),
    webpush: { headers: { Urgency: 'high', TTL: String(TTL[ev.kind]) } },
  });
  const dead = {};
  res.responses.forEach((x, i) => { if (!x.success && x.error && DEAD.indexOf(x.error.code) >= 0) dead['fcm.' + r.tokens[i].h] = d.FieldValue.delete(); });
  if (Object.keys(dead).length) await uref.update(dead).catch(() => {}); // a conta pode ter sido apagada nesse meio tempo
  d.log.info('aviso de amigos', { kind: ev.kind, sent: res.successCount, failed: res.failureCount });
  return res.successCount;
}
