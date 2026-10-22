// Maré — a fila do horário de silêncio (1.2.0): a parte PURA, sem Firebase. Um aviso que chega enquanto a pessoa dorme (fora do wake e do sleep
// dela, no fuso dela) não toca o celular: espera em pushq/{uid} e é entregue por flushHeld (friend-push.js) quando ela acorda, num aviso só se
// forem vários ("Novidades da turma"). Coberta por tests/quiet.test.js; o Firestore e o FCM ficam em friend-push.js.
//
// pushq/{uid} = { items: [{ k, at, tag, title, body, url, n? }], due: ms, exp: Date }
//   k     o tipo do aviso (um de KINDS, em social-push.js)       at   quando chegou (ms)
//   tag   o mesmo tag SUBSTITUI o aviso anterior (como na tela do aparelho)
//   due   quando a pessoa acorda (ms): flushHeld só olha as filas com due vencido
//   exp   dia em que o Firestore pode apagar o documento (política de validade opcional, como pushlog)
import { TTL, digestMessage } from './social-push.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
// Quanto tempo cada aviso ainda vale depois que chegou: um aceno ou uma meta batida ficam velhos; um pedido de amizade não.
export const HOLD = { request: 48 * HOUR, accepted: 48 * HOUR, joined: DAY, wave: 12 * HOUR, hit: 4 * HOUR, week: 12 * HOUR };
export const Q_MAX = 20; // a fila nunca cresce sem fim: passando disso, os mais antigos saem

// O que fica guardado de um aviso: o bastante para montar o push depois, sem consultar nada. m = { title, body, tag, url }.
export function heldItem(ev, m, now) {
  const it = { k: ev.kind, at: now, tag: m.tag, title: m.title, body: m.body, url: m.url };
  if (ev.kind === 'joined') it.n = Math.max(1, Math.floor(+ev.n) || (Array.isArray(ev.names) ? ev.names.length : 0) || 1);
  return it;
}
const text = (v, n) => typeof v === 'string' && v.length > 0 && v.length <= n;
// Um item de verdade (o que está guardado pode ter sido mexido à mão): tipo conhecido, textos, data que não vem do futuro e ainda dentro do prazo
const fresh = (x, now) => !!x && typeof x === 'object' && Object.prototype.hasOwnProperty.call(HOLD, x.k) && text(x.tag, 120) && text(x.title, 300) && text(x.body, 600)
  && text(x.url, 200) && typeof x.at === 'number' && isFinite(x.at) && x.at <= now + 60e3 && now - x.at <= HOLD[x.k];
const itemsOf = (doc) => (doc && typeof doc === 'object' && Array.isArray(doc.items) ? doc.items : []);

// O aviso novo entra na fila (doc = o que estava guardado, ou null). Um do mesmo tag substitui o anterior; os vencidos saem; no máximo Q_MAX.
// due = quando a pessoa acorda. Devolve o documento novo, pronto para gravar.
export function addHeld(doc, item, now, due) {
  const items = itemsOf(doc).filter((x) => fresh(x, now) && x.tag !== item.tag).concat([item]);
  while (items.length > Q_MAX) items.shift();
  const last = items.reduce((t, x) => Math.max(t, x.at + HOLD[x.k]), 0);
  return { items: items, due: due, exp: new Date(last + DAY) };
}
// Na hora de acordar: os avisos que ainda valem, do mais antigo ao mais novo, e quantos venceram no caminho.
export function takeHeld(doc, now) {
  const all = itemsOf(doc), keep = all.filter((x) => fresh(x, now)).sort((a, b) => a.at - b.at);
  return { items: keep, dropped: all.length - keep.length };
}
// O que sai: um aviso só sai como ele mesmo; vários viram o resumo "Novidades da turma". ev = o tipo (para o pacote e o TTL do push).
export function readyOf(items) {
  if (items.length === 1) { const x = items[0]; return { ev: { kind: x.k }, m: x, ttl: TTL[x.k] }; }
  return { ev: { kind: 'digest' }, m: digestMessage(items), ttl: TTL.digest };
}
