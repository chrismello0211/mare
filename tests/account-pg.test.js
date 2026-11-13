// Maré — testes do rastro das missões e dos desafios no backup da conta (1.11.0, campo "pg" de public/js/account.js). Rodar: npm test
// O que se guarda: S.missions, S.extras, S.challenges e S.crewWon (as semanas e, desde a 1.13.0, os meses vencidos pela turma), numa forma curta dentro do MESMO documento dos ajustes (users/{uid}/backup/prefs, só {v, u, j}: as regras do Firestore
// não mudam). Aqui: a forma, a ida e a volta, o limite de tamanho (e o que sai primeiro quando passa dele), a junção sem perder nada, "a nuvem ficou para trás?" e a limpeza de tudo
// o que vem de fora. As datas são de 2025 (sempre no passado, em qualquer dia em que o teste rode) e os horários, locais.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../public/js/core.js';
import * as A from '../public/js/account.js';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const dn = (k) => Math.round(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5);
const ts = (k, h, m) => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); };
const pad = (n) => (n < 10 ? '0' : '') + n;
const base = () => { const S = C.defaults(1700000000000); S.onboarded = true; return S; };
const MON = '2025-03-03'; // segunda-feira
const d = (n) => C.addDays(MON, n);
const dayOf = (t) => C.dayKey(new Date(t));
// o documento como a nuvem o guarda e o app o lê de volta (um texto, nada além do que foi gravado)
const cloud = (S, u) => A.prefsParse(JSON.parse(JSON.stringify(A.prefsPack(S, u || 5))));
const wire = (S) => { const p = A.prefsPack(S, 5); return p ? JSON.parse(p.j).pg : undefined; };
// um app de quem usou tudo: 60 semanas vencidas (e 60 da turma), 30 meses (e 30 da turma), 500 dias de missões (as três cumpridas)
function heavy() {
  const S = base();
  for (let i = 0; i < 60; i++) { S.challenges[d(i * 7)] = ts(d(i * 7 + 4), 20); S.crewWon[d(i * 7)] = ts(d(i * 7 + 6), 21); }
  for (let i = 0; i < 30; i++) { const y = 2023 + Math.floor(i / 12), m = (i % 12) + 1; S.challenges[y + '-' + pad(m)] = ts(y + '-' + pad(m) + '-20', 12); S.crewWon[y + '-' + pad(m)] = ts(y + '-' + pad(m) + '-25', 12); }
  for (let i = 0; i < 500; i++) { const k = C.addDays('2024-01-01', i); S.missions[k] = ts(k, 20); S.extras[k + ':e'] = ts(k, 20); S.extras[k + ':h'] = ts(k, 20); }
  return S;
}
const keys = (o) => Object.keys(o).sort();
// o tamanho do documento (sem os recados) com a fração `keep` do rastro; squeeze deixa o nome (impossível de verdade, mas é o que enche) com o tamanho que faz esse texto ter 4.000 exatos
const sizeAt = (S, keep) => { const s = A.prefsSnapshot(S); s.ui = {}; const pg = A.pgSnapshot(S, keep); if (pg) s.pg = pg; return JSON.stringify(s).length; };
const squeeze = (S, keep) => { S.profile.name = ''; S.profile.name = 'x'.repeat(A.PREFS_MAX - sizeAt(S, keep)); };
const allMedals = (S) => { C.ACHIEVEMENTS.forEach((a, i) => { S.achievements[a.id] = Date.UTC(2025, 8, 1 + i, 9, 15 + (i % 40), 7, 123); }); return S; };

/* ---------- a forma curta ---------- */
describe('pg: o que vai para a nuvem, e em que forma', () => {
  it('sem nada cumprido, o documento é igual ao de antes (nem o campo existe)', () => {
    const S = base();
    expect(A.pgSnapshot(S, 1)).toBeNull();
    expect('pg' in A.prefsSnapshot(S)).toBe(false);
    expect('pg' in JSON.parse(A.prefsPack(S, 1).j)).toBe(false);
    S.missions = {}; S.extras = {}; S.challenges = {}; S.crewWon = {};
    expect(A.pgSnapshot(S, 1)).toBeNull();
    delete S.missions; delete S.extras; delete S.challenges; delete S.crewWon; // estado de um backup antigo, sem os mapas
    expect(A.pgSnapshot(S, 1)).toBeNull();
    expect(A.prefsPack(S, 1)).not.toBeNull();
  });
  it('uma semana vencida: o número é o dia da segunda-feira × 8 + os dias até a vitória; o mesmo vale para a turma (que ainda fecha a semana na segunda seguinte: 7)', () => {
    const S = base();
    S.challenges[MON] = ts(d(3), 21); // quinta à noite
    expect(wire(S)).toEqual({ w: [dn(MON) * 8 + 3] });
    S.challenges[d(7)] = ts(d(7), 9); // vencida logo na segunda: 0
    S.crewWon[MON] = ts(d(7), 8); // a turma fechou a semana de 3/3 na segunda-feira seguinte
    S.crewWon[d(7)] = ts(d(13), 23); // e a do dia 10 no domingo, às 23h
    expect(wire(S)).toEqual({ w: [dn(MON) * 8 + 3, dn(d(7)) * 8], c: [dn(MON) * 8 + 7, dn(d(7)) * 8 + 6] });
  });
  it('um mês vencido: (ano × 12 + mês − 1) × 32 + o dia da vitória − 1', () => {
    const S = base();
    S.challenges['2025-02'] = ts('2025-02-27', 22);
    S.challenges['2025-03'] = ts('2025-03-31', 23);
    expect(wire(S)).toEqual({ m: [(2025 * 12 + 1) * 32 + 26, (2025 * 12 + 2) * 32 + 30] });
  });
  it('um mês vencido pela turma (cm, 1.13.0): o mesmo número do mês do desafio pessoal, numa lista própria (as semanas da turma seguem em c)', () => {
    const S = base();
    S.crewWon['2025-02'] = ts('2025-02-27', 22);
    S.crewWon['2025-03'] = ts('2025-03-31', 23);
    expect(wire(S)).toEqual({ cm: [(2025 * 12 + 1) * 32 + 26, (2025 * 12 + 2) * 32 + 30] });
    S.challenges['2025-02'] = ts('2025-02-10', 9); // o desafio do mês de cada um é outra conta (m)
    S.crewWon[MON] = ts(d(2), 12); // e a semana da turma segue em c
    expect(wire(S)).toEqual({ m: [(2025 * 12 + 1) * 32 + 9], c: [dn(MON) * 8 + 2], cm: [(2025 * 12 + 1) * 32 + 26, (2025 * 12 + 2) * 32 + 30] });
  });
  it('os dias com missão: o último dia e um dígito por dia, do mais antigo ao último (1 = a do dia, 2 = a leve, 4 = a ousada, somados; dia em branco = 0)', () => {
    const S = base();
    S.missions[d(0)] = 1; S.missions[d(2)] = ts(d(2), 20);
    S.extras[d(2) + ':e'] = ts(d(2), 20); S.extras[d(3) + ':h'] = ts(d(3), 20);
    expect(wire(S)).toEqual({ d: d(3), f: '1034' }); // dia 0: 1 · dia 1: 0 · dia 2: 1 + 2 · dia 3: 4
    S.extras[d(2) + ':h'] = 1;
    expect(wire(S).f).toBe('1074');
    const T = base(); T.extras[d(5) + ':h'] = 1;
    expect(wire(T)).toEqual({ d: d(5), f: '4' }); // um dia só
  });
  it('só entra o que é de verdade: instante zero, negativo, texto, nulo ou NaN, chaves que não são dia, segunda-feira que não é segunda, mês de mentira, extras sem ":e" ou ":h"', () => {
    const S = base();
    S.challenges[MON] = 0; S.challenges[d(7)] = -5; S.challenges[d(14)] = 'ontem'; S.challenges[d(21)] = null; S.challenges[d(28)] = NaN; S.challenges[d(35)] = Infinity;
    S.challenges[d(1)] = ts(d(1), 12); // 4/3/2025 é terça-feira: não é uma semana
    S.challenges['2025-02-30'] = ts(d(1), 12); S.challenges['2025-13'] = ts(d(1), 12); S.challenges['2025-00'] = ts(d(1), 12); S.challenges['2025'] = ts(d(1), 12); S.challenges['2025-03-03-x'] = ts(d(1), 12);
    S.challenges['2016-12-26'] = ts('2016-12-26', 12); S.challenges['2016-12'] = ts('2016-12-28', 12); // antes de 2017: nada do Maré é tão antigo
    S.crewWon[d(2)] = ts(d(2), 12); S.crewWon[d(2) + 'x'] = ts(d(2), 12); // a semana da turma só vale numa segunda-feira
    S.crewWon['2025-02-30'] = ts(d(1), 12); S.crewWon['2025-13'] = ts(d(1), 12); S.crewWon['2025-00'] = ts(d(1), 12); S.crewWon['2025'] = ts(d(1), 12); S.crewWon['2016-12'] = ts('2016-12-28', 12); S.crewWon['2025-03-03-x'] = ts(d(1), 12); // e o mês, só um mês de verdade (o de 2017 em diante)
    S.crewWon['2025-04'] = 0; S.crewWon['2025-05'] = -5; S.crewWon['2025-06'] = 'ontem'; S.crewWon['2025-07'] = null; S.crewWon['2025-08'] = NaN; S.crewWon['2025-09'] = Infinity;
    S.missions['2025-02-30'] = 1; S.missions['lixo'] = 1; S.missions[d(0)] = 0; S.missions[d(1)] = NaN;
    S.extras[d(0) + ':x'] = 1; S.extras[d(0)] = 1; S.extras[d(0) + ':E'] = 1; S.extras['2025-02-30:e'] = 1; S.extras[d(0) + ':e '] = 1; S.extras[d(1) + ':h'] = 0; S.extras['xx'] = 1;
    expect(A.pgSnapshot(S, 1)).toBeNull();
  });
  it('só os mais recentes vão: 52 semanas, 24 meses, 52 semanas da turma e 400 dias (a medalha já conquistada volta por "ach", não pelo rastro)', () => {
    expect(A.PG_MAX).toEqual({ w: 52, m: 24, c: 52, d: 400, cm: 24 });
    const S = heavy(), pg = wire(S);
    expect(pg.w).toEqual([...Array(60).keys()].slice(8).map((i) => dn(d(i * 7)) * 8 + 4)); // as 8 mais antigas ficaram de fora
    expect(pg.c).toEqual([...Array(60).keys()].slice(8).map((i) => dn(d(i * 7)) * 8 + 6));
    expect(pg.m).toHaveLength(24);
    expect(pg.m[0]).toBe((2023 * 12 + 6) * 32 + 19); // 2023-01 a 2023-06 ficaram de fora: o mais antigo que foi é julho de 2023 (o 7º dos 30)
    expect(pg.m[23]).toBe((2025 * 12 + 5) * 32 + 19);
    expect(pg.cm).toHaveLength(24); // os meses da turma seguem a mesma janela dos meses de cada um
    expect(pg.cm[0]).toBe((2023 * 12 + 6) * 32 + 24); expect(pg.cm[23]).toBe((2025 * 12 + 5) * 32 + 24);
    expect(pg.d).toBe(C.addDays('2024-01-01', 499));
    expect(pg.f).toBe('7'.repeat(400));
  });
  it('a ordem é sempre a mesma (do mais antigo ao mais novo), qualquer que seja a ordem em que o mapa foi preenchido: o texto não muda sem motivo', () => {
    const a = base(), b = base();
    [0, 7, 14, 21].forEach((i) => { a.challenges[d(i)] = ts(d(i + 2), 12); });
    [21, 7, 0, 14].forEach((i) => { b.challenges[d(i)] = ts(d(i + 2), 12); });
    expect(A.prefsPack(a, 1).j).toBe(A.prefsPack(b, 1).j);
    expect(wire(a).w).toEqual([...wire(a).w].sort((x, y) => x - y));
  });
});

/* ---------- ida e volta ---------- */
describe('pg: ida e volta pelo documento da nuvem', () => {
  it('semanas, meses, turma, missões e extras voltam com as mesmas chaves, e a data da conquista é a mesma (o instante vira o meio-dia)', () => {
    const S = base();
    S.challenges[MON] = ts(d(4), 20); S.challenges[d(7)] = ts(d(7), 7); S.challenges['2025-02'] = ts('2025-02-27', 22);
    S.crewWon[MON] = ts(d(7), 8); S.crewWon[d(7)] = ts(d(13), 23); S.crewWon['2025-02'] = ts('2025-02-26', 21); S.crewWon['2025-03'] = ts('2025-03-31', 7); // as semanas e os meses da turma
    S.missions[d(0)] = ts(d(0), 20); S.missions[d(2)] = ts(d(2), 20); S.extras[d(2) + ':e'] = ts(d(2), 20); S.extras[d(3) + ':h'] = ts(d(3), 20);
    const back = cloud(S).prefs.pg;
    expect(keys(back.ch)).toEqual(keys(S.challenges));
    expect(keys(back.cw)).toEqual(keys(S.crewWon));
    expect(keys(back.mi)).toEqual(keys(S.missions));
    expect(keys(back.ex)).toEqual(keys(S.extras));
    // o dia da conquista é o do instante guardado (a segunda-feira que fechou a semana passada fica na segunda; a vitória de domingo às 23h, no domingo)
    expect(dayOf(back.ch[MON])).toBe(d(4)); expect(dayOf(back.ch[d(7)])).toBe(d(7)); expect(dayOf(back.ch['2025-02'])).toBe('2025-02-27');
    expect(dayOf(back.cw[MON])).toBe(d(7)); expect(dayOf(back.cw[d(7)])).toBe(d(13));
    expect(dayOf(back.cw['2025-02'])).toBe('2025-02-26'); expect(dayOf(back.cw['2025-03'])).toBe('2025-03-31'); // o mês da turma volta na mesma tabela, com a data da vitória
    expect(dayOf(back.mi[d(2)])).toBe(d(2)); expect(dayOf(back.ex[d(3) + ':h'])).toBe(d(3));
    Object.keys(back).forEach((c) => Object.keys(back[c]).forEach((k) => { expect(back[c][k], c + ' ' + k).toBeGreaterThan(1.5e12); }));
  });
  it('no aparelho novo (applyPrefs): as quatro listas entram, e o que o aparelho já tinha fica como está', () => {
    const S = base();
    S.challenges[MON] = ts(d(4), 20); S.crewWon[MON] = ts(d(6), 20); S.missions[d(1)] = ts(d(1), 20); S.extras[d(1) + ':e'] = ts(d(1), 20);
    const N = C.defaults(1700000000000);
    A.applyPrefs(N, cloud(S).prefs, 'restore');
    expect(keys(N.challenges)).toEqual([MON]); expect(keys(N.crewWon)).toEqual([MON]); expect(keys(N.missions)).toEqual([d(1)]); expect(keys(N.extras)).toEqual([d(1) + ':e']);
    // e o plano de restauração de uma conta (entrar num aparelho novo) faz o mesmo
    const plan = A.restorePlan({ prefs: A.prefsPack(S, 9), days: {} }), M = C.defaults(1700000000000);
    A.applyPlan(M, plan);
    expect(keys(M.challenges)).toEqual([MON]); expect(keys(M.crewWon)).toEqual([MON]);
  });
  it('o andamento das medalhas volta junto: 3 semanas vencidas, 2 meses, 1 vitória da turma e 2 trios de missões contam de novo no aparelho novo', () => {
    const S = base();
    [0, 7, 14].forEach((i) => { S.challenges[d(i)] = ts(d(i + 5), 20); });
    S.challenges['2025-02'] = ts('2025-02-27', 12); S.challenges['2025-03'] = ts('2025-03-30', 12);
    S.crewWon[d(0)] = ts(d(6), 20);
    [0, 1].forEach((i) => { const k = d(i); S.days[k] = { goal: 2000, entries: [{ id: k, t: ts(k, 10), ml: 2000, d: 'water' }] }; S.missions[k] = ts(k, 20); S.extras[k + ':e'] = ts(k, 20); S.extras[k + ':h'] = ts(k, 20); });
    const c0 = C.context(S);
    expect([c0.weeksWon, c0.monthsWon, c0.crewWins, c0.trios]).toEqual([3, 2, 1, 2]);
    const N = C.defaults(1700000000000);
    N.days = JSON.parse(JSON.stringify(S.days)); // os registros já voltam por conta própria (users/{uid}/days)
    A.applyPrefs(N, cloud(S).prefs, 'restore');
    const c1 = C.context(N);
    expect([c1.weeksWon, c1.monthsWon, c1.crewWins, c1.trios, c1.missions]).toEqual([3, 2, 1, 2, 2]);
    expect(C.context(N, d(2)).weeksWon).toBe(0); // e a data de cada conquista também volta (a semana de 3/3 fechou na sexta, 7/3)
    expect(C.context(N, d(4)).weeksWon).toBe(0);
    expect(C.context(N, d(5)).weeksWon).toBe(1);
  });
  it('um documento de antes (sem pg) volta sem mexer em nada do que o aparelho tem', () => {
    const S = base(); S.challenges[MON] = ts(d(4), 20);
    const velho = JSON.parse(A.prefsPack(base(), 1).j); // como um aparelho na 1.10.0 grava
    expect('pg' in velho).toBe(false);
    const p = A.prefsParse({ v: 1, u: 7, j: JSON.stringify(velho) }).prefs;
    expect(p.pg).toEqual({ ch: {}, cw: {}, mi: {}, ex: {} });
    A.applyPrefs(S, p, 'sync');
    expect(keys(S.challenges)).toEqual([MON]);
  });
  it('um app que não conhece o campo (1.10.0 ou antes) ignora o pg: tirando o pg, a leitura é a mesma', () => {
    const S = heavy();
    const a = A.cleanPrefs(JSON.parse(A.prefsPack(S, 1).j)), b = A.cleanPrefs(JSON.parse(JSON.stringify(Object.assign(JSON.parse(A.prefsPack(S, 1).j), { pg: undefined }))));
    delete a.pg; delete b.pg;
    expect(a).toEqual(b);
  });
});

/* ---------- o limite de tamanho ---------- */
describe('pg: cabe nos 4.000 caracteres das regras (que não mudam)', () => {
  it('as regras do Firestore são as de sempre: {v, u, j} e j até 4.000 caracteres (o campo novo vai dentro do texto j)', () => {
    expect(A.PREFS_MAX).toBe(4000);
    expect(RULES).toContain('d.j.size() <= ' + A.PREFS_MAX);
    expect(RULES).toContain('d.keys().hasOnly([\'v\', \'u\', \'j\'])');
    const p = A.prefsPack(heavy(), 1);
    expect(Object.keys(p).sort()).toEqual(['j', 'u', 'v']);
    expect(typeof p.j).toBe('string');
  });
  it('o pior caso de verdade (tudo cheio, as 39 medalhas, nome e apelido enormes, recados) cabe com folga, com o rastro inteiro', () => {
    const S = allMedals(heavy());
    S.profile.name = 'ç'.repeat(30); S.social.nick = '🐠'.repeat(20);
    for (let i = 0; i < 60; i++) S.ui['tip_' + 'x'.repeat(20) + i] = 1;
    const p = A.prefsPack(S, 1), o = JSON.parse(p.j);
    expect(p).not.toBeNull();
    expect(p.j.length).toBeLessThanOrEqual(A.PREFS_MAX);
    expect(o.ui).toEqual({}); // os 60 recados saíram primeiro (como antes)
    expect(o.pg.w).toHaveLength(52); expect(o.pg.m).toHaveLength(24); expect(o.pg.c).toHaveLength(52); expect(o.pg.cm).toHaveLength(24); expect(o.pg.f).toHaveLength(400); // o rastro ficou inteiro
    expect(Object.keys(o.ach)).toHaveLength(39);
    // sem os recados, sobra bastante espaço: o rastro cheio ocupa pouco mais de um terço do limite
    expect(p.j.length).toBeLessThan(3100);
    expect(JSON.stringify(o.pg).length).toBeLessThan(1600); // 1.514 com os 24 meses da turma (eram 1.346 sem eles)
  });
  it('se passar do limite, saem os recados, depois o rastro (só os mais recentes, por etapas, até não sobrar nada) e por último as datas das medalhas', () => {
    const S = allMedals(heavy());
    const give = (keep) => { squeeze(S, keep); const p = A.prefsPack(S, 1); return { p: p, o: p ? JSON.parse(p.j) : null }; }; // o texto com `keep` do rastro tem 4.000 exatos
    const full = give(1);
    expect(full.o.pg.w).toHaveLength(52); expect(full.p.j.length).toBe(A.PREFS_MAX);
    const half = give(0.5);
    expect(sizeAt(S, 1)).toBeGreaterThan(A.PREFS_MAX);
    expect(half.o.pg).toEqual(A.pgSnapshot(S, 0.5)); expect(half.o.pg.w).toHaveLength(26); expect(half.o.pg.f).toHaveLength(200);
    expect(Object.keys(half.o.ach)).toHaveLength(39);
    const quarter = give(0.25);
    expect(sizeAt(S, 0.5)).toBeGreaterThan(A.PREFS_MAX);
    expect(quarter.o.pg).toEqual(A.pgSnapshot(S, 0.25)); expect(quarter.o.pg.w).toHaveLength(13); expect(quarter.o.pg.f).toHaveLength(100);
    const tenth = give(0.1);
    expect(sizeAt(S, 0.25)).toBeGreaterThan(A.PREFS_MAX);
    expect(tenth.o.pg).toEqual(A.pgSnapshot(S, 0.1)); expect(tenth.o.pg.w).toHaveLength(6); expect(tenth.o.pg.f).toHaveLength(40);
    expect(Object.keys(tenth.o.ach)).toHaveLength(39); // as medalhas ainda têm as datas
    // com um único item de cada o texto ainda não cabe: o rastro vai embora de uma vez, e as datas das medalhas continuam
    const sem = give(0.0001);
    expect(sizeAt(S, 0.1)).toBeGreaterThan(A.PREFS_MAX);
    expect('pg' in sem.o).toBe(false); expect(Object.keys(sem.o.ach)).toHaveLength(39);
    // e se nem assim cabe, as datas das medalhas saem; se nem assim, nada é enviado
    S.profile.name = 'x'.repeat(A.PREFS_MAX - 1000);
    const noAch = A.prefsPack(S, 1);
    expect(noAch).not.toBeNull(); expect(JSON.parse(noAch.j).ach).toEqual({}); expect('pg' in JSON.parse(noAch.j)).toBe(false);
    S.profile.name = 'x'.repeat(A.PREFS_MAX + 10);
    expect(A.prefsPack(S, 1)).toBeNull();
  });
  it('pgSnapshot com a fração: só os mais recentes (arredonda para cima), e 0 (ou menos) não manda nada', () => {
    const S = heavy();
    expect(A.pgSnapshot(S, 0)).toBeNull(); expect(A.pgSnapshot(S, -1)).toBeNull(); expect(A.pgSnapshot(S, NaN)).toBeNull();
    expect(A.pgSnapshot(S, 0.5).w).toHaveLength(26);
    expect(A.pgSnapshot(S, 0.01).w).toHaveLength(1); // arredonda para cima: sempre pelo menos a mais recente
    expect(A.pgSnapshot(S, 0.01).w[0]).toBe(dn(d(59 * 7)) * 8 + 4);
    expect(A.pgSnapshot(S).w).toHaveLength(52); // sem a fração: tudo o que cabe
    expect(A.pgSnapshot(S, 7).w).toHaveLength(52); // mais que 1 não passa do limite
  });
});

/* ---------- junção ---------- */
describe('mergePg: juntar o rastro da nuvem ao deste aparelho', () => {
  it('só entra o que aqui ainda não existe; o que já está guardado (com o instante de verdade) não é trocado', () => {
    const S = base(); S.challenges[MON] = 111111; S.missions[d(0)] = 222222;
    const pg = { ch: { [MON]: 999, [d(7)]: 333 }, cw: { [d(7)]: 444 }, mi: { [d(0)]: 888, [d(1)]: 555 }, ex: { [d(1) + ':e']: 666 } };
    expect(A.mergePg(S, pg)).toBe(4); // as 4 novas (a semana de 10/3, a da turma, o dia 4/3 e a leve de 4/3); a semana de 3/3 e a missão de 3/3 já estavam aqui
    expect(S.challenges).toEqual({ [MON]: 111111, [d(7)]: 333 });
    expect(S.crewWon).toEqual({ [d(7)]: 444 });
    expect(S.missions).toEqual({ [d(0)]: 222222, [d(1)]: 555 });
    expect(S.extras).toEqual({ [d(1) + ':e']: 666 });
  });
  it('o mês vencido pela turma (chave AAAA-MM em crewWon) entra como qualquer outra vitória, sem trocar o que já está aqui, e não se mistura com a semana de mesmo mês', () => {
    const S = base(); S.crewWon['2025-02'] = 111; S.crewWon[MON] = 222;
    expect(A.mergePg(S, { ch: {}, cw: { '2025-02': 999, '2025-03': 333, [d(7)]: 444 }, mi: {}, ex: {} })).toBe(2);
    expect(S.crewWon).toEqual({ '2025-02': 111, '2025-03': 333, [MON]: 222, [d(7)]: 444 });
    expect(S.challenges).toEqual({});
  });
  it('é idempotente (juntar de novo não muda nada) e a ordem não importa: duas cópias juntas dão o mesmo resultado nos dois sentidos', () => {
    const a = base(), b = base();
    a.challenges[MON] = 1; a.crewWon[d(7)] = 2; b.challenges[d(7)] = 3; b.crewWon[MON] = 4; b.missions[d(0)] = 5;
    const pa = cloud(a).prefs.pg, pb = cloud(b).prefs.pg;
    const x = base(), y = base();
    A.mergePg(x, pa); A.mergePg(x, pb); A.mergePg(y, pb); A.mergePg(y, pa);
    expect(keys(x.challenges)).toEqual(keys(y.challenges)); expect(keys(x.crewWon)).toEqual(keys(y.crewWon)); expect(keys(x.missions)).toEqual(keys(y.missions));
    expect(keys(x.challenges)).toEqual([MON, d(7)]);
    expect(A.mergePg(x, pa)).toBe(0); expect(A.mergePg(x, pb)).toBe(0);
  });
  it('um valor falso ou lixo no mapa daqui (0, nulo, texto, NaN) conta como "não existe": a cópia da nuvem entra no lugar', () => {
    const S = base(); S.challenges[MON] = 0; S.challenges[d(7)] = 'x'; S.challenges[d(14)] = null; S.challenges[d(21)] = NaN;
    const pg = { ch: { [MON]: 5, [d(7)]: 6, [d(14)]: 7, [d(21)]: 8 }, cw: {}, mi: {}, ex: {} };
    expect(A.mergePg(S, pg)).toBe(4);
    expect(S.challenges).toEqual({ [MON]: 5, [d(7)]: 6, [d(14)]: 7, [d(21)]: 8 });
  });
  it('aguenta um estado sem os mapas, mapas do tipo errado e um pg estranho (nulo, texto, lista, mapas faltando)', () => {
    const S = base(); delete S.challenges; S.crewWon = [1, 2]; S.missions = 'x'; S.extras = null;
    expect(A.mergePg(S, { ch: { [MON]: 9 }, cw: { [MON]: 9 }, mi: { [d(0)]: 9 }, ex: { [d(0) + ':e']: 9 } })).toBe(4);
    expect(S.challenges).toEqual({ [MON]: 9 }); expect(S.crewWon).toEqual({ [MON]: 9 }); expect(S.missions).toEqual({ [d(0)]: 9 }); expect(S.extras).toEqual({ [d(0) + ':e']: 9 });
    [null, undefined, 'texto', 5, [], { ch: 'x', cw: [], mi: null }].forEach((bad) => { expect(A.mergePg(base(), bad), JSON.stringify(bad)).toBe(0); });
    expect(A.mergePg(base(), { ch: { [MON]: 0, [d(7)]: -1, [d(14)]: 'x', [d(21)]: NaN } })).toBe(0); // da nuvem, só vale instante de verdade
  });
  it('applyPrefs aguenta um objeto de ajustes sem o pg (um teste ou um backup de antes)', () => {
    const S = base(); S.challenges[MON] = 1;
    const p = A.cleanPrefs({}); delete p.pg;
    expect(() => A.applyPrefs(S, p, 'sync')).not.toThrow();
    expect(keys(S.challenges)).toEqual([MON]);
  });
});

/* ---------- a nuvem ficou para trás? ---------- */
describe('pgAhead: este aparelho tem missão ou desafio cumprido que a nuvem não tem?', () => {
  it('sem nada aqui, nunca; igual à nuvem, não; a nuvem com mais coisas, não (o app junta antes de perguntar)', () => {
    expect(A.pgAhead(base(), null)).toBe(false);
    expect(A.pgAhead(base(), cloud(heavy()).prefs.pg)).toBe(false);
    const S = base(); S.challenges[MON] = ts(d(4), 20); S.crewWon[MON] = ts(d(6), 20); S.missions[d(1)] = ts(d(1), 20); S.extras[d(1) + ':e'] = ts(d(1), 20);
    expect(A.pgAhead(S, cloud(S).prefs.pg)).toBe(false);
    const more = base(); more.challenges[MON] = 1; more.challenges[d(7)] = 1; more.crewWon[MON] = 1; more.crewWon[d(7)] = 1; more.missions[d(1)] = 1; more.missions[d(2)] = 1; more.extras[d(1) + ':e'] = 1; more.extras[d(1) + ':h'] = 1;
    S.challenges = { [MON]: ts(d(4), 20) }; S.crewWon = { [MON]: ts(d(6), 20) }; S.missions = { [d(1)]: ts(d(1), 20) }; S.extras = { [d(1) + ':e']: ts(d(1), 20) };
    expect(A.pgAhead(S, cloud(more).prefs.pg)).toBe(false);
  });
  it('uma coisa só daqui basta, em qualquer das quatro listas', () => {
    const mk = () => { const S = base(); S.challenges[MON] = 1; S.crewWon[MON] = 1; S.missions[d(1)] = 1; S.extras[d(1) + ':e'] = 1; return S; };
    const cl = cloud(mk()).prefs.pg;
    const a = mk(); a.challenges[d(7)] = ts(d(7), 12); expect(A.pgAhead(a, cl)).toBe(true);
    const b = mk(); b.crewWon[d(7)] = ts(d(13), 12); expect(A.pgAhead(b, cl)).toBe(true);
    const c = mk(); c.missions[d(2)] = 1; expect(A.pgAhead(c, cl)).toBe(true);
    const e = mk(); e.extras[d(1) + ':h'] = 1; expect(A.pgAhead(e, cl)).toBe(true);
    const m = mk(); m.challenges['2025-02'] = ts('2025-02-20', 12); expect(A.pgAhead(m, cl)).toBe(true); // um mês
    const t = mk(); t.crewWon['2025-02'] = ts('2025-02-20', 12); expect(A.pgAhead(t, cl)).toBe(true); // um mês vencido pela turma (1.13.0)
    expect(A.pgAhead(t, cloud(t).prefs.pg)).toBe(false); // e, depois de enviado, a nuvem não fica para trás
  });
  it('a nuvem de um aparelho antigo (sem pg) fica para trás de quem tem alguma coisa, e não de quem não tem nada', () => {
    const S = base(); S.missions[d(1)] = 1;
    const velho = A.prefsParse({ v: 1, u: 3, j: JSON.stringify(JSON.parse(A.prefsPack(base(), 1).j)) }).prefs.pg;
    expect(A.pgAhead(S, velho)).toBe(true);
    expect(A.pgAhead(base(), velho)).toBe(false);
  });
  it('o que nunca caberia na nuvem (além da janela, ou cortado por tamanho) não faz "ficar para trás": sem isso os ajustes subiriam a cada abertura', () => {
    const S = heavy(); // 60 semanas: as 8 mais antigas nunca vão
    expect(A.pgAhead(S, cloud(S).prefs.pg)).toBe(false);
    const T = heavy(); squeeze(T, 0.25); // aperta o texto: o rastro vai cortado, só um quarto
    const o = JSON.parse(A.prefsPack(T, 1).j);
    expect(o.pg.w).toHaveLength(13);
    expect(A.pgAhead(T, cloud(T).prefs.pg)).toBe(false);
    expect(A.pgAhead(T, { ch: {}, cw: {}, mi: {}, ex: {} })).toBe(true); // mas a nuvem sem nada, sim, está para trás
  });
  it('limpo e sem estourar com o que a nuvem mandar (nulo, texto, lista, mapas do tipo errado)', () => {
    const S = base(); S.missions[d(1)] = 1;
    [null, undefined, 'x', 7, [], { ch: 'x', cw: 5, mi: [], ex: null }].forEach((bad) => { expect(A.pgAhead(S, bad), JSON.stringify(bad)).toBe(true); });
    expect(A.pgAhead(base(), 'x')).toBe(false);
  });
  it('quando o texto nem cabe (estado impossível), não há o que enviar: não fica para trás', () => {
    const S = base(); S.missions[d(1)] = 1; S.profile.name = 'x'.repeat(5000);
    expect(A.prefsPack(S, 1)).toBeNull();
    expect(A.pgAhead(S, {})).toBe(false);
  });
});

/* ---------- tudo o que vem de fora passa pela limpeza ---------- */
describe('cleanPg: nada vindo da nuvem entra sem conferir', () => {
  const NOW = new Date(2025, 5, 15, 12, 0).getTime(); // 15/6/2025, meio-dia local (em qualquer fuso, "hoje" é o dia 15)
  const clean = (raw) => A.cleanPg(raw, NOW);
  const empty = { ch: {}, cw: {}, mi: {}, ex: {} };
  const wk = (k, off) => dn(k) * 8 + (off || 0);
  it('tipos errados no lugar de tudo: sempre um objeto completo e vazio', () => {
    [undefined, null, 'x', 7, true, [], [1, 2], () => 1].forEach((bad) => { expect(clean(bad), String(bad)).toEqual(empty); });
    expect(clean({ w: 'abc', c: 5, m: { 0: 1 }, cm: 'x', d: 7, f: [1] })).toEqual(empty);
    expect(clean({ w: null, c: undefined, m: true, cm: { 0: 1 }, d: null, f: null })).toEqual(empty);
    expect(clean({ cm: 7 })).toEqual(empty); expect(clean({ cm: null })).toEqual(empty); expect(clean({ cm: [] })).toEqual(empty);
  });
  it('um número só vale se for inteiro, finito e não negativo (texto, fração, NaN, infinito, nulo, listas, mapas e números enormes ficam de fora)', () => {
    const good = wk('2025-03-03');
    expect(clean({ w: [good, good + 0.5, '161200', null, -8, NaN, Infinity, {}, [good], true, 1e99, good + 8 * 7 * 1e6] }).ch).toEqual({ '2025-03-03': ts('2025-03-03', 12) });
    const m = (2025 * 12 + 1) * 32 + 4; // fevereiro de 2025, dia 5
    expect(clean({ m: [m, 1.5, '5', null, -1, NaN, Infinity, {}, 1e99, [m]] }).ch).toEqual({ '2025-02': ts('2025-02-05', 12) });
    expect(clean({ cm: [m, 1.5, '5', null, -1, NaN, Infinity, {}, 1e99, [m]] }).cw).toEqual({ '2025-02': ts('2025-02-05', 12) }); // o mês da turma, a mesma regra
  });
  it('a semana: tem de ser uma segunda-feira de verdade, de 2017 em diante, e a vitória não pode estar no futuro (amanhã ainda vale: um fuso à frente já está nele)', () => {
    const one = (v) => clean({ w: [v] }).ch;
    expect(one(wk('2025-03-04'))).toEqual({}); // terça-feira
    expect(one(wk('2025-03-05'))).toEqual({}); // quarta-feira
    expect(one(wk('2016-12-26'))).toEqual({}); // segunda-feira, mas antes de 2017
    expect(one(wk('2025-06-09'))).toEqual({ '2025-06-09': ts('2025-06-09', 12) });
    expect(one(wk('2025-06-09', 6))).toEqual({ '2025-06-09': NOW }); // vencida no domingo, 15/6: hoje, ao meio-dia (nunca depois do agora)
    expect(one(wk('2025-06-09', 7))).toEqual({ '2025-06-09': NOW }); // fechada na segunda seguinte, 16/6: amanhã ainda vale, mas o instante não passa do agora
    expect(one(wk('2025-06-16'))).toEqual({ '2025-06-16': NOW }); // a semana de amanhã
    expect(one(wk('2025-06-16', 1))).toEqual({}); // vitória depois de amanhã
    expect(one(wk('2025-06-23'))).toEqual({}); // daqui a uma semana
  });
  it('a turma usa a mesma regra da semana, em outra lista (cw), e não se mistura com os desafios de cada um (ch)', () => {
    const v = wk('2025-03-03', 7);
    const a = clean({ w: [v] }), b = clean({ c: [v] });
    expect(keys(a.ch)).toEqual(['2025-03-03']); expect(keys(a.cw)).toEqual([]);
    expect(keys(b.cw)).toEqual(['2025-03-03']); expect(keys(b.ch)).toEqual([]);
    expect(dayOf(b.cw['2025-03-03'])).toBe('2025-03-10'); // a vitória da segunda-feira seguinte
  });
  it('o mês da turma (cm) usa a regra do mês, em outra lista (cw), sem se misturar com o desafio do mês de cada um (ch) nem com as semanas da turma (c)', () => {
    const v = (2025 * 12 + 1) * 32 + 4; // fevereiro de 2025, dia 5
    const a = clean({ m: [v] }), b = clean({ cm: [v] }), c = clean({ c: [v] });
    expect(keys(a.ch)).toEqual(['2025-02']); expect(keys(a.cw)).toEqual([]);
    expect(keys(b.cw)).toEqual(['2025-02']); expect(keys(b.ch)).toEqual([]);
    expect(dayOf(b.cw['2025-02'])).toBe('2025-02-05');
    expect(keys(c.cw).every((k) => k.length === 10)).toBe(true); // um número de mês na lista das semanas, se vier, vira uma segunda-feira ou nada, nunca uma chave de mês
    const mo = (y, m, off) => (y * 12 + m - 1) * 32 + off;
    expect(dayOf(clean({ cm: [mo(2025, 2, 30)] }).cw['2025-02'])).toBe('2025-02-28'); // o dia nunca passa do fim do mês
    expect(clean({ cm: [mo(2016, 12, 3)] }).cw).toEqual({}); expect(clean({ cm: [mo(2201, 1, 0)] }).cw).toEqual({}); expect(clean({ cm: [mo(2025, 7, 0)] }).cw).toEqual({}); // antes de 2017, depois de 2200 e o futuro
    expect(clean({ cm: [mo(2025, 6, 10), mo(2025, 6, 20)] }).cw).toEqual({ '2025-06': ts('2025-06-11', 12) }); // o dia 21 de junho ainda não chegou, mas o 11 sim: a mesma chave não repete
  });
  it('o mês: ano de 2017 a 2200, o dia da vitória nunca passa do último dia do mês, e o futuro fica de fora', () => {
    const mo = (y, m, off) => (y * 12 + m - 1) * 32 + off;
    const one = (v) => clean({ m: [v] }).ch;
    expect(dayOf(one(mo(2025, 2, 30))['2025-02'])).toBe('2025-02-28'); // 31 de fevereiro não existe: vale o último dia do mês
    expect(dayOf(one(mo(2025, 2, 27))['2025-02'])).toBe('2025-02-28');
    expect(dayOf(one(mo(2025, 4, 30))['2025-04'])).toBe('2025-04-30');
    expect(dayOf(one(mo(2025, 1, 30))['2025-01'])).toBe('2025-01-31');
    expect(one(mo(2016, 12, 3))).toEqual({}); // antes de 2017
    expect(one(mo(2201, 1, 0))).toEqual({}); // depois de 2200
    expect(dayOf(one(mo(2025, 6, 10))['2025-06'])).toBe('2025-06-11');
    expect(one(mo(2025, 6, 20))).toEqual({}); // dia 21 de junho ainda não chegou
    expect(one(mo(2025, 7, 0))).toEqual({}); // julho ainda não chegou
  });
  it('os dias com missão: cada dígito de f é um dia (o último é o d), com os bits 1 (a do dia), 2 (a leve) e 4 (a ousada)', () => {
    const out = clean({ d: '2025-06-15', f: '1234567' }); // 9/6 a 15/6
    expect(keys(out.mi)).toEqual(['2025-06-09', '2025-06-11', '2025-06-13', '2025-06-15']); // dígitos 1, 3, 5 e 7: têm o bit 1
    expect(keys(out.ex)).toEqual(['2025-06-10:e', '2025-06-11:e', '2025-06-12:h', '2025-06-13:h', '2025-06-14:e', '2025-06-14:h', '2025-06-15:e', '2025-06-15:h']);
    expect(dayOf(out.mi['2025-06-15'])).toBe('2025-06-15'); expect(out.mi['2025-06-15']).toBe(NOW);
    expect(out.ex['2025-06-10:e']).toBe(ts('2025-06-10', 12));
    expect(clean({ d: '2025-06-16', f: '1' }).mi).toEqual({ '2025-06-16': NOW }); // d = amanhã: vale (fuso à frente), sem passar do agora
  });
  it('d só vale se for um dia de verdade que já chegou, e f só com dígitos de 0 a 7 (de 1 a 800)', () => {
    ['2025-02-30', '2025-6-15', 'lixo', '', null, 5, '2025-06-17', '2030-01-01', {}, ['2025-06-15']].forEach((bad) => { expect(clean({ d: bad, f: '7' }), String(bad)).toEqual(empty); });
    ['', '8', '9', 'a', '1 2', '-1', '1.5', '7'.repeat(801), 5, null, ['7'], { 0: 7 }, '1\n2'].forEach((bad) => { expect(clean({ d: '2025-06-15', f: bad }), JSON.stringify(bad)).toEqual(empty); });
    expect(Object.keys(clean({ d: '2025-06-15', f: '7'.repeat(800) }).mi)).toHaveLength(800);
    expect(clean({ d: '2025-06-15', f: '0000000' })).toEqual(empty); // sete dias em branco
    expect(clean({ d: '2017-01-02', f: '777' }).mi).toEqual({ '2017-01-01': ts('2017-01-01', 12), '2017-01-02': ts('2017-01-02', 12) }); // o 1º dia seria 31/12/2016: de fora
  });
  it('as listas gigantes são cortadas (um documento forjado não trava o app), e nada contamina os objetos de todos (__proto__, constructor)', () => {
    const big = []; for (let i = 0; i < 300; i++) big.push(wk(C.addDays('2025-06-09', -7 * i)));
    expect(Object.keys(clean({ w: big }).ch)).toHaveLength(52 * 4); // as 208 primeiras
    expect(Object.keys(clean({ c: big }).cw)).toHaveLength(52 * 4);
    const bigM = []; for (let i = 0; i < 100; i++) bigM.push((2025 * 12 + 5 - i) * 32); // 100 meses, de junho de 2025 para trás
    expect(Object.keys(clean({ cm: bigM }).cw)).toHaveLength(24 * 4); // os 96 primeiros
    const pgText = '{"__proto__":{"w":[161200]},"w":[],"c":[],"m":[],"cm":[],"pg":{"__proto__":{"polluted":1}},"constructor":{"prototype":{"z":3}},"d":"2025-06-15","f":"7"}';
    const p = A.prefsParse({ v: 1, u: 5, j: JSON.stringify({ pg: JSON.parse(pgText) }) });
    expect(({}).polluted).toBeUndefined(); expect(({}).z).toBeUndefined(); expect(({}).w).toBeUndefined();
    ['ch', 'cw', 'mi', 'ex'].forEach((c) => { expect(Object.getPrototypeOf(p.prefs.pg[c])).toBe(Object.prototype); });
    expect(keys(p.prefs.pg)).toEqual(['cw', 'ch', 'ex', 'mi'].sort());
    expect(keys(p.prefs.pg.mi)).toEqual(['2025-06-15']); // o dia certo entrou; o resto do documento forjado, não
  });
  it('as chaves que saem são sempre as do app: semana AAAA-MM-DD (segunda-feira), mês AAAA-MM, dia AAAA-MM-DD, e o dia com :e ou :h; nenhum instante no futuro (200 documentos sorteados)', () => {
    let seed = 12345;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
    for (let r = 0; r < 200; r++) {
      const raw = { w: [], c: [], m: [], cm: [], d: '2025-0' + (1 + Math.floor(rnd() * 5)) + '-1' + Math.floor(rnd() * 10), f: '' };
      for (let i = 0; i < 20; i++) { raw.w.push(Math.floor(rnd() * 400000)); raw.c.push(Math.floor(rnd() * 400000)); raw.m.push(Math.floor(rnd() * 900000)); raw.cm.push(Math.floor(rnd() * 900000)); }
      for (let i = 0; i < 30; i++) raw.f += String(Math.floor(rnd() * 8));
      const out = clean(raw);
      Object.keys(out.ch).concat(Object.keys(out.cw)).forEach((k) => {
        if (k.length === 10) { expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(((dn(k) % 7) + 7) % 7, k).toBe(4); } else expect(k).toMatch(/^20\d{2}-(0[1-9]|1[0-2])$/);
      });
      Object.keys(out.mi).forEach((k) => { expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/); });
      Object.keys(out.ex).forEach((k) => { expect(k).toMatch(/^\d{4}-\d{2}-\d{2}:[eh]$/); });
      Object.keys(out).forEach((c) => Object.keys(out[c]).forEach((k) => { expect(out[c][k]).toBeGreaterThan(1.4e12); expect(out[c][k]).toBeLessThanOrEqual(NOW); }));
    }
  });
});
