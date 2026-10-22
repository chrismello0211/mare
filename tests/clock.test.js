// Maré — testes do relógio das funções (functions/clock.js). Rodar: npm test
// O fuso de cada pessoa, a janela dos lembretes (que tem de dar a mesma conta do app, public/js/core.js), o horário de silêncio dos avisos dos
// amigos e o domingo das 19h do resumo da semana. Tudo puro: sem Firebase e sem relógio de verdade (o "agora" é sempre um número).
import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as K from '../functions/clock.js';
import * as C from '../public/js/core.js';

const MIN = 60e3, HOUR = 3600e3;
const at = (y, mo, d, h, mi, s) => Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0);
// O mesmo instante contado no fuso da máquina de teste (para comparar com o app, que usa o relógio local)
const SYS = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let seed = 20261019;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe('local: o relógio de cada pessoa', () => {
  it('data, minutos desde a meia-noite, segundos e dia da semana no fuso pedido', () => {
    const t = at(2026, 10, 19, 14, 0, 7); // segunda, 14:00:07 em Greenwich
    expect(K.local(t, 'America/Fortaleza')).toEqual({ day: '2026-10-19', min: 11 * 60, sec: 7, dow: 1 });
    expect(K.local(t, 'UTC')).toEqual({ day: '2026-10-19', min: 14 * 60, sec: 7, dow: 1 });
    expect(K.local(t, 'Asia/Tokyo')).toEqual({ day: '2026-10-19', min: 23 * 60, sec: 7, dow: 1 });
    expect(K.local(t + 2 * HOUR, 'Asia/Tokyo')).toEqual({ day: '2026-10-20', min: 60, sec: 7, dow: 2 }); // virou o dia lá
    expect(K.local(t, 'Pacific/Auckland')).toMatchObject({ day: '2026-10-20' });
  });
  it('domingo é 0 e sábado é 6', () => {
    expect(K.local(at(2026, 10, 18, 15), 'UTC').dow).toBe(0);
    expect(K.local(at(2026, 10, 24, 15), 'UTC').dow).toBe(6);
    expect(K.local(at(2026, 10, 18, 2), 'America/Sao_Paulo').dow).toBe(6); // ainda é sábado à noite no Brasil
  });
  it('meia-noite é 0 minutos (nunca 1440)', () => {
    expect(K.local(at(2026, 10, 19, 3), 'America/Sao_Paulo')).toMatchObject({ day: '2026-10-19', min: 0, sec: 0 });
    expect(K.local(at(2026, 10, 19, 2, 59, 59), 'America/Sao_Paulo')).toMatchObject({ day: '2026-10-18', min: 23 * 60 + 59, sec: 59 });
  });
  it('sem fuso, ou com um fuso que não existe, vale São Paulo (como o app)', () => {
    const t = at(2026, 10, 19, 14), sp = K.local(t, 'America/Sao_Paulo');
    [undefined, null, '', 'Marte/Olympus', 'nao/existe', 42, {}].forEach((tz) => expect(K.local(t, tz)).toEqual(sp));
    expect(sp.min).toBe(11 * 60);
  });
  it('fuso inválido não "contamina" o de verdade (o cache é por nome)', () => {
    const t = at(2026, 10, 19, 14);
    K.local(t, 'Marte/Olympus');
    expect(K.local(t, 'Asia/Tokyo').min).toBe(23 * 60);
    expect(K.local(t, 'Marte/Olympus').min).toBe(11 * 60);
  });
  it('o dia local bate com o do app para a máquina de teste, em instantes sorteados', () => {
    for (let i = 0; i < 300; i++) {
      const t = at(2026, 1, 1) + Math.floor(rnd() * 365 * 24 * 60) * MIN + Math.floor(rnd() * 60) * 1000, L = K.local(t, SYS);
      expect(L.day).toBe(C.dayKey(new Date(t)));
      expect(L.min).toBe(C.minOf(t));
    }
  });
});

describe('windowOf e nextAt: a mesma conta dos lembretes do app (core.js)', () => {
  const WAKES = ['05:30', '06:00', '07:00', '08:15', '12:00'], SLEEPS = ['21:30', '22:00', '23:00', '23:59', '00:30', '02:00', '06:00', '07:00'];
  it('windowOf = dayWindow em todas as combinações de acordar e dormir (inclusive dormir depois da meia-noite)', () => {
    WAKES.forEach((w) => SLEEPS.forEach((s) => expect(K.windowOf(w, s)).toEqual(C.dayWindow(w, s))));
  });
  it('sem horários valem 07:00 e 23:00; horário estragado não quebra', () => {
    expect(K.windowOf(undefined, undefined)).toEqual(C.dayWindow('07:00', '23:00'));
    expect(K.windowOf('', null)).toEqual(C.dayWindow('07:00', '23:00'));
    [['abc', 'xyz'], ['25:99', '-1:-1'], ['7', '23']].forEach(([w, s]) => { const r = K.windowOf(w, s); expect(r.end - r.start).toBeGreaterThanOrEqual(120); });
  });
  it('a janela nunca tem menos de 2 horas', () => {
    expect(K.windowOf('07:00', '08:00').end - K.windowOf('07:00', '08:00').start).toBe(120);
    expect(K.windowOf('07:00', '07:00')).toEqual(C.dayWindow('07:00', '07:00'));
  });
  it('expectedAt = expectedBy do app, em instantes sorteados', () => {
    for (let i = 0; i < 300; i++) {
      const t = at(2026, 3, 1) + Math.floor(rnd() * 100 * 24 * 60) * MIN, wake = WAKES[Math.floor(rnd() * WAKES.length)], sleep = SLEEPS[Math.floor(rnd() * SLEEPS.length)];
      const goal = 1500 + Math.floor(rnd() * 3000), L = K.local(t, SYS), w = K.windowOf(wake, sleep);
      expect(K.expectedAt(L, w, goal)).toBe(C.expectedBy(t, goal, wake, sleep));
    }
  });
  it('nextAt = nextReminderAt do app, em instantes sorteados do ano todo (com e sem lembrete inteligente, meta batida ou não)', () => {
    for (let i = 0; i < 800; i++) {
      const t = at(2026, 1, 1) + Math.floor(rnd() * 365 * 24 * 60) * MIN + Math.floor(rnd() * 60) * 1000, wake = WAKES[Math.floor(rnd() * WAKES.length)], sleep = SLEEPS[Math.floor(rnd() * SLEEPS.length)];
      const goal = 1500 + Math.floor(rnd() * 3000), total = Math.floor(rnd() * goal * 1.2), interval = [45, 60, 90, 120][Math.floor(rnd() * 4)], smart = rnd() < 0.5;
      const L = K.local(t, SYS), w = K.windowOf(wake, sleep), expected = K.expectedAt(L, w, goal);
      const app = C.nextReminderAt(t, { interval, smart, wake, sleep, total, goal, expected });
      expect(K.nextAt(t, SYS, w, { interval, smart, total, goal, expected })).toBe(app);
    }
  });
  it('as regras, num caso à mão: meta batida → amanhã 30 min depois de acordar; passou da janela → amanhã; antes da janela → hoje; no meio → daqui a "interval"', () => {
    const tz = 'America/Fortaleza', w = K.windowOf('07:00', '23:00'); // janela 07:00–22:00
    const o = { interval: 90, smart: false, goal: 2000, expected: 1000 };
    const t = at(2026, 10, 19, 15, 0, 20); // 12:00:20 em Fortaleza
    expect(K.nextAt(t, tz, w, Object.assign({ total: 500 }, o))).toBe(t + 90 * MIN); // no meio da janela: daqui a 90 min (com os segundos)
    expect(K.nextAt(t, tz, w, Object.assign({ total: 2000 }, o))).toBe(at(2026, 10, 20, 10, 30)); // meta batida: 07:30 de amanhã
    const late = at(2026, 10, 20, 0, 40, 5); // 21:40:05 em Fortaleza: +90 min passa das 22:00
    expect(K.nextAt(late, tz, w, Object.assign({ total: 500 }, o))).toBe(at(2026, 10, 20, 10, 30));
    const early = at(2026, 10, 19, 6, 0, 0); // 03:00 em Fortaleza: +90 min ainda é antes das 07:00
    expect(K.nextAt(early, tz, w, Object.assign({ total: 0 }, o))).toBe(at(2026, 10, 19, 10, 30)); // hoje, 07:30
  });
  it('lembrete inteligente: atrasado (mais de 15% da meta) encurta o intervalo a 66%, adiantado (mais de 10%) alonga a 150%', () => {
    const tz = 'America/Fortaleza', w = K.windowOf('07:00', '23:00'), t = at(2026, 10, 19, 15, 0, 0);
    const o = { interval: 90, smart: true, goal: 2000 };
    expect(K.nextAt(t, tz, w, Object.assign({ total: 600, expected: 1000 }, o))).toBe(t + 59 * MIN); // 400 abaixo: 90 × 0,66 = 59,4 → 59
    expect(K.nextAt(t, tz, w, Object.assign({ total: 1300, expected: 1000 }, o))).toBe(t + 135 * MIN); // 300 acima: 90 × 1,5
    expect(K.nextAt(t, tz, w, Object.assign({ total: 1100, expected: 1000 }, o))).toBe(t + 90 * MIN); // perto do ritmo: igual
  });
});

describe('isAwake: o horário de silêncio', () => {
  const min = (h, m) => h * 60 + (m || 0);
  it('acordada de wake (inclusive) até sleep (exclusive)', () => {
    expect(K.isAwake(min(6, 59), '07:00', '23:00')).toBe(false);
    expect(K.isAwake(min(7), '07:00', '23:00')).toBe(true);
    expect(K.isAwake(min(12), '07:00', '23:00')).toBe(true);
    expect(K.isAwake(min(22, 59), '07:00', '23:00')).toBe(true);
    expect(K.isAwake(min(23), '07:00', '23:00')).toBe(false);
    expect(K.isAwake(0, '07:00', '23:00')).toBe(false);
    expect(K.isAwake(1439, '07:00', '23:00')).toBe(false);
  });
  it('dormir depois da meia-noite: a janela dá a volta', () => {
    expect(K.isAwake(min(11, 59), '12:00', '02:00')).toBe(false);
    expect(K.isAwake(min(12), '12:00', '02:00')).toBe(true);
    expect(K.isAwake(1439, '12:00', '02:00')).toBe(true);
    expect(K.isAwake(0, '12:00', '02:00')).toBe(true);
    expect(K.isAwake(min(1, 59), '12:00', '02:00')).toBe(true);
    expect(K.isAwake(min(2), '12:00', '02:00')).toBe(false);
    expect(K.isAwake(min(8), '12:00', '02:00')).toBe(false);
  });
  it('wake igual a sleep não define silêncio: sempre acordada', () => {
    for (let m = 0; m < 1440; m += 37) expect(K.isAwake(m, '07:00', '07:00')).toBe(true);
    expect(K.isAwake(300, '00:00', '24:00')).toBe(true); // 24:00 = 1440 = meia-noite
  });
  it('sem horários valem 07:00 e 23:00 (a conta antiga ainda não tem wake e sleep)', () => {
    expect(K.isAwake(min(6), undefined, undefined)).toBe(false);
    expect(K.isAwake(min(8), undefined, undefined)).toBe(true);
    expect(K.isAwake(min(23, 30), null, '')).toBe(false);
  });
  it('horário estragado não quebra (vira 00:00)', () => {
    ['abc', '', 'xx:yy', null, undefined, 7].forEach((w) => { expect(typeof K.isAwake(600, w, '23:00')).toBe('boolean'); });
  });
  it('um texto que não é uma hora (Infinity, 1e999:00, -5:30, 12:75, 25:00…) vale 00:00: nunca Infinity, NaN nem um instante no passado', () => {
    const t = at(2026, 10, 19, 14, 0);
    ['Infinity', '1e999:00', '-5:30', '12:75', '25:00', '24:30', '-0:-1', 'NaN:NaN', '9e9', '-Infinity', '12:Infinity'].forEach((w) => {
      expect([w, K.hm(w)]).toEqual([w, 0]);
      expect(() => K.nextWake(t, 'America/Fortaleza', w), w).not.toThrow();
      expect(K.nextWake(t, 'America/Fortaleza', w), w).toBeGreaterThan(t);
      expect(typeof K.isAwake(600, w, '23:00')).toBe('boolean');
      expect(typeof K.isAwake(600, '07:00', w)).toBe('boolean');
      const r = K.windowOf(w, w);
      expect(Number.isFinite(r.start) && Number.isFinite(r.end) && r.end - r.start >= 120).toBe(true);
    });
  });
  it('o que é hora de verdade continua igual à do app (core.js): de 00:00 a 24:00, com ou sem zero à esquerda', () => {
    ['00:00', '07:30', '7:30', '7', '12:05', '23:59', '24:00'].forEach((s) => { expect([s, K.hm(s)]).toEqual([s, C.hm(s)]); });
    expect(K.hm('24:00')).toBe(1440);
    expect(K.hm('07:30')).toBe(450);
  });
  it('todo minuto do dia é "acordada" ou "dormindo": juntos, as duas janelas cobrem as 24 horas sem sobrar nem faltar', () => {
    [['07:00', '23:00'], ['06:30', '22:45'], ['12:00', '02:00'], ['20:00', '04:00'], ['00:00', '12:00']].forEach(([w, s]) => {
      let awake = 0;
      for (let m = 0; m < 1440; m++) if (K.isAwake(m, w, s)) awake++;
      const span = (K.hm(s) - K.hm(w) + 1440) % 1440;
      expect(awake).toBe(span);
    });
  });
});

describe('nextWake: quando a pessoa acorda', () => {
  it('hoje, se ainda não chegou a hora; senão amanhã', () => {
    const t = at(2026, 10, 19, 5, 30); // 02:30 em Fortaleza
    expect(K.nextWake(t, 'America/Fortaleza', '07:00')).toBe(at(2026, 10, 19, 10, 0)); // 07:00 de hoje
    expect(K.nextWake(at(2026, 10, 19, 15), 'America/Fortaleza', '07:00')).toBe(at(2026, 10, 20, 10, 0)); // 12:00 lá: 07:00 de amanhã
  });
  it('na hora exata já passou: o próximo é amanhã (nunca devolve o próprio agora)', () => {
    const t = at(2026, 10, 19, 10, 0, 0); // 07:00:00 em Fortaleza
    expect(K.nextWake(t, 'America/Fortaleza', '07:00')).toBe(t + 24 * HOUR);
    expect(K.nextWake(t + 45e3, 'America/Fortaleza', '07:00')).toBe(t + 24 * HOUR); // e os segundos não atrapalham: sempre no minuto cheio
  });
  it('um minuto antes: daqui a segundos, no minuto cheio', () => {
    const t = at(2026, 10, 19, 9, 59, 30); // 06:59:30
    expect(K.nextWake(t, 'America/Fortaleza', '07:00')).toBe(at(2026, 10, 19, 10, 0, 0));
  });
  it('sem horário vale 07:00; sem fuso vale São Paulo', () => {
    const t = at(2026, 10, 19, 5);
    expect(K.nextWake(t, undefined, undefined)).toBe(K.nextWake(t, 'America/Sao_Paulo', '07:00'));
    expect(K.local(K.nextWake(t, 'Nao/existe', '07:00'), 'America/Sao_Paulo').min).toBe(7 * 60);
  });
  it('sempre depois do agora, em até 25 horas, e cai na hora de acordar do relógio da pessoa (fusos, dias do ano e horários sorteados)', () => {
    const zones = ['America/Sao_Paulo', 'America/Fortaleza', 'Europe/Lisbon', 'Asia/Tokyo', 'Asia/Kolkata', 'Pacific/Auckland', 'America/Los_Angeles', 'Australia/Lord_Howe', 'UTC'];
    for (let i = 0; i < 1000; i++) {
      const t = at(2026, 1, 1) + Math.floor(rnd() * 365 * 24 * 60) * MIN + Math.floor(rnd() * 60) * 1000, tz = zones[Math.floor(rnd() * zones.length)];
      const w = String(5 + Math.floor(rnd() * 8)).padStart(2, '0') + ':' + ['00', '15', '30', '45'][Math.floor(rnd() * 4)], n = K.nextWake(t, tz, w);
      expect(n).toBeGreaterThan(t);
      expect(n - t).toBeLessThanOrEqual(25 * HOUR); // 25 h só no dia em que o relógio volta uma hora
      expect(K.local(n, tz)).toMatchObject({ min: K.hm(w), sec: 0 });
    }
  });
  it('na noite em que o horário de verão vira, acorda na hora marcada no relógio (nem 1 h antes, nem 1 h depois)', () => {
    // Nova York, 8/3/2026: às 02:00 o relógio pula para 03:00. Quem dorme às 22:00 do dia 7 e acorda às 07:00 do dia 8 dorme 8 h, não 9 h
    expect(K.nextWake(at(2026, 3, 8, 3, 0), 'America/New_York', '07:00')).toBe(at(2026, 3, 8, 11, 0)); // 07:00 EDT = 11:00 em Greenwich
    // 1/11/2026: às 02:00 o relógio volta para 01:00. Dorme às 22:00 do dia 31 (UTC-4) e acorda às 07:00 do dia 1 (UTC-5): 10 h depois
    expect(K.nextWake(at(2026, 11, 1, 2, 0), 'America/New_York', '07:00')).toBe(at(2026, 11, 1, 12, 0));
    // Lisboa, 29/3/2026: à 01:00 (Greenwich) o relógio pula uma hora
    expect(K.nextWake(at(2026, 3, 28, 22, 0), 'Europe/Lisbon', '07:00')).toBe(at(2026, 3, 29, 6, 0));
    // Auckland, 27/9/2026 (o verão de lá começa em setembro)
    expect(K.local(K.nextWake(at(2026, 9, 26, 9, 0), 'Pacific/Auckland', '07:00'), 'Pacific/Auckland')).toMatchObject({ day: '2026-09-27', min: 7 * 60 });
  });
  it('hora que não existe na virada vale a seguinte; hora que se repete vale a primeira; e nunca devolve o passado', () => {
    expect(K.nextWake(at(2026, 3, 8, 6, 0), 'America/New_York', '02:30')).toBe(at(2026, 3, 8, 7, 30)); // 02:30 não existe: vale 03:30 EDT
    expect(K.nextWake(at(2026, 11, 1, 4, 0), 'America/New_York', '01:30')).toBe(at(2026, 11, 1, 5, 30)); // a primeira 01:30 (EDT)
    expect(K.nextWake(at(2026, 11, 1, 6, 10), 'America/New_York', '01:30')).toBe(at(2026, 11, 2, 6, 30)); // já é a segunda 01:10 (EST): a primeira passou, vale amanhã
  });
});

describe('instantAt: o instante em que um relógio marca uma hora', () => {
  const L = (t, tz) => K.local(t, tz);
  it('dia comum: a hora marcada somada ao fuso', () => {
    const t = at(2026, 10, 19, 15, 0, 20), tz = 'America/Fortaleza'; // 12:00:20 em Fortaleza (UTC-3)
    expect(K.instantAt(L(t, tz), tz, 0, 7 * 60)).toBe(at(2026, 10, 19, 10, 0)); // 07:00 de hoje
    expect(K.instantAt(L(t, tz), tz, 1, 7 * 60 + 30)).toBe(at(2026, 10, 20, 10, 30)); // 07:30 de amanhã
    expect(K.instantAt(L(t, tz), tz, 0, 0)).toBe(at(2026, 10, 19, 3, 0)); // meia-noite de hoje (já passou)
    expect(K.instantAt(L(t, tz), tz, -1, 23 * 60)).toBe(at(2026, 10, 19, 2, 0)); // 23:00 de ontem
  });
  it('minutos além de 24 h rolam para o dia seguinte (a janela de quem dorme depois da meia-noite)', () => {
    const t = at(2026, 10, 19, 15, 0), tz = 'America/Fortaleza';
    expect(K.instantAt(L(t, tz), tz, 0, 1500)).toBe(at(2026, 10, 20, 4, 0)); // 25:00 = 01:00 de amanhã
    expect(K.instantAt(L(t, tz), tz, 1, 1500)).toBe(at(2026, 10, 21, 4, 0));
  });
  it('o dia é o do relógio da pessoa, não o de Greenwich', () => {
    const t = at(2026, 10, 19, 1, 30), tz = 'America/Fortaleza'; // ainda é 18/10, 22:30, em Fortaleza
    expect(L(t, tz).day).toBe('2026-10-18');
    expect(K.instantAt(L(t, tz), tz, 0, 7 * 60)).toBe(at(2026, 10, 18, 10, 0));
    expect(K.instantAt(L(t, tz), tz, 1, 7 * 60)).toBe(at(2026, 10, 19, 10, 0));
  });
  it('Nova York na virada: o dia de 23 h (março) e o de 25 h (novembro)', () => {
    const tz = 'America/New_York', mar = L(at(2026, 3, 8, 5, 0), tz), nov = L(at(2026, 11, 1, 4, 30), tz); // 00:00 EST do dia 8 / 00:30 EDT do dia 1
    expect(K.instantAt(mar, tz, 0, 120)).toBe(at(2026, 3, 8, 7, 0)); // 02:00 não existe: vale 03:00 EDT (07:00 em Greenwich)
    expect(K.instantAt(mar, tz, 0, 180)).toBe(at(2026, 3, 8, 7, 0)); // 03:00 EDT
    expect(K.instantAt(mar, tz, 0, 119)).toBe(at(2026, 3, 8, 6, 59)); // 01:59 EST ainda existe (o último minuto antes do pulo)
    expect(K.instantAt(mar, tz, 0, 150)).toBe(at(2026, 3, 8, 7, 30)); // 02:30 não existe: vale 03:30 EDT
    expect(K.instantAt(nov, tz, 0, 90)).toBe(at(2026, 11, 1, 5, 30)); // 01:30 acontece duas vezes: vale a primeira (EDT)
    expect(K.instantAt(nov, tz, 0, 180)).toBe(at(2026, 11, 1, 8, 0)); // 03:00 EST
    expect(K.instantAt(nov, tz, 1, 0)).toBe(at(2026, 11, 2, 5, 0)); // 00:00 do dia 2 (EST)
  });
});

describe('awakeNow: o estado de silêncio de uma conta', () => {
  const t = at(2026, 10, 19, 14); // 11:00 em Fortaleza, 14:00 em UTC
  it('usa o fuso, o wake e o sleep da conta', () => {
    expect(K.awakeNow({ tz: 'America/Fortaleza', wake: '07:00', sleep: '23:00' }, t).awake).toBe(true);
    expect(K.awakeNow({ tz: 'America/Fortaleza', wake: '12:00', sleep: '23:00' }, t).awake).toBe(false); // ainda dorme
    expect(K.awakeNow({ tz: 'Asia/Tokyo', wake: '07:00', sleep: '22:00' }, t).awake).toBe(false); // 23:00 lá
    expect(K.awakeNow({ tz: 'Asia/Tokyo', wake: '07:00', sleep: '22:00' }, t).L.day).toBe('2026-10-19');
  });
  it('conta sem nada (antiga, ou documento que sumiu) vale 07:00 a 23:00 em São Paulo', () => {
    expect(K.awakeNow(null, t).awake).toBe(true);
    expect(K.awakeNow({}, at(2026, 10, 19, 8)).awake).toBe(false); // 05:00 em São Paulo
    expect(K.awakeNow(undefined, at(2026, 10, 19, 1)).awake).toBe(true); // 22:00 em São Paulo
    expect(K.awakeNow('x', t).awake).toBe(true);
  });
});

describe('isWeeklyHour: domingo, das 19:00 às 19:59 no relógio de cada um', () => {
  it('Fortaleza (UTC-3): domingo 22:00 em Greenwich', () => {
    const sun = (h, m, s) => at(2026, 10, 18, h, m, s);
    expect(K.isWeeklyHour(sun(21, 59, 59), 'America/Fortaleza')).toBe(false);
    expect(K.isWeeklyHour(sun(22, 0, 0), 'America/Fortaleza')).toBe(true);
    expect(K.isWeeklyHour(sun(22, 30, 0), 'America/Fortaleza')).toBe(true);
    expect(K.isWeeklyHour(sun(22, 59, 59), 'America/Fortaleza')).toBe(true);
    expect(K.isWeeklyHour(sun(23, 0, 0), 'America/Fortaleza')).toBe(false);
  });
  it('o mesmo instante em outros fusos: só vale onde é domingo 19h', () => {
    const t = at(2026, 10, 18, 22, 5);
    expect(K.isWeeklyHour(t, 'America/Sao_Paulo')).toBe(true);
    expect(K.isWeeklyHour(t, 'UTC')).toBe(false);
    expect(K.isWeeklyHour(t, 'Asia/Tokyo')).toBe(false); // segunda de manhã lá
    expect(K.isWeeklyHour(t, 'America/New_York')).toBe(false); // 18:05 de domingo
    expect(K.isWeeklyHour(t, 'America/Argentina/Buenos_Aires')).toBe(true); // também UTC-3
  });
  it('fusos de meia hora têm a sua hora (Índia: 19:30 é "hora 19")', () => {
    expect(K.isWeeklyHour(at(2026, 10, 18, 14, 0), 'Asia/Kolkata')).toBe(true); // 19:30
    expect(K.isWeeklyHour(at(2026, 10, 18, 13, 29), 'Asia/Kolkata')).toBe(false); // 18:59
  });
  it('outros dias nunca valem; e cada pessoa cai na hora uma vez por semana', () => {
    const base = at(2026, 10, 12, 0), tz = 'America/Sao_Paulo';
    let hits = 0;
    for (let h = 0; h < 7 * 24; h++) if (K.isWeeklyHour(base + h * HOUR, tz)) hits++;
    expect(hits).toBe(1);
    expect(K.WEEKLY).toEqual({ dow: 0, hour: 19 });
  });
  it('sem fuso ou com fuso estranho vale São Paulo', () => {
    const t = at(2026, 10, 18, 22, 5);
    [undefined, '', 'Nao/existe'].forEach((tz) => expect(K.isWeeklyHour(t, tz)).toBe(true));
  });
});

describe('vol: o volume dos lembretes', () => {
  it('ml com separador de milhar do Brasil; oz arredondada', () => {
    expect(K.vol(250, 'ml')).toBe('250 ml');
    expect(K.vol(1250, undefined)).toBe('1.250 ml');
    expect(K.vol(250, 'oz')).toBe('8 oz');
  });
});

describe('a virada do horário de verão: as mesmas contas do app, em fusos de todo jeito', () => {
  // Cada fuso roda num processo à parte com TZ = ele (tests/helpers/dst-sweep.mjs): assim o relógio do app (core.js, que é o do aparelho) é o
  // desse fuso, seja qual for a máquina de quem testa. A varredura passa por cada virada de 2026 (de 40 h antes a 40 h depois) e compara o
  // relógio local, instantAt, nextWake e nextAt com core.nextReminderAt e com o próprio new Date(ano, mês, dia, hora, minuto) do JavaScript.
  const SWEEP = fileURLToPath(new URL('./helpers/dst-sweep.mjs', import.meta.url)), pexec = promisify(execFile);
  const ZONES = {
    'America/New_York': 2, // março e novembro
    'Europe/Lisbon': 2, // a virada é à 01:00 de Greenwich
    'Pacific/Auckland': 2, // hemisfério sul
    'Australia/Lord_Howe': 2, // a virada é de meia hora
    'America/Santiago': 2, // a virada é à meia-noite
    'Africa/Casablanca': 2, // o horário "de verão" invertido do Ramadã
    'America/St_Johns': 2, // UTC-3:30
    'Pacific/Chatham': 2, // UTC+12:45
    'America/Sao_Paulo': 0, 'America/Fortaleza': 0, 'Asia/Kolkata': 0, 'UTC': 0, // sem horário de verão: a conta comum
  };
  const RUN = {};
  beforeAll(async () => {
    await Promise.all(Object.keys(ZONES).map(async (tz) => {
      const out = await pexec(process.execPath, [SWEEP], { env: Object.assign({}, process.env, { TZ: tz }), timeout: 120000, maxBuffer: 1 << 22 });
      RUN[tz] = JSON.parse(out.stdout.trim().split('\n').pop());
    }));
  }, 180000);
  Object.keys(ZONES).forEach((tz) => {
    it(tz + (ZONES[tz] ? ' (' + ZONES[tz] + ' viradas em 2026)' : ' (sem viradas)'), () => {
      expect(RUN[tz].bad).toEqual([]);
      expect(RUN[tz].turns).toBe(ZONES[tz]);
      expect(RUN[tz].checked).toBeGreaterThan(ZONES[tz] ? 50000 : 2000);
    });
  });
});
