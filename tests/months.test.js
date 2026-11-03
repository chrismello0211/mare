// Maré — testes de "Seus meses" (1.7.0): o mês de agora contra o anterior (months) e o calendário colorido das últimas 13 semanas (heatmap). Rodar: npm test
// As datas são fixas (2026 a 2028) e os horários, locais: valem em qualquer fuso.
import { describe, it, expect, afterEach } from 'vitest';
import * as C from '../public/js/core.js';
import { MONTHS } from '../public/js/store.js';

afterEach(() => { C.setMix(false); });

const ts = (k, h, m) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); };
const dayOf = (k, goal, list) => ({ goal: goal, entries: list.map((x, i) => ({ id: k + '-' + i, t: ts(k, x[0], x[1]), ml: x[2], d: x[3] || 'water' })) });
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const fresh = (made) => C.defaults(ts(made || '2026-01-01', 9)); // o app existe desde 1º de janeiro (se não disser outra data)
// Um mês inteiro (ym = '2026-09', n dias): os primeiros metN dias batem a meta (2000 ml de 2000) e os outros têm `ml` de água (um registro por dia)
function fillMonth(S, ym, n, metN, ml) {
  for (let d = 1; d <= n; d++) { const k = ym + '-' + pad2(d); S.days[k] = dayOf(k, 2000, [[10, 0, d <= metN ? 2000 : ml]]); }
  return S;
}
// Setembro (30 dias) e outubro (31): sem meta nenhuma, todo dia com `ml` de água
const flat = (sep, oct) => fillMonth(fillMonth(fresh(), '2026-09', 30, 0, sep), '2026-10', 31, 0, oct);
const NOV2 = '2026-11-02'; // segunda-feira: ontem (1º de novembro) é o único dia de novembro que já acabou

describe('months: o mês de agora contra o anterior', () => {
  it('dois meses inteiros: os números de cada um, os nomes e as duas frases', () => {
    const S = fillMonth(fillMonth(fresh(), '2026-09', 30, 24, 1000), '2026-10', 31, 28, 1000);
    const m = C.months(S, NOV2); // em 2/11 só 1 dia de novembro acabou: vale outubro contra setembro
    expect(m.ready).toBe(true);
    expect(m.cur).toEqual({ ym: '2026-10', days: 31, met: 28, used: 31, avg: 1903, rate: 28 / 31 }); // (28 × 2000 + 3 × 1000) / 31 = 1903,2
    expect(m.prev).toEqual({ ym: '2026-09', days: 30, met: 24, used: 30, avg: 1800, rate: 0.8 }); // (24 × 2000 + 6 × 1000) / 30
    expect(m.texts).toEqual([
      { e: '📈', t: 'Sua média por dia em outubro está 6% acima da de setembro.' }, // (1903 − 1800) / 1800 = 5,7%
      { e: '🎯', t: 'Você bateu a meta em 90% dos dias de outubro, contra 80% em setembro. Que evolução!' },
    ]);
  });
  it('quando o mês de agora tem menos de 7 dias, vale o que passou, inteiro; com 7 dias (de 1º a 7), vale o de agora', () => {
    const S = fillMonth(fillMonth(fresh(), '2026-09', 30, 24, 1000), '2026-10', 31, 28, 1000);
    expect(C.MONTH_MIN).toBe(7);
    expect(C.months(S, '2026-11-07').cur).toMatchObject({ ym: '2026-10', days: 31 }); // ontem foi 6/11: 6 dias de novembro
    const m8 = C.months(S, '2026-11-08'); // ontem foi 7/11: 7 dias de novembro, mas nenhum com água ainda
    expect(m8.cur).toMatchObject({ ym: '2026-11', days: 7, used: 0 });
    expect(m8.prev).toMatchObject({ ym: '2026-10', days: 31 });
    expect(m8.ready).toBe(false); // novembro ainda não tem dias com água
    for (let d = 1; d <= 7; d++) S.days['2026-11-' + pad2(d)] = dayOf('2026-11-' + pad2(d), 2000, [[10, 0, 1500]]);
    const m = C.months(S, '2026-11-08');
    expect(m.ready).toBe(true);
    expect(m.cur).toEqual({ ym: '2026-11', days: 7, met: 0, used: 7, avg: 1500, rate: 0 });
    expect(m.texts).toEqual([
      { e: '📉', t: 'Sua média por dia em novembro está 21% abaixo da de outubro.' }, // (1500 − 1903) / 1903 = −21,2%
      { e: '🎯', t: 'Você bateu a meta em 0% dos dias de novembro, contra 90% em outubro.' }, // cair não ganha elogio
    ]);
  });
  it('a média arredonda para o ml mais próximo (1000,6 sobe para 1001), e a taxa de metas é sobre os dias do mês, não só sobre os com água', () => {
    const S = fillMonth(fillMonth(fresh(), '2026-09', 30, 0, 1000), '2026-10', 31, 0, 1000);
    S.days['2026-10-05'] = dayOf('2026-10-05', 2000, [[10, 0, 1020]]); // 31 020 ml em 31 dias = 1000,65 ml por dia
    expect(C.months(S, NOV2).cur.avg).toBe(1001);
    S.days['2026-10-05'] = dayOf('2026-10-05', 2000, [[10, 0, 1010]]); // 31 010 / 31 = 1000,32: desce
    expect(C.months(S, NOV2).cur.avg).toBe(1000);
    // outubro com água em só 10 dos 31 dias (5 na meta): a taxa é 5 de 31 (16%), e não 5 de 10
    const T = fillMonth(fresh(), '2026-09', 30, 15, 1000);
    for (let d = 1; d <= 10; d++) { const k = '2026-10-' + pad2(d); T.days[k] = dayOf(k, 2000, [[10, 0, d <= 5 ? 2000 : 1000]]); }
    const m = C.months(T, NOV2);
    expect(m.cur).toEqual({ ym: '2026-10', days: 31, met: 5, used: 10, avg: 484, rate: 5 / 31 }); // (5 × 2000 + 5 × 1000) / 31 = 483,9
    expect(m.texts[1].t).toBe('Você bateu a meta em 16% dos dias de outubro, contra 50% em setembro.');
  });
  it('hoje nunca entra na conta (ainda não acabou), por maior que seja o registro de hoje', () => {
    const S = fillMonth(fresh(), '2026-11', 9, 0, 1000);
    const before = C.months(S, '2026-11-10');
    expect(before.cur).toMatchObject({ ym: '2026-11', days: 9, avg: 1000 });
    S.days['2026-11-10'] = dayOf('2026-11-10', 2000, [[8, 0, 9999]]);
    S.days['2026-11-11'] = dayOf('2026-11-11', 2000, [[8, 0, 9999]]); // amanhã também não (relógio adiantado)
    expect(C.months(S, '2026-11-10').cur).toEqual(before.cur);
  });
  it('a média: igual até 2% de diferença, "acima" ou "abaixo" a partir de 3%; sem nenhuma meta batida, não há a frase dos dias na meta', () => {
    const say = (oct) => C.months(flat(1000, oct), NOV2).texts;
    expect(say(1020)).toEqual([{ e: '➡️', t: 'Sua média por dia em outubro está igual à de setembro.' }]);
    expect(say(980)).toEqual([{ e: '➡️', t: 'Sua média por dia em outubro está igual à de setembro.' }]);
    expect(say(1000)[0].t).toBe('Sua média por dia em outubro está igual à de setembro.');
    expect(say(1030)).toEqual([{ e: '📈', t: 'Sua média por dia em outubro está 3% acima da de setembro.' }]);
    expect(say(970)).toEqual([{ e: '📉', t: 'Sua média por dia em outubro está 3% abaixo da de setembro.' }]);
    expect(say(1500)[0].t).toBe('Sua média por dia em outubro está 50% acima da de setembro.');
  });
  it('"Que evolução!": só quando os dias na meta subiram 10 pontos ou mais (8 e 9 não, 10 e 11 sim; descer nunca)', () => {
    const rate = (mp, mc) => C.months(fillMonth(fillMonth(fresh(), '2026-09', 30, mp, 1000), '2026-10', 31, mc, 1000), NOV2).texts[1].t;
    expect(rate(15, 18)).toBe('Você bateu a meta em 58% dos dias de outubro, contra 50% em setembro.'); // +8
    expect(rate(9, 12)).toBe('Você bateu a meta em 39% dos dias de outubro, contra 30% em setembro.'); // +9
    expect(rate(24, 28)).toBe('Você bateu a meta em 90% dos dias de outubro, contra 80% em setembro. Que evolução!'); // +10
    expect(rate(15, 19)).toBe('Você bateu a meta em 61% dos dias de outubro, contra 50% em setembro. Que evolução!'); // +11
    expect(rate(28, 24)).toBe('Você bateu a meta em 77% dos dias de outubro, contra 93% em setembro.'); // −16
    expect(rate(0, 3)).toBe('Você bateu a meta em 10% dos dias de outubro, contra 0% em setembro. Que evolução!');
  });
  it('só se compara com dias de sobra: 7 dias e 3 com água em cada mês (6 dias, ou só 2 dias com água, deixam de fora)', () => {
    expect(C.MONTH_USED).toBe(3);
    const sparse = (S, ym, days, ml) => { days.forEach((d) => { const k = ym + '-' + pad2(d); S.days[k] = dayOf(k, 2000, [[10, 0, ml]]); }); return S; };
    // o mês de agora (outubro) com poucos dias de água
    let S = sparse(fresh('2026-09-01'), '2026-09', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1000);
    expect(C.months(sparse(S, '2026-10', [3, 20], 1000), NOV2)).toMatchObject({ ready: false, cur: { used: 2, days: 31 } });
    expect(C.months(sparse(S, '2026-10', [3, 20, 21], 1000), NOV2)).toMatchObject({ ready: true, cur: { used: 3 } });
    // e o mês anterior
    S = sparse(fresh('2026-09-01'), '2026-10', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1000);
    expect(C.months(sparse(S, '2026-09', [4, 5], 1000), NOV2)).toMatchObject({ ready: false, prev: { used: 2, days: 30 } });
    expect(C.months(sparse(S, '2026-09', [4, 5, 6], 1000), NOV2).ready).toBe(true);
    // um dia só com café não é dia com água
    S = sparse(fresh('2026-09-01'), '2026-09', [1, 2, 3], 1000);
    sparse(S, '2026-10', [1, 2], 1000); S.days['2026-10-03'] = dayOf('2026-10-03', 2000, [[10, 0, 900, 'coffee']]);
    expect(C.months(S, NOV2).ready).toBe(false);
  });
  it('conta desde que a pessoa começou: o mês em que ela começou entra só dali em diante; antes disso não há "dia sem registro"', () => {
    const base = (made) => { const S = fresh(made); fillMonth(S, '2026-10', 31, 10, 1000); return S; };
    // começou em 24/09 (7 dias de setembro: de 24 a 30), mas só registrou do dia 27 em diante
    const S = base('2026-09-24');
    for (let d = 27; d <= 30; d++) S.days['2026-09-' + d] = dayOf('2026-09-' + d, 2000, [[10, 0, 1400]]);
    const m = C.months(S, NOV2);
    expect(m.prev).toEqual({ ym: '2026-09', days: 7, met: 0, used: 4, avg: 800, rate: 0 }); // 4 dias × 1400 / 7 dias
    expect(m.ready).toBe(true);
    // começou em 25/09: só 6 dias de setembro
    const T = base('2026-09-25');
    for (let d = 27; d <= 30; d++) T.days['2026-09-' + d] = dayOf('2026-09-' + d, 2000, [[10, 0, 1400]]);
    expect(C.months(T, NOV2)).toMatchObject({ ready: false, prev: { days: 6 } });
    // começou em 1º de outubro: não existe setembro para a pessoa
    const U = base('2026-10-01');
    expect(C.months(U, NOV2)).toMatchObject({ ready: false, prev: null });
    expect(C.months(U, NOV2).cur).toMatchObject({ ym: '2026-10', days: 31 });
    // começou no meio de outubro, e hoje é dia 25: o mês de agora tem só os dias dali em diante
    const V = fresh('2026-10-12');
    for (let d = 12; d <= 31; d++) V.days['2026-10-' + pad2(d)] = dayOf('2026-10-' + pad2(d), 2000, [[10, 0, 1000]]);
    expect(C.months(V, '2026-10-25').cur).toMatchObject({ ym: '2026-10', days: 13 }); // de 12 a 24
    // registros mais antigos do que a criação (conta restaurada em outro aparelho): o primeiro registro é o primeiro dia
    const W = fresh('2026-10-20'); fillMonth(W, '2026-09', 30, 0, 1000); fillMonth(W, '2026-10', 31, 0, 1000);
    expect(C.months(W, NOV2).prev).toMatchObject({ ym: '2026-09', days: 30 });
    W.days = {}; fillMonth(W, '2026-09', 30, 0, 1000); delete W.days['2026-09-01']; delete W.days['2026-09-02']; fillMonth(W, '2026-10', 31, 0, 1000);
    expect(C.months(W, NOV2).prev).toMatchObject({ ym: '2026-09', days: 28 }); // o primeiro registro foi em 3/9
  });
  it('no primeiro dia de uso não há o que comparar (nem erro)', () => {
    const S = fresh('2026-11-02');
    expect(C.months(S, NOV2)).toEqual({ ready: false, cur: null, prev: null, texts: [] });
    expect(C.months(C.defaults(), '2026-11-02').ready).toBe(false);
  });
  it('meses curtos, ano bissexto e virada do ano', () => {
    const feb = fresh('2026-01-01'); fillMonth(feb, '2026-02', 28, 0, 1000); fillMonth(feb, '2026-03', 9, 0, 1000);
    expect(C.months(feb, '2026-03-10')).toMatchObject({ ready: true, cur: { ym: '2026-03', days: 9 }, prev: { ym: '2026-02', days: 28 } });
    const leap = fresh('2028-01-01'); fillMonth(leap, '2028-02', 29, 0, 1000); fillMonth(leap, '2028-03', 9, 0, 1000);
    expect(C.months(leap, '2028-03-10').prev).toMatchObject({ ym: '2028-02', days: 29 });
    const yr = fresh('2026-01-01'); fillMonth(yr, '2026-11', 30, 0, 1000); fillMonth(yr, '2026-12', 31, 0, 1100); fillMonth(yr, '2027-01', 11, 0, 1200);
    expect(C.months(yr, '2027-01-12')).toMatchObject({ cur: { ym: '2027-01', days: 11 }, prev: { ym: '2026-12', days: 31 } });
    const jan = C.months(yr, '2027-01-03'); // só 2 dias de janeiro: vale dezembro contra novembro
    expect(jan).toMatchObject({ ready: true, cur: { ym: '2026-12', days: 31 }, prev: { ym: '2026-11', days: 30 } });
    expect(jan.texts[0].t).toBe('Sua média por dia em dezembro está 10% acima da de novembro.');
    const dec = C.months(yr, '2027-01-01'); // 1º de janeiro: ontem foi 31/12, e dezembro acabou
    expect(dec.cur).toMatchObject({ ym: '2026-12', days: 31 });
  });
  it('média zero no mês anterior: sem a frase da média (não dá para dividir), mas os dias na meta seguem', () => {
    const S = fresh();
    for (let d = 1; d <= 30; d++) { const k = '2026-09-' + pad2(d); S.days[k] = dayOf(k, 2000, [[10, 0, 0]]); } // água registrada com 0 ml
    fillMonth(S, '2026-10', 31, 28, 1000);
    const m = C.months(S, NOV2);
    expect(m.prev).toMatchObject({ avg: 0, used: 30, met: 0 });
    expect(m.texts).toEqual([{ e: '🎯', t: 'Você bateu a meta em 90% dos dias de outubro, contra 0% em setembro. Que evolução!' }]);
  });
  it('os nomes dos meses são os da tela (store.MONTHS é a mesma lista)', () => {
    expect(C.MONTH_NAMES).toEqual(['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']);
    expect(MONTHS).toBe(C.MONTH_NAMES);
  });
  it('com "somar outros líquidos" ligado, a média e a meta contam o café (até metade da meta), como no resto do app', () => {
    C.setMix(true);
    const S = fresh();
    for (let d = 1; d <= 30; d++) { const k = '2026-09-' + pad2(d); S.days[k] = dayOf(k, 2000, [[8, 0, 1000], [9, 0, 1000, 'coffee']]); } // 1000 + 1000 de café = 2000 com a soma
    fillMonth(S, '2026-10', 31, 0, 1000);
    const m = C.months(S, NOV2);
    expect(m.prev).toMatchObject({ avg: 2000, met: 30, used: 30 });
    C.setMix(false);
    expect(C.months(S, NOV2).prev).toMatchObject({ avg: 1000, met: 0 });
  });
});

/* ---------- o calendário colorido ---------- */
const NOV2S = fresh('2026-01-01'); // sem registros: a forma do calendário não depende deles
const cellOf = (h, k) => { let found = null; h.cols.forEach((col) => col.forEach((c) => { if (c.k === k) found = c; })); return found; };
const flatKeys = (h) => { const a = []; h.cols.forEach((col) => col.forEach((c) => a.push(c.k))); return a; };

describe('heatmap: o calendário colorido das últimas 13 semanas', () => {
  it('forma: 13 colunas de domingo a sábado, todos os dias em ordem, e a última coluna para em hoje', () => {
    const h = C.heatmap(NOV2S, NOV2);
    expect(C.HM_WEEKS).toBe(13);
    expect(h.cols.length).toBe(13);
    expect(h.cols.map((c) => c.length)).toEqual([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 2]); // 2/11/2026 é segunda: a última semana tem domingo e segunda
    h.cols.forEach((col) => { expect(C.keyToDate(col[0].k).getDay()).toBe(0); });
    const keys = flatKeys(h);
    expect(keys[0]).toBe('2026-08-09'); // o domingo, 12 semanas antes do domingo de hoje (1/11)
    expect(keys[keys.length - 1]).toBe(NOV2);
    keys.forEach((k, i) => { if (i) expect(k, 'depois de ' + keys[i - 1]).toBe(C.addDays(keys[i - 1], 1)); });
    expect(keys.length).toBe(12 * 7 + 2);
    expect(h.span).toBe(86);
    const todays = keys.filter((k) => cellOf(h, k).today);
    expect(todays).toEqual([NOV2]);
  });
  it('a última coluna: um domingo tem 1 dia; um sábado, os 7; a mesma largura em qualquer dia', () => {
    const sun = C.heatmap(NOV2S, '2026-11-08'), sat = C.heatmap(NOV2S, '2026-11-07');
    expect(sun.cols.length).toBe(13); expect(sat.cols.length).toBe(13);
    expect(sun.cols[12].map((c) => c.k)).toEqual(['2026-11-08']);
    expect(sun.cols[12][0].today).toBe(true);
    expect(sat.cols[12].map((c) => c.k)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(sat.cols[0][0].k).toBe('2026-08-09');
    expect(sun.cols[0][0].k).toBe('2026-08-16'); // o dia seguinte desloca a janela inteira uma semana
  });
  it('os níveis, como no calendário do Histórico: 0 sem registro, 1 até menos da metade da meta, 2 de metade até a meta, 3 meta batida', () => {
    const S = fresh();
    const put = (k, goal, ml, drink) => { S.days[k] = dayOf(k, goal, [[10, 0, ml, drink]]); };
    put('2026-10-02', 2000, 999); put('2026-10-03', 2000, 1000); put('2026-10-04', 2000, 1999); put('2026-10-05', 2000, 2000); put('2026-10-06', 2000, 2600);
    put('2026-10-07', 3000, 1499); put('2026-10-08', 3000, 1500); put('2026-10-09', 3000, 3000); // a meta do dia, não a de hoje
    put('2026-10-10', 2000, 2000, 'coffee'); // só café: não conta (sem "somar outros líquidos")
    S.days['2026-10-11'] = { goal: 2000, entries: [] };
    const h = C.heatmap(S, NOV2);
    const lv = (k) => cellOf(h, k).l;
    expect(lv('2026-10-01')).toBe(0); // dia sem registro nenhum
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => lv('2026-10-' + pad2(d)))).toEqual([1, 2, 2, 3, 3, 1, 2, 3, 0, 0]);
    expect(cellOf(h, '2026-10-06').ml).toBe(2600);
    expect(cellOf(h, '2026-10-02').ml).toBe(999);
    expect(cellOf(h, '2026-10-10').ml).toBe(0);
    expect(cellOf(h, '2026-10-01').ml).toBe(0);
    expect(h.met).toBe(3);
    // o mesmo dia com a meta de hoje: 600 ml de 1000 já é "metade ou mais" (2), mesmo que a meta de hoje fosse 2000
    S.days['2026-10-12'] = dayOf('2026-10-12', 1000, [[10, 0, 600]]); S.days['2026-10-13'] = dayOf('2026-10-13', 1000, [[10, 0, 1000]]);
    const h2 = C.heatmap(S, NOV2);
    expect(cellOf(h2, '2026-10-12').l).toBe(2);
    expect(cellOf(h2, '2026-10-13').l).toBe(3);
    // com "somar outros líquidos": 800 de água + 600 de café (até metade da meta) passam de metade da meta
    C.setMix(true);
    S.days['2026-10-14'] = dayOf('2026-10-14', 2000, [[8, 0, 800], [9, 0, 600, 'coffee']]);
    expect(cellOf(C.heatmap(S, NOV2), '2026-10-14').l).toBe(2);
    C.setMix(false);
    expect(cellOf(C.heatmap(S, NOV2), '2026-10-14').l).toBe(1);
  });
  it('dia sem a meta guardada (registro antigo) usa a meta que o app calcularia para aquele dia', () => {
    const S = fresh();
    S.days['2026-10-02'] = { entries: [{ id: 'a', t: ts('2026-10-02', 9), ml: 100, d: 'water' }] }; // sem "goal"
    const g = C.goalToday(S, '2026-10-02');
    expect(g).toBeGreaterThan(500);
    S.days['2026-10-03'] = { entries: [{ id: 'b', t: ts('2026-10-03', 9), ml: Math.ceil(g / 2), d: 'water' }] };
    const h = C.heatmap(S, NOV2);
    expect(cellOf(h, '2026-10-02').l).toBe(1);
    expect(cellOf(h, '2026-10-03').l).toBe(2);
    // com uma meta manual de 3.000 ml (e não os 2.000 de quando o dia não diz nada): 1.499 ml ainda é menos da metade, 1.500 já é a metade
    S.goal.mode = 'manual'; S.goal.manual = 3000;
    expect(C.goalToday(S, '2026-10-04')).toBe(3000);
    S.days['2026-10-04'] = { entries: [{ id: 'c', t: ts('2026-10-04', 9), ml: 1499, d: 'water' }] };
    S.days['2026-10-05'] = { entries: [{ id: 'd', t: ts('2026-10-05', 9), ml: 1500, d: 'water' }] };
    const h2 = C.heatmap(S, NOV2);
    expect(cellOf(h2, '2026-10-04').l).toBe(1);
    expect(cellOf(h2, '2026-10-05').l).toBe(2);
  });
  it('antes do primeiro dia de uso só há o lugar vazio (l = -1); o primeiro dia já conta (mesmo sem registro) e a conta de dias começa nele', () => {
    const S = fresh('2026-10-15');
    const h = C.heatmap(S, NOV2);
    expect(cellOf(h, '2026-10-14')).toEqual({ k: '2026-10-14', l: -1, ml: 0, today: false });
    expect(cellOf(h, '2026-08-09').l).toBe(-1);
    expect(cellOf(h, '2026-10-15').l).toBe(0);
    expect(h.span).toBe(19); // de 15/10 a 2/11
    expect(h.cols.length).toBe(13);
    // um registro mais antigo do que a criação (conta restaurada) puxa o primeiro dia para trás
    S.days['2026-10-10'] = dayOf('2026-10-10', 2000, [[9, 0, 500]]);
    const h2 = C.heatmap(S, NOV2);
    expect(cellOf(h2, '2026-10-09').l).toBe(-1);
    expect(cellOf(h2, '2026-10-10').l).toBe(1);
    expect(cellOf(h2, '2026-10-11').l).toBe(0);
    expect(h2.span).toBe(24);
  });
  it('o texto: quantos dias na meta entre os que contam (no singular com 1 dia), ou um incentivo sem meta; vazio quando nem o primeiro dia chegou', () => {
    const S = fresh('2026-10-30');
    expect(C.heatmap(S, NOV2).text).toBe('Ainda sem meta batida neste calendário. Cada gole conta!');
    S.days['2026-10-30'] = dayOf('2026-10-30', 2000, [[10, 0, 2000]]); S.days['2026-10-31'] = dayOf('2026-10-31', 2000, [[10, 0, 2500]]); S.days['2026-11-01'] = dayOf('2026-11-01', 2000, [[10, 0, 1500]]);
    S.days[NOV2] = dayOf(NOV2, 2000, [[10, 0, 2000]]); // hoje conta (a meta de hoje já foi batida)
    const h = C.heatmap(S, NOV2);
    expect(h.span).toBe(4);
    expect(h.met).toBe(3);
    expect(h.text).toBe('Você bateu a meta em 3 de 4 dias.');
    const one = fresh(NOV2); one.days[NOV2] = dayOf(NOV2, 2000, [[10, 0, 2000]]);
    expect(C.heatmap(one, NOV2).text).toBe('Você bateu a meta em 1 de 1 dia.');
    const none = C.heatmap(fresh('2026-11-03'), NOV2); // a criação "no futuro" (relógio mudado): nada para mostrar
    expect(none).toMatchObject({ span: 0, met: 0, text: '' });
    expect(none.cols.length).toBe(13);
    expect(flatKeys(none).every((k) => cellOf(none, k).l === -1)).toBe(true);
  });
  it('os rótulos dos meses: o mês (abreviado) que começa em cada coluna; a 1ª coluna diz o mês dela só se nenhum começa nas 3 primeiras', () => {
    expect(C.heatmap(NOV2S, NOV2).labels).toEqual([{ w: 0, m: 'ago' }, { w: 3, m: 'set' }, { w: 7, m: 'out' }, { w: 12, m: 'nov' }]);
    // outubro começa na 3ª coluna (w = 2): ela já diz o mês, e a primeira fica sem rótulo
    expect(C.heatmap(NOV2S, '2026-12-06').labels).toEqual([{ w: 2, m: 'out' }, { w: 7, m: 'nov' }, { w: 11, m: 'dez' }]);
    // novembro começa na 1ª coluna (w = 0): um rótulo só
    expect(C.heatmap(NOV2S, '2027-01-24').labels).toEqual([{ w: 0, m: 'nov' }, { w: 4, m: 'dez' }, { w: 8, m: 'jan' }]);
    // o dia 1º que ainda não chegou (a coluna de hoje passa de 31/12 para 1/1) não vira rótulo
    expect(C.heatmap(NOV2S, '2026-12-30').labels.map((x) => x.m)).toEqual(['out', 'nov', 'dez']); // 1º de outubro já ficou para trás: a 1ª coluna diz "out"
    expect(C.heatmap(NOV2S, '2026-12-30').labels.map((x) => x.w)).toEqual([0, 4, 8]);
    expect(C.heatmap(NOV2S, '2027-01-02').labels.map((x) => x.m)).toEqual(['out', 'nov', 'dez', 'jan']);
    // os meses seguem o calendário também em fevereiro e na virada do ano
    expect(C.heatmap(NOV2S, '2027-03-02').labels.map((x) => x.m)).toEqual(['dez', 'jan', 'fev', 'mar']);
    // novembro de 2025 começou num sábado, o último dia da coluna de 26/10: o rótulo fica nela (w = 6), e não na coluna de 2/11
    expect(C.heatmap(fresh('2025-01-01'), '2025-12-10').labels).toEqual([{ w: 2, m: 'out' }, { w: 6, m: 'nov' }, { w: 11, m: 'dez' }]);
  });
  it('rótulos sempre afastados (4 colunas ou mais) e só de meses, em um ano inteiro de "hoje" diferentes', () => {
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const S = fresh('2025-01-01');
    for (let i = 0; i < 400; i++) {
      const today = C.addDays('2026-01-01', i), h = C.heatmap(S, today);
      expect(h.cols.length).toBe(13);
      expect(h.labels.length, today).toBeGreaterThanOrEqual(3);
      h.labels.forEach((x, j) => { expect(MESES, today).toContain(x.m); if (j) expect(x.w - h.labels[j - 1].w, today).toBeGreaterThanOrEqual(3); });
      expect(h.labels[0].w, today).toBeLessThan(3);
      expect(flatKeys(h)[flatKeys(h).length - 1]).toBe(today);
    }
  });
});
