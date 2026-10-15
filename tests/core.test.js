// Maré — testes da lógica pura (Parte 5). Rodar: npm test
// Datas em junho/2026 (sem horário de verão nos fusos comuns): os testes valem em qualquer fuso.
import { describe, it, expect, afterEach } from 'vitest';
import * as C from '../public/js/core.js';
import { esc, num, plural, shiftYm } from '../public/js/store.js';

afterEach(() => { C.setMix(false); }); // "somar na meta" é um interruptor global: todo teste começa com ele desligado

const at = (d, h, m) => new Date(2026, 5, d, h, m || 0).getTime(); // 2026-06-d h:m, horário local
const day = (goal, list) => ({ goal: goal, entries: list.map((x, i) => ({ id: 'e' + i, t: x[0], ml: x[1], d: x[2] || 'water' })) });
const met = () => day(2000, [[at(1, 10), 2000]]);

describe('datas', () => {
  it('dayKey, keyToDate e addDays atravessam mês, ano e bissexto', () => {
    expect(C.dayKey(new Date(2026, 5, 9, 23, 59))).toBe('2026-06-09');
    expect(C.addDays('2026-05-31', 1)).toBe('2026-06-01');
    expect(C.addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(C.addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(C.keyToDate('2026-06-06').getDay()).toBe(6); // sábado
  });
  it('hm e fmtHM', () => {
    expect(C.hm('07:30')).toBe(450);
    expect(C.hm('')).toBe(0);
    expect(C.fmtHM(450)).toBe('07:30');
    expect(C.fmtHM(1500)).toBe('01:00'); // depois da meia-noite
  });
});

describe('bebidas e totais', () => {
  it('só água e água com gás contam na meta; os outros líquidos ficam numa contagem à parte', () => {
    const d = day(2000, [[at(1, 9), 250], [at(1, 10), 300, 'sparkling'], [at(1, 11), 150, 'coffee'], [at(1, 12), 200, 'juice']]);
    expect(C.dayTotal(d)).toBe(550); // 250 + 300
    expect(C.dayOther(d)).toBe(350); // 150 + 200
    expect(C.dayOther(undefined)).toBe(0);
    expect(C.isMet(day(2000, [[at(1, 9), 1000], [at(1, 10), 2000, 'milk']]))).toBe(false); // leite não completa a meta
    expect(C.isMet(day(2000, [[at(1, 9), 2000, 'sparkling']]))).toBe(true); // água com gás conta igual
  });
  it('catálogo: 2 águas e 6 outros líquidos, sem refrigerante nem álcool', () => {
    expect(C.WATERS.map((d) => d.id)).toEqual(['water', 'sparkling']);
    expect(C.OTHERS.map((d) => d.id)).toEqual(['coconut', 'tea', 'coffee', 'juice', 'milk', 'sport']);
    expect(C.DRINKS.some((d) => d.id === 'soda' || d.id === 'alcohol')).toBe(false);
    expect(C.retired('soda') && C.retired('alcohol') && !C.retired('coffee')).toBe(true);
    expect(C.drink('xyz').id).toBe('water'); // id desconhecido vira água
    expect(C.isOther({ d: 'tea' }) && C.isWater({ d: 'water' }) && !C.isOther({ d: 'sparkling' })).toBe(true);
  });
  it('isMet exige registro e meta', () => {
    expect(C.isMet(undefined)).toBe(false);
    expect(C.isMet({ goal: 2000, entries: [] })).toBe(false);
    expect(C.isMet(day(2000, [[at(1, 9), 2000]]))).toBe(true);
    expect(C.isMet(day(2000, [[at(1, 9), 1999]]))).toBe(false);
  });
});

describe('somar outros líquidos na meta (opcional)', () => {
  const mixDay = () => day(2000, [[at(1, 8), 600], [at(1, 9), 300, 'coffee']]);
  it('vem desligado: os outros líquidos ficam fora da meta', () => {
    expect(C.mixOn()).toBe(false);
    expect(C.dayTotal(mixDay())).toBe(600);
    expect(C.otherCounted(mixDay())).toBe(0);
    expect(C.counted(mixDay().entries, 2000)).toBe(600);
  });
  it('ligado: os outros líquidos somam, mas só até metade da meta', () => {
    C.setMix(true);
    expect(C.mixOn()).toBe(true);
    expect(C.dayTotal(mixDay())).toBe(900); // 600 de água + 300 de café
    const cheio = day(2000, [[at(1, 8), 600], [at(1, 9), 1500, 'juice']]);
    expect(C.dayTotal(cheio)).toBe(1600); // o suco entra só até 1.000 ml (metade de 2.000)
    expect(C.otherCounted(cheio)).toBe(1000);
    expect(C.dayOther(cheio)).toBe(1500); // a contagem da 2ª gota continua mostrando tudo
    expect(C.dayWater(cheio)).toBe(600); // e a água é sempre só água
    expect(C.dayTotal(undefined)).toBe(0);
    expect(C.counted([], 2000)).toBe(0);
    expect(C.counted(undefined, 2000)).toBe(0);
  });
  it('trava: pelo menos metade da meta precisa vir de água para o dia valer', () => {
    C.setMix(true);
    expect(C.isMet(day(2000, [[at(1, 9), 1000], [at(1, 10), 1000, 'tea']]))).toBe(true); // 1.000 + 1.000
    expect(C.isMet(day(2000, [[at(1, 9), 999], [at(1, 10), 5000, 'milk']]))).toBe(false); // falta 1 ml de água
    expect(C.isMet(day(2000, [[at(1, 9), 1500, 'coffee']]))).toBe(false); // só café nunca basta
    expect(C.isMet(day(2000, [[at(1, 9), 1200], [at(1, 10), 800, 'coconut']]))).toBe(true);
    expect(C.isMet({ entries: [{ id: 'a', t: at(1, 9), ml: 1000, d: 'water' }, { id: 'b', t: at(1, 10), ml: 1000, d: 'tea' }] })).toBe(true); // sem meta gravada: 2.000
  });
  it('o limite acompanha a meta do próprio dia', () => {
    C.setMix(true);
    expect(C.dayTotal(day(3000, [[at(1, 9), 100], [at(1, 10), 4000, 'juice']]))).toBe(1600); // 100 + 1.500
    expect(C.dayTotal(day(1200, [[at(1, 9), 100], [at(1, 10), 4000, 'juice']]))).toBe(700); // 100 + 600
  });
  it('sequência e recorde seguem a meta somada', () => {
    const j = (d) => day(2000, [[at(d, 9), 1000], [at(d, 12), 1000, 'juice']]);
    const days = { '2026-06-07': j(7), '2026-06-08': j(8), '2026-06-09': j(9) };
    expect(C.streak(days, '2026-06-10')).toBe(0);
    C.setMix(true);
    expect(C.streak(days, '2026-06-10')).toBe(3);
    expect(C.bestStreak(days)).toBe(3);
  });
  it('missões de volume somam os outros líquidos; as de "beber água" não', () => {
    const M = {};
    C.MISSIONS.forEach((m) => { M[m.id] = m; });
    const es = day(2000, [[at(10, 8), 300], [at(10, 9), 300, 'coffee'], [at(10, 11), 200, 'juice']]).entries;
    expect(M.am500.p(es, 2000)).toBeCloseTo(0.6); // desligado: 300 ml de água
    expect(M.noon.p(es, 2000)).toBeCloseTo(0.3);
    C.setMix(true);
    expect(M.am500.p(es, 2000)).toBeCloseTo(1.2); // 300 + 300 antes das 10h
    expect(M.noon.p(es, 2000)).toBeCloseTo(0.8); // 300 + 300 + 200
    expect(M.by19.p(es, 2000)).toBeCloseTo(0.4);
    expect(M.six.p(es, 2000)).toBeCloseTo(1 / 6); // só 1 gole de água
    expect(M.thirds.p(es, 2000)).toBeCloseTo(1 / 3);
  });
  it('medalhas: a meta usa o total somado; volume e primeira gota continuam só de água', () => {
    const S = C.defaults();
    S.days['2026-06-07'] = day(2000, [[at(7, 8), 1000], [at(7, 9), 1000, 'juice']]);
    let ids = C.newAchievements(S).map((a) => a.id);
    expect(ids).toContain('first');
    expect(ids).not.toContain('goal');
    C.setMix(true);
    ids = C.newAchievements(S).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first', 'goal', 'sunset'])); // meta batida às 9h, antes das 18h
    expect(C.context(S).totalMl).toBe(1000); // "L de água": só a água
    const so = C.defaults();
    so.days['2026-06-07'] = day(2000, [[at(7, 8), 3000, 'coffee']]);
    expect(C.newAchievements(so).map((a) => a.id)).toEqual([]); // só café nunca rende medalha
  });
  it('migrate: o interruptor vem desligado e só aceita verdadeiro de verdade', () => {
    expect(C.defaults().profile.mix).toBe(false);
    expect(C.migrate({ profile: { name: 'Ana' } }).profile.mix).toBe(false);
    expect(C.migrate({ profile: { mix: true } }).profile.mix).toBe(true);
    expect(C.migrate({ profile: { mix: 'sim' } }).profile.mix).toBe(false);
  });
});

describe('meta', () => {
  it('peso × 35 + atividade, de 50 em 50, entre 1,2 L e 5 L', () => {
    expect(C.calcGoal({ weight: 70, activity: 'moderate' }).total).toBe(2800);
    expect(C.calcGoal({ weight: 73, activity: 'moderate' }).total).toBe(2900);
    expect(C.calcGoal({ weight: 30, activity: 'low' }).total).toBe(1200);
    expect(C.calcGoal({ weight: 150, activity: 'athlete' }).total).toBe(5000);
    expect(C.calcGoal({ weight: 70, activity: '???' }).act).toBe(350); // inválida vira moderada
  });
  it('bônus de clima por faixa', () => {
    expect([24, 25, 28, 32].map((t) => C.climateBonus(t))).toEqual([0, 250, 500, 750]);
  });
  it('goalToday: automática, clima só no dia certo e manual', () => {
    const S = C.defaults();
    expect(C.goalToday(S, '2026-06-10')).toBe(2800);
    Object.assign(S.goal, { climate: true, bonus: 500, day: '2026-06-10' });
    expect(C.goalToday(S, '2026-06-10')).toBe(3300);
    expect(C.goalToday(S, '2026-06-11')).toBe(2800); // bônus de ontem não vale hoje
    Object.assign(S.goal, { mode: 'manual', manual: 3000 });
    expect(C.goalToday(S, '2026-06-11')).toBe(3000);
  });
});

describe('ritmo e lembretes', () => {
  it('janela do dia aceita dormir depois da meia-noite e tem no mínimo 2 h', () => {
    expect(C.dayWindow('07:00', '23:00')).toEqual({ start: 420, end: 1320 });
    expect(C.dayWindow('07:00', '01:00')).toEqual({ start: 420, end: 1440 });
    expect(C.dayWindow('22:00', '23:00')).toEqual({ start: 1320, end: 1440 });
  });
  it('curva do ritmo começa no acordar e fica um pouco adiantada', () => {
    expect(C.expectedBy(at(10, 6), 2000, '07:00', '23:00')).toBe(0);
    const mid = C.expectedBy(at(10, 14, 30), 2000, '07:00', '23:00');
    expect(mid).toBeGreaterThan(1000);
    expect(mid).toBeLessThan(1200);
    expect(C.expectedBy(at(10, 22, 30), 2000, '07:00', '23:00')).toBe(2000);
  });
  const o = (extra) => Object.assign({ interval: 90, smart: true, wake: '07:00', sleep: '23:00', goal: 2000 }, extra);
  it('intervalo normal', () => { expect(C.nextReminderAt(at(10, 10), o({ total: 1000, expected: 1000 }))).toBe(at(10, 11, 30)); });
  it('atrás do ritmo: mais cedo', () => { expect(C.nextReminderAt(at(10, 10), o({ total: 0, expected: 1000 }))).toBe(at(10, 10, 59)); });
  it('à frente do ritmo: mais tarde', () => { expect(C.nextReminderAt(at(10, 10), o({ total: 1500, expected: 1000 }))).toBe(at(10, 12, 15)); });
  it('sem modo inteligente, ignora o ritmo', () => {
    expect(C.nextReminderAt(at(10, 10), o({ smart: false, total: 0, expected: 1000 }))).toBe(at(10, 11, 30));
  });
  it('meta batida: só amanhã, 30 min depois de acordar', () => {
    expect(C.nextReminderAt(at(10, 10), o({ total: 2000, expected: 1000 }))).toBe(at(11, 7, 30));
  });
  it('antes de acordar: 30 min depois de acordar', () => { expect(C.nextReminderAt(at(10, 5), o({ total: 0, expected: 0 }))).toBe(at(10, 7, 30)); });
  it('perto de dormir: passa para amanhã', () => {
    expect(C.nextReminderAt(at(10, 21, 30), o({ total: 1900, expected: 1950 }))).toBe(at(11, 7, 30));
  });
});

describe('sequência e níveis', () => {
  it('streak conta a partir de ontem enquanto hoje não bate', () => {
    const days = { '2026-06-07': met(), '2026-06-08': met(), '2026-06-09': met() };
    expect(C.streak(days, '2026-06-10')).toBe(3);
    days['2026-06-10'] = met();
    expect(C.streak(days, '2026-06-10')).toBe(4);
    delete days['2026-06-08'];
    expect(C.streak(days, '2026-06-10')).toBe(2);
  });
  it('bestStreak atravessa a virada do mês', () => {
    expect(C.bestStreak({ '2026-05-30': met(), '2026-05-31': met(), '2026-06-01': met(), '2026-06-03': met() })).toBe(3);
  });
  it('níveis por litros acumulados', () => {
    expect(C.levelFor(0).n).toBe('Gota');
    expect(C.levelFor(10000).n).toBe('Poça');
    expect(C.levelFor(30000).p).toBeCloseTo(0.5);
    const top = C.levelFor(2500000);
    expect(top.n).toBe('Maré cheia');
    expect(top.next).toBeNull();
    expect(top.p).toBe(1);
  });
});

describe('missões', () => {
  it('mesma data, mesma missão; ao longo do mês, várias', () => {
    expect(C.missionFor('2026-06-10').id).toBe(C.missionFor('2026-06-10').id);
    const ids = {};
    for (let i = 0; i < 30; i++) ids[C.missionFor(C.addDays('2026-06-01', i)).id] = 1;
    expect(Object.keys(ids).length).toBeGreaterThan(2);
  });
  it('progresso de cada missão', () => {
    const M = {};
    C.MISSIONS.forEach((m) => { M[m.id] = m; });
    const es = day(2000, [[at(10, 8), 300], [at(10, 9, 30), 300], [at(10, 13), 500], [at(10, 20), 900, 'tea']]).entries;
    expect(M.am500.p(es, 2000)).toBeCloseTo(1.2);
    expect(M.six.p(es, 2000)).toBeCloseTo(3 / 6); // o chá não é um "gole de água"
    expect(M.by19.p(es, 2000)).toBeCloseTo(0.55);
    expect(M.thirds.p(es, 2000)).toBeCloseTo(2 / 3); // manhã e tarde; o chá da noite não conta
    expect(M.noon.p(es, 2000)).toBeCloseTo(0.6); // 600 ml até o meio-dia
    expect(M.pure).toBeUndefined(); // "só de água" perdeu o sentido: a meta já é só de água
  });
  it('outros líquidos não avançam nenhuma missão', () => {
    const es = day(2000, [[at(10, 8), 800, 'coffee'], [at(10, 9), 800, 'juice'], [at(10, 11), 800, 'milk']]).entries;
    C.MISSIONS.forEach((m) => { expect(m.p(es, 2000), m.id).toBe(0); });
  });
});

describe('conquistas', () => {
  it('libera medalhas uma vez só, inclusive a do fim de semana', () => {
    const S = C.defaults();
    S.days['2026-06-06'] = day(2000, [[at(6, 8), 600], [at(6, 12), 1400, 'sparkling']]); // sábado: meta às 12h
    S.days['2026-06-07'] = day(2000, [[at(7, 10), 1800]]); // domingo: ainda faltam 200 ml
    let ids = C.newAchievements(S).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first', 'goal', 'early', 'sunset']));
    expect(ids).not.toContain('weekend');
    ids.forEach((id) => { S.achievements[id] = 1; });
    S.days['2026-06-07'].entries.push({ id: 'x', t: at(7, 15), ml: 300, d: 'water' });
    ids = C.newAchievements(S).map((a) => a.id);
    expect(ids).toContain('weekend');
    expect(ids).not.toContain('first');
  });
  it('outros líquidos não rendem medalha (nem a primeira gota)', () => {
    const S = C.defaults();
    S.days['2026-06-07'] = day(2000, [[at(7, 8), 3000, 'coffee'], [at(7, 9), 3000, 'juice']]);
    expect(C.newAchievements(S).map((a) => a.id)).toEqual([]);
    expect(C.ACHIEVEMENTS.some((a) => a.id === 'variety')).toBe(false);
  });
  it('quinzena firme: 14 dias seguidos na meta', () => {
    const S = C.defaults();
    for (let i = 0; i < 13; i++) S.days[C.addDays('2026-06-01', i)] = met();
    expect(C.newAchievements(S).map((a) => a.id)).toEqual(expect.arrayContaining(['s7']));
    expect(C.newAchievements(S).map((a) => a.id)).not.toContain('s14');
    S.days[C.addDays('2026-06-01', 13)] = met();
    expect(C.newAchievements(S).map((a) => a.id)).toContain('s14');
    expect(C.newAchievements(S).map((a) => a.id)).not.toContain('s30');
  });
});

describe('estatísticas e insights', () => {
  it('médias consideram só os dias desde a criação', () => {
    const S = C.defaults(new Date(2026, 5, 7, 9).getTime());
    S.days['2026-06-09'] = met();
    S.days['2026-06-08'] = day(2000, [[at(8, 10), 1000]]);
    const s = C.stats(S, '2026-06-10');
    expect(s.avg7).toBe(1000); // (2000 + 1000 + 0) / 3
    expect(s.cons30).toBeCloseTo(1 / 3);
    expect(C.stats(C.defaults(new Date(2026, 5, 10).getTime()), '2026-06-10').avg7).toBeNull();
  });
  it('insights só aparecem com 4 dias ou mais de dados', () => {
    const S = C.defaults();
    for (let i = 1; i <= 3; i++) S.days[C.addDays('2026-06-10', -i)] = met();
    expect(C.insights(S, '2026-06-10', S.profile)).toEqual([]);
    for (let i = 4; i <= 10; i++) S.days[C.addDays('2026-06-10', -i)] = day(2000, [[at(10, 8), 500], [at(10, 15), 1000]]);
    const out = C.insights(S, '2026-06-10', S.profile);
    expect(out.length).toBeGreaterThan(1);
    out.forEach((x) => { expect(typeof x.t).toBe('string'); });
  });
});

describe('formatação, estado e calendário', () => {
  it('formata em pt-BR', () => {
    expect(C.fmtVol(2500, 'ml')).toBe('2.500 ml');
    expect(C.fmtVol(250, 'oz')).toBe('8 oz');
    expect(C.fmtL(2500)).toBe('2,5 L');
  });
  it('migrate completa estados antigos ou quebrados', () => {
    expect(C.migrate(null).profile.weight).toBe(70);
    const s = C.migrate({ profile: { name: 'Ana' }, cups: [1, 2], days: { '2026-06-10': { goal: 2000, entries: [] } } });
    expect(s.profile.name).toBe('Ana');
    expect(s.profile.wake).toBe('07:00');
    expect(s.cups).toEqual([150, 250, 350, 500]);
    expect(Object.keys(s.days)).toEqual(['2026-06-10']);
  });
  it('migrate: refrigerante e álcool saem; café e chá viram "outros líquidos"', () => {
    const entries = [
      { id: 'a', t: at(10, 8), ml: 250, d: 'water' }, { id: 'b', t: at(10, 9), ml: 350, d: 'soda' },
      { id: 'c', t: at(10, 10), ml: 300, d: 'alcohol' }, { id: 'd', t: at(10, 11), ml: 100, d: 'coffee' }];
    const s = C.migrate({ last: 'coffee', days: { '2026-06-10': { goal: 2000, entries: entries } } });
    expect(s.days['2026-06-10'].entries.map((e) => e.id)).toEqual(['a', 'd']);
    expect(entries.length).toBe(4); // a entrada original não é alterada
    expect(s.last).toBe('water'); // copos rápidos: só água
    expect(s.lastO).toBe('coffee'); // quem tinha café como padrão o leva para "outros líquidos"
    expect(s.profile.others).toBe(true);
    expect(C.migrate({ last: 'soda' }).last).toBe('water');
    expect(C.migrate({ last: 'sparkling', lastO: 'tea' })).toMatchObject({ last: 'sparkling', lastO: 'tea' });
    expect(C.migrate({ lastO: 'water' }).lastO).toBe('coffee'); // lastO só aceita "outros líquidos"
    expect(C.migrate({ profile: { others: false } }).profile.others).toBe(false);
    expect(C.defaults()).toMatchObject({ last: 'water', lastO: 'coffee' });
  });
  it('.ics: um alarme diário por intervalo dentro da janela', () => {
    const ics = C.buildICS({ wake: '07:00', sleep: '23:00' }, 90, new Date(2026, 5, 10, 12));
    expect(ics.match(/BEGIN:VEVENT/g).length).toBe(10);
    expect(ics).toContain('DTSTART:20260610T083000');
    expect(ics).toContain('DTSTART:20260610T220000');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics.indexOf('\r\n')).toBeGreaterThan(0);
  });
  it('uid único e hash estável', () => {
    expect(C.uid()).not.toBe(C.uid());
    expect(C.hash('mare')).toBe(C.hash('mare'));
  });
  it('utilidades do store', () => {
    expect(esc('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(num('72,5')).toBe(72.5);
    expect(Number.isNaN(num('abc'))).toBe(true);
    expect(plural(1, 'dia', 'dias')).toBe('1 dia');
    expect(plural(2, 'dia', 'dias')).toBe('2 dias');
    expect(shiftYm('2026-01', -1)).toBe('2025-12');
    expect(shiftYm('2026-12', 1)).toBe('2027-01');
  });
});
