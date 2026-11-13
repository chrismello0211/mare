// Maré — testes do desafio do mês da turma (1.13.0): as quatro regras (Maré do mês, Turma firme, Quase todos a bordo e Ritmo forte), a conta do mês (crewMonthInfo), os campos novos do perfil (mm e mp),
// o que cada amigo conta (monthOf), quem entra (crewMonthCounts), o que vence (crewMonthGoal e crewMonthDue) e que a vitória do mês não vira medalha. Rodar: npm test
// As datas são fixas (2026 a 2028) e os horários, locais: valem em qualquer fuso. A tela (a linha em Amigos, a festa) é conferida em tests/e2e-crew-challenge.spec.js.
import { describe, it, expect } from 'vitest';
import * as C from '../public/js/core.js';
import * as SO from '../public/js/social.js';

const U = (n) => n + 'x'.repeat(28 - n.length);
const ts = (k, h, m) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); };
const Y = (id) => C.CREW_MONTHLY.filter((c) => c.id === id)[0];
const S0 = () => C.defaults(1);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymAt = (i) => { const n = 2026 * 12 + 11 + i; return Math.floor(n / 12) + '-' + pad((n % 12) + 1); }; // i = 0 é dezembro de 2026, o primeiro mês com desafio
const daysOf = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const ymOf = (id) => { for (let i = 0; i < 12; i++) if (C.crewMonthInfo(S0(), [0, 0], ymAt(i), ymAt(i) + '-15').c.id === id) return ymAt(i); throw new Error('sem o mês de ' + id); };
// a conta de n pessoas: as k primeiras com `hi` dias na meta e as outras com `lo`
const people = (n, k, hi, lo) => { const out = []; for (let i = 0; i < n; i++) out.push(i < k ? hi : lo); return out; };
// os limites de cada regra por tamanho do mês (58%, 55%, 45% e 65% dos dias, arredondados) e o nome da coluna de cada regra
const TH = { 28: { total: 16, most: 15, near: 13, half: 18 }, 29: { total: 17, most: 16, near: 13, half: 19 }, 30: { total: 17, most: 17, near: 14, half: 20 }, 31: { total: 18, most: 17, near: 14, half: 20 } };
const COL = { mtotal: 'total', mmost: 'most', mnear: 'near', mhalf: 'half' };
const most = (n) => Math.max(2, Math.ceil(n * 0.6));
const near = (n) => Math.max(2, Math.ceil((n * 3) / 4));
const half = (n) => Math.max(2, Math.ceil(n / 2));
// o app de quem olha: meta manual de 2.000 ml; days = { dia: { goal, entries } }
function state(o) {
  o = o || {};
  const S = C.defaults(1);
  S.onboarded = true;
  S.goal.mode = 'manual'; S.goal.manual = 2000;
  S.days = o.days || {};
  S.social = Object.assign({ on: true, nick: 'Eu', share: true, code: '' }, o.social);
  return S;
}
const hit = () => ({ goal: 2000, entries: [{ id: 'a', t: 1, ml: 2000, d: 'water' }] }); // 2.000 ml: meta batida
// meus dias do mês ym em que bati a meta: os `n` primeiros dias do mês (ou a lista de dias, se vier uma)
const mine = (ym, n) => { const d = {}; (Array.isArray(n) ? n : Array.from({ length: n }, (_, i) => i + 1)).forEach((i) => { d[ym + '-' + pad(i)] = hit(); }); return d; };
// um amigo como o cleanFriend entrega
const fm = (n, o) => Object.assign({ uid: U('amigo' + n), nm: 'Amigo ' + n, mc: 'peixe', pct: 0, met: false, st: 0, day: '', sh: true, gl: null, wm: 0, md: 0, md2: 0, mm: null, mp: null }, o);

/* ---------- as quatro regras ---------- */
describe('desafio do mês da turma: a lista e as quatro regras, no limite', () => {
  it('a lista é um contrato (ids, emoji, título e unidade na ordem); o texto muda com a turma e com os dias do mês e cabe numa linha curta; nenhuma tem data de estreia', () => {
    expect(C.CREW_MONTHLY.map((c) => c.id)).toEqual(['mtotal', 'mmost', 'mnear', 'mhalf']);
    expect(C.CREW_MONTHLY.map((c) => c.e)).toEqual(['🌊', '⚓', '🚢', '💪']);
    expect(C.CREW_MONTHLY.map((c) => c.t)).toEqual(['Maré do mês', 'Turma firme', 'Quase todos a bordo', 'Ritmo forte']);
    expect(C.CREW_MONTHLY.map((c) => c.unit)).toEqual(['metas', 'pessoas', 'pessoas', 'pessoas']);
    C.CREW_MONTHLY.forEach((c) => {
      expect(typeof c.d === 'function' && typeof c.calc === 'function', c.id).toBe(true);
      expect(c.since, c.id).toBeUndefined(); // as quatro valem desde a estreia do desafio do mês (CREW_MONTH_FROM)
      for (let n = 2; n <= 31; n++) for (let D = 28; D <= 31; D++) { const t = c.d(n, D); expect(typeof t, c.id + ' ' + n + ' ' + D).toBe('string'); expect(t.length, c.id + ' ' + n + ' ' + D).toBeLessThan(110); expect(t, c.id + ' ' + n + ' ' + D).not.toMatch(/undefined|NaN|\[object/); }
    });
    expect([C.CREW_MONTH_FROM, C.CREW_MONTH_MINE]).toEqual(['2026-12', 4]);
  });
  it('os limites são frações dos dias do mês (58%, 55%, 45% e 65%, arredondados): 28, 29, 30 e 31 dias dão a tabela, e o texto diz os mesmos números', () => {
    [28, 29, 30, 31].forEach((D) => {
      const t = TH[D];
      expect(Y('mtotal').d(3, D), 'mtotal ' + D).toBe('Juntos, a turma bate a meta ' + 3 * t.total + ' vezes neste mês: ' + t.total + ' por pessoa, em média');
      expect(Y('mtotal').d(10, D)).toBe('Juntos, a turma bate a meta ' + 10 * t.total + ' vezes neste mês: ' + t.total + ' por pessoa, em média');
      expect(Y('mmost').d(2, D), 'mmost ' + D).toBe('As 2 pessoas batem a meta em pelo menos ' + t.most + ' dias deste mês');
      expect(Y('mmost').d(4, D)).toBe('Pelo menos 3 das 4 pessoas batem a meta em pelo menos ' + t.most + ' dias deste mês');
      expect(Y('mnear').d(3, D), 'mnear ' + D).toBe('Cada pessoa da turma bate a meta em pelo menos ' + t.near + ' dias deste mês');
      expect(Y('mnear').d(4, D)).toBe('Pelo menos 3 das 4 pessoas batem a meta em pelo menos ' + t.near + ' dias deste mês');
      expect(Y('mhalf').d(2, D), 'mhalf ' + D).toBe('As 2 pessoas batem a meta em pelo menos ' + t.half + ' dias deste mês');
      expect(Y('mhalf').d(5, D)).toBe('Pelo menos 3 das 5 pessoas batem a meta em pelo menos ' + t.half + ' dias deste mês');
      [2, 3, 7, 12, 31].forEach((n) => {
        expect(Y('mmost').d(n, D), 'mmost ' + n).toBe(most(n) === n ? 'As ' + n + ' pessoas batem a meta em pelo menos ' + t.most + ' dias deste mês' : 'Pelo menos ' + most(n) + ' das ' + n + ' pessoas batem a meta em pelo menos ' + t.most + ' dias deste mês');
        expect(Y('mnear').d(n, D), 'mnear ' + n).toBe((near(n) === n ? 'Cada pessoa da turma bate' : 'Pelo menos ' + near(n) + ' das ' + n + ' pessoas batem') + ' a meta em pelo menos ' + t.near + ' dias deste mês');
        expect(Y('mhalf').d(n, D), 'mhalf ' + n).toBe((half(n) === n ? 'As ' + n + ' pessoas batem' : 'Pelo menos ' + half(n) + ' das ' + n + ' pessoas batem') + ' a meta em pelo menos ' + t.half + ' dias deste mês');
      });
    });
  });
  it('Maré do mês: a média da turma (a soma dos dias de todos contra n × o pedido); um sozinho não leva a turma, mas dois que compensam um ao outro levam', () => {
    const r = Y('mtotal');
    [28, 29, 30, 31].forEach((D) => {
      const per = TH[D].total;
      [2, 3, 5, 10, 31].forEach((n) => {
        expect(r.calc(people(n, n, per, per), D), D + ' dias, ' + n + ' pessoas').toEqual({ have: n * per, need: n * per });
        expect(r.calc(people(n, n - 1, per, per - 1), D), D + ' dias, ' + n + ' pessoas, 1 dia a menos').toEqual({ have: n * per - 1, need: n * per });
        expect(r.calc(people(n, n, 0, 0), D), 'turma parada').toEqual({ have: 0, need: n * per });
      });
    });
    expect(r.calc([30, 4], 30)).toEqual({ have: 34, need: 34 }); // um com o mês cheio compensa o outro com 4 dias: é a média da turma
    expect(r.calc([30, 3], 30)).toEqual({ have: 33, need: 34 });
    expect(r.calc([30, 0, 0], 30)).toEqual({ have: 30, need: 51 }); // um sozinho, numa turma de 3, não basta
    expect(r.calc([31, 31, 31, 31, 31, 0, 0, 0, 0, 0], 31)).toEqual({ have: 155, need: 180 }); // metade da turma com o mês cheio não é a média pedida
    expect(r.unit).toBe('metas');
  });
  it('Turma firme: a maior parte da turma (60%, pelo menos 2) bate a meta em pelo menos 55% dos dias do mês (28, 29, 30 e 31 dias), em qualquer tamanho de turma', () => {
    const r = Y('mmost');
    [28, 29, 30, 31].forEach((D) => {
      const k = TH[D].most;
      for (let n = 2; n <= 40; n++) {
        const m = most(n);
        expect(r.calc(people(n, m, k, 0), D), D + ' dias, ' + n + ' pessoas, ' + m + ' no limite').toEqual({ have: m, need: m });
        expect(r.calc(people(n, m - 1, k, 0), D), D + ' dias, ' + n + ' pessoas, ' + (m - 1) + ' no limite').toEqual({ have: m - 1, need: m });
        expect(r.calc(people(n, m, k - 1, 0), D), D + ' dias, ' + n + ' pessoas, 1 dia a menos').toEqual({ have: 0, need: m }); // um dia a menos que o limite não vale
        expect(r.calc(people(n, n, D, D), D), 'todos com o mês cheio').toEqual({ have: n, need: m });
      }
    });
    expect(r.unit).toBe('pessoas');
  });
  it('Quase todos a bordo: 3 de cada 4 pessoas (todas, numa turma de 2 ou 3) batem a meta em pelo menos 45% dos dias do mês (28, 29, 30 e 31 dias), em qualquer tamanho de turma', () => {
    const r = Y('mnear');
    [28, 29, 30, 31].forEach((D) => {
      const k = TH[D].near;
      for (let n = 2; n <= 40; n++) {
        const m = near(n);
        expect(m <= n, n + ' pessoas').toBe(true);
        expect(r.calc(people(n, m, k, 0), D), D + ' dias, ' + n + ' pessoas, ' + m + ' no limite').toEqual({ have: m, need: m });
        expect(r.calc(people(n, m - 1, k, 0), D), D + ' dias, ' + n + ' pessoas, ' + (m - 1) + ' no limite').toEqual({ have: m - 1, need: m });
        expect(r.calc(people(n, m, k - 1, 0), D), D + ' dias, ' + n + ' pessoas, 1 dia a menos').toEqual({ have: 0, need: m });
        expect(r.calc(people(n, n, D, D), D), 'todos com o mês cheio').toEqual({ have: n, need: m });
      }
    });
    expect(r.unit).toBe('pessoas');
  });
  it('Ritmo forte: metade da turma (pelo menos 2) bate a meta em pelo menos 65% dos dias do mês (28, 29, 30 e 31 dias), em qualquer tamanho de turma', () => {
    const r = Y('mhalf');
    [28, 29, 30, 31].forEach((D) => {
      const k = TH[D].half;
      for (let n = 2; n <= 40; n++) {
        const m = half(n);
        expect(m <= n, n + ' pessoas').toBe(true);
        expect(r.calc(people(n, m, k, 0), D), D + ' dias, ' + n + ' pessoas, ' + m + ' no limite').toEqual({ have: m, need: m });
        expect(r.calc(people(n, m - 1, k, 0), D), D + ' dias, ' + n + ' pessoas, ' + (m - 1) + ' no limite').toEqual({ have: m - 1, need: m });
        expect(r.calc(people(n, m, k - 1, 0), D), D + ' dias, ' + n + ' pessoas, 1 dia a menos').toEqual({ have: 0, need: m });
        expect(r.calc(people(n, n, D, D), D), 'todos com o mês cheio').toEqual({ have: n, need: m });
      }
    });
    expect(r.unit).toBe('pessoas');
  });
  it('nenhuma regra fecha antes do dia 13: até lá ninguém passa de 12 dias na meta e o menor pedido (45% de um mês de 28 ou 29 dias) são 13', () => {
    for (let n = 2; n <= 40; n++) [28, 29, 30, 31].forEach((D) => {
      const g = people(n, n, 12, 12);
      C.CREW_MONTHLY.forEach((c) => { const x = c.calc(g, D); expect(x.have < x.need, c.id + ' com ' + n + ' pessoas e ' + D + ' dias: ' + x.have + ' de ' + x.need).toBe(true); });
    });
    // o primeiro dia possível é o 13, para uma regra só e só em meses de 28 e 29 dias
    expect(Y('mnear').calc(people(2, 2, 13, 13), 28)).toEqual({ have: 2, need: 2 });
    expect(Y('mnear').calc(people(2, 2, 13, 13), 29)).toEqual({ have: 2, need: 2 });
    expect(Y('mnear').calc(people(2, 2, 13, 13), 30).have).toBe(0); // meses de 30 dias pedem 14
    [Y('mtotal'), Y('mmost'), Y('mhalf')].forEach((c) => { const x = c.calc(people(2, 2, 13, 13), 28); expect(x.have < x.need, c.id).toBe(true); });
  });
  it('a conta aceita o que o aparelho nunca traria (lista vazia, de uma pessoa, números estranhos): não quebra e não inventa vitória', () => {
    C.CREW_MONTHLY.forEach((c) => {
      [[], [0], [31], [0, 0], [31, 31]].forEach((g) => { [28, 31].forEach((D) => { const x = c.calc(g, D); expect(isFinite(x.have) && isFinite(x.need), c.id + ' ' + g.join()).toBe(true); expect(x.have, c.id).toBeGreaterThanOrEqual(0); }); });
    });
    expect(Y('mmost').calc([], 30)).toEqual({ have: 0, need: 2 });
    expect(Y('mtotal').calc([], 30)).toEqual({ have: 0, need: 0 }); // sem ninguém a conta é vazia; quem decide que não há turma é crewMonthInfo (menos de 2 pessoas)
  });
});

/* ---------- a conta do mês ---------- */
describe('crewMonthInfo: a conta do mês', () => {
  it('sem turma (menos de 2 pessoas) ou antes da estreia (dezembro de 2026) não há desafio', () => {
    expect(C.crewMonthInfo(S0(), [], '2026-12', '2026-12-15')).toBeNull();
    expect(C.crewMonthInfo(S0(), [20], '2026-12', '2026-12-15')).toBeNull();
    expect(C.crewMonthInfo(S0(), [0, 0], '2026-11', '2026-11-30')).toBeNull();
    expect(C.crewMonthInfo(S0(), [30, 30], '2026-11', '2026-11-30')).toBeNull(); // nem com o mês cheio
    expect(C.crewMonthInfo(S0(), [0, 0], '2020-05', '2020-05-10')).toBeNull();
    expect(C.crewMonthInfo(S0(), [0, 0], '2026-12', '2026-12-01')).not.toBeNull();
    expect(C.crewMonthInfo(S0(), [0, 0], '2027-01', '2027-01-01')).not.toBeNull();
  });
  it('o desafio é o mesmo para todos (só depende do mês): o texto e a meta seguem a turma e os dias do mês; antes de qualquer meta, 0%', () => {
    const ym = ymOf('mmost'), D = daysOf(ym);
    const a = C.crewMonthInfo(S0(), [0, 0, 0], ym, ym + '-10');
    expect(a).toMatchObject({ key: ym, n: 3, D: D, unit: 'pessoas', need: 2, have: 0, mine: 0, ready: false, done: false, waiting: false, pct: 0, at: 0 });
    expect(a.c.id).toBe('mmost');
    expect(a.text).toBe(Y('mmost').d(3, D));
    expect(C.crewMonthInfo(S0(), [0, 0, 0, 0, 0, 0, 0, 0], ym, ym + '-10')).toMatchObject({ n: 8, need: 5 });
    expect(C.crewMonthInfo(S0(), [0, 0], ym, ym + '-28').c.id).toBe('mmost'); // qualquer dia do mês dá o mesmo desafio
    expect(C.crewMonthInfo(S0(), [0, 0], ym, ym + '-02').c.id).toBe('mmost');
  });
  it('toEnd: os dias que faltam até o último dia do mês (e 0 depois dele, nos primeiros dias do mês seguinte); D acompanha o mês, inclusive o fevereiro de ano bissexto', () => {
    expect(C.crewMonthInfo(S0(), [0, 0], '2026-12', '2026-12-01')).toMatchObject({ D: 31, toEnd: 30 });
    expect(C.crewMonthInfo(S0(), [0, 0], '2026-12', '2026-12-20').toEnd).toBe(11);
    expect(C.crewMonthInfo(S0(), [0, 0], '2026-12', '2026-12-31').toEnd).toBe(0);
    expect(C.crewMonthInfo(S0(), [0, 0], '2026-12', '2027-01-03').toEnd).toBe(0);
    expect(C.crewMonthInfo(S0(), [0, 0], '2027-02', '2027-02-01')).toMatchObject({ D: 28, toEnd: 27 });
    expect(C.crewMonthInfo(S0(), [0, 0], '2028-02', '2028-02-01')).toMatchObject({ D: 29, toEnd: 28 });
    expect(C.crewMonthInfo(S0(), [0, 0], '2027-04', '2027-04-30')).toMatchObject({ D: 30, toEnd: 0 });
    for (let i = 0; i < 40; i++) expect(C.crewMonthInfo(S0(), [0, 0], ymAt(i), ymAt(i) + '-05').D, ymAt(i)).toBe(daysOf(ymAt(i)));
  });
  it('a vitória: a turma cumpriu a conta E eu bati a meta em pelo menos 4 dias do mês (a conta é da turma, mas ninguém leva de graça); a barra vai a 100% nos dois casos', () => {
    const ym = ymOf('mmost'), D = daysOf(ym), k = TH[D].most, today = ym + '-' + pad(D);
    const win = C.crewMonthInfo(S0(), [k, k, 0], ym, today);
    expect(win).toMatchObject({ have: 2, need: 2, mine: k, ready: true, done: true, waiting: false, pct: 100, at: 0 });
    const edge = C.crewMonthInfo(S0(), [k, k - 1, 0], ym, today); // só 1 de 2 no limite
    expect(edge).toMatchObject({ have: 1, need: 2, ready: false, done: false, waiting: false, pct: 50 });
    const four = C.crewMonthInfo(S0(), [4, k, k], ym, today); // eu bati em 4 dias: basta (CREW_MONTH_MINE)
    expect(four).toMatchObject({ have: 2, need: 2, mine: 4, ready: true, done: true, waiting: false });
    const wait = C.crewMonthInfo(S0(), [3, k, k], ym, today); // a turma fechou e eu só bati em 3 dias
    expect(wait).toMatchObject({ have: 2, need: 2, mine: 3, ready: true, done: false, waiting: true, pct: 100 });
    expect(C.crewMonthInfo(S0(), [0, k, k], ym, today)).toMatchObject({ mine: 0, ready: true, done: false, waiting: true, pct: 100 }); // eu não bati nenhum dia
  });
  it('a barra só chega a 100% quando a conta fecha: numa turma enorme, uma meta a menos arredonda para 100 e mesmo assim fica em 99%', () => {
    const ym = ymOf('mtotal'), D = daysOf(ym), per = TH[D].total, n = 80, today = ym + '-' + pad(D);
    const g = people(n, n, per, per);
    g[n - 1] = per - 1; // uma meta a menos que o pedido
    const r = C.crewMonthInfo(S0(), g, ym, today);
    expect(r).toMatchObject({ need: n * per, have: n * per - 1, ready: false, done: false, waiting: false });
    expect(Math.round(((n * per - 1) / (n * per)) * 100)).toBe(100); // a conta bruta arredonda para 100…
    expect(r.pct).toBe(99); // …e a barra espera a conta fechar de verdade
    g[n - 1] = per;
    expect(C.crewMonthInfo(S0(), g, ym, today)).toMatchObject({ have: n * per, ready: true, done: true, pct: 100 });
  });
  it('guardada, a vitória fica (e vale o instante guardado) mesmo que a conta mude depois: apagar registros ou um amigo sair não a desfaz', () => {
    const ym = ymOf('mnear'), S = S0();
    S.crewWon[ym] = 123456;
    expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10')).toMatchObject({ done: true, at: 123456, ready: false, waiting: false, pct: 100, have: 0 });
    S.crewWon[ym] = 'x'; expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10').done).toBe(false); // lixo no mapa não vale
    S.crewWon[ym] = -4; expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10').done).toBe(false);
    S.crewWon[ym] = 0; expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10').done).toBe(false);
    S.crewWon = {}; S.crewWon[ymAt(8)] = 99; expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10').done).toBe(false); // a vitória de outro mês não vale para este
    S.crewWon = {}; S.crewWon[ym + '-01'] = 99; expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10').done).toBe(false); // nem a chave de um dia (a de uma segunda-feira)
    delete S.crewWon; expect(C.crewMonthInfo(S, [0, 0, 0], ym, ym + '-10').done).toBe(false); // estado sem o mapa (backup antigo)
  });
  it('muda todo mês: nunca o mesmo desafio em dois meses seguidos (240 meses) e, em quaisquer 7 meses seguidos, saem os quatro; a cada volta de 4 meses saem todos, uma vez cada', () => {
    const ids = [];
    for (let i = 0; i < 240; i++) ids.push(C.crewMonthInfo(S0(), [0, 0], ymAt(i), ymAt(i) + '-10').c.id);
    for (let i = 1; i < ids.length; i++) expect(ids[i], 'mês ' + i).not.toBe(ids[i - 1]);
    for (let i = 0; i + 7 <= ids.length; i++) expect(new Set(ids.slice(i, i + 7)).size, 'a partir do mês ' + i).toBe(4);
    const laps = {}; // as voltas do baralho são de 4 meses, contados desde o ano 0 (o mesmo número para todo mundo)
    for (let i = 0; i < ids.length; i++) { const n = 2026 * 12 + 11 + i, lap = Math.floor(n / 4); (laps[lap] = laps[lap] || []).push(ids[i]); }
    let full = 0;
    Object.keys(laps).forEach((lap) => { if (laps[lap].length === 4) { full++; expect(laps[lap].slice().sort(), 'volta ' + lap).toEqual(['mhalf', 'mmost', 'mnear', 'mtotal']); } });
    expect(full).toBeGreaterThanOrEqual(59);
    // cada um saiu 60 vezes em 240 meses (±1 pelas voltas das pontas)
    C.CREW_MONTHLY.forEach((c) => { const x = ids.filter((id) => id === c.id).length; expect(x >= 59 && x <= 61, c.id + ' saiu ' + x + ' vezes').toBe(true); });
  });
  it('para a mesma turma e o mesmo mês o resultado é sempre o mesmo (puro: sem relógio, sem sorteio escondido)', () => {
    const ym = ymOf('mhalf'), a = JSON.stringify(C.crewMonthInfo(S0(), [14, 20, 19], ym, ym + '-20'));
    for (let i = 0; i < 20; i++) expect(JSON.stringify(C.crewMonthInfo(S0(), [14, 20, 19], ym, ym + '-20'))).toBe(a);
  });
  it('o sorteio é este, fixo para todo mundo: de dezembro de 2026 a dezembro de 2027 saem estes desafios, nesta ordem (trocar o baralho no meio do caminho mudaria o desafio do mês de todo mundo)', () => {
    const ids = Array.from({ length: 13 }, (_, i) => C.crewMonthInfo(S0(), [0, 0, 0], ymAt(i), ymAt(i) + '-15').c.id);
    expect(ids).toEqual(['mmost', 'mnear', 'mmost', 'mtotal', 'mhalf', 'mnear', 'mtotal', 'mhalf', 'mmost', 'mhalf', 'mmost', 'mtotal', 'mnear']);
    expect(ymAt(0)).toBe('2026-12');
    expect(ymAt(12)).toBe('2027-12');
  });
});

/* ---------- o que o aparelho publica: mm e mp ---------- */
describe('monthHits e o perfil: quantos dias do mês (e do mês anterior) bateram a meta, só a conta, nunca quais dias', () => {
  it('monthHits conta os dias do mês até o dia pedido (um dia que ainda não chegou não conta; um mês que acabou conta inteiro, mas nunca o mês seguinte)', () => {
    const S = state({ days: Object.assign(mine('2026-12', [1, 2, 15, 31]), mine('2027-01', [1, 2])) });
    expect(SO.monthHits(S, '2026-12', '2026-12-01')).toBe(1);
    expect(SO.monthHits(S, '2026-12', '2026-12-10')).toBe(2);
    expect(SO.monthHits(S, '2026-12', '2026-12-15')).toBe(3);
    expect(SO.monthHits(S, '2026-12', '2026-12-30')).toBe(3);
    expect(SO.monthHits(S, '2026-12', '2026-12-31')).toBe(4);
    expect(SO.monthHits(S, '2026-12', '2027-01-05')).toBe(4); // o mês acabou: conta inteiro, sem os dias de janeiro
    expect(SO.monthHits(S, '2027-01', '2027-01-05')).toBe(2);
    expect(SO.monthHits(S, '2026-11', '2026-12-05')).toBe(0);
    expect(SO.monthHits(state(), '2026-12', '2026-12-31')).toBe(0);
  });
  it('só vale a meta batida de verdade: 1.999 ml não conta, dia sem registro não conta, e vale a meta do próprio dia', () => {
    const S = state({ days: { '2026-12-01': { goal: 2000, entries: [{ id: 'a', t: 1, ml: 1999, d: 'water' }] }, '2026-12-02': { goal: 2000, entries: [] }, '2026-12-03': { goal: 1500, entries: [{ id: 'a', t: 1, ml: 1500, d: 'water' }] }, '2026-12-04': hit() } });
    expect(SO.monthHits(S, '2026-12', '2026-12-31')).toBe(2);
  });
  it('fevereiro (28 e 29 dias) e a virada do ano: o dia 29 de um ano bissexto conta, e dezembro é o mês anterior de janeiro', () => {
    const S = state({ days: Object.assign(mine('2028-02', 29), mine('2027-02', 28)) });
    expect(SO.monthHits(S, '2028-02', '2028-02-29')).toBe(29);
    expect(SO.monthHits(S, '2027-02', '2027-03-01')).toBe(28);
    const T = state({ days: mine('2026-12', [3, 30, 31]) });
    expect(SO.profilePayload(T, '2027-01-02')).toMatchObject({ mm: 0, mp: 3 });
  });
  it('o perfil leva mm (o mês do dia do perfil, do dia 1 até ele) e mp (o mês anterior); com o progresso em pausa, vai sem os dois; com 0, vão com 0', () => {
    const S = state({ days: Object.assign(mine('2026-11', [28, 29, 30]), mine('2026-12', [1, 2, 15])) });
    expect(SO.profilePayload(S, '2026-12-15')).toMatchObject({ mm: 3, mp: 3 });
    expect(SO.profilePayload(S, '2026-12-10')).toMatchObject({ mm: 2, mp: 3 }); // o dia 15 é depois do dia do perfil
    expect(SO.profilePayload(S, '2026-12-01')).toMatchObject({ mm: 1, mp: 3 });
    const p0 = SO.profilePayload(state(), '2026-12-15');
    expect(p0.mm).toBe(0); expect(p0.mp).toBe(0); expect('mm' in p0 && 'mp' in p0).toBe(true); // "0 dias" é uma informação (a falta do campo quer dizer "app antigo")
    const off = SO.profilePayload(state({ days: mine('2026-12', 5), social: { share: false } }), '2026-12-15');
    expect('mm' in off || 'mp' in off, 'em pausa').toBe(false);
    expect(off).toMatchObject({ sh: false, pct: null, wm: null, md: null });
    ['mm', 'mp'].forEach((f) => { expect(Number.isInteger(SO.profilePayload(S, '2026-12-15')[f]), f).toBe(true); });
  });
  it('o perfil nunca diz QUAIS dias: dois meses com a mesma conta e dias diferentes publicam exatamente o mesmo mm e mp', () => {
    const a = SO.profilePayload(state({ days: mine('2026-12', [1, 2, 3, 4]) }), '2026-12-20');
    const b = SO.profilePayload(state({ days: mine('2026-12', [10, 12, 14, 18]) }), '2026-12-20');
    expect([a.mm, a.mp]).toEqual([4, 0]);
    expect([b.mm, b.mp]).toEqual([4, 0]);
    expect(JSON.stringify(Object.assign({}, a, { wm: 0 }))).toBe(JSON.stringify(Object.assign({}, b, { wm: 0 })));
  });
  it('samePayload: mm e mp diferentes são perfis diferentes; a falta do campo (app antigo) não é 0; vazio, nulo e indefinido são a mesma coisa', () => {
    const a = SO.profilePayload(state({ days: mine('2026-12', 3) }), '2026-12-15');
    expect(SO.samePayload(a, Object.assign({}, a))).toBe(true);
    expect(SO.samePayload(a, Object.assign({}, a, { mm: a.mm + 1 }))).toBe(false);
    expect(SO.samePayload(a, Object.assign({}, a, { mp: a.mp + 1 }))).toBe(false);
    const old = Object.assign({}, a); delete old.mm; delete old.mp;
    expect(SO.samePayload(a, old)).toBe(false); // 3 e 0 não são "sem a conta"
    expect(SO.samePayload(Object.assign({}, a, { mm: 0, mp: 0 }), old)).toBe(false); // nem o 0
    expect(SO.samePayload(old, Object.assign({}, old))).toBe(true);
    expect(SO.samePayload(old, Object.assign({}, old, { mm: null, mp: null }))).toBe(true);
    expect(SO.samePayload(old, Object.assign({}, old, { mm: undefined, mp: undefined }))).toBe(true);
    expect(SO.samePayload(Object.assign({}, old, { mm: 4 }), Object.assign({}, old, { mm: 4, mp: 1 }))).toBe(false);
  });
  it('cleanFriend: mm e mp só valem como número (inteiro de 0 a 31); texto, lixo e ausência viram null (app antigo), e o resto é cortado nos limites', () => {
    const f = (p) => SO.cleanFriend(U('amigo1'), p, null, U('eu'));
    expect(f({ mm: 12, mp: 30 })).toMatchObject({ mm: 12, mp: 30 });
    expect(f({ mm: 0, mp: 0 })).toMatchObject({ mm: 0, mp: 0 }); // zero é um dado, não ausência
    expect(f({})).toMatchObject({ mm: null, mp: null });
    expect(f({ mm: null, mp: undefined })).toMatchObject({ mm: null, mp: null });
    expect(f({ mm: '12', mp: '3' })).toMatchObject({ mm: null, mp: null }); // texto não vale
    expect(f({ mm: NaN, mp: Infinity })).toMatchObject({ mm: null, mp: null });
    expect(f({ mm: true, mp: [] })).toMatchObject({ mm: null, mp: null });
    expect(f({ mm: {}, mp: -Infinity })).toMatchObject({ mm: null, mp: null });
    expect(f({ mm: -5, mp: 99 })).toMatchObject({ mm: 0, mp: 31 });
    expect(f({ mm: 4.9, mp: 31 })).toMatchObject({ mm: 4, mp: 31 });
    expect(f({ mm: 12 })).toMatchObject({ mm: 12, mp: null }); // um só campo
  });
  it('profileOfCached leva mm e mp (a tela segue mostrando o que já se sabia do amigo)', () => {
    const f = SO.cleanFriend(U('amigo1'), { day: '2026-12-10', mm: 7, mp: 9 }, null, U('eu'));
    expect(SO.profileOfCached(f)).toMatchObject({ mm: 7, mp: 9, day: '2026-12-10' });
    expect(SO.profileOfCached(SO.cleanFriend(U('amigo1'), {}, null, U('eu')))).toMatchObject({ mm: null, mp: null });
    expect(SO.profileOfCached(null)).toBeNull();
  });
});

/* ---------- o que cada amigo conta ---------- */
describe('monthOf: os dias do mês de um amigo, visto de hoje', () => {
  const P = (o) => Object.assign({ day: '2026-12-10', sh: true, mm: 8, mp: 20 }, o);
  it('no mesmo mês do perfil vale mm; no mês anterior ao do perfil vale mp; num mês de antes do perfil do amigo, o amigo ainda não registrou nada: 0', () => {
    expect(SO.monthOf(P(), '2026-12', '2026-12-10')).toBe(8);
    expect(SO.monthOf(P(), '2026-11', '2026-12-10')).toBe(20); // o perfil já é de dezembro: o mês pedido é o anterior, com a conta em mp
    expect(SO.monthOf(P({ day: '2026-11-28', mm: 25 }), '2026-12', '2026-12-01')).toBe(0); // o perfil do amigo ainda é de novembro: dezembro não começou para ele
    expect(SO.monthOf(P({ day: '2026-12-01', mm: 1, mp: 28 }), '2026-12', '2026-12-01')).toBe(1);
  });
  it('nunca passa dos dias do mês (nem com um perfil que diz mais)', () => {
    expect(SO.monthOf(P({ day: '2026-11-20', mm: 31 }), '2026-11', '2026-11-20')).toBe(30);
    expect(SO.monthOf(P({ day: '2027-02-20', mm: 31 }), '2027-02', '2027-02-20')).toBe(28);
    expect(SO.monthOf(P({ day: '2028-02-20', mm: 31 }), '2028-02', '2028-02-20')).toBe(29);
    expect(SO.monthOf(P({ day: '2026-12-03', mp: 31 }), '2026-11', '2026-12-03')).toBe(30);
    expect(SO.monthOf(P({ day: '2027-03-03', mp: 31 }), '2027-02', '2027-03-03')).toBe(28);
  });
  it('quando não dá para saber, é null: perfil de app antigo (sem mm), sem mp no mês seguinte, progresso em pausa, sem dia, dia que ainda não chegou e perfil de 2 meses depois', () => {
    expect(SO.monthOf(P({ mm: null }), '2026-12', '2026-12-10')).toBeNull();
    expect(SO.monthOf(P({ mm: null, mp: 9 }), '2026-11', '2026-12-10')).toBeNull(); // sem mm o perfil inteiro é de app antigo
    expect(SO.monthOf(P({ mp: null }), '2026-11', '2026-12-10')).toBeNull();
    expect(SO.monthOf(P({ sh: false }), '2026-12', '2026-12-10')).toBeNull();
    expect(SO.monthOf(P({ day: '' }), '2026-12', '2026-12-10')).toBeNull();
    expect(SO.monthOf(P({ day: '2026-12-14' }), '2026-12', '2026-12-10')).toBeNull(); // 4 dias à frente: nem o fuso explica
    expect(SO.monthOf(P({ day: '2026-12-12' }), '2026-12', '2026-12-10')).toBe(8); // 2 dias à frente cabem no fuso
    expect(SO.monthOf(P({ day: '2027-02-02' }), '2026-12', '2027-02-02')).toBeNull(); // o perfil é de 2 meses depois: a conta de dezembro já saiu da janela
    expect(SO.monthOf(null, '2026-12', '2026-12-10')).toBeNull();
    expect(SO.monthOf(undefined, '2026-12', '2026-12-10')).toBeNull();
  });
  it('em todo mês, inclusive na virada do ano: um perfil do dia 1 do mês seguinte entrega a conta do mês que acabou (mp)', () => {
    for (let i = 0; i < 40; i++) {
      const ym = ymAt(i), next = ymAt(i + 1), D = daysOf(ym);
      expect(SO.monthOf(P({ day: next + '-01', mm: 1, mp: D - 3 }), ym, next + '-01'), ym + ' visto em ' + next).toBe(D - 3);
      expect(SO.monthOf(P({ day: ym + '-' + pad(D), mm: D - 5, mp: 2 }), ym, ym + '-' + pad(D)), ym + ' no último dia').toBe(D - 5);
    }
  });
});

describe('crewMonthCounts, crewMonthGoal e crewMonthDue: quem entra e quando o mês vence', () => {
  const ym = '2026-12', today = '2026-12-20';
  const close = (id) => { // um mês em que a regra é `id`, e o dia 31 (ou o último) dele
    const m = ymOf(id), D = daysOf(m);
    return { ym: m, D: D, k: TH[D][COL[id]], last: m + '-' + pad(D) };
  };
  it('eu primeiro, com a minha conta; entram os amigos que mostram o progresso, têm a conta e apareceram nos últimos 3 dias (3 dias atrás ainda vale; 4 já não)', () => {
    const S = state({ days: mine(ym, 5) });
    const f = [fm(1, { day: today, mm: 8, mp: 0 }), fm(2, { day: '2026-12-17', mm: 12, mp: 0 }), fm(3, { day: '2026-12-16', mm: 15, mp: 0 }), fm(4, { day: today, mm: 3, mp: 0 })];
    expect(SO.crewMonthCounts(S, f, ym, today)).toEqual([5, 8, 12, 3]); // o amigo 3 sumiu há 4 dias
  });
  it('ficam de fora: em pausa, de app antigo (sem a conta), sem dia nenhum, com um dia que ainda nem chegou (3 dias à frente) e perfil de 2 meses depois; um fuso à frente (1 dia) entra', () => {
    const S = state({ days: mine(ym, 5) });
    const f = [fm(1, { day: today, mm: 8, sh: false }), fm(2, { day: today, mm: null }), fm(3, { day: '', mm: 8 }), fm(4, { day: '2026-12-23', mm: 8 }), fm(5, { day: '2026-12-21', mm: 9 }), fm(6, { day: today, mm: 0 })];
    expect(SO.crewMonthCounts(S, f, ym, today)).toEqual([5, 9, 0]); // quem tem mm = 0 conta: "nenhum dia" também é uma conta conhecida
  });
  it('com o meu progresso em pausa eu saio, e a turma toda some do desafio (os amigos não veem a minha conta)', () => {
    const f = [fm(1, { day: today, mm: 8 }), fm(2, { day: today, mm: 9 })];
    expect(SO.crewMonthCounts(state({ days: mine(ym, 5), social: { share: false } }), f, ym, today)).toEqual([]);
    expect(SO.crewMonthGoal(state({ days: mine(ym, 5), social: { share: false } }), f, today)).toBeNull();
    expect(SO.crewMonthDue(state({ days: mine(ym, 5), social: { share: false } }), f, today)).toEqual([]);
  });
  it('sem lista de amigos (null, indefinida, vazia), só sobra eu, e sem turma não há desafio', () => {
    const S = state({ days: mine(ym, 5) });
    [null, undefined, []].forEach((f) => { expect(SO.crewMonthCounts(S, f, ym, today)).toEqual([5]); expect(SO.crewMonthGoal(S, f, today)).toBeNull(); });
  });
  it('crewMonthGoal: o desafio do mês de hoje, com n, a minha conta e o que falta; antes de dezembro de 2026 é null mesmo com amigos', () => {
    const S = state({ days: mine(ym, 5) });
    const f = [fm(1, { day: today, mm: 8 }), fm(2, { day: today, mm: 2 })];
    const g = SO.crewMonthGoal(S, f, today);
    expect(g).toMatchObject({ key: ym, n: 3, mine: 5, D: 31, toEnd: 11 });
    expect(g.c.id).toBe(C.crewMonthInfo(S, [5, 8, 2], ym, today).c.id);
    expect(SO.crewMonthGoal(S, [fm(1, { day: '2026-11-20', mm: 8 })], '2026-11-20')).toBeNull();
    expect(SO.crewMonthGoal(state({ days: mine('2026-11', 20) }), [fm(1, { day: '2026-11-30', mm: 25 })], '2026-11-30')).toBeNull();
  });
  it('crewMonthDue: quando a turma cumpre a conta e eu também bati a meta em 4 dias, o mês é devolvido uma vez (e some quando já foi guardado)', () => {
    ['mtotal', 'mmost', 'mnear', 'mhalf'].forEach((id) => {
      const x = close(id), S = state({ days: mine(x.ym, x.k) }), f = [fm(1, { day: x.last, mm: x.k }), fm(2, { day: x.last, mm: x.k })];
      const due = SO.crewMonthDue(S, f, x.last);
      expect(due, id).toHaveLength(1);
      expect(due[0], id).toMatchObject({ key: x.ym, n: 3, past: false });
      expect(due[0].c.id, id).toBe(id);
      S.crewWon[x.ym] = Date.now();
      expect(SO.crewMonthDue(S, f, x.last), id + ' já guardado').toEqual([]);
    });
  });
  it('crewMonthDue: faltando eu (menos de 4 dias), faltando a turma, ou um dia a menos do que o limite, não vence', () => {
    ['mtotal', 'mmost', 'mnear', 'mhalf'].forEach((id) => {
      const x = close(id);
      // os três amigos que, com os meus `d` dias, fecham a conta da turma de 4 (na "Maré do mês" é a média: eles compensam os meus poucos dias; nas outras os três no limite bastam, até em "Quase todos a bordo": 3 de 4)
      const need = (d) => (id === 'mtotal' ? Math.min(x.D, Math.ceil((4 * x.k - d) / 3)) : x.k);
      const fr3 = (d) => [fm(1, { day: x.last, mm: need(d) }), fm(2, { day: x.last, mm: need(d) }), fm(3, { day: x.last, mm: need(d) })];
      const g3 = SO.crewMonthGoal(state({ days: mine(x.ym, 3) }), fr3(3), x.last);
      expect(g3, id + ': com 3 dias meus a turma fecha').toMatchObject({ ready: true, done: false, waiting: true, pct: 100, mine: 3 });
      expect(SO.crewMonthDue(state({ days: mine(x.ym, 3) }), fr3(3), x.last), id + ': só 3 dias meus').toEqual([]); // "falta só você"
      expect(SO.crewMonthDue(state({ days: mine(x.ym, 4) }), fr3(4), x.last).map((y) => y.c.id), id + ': 4 dias meus bastam').toEqual([id]);
      expect(SO.crewMonthDue(state({ days: mine(x.ym, x.k) }), [fm(1, { day: x.last, mm: 0 }), fm(2, { day: x.last, mm: 0 })], x.last), id + ': a turma parada').toEqual([]);
      expect(SO.crewMonthDue(state({ days: mine(x.ym, x.k - 1) }), [fm(1, { day: x.last, mm: x.k - 1 }), fm(2, { day: x.last, mm: x.k - 1 })], x.last), id + ': todos 1 dia abaixo').toEqual([]);
      expect(SO.crewMonthDue(state({ days: mine(x.ym, x.k) }), [], x.last), id + ': sozinho').toEqual([]);
    });
  });
  it('o primeiro dia possível é o 13 (só em meses de 28 e 29 dias, "Quase todos a bordo", todos com 13 dias); no dia 12 nada vence', () => {
    let m = null;
    for (let i = 0; i < 40 && !m; i++) { const y = ymAt(i); if ([28, 29].indexOf(daysOf(y)) >= 0 && C.crewMonthInfo(S0(), [0, 0], y, y + '-15').c.id === 'mnear') m = y; }
    expect(m).not.toBeNull();
    const f = (day) => [fm(1, { day: day, mm: +day.slice(8) }), fm(2, { day: day, mm: +day.slice(8) })];
    expect(SO.crewMonthDue(state({ days: mine(m, 13) }), f(m + '-13'), m + '-13').map((x) => x.c.id)).toEqual(['mnear']);
    expect(SO.crewMonthDue(state({ days: mine(m, 12) }), f(m + '-12'), m + '-12')).toEqual([]);
  });
  it('a carência: nos 7 primeiros dias do mês seguinte o mês que acabou ainda é avaliado (o último dia de quem fechou a conta só chega agora; o mp traz a conta fechada) e dura até o dia 7', () => {
    ['mtotal', 'mmost', 'mnear', 'mhalf'].forEach((id) => {
      const x = close(id), next = C.addDays(x.last, 1), S = state({ days: mine(x.ym, x.k) });
      const f = (day) => [fm(1, { day: day, mm: 1, mp: x.k }), fm(2, { day: day, mm: 0, mp: x.k })];
      for (let d = 1; d <= 7; d++) {
        const today2 = next.slice(0, 8) + pad(d), due = SO.crewMonthDue(S, f(today2), today2);
        expect(due, id + ' dia ' + d).toHaveLength(1);
        expect(due[0], id + ' dia ' + d).toMatchObject({ key: x.ym, past: true, n: 3 });
        expect(due[0].c.id).toBe(id);
      }
      const t8 = next.slice(0, 8) + '08';
      expect(SO.crewMonthDue(S, f(t8), t8), id + ' no dia 8 a carência acabou').toEqual([]);
      const guarded = state({ days: mine(x.ym, x.k) }); guarded.crewWon[x.ym] = 5;
      expect(SO.crewMonthDue(guarded, f(next), next), id + ' já guardado').toEqual([]);
    });
  });
  it('o mês novo nunca vence nos primeiros dias (nenhuma regra fecha antes do dia 13), então só o anterior aparece, no máximo um por vez; e novembro (antes da estreia) nunca aparece', () => {
    for (let i = 0; i < 24; i++) {
      const y = ymAt(i), prev = i === 0 ? '2026-11' : ymAt(i - 1);
      for (let d = 1; d <= 12; d++) {
        const t = y + '-' + pad(d), S = state({ days: mine(y, d) });
        const f = [fm(1, { day: t, mm: d, mp: 31 }), fm(2, { day: t, mm: d, mp: 31 })];
        const due = SO.crewMonthDue(S, f, t);
        expect(due.every((x) => x.key !== y), y + ' dia ' + d).toBe(true); // o mês de hoje não fecha
        expect(due.every((x) => x.key === prev && x.past === true), y + ' dia ' + d).toBe(true);
        expect(due.length, y + ' dia ' + d).toBeLessThanOrEqual(1);
        expect(due.every((x) => x.key >= '2026-12'), 'nada antes da estreia').toBe(true);
      }
    }
  });
  it('a conta do mês passado, na carência, usa só o que o aparelho sabe: eu pelos meus dias, o amigo pelo mp; um amigo que ainda não abriu o app no mês novo (perfil do mês antigo) segue valendo pelo mm', () => {
    const x = close('mmost'), next = C.addDays(x.last, 1), S = state({ days: mine(x.ym, x.k) });
    // o amigo 1 já abriu o app no mês novo (mp = a conta do mês passado); o amigo 2 ainda mostra o último dia do mês passado (mm = a conta inteira)
    const f = [fm(1, { day: next, mm: 0, mp: x.k }), fm(2, { day: x.last, mm: x.k, mp: 3 })];
    expect(SO.crewMonthCounts(S, f, x.ym, next)).toEqual([x.k, x.k, x.k]);
    expect(SO.crewMonthDue(S, f, next).map((y) => y.c.id)).toEqual(['mmost']);
    // um amigo de app antigo (sem mm) fica de fora e não atrapalha: 2 de 2 pessoas na conta
    expect(SO.crewMonthCounts(S, f.concat([fm(3, { day: next, mm: null, mp: null })]), x.ym, next)).toEqual([x.k, x.k, x.k]);
  });
  it('se o mês de hoje e o que acabou fecham juntos (só com perfis forjados: nenhuma regra fecha antes do dia 13), saem os dois, o de hoje primeiro; a festa usa o primeiro (e diz "2 meses")', () => {
    // 07/02/2027, o último dia da graça de janeiro. Fevereiro é "Turma firme" (2 de 3 pessoas com 15 dias) e janeiro foi "Quase todos a bordo" (as 3 pessoas com 14 dias)
    const t = '2027-02-07', S = state({ days: Object.assign(mine('2027-01', 14), mine('2027-02', 4)) });
    const f = [fm(1, { day: t, mm: 20, mp: 16 }), fm(2, { day: t, mm: 18, mp: 14 })];
    expect(SO.crewMonthCounts(S, f, '2027-02', t)).toEqual([4, 20, 18]);
    expect(SO.crewMonthCounts(S, f, '2027-01', t)).toEqual([14, 16, 14]);
    const due = SO.crewMonthDue(S, f, t);
    expect(due.map((x) => [x.key, x.c.id, x.past])).toEqual([['2027-02', 'mmost', false], ['2027-01', 'mnear', true]]);
    expect(due.map((x) => x.n)).toEqual([3, 3]);
    // o mesmo vale quando só o mês de hoje fecha, ou só o que acabou: um de cada vez, sem sobrar o outro
    S.crewWon['2027-01'] = 5;
    expect(SO.crewMonthDue(S, f, t).map((x) => x.key)).toEqual(['2027-02']);
    delete S.crewWon['2027-01']; S.crewWon['2027-02'] = 5;
    expect(SO.crewMonthDue(S, f, t).map((x) => x.key)).toEqual(['2027-01']);
  });
});

/* ---------- o mês não vira medalha ---------- */
describe('a vitória do mês da turma vive em S.crewWon, com a chave AAAA-MM, e não conta para as medalhas da turma (só as semanas)', () => {
  const base = () => C.defaults(ts('2026-01-01', 9));
  const ids = (S) => C.newAchievements(S).map((a) => a.id);
  it('cinco meses vencidos não dão "Remando juntos" nem "Time da maré"; uma semana vencida dá a primeira, e os meses não somam para a segunda', () => {
    const S = base();
    for (let i = 0; i < 5; i++) S.crewWon[ymAt(i)] = ts(ymAt(i) + '-28', 12);
    expect(ids(S)).not.toContain('cw1');
    expect(ids(S)).not.toContain('cw4');
    S.crewWon['2026-12-07'] = ts('2026-12-12', 12);
    expect(ids(S)).toContain('cw1');
    expect(ids(S)).not.toContain('cw4'); // 1 semana + 5 meses não são 4 desafios da semana
    for (let i = 1; i < 4; i++) S.crewWon[C.addDays('2026-12-07', i * 7)] = ts(C.addDays('2026-12-07', i * 7 + 5), 12);
    expect(ids(S).sort()).toEqual(expect.arrayContaining(['cw1', 'cw4']));
  });
  it('andamento da medalha: os meses não entram na conta de "desafios" da "Time da maré"', () => {
    const S = base();
    S.crewWon['2026-12-07'] = ts('2026-12-12', 12);
    for (let i = 0; i < 5; i++) S.crewWon[ymAt(i)] = ts(ymAt(i) + '-28', 12);
    expect(C.medalProgress(C.achievementById('cw4'), C.context(S)).have).toBe(1);
  });
  it('o mapa guarda as duas chaves lado a lado, e apagar uma não mexe na outra', () => {
    const S = base();
    S.crewWon['2026-12-07'] = 111; S.crewWon['2026-12'] = 222;
    expect(C.crewInfo(S, [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]], '2026-12-07', '2026-12-07').done).toBe(true);
    expect(C.crewMonthInfo(S, [0, 0], '2026-12', '2026-12-10').done).toBe(true);
    delete S.crewWon['2026-12'];
    expect(C.crewInfo(S, [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]], '2026-12-07', '2026-12-07').done).toBe(true);
    expect(C.crewMonthInfo(S, [0, 0], '2026-12', '2026-12-10').done).toBe(false);
  });
});
