// Maré — varredura da virada do horário de verão (usada por tests/clock.test.js).
// Roda num processo à parte com TZ = o fuso a testar (assim o "relógio local" do app, que é o do aparelho, é o desse fuso, qualquer que seja a
// máquina de quem testa). Para cada virada do ano de 2026 compara o relógio das funções (functions/clock.js) com o do app (public/js/core.js) e
// com o que o próprio JavaScript faz (new Date(ano, mês, dia, hora, minuto)). Imprime uma linha de JSON: { tz, turns, checked, bad: [...] }.
import * as K from '../../functions/clock.js';
import * as C from '../../public/js/core.js';

const MIN = 60e3, HOUR = 3600e3;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const bad = [];
let checked = 0;
const fail = (what, info) => { if (bad.length < 12) bad.push(Object.assign({ what: what }, info)); };
const same = (what, got, want, info) => { checked++; if (got !== want) fail(what, Object.assign({ got: got, want: want }, info)); };

// 1. As viradas de 2026: onde o deslocamento do relógio muda (varre de 15 em 15 minutos)
const t0 = Date.UTC(2026, 0, 1), t1 = Date.UTC(2027, 0, 1), turns = [];
let prev = new Date(t0).getTimezoneOffset();
for (let t = t0 + 15 * MIN; t < t1; t += 15 * MIN) { const o = new Date(t).getTimezoneOffset(); if (o !== prev) { turns.push(t); prev = o; } }

// 2. Instantes ao redor de cada virada (de 40 h antes a 40 h depois)
const around = [];
turns.forEach((tr) => { for (let t = tr - 40 * HOUR; t <= tr + 40 * HOUR; t += 11 * MIN + 17e3) around.push(Math.floor(t / 1000) * 1000); });
// mais um punhado sem virada nenhuma (o relógio comum tem de continuar certo)
for (let t = Date.UTC(2026, 5, 10, 3, 7, 9); t < Date.UTC(2026, 5, 13); t += 97 * MIN + 3e3) around.push(Math.floor(t / 1000) * 1000);

const at = (t, off, min) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + off, 0, min).getTime(); }; // a conta do app (core.nextReminderAt)

around.forEach((t) => {
  const d = new Date(t), L = K.local(t, tz);
  // o relógio local
  same('local.day', L.day, C.dayKey(d), { t: t });
  same('local.min', L.min, d.getHours() * 60 + d.getMinutes(), { t: t });
  same('local.sec', L.sec, d.getSeconds(), { t: t });
  same('local.dow', L.dow, d.getDay(), { t: t });
  // instantAt: qualquer hora marcada, inclusive as que não existem (pulada) ou existem duas vezes (repetida) na noite da virada
  [0, 1].forEach((off) => { for (let m = 0; m <= 330; m += 15) same('instantAt ' + off + ' ' + m, K.instantAt(L, tz, off, m), at(t, off, m), { t: t }); });
  // nextWake: a próxima hora de acordar no relógio da pessoa; nunca no passado
  ['00:30', '01:30', '02:15', '02:30', '03:00', '05:45', '07:00', '12:00'].forEach((wake) => {
    const w = K.hm(wake), ref = (() => { const x = w > L.min ? at(t, 0, w) : at(t, 1, w); return x > t ? x : at(t, 1, w); })();
    same('nextWake ' + wake, K.nextWake(t, tz, wake), ref, { t: t });
  });
  // nextAt contra core.nextReminderAt: horários comuns, de madrugada (a janela atravessa a virada) e dormindo depois da meia-noite
  [['07:00', '23:00'], ['01:00', '06:00'], ['00:30', '03:30'], ['22:00', '07:00'], ['12:00', '02:00']].forEach(([wake, sleep]) => {
    const w = K.windowOf(wake, sleep);
    [[60, true, 0], [90, false, 1200], [45, true, 1900], [90, true, 2000]].forEach(([interval, smart, total]) => {
      const goal = 2000, expected = K.expectedAt(L, w, goal);
      const app = C.nextReminderAt(t, { interval: interval, smart: smart, wake: wake, sleep: sleep, total: total, goal: goal, expected: expected });
      same('nextAt ' + wake + '-' + sleep + ' ' + interval + (smart ? 's' : '') + ' ' + total, K.nextAt(t, tz, w, { interval: interval, smart: smart, total: total, goal: goal, expected: expected }), app, { t: t });
    });
  });
});

process.stdout.write(JSON.stringify({ tz: tz, turns: turns.length, checked: checked, bad: bad }) + '\n');
