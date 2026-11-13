// Maré — testes dos desafios da 1.10.0: as missões leve e ousada do dia, o desafio da semana e o do mês, o trio de missões e as 7 medalhas que vêm deles. Rodar: npm test
// As datas são fixas (2026) e os horários, locais: valem em qualquer fuso. 1/6/2026 é segunda-feira.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../public/js/core.js';

afterEach(() => { C.setMix(false); }); // "somar na meta" é um interruptor global: todo teste começa com ele desligado

const ts = (k, h, m) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); };
// Um dia de registros: list = [[hora, minuto, ml, bebida?]]
const dayOf = (k, goal, list) => ({ goal: goal, entries: list.map((x, i) => ({ id: k + '-' + i, t: ts(k, x[0], x[1]), ml: x[2], d: x[3] || 'water' })) });
const metDay = (k, h) => dayOf(k, 2000, [[h || 10, 0, 2000]]); // meta batida de uma vez, às h (10h se não disser)
const base = () => C.defaults(ts('2026-01-01', 9));
const stateWith = (days) => { const S = base(); Object.keys(days).forEach((k) => { S.days[k] = days[k]; }); return S; };
const es = (k, list) => dayOf(k, 2000, list).entries; // só os registros
const MON = '2026-06-01'; // segunda-feira
const SUN = '2026-06-07';
const d = (n) => C.addDays(MON, n); // o dia n da semana (0 = segunda, 6 = domingo)
const ids = (S) => C.newAchievements(S).map((a) => a.id);
const W = (id) => C.WEEKLY.filter((c) => c.id === id)[0];
const M = (id) => C.MONTHLY.filter((c) => c.id === id)[0];
// o desafio c na semana de 1/6, vista no domingo (ou em `today`)
const week = (S, id, today) => C.challengeState(S, W(id), MON, SUN, today || SUN);
// dnum de uma chave: o dia como inteiro, sem fuso
const dn = (k) => { const p = k.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); };

/* ---------- as missões leve e ousada ---------- */
describe('missões leve e ousada: as listas e o sorteio pela data', () => {
  it('as listas são um contrato (ids, famílias, emoji, texto); toda família tem uma missão em cada lista, para o sorteio nunca ficar sem opção', () => {
    expect(C.MISSIONS_EASY.map((m) => m.id)).toEqual(['ehalf', 'e1l', 'e3', 'ehrs3', 'eaft', 'elunch', 'e34', 'e2am', 'ewake', 'eeve', 'e13', 'e2pm', 'esnack', 'ehalf16', 'e2eve', 'emid']);
    expect(C.MISSIONS_HARD.map((m) => m.id)).toEqual(['hv17', 'hhalf', 'h8', 'hhours', 'hblocks', 'hbal', 'h2x3', 'h1l11', 'h10', 'hbook', 'h3x3', 'h23', 'hblocks2', 'hnight2', 'h13a', 'hhours8', 'hthree']);
    const all = [].concat(C.MISSIONS, C.MISSIONS_EASY, C.MISSIONS_HARD);
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length); // ids únicos nas três listas
    all.forEach((m) => { expect(m.e && m.t && typeof m.p === 'function' && ['vol', 'cnt', 'spr'].indexOf(m.f) >= 0, m.id).toBeTruthy(); });
    ['vol', 'cnt', 'spr'].forEach((f) => {
      expect(C.MISSIONS.filter((m) => m.f === f).length, 'do dia ' + f).toBeGreaterThan(0);
      expect(C.MISSIONS_EASY.filter((m) => m.f === f).length, 'leve ' + f).toBeGreaterThan(0);
      expect(C.MISSIONS_HARD.filter((m) => m.f === f).length, 'ousada ' + f).toBeGreaterThan(0);
    });
    expect(C.MISSIONS.map((m) => m.f)).toEqual(['vol', 'cnt', 'vol', 'spr', 'vol']); // am500, six, by19, thirds, noon
  });
  it('a missão do dia é a de sempre; o mesmo dia dá sempre o mesmo trio; cada missão do trio é de uma família diferente', () => {
    let k = '2026-01-01';
    for (let i = 0; i < 800; i++) {
      const t = C.missionsOf(k), again = C.missionsOf(k);
      expect(t.main.id, k).toBe(C.missionFor(k).id);
      expect([t.easy.id, t.hard.id], k).toEqual([again.easy.id, again.hard.id]);
      expect([t.main.f, t.easy.f, t.hard.f].sort(), k).toEqual(['cnt', 'spr', 'vol']);
      expect(C.MISSIONS_EASY.indexOf(t.easy) >= 0 && C.MISSIONS_HARD.indexOf(t.hard) >= 0, k).toBe(true);
      expect((!t.easy.since || t.easy.since <= k) && (!t.hard.since || t.hard.since <= k), 'nenhuma missão sai antes da data de estreia: ' + k).toBe(true);
      k = C.addDays(k, 1);
    }
  });
  it('em dois anos, a partir da estreia das novas, saem todas as missões leves e todas as ousadas, bem espalhadas (nenhuma some e nenhuma passa de um terço dos dias)', () => {
    const cnt = {};
    let k = '2026-11-16';
    for (let i = 0; i < 730; i++) { const t = C.missionsOf(k); cnt[t.easy.id] = (cnt[t.easy.id] || 0) + 1; cnt[t.hard.id] = (cnt[t.hard.id] || 0) + 1; k = C.addDays(k, 1); }
    C.MISSIONS_EASY.concat(C.MISSIONS_HARD).forEach((m) => { expect(cnt[m.id], m.id).toBeGreaterThan(10); expect(cnt[m.id], m.id).toBeLessThan(730 / 3 + 40); });
  });
  it('dias seguidos não ficam sempre com as mesmas missões: a leve muda na maior parte dos dias (o sorteio é misturado, não em sequência)', () => {
    let same = 0, k = '2026-01-01';
    for (let i = 0; i < 300; i++) { if (C.missionsOf(k).easy.id === C.missionsOf(C.addDays(k, 1)).easy.id) same++; k = C.addDays(k, 1); }
    expect(same).toBeLessThan(90); // por acaso, repetir é cerca de 1 em 5; o limite folgado só pega um sorteio travado
    expect(same).toBeGreaterThan(5);
  });
  it('as chaves das leves e ousadas cumpridas e o trio', () => {
    expect(C.extraKey('2026-06-10', 'e')).toBe('2026-06-10:e');
    expect(C.extraKey('2026-06-10', 'h')).toBe('2026-06-10:h');
    const S = base(), k = '2026-06-10';
    expect(C.isTrio(S, k)).toBe(false);
    S.missions[k] = 1; expect(C.isTrio(S, k)).toBe(false);
    S.extras[k + ':e'] = 1; expect(C.isTrio(S, k)).toBe(false); // faltam a ousada
    S.extras[k + ':h'] = 1; expect(C.isTrio(S, k)).toBe(true);
    delete S.missions[k]; expect(C.isTrio(S, k)).toBe(false); // sem a do dia, não é trio
    expect(C.isTrio({}, k)).toBe(false); // estado sem os mapas (backup antigo)
  });
});

describe('missões leve e ousada: o andamento de cada uma', () => {
  const E = {}, H = {};
  C.MISSIONS_EASY.forEach((m) => { E[m.id] = m; });
  C.MISSIONS_HARD.forEach((m) => { H[m.id] = m; });
  const k = '2026-06-10';
  it('Chegue à metade da meta e Chegue a 1 L: seguem o total da meta (água, e os outros líquidos até o limite se "somar" estiver ligado)', () => {
    const e = es(k, [[8, 0, 500], [9, 0, 300, 'coffee']]);
    expect(E.ehalf.p(e, 2000)).toBeCloseTo(0.5);
    expect(E.ehalf.p(e, 3000)).toBeCloseTo(500 / 1500);
    expect(E.e1l.p(e, 2000)).toBeCloseTo(0.5);
    C.setMix(true);
    expect(E.ehalf.p(e, 2000)).toBeCloseTo(0.8); // 500 + 300 do café (cabe no limite de metade da meta)
    expect(E.e1l.p(e, 2000)).toBeCloseTo(0.8);
    expect(E.ehalf.p(es(k, [[8, 0, 200], [9, 0, 2000, 'juice']]), 2000)).toBeCloseTo(1.2); // o suco entra só até 1000: 200 + 1000 = 1200 de 1000
  });
  it('Beba água 3 vezes e em 3 horários diferentes: só a água conta, e dois goles na mesma hora são um horário só', () => {
    const e = es(k, [[8, 10, 200], [8, 50, 200], [9, 0, 200, 'sparkling'], [9, 30, 300, 'tea'], [23, 59, 100]]);
    expect(E.e3.p(e, 2000)).toBeCloseTo(4 / 3); // 4 registros de água (o chá não é um gole de água)
    expect(E.ehrs3.p(e, 2000)).toBeCloseTo(3 / 3); // as horas 8, 9 e 23
    expect(E.ehrs3.p(es(k, [[8, 10, 200], [8, 50, 200]]), 2000)).toBeCloseTo(1 / 3);
    expect(E.ehrs3.p(es(k, [[8, 10, 200], [20, 0, 300, 'coffee']]), 2000)).toBeCloseTo(1 / 3);
  });
  it('Beba água à tarde (12h às 18h) e no almoço (11h às 15h): 0 ou 1, nos minutos de cada limite; café não conta', () => {
    const one = (h, m, dk) => es(k, [[h, m, 100, dk]]);
    expect(E.eaft.p(one(11, 59), 2000)).toBe(0); expect(E.eaft.p(one(12, 0), 2000)).toBe(1);
    expect(E.eaft.p(one(17, 59), 2000)).toBe(1); expect(E.eaft.p(one(18, 0), 2000)).toBe(0);
    expect(E.eaft.p(one(14, 0, 'coffee'), 2000)).toBe(0);
    expect(E.elunch.p(one(10, 59), 2000)).toBe(0); expect(E.elunch.p(one(11, 0), 2000)).toBe(1);
    expect(E.elunch.p(one(14, 59), 2000)).toBe(1); expect(E.elunch.p(one(15, 0), 2000)).toBe(0);
    expect(E.elunch.p(one(12, 0, 'milk'), 2000)).toBe(0);
    expect(E.eaft.p([], 2000)).toBe(0);
  });
  it('Bata a meta antes das 17h e Chegue à metade da meta antes das 13h: contam só o que veio antes (17h00 e 13h00 já não)', () => {
    expect(H.hv17.p(es(k, [[16, 59, 2000]]), 2000)).toBeCloseTo(1);
    expect(H.hv17.p(es(k, [[17, 0, 2000]]), 2000)).toBe(0);
    expect(H.hv17.p(es(k, [[9, 0, 1000], [17, 0, 1000]]), 2000)).toBeCloseTo(0.5);
    expect(H.hhalf.p(es(k, [[12, 59, 1000]]), 2000)).toBeCloseTo(1);
    expect(H.hhalf.p(es(k, [[13, 0, 1000]]), 2000)).toBe(0);
    expect(H.hhalf.p(es(k, [[8, 0, 500]]), 2500)).toBeCloseTo(500 / 1250); // metade de 2.500 são 1.250
    C.setMix(true);
    expect(H.hhalf.p(es(k, [[8, 0, 500], [9, 0, 700, 'coffee']]), 2000)).toBeCloseTo(1.2);
    expect(H.hv17.p(es(k, [[8, 0, 500], [9, 0, 2000, 'coffee']]), 2000)).toBeCloseTo(0.75); // café só até a metade da meta: 500 + 1000
  });
  it('Beba água 8 vezes e em 6 horários diferentes', () => {
    const eight = []; for (let i = 0; i < 8; i++) eight.push([8, i * 7, 100]);
    expect(H.h8.p(es(k, eight), 2000)).toBe(1);
    expect(H.h8.p(es(k, eight.slice(0, 4)), 2000)).toBeCloseTo(0.5);
    expect(H.h8.p(es(k, eight.slice(0, 4).concat([[9, 0, 300, 'tea']])), 2000)).toBeCloseTo(0.5); // o chá não é um gole
    const six = [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [15, 0, 100], [17, 0, 100]];
    expect(H.hhours.p(es(k, six), 2000)).toBe(1);
    expect(H.hhours.p(es(k, six.slice(0, 5).concat([[15, 30, 100]])), 2000)).toBeCloseTo(5 / 6); // a 6ª na mesma hora da 5ª
    expect(H.hhours.p(es(k, six.slice(0, 5).concat([[18, 0, 100, 'juice']])), 2000)).toBeCloseTo(5 / 6);
  });
  it('Beba água a cada 3 horas, das 8h às 20h: quatro blocos (8h, 11h, 14h, 17h); cada um com água vale 1/4, e 7h59 e 20h00 ficam de fora', () => {
    const at = (h, m, dk) => es(k, [[h, m, 100, dk]]);
    expect(H.hblocks.p(at(7, 59), 2000)).toBe(0); expect(H.hblocks.p(at(8, 0), 2000)).toBeCloseTo(0.25);
    expect(H.hblocks.p(at(10, 59), 2000)).toBeCloseTo(0.25); expect(H.hblocks.p(at(11, 0), 2000)).toBeCloseTo(0.25);
    expect(H.hblocks.p(at(19, 59), 2000)).toBeCloseTo(0.25); expect(H.hblocks.p(at(20, 0), 2000)).toBe(0);
    expect(H.hblocks.p(at(9, 0, 'coffee'), 2000)).toBe(0);
    expect(H.hblocks.p(es(k, [[8, 0, 100], [8, 30, 100], [12, 0, 100]]), 2000)).toBeCloseTo(0.5); // dois blocos
    expect(H.hblocks.p(es(k, [[8, 0, 100], [11, 0, 100], [14, 0, 100], [17, 0, 100]]), 2000)).toBe(1);
  });
  it('Beba 300 ml em cada parte do dia e 2 vezes em cada parte: manhã até 11h59, tarde até 17h59, noite a partir das 18h; só a água, e cada parte vale no máximo 1/3', () => {
    const e = es(k, [[8, 0, 300], [13, 0, 150], [20, 0, 500, 'coffee']]);
    expect(H.hbal.p(e, 2000)).toBeCloseTo((1 + 0.5 + 0) / 3);
    expect(H.hbal.p(es(k, [[11, 59, 300], [12, 0, 300], [17, 59, 100], [18, 0, 300]]), 2000)).toBeCloseTo((1 + 1 + 1) / 3); // 17h59 é tarde (400 ml), 18h00 é noite
    expect(H.hbal.p(es(k, [[8, 0, 1500]]), 2000)).toBeCloseTo(1 / 3); // muita água numa parte só não passa de 1/3
    expect(H.hbal.p(es(k, [[8, 0, 200, 'sparkling'], [9, 0, 100]]), 2000)).toBeCloseTo(1 / 3); // água com gás também conta
    const two = es(k, [[8, 0, 100], [9, 0, 100], [13, 0, 100], [19, 0, 100], [21, 0, 100]]);
    expect(H.h2x3.p(two, 2000)).toBeCloseTo((1 + 0.5 + 1) / 3);
    expect(H.h2x3.p(es(k, [[8, 0, 100], [9, 0, 100], [10, 0, 100], [11, 0, 100]]), 2000)).toBeCloseTo(1 / 3);
    expect(H.h2x3.p(es(k, [[8, 0, 100], [13, 0, 100, 'tea']]), 2000)).toBeCloseTo(0.5 / 3);
  });
  it('com uma meta manual baixa (Ajustes aceita de 500 ml), nenhuma missão pede mais água do que a meta: "1 L" e "300 ml por parte" valem, no máximo, a meta e um terço dela', () => {
    const noon = C.MISSIONS.find((m) => m.id === 'noon');
    expect(E.e1l.p(es(k, [[8, 0, 800]]), 800)).toBe(1); // meta de 800 ml: os 800 ml já são "1 L"
    expect(E.e1l.p(es(k, [[8, 0, 500]]), 500)).toBe(1);
    expect(E.e1l.p(es(k, [[8, 0, 400]]), 800)).toBeCloseTo(0.5);
    expect(E.e1l.p(es(k, [[8, 0, 800]]), 2000)).toBeCloseTo(0.8); // com a meta de 1 L ou mais, é 1 L mesmo
    expect(E.e1l.p(es(k, [[8, 0, 1000]]), 1000)).toBe(1);
    expect(E.e1l.p(es(k, [[8, 0, 900]]), 1200)).toBeCloseTo(0.9);
    expect(noon.p(es(k, [[8, 0, 800]]), 800)).toBe(1); // a "1 L antes do meio-dia" da 1.x segue a mesma regra
    expect(noon.p(es(k, [[8, 0, 800]]), 2000)).toBeCloseTo(0.8);
    expect(noon.p(es(k, [[13, 0, 800]]), 800)).toBe(0); // e depois do meio-dia não conta
    expect(H.hbal.p(es(k, [[8, 0, 200], [13, 0, 200], [20, 0, 200]]), 600)).toBe(1); // meta de 600: 200 ml por parte do dia
    expect(H.hbal.p(es(k, [[8, 0, 100], [13, 0, 200], [20, 0, 200]]), 600)).toBeCloseTo((0.5 + 1 + 1) / 3);
    expect(H.hbal.p(es(k, [[8, 0, 200], [13, 0, 200], [20, 0, 200]]), 2000)).toBeCloseTo(200 / 300); // com a meta de sempre, são 300 por parte
    expect(H.hbal.p(es(k, [[8, 0, 300], [13, 0, 300], [20, 0, 300]]), 900)).toBe(1); // 900 ml: o limite em que 300 por parte e um terço da meta coincidem
    expect(H.hbal.p(es(k, [[8, 0, 300], [13, 0, 300], [20, 0, 300]]), 3000)).toBe(1);
  });
  it('outros líquidos nunca avançam as missões de contar goles, horários e partes do dia (só as de quantidade, com "somar" ligado)', () => {
    const e = es(k, [[8, 0, 800, 'coffee'], [9, 0, 800, 'juice'], [11, 0, 800, 'milk'], [14, 0, 800, 'tea'], [20, 0, 800, 'coconut']]);
    C.MISSIONS_EASY.concat(C.MISSIONS_HARD).forEach((m) => { expect(m.p(e, 2000), m.id).toBe(0); }); // com "somar" desligado, nada anda
    C.setMix(true);
    ['e3', 'ehrs3', 'eaft', 'elunch', 'e2am', 'ewake', 'eeve', 'e2pm', 'esnack'].forEach((id) => { expect(E[id].p(e, 2000), id).toBe(0); });
    ['h8', 'hhours', 'hblocks', 'hbal', 'h2x3', 'h10', 'hbook', 'h3x3', 'hblocks2', 'hnight2'].forEach((id) => { expect(H[id].p(e, 2000), id).toBe(0); });
    expect(E.ehalf.p(e, 2000)).toBeGreaterThan(0); // as de quantidade seguem a meta
    expect(E.e34.p(e, 2000)).toBeGreaterThan(0);
    expect(E.e13.p(e, 2000)).toBeGreaterThan(0);
    expect(H.h1l11.p(e, 2000)).toBeGreaterThan(0);
    expect(H.h23.p(e, 2000)).toBeGreaterThan(0);
  });
  it('tierProgress: de 0 a 1, nunca passa de 1; sem registros e sem meta não quebra (meta de 2.000 ml)', () => {
    expect(C.tierProgress(E.e3, undefined, undefined)).toBe(0);
    expect(C.tierProgress(E.e3, { entries: [] }, 0)).toBe(0);
    expect(C.tierProgress(E.e3, dayOf(k, 2000, [[8, 0, 100], [9, 0, 100]]), 2000)).toBeCloseTo(2 / 3);
    expect(C.tierProgress(E.e3, dayOf(k, 2000, [[8, 0, 100], [9, 0, 100], [10, 0, 100], [11, 0, 100]]), 2000)).toBe(1);
    expect(C.tierProgress(E.ehalf, dayOf(k, 2000, [[8, 0, 500]]))).toBeCloseTo(0.5); // sem meta: vale 2.000
  });
});

describe('extrasDue: o que acabou de ser cumprido hoje e ainda não foi guardado', () => {
  const k = '2026-06-10';
  // acha um dia (a partir de k) em que a leve e a ousada têm as famílias que o teste quer, para escrever os registros sem depender do sorteio
  const find = (fe, fh) => { for (let i = 0, x = k; i < 400; i++, x = C.addDays(x, 1)) { const t = C.missionsOf(x); if (t.easy.id === fe && t.hard.id === fh) return x; } return ''; };
  it('devolve a leve e a ousada que já fecharam e não estão em S.extras; guardadas, não voltam', () => {
    const x = find('e3', 'h2x3') || find('e3', 'hbal') || find('e3', 'hv17');
    expect(x).not.toBe('');
    const t = C.missionsOf(x), S = base();
    const list = []; for (let i = 0; i < 3; i++) list.push([8 + i, 0, 100]); // 3 goles em 3 horas, de manhã
    S.days[x] = dayOf(x, 2000, list);
    const due = C.extrasDue(S, x, 2000);
    expect(due.map((e) => e.t + ':' + e.m.id)).toEqual(['e:e3'].concat(C.tierProgress(t.hard, S.days[x], 2000) >= 1 ? ['h:' + t.hard.id] : []));
    S.extras[C.extraKey(x, 'e')] = 123;
    expect(C.extrasDue(S, x, 2000).filter((e) => e.t === 'e')).toEqual([]);
  });
  it('um dia cheio de água (um gole de 200 ml por hora, das 6h às 22h) fecha a leve e a ousada, seja qual for o sorteio: todas as 27 missões dá para cumprir', () => {
    const list = []; for (let h = 6; h <= 22; h++) list.push([h, 0, 200]);
    const seenE = {}, seenH = {};
    for (let i = 0, x = '2026-11-16'; i < 500; i++, x = C.addDays(x, 1)) {
      const S = base(), t = C.missionsOf(x);
      S.days[x] = dayOf(x, 2000, list);
      seenE[t.easy.id] = 1; seenH[t.hard.id] = 1;
      expect(C.extrasDue(S, x, 2000).map((e) => e.t + ':' + e.m.id), x).toEqual(['e:' + t.easy.id, 'h:' + t.hard.id]);
    }
    expect(Object.keys(seenE).sort()).toEqual(C.MISSIONS_EASY.map((m) => m.id).sort()); // o teste passou por todas as leves e por todas as ousadas
    expect(Object.keys(seenH).sort()).toEqual(C.MISSIONS_HARD.map((m) => m.id).sort());
  });
  it('só fecha com 100%: 999 de 1.000 ml na leve de volume não fecha, 1.000 fecha (e 99,9% não é "quase lá" que valha)', () => {
    let x = k; for (let i = 0; i < 400 && C.missionsOf(x).easy.id !== 'e1l'; i++) x = C.addDays(x, 1);
    expect(C.missionsOf(x).easy.id).toBe('e1l');
    const S = base();
    S.days[x] = dayOf(x, 2000, [[8, 0, 999]]);
    expect(C.tierProgress(C.missionsOf(x).easy, S.days[x], 2000)).toBeCloseTo(0.999);
    expect(C.extrasDue(S, x, 2000).filter((e) => e.t === 'e')).toEqual([]);
    S.days[x] = dayOf(x, 2000, [[8, 0, 1000]]);
    expect(C.extrasDue(S, x, 2000).filter((e) => e.t === 'e').map((e) => e.m.id)).toEqual(['e1l']);
  });
  it('sem registros não há nada a guardar; o dia de outro dia não vale para hoje', () => {
    const S = base();
    expect(C.extrasDue(S, k, 2000)).toEqual([]);
    S.days['2026-06-09'] = dayOf('2026-06-09', 2000, [[8, 0, 2000], [9, 0, 100], [10, 0, 100], [11, 0, 100], [12, 0, 100], [13, 0, 100], [14, 0, 100], [15, 0, 100], [16, 0, 100]]);
    expect(C.extrasDue(S, k, 2000)).toEqual([]);
  });
  it('estado sem os mapas novos (backup antigo) funciona', () => {
    const S = { days: {}, missions: {} };
    expect(C.extrasDue(S, k, 2000)).toEqual([]);
    expect(C.challengesDue(S, k)).toEqual([]);
    expect(C.weekGoal(S, k).done).toBe(false);
    expect(C.monthGoal(S, k).have).toBe(0);
  });
});

/* ---------- semana, mês e o sorteio dos desafios ---------- */
describe('semana e mês: as janelas', () => {
  it('weekStart: a segunda-feira da semana, de segunda a domingo, inclusive na virada de mês e de ano', () => {
    for (let i = 0; i < 7; i++) expect(C.weekStart(d(i)), 'dia ' + i).toBe(MON);
    expect(C.weekStart(C.addDays(MON, 7))).toBe('2026-06-08');
    expect(C.weekStart('2026-03-01')).toBe('2026-02-23'); // domingo
    expect(C.weekStart('2026-01-01')).toBe('2025-12-29'); // quinta
    expect(C.weekStart('2024-03-01')).toBe('2024-02-26'); // ano bissexto
    expect(C.weekStart('2026-11-02')).toBe('2026-11-02');
  });
  it('monthStart e monthEnd: o primeiro e o último dia, com fevereiro (28 e 29), 30 e 31 dias', () => {
    expect(C.monthStart('2026-06-17')).toBe('2026-06-01');
    expect(C.monthEnd('2026-06-17')).toBe('2026-06-30');
    expect(C.monthEnd('2026-07-01')).toBe('2026-07-31');
    expect(C.monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(C.monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(C.monthEnd('2026-12-31')).toBe('2026-12-31');
    expect(C.monthEnd('2026-01-01')).toBe('2026-01-31');
  });
});

describe('o sorteio: um desafio por semana e por mês, igual para todo mundo, sem repetir em seguida', () => {
  const S = base();
  it('os desafios da semana e do mês são uma lista fixa (um contrato), todos em dias, com meta possível dentro da janela', () => {
    expect(C.WEEKLY.map((c) => c.id)).toEqual(['wgoal', 'wmorn', 'wsun', 'wthirds', 'wsix', 'wused', 'wmis', 'whalf', 'wtrio', 'wearly', 'wfirst', 'wspread', 'wlight', 'wbold', 'wblocks', 'weve', 'wlunch', 'w8', 'wlate', 'whalf13', 'wsnack', 'wbook']);
    expect(C.MONTHLY.map((c) => c.id)).toEqual(['mgoal', 'mmorn', 'msun', 'mthirds', 'mmis', 'mtrio', 'mused', 'mearly', 'msix', 'mlate', 'mlight', 'mbold', 'mspread', 'mfirst', 'mhalf', 'meve', 'mblocks', 'mlunch', 'm8', 'mbook']);
    C.WEEKLY.forEach((c) => { expect(c.e && c.t && c.d && typeof c.day === 'function', c.id).toBeTruthy(); expect(c.need, c.id).toBeGreaterThan(0); expect(c.need, c.id).toBeLessThanOrEqual(7); });
    C.MONTHLY.forEach((c) => { expect(c.e && c.t && c.d && typeof c.day === 'function', c.id).toBeTruthy(); expect(c.need, c.id).toBeGreaterThan(7); expect(c.need, c.id).toBeLessThanOrEqual(28); }); // cabe até em fevereiro
    expect(new Set(C.WEEKLY.concat(C.MONTHLY).map((c) => c.id)).size).toBe(C.WEEKLY.length + C.MONTHLY.length);
  });
  it('todo dia da semana vê o desafio da semana, e o desafio do mês é o mesmo o mês todo', () => {
    for (let i = 0; i < 7; i++) {
      const g = C.weekGoal(S, d(i));
      expect(g.key, 'dia ' + i).toBe(MON);
      expect(g.from + ' ' + g.to).toBe(MON + ' ' + SUN);
      expect(g.c.id).toBe(C.weekGoal(S, MON).c.id);
    }
    const m = C.monthGoal(S, '2026-06-01').c.id;
    for (let i = 0; i < 30; i++) { const g = C.monthGoal(S, C.addDays('2026-06-01', i)); expect(g.c.id).toBe(m); expect(g.key).toBe('2026-06'); expect(g.from + ' ' + g.to).toBe('2026-06-01 2026-06-30'); }
    expect(C.monthGoal(S, '2026-07-01').key).toBe('2026-07');
  });
  // As épocas do baralho (1.11.0): a primeira, com as entradas sem `since`, vai até a primeira data de estreia; cada data de estreia abre outra, com as entradas válidas até ali.
  // Dentro de uma época, a cada volta (o tamanho da lista da época) saem todas, uma vez cada; a primeira carta de uma época nunca repete a do tempo anterior.
  const epochsOf = (list, no) => {
    const sinces = Array.from(new Set(list.filter((c) => c.since).map((c) => c.since))).sort();
    return [{ from: 0, pool: list.filter((c) => !c.since) }].concat(sinces.map((x) => ({ from: no(x), pool: list.filter((c) => !c.since || c.since <= x) })));
  };
  const weekNo = (mon) => (dn(mon) - 4) / 7;
  const monthNo = (key) => +key.slice(0, 4) * 12 + (+key.slice(5, 7) - 1);
  const epochAt = (eps, n) => { let e = 0; for (let x = 1; x < eps.length; x++) if (n >= eps[x].from) e = x; return e; };
  it('de uma semana para a outra o desafio nunca repete, em 600 semanas (inclusive na virada para a lista maior); a cada volta de cada época saem todos, uma vez cada', () => {
    let prev = '';
    const eps = epochsOf(C.WEEKLY, weekNo), cycles = {};
    expect(eps.length).toBe(4); // a de sempre (9), a de 23/11/2026 em diante (14), a de 7/12/2026 em diante (18) e a de 21/12/2026 em diante (22)
    expect([eps[0].pool.length, eps[1].pool.length, eps[2].pool.length, eps[3].pool.length]).toEqual([9, 14, 18, 22]);
    for (let i = 0; i < 600; i++) {
      const mon = C.addDays('2026-01-05', i * 7), id = C.weekGoal(S, mon).c.id, n = weekNo(mon), e = epochAt(eps, n), cy = e + ':' + Math.floor((n - eps[e].from) / eps[e].pool.length);
      expect(id, mon).not.toBe(prev);
      prev = id;
      (cycles[cy] = cycles[cy] || []).push(id);
      expect(eps[e].pool.map((c) => c.id), 'a carta de ' + mon + ' é da lista da época').toContain(id);
    }
    let full = 0;
    Object.keys(cycles).forEach((cy) => { const e = +cy.split(':')[0]; if (cycles[cy].length === eps[e].pool.length) { full++; expect(cycles[cy].slice().sort(), 'volta ' + cy).toEqual(eps[e].pool.map((c) => c.id).sort()); } });
    expect(full).toBe(29); // 25 voltas inteiras de 22 semanas na última época (550 semanas) e 4 de 9 na primeira (46 semanas; a primeira volta já começa no meio); as épocas de 2 semanas não completam volta
  });
  it('de um mês para o outro nunca repete, em 200 meses (inclusive na virada para a lista maior); a cada volta de cada época saem todos', () => {
    let prev = '';
    const eps = epochsOf(C.MONTHLY, monthNo), cycles = {};
    expect([eps[0].pool.length, eps[1].pool.length, eps[2].pool.length, eps[3].pool.length]).toEqual([7, 12, 16, 20]);
    for (let i = 0; i < 200; i++) {
      const y = 2026 + Math.floor(i / 12), mo = i % 12, key = y + '-' + (mo < 9 ? '0' : '') + (mo + 1), id = C.monthGoal(S, key + '-10').c.id, n = monthNo(key), e = epochAt(eps, n), cy = e + ':' + Math.floor((n - eps[e].from) / eps[e].pool.length);
      expect(id, key).not.toBe(prev);
      prev = id;
      (cycles[cy] = cycles[cy] || []).push(id);
      expect(eps[e].pool.map((c) => c.id), 'a carta de ' + key + ' é da lista da época').toContain(id);
    }
    let full = 0;
    Object.keys(cycles).forEach((cy) => { const e = +cy.split(':')[0]; if (cycles[cy].length === eps[e].pool.length) { full++; expect(cycles[cy].slice().sort(), 'volta ' + cy).toEqual(eps[e].pool.map((c) => c.id).sort()); } });
    expect(full).toBe(9); // 9 voltas inteiras de 20 meses na última época (187 meses); a primeira época (11 meses) começa e termina no meio de uma volta de 7 e as de 1 mês não completam volta
  });
  it('a ordem muda de uma volta para a outra (não é a mesma lista repetida) e o sorteio é o mesmo toda vez que se pergunta', () => {
    const run = (from) => { const o = []; for (let i = 0; i < 9; i++) o.push(C.weekGoal(S, C.addDays(from, i * 7)).c.id); return o.join(); };
    const first = '2023-01-02'; // 12 voltas de 9 semanas a partir daqui terminam antes da primeira data de estreia (as voltas de uma época nova têm outro tamanho)
    const orders = {};
    for (let c = 0; c < 12; c++) {
      const mon = C.addDays(first, c * 63); // 9 semanas depois, a cada volta
      const n = (dn(mon) - 4) / 7, start = C.addDays(mon, -(((n % 9) + 9) % 9) * 7); // o começo da volta que contém mon
      orders[run(start)] = 1;
      expect(run(start)).toBe(run(start));
    }
    expect(Object.keys(orders).length).toBeGreaterThan(8); // 12 voltas, pelo menos 9 ordens diferentes
  });
});

/* ---------- cada desafio, no limite ---------- */
describe('os desafios da semana: o limite de cada regra', () => {
  it('Meta em 5 dias: 1.999 ml não conta, 2.000 conta; 4 dias não fecham, 5 fecham', () => {
    const S = stateWith({ [d(0)]: dayOf(d(0), 2000, [[9, 0, 1999]]), [d(1)]: metDay(d(1)), [d(2)]: metDay(d(2)), [d(3)]: metDay(d(3)), [d(4)]: metDay(d(4)) });
    expect(week(S, 'wgoal')).toMatchObject({ have: 4, days: [0, 1, 1, 1, 1, 0, 0] });
    S.days[d(0)] = metDay(d(0));
    expect(week(S, 'wgoal').have).toBe(5);
    expect(W('wgoal').need).toBe(5);
  });
  it('Manhãs de água: 500 ml de água antes das 10h (9h59 conta, 10h00 não, 499 não, café não); 4 dias', () => {
    const wm = (list) => week(stateWith({ [d(0)]: dayOf(d(0), 2000, list) }), 'wmorn').have;
    expect(wm([[9, 59, 500]])).toBe(1);
    expect(wm([[10, 0, 500]])).toBe(0);
    expect(wm([[9, 59, 499]])).toBe(0);
    expect(wm([[8, 0, 250], [9, 59, 250]])).toBe(1); // soma de dois goles
    expect(wm([[8, 0, 800, 'coffee']])).toBe(0);
    expect(W('wmorn').need).toBe(4);
  });
  it('Antes do pôr do sol: meta batida às 17h59 conta, às 18h00 não; 3 dias', () => {
    const ws = (h, m) => week(stateWith({ [d(0)]: dayOf(d(0), 2000, [[h, m, 2000]]) }), 'wsun').have;
    expect(ws(17, 59)).toBe(1); expect(ws(18, 0)).toBe(0);
    expect(ws(8, 0)).toBe(1);
    expect(week(stateWith({ [d(0)]: dayOf(d(0), 2000, [[19, 0, 1000], [20, 0, 1000]]) }), 'wsun').have).toBe(0); // bateu, mas tarde
    expect(W('wsun').need).toBe(3);
  });
  it('Dias redondos: água de manhã, à tarde e à noite (a noite começa às 18h00); 4 dias', () => {
    const wt = (list) => week(stateWith({ [d(0)]: dayOf(d(0), 2000, list) }), 'wthirds').have;
    expect(wt([[6, 0, 100], [12, 0, 100], [18, 0, 100]])).toBe(1);
    expect(wt([[6, 0, 100], [12, 0, 100], [17, 59, 100]])).toBe(0); // 17h59 ainda é tarde
    expect(wt([[11, 59, 100], [12, 0, 100], [18, 0, 100]])).toBe(1); // 11h59 é manhã
    expect(wt([[6, 0, 100], [12, 0, 100], [20, 0, 100, 'tea']])).toBe(0);
    expect(W('wthirds').need).toBe(4);
  });
  it('Seis goles por dia: 6 registros de água contam, 5 não, chá não é gole; 5 dias', () => {
    const six = (n, extra) => { const l = []; for (let i = 0; i < n; i++) l.push([8 + i, 0, 100]); return l.concat(extra || []); };
    const w6 = (list) => week(stateWith({ [d(0)]: dayOf(d(0), 2000, list) }), 'wsix').have;
    expect(w6(six(6))).toBe(1); expect(w6(six(5))).toBe(0);
    expect(w6(six(5, [[20, 0, 300, 'tea']]))).toBe(0);
    expect(w6(six(5, [[20, 0, 100, 'sparkling']]))).toBe(1);
    expect(W('wsix').need).toBe(5);
  });
  it('Sem dia em branco: um registro de água basta (café não); 6 dias', () => {
    const wu = (list) => week(stateWith({ [d(0)]: dayOf(d(0), 2000, list) }), 'wused').have;
    expect(wu([[8, 0, 50]])).toBe(1); expect(wu([[8, 0, 50, 'coffee']])).toBe(0); expect(wu([])).toBe(0);
    expect(week(base(), 'wused').have).toBe(0);
    expect(W('wused').need).toBe(6);
  });
  it('Missões da semana: conta os dias da semana com a missão do dia cumprida (as de outras semanas não); 4 dias', () => {
    const S = base();
    S.missions[d(-1)] = 1; S.missions[d(7)] = 1; // domingo anterior e segunda seguinte: fora
    S.missions[d(0)] = 1; S.missions[d(6)] = 1;
    expect(week(S, 'wmis')).toMatchObject({ have: 2, days: [1, 0, 0, 0, 0, 0, 1] });
    expect(W('wmis').need).toBe(4);
  });
  it('Metade até as 15h: metade da meta do dia (a meta daquele dia) antes das 15h00; 4 dias', () => {
    const wh = (g, list) => week(stateWith({ [d(0)]: dayOf(d(0), g, list) }), 'whalf').have;
    expect(wh(2000, [[14, 59, 1000]])).toBe(1);
    expect(wh(2000, [[15, 0, 1000]])).toBe(0);
    expect(wh(2000, [[14, 59, 999]])).toBe(0);
    expect(wh(2500, [[14, 59, 1250]])).toBe(1);
    expect(wh(2500, [[14, 59, 1249]])).toBe(0);
    expect(wh(2000, [[8, 0, 600], [14, 0, 400]])).toBe(1);
    expect(wh(2000, [[8, 0, 1000, 'coffee']])).toBe(0); // sem "somar na meta", o café não conta
    C.setMix(true);
    expect(wh(2000, [[8, 0, 1000, 'coffee']])).toBe(1); // com "somar", o café vale até metade da meta: 1.000 de café já são a metade de 2.000
    expect(wh(2000, [[8, 0, 1500, 'coffee']])).toBe(1); // e o resto do café não passa do limite (1.000), mas a metade já veio
    expect(wh(2000, [[8, 0, 900, 'coffee']])).toBe(0);
  });
  it('Trios de missões: só o dia com as três cumpridas conta; 2 dias', () => {
    const S = base();
    [0, 1, 2].forEach((i) => { S.missions[d(i)] = 1; });
    [0, 1].forEach((i) => { S.extras[d(i) + ':e'] = 1; });
    [0, 2].forEach((i) => { S.extras[d(i) + ':h'] = 1; });
    expect(week(S, 'wtrio')).toMatchObject({ have: 1, days: [1, 0, 0, 0, 0, 0, 0] });
    expect(W('wtrio').need).toBe(2);
  });
});

describe('os desafios do mês: as mesmas regras, em dias do mês', () => {
  it('cada desafio do mês tem a regra do da semana de mesmo assunto; o que muda é quantos dias', () => {
    const f = { cum: 2000, n: 7, morning: 600, m10: 600, hit: 700, first: 400, parts: 3 }, g = { cum: 100, n: 0, morning: 0, m10: 0, hit: -1, first: -1, parts: 0 };
    const S = base(), day = dayOf(d(0), 2000, [[10, 0, 2000]]);
    [['mgoal', 'wgoal'], ['mmorn', 'wmorn'], ['msun', 'wsun'], ['mthirds', 'wthirds'], ['mused', 'wused']].forEach((x) => {
      [f, g, { n: 6, hit: 1080, m10: 500, parts: 2 }, { n: 1, hit: 1079, m10: 499, parts: 3 }].forEach((fact) => {
        expect(!!M(x[0]).day(fact, day, S, d(0)), x[0] + ' ' + JSON.stringify(fact)).toBe(!!W(x[1]).day(fact, day, S, d(0)));
      });
    });
    expect([M('mgoal').need, M('mmorn').need, M('msun').need, M('mthirds').need, M('mmis').need, M('mtrio').need, M('mused').need]).toEqual([20, 12, 8, 15, 15, 8, 25]);
  });
  it('o mês conta de 1 a 30 (ou 31, ou 28): dias de fora não entram, e o dia 31 só existe em mês de 31', () => {
    const S = stateWith({ '2026-05-31': metDay('2026-05-31'), '2026-06-01': metDay('2026-06-01'), '2026-06-30': metDay('2026-06-30'), '2026-07-01': metDay('2026-07-01') });
    const st = C.challengeState(S, M('mgoal'), '2026-06-01', '2026-06-30', '2026-06-30');
    expect(st.have).toBe(2);
    expect(st.days.length).toBe(30);
    expect(C.challengeState(S, M('mgoal'), '2026-02-01', '2026-02-28', '2026-02-28').days.length).toBe(28);
    expect(C.challengeState(S, M('mgoal'), '2028-02-01', '2028-02-29', '2028-02-29').days.length).toBe(29);
  });
  it('Missões do mês e Trios de missões do mês', () => {
    const S = base();
    for (let i = 0; i < 14; i++) S.missions[C.addDays('2026-06-01', i)] = 1;
    expect(C.challengeState(S, M('mmis'), '2026-06-01', '2026-06-30', '2026-06-30').have).toBe(14);
    S.missions['2026-06-20'] = 1;
    expect(C.challengeState(S, M('mmis'), '2026-06-01', '2026-06-30', '2026-06-30').have).toBe(15);
    ['2026-06-01', '2026-06-02'].forEach((k) => { S.extras[k + ':e'] = 1; S.extras[k + ':h'] = 1; });
    S.extras['2026-06-03:e'] = 1; // faltou a ousada
    expect(C.challengeState(S, M('mtrio'), '2026-06-01', '2026-06-30', '2026-06-30').have).toBe(2);
  });
});

describe('o andamento de um desafio: dias que já vieram, dias que faltam, e quando não dá mais para fechar', () => {
  it('challengeState: 1 = contou, 0 = não contou, -1 = ainda não chegou; hoje conta se já cumpriu; left e max dizem até onde dá para chegar', () => {
    const S = stateWith({ [d(0)]: metDay(d(0)), [d(1)]: dayOf(d(1), 2000, [[9, 0, 500]]), [d(2)]: metDay(d(2)) });
    const st = week(S, 'wgoal', d(2)); // quarta-feira, e a meta de hoje já foi batida
    expect(st).toMatchObject({ have: 2, left: 4, max: 6, days: [1, 0, 1, -1, -1, -1, -1] });
    const t2 = week(stateWith({ [d(0)]: metDay(d(0)), [d(1)]: metDay(d(1)) }), 'wgoal', d(2)); // quarta, e hoje ainda não bateu: hoje ainda pode contar
    expect(t2).toMatchObject({ have: 2, left: 5, max: 7, days: [1, 1, 0, -1, -1, -1, -1] });
    expect(week(base(), 'wgoal', MON)).toMatchObject({ have: 0, left: 7, max: 7 });
    expect(week(base(), 'wgoal', SUN)).toMatchObject({ have: 0, left: 1, max: 1, days: [0, 0, 0, 0, 0, 0, 0] });
  });
  it('weekGoal e monthGoal: have, need, pct, done, over, toEnd, key e o instante guardado', () => {
    const S = base();
    const g0 = C.weekGoal(S, d(2));
    expect(g0).toMatchObject({ key: MON, from: MON, to: SUN, have: 0, pct: 0, done: false, at: 0, toEnd: 4 });
    expect(g0.need).toBe(g0.c.need);
    expect(C.weekGoal(S, SUN).toEnd).toBe(0);
    expect(C.weekGoal(S, MON).toEnd).toBe(6);
    const m0 = C.monthGoal(S, '2026-06-10');
    expect(m0).toMatchObject({ key: '2026-06', from: '2026-06-01', to: '2026-06-30', toEnd: 20, done: false, at: 0 });
  });
  it('over: quando, mesmo cumprindo todos os dias que sobram, o desafio não fecha mais (2 dias feitos e sexta, sábado e domingo ainda por vir: 2 + 3 = 5 fecha; com 1 dia feito, não); nunca em desafio já guardado', () => {
    let mon = '2026-01-05';
    for (let i = 0; i < 60 && C.weekGoal(base(), mon).c.id !== 'wgoal'; i++) mon = C.addDays(mon, 7);
    const fri = C.addDays(mon, 4);
    const two = stateWith({ [mon]: metDay(mon), [C.addDays(mon, 1)]: metDay(C.addDays(mon, 1)) });
    expect(C.weekGoal(two, fri)).toMatchObject({ have: 2, max: 5, over: false }); // sexta (hoje, ainda sem meta), sábado e domingo
    const one = stateWith({ [mon]: metDay(mon) });
    expect(C.weekGoal(one, fri)).toMatchObject({ have: 1, max: 4, over: true });
    one.challenges[mon] = 5; // já guardado como cumprido: nunca "over"
    expect(C.weekGoal(one, fri)).toMatchObject({ done: true, over: false, pct: 100, at: 5 });
  });
  it('pct arredonda (2 de 5 = 40%, 1 de 3 = 33%) e some de 100 só quando cumprido', () => {
    let mon = '2026-01-05';
    for (let i = 0; i < 60 && C.weekGoal(base(), mon).c.id !== 'wgoal'; i++) mon = C.addDays(mon, 7);
    const S = stateWith({ [mon]: metDay(mon), [C.addDays(mon, 1)]: metDay(C.addDays(mon, 1)) });
    expect(C.weekGoal(S, C.addDays(mon, 2)).pct).toBe(40);
    let w3 = '2026-01-05';
    for (let i = 0; i < 60 && C.weekGoal(base(), w3).c.id !== 'wsun'; i++) w3 = C.addDays(w3, 7);
    expect(C.weekGoal(stateWith({ [w3]: metDay(w3, 9) }), C.addDays(w3, 1)).pct).toBe(33);
  });
  it('fechado agora e ainda não guardado já é "done" (100%), e challengesDue o devolve para a festa guardar; com um dia a menos, não', () => {
    let mon = '2026-01-05';
    for (let i = 0; i < 60 && C.weekGoal(base(), mon).c.id !== 'wgoal'; i++) mon = C.addDays(mon, 7);
    const five = {}; for (let i = 0; i < 5; i++) five[C.addDays(mon, i)] = metDay(C.addDays(mon, i));
    const S = stateWith(five), fri = C.addDays(mon, 4);
    expect(C.weekGoal(S, fri)).toMatchObject({ have: 5, need: 5, done: true, pct: 100, at: 0, over: false });
    expect(C.challengesDue(S, fri).map((x) => x.kind + ':' + x.key)).toEqual(['w:' + mon]);
    delete S.days[C.addDays(mon, 4)];
    expect(C.weekGoal(S, fri)).toMatchObject({ have: 4, done: false, pct: 80, at: 0 });
    expect(C.challengesDue(S, fri)).toEqual([]);
  });
  it('guardado vale mais que o histórico: apagar os registros depois de cumprir não desfaz o desafio', () => {
    const S = base(), g = C.weekGoal(S, d(3));
    S.challenges[g.key] = ts(d(3), 10);
    expect(C.weekGoal(S, d(5))).toMatchObject({ done: true, pct: 100, have: 0, at: ts(d(3), 10) });
    expect(C.challengesDue(S, d(5))).toEqual([]);
  });
});

describe('challengesDue: o que fechou agora e ainda não foi guardado', () => {
  const findWeek = (id) => { let mon = '2026-01-05'; for (let i = 0; i < 60 && C.weekGoal(base(), mon).c.id !== id; i++) mon = C.addDays(mon, 7); return mon; };
  const findMonth = (id) => { for (let i = 0; i < 40; i++) { const key = C.addDays('2026-01-15', i * 31).slice(0, 7); if (C.monthGoal(base(), key + '-15').c.id === id) return key; } return ''; };
  it('a semana fecha quando os dias chegam ao need; depois de guardada, não volta', () => {
    const mon = findWeek('wused'); // 6 dias com água
    const days = {}; for (let i = 0; i < 5; i++) days[C.addDays(mon, i)] = dayOf(C.addDays(mon, i), 2000, [[9, 0, 200]]);
    const S = stateWith(days);
    expect(C.challengesDue(S, C.addDays(mon, 4)).filter((x) => x.kind === 'w')).toEqual([]);
    S.days[C.addDays(mon, 5)] = dayOf(C.addDays(mon, 5), 2000, [[9, 0, 200]]);
    const due = C.challengesDue(S, C.addDays(mon, 5)).filter((x) => x.kind === 'w');
    expect(due.length).toBe(1);
    expect(due[0]).toMatchObject({ kind: 'w', key: mon });
    expect(due[0].c.id).toBe('wused');
    S.challenges[mon] = Date.now();
    expect(C.challengesDue(S, C.addDays(mon, 5)).filter((x) => x.kind === 'w')).toEqual([]);
  });
  it('o mês fecha do mesmo jeito (e a semana e o mês podem fechar juntos)', () => {
    const key = findMonth('mused'); // 25 dias com água
    expect(key).not.toBe('');
    const days = {};
    for (let i = 0; i < 24; i++) { const k = C.addDays(key + '-01', i); days[k] = dayOf(k, 2000, [[9, 0, 200]]); }
    const S = stateWith(days);
    expect(C.challengesDue(S, key + '-24').filter((x) => x.kind === 'm')).toEqual([]);
    const k25 = C.addDays(key + '-01', 24);
    S.days[k25] = dayOf(k25, 2000, [[9, 0, 200]]);
    const due = C.challengesDue(S, k25).filter((x) => x.kind === 'm');
    expect(due.map((x) => x.key + ':' + x.c.id)).toEqual([key + ':mused']);
    S.challenges[key] = 1;
    expect(C.challengesDue(S, k25).filter((x) => x.kind === 'm')).toEqual([]);
  });
  it('com "somar na meta" ligado, o café entra na conta da meta e muda o que fecha', () => {
    const mon = findWeek('wgoal');
    const mk = () => { const days = {}; for (let i = 0; i < 5; i++) { const k = C.addDays(mon, i); days[k] = dayOf(k, 2000, [[9, 0, 1000], [10, 0, 1000, 'coffee']]); } return stateWith(days); };
    expect(C.weekGoal(mk(), C.addDays(mon, 4)).have).toBe(0); // 1.000 de água e 1.000 de café: sem "somar", ninguém bateu
    C.setMix(true);
    expect(C.weekGoal(mk(), C.addDays(mon, 4)).have).toBe(5); // com "somar", o café entra até a metade da meta: 1.000 + 1.000 = 2.000
    expect(C.challengesDue(mk(), C.addDays(mon, 4)).map((x) => x.kind)).toContain('w');
  });
});

/* ---------- as medalhas novas ---------- */
describe('as 7 medalhas da 1.10.0: lista, grupo e máscara', () => {
  it('ficam depois das 30 da 1.9.0 (bits 30 a 36, os de 6 a 12 da 2ª palavra), num grupo só deles', () => {
    const NEW = ['trio', 'trio7', 'wk1', 'wk4', 'wk12', 'mo1', 'mo3'];
    expect(C.MEDALS_1_9).toBe(30);
    expect(C.MEDALS_1_10).toBe(37);
    expect(C.ACHIEVEMENTS.slice(C.MEDALS_1_9, C.MEDALS_1_10).map((a) => a.id)).toEqual(NEW);
    expect(C.ACHIEVEMENTS.length).toBeLessThanOrEqual(C.MEDAL_CAP); // até a 55ª, nada a publicar no Firebase
    const g = C.MEDAL_GROUPS.filter((x) => x.t === 'Desafios');
    expect(g.length).toBe(1);
    expect(g[0].ids).toEqual(NEW);
    const one = (id) => { const S = { achievements: {} }; S.achievements[id] = 5; return [C.medalMask(S), C.medalMask2(S)]; };
    expect(one('trio')).toEqual([0, 64]); expect(one('trio7')).toEqual([0, 128]); expect(one('wk1')).toEqual([0, 256]);
    expect(one('wk4')).toEqual([0, 512]); expect(one('wk12')).toEqual([0, 1024]); expect(one('mo1')).toEqual([0, 2048]); expect(one('mo3')).toEqual([0, 4096]);
    const all = {}; C.ACHIEVEMENTS.forEach((a) => { all[a.id] = 5; });
    expect([C.medalMask({ achievements: all }), C.medalMask2({ achievements: all })]).toEqual([16777215, 32767]);
    expect(C.medalsFromMask(0, 4096).map((a) => a.id)).toEqual(['mo3']);
    expect(C.medalsFromMask(0, 8191).length).toBe(13); // quem está na 1.10.0 manda 13 bits na 2ª palavra: as 37 medalhas dele, sem as da 1.11.0
    expect(C.medalsFromMask(0, 1 << 15)).toEqual([]); // o bit 39 ainda não existe
  });
  it('cada medalha nova tem emoji, título, descrição e (as de contagem) o andamento com a unidade certa', () => {
    ['trio', 'trio7', 'wk1', 'wk4', 'wk12', 'mo1', 'mo3'].forEach((id) => { const a = C.achievementById(id); expect(a.e && a.t && a.d && typeof a.test === 'function', id).toBeTruthy(); expect(a.live, id).toBeUndefined(); });
    expect(C.achievementById('trio').p).toBeUndefined();
    expect(C.achievementById('wk1').p).toBeUndefined();
    expect(C.achievementById('mo1').p).toBeUndefined();
    expect(C.medalProgress(C.achievementById('trio7'), { trios: 3 })).toEqual({ have: 3, need: 7, unit: 'dias', pct: 43 });
    expect(C.medalProgress(C.achievementById('wk4'), { weeksWon: 1 })).toEqual({ have: 1, need: 4, unit: 'desafios', pct: 25 });
    expect(C.medalProgress(C.achievementById('wk12'), { weeksWon: 11 })).toMatchObject({ have: 11, need: 12, unit: 'desafios' });
    expect(C.medalProgress(C.achievementById('mo3'), { monthsWon: 2 })).toMatchObject({ have: 2, need: 3, unit: 'desafios', pct: 67 });
  });
  it('test e andamento concordam, valor a valor (como as outras medalhas)', () => {
    ['trio7', 'wk4', 'wk12', 'mo3'].forEach((id) => {
      const a = C.achievementById(id);
      for (let v = 0; v <= 30; v++) { const c = { trios: v, weeksWon: v, monthsWon: v }; expect(a.test(c), id + ' com ' + v).toBe(a.p(c)[0] >= a.p(c)[1]); }
    });
    expect([0, 1, 2].map((v) => C.achievementById('trio').test({ trios: v }))).toEqual([false, true, true]);
    expect([0, 1].map((v) => C.achievementById('wk1').test({ weeksWon: v }))).toEqual([false, true]);
    expect([0, 1].map((v) => C.achievementById('mo1').test({ monthsWon: v }))).toEqual([false, true]);
  });
});

describe('as 7 medalhas da 1.10.0: o que as faz sair, no limite', () => {
  const trioDays = (S, n, from) => { for (let i = 0; i < n; i++) { const k = C.addDays(from || '2026-03-01', i); S.days[k] = metDay(k); S.missions[k] = 1; S.extras[k + ':e'] = 1; S.extras[k + ':h'] = 1; } return S; };
  it('Trio de missões: as três cumpridas no mesmo dia; faltando uma, não sai', () => {
    const S = base();
    S.days['2026-03-01'] = metDay('2026-03-01');
    S.missions['2026-03-01'] = 1; S.extras['2026-03-01:e'] = 1;
    expect(ids(S)).not.toContain('trio');
    S.extras['2026-03-01:h'] = 1;
    expect(ids(S)).toContain('trio');
    const T = base(); T.days['2026-03-01'] = metDay('2026-03-01'); T.extras['2026-03-01:e'] = 1; T.extras['2026-03-01:h'] = 1; // sem a do dia
    expect(ids(T)).not.toContain('trio');
    const U = base(); U.days['2026-03-01'] = metDay('2026-03-01'); U.missions['2026-03-01'] = 1; U.extras['2026-03-01:h'] = 1; // sem a leve
    expect(ids(U)).not.toContain('trio');
  });
  it('Sete trios: 6 dias não, 7 sim (seguidos ou não)', () => {
    expect(ids(trioDays(base(), 6))).not.toContain('trio7');
    expect(ids(trioDays(base(), 7))).toContain('trio7');
    const S = base();
    [0, 2, 4, 6, 8, 10, 12].forEach((i) => trioDays(S, 1, C.addDays('2026-03-01', i)));
    expect(ids(S)).toContain('trio7');
    expect(C.context(trioDays(base(), 5), '').trios).toBe(5);
  });
  it('Semana vencida, Quatro semanas vencidas e Trimestre de desafios: contam as semanas guardadas (3 não, 4 sim; 11 não, 12 sim)', () => {
    const wk = (n) => { const S = base(); for (let i = 0; i < n; i++) { const mon = C.addDays('2026-01-05', i * 7); S.challenges[mon] = ts(C.addDays(mon, 4), 12); } return S; };
    expect(ids(wk(0))).toEqual([]);
    expect(ids(wk(1))).toContain('wk1'); expect(ids(wk(1))).not.toContain('wk4');
    expect(ids(wk(3))).not.toContain('wk4'); expect(ids(wk(4))).toContain('wk4');
    expect(ids(wk(11))).not.toContain('wk12'); expect(ids(wk(12))).toContain('wk12');
    expect(ids(wk(12))).not.toContain('mo1'); // desafio da semana não vale para o do mês
  });
  it('Mês vencido e Três meses vencidos: contam os meses guardados (2 não, 3 sim)', () => {
    const mo = (n) => { const S = base(); for (let i = 0; i < n; i++) S.challenges['2026-0' + (i + 1)] = ts('2026-0' + (i + 1) + '-28', 12); return S; };
    expect(ids(mo(0))).toEqual([]);
    expect(ids(mo(1))).toContain('mo1'); expect(ids(mo(1))).not.toContain('mo3');
    expect(ids(mo(2))).not.toContain('mo3'); expect(ids(mo(3))).toContain('mo3');
    expect(ids(mo(3))).not.toContain('wk1');
  });
  it("lixo no mapa não vale: chaves de outro tamanho, instantes inválidos, negativos e zero; ':h' sozinho; valor falso", () => {
    const S = base();
    S.challenges['2026'] = ts('2026-03-01', 10); S.challenges['2026-03-01-x'] = ts('2026-03-01', 10); S.challenges['2026-03-02'] = 'ontem';
    S.challenges['2026-03-09'] = -5; S.challenges['2026-03-16'] = 0; S.challenges['2026-03-23'] = NaN; S.challenges['2026-03-30'] = Infinity;
    S.challenges['2026-04'] = null;
    S.extras['2026-03-01:h'] = 1; S.missions['2026-03-01'] = 1; // só a ousada
    S.extras['2026-03-02:e'] = 0; S.extras['2026-03-02:h'] = 1; S.missions['2026-03-02'] = 1; // a leve com valor falso
    S.extras['xxxx'] = 1;
    const c = C.context(S);
    expect(c.weeksWon + c.monthsWon + c.trios).toBe(0);
    expect(ids(S).filter((id) => ['trio', 'trio7', 'wk1', 'wk4', 'wk12', 'mo1', 'mo3'].indexOf(id) >= 0)).toEqual([]);
  });
  it('context(S, upTo): conta só o que fechou até o dia (o trio, no dia das missões; a semana e o mês, no dia em que foram guardados)', () => {
    const S = base();
    trioDays(S, 3, '2026-03-01');
    S.challenges['2026-03-02'] = ts('2026-03-08', 21); // semana de 2/3, fechada no domingo à noite
    S.challenges['2026-03'] = ts('2026-03-31', 22);
    expect(C.context(S, '2026-03-02')).toMatchObject({ trios: 2, weeksWon: 0, monthsWon: 0 });
    expect(C.context(S, '2026-03-07')).toMatchObject({ trios: 3, weeksWon: 0, monthsWon: 0 });
    S.days['2026-03-08'] = metDay('2026-03-08'); S.days['2026-03-31'] = metDay('2026-03-31');
    expect(C.context(S, '2026-03-08')).toMatchObject({ trios: 3, weeksWon: 1, monthsWon: 0 });
    expect(C.context(S, '2026-03-30')).toMatchObject({ weeksWon: 1, monthsWon: 0 });
    expect(C.context(S, '2026-03-31')).toMatchObject({ weeksWon: 1, monthsWon: 1 });
    expect(C.context(S)).toMatchObject({ trios: 3, weeksWon: 1, monthsWon: 1 });
  });
  it('medalDates: a data de cada medalha nova é o dia em que a conta fechou (e a busca binária acha o primeiro)', () => {
    const S = base();
    trioDays(S, 8, '2026-03-01'); // 1 a 8 de março: o 1º trio no dia 1 e o 7º no dia 7
    S.days['2026-03-20'] = metDay('2026-03-20'); S.challenges['2026-03-16'] = ts('2026-03-20', 18);
    S.days['2026-04-30'] = metDay('2026-04-30'); S.challenges['2026-04'] = ts('2026-04-30', 23);
    const want = (k) => C.keyToDate(k).getTime();
    const dt = C.medalDates(S, ['trio', 'trio7', 'wk1', 'mo1', 'wk4'].map(C.achievementById));
    expect(dt.trio).toBe(want('2026-03-01'));
    expect(dt.trio7).toBe(want('2026-03-07'));
    expect(dt.wk1).toBe(want('2026-03-20'));
    expect(dt.mo1).toBe(want('2026-04-30'));
    expect(dt.wk4).toBeUndefined(); // só 1 semana: sem data
    // e sem passar a lista: as que a conta já cumpre e ainda não foram guardadas
    expect(Object.keys(C.medalDates(S)).filter((id) => ['trio', 'trio7', 'wk1', 'mo1'].indexOf(id) >= 0).sort()).toEqual(['mo1', 'trio', 'trio7', 'wk1']);
  });
});

/* ---------- o estado ---------- */
describe('o estado guarda S.extras e S.challenges', () => {
  it('defaults() e migrate() trazem os dois mapas; backup antigo, texto, lista e nulo viram {}; o que já havia é mantido', () => {
    const d0 = C.defaults();
    expect(d0.extras).toEqual({}); expect(d0.challenges).toEqual({});
    const old = { v: 1, onboarded: true, days: {}, missions: { '2026-01-01': 5 } }; // um backup de antes da 1.10.0
    const m = C.migrate(old);
    expect(m.extras).toEqual({}); expect(m.challenges).toEqual({}); expect(m.missions).toEqual({ '2026-01-01': 5 });
    [null, 'x', 7, [], [1, 2]].forEach((bad) => { const x = C.migrate({ extras: bad, challenges: bad }); expect(x.extras, JSON.stringify(bad)).toEqual({}); expect(x.challenges, JSON.stringify(bad)).toEqual({}); });
    const keep = C.migrate({ extras: { '2026-01-02:e': 9 }, challenges: { '2026-01-05': 8, '2026-01': 7 } });
    expect(keep.extras).toEqual({ '2026-01-02:e': 9 }); expect(keep.challenges).toEqual({ '2026-01-05': 8, '2026-01': 7 });
    expect(C.migrate(undefined).extras).toEqual({});
  });
});

/* ---------- 1.11.0: mais missões e desafios, com data de estreia ---------- */
describe('a lista maior não muda o passado: a foto das escolhas da 1.10.0', () => {
  // tests/fixtures/picks-1.10.0.json foi gerado com o core.js da 1.10.0, ANTES de as listas crescerem: e = a posição da missão leve de cada dia na lista de então (de fx.from a fx.to),
  // h = a da ousada, w = a do desafio da semana de cada segunda-feira (de fx.from até 16/11/2026) e mo = a do desafio de cada mês (de janeiro de 2023 a novembro de 2026).
  const fx = JSON.parse(readFileSync(new URL('./fixtures/picks-1.10.0.json', import.meta.url), 'utf8'));
  const S = base();
  it('as listas da foto são o começo das listas de hoje (entrada nova só entra no fim)', () => {
    expect(C.MISSIONS_EASY.slice(0, fx.easy.length).map((m) => m.id)).toEqual(fx.easy);
    expect(C.MISSIONS_HARD.slice(0, fx.hard.length).map((m) => m.id)).toEqual(fx.hard);
    expect(C.WEEKLY.slice(0, fx.weekly.length).map((c) => c.id)).toEqual(fx.weekly);
    expect(C.MONTHLY.slice(0, fx.monthly.length).map((c) => c.id)).toEqual(fx.monthly);
  });
  it('as missões de cada dia, de 2023 até a véspera da estreia das novas, saem como na 1.10.0 (1.414 dias)', () => {
    const bad = [];
    let i = 0, k = fx.from;
    for (; k <= fx.to; k = C.addDays(k, 1), i++) {
      const t = C.missionsOf(k);
      if (t.easy.id !== fx.easy[+fx.e[i]] || t.hard.id !== fx.hard[+fx.h[i]]) bad.push(k);
    }
    expect(bad).toEqual([]);
    expect(i).toBe(fx.e.length);
    const first = C.MISSIONS_EASY.concat(C.MISSIONS_HARD).filter((m) => m.since).map((m) => m.since).sort()[0];
    expect(C.addDays(fx.to, 1)).toBe(first); // a foto vai até a véspera da primeira estreia: nenhum dia de antes ficou de fora
  });
  it('o desafio de cada semana (de janeiro de 2023 até a de 16/11/2026) e de cada mês (até novembro de 2026) saem como na 1.10.0', () => {
    const badW = [], badM = [];
    let j = 0, mon = fx.from;
    for (; j < fx.w.length; j++, mon = C.addDays(mon, 7)) if (C.weekGoal(S, mon).c.id !== fx.weekly[+fx.w[j]]) badW.push(mon);
    expect(badW).toEqual([]);
    expect(C.addDays(mon, -7)).toBe('2026-11-16'); // a última semana da foto é a anterior à primeira estreia (23/11)
    const firstWeek = C.WEEKLY.filter((c) => c.since).map((c) => c.since).sort()[0];
    expect(mon).toBe(firstWeek); // e a seguinte, a primeira da lista maior, estreia no dia certo
    let q = 0;
    for (let y = 2023, m = 1; q < fx.mo.length; q++, m++) {
      if (m > 12) { m = 1; y++; }
      const key = y + '-' + (m < 10 ? '0' : '') + m;
      if (C.monthGoal(S, key + '-10').c.id !== fx.monthly[+fx.mo[q]]) badM.push(key);
    }
    expect(badM).toEqual([]);
    expect(fx.mo.length).toBe(47); // janeiro de 2023 a novembro de 2026; dezembro de 2026 é a primeira estreia dos desafios do mês
    expect(C.MONTHLY.filter((c) => c.since).map((c) => c.since).sort()[0]).toBe('2026-12');
  });
  it('depois da estreia o sorteio muda de verdade (as listas novas entram), e só depois dela', () => {
    let changedDays = 0;
    for (let i = 0, k = '2026-11-16'; i < 120; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); if (C.MISSIONS_EASY.indexOf(t.easy) >= fx.easy.length || C.MISSIONS_HARD.indexOf(t.hard) >= fx.hard.length) changedDays++; }
    expect(changedDays).toBeGreaterThan(30);
    const w = []; for (let i = 0; i < 30; i++) w.push(C.weekGoal(S, C.addDays('2026-11-23', i * 7)).c.id);
    expect(w.filter((id) => fx.weekly.indexOf(id) < 0).length).toBeGreaterThan(8);
    const m = []; for (let i = 0; i < 24; i++) m.push(C.monthGoal(S, C.addDays('2026-12-10', i * 31)).c.id);
    expect(m.filter((id) => fx.monthly.indexOf(id) < 0).length).toBeGreaterThan(6);
  });
});

describe('data de estreia (since): as regras de quem acrescenta entradas', () => {
  const LISTS = [['leve', C.MISSIONS_EASY], ['ousada', C.MISSIONS_HARD], ['semana', C.WEEKLY], ['mês', C.MONTHLY]];
  it('entrada com since vem sempre depois das sem since, e os since estão em ordem (a lista só cresce pelo fim)', () => {
    LISTS.forEach((x) => {
      const flags = x[1].map((c) => (c.since ? 1 : 0)), sn = x[1].filter((c) => c.since).map((c) => c.since);
      expect(flags, x[0]).toEqual(flags.slice().sort());
      expect(sn, x[0]).toEqual(sn.slice().sort());
      expect(x[1].filter((c) => !c.since).length, x[0]).toBeGreaterThan(5); // as de antes seguem lá
    });
  });
  it('o formato da data: dia (AAAA-MM-DD) nas missões, segunda-feira nos desafios da semana, AAAA-MM nos do mês', () => {
    C.MISSIONS_EASY.concat(C.MISSIONS_HARD).filter((m) => m.since).forEach((m) => { expect(/^\d{4}-\d{2}-\d{2}$/.test(m.since), m.id).toBe(true); expect(C.addDays(m.since, 0), m.id).toBe(m.since); });
    C.WEEKLY.filter((c) => c.since).forEach((c) => { expect(C.keyToDate(c.since).getDay(), c.id + ' tem de estrear numa segunda-feira').toBe(1); expect(C.weekStart(c.since)).toBe(c.since); });
    C.MONTHLY.filter((c) => c.since).forEach((c) => { expect(/^\d{4}-(0[1-9]|1[0-2])$/.test(c.since), c.id).toBe(true); });
  });
  it('toda estreia fica depois do dia em que a 1.11.0 foi feita (12/11/2026): ninguém vê a missão de hoje ou o desafio em andamento trocar por causa da atualização', () => {
    C.MISSIONS_EASY.concat(C.MISSIONS_HARD).filter((m) => m.since).forEach((m) => { expect(m.since > '2026-11-12', m.id).toBe(true); });
    C.WEEKLY.filter((c) => c.since).forEach((c) => { expect(c.since > C.weekStart('2026-11-12'), c.id).toBe(true); }); // depois da semana em andamento
    C.MONTHLY.filter((c) => c.since).forEach((c) => { expect(c.since > '2026-11', c.id).toBe(true); }); // depois do mês em andamento
  });
  it('a missão da estreia: um dia antes só a lista antiga, no dia já vale a nova', () => {
    const idsAt = (k, list) => {
      const out = {};
      for (let i = 0; i < 1500; i++) { const t = C.missionsOf(C.addDays(k, i)); out[(list === 'e' ? t.easy : t.hard).id] = (out[(list === 'e' ? t.easy : t.hard).id] || 0) + 1; }
      return Object.keys(out);
    };
    // 300 dias antes da estreia: nenhuma entrada nova
    const before = []; for (let i = 1; i <= 300; i++) { const t = C.missionsOf(C.addDays('2026-11-16', -i)); before.push(t.easy.since || '', t.hard.since || ''); }
    expect(before.filter(Boolean)).toEqual([]);
    expect(idsAt('2026-11-16', 'e').length).toBe(C.MISSIONS_EASY.length);
    expect(idsAt('2026-11-16', 'h').length).toBe(C.MISSIONS_HARD.length);
  });
  it('o dia da estreia vale (a regra é "desde", não "depois"), e o dia anterior não: a prova com duas entradas de mentira, numa data em que o sorteio daria a nova nos dois dias', () => {
    // O sorteio entre duas entradas é par ou ímpar de rnd(dia + ':e') (o mesmo misturador do core.js). Escolho uma estreia em que a nova sairia no próprio dia e também no dia
    // anterior (se já valesse lá): assim o teste pega a regra um dia atrasada e um dia adiantada, sem depender de a lista de verdade sortear a nova justo nesse dia.
    const mix32 = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
    const odd = (k) => mix32(C.hash(k + ':e')) % 2 === 1;
    let d = '2031-01-01';
    while (!(odd(d) && odd(C.addDays(d, -1)))) d = C.addDays(d, 1);
    const saved = C.MISSIONS_EASY.splice(0); // a lista que o sorteio usa é esta mesma (a exportada): troco o conteúdo por duas de mentira e devolvo no fim
    try {
      const fake = (id, since) => Object.assign({ id: id, f: 'vol', e: '•', t: id, p: () => 0 }, since ? { since: since } : {});
      C.MISSIONS_EASY.push(fake('velha'), fake('nova', d));
      expect(C.missionsOf(C.addDays(d, -1)).easy.id, 'um dia antes: só a velha').toBe('velha');
      expect(C.missionsOf(d).easy.id, 'no dia da estreia: a nova já vale').toBe('nova');
    } finally {
      C.MISSIONS_EASY.splice(0);
      saved.forEach((m) => { C.MISSIONS_EASY.push(m); });
    }
    expect(C.MISSIONS_EASY.length, 'a lista de verdade foi devolvida').toBe(saved.length);
  });
  it('a virada de época: a primeira semana e o primeiro mês da lista maior nunca repetem o desafio da semana ou do mês anterior', () => {
    const S = base();
    expect(C.weekGoal(S, '2026-11-23').c.id).not.toBe(C.weekGoal(S, '2026-11-16').c.id);
    expect(C.monthGoal(S, '2026-12-10').c.id).not.toBe(C.monthGoal(S, '2026-11-10').c.id);
  });
});

describe('as missões novas da 1.11.0: o andamento de cada uma, nos limites', () => {
  const E = {}, H = {};
  C.MISSIONS_EASY.forEach((m) => { E[m.id] = m; });
  C.MISSIONS_HARD.forEach((m) => { H[m.id] = m; });
  const k = '2026-06-10';
  const one = (h, m, dk, ml) => es(k, [[h, m, ml || 100, dk]]);
  it('Chegue a três quartos da meta antes das 20h: 19h59 conta, 20h00 não; segue a meta do dia e os outros líquidos só com "somar"', () => {
    expect(E.e34.p(es(k, [[19, 59, 1500]]), 2000)).toBeCloseTo(1);
    expect(E.e34.p(es(k, [[20, 0, 1500]]), 2000)).toBe(0);
    expect(E.e34.p(es(k, [[9, 0, 750]]), 2000)).toBeCloseTo(0.5);
    expect(E.e34.p(es(k, [[9, 0, 1499]]), 2000)).toBeLessThan(1);
    expect(E.e34.p(es(k, [[9, 0, 600]]), 800)).toBeCloseTo(1); // meta de 800 ml: três quartos são 600
    expect(E.e34.p(es(k, [[9, 0, 1000], [10, 0, 1000, 'coffee']]), 2000)).toBeCloseTo(1000 / 1500);
    C.setMix(true);
    expect(E.e34.p(es(k, [[9, 0, 1000], [10, 0, 500, 'coffee']]), 2000)).toBeCloseTo(1);
  });
  it('Beba água 2 vezes antes do meio-dia: 11h59 conta, 12h00 não; chá não é um gole', () => {
    expect(E.e2am.p(es(k, [[11, 59, 100], [8, 0, 100]]), 2000)).toBe(1);
    expect(E.e2am.p(es(k, [[12, 0, 100], [8, 0, 100]]), 2000)).toBeCloseTo(0.5);
    expect(E.e2am.p(es(k, [[8, 0, 100], [9, 0, 300, 'tea']]), 2000)).toBeCloseTo(0.5);
    expect(E.e2am.p(es(k, [[8, 0, 100], [9, 0, 300, 'sparkling']]), 2000)).toBe(1);
    expect(E.e2am.p(es(k, [[8, 0, 100], [8, 1, 100], [8, 2, 100]]), 2000)).toBeGreaterThan(1);
    expect(E.e2am.p([], 2000)).toBe(0);
  });
  it('Beba água antes das 9h: 8h59 conta, 9h00 não; café não', () => {
    expect(E.ewake.p(one(8, 59), 2000)).toBe(1); expect(E.ewake.p(one(9, 0), 2000)).toBe(0);
    expect(E.ewake.p(one(0, 0), 2000)).toBe(1);
    expect(E.ewake.p(one(7, 0, 'coffee'), 2000)).toBe(0);
    expect(E.ewake.p([], 2000)).toBe(0);
  });
  it('Beba água à noite, depois das 18h: 17h59 não conta, 18h00 conta, 23h59 conta; chá não', () => {
    expect(E.eeve.p(one(17, 59), 2000)).toBe(0); expect(E.eeve.p(one(18, 0), 2000)).toBe(1);
    expect(E.eeve.p(one(23, 59), 2000)).toBe(1);
    expect(E.eeve.p(one(21, 0, 'tea'), 2000)).toBe(0);
  });
  it('Chegue a 1 L antes das 11h: 10h59 conta, 11h00 não; com meta baixa vale a meta (nunca pede mais água do que o dia)', () => {
    expect(H.h1l11.p(es(k, [[10, 59, 1000]]), 2000)).toBe(1);
    expect(H.h1l11.p(es(k, [[11, 0, 1000]]), 2000)).toBe(0);
    expect(H.h1l11.p(es(k, [[8, 0, 999]]), 2000)).toBeLessThan(1);
    expect(H.h1l11.p(es(k, [[8, 0, 500]]), 500)).toBe(1);
    expect(H.h1l11.p(es(k, [[8, 0, 800]]), 800)).toBe(1);
    expect(H.h1l11.p(es(k, [[8, 0, 400]]), 800)).toBeCloseTo(0.5);
    expect(H.h1l11.p(es(k, [[8, 0, 600], [9, 0, 400]]), 3000)).toBe(1);
  });
  it('Beba água 10 vezes hoje: 10 registros de água, 9 não; chá e café não contam', () => {
    const n = (c, extra) => { const l = []; for (let i = 0; i < c; i++) l.push([8, i * 3, 100]); return es(k, l.concat(extra || [])); };
    expect(H.h10.p(n(10), 2000)).toBe(1); expect(H.h10.p(n(9), 2000)).toBeCloseTo(0.9);
    expect(H.h10.p(n(9, [[20, 0, 300, 'tea']]), 2000)).toBeCloseTo(0.9);
    expect(H.h10.p(n(9, [[20, 0, 100, 'sparkling']]), 2000)).toBe(1);
  });
  it('Beba água antes das 8h e depois das 20h: cada ponta vale metade; 7h59 e 20h00 contam, 8h00 e 19h59 não', () => {
    expect(H.hbook.p(one(7, 59), 2000)).toBeCloseTo(0.5); expect(H.hbook.p(one(8, 0), 2000)).toBe(0);
    expect(H.hbook.p(one(20, 0), 2000)).toBeCloseTo(0.5); expect(H.hbook.p(one(19, 59), 2000)).toBe(0);
    expect(H.hbook.p(es(k, [[7, 59, 100], [20, 0, 100]]), 2000)).toBe(1);
    expect(H.hbook.p(es(k, [[6, 0, 100], [7, 0, 100], [7, 30, 100]]), 2000)).toBeCloseTo(0.5); // três goles de manhã cedo valem só a ponta da manhã
    expect(H.hbook.p(es(k, [[7, 0, 100], [21, 0, 100, 'coffee']]), 2000)).toBeCloseTo(0.5);
    expect(H.hbook.p(one(0, 0), 2000)).toBeCloseTo(0.5); // meia-noite e zero é "antes das 8h"
    expect(H.hbook.p(one(23, 59), 2000)).toBeCloseTo(0.5);
  });
  it('Beba água 3 vezes de manhã, 3 à tarde e 3 à noite: cada parte vale 1/3 (11h59 é manhã, 12h00 é tarde, 17h59 é tarde, 18h00 é noite)', () => {
    const nine = es(k, [[8, 0, 100], [9, 0, 100], [11, 59, 100], [12, 0, 100], [14, 0, 100], [17, 59, 100], [18, 0, 100], [20, 0, 100], [22, 0, 100]]);
    expect(H.h3x3.p(nine, 2000)).toBe(1);
    expect(H.h3x3.p(nine.slice(0, 8), 2000)).toBeCloseTo((1 + 1 + 2 / 3) / 3);
    expect(H.h3x3.p(es(k, [[8, 0, 100], [9, 0, 100], [10, 0, 100], [11, 0, 100], [11, 30, 100]]), 2000)).toBeCloseTo(1 / 3); // muito de manhã não passa de 1/3
    expect(H.h3x3.p(es(k, [[8, 0, 100], [13, 0, 100, 'tea']]), 2000)).toBeCloseTo((1 / 3) / 3);
    expect(H.h3x3.p(es(k, [[8, 0, 200, 'sparkling'], [9, 0, 100], [10, 0, 100]]), 2000)).toBeCloseTo(1 / 3);
  });
});

describe('os desafios novos da 1.11.0: o limite de cada regra', () => {
  const week2 = (S, id, today) => C.challengeState(S, W(id), MON, SUN, today || SUN);
  const month = (S, id) => C.challengeState(S, M(id), '2026-06-01', '2026-06-30', '2026-06-30');
  const w1 = (id, list, g) => week2(stateWith({ [d(0)]: dayOf(d(0), g || 2000, list) }), id).have; // 1 se o dia (a segunda) conta
  it('Água ao amanhecer (semana: 3 dias; mês: 10 dias): 500 ml de água antes das 9h (8h59 conta, 9h00 não, 499 não; café não)', () => {
    expect(w1('wearly', [[8, 59, 500]])).toBe(1);
    expect(w1('wearly', [[9, 0, 500]])).toBe(0);
    expect(w1('wearly', [[8, 59, 499]])).toBe(0);
    expect(w1('wearly', [[7, 0, 250], [8, 30, 250]])).toBe(1);
    expect(w1('wearly', [[7, 0, 800, 'coffee']])).toBe(0);
    expect([W('wearly').need, M('mearly').need]).toEqual([3, 10]);
    const f = { morning: 500 }, g = { morning: 499 };
    expect([!!M('mearly').day(f), !!M('mearly').day(g)]).toEqual([true, false]);
  });
  it('Começo cedo (5 dias): o primeiro registro de água antes das 10h (9h59 conta, 10h00 não); o café não é registro de água', () => {
    expect(w1('wfirst', [[9, 59, 50]])).toBe(1);
    expect(w1('wfirst', [[10, 0, 50]])).toBe(0);
    expect(w1('wfirst', [[0, 0, 50]])).toBe(1);
    expect(w1('wfirst', [[9, 0, 300, 'coffee'], [10, 30, 200]])).toBe(0);
    expect(w1('wfirst', [[10, 30, 200], [9, 30, 50]])).toBe(1); // o primeiro do dia, na ordem do relógio, e não da lista
    expect(w1('wfirst', [])).toBe(0);
    expect(W('wfirst').need).toBe(5);
  });
  it('Água bem espalhada (4 dias): 5 horários diferentes (4 não; dois goles na mesma hora são um horário)', () => {
    expect(w1('wspread', [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [15, 0, 100]])).toBe(1);
    expect(w1('wspread', [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [13, 30, 100]])).toBe(0);
    expect(w1('wspread', [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [15, 0, 300, 'tea']])).toBe(0);
    expect(w1('wspread', [])).toBe(0);
    expect(week2(base(), 'wspread').have).toBe(0); // dia sem registro nenhum
    expect(W('wspread').need).toBe(4);
  });
  it('Missões leves e ousadas da semana (4 e 2 dias) e do mês (15 e 8): contam os dias com a missão guardada, só os da janela', () => {
    const S = base();
    [-1, 0, 2, 4, 6, 7].forEach((i) => { S.extras[d(i) + ':e'] = 1; });
    [0, 3, 8].forEach((i) => { S.extras[d(i) + ':h'] = 1; });
    expect(week2(S, 'wlight')).toMatchObject({ have: 4, days: [1, 0, 1, 0, 1, 0, 1] });
    expect(week2(S, 'wbold')).toMatchObject({ have: 2, days: [1, 0, 0, 1, 0, 0, 0] });
    expect(S.extras[d(0) + ':e'] && !S.extras[d(1) + ':e']).toBeTruthy();
    expect(week2({ days: {} }, 'wlight').have).toBe(0); // estado sem S.extras (backup antigo)
    expect([W('wlight').need, W('wbold').need, M('mlight').need, M('mbold').need]).toEqual([4, 2, 15, 8]);
    const T = base();
    for (let i = 0; i < 15; i++) T.extras[C.addDays('2026-06-01', i) + ':e'] = 1;
    for (let i = 0; i < 8; i++) T.extras[C.addDays('2026-06-01', i * 2) + ':h'] = 1;
    T.extras['2026-05-31:e'] = 1; T.extras['2026-07-01:h'] = 1; // fora do mês
    expect(month(T, 'mlight').have).toBe(15);
    expect(month(T, 'mbold').have).toBe(8);
    expect(month(T, 'mlight').days.length).toBe(30);
  });
  it('Seis goles por dia (mês: 20 dias), Meta antes das 20h (mês: 20 dias) e Água ao amanhecer (mês: 10): a mesma regra da semana, em dias do mês', () => {
    const sixDay = (k) => dayOf(k, 2000, [[8, 0, 100], [9, 0, 100], [10, 0, 100], [11, 0, 100], [12, 0, 100], [13, 0, 100]]);
    const five = (k) => dayOf(k, 2000, [[8, 0, 100], [9, 0, 100], [10, 0, 100], [11, 0, 100], [12, 0, 100], [13, 0, 300, 'tea']]);
    const S = stateWith({ '2026-06-01': sixDay('2026-06-01'), '2026-06-02': five('2026-06-02'), '2026-06-03': sixDay('2026-06-03') });
    expect(month(S, 'msix').have).toBe(2);
    const late = (h, m) => month(stateWith({ '2026-06-05': dayOf('2026-06-05', 2000, [[h, m, 2000]]) }), 'mlate').have;
    expect(late(19, 59)).toBe(1); expect(late(20, 0)).toBe(0); expect(late(8, 0)).toBe(1);
    expect(month(stateWith({ '2026-06-05': dayOf('2026-06-05', 2000, [[8, 0, 1000], [20, 30, 1000]]) }), 'mlate').have).toBe(0); // bateu, mas só às 20h30
    expect(M('msix').need).toBe(20); expect(M('mlate').need).toBe(20);
  });
  it('Meta sem sufoco: as regras novas só olham fatos que o dia já tem (ninguém precisa de mais água do que a meta)', () => {
    // todas as regras novas, sobre um dia com a meta exata e nada além dela, fecham nos dias que cabem na descrição
    const S = base(), k = d(0);
    S.days[k] = dayOf(k, 2000, [[7, 0, 600], [8, 0, 500], [9, 0, 300], [11, 0, 200], [13, 0, 200], [15, 0, 200]]);
    S.extras[k + ':e'] = 1; S.extras[k + ':h'] = 1;
    ['wearly', 'wfirst', 'wspread', 'wlight', 'wbold'].forEach((id) => { expect(week2(S, id, k).have, id).toBe(1); });
    ['mearly', 'mlight', 'mbold'].forEach((id) => { expect(C.challengeState(S, M(id), '2026-06-01', '2026-06-30', k).have, id).toBe(1); });
  });
  it('o desafio novo aparece na semana certa (depois da estreia), mostra o andamento e fecha em challengesDue', () => {
    let mon = '2026-11-23', n = 0;
    while (C.weekGoal(base(), mon).c.id !== 'wbold' && n++ < 60) mon = C.addDays(mon, 7);
    expect(C.weekGoal(base(), mon).c.id).toBe('wbold');
    expect(mon >= '2026-11-23').toBe(true);
    const S = base();
    S.extras[mon + ':h'] = 1;
    expect(C.weekGoal(S, C.addDays(mon, 2))).toMatchObject({ have: 1, need: 2, done: false, pct: 50, over: false });
    expect(C.challengesDue(S, C.addDays(mon, 2)).filter((x) => x.kind === 'w')).toEqual([]);
    S.extras[C.addDays(mon, 1) + ':h'] = 1;
    const due = C.challengesDue(S, C.addDays(mon, 2)).filter((x) => x.kind === 'w');
    expect(due.map((x) => x.key + ':' + x.c.id)).toEqual([mon + ':wbold']);
  });
});

/* ---------- 1.12.0: mais uma leva, com data de estreia ---------- */
describe('a leva da 1.12.0 não muda o passado: a foto das escolhas da 1.11.0', () => {
  // tests/fixtures/picks-1.11.0.json foi gerado com o core.js da 1.11.0, ANTES de a leva da 1.12.0 entrar: as listas de então (id de cada carta), as missões leve (e) e ousada (h) de cada dia de 16/11 a 6/12/2026,
  // o desafio de cada semana (w: 23 e 30/11), o do mês (mo: dezembro) e o da turma de cada semana de 5/1 a 30/11/2026 (c). Cada letra é o índice (base 36) da carta na lista de então. picks-1.10.0.json guarda o que veio antes.
  const fx = JSON.parse(readFileSync(new URL('./fixtures/picks-1.11.0.json', import.meta.url), 'utf8'));
  const S = base(), at = (s, i) => parseInt(s.charAt(i), 36), Z2 = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  const firstAfter = (list, after) => list.filter((m) => m.since && m.since > after).map((m) => m.since).sort()[0];
  it('as listas da foto são o começo das listas de hoje (entrada nova só entra no fim)', () => {
    expect(C.MISSIONS_EASY.slice(0, fx.easy.length).map((m) => m.id)).toEqual(fx.easy);
    expect(C.MISSIONS_HARD.slice(0, fx.hard.length).map((m) => m.id)).toEqual(fx.hard);
    expect(C.WEEKLY.slice(0, fx.weekly.length).map((c) => c.id)).toEqual(fx.weekly);
    expect(C.MONTHLY.slice(0, fx.monthly.length).map((c) => c.id)).toEqual(fx.monthly);
    expect(C.CREW_CHALLENGES.slice(0, fx.crewIds.length).map((c) => c.id)).toEqual(fx.crewIds);
    expect([fx.easy.length, fx.hard.length, fx.weekly.length, fx.monthly.length, fx.crewIds.length]).toEqual([10, 11, 14, 12, 4]);
  });
  it('as missões de cada dia, de 16/11/2026 (a estreia das da 1.11.0) até a véspera da estreia das novas (6/12), saem como na 1.11.0 (21 dias)', () => {
    const bad = [];
    let i = 0;
    for (let k = fx.days.from; k <= fx.days.to; k = C.addDays(k, 1), i++) { const t = C.missionsOf(k); if (t.easy.id !== fx.easy[at(fx.days.e, i)] || t.hard.id !== fx.hard[at(fx.days.h, i)]) bad.push(k); }
    expect(bad).toEqual([]);
    expect([i, fx.days.e.length, fx.days.h.length]).toEqual([21, 21, 21]);
    expect(C.addDays(fx.days.to, 1)).toBe(firstAfter(C.MISSIONS_EASY.concat(C.MISSIONS_HARD), fx.days.from)); // a foto vai até a véspera da primeira estreia da 1.12.0
  });
  it('o desafio de cada semana (23 e 30/11), o do mês (dezembro) e o da turma de cada semana de 2026 (até 30/11) saem como na 1.11.0', () => {
    const bad = [];
    let i = 0;
    for (let m = fx.weeks.from; m <= fx.weeks.to; m = C.addDays(m, 7), i++) if (C.weekGoal(S, m).c.id !== fx.weekly[at(fx.weeks.w, i)]) bad.push('semana ' + m);
    expect(i).toBe(2);
    expect(C.addDays(fx.weeks.to, 7)).toBe(firstAfter(C.WEEKLY, fx.weeks.from));
    for (let d2 = 1; d2 <= 28; d2++) { const key = '2026-12-' + (d2 < 10 ? '0' : '') + d2; if (C.monthGoal(S, key).c.id !== fx.monthly[at(fx.months.mo, 0)]) bad.push('mês ' + key); }
    expect(firstAfter(C.MONTHLY, fx.months.from)).toBe('2027-01'); // dezembro é o último mês da lista da 1.11.0
    i = 0;
    for (let m = fx.crew.from; m <= fx.crew.to; m = C.addDays(m, 7), i++) if (C.crewInfo(S, Z2, m, m).c.id !== fx.crewIds[at(fx.crew.c, i)]) bad.push('turma ' + m);
    expect(i).toBe(48);
    expect(C.addDays(fx.crew.to, 7)).toBe(firstAfter(C.CREW_CHALLENGES, '2000-01-01'));
    expect(bad).toEqual([]);
  });
  it('depois da estreia o sorteio muda de verdade: as missões novas aparecem e, nas semanas da estreia (7 e 14/12), o desafio sai só da lista da época (a da 1.12.0, o começo da de hoje), sem repetir o anterior', () => {
    let newDays = 0;
    for (let i = 0, k = '2026-12-07'; i < 120; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); if (C.MISSIONS_EASY.indexOf(t.easy) >= fx.easy.length || C.MISSIONS_HARD.indexOf(t.hard) >= fx.hard.length) newDays++; }
    expect(newDays).toBeGreaterThan(20);
    const ids = (l) => l.map((c) => c.id);
    // a época da 1.12.0 vai de 7/12 até a véspera da estreia da 1.13.0 (21/12): as duas semanas (e janeiro de 2027, no mês) saem da lista de então, que é o começo da de hoje (18 semanas, 16 meses, 6 regras da turma)
    ['2026-12-07', '2026-12-14'].forEach((m) => {
      expect(ids(C.WEEKLY.slice(0, 18)), 'semana ' + m).toContain(C.weekGoal(S, m).c.id);
      expect(ids(C.CREW_CHALLENGES.slice(0, 6)), 'turma ' + m).toContain(C.crewInfo(S, Z2, m, m).c.id);
    });
    expect(ids(C.MONTHLY.slice(0, 16))).toContain(C.monthGoal(S, '2027-01-10').c.id);
    expect(C.weekGoal(S, '2026-12-14').c.id).not.toBe(C.weekGoal(S, '2026-12-07').c.id);
    expect(C.crewInfo(S, Z2, '2026-12-14', '2026-12-14').c.id).not.toBe(C.crewInfo(S, Z2, '2026-12-07', '2026-12-07').c.id);
    // e seguem as voltas seguintes (36 semanas): nenhum desafio sai duas vezes seguidas, também nas viradas de época (7/12 e 21/12)
    const w = []; for (let i = -1; i < 36; i++) w.push(C.weekGoal(S, C.addDays('2026-12-07', i * 7)).c.id);
    for (let i = 1; i < w.length; i++) expect(w[i], 'semana ' + i).not.toBe(w[i - 1]);
    const c = []; for (let i = -1; i < 36; i++) c.push(C.crewInfo(S, Z2, C.addDays('2026-12-07', i * 7), C.addDays('2026-12-07', i * 7)).c.id);
    for (let i = 1; i < c.length; i++) expect(c[i], 'turma ' + i).not.toBe(c[i - 1]);
  });
});

describe('a leva da 1.12.0: as datas de estreia', () => {
  const NEW = { easy: ['e13', 'e2pm', 'esnack'], hard: ['h23', 'hblocks2', 'hnight2'], weekly: ['wblocks', 'weve', 'wlunch', 'w8'], monthly: ['mspread', 'mfirst', 'mhalf', 'meve'], crew: ['cchain', 'cpairs'] };
  const LISTS = { easy: C.MISSIONS_EASY, hard: C.MISSIONS_HARD, weekly: C.WEEKLY, monthly: C.MONTHLY, crew: C.CREW_CHALLENGES };
  const sizes = { easy: 13, hard: 14, weekly: 18, monthly: 16, crew: 6 }; // o tamanho de cada lista com a leva da 1.12.0 (a da 1.13.0 vem depois, no fim de cada uma)
  const before = { easy: 10, hard: 11, weekly: 14, monthly: 12, crew: 4 }; // e o de antes dela (a foto da 1.11.0)
  it('as entradas novas ficam logo depois das da 1.11.0, na ordem, e as listas de hoje começam com as da 1.12.0 (a leva seguinte entra só no fim)', () => {
    Object.keys(NEW).forEach((x) => {
      const l = LISTS[x];
      expect(l.length, x).toBeGreaterThanOrEqual(sizes[x]);
      expect(l.slice(before[x], sizes[x]).map((m) => m.id), x).toEqual(NEW[x]);
    });
  });
  it('as missões do dia estreiam em 7/12/2026, os desafios da semana e da turma na mesma segunda-feira e os do mês em 1/1/2027 (3 semanas depois da publicação)', () => {
    ['easy', 'hard'].forEach((x) => NEW[x].forEach((id) => { expect(LISTS[x].filter((m) => m.id === id)[0].since, id).toBe('2026-12-07'); }));
    ['weekly', 'crew'].forEach((x) => NEW[x].forEach((id) => { const s = LISTS[x].filter((m) => m.id === id)[0].since; expect(s, id).toBe('2026-12-07'); expect(C.keyToDate(s).getDay(), id + ' estreia numa segunda-feira').toBe(1); }));
    NEW.monthly.forEach((id) => { expect(C.MONTHLY.filter((m) => m.id === id)[0].since, id).toBe('2027-01'); });
    expect('2026-12-07' >= C.addDays('2026-11-12', 21)).toBe(true); // a 1.12.0 foi feita em 12/11/2026
  });
  it('todas as listas seguem em ordem: sem data primeiro, depois as datas, da mais antiga para a mais nova (também a da turma)', () => {
    Object.keys(LISTS).forEach((x) => {
      const l = LISTS[x], flags = l.map((c) => (c.since ? 1 : 0)), sn = l.filter((c) => c.since).map((c) => c.since);
      expect(flags, x).toEqual(flags.slice().sort());
      expect(sn, x).toEqual(sn.slice().sort());
    });
    expect(C.CREW_CHALLENGES.filter((c) => !c.since).map((c) => c.id)).toEqual(['ctotal', 'ccrowd', 'call', 'cweek']); // a primeira época da turma é a da 1.11.0, inteira
  });
  it('um dia antes da estreia só existem as listas da 1.11.0; no dia da estreia as novas já podem sair (as 6 missões novas saem em 300 dias)', () => {
    const seen = {};
    for (let i = 0, k = '2026-11-16'; i < 21; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); expect(NEW.easy.indexOf(t.easy.id) < 0 && NEW.hard.indexOf(t.hard.id) < 0, k).toBe(true); }
    for (let i = 0, k = '2026-12-07'; i < 300; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); seen[t.easy.id] = 1; seen[t.hard.id] = 1; }
    NEW.easy.concat(NEW.hard).forEach((id) => { expect(seen[id], id).toBe(1); });
  });
  it('a virada de época: a primeira semana, o primeiro mês e a primeira semana da turma da lista maior nunca repetem o desafio do tempo anterior', () => {
    const S = base(), Z2 = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
    expect(C.weekGoal(S, '2026-12-07').c.id).not.toBe(C.weekGoal(S, '2026-11-30').c.id);
    expect(C.monthGoal(S, '2027-01-10').c.id).not.toBe(C.monthGoal(S, '2026-12-10').c.id);
    expect(C.crewInfo(S, Z2, '2026-12-07', '2026-12-07').c.id).not.toBe(C.crewInfo(S, Z2, '2026-11-30', '2026-11-30').c.id);
  });
});

describe('as missões novas da 1.12.0: o andamento de cada uma, nos limites', () => {
  const E = {}, H = {};
  C.MISSIONS_EASY.forEach((m) => { E[m.id] = m; });
  C.MISSIONS_HARD.forEach((m) => { H[m.id] = m; });
  const k = '2026-06-10';
  const one = (h, m, dk, ml) => es(k, [[h, m, ml || 100, dk]]);
  it('Chegue a um terço da meta antes do meio-dia: 11h59 conta, 12h00 não; 667 de 2.000 ml fecha e 666 não; segue a meta do dia e os outros líquidos só com "somar"', () => {
    expect(E.e13.p(es(k, [[11, 59, 667]]), 2000)).toBeGreaterThanOrEqual(1);
    expect(E.e13.p(es(k, [[12, 0, 667]]), 2000)).toBe(0);
    expect(E.e13.p(es(k, [[8, 0, 666]]), 2000)).toBeLessThan(1);
    expect(E.e13.p(es(k, [[8, 0, 300]]), 900)).toBeCloseTo(1); // meta de 900 ml: um terço são 300
    expect(E.e13.p(es(k, [[8, 0, 500]]), 500)).toBeGreaterThanOrEqual(1); // meta mínima: o terço é 167 ml, nunca mais do que a meta
    expect(E.e13.p(es(k, [[8, 0, 500], [9, 0, 800, 'coffee']]), 2000)).toBeCloseTo(0.75); // o café sem "somar" não conta
    C.setMix(true);
    expect(E.e13.p(es(k, [[8, 0, 500], [9, 0, 300, 'coffee']]), 2000)).toBeGreaterThanOrEqual(1);
    expect(E.e13.p([], 2000)).toBe(0);
  });
  it('Beba água 2 vezes à tarde: 12h00 e 17h59 contam, 11h59 e 18h00 não; chá não é um gole', () => {
    expect(E.e2pm.p(es(k, [[12, 0, 100], [17, 59, 100]]), 2000)).toBe(1);
    expect(E.e2pm.p(es(k, [[11, 59, 100], [12, 0, 100]]), 2000)).toBeCloseTo(0.5);
    expect(E.e2pm.p(es(k, [[17, 59, 100], [18, 0, 100]]), 2000)).toBeCloseTo(0.5);
    expect(E.e2pm.p(es(k, [[13, 0, 100], [14, 0, 300, 'tea']]), 2000)).toBeCloseTo(0.5);
    expect(E.e2pm.p(es(k, [[13, 0, 100], [14, 0, 300, 'sparkling']]), 2000)).toBe(1);
    expect(E.e2pm.p(es(k, [[13, 0, 100], [13, 1, 100], [13, 2, 100]]), 2000)).toBeGreaterThan(1);
    expect(E.e2pm.p([], 2000)).toBe(0);
  });
  it('Beba água no lanche da tarde, entre 15h e 17h: 14h59 não conta, 15h00 e 16h59 contam, 17h00 não; café não', () => {
    expect(E.esnack.p(one(14, 59), 2000)).toBe(0); expect(E.esnack.p(one(15, 0), 2000)).toBe(1);
    expect(E.esnack.p(one(16, 59), 2000)).toBe(1); expect(E.esnack.p(one(17, 0), 2000)).toBe(0);
    expect(E.esnack.p(one(16, 0, 'coffee'), 2000)).toBe(0);
    expect(E.esnack.p([], 2000)).toBe(0);
  });
  it('Chegue a dois terços da meta antes das 15h: 14h59 conta, 15h00 não; 1.334 de 2.000 ml fecha e 1.333 não; meta baixa vale a meta (600 de 900)', () => {
    expect(H.h23.p(es(k, [[14, 59, 1334]]), 2000)).toBeGreaterThanOrEqual(1);
    expect(H.h23.p(es(k, [[15, 0, 1334]]), 2000)).toBe(0);
    expect(H.h23.p(es(k, [[8, 0, 1333]]), 2000)).toBeLessThan(1);
    expect(H.h23.p(es(k, [[8, 0, 600]]), 900)).toBeCloseTo(1);
    expect(H.h23.p(es(k, [[8, 0, 334]]), 500)).toBeGreaterThanOrEqual(1); // meta mínima de 500 ml: dois terços são 333,3 e 334 ml já fecham
    expect(H.h23.p(es(k, [[8, 0, 333]]), 500)).toBeLessThan(1);
    expect(H.h23.p(es(k, [[8, 0, 500]]), 500)).toBeGreaterThanOrEqual(1);
    expect(H.h23.p(es(k, [[8, 0, 1000], [9, 0, 1000, 'coffee']]), 2000)).toBeCloseTo(0.75);
    C.setMix(true);
    expect(H.h23.p(es(k, [[8, 0, 1000], [9, 0, 400, 'coffee']]), 2000)).toBeGreaterThanOrEqual(1);
  });
  it('Beba água a cada 2 horas, das 8h às 20h: seis janelas de 2 h (8h–10h … 18h–20h), uma gota em cada; 7h59 e 20h00 ficam de fora e três goles na mesma janela valem um', () => {
    const six = es(k, [[8, 0, 100], [10, 0, 100], [12, 0, 100], [14, 0, 100], [16, 0, 100], [18, 0, 100]]);
    expect(H.hblocks2.p(six, 2000)).toBe(1);
    expect(H.hblocks2.p(six.slice(0, 5), 2000)).toBeCloseTo(5 / 6);
    expect(H.hblocks2.p(es(k, [[9, 59, 100], [11, 59, 100], [13, 59, 100], [15, 59, 100], [17, 59, 100], [19, 59, 100]]), 2000)).toBe(1); // o último minuto de cada janela
    expect(H.hblocks2.p(es(k, [[9, 59, 100], [10, 0, 100]]), 2000)).toBeCloseTo(2 / 6); // 9h59 e 10h00 são janelas diferentes
    expect(H.hblocks2.p(one(7, 59), 2000)).toBe(0); expect(H.hblocks2.p(one(8, 0), 2000)).toBeCloseTo(1 / 6);
    expect(H.hblocks2.p(one(19, 59), 2000)).toBeCloseTo(1 / 6); expect(H.hblocks2.p(one(20, 0), 2000)).toBe(0);
    expect(H.hblocks2.p(es(k, [[8, 0, 100], [8, 30, 100], [9, 0, 100]]), 2000)).toBeCloseTo(1 / 6);
    expect(H.hblocks2.p(es(k, [[8, 0, 100], [10, 0, 300, 'tea']]), 2000)).toBeCloseTo(1 / 6);
    expect(H.hblocks2.p([], 2000)).toBe(0);
  });
  it('Beba água em 2 horários diferentes à noite, depois das 18h: 17h59 não conta, 18h00 e 23h59 contam; a mesma hora vale uma vez; chá não', () => {
    expect(H.hnight2.p(es(k, [[18, 0, 100], [19, 0, 100]]), 2000)).toBe(1);
    expect(H.hnight2.p(es(k, [[18, 0, 100], [18, 59, 100]]), 2000)).toBeCloseTo(0.5); // 18h00 e 18h59 são a mesma hora
    expect(H.hnight2.p(es(k, [[17, 59, 100], [18, 0, 100]]), 2000)).toBeCloseTo(0.5); // 17h59 ainda é de tarde
    expect(H.hnight2.p(es(k, [[22, 0, 100], [23, 59, 100]]), 2000)).toBe(1);
    expect(H.hnight2.p(es(k, [[18, 0, 100], [20, 0, 300, 'tea']]), 2000)).toBeCloseTo(0.5);
    expect(H.hnight2.p(es(k, [[18, 0, 100], [19, 0, 100], [20, 0, 100]]), 2000)).toBeGreaterThan(1);
    expect(H.hnight2.p(es(k, [[8, 0, 100], [9, 0, 100], [10, 0, 100]]), 2000)).toBe(0); // de manhã não vale
    expect(H.hnight2.p([], 2000)).toBe(0);
  });
  it('as seis fecham com o dia na meta exata e nenhum ml a mais (ninguém precisa beber mais do que a meta para cumprir uma missão), com entradas de água em horários de gente de verdade', () => {
    const day = es(k, [[8, 0, 500], [10, 0, 400], [12, 0, 300], [14, 0, 200], [15, 30, 100], [16, 0, 100], [18, 0, 100], [19, 0, 100], [20, 30, 200]]); // soma 2.000
    expect(day.reduce((s, e) => s + e.ml, 0)).toBe(2000);
    ['e13', 'e2pm', 'esnack'].forEach((id) => { expect(E[id].p(day, 2000), id).toBeGreaterThanOrEqual(1); });
    ['h23', 'hblocks2', 'hnight2'].forEach((id) => { expect(H[id].p(day, 2000), id).toBeGreaterThanOrEqual(1); });
    // e com a meta mínima de 500 ml (Ajustes aceita de 500): as de quantidade fecham ao chegar na meta
    expect(E.e13.p(es(k, [[8, 0, 500]]), 500)).toBeGreaterThanOrEqual(1);
    expect(H.h23.p(es(k, [[8, 0, 500]]), 500)).toBeGreaterThanOrEqual(1);
  });
  it('hoursOf (a conta de horários) com e sem a hora de início: sem ela é a de sempre; com ela, só as horas a partir dali e cada hora vale uma vez', () => {
    // sem a hora de início: ehrs3 e hhours seguem contando todas as horas do dia (inclusive 0h e 23h)
    expect(E.ehrs3.p(es(k, [[0, 0, 100], [23, 59, 100], [12, 0, 100]]), 2000)).toBe(1);
    expect(H.hhours.p(es(k, [[0, 0, 100], [1, 0, 100], [2, 0, 100], [3, 0, 100], [4, 0, 100], [23, 0, 100]]), 2000)).toBe(1);
    expect(H.hnight2.p(es(k, [[17, 59, 100], [18, 0, 100], [18, 30, 100], [19, 0, 100], [23, 59, 100]]), 2000)).toBeGreaterThan(1); // 18h, 19h e 23h
    expect(H.hnight2.p(es(k, [[0, 0, 100], [1, 0, 100], [23, 0, 100]]), 2000)).toBeCloseTo(0.5); // só a de 23h está na janela
  });
});

describe('os desafios novos da 1.12.0: o limite de cada regra', () => {
  const week2 = (S, id, today) => C.challengeState(S, W(id), MON, SUN, today || SUN);
  const month = (S, id, today) => C.challengeState(S, M(id), '2026-06-01', '2026-06-30', today || '2026-06-30');
  const w1 = (id, list, g) => week2(stateWith({ [d(0)]: dayOf(d(0), g || 2000, list) }), id).have; // 1 se o dia (a segunda) conta
  const m1 = (id, list, g) => month(stateWith({ '2026-06-05': dayOf('2026-06-05', g || 2000, list) }), id).have;
  it('Água a cada 3 horas (semana: 3 dias): uma gota em cada janela de 3 h entre 8h e 20h (8h–11h, 11h–14h, 14h–17h e 17h–20h); 7h59 e 20h00 ficam de fora', () => {
    const four = [[8, 0, 100], [11, 0, 100], [14, 0, 100], [17, 0, 100]];
    expect(w1('wblocks', four)).toBe(1);
    expect(w1('wblocks', four.slice(0, 3))).toBe(0);
    expect(w1('wblocks', [[10, 59, 100], [13, 59, 100], [16, 59, 100], [19, 59, 100]])).toBe(1); // o último minuto de cada janela
    expect(w1('wblocks', [[10, 59, 100], [11, 0, 100], [14, 0, 100]])).toBe(0); // 10h59 e 11h00 são janelas diferentes: faltam duas
    expect(w1('wblocks', [[7, 59, 100], [11, 0, 100], [14, 0, 100], [17, 0, 100]])).toBe(0); // 7h59 ainda não é janela
    expect(w1('wblocks', [[8, 0, 100], [11, 0, 100], [14, 0, 100], [20, 0, 100]])).toBe(0); // 20h00 já não é
    expect(w1('wblocks', [[8, 0, 100], [8, 30, 100], [9, 0, 100], [10, 59, 100]])).toBe(0); // muita água numa janela só
    expect(w1('wblocks', [[8, 0, 100], [11, 0, 100], [14, 0, 100], [17, 0, 300, 'tea']])).toBe(0); // chá não é água
    expect(w1('wblocks', [])).toBe(0);
    expect(week2(base(), 'wblocks').have).toBe(0); // dia sem registro nenhum
    expect(W('wblocks').need).toBe(3);
  });
  it('Ritual da noite (semana: 5 dias; mês: 20): água depois das 18h (17h59 não conta, 18h00 e 23h59 contam; chá e café não)', () => {
    expect(w1('weve', [[17, 59, 100]])).toBe(0); expect(w1('weve', [[18, 0, 100]])).toBe(1); expect(w1('weve', [[23, 59, 100]])).toBe(1);
    expect(w1('weve', [[9, 0, 100], [21, 0, 300, 'tea']])).toBe(0); expect(w1('weve', [[19, 0, 200, 'coffee']])).toBe(0);
    expect(w1('weve', [])).toBe(0); expect(week2(base(), 'weve').have).toBe(0);
    expect(m1('meve', [[17, 59, 100]])).toBe(0); expect(m1('meve', [[18, 0, 100]])).toBe(1); expect(m1('meve', [[23, 59, 100]])).toBe(1);
    expect(m1('meve', [[20, 0, 300, 'tea']])).toBe(0);
    expect([W('weve').need, M('meve').need]).toEqual([5, 20]);
  });
  it('Água no almoço (5 dias): água entre 11h e 15h (10h59 e 15h00 não contam, 11h00 e 14h59 contam; café não)', () => {
    expect(w1('wlunch', [[10, 59, 100]])).toBe(0); expect(w1('wlunch', [[11, 0, 100]])).toBe(1);
    expect(w1('wlunch', [[14, 59, 100]])).toBe(1); expect(w1('wlunch', [[15, 0, 100]])).toBe(0);
    expect(w1('wlunch', [[12, 30, 200, 'coffee']])).toBe(0); expect(w1('wlunch', [])).toBe(0);
    expect(W('wlunch').need).toBe(5);
  });
  it('Oito goles por dia (3 dias): 8 registros de água (7 não; chá e café não contam; goles de qualquer tamanho valem um)', () => {
    const n = (c, extra) => { const l = []; for (let i = 0; i < c; i++) l.push([8, i * 3, 10]); return l.concat(extra || []); };
    expect(w1('w8', n(8))).toBe(1); expect(w1('w8', n(7))).toBe(0);
    expect(w1('w8', n(7, [[20, 0, 300, 'tea']]))).toBe(0); expect(w1('w8', n(7, [[20, 0, 300, 'sparkling']]))).toBe(1);
    expect(w1('w8', n(10))).toBe(1);
    expect(W('w8').need).toBe(3);
  });
  it('Água bem espalhada (mês: 15 dias): 5 horários diferentes (4 não; dois goles na mesma hora são um horário; chá não)', () => {
    expect(m1('mspread', [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [15, 0, 100]])).toBe(1);
    expect(m1('mspread', [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [13, 30, 100]])).toBe(0);
    expect(m1('mspread', [[7, 0, 100], [9, 0, 100], [11, 0, 100], [13, 0, 100], [15, 0, 300, 'tea']])).toBe(0);
    expect(m1('mspread', [])).toBe(0);
    expect(M('mspread').need).toBe(15);
  });
  it('Começo cedo (mês: 20 dias): o primeiro registro de água antes das 10h (9h59 conta, 10h00 não; o café não é registro de água)', () => {
    expect(m1('mfirst', [[9, 59, 50]])).toBe(1); expect(m1('mfirst', [[10, 0, 50]])).toBe(0);
    expect(m1('mfirst', [[9, 0, 300, 'coffee'], [10, 30, 200]])).toBe(0);
    expect(m1('mfirst', [[10, 30, 200], [9, 30, 50]])).toBe(1);
    expect(m1('mfirst', [])).toBe(0);
    expect(M('mfirst').need).toBe(20);
  });
  it('Metade até as 15h (mês: 18 dias): a metade da meta do próprio dia antes das 15h (14h59 conta, 15h00 não; 999 de 2.000 não, 1.000 sim; meta de 1.500: 750)', () => {
    expect(m1('mhalf', [[14, 59, 1000]])).toBe(1); expect(m1('mhalf', [[15, 0, 1000]])).toBe(0);
    expect(m1('mhalf', [[8, 0, 999]])).toBe(0); expect(m1('mhalf', [[8, 0, 1000]])).toBe(1);
    expect(m1('mhalf', [[8, 0, 750]], 1500)).toBe(1); expect(m1('mhalf', [[8, 0, 749]], 1500)).toBe(0);
    expect(m1('mhalf', [[8, 0, 600], [9, 0, 900, 'coffee']])).toBe(0);
    expect(M('mhalf').need).toBe(18);
    // a semana (whalf, da 1.10.0) segue a mesma regra, agora a partir da mesma conta
    expect(w1('whalf', [[14, 59, 1000]])).toBe(1); expect(w1('whalf', [[15, 0, 1000]])).toBe(0); expect(w1('whalf', [[8, 0, 999]])).toBe(0);
  });
  it('as regras novas só olham fatos que o dia já tem: um dia com a meta exata e nada a mais fecha todas (ninguém precisa de mais água do que a meta)', () => {
    const S = base(), k = d(0);
    S.days[k] = dayOf(k, 2000, [[8, 0, 250], [11, 0, 250], [12, 30, 250], [14, 0, 250], [17, 0, 250], [18, 0, 250], [19, 0, 250], [19, 30, 250]]); // 2.000 ml, 8 goles
    expect(S.days[k].entries.reduce((s, e) => s + e.ml, 0)).toBe(2000);
    ['wblocks', 'weve', 'wlunch', 'w8', 'whalf'].forEach((id) => { expect(week2(S, id, k).have, id).toBe(1); });
    ['mspread', 'mfirst', 'mhalf', 'meve'].forEach((id) => { expect(C.challengeState(S, M(id), '2026-06-01', '2026-06-30', k).have, id).toBe(1); });
  });
  it('cada desafio novo aparece na semana (ou no mês) certa, depois da estreia, mostra o andamento e fecha em challengesDue', () => {
    let mon = '2026-12-07', n = 0;
    while (C.weekGoal(base(), mon).c.id !== 'w8' && n++ < 60) mon = C.addDays(mon, 7);
    expect(C.weekGoal(base(), mon).c.id).toBe('w8');
    expect(mon >= '2026-12-07').toBe(true);
    const S = base(), many = (k, c) => { const l = []; for (let i = 0; i < c; i++) l.push([8, i * 3, 10]); return dayOf(k, 2000, l); };
    S.days[mon] = many(mon, 8);
    expect(C.weekGoal(S, C.addDays(mon, 2))).toMatchObject({ have: 1, need: 3, done: false, pct: 33, over: false });
    expect(C.challengesDue(S, C.addDays(mon, 2)).filter((x) => x.kind === 'w')).toEqual([]);
    S.days[C.addDays(mon, 1)] = many(C.addDays(mon, 1), 9); S.days[C.addDays(mon, 2)] = many(C.addDays(mon, 2), 8);
    expect(C.challengesDue(S, C.addDays(mon, 2)).filter((x) => x.kind === 'w').map((x) => x.key + ':' + x.c.id)).toEqual([mon + ':w8']);
    let q = '2027-01-10', i = 0;
    while (C.monthGoal(base(), q).c.id !== 'meve' && i++ < 40) q = C.addDays(q, 31);
    expect(C.monthGoal(base(), q).c.id).toBe('meve');
    expect(q >= '2027-01').toBe(true);
  });
});

/* ---------- 1.13.0: mais uma leva, com data de estreia ---------- */
describe('a leva da 1.13.0 não muda o passado: a foto das escolhas da 1.12.0', () => {
  // tests/fixtures/picks-1.12.0.json foi gerado com o core.js da 1.12.0, ANTES de a leva da 1.13.0 entrar: as listas de então (id de cada carta), as missões leve (e) e ousada (h) de cada dia de 16/11 a 20/12/2026 (35 dias),
  // o desafio de cada semana (w: de 23/11 a 14/12), o do mês (mo: dezembro de 2026 e janeiro de 2027) e o da turma de cada semana de 5/1 a 14/12/2026 (c). Cada letra é o índice (base 36) da carta na lista de então.
  // picks-1.11.0.json e picks-1.10.0.json guardam o que veio antes.
  const fx = JSON.parse(readFileSync(new URL('./fixtures/picks-1.12.0.json', import.meta.url), 'utf8'));
  const S = base(), at = (s, i) => parseInt(s.charAt(i), 36), Z2 = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  const dd = (n) => (n < 10 ? '0' : '') + n;
  const ymAt = (y0, m0, i) => { const n = y0 * 12 + (m0 - 1) + i; return Math.floor(n / 12) + '-' + dd((n % 12) + 1); }; // o mês y0-m0 mais i meses
  const firstAfter = (list, after) => list.filter((m) => m.since && m.since > after).map((m) => m.since).sort()[0];
  it('as listas da foto são o começo das listas de hoje (entrada nova só entra no fim)', () => {
    expect(C.MISSIONS_EASY.slice(0, fx.easy.length).map((m) => m.id)).toEqual(fx.easy);
    expect(C.MISSIONS_HARD.slice(0, fx.hard.length).map((m) => m.id)).toEqual(fx.hard);
    expect(C.WEEKLY.slice(0, fx.weekly.length).map((c) => c.id)).toEqual(fx.weekly);
    expect(C.MONTHLY.slice(0, fx.monthly.length).map((c) => c.id)).toEqual(fx.monthly);
    expect(C.CREW_CHALLENGES.slice(0, fx.crewIds.length).map((c) => c.id)).toEqual(fx.crewIds);
    expect([fx.easy.length, fx.hard.length, fx.weekly.length, fx.monthly.length, fx.crewIds.length]).toEqual([13, 14, 18, 16, 6]);
  });
  it('as missões de cada dia, de 16/11/2026 até a véspera da estreia das novas (20/12), saem como na 1.12.0 (35 dias)', () => {
    const bad = [];
    let i = 0;
    for (let k = fx.days.from; k <= fx.days.to; k = C.addDays(k, 1), i++) { const t = C.missionsOf(k); if (t.easy.id !== fx.easy[at(fx.days.e, i)] || t.hard.id !== fx.hard[at(fx.days.h, i)]) bad.push(k); }
    expect(bad).toEqual([]);
    expect([i, fx.days.e.length, fx.days.h.length]).toEqual([35, 35, 35]);
    expect(C.addDays(fx.days.to, 1)).toBe(firstAfter(C.MISSIONS_EASY.concat(C.MISSIONS_HARD), fx.days.to)); // a foto vai até a véspera da primeira estreia da 1.13.0
  });
  it('o desafio de cada semana (23/11 a 14/12), o do mês (dezembro e janeiro) e o da turma de cada semana de 2026 (até 14/12) saem como na 1.12.0', () => {
    const bad = [];
    let i = 0;
    for (let m = fx.weeks.from; m <= fx.weeks.to; m = C.addDays(m, 7), i++) if (C.weekGoal(S, m).c.id !== fx.weekly[at(fx.weeks.w, i)]) bad.push('semana ' + m);
    expect(i).toBe(4);
    expect(C.addDays(fx.weeks.to, 7)).toBe(firstAfter(C.WEEKLY, fx.weeks.to));
    for (let d2 = 1; d2 <= 31; d2++) {
      if (C.monthGoal(S, '2026-12-' + dd(d2)).c.id !== fx.monthly[at(fx.months.mo, 0)]) bad.push('mês 2026-12-' + dd(d2));
      if (C.monthGoal(S, '2027-01-' + dd(d2)).c.id !== fx.monthly[at(fx.months.mo, 1)]) bad.push('mês 2027-01-' + dd(d2));
    }
    expect([fx.months.from, fx.months.to, fx.months.mo.length]).toEqual(['2026-12', '2027-01', 2]);
    expect(firstAfter(C.MONTHLY, fx.months.to)).toBe('2027-02'); // janeiro de 2027 é o último mês da lista da 1.12.0
    i = 0;
    for (let m = fx.crew.from; m <= fx.crew.to; m = C.addDays(m, 7), i++) if (C.crewInfo(S, Z2, m, m).c.id !== fx.crewIds[at(fx.crew.c, i)]) bad.push('turma ' + m);
    expect(i).toBe(50);
    expect(C.addDays(fx.crew.to, 7)).toBe(firstAfter(C.CREW_CHALLENGES, fx.crew.to));
    expect(bad).toEqual([]);
  });
  it('depois da estreia o sorteio muda de verdade: a primeira volta da época nova traz todas as entradas, as novas também, cada uma uma vez só', () => {
    let newDays = 0;
    for (let i = 0, k = '2026-12-21'; i < 120; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); if (C.MISSIONS_EASY.indexOf(t.easy) >= fx.easy.length || C.MISSIONS_HARD.indexOf(t.hard) >= fx.hard.length) newDays++; }
    expect(newDays).toBeGreaterThan(20);
    const lap = (n, f) => { const out = []; for (let i = 0; i < n; i++) out.push(f(i)); return out.sort(); };
    const ids = (l) => l.map((c) => c.id).sort();
    // a época nova abre uma volta do zero: as 22 semanas (os 20 meses, as 10 semanas da turma) a partir da estreia trazem cada desafio da lista inteira uma vez
    expect(lap(C.WEEKLY.length, (i) => C.weekGoal(S, C.addDays('2026-12-21', i * 7)).c.id)).toEqual(ids(C.WEEKLY));
    expect(lap(C.MONTHLY.length, (i) => C.monthGoal(S, ymAt(2027, 2, i) + '-10').c.id)).toEqual(ids(C.MONTHLY));
    expect(lap(C.CREW_CHALLENGES.length, (i) => C.crewInfo(S, Z2, C.addDays('2026-12-21', i * 7), C.addDays('2026-12-21', i * 7)).c.id)).toEqual(ids(C.CREW_CHALLENGES));
    // e seguem as voltas seguintes: nenhum desafio sai duas vezes seguidas, também na virada da época (21/12 e fevereiro)
    const w = []; for (let i = -1; i < 60; i++) w.push(C.weekGoal(S, C.addDays('2026-12-21', i * 7)).c.id);
    for (let i = 1; i < w.length; i++) expect(w[i], 'semana ' + i).not.toBe(w[i - 1]);
    const c = []; for (let i = -1; i < 60; i++) c.push(C.crewInfo(S, Z2, C.addDays('2026-12-21', i * 7), C.addDays('2026-12-21', i * 7)).c.id);
    for (let i = 1; i < c.length; i++) expect(c[i], 'turma ' + i).not.toBe(c[i - 1]);
    const mo = []; for (let i = -1; i < 40; i++) mo.push(C.monthGoal(S, ymAt(2027, 2, i) + '-10').c.id);
    for (let i = 1; i < mo.length; i++) expect(mo[i], 'mês ' + i).not.toBe(mo[i - 1]);
  });
});

describe('a leva da 1.13.0: as datas de estreia', () => {
  const NEW = { easy: ['ehalf16', 'e2eve', 'emid'], hard: ['h13a', 'hhours8', 'hthree'], weekly: ['wlate', 'whalf13', 'wsnack', 'wbook'], monthly: ['mblocks', 'mlunch', 'm8', 'mbook'], crew: ['cgrow', 'cnear', 'cmid', 'crun'] };
  const LISTS = { easy: C.MISSIONS_EASY, hard: C.MISSIONS_HARD, weekly: C.WEEKLY, monthly: C.MONTHLY, crew: C.CREW_CHALLENGES };
  const sizes = { easy: 16, hard: 17, weekly: 22, monthly: 20, crew: 10 };
  it('as entradas novas são as últimas de cada lista (na ordem), e as listas têm o tamanho esperado', () => {
    Object.keys(NEW).forEach((x) => {
      const l = LISTS[x];
      expect(l.length, x).toBe(sizes[x]);
      expect(l.slice(l.length - NEW[x].length).map((m) => m.id), x).toEqual(NEW[x]);
    });
    Object.keys(LISTS).forEach((x) => { expect(new Set(LISTS[x].map((m) => m.id)).size, 'ids únicos em ' + x).toBe(LISTS[x].length); });
  });
  it('as missões do dia, os desafios da semana e os da turma estreiam na segunda-feira 21/12/2026 e os do mês em 1/2/2027 (duas semanas depois das da 1.12.0, e mais de três depois da publicação)', () => {
    ['easy', 'hard'].forEach((x) => NEW[x].forEach((id) => { expect(LISTS[x].filter((m) => m.id === id)[0].since, id).toBe('2026-12-21'); }));
    ['weekly', 'crew'].forEach((x) => NEW[x].forEach((id) => { const s = LISTS[x].filter((m) => m.id === id)[0].since; expect(s, id).toBe('2026-12-21'); expect(C.keyToDate(s).getDay(), id + ' estreia numa segunda-feira').toBe(1); }));
    NEW.monthly.forEach((id) => { expect(C.MONTHLY.filter((m) => m.id === id)[0].since, id).toBe('2027-02'); });
    expect('2026-12-21' >= C.addDays('2026-11-12', 21)).toBe(true); // a 1.13.0 foi feita em 12/11/2026
    expect('2026-12-21' > '2026-12-07' && '2027-02' > '2027-01').toBe(true); // depois das datas da 1.12.0
  });
  it('todas as listas seguem em ordem: sem data primeiro, depois as datas, da mais antiga para a mais nova (também a da turma, que agora tem três épocas depois da primeira)', () => {
    Object.keys(LISTS).forEach((x) => {
      const l = LISTS[x], flags = l.map((c) => (c.since ? 1 : 0)), sn = l.filter((c) => c.since).map((c) => c.since);
      expect(flags, x).toEqual(flags.slice().sort());
      expect(sn, x).toEqual(sn.slice().sort());
    });
    expect(Array.from(new Set(C.CREW_CHALLENGES.map((c) => c.since || ''))).sort()).toEqual(['', '2026-12-07', '2026-12-21']);
    expect(C.CREW_CHALLENGES.filter((c) => !c.since).map((c) => c.id)).toEqual(['ctotal', 'ccrowd', 'call', 'cweek']); // a primeira época da turma segue sendo a da 1.11.0, inteira
  });
  it('um dia antes da estreia só existem as listas da 1.12.0; no dia da estreia as novas já podem sair (as 6 missões novas saem em 300 dias, e cada desafio novo da semana, do mês e da turma na primeira volta)', () => {
    const S = base(), Z2 = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]], seen = {};
    for (let i = 0, k = '2026-11-16'; i < 35; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); expect(NEW.easy.indexOf(t.easy.id) < 0 && NEW.hard.indexOf(t.hard.id) < 0, k).toBe(true); }
    for (let i = 0, m = '2026-11-23'; i < 4; i++, m = C.addDays(m, 7)) { expect(NEW.weekly.indexOf(C.weekGoal(S, m).c.id), 'semana ' + m).toBe(-1); expect(NEW.crew.indexOf(C.crewInfo(S, Z2, m, m).c.id), 'turma ' + m).toBe(-1); }
    expect(NEW.monthly.indexOf(C.monthGoal(S, '2027-01-31').c.id)).toBe(-1);
    expect(NEW.monthly.indexOf(C.monthGoal(S, '2026-12-01').c.id)).toBe(-1);
    for (let i = 0, k = '2026-12-21'; i < 300; i++, k = C.addDays(k, 1)) { const t = C.missionsOf(k); seen[t.easy.id] = 1; seen[t.hard.id] = 1; }
    NEW.easy.concat(NEW.hard).forEach((id) => { expect(seen[id], id).toBe(1); });
    const wk = {}, cr = {}, mo = {};
    for (let i = 0; i < 22; i++) wk[C.weekGoal(S, C.addDays('2026-12-21', i * 7)).c.id] = 1;
    for (let i = 0; i < 10; i++) cr[C.crewInfo(S, Z2, C.addDays('2026-12-21', i * 7), C.addDays('2026-12-21', i * 7)).c.id] = 1;
    for (let i = 0; i < 20; i++) { const n = 2027 * 12 + 1 + i; mo[C.monthGoal(S, Math.floor(n / 12) + '-' + ((n % 12) + 1 < 10 ? '0' : '') + ((n % 12) + 1) + '-10').c.id] = 1; }
    NEW.weekly.forEach((id) => { expect(wk[id], id).toBe(1); });
    NEW.crew.forEach((id) => { expect(cr[id], id).toBe(1); });
    NEW.monthly.forEach((id) => { expect(mo[id], id).toBe(1); });
  });
  it('a virada de época: a primeira semana, o primeiro mês e a primeira semana da turma da lista maior nunca repetem o desafio do tempo anterior', () => {
    const S = base(), Z2 = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
    expect(C.weekGoal(S, '2026-12-21').c.id).not.toBe(C.weekGoal(S, '2026-12-14').c.id);
    expect(C.monthGoal(S, '2027-02-10').c.id).not.toBe(C.monthGoal(S, '2027-01-10').c.id);
    expect(C.crewInfo(S, Z2, '2026-12-21', '2026-12-21').c.id).not.toBe(C.crewInfo(S, Z2, '2026-12-14', '2026-12-14').c.id);
  });
});

describe('as missões novas da 1.13.0: o andamento de cada uma, nos limites', () => {
  const E = {}, H = {};
  C.MISSIONS_EASY.forEach((m) => { E[m.id] = m; });
  C.MISSIONS_HARD.forEach((m) => { H[m.id] = m; });
  const k = '2026-06-10';
  const one = (h, m, dk, ml) => es(k, [[h, m, ml || 100, dk]]);
  const hrs = (n, from) => { const l = []; for (let i = 0; i < n; i++) l.push([(from || 6) + i, 0, 100]); return l; }; // n gotas, cada uma numa hora diferente
  it('Chegue à metade da meta antes das 16h: 15h59 conta, 16h00 não; 1.000 de 2.000 ml fecha e 999 não; segue a meta do dia (450 de 900, 250 de 500) e os outros líquidos só com "somar"', () => {
    expect(E.ehalf16.p(es(k, [[15, 59, 1000]]), 2000)).toBeGreaterThanOrEqual(1);
    expect(E.ehalf16.p(es(k, [[16, 0, 1000]]), 2000)).toBe(0);
    expect(E.ehalf16.p(es(k, [[8, 0, 999]]), 2000)).toBeLessThan(1);
    expect(E.ehalf16.p(es(k, [[8, 0, 450]]), 900)).toBeCloseTo(1);
    expect(E.ehalf16.p(es(k, [[8, 0, 250]]), 500)).toBeGreaterThanOrEqual(1); // meta mínima: a metade são 250 ml, nunca mais do que a meta
    expect(E.ehalf16.p(es(k, [[8, 0, 249]]), 500)).toBeLessThan(1);
    expect(E.ehalf16.p(es(k, [[8, 0, 500], [9, 0, 800, 'coffee']]), 2000)).toBeCloseTo(0.5); // o café sem "somar" não conta
    C.setMix(true);
    expect(E.ehalf16.p(es(k, [[8, 0, 600], [9, 0, 500, 'coffee']]), 2000)).toBeGreaterThanOrEqual(1);
    expect(E.ehalf16.p([], 2000)).toBe(0);
  });
  it('Beba água 2 vezes à noite, depois das 18h: 17h59 não conta, 18h00 e 23h59 contam; são goles (dois na mesma hora valem dois); chá não', () => {
    expect(E.e2eve.p(es(k, [[18, 0, 100], [23, 59, 100]]), 2000)).toBe(1);
    expect(E.e2eve.p(es(k, [[17, 59, 100], [18, 0, 100]]), 2000)).toBeCloseTo(0.5); // 17h59 ainda é de tarde
    expect(E.e2eve.p(es(k, [[18, 0, 100], [18, 1, 100]]), 2000)).toBe(1); // dois goles na mesma hora valem dois
    expect(E.e2eve.p(es(k, [[18, 0, 100], [20, 0, 300, 'tea']]), 2000)).toBeCloseTo(0.5);
    expect(E.e2eve.p(es(k, [[18, 0, 100], [20, 0, 300, 'sparkling']]), 2000)).toBe(1);
    expect(E.e2eve.p(es(k, [[18, 0, 100], [19, 0, 100], [20, 0, 100]]), 2000)).toBeGreaterThan(1);
    expect(E.e2eve.p(es(k, [[8, 0, 100], [9, 0, 100]]), 2000)).toBe(0); // de manhã não vale
    expect(E.e2eve.p([], 2000)).toBe(0);
  });
  it('Beba água no meio da manhã, entre 9h e 11h: 8h59 não conta, 9h00 e 10h59 contam, 11h00 não; café não', () => {
    expect(E.emid.p(one(8, 59), 2000)).toBe(0); expect(E.emid.p(one(9, 0), 2000)).toBe(1);
    expect(E.emid.p(one(10, 59), 2000)).toBe(1); expect(E.emid.p(one(11, 0), 2000)).toBe(0);
    expect(E.emid.p(one(10, 0, 'coffee'), 2000)).toBe(0);
    expect(E.emid.p(es(k, [[9, 0, 100], [10, 0, 100]]), 2000)).toBe(1); // vale uma vez, por mais goles que haja
    expect(E.emid.p([], 2000)).toBe(0);
  });
  it('Chegue a um terço da meta antes das 10h: 9h59 conta, 10h00 não; 667 de 2.000 ml fecha e 666 não; segue a meta do dia (300 de 900; 167 de 500) e os outros líquidos só com "somar"', () => {
    expect(H.h13a.p(es(k, [[9, 59, 667]]), 2000)).toBeGreaterThanOrEqual(1);
    expect(H.h13a.p(es(k, [[10, 0, 667]]), 2000)).toBe(0);
    expect(H.h13a.p(es(k, [[8, 0, 666]]), 2000)).toBeLessThan(1);
    expect(H.h13a.p(es(k, [[8, 0, 300]]), 900)).toBeCloseTo(1);
    expect(H.h13a.p(es(k, [[8, 0, 167]]), 500)).toBeGreaterThanOrEqual(1); // meta mínima de 500 ml: um terço são 166,7 e 167 ml já fecham
    expect(H.h13a.p(es(k, [[8, 0, 166]]), 500)).toBeLessThan(1);
    expect(H.h13a.p(es(k, [[8, 0, 400], [9, 0, 400, 'coffee']]), 2000)).toBeCloseTo(0.6); // o café sem "somar" não conta (400 de 666,7)
    C.setMix(true);
    expect(H.h13a.p(es(k, [[8, 0, 400], [9, 0, 400, 'coffee']]), 2000)).toBeGreaterThanOrEqual(1);
    expect(H.h13a.p([], 2000)).toBe(0);
  });
  it('Beba água em 8 horários diferentes: 8 fecham e 7 não; vale de 0h a 23h, a mesma hora vale uma vez e o chá não conta', () => {
    expect(H.hhours8.p(es(k, hrs(8)), 2000)).toBe(1);
    expect(H.hhours8.p(es(k, hrs(7)), 2000)).toBeCloseTo(7 / 8);
    expect(H.hhours8.p(es(k, hrs(9)), 2000)).toBeGreaterThan(1);
    expect(H.hhours8.p(es(k, [[0, 0, 100], [1, 0, 100], [2, 0, 100], [3, 0, 100], [4, 0, 100], [5, 0, 100], [6, 0, 100], [23, 59, 100]]), 2000)).toBe(1); // 0h e 23h contam
    expect(H.hhours8.p(es(k, hrs(7).concat([[6, 15, 100], [6, 30, 100]])), 2000)).toBeCloseTo(7 / 8); // dois goles na mesma hora são um horário
    expect(H.hhours8.p(es(k, hrs(7).concat([[20, 0, 300, 'tea']])), 2000)).toBeCloseTo(7 / 8);
    expect(H.hhours8.p(es(k, [[8, 59, 100], [9, 0, 100]]), 2000)).toBeCloseTo(2 / 8); // 8h59 e 9h00 são horas diferentes
    expect(H.hhours8.p([], 2000)).toBe(0);
  });
  it('Beba água antes das 10h, no almoço e depois das 18h: três janelas (0h–10h, 11h–15h e 18h–24h), uma gota em cada; 10h00, 10h59, 15h00 e 17h59 ficam de fora', () => {
    expect(H.hthree.p(es(k, [[9, 59, 100], [11, 0, 100], [18, 0, 100]]), 2000)).toBe(1);
    expect(H.hthree.p(es(k, [[0, 0, 100], [14, 59, 100], [23, 59, 100]]), 2000)).toBe(1); // o primeiro e o último minuto de cada janela
    expect(H.hthree.p(es(k, [[10, 0, 100], [10, 59, 100], [15, 0, 100], [17, 59, 100]]), 2000)).toBe(0); // entre as janelas não vale
    expect(H.hthree.p(es(k, [[8, 0, 100], [12, 0, 100]]), 2000)).toBeCloseTo(2 / 3);
    expect(H.hthree.p(es(k, [[8, 0, 100], [8, 30, 100], [9, 0, 100]]), 2000)).toBeCloseTo(1 / 3); // muita água numa janela só vale uma
    expect(H.hthree.p(es(k, [[9, 0, 300, 'tea'], [12, 0, 100], [19, 0, 100]]), 2000)).toBeCloseTo(2 / 3); // chá não é água
    expect(H.hthree.p([], 2000)).toBe(0);
  });
  it('as seis fecham com o dia na meta exata e nenhum ml a mais (ninguém precisa beber mais do que a meta para cumprir uma missão), com entradas de água em horários de gente de verdade', () => {
    const day = es(k, [[8, 0, 500], [9, 30, 400], [11, 0, 300], [12, 0, 200], [13, 0, 150], [15, 30, 100], [18, 0, 100], [19, 0, 150], [20, 0, 100]]); // soma 2.000
    expect(day.reduce((s, e) => s + e.ml, 0)).toBe(2000);
    ['ehalf16', 'e2eve', 'emid'].forEach((id) => { expect(E[id].p(day, 2000), id).toBeGreaterThanOrEqual(1); });
    ['h13a', 'hhours8', 'hthree'].forEach((id) => { expect(H[id].p(day, 2000), id).toBeGreaterThanOrEqual(1); });
    // e com a meta mínima de 500 ml (Ajustes aceita de 500): as de quantidade fecham ao chegar na meta
    expect(E.ehalf16.p(es(k, [[8, 0, 500]]), 500)).toBeGreaterThanOrEqual(1);
    expect(H.h13a.p(es(k, [[8, 0, 500]]), 500)).toBeGreaterThanOrEqual(1);
  });
});

describe('os desafios novos da 1.13.0: o limite de cada regra', () => {
  const week2 = (S, id, today) => C.challengeState(S, W(id), MON, SUN, today || SUN);
  const month = (S, id, today) => C.challengeState(S, M(id), '2026-06-01', '2026-06-30', today || '2026-06-30');
  const w1 = (id, list, g) => week2(stateWith({ [d(0)]: dayOf(d(0), g || 2000, list) }), id).have; // 1 se o dia (a segunda) conta
  const m1 = (id, list, g) => month(stateWith({ '2026-06-05': dayOf('2026-06-05', g || 2000, list) }), id).have;
  const four = [[8, 0, 100], [11, 0, 100], [14, 0, 100], [17, 0, 100]];
  it('Meta antes das 20h (semana: 5 dias): a meta batida às 19h59 conta e às 20h00 não; 1.999 ml não fecha; vale a meta do dia; chá não entra', () => {
    expect(w1('wlate', [[19, 59, 2000]])).toBe(1); expect(w1('wlate', [[20, 0, 2000]])).toBe(0);
    expect(w1('wlate', [[19, 59, 1999]])).toBe(0);
    expect(w1('wlate', [[10, 0, 1000], [19, 59, 1000]])).toBe(1); expect(w1('wlate', [[10, 0, 1000], [20, 0, 1000]])).toBe(0);
    expect(w1('wlate', [[19, 0, 1500]], 1500)).toBe(1); expect(w1('wlate', [[10, 0, 1500], [19, 0, 500, 'tea']])).toBe(0);
    expect(w1('wlate', [])).toBe(0); expect(week2(base(), 'wlate').have).toBe(0);
    expect(W('wlate').need).toBe(5);
  });
  it('Metade até as 13h (semana: 3 dias): a metade da meta do próprio dia antes das 13h (12h59 conta, 13h00 não; 999 de 2.000 não, 1.000 sim; meta de 1.500: 750)', () => {
    expect(w1('whalf13', [[12, 59, 1000]])).toBe(1); expect(w1('whalf13', [[13, 0, 1000]])).toBe(0);
    expect(w1('whalf13', [[8, 0, 999]])).toBe(0); expect(w1('whalf13', [[8, 0, 1000]])).toBe(1);
    expect(w1('whalf13', [[8, 0, 750]], 1500)).toBe(1); expect(w1('whalf13', [[8, 0, 749]], 1500)).toBe(0);
    expect(w1('whalf13', [[8, 0, 600], [9, 0, 900, 'coffee']])).toBe(0);
    expect(w1('whalf13', [])).toBe(0);
    expect(W('whalf13').need).toBe(3);
  });
  it('Água no lanche (semana: 5 dias): água entre 15h e 17h (14h59 e 17h00 não contam, 15h00 e 16h59 contam; café não)', () => {
    expect(w1('wsnack', [[14, 59, 100]])).toBe(0); expect(w1('wsnack', [[15, 0, 100]])).toBe(1);
    expect(w1('wsnack', [[16, 59, 100]])).toBe(1); expect(w1('wsnack', [[17, 0, 100]])).toBe(0);
    expect(w1('wsnack', [[16, 0, 200, 'coffee']])).toBe(0); expect(w1('wsnack', [])).toBe(0);
    expect(W('wsnack').need).toBe(5);
  });
  it('Começo e fim do dia (semana: 4 dias; mês: 15): água antes das 10h e depois das 18h no mesmo dia (9h59 e 18h00 contam; 10h00 e 17h59 não; só um dos lados não fecha; chá não)', () => {
    [['wbook', w1], ['mbook', m1]].forEach((p) => {
      const id = p[0], f = p[1];
      expect(f(id, [[9, 59, 100], [18, 0, 100]]), id).toBe(1); expect(f(id, [[0, 0, 100], [23, 59, 100]]), id).toBe(1);
      expect(f(id, [[10, 0, 100], [18, 0, 100]]), id).toBe(0); expect(f(id, [[9, 59, 100], [17, 59, 100]]), id).toBe(0);
      expect(f(id, [[8, 0, 100], [9, 0, 100]]), id).toBe(0); expect(f(id, [[19, 0, 100], [20, 0, 100]]), id).toBe(0); // só um dos lados
      expect(f(id, [[9, 0, 100], [20, 0, 300, 'tea']]), id).toBe(0); expect(f(id, [[9, 0, 300, 'coffee'], [20, 0, 100]]), id).toBe(0);
      expect(f(id, []), id).toBe(0);
    });
    expect(week2(base(), 'wbook').have).toBe(0);
    expect([W('wbook').need, M('mbook').need]).toEqual([4, 15]);
  });
  it('Água a cada 3 horas (mês: 12 dias): as mesmas quatro janelas de 3 h entre 8h e 20h da semana; 7h59 e 20h00 ficam de fora', () => {
    expect(m1('mblocks', four)).toBe(1);
    expect(m1('mblocks', four.slice(0, 3))).toBe(0);
    expect(m1('mblocks', [[10, 59, 100], [13, 59, 100], [16, 59, 100], [19, 59, 100]])).toBe(1); // o último minuto de cada janela
    expect(m1('mblocks', [[10, 59, 100], [11, 0, 100], [14, 0, 100]])).toBe(0);
    expect(m1('mblocks', [[7, 59, 100], [11, 0, 100], [14, 0, 100], [17, 0, 100]])).toBe(0);
    expect(m1('mblocks', [[8, 0, 100], [11, 0, 100], [14, 0, 100], [20, 0, 100]])).toBe(0);
    expect(m1('mblocks', [[8, 0, 100], [11, 0, 100], [14, 0, 100], [17, 0, 300, 'tea']])).toBe(0);
    expect(m1('mblocks', [])).toBe(0);
    expect(month(base(), 'mblocks').have).toBe(0);
    expect(M('mblocks').need).toBe(12);
  });
  it('Água no almoço (mês: 20 dias): água entre 11h e 15h (10h59 e 15h00 não contam, 11h00 e 14h59 contam; café não)', () => {
    expect(m1('mlunch', [[10, 59, 100]])).toBe(0); expect(m1('mlunch', [[11, 0, 100]])).toBe(1);
    expect(m1('mlunch', [[14, 59, 100]])).toBe(1); expect(m1('mlunch', [[15, 0, 100]])).toBe(0);
    expect(m1('mlunch', [[12, 30, 200, 'coffee']])).toBe(0); expect(m1('mlunch', [])).toBe(0);
    expect(M('mlunch').need).toBe(20);
  });
  it('Oito goles por dia (mês: 12 dias): 8 registros de água (7 não; chá e café não contam; goles de qualquer tamanho valem um)', () => {
    const n = (c, extra) => { const l = []; for (let i = 0; i < c; i++) l.push([8, i * 3, 10]); return l.concat(extra || []); };
    expect(m1('m8', n(8))).toBe(1); expect(m1('m8', n(7))).toBe(0);
    expect(m1('m8', n(7, [[20, 0, 300, 'tea']]))).toBe(0); expect(m1('m8', n(7, [[20, 0, 300, 'sparkling']]))).toBe(1);
    expect(m1('m8', n(12))).toBe(1);
    expect(M('m8').need).toBe(12);
  });
  it('as regras novas só olham fatos que o dia já tem: um dia com a meta exata e nada a mais fecha todas (ninguém precisa de mais água do que a meta)', () => {
    const S = base(), k = d(0);
    S.days[k] = dayOf(k, 2000, [[8, 0, 250], [9, 30, 250], [11, 0, 250], [12, 30, 250], [14, 0, 250], [16, 0, 250], [18, 0, 250], [19, 30, 250]]); // 2.000 ml, 8 goles
    expect(S.days[k].entries.reduce((s, e) => s + e.ml, 0)).toBe(2000);
    ['wlate', 'whalf13', 'wsnack', 'wbook'].forEach((id) => { expect(week2(S, id, k).have, id).toBe(1); });
    ['mblocks', 'mlunch', 'm8', 'mbook'].forEach((id) => { expect(C.challengeState(S, M(id), '2026-06-01', '2026-06-30', k).have, id).toBe(1); });
  });
  it('cada desafio novo aparece na semana (ou no mês) certa, depois da estreia, mostra o andamento e fecha em challengesDue', () => {
    let mon = '2026-12-21', n = 0;
    while (C.weekGoal(base(), mon).c.id !== 'wsnack' && n++ < 60) mon = C.addDays(mon, 7);
    expect(C.weekGoal(base(), mon).c.id).toBe('wsnack');
    expect(mon >= '2026-12-21').toBe(true);
    const S = base(), snack = (k) => dayOf(k, 2000, [[16, 0, 200]]);
    S.days[mon] = snack(mon);
    expect(C.weekGoal(S, C.addDays(mon, 2))).toMatchObject({ have: 1, need: 5, done: false, pct: 20, over: false });
    expect(C.challengesDue(S, C.addDays(mon, 2)).filter((x) => x.kind === 'w')).toEqual([]);
    for (let i = 1; i < 5; i++) S.days[C.addDays(mon, i)] = snack(C.addDays(mon, i));
    expect(C.challengesDue(S, C.addDays(mon, 4)).filter((x) => x.kind === 'w').map((x) => x.key + ':' + x.c.id)).toEqual([mon + ':wsnack']);
    let y = 2027, mo = 2, i = 0;
    const key = () => y + '-' + (mo < 10 ? '0' : '') + mo;
    while (C.monthGoal(base(), key() + '-10').c.id !== 'm8' && i++ < 40) { mo++; if (mo > 12) { mo = 1; y++; } }
    expect(C.monthGoal(base(), key() + '-10').c.id).toBe('m8');
    const T = base(), gulps = (k) => { const l = []; for (let j = 0; j < 8; j++) l.push([8, j * 3, 10]); return dayOf(k, 2000, l); };
    for (let j = 1; j <= 11; j++) T.days[key() + '-' + (j < 10 ? '0' : '') + j] = gulps(key() + '-' + (j < 10 ? '0' : '') + j);
    expect(C.challengesDue(T, key() + '-20').filter((x) => x.kind === 'm')).toEqual([]);
    T.days[key() + '-12'] = gulps(key() + '-12');
    expect(C.challengesDue(T, key() + '-20').filter((x) => x.kind === 'm').map((x) => x.key + ':' + x.c.id)).toEqual([key() + ':m8']);
  });
});
