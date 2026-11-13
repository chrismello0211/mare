// Maré — testes do desafio da turma (1.11.0, 1.12.0, 1.13.0 e 1.14.0): as doze regras (as quatro da 1.11.0, as duas que estreiam em 7/12/2026, as quatro que estreiam em 21/12/2026 e as duas que estreiam em 4/1/2027), a conta da semana (crewInfo), quem entra (crewPeople),
// a grade (crewGrid), o que acabou de ser vencido (crewDue), as quatro medalhas que vêm dele (duas das semanas, duas dos meses) e o estado guardado (S.crewWon). Rodar: npm test
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

/* ---------- as doze regras ---------- */
describe('desafio da turma: a lista e as doze regras, no limite', () => {
  it('a lista é um contrato (ids na ordem, emoji, título, unidade, texto e conta); o texto muda com o tamanho da turma e cabe numa linha curta', () => {
    expect(C.CREW_CHALLENGES.map((c) => c.id)).toEqual(['ctotal', 'ccrowd', 'call', 'cweek', 'cchain', 'cpairs', 'cgrow', 'cnear', 'cmid', 'crun', 'cstart', 'chalves']);
    C.CREW_CHALLENGES.forEach((c) => {
      expect(c.e && c.t && c.unit && typeof c.d === 'function' && typeof c.calc === 'function', c.id).toBeTruthy();
      for (let n = 2; n <= 31; n++) { const t = c.d(n); expect(typeof t, c.id + ' ' + n).toBe('string'); expect(t.length, c.id + ' ' + n).toBeLessThan(100); expect(t, c.id + ' ' + n).not.toMatch(/undefined|NaN|\[object/); }
    });
    expect(C.CREW_MIN).toBe(3);
  });
  it('as quatro da 1.11.0 não têm data de estreia (valem desde o começo); as duas da 1.12.0 estreiam numa segunda-feira, 7/12/2026, as quatro da 1.13.0 em outra, 21/12/2026, e as duas da 1.14.0 em outra, 4/1/2027: cada leva nunca muda o que a turma já viu', () => {
    expect(C.CREW_CHALLENGES.map((c) => c.since || '')).toEqual(['', '', '', '', '2026-12-07', '2026-12-07', '2026-12-21', '2026-12-21', '2026-12-21', '2026-12-21', '2027-01-04', '2027-01-04']);
    expect(C.keyToDate('2026-12-07').getDay()).toBe(1); expect(C.keyToDate('2026-12-21').getDay()).toBe(1); expect(C.keyToDate('2027-01-04').getDay()).toBe(1);
    // a conta antiga de cada semana de 2026 até 30/11 não conhece as novas (nem as da 1.12.0, nem as da 1.13.0, nem as da 1.14.0)
    const old = [], later = ['cchain', 'cpairs', 'cgrow', 'cnear', 'cmid', 'crun', 'cstart', 'chalves'];
    for (let i = 0, mon = '2026-01-05'; i < 48; i++, mon = C.addDays(mon, 7)) old.push(C.crewInfo(C.defaults(1), none(2), mon, mon).c.id);
    expect(old.filter((id) => later.indexOf(id) >= 0)).toEqual([]);
    expect(new Set(old).size).toBe(4);
    // e as duas semanas da época da 1.12.0 (7 e 14/12) só conhecem as seis primeiras; as duas da 1.13.0 (21 e 28/12), as dez primeiras
    ['2026-12-07', '2026-12-14'].forEach((m) => { expect(['cgrow', 'cnear', 'cmid', 'crun', 'cstart', 'chalves'].indexOf(C.crewInfo(C.defaults(1), none(2), m, m).c.id), m).toBe(-1); });
    ['2026-12-21', '2026-12-28'].forEach((m) => { expect(['cstart', 'chalves'].indexOf(C.crewInfo(C.defaults(1), none(2), m, m).c.id), m).toBe(-1); });
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
  // n pessoas em que as k primeiras batem a meta nos dias de `pat` ('0011100' = quarta, quinta e sexta) e as outras não batem nenhuma
  const crew = (n, k, pat) => { const out = []; for (let i = 0; i < n; i++) out.push(row(i < k ? pat : ZERO)); return out; };
  it('Corrente da turma: 3 dias seguidos em que a maior parte da turma bate a meta, em cada dia (2 de 2, 2 de 3, 3 de 4, 3 de 5, 6 de 10)', () => {
    const r = X('cchain');
    expect(r.calc(crew(2, 2, '1110000'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(crew(2, 1, '1110000'), 6)).toEqual({ have: 0, need: 3 }); // numa turma de 2, precisam bater as duas
    expect(r.calc(crew(3, 2, '1110000'), 6)).toEqual({ have: 3, need: 3 }); // 2 de 3
    expect(r.calc(crew(3, 1, '1110000'), 6)).toEqual({ have: 0, need: 3 });
    expect(r.calc(crew(4, 3, '0011100'), 6)).toEqual({ have: 3, need: 3 }); // 3 de 4, em qualquer ponto da semana
    expect(r.calc(crew(4, 2, '0011100'), 6)).toEqual({ have: 0, need: 3 }); // 2 de 4 não é a maior parte
    expect(r.calc(crew(5, 3, '1110000'), 6)).toEqual({ have: 3, need: 3 }); // 3 de 5
    expect(r.calc(crew(5, 2, '1110000'), 6)).toEqual({ have: 0, need: 3 });
    expect(r.calc(crew(10, 6, '0001110'), 6)).toEqual({ have: 3, need: 3 }); // 6 de 10
    expect(r.calc(crew(10, 5, '0001110'), 6)).toEqual({ have: 0, need: 3 });
    // (numa turma de 2 o texto diz "as 2 pessoas", e não "pelo menos 2 das 2": o toBe exato pega a troca, que um toContain deixaria passar, porque "das 2 pessoas batem" também contém "as 2 pessoas batem")
    expect(r.d(2)).toBe('Em 3 dias seguidos desta semana, as 2 pessoas batem a meta, em cada dia');
    expect(r.d(3)).toBe('Em 3 dias seguidos desta semana, pelo menos 2 das 3 pessoas batem a meta, em cada dia'); expect(r.d(4)).toContain('pelo menos 3 das 4 pessoas');
    expect(r.d(5)).toContain('pelo menos 3 das 5 pessoas'); expect(r.d(10)).toContain('pelo menos 6 das 10 pessoas'); expect(r.d(31)).toContain('pelo menos 19 das 31 pessoas');
    expect(r.unit).toBe('dias seguidos');
  });
  it('Corrente da turma: vale a maior sequência de dias seguidos da semana (a que já passou também), e dias salteados nunca formam corrente', () => {
    const r = X('cchain');
    expect(r.calc(crew(2, 2, '1101100'), 6)).toEqual({ have: 2, need: 3 }); // 2 dias, um buraco e mais 2: a maior sequência é 2
    expect(r.calc(crew(2, 2, '1101110'), 6)).toEqual({ have: 3, need: 3 }); // o buraco quebra a primeira, a segunda sequência fecha
    expect(r.calc(crew(2, 2, '1010101'), 6)).toEqual({ have: 1, need: 3 }); // de dois em dois dias: nenhum par seguido
    expect(r.calc(crew(2, 2, '1111111'), 6)).toEqual({ have: 7, need: 3 }); // a conta passa do pedido e a tela mostra "3 de 3"
    expect(r.calc(crew(2, 2, '0000011'), 6)).toEqual({ have: 2, need: 3 }); // o fim de semana também conta para a sequência
    // as pessoas da sequência não precisam ser as mesmas: o que vale é a maior parte da turma em cada dia (2 de 3 em cada um dos 3 dias)
    expect(r.calc(grid('1010000', '1100000', '0110000'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(grid('1010000', '1100000', '0010000'), 6)).toEqual({ have: 1, need: 3 }); // na terça só 1 de 3 (e na quarta 2)
    // só vale o que já aconteceu (last = o índice do último dia)
    expect(r.calc(crew(2, 2, '1110000'), 2)).toEqual({ have: 3, need: 3 });
    expect(r.calc(crew(2, 2, '1110000'), 1)).toEqual({ have: 2, need: 3 });
    expect(r.calc(crew(2, 2, '1110000'), 0)).toEqual({ have: 1, need: 3 });
    expect(r.calc(crew(2, 2, '1110000'), -1)).toEqual({ have: 0, need: 3 }); // a semana ainda nem começou
    expect(r.calc(none(5), 6)).toEqual({ have: 0, need: 3 });
  });
  it('Corrente da turma: a "maior parte" é 60% da turma (e pelo menos 2) em qualquer tamanho, e uma turma inteira de dias cheios sempre fecha', () => {
    const r = X('cchain');
    for (let n = 2; n <= 40; n++) {
      const most = Math.max(2, Math.ceil(n * 0.6));
      expect(r.calc(crew(n, most, '1110000'), 6).have, n + ' pessoas, ' + most + ' batem').toBe(3);
      expect(r.calc(crew(n, most - 1, '1110000'), 6).have, n + ' pessoas, ' + (most - 1) + ' batem').toBe(0);
      expect(r.calc(crew(n, n, '1111111'), 6).have, n + ' pessoas, todas').toBeGreaterThanOrEqual(3);
      expect(r.calc(crew(n, n, '1111111'), 6).need, n + ' pessoas').toBe(3); // a meta não cresce com a turma: são sempre 3 dias
    }
  });
  it('Dois dias seguidos: quase todos da turma (3 de cada 4; todos, numa turma de 2 ou 3) têm 2 dias seguidos na meta', () => {
    const r = X('cpairs');
    expect([2, 3, 4, 5, 6, 8, 12, 31].map((n) => r.calc(none(n), 6).need)).toEqual([2, 3, 3, 4, 5, 6, 9, 24]);
    expect(r.calc(crew(2, 2, '0110000'), 6)).toEqual({ have: 2, need: 2 });
    expect(r.calc(crew(2, 1, '0110000'), 6)).toEqual({ have: 1, need: 2 }); // numa turma de 2, as duas
    expect(r.calc(crew(3, 3, '0110000'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(crew(3, 2, '0110000'), 6)).toEqual({ have: 2, need: 3 }); // numa turma de 3, as três
    expect(r.calc(crew(4, 3, '0110000'), 6)).toEqual({ have: 3, need: 3 }); // 3 de 4
    expect(r.calc(crew(4, 2, '0110000'), 6)).toEqual({ have: 2, need: 3 });
    expect(r.calc(crew(5, 4, '0110000'), 6)).toEqual({ have: 4, need: 4 }); // 4 de 5
    expect(r.calc(crew(5, 3, '0110000'), 6)).toEqual({ have: 3, need: 4 });
    expect(r.calc(crew(8, 6, '0110000'), 6)).toEqual({ have: 6, need: 6 }); // 6 de 8
    expect(r.calc(crew(12, 9, '0110000'), 6)).toEqual({ have: 9, need: 9 }); // 9 de 12
    expect(r.calc(crew(12, 8, '0110000'), 6)).toEqual({ have: 8, need: 9 });
    expect(r.d(2)).toContain('Cada pessoa da turma tem'); expect(r.d(3)).toContain('Cada pessoa da turma tem'); expect(r.d(4)).toContain('Pelo menos 3 das 4 pessoas têm');
    expect(r.d(5)).toContain('Pelo menos 4 das 5 pessoas têm'); expect(r.d(12)).toContain('Pelo menos 9 das 12 pessoas têm'); expect(r.d(31)).toContain('Pelo menos 24 das 31 pessoas têm');
    expect(r.unit).toBe('pessoas');
  });
  it('Dois dias seguidos: cada pessoa conta com o próprio par (não precisam ser os mesmos dias); dias salteados, a virada da semana e dias que ainda não aconteceram não formam par', () => {
    const r = X('cpairs');
    expect(r.calc(grid('1100000', '0011000', '0000011'), 6)).toEqual({ have: 3, need: 3 }); // cada um num par diferente
    expect(r.calc(grid('1010101', '1010101', '1010101'), 6)).toEqual({ have: 0, need: 3 }); // de dois em dois dias: nenhum par seguido
    expect(r.calc(grid('1111111', '1101011', '1010100'), 6)).toEqual({ have: 2, need: 3 }); // o 3º só tem dias salteados
    expect(r.calc(grid('0000001', '1000000', '1000001'), 6)).toEqual({ have: 0, need: 3 }); // domingo e segunda são de semanas diferentes: a grade não junta as pontas
    expect(r.calc(grid('0000011', '0000011'), 6)).toEqual({ have: 2, need: 2 }); // sábado e domingo são um par
    expect(r.calc(grid('0000011', '0000011'), 5)).toEqual({ have: 0, need: 2 }); // sábado à noite o domingo ainda não aconteceu
    expect(r.calc(grid('1100000', '1100000'), 1)).toEqual({ have: 2, need: 2 }); // terça é o primeiro dia em que um par existe
    expect(r.calc(grid('1100000', '1100000'), 0)).toEqual({ have: 0, need: 2 }); // na segunda ninguém tem 2 dias
    expect(r.calc(grid('1100000', '1100000'), -1)).toEqual({ have: 0, need: 2 });
  });
  it('Dois dias seguidos: "quase todos" é 3 de cada 4 (e pelo menos 2) em qualquer tamanho, nunca mais do que a turma, e uma turma inteira de dias cheios sempre fecha', () => {
    const r = X('cpairs');
    for (let n = 2; n <= 40; n++) {
      const near = Math.max(2, Math.ceil((n * 3) / 4));
      expect(r.calc(none(n), 6).need, n + ' pessoas').toBe(near);
      expect(near, n + ' pessoas').toBeLessThanOrEqual(n);
      expect(r.calc(crew(n, near, '0110000'), 6).have, n + ' pessoas, ' + near + ' têm par').toBe(near);
      expect(r.calc(crew(n, near - 1, '0110000'), 6).have, n + ' pessoas, ' + (near - 1) + ' têm par').toBe(near - 1);
      const full = r.calc(crew(n, n, '1111111'), 6);
      expect(full.have >= full.need, n + ' pessoas, todas').toBe(true);
    }
  });
  it('Maré cheia: em 4 dias desta semana, a maior parte da turma bate a meta no mesmo dia (2 de 2, 2 de 3, 3 de 4, 3 de 5, 6 de 10), e só vale o que já aconteceu', () => {
    const r = X('cgrow');
    expect(r.calc(crew(2, 2, '1111000'), 6)).toEqual({ have: 4, need: 4 });
    expect(r.calc(crew(2, 1, '1111000'), 6)).toEqual({ have: 0, need: 4 }); // numa turma de 2, precisam bater as duas
    expect(r.calc(crew(3, 2, '1111000'), 6)).toEqual({ have: 4, need: 4 }); // 2 de 3
    expect(r.calc(crew(3, 1, '1111000'), 6)).toEqual({ have: 0, need: 4 });
    expect(r.calc(crew(4, 3, '0101011'), 6)).toEqual({ have: 4, need: 4 }); // 3 de 4: os 4 dias não precisam ser seguidos
    expect(r.calc(crew(4, 2, '0101011'), 6)).toEqual({ have: 0, need: 4 }); // 2 de 4 não é a maior parte
    expect(r.calc(crew(5, 3, '1111000'), 6)).toEqual({ have: 4, need: 4 }); // 3 de 5
    expect(r.calc(crew(5, 2, '1111000'), 6)).toEqual({ have: 0, need: 4 });
    expect(r.calc(crew(10, 6, '1111000'), 6)).toEqual({ have: 4, need: 4 }); // 6 de 10
    expect(r.calc(crew(10, 5, '1111000'), 6)).toEqual({ have: 0, need: 4 });
    expect(r.calc(crew(2, 2, '1111000'), 3)).toEqual({ have: 4, need: 4 }); // quinta: os 4 dias já passaram
    expect(r.calc(crew(2, 2, '1111000'), 2)).toEqual({ have: 3, need: 4 }); // até quarta, só 3
    expect(r.calc(crew(2, 2, '1111000'), -1)).toEqual({ have: 0, need: 4 }); // a semana ainda nem começou
    expect(r.calc(crew(2, 2, '1111111'), 6)).toEqual({ have: 7, need: 4 }); // a conta passa do pedido e a tela mostra "4 de 4"
    expect(r.calc(grid('1101000', '1110000', '0011000'), 6)).toEqual({ have: 4, need: 4 }); // as pessoas de cada dia não precisam ser as mesmas: 2 de 3 em cada um dos 4 dias
    expect(r.calc(grid('1100000', '1110000', '0010000'), 6)).toEqual({ have: 3, need: 4 }); // segunda, terça e quarta têm 2 de 3, mas são só 3 dias: falta um
    expect(r.d(2)).toBe('Em 4 dias desta semana, as 2 pessoas batem a meta no mesmo dia');
    expect(r.d(3)).toBe('Em 4 dias desta semana, pelo menos 2 das 3 pessoas batem a meta no mesmo dia');
    expect(r.d(4)).toContain('pelo menos 3 das 4 pessoas'); expect(r.d(5)).toContain('pelo menos 3 das 5 pessoas'); expect(r.d(10)).toContain('pelo menos 6 das 10 pessoas'); expect(r.d(31)).toContain('pelo menos 19 das 31 pessoas');
    expect(r.unit).toBe('dias');
  });
  it('Quatro dias a bordo: quase todos da turma (3 de cada 4; todos, numa turma de 2 ou 3) batem a meta em pelo menos 4 dias da semana (não precisam ser seguidos)', () => {
    const r = X('cnear');
    expect([2, 3, 4, 5, 6, 8, 12, 31].map((n) => r.calc(none(n), 6).need)).toEqual([2, 3, 3, 4, 5, 6, 9, 24]);
    expect(r.calc(crew(2, 2, '1111000'), 6)).toEqual({ have: 2, need: 2 });
    expect(r.calc(crew(2, 1, '1111000'), 6)).toEqual({ have: 1, need: 2 }); // numa turma de 2, as duas
    expect(r.calc(crew(2, 2, '1110000'), 6)).toEqual({ have: 0, need: 2 }); // 3 dias não bastam
    expect(r.calc(crew(2, 2, '1010101'), 6)).toEqual({ have: 2, need: 2 }); // 4 dias salteados valem
    expect(r.calc(crew(3, 3, '1111000'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(crew(3, 2, '1111000'), 6)).toEqual({ have: 2, need: 3 }); // numa turma de 3, as três
    expect(r.calc(crew(4, 3, '1010101'), 6)).toEqual({ have: 3, need: 3 }); // 3 de 4
    expect(r.calc(crew(4, 2, '1010101'), 6)).toEqual({ have: 2, need: 3 });
    expect(r.calc(crew(5, 4, '1111000'), 6)).toEqual({ have: 4, need: 4 }); // 4 de 5
    expect(r.calc(crew(5, 3, '1111000'), 6)).toEqual({ have: 3, need: 4 });
    expect(r.calc(crew(12, 9, '1111000'), 6)).toEqual({ have: 9, need: 9 }); // 9 de 12
    expect(r.calc(crew(12, 8, '1111000'), 6)).toEqual({ have: 8, need: 9 });
    expect(r.calc(grid('1111000', '0001111', '1100110'), 6)).toEqual({ have: 3, need: 3 }); // cada um nos próprios 4 dias
    expect(r.calc(crew(2, 2, '1111000'), 3)).toEqual({ have: 2, need: 2 }); // quinta: o 4º dia já passou
    expect(r.calc(crew(2, 2, '1111000'), 2)).toEqual({ have: 0, need: 2 }); // até quarta, só 3 dias de cada
    expect(r.calc(crew(2, 2, '1111000'), -1)).toEqual({ have: 0, need: 2 });
    expect(r.d(2)).toBe('Cada pessoa da turma bate a meta em pelo menos 4 dias desta semana'); expect(r.d(3)).toBe(r.d(2));
    expect(r.d(4)).toBe('Pelo menos 3 das 4 pessoas batem a meta em pelo menos 4 dias desta semana');
    expect(r.d(5)).toContain('Pelo menos 4 das 5 pessoas batem'); expect(r.d(12)).toContain('Pelo menos 9 das 12 pessoas batem'); expect(r.d(31)).toContain('Pelo menos 24 das 31 pessoas batem');
    expect(r.unit).toBe('pessoas');
  });
  it('Meio da semana: na quarta e na quinta, a maior parte da turma bate a meta, em cada dia (2 de 2, 2 de 3, 3 de 4, 3 de 5, 6 de 10); os outros dias não contam', () => {
    const r = X('cmid');
    expect(r.calc(crew(2, 2, '0011000'), 6)).toEqual({ have: 2, need: 2 });
    expect(r.calc(crew(2, 1, '0011000'), 6)).toEqual({ have: 0, need: 2 }); // numa turma de 2, as duas
    expect(r.calc(crew(3, 2, '0011000'), 6)).toEqual({ have: 2, need: 2 }); // 2 de 3
    expect(r.calc(crew(3, 1, '0011000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(4, 3, '0011000'), 6)).toEqual({ have: 2, need: 2 }); // 3 de 4
    expect(r.calc(crew(4, 2, '0011000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(5, 3, '0011000'), 6)).toEqual({ have: 2, need: 2 }); // 3 de 5
    expect(r.calc(crew(5, 2, '0011000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(10, 6, '0011000'), 6)).toEqual({ have: 2, need: 2 }); // 6 de 10
    expect(r.calc(crew(10, 5, '0011000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(3, 2, '0010000'), 6)).toEqual({ have: 1, need: 2 }); // só a quarta
    expect(r.calc(crew(3, 2, '0001000'), 6)).toEqual({ have: 1, need: 2 }); // só a quinta
    expect(r.calc(crew(3, 3, '1100111'), 6)).toEqual({ have: 0, need: 2 }); // os outros dias da semana não contam
    expect(r.calc(grid('0010000', '0011000', '0001000'), 6)).toEqual({ have: 2, need: 2 }); // pessoas diferentes em cada dia: 2 de 3 na quarta e 2 de 3 na quinta
    expect(r.calc(crew(3, 3, '0011000'), 3)).toEqual({ have: 2, need: 2 }); // quinta, o último dos dois
    expect(r.calc(crew(3, 3, '0011000'), 2)).toEqual({ have: 1, need: 2 }); // na quarta à noite, a quinta ainda não aconteceu
    expect(r.calc(crew(3, 3, '0011000'), 1)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(3, 3, '0011000'), -1)).toEqual({ have: 0, need: 2 });
    expect(r.d(2)).toBe('Na quarta e na quinta, as 2 pessoas batem a meta, em cada dia');
    expect(r.d(3)).toBe('Na quarta e na quinta, pelo menos 2 das 3 pessoas batem a meta, em cada dia');
    expect(r.d(4)).toContain('pelo menos 3 das 4 pessoas'); expect(r.d(10)).toContain('pelo menos 6 das 10 pessoas'); expect(r.d(31)).toContain('pelo menos 19 das 31 pessoas');
    expect(r.unit).toBe('dias');
  });
  it('Três seguidos: a maior parte da turma (2 de 2, 2 de 3, 3 de 4, 3 de 5, 6 de 10) tem uma sequência de 3 dias seguidos na meta; cada pessoa com a própria sequência, dias salteados não valem', () => {
    const r = X('crun');
    expect([2, 3, 4, 5, 6, 8, 10, 31].map((n) => r.calc(none(n), 6).need)).toEqual([2, 2, 3, 3, 4, 5, 6, 19]);
    expect(r.calc(crew(2, 2, '1110000'), 6)).toEqual({ have: 2, need: 2 });
    expect(r.calc(crew(2, 1, '1110000'), 6)).toEqual({ have: 1, need: 2 }); // numa turma de 2, as duas
    expect(r.calc(crew(3, 2, '0111000'), 6)).toEqual({ have: 2, need: 2 }); // 2 de 3
    expect(r.calc(crew(3, 1, '0111000'), 6)).toEqual({ have: 1, need: 2 });
    expect(r.calc(crew(4, 3, '0001110'), 6)).toEqual({ have: 3, need: 3 }); // 3 de 4
    expect(r.calc(crew(4, 2, '0001110'), 6)).toEqual({ have: 2, need: 3 });
    expect(r.calc(crew(10, 6, '0000111'), 6)).toEqual({ have: 6, need: 6 }); // 6 de 10
    expect(r.calc(crew(10, 5, '0000111'), 6)).toEqual({ have: 5, need: 6 });
    expect(r.calc(crew(3, 3, '1101101'), 6)).toEqual({ have: 0, need: 2 }); // dias de 2 em 2: ninguém tem 3 seguidos
    expect(r.calc(crew(3, 3, '1101110'), 6)).toEqual({ have: 3, need: 2 }); // o buraco quebra a primeira sequência e a segunda fecha
    expect(r.calc(grid('1110000', '0011100', '0000111'), 6)).toEqual({ have: 3, need: 2 }); // cada pessoa com a própria sequência, em dias diferentes
    expect(r.calc(crew(3, 3, '1111111'), 6)).toEqual({ have: 3, need: 2 });
    expect(r.calc(crew(2, 2, '0000111'), 6)).toEqual({ have: 2, need: 2 }); // o fim de semana também conta
    expect(r.calc(crew(2, 2, '0000111'), 5)).toEqual({ have: 0, need: 2 }); // no sábado à noite o domingo ainda não aconteceu
    expect(r.calc(crew(2, 2, '1110000'), 2)).toEqual({ have: 2, need: 2 }); // quarta: 3 dias seguidos
    expect(r.calc(crew(2, 2, '1110000'), 1)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(2, 2, '1110000'), -1)).toEqual({ have: 0, need: 2 });
    expect(r.d(2)).toBe('Nesta semana, as 2 pessoas têm 3 dias seguidos na meta');
    expect(r.d(3)).toBe('Nesta semana, pelo menos 2 das 3 pessoas têm 3 dias seguidos na meta');
    expect(r.d(4)).toContain('pelo menos 3 das 4 pessoas'); expect(r.d(10)).toContain('pelo menos 6 das 10 pessoas'); expect(r.d(31)).toContain('pelo menos 19 das 31 pessoas');
    expect(r.unit).toBe('pessoas');
  });
  it('as quatro da 1.13.0 crescem com a turma: a "maior parte" é 60% e "quase todos" 3 de cada 4 (ambos de pelo menos 2, nunca mais do que a turma), em qualquer tamanho; uma turma inteira de dias cheios sempre fecha', () => {
    for (let n = 2; n <= 40; n++) {
      const most = Math.max(2, Math.ceil(n * 0.6)), near = Math.max(2, Math.ceil((n * 3) / 4));
      expect(most <= n && near <= n, n + ' pessoas').toBe(true);
      // Maré cheia
      expect(X('cgrow').calc(crew(n, most, '1111000'), 6).have, 'cgrow ' + n + '/' + most).toBe(4);
      expect(X('cgrow').calc(crew(n, most - 1, '1111000'), 6).have, 'cgrow ' + n + '/' + (most - 1)).toBe(0);
      expect(X('cgrow').calc(none(n), 6).need, 'cgrow ' + n).toBe(4); // a meta não cresce com a turma: são sempre 4 dias
      // Quatro dias a bordo
      expect(X('cnear').calc(none(n), 6).need, 'cnear ' + n).toBe(near);
      expect(X('cnear').calc(crew(n, near, '1111000'), 6).have, 'cnear ' + n + '/' + near).toBe(near);
      expect(X('cnear').calc(crew(n, near - 1, '1111000'), 6).have, 'cnear ' + n + '/' + (near - 1)).toBe(near - 1);
      // Meio da semana
      expect(X('cmid').calc(crew(n, most, '0011000'), 6).have, 'cmid ' + n + '/' + most).toBe(2);
      expect(X('cmid').calc(crew(n, most - 1, '0011000'), 6).have, 'cmid ' + n + '/' + (most - 1)).toBe(0);
      expect(X('cmid').calc(none(n), 6).need, 'cmid ' + n).toBe(2);
      // Três seguidos
      expect(X('crun').calc(none(n), 6).need, 'crun ' + n).toBe(most);
      expect(X('crun').calc(crew(n, most, '1110000'), 6).have, 'crun ' + n + '/' + most).toBe(most);
      expect(X('crun').calc(crew(n, most - 1, '1110000'), 6).have, 'crun ' + n + '/' + (most - 1)).toBe(most - 1);
      ['cgrow', 'cnear', 'cmid', 'crun'].forEach((id) => { const x = X(id).calc(crew(n, n, '1111111'), 6); expect(x.have >= x.need, id + ' com ' + n + ' pessoas, todas, a semana inteira').toBe(true); });
    }
  });
  it('Maré cheia e Quatro dias a bordo valem para qualquer turma e não repetem "Turma cheia" e "Todos a bordo": a mesma semana pode fechar uma e não a outra, em turmas de 2 a 12', () => {
    for (let n = 2; n <= 12; n++) {
      // 3 dias com todos, nenhum dia a mais: "Turma cheia" (3 dias) fecha; "Maré cheia" (4 dias) não
      const g3 = crew(n, n, '1110000');
      expect(X('ccrowd').calc(g3, 6).have >= X('ccrowd').calc(g3, 6).need, 'ccrowd ' + n).toBe(true);
      expect(X('cgrow').calc(g3, 6).have < X('cgrow').calc(g3, 6).need, 'cgrow ' + n).toBe(true);
      // 3 dias para cada um: "Todos a bordo" (3 dias) fecha; "Quatro dias a bordo" (4 dias) não
      expect(X('call').calc(g3, 6).have >= X('call').calc(g3, 6).need, 'call ' + n).toBe(true);
      expect(X('cnear').calc(g3, 6).have < X('cnear').calc(g3, 6).need, 'cnear ' + n).toBe(true);
    }
    // e numa turma grande a diferença que importa: 3 pessoas num dia não fazem "Maré cheia" (60% da turma de 12 são 8)
    expect(X('ccrowd').calc(crew(12, 3, '1111000'), 6).have).toBe(4);
    expect(X('cgrow').calc(crew(12, 3, '1111000'), 6).have).toBe(0);
    expect(X('cgrow').calc(crew(12, 8, '1111000'), 6).have).toBe(4);
  });
  it('Começo da semana: na segunda e na terça, a maior parte da turma bate a meta, em cada dia (2 de 2, 2 de 3, 3 de 4, 3 de 5, 6 de 10); os outros dias não contam e só vale o que já aconteceu', () => {
    const r = X('cstart');
    expect(r.calc(crew(2, 2, '1100000'), 6)).toEqual({ have: 2, need: 2 });
    expect(r.calc(crew(2, 1, '1100000'), 6)).toEqual({ have: 0, need: 2 }); // numa turma de 2, precisam bater as duas
    expect(r.calc(crew(3, 2, '1100000'), 6)).toEqual({ have: 2, need: 2 }); // 2 de 3
    expect(r.calc(crew(3, 1, '1100000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(4, 3, '1100000'), 6)).toEqual({ have: 2, need: 2 }); // 3 de 4
    expect(r.calc(crew(4, 2, '1100000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(5, 3, '1100000'), 6)).toEqual({ have: 2, need: 2 }); // 3 de 5
    expect(r.calc(crew(5, 2, '1100000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(10, 6, '1100000'), 6)).toEqual({ have: 2, need: 2 }); // 6 de 10
    expect(r.calc(crew(10, 5, '1100000'), 6)).toEqual({ have: 0, need: 2 });
    expect(r.calc(crew(3, 2, '1000000'), 6)).toEqual({ have: 1, need: 2 }); // só a segunda
    expect(r.calc(crew(3, 2, '0100000'), 6)).toEqual({ have: 1, need: 2 }); // só a terça
    expect(r.calc(crew(3, 3, '0011111'), 6)).toEqual({ have: 0, need: 2 }); // os outros dias da semana não contam
    expect(r.calc(grid('1000000', '1100000', '0100000'), 6)).toEqual({ have: 2, need: 2 }); // pessoas diferentes em cada dia: 2 de 3 na segunda e 2 de 3 na terça
    expect(r.calc(crew(3, 3, '1100000'), 1)).toEqual({ have: 2, need: 2 }); // terça, o último dos dois
    expect(r.calc(crew(3, 3, '1100000'), 0)).toEqual({ have: 1, need: 2 }); // na segunda à noite a terça ainda não aconteceu: um dia só nunca fecha
    expect(r.calc(crew(3, 3, '1100000'), -1)).toEqual({ have: 0, need: 2 });
    expect(r.d(2)).toBe('Na segunda e na terça, as 2 pessoas batem a meta, em cada dia');
    expect(r.d(3)).toBe('Na segunda e na terça, pelo menos 2 das 3 pessoas batem a meta, em cada dia');
    expect(r.d(4)).toContain('pelo menos 3 das 4 pessoas'); expect(r.d(10)).toContain('pelo menos 6 das 10 pessoas'); expect(r.d(31)).toContain('pelo menos 19 das 31 pessoas');
    expect(r.unit).toBe('dias'); expect(r.t).toBe('Começo da semana');
  });
  it('Presença na semana: quase todos da turma (3 de cada 4; todos, numa turma de 2 ou 3) bateram a meta em algum dia de segunda a quarta E em algum dia de quinta a domingo; um lado só não vale, e cada pessoa conta com os próprios dias', () => {
    const r = X('chalves');
    expect([2, 3, 4, 5, 6, 8, 12, 31].map((n) => r.calc(none(n), 6).need)).toEqual([2, 3, 3, 4, 5, 6, 9, 24]);
    expect(r.calc(crew(2, 2, '0100100'), 6)).toEqual({ have: 2, need: 2 }); // terça e sexta: um dia de cada lado
    expect(r.calc(crew(2, 1, '0100100'), 6)).toEqual({ have: 1, need: 2 }); // numa turma de 2, as duas
    expect(r.calc(crew(3, 3, '0100100'), 6)).toEqual({ have: 3, need: 3 });
    expect(r.calc(crew(3, 2, '0100100'), 6)).toEqual({ have: 2, need: 3 }); // numa turma de 3, as três
    expect(r.calc(crew(4, 3, '0100100'), 6)).toEqual({ have: 3, need: 3 }); // 3 de 4
    expect(r.calc(crew(4, 2, '0100100'), 6)).toEqual({ have: 2, need: 3 });
    expect(r.calc(crew(5, 4, '0100100'), 6)).toEqual({ have: 4, need: 4 }); // 4 de 5
    expect(r.calc(crew(5, 3, '0100100'), 6)).toEqual({ have: 3, need: 4 });
    expect(r.calc(crew(12, 9, '0100100'), 6)).toEqual({ have: 9, need: 9 }); // 9 de 12
    expect(r.calc(crew(12, 8, '0100100'), 6)).toEqual({ have: 8, need: 9 });
    expect(r.calc(crew(2, 2, '1110000'), 6)).toEqual({ have: 0, need: 2 }); // três dias, mas todos na primeira metade
    expect(r.calc(crew(2, 2, '0001111'), 6)).toEqual({ have: 0, need: 2 }); // quatro dias, mas todos na segunda
    expect(r.calc(crew(2, 2, '0001010'), 6)).toEqual({ have: 0, need: 2 }); // quinta e sábado: os dois da segunda metade
    expect(r.calc(crew(2, 2, '0011000'), 6)).toEqual({ have: 2, need: 2 }); // quarta e quinta: o último dia de cada lado
    expect(r.calc(crew(2, 2, '1000001'), 6)).toEqual({ have: 2, need: 2 }); // segunda e domingo: as pontas
    expect(r.calc(grid('1000100', '0100010', '0010001'), 6)).toEqual({ have: 3, need: 3 }); // cada pessoa com os próprios dias
    expect(r.calc(grid('1000100', '0100010', '1110000'), 6)).toEqual({ have: 2, need: 3 }); // a 3ª só tem a primeira metade
    // só vale o que já aconteceu
    expect(r.calc(crew(2, 2, '0011000'), 3)).toEqual({ have: 2, need: 2 }); // quinta: o segundo lado já tem um dia
    expect(r.calc(crew(2, 2, '0011000'), 2)).toEqual({ have: 0, need: 2 }); // na quarta à noite a quinta ainda não aconteceu
    expect(r.calc(crew(2, 2, '1000001'), 5)).toEqual({ have: 0, need: 2 }); // até sábado, o domingo ainda não aconteceu
    expect(r.calc(crew(2, 2, '1111111'), 0)).toEqual({ have: 0, need: 2 }); // na segunda, ninguém tem os dois lados: um dia só nunca fecha
    expect(r.calc(crew(2, 2, '1111111'), 2)).toEqual({ have: 0, need: 2 }); // até quarta, só o primeiro lado
    expect(r.calc(crew(2, 2, '1111111'), 3)).toEqual({ have: 2, need: 2 });
    expect(r.calc(crew(2, 2, '1111111'), -1)).toEqual({ have: 0, need: 2 });
    expect(r.d(2)).toBe('Cada pessoa da turma bate a meta em algum dia até quarta e em algum de quinta em diante'); expect(r.d(3)).toBe(r.d(2));
    expect(r.d(4)).toBe('Pelo menos 3 das 4 pessoas batem a meta em algum dia até quarta e em algum de quinta em diante');
    expect(r.d(5)).toContain('Pelo menos 4 das 5 pessoas batem'); expect(r.d(12)).toContain('Pelo menos 9 das 12 pessoas batem'); expect(r.d(31)).toContain('Pelo menos 24 das 31 pessoas batem');
    expect(r.unit).toBe('pessoas'); expect(r.t).toBe('Presença na semana');
  });
  it('as duas da 1.14.0 crescem com a turma: a "maior parte" é 60% e "quase todos" 3 de cada 4 (ambos de pelo menos 2, nunca mais do que a turma), em qualquer tamanho; uma turma inteira de dias cheios sempre fecha', () => {
    for (let n = 2; n <= 40; n++) {
      const most = Math.max(2, Math.ceil(n * 0.6)), near = Math.max(2, Math.ceil((n * 3) / 4));
      expect(X('cstart').calc(crew(n, most, '1100000'), 6).have, 'cstart ' + n + '/' + most).toBe(2);
      expect(X('cstart').calc(crew(n, most - 1, '1100000'), 6).have, 'cstart ' + n + '/' + (most - 1)).toBe(0);
      expect(X('cstart').calc(none(n), 6).need, 'cstart ' + n).toBe(2); // a meta não cresce com a turma: são sempre 2 dias
      expect(X('chalves').calc(none(n), 6).need, 'chalves ' + n).toBe(near);
      expect(X('chalves').calc(crew(n, near, '0100100'), 6).have, 'chalves ' + n + '/' + near).toBe(near);
      expect(X('chalves').calc(crew(n, near - 1, '0100100'), 6).have, 'chalves ' + n + '/' + (near - 1)).toBe(near - 1);
      ['cstart', 'chalves'].forEach((id) => { const x = X(id).calc(crew(n, n, '1111111'), 6); expect(x.have >= x.need, id + ' com ' + n + ' pessoas, todas, a semana inteira').toBe(true); });
    }
  });
  it('as duas da 1.14.0 não repetem as vizinhas: a mesma semana pode fechar uma e não a outra (Começo da semana pede segunda E terça; Presença na semana, um dia de cada lado e só uma vez)', () => {
    for (let n = 2; n <= 12; n++) {
      const g = crew(n, n, '1100000'); // segunda e terça, e mais nada
      expect(X('cstart').calc(g, 6).have >= X('cstart').calc(g, 6).need, 'cstart ' + n).toBe(true);
      expect(X('chalves').calc(g, 6).have < X('chalves').calc(g, 6).need, 'chalves ' + n).toBe(true); // os dois dias são da primeira metade
      const h = crew(n, n, '0100100'); // terça e sexta
      expect(X('chalves').calc(h, 6).have >= X('chalves').calc(h, 6).need, 'chalves ' + n).toBe(true);
      expect(X('cstart').calc(h, 6).have < X('cstart').calc(h, 6).need, 'cstart ' + n).toBe(true); // só a terça vale: a segunda ficou em branco
    }
  });
  it('nenhuma das doze fecha com um dia só, em nenhum dia da semana (não só na segunda): com todo mundo batendo a meta em UM dia e em nenhum outro, a conta nunca fecha, em turmas de 2 a 40 pessoas', () => {
    for (let n = 2; n <= 40; n++) {
      for (let j = 0; j < 7; j++) {
        const pat = '0000000'.slice(0, j) + '1' + '0000000'.slice(j + 1);
        C.CREW_CHALLENGES.forEach((c) => { const x = c.calc(crew(n, n, pat), 6); expect(x.have < x.need, c.id + ' com ' + n + ' pessoas, só no dia ' + j + ': ' + x.have + ' de ' + x.need).toBe(true); });
      }
    }
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
  it('as duas regras novas na conta da semana: andamento, pronto e vitória (eu bati a meta em algum dia), com a barra em 67% antes de fechar', () => {
    let mon = monOf('cchain', '2026-12-07');
    const a = C.crewInfo(S0(), grid('1100000', '1100000', ZERO), mon, C.addDays(mon, 1)); // terça: 2 dias seguidos
    expect(a).toMatchObject({ n: 3, unit: 'dias seguidos', have: 2, need: 3, mine: 2, ready: false, done: false, waiting: false, pct: 67 });
    expect(a.c.id).toBe('cchain'); expect(a.text).toBe(X('cchain').d(3));
    const b = C.crewInfo(S0(), grid('1110000', '1110000', ZERO), mon, C.addDays(mon, 2)); // quarta: 3 dias seguidos
    expect(b).toMatchObject({ have: 3, need: 3, mine: 3, ready: true, done: true, waiting: false, pct: 100 });
    const w = C.crewInfo(S0(), grid(ZERO, '1110000', '1110000'), mon, C.addDays(mon, 2)); // a turma fechou e eu não bati a meta nenhum dia
    expect(w).toMatchObject({ have: 3, ready: true, done: false, waiting: true, pct: 100, mine: 0 });
    mon = monOf('cpairs', '2026-12-07');
    const c = C.crewInfo(S0(), grid('1100000', '0011000', '0001100', ZERO), mon, C.addDays(mon, 3)); // quinta: 2 de 4 têm par (a 3ª pessoa ainda só tem a quinta)
    expect(c).toMatchObject({ n: 4, unit: 'pessoas', have: 2, need: 3, mine: 2, ready: false, done: false, pct: 67 });
    expect(c.c.id).toBe('cpairs'); expect(c.text).toBe(X('cpairs').d(4));
    const d3 = C.crewInfo(S0(), grid('1100000', '0011000', '0001100', ZERO), mon, C.addDays(mon, 4)); // sexta: 3 de 4
    expect(d3).toMatchObject({ have: 3, need: 3, ready: true, done: true, pct: 100 });
    const e3 = C.crewInfo(S0(), grid(ZERO, '0011000', '0001100', '1100000'), mon, C.addDays(mon, 4)); // a turma fecha sem mim: falta só eu
    expect(e3).toMatchObject({ have: 3, ready: true, done: false, waiting: true, mine: 0 });
  });
  it('as quatro regras da 1.13.0 na conta da semana: andamento, pronto e vitória (eu bati a meta em algum dia), com a barra abaixo de 100% antes de fechar', () => {
    let mon = monOf('cgrow', '2026-12-21');
    const a = C.crewInfo(S0(), grid('1110000', '1110000', ZERO), mon, C.addDays(mon, 2)); // quarta: 3 dias de 4 com 2 de 3
    expect(a).toMatchObject({ n: 3, unit: 'dias', have: 3, need: 4, mine: 3, ready: false, done: false, waiting: false, pct: 75 });
    expect(a.c.id).toBe('cgrow'); expect(a.text).toBe(X('cgrow').d(3));
    const b = C.crewInfo(S0(), grid('1111000', '1111000', ZERO), mon, C.addDays(mon, 3)); // quinta: 4 dias
    expect(b).toMatchObject({ have: 4, need: 4, mine: 4, ready: true, done: true, waiting: false, pct: 100 });
    expect(C.crewInfo(S0(), grid(ZERO, '1111000', '1111000'), mon, C.addDays(mon, 3))).toMatchObject({ have: 4, ready: true, done: false, waiting: true, pct: 100, mine: 0 }); // a turma fechou e eu não bati a meta nenhum dia
    mon = monOf('cnear', '2026-12-21');
    const c = C.crewInfo(S0(), grid('1110000', '1110000', '1110000'), mon, C.addDays(mon, 2)); // quarta: ninguém tem 4 dias ainda
    expect(c).toMatchObject({ n: 3, unit: 'pessoas', have: 0, need: 3, mine: 3, ready: false, done: false, pct: 0 });
    expect(c.c.id).toBe('cnear'); expect(c.text).toBe(X('cnear').d(3));
    expect(C.crewInfo(S0(), grid('1111000', '1111000', '1110000'), mon, C.addDays(mon, 3))).toMatchObject({ have: 2, need: 3, ready: false, done: false, pct: 67 }); // quinta: 2 de 3 já têm 4 dias
    expect(C.crewInfo(S0(), grid('1111000', '1111000', '0111100'), mon, C.addDays(mon, 4))).toMatchObject({ have: 3, need: 3, ready: true, done: true, pct: 100 }); // sexta: o 3º chega aos 4 dias
    mon = monOf('cmid', '2026-12-21');
    const d3 = C.crewInfo(S0(), grid('0011000', '0011000', ZERO), mon, C.addDays(mon, 2)); // quarta: falta a quinta
    expect(d3).toMatchObject({ n: 3, unit: 'dias', have: 1, need: 2, mine: 1, ready: false, done: false, pct: 50 });
    expect(d3.c.id).toBe('cmid'); expect(d3.text).toBe(X('cmid').d(3));
    expect(C.crewInfo(S0(), grid('0011000', '0011000', ZERO), mon, C.addDays(mon, 3))).toMatchObject({ have: 2, need: 2, mine: 2, ready: true, done: true, pct: 100 });
    mon = monOf('crun', '2026-12-21');
    const e3 = C.crewInfo(S0(), grid('1110000', '0111000', ZERO), mon, C.addDays(mon, 2)); // quarta: só eu tenho 3 seguidos (a 2ª pessoa tem terça e quarta)
    expect(e3).toMatchObject({ n: 3, unit: 'pessoas', have: 1, need: 2, mine: 3, ready: false, done: false, pct: 50 });
    expect(e3.c.id).toBe('crun'); expect(e3.text).toBe(X('crun').d(3));
    expect(C.crewInfo(S0(), grid('1110000', '0111000', ZERO), mon, C.addDays(mon, 3))).toMatchObject({ have: 2, need: 2, ready: true, done: true, pct: 100 }); // quinta: a 2ª pessoa fecha os 3 seguidos
    expect(C.crewInfo(S0(), grid(ZERO, '0111000', '1110000'), mon, C.addDays(mon, 3))).toMatchObject({ have: 2, ready: true, done: false, waiting: true, mine: 0 }); // falta só eu
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
  it('muda toda semana: nunca o mesmo desafio duas semanas seguidas (300 semanas, também nas viradas de 7/12/2026, quando a lista passa de 4 para 6, de 21/12/2026, de 6 para 10, e de 4/1/2027, de 10 para 12); em quaisquer 7 semanas da lista de 4 saem os quatro e, depois da última virada, em quaisquer 23 saem os doze', () => {
    const ids = [], cut = 48, cut2 = 50, cut3 = 52; // as 48 semanas de 5/1 a 30/11/2026 são da lista antiga (4 desafios); a de 6 vale em 7 e 14/12 (semanas 48 e 49); a de 10, em 21 e 28/12 (50 e 51); a de 12 começa na semana 52, em 4/1/2027
    let mon = '2026-01-05';
    for (let i = 0; i < cut3 + 300; i++) { ids.push(C.crewInfo(S0(), none(2), mon, mon).c.id); mon = C.addDays(mon, 7); }
    expect(C.addDays('2026-01-05', cut * 7)).toBe('2026-12-07');
    expect(C.addDays('2026-01-05', cut2 * 7)).toBe('2026-12-21');
    expect(C.addDays('2026-01-05', cut3 * 7)).toBe('2027-01-04');
    for (let i = 1; i < ids.length; i++) expect(ids[i], 'semana ' + i).not.toBe(ids[i - 1]);
    for (let i = 0; i + 7 <= cut; i++) expect(new Set(ids.slice(i, i + 7)).size, 'lista de 4, a partir da semana ' + i).toBe(4);
    expect(new Set(ids.slice(0, cut)).size).toBe(4);
    // a época de 6 só dura duas semanas: duas das seis, uma de cada vez; a de 10 também (duas das dez, e nenhuma das duas novas da 1.14.0)
    expect(ids.slice(cut, cut2).every((id) => C.CREW_CHALLENGES.slice(0, 6).map((c) => c.id).indexOf(id) >= 0)).toBe(true);
    expect(new Set(ids.slice(cut, cut2)).size).toBe(2);
    expect(ids.slice(cut2, cut3).every((id) => C.CREW_CHALLENGES.slice(0, 10).map((c) => c.id).indexOf(id) >= 0)).toBe(true);
    expect(new Set(ids.slice(cut2, cut3)).size).toBe(2);
    // a lista de 12: a primeira volta tem os doze uma vez cada (as duas novas entram logo, nenhuma fica esperando), e em quaisquer 2 × 12 − 1 semanas seguidas saem os doze
    expect(ids.slice(cut3, cut3 + 12).sort()).toEqual(C.CREW_CHALLENGES.map((c) => c.id).sort());
    for (let i = cut3; i + 23 <= ids.length; i++) expect(new Set(ids.slice(i, i + 23)).size, 'lista de 12, a partir da semana ' + i).toBe(12);
    // e 25 voltas depois cada um saiu exatamente 25 vezes
    C.CREW_CHALLENGES.forEach((c) => { expect(ids.slice(cut3).filter((x) => x === c.id).length, c.id).toBe(25); });
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
  it('as duas regras da 1.12.0 na hora: "Corrente da turma" vence no 3º dia seguido (nunca com dias salteados); "Dois dias seguidos" vence quando quase todos têm o par', () => {
    // Corrente da turma: eu e um amigo (2 de 3) batem a meta na segunda, na terça e na quarta
    let mon = monOf('cchain', '2026-12-07'), tue = C.addDays(mon, 1), wed = C.addDays(mon, 2), thu = C.addDays(mon, 3), fri = C.addDays(mon, 4);
    let S = state({ days: myDays(mon, [0, 1, 2]) });
    expect(SO.crewDue(S, [fr(1, { day: tue, wm: bits([0, 1]) }), fr(2, { day: tue, wm: 0 })], tue)).toEqual([]); // na terça são só 2 dias seguidos
    expect(SO.crewDue(S, [fr(1, { day: wed, wm: bits([0, 1, 2]) }), fr(2, { day: wed, wm: 0 })], wed).map((x) => x.c.id)).toEqual(['cchain']); // na quarta, 3
    expect(SO.crewDue(S, [fr(1, { day: wed, wm: bits([0, 1, 2]) }), fr(2, { day: wed, wm: bits([0]) })], wed)).toHaveLength(1); // e com o outro amigo mostrando só a quarta, a maioria (2 de 3) segue a mesma em cada dia
    expect(SO.crewDue(S, [fr(1, { day: wed, wm: bits([0, 2]) }), fr(2, { day: wed, wm: 0 })], wed)).toEqual([]); // o amigo faltou na terça: nesse dia só eu (1 de 3)
    // salteados: segunda, terça, quinta e sexta (nem na sexta formam 3 seguidos)
    S = state({ days: myDays(mon, [0, 1, 3, 4]) });
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 2, 3]) }), fr(2, { day: thu, wm: 0 })], thu)).toEqual([]);
    expect(SO.crewDue(S, [fr(1, { day: fri, wm: bits([0, 1, 3, 4]) }), fr(2, { day: fri, wm: 0 })], fri)).toEqual([]);
    // Dois dias seguidos: 3 pessoas (eu e 2 amigos), então cada uma precisa do próprio par
    mon = monOf('cpairs', '2026-12-07'); thu = C.addDays(mon, 3); fri = C.addDays(mon, 4);
    S = state({ days: myDays(mon, [0, 1]) }); // eu: segunda e terça
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([1, 2]) }), fr(2, { day: thu, wm: bits([0]) })], thu)).toEqual([]); // quinta: o amigo 2 só tem o dia de hoje
    expect(SO.crewDue(S, [fr(1, { day: fri, wm: bits([2, 3]) }), fr(2, { day: fri, wm: bits([0, 1]) })], fri).map((x) => x.c.id)).toEqual(['cpairs']); // sexta: ele ganha quinta + sexta
    // com 4 pessoas bastam 3 pares (3 de 4)
    expect(SO.crewDue(S, [fr(1, { day: fri, wm: bits([2, 3]) }), fr(2, { day: fri, wm: bits([0, 1]) }), fr(3, { day: fri, wm: bits([0]) })], fri).map((x) => x.c.id)).toEqual(['cpairs']);
    expect(SO.crewDue(S, [fr(1, { day: fri, wm: bits([2, 3]) }), fr(2, { day: fri, wm: bits([0]) }), fr(3, { day: fri, wm: bits([0]) })], fri)).toEqual([]); // 2 de 4: não
    // falta só eu: a turma fechou, mas eu não bati a meta nenhum dia
    expect(SO.crewDue(state(), [fr(1, { day: fri, wm: bits([2, 3]) }), fr(2, { day: fri, wm: bits([0, 1]) })], fri)).toEqual([]);
  });
  it('as quatro regras da 1.13.0 na hora: "Maré cheia" vence no 4º dia, "Quatro dias a bordo" quando quase todos têm 4 dias, "Meio da semana" na quinta e "Três seguidos" quando a maior parte tem a sequência', () => {
    // Maré cheia: eu e 1 amigo (2 de 3) batem a meta de segunda a quinta
    let mon = monOf('cgrow', '2026-12-21'), tue = C.addDays(mon, 1), wed = C.addDays(mon, 2), thu = C.addDays(mon, 3), fri = C.addDays(mon, 4);
    let S = state({ days: myDays(mon, [0, 1, 2, 3]) });
    expect(SO.crewDue(S, [fr(1, { day: wed, wm: bits([0, 1, 2]) }), fr(2, { day: wed, wm: 0 })], wed)).toEqual([]); // na quarta são 3 dias
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(2, { day: thu, wm: 0 })], thu).map((x) => x.c.id)).toEqual(['cgrow']); // na quinta, 4
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 3]) }), fr(2, { day: thu, wm: 0 })], thu)).toEqual([]); // o amigo faltou na quarta: nesse dia só eu (1 de 3)
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(2, { day: thu, wm: bits([0]) })], thu)).toHaveLength(1); // e com o outro amigo na quinta, nem faz diferença
    expect(SO.crewDue(state(), [fr(1, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(2, { day: thu, wm: bits([0, 1, 2, 3]) })], thu)).toEqual([]); // a turma fechou e eu não bati nenhum dia: falta só eu
    // Quatro dias a bordo: 3 pessoas, então cada uma com 4 dias (não precisam ser iguais)
    mon = monOf('cnear', '2026-12-21'); tue = C.addDays(mon, 1); wed = C.addDays(mon, 2); thu = C.addDays(mon, 3); fri = C.addDays(mon, 4);
    S = state({ days: myDays(mon, [0, 1, 2, 3]) });
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(2, { day: thu, wm: bits([0, 1, 2]) })], thu)).toEqual([]); // o amigo 2 só tem 3 dias
    expect(SO.crewDue(S, [fr(1, { day: fri, wm: bits([0, 1, 2, 3]) }), fr(2, { day: fri, wm: bits([0, 1, 2, 4]) })], fri).map((x) => x.c.id)).toEqual(['cnear']); // sexta: ele ganha o 4º dia
    // com 4 pessoas bastam 3 delas (3 de 4)
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(2, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(3, { day: thu, wm: 0 })], thu).map((x) => x.c.id)).toEqual(['cnear']);
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 2, 3]) }), fr(2, { day: thu, wm: 0 }), fr(3, { day: thu, wm: 0 })], thu)).toEqual([]); // 2 de 4: não
    // Meio da semana: eu e 1 amigo na quarta e na quinta (2 de 3 em cada dia)
    mon = monOf('cmid', '2026-12-21'); wed = C.addDays(mon, 2); thu = C.addDays(mon, 3);
    S = state({ days: myDays(mon, [2, 3]) });
    expect(SO.crewDue(S, [fr(1, { day: wed, wm: bits([0]) }), fr(2, { day: wed, wm: 0 })], wed)).toEqual([]); // na quarta, a quinta ainda não aconteceu
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1]) }), fr(2, { day: thu, wm: 0 })], thu).map((x) => x.c.id)).toEqual(['cmid']);
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0]) }), fr(2, { day: thu, wm: 0 })], thu)).toEqual([]); // o amigo faltou na quarta
    // Três seguidos: eu de segunda a quarta e um amigo de terça a quinta (2 de 3 têm a sequência na quinta)
    mon = monOf('crun', '2026-12-21'); wed = C.addDays(mon, 2); thu = C.addDays(mon, 3);
    S = state({ days: myDays(mon, [0, 1, 2]) });
    expect(SO.crewDue(S, [fr(1, { day: wed, wm: bits([0, 1]) }), fr(2, { day: wed, wm: 0 })], wed)).toEqual([]); // quarta: só eu tenho 3 seguidos
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 1, 2]) }), fr(2, { day: thu, wm: 0 })], thu).map((x) => x.c.id)).toEqual(['crun']);
    expect(SO.crewDue(S, [fr(1, { day: thu, wm: bits([0, 2]) }), fr(2, { day: thu, wm: 0 })], thu)).toEqual([]); // o amigo salteou a quarta: nada de 3 seguidos
  });
  it('segunda-feira: a semana nova ainda não pode ser vencida (nenhuma regra fecha com um dia só), então só a anterior aparece, no máximo uma vez (12 semanas da lista de 4, as da lista de 6, as da lista de 10 e 12 da lista de 12, com as doze regras)', () => {
    const nexts = [], seen = {};
    for (let i = 0; i < 12; i++) nexts.push(C.addDays('2026-01-12', i * 7), C.addDays('2026-12-14', i * 7), C.addDays('2027-01-11', i * 7)); // a última cadeia cobre a primeira volta da lista de 12 (4/1 a 22/3/2027)
    nexts.forEach((next) => {
      const mon = C.addDays(next, -7);
      const S = state({ days: Object.assign(myDays(mon, [0, 1, 2, 3, 4, 5, 6]), myDays(next, [0])) });
      const due = SO.crewDue(S, [fr(1, { day: next, wm: FULL }), fr(2, { day: next, wm: FULL })], next);
      expect(due.every((x) => x.key === mon && x.past === true), 'semana ' + next).toBe(true);
      expect(due.length).toBeLessThanOrEqual(1);
      seen[C.crewInfo(S, none(2), mon, mon).c.id] = 1; // a regra da semana que acabou: as doze aparecem nestas semanas
    });
    expect(Object.keys(seen).sort()).toEqual(C.CREW_CHALLENGES.map((c) => c.id).sort());
  });
});

/* ---------- as medalhas ---------- */
describe('as 2 medalhas da 1.11.0: Remando juntos e Time da maré', () => {
  const base = () => C.defaults(ts('2026-01-01', 9));
  const ids = (S) => C.newAchievements(S).map((a) => a.id);
  const metDay = (k) => ({ goal: 2000, entries: [{ id: k, t: ts(k, 10), ml: 2000, d: 'water' }] });
  const wins = (n) => { const S = base(); for (let i = 0; i < n; i++) { const mon = C.addDays('2026-01-05', i * 7); S.crewWon[mon] = ts(C.addDays(mon, 5), 12); } return S; };
  it('ficam no fim da lista (os bits 37 e 38), no grupo "Com a turma", com emoji, título e descrição', () => {
    expect(C.ACHIEVEMENTS.slice(C.MEDALS_1_10, C.MEDALS_1_13).map((a) => a.id)).toEqual(['cw1', 'cw4']);
    expect(C.ACHIEVEMENTS.length).toBe(41); // com as duas do mês da turma (1.14.0), depois delas
    const g = C.MEDAL_GROUPS.filter((x) => x.t === 'Com a turma');
    expect(g).toHaveLength(1);
    expect(g[0].ids).toEqual(['crew', 'cw1', 'cw4', 'cm1', 'cm3']);
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

/* ---------- as medalhas do mês da turma (1.14.0) ---------- */
describe('as 2 medalhas da 1.14.0: Navegando juntos e Frota da maré (o desafio do mês da turma)', () => {
  const base = () => C.defaults(ts('2026-01-01', 9));
  const ids = (S) => C.newAchievements(S).map((a) => a.id);
  const metDay = (k) => ({ goal: 2000, entries: [{ id: k, t: ts(k, 10), ml: 2000, d: 'water' }] });
  const ym = (i) => { const n = 2026 * 12 + 11 + i; return Math.floor(n / 12) + '-' + ((n % 12) + 1 < 10 ? '0' : '') + ((n % 12) + 1); }; // dezembro de 2026 mais i meses
  const months = (n) => { const S = base(); for (let i = 0; i < n; i++) S.crewWon[ym(i)] = ts(C.addDays(ym(i) + '-28', 4), 12); return S; }; // a vitória fica guardada na carência (nos primeiros dias do mês seguinte)
  it('ficam no fim da lista (os bits 39 e 40), no grupo "Com a turma", com emoji, título e descrição', () => {
    expect(C.MEDALS_1_13).toBe(39);
    expect(C.ACHIEVEMENTS.slice(C.MEDALS_1_13).map((a) => a.id)).toEqual(['cm1', 'cm3']);
    expect(C.ACHIEVEMENTS.length).toBe(41);
    const g = C.MEDAL_GROUPS.filter((x) => x.t === 'Com a turma');
    expect(g).toHaveLength(1);
    expect(g[0].ids.slice(-2)).toEqual(['cm1', 'cm3']);
    ['cm1', 'cm3'].forEach((id) => { const a = C.achievementById(id); expect(a.e && a.t && a.d && typeof a.test === 'function', id).toBeTruthy(); });
    expect(C.achievementById('cm1').t).toBe('Navegando juntos'); expect(C.achievementById('cm1').d).toBe('A turma venceu o desafio do mês');
    expect(C.achievementById('cm3').t).toBe('Frota da maré'); expect(C.achievementById('cm3').d).toBe('A turma venceu o desafio do mês, 3 vezes');
    expect(C.achievementById('cm1').p).toBeUndefined();
    expect(C.medalProgress(C.achievementById('cm3'), { crewMonths: 2 })).toEqual({ have: 2, need: 3, unit: 'desafios', pct: 67 });
    expect(C.medalProgress(C.achievementById('cm3'), { crewMonths: 9 }).have).toBe(3);
    expect(C.medalProgress(C.achievementById('cm3'), {}).have).toBe(0); // contexto sem o campo (um teste antigo): não quebra
  });
  it('o primeiro mês vencido pela turma dá a primeira medalha; 2 não dão a segunda, 3 dão', () => {
    expect(ids(months(0))).toEqual([]);
    expect(ids(months(1))).toEqual(['cm1']);
    expect(ids(months(2))).toEqual(['cm1']);
    expect(ids(months(3)).sort()).toEqual(['cm1', 'cm3']);
    expect(ids(months(8)).sort()).toEqual(['cm1', 'cm3']);
  });
  it('as semanas da turma e os desafios pessoais são outras contas: um não traz a medalha do outro, e os meses da turma não trazem as das semanas', () => {
    const W = base();
    for (let i = 0; i < 5; i++) { const mon = C.addDays('2026-01-05', i * 7); W.crewWon[mon] = ts(C.addDays(mon, 5), 12); }
    expect(ids(W).sort()).toEqual(['cw1', 'cw4']); // cinco semanas da turma: as duas das semanas e nenhuma do mês
    expect(C.context(W)).toMatchObject({ crewWins: 5, crewMonths: 0 });
    const M = months(3);
    expect(ids(M).sort()).toEqual(['cm1', 'cm3']); // três meses da turma: as duas do mês e nenhuma das semanas
    expect(C.context(M)).toMatchObject({ crewWins: 0, crewMonths: 3 });
    const both = months(1); both.crewWon['2026-01-05'] = ts('2026-01-09', 12);
    expect(ids(both).sort()).toEqual(['cm1', 'cw1']); // cada uma conta o que é seu, no mesmo mapa
    expect(C.context(both)).toMatchObject({ crewWins: 1, crewMonths: 1 });
    const P = base(); P.challenges['2026-01-05'] = ts('2026-01-09', 12); P.challenges['2026-01'] = ts('2026-01-31', 12);
    expect(ids(P)).not.toContain('cm1'); // o desafio do mês de cada um (S.challenges) também é outra conta
    expect(C.context(P).crewMonths).toBe(0);
  });
  it('test e andamento concordam, valor a valor', () => {
    const a = C.achievementById('cm3');
    for (let v = 0; v <= 12; v++) { const c = { crewMonths: v }; expect(a.test(c), 'com ' + v).toBe(a.p(c)[0] >= a.p(c)[1]); }
    expect([0, 1, 2].map((v) => C.achievementById('cm1').test({ crewMonths: v }))).toEqual([false, true, true]);
    expect(C.achievementById('cm1').test({})).toBe(false); expect(C.achievementById('cm3').test({})).toBe(false); // contexto sem o campo: não quebra
  });
  it('lixo no mapa não vale: só a chave de 7 caracteres com um instante de verdade conta (nada de chave de outro tamanho, instante inválido, negativo, zero, texto ou nulo)', () => {
    const S = base();
    S.crewWon['2026'] = ts('2026-11-20', 10); S.crewWon['2026-1'] = ts('2026-11-20', 10); S.crewWon['2026-11-1'] = ts('2026-11-20', 10); S.crewWon['2026-11-16-x'] = ts('2026-11-20', 10); // tamanhos 4, 6, 9 e 12 não são semana (10) nem mês (7)
    S.crewWon['2026-12'] = 'ontem'; S.crewWon['2027-01'] = -5; S.crewWon['2027-02'] = 0; S.crewWon['2027-03'] = NaN; S.crewWon['2027-04'] = Infinity; S.crewWon['2027-05'] = null; S.crewWon['2027-06'] = undefined;
    expect(C.context(S)).toMatchObject({ crewWins: 0, crewMonths: 0 });
    expect(ids(S)).toEqual([]);
    S.crewWon['2026-11'] = ts('2026-12-03', 10); // um mês de verdade, no meio do lixo
    expect(C.context(S)).toMatchObject({ crewWins: 0, crewMonths: 1 });
    expect(ids(S)).toEqual(['cm1']);
  });
  it('context(S, upTo): conta só o que foi guardado até o dia (a vitória vale no dia do instante guardado, não no último dia do mês)', () => {
    const S = base();
    S.crewWon['2026-02'] = ts('2026-03-03', 21); // fevereiro, fechado na carência
    S.crewWon['2026-03'] = ts('2026-03-31', 21); // março, fechado no último dia
    expect(C.context(S, '2026-03-02').crewMonths).toBe(0);
    expect(C.context(S, '2026-03-03').crewMonths).toBe(1);
    expect(C.context(S, '2026-03-30').crewMonths).toBe(1);
    expect(C.context(S, '2026-03-31').crewMonths).toBe(2);
    expect(C.context(S).crewMonths).toBe(2);
  });
  it('medalDates: a data da medalha é o dia em que a vitória foi guardada (a 3ª, para a segunda medalha); sem 3 vitórias, sem data', () => {
    const S = base();
    const days = ['2026-03-03', '2026-04-02', '2026-05-05'];
    days.forEach((k, i) => { S.days[k] = metDay(k); S.crewWon[C.addDays(k, -10).slice(0, 7)] = ts(k, 20 + i); });
    const want = (k) => C.keyToDate(k).getTime();
    const all = C.medalDates(S, ['cm1', 'cm3'].map(C.achievementById));
    expect(all.cm1).toBe(want('2026-03-03'));
    expect(all.cm3).toBe(want('2026-05-05'));
    delete S.crewWon[C.addDays('2026-05-05', -10).slice(0, 7)];
    const some = C.medalDates(S, ['cm1', 'cm3'].map(C.achievementById));
    expect(some.cm1).toBe(want('2026-03-03'));
    expect(some.cm3).toBeUndefined();
  });
});

/* ---------- o estado ---------- */
describe('S.crewWon: o mapa das semanas e dos meses vencidos pela turma', () => {
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
