// Maré — Cloud Functions. Exige plano Blaze. Duas funções, ambas em southamerica-east1 (a região do Firestore):
//   sendReminders  (Parte 4)  a cada 15 min, envia o lembrete a quem tem reminder.nextAt vencido. Reproduz core.js (dayWindow,
//                             expectedBy, nextReminderAt) no fuso de cada pessoa (campo tz).
//   onFriendship   (1.1.1)    quando uma amizade é criada ou muda (pedido, aceite, aceno), avisa o outro lado por push.
//                             A lógica está em friend-push.js e social-push.js; aqui só se liga o gatilho ao Admin SDK.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import { notifyFriendship } from './friend-push.js';

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 1 }); // mesma região do Firestore
const db = getFirestore();
const PAGE = 300, MIN = 60000;
const TITLES = ['Hora de um gole 💧', 'Pausa para a água 🌊', 'Seu corpo agradece 💙', 'Bora hidratar? 🥤']; // iguais ao app
const DEAD = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

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

// Avisos dos amigos: roda a cada gravação em friendships/{par} (criar, aceitar, acenar, apagar). Não grava nada nessa coleção: sem laço.
// O Firestore pode entregar o mesmo evento mais de uma vez; o limite em friend-push.js (pushlog) garante um aviso só.
export const onFriendship = onDocumentWritten({ document: 'friendships/{pair}', memory: '256MiB', timeoutSeconds: 60 }, async (event) => {
  const ch = event.data;
  if (!ch) return;
  await notifyFriendship({ before: ch.before.exists ? ch.before.data() : null, after: ch.after.exists ? ch.after.data() : null },
    { db, FieldValue, messaging: getMessaging(), now: Date.now, log: logger });
});

async function handle(doc, now) {
  const u = doc.data(), r = u.reminder || {}, fcm = u.fcm || {};
  const hs = Object.keys(fcm).filter((h) => fcm[h] && fcm[h].token);
  if (!r.enabled || !hs.length) { await doc.ref.update({ 'reminder.nextAt': null }); return 0; }
  const L = local(now, u.tz), w = windowOf(u.wake, u.sleep), goal = +u.goal || 2000;
  const total = u.today && u.today.day === L.day ? +u.today.ml || 0 : 0; // o "today" de ontem não vale
  const expected = L.min < w.start ? 0 : Math.round(goal * Math.pow(Math.min(1, (L.min - w.start) / (w.end - w.start)), 0.85));
  const next = nextAt(now, L, w, { interval: +r.interval || 90, smart: !!r.smart, total, goal, expected });
  const awake = L.min >= w.start && L.min <= Math.min(w.end, 1439);
  const recent = r.lastSentAt && now - r.lastSentAt.toMillis() < 20 * MIN; // trava contra envios em sequência
  if (total >= goal || !awake || recent) { await doc.ref.update({ 'reminder.nextAt': Timestamp.fromMillis(next) }); return 0; }
  const left = goal - total, behind = expected - total;
  const res = await getMessaging().sendEachForMulticast({
    tokens: hs.map((h) => fcm[h].token),
    // Só "data": quem monta a notificação (com o botão +250 ml) é o sw.js do app
    data: {
      kind: 'reminder', tag: 'mare-lembrete', url: './?source=push', badge: String(Math.ceil(left / 250)),
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

// Igual a core.nextReminderAt, usando o relógio local da pessoa (L) em vez do relógio do servidor
function nextAt(now, L, w, o) {
  const at = (dayOff, min) => now + (dayOff * 1440 + min - L.min) * MIN - L.sec * 1000;
  if (o.total >= o.goal) return at(1, w.start + 30);
  let gap = o.interval;
  if (o.smart) {
    const diff = o.total - o.expected;
    if (diff < -0.15 * o.goal) gap = Math.round(gap * 0.66); else if (diff > 0.1 * o.goal) gap = Math.round(gap * 1.5);
  }
  const t = L.min + gap;
  if (t < w.start) return at(0, w.start + 30);
  if (t > w.end) return at(1, w.start + 30);
  return now + gap * MIN;
}
const FMT = {};
function local(now, tz) {
  let f = FMT[tz];
  if (!f) {
    const o = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    try { f = new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: tz || 'America/Sao_Paulo' }, o)); }
    catch (e) { f = new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: 'America/Sao_Paulo' }, o)); } // fuso inválido
    FMT[tz] = f;
  }
  const p = {};
  f.formatToParts(new Date(now)).forEach((x) => { p[x.type] = x.value; });
  return { day: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute, sec: +p.second };
}
const hm = (s) => { const p = String(s || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
function windowOf(wake, sleep) { // igual a core.dayWindow
  const start = hm(wake || '07:00');
  let end = hm(sleep || '23:00');
  if (end <= start) end += 1440;
  end -= 60;
  if (end - start < 120) end = start + 120;
  return { start, end };
}
const vol = (ml, unit) => (unit === 'oz' ? Math.round(ml / 29.5735) + ' oz' : Math.round(ml).toLocaleString('pt-BR') + ' ml');
