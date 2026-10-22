// Maré — o relógio das funções (1.2.0): a parte PURA, sem Firebase. Reúne o que antes ficava solto em index.js (o fuso de cada pessoa e a
// janela ativa dos lembretes) e acrescenta o horário de silêncio dos avisos dos amigos e o domingo das 19h do resumo da semana.
// Coberta por tests/clock.test.js (que também compara a conta dos lembretes com a do app, public/js/core.js).
export const MIN = 60000;

/* ---------- o relógio local de cada pessoa ---------- */
const FMT = {};
// now (ms) visto no fuso tz (nome IANA; fuso inválido ou vazio vale America/Sao_Paulo, como no app).
// Devolve { day: 'AAAA-MM-DD', min: minutos desde a meia-noite, sec, dow: 0 (domingo) a 6 }.
export function local(now, tz) {
  const key = tz || '';
  let f = FMT[key];
  if (!f) {
    const o = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    try { f = new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: tz || 'America/Sao_Paulo' }, o)); }
    catch (e) { f = new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: 'America/Sao_Paulo' }, o)); } // fuso inválido
    FMT[key] = f;
  }
  const p = {};
  f.formatToParts(new Date(now)).forEach((x) => { p[x.type] = x.value; });
  const day = p.year + '-' + p.month + '-' + p.day;
  return { day: day, min: +p.hour * 60 + +p.minute, sec: +p.second, dow: new Date(day + 'T00:00:00Z').getUTCDay() };
}
// "HH:MM" em minutos desde a meia-noite (igual a core.hm para tudo de 00:00 a 24:00). Um texto que não é uma hora de verdade (o documento users/{uid}
// pode ter sido mexido à mão: "Infinity", "1e999:00", "-5:30", "12:75") vale 00:00 em vez de estragar a conta com Infinity, NaN ou um instante
// no passado, o que derrubaria o envio daquela pessoa.
export const hm = (s) => {
  const p = String(s || '0:0').split(':'), h = +p[0] || 0, m = +p[1] || 0, t = h * 60 + m;
  return h >= 0 && m >= 0 && m < 60 && t <= 1440 ? t : 0;
};

/* ---------- instantes certos, inclusive na virada do horário de verão ---------- */
const DAY_MS = 864e5;
// Quanto o relógio de tz anda à frente de Greenwich no instante t (ms): hora local = t + offsetAt(t, tz)
function offsetAt(t, tz) {
  const L = local(t, tz);
  return Date.parse(L.day + 'T00:00:00Z') + (L.min * 60 + L.sec) * 1000 - Math.floor(t / 1000) * 1000;
}
// O instante (ms) em que o relógio de tz marca `min` minutos desde a meia-noite, `off` dias depois do dia de L (L = local(agora, tz)). É o que
// new Date(ano, mês, dia + off, 0, min) faz no app, inclusive na noite em que o horário de verão vira: uma hora que não existe vale a hora
// seguinte, e uma hora que acontece duas vezes vale a primeira (as duas coisas pedem o deslocamento que valia ANTES da virada).
export function instantAt(L, tz, off, min) {
  const wall = Date.parse(L.day + 'T00:00:00Z') + (off * 1440 + min) * MIN; // a hora marcada, contada como se o relógio fosse o de Greenwich
  const before = offsetAt(wall - DAY_MS, tz), after = offsetAt(wall + DAY_MS, tz);
  let x = wall - before;
  if (after !== before && offsetAt(x, tz) !== before) { const y = wall - after; if (offsetAt(y, tz) === after) x = y; } // só existe depois da virada
  return x;
}

/* ---------- lembretes (igual a core.js: dayWindow, expectedBy, nextReminderAt) ---------- */
export function windowOf(wake, sleep) { // igual a core.dayWindow: do acordar até 1 h antes de dormir
  const start = hm(wake || '07:00');
  let end = hm(sleep || '23:00');
  if (end <= start) end += 1440;
  end -= 60;
  if (end - start < 120) end = start + 120;
  return { start: start, end: end };
}
// Igual a core.expectedBy: quanto a pessoa deveria ter bebido agora (L = o relógio local dela, w = windowOf, goal = a meta). Curva com expoente 0,85.
export function expectedAt(L, w, goal) {
  return L.min < w.start ? 0 : Math.round(goal * Math.pow(Math.min(1, (L.min - w.start) / (w.end - w.start)), 0.85));
}
// Igual a core.nextReminderAt (que o app roda no relógio do aparelho): aqui no relógio de tz, o fuso da pessoa. Devolve o instante (ms) do próximo.
// w = windowOf(wake, sleep); o = { interval, smart, total, goal, expected }. Inclusive na noite em que o horário de verão vira: ver instantAt.
export function nextAt(now, tz, w, o) {
  const L = local(now, tz), at = (off, min) => instantAt(L, tz, off, min);
  if (o.total >= o.goal) return at(1, w.start + 30);
  let gap = o.interval;
  if (o.smart) {
    const diff = o.total - o.expected;
    if (diff < -0.15 * o.goal) gap = Math.round(gap * 0.66); else if (diff > 0.1 * o.goal) gap = Math.round(gap * 1.5);
  }
  const t = now + gap * MIN;
  if (t < at(0, w.start)) return at(0, w.start + 30);
  if (t > at(0, w.end)) return at(1, w.start + 30);
  return t;
}
export const vol = (ml, unit) => (unit === 'oz' ? Math.round(ml / 29.5735) + ' oz' : Math.round(ml).toLocaleString('pt-BR') + ' ml');

/* ---------- horário de silêncio (1.2.0) ---------- */
// A pessoa está acordada de wake (inclusive) até sleep (exclusive), no relógio dela. Dormir depois da meia-noite funciona (wake 12:00, sleep
// 02:00). wake igual a sleep não define silêncio nenhum: vale "sempre acordada". Sem os horários (conta antiga) valem os do app: 07:00 e 23:00.
export function isAwake(min, wake, sleep) {
  const a = hm(wake || '07:00') % 1440, b = hm(sleep || '23:00') % 1440;
  if (a === b) return true;
  return a < b ? min >= a && min < b : min >= a || min < b;
}
// A próxima vez (ms) em que o relógio da pessoa marca a hora de acordar: hoje, se ainda não chegou, senão amanhã. Sempre depois de agora.
export function nextWake(now, tz, wake) {
  const L = local(now, tz), w = hm(wake || '07:00') % 1440;
  const x = instantAt(L, tz, w > L.min ? 0 : 1, w);
  return x > now ? x : instantAt(L, tz, 1, w); // (só falha se a hora cai na hora repetida da virada: então vale a de amanhã)
}
// Estado de silêncio de uma conta (users/{uid}): { awake, L }. Qualquer campo que falte vale o padrão do app.
export function awakeNow(u, now) {
  const x = u && typeof u === 'object' ? u : {}, L = local(now, x.tz);
  return { awake: isAwake(L.min, x.wake, x.sleep), L: L };
}

/* ---------- domingo, 19h ---------- */
export const WEEKLY = { dow: 0, hour: 19 }; // o resumo da semana da turma
// O relógio local de tz está dentro da hora do resumo semanal (domingo, das 19:00 às 19:59)?
export function isWeeklyHour(now, tz) {
  const L = local(now, tz);
  return L.dow === WEEKLY.dow && Math.floor(L.min / 60) === WEEKLY.hour;
}
