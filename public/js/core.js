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
// não entram). at = litros para desbloquear; a lista TEM que ficar em ordem crescente de at. A arte de cada uma está em art.js (mesmo id;
// o desenho vem de scripts/art/creatures.mjs, rode "npm run art"). e = emoji só para textos de compartilhar (nada do Unicode 12 em diante).
// O ritmo foi pensado para quem bebe cerca de 2,5 L de água por dia: a 2ª sai em ~4 dias, o cavalo-marinho (100 L) em ~6 semanas, o golfinho
// (400 L) em ~5 meses, o narval (1.000 L) em ~13 meses e a pérola (2.000 L) em ~2 anos. Até os 400 L os intervalos crescem aos poucos; dali até
// os 1.000 L há um bichinho a cada 150 L (~2 meses) e depois a cada 300 ou 400 L, para nunca haver um buraco longo sem novidade (1.4.0).
// Os ids são guardados no aparelho, na nuvem e no perfil dos amigos: nunca renomeie nem tire um; só acrescente (e mantenha o id com até 16
// letras, que é o limite do mascote nas regras do Firestore). Depois de mexer aqui, confira o limite de itens de "ins" em firestore.rules.
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
  { id: 'arraia-manta', n: 'Arraia-manta', e: '🐟', at: 550, cheer: 'Planando! Você já passou da metade do caminho até os mil litros.',
    fact: 'A arraia-manta "voa" debaixo da água, batendo as nadadeiras como asas. Algumas chegam a 7 metros de ponta a ponta.' },
  { id: 'baleia', n: 'Baleia', e: '🐋', at: 700, cheer: 'Gigante! É muita água e muita dedicação.',
    fact: 'A baleia-azul é o maior animal que já existiu, maior até que qualquer dinossauro.' },
  { id: 'orca', n: 'Orca', e: '🐳', at: 850, cheer: 'Rainha dos mares! Força, esperteza e muita constância.',
    fact: 'A orca é o maior golfinho do mundo. Ela vive em família, em grupos geralmente liderados pela fêmea mais velha.' },
  { id: 'narval', n: 'Narval', e: '🦄', at: 1000, cheer: 'Mil litros! Você é lenda da hidratação.',
    fact: 'O "chifre" do narval é um dente que cresce em espiral e pode passar de 2 metros.' },
  { id: 'peixe-pescador', n: 'Peixe-pescador', e: '🎣', at: 1300, cheer: 'Até no fundo do mar você brilha. Falta pouco para fechar o recife!',
    fact: 'A luzinha na ponta da "vara de pescar" é acesa por bactérias que moram ali e vivem em parceria com o peixe.' },
  { id: 'lula-gigante', n: 'Lula-gigante', e: '🦑', at: 1600, cheer: 'Lenda das profundezas! Seu recife está quase completo.',
    fact: 'A lula-gigante tem olhos do tamanho de um prato, entre os maiores do reino animal. A lenda do Kraken pode ter nascido dela.' },
  { id: 'perola', n: 'Pérola', e: '💎', at: 2000, cheer: 'Recife completo! De uma conchinha a uma pérola: foi gole a gole.',
    fact: 'A pérola nasce quando um grãozinho entra na ostra e ela o cobre, camadinha por camadinha, durante anos. Paciência e constância, como as suas.' },
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
// A ORDEM desta lista é um contrato (ver medalMask): cada medalha é um bit do perfil que a turma vê, e medalha nova entra só NO FIM (as 12 primeiras
// são da 1.0 a 1.5; as de 1.6.0 em diante vêm depois). A Jornada mostra por grupo (MEDAL_GROUPS), então a ordem da tela não segue a do bit.
// p (opcional) = o andamento de quem ainda não a tem: [quanto já fez, quanto precisa, unidade]; sem p, a medalha é "tudo ou nada" e a
// Jornada não mostra quanto falta. test e p olham o contexto de context(): as duas contas têm que concordar (tests/core.test.js confere).
export const ACHIEVEMENTS = [
  { id: 'first', e: '💧', t: 'Primeira gota', d: 'Fez o primeiro registro', test: (c) => c.entries >= 1 },
  { id: 'goal', e: '🎯', t: 'Na mosca', d: 'Bateu a meta pela 1ª vez', test: (c) => c.daysMet >= 1 },
  { id: 's3', e: '🔥', t: 'Pegando o ritmo', d: '3 dias seguidos na meta', p: (c) => [c.best, 3, 'dias'], test: (c) => c.best >= 3 },
  { id: 's7', e: '🌊', t: 'Semana fluida', d: '7 dias seguidos na meta', p: (c) => [c.best, 7, 'dias'], test: (c) => c.best >= 7 },
  { id: 's14', e: '💎', t: 'Quinzena firme', d: '14 dias seguidos na meta', p: (c) => [c.best, 14, 'dias'], test: (c) => c.best >= 14 },
  { id: 's30', e: '🏆', t: 'Maré alta', d: '30 dias seguidos na meta', p: (c) => [c.best, 30, 'dias'], test: (c) => c.best >= 30 },
  { id: 'early', e: '🌅', t: 'Madrugador', d: '500 ml de água antes das 9h', test: (c) => c.early },
  { id: 'sunset', e: '🌇', t: 'Antes do pôr do sol', d: 'Meta batida antes das 18h', test: (c) => c.sunset },
  { id: 'mission', e: '🧭', t: 'Missão cumprida', d: 'Completou uma missão do dia', test: (c) => c.missions >= 1 },
  { id: 'm10', e: '🗺️', t: 'Explorador', d: '10 missões completas', p: (c) => [c.missions, 10, 'missões'], test: (c) => c.missions >= 10 },
  { id: 'weekend', e: '🏖️', t: 'Fim de semana em dia', d: 'Meta no sábado e no domingo', test: (c) => c.weekend },
  { id: 'd10', e: '🎖️', t: 'Dez na meta', d: 'Meta batida em 10 dias, seguidos ou não', p: (c) => [c.daysMet, 10, 'dias'], test: (c) => c.daysMet >= 10 },
  // 1.6.0: os bits 12 a 23
  { id: 's60', e: '🌕', t: 'Maré viva', d: '60 dias seguidos na meta', p: (c) => [c.best, 60, 'dias'], test: (c) => c.best >= 60 },
  { id: 's100', e: '🔱', t: 'Lenda da maré', d: '100 dias seguidos na meta', p: (c) => [c.best, 100, 'dias'], test: (c) => c.best >= 100 },
  { id: 'd30', e: '🏅', t: 'Trinta na meta', d: 'Meta batida em 30 dias, seguidos ou não', p: (c) => [c.daysMet, 30, 'dias'], test: (c) => c.daysMet >= 30 },
  { id: 'd100', e: '💯', t: 'Cem na meta', d: 'Meta batida em 100 dias, seguidos ou não', p: (c) => [c.daysMet, 100, 'dias'], test: (c) => c.daysMet >= 100 },
  { id: 'm30', e: '⛵', t: 'Navegador', d: '30 missões completas', p: (c) => [c.missions, 30, 'missões'], test: (c) => c.missions >= 30 },
  { id: 'early7', e: '🌄', t: 'Alvorada', d: '500 ml de água antes das 9h, em 7 dias', p: (c) => [c.earlyDays, 7, 'dias'], test: (c) => c.earlyDays >= 7 },
  { id: 'sunset5', e: '⏳', t: 'Relógio da maré', d: 'Meta batida antes das 18h, em 5 dias', p: (c) => [c.sunsetDays, 5, 'dias'], test: (c) => c.sunsetDays >= 5 },
  { id: 'thirds7', e: '🌗', t: 'Dia redondo', d: 'Água de manhã, tarde e noite, em 7 dias', p: (c) => [c.thirdsDays, 7, 'dias'], test: (c) => c.thirdsDays >= 7 },
  { id: 'win25', e: '🥇', t: 'Mês de ouro', d: 'Meta batida em 25 de 30 dias corridos', p: (c) => [c.win30, 25, 'dias'], test: (c) => c.win30 >= 25 },
  { id: 'back', e: '🏄', t: 'Volta por cima', d: 'Bateu a meta depois de 3 dias sem bater', test: (c) => c.back },
  { id: 'weekends4', e: '🏝️', t: 'Fins de semana firmes', d: 'Sábado e domingo na meta, 4 vezes', p: (c) => [c.weekends, 4, 'fins de semana'], test: (c) => c.weekends >= 4 },
  { id: 'wwd', e: '🌍', t: 'Dia Mundial da Água', d: 'Água registrada em 22 de março', test: (c) => c.wwd },
  // 1.7.0: os bits 24 a 29, que vão na SEGUNDA palavra da máscara (md2; ver medalMask2). live = não sai do histórico: é dada na hora em que acontece
  // (a turma só existe ao vivo) e fica guardada em S.achievements, por isso é a data guardada que vale e ela vai no backup da conta.
  { id: 'm1', e: '📆', t: 'Um mês de Maré', d: 'Água registrada em 30 dias diferentes', p: (c) => [c.daysUsed, 30, 'dias'], test: (c) => c.daysUsed >= 30 },
  { id: 'use100', e: '🏵️', t: 'Cem dias de Maré', d: 'Água registrada em 100 dias diferentes', p: (c) => [c.daysUsed, 100, 'dias'], test: (c) => c.daysUsed >= 100 },
  { id: 'summer', e: '🌞', t: 'Verão em dia', d: 'Meta batida em 30 dias entre 21 de dezembro e 20 de março', test: (c) => c.summer >= 30 },
  { id: 'weekends12', e: '🌴', t: 'Fins de semana de ouro', d: 'Sábado e domingo na meta, 12 vezes', p: (c) => [c.weekends, 12, 'fins de semana'], test: (c) => c.weekends >= 12 },
  { id: 'oceans', e: '⚓', t: 'Dia dos Oceanos', d: 'Água registrada em 8 de junho', test: (c) => c.oceans },
  { id: 'crew', e: '🤝', t: 'Turma completa', d: 'Você e pelo menos 2 amigos bateram a meta no mesmo dia', live: true, test: () => false },
];
export const MEDALS_1_5 = 12; // quantas medalhas já existiam até a 1.5.x: as do índice 12 em diante chegaram na 1.6.0
export const MEDALS_1_6 = 24; // até a 1.6.x: as do índice 24 em diante chegaram na 1.7.0 (e vão na segunda palavra da máscara)
export const CREW_MIN = 3; // a medalha "Turma completa" pede você e pelo menos 2 amigos (3 pessoas) na meta no mesmo dia
export const achievementById = (id) => { for (let i = 0; i < ACHIEVEMENTS.length; i++) if (ACHIEVEMENTS[i].id === id) return ACHIEVEMENTS[i]; return null; };
// Como a Jornada agrupa as medalhas (do mais simples ao mais difícil dentro de cada grupo). Só a tela usa isto: o bit de cada medalha segue a ordem de ACHIEVEMENTS.
// tests/core.test.js confere que toda medalha aparece em exatamente um grupo.
export const MEDAL_GROUPS = [
  { t: 'Começos e missões', ids: ['first', 'goal', 'mission', 'm10', 'm1', 'm30', 'use100'] },
  { t: 'Sequências', ids: ['s3', 's7', 's14', 's30', 's60', 's100'] },
  { t: 'Metas batidas', ids: ['d10', 'd30', 'd100', 'win25', 'back'] },
  { t: 'Rotina do dia', ids: ['early', 'early7', 'sunset', 'sunset5', 'thirds7'] },
  { t: 'Fins de semana e datas', ids: ['weekend', 'weekends4', 'weekends12', 'summer', 'wwd', 'oceans'] },
  { t: 'Com a turma', ids: ['crew'] },
];

/* Fatos de um dia para as medalhas. goal = day.goal || 2000; hit = o minuto do dia em que a meta foi batida (-1 = não bateu), com a mesma regra de
   isMet (água, mais os outros líquidos até o limite, se "somar na meta" estiver ligado). first = minuto do primeiro registro de água (-1 = nenhum);
   morning / m10 = água antes das 9h / das 10h; parts = em quantos terços do dia (manhã, tarde, noite) houve água. */
function dayFact(day, k) {
  const g = day.goal || 2000, cap = mixCap(g), es = (day.entries || []).slice().sort((a, b) => a.t - b.t), seen = {};
  let cum = 0, oth = 0, morning = 0, m10 = 0, hit = -1, first = -1, n = 0, parts = 0;
  es.forEach((e) => {
    const v = eff(e), m = minOf(e.t);
    if (v) {
      cum += v; n++;
      if (m < 540) morning += v;
      if (m < 600) m10 += v;
      if (first < 0 || m < first) first = m;
      const part = m < 720 ? 0 : m < 1080 ? 1 : 2;
      if (!seen[part]) { seen[part] = 1; parts++; }
    } else oth += otherMl(e);
    if (hit < 0 && cum + (MIX ? Math.min(oth, cap) : 0) >= g) hit = m;
  });
  return { k: k, cum: cum, n: n, morning: morning, m10: m10, hit: hit, first: first, parts: parts };
}
const dayFacts = (S) => Object.keys(S.days).sort().map((k) => dayFact(S.days[k], k));
const dnum = (k) => { const p = k.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }; // o dia como um número inteiro (sem fuso nem horário de verão)
// O verão (de 21 de dezembro a 20 de março) a que um dia pertence: o ano em que ele começou (dezembro de 2026 e fevereiro de 2027 são o verão 2026), ou 0 se não é verão
const summerOf = (k) => { const y = +k.slice(0, 4), md = k.slice(5); return md >= '12-21' ? y : md <= '03-20' ? y - 1 : 0; };

// O que as medalhas olham, somado de todos os dias até upTo (uma chave de dia; sem ele, o histórico inteiro). missionKeys = os dias das missões cumpridas.
function contextFrom(facts, upTo, missionKeys) {
  let totalMl = 0, entries = 0, earlyDays = 0, sunsetDays = 0, thirdsDays = 0, daysUsed = 0, summer = 0, wwd = false, oceans = false;
  const met = [], seasons = {};
  facts.forEach((f) => {
    if (upTo && f.k > upTo) return;
    totalMl += f.cum; entries += f.n;
    if (f.morning >= 500) earlyDays++;
    if (f.parts === 3) thirdsDays++;
    if (f.n) {
      daysUsed++;
      if (f.k.slice(5) === '03-22') wwd = true; // 22 de março, o Dia Mundial da Água
      if (f.k.slice(5) === '06-08') oceans = true; // 8 de junho, o Dia Mundial dos Oceanos
    }
    if (f.hit >= 0) {
      met.push(dnum(f.k));
      if (f.hit < 1080) sunsetDays++;
      const s = summerOf(f.k); // os dias de meta de cada verão, e vale o verão em que houve mais
      if (s) { seasons[s] = (seasons[s] || 0) + 1; if (seasons[s] > summer) summer = seasons[s]; }
    }
  });
  // sequências, janela de 30 dias, "volta por cima" e fins de semana saem da lista (em ordem) dos dias de meta
  let best = 0, run = 0, win30 = 0, weekends = 0, back = false, i = 0;
  for (let j = 0; j < met.length; j++) {
    run = j && met[j] - met[j - 1] === 1 ? run + 1 : 1;
    if (run > best) best = run;
    if (j && met[j] - met[j - 1] >= 4) back = true; // pelo menos 3 dias sem meta entre uma meta e a seguinte
    while (met[j] - met[i] > 29) i++; // a janela vai de i a j: no máximo 30 dias do calendário
    if (j - i + 1 > win30) win30 = j - i + 1;
    if ((((met[j] + 4) % 7) + 7) % 7 === 6 && met[j + 1] === met[j] + 1) weekends++; // sábado (o dia 0 do calendário, 1/1/1970, foi quinta) e o domingo seguinte, os dois na meta
  }
  const missions = upTo ? missionKeys.filter((k) => k <= upTo).length : missionKeys.length;
  return { totalMl, entries, daysMet: met.length, early: earlyDays >= 1, sunset: sunsetDays >= 1, weekend: weekends >= 1,
    earlyDays, sunsetDays, thirdsDays, weekends, win30, back, wwd, best, missions, daysUsed, summer, oceans };
}
// As medalhas de "primeiros registros" olham só a água (500 ml de água antes das 9h, primeira gota); o volume total de água
// agora vira insígnia (ver INSIGNIAS), não medalha. Já "bater a meta" (e a hora em que isso aconteceu) segue o total da meta,
// que inclui os outros líquidos se "Somar na meta" estiver ligado.
export function context(S, upTo) {
  return contextFrom(dayFacts(S), upTo || '', Object.keys(S.missions || {}));
}
export function newAchievements(S, ctx) {
  const c = ctx || context(S), got = S.achievements || {};
  return ACHIEVEMENTS.filter((a) => !got[a.id] && a.test(c));
}
// Quando cada medalha da lista foi cumprida pelo histórico: o primeiro dia em que a conta já fechava (todas só crescem com o tempo, então basta
// uma busca binária pelos dias). Serve para datar medalhas que entram sem festa (backup, outro aparelho, medalha nova de uma versão nova) com o
// dia em que a pessoa de fato as mereceu, e não com o dia em que o app as notou. { id: ms }; sem data (a conta só fecha com missões de um dia sem registro) = fora.
export function medalDates(S, list) {
  const pend = list || newAchievements(S), out = {};
  if (!pend.length) return out;
  const facts = dayFacts(S), mk = Object.keys(S.missions || {}), memo = {}, now = Date.now();
  const at = (i) => memo[i] || (memo[i] = contextFrom(facts, facts[i].k, mk));
  pend.forEach((a) => {
    let lo = 0, hi = facts.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (a.test(at(mid))) { found = mid; hi = mid - 1; } else lo = mid + 1;
    }
    if (found >= 0) out[a.id] = Math.min(now, keyToDate(facts[found].k).getTime());
  });
  return out;
}
// O andamento de uma medalha ainda não conquistada: { have, need, unit, pct } (have nunca passa de need), ou null se ela é "tudo ou nada".
export function medalProgress(a, c) {
  if (!a.p) return null;
  const x = a.p(c), need = x[1], have = Math.max(0, Math.min(need, Math.floor(+x[0] || 0)));
  return { have: have, need: need, unit: x[2], pct: Math.round((have / need) * 100) };
}
// A medalha que falta e está mais perto de sair (a maior fração do caminho, com pelo menos um passo dado); { a, have, need, unit, pct } ou null.
export function nearestMedal(S, c) {
  const got = S.achievements || {};
  let best = null;
  ACHIEVEMENTS.forEach((a) => {
    if (got[a.id]) return;
    const pr = medalProgress(a, c);
    if (pr && pr.have >= 1 && pr.have < pr.need && (!best || pr.pct > best.pct)) best = { a: a, have: pr.have, need: pr.need, unit: pr.unit, pct: pr.pct };
  });
  return best;
}
// As medalhas que vão ao perfil dos amigos (1.5.0): máscaras de bits na ordem de ACHIEVEMENTS (o bit i é ACHIEVEMENTS[i]). Essa ORDEM é um
// contrato com a nuvem e com os amigos: medalha nova entra só NO FIM da lista; nunca se reordena nem se remove (tests/core.test.js trava isso).
// A máscara tem DUAS palavras, porque as regras do Firestore (as de 30/10/2026, que os celulares de todo mundo ainda usam) só aceitam 24 bits em "md":
//   md  = as medalhas de índice 0 a 23, até 16777215 (MEDAL_MAX; firestore.rules). Quem está na 1.6.0 ou antes só lê esta palavra.
//   md2 = as de índice 24 a 54 (1.7.0), até 2147483647 (MEDAL_MAX2; firestore.rules). Só vai ao perfil quando não é zero.
// Uma palavra única maior faria um app antigo ler o excesso como "todas as 24 medalhas" (ele corta o valor no teto): por isso a palavra nova é à parte.
// Com as duas, a lista cabe até MEDAL_CAP (55) medalhas. Passar disso: ver "Como acrescentar uma medalha" no HANDOFF.
export const MEDAL_MAX = 24;
export const MEDAL_MAX2 = 31;
export const MEDAL_CAP = MEDAL_MAX + MEDAL_MAX2;
// A palavra das medalhas de índice lo a lo + n − 1, com o bit 0 na primeira delas
function maskWord(S, lo, n) {
  const got = S.achievements || {};
  let m = 0;
  ACHIEVEMENTS.forEach((a, i) => { if (i >= lo && i < lo + n && got[a.id]) m |= 1 << (i - lo); });
  return m;
}
export const medalMask = (S) => maskWord(S, 0, MEDAL_MAX);
export const medalMask2 = (S) => maskWord(S, MEDAL_MAX, MEDAL_MAX2);
// O caminho de volta: as medalhas das duas palavras, na ordem de ACHIEVEMENTS. Bits que este app não conhece (medalha de uma versão mais nova) ficam de fora.
export const medalsFromMask = (m, m2) => ACHIEVEMENTS.filter((a, i) => (i < MEDAL_MAX ? ((m >> i) & 1) === 1 : i < MEDAL_CAP && (((m2 || 0) >> (i - MEDAL_MAX)) & 1) === 1));
// Junta medalhas de outra cópia (o backup da conta, o arquivo de backup) às deste aparelho: de cada uma vale a data MAIS ANTIGA. Entram só ids que este
// app conhece e carimbos de verdade (número positivo). Devolve quantas mudaram aqui (medalha nova ou data mais antiga).
export function mergeAch(into, from) {
  let n = 0;
  if (!from || typeof from !== 'object') return n;
  ACHIEVEMENTS.forEach((a) => {
    const t = +from[a.id], cur = +into[a.id];
    if (!(t > 0) || !isFinite(t)) return;
    if (!(cur > 0) || t < cur) { into[a.id] = t; n++; }
  });
  return n;
}

/* ---------- estatísticas e padrões ---------- */
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

// "Seus padrões" (Jornada): o que os registros das últimas 4 semanas (sem hoje, que ainda não acabou) dizem do jeito da pessoa beber. Só vale com pelo
// menos PATTERN_MIN dias de água. Devolve { n, ready, sum, day, week, texts }:
//   sum = o resumo; day = { texts, rhythm } (o ritmo do dia, das últimas 2 semanas); week = { texts, cols, best } (a média da meta por dia da semana);
//   texts = tudo junto, na ordem da tela. Cada texto é { e, t }. rhythm = { from, v, max, dry, peak } (v = a água de cada hora, a partir da hora from;
//   dry e peak = a hora em que começa a janela de 3 h mais seca e a de mais água, ou -1); cols = 7 colunas, domingo primeiro: { wd, avg (0 a mais de 1; null se
//   não houve esse dia), n }; best = o dia da semana de maior média (-1 se nenhum tem 2 dias).
export const PATTERN_MIN = 4;
const WD_PL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];
const zeros = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(0); return a; };
const pcent = (x) => Math.round(x * 100);
const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const clock = (min) => { const m = Math.round(min) % 1440; return Math.floor(m / 60) + 'h' + (m % 60 ? pad(m % 60) : ''); }; // 560 → "9h20", 1110 → "18h30", 420 → "7h"
const lapse = (min) => { const m = Math.round(min / 10) * 10; return Math.floor(m / 60) + 'h' + (m % 60 ? pad(m % 60) : ''); }; // 160 → "2h40", 120 → "2h"
export function patterns(S, today, p) {
  const out = { n: 0, ready: false, sum: [], day: { texts: [], rhythm: null }, week: { texts: [], cols: [], best: -1 }, texts: [] };
  const hours = zeros(24), wdS = zeros(7), wdC = zeros(7), firsts = [], hits = [];
  const keys = Object.keys(S.days).sort(), made = dayKey(new Date(S.createdAt || Date.now())), from = keys.length && keys[0] < made ? keys[0] : made;
  let n = 0, am = 0, all = 0, cnt = 0, met = 0, mC = 0, mHit = 0, oC = 0, oHit = 0, weC = 0, weS = 0, wkC = 0, wkS = 0;
  for (let i = 1; i <= 28; i++) {
    const k = addDays(today, -i), d = S.days[k];
    if (k >= from) { cnt++; if (isMet(d)) met++; }
    if (!d || !d.entries || !d.entries.some(isWater)) continue; // dia só com outros líquidos não conta como dia de dados
    n++;
    const wd = keyToDate(k).getDay(), pcDay = dayTotal(d) / (d.goal || 2000), f = dayFact(d, k);
    wdS[wd] += pcDay; wdC[wd]++;
    if (wd === 0 || wd === 6) { weS += pcDay; weC++; } else { wkS += pcDay; wkC++; }
    if (f.first >= 0) firsts.push(f.first);
    if (f.hit >= 0) hits.push(f.hit);
    if (f.m10 >= 500) { mC++; if (f.hit >= 0) mHit++; } else { oC++; if (f.hit >= 0) oHit++; }
    d.entries.forEach((e) => {
      const v = eff(e), h = new Date(e.t).getHours();
      if (i <= 14) hours[h] += v; // o ritmo do dia olha só as 2 últimas semanas: é o hábito de agora
      all += v; if (h < 12) am += v;
    });
  }
  out.n = n;
  if (n < PATTERN_MIN) return out;
  out.ready = true;
  const sum = out.sum, dt = out.day.texts, wt = out.week.texts, w = dayWindow(p.wake, p.sleep);

  // resumo: constância e tendência
  if (met === 0) sum.push({ e: '🎯', t: 'Você registrou água em ' + n + ' dias, mas ainda não bateu a meta. Comece com um copo ao acordar e vá aos poucos.' });
  else sum.push({ e: '🎯', t: 'Você bateu a meta em ' + met + ' dos últimos ' + cnt + ' dias (' + pcent(met / cnt) + '%).' + (met / cnt >= 0.8 ? ' Constância de respeito!' : '') });
  let a = 0, b = 0;
  for (let i = 1; i <= 7; i++) { a += dayTotal(S.days[addDays(today, -i)]); b += dayTotal(S.days[addDays(today, -i - 7)]); }
  if (b > 0) {
    const pct = Math.round(((a - b) / b) * 100);
    sum.push({ e: pct >= 0 ? '📈' : '📉', t: (pct >= 0 ? '+' : '') + pct + '% de hidratação nos últimos 7 dias em relação aos 7 anteriores.' });
  }

  // ritmo do dia: o período mais seco e o de mais água (janelas de 3 h dentro do horário em que a pessoa está acordada), a manhã e o começo do dia
  const h0 = Math.ceil(w.start / 60), last = Math.min(21, Math.floor(w.end / 60) - 3);
  let dry = -1, dryV = Infinity, peak = -1, peakV = 0;
  for (let h = h0; h <= last; h++) {
    const v = hours[h] + hours[h + 1] + hours[h + 2];
    if (v < dryV) { dryV = v; dry = h; }
    if (v > peakV) { peakV = v; peak = h; }
  }
  if (peak === dry) peak = -1; // distribuição reta: não há um "pico" a destacar
  const recent = hours.reduce((s, v) => s + v, 0); // sem água nas 2 últimas semanas todas as janelas empatam em zero: não há um "período mais seco" a apontar
  if (dry >= 0 && recent > 0) dt.push({ e: '🏜️', t: 'Seu período mais seco costuma ser das ' + dry + 'h às ' + (dry + 3) + 'h. Deixe uma garrafa por perto nesse horário.' });
  const share = all ? Math.round((am / all) * 100) : 0;
  dt.push(share < 30
    ? { e: '☀️', t: 'Só ' + share + '% da sua água vem antes do meio-dia. Um copo ao acordar faz diferença.' }
    : { e: '☀️', t: 'Boa! ' + share + '% da sua água vem antes do meio-dia.' });
  if (mC >= 3 && oC >= 3 && mHit / mC - oHit / oC >= 0.2) {
    dt.push({ e: '🌅', t: 'Nos dias em que você bebe 500 ml antes das 10h, bate a meta em ' + pcent(mHit / mC) + '% das vezes; nos outros, em ' + pcent(oHit / oC) + '%.' });
  }
  if (firsts.length >= PATTERN_MIN) {
    const mf = median(firsts), late = mf - hm(p.wake);
    if (late >= 90) dt.push({ e: '⏰', t: 'Seu primeiro copo costuma vir às ' + clock(mf) + ', cerca de ' + lapse(late) + ' depois de acordar. Um copo logo ao levantar ajuda a pegar o ritmo.' });
  }
  if (hits.length >= 3) {
    const mh = median(hits);
    dt.push({ e: '⌚', t: 'Você costuma completar a meta por volta das ' + clock(mh) + '.' +
      (mh >= w.end - 90 ? ' Tão perto da hora de dormir pode atrapalhar o sono: tente adiantar um pouco.' : '') });
  }
  let a0 = Math.floor(w.start / 60), b0 = Math.min(23, Math.floor(w.end / 60)), mx = 0;
  for (let h = 0; h < 24; h++) if (hours[h] > 0) { if (h < a0) a0 = h; if (h > b0) b0 = h; }
  const bars = [];
  for (let h = a0; h <= b0; h++) { bars.push(hours[h]); if (hours[h] > mx) mx = hours[h]; }
  if (mx > 0) out.day.rhythm = { from: a0, v: bars, max: mx, dry: dry, peak: peak };

  // semana: a média da meta em cada dia da semana (só dias com água), o melhor, o mais difícil e o fim de semana contra os dias úteis
  let bi = -1, bv = 0, wi = -1, wv = Infinity;
  for (let i = 0; i < 7; i++) {
    out.week.cols.push({ wd: i, avg: wdC[i] ? wdS[i] / wdC[i] : null, n: wdC[i] });
    if (wdC[i] >= 2) { const x = wdS[i] / wdC[i]; if (x > bv) { bv = x; bi = i; } if (x < wv) { wv = x; wi = i; } }
  }
  out.week.best = bi;
  if (bi >= 0) wt.push({ e: '📅', t: 'Você se hidrata melhor ' + (bi === 0 || bi === 6 ? 'aos ' : 'às ') + WD_PL[bi] + ': em média ' + Math.round(bv * 100) + '% da meta.' });
  if (bi >= 0 && wi !== bi && bv - wv >= 0.2) {
    wt.push({ e: '🐢', t: 'Seu ponto fraco são ' + (wi === 0 || wi === 6 ? 'os ' : 'as ') + WD_PL[wi] + ': em média ' + Math.round(wv * 100) + '% da meta.' });
  }
  if (weC >= 2 && wkC >= 3) {
    const we = weS / weC, wk = wkS / wkC;
    if (wk - we >= 0.15) wt.push({ e: '🗓️', t: 'Nos fins de semana você fica em média em ' + pcent(we) + '% da meta, contra ' + pcent(wk) + '% nos dias úteis. Sem a rotina é fácil esquecer: deixe a garrafa à vista.' });
    else if (we - wk >= 0.15) wt.push({ e: '🗓️', t: 'Nos dias úteis você fica em média em ' + pcent(wk) + '% da meta, contra ' + pcent(we) + '% nos fins de semana. Uma garrafa na mesa de trabalho pode ajudar.' });
  }
  out.texts = sum.concat(dt, wt);
  return out;
}
// Os textos de "Seus padrões", numa lista só (a mesma de patterns().texts)
export const insights = (S, today, p) => patterns(S, today, p).texts;

/* ---------- os meses (1.7.0) ---------- */
// "Seus meses" (Jornada): o mês de agora contra o anterior, e um calendário colorido das últimas 13 semanas (um quadradinho por dia, como o do GitHub).
// O primeiro dia de uso é o mais antigo entre o primeiro registro e a criação do app; antes dele não há "dia sem registro". Hoje nunca entra na conta de um
// mês (ainda não acabou), e um dia sem nenhum registro vale 0 ml e "não bateu a meta" (como em "Constância 30d" e na medalha Mês de ouro).
export const MONTH_MIN = 7; // dias de cada mês (desde que a pessoa começou) para um poder ser comparado com o outro
export const MONTH_USED = 3; // e dias com água em cada um (sem isso, um mês de férias sem registro viraria "-100%")
export const HM_WEEKS = 13; // semanas do calendário colorido (3 meses): os quadradinhos ficam legíveis até numa tela de 280 px
export const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ymAdd = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const ymDays = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const firstDay = (S) => { const keys = Object.keys(S.days).sort(), made = dayKey(new Date(S.createdAt || Date.now())); return keys.length && keys[0] < made ? keys[0] : made; };
// Os números de um pedaço de mês, dos dias a a b (chaves de dia): quantos dias, quantos na meta, quantos com água, a média de ml por dia e a taxa de dias na meta (0 a 1)
function monthStats(S, a, b) {
  let days = 0, met = 0, ml = 0, used = 0;
  for (let k = a; k <= b; k = addDays(k, 1)) {
    const d = S.days[k];
    days++; ml += dayTotal(d);
    if (isMet(d)) met++;
    if (d && d.entries && d.entries.some(isWater)) used++;
  }
  return { days: days, met: met, used: used, avg: Math.round(ml / days), rate: met / days };
}
// Devolve { ready, cur, prev, texts }. cur e prev = { ym ('2026-10'), days, met, used, avg, rate }: os dias que contam de cada mês (do primeiro dia de uso e até ontem, no mês de agora).
// O "mês de agora" é o do último dia que já acabou (ontem); se ele ainda tem menos de MONTH_MIN dias (começo de mês), vale o mês que passou, inteiro, contra o anterior a ele.
// ready = os dois meses têm MONTH_MIN dias e MONTH_USED com água. texts = o que dizer, em { e, t }: uma frase sobre a média e outra sobre os dias na meta.
export function months(S, today) {
  const last = addDays(today, -1), first = firstDay(S), out = { ready: false, cur: null, prev: null, texts: [] };
  const stat = (ym) => {
    const a = ym + '-01' > first ? ym + '-01' : first, e = ym + '-' + pad(ymDays(ym)), b = e < last ? e : last;
    return a <= b ? Object.assign({ ym: ym }, monthStats(S, a, b)) : null;
  };
  let ym = last.slice(0, 7), cur = stat(ym);
  if (!cur || cur.days < MONTH_MIN) { ym = ymAdd(ym, -1); cur = stat(ym); }
  const prev = cur ? stat(ymAdd(ym, -1)) : null, ok = (m) => !!m && m.days >= MONTH_MIN && m.used >= MONTH_USED;
  out.cur = cur; out.prev = prev;
  if (!ok(cur) || !ok(prev)) return out;
  out.ready = true;
  const c = MONTH_NAMES[+cur.ym.slice(5, 7) - 1], p = MONTH_NAMES[+prev.ym.slice(5, 7) - 1], d = prev.avg > 0 ? Math.round(((cur.avg - prev.avg) / prev.avg) * 100) : null;
  if (d != null) {
    out.texts.push(Math.abs(d) < 3 ? { e: '➡️', t: 'Sua média por dia em ' + c + ' está igual à de ' + p + '.' }
      : { e: d > 0 ? '📈' : '📉', t: 'Sua média por dia em ' + c + ' está ' + Math.abs(d) + '% ' + (d > 0 ? 'acima' : 'abaixo') + ' da de ' + p + '.' });
  }
  if (cur.met > 0 || prev.met > 0) {
    out.texts.push({ e: '🎯', t: 'Você bateu a meta em ' + pcent(cur.rate) + '% dos dias de ' + c + ', contra ' + pcent(prev.rate) + '% em ' + p + '.' +
      (pcent(cur.rate) - pcent(prev.rate) >= 10 ? ' Que evolução!' : '') });
  }
  return out;
}
// O calendário colorido: HM_WEEKS colunas = semanas (de domingo a sábado; a última é a de hoje), com 7 quadradinhos por coluna (a última coluna para em hoje).
// Cada dia é { k, l, ml, today }: l = -1 (antes de a pessoa começar: só o lugar vazio), 0 (sem registro), 1 (menos da metade da meta), 2 (metade ou mais) e 3 (meta
// batida): os mesmos níveis do calendário do Histórico. Devolve { cols, labels, span, met, text }: labels = [{ w, m }], o mês (abreviado) que começa na coluna w
// (a primeira coluna diz o mês dela quando nenhum começa nas 3 primeiras); span = os dias que contam (do primeiro dia de uso até hoje) e met = os que bateram a meta.
export function heatmap(S, today) {
  const first = firstDay(S), start = addDays(today, -keyToDate(today).getDay() - 7 * (HM_WEEKS - 1)), cols = [], labels = [];
  let met = 0, span = 0;
  for (let w = 0; w < HM_WEEKS; w++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const k = addDays(start, 7 * w + r);
      if (k > today) break;
      if (k.slice(8) === '01') labels.push({ w: w, m: MONTH_ABBR[+k.slice(5, 7) - 1] });
      if (k < first) { col.push({ k: k, l: -1, ml: 0, today: false }); continue; }
      const d = S.days[k], t = dayTotal(d), g = (d && d.goal) || goalToday(S, k), l = !t ? 0 : isMet(d) ? 3 : t >= g / 2 ? 2 : 1;
      span++;
      if (l === 3) met++;
      col.push({ k: k, l: l, ml: t, today: k === today });
    }
    cols.push(col);
  }
  if (!labels.some((x) => x.w < 3)) labels.unshift({ w: 0, m: MONTH_ABBR[+start.slice(5, 7) - 1] });
  return { cols: cols, labels: labels, span: span, met: met,
    text: !span ? '' : met ? 'Você bateu a meta em ' + met + ' de ' + span + (span === 1 ? ' dia.' : ' dias.') : 'Ainda sem meta batida neste calendário. Cada gole conta!' };
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
