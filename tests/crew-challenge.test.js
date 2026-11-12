// Maré — testes do desafio da turma (1.11.0): as quatro regras, a conta da semana (crewInfo), quem entra (crewPeople), a grade (crewGrid), o que acabou de ser vencido (crewDue),
// as duas medalhas que vêm dele e o estado guardado (S.crewWon). Rodar: npm test
// (O arquivo tests/crew.test.js é outro assunto: a turma única e os avisos do servidor.) As datas são fixas (2026) e os horários, locais: valem em qualquer fuso.
// 16/11/2026 é segunda-feira. A tela do desafio (a linha na Hoje, o cartão em Amigos, a festa) é conferida em tests/e2e-crew-challenge.spec.js.
import { describe, it, expect } from 'vitest';
import * as C from '../public/js/core.js';
import * as SO from '../public/js/social.js';

const MON0 = '2026-11-16'; // segunda-feira
const WED0 = '2026-11-18';
const U = (n) => n + 'x'.repeat(28 - n.length);
const ts = (k, h, m) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); };
const X = (id) => C.CREW_CHALLENGES.filter((c) => c.id === id)[0];
const row = (s) => s.split('').map(Number); // '1110000' → [1, 1, 1, 0, 0, 0, 0] (segunda a domingo)
const grid = (...rows) => rows.map(row);
const ZERO = '0000000';
const none = (n) => { const g = []; for (let i = 0; i < n; i++) g.push(row(ZERO)); return g; };
// a primeira segunda-feira (a partir de 5/1/2026) em que o desafio da turma é o de id `id`
const monOf = (id, from) => {
  let mon = from || '2026-01-05';
  for (let i = 0; i < 24; i++, mon = C.addDays(mon, 7)) if (C.crewInfo(C.defaults(1), none(2), mon, mon).c.id === id) return mon;
  throw new Error('sem a semana de ' + id);
};
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
const hit = (ml) => ({ goal: 2000, entries: ml ? [{ id: 'a', t: 1, ml: ml, d: 'water' }] : [] }); // 2.000 ml ou mais: meta batida
// uma semana inteira de metas batidas, a partir da segunda-feira `mon`, só nos dias de índice `idx`
const myDays = (mon, idx) => { const d = {}; idx.forEach((i) => { d[C.addDays(mon, i)] = hit(2000); }); return d; };
// um amigo como o cleanFriend entrega: o bit 0 de wm é o dia `day`, o bit 1 é o dia anterior…
const fr = (n, o) => Object.assign({ uid: U('amigo' + n), nm: 'Amigo ' + n, mc: 'peixe', pct: 0, met: false, st: 0, day: '', sh: true, gl: null, wm: 0, md: 0, md2: 0 }, o);
const bits = (list) => list.reduce((m, i) => m | (1 << i), 0);
const FULL = bits([0, 1, 2, 3, 4, 5, 6]); // 127: os 7 dias

/* ---------- as quatro regras ---------- */
describe('desafio da turma: a lista e as quatro regras, no limite', () => {
  it('a lista é um contrato (ids na ordem, emoji, título, unidade, texto e conta); o texto muda com o tamanho da turma e cabe numa linha curta', () => {
    expect(C.CREW_CHALLENGES.map((c) => c.id)).toEqual(['ctotal', 'ccrowd', 'call', 'cweek']);
    C.CREW_CHALLENGES.forEach((c) => {
      expect(c.e && c.t && c.unit && typeof c.d === 'function' && typeof c.calc === 'function', c.id).toBeTruthy();
      for (let n = 2; n <= 31; n++) { const t = c.d(n); expect(typeof t, c.id + ' ' + n).toBe('string'); expect(t.length, c.id + ' ' + n).toBeLessThan(100); expect(t, c.id + ' ' + n).not.toMatch(/undefined|NaN|\[object/); }
    });
    expect(C.CREW_MIN).toBe(3);
  });
  it('Maré da semana: 4 metas por pessoa, somando os dias de todos até o último dia que já aconteceu', () => {
    const g = grid('1111000', '1100000', ZERO), r = X('ctotal');
    expect(r.calc(g, 6)).toEqual({ have: 6, need: 12 });
    expect(r.calc(g, 3)).toEqual({ have: 6, need: 12 });
    expect(r.calc(g, 1)).toEqual({ have: 4, need: 12 });
    expect(r.calc(g, 0)).toEqual({ have: 2, need: 12 });
    expect(r.calc(g, -1)).toEqual({ have: 0, need: 12 }); // a semana ainda nem começou
    [2, 3, 5, 10, 31].forEach((n) => expect(r.calc(none(n), 6).need, 'turma de ' + n).toBe(4 * n));
    expect(r.d(3)).toContain('12 vezes'); expect(r.d(10)).toContain('40 vezes'); expect(r.d(31)).toContain('124 vezes');
    expect(r.unit).toBe('metas');
  });
  it('Turma cheia: em 3 dias, 3 pessoas ou mais batem a meta no mesmo dia (numa turma de 2, as duas)', () => {
    const r = X('ccrowd');
    expect(r.calc(grid('1100000', '1010000'), 6)).toEqual({ have: 1, need: 3 }); // só o dia 0 tem as duas
    expect(r.calc(grid('1110000', '1110000'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(grid('1110000', '1110000', '1110000'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(grid('1110000', '1110000', '1100000'), 6)).toEqual({ have: 2, need: 3 }); // 2 de 3 não é turma cheia
    expect(r.calc(grid('1110000', '1110000', '1100000', ZERO, ZERO), 6)).toEqual({ have: 2, need: 3 }); // numa turma de 5, a conta continua sendo 3 pessoas (não 5)
    expect(r.calc(grid('1110000', '1110000', '1110000', ZERO, ZERO), 1)).toEqual({ have: 2, need: 3 }); // só vale o que já aconteceu
    expect(r.calc(grid('1110000', '1110000', '1110000'), -1)).toEqual({ have: 0, need: 3 });
    expect(r.d(2)).toContain('as 2 pessoas batem'); expect(r.d(3)).toContain('3 pessoas ou mais batem'); expect(r.d(12)).toContain('3 pessoas ou mais batem');
    expect(r.unit).toBe('dias');
  });
  it('Todos a bordo: cada pessoa bate a meta em pelo menos 3 dias (a meta é o tamanho da turma)', () => {
    const r = X('call');
    expect(r.calc(grid('1110000', '1100000', '1111111'), 6)).toEqual({ have: 2, need: 3 });
    expect(r.calc(grid('1110000', '1110000', '0010101'), 6)).toEqual({ have: 3, need: 3 }); // não precisam ser dias seguidos
    expect(r.calc(grid('1110000', '1110000', '1110000'), 1)).toEqual({ have: 0, need: 3 }); // até segunda e terça, ninguém tem 3 dias
    expect(r.calc(grid('1110000', '1110000', '1110000'), 2)).toEqual({ have: 3, need: 3 });
    [2, 3, 5, 31].forEach((n) => expect(r.calc(none(n), 6).need, 'turma de ' + n).toBe(n));
    expect(r.d(7)).toBe(r.d(2)); // o texto não depende do tamanho
    expect(r.unit).toBe('pessoas');
  });
  it('Fim de semana da turma: no sábado e no domingo, a maior parte da turma bate a meta, em cada dia (2 de 2, 2 de 3, 3 de 4, 3 de 5, 6 de 10)', () => {
    const r = X('cweek');
    const g = (n, sat, sun) => { const out = []; for (let i = 0; i < n; i++) out.push(row('00000' + (i < sat ? '1' : '0') + (i < sun ? '1' : '0'))); return out; };
    expect(r.calc(g(2, 2, 2), 6)).toEqual({ have: 2, need: 2 });
    expect(r.calc(g(2, 2, 1), 6)).toEqual({ have: 1, need: 2 }); // numa turma de 2, precisam bater as duas
    expect(r.calc(g(3, 2, 2), 6)).toEqual({ have: 2, need: 2 }); // 2 de 3
    expect(r.calc(g(3, 1, 3), 6)).toEqual({ have: 1, need: 2 });
    expect(r.calc(g(4, 3, 3), 6)).toEqual({ have: 2, need: 2 }); // 3 de 4
    expect(r.calc(g(4, 2, 2), 6)).toEqual({ have: 0, need: 2 }); // 2 de 4 não é a maior parte
    expect(r.calc(g(5, 3, 3), 6)).toEqual({ have: 2, need: 2 }); // 3 de 5
    expect(r.calc(g(5, 2, 3), 6)).toEqual({ have: 1, need: 2 });
    expect(r.calc(g(10, 6, 6), 6)).toEqual({ have: 2, need: 2 }); // 6 de 10
    expect(r.calc(g(10, 5, 6), 6)).toEqual({ have: 1, need: 2 });
    expect(r.calc(g(3, 3, 3), 5)).toEqual({ have: 1, need: 2 }); // no sábado à noite, o domingo ainda não aconteceu
    expect(r.calc(g(3, 3, 3), 4)).toEqual({ have: 0, need: 2 });
    expect(r.d(2)).toContain('2 das 2 pessoas'); expect(r.d(3)).toContain('2 das 3 pessoas'); expect(r.d(4)).toContain('3 das 4 pessoas'); expect(r.d(5)).toContain('3 das 5 pessoas');
    expect(r.d(10)).toContain('6 das 10 pessoas'); expect(r.d(31)).toContain('19 das 31 pessoas');
    expect(r.unit).toBe('dias');
  });
  it('a conta aceita o que a grade nunca traria (linhas curtas, vazias, lixo): não quebra e não inventa vitória', () => {
    C.CREW_CHALLENGES.forEach((c) => {
      [[], [[]], [[], []], [[1], [1]], [row('1111111'), []]].forEach((g) => { const x = c.calc(g, 6); expect(isFinite(x.have) && isFinite(x.need), c.id).toBe(true); expect(x.have, c.id).toBeGreaterThanOrEqual(0); });
    });
  });
  it('nenhuma regra fecha com um dia só, qualquer que seja o tamanho da turma e mesmo com todos tendo batido a meta na segunda-feira: por isso, na segunda, só a semana que passou pode fechar (a festa até sabe dizer "2 semanas", mas esse texto hoje não sai; se um desafio novo fechar no primeiro dia, este teste avisa)', () => {
    for (let n = 2; n <= 40; n++) {
      const g = []; for (let i = 0; i < n; i++) g.push(row('1000000'));
      C.CREW_CHALLENGES.forEach((c) => { const x = c.calc(g, 0); expect(x.have < x.need, c.id + ' com ' + n + ' pessoas: ' + x.have + ' de ' + x.need).toBe(true); });
    }
  });
});

/* ---------- a conta da semana ---------- */
describe('crewInfo: a conta da semana, vista de um dia dela', () => {
  const S0 = () => C.defaults(1);
  it('sem turma (menos de 2 pessoas na grade) não há desafio', () => {
    expect(C.crewInfo(S0(), [], MON0, MON0)).toBeNull();
    expect(C.crewInfo(S0(), grid('1111111'), MON0, MON0)).toBeNull();
    expect(C.crewInfo(S0(), grid('1111111', ZERO), MON0, MON0)).not.toBeNull();
  });
  it('o desafio é o mesmo para todos (só depende da segunda-feira): o texto e a meta seguem o tamanho da turma; antes de qualquer meta, 0%', () => {
    const mon = monOf('call');
    const a = C.crewInfo(S0(), none(3), mon, mon);
    expect(a).toMatchObject({ key: mon, n: 3, unit: 'pessoas', need: 3, have: 0, mine: 0, ready: false, done: false, waiting: false, pct: 0, at: 0, toEnd: 6 });
    expect(a.c.id).toBe('call');
    expect(a.text).toBe(X('call').d(3));
    const b = C.crewInfo(S0(), none(8), mon, mon);
    expect(b).toMatchObject({ n: 8, need: 8 });
    expect(C.crewInfo(S0(), none(2), mon, C.addDays(mon, 3)).c.id).toBe('call'); // qualquer dia da semana dá o mesmo desafio
  });
  it('toEnd: os dias que faltam até domingo (segunda = 6, domingo = 0, e a segunda seguinte, que ainda mostra a semana, fica em 0)', () => {
    for (let i = 0; i <= 7; i++) expect(C.crewInfo(S0(), none(2), MON0, C.addDays(MON0, i)).toEnd, 'dia ' + i).toBe(Math.max(0, 6 - i));
  });
  it('a vitória: a turma cumpriu a conta E eu bati a meta em algum dia (a conta é da turma, mas ninguém leva de graça); a barra vai a 100% nos dois casos', () => {
    const mon = monOf('ctotal'), sun = C.addDays(mon, 6);
    const win = C.crewInfo(S0(), grid('1111000', '1111000', '1111000'), mon, sun); // 12 de 12
    expect(win).toMatchObject({ have: 12, need: 12, mine: 4, ready: true, done: true, waiting: false, pct: 100, at: 0 });
    const edge = C.crewInfo(S0(), grid('1111000', '1111000', '1110000'), mon, sun); // 11 de 12
    expect(edge).toMatchObject({ have: 11, need: 12, ready: false, done: false, waiting: false, pct: 92 });
    const one = C.crewInfo(S0(), grid('1000000', '1111111', '1111111'), mon, sun); // eu bati em UM dia só: basta
    expect(one).toMatchObject({ have: 15, need: 12, mine: 1, ready: true, done: true, waiting: false });
    const wait = C.crewInfo(S0(), grid(ZERO, '1111111', '1111111'), mon, sun); // a turma fechou e eu não bati a meta nenhum dia
    expect(wait).toMatchObject({ have: 14, need: 12, mine: 0, ready: true, done: false, waiting: true, pct: 100 });
  });
  it('a barra só chega a 100% quando a conta fecha: numa turma enorme, uma meta a menos arredonda para 100 e mesmo assim fica em 99%', () => {
    const mon = monOf('ctotal'), sun = C.addDays(mon, 6), n = 60, g = none(n); // 60 pessoas: 240 metas pedidas
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) if (i * 4 + j < 239) g[i][j] = 1; // 239 metas batidas, uma a menos que o pedido
    const r = C.crewInfo(S0(), g, mon, sun);
    expect(r).toMatchObject({ need: 240, have: 239, mine: 4, ready: false, done: false, waiting: false });
    expect(Math.round((239 / 240) * 100)).toBe(100); // a conta bruta arredonda para 100…
    expect(r.pct).toBe(99); // …e a barra espera a conta fechar de verdade
    g[59][3] = 1; // a 240ª meta
    expect(C.crewInfo(S0(), g, mon, sun)).toMatchObject({ have: 240, ready: true, done: true, pct: 100 });
  });
  it('"mine" olha só os dias que já aconteceram (o que está depois de hoje não conta, nem se a grade trouxesse)', () => {
    const mon = monOf('ctotal');
    expect(C.crewInfo(S0(), grid('0000111', ZERO), mon, C.addDays(mon, 2)).mine).toBe(0);
    expect(C.crewInfo(S0(), grid('0000111', ZERO), mon, C.addDays(mon, 4)).mine).toBe(1);
    expect(C.crewInfo(S0(), grid('0000111', ZERO), mon, C.addDays(mon, 6)).mine).toBe(3);
  });
  it('guardada, a vitória fica (e vale o instante guardado) mesmo que a grade mude depois: apagar registros ou um amigo sair não a desfaz', () => {
    const mon = monOf('ctotal'), S = S0();
    S.crewWon[mon] = 123456;
    const g = C.crewInfo(S, none(3), mon, C.addDays(mon, 2));
    expect(g).toMatchObject({ done: true, at: 123456, ready: false, waiting: false, pct: 100, have: 0 });
    S.crewWon[mon] = 'x'; expect(C.crewInfo(S, none(3), mon, mon).done).toBe(false); // lixo no mapa não vale
    S.crewWon[mon] = -4; expect(C.crewInfo(S, none(3), mon, mon).done).toBe(false);
    S.crewWon = {}; S.crewWon[C.addDays(mon, 7)] = 99; expect(C.crewInfo(S, none(3), mon, mon).done).toBe(false); // a vitória de outra semana não vale para esta
    delete S.crewWon; expect(C.crewInfo(S, none(3), mon, mon).done).toBe(false); // estado sem o mapa (backup antigo)
  });
  it('muda toda semana: nunca o mesmo desafio duas semanas seguidas (200 semanas) e, em quaisquer 7 semanas seguidas, saem os quatro', () => {
    const ids = [];
    let mon = '2026-01-05';
    for (let i = 0; i < 200; i++) { ids.push(C.crewInfo(S0(), none(2), mon, mon).c.id); mon = C.addDays(mon, 7); }
    for (let i = 1; i < ids.length; i++) expect(ids[i], 'semana ' + i).not.toBe(ids[i - 1]);
    for (let i = 0; i + 7 <= ids.length; i++) expect(new Set(ids.slice(i, i + 7)).size, 'a partir da semana ' + i).toBe(4);
    C.CREW_CHALLENGES.forEach((c) => { const n = ids.filter((x) => x === c.id).length; expect(n, c.id).toBeGreaterThanOrEqual(49); expect(n, c.id).toBeLessThanOrEqual(51); });
  });
  it('para a mesma turma e o mesmo dia o resultado é sempre o mesmo (puro: sem relógio, sem sorteio escondido)', () => {
    const mon = monOf('ccrowd'), g = grid('1110000', '1110000', '1100000');
    const a = JSON.stringify(C.crewInfo(S0(), g, mon, C.addDays(mon, 3)));
    for (let i = 0; i < 20; i++) expect(JSON.stringify(C.crewInfo(S0(), g, mon, C.addDays(mon, 3)))).toBe(a);
  });
});

/* ---------- quem entra e a grade ---------- */
describe('crewPeople: quem entra na conta', () => {
  const S = () => state();
  it('eu sou o primeiro; entram os amigos que mostram a semana e apareceram nos últimos 3 dias (3 dias atrás ainda vale; 4 já não)', () => {
    const f = [fr(1, { day: WED0, wm: 1 }), fr(2, { day: C.addDays(WED0, -3), wm: 1 }), fr(3, { day: C.addDays(WED0, -4), wm: 1 })];
    const p = SO.crewPeople(S(), f, WED0);
    expect(p.map((m) => m.me)).toEqual([true, false, false]);
    expect(p.slice(1).map((m) => m.uid)).toEqual([f[0].uid, f[1].uid]);
  });
  it('ficam de fora: em pausa, sem a semana (wm nulo), sem dia nenhum e com um dia que ainda nem chegou (3 dias à frente); um fuso à frente (1 dia) entra', () => {
    const f = [fr(1, { day: WED0, wm: 7, sh: false }), fr(2, { day: WED0, wm: null }), fr(3, { day: '', wm: 7 }), fr(4, { day: C.addDays(WED0, 3), wm: 7 }), fr(5, { day: C.addDays(WED0, 1), wm: 7 }), fr(6, { day: WED0, wm: 0 })];
    const p = SO.crewPeople(S(), f, WED0);
    expect(p.slice(1).map((m) => m.uid)).toEqual([f[4].uid, f[5].uid]); // quem tem wm = 0 conta: a semana dele é "sem nenhuma meta", e isso é uma semana conhecida
  });
  it('com o meu progresso em pausa eu saio, e a turma toda some do desafio (os amigos não veem a minha semana)', () => {
    const p = SO.crewPeople(state({ social: { share: false } }), [fr(1, { day: WED0, wm: 7 })], WED0);
    expect(p).toEqual([]);
    expect(SO.crewPeople(state({ social: { share: true } }), [fr(1, { day: WED0, wm: 7 })], WED0)).toHaveLength(2);
  });
  it('sem lista de amigos (null, indefinida, vazia), só sobra eu', () => {
    [null, undefined, []].forEach((f) => { const p = SO.crewPeople(S(), f, WED0); expect(p.length).toBe(1); expect(p[0].me).toBe(true); });
  });
});

describe('crewGrid: a semana de cada um, de segunda a domingo', () => {
  it('cada perfil mostra os últimos 7 dias: o dia j da semana está a (hoje − segunda − j) dias de hoje; o que ainda não chegou vale 0', () => {
    const f = fr(1, { day: WED0, wm: bits([0, 2]) }); // hoje (quarta) e a segunda
    const p = SO.crewPeople(state(), [f], WED0);
    expect(SO.crewGrid(p, MON0, WED0)[1]).toEqual([1, 0, 1, 0, 0, 0, 0]);
  });
  it('a minha linha (a primeira) vem dos meus dias: meta batida conta, 1.999 ml não', () => {
    const S = state({ days: { '2026-11-16': hit(2000), '2026-11-17': hit(1999), '2026-11-18': hit(2500) } });
    const p = SO.crewPeople(S, [fr(1, { day: WED0, wm: 0 })], WED0);
    const g = SO.crewGrid(p, MON0, WED0);
    expect(g[0]).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(g[1]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(g.length).toBe(2);
  });
  it('um amigo que não abre o app há 2 dias tem a janela deslocada: o que veio depois do último perfil dele conta como não batido', () => {
    const f = fr(1, { day: C.addDays(WED0, -2), wm: bits([0, 1]) }); // o último perfil é de segunda: segunda e o domingo antes
    const p = SO.crewPeople(state(), [f], WED0);
    expect(SO.crewGrid(p, MON0, WED0)[1]).toEqual([1, 0, 0, 0, 0, 0, 0]);
    const g = fr(2, { day: C.addDays(WED0, -2), wm: bits([0, 1, 2, 3, 4, 5, 6]) }); // 7 dias seguidos até segunda: terça e quarta não aparecem
    expect(SO.crewGrid(SO.crewPeople(state(), [g], WED0), MON0, WED0)[1]).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  it('na segunda-feira, a semana que acabou ainda aparece, menos a segunda dela (já saiu da janela de 7 dias); a semana nova começa em branco', () => {
    const T = '2026-11-23';
    const p = SO.crewPeople(state(), [fr(1, { day: T, wm: FULL })], T);
    expect(SO.crewGrid(p, MON0, T)[1]).toEqual([0, 1, 1, 1, 1, 1, 1]);
    expect(SO.crewGrid(p, T, T)[1]).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
  it('sem ninguém a grade é vazia; toda célula é 0 ou 1 e há sempre sete colunas', () => {
    expect(SO.crewGrid([], MON0, WED0)).toEqual([]);
    const f = [fr(1, { day: WED0, wm: 127 }), fr(2, { day: WED0, wm: 0 }), fr(3, { day: C.addDays(WED0, -3), wm: 85 })];
    SO.crewGrid(SO.crewPeople(state(), f, WED0), MON0, WED0).forEach((r) => { expect(r).toHaveLength(7); r.forEach((v) => { expect([0, 1]).toContain(v); }); });
  });
});

/* ---------- o que o app mostra e o que ele comemora ---------- */
describe('crewGoal e crewDue: o desafio da semana na tela e o que acabou de ser vencido', () => {
  it('sem amigo que mostre a semana, ou com o meu progresso em pausa, não há desafio (null)', () => {
    expect(SO.crewGoal(state(), [], WED0)).toBeNull();
    expect(SO.crewGoal(state(), [fr(1, { day: WED0, wm: null })], WED0)).toBeNull();
    expect(SO.crewGoal(state({ social: { share: false } }), [fr(1, { day: WED0, wm: 7 })], WED0)).toBeNull();
    expect(SO.crewGoal(state(), [fr(1, { day: WED0, wm: 7 })], WED0)).not.toBeNull();
  });
  it('com turma: n conta eu e os amigos que entram; mine são os MEUS dias da semana; a semana é a de hoje', () => {
    const S = state({ days: myDays(MON0, [0, 2]) });
    const g = SO.crewGoal(S, [fr(1, { day: WED0, wm: 7 }), fr(2, { day: WED0, wm: 1 }), fr(3, { day: '', wm: 7 })], WED0);
    expect(g).toMatchObject({ key: MON0, n: 3, mine: 2, toEnd: 4 });
    expect(SO.crewGoal(S, [fr(1, { day: '2026-11-22', wm: 7 })], '2026-11-22').key).toBe(MON0); // domingo ainda é a semana de 16/11
    expect(SO.crewGoal(S, [fr(1, { day: WED0, wm: 7 })], '2026-11-22')).toBeNull(); // o amigo que sumiu há 4 dias já não conta: sobra só eu
    expect(SO.crewGoal(S, [fr(1, { day: '2026-11-23', wm: 7 })], '2026-11-23').key).toBe('2026-11-23');
  });
  it('crewDue: quando a turma cumpre a conta e eu também bati a meta, a semana é devolvida uma vez (e some quando já foi guardada)', () => {
    const mon = monOf('ctotal'), sun = C.addDays(mon, 6);
    const S = state({ days: myDays(mon, [0, 1, 2, 3, 4, 5, 6]) });
    const f = [fr(1, { day: sun, wm: FULL }), fr(2, { day: sun, wm: FULL })];
    const due = SO.crewDue(S, f, sun);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ key: mon, n: 3, past: false });
    expect(due[0].c.id).toBe('ctotal');
    S.crewWon[mon] = Date.now();
    expect(SO.crewDue(S, f, sun)).toEqual([]);
  });
  it('crewDue: faltando eu bater a meta, ou faltando a turma, não vence (e nada é devolvido)', () => {
    const mon = monOf('ctotal'), sun = C.addDays(mon, 6), f = [fr(1, { day: sun, wm: FULL }), fr(2, { day: sun, wm: FULL })];
    expect(SO.crewDue(state(), f, sun)).toEqual([]); // eu não bati nenhum dia: "falta só você"
    expect(SO.crewDue(state({ days: myDays(mon, [0, 1, 2, 3, 4, 5, 6]) }), [fr(1, { day: sun, wm: 1 }), fr(2, { day: sun, wm: 0 })], sun)).toEqual([]); // 9 de 12
    expect(SO.crewDue(state({ days: myDays(mon, [0]) }), [], sun)).toEqual([]); // sozinho, não há turma
    expect(SO.crewDue(state({ days: myDays(mon, [0, 1, 2, 3, 4, 5, 6]), social: { share: false } }), f, sun)).toEqual([]); // em pausa
  });
  it('a regra de cada desafio na hora: "Turma cheia" vence quando o 3º dia fecha (quarta), "Todos a bordo" no 3º dia de todos, "Fim de semana" só no domingo', () => {
    // Turma cheia: segunda, terça e quarta com as 3 pessoas
    let mon = monOf('ccrowd'), wed = C.addDays(mon, 2);
    let S = state({ days: myDays(mon, [0, 1, 2]) });
    let f = [fr(1, { day: wed, wm: 7 }), fr(2, { day: wed, wm: 7 })];
    expect(SO.crewDue(S, f, C.addDays(mon, 1))).toEqual([]); // na terça só 2 dias fecharam
    expect(SO.crewDue(S, f.map((x) => Object.assign({}, x, { day: C.addDays(mon, 1), wm: 3 })), C.addDays(mon, 1))).toEqual([]);
    expect(SO.crewDue(S, f, wed).map((x) => x.c.id)).toEqual(['ccrowd']); // na quarta, 3 dias
    // Todos a bordo: cada um com 3 dias (não precisam ser iguais)
    mon = monOf('call'); const fri = C.addDays(mon, 4);
    S = state({ days: myDays(mon, [0, 1, 2]) });
    f = [fr(1, { day: fri, wm: bits([0, 2, 4]) }), fr(2, { day: fri, wm: bits([0, 1, 2]) })]; // sexta, quarta e segunda; sexta, quinta e quarta
    expect(SO.crewDue(S, f, fri).map((x) => x.c.id)).toEqual(['call']);
    expect(SO.crewDue(S, [f[0], fr(2, { day: fri, wm: bits([0, 1]) })], fri)).toEqual([]); // um amigo com só 2 dias
    // Fim de semana da turma: 2 de 3 no sábado e no domingo
    mon = monOf('cweek'); const sat = C.addDays(mon, 5), sun = C.addDays(mon, 6);
    S = state({ days: myDays(mon, [5, 6]) });
    expect(SO.crewDue(S, [fr(1, { day: sat, wm: 1 }), fr(2, { day: sat, wm: 0 })], sat)).toEqual([]); // sábado: o domingo ainda não aconteceu
    expect(SO.crewDue(S, [fr(1, { day: sun, wm: 3 }), fr(2, { day: sun, wm: 0 })], sun).map((x) => x.c.id)).toEqual(['cweek']);
    expect(SO.crewDue(S, [fr(1, { day: sun, wm: 1 }), fr(2, { day: sun, wm: 0 })], sun)).toEqual([]); // domingo: só eu bati, 1 de 3 não é a maior parte
  });
  it('segunda-feira de graça: a semana que acabou ontem ainda é avaliada (o perfil do domingo de quem fechou a conta só chega agora), com a segunda-feira dela já fora da janela', () => {
    const mon = monOf('ctotal'), next = C.addDays(mon, 7);
    const S = state({ days: myDays(mon, [1, 2, 3, 4, 5, 6]) });
    const f = [fr(1, { day: next, wm: FULL }), fr(2, { day: next, wm: FULL })];
    const due = SO.crewDue(S, f, next);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ key: mon, past: true, n: 3 });
    S.crewWon[mon] = 5;
    expect(SO.crewDue(S, f, next)).toEqual([]); // já guardada
    expect(SO.crewDue(state({ days: myDays(mon, [1, 2, 3, 4, 5, 6]) }), f, C.addDays(next, 1))).toEqual([]); // na terça, a graça acabou
  });
  it('segunda-feira: a semana nova ainda não pode ser vencida (nenhuma regra fecha com um dia só), então só a anterior aparece, no máximo uma vez', () => {
    for (let i = 0; i < 12; i++) {
      const next = C.addDays('2026-01-12', i * 7), mon = C.addDays(next, -7);
      const S = state({ days: Object.assign(myDays(mon, [0, 1, 2, 3, 4, 5, 6]), myDays(next, [0])) });
      const due = SO.crewDue(S, [fr(1, { day: next, wm: FULL }), fr(2, { day: next, wm: FULL })], next);
      expect(due.every((x) => x.key === mon && x.past === true), 'semana ' + next).toBe(true);
      expect(due.length).toBeLessThanOrEqual(1);
    }
  });
});

/* ---------- as medalhas ---------- */
describe('as 2 medalhas da 1.11.0: Remando juntos e Time da maré', () => {
  const base = () => C.defaults(ts('2026-01-01', 9));
  const ids = (S) => C.newAchievements(S).map((a) => a.id);
  const metDay = (k) => ({ goal: 2000, entries: [{ id: k, t: ts(k, 10), ml: 2000, d: 'water' }] });
  const wins = (n) => { const S = base(); for (let i = 0; i < n; i++) { const mon = C.addDays('2026-01-05', i * 7); S.crewWon[mon] = ts(C.addDays(mon, 5), 12); } return S; };
  it('ficam no fim da lista (os bits 37 e 38), no grupo "Com a turma", com emoji, título e descrição', () => {
    expect(C.ACHIEVEMENTS.slice(C.MEDALS_1_10).map((a) => a.id)).toEqual(['cw1', 'cw4']);
    expect(C.ACHIEVEMENTS.length).toBe(39);
    const g = C.MEDAL_GROUPS.filter((x) => x.t === 'Com a turma');
    expect(g).toHaveLength(1);
    expect(g[0].ids).toEqual(['crew', 'cw1', 'cw4']);
    ['cw1', 'cw4'].forEach((id) => { const a = C.achievementById(id); expect(a.e && a.t && a.d && typeof a.test === 'function', id).toBeTruthy(); });
    expect(C.achievementById('cw1').t).toBe('Remando juntos');
    expect(C.achievementById('cw4').t).toBe('Time da maré');
    expect(C.achievementById('cw1').p).toBeUndefined();
    expect(C.medalProgress(C.achievementById('cw4'), { crewWins: 3 })).toEqual({ have: 3, need: 4, unit: 'desafios', pct: 75 });
    expect(C.medalProgress(C.achievementById('cw4'), { crewWins: 9 }).have).toBe(4);
  });
  it('a primeira vitória da turma dá a primeira medalha; 3 não dão a segunda, 4 dão (sem confundir com os desafios da semana e do mês de cada um)', () => {
    expect(ids(wins(0))).toEqual([]);
    expect(ids(wins(1))).toEqual(['cw1']);
    expect(ids(wins(3))).toEqual(['cw1']);
    expect(ids(wins(4)).sort()).toEqual(['cw1', 'cw4']);
    expect(ids(wins(9))).not.toContain('wk1'); // o desafio da semana de cada um é outra conta
    const S = base(); S.challenges['2026-01-05'] = ts('2026-01-09', 12); S.challenges['2026-01'] = ts('2026-01-31', 12);
    expect(ids(S)).not.toContain('cw1'); // e a vitória da turma não vem dos desafios pessoais
  });
  it('test e andamento concordam, valor a valor', () => {
    const a = C.achievementById('cw4');
    for (let v = 0; v <= 12; v++) { const c = { crewWins: v }; expect(a.test(c), 'com ' + v).toBe(a.p(c)[0] >= a.p(c)[1]); }
    expect([0, 1, 2].map((v) => C.achievementById('cw1').test({ crewWins: v }))).toEqual([false, true, true]);
    expect(C.achievementById('cw1').test({})).toBe(false); // contexto sem o campo (um teste antigo): não quebra
  });
  it("lixo no mapa não vale: chaves de outro tamanho, instantes inválidos, negativos e zero, texto, nulo", () => {
    const S = base();
    S.crewWon['2026-11'] = ts('2026-11-20', 10); S.crewWon['2026'] = ts('2026-11-20', 10); S.crewWon['2026-11-16-x'] = ts('2026-11-20', 10);
    S.crewWon['2026-11-23'] = 'ontem'; S.crewWon['2026-11-30'] = -5; S.crewWon['2026-12-07'] = 0; S.crewWon['2026-12-14'] = NaN; S.crewWon['2026-12-21'] = Infinity; S.crewWon['2026-12-28'] = null;
    expect(C.context(S).crewWins).toBe(0);
    expect(ids(S).filter((id) => id === 'cw1' || id === 'cw4')).toEqual([]);
  });
  it('context(S, upTo): conta só o que foi guardado até o dia (a vitória vale no dia do instante guardado, não no da segunda-feira da semana)', () => {
    const S = base();
    S.crewWon['2026-03-02'] = ts('2026-03-08', 21); // a semana de 2/3, fechada no domingo à noite
    S.crewWon['2026-03-09'] = ts('2026-03-15', 21);
    expect(C.context(S, '2026-03-07').crewWins).toBe(0);
    expect(C.context(S, '2026-03-08').crewWins).toBe(1);
    expect(C.context(S, '2026-03-14').crewWins).toBe(1);
    expect(C.context(S, '2026-03-15').crewWins).toBe(2);
    expect(C.context(S).crewWins).toBe(2);
  });
  it('medalDates: a data da medalha é o dia em que a vitória foi guardada (a 4ª, para a segunda medalha); sem 4 vitórias, sem data', () => {
    const S = base();
    const days = ['2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29'];
    days.forEach((k, i) => { S.days[k] = metDay(k); S.crewWon[C.addDays(k, -6)] = ts(k, 20 + (i % 3)); });
    const want = (k) => C.keyToDate(k).getTime();
    const all = C.medalDates(S, ['cw1', 'cw4'].map(C.achievementById));
    expect(all.cw1).toBe(want('2026-03-08'));
    expect(all.cw4).toBe(want('2026-03-29'));
    delete S.crewWon[C.addDays('2026-03-29', -6)];
    const some = C.medalDates(S, ['cw1', 'cw4'].map(C.achievementById));
    expect(some.cw1).toBe(want('2026-03-08'));
    expect(some.cw4).toBeUndefined();
  });
});

/* ---------- o estado ---------- */
describe('S.crewWon: o mapa das semanas vencidas pela turma', () => {
  it('começa vazio, e um backup antigo, sem o campo, ganha o mapa vazio ao ser lido', () => {
    expect(C.defaults(1).crewWon).toEqual({});
    expect(C.migrate({}).crewWon).toEqual({});
    expect(C.migrate(undefined).crewWon).toEqual({});
    expect(C.migrate({ days: {} }).crewWon).toEqual({});
  });
  it('o que não é um mapa vira um mapa vazio (nulo, texto, número, lista); um mapa de verdade é mantido como está', () => {
    [null, 'x', 7, [], [1, 2], true].forEach((bad) => { expect(C.migrate({ crewWon: bad }).crewWon, JSON.stringify(bad)).toEqual({}); });
    expect(C.migrate({ crewWon: { '2026-11-16': 123, '2026-11-23': 456 } }).crewWon).toEqual({ '2026-11-16': 123, '2026-11-23': 456 });
  });
  it('não mexe nos outros mapas (extras e desafios) nem depende deles', () => {
    const m = C.migrate({ extras: { '2026-01-02:e': 9 }, challenges: { '2026-01-05': 8 }, crewWon: { '2026-01-05': 7 } });
    expect(m.extras).toEqual({ '2026-01-02:e': 9 });
    expect(m.challenges).toEqual({ '2026-01-05': 8 });
    expect(m.crewWon).toEqual({ '2026-01-05': 7 });
  });
});
