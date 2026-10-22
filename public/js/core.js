// Maré — núcleo de lógica pura (sem DOM). Coberto por tests/core.test.js.
// Compatibilidade: sem ?. / ?? / structuredClone → roda em iOS 12.2+ e Chrome 70+.

/* ---------- catálogos ---------- */
// g = grupo. 'w': água e água com gás, que contam 100% na meta (a gota principal).
// 'o': outros líquidos, numa contagem à parte (a segunda gota) e fora da meta. Não há fator de hidratação:
// a controvérsia sobre quanto cada bebida "vale" fica de fora do app, e cada pessoa decide se quer acompanhar os outros.
// Refrigerante e bebida alcoólica saíram do app (RETIRED): registros antigos delas são descartados na migração.
export const DRINKS = [
  { id: 'water', n: 'Água', l: 'Água', e: '💧', g: 'w' },
  { id: 'sparkling', n: 'Com gás', l: 'Água com gás', e: '✨', g: 'w' },
  { id: 'coconut', n: 'Coco', l: 'Água de coco', e: '🥥', g: 'o' },
  { id: 'tea', n: 'Chá', l: 'Chá', e: '🍵', g: 'o' },
  { id: 'coffee', n: 'Café', l: 'Café', e: '☕', g: 'o' },
  { id: 'juice', n: 'Suco', l: 'Suco', e: '🍊', g: 'o' },
  { id: 'milk', n: 'Leite', l: 'Leite', e: '🥛', g: 'o' },
  { id: 'sport', n: 'Isotônico', l: 'Isotônico', e: '⚡', g: 'o' },
];
export const WATERS = DRINKS.filter((d) => d.g === 'w');
export const OTHERS = DRINKS.filter((d) => d.g === 'o');
const RETIRED = { soda: 1, alcohol: 1 };
export const retired = (id) => RETIRED[id] === 1;

export const ACTIVITY = {
  low: { l: 'Sedentário', d: 'Pouco ou nenhum exercício', add: 0, e: '🛋️' },
  moderate: { l: 'Moderado', d: 'Exercício 2–3x por semana', add: 350, e: '🚶' },
  high: { l: 'Ativo', d: 'Exercício quase todo dia', add: 700, e: '🏃' },
  athlete: { l: 'Atleta', d: 'Treino intenso diário', add: 1000, e: '🏋️' },
};

// Insígnias: um bichinho do mar para cada marco de ÁGUA acumulada (a soma de água e água com gás de todos os dias; os outros líquidos
// não entram). at = litros para desbloquear. A arte de cada uma está em art.js (mesmo id). e = emoji só para textos de compartilhar.
// O ritmo foi pensado para quem bebe cerca de 2,5 L por dia: a 2ª sai em ~4 dias, o cavalo-marinho (100 L) em ~6 semanas e o narval em ~13 meses.
export const INSIGNIAS = [
  { id: 'concha', n: 'Concha', e: '🐚', at: 0, cheer: 'Todo grande recife começa com uma conchinha.',
    fact: 'Toda concha cresce uma camadinha de cada vez, igualzinho à sua constância.' },
  { id: 'estrela', n: 'Estrela-do-mar', e: '⭐', at: 10, cheer: 'Primeiro marco! Sua rotina já está ganhando forma.',
    fact: 'A estrela-do-mar não tem sangue: ela faz a água do mar circular pelo corpo para se mexer.' },
  { id: 'baiacu', n: 'Baiacu', e: '🐡', at: 30, cheer: 'Constância é isso: um golinho de cada vez.',
    fact: 'Para se defender, o baiacu engole água e fica redondo como um balão.' },
  { id: 'tartaruga', n: 'Tartaruga-marinha', e: '🐢', at: 60, cheer: 'Devagar e sempre! Você já tem uma bela rotina.',
    fact: 'Muitas tartarugas-marinhas voltam, anos depois, à mesma praia onde nasceram.' },
  { id: 'cavalo', n: 'Cavalo-marinho', e: '🌊', at: 100, cheer: 'Cem litros de cuidado com você. Que orgulho!',
    fact: 'No cavalo-marinho, é o papai quem carrega os filhotes na barriga. E eles nadam em pé!' },
  { id: 'polvo', n: 'Polvo', e: '🐙', at: 175, cheer: 'Três corações batendo por você, e uma rotina cada vez mais firme.',
    fact: 'O polvo tem três corações e sangue azul.' },
  { id: 'agua-viva', n: 'Água-viva', e: '💦', at: 275, cheer: 'Fluindo com leveza. Continue assim!',
    fact: 'Uma água-viva é feita de cerca de 95% de água. Quase como a gente!' },
  { id: 'golfinho', n: 'Golfinho', e: '🐬', at: 400, cheer: 'Que salto! Você virou referência de constância.',
    fact: 'Golfinhos dormem com metade do cérebro de cada vez, para continuar nadando e respirando.' },
  { id: 'baleia', n: 'Baleia', e: '🐋', at: 700, cheer: 'Gigante! É muita água e muita dedicação.',
    fact: 'A baleia-azul é o maior animal que já existiu, maior até que qualquer dinossauro.' },
  { id: 'narval', n: 'Narval', e: '🦄', at: 1000, cheer: 'Recife completo! Você é lenda da hidratação.',
    fact: 'O "chifre" do narval é um dente que cresce em espiral e pode passar de 2 metros.' },
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
const byId = (id) => { for (let i = 0; i < DRINKS.length; i++) if (DRINKS[i].id === id) return DRINKS[i]; return null; };
export const drink = (id) => byId(id) || DRINKS[0]; // id desconhecido vira água
// Quem recebe um registro { id, t, ml, d }: isWater entra na meta; isOther fica na contagem à parte
export const isWater = (e) => drink(e.d).g === 'w';
export const isOther = (e) => drink(e.d).g === 'o';
export const eff = (e) => (isWater(e) ? Math.round(e.ml) : 0); // quanto do registro conta na meta (só água)
const otherMl = (e) => (isOther(e) ? Math.round(e.ml) : 0);
const sumOf = (es, f) => es.reduce((s, e) => s + f(e), 0);

// "Somar outros líquidos na meta" (Ajustes; vem DESLIGADO). Ligado, café, chá, suco etc. entram na meta, mas só até MIX_MAX dela:
// pelo menos metade da meta sempre precisa vir de água. Sem fator por bebida: os 6 outros líquidos valem 1:1, dentro do limite.
// É um interruptor global (vale para todos os dias, inclusive os anteriores); o store o liga e desliga com setMix,
// e só quando a segunda gota está ativa (senão registros escondidos entrariam na conta).
export const MIX_MAX = 0.5;
let MIX = false;
export const setMix = (on) => { MIX = !!on; };
export const mixOn = () => MIX;
const mixCap = (goal) => Math.round((goal || 2000) * MIX_MAX);
// O que conta na meta numa lista de registros: a água, mais (se ligado) os outros líquidos até o limite
export const counted = (es, goal) => (es && es.length ? sumOf(es, eff) + (MIX ? Math.min(sumOf(es, otherMl), mixCap(goal)) : 0) : 0);
export const dayTotal = (day) => (day ? counted(day.entries, day.goal) : 0); // total da meta: água (+ outros, se ligado)
export const dayWater = (day) => (day && day.entries ? sumOf(day.entries, eff) : 0); // sempre só água (níveis, "L de água")
export const dayOther = (day) => (day && day.entries ? sumOf(day.entries, otherMl) : 0); // outros líquidos registrados (2ª gota)
export const otherCounted = (day) => (MIX && day ? Math.min(dayOther(day), mixCap(day.goal)) : 0); // parte deles que entrou na meta
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

/* ---------- insígnias ---------- */
export const insigniaById = (id) => { for (let i = 0; i < INSIGNIAS.length; i++) if (INSIGNIAS[i].id === id) return INSIGNIAS[i]; return null; };
export const insigniaIndex = (id) => { for (let i = 0; i < INSIGNIAS.length; i++) if (INSIGNIAS[i].id === id) return i; return -1; };
// Insígnia atual (a mais alta já alcançada) e o caminho até a próxima. p vai de 0 a 1 entre as duas.
export function levelFor(totalMl) {
  const L = Math.max(0, totalMl) / 1000;
  let i = 0;
  while (i < INSIGNIAS.length - 1 && L >= INSIGNIAS[i + 1].at) i++;
  const cur = INSIGNIAS[i], next = INSIGNIAS[i + 1] || null;
  return { i, id: cur.id, n: cur.n, e: cur.e, at: cur.at, next, liters: L, p: next ? Math.min(1, Math.max(0, (L - cur.at) / (next.at - cur.at))) : 1 };
}
// Quando cada insígnia foi alcançada, pela história de registros (momento do gole em que a soma de água passou do marco).
// Serve para datar insígnias de quem já usava o app, de um backup ou de outro aparelho. { id: ms }
export function insigniaDates(S) {
  const es = [];
  Object.keys(S.days || {}).forEach((k) => {
    const d = S.days[k];
    ((d && d.entries) || []).forEach((e) => { const v = eff(e); if (v > 0 && isFinite(e.t)) es.push([e.t, v]); });
  });
  es.sort((a, b) => a[0] - b[0]);
  const out = {};
  let cum = 0, i = 0;
  es.forEach((x) => {
    cum += x[1];
    while (i < INSIGNIAS.length && cum >= INSIGNIAS[i].at * 1000) { out[INSIGNIAS[i].id] = x[0]; i++; }
  });
  return out;
}
// Situação do recife para a tela da Jornada: a insígnia mais alta JÁ conquistada (ela nunca sai, mesmo que registros sejam apagados),
// a próxima, quanto falta (em ml) e o progresso 0..1 até ela, pela água acumulada.
export function reefFor(S, totalMl) {
  const mine = unlockedInsignias(S), cur = mine[mine.length - 1] || INSIGNIAS[0], i = insigniaIndex(cur.id), next = INSIGNIAS[i + 1] || null;
  const L = Math.max(0, totalMl) / 1000;
  return { cur, i, next, have: mine.length, liters: L,
    p: next ? Math.min(1, Math.max(0, (L - cur.at) / (next.at - cur.at))) : 1,
    leftMl: next ? Math.max(0, Math.round(next.at * 1000 - Math.max(0, totalMl))) : 0 };
}
// Insígnias que a água acumulada já alcançou e que ainda não foram guardadas em S.insignias (como as medalhas: depois de
// conquistada, nunca é retirada, nem se a pessoa apagar registros). A primeira (0 L) já nasce com a pessoa.
export function newInsignias(S, totalMl) {
  const got = S.insignias || {}, L = Math.max(0, totalMl) / 1000;
  return INSIGNIAS.filter((x) => !got[x.id] && L >= x.at);
}
// As conquistadas, na ordem do recife (da mais antiga para a mais nova)
export const unlockedInsignias = (S) => INSIGNIAS.filter((x) => !!(S.insignias || {})[x.id]);
// Mascote do perfil: a escolhida, se já foi conquistada; senão, a mais alta conquistada
export function mascotOf(S) {
  const mine = unlockedInsignias(S), want = S.profile && S.profile.mascot;
  const pick = want ? mine.filter((x) => x.id === want)[0] : null;
  return pick || mine[mine.length - 1] || INSIGNIAS[0];
}

/* ---------- missões do dia (determinísticas pela data) ---------- */
// As missões de volume (500 ml, 1 L, a meta) seguem o total da meta: só água, ou também os outros líquidos (até o limite)
// se a pessoa ligou "Somar na meta". As de "beber água" (6 vezes; manhã, tarde e noite) contam só registros de água.
const sumBefore = (es, min, g) => counted(es.filter((e) => minOf(e.t) < min), g);
export const MISSIONS = [
  { id: 'am500', e: '🌅', t: 'Beba 500 ml antes das 10h', p: (es, g) => sumBefore(es, 600, g) / 500 },
  { id: 'six', e: '🔁', t: 'Beba água 6 vezes hoje', p: (es) => es.filter(isWater).length / 6 },
  { id: 'by19', e: '⏱️', t: 'Bata a meta antes das 19h', p: (es, g) => sumBefore(es, 1140, g) / g },
  { id: 'thirds', e: '🌗', t: 'Beba água de manhã, à tarde e à noite', p: (es) => {
    const s = {}; es.filter(isWater).forEach((e) => { const m = minOf(e.t); s[m < 720 ? 'a' : m < 1080 ? 'b' : 'c'] = 1; });
    return Object.keys(s).length / 3; } },
  { id: 'noon', e: '☀️', t: 'Chegue a 1 L antes do meio-dia', p: (es, g) => sumBefore(es, 720, g) / 1000 },
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
  { id: 's14', e: '💎', t: 'Quinzena firme', d: '14 dias seguidos na meta', test: (c) => c.best >= 14 },
  { id: 's30', e: '🏆', t: 'Maré alta', d: '30 dias seguidos na meta', test: (c) => c.best >= 30 },
  { id: 'early', e: '🌅', t: 'Madrugador', d: '500 ml de água antes das 9h', test: (c) => c.early },
  { id: 'sunset', e: '🌇', t: 'Antes do pôr do sol', d: 'Meta batida antes das 18h', test: (c) => c.sunset },
  { id: 'mission', e: '🧭', t: 'Missão cumprida', d: 'Completou uma missão do dia', test: (c) => c.missions >= 1 },
  { id: 'm10', e: '🗺️', t: 'Explorador', d: '10 missões completas', test: (c) => c.missions >= 10 },
  { id: 'weekend', e: '🏖️', t: 'Fim de semana em dia', d: 'Meta no sábado e no domingo', test: (c) => c.weekend },
  { id: 'd10', e: '🎖️', t: 'Dez na meta', d: 'Meta batida em 10 dias, seguidos ou não', test: (c) => c.daysMet >= 10 },
];

// As medalhas de "primeiros registros" olham só a água (500 ml de água antes das 9h, primeira gota); o volume total de água
// agora vira insígnia (ver INSIGNIAS), não medalha. Já "bater a meta" (e a hora em que isso aconteceu) segue o total da meta,
// que inclui os outros líquidos se "Somar na meta" estiver ligado.
export function context(S) {
  const keys = Object.keys(S.days).sort();
  let totalMl = 0, entries = 0, daysMet = 0, early = false, sunset = false, weekend = false;
  keys.forEach((k) => {
    const day = S.days[k], g = day.goal || 2000, cap = mixCap(g), es = (day.entries || []).slice().sort((a, b) => a.t - b.t);
    let cum = 0, oth = 0, morning = 0, hit = -1;
    es.forEach((e) => {
      const v = eff(e), m = minOf(e.t);
      if (v) { cum += v; entries++; if (m < 540) morning += v; } else oth += otherMl(e);
      if (hit < 0 && cum + (MIX ? Math.min(oth, cap) : 0) >= g) hit = m;
    });
    totalMl += cum;
    if (morning >= 500) early = true;
    if (hit >= 0) {
      daysMet++;
      if (hit < 1080) sunset = true;
      if (keyToDate(k).getDay() === 6 && isMet(S.days[addDays(k, 1)])) weekend = true;
    }
  });
  return { totalMl, entries, daysMet, early, sunset, weekend,
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
    if (!d || !d.entries || !d.entries.some(isWater)) continue; // dia só com outros líquidos não conta como dia de dados
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
// profile.others: mostra a segunda gota (outros líquidos). profile.mix: soma os outros líquidos na meta (até metade dela; só vale
// com others ligado). profile.mascot: insígnia do perfil ('' = a mais alta). last = água dos copos rápidos; lastO = bebida de "outros líquidos".
// insignias: { id: ms } das conquistadas. social: amigos, DESTE aparelho (o login é por aparelho, então não vai para o backup):
// on = ativou os amigos; nick = nome que os amigos veem; share = mostra o progresso do dia; code = código de convite atual;
// push = "Avisos dos amigos" (pedido, aceite e aceno chegam como notificação; começa ligado, mas só vale com a permissão de notificação);
// goal = mostra a meta do dia em ml para a turma (null = ainda não decidiu, e então não mostra; true/false = a escolha da pessoa);
// hit = avisa quando alguém da turma bate a meta (começa desligado: é escolha de quem quer); week = resumo da turma no domingo à noite
// (começa ligado, mas, como todo aviso, só chega com push ligado e a permissão de notificação).
export function defaults(createdAt) {
  return {
    v: 1, onboarded: false, createdAt: createdAt || Date.now(),
    profile: { name: '', weight: 70, activity: 'moderate', wake: '07:00', sleep: '23:00', unit: 'ml', theme: 'auto', others: true, mix: false, mascot: '' },
    goal: { mode: 'auto', manual: 2500, climate: false, bonus: 0, temp: null, day: '' },
    cups: [150, 250, 350, 500], last: 'water', lastO: 'coffee',
    reminders: { enabled: false, interval: 90, smart: true, nextAt: 0 },
    days: {}, achievements: {}, missions: {}, insignias: {}, social: { on: false, nick: '', share: true, code: '', push: true, goal: null, hit: false, week: true }, ui: {},
  };
}
export function migrate(s) {
  if (!s || typeof s !== 'object') return defaults();
  const d = defaults(s.createdAt), o = Object.assign({}, d, s);
  ['profile', 'goal', 'reminders', 'ui', 'social'].forEach((k) => { o[k] = Object.assign({}, d[k], s[k]); });
  ['days', 'achievements', 'missions', 'insignias'].forEach((k) => { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; });
  if (!Array.isArray(o.cups) || o.cups.length !== 4) o.cups = d.cups.slice();
  o.profile.others = o.profile.others !== false;
  o.profile.mix = o.profile.mix === true; // "Somar outros líquidos na meta": só liga quando a pessoa pede
  o.profile.mascot = insigniaById(o.profile.mascot) ? o.profile.mascot : '';
  const sc = o.social;
  sc.on = sc.on === true;
  sc.nick = typeof sc.nick === 'string' ? sc.nick.slice(0, 20) : '';
  sc.share = sc.share !== false;
  sc.push = sc.push !== false;
  sc.goal = sc.goal === true ? true : sc.goal === false ? false : null;
  sc.hit = sc.hit === true;
  sc.week = sc.week !== false;
  sc.code = typeof sc.code === 'string' && /^[A-Z0-9]{8}$/.test(sc.code) ? sc.code : '';
  // Bebida dos copos rápidos: só água ou água com gás. Quem deixou café, chá etc. como padrão passa a tê-lo em "outros líquidos".
  const l = byId(o.last);
  if (l && l.g === 'o') { o.lastO = l.id; o.last = 'water'; } else o.last = l ? l.id : 'water';
  const lo = byId(o.lastO);
  if (!lo || lo.g !== 'o') o.lastO = d.lastO;
  // Refrigerante e álcool saíram do app: seus registros antigos são descartados (senão virariam "água" por engano)
  const days = {};
  Object.keys(o.days).forEach((k) => {
    const x = o.days[k];
    days[k] = x && Array.isArray(x.entries) && x.entries.some((e) => e && retired(e.d))
      ? Object.assign({}, x, { entries: x.entries.filter((e) => !(e && retired(e.d))) }) : x;
  });
  o.days = days;
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
