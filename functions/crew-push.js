// Maré — avisos da turma (1.2.0), os dois que não nascem de uma amizade:
//   notifyHit    "um amigo bateu a meta de hoje": roda quando o perfil de alguém muda (gatilho onProfile). OPCIONAL: só avisa quem ligou
//                "Avisar quando um amigo bater a meta" em Ajustes (users/{uid}.social.hit = true). Por padrão ninguém recebe, de propósito.
//   sendWeekly   "Resumo da semana da turma": roda de hora em hora (weeklyCrew) e avisa quem está no domingo, entre 19:00 e 19:59 no relógio
//                dele, e não desligou o resumo (users/{uid}.social.week; sem o campo vale ligado).
// Os dois passam por route() (friend-push.js): limite contra repetição, horário de silêncio e FCM. Só o texto e a conta saem daqui.
// A conta da semana é a mesma do app (weekOf em public/js/social.js; tests/crew.test.js compara as duas em milhares de perfis sorteados).
import { tokensOf, wantsKind, messageOf, weekMessage } from './social-push.js';
import { route } from './friend-push.js';
import { friendsOf } from './network.js';
import { local, isWeeklyHour } from './clock.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = 7;
const obj = (x) => (x && typeof x === 'object' ? x : null);
const unique = (l) => Array.from(new Set(l));

/* ---------- a parte pura ---------- */
// O perfil acabou de mostrar a meta batida? before/after = profiles/{uid} antes e depois (null = não existia/foi apagado). Só vale para quem mostra
// o progresso (sh), e só na primeira vez de cada dia (day): publicar o perfil de novo com a meta já batida não repete nada.
export function hitOf(before, after) {
  const A = obj(after), B = obj(before);
  if (!A || A.met !== true || A.sh !== true || typeof A.day !== 'string' || !DAY_RE.test(A.day)) return false;
  return !(B && B.met === true && B.sh === true && B.day === A.day);
}
// Dias entre dois dias 'AAAA-MM-DD' (nunca negativo; 99 se algum não for um dia): igual a daysBetween do app
function daysBetween(a, b) {
  if (!DAY_RE.test(String(a)) || !DAY_RE.test(String(b))) return 99;
  const n = Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  return isFinite(n) ? Math.max(0, n) : 99;
}
const int = (v, lo, hi) => { const n = Math.floor(+v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
// Os últimos 7 dias de quem publicou o perfil p, vistos do dia de quem olha (today): quantos bateram a meta (n) e se dá para saber (known).
// Igual a weekOf de public/js/social.js: a máscara wm tem o bit i = o dia (p.day − i); com o perfil parado há alguns dias, a janela anda e os
// dias em que a pessoa não apareceu contam como não batidos. Sem a máscara, em pausa (sh = false) ou com um dia que ainda nem chegou: não conta.
export function weekOf(p, today) {
  const q = obj(p);
  if (!q || q.wm == null || q.sh === false || typeof q.day !== 'string' || !DAY_RE.test(q.day) || daysBetween(today, q.day) > 2) return { n: 0, known: false };
  const m = int(q.wm, 0, 127), shift = daysBetween(q.day, today);
  let n = 0;
  for (let i = shift; i < WEEK; i++) if ((m >> (i - shift)) & 1) n++;
  return { n: n, known: true };
}
// A semana da turma vista por uma pessoa: profiles = Map uid → perfil; ids = ela e os amigos; today = o dia dela. Devolve { hits, total, mine }
// (acertos da turma, de quantos possíveis, e os dela) ou null se não há o que contar: ninguém mais mostra os 7 dias, ou ninguém bateu a meta.
export function weekOfCrew(profiles, me, ids, today) {
  let hits = 0, known = 0, others = 0, mine = null;
  ids.forEach((id) => {
    const w = weekOf(profiles.get(id), today);
    if (!w.known) return;
    known++; hits += w.n;
    if (id === me) mine = w.n; else others++;
  });
  return others && hits ? { hits: hits, total: known * WEEK, mine: mine } : null;
}
// Os nomes de fuso (IANA) em que agora é domingo entre 19:00 e 19:59. A lista vem do próprio Node, mais alguns apelidos que os navegadores ainda
// mandam (o aplicativo grava o fuso que o aparelho informa, e alguns usam o nome antigo).
// O Node lista os nomes "canônicos" do CLDR (Asia/Calcutta, America/Indianapolis…); os navegadores mais novos mandam os nomes primários da IANA
// (Asia/Kolkata, America/Indiana/Indianapolis…) e os mais velhos, os do CLDR. Aqui entram os primários que a lista do Node não tem.
export const ZONES_EXTRA = ['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Asia/Kolkata', 'Asia/Calcutta', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Ho_Chi_Minh', 'Asia/Saigon',
  'Asia/Yangon', 'Asia/Rangoon', 'Europe/Kyiv', 'Europe/Kiev', 'America/Argentina/Buenos_Aires', 'America/Buenos_Aires', 'Atlantic/Faroe', 'Atlantic/Faeroe',
  'America/Nuuk', 'America/Godthab', 'Pacific/Kanton', 'Pacific/Enderbury', 'America/Ciudad_Juarez', 'Africa/Asmara', 'America/Argentina/Catamarca',
  'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/Mendoza', 'America/Atikokan', 'America/Indiana/Indianapolis',
  'America/Kentucky/Louisville', 'Pacific/Chuuk', 'Pacific/Pohnpei'];
export function zonesAt(now) {
  let all = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { all = []; }
  return unique(all.concat(ZONES_EXTRA)).filter((tz) => { try { return isWeeklyHour(now, tz); } catch (e) { return false; } });
}

/* ---------- o Firestore ---------- */
const chunks = (l, n) => { const o = []; for (let i = 0; i < l.length; i += n) o.push(l.slice(i, i + n)); return o; };
async function docsOf(db, path, ids) {
  const out = new Map();
  for (const part of chunks(ids, 300)) {
    const snaps = await db.getAll(...part.map((u) => db.doc(path + '/' + u)));
    snaps.forEach((s, j) => { if (s.exists) out.set(part[j], s.data()); });
  }
  return out;
}
// Avisa quem quer que alguém da turma bateu a meta. ch = { uid, before, after }: o perfil de uid antes e depois. Devolve quantos pushes saíram.
export async function notifyHit(ch, d) {
  if (!hitOf(ch.before, ch.after)) return 0;
  const friends = await friendsOf(d.db, ch.uid);
  if (!friends.length) return 0;
  const users = await docsOf(d.db, 'users', friends); // só quem ligou o aviso e tem aparelho: o resto nem entra na fila de transações
  const to = friends.filter((f) => { const u = users.get(f); return !!u && wantsKind(u, 'hit') && tokensOf(u).length > 0; });
  const m = messageOf({ kind: 'hit', from: ch.uid }, ch.after.nm); // messageOf limpa o nome como o app e usa "Alguém" se não sobrar nada
  let sent = 0;
  for (const part of chunks(to, 6)) {
    const got = await Promise.all(part.map((t) => route({ kind: 'hit', from: ch.uid, to: t }, m, d)
      .catch((e) => { d.log.error('aviso de amigos falhou', { kind: 'hit', err: e && e.message }); return 0; })));
    sent += got.reduce((s, x) => s + x, 0);
  }
  return sent;
}
// O resumo da semana: para cada pessoa que está agora no domingo das 19h. Devolve { seen, sent }.
export async function sendWeekly(d) {
  const now = d.now(), zones = zonesAt(now), out = { seen: 0, sent: 0 }, profiles = new Map(); // profiles: cópia desta rodada (uid → perfil ou null)
  for (const part of chunks(zones, 30)) { // "in" aceita no máximo 30 valores
    // select: só o fuso, as escolhas de aviso e os aparelhos (o resto do documento da pessoa, que pode ser grande, nem sai do Firestore)
    const snap = await d.db.collection('users').where('tz', 'in', part).select('tz', 'social', 'fcm').get();
    const docs = snap.docs.filter((x) => wantsKind(x.data(), 'week') && tokensOf(x.data()).length > 0);
    out.seen += snap.size;
    for (const group of chunks(docs, 8)) {
      const got = await Promise.all(group.map(async (doc) => {
        try {
          const friends = await friendsOf(d.db, doc.id);
          if (!friends.length) return 0;
          const ids = [doc.id].concat(friends), need = ids.filter((u) => !profiles.has(u));
          if (need.length) { const have = await docsOf(d.db, 'profiles', need); need.forEach((u) => { profiles.set(u, have.get(u) || null); }); }
          const w = weekOfCrew(profiles, doc.id, ids, local(now, doc.data().tz).day);
          return w ? await route({ kind: 'week', from: 'crew', to: doc.id }, weekMessage(w), d) : 0;
        } catch (e) { d.log.error('resumo da semana falhou', { err: e && e.message }); return 0; }
      }));
      out.sent += got.reduce((s, x) => s + x, 0);
    }
  }
  d.log.info('resumo da semana', Object.assign({ zones: zones.length }, out));
  return out;
}
