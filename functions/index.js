// Maré — Cloud Functions. Exige plano Blaze. Todas em southamerica-east1 (a região do Firestore):
//   sendReminders     (Parte 4)  a cada 15 min, envia o lembrete a quem tem reminder.nextAt vencido. Reproduz core.js (dayWindow,
//                                expectedBy, nextReminderAt) no fuso de cada pessoa (campo tz); a conta está em clock.js.
//   onFriendship      (1.1.1)    quando uma amizade é criada ou muda (pedido, aceite, aceno), avisa o outro lado por push. Desde a 1.2.0 também
//                                junta as turmas quando um pedido vira amizade (a turma é uma só) e avisa quem já estava nela.
//   onProfile         (1.2.0)    quando o perfil de alguém mostra a meta batida, avisa os amigos que ligaram esse aviso (opcional).
//   flushHeld         (1.2.0)    a cada 15 min, entrega os avisos que esperaram a pessoa acordar (horário de silêncio).
//   weeklyCrew        (1.2.0)    de hora em hora, manda o resumo da semana da turma a quem está no domingo, 19h (no relógio de cada um).
//   reconcileNetworks (1.2.0)    uma vez por dia, completa as turmas que ficaram pela metade (e apaga amizades automáticas de quem saiu).
// A lógica está em friend-push.js, network.js, crew-push.js, quiet.js, social-push.js e clock.js; aqui só se ligam os gatilhos ao Admin SDK.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import { flushDue } from './friend-push.js';
import { handleFriendship, reconcileAll } from './network.js';
import { hitOf, notifyHit, sendWeekly } from './crew-push.js';
import { MIN, local, windowOf, expectedAt, nextAt, vol } from './clock.js';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 1 }); // mesma região do Firestore
const db = getFirestore();
const PAGE = 300;
const TITLES = ['Hora de um gole 💧', 'Pausa para a água 🌊', 'Seu corpo agradece 💙', 'Bora hidratar? 🥤']; // iguais ao app
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];
// Tudo o que as partes de friend-push.js, network.js e crew-push.js precisam do mundo de fora (nos testes entram o emulador e um FCM de mentira)
const deps = () => ({ db, FieldValue, Timestamp, messaging: getMessaging(), now: Date.now, log: logger });

export const sendReminders = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '256MiB', retryCount: 0 }, async () => {
  const now = Date.now();
  let last = null, seen = 0, sent = 0;
  for (;;) {
    let q = db.collection('users').where('reminder.nextAt', '<=', Timestamp.fromMillis(now)).orderBy('reminder.nextAt').limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    const counts = await Promise.all(snap.docs.map((d) => handle(d, now)
      .catch((e) => { logger.error('falha no usuário', { uid: d.id, err: e.message }); return 0; })));
    seen += snap.size;
    sent += counts.reduce((a, b) => a + b, 0);
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  logger.info('lembretes', { seen, sent });
});

// Avisos dos amigos: roda a cada gravação em friendships/{par} (criar, aceitar, acenar, apagar). O Firestore pode entregar o mesmo evento mais de
// uma vez; o limite em friend-push.js (pushlog) garante um aviso só. Quando um pedido vira amizade, growNetwork (network.js) junta as turmas: as
// amizades que ele cria levam "auto: true" e não disparam nada de novo (nem aviso nem outra junção), então não há laço. O tempo é folgado
// (120 s) porque juntar duas turmas grandes lê e grava dezenas de documentos e avisa dezenas de pessoas.
export const onFriendship = onDocumentWritten({ document: 'friendships/{pair}', memory: '256MiB', timeoutSeconds: 120 }, async (event) => {
  const ch = event.data;
  if (!ch) return;
  await handleFriendship({ before: ch.before.exists ? ch.before.data() : null, after: ch.after.exists ? ch.after.data() : null }, deps()); // avisa e, se for o caso, junta as turmas
});

// Meta batida (opcional): roda a cada gravação em profiles/{uid}. A grande maioria não é meta batida e sai logo, sem tocar no banco.
export const onProfile = onDocumentWritten({ document: 'profiles/{uid}', memory: '256MiB', timeoutSeconds: 60 }, async (event) => {
  const ch = event.data;
  if (!ch) return;
  const before = ch.before.exists ? ch.before.data() : null, after = ch.after.exists ? ch.after.data() : null;
  if (!hitOf(before, after)) return;
  await notifyHit({ uid: event.params.uid, before: before, after: after }, deps());
});

// Horário de silêncio: entrega o que esperou a pessoa acordar. Cada fila é de uma pessoa (pushq/{uid}); só olha as que já podem sair (due vencido).
export const flushHeld = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 120, memory: '256MiB', retryCount: 0 }, async () => { await flushDue(deps()); });

// Resumo da semana da turma: toda hora cheia; só quem está no domingo, 19h, no relógio dele recebe (e só uma vez: o limite em pushlog segura repetições).
export const weeklyCrew = onSchedule({ schedule: '0 * * * *', timeoutSeconds: 300, memory: '256MiB', retryCount: 0 }, async () => { await sendWeekly(deps()); });

// Confere as turmas uma vez por dia (de madrugada no Brasil): completa o que faltar e apaga amizades automáticas de quem já saiu.
export const reconcileNetworks = onSchedule({ schedule: '30 3 * * *', timeZone: 'America/Sao_Paulo', timeoutSeconds: 300, memory: '256MiB', retryCount: 0 }, async () => {
  await reconcileAll(deps());
});

async function handle(doc, now) {
  const u = doc.data(), r = u.reminder || {}, fcm = u.fcm || {};
  const hs = Object.keys(fcm).filter((h) => fcm[h] && fcm[h].token);
  if (!r.enabled || !hs.length) { await doc.ref.update({ 'reminder.nextAt': null }); return 0; }
  const L = local(now, u.tz), w = windowOf(u.wake, u.sleep), goal = +u.goal || 2000;
  const total = u.today && u.today.day === L.day ? +u.today.ml || 0 : 0; // o "today" de ontem não vale
  const expected = expectedAt(L, w, goal);
  const next = nextAt(now, u.tz, w, { interval: +r.interval || 90, smart: !!r.smart, total, goal, expected });
  const awake = L.min >= w.start && L.min <= Math.min(w.end, 1439);
  const recent = r.lastSentAt && now - r.lastSentAt.toMillis() < 20 * MIN; // trava contra envios em sequência
  if (total >= goal || !awake || recent) { await doc.ref.update({ 'reminder.nextAt': Timestamp.fromMillis(next) }); return 0; }
  const left = goal - total, behind = expected - total;
  const res = await getMessaging().sendEachForMulticast({
    tokens: hs.map((h) => fcm[h].token),
    // Só "data": quem monta a notificação (com o botão +250 ml) é o sw.js do app
    data: {
      kind: 'reminder', tag: 'mare-lembrete', url: './?source=push', // sem "badge": o selo do ícone saiu na 1.2.0 (parecia um contador de notificações)
      title: TITLES[Math.floor(L.min / 60) % TITLES.length], action: u.unit === 'oz' ? '+8 oz' : '+250 ml',
      body: behind > 100 ? 'Você está ' + vol(behind, u.unit) + ' abaixo do ritmo. Um copo agora te coloca de volta no ritmo.'
        : 'Faltam ' + vol(left, u.unit) + ' para a meta de hoje.',
    },
    webpush: { headers: { Urgency: 'high', TTL: '1800' } }, // lembrete com mais de 30 min perde o sentido
  });
  const upd = { 'reminder.nextAt': Timestamp.fromMillis(next), 'reminder.lastSentAt': Timestamp.fromMillis(now) };
  res.responses.forEach((x, i) => { if (!x.success && x.error && DEAD.indexOf(x.error.code) >= 0) upd['fcm.' + hs[i]] = FieldValue.delete(); });
  await doc.ref.update(upd);
  return res.successCount;
}
