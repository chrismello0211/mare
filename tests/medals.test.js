// Maré — testes das medalhas da 1.6.0 (as 24 medalhas, o andamento, a data de cada uma) e de "Seus padrões". Rodar: npm test
// As datas são fixas (2026) e os horários, locais: valem em qualquer fuso.
import { describe, it, expect, afterEach } from 'vitest';
import * as C from '../public/js/core.js';

afterEach(() => { C.setMix(false); }); // "somar na meta" é um interruptor global: todo teste começa com ele desligado

const ts = (k, h, m) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); };
// Um dia de registros: list = [[hora, minuto, ml, bebida?]]
const dayOf = (k, goal, list) => ({ goal: goal, entries: list.map((x, i) => ({ id: k + '-' + i, t: ts(k, x[0], x[1]), ml: x[2], d: x[3] || 'water' })) });
const metDay = (k, h) => dayOf(k, 2000, [[h || 10, 0, 2000]]); // meta batida de uma vez, às h (10h se não disser)
const missDay = (k, h) => dayOf(k, 2000, [[h || 10, 0, 500]]); // dia com água, mas sem meta
const D0 = '2026-01-01'; // uma quinta-feira
const K = (n) => C.addDays(D0, n); // o dia n a partir de D0 (K(2) é sábado, K(3) é domingo)
const ids = (S) => C.newAchievements(S).map((a) => a.id);
const stateWith = (days) => { const S = C.defaults(ts('2025-12-01', 9)); Object.keys(days).forEach((k) => { S.days[k] = days[k]; }); return S; };
const streakOf = (from, n) => { const o = {}; for (let i = 0; i < n; i++) o[K(from + i)] = metDay(K(from + i)); return o; };
// Gerador fixo (as mesmas "sorteios" em toda rodada)
const rng = (seed) => () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };

/* ---------- a lista, os grupos e o andamento ---------- */
describe('as 24 medalhas: lista, grupos e andamento', () => {
  it('cada medalha tem emoji, título e descrição; os ids são únicos e o último bit é o 23 (a lista está cheia: a 25ª pede regra nova)', () => {
    expect(C.ACHIEVEMENTS.length).toBe(24);
    expect(C.MEDAL_MAX).toBe(24);
    C.ACHIEVEMENTS.forEach((a) => { expect(a.e && a.t && a.d && typeof a.test === 'function', a.id).toBeTruthy(); });
    expect(new Set(C.ACHIEVEMENTS.map((a) => a.id)).size).toBe(24);
    expect(C.ACHIEVEMENTS.filter((a) => a.id.length > 24).length).toBe(0); // o id vira chave no backup (corta em 24 letras)
    expect(C.achievementById('wwd').t).toBe('Dia Mundial da Água');
    expect(C.achievementById('nada')).toBeNull();
  });
  it('a Jornada mostra por grupo: toda medalha aparece em exatamente um grupo, sem id de fora', () => {
    const seen = {};
    C.MEDAL_GROUPS.forEach((g) => { expect(g.t).toBeTruthy(); g.ids.forEach((id) => { expect(C.achievementById(id), id).not.toBeNull(); seen[id] = (seen[id] || 0) + 1; }); });
    expect(Object.keys(seen).sort()).toEqual(C.ACHIEVEMENTS.map((a) => a.id).sort());
    Object.keys(seen).forEach((id) => { expect(seen[id], id).toBe(1); });
  });
  it('test e andamento (p) concordam: a medalha sai exatamente quando "quanto já fez" chega em "quanto precisa"', () => {
    C.ACHIEVEMENTS.filter((a) => a.p).forEach((a) => {
      for (let v = 0; v <= 130; v++) {
        const c = { best: v, daysMet: v, missions: v, earlyDays: v, sunsetDays: v, thirdsDays: v, win30: v, weekends: v };
        const x = a.p(c);
        expect(a.test(c), a.id + ' com ' + v).toBe(x[0] >= x[1]);
      }
    });
    // as medalhas "tudo ou nada" não têm andamento
    ['first', 'goal', 'early', 'sunset', 'mission', 'weekend', 'back', 'wwd'].forEach((id) => { expect(C.achievementById(id).p, id).toBeUndefined(); });
  });
  it('medalProgress: nunca passa do total, nunca fica negativo e a unidade vem junto; "tudo ou nada" não tem andamento', () => {
    const s14 = C.achievementById('s14');
    expect(C.medalProgress(s14, { best: 11 })).toEqual({ have: 11, need: 14, unit: 'dias', pct: 79 });
    expect(C.medalProgress(s14, { best: 99 })).toEqual({ have: 14, need: 14, unit: 'dias', pct: 100 });
    expect(C.medalProgress(s14, { best: -3 }).have).toBe(0);
    expect(C.medalProgress(s14, { best: NaN }).have).toBe(0);
    expect(C.medalProgress(s14, { best: 2.9 }).have).toBe(2); // só passos inteiros
    expect(C.medalProgress(C.achievementById('m30'), { missions: 7 })).toMatchObject({ have: 7, need: 30, unit: 'missões' });
    expect(C.medalProgress(C.achievementById('weekends4'), { weekends: 2 })).toMatchObject({ have: 2, need: 4, unit: 'fins de semana' });
    expect(C.medalProgress(C.achievementById('back'), {})).toBeNull();
  });
  it('nearestMedal: a que falta e está mais perto (maior fração), com pelo menos um passo; ignora as conquistadas e as "tudo ou nada"', () => {
    const S = C.defaults();
    expect(C.nearestMedal(S, { best: 0, daysMet: 0, missions: 0, earlyDays: 0, sunsetDays: 0, thirdsDays: 0, win30: 0, weekends: 0 })).toBeNull(); // ninguém começou nada
    const c = { best: 5, daysMet: 5, missions: 0, earlyDays: 6, sunsetDays: 0, thirdsDays: 2, win30: 5, weekends: 0 };
    const n = C.nearestMedal(S, c); // Alvorada: 6 de 7 (86%) é a mais perto; Semana fluida: 5 de 7 (71%)
    expect(n.a.id).toBe('early7');
    expect(n).toMatchObject({ have: 6, need: 7, unit: 'dias', pct: 86 });
    S.achievements.early7 = 1; // conquistada: sai da disputa
    expect(C.nearestMedal(S, c).a.id).toBe('s7');
    expect(C.nearestMedal(S, { best: 150, daysMet: 150, missions: 150, earlyDays: 150, sunsetDays: 150, thirdsDays: 150, win30: 150, weekends: 150 })).toBeNull(); // tudo cumprido e ainda sem guardar: nada "falta"
    expect(C.nearestMedal(S, { best: 99, daysMet: 0, missions: 0, earlyDays: 0, sunsetDays: 0, thirdsDays: 0, win30: 0, weekends: 0 }).a.id).toBe('s100'); // 99 de 100 ainda falta um
  });
});

/* ---------- cada medalha nova, no limite ---------- */
describe('as medalhas novas da 1.6.0: o limite de cada uma', () => {
  it('Maré viva (60 dias seguidos) e Lenda da maré (100): 59 e 99 ainda não; um buraco zera a conta', () => {
    expect(ids(stateWith(streakOf(0, 59)))).not.toContain('s60');
    expect(ids(stateWith(streakOf(0, 60)))).toContain('s60');
    expect(ids(stateWith(streakOf(0, 60)))).not.toContain('s100');
    expect(ids(stateWith(streakOf(0, 99)))).not.toContain('s100');
    expect(ids(stateWith(streakOf(0, 100)))).toEqual(expect.arrayContaining(['s60', 's100']));
    const hole = Object.assign(streakOf(0, 59), streakOf(60, 59)); // 59 + buraco + 59
    expect(ids(stateWith(hole))).not.toContain('s60');
  });
  it('Trinta na meta e Cem na meta: dias de meta contam, seguidos ou não; dia sem meta não conta', () => {
    const alt = (n) => { const o = {}; for (let i = 0; i < n; i++) { o[K(i * 2)] = metDay(K(i * 2)); o[K(i * 2 + 1)] = missDay(K(i * 2 + 1)); } return o; };
    expect(ids(stateWith(alt(29)))).not.toContain('d30');
    expect(ids(stateWith(alt(30)))).toContain('d30');
    expect(ids(stateWith(alt(99)))).not.toContain('d100');
    expect(ids(stateWith(alt(100)))).toEqual(expect.arrayContaining(['d30', 'd100']));
  });
  it('Navegador: 30 missões completas (dias das missões guardadas)', () => {
    const S = C.defaults();
    for (let i = 0; i < 29; i++) S.missions[K(i)] = 1;
    expect(ids(S)).not.toContain('m30');
    S.missions[K(29)] = 1;
    expect(ids(S)).toContain('m30');
    expect(ids(S)).toContain('m10');
  });
  it('Alvorada: 500 ml de água antes das 9h em 7 dias diferentes (café e chá não contam, 8h59 conta, 9h00 não)', () => {
    const mk = (n, h, m, drink) => { const o = {}; for (let i = 0; i < n; i++) o[K(i)] = dayOf(K(i), 2000, [[h, m, 500, drink]]); return o; };
    expect(ids(stateWith(mk(6, 8, 59)))).not.toContain('early7');
    expect(ids(stateWith(mk(7, 8, 59)))).toContain('early7');
    expect(ids(stateWith(mk(7, 9, 0)))).not.toContain('early7');
    expect(ids(stateWith(mk(7, 7, 0, 'coffee')))).not.toContain('early7');
    const two = { [K(0)]: dayOf(K(0), 2000, [[7, 0, 250], [8, 0, 250]]) }; // 250 + 250 no mesmo dia: um dia só
    for (let i = 1; i < 6; i++) two[K(i)] = dayOf(K(i), 2000, [[8, 0, 600]]);
    expect(ids(stateWith(two))).not.toContain('early7'); // 6 dias
    two[K(6)] = dayOf(K(6), 2000, [[6, 30, 500]]);
    expect(ids(stateWith(two))).toContain('early7'); // 7 dias
  });
  it('Relógio da maré: meta batida antes das 18h em 5 dias diferentes (17h59 conta; 18h00 não)', () => {
    const mk = (n, h, m) => { const o = {}; for (let i = 0; i < n; i++) o[K(i)] = dayOf(K(i), 2000, [[8, 0, 1000], [h, m, 1000]]); return o; };
    expect(ids(stateWith(mk(4, 17, 59)))).not.toContain('sunset5');
    expect(ids(stateWith(mk(5, 17, 59)))).toContain('sunset5');
    expect(ids(stateWith(mk(5, 18, 0)))).not.toContain('sunset5');
    expect(ids(stateWith(mk(5, 18, 0)))).toContain('goal');
  });
  it('Dia redondo: água de manhã, à tarde e à noite no mesmo dia, em 7 dias (as três partes: antes de 12h, de 12h às 18h, 18h em diante)', () => {
    const three = (k) => dayOf(k, 2000, [[8, 0, 200], [14, 0, 200], [20, 0, 200]]);
    const two = (k) => dayOf(k, 2000, [[8, 0, 200], [14, 0, 200], [17, 59, 200]]); // falta a noite
    const mk = (n, f) => { const o = {}; for (let i = 0; i < n; i++) o[K(i)] = f(K(i)); return o; };
    expect(ids(stateWith(mk(6, three)))).not.toContain('thirds7');
    expect(ids(stateWith(mk(7, three)))).toContain('thirds7');
    expect(ids(stateWith(mk(7, two)))).not.toContain('thirds7');
    const mixed = Object.assign(mk(6, three), { [K(6)]: dayOf(K(6), 2000, [[8, 0, 200], [14, 0, 200], [21, 0, 800, 'tea']]) }); // chá de noite não é água
    expect(ids(stateWith(mixed))).not.toContain('thirds7');
    const edge = Object.assign(mk(6, three), { [K(6)]: dayOf(K(6), 2000, [[11, 59, 200], [12, 0, 200], [18, 0, 200]]) }); // 11h59 é manhã, 12h00 tarde, 18h00 noite
    expect(ids(stateWith(edge))).toContain('thirds7');
  });
  it('Mês de ouro: 25 dias de meta dentro de 30 dias do calendário (24 não; 25 espalhados em 31 dias não)', () => {
    const pattern = (len, gaps) => { const o = {}; for (let i = 0; i < len; i++) if (gaps.indexOf(i) < 0) o[K(i)] = metDay(K(i)); return o; };
    expect(ids(stateWith(pattern(30, [3, 8, 13, 18, 23])))).toContain('win25'); // 25 de 30
    expect(ids(stateWith(pattern(30, [3, 8, 13, 18, 23, 28])))).not.toContain('win25'); // 24 de 30
    // 25 dias de meta, mas o primeiro e o último a 30 dias de distância (31 dias do calendário): nenhuma janela de 30 dias pega os 25
    const wide = pattern(31, [3, 8, 13, 18, 23, 28]);
    expect(Object.keys(wide).length).toBe(25);
    expect(wide[K(0)] && wide[K(30)]).toBeTruthy();
    expect(ids(stateWith(wide))).not.toContain('win25');
    // os mesmos 25 dias, mas com o último dia a 29 dias do primeiro (cabe numa janela): sai
    const fits = pattern(30, [3, 8, 13, 18, 23]);
    expect(Object.keys(fits).length).toBe(25);
    expect(ids(stateWith(fits))).toContain('win25');
    // a janela pode estar em qualquer lugar do histórico (aqui, depois de 40 dias parados)
    const late = {}; Object.keys(fits).forEach((k, n) => { const day = C.addDays(k, 40); late[day] = metDay(day); });
    expect(ids(stateWith(late))).toContain('win25');
  });
  it('Volta por cima: bater a meta de novo depois de 3 dias ou mais sem bater (2 dias sem bater não vale; nunca ter batido antes também não)', () => {
    const base = (gap) => ({ [K(0)]: metDay(K(0)), [K(1 + gap)]: metDay(K(1 + gap)) }); // meta, `gap` dias sem meta, meta
    expect(ids(stateWith(base(2)))).not.toContain('back');
    expect(ids(stateWith(base(3)))).toContain('back');
    expect(ids(stateWith(base(10)))).toContain('back');
    expect(ids(stateWith({ [K(0)]: metDay(K(0)) }))).not.toContain('back');
    const quiet = { [K(0)]: missDay(K(0)), [K(9)]: metDay(K(9)) }; // sem meta antes: a primeira meta não é "volta"
    expect(ids(stateWith(quiet))).not.toContain('back');
    const withMiss = Object.assign(base(3), { [K(2)]: missDay(K(2)) }); // dias com água, mas sem meta, também são "dias sem bater"
    expect(ids(stateWith(withMiss))).toContain('back');
  });
  it('Fins de semana firmes: sábado e domingo na meta, em 4 fins de semana diferentes (3 não; domingo e segunda não é fim de semana)', () => {
    const wk = (n) => { const o = {}; for (let i = 0; i < n; i++) { o[K(2 + 7 * i)] = metDay(K(2 + 7 * i)); o[K(3 + 7 * i)] = metDay(K(3 + 7 * i)); } return o; }; // K(2) é sábado
    expect(C.keyToDate(K(2)).getDay()).toBe(6);
    expect(ids(stateWith(wk(3)))).not.toContain('weekends4');
    expect(ids(stateWith(wk(3)))).toContain('weekend');
    expect(ids(stateWith(wk(4)))).toContain('weekends4');
    const sunMon = {}; // domingo e segunda: não é fim de semana
    for (let i = 0; i < 4; i++) { sunMon[K(3 + 7 * i)] = metDay(K(3 + 7 * i)); sunMon[K(4 + 7 * i)] = metDay(K(4 + 7 * i)); }
    expect(ids(stateWith(sunMon))).not.toContain('weekends4');
    expect(ids(stateWith(sunMon))).not.toContain('weekend');
    const half = wk(4); delete half[K(3 + 7 * 2)]; // um dos domingos sem meta: 3 fins de semana
    expect(ids(stateWith(half))).not.toContain('weekends4');
  });
  it('Dia Mundial da Água: água registrada em 22 de março (café nesse dia, ou água em 21 e 23, não vale; vale em qualquer ano)', () => {
    expect(ids(stateWith({ '2027-03-22': dayOf('2027-03-22', 2000, [[10, 0, 250]]) }))).toContain('wwd');
    expect(ids(stateWith({ '2026-03-22': dayOf('2026-03-22', 2000, [[10, 0, 250, 'sparkling']]) }))).toContain('wwd');
    expect(ids(stateWith({ '2026-03-22': dayOf('2026-03-22', 2000, [[10, 0, 800, 'coffee']]) }))).not.toContain('wwd');
    expect(ids(stateWith({ '2026-03-21': missDay('2026-03-21'), '2026-03-23': missDay('2026-03-23'), '2026-04-22': missDay('2026-04-22') }))).not.toContain('wwd');
  });
  it('as medalhas velhas seguem como eram (as 12 primeiras)', () => {
    const S = stateWith({ [K(2)]: dayOf(K(2), 2000, [[8, 0, 600], [12, 0, 1400, 'sparkling']]), [K(3)]: metDay(K(3), 10) }); // sábado e domingo, os dois na meta
    expect(ids(S)).toEqual(expect.arrayContaining(['first', 'goal', 'early', 'sunset', 'weekend']));
    expect(ids(S)).not.toContain('s3');
  });
});

/* ---------- o contexto novo contra o antigo ---------- */
// A conta de context() foi reescrita (agora com os dias de meta em lista). Aqui ela é comparada com a versão da 1.5.x, copiada, em históricos sorteados.
function oldContext(S) {
  const keys = Object.keys(S.days).sort();
  const mix = C.mixOn(), cap = (g) => Math.round((g || 2000) * C.MIX_MAX), oth = (e) => (C.isOther(e) ? Math.round(e.ml) : 0);
  let totalMl = 0, entries = 0, daysMet = 0, early = false, sunset = false, weekend = false;
  keys.forEach((k) => {
    const day = S.days[k], g = day.goal || 2000, cp = cap(g), es = (day.entries || []).slice().sort((a, b) => a.t - b.t);
    let cum = 0, ot = 0, morning = 0, hit = -1;
    es.forEach((e) => {
      const v = C.eff(e), m = C.minOf(e.t);
      if (v) { cum += v; entries++; if (m < 540) morning += v; } else ot += oth(e);
      if (hit < 0 && cum + (mix ? Math.min(ot, cp) : 0) >= g) hit = m;
    });
    totalMl += cum;
    if (morning >= 500) early = true;
    if (hit >= 0) {
      daysMet++;
      if (hit < 1080) sunset = true;
      if (C.keyToDate(k).getDay() === 6 && C.isMet(S.days[C.addDays(k, 1)])) weekend = true;
    }
  });
  return { totalMl, entries, daysMet, early, sunset, weekend, best: C.bestStreak(S.days), missions: Object.keys(S.missions || {}).length };
}
// Um histórico sorteado: n dias a partir de D0, cada um com 0 a 7 registros (água, água com gás, café…) em horas variadas, metas de 1500 a 3000
function randomHistory(seed, n) {
  const r = rng(seed), S = C.defaults(ts('2025-12-01', 9)), drinks = ['water', 'water', 'water', 'sparkling', 'coffee', 'tea', 'juice'];
  for (let i = 0; i < n; i++) {
    if (r() < 0.12) continue; // dia sem nada
    const goal = 1500 + Math.floor(r() * 4) * 500, list = [], cnt = Math.floor(r() * 8), big = r() < 0.5;
    for (let j = 0; j < cnt; j++) list.push([Math.floor(r() * 24), Math.floor(r() * 60), (big ? 200 : 100) + Math.floor(r() * 500), drinks[Math.floor(r() * drinks.length)]]);
    S.days[K(i)] = dayOf(K(i), goal, list);
    if (r() < 0.2) S.missions[K(i)] = 1;
  }
  return S;
}
describe('context(): a conta nova bate com a da 1.5.x e com bestStreak/isMet', () => {
  [1, 2, 3, 4, 5, 6, 7, 8].forEach((seed) => {
    [false, true].forEach((mix) => {
      it('histórico sorteado ' + seed + (mix ? ', com "somar na meta" ligado' : ''), () => {
        C.setMix(mix);
        const S = randomHistory(seed, 120), c = C.context(S), o = oldContext(S);
        ['totalMl', 'entries', 'daysMet', 'early', 'sunset', 'weekend', 'best', 'missions'].forEach((f) => { expect(c[f], f).toEqual(o[f]); });
        expect(c.daysMet).toBe(Object.keys(S.days).filter((k) => C.isMet(S.days[k])).length);
        expect(c.best).toBe(C.bestStreak(S.days));
      });
    });
  });
  it('os campos novos batem com uma conta feita à mão', () => {
    const S = randomHistory(99, 150), c = C.context(S), keys = Object.keys(S.days).sort();
    const met = keys.filter((k) => C.isMet(S.days[k]));
    let early = 0, sunset = 0, thirds = 0, weekends = 0, win = 0, back = false;
    keys.forEach((k) => {
      const es = S.days[k].entries.filter(C.isWater).filter((e) => Math.round(e.ml) > 0);
      if (es.filter((e) => C.minOf(e.t) < 540).reduce((s, e) => s + Math.round(e.ml), 0) >= 500) early++;
      const parts = {}; es.forEach((e) => { const m = C.minOf(e.t); parts[m < 720 ? 0 : m < 1080 ? 1 : 2] = 1; });
      if (Object.keys(parts).length === 3) thirds++;
    });
    met.forEach((k, i) => {
      const day = S.days[k], g = day.goal || 2000, sorted = day.entries.slice().sort((a, b) => a.t - b.t);
      let cum = 0, oth = 0, hit = -1; // a hora em que a meta fechou
      sorted.forEach((e) => { if (C.isWater(e)) cum += Math.round(e.ml); else oth += C.isOther(e) ? Math.round(e.ml) : 0; if (hit < 0 && cum + (C.mixOn() ? Math.min(oth, Math.round(g * C.MIX_MAX)) : 0) >= g) hit = C.minOf(e.t); });
      if (hit < 1080) sunset++;
      if (C.keyToDate(k).getDay() === 6 && met.indexOf(C.addDays(k, 1)) >= 0) weekends++;
      if (i && C.addDays(met[i - 1], 4) <= k) back = true;
      let n = 0; for (let j = 0; j <= i; j++) if (C.addDays(met[j], 29) >= k) n++; // dias de meta de (k - 29) a k
      if (n > win) win = n;
    });
    expect(c).toMatchObject({ earlyDays: early, sunsetDays: sunset, thirdsDays: thirds, weekends: weekends, win30: win, back: back });
  });
});

/* ---------- a data de cada medalha ---------- */
describe('medalDates: o dia em que o histórico passou a cumprir cada medalha', () => {
  it('sequência: a Semana fluida sai no 7º dia, e a Maré alta, no 30º (meio-dia do dia certo)', () => {
    const S = stateWith(streakOf(10, 35));
    const d = C.medalDates(S);
    expect(d.s7).toBe(C.keyToDate(K(10 + 6)).getTime());
    expect(d.s30).toBe(C.keyToDate(K(10 + 29)).getTime());
    expect(d.first).toBe(C.keyToDate(K(10)).getTime());
    expect(d.s60).toBeUndefined(); // não cumprida: sem data
  });
  it('bate com a conta dia a dia (força bruta) em históricos sorteados, para todas as medalhas', () => {
    [11, 12, 13].forEach((seed) => {
      const S = randomHistory(seed, 90), keys = Object.keys(S.days).sort(), d = C.medalDates(S), now = Date.now();
      C.ACHIEVEMENTS.forEach((a) => {
        let want;
        for (let i = 0; i < keys.length && want === undefined; i++) if (a.test(C.context(S, keys[i]))) want = Math.min(now, C.keyToDate(keys[i]).getTime());
        expect(d[a.id], a.id + ' (' + seed + ')').toBe(want);
      });
    });
  });
  it('missões de antes do primeiro registro: a medalha sai no primeiro dia com registro; sem nenhum registro não há data; só as pedidas entram; nada pendente = vazio', () => {
    const S = C.defaults();
    for (let i = 0; i < 10; i++) S.missions['2026-02-' + (10 + i)] = 1; // dez missões, nenhum registro de água
    expect(C.medalDates(S)).toEqual({}); // sem dia com registro, a conta não tem em que se apoiar (o app usa a hora de agora)
    S.days['2026-03-01'] = metDay('2026-03-01');
    const d = C.medalDates(S), first = C.keyToDate('2026-03-01').getTime();
    expect(d.first).toBe(first);
    expect(d.mission).toBe(first);
    expect(d.m10).toBe(first); // as dez missões já existiam quando o primeiro dia com registro fechou
    expect(d.m30).toBeUndefined();
    expect(Object.keys(C.medalDates(S, [C.achievementById('goal')]))).toEqual(['goal']);
    S.achievements = { first: 1, goal: 1 };
    expect(C.medalDates(S, [])).toEqual({});
  });
  it('nunca devolve uma data no futuro (o dia de hoje vale até agora)', () => {
    const today = C.dayKey(new Date()), S = stateWith({ [today]: dayOf(today, 2000, [[0, 1, 2000]]) });
    const d = C.medalDates(S);
    expect(d.first).toBeLessThanOrEqual(Date.now());
    expect(d.goal).toBeLessThanOrEqual(Date.now());
  });
});

/* ---------- Seus padrões ---------- */
const TODAY = '2026-06-30';
const back = (i) => C.addDays(TODAY, -i);
// n dias para trás (1 = ontem), cada um montado por f(k, i)
function fill(S, n, f, from) { for (let i = from || 1; i <= n; i++) { const d = f(back(i), i); if (d) S.days[back(i)] = d; } return S; }
const baseState = () => { const S = C.defaults(ts('2026-04-01', 9)); return S; };
const texts = (S, p) => C.patterns(S, TODAY, p || S.profile).texts.map((x) => x.t);

describe('patterns: quando há dados e como o resumo conta', () => {
  it('menos de 4 dias com água: não está pronto, mas diz quantos dias já há; hoje e dias só com outros líquidos não contam', () => {
    const S = baseState();
    expect(C.patterns(S, TODAY, S.profile)).toMatchObject({ n: 0, ready: false, texts: [] });
    fill(S, 3, (k) => missDay(k));
    S.days[TODAY] = metDay(TODAY); // hoje não entra
    S.days[back(4)] = dayOf(back(4), 2000, [[9, 0, 900, 'coffee']]); // só café: não é dia de dados
    const p = C.patterns(S, TODAY, S.profile);
    expect(p).toMatchObject({ n: 3, ready: false, sum: [], texts: [] });
    expect(C.PATTERN_MIN).toBe(4);
    S.days[back(5)] = missDay(back(5));
    expect(C.patterns(S, TODAY, S.profile)).toMatchObject({ n: 4, ready: true });
    expect(C.insights(S, TODAY, S.profile)).toEqual(C.patterns(S, TODAY, S.profile).texts); // insights é a mesma lista
  });
  it('só olha as 4 últimas semanas: um dia a 29 dias de distância não conta', () => {
    const S = baseState();
    fill(S, 3, (k) => missDay(k));
    S.days[back(29)] = missDay(back(29));
    expect(C.patterns(S, TODAY, S.profile).n).toBe(3);
    S.days[back(28)] = missDay(back(28));
    expect(C.patterns(S, TODAY, S.profile).n).toBe(4);
  });
  it('constância: "bateu a meta em X dos últimos Y dias" (Y = dias desde que começou, no máximo 28), com elogio a partir de 80%', () => {
    const S = baseState(); // começou em 01/04: os 28 dias contam
    fill(S, 10, (k, i) => (i <= 6 ? metDay(k) : missDay(k)));
    expect(texts(S)[0]).toBe('Você bateu a meta em 6 dos últimos 28 dias (21%).');
    const T = C.defaults(ts('2026-06-20', 9)); // começou há 10 dias: só eles contam (de 20/06 a 29/06)
    fill(T, 10, (k, i) => (i === 4 ? missDay(k) : metDay(k)));
    expect(texts(T)[0]).toBe('Você bateu a meta em 9 dos últimos 10 dias (90%). Constância de respeito!');
    const U = C.defaults(ts('2026-06-20', 9));
    fill(U, 10, (k, i) => (i <= 7 ? metDay(k) : missDay(k)));
    expect(texts(U)[0]).toBe('Você bateu a meta em 7 dos últimos 10 dias (70%).'); // 70%: sem elogio
    const V = C.defaults(ts('2026-06-20', 9));
    fill(V, 10, (k, i) => (i <= 8 ? metDay(k) : missDay(k)));
    expect(texts(V)[0]).toBe('Você bateu a meta em 8 dos últimos 10 dias (80%). Constância de respeito!'); // 80% já vale o elogio
  });
  it('sem nenhuma meta batida, a mensagem é de incentivo e não de cobrança', () => {
    const S = baseState();
    fill(S, 6, (k) => missDay(k));
    expect(texts(S)[0]).toBe('Você registrou água em 6 dias, mas ainda não bateu a meta. Comece com um copo ao acordar e vá aos poucos.');
  });
  it('tendência: compara os 7 últimos dias com os 7 anteriores (e só aparece se havia água antes)', () => {
    const S = baseState();
    fill(S, 7, (k) => dayOf(k, 2000, [[10, 0, 1500]]));
    fill(S, 14, (k) => dayOf(k, 2000, [[10, 0, 1000]]), 8);
    expect(texts(S)).toContain('+50% de hidratação nos últimos 7 dias em relação aos 7 anteriores.');
    const T = baseState();
    fill(T, 7, (k) => dayOf(k, 2000, [[10, 0, 800]]));
    fill(T, 14, (k) => dayOf(k, 2000, [[10, 0, 1000]]), 8);
    expect(texts(T)).toContain('-20% de hidratação nos últimos 7 dias em relação aos 7 anteriores.');
    const U = baseState();
    fill(U, 7, (k) => dayOf(k, 2000, [[10, 0, 800]]));
    expect(texts(U).some((t) => /em relação aos 7 anteriores/.test(t))).toBe(false); // sem a semana anterior não há como comparar
  });
});

describe('patterns: o ritmo do dia', () => {
  it('período mais seco (a 1ª janela de 3 h sem água) e o de mais água; o gráfico cobre o horário acordado e todas as horas com água', () => {
    const S = baseState();
    fill(S, 10, (k) => dayOf(k, 2000, [[8, 0, 500], [15, 0, 1000]]));
    const p = C.patterns(S, TODAY, S.profile);
    expect(p.day.texts[0].t).toBe('Seu período mais seco costuma ser das 9h às 12h. Deixe uma garrafa por perto nesse horário.');
    expect(p.day.rhythm).toMatchObject({ from: 7, dry: 9, peak: 13, max: 10000 });
    expect(p.day.rhythm.v.length).toBe(16); // das 7h às 22h
    expect(p.day.rhythm.v[8 - 7]).toBe(5000);
    expect(p.day.rhythm.v[15 - 7]).toBe(10000);
    const T = baseState(); // água às 5h (antes de acordar) e às 23h: o gráfico se estende
    fill(T, 8, (k) => dayOf(k, 2000, [[5, 30, 300], [12, 0, 800], [23, 20, 300]]));
    const r = C.patterns(T, TODAY, T.profile).day.rhythm;
    expect(r.from).toBe(5);
    expect(r.from + r.v.length - 1).toBe(23);
  });
  it('só as 2 últimas semanas entram no ritmo (o hábito de agora); a manhã usa as 4 semanas', () => {
    const S = baseState();
    fill(S, 14, (k) => dayOf(k, 2000, [[15, 0, 1000]])); // 2 semanas à tarde
    fill(S, 28, (k) => dayOf(k, 2000, [[8, 0, 1000]]), 15); // e antes disso, de manhã
    const p = C.patterns(S, TODAY, S.profile);
    expect(p.day.rhythm.v[8 - 7]).toBe(0); // as 8h da 3ª e 4ª semana não entram no gráfico
    expect(p.day.rhythm.v[15 - 7]).toBe(14000);
    expect(p.day.texts.some((x) => x.t === 'Só 50% da sua água vem antes do meio-dia. Um copo ao acordar faz diferença.')).toBe(false); // 14 de 28 dias de manhã = 50%: "Boa!"
    expect(p.day.texts.some((x) => x.t === 'Boa! 50% da sua água vem antes do meio-dia.')).toBe(true);
  });
  it('manhã: abaixo de 30% pede um copo ao acordar; de 30% para cima elogia', () => {
    const S = baseState();
    fill(S, 6, (k) => dayOf(k, 2000, [[14, 0, 1000], [16, 0, 1000]]));
    expect(texts(S).filter((t) => /antes do meio-dia/.test(t))).toEqual(['Só 0% da sua água vem antes do meio-dia. Um copo ao acordar faz diferença.']);
  });
  it('distribuição reta (nenhuma janela mais seca que a outra): sem "pico" para destacar', () => {
    const S = baseState();
    fill(S, 6, (k) => dayOf(k, 2000, [[7, 0, 100], [8, 0, 100], [9, 0, 100], [10, 0, 100], [11, 0, 100], [12, 0, 100], [13, 0, 100], [14, 0, 100], [15, 0, 100], [16, 0, 100],
      [17, 0, 100], [18, 0, 100], [19, 0, 100], [20, 0, 100], [21, 0, 100], [22, 0, 100]]));
    expect(C.patterns(S, TODAY, S.profile).day.rhythm.peak).toBe(-1);
  });
  it('efeito da manhã: com 500 ml antes das 10h, bate a meta mais vezes (só com 3 dias de cada lado e 20 pontos de diferença)', () => {
    const S = baseState();
    fill(S, 4, (k) => dayOf(k, 2000, [[8, 0, 600], [15, 0, 1400]])); // manhã e meta
    fill(S, 8, (k) => dayOf(k, 2000, [[13, 0, 700]]), 5); // sem manhã e sem meta
    expect(texts(S)).toContain('Nos dias em que você bebe 500 ml antes das 10h, bate a meta em 100% das vezes; nos outros, em 0%.');
    const T = baseState(); // só 2 dias com manhã: pouco para dizer
    fill(T, 2, (k) => dayOf(k, 2000, [[8, 0, 600], [15, 0, 1400]]));
    fill(T, 8, (k) => dayOf(k, 2000, [[13, 0, 700]]), 3);
    expect(texts(T).some((t) => /antes das 10h/.test(t))).toBe(false);
    const U = baseState(); // sem diferença: não aparece
    fill(U, 8, (k, i) => dayOf(k, 2000, i % 2 ? [[8, 0, 600], [15, 0, 1400]] : [[13, 0, 2000]]));
    expect(texts(U).some((t) => /antes das 10h/.test(t))).toBe(false);
    const V = baseState(); // o contrário (bate mais sem a manhã): também não aparece
    fill(V, 4, (k) => dayOf(k, 2000, [[8, 0, 600]]));
    fill(V, 8, (k) => dayOf(k, 2000, [[13, 0, 2200]]), 5);
    expect(texts(V).some((t) => /antes das 10h/.test(t))).toBe(false);
  });
  it('efeito da manhã: a manhã vai até 9h59 (às 10h00 já não é "antes das 10h") e pede 500 ml, nem um a menos', () => {
    const S = baseState();
    fill(S, 4, (k) => dayOf(k, 2000, [[9, 59, 500], [15, 0, 1500]])); // 500 ml às 9h59 e meta
    fill(S, 8, (k) => dayOf(k, 2000, [[10, 0, 500], [15, 0, 100]]), 5); // 500 ml às 10h00: fora da manhã; sem meta
    expect(texts(S)).toContain('Nos dias em que você bebe 500 ml antes das 10h, bate a meta em 100% das vezes; nos outros, em 0%.');
    const T = baseState();
    fill(T, 4, (k) => dayOf(k, 2000, [[9, 59, 499], [15, 0, 1501]])); // meta, mas só 499 ml antes das 10h
    fill(T, 8, (k) => dayOf(k, 2000, [[13, 0, 700]]), 5);
    expect(texts(T).some((x) => /antes das 10h/.test(x))).toBe(false);
  });
  it('primeiro copo tarde: só avisa se vem 1h30 ou mais depois de acordar (a mediana dos dias)', () => {
    const S = baseState(); // acorda às 7h; o primeiro copo vem às 10h30
    fill(S, 6, (k) => dayOf(k, 2000, [[10, 30, 500], [15, 0, 500]]));
    expect(texts(S)).toContain('Seu primeiro copo costuma vir às 10h30, cerca de 3h30 depois de acordar. Um copo logo ao levantar ajuda a pegar o ritmo.');
    const T = baseState(); // às 8h00: 1h depois
    fill(T, 6, (k) => dayOf(k, 2000, [[8, 0, 500], [15, 0, 500]]));
    expect(texts(T).some((t) => /primeiro copo/.test(t))).toBe(false);
    const U = baseState(); // exatamente 1h30: avisa
    fill(U, 6, (k) => dayOf(k, 2000, [[8, 30, 500], [15, 0, 500]]));
    expect(texts(U)).toContain('Seu primeiro copo costuma vir às 8h30, cerca de 1h30 depois de acordar. Um copo logo ao levantar ajuda a pegar o ritmo.');
    const V = baseState(); V.profile.wake = '09:00'; // quem acorda tarde: 10h30 é só 1h30 depois
    fill(V, 6, (k) => dayOf(k, 2000, [[10, 30, 500], [15, 0, 500]]));
    expect(texts(V)).toContain('Seu primeiro copo costuma vir às 10h30, cerca de 1h30 depois de acordar. Um copo logo ao levantar ajuda a pegar o ritmo.');
  });
  it('hora de fechar a meta: a mediana dos dias com meta (3 ou mais); perto da hora de dormir, um conselho sobre o sono', () => {
    const S = baseState();
    fill(S, 6, (k) => dayOf(k, 2000, [[9, 0, 1000], [18, 30, 1000]]));
    expect(texts(S)).toContain('Você costuma completar a meta por volta das 18h30.');
    const T = baseState();
    fill(T, 6, (k) => dayOf(k, 2000, [[9, 0, 1000], [21, 0, 1000]]));
    expect(texts(T)).toContain('Você costuma completar a meta por volta das 21h. Tão perto da hora de dormir pode atrapalhar o sono: tente adiantar um pouco.');
    const U = baseState();
    fill(U, 2, (k) => dayOf(k, 2000, [[9, 0, 2000]]));
    fill(U, 8, (k) => missDay(k), 3);
    expect(texts(U).some((t) => /completar a meta/.test(t))).toBe(false); // só 2 dias com meta: pouco para dizer
  });
});

describe('patterns: a semana', () => {
  it('7 colunas, domingo primeiro, com a média da meta de cada dia da semana (null onde não houve esse dia); a melhor é a de maior média com 2 dias ou mais', () => {
    const S = baseState();
    // 14 dias seguidos até ontem (29/06 é segunda), 2 de cada dia da semana: quartas com a meta batida, sábados com 75%, o resto com 50%
    fill(S, 14, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 3 ? 2000 : wd === 6 ? 1500 : 1000]]); });
    const w = C.patterns(S, TODAY, S.profile).week;
    expect(w.cols.map((c) => c.wd)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(w.cols.map((c) => c.n)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(w.cols[3].avg).toBe(1);
    expect(w.cols[1].avg).toBe(0.5);
    expect(w.best).toBe(3); // quarta
    const T = baseState();
    fill(T, 3, (k) => missDay(k)); fill(T, 4, (k) => missDay(k), 4); // 4 dias seguidos: quatro dias da semana, um dia cada
    const wt = C.patterns(T, TODAY, T.profile).week;
    expect(wt.best).toBe(-1); // nenhum tem 2 dias
    expect(wt.cols.filter((c) => c.avg === null).length).toBe(3);
    expect(wt.texts).toEqual([]);
  });
  it('melhor dia e ponto fraco, com o artigo certo (os domingos, as segundas…), só com 20 pontos de diferença', () => {
    const S = baseState();
    fill(S, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 5 ? 2000 : wd === 6 ? 600 : 1500]]); }); // sextas 100%, sábados 30%, o resto 75%
    const t = C.patterns(S, TODAY, S.profile).week.texts.map((x) => x.t);
    expect(t[0]).toBe('Você se hidrata melhor às sextas: em média 100% da meta.');
    expect(t[1]).toBe('Seu ponto fraco são os sábados: em média 30% da meta.');
    const T = baseState();
    fill(T, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 0 ? 2000 : wd === 2 ? 800 : 1500]]); }); // domingos 100%, terças 40%
    const u = C.patterns(T, TODAY, T.profile).week.texts.map((x) => x.t);
    expect(u[0]).toBe('Você se hidrata melhor aos domingos: em média 100% da meta.');
    expect(u[1]).toBe('Seu ponto fraco são as terças: em média 40% da meta.');
    const U = baseState(); // diferença de só 10 pontos: não há "ponto fraco"
    fill(U, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 2 ? 1700 : 1500]]); });
    const v = C.patterns(U, TODAY, U.profile).week.texts.map((x) => x.t);
    expect(v.length).toBe(1);
    expect(v[0]).toBe('Você se hidrata melhor às terças: em média 85% da meta.');
  });
  it('fim de semana contra dias úteis (15 pontos ou mais), nos dois sentidos', () => {
    const S = baseState();
    fill(S, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 0 || wd === 6 ? 1000 : 1800]]); }); // fins de semana 50%, úteis 90%
    expect(C.patterns(S, TODAY, S.profile).week.texts.map((x) => x.t)).toContain('Nos fins de semana você fica em média em 50% da meta, contra 90% nos dias úteis. Sem a rotina é fácil esquecer: deixe a garrafa à vista.');
    const T = baseState();
    fill(T, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 0 || wd === 6 ? 1900 : 1200]]); }); // fins de semana 95%, úteis 60%
    expect(C.patterns(T, TODAY, T.profile).week.texts.map((x) => x.t)).toContain('Nos dias úteis você fica em média em 60% da meta, contra 95% nos fins de semana. Uma garrafa na mesa de trabalho pode ajudar.');
    const U = baseState();
    fill(U, 28, (k) => dayOf(k, 2000, [[10, 0, 1500]]));
    expect(C.patterns(U, TODAY, U.profile).week.texts.some((x) => /fins de semana/.test(x.t))).toBe(false);
  });
});

describe('patterns: robustez', () => {
  it('estado vazio, dias quebrados e perfil sem horários não derrubam nada', () => {
    const S = baseState();
    S.days[back(1)] = { goal: 2000, entries: [] };
    S.days[back(2)] = { goal: 2000, entries: [{ id: 'x', t: NaN, ml: 300, d: 'water' }] };
    S.days[back(3)] = { goal: 0, entries: [{ id: 'y', t: ts(back(3), 10), ml: 300, d: 'água-que-não-existe' }] };
    S.days[back(4)] = { entries: [{ id: 'z', t: ts(back(4), 10), ml: 300 }] };
    S.days[back(5)] = missDay(back(5)); S.days[back(6)] = missDay(back(6));
    expect(() => C.patterns(S, TODAY, S.profile)).not.toThrow();
    expect(() => C.patterns(S, TODAY, { wake: '', sleep: '' })).not.toThrow();
    const p = C.patterns(S, TODAY, { wake: '23:30', sleep: '05:00' }); // quem dorme de dia: janela que passa da meia-noite
    expect(p.day.rhythm === null || p.day.rhythm.v.length >= 1).toBe(true);
  });
  it('com "somar outros líquidos na meta" ligado, a constância e a hora da meta contam o café', () => {
    C.setMix(true);
    const S = baseState();
    fill(S, 6, (k) => dayOf(k, 2000, [[8, 0, 1000], [9, 0, 1000, 'coffee']])); // 1000 de água + 1000 de café: o limite é metade da meta (1000): fecha
    expect(texts(S)[0]).toBe('Você bateu a meta em 6 dos últimos 28 dias (21%).');
    C.setMix(false);
    expect(texts(S)[0]).toBe('Você registrou água em 6 dias, mas ainda não bateu a meta. Comece com um copo ao acordar e vá aos poucos.');
  });
});

/* ---------- os cortes de cada medalha e de cada texto (as sabotagens de borda da mutação) ---------- */
describe('medalhas: os cortes que sobraram', () => {
  it('Madrugador e Alvorada: 500 ml de água antes das 9h, nem um a menos (499 não conta)', () => {
    const S = stateWith({ [K(0)]: dayOf(K(0), 2000, [[8, 0, 499]]) });
    expect(C.context(S).earlyDays).toBe(0);
    expect(ids(S)).not.toContain('early');
    S.days[K(0)] = dayOf(K(0), 2000, [[8, 0, 500]]);
    expect(C.context(S).earlyDays).toBe(1);
    expect(ids(S)).toContain('early');
  });
  it('uma meta fechada à meia-noite em ponto (minuto 0) conta como dia de meta', () => {
    const S = stateWith({ [K(0)]: dayOf(K(0), 2000, [[0, 0, 2000]]) });
    expect(C.context(S).daysMet).toBe(1);
    expect(ids(S)).toContain('goal');
  });
  it('um dia sem meta guardada vale 2.000 ml (a mesma regra de isMet): 2.000 bate, 1.999 não', () => {
    const e = (k, ml) => ({ entries: [{ id: k, t: ts(k, 10), ml: ml, d: 'water' }] });
    const S = stateWith({ [K(0)]: e(K(0), 2000), [K(1)]: e(K(1), 1999) });
    expect(C.context(S).daysMet).toBe(1);
    expect(C.isMet(S.days[K(0)])).toBe(true);
    expect(C.isMet(S.days[K(1)])).toBe(false);
  });
  it('Explorador e Navegador: o dia da medalha é o da 10ª e o da 30ª missão (as missões contam até o dia, inclusive)', () => {
    const days = {}; for (let i = 0; i < 40; i++) days[K(i)] = missDay(K(i));
    const S = stateWith(days);
    for (let i = 0; i < 35; i++) S.missions[K(i)] = ts(K(i), 20); // uma missão por dia, nos 35 primeiros dias
    const d = C.medalDates(S, C.ACHIEVEMENTS.filter((a) => a.id === 'm10' || a.id === 'm30'));
    expect(d.m10).toBe(C.keyToDate(K(9)).getTime()); // a 10ª missão é a do dia 9 (contando do 0)
    expect(d.m30).toBe(C.keyToDate(K(29)).getTime());
  });
  it('newAchievements com um contexto dado usa esse contexto (não recalcula) e ignora as que a pessoa já tem', () => {
    const S = C.defaults(ts('2026-01-01', 9)); // sem nenhum registro
    const c = Object.assign({}, C.context(S), { entries: 3, daysMet: 1 });
    expect(C.newAchievements(S, c).map((a) => a.id)).toEqual(['first', 'goal']);
    S.achievements.first = 1;
    expect(C.newAchievements(S, c).map((a) => a.id)).toEqual(['goal']);
    expect(C.newAchievements(S).map((a) => a.id)).toEqual([]); // sem o contexto, a conta é a do histórico (vazio)
  });
  it('medalProgress: a porcentagem arredonda para o inteiro mais próximo (1 de 3 = 33, 2 de 3 = 67, 5 de 7 = 71, 1 de 14 = 7)', () => {
    const s3 = C.achievementById('s3'), s7 = C.achievementById('s7'), s14 = C.achievementById('s14');
    expect(C.medalProgress(s3, { best: 1 }).pct).toBe(33);
    expect(C.medalProgress(s3, { best: 2 }).pct).toBe(67);
    expect(C.medalProgress(s7, { best: 5 }).pct).toBe(71);
    expect(C.medalProgress(s14, { best: 1 }).pct).toBe(7);
  });
  it('nearestMedal: no empate fica a primeira da lista (Explorador antes de Dez na meta, as duas a 50%)', () => {
    const S = C.defaults(ts('2026-01-01', 9));
    const c = Object.assign({}, C.context(S), { daysMet: 5, missions: 5 });
    const n = C.nearestMedal(S, c);
    expect(n.a.id).toBe('m10');
    expect(n).toMatchObject({ have: 5, need: 10, pct: 50 });
  });
});

describe('patterns: os cortes de cada texto', () => {
  it('manhã (antes do meio-dia): 30% já elogia e 29% ainda pede um copo; 11h59 é manhã e 12h00 já não é', () => {
    const S = baseState();
    fill(S, 6, (k) => dayOf(k, 2000, [[8, 0, 600], [14, 0, 1400]])); // 30%
    expect(texts(S)).toContain('Boa! 30% da sua água vem antes do meio-dia.');
    const T = baseState();
    fill(T, 6, (k) => dayOf(k, 2000, [[8, 0, 580], [14, 0, 1420]])); // 29%
    expect(texts(T)).toContain('Só 29% da sua água vem antes do meio-dia. Um copo ao acordar faz diferença.');
    const U = baseState();
    fill(U, 6, (k) => dayOf(k, 2000, [[11, 59, 600], [12, 0, 1400]])); // 600 ml às 11h59 (manhã) e 1.400 ml às 12h00 (tarde)
    expect(texts(U)).toContain('Boa! 30% da sua água vem antes do meio-dia.');
  });
  it('tendência: duas semanas iguais mostram "+0%" com o ícone de alta (não de queda)', () => {
    const S = baseState();
    fill(S, 14, (k) => dayOf(k, 2000, [[10, 0, 1000]]));
    expect(C.patterns(S, TODAY, S.profile).sum[1]).toEqual({ e: '📈', t: '+0% de hidratação nos últimos 7 dias em relação aos 7 anteriores.' });
  });
  it('período mais seco: só dentro do horário acordado (acordar às 7h30 começa a olhar às 8h; a última janela termina 1h antes de dormir)', () => {
    const S = baseState(); S.profile.wake = '07:30';
    fill(S, 6, (k) => dayOf(k, 2000, [[10, 0, 300], [12, 0, 300], [14, 0, 300], [16, 0, 300], [18, 0, 300], [20, 0, 300]]));
    expect(C.patterns(S, TODAY, S.profile).day.texts[0].t).toBe('Seu período mais seco costuma ser das 8h às 11h. Deixe uma garrafa por perto nesse horário.'); // e não das 7h às 10h
    const T = baseState(); // água em todas as horas de 7h a 19h: a janela mais seca é a última que cabe (19h às 22h), nunca a das 20h
    fill(T, 6, (k) => dayOf(k, 2000, [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((h) => [h, 0, 100])));
    expect(C.patterns(T, TODAY, T.profile).day.texts[0].t).toBe('Seu período mais seco costuma ser das 19h às 22h. Deixe uma garrafa por perto nesse horário.');
  });
  it('sem água nas 2 últimas semanas: nada de "período mais seco" nem de gráfico (mas a manhã e a semana seguem)', () => {
    const S = baseState();
    fill(S, 28, (k) => dayOf(k, 2000, [[9, 0, 1000]]), 20); // só entre 20 e 28 dias atrás
    const p = C.patterns(S, TODAY, S.profile);
    expect(p.ready).toBe(true);
    expect(p.day.rhythm).toBe(null);
    expect(p.day.texts.some((x) => /mais seco/.test(x.t))).toBe(false);
    expect(p.day.texts.some((x) => /antes do meio-dia/.test(x.t))).toBe(true);
  });
  it('o gráfico do ritmo abre na hora em que a pessoa acorda (7h30 abre às 7h) e vai até a hora de dormir (dormir à 1h vai até as 23h)', () => {
    const S = baseState(); S.profile.wake = '07:30';
    fill(S, 6, (k) => dayOf(k, 2000, [[10, 0, 500], [15, 0, 500]]));
    expect(C.patterns(S, TODAY, S.profile).day.rhythm.from).toBe(7);
    const T = baseState(); T.profile.sleep = '01:00';
    fill(T, 6, (k) => dayOf(k, 2000, [[10, 0, 500], [15, 0, 500]]));
    const r = C.patterns(T, TODAY, T.profile).day.rhythm;
    expect(r.from + r.v.length - 1).toBe(23);
  });
  it('efeito da manhã: 3 dias com manhã e só 2 sem manhã não bastam (precisa de 3 de cada lado)', () => {
    const S = baseState();
    fill(S, 3, (k) => dayOf(k, 2000, [[8, 0, 600], [15, 0, 1400]])); // 3 dias com manhã e meta
    fill(S, 5, (k) => dayOf(k, 2000, [[13, 0, 700]]), 4); // só 2 sem manhã e sem meta
    expect(texts(S).some((x) => /antes das 10h/.test(x))).toBe(false);
  });
  it('efeito da manhã: a diferença mínima é de 20 pontos (15 não aparece, 25 aparece)', () => {
    const hit = [[13, 0, 2000]], miss = [[13, 0, 700]], mHit = [[8, 0, 600], [15, 0, 1400]], mMiss = [[8, 0, 600], [15, 0, 100]];
    const S = baseState(); // com manhã: 3 de 4 (75%); sem manhã: 3 de 5 (60%): 15 pontos
    fill(S, 9, (k, i) => dayOf(k, 2000, i <= 3 ? mHit : i === 4 ? mMiss : i <= 7 ? hit : miss));
    expect(texts(S).some((x) => /antes das 10h/.test(x))).toBe(false);
    const T = baseState(); // com manhã: 2 de 4 (50%); sem manhã: 1 de 4 (25%): 25 pontos
    fill(T, 8, (k, i) => dayOf(k, 2000, i <= 2 ? mHit : i <= 4 ? mMiss : i === 5 ? hit : miss));
    expect(texts(T)).toContain('Nos dias em que você bebe 500 ml antes das 10h, bate a meta em 50% das vezes; nos outros, em 25%.');
  });
  it('conselho do sono: a meta fechada às 20h30 (1h30 antes do fim da janela, 22h) já avisa; às 20h29 ainda não', () => {
    const S = baseState();
    fill(S, 6, (k) => dayOf(k, 2000, [[9, 0, 1000], [20, 30, 1000]]));
    expect(texts(S)).toContain('Você costuma completar a meta por volta das 20h30. Tão perto da hora de dormir pode atrapalhar o sono: tente adiantar um pouco.');
    const T = baseState();
    fill(T, 6, (k) => dayOf(k, 2000, [[9, 0, 1000], [20, 29, 1000]]));
    expect(texts(T)).toContain('Você costuma completar a meta por volta das 20h29.');
  });
  it('semana: com médias iguais o melhor dia é o primeiro da semana; no empate do pior, o ponto fraco também é o primeiro', () => {
    const S = baseState();
    fill(S, 14, (k) => dayOf(k, 2000, [[10, 0, 1500]])); // todos os dias a 75%
    const w = C.patterns(S, TODAY, S.profile).week;
    expect(w.best).toBe(0);
    expect(w.texts.map((x) => x.t)).toEqual(['Você se hidrata melhor aos domingos: em média 75% da meta.']);
    const T = baseState(); // quartas 100%; segundas e sextas empatadas em 30%
    fill(T, 14, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 3 ? 2000 : wd === 1 || wd === 5 ? 600 : 1500]]); });
    expect(C.patterns(T, TODAY, T.profile).week.texts.map((x) => x.t)).toContain('Seu ponto fraco são as segundas: em média 30% da meta.');
  });
  it('ponto fraco: só quando fica 20 pontos abaixo do melhor dia (15 não aparece, 25 aparece)', () => {
    const S = baseState(); // sextas 100%, terças 85%, o resto 95%: 15 pontos
    fill(S, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 5 ? 2000 : wd === 2 ? 1700 : 1900]]); });
    expect(C.patterns(S, TODAY, S.profile).week.texts.some((x) => /ponto fraco/.test(x.t))).toBe(false);
    const T = baseState(); // sextas 100%, terças 75%: 25 pontos
    fill(T, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 5 ? 2000 : wd === 2 ? 1500 : 1900]]); });
    expect(C.patterns(T, TODAY, T.profile).week.texts.map((x) => x.t)).toContain('Seu ponto fraco são as terças: em média 75% da meta.');
  });
  it('fim de semana contra dias úteis: precisa de 2 dias de fim de semana e 3 de dia útil', () => {
    // TODAY é terça (30/06/2026): 25/06 quinta, 26 sexta, 27 sábado, 28 domingo, 29 segunda
    const mk = (list) => { const S = baseState(); list.forEach((k) => { const wd = C.keyToDate(k).getDay(); S.days[k] = dayOf(k, 2000, [[10, 0, wd === 0 || wd === 6 ? 600 : 2000]]); }); return S; };
    const has = (S) => C.patterns(S, TODAY, S.profile).week.texts.some((x) => /fins de semana/.test(x.t));
    expect(has(mk(['2026-06-27', '2026-06-29', '2026-06-26', '2026-06-25']))).toBe(false); // 1 dia de fim de semana e 3 úteis
    expect(has(mk(['2026-06-27', '2026-06-28', '2026-06-29', '2026-06-26']))).toBe(false); // 2 de fim de semana e só 2 úteis
    const D = mk(['2026-06-27', '2026-06-28', '2026-06-29', '2026-06-26', '2026-06-25']);
    expect(C.patterns(D, TODAY, D.profile).week.texts.map((x) => x.t)).toContain('Nos fins de semana você fica em média em 30% da meta, contra 100% nos dias úteis. Sem a rotina é fácil esquecer: deixe a garrafa à vista.');
  });
  it('fim de semana contra dias úteis: a diferença mínima é de 15 pontos (12,5 não aparece, nos dois sentidos)', () => {
    const has = (S) => C.patterns(S, TODAY, S.profile).week.texts.some((x) => /fins de semana/.test(x.t));
    const S = baseState(); // fins de semana 87,5%, úteis 100%
    fill(S, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 0 || wd === 6 ? 1750 : 2000]]); });
    expect(has(S)).toBe(false);
    const T = baseState(); // fins de semana 100%, úteis 87,5%
    fill(T, 28, (k) => { const wd = C.keyToDate(k).getDay(); return dayOf(k, 2000, [[10, 0, wd === 0 || wd === 6 ? 2000 : 1750]]); });
    expect(has(T)).toBe(false);
  });
  it('texts junta, na ordem da tela, o resumo, o ritmo do dia e a semana (e insights é o mesmo texto)', () => {
    const S = baseState();
    fill(S, 14, (k) => dayOf(k, 2000, [[10, 0, 1500]]));
    const p = C.patterns(S, TODAY, S.profile);
    expect(p.week.texts.length).toBeGreaterThan(0);
    expect(p.texts).toEqual(p.sum.concat(p.day.texts, p.week.texts));
    expect(C.insights(S, TODAY, S.profile)).toEqual(p.texts);
  });
  it('com "somar outros líquidos na meta" ligado, a média da semana também conta o café (até metade da meta)', () => {
    C.setMix(true);
    const S = baseState();
    fill(S, 14, (k) => dayOf(k, 2000, [[8, 0, 1000], [9, 0, 500, 'coffee']])); // 1.000 de água + 500 de café = 75% com a soma
    expect(C.patterns(S, TODAY, S.profile).week.cols.map((c) => c.avg)).toEqual([0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75]);
    C.setMix(false);
    expect(C.patterns(S, TODAY, S.profile).week.cols[0].avg).toBe(0.5);
  });
});
