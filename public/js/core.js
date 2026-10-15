// Maré — núcleo de lógica pura (sem DOM). Coberto por tests/core.test.js.
// Compatibilidade: sem ?. / ?? / structuredClone → roda em iOS 12.2+ e Chrome 70+.

/* ---------- catálogos ---------- */
// f = fator de hidratação (1 = conta 100%). Padrões conservadores: revisar com nutricionista.
export const DRINKS = [
  { id: 'water', n: 'Água', l: 'Água', e: '💧', f: 1 },
  { id: 'sparkling', n: 'Com gás', l: 'Água com gás', e: '✨', f: 1 },
  { id: 'coconut', n: 'Coco', l: 'Água de coco', e: '🥥', f: 1 },
  { id: 'tea', n: 'Chá', l: 'Chá', e: '🍵', f: 1 },
  { id: 'coffee', n: 'Café', l: 'Café', e: '☕', f: 0.9 },
  { id: 'juice', n: 'Suco', l: 'Suco', e: '🍊', f: 1 },
  { id: 'milk', n: 'Leite', l: 'Leite', e: '🥛', f: 1 },
  { id: 'sport', n: 'Isotônico', l: 'Isotônico', e: '⚡', f: 1 },
  { id: 'soda', n: 'Refri', l: 'Refrigerante', e: '🥤', f: 0.9 },
  { id: 'alcohol', n: 'Álcool', l: 'Bebida alcoólica', e: '🍺', f: 0 },
];

export const ACTIVITY = {
  low: { l: 'Sedentário', d: 'Pouco ou nenhum exercício', add: 0, e: '🛋️' },
  moderate: { l: 'Moderado', d: 'Exercício 2–3x por semana', add: 350, e: '🚶' },
  high: { l: 'Ativo', d: 'Exercício quase todo dia', add: 700, e: '🏃' },
  athlete: { l: 'Atleta', d: 'Treino intenso diário', add: 1000, e: '🏋️' },
};

// at = litros efetivos acumulados para alcançar o nível
export const LEVELS = [
  { n: 'Gota', e: '💧', at: 0 }, { n: 'Poça', e: '☔', at: 10 }, { n: 'Riacho', e: '🏞️', at: 50 },
  { n: 'Rio', e: '🛶', at: 150 }, { n: 'Lago', e: '🦢', at: 300 }, { n: 'Mar', e: '⛵', at: 600 },
  { n: 'Oceano', e: '🐋', at: 1000 }, { n: 'Maré cheia', e: '🌊', at: 2000 },
];

/* ---------- datas (fuso local do aparelho) ---------- */
const pad = (n) => (n < 10 ? '0' : '') + n;
export const dayKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const keyToDate = (k) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); };
export const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const hm = (s) => { const p = String(s || '0:0').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
export const minOf = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
export const fmtHM = (min) => { const m = Math.round(min); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); };

/* ---------- bebidas e totais ---------- */
export const drink = (id) => { for (let i = 0; i < DRINKS.length; i++) if (DRINKS[i].id === id) return DRINKS[i]; return DRINKS[0]; };
export const eff = (e) => Math.round(e.ml * drink(e.d).f);
export const dayTotal = (day) => (day && day.entries ? day.entries.reduce((s, e) => s + eff(e), 0) : 0);
export const isMet = (day) => !!day && !!day.entries && day.entries.length > 0 && dayTotal(day) >= (day.goal || 2000);

/* ---------- meta ---------- */
export function calcGoal(p, bonus) {
  const base = Math.round((+p.weight || 70) * 35);
  const act = (ACTIVITY[p.activity] || ACTIVITY.moderate).add;
  const climate = bonus || 0;
  const total = Math.min(5000, Math.max(1200, Math.round((base + act + climate) / 50) * 50));
  return { base, act, climate, total };
}
export const climateBonus = (t) => (t >= 32 ? 750 : t >= 28 ? 500 : t >= 25 ? 250 : 0);
export function goalToday(S, k) {
  if (S.goal.mode === 'manual') return Math.max(500, +S.goal.manual || 2500);
  return calcGoal(S.profile, S.goal.climate && S.goal.day === k ? S.goal.bonus : 0).total;
}

/* ---------- ritmo e lembretes ---------- */
// Janela ativa: do acordar até 1h antes de dormir (aceita dormir depois da meia-noite).
export function dayWindow(wake, sleep) {
  const start = hm(wake);
  let end = hm(sleep);
  if (end <= start) end += 1440;
  end -= 60;
  if (end - start < 120) end = start + 120;
  return { start, end };
}
// Quanto deveria ter bebido até `ms`. Curva levemente adiantada (expoente 0,85).
export function expectedBy(ms, goal, wake, sleep) {
  const w = dayWindow(wake, sleep), m = minOf(ms);
  if (m < w.start) return 0;
  return Math.round(goal * Math.pow(Math.min(1, (m - w.start) / (w.end - w.start)), 0.85));
}
// Próximo lembrete a partir de `fromMs` (último gole ou último envio).
// o = { interval, smart, wake, sleep, total, goal, expected }
export function nextReminderAt(fromMs, o) {
  const w = dayWindow(o.wake, o.sleep), d = new Date(fromMs);
  const at = (off, min) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + off, 0, min).getTime();
  if (o.total >= o.goal) return at(1, w.start + 30);
  let gap = o.interval || 90;
  if (o.smart) {
    const diff = o.total - o.expected;
    if (diff < -0.15 * o.goal) gap = Math.round(gap * 0.66);
    else if (diff > 0.1 * o.goal) gap = Math.round(gap * 1.5);
  }
  const t = fromMs + gap * 60000;
  if (t < at(0, w.start)) return at(0, w.start + 30);
  if (t > at(0, w.end)) return at(1, w.start + 30);
  return t;
}

/* ---------- sequência ---------- */
export function streak(days, today) {
  let k = isMet(days[today]) ? today : addDays(today, -1), n = 0;
  while (isMet(days[k])) { n++; k = addDays(k, -1); }
  return n;
}
export function bestStreak(days) {
  const keys = Object.keys(days).filter((k) => isMet(days[k])).sort();
  let best = 0, run = 0, prev = null;
  keys.forEach((k) => { run = prev && addDays(prev, 1) === k ? run + 1 : 1; if (run > best) best = run; prev = k; });
  return best;
}

/* ---------- níveis ---------- */
export function levelFor(totalMl) {
  const L = totalMl / 1000;
  let i = 0;
  while (i < LEVELS.length - 1 && L >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1] || null;
  return { i, n: cur.n, e: cur.e, at: cur.at, next, liters: L, p: next ? (L - cur.at) / (next.at - cur.at) : 1 };
}

/* ---------- missões do dia (determinísticas pela data) ---------- */
const sumBefore = (es, min) => es.reduce((s, e) => s + (minOf(e.t) < min ? eff(e) : 0), 0);
export const MISSIONS = [
  { id: 'am500', e: '🌅', t: 'Beba 500 ml antes das 10h', p: (es) => sumBefore(es, 600) / 500 },
  { id: 'six', e: '🔁', t: 'Faça 6 registros hoje', p: (es) => es.length / 6 },
  { id: 'by19', e: '⏱️', t: 'Bata a meta antes das 19h', p: (es, g) => sumBefore(es, 1140) / g },
  { id: 'thirds', e: '🌗', t: 'Beba de manhã, à tarde e à noite', p: (es) => {
    const s = {}; es.forEach((e) => { const m = minOf(e.t); s[m < 720 ? 'a' : m < 1080 ? 'b' : 'c'] = 1; });
    return Object.keys(s).length / 3; } },
  { id: 'pure', e: '💧', t: 'Beba 1,5 L só de água', p: (es) => es.reduce((s, e) => s + (e.d === 'water' ? e.ml : 0), 0) / 1500 },
];
export const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
export const missionFor = (k) => MISSIONS[hash(k) % MISSIONS.length];
export const missionProgress = (k, day, goal) => Math.min(1, missionFor(k).p((day && day.entries) || [], goal || 2000));

/* ---------- conquistas ---------- */
export const ACHIEVEMENTS = [
  { id: 'first', e: '💧', t: 'Primeira gota', d: 'Fez o primeiro registro', test: (c) => c.entries >= 1 },
  { id: 'goal', e: '🎯', t: 'Na mosca', d: 'Bateu a meta pela 1ª vez', test: (c) => c.daysMet >= 1 },
  { id: 's3', e: '🔥', t: 'Pegando o ritmo', d: '3 dias seguidos na meta', test: (c) => c.best >= 3 },
  { id: 's7', e: '🌊', t: 'Semana fluida', d: '7 dias seguidos na meta', test: (c) => c.best >= 7 },
  { id: 's30', e: '🏆', t: 'Maré alta', d: '30 dias seguidos na meta', test: (c) => c.best >= 30 },
  { id: 'early', e: '🌅', t: 'Madrugador', d: '500 ml antes das 9h', test: (c) => c.early },
  { id: 'sunset', e: '🌇', t: 'Antes do pôr do sol', d: 'Meta batida antes das 18h', test: (c) => c.sunset },
  { id: 'variety', e: '🍹', t: 'Paladar curioso', d: '4 tipos de bebida', test: (c) => c.types >= 4 },
  { id: 'mission', e: '🧭', t: 'Missão cumprida', d: 'Completou uma missão do dia', test: (c) => c.missions >= 1 },
  { id: 'm10', e: '🗺️', t: 'Explorador', d: '10 missões completas', test: (c) => c.missions >= 10 },
  { id: 'weekend', e: '🏖️', t: 'Fim de semana em dia', d: 'Meta no sábado e no domingo', test: (c) => c.weekend },
  { id: 'l100', e: '🐋', t: 'Cem litros', d: '100 L hidratados no total', test: (c) => c.totalMl >= 100000 },
];

export function context(S) {
  const keys = Object.keys(S.days).sort(), types = {};
  let totalMl = 0, entries = 0, daysMet = 0, early = false, sunset = false, weekend = false;
  keys.forEach((k) => {
    const day = S.days[k], es = day.entries || [], g = day.goal || 2000;
    let cum = 0, morning = 0, hit = -1;
    es.forEach((e) => {
      const v = eff(e), m = minOf(e.t);
      cum += v; types[e.d] = 1;
      if (m < 540) morning += v;
      if (hit < 0 && cum >= g) hit = m;
    });
    totalMl += cum; entries += es.length;
    if (morning >= 500) early = true;
    if (hit >= 0) {
      daysMet++;
      if (hit < 1080) sunset = true;
      if (keyToDate(k).getDay() === 6 && isMet(S.days[addDays(k, 1)])) weekend = true;
    }
  });
  return { totalMl, entries, daysMet, early, sunset, weekend, types: Object.keys(types).length,
    best: bestStreak(S.days), missions: Object.keys(S.missions || {}).length };
}
export function newAchievements(S, ctx) {
  const c = ctx || context(S), got = S.achievements || {};
  return ACHIEVEMENTS.filter((a) => !got[a.id] && a.test(c));
}

/* ---------- estatísticas e insights ---------- */
export function stats(S, today) {
  const start = dayKey(new Date(S.createdAt || Date.now()));
  const span = (n) => {
    let tot = 0, cnt = 0, met = 0;
    for (let i = 1; i <= n; i++) {
      const k = addDays(today, -i);
      if (k < start) break;
      cnt++; tot += dayTotal(S.days[k]); if (isMet(S.days[k])) met++;
    }
    return cnt ? { avg: Math.round(tot / cnt), cons: met / cnt } : { avg: null, cons: null };
  };
  const a = span(7), b = span(30);
  return { avg7: a.avg, cons30: b.cons };
}

export function insights(S, today, p) {
  const out = [], hours = [], wdS = [0, 0, 0, 0, 0, 0, 0], wdC = [0, 0, 0, 0, 0, 0, 0];
  for (let h = 0; h < 24; h++) hours.push(0);
  let n = 0, am = 0, all = 0;
  for (let i = 1; i <= 28; i++) {
    const k = addDays(today, -i), d = S.days[k];
    if (!d || !d.entries || !d.entries.length) continue;
    n++;
    const wd = keyToDate(k).getDay();
    wdS[wd] += dayTotal(d) / (d.goal || 2000); wdC[wd]++;
    d.entries.forEach((e) => {
      const v = eff(e), h = new Date(e.t).getHours();
      if (i <= 14) hours[h] += v;
      all += v; if (h < 12) am += v;
    });
  }
  if (n < 4) return out;

  const w = dayWindow(p.wake, p.sleep), h0 = Math.ceil(w.start / 60), last = Math.min(21, Math.floor(w.end / 60) - 3);
  let dry = -1, dryV = Infinity;
  for (let h = h0; h <= last; h++) { const v = hours[h] + hours[h + 1] + hours[h + 2]; if (v < dryV) { dryV = v; dry = h; } }
  if (dry >= 0) out.push({ e: '🏜️', t: 'Seu período mais seco costuma ser das ' + dry + 'h às ' + (dry + 3) + 'h. Deixe uma garrafa por perto nesse horário.' });

  const WD = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];
  let bi = -1, bv = 0;
  for (let i = 0; i < 7; i++) if (wdC[i] >= 2 && wdS[i] / wdC[i] > bv) { bv = wdS[i] / wdC[i]; bi = i; }
  if (bi >= 0) out.push({ e: '📅', t: 'Você se hidrata melhor ' + (bi === 0 || bi === 6 ? 'aos ' : 'às ') + WD[bi] + ': em média ' + Math.round(bv * 100) + '% da meta.' });

  const share = all ? Math.round((am / all) * 100) : 0;
  out.push(share < 30
    ? { e: '☀️', t: 'Só ' + share + '% da sua água vem antes do meio-dia. Um copo ao acordar faz diferença.' }
    : { e: '☀️', t: 'Boa! ' + share + '% da sua água vem antes do meio-dia.' });

  let a = 0, b = 0;
  for (let i = 1; i <= 7; i++) { a += dayTotal(S.days[addDays(today, -i)]); b += dayTotal(S.days[addDays(today, -i - 7)]); }
  if (b > 0) {
    const pct = Math.round(((a - b) / b) * 100);
    out.push({ e: pct >= 0 ? '📈' : '📉', t: (pct >= 0 ? '+' : '') + pct + '% de hidratação nos últimos 7 dias em relação aos 7 anteriores.' });
  }
  return out;
}

/* ---------- formatação ---------- */
const nf = (n, d) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d || 0 });
export const OZ = 29.5735;
export const fmtNum = (ml, u) => nf(u === 'oz' ? ml / OZ : Math.round(ml));
export const fmtVol = (ml, u) => fmtNum(ml, u) + (u === 'oz' ? ' oz' : ' ml');
export const fmtL = (ml) => nf(ml / 1000, 1) + ' L';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- estado ---------- */
export function defaults(createdAt) {
  return {
    v: 1, onboarded: false, createdAt: createdAt || Date.now(),
    profile: { name: '', weight: 70, activity: 'moderate', wake: '07:00', sleep: '23:00', unit: 'ml', theme: 'auto' },
    goal: { mode: 'auto', manual: 2500, climate: false, bonus: 0, temp: null, day: '' },
    cups: [150, 250, 350, 500], last: 'water',
    reminders: { enabled: false, interval: 90, smart: true, nextAt: 0 },
    days: {}, achievements: {}, missions: {}, ui: {},
  };
}
export function migrate(s) {
  if (!s || typeof s !== 'object') return defaults();
  const d = defaults(s.createdAt), o = Object.assign({}, d, s);
  ['profile', 'goal', 'reminders', 'ui'].forEach((k) => { o[k] = Object.assign({}, d[k], s[k]); });
  ['days', 'achievements', 'missions'].forEach((k) => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; });
  if (!Array.isArray(o.cups) || o.cups.length !== 4) o.cups = d.cups.slice();
  o.v = 1;
  return o;
}

/* ---------- calendário (.ics): plano B para aparelhos sem push ---------- */
export function buildICS(p, interval, now) {
  now = now || new Date();
  interval = interval || 90;
  const w = dayWindow(p.wake, p.sleep), ymd = dayKey(now).replace(/-/g, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mare//Hidratacao//PT-BR', 'CALSCALE:GREGORIAN'];
  for (let m = w.start + interval; m <= w.end && m < 1440; m += interval) {
    const t = ymd + 'T' + pad(Math.floor(m / 60)) + pad(m % 60) + '00';
    L.push('BEGIN:VEVENT', 'UID:mare-' + t + '@mare.app', 'DTSTAMP:' + stamp, 'DTSTART:' + t, 'DURATION:PT5M',
      'RRULE:FREQ=DAILY', 'SUMMARY:💧 Hora de beber água', 'DESCRIPTION:Lembrete do Maré — registre no app!',
      'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hora de beber água',
      'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
