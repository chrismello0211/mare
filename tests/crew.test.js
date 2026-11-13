// Maré — testes da turma única e dos avisos da turma (functions/network.js e functions/crew-push.js, só a parte pura). Rodar: npm test
// planClosure/autoDoc: quem vira amigo de quem quando duas turmas se juntam. hitOf, weekOf, weekOfCrew, zonesAt: "um amigo bateu a meta" e o
// resumo de domingo, com a conta da semana IGUAL à do app (public/js/social.js). Desde a 1.13.0 também: functions/core.js (a cópia do motor do app), weekDays e
// crewWonOf (o desafio da turma da semana, visto pelo servidor, para a frase a mais do resumo de domingo). O Firestore e o FCM ficam em tests/rules/*.test.js (emulador).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as N from '../functions/network.js';
import * as CP from '../functions/crew-push.js';
import { pairId, pairOf, UID_RE } from '../functions/social-push.js';
import { isWeeklyHour, local } from '../functions/clock.js';
import * as SO from '../public/js/social.js';
import * as C from '../public/js/core.js';

const HOUR = 3600e3;
const at = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h || 0, mi || 0, 0);
let seed = 1019;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (l) => l[Math.floor(rnd() * l.length)];
// Ids de gente de verdade: letras e números, 10 a 64 (os do login misturam maiúsculas e minúsculas)
const uid = (n) => 'user' + String(n).padStart(6, '0') + (n % 3 === 0 ? 'Ab' : n % 3 === 1 ? 'zY' : 'Qq');
const addDays = (day, k) => new Date(Date.parse(day + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);

describe('planClosure: quem vira amigo de quem quando as turmas se juntam', () => {
  const [a, b, c, d] = [uid(1), uid(2), uid(3), uid(4)];
  const act = (...ids) => new Map(ids.map((id) => [id, { st: 'active' }]));
  it('turma de 3 com uma amizade só: faltam as outras duas', () => {
    const p = N.planClosure([a, b, c], act(pairId(a, b)));
    expect(p.create.sort()).toEqual([pairId(a, c), pairId(b, c)].sort());
    expect(p.upgrade).toEqual([]);
  });
  it('já completa: não falta nada', () => {
    expect(N.planClosure([a, b, c], act(pairId(a, b), pairId(a, c), pairId(b, c)))).toEqual({ create: [], upgrade: [] });
  });
  it('pedido pendente dentro da turma vira amizade (upgrade), e não é criado de novo', () => {
    const pairs = new Map([[pairId(a, b), { st: 'active' }], [pairId(a, c), { st: 'pending' }]]);
    const p = N.planClosure([a, b, c], pairs);
    expect(p.upgrade).toEqual([pairId(a, c)]);
    expect(p.create).toEqual([pairId(b, c)]);
  });
  it('a ordem dos membros e os repetidos não mudam nada', () => {
    const x = N.planClosure([a, b, c, d], act(pairId(a, b)));
    const y = N.planClosure([d, c, b, a, a, b, d], act(pairId(a, b)));
    expect(y).toEqual(x);
    expect(x.create).toHaveLength(5);
  });
  it('uma pessoa só, ou ninguém: não há par', () => {
    expect(N.planClosure([a], new Map())).toEqual({ create: [], upgrade: [] });
    expect(N.planClosure([], new Map())).toEqual({ create: [], upgrade: [] });
  });
  it('turma cheia (31) sem nenhuma amizade: 465 pares, cada um uma vez', () => {
    const ms = Array.from({ length: N.CREW_MAX }, (_, i) => uid(i + 10)), p = N.planClosure(ms, new Map());
    expect(N.CREW_MAX).toBe(31);
    expect(p.create).toHaveLength(31 * 30 / 2);
    expect(new Set(p.create).size).toBe(465);
  });
  it('todo id é canônico: o mesmo que o app e as regras calculam, com os dois ids na ordem certa (maiúsculas e minúsculas misturadas)', () => {
    const ms = ['aaaaaaaaaaB', 'AAAAAAAAAAc', 'bbbbbbbbbbA', 'Bbbbbbbbbbb', 'zzzzzzzzzzz', 'ZZZZZZZZZZy', 'Mmmmmmmmmm1', 'mmmmmmmmmm0'];
    const p = N.planClosure(ms, new Map());
    expect(p.create).toHaveLength(28);
    p.create.forEach((id) => {
      const [x, y] = id.split('_');
      expect(ms).toContain(x); expect(ms).toContain(y);
      expect(id).toBe(pairId(x, y));
      expect(id).toBe(pairId(y, x));
    });
  });
  it('propriedade: depois do plano, todo par da turma é uma amizade ativa, e nada é criado por cima do que já existe', () => {
    for (let k = 0; k < 120; k++) {
      const n = 2 + Math.floor(rnd() * 9), ms = Array.from({ length: n }, (_, i) => uid(100 + i + k * 20)), pairs = new Map();
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const r = rnd(); if (r < 0.35) pairs.set(pairId(ms[i], ms[j]), { st: 'active' }); else if (r < 0.5) pairs.set(pairId(ms[i], ms[j]), { st: 'pending' }); }
      const plan = N.planClosure(ms, pairs), done = new Map(pairs);
      plan.create.forEach((id) => { expect(done.has(id)).toBe(false); done.set(id, { st: 'active' }); });
      plan.upgrade.forEach((id) => { expect(done.get(id).st).toBe('pending'); done.set(id, { st: 'active' }); });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(done.get(pairId(ms[i], ms[j]))).toEqual({ st: 'active' });
      expect(plan.create.length + plan.upgrade.length + Array.from(pairs.values()).filter((x) => x.st === 'active').length).toBe(n * (n - 1) / 2);
    }
  });
  it('quem já é amigo de todos não gera nada (o fechamento é idempotente)', () => {
    const ms = [a, b, c, d], all = new Map();
    N.planClosure(ms, all).create.forEach((id) => all.set(id, { st: 'active' }));
    expect(N.planClosure(ms, all)).toEqual({ create: [], upgrade: [] });
  });
});

describe('autoDoc: o documento de uma amizade automática', () => {
  const [a, b] = [uid(1), uid(2)], id = pairId(a, b), ts = { fake: 'timestamp' };
  const prof = (nm, mc) => ({ nm: nm, mc: mc, ins: [], met: false, st: 0, day: '2026-10-19', sh: true });
  it('no mesmo formato das que os aplicativos criam, mais auto: true, já ativa e com a data dos dois lados', () => {
    const [x, y] = id.split('_');
    const doc = N.autoDoc(id, new Map([[x, prof('Ana', 'baleia')], [y, prof('Bia', 'polvo')]]), ts);
    expect(doc).toEqual({ m: [x, y], by: x, st: 'active', nm: 'Ana', mc: 'baleia', tn: 'Bia', tc: 'polvo', at: ts, ok: ts, auto: true });
    expect(Object.keys(doc).sort()).toEqual(['at', 'auto', 'by', 'm', 'mc', 'nm', 'ok', 'st', 'tc', 'tn']);
  });
  it('o par que ele descreve é um par de verdade para o servidor (dois ids válidos, ativa)', () => {
    const doc = N.autoDoc(id, new Map(), ts);
    expect(pairOf(doc)).toBe(doc);
    expect(doc.m.every((u) => UID_RE.test(u))).toBe(true);
    expect(pairId(doc.m[0], doc.m[1])).toBe(id);
  });
  it('quem não tem perfil vira "Amigo", com o mascote padrão', () => {
    const doc = N.autoDoc(id, new Map(), ts);
    expect(doc).toMatchObject({ nm: 'Amigo', tn: 'Amigo', mc: 'concha', tc: 'concha' });
  });
  it('o nome passa pela limpeza do app (invisíveis, < >, 20 letras) e o mascote estranho vira o padrão', () => {
    const [x, y] = id.split('_');
    const doc = N.autoDoc(id, new Map([[x, prof('  Zé​ <b> ' + 'x'.repeat(40), 'x'.repeat(30))], [y, prof('​​', 42)]]), ts);
    expect(doc.nm).toBe('Zé b xxxxxxxxxxxxxxx'.slice(0, 20).trim());
    expect(doc.nm.length).toBeLessThanOrEqual(20);
    expect(doc.mc).toBe('concha');
    expect(doc.tn).toBe('Amigo'); // só invisíveis: não sobra nome
    expect(doc.tc).toBe('concha');
  });
});

describe('hitOf: "um amigo bateu a meta" só na primeira vez de cada dia', () => {
  const day = '2026-10-19';
  const P = (o) => Object.assign({ v: 1, nm: 'Ana', mc: 'concha', ins: [], pct: 100, met: true, st: 3, day: day, sh: true, gl: 2000, wm: 1 }, o || {});
  it('perfil que passa a mostrar a meta batida: avisa', () => {
    expect(CP.hitOf(P({ met: false, pct: 80 }), P())).toBe(true);
    expect(CP.hitOf(null, P())).toBe(true); // perfil novo já com a meta batida
    expect(CP.hitOf(undefined, P())).toBe(true);
  });
  it('publicar de novo o mesmo dia com a meta já batida: não repete', () => {
    expect(CP.hitOf(P(), P())).toBe(false);
    expect(CP.hitOf(P(), P({ pct: 100, st: 4, gl: 2500, wm: 3 }))).toBe(false); // mudou outra coisa, a meta continua batida
    expect(CP.hitOf(P(), P({ nm: 'Outro nome' }))).toBe(false);
  });
  it('no dia seguinte, bater de novo avisa de novo', () => {
    expect(CP.hitOf(P(), P({ day: '2026-10-20' }))).toBe(true);
    expect(CP.hitOf(P({ day: '2026-10-18' }), P())).toBe(true);
  });
  it('quem não mostra o progresso (sh falso) nunca avisa, nem ao voltar a mostrar sem ter batido', () => {
    expect(CP.hitOf(P({ met: false }), P({ sh: false }))).toBe(false);
    expect(CP.hitOf(null, P({ sh: false }))).toBe(false);
    expect(CP.hitOf(P({ sh: false }), P({ met: false }))).toBe(false);
  });
  it('só a meta batida vale: met precisa ser true de verdade', () => {
    [false, 0, 1, 'true', null, undefined].forEach((v) => expect(CP.hitOf(P({ met: false }), P({ met: v }))).toBe(false));
  });
  it('perfil apagado ou estranho: nada', () => {
    [null, undefined, 0, 'x', [], 7].forEach((after) => expect(CP.hitOf(P(), after)).toBe(false));
  });
  it('dia que não é um dia: nada', () => {
    ['', 'ontem', '2026-1-9', '2026-10-19T10:00', 20261019, null].forEach((dd) => expect(CP.hitOf(P({ met: false }), P({ day: dd }))).toBe(false));
  });
  it('quem estava com a meta batida e pausou o progresso, ao voltar a mostrar, avisa de novo (o aviso é por "mostrar", não por "bater")', () => {
    expect(CP.hitOf(P({ sh: false }), P())).toBe(true);
  });
});

describe('weekOf: os 7 dias de um amigo, a mesma conta do app', () => {
  const TODAY = '2026-10-19';
  const prof = (o) => Object.assign({ nm: 'Ana', mc: 'concha', ins: [], pct: 0, met: false, st: 0, day: TODAY, sh: true, wm: 0 }, o || {});
  const both = (p, today) => { const s = CP.weekOf(p, today), c = SO.weekOf(p, today); return { s: { n: s.n, known: s.known }, c: { n: c.n, known: c.known } }; };
  it('a máscara conta os dias a partir do dia do perfil: bit 0 = hoje, bit 1 = ontem…', () => {
    expect(CP.weekOf(prof({ wm: 0b0000001 }), TODAY)).toEqual({ n: 1, known: true });
    expect(CP.weekOf(prof({ wm: 0b1111111 }), TODAY)).toEqual({ n: 7, known: true });
    expect(CP.weekOf(prof({ wm: 0b1010101 }), TODAY)).toEqual({ n: 4, known: true });
    expect(CP.weekOf(prof({ wm: 0 }), TODAY)).toEqual({ n: 0, known: true });
  });
  it('perfil parado há dias: a janela anda e os dias em que ele não apareceu contam como não batidos', () => {
    // perfil de 3 dias atrás com os 7 dias batidos: vistos de hoje sobram os bits 0..3 (os 4 dias mais antigos da janela)
    expect(CP.weekOf(prof({ day: addDays(TODAY, -3), wm: 0b1111111 }), TODAY)).toEqual({ n: 4, known: true });
    expect(CP.weekOf(prof({ day: addDays(TODAY, -7), wm: 0b1111111 }), TODAY)).toEqual({ n: 0, known: true });
    expect(CP.weekOf(prof({ day: addDays(TODAY, -40), wm: 0b1111111 }), TODAY)).toEqual({ n: 0, known: true });
  });
  it('sem a máscara, em pausa, ou com um dia que ainda nem chegou (3 ou mais à frente): não dá para saber', () => {
    expect(CP.weekOf(prof({ wm: null }), TODAY).known).toBe(false);
    expect(CP.weekOf(prof({ wm: undefined }), TODAY).known).toBe(false);
    expect(CP.weekOf(prof({ wm: 127, sh: false }), TODAY).known).toBe(false);
    expect(CP.weekOf(prof({ wm: 127, day: addDays(TODAY, 3) }), TODAY).known).toBe(false);
    expect(CP.weekOf(null, TODAY)).toEqual({ n: 0, known: false });
    expect(CP.weekOf(undefined, TODAY)).toEqual({ n: 0, known: false });
    expect(CP.weekOf('x', TODAY)).toEqual({ n: 0, known: false });
  });
  it('quem está um dia ou dois à frente (outro fuso) ainda vale; a janela só não anda para trás', () => {
    expect(CP.weekOf(prof({ day: addDays(TODAY, 1), wm: 0b0000111 }), TODAY)).toEqual({ n: 3, known: true });
    expect(CP.weekOf(prof({ day: addDays(TODAY, 2), wm: 0b0000111 }), TODAY)).toEqual({ n: 3, known: true });
  });
  it('máscara fora do intervalo vira o limite (0 a 127), sem quebrar', () => {
    expect(CP.weekOf(prof({ wm: 999 }), TODAY)).toEqual({ n: 7, known: true });
    expect(CP.weekOf(prof({ wm: -5 }), TODAY)).toEqual({ n: 0, known: true });
    expect(CP.weekOf(prof({ wm: 'abc' }), TODAY)).toEqual({ n: 0, known: true });
    expect(CP.weekOf(prof({ wm: 5.9 }), TODAY)).toEqual({ n: 2, known: true });
  });
  it('é a mesma conta do app em milhares de perfis sorteados (de 40 dias atrás a 4 dias à frente, máscaras de 0 a 130)', () => {
    for (let i = 0; i < 4000; i++) {
      const p = prof({ day: addDays(TODAY, Math.floor(rnd() * 45) - 40), wm: rnd() < 0.1 ? null : Math.floor(rnd() * 131), sh: rnd() < 0.9 });
      const { s, c } = both(p, TODAY);
      expect(s).toEqual(c);
    }
  });
  it('e com "hoje" mudando: a conta não depende do dia da semana nem do mês (virada de mês e de ano)', () => {
    ['2026-02-28', '2026-03-01', '2026-12-31', '2027-01-01', '2028-02-29'].forEach((today) => {
      for (let i = 0; i < 300; i++) {
        const p = prof({ day: addDays(today, 2 - Math.floor(rnd() * 10)), wm: Math.floor(rnd() * 128) });
        const { s, c } = both(p, today);
        expect(s).toEqual(c);
      }
    });
  });
});

describe('weekOfCrew: o resumo da turma, visto por uma pessoa', () => {
  const TODAY = '2026-10-19';
  const prof = (wm, o) => Object.assign({ nm: 'X', mc: 'concha', ins: [], pct: 0, met: false, st: 0, day: TODAY, sh: true, wm: wm }, o || {});
  const profiles = (obj) => new Map(Object.keys(obj).map((k) => [k, obj[k]]));
  const me = uid(1), f1 = uid(2), f2 = uid(3);
  it('soma os acertos de todos os que mostram a semana, de quantos possíveis, e quantos foram os meus', () => {
    const w = CP.weekOfCrew(profiles({ [me]: prof(0b0000111), [f1]: prof(0b0001111), [f2]: prof(0b0000001) }), me, [me, f1, f2], TODAY);
    expect(w).toEqual({ hits: 3 + 4 + 1, total: 21, mine: 3 });
  });
  it('quem não mostra a semana (sem perfil, pausa, sem máscara) não entra na conta de possíveis', () => {
    const w = CP.weekOfCrew(profiles({ [me]: prof(0b0000011), [f1]: prof(0b0000111), [f2]: prof(127, { sh: false }) }), me, [me, f1, f2], TODAY);
    expect(w).toEqual({ hits: 5, total: 14, mine: 2 });
    expect(CP.weekOfCrew(profiles({ [me]: prof(1), [f1]: prof(null) }), me, [me, f1], TODAY)).toBeNull(); // o único amigo não mostra: ninguém mais para contar
    expect(CP.weekOfCrew(profiles({ [me]: prof(1) }), me, [me, f1], TODAY)).toBeNull(); // o amigo nem tem perfil
  });
  it('eu não mostro a semana: a turma conta sem mim e "mine" fica vazio (o texto simplesmente não fala dos meus dias)', () => {
    const w = CP.weekOfCrew(profiles({ [me]: prof(127, { sh: false }), [f1]: prof(0b0000111) }), me, [me, f1], TODAY);
    expect(w).toEqual({ hits: 3, total: 7, mine: null });
  });
  it('ninguém bateu a meta na semana: nada a dizer (nenhum aviso "a turma bateu 0 vezes")', () => {
    expect(CP.weekOfCrew(profiles({ [me]: prof(0), [f1]: prof(0), [f2]: prof(0) }), me, [me, f1, f2], TODAY)).toBeNull();
  });
  it('só eu bati a meta e os outros mostram a semana vazia: a turma tem acertos (os meus), então avisa', () => {
    expect(CP.weekOfCrew(profiles({ [me]: prof(0b0000011), [f1]: prof(0) }), me, [me, f1], TODAY)).toEqual({ hits: 2, total: 14, mine: 2 });
  });
  it('semana perfeita: acertos = possíveis', () => {
    expect(CP.weekOfCrew(profiles({ [me]: prof(127), [f1]: prof(127) }), me, [me, f1], TODAY)).toEqual({ hits: 14, total: 14, mine: 7 });
  });
  it('é o mesmo número do resumo da tela (turmaWeek do app) em turmas sorteadas', () => {
    for (let i = 0; i < 600; i++) {
      const n = 2 + Math.floor(rnd() * 8), ids = Array.from({ length: n }, (_, k) => uid(500 + k + i * 10)), map = new Map(), members = [];
      ids.forEach((id, k) => {
        const p = prof(rnd() < 0.12 ? null : Math.floor(rnd() * 128), { day: addDays(TODAY, -Math.floor(rnd() * 5)), sh: rnd() < 0.88, met: rnd() < 0.3, pct: Math.floor(rnd() * 101) });
        if (rnd() < 0.08) return; // sem perfil
        map.set(id, p);
        members.push(Object.assign(SO.memberOf(Object.assign({ uid: id }, p), TODAY), { me: k === 0 }));
      });
      const app = SO.turmaWeek(members), srv = CP.weekOfCrew(map, ids[0], ids, TODAY);
      if (app.kind === 'some' || app.kind === 'all') expect(srv).toMatchObject({ hits: app.met, total: app.total });
      else expect(srv).toBeNull();
    }
  });
});

/* ---------- 1.13.0: o desafio da turma no resumo de domingo ---------- */
describe('functions/core.js: a cópia do motor do app', () => {
  const sha = (rel) => createHash('sha256').update(readFileSync(new URL(rel, import.meta.url))).digest('hex');
  it('é idêntica, byte a byte, a public/js/core.js (depois de mexer no motor: npm run sync:functions)', () => {
    expect(sha('../functions/core.js')).toBe(sha('../public/js/core.js'));
  });
  it('a pasta functions/ é autossuficiente: nenhum arquivo importa nada de fora dela (ela sobe sozinha para a nuvem)', () => {
    const files = readdirSync(new URL('../functions/', import.meta.url)).filter((f) => f.endsWith('.js'));
    expect(files).toContain('core.js');
    let seen = 0;
    files.forEach((f) => {
      const src = readFileSync(new URL('../functions/' + f, import.meta.url), 'utf8'), paths = [];
      src.replace(/(?:^|\s)(?:import|export)\b[^;'"]*?from\s*['"]([^'"]+)['"]/g, (m, p) => { paths.push(p); return m; });
      src.replace(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, (m, p) => { paths.push(p); return m; });
      paths.forEach((p) => {
        if (!p.startsWith('.')) return;
        seen++;
        expect([f, p, /^\.\/[\w-]+\.js$/.test(p) && files.includes(p.slice(2))]).toEqual([f, p, true]);
      });
    });
    expect(seen).toBeGreaterThan(5); // a conferência acha mesmo os imports (crew-push.js importa './core.js', './social-push.js'…)
  });
});

describe('weekDays: os 7 dias de um perfil, um a um (a base da conta do desafio da turma no servidor)', () => {
  const TODAY = '2026-12-24'; // quinta-feira
  const prof = (wm, o) => Object.assign({ nm: 'X', day: TODAY, sh: true, wm: wm }, o || {});
  const T = true, F = false, NO = { known: false, days: [F, F, F, F, F, F, F], away: 99 };
  it('o bit 0 da máscara é o dia do perfil: com o perfil de hoje, days[i] é o dia (hoje − i)', () => {
    expect(CP.weekDays(prof(0b0000101), TODAY)).toEqual({ known: true, days: [T, F, T, F, F, F, F], away: 0 });
    expect(CP.weekDays(prof(127), TODAY)).toEqual({ known: true, days: [T, T, T, T, T, T, T], away: 0 });
    expect(CP.weekDays(prof(0), TODAY)).toEqual({ known: true, days: [F, F, F, F, F, F, F], away: 0 });
  });
  it('perfil parado há alguns dias: a janela anda, os dias sem aparecer contam como não batidos e away diz há quantos dias', () => {
    expect(CP.weekDays(prof(0b0000111, { day: addDays(TODAY, -2) }), TODAY)).toEqual({ known: true, days: [F, F, T, T, T, F, F], away: 2 });
    expect(CP.weekDays(prof(127, { day: addDays(TODAY, -5) }), TODAY)).toEqual({ known: true, days: [F, F, F, F, F, T, T], away: 5 });
    expect(CP.weekDays(prof(127, { day: addDays(TODAY, -7) }), TODAY)).toEqual({ known: true, days: [F, F, F, F, F, F, F], away: 7 });
  });
  it('o perfil de até 2 dias à frente (outro fuso) vale como hoje; de 3 dias à frente em diante não dá para saber', () => {
    expect(CP.weekDays(prof(0b11, { day: addDays(TODAY, 1) }), TODAY)).toEqual({ known: true, days: [T, T, F, F, F, F, F], away: 0 });
    expect(CP.weekDays(prof(0b11, { day: addDays(TODAY, 2) }), TODAY)).toEqual({ known: true, days: [T, T, F, F, F, F, F], away: 0 });
    expect(CP.weekDays(prof(0b11, { day: addDays(TODAY, 3) }), TODAY)).toEqual(NO);
  });
  it('sem a semana (sem perfil, sem máscara, em pausa, dia que não é um dia): known é false e away é 99', () => {
    [null, undefined, 'x', 5, [], {}, prof(null), prof(undefined), prof(127, { sh: false }), prof(127, { day: undefined }), prof(127, { day: 20261224 }),
      prof(127, { day: '2026-12-4' }), prof(127, { day: '24/12/2026' }), prof(127, { day: '' })].forEach((p) => expect(CP.weekDays(p, TODAY)).toEqual(NO));
  });
  it('a máscara é limitada a 0..127 e a parte inteira, como no app; o que não é número é nenhum dia', () => {
    expect(CP.weekDays(prof(300), TODAY).days).toEqual([T, T, T, T, T, T, T]);
    expect(CP.weekDays(prof(-5), TODAY).days).toEqual([F, F, F, F, F, F, F]);
    expect(CP.weekDays(prof(2.9), TODAY).days).toEqual([F, T, F, F, F, F, F]);
    expect(CP.weekDays(prof('x'), TODAY)).toEqual({ known: true, days: [F, F, F, F, F, F, F], away: 0 });
  });
  it('é a mesma conta do app (weekOf e liveOf) em perfis sorteados: os mesmos 7 dias e os mesmos dias parado', () => {
    let known = 0;
    for (let i = 0; i < 3000; i++) {
      const today = addDays('2026-12-01', Math.floor(rnd() * 60)), p = prof(Math.floor(rnd() * 128), { day: addDays(today, 3 - Math.floor(rnd() * 12)), sh: rnd() < 0.85 });
      const s = CP.weekDays(p, today), a = SO.weekOf(p, today);
      expect(s.known).toBe(a.known);
      if (a.known) { known++; expect(s.days).toEqual(a.days); expect(s.away).toBe(SO.liveOf(p, today).away); }
    }
    expect(known).toBeGreaterThan(1500); // o sorteio exercita os dois lados
  });
});

describe('crewWonOf: o desafio da turma da semana, visto pelo servidor (a frase a mais do resumo de domingo)', () => {
  const none = (n) => Array.from({ length: n }, () => [0, 0, 0, 0, 0, 0, 0]);
  const ruleOf = (mon) => C.crewInfo(C.defaults(1), none(2), mon, mon).c; // o desafio da semana que começa na segunda-feira mon
  const MON = '2026-12-21', SUNDAY = '2026-12-27'; // a semana da "Maré da semana": 4 metas por pessoa, em média
  const prof = (wm, o) => Object.assign({ nm: 'X', mc: 'concha', ins: [], pct: 0, met: false, st: 0, day: SUNDAY, sh: true, wm: wm }, o || {});
  const map = (obj) => new Map(Object.keys(obj).map((k) => [k, obj[k]]));
  const me = uid(1), f1 = uid(2), f2 = uid(3), f3 = uid(4);
  const won = (m, ids, today) => CP.crewWonOf(m, me, ids || [me, f1, f2], today || SUNDAY);
  const trio = (a, b, c) => map({ [me]: prof(a), [f1]: prof(b), [f2]: prof(c) });
  const TITLE = 'Maré da semana';
  it('a semana de 21/12/2026 é a da "Maré da semana" (a conta dos testes abaixo parte daí)', () => {
    expect(ruleOf(MON)).toMatchObject({ id: 'ctotal', t: TITLE });
    expect(C.weekStart(SUNDAY)).toBe(MON);
  });
  it('a turma fecha a conta: o resultado é o título do desafio; uma meta a menos e a frase some (3 pessoas pedem 12 metas, 4 por pessoa)', () => {
    expect(won(trio(127, 0b0001111, 0b0000011))).toBe(TITLE); // 7 + 4 + 2 = 13
    expect(won(trio(127, 0b0001111, 0b0000001))).toBe(TITLE); // 12: exato
    expect(won(trio(127, 0b0001111, 0))).toBe(''); // 11
    expect(won(trio(0b0001111, 0b0001111, 0b0001111))).toBe(TITLE); // 4 por pessoa, todo mundo igual: 12
    expect(won(trio(0b0000111, 0b0000111, 0b0000111))).toBe(''); // 3 por pessoa: 9
  });
  it('eu preciso ter batido a meta em algum dia da semana: com a conta fechada só pelos outros, não há vitória (o app diz "falta só você")', () => {
    expect(won(trio(0, 127, 127))).toBe(''); // 14 de 12, e eu com zero
    expect(won(trio(1, 127, 127))).toBe(TITLE); // um dia meu basta
  });
  it('sem a minha semana (progresso em pausa, sem máscara, sem perfil) não há turma para mim: nada', () => {
    expect(won(map({ [me]: prof(127, { sh: false }), [f1]: prof(127), [f2]: prof(127) }))).toBe('');
    expect(won(map({ [me]: prof(null), [f1]: prof(127), [f2]: prof(127) }))).toBe('');
    expect(won(map({ [f1]: prof(127), [f2]: prof(127) }))).toBe('');
    expect(won(map({ [me]: prof(127, { day: addDays(SUNDAY, 3) }), [f1]: prof(127), [f2]: prof(127) }))).toBe(''); // um perfil de 3 dias à frente não vale
  });
  it('um amigo parado há 3 dias ainda conta (os acertos dele que cabem na semana); parado há 4, não: a turma volta a ser só eu', () => {
    const two = (b) => map({ [me]: prof(127), [f1]: prof(b.wm, { day: addDays(SUNDAY, -b.away) }) });
    // 2 pessoas pedem 8 metas: as minhas 7 mais 1 do amigo, na quinta
    expect(won(two({ wm: 1, away: 3 }), [me, f1])).toBe(TITLE);
    expect(won(two({ wm: 0, away: 3 }), [me, f1])).toBe(''); // 7 de 8
    expect(won(two({ wm: 127, away: 4 }), [me, f1])).toBe(''); // fora da conta: sobra uma pessoa, e uma pessoa só não tem desafio
  });
  it('quem não mostra a semana (pausa, sem máscara, sem perfil, dia à frente demais, parado há mais de 3 dias) fica fora da conta de quantas pessoas', () => {
    // eu 7 + o primeiro amigo 1 = 8: com 2 pessoas na conta fecha (pede 8); com 3 pessoas (pede 12), não
    const base = (third) => { const m = map({ [me]: prof(127), [f1]: prof(1) }); if (third) m.set(f2, third); return m; };
    expect(won(base(prof(0)))).toBe(''); // o terceiro mostra a semana (e não bateu nada): a conta pede 12
    expect(won(base(prof(0, { day: addDays(SUNDAY, -3) })))).toBe(''); // parado há 3 dias: ainda conta
    [prof(0, { sh: false }), prof(null), null, prof(0, { day: addDays(SUNDAY, 3) }), prof(0, { day: addDays(SUNDAY, -4) })].forEach((third) => {
      expect(won(base(third))).toBe(TITLE);
    });
  });
  it('na segunda-feira nenhuma das doze regras fecha com a turma inteira batendo a meta: um dia só nunca vence', () => {
    for (let w = 0; w < 14; w++) { // as 2 semanas da época da 1.13.0 (10 regras) e a volta inteira da época da 1.14.0 (12 regras, a partir de 4/1/2027)
      const mon = addDays(MON, 7 * w), all = map({ [me]: prof(127, { day: mon }), [f1]: prof(127, { day: mon }), [f2]: prof(127, { day: mon }), [f3]: prof(127, { day: mon }) });
      expect([mon, won(all, [me, f1, f2, f3], mon)]).toEqual([mon, '']);
    }
  });
  it('no domingo, com a turma inteira batendo a meta a semana toda, sai o título do desafio de cada uma das doze regras (e nenhuma outra coisa)', () => {
    const titles = [];
    for (let w = 0; w < 14; w++) { // 2 semanas da época da 1.13.0 e a volta de 12 da época da 1.14.0: todas as regras aparecem
      const mon = addDays(MON, 7 * w), sun = addDays(mon, 6);
      const all = map({ [me]: prof(127, { day: sun }), [f1]: prof(127, { day: sun }), [f2]: prof(127, { day: sun }), [f3]: prof(127, { day: sun }) });
      const t = won(all, [me, f1, f2, f3], sun);
      expect([mon, t]).toEqual([mon, ruleOf(mon).t]);
      titles.push(t);
    }
    expect(new Set(titles)).toEqual(new Set(C.CREW_CHALLENGES.map((c) => c.t)));
  });
  // o app de quem olha: meta manual de 2.000 ml, os dias batidos pela máscara mine (o bit 0 é today) e o "mostrar o progresso" shares
  const appState = (mine, today, shares, extra) => {
    const base = C.defaults(1), S = Object.assign({}, base, { onboarded: true, social: { on: true, nick: 'Eu', share: shares, code: '' }, days: {} }, extra || {});
    S.goal = Object.assign({}, base.goal, { mode: 'manual', manual: 2000 });
    for (let b = 0; b < 7; b++) if ((mine >> b) & 1) S.days[addDays(today, -b)] = { goal: 2000, entries: [{ id: 'a', t: 1, ml: 2000, d: 'water' }] };
    return S;
  };
  it('é a mesma conta do app (crewGoal) em milhares de turmas sorteadas, em todos os dias da semana, antes e depois das datas de estreia', () => {
    let wins = 0, quiet = 0;
    for (let i = 0; i < 3000; i++) {
      const today = addDays('2026-12-07', i % 91), n = 2 + Math.floor(rnd() * 7), dens = rnd();
      const mask = () => { let m = 0; for (let b = 0; b < 7; b++) if (rnd() < dens) m |= 1 << b; return m; };
      const ids = Array.from({ length: n }, (_, k) => uid(1000 + k + i * 10)), profiles = new Map(), friends = [];
      const mine = mask(), shares = rnd() < 0.92;
      profiles.set(ids[0], prof(mine, { day: today, sh: shares }));
      ids.slice(1).forEach((id) => {
        if (rnd() < 0.08) return; // sem perfil
        const p = prof(rnd() < 0.1 ? null : mask(), { day: addDays(today, 1 - Math.floor(rnd() * 6) + (rnd() < 0.05 ? 3 : 0)), sh: rnd() < 0.9 });
        profiles.set(id, p); friends.push(Object.assign({ uid: id }, p));
      });
      const g = SO.crewGoal(appState(mine, today, shares), friends, today), want = g && g.done ? g.c.t : '';
      expect([today, n, CP.crewWonOf(profiles, ids[0], ids, today)]).toEqual([today, n, want]);
      if (want) wins++; else quiet++;
    }
    expect(wins).toBeGreaterThan(150); // o sorteio exercita os dois lados: há vitórias e há semanas sem vitória
    expect(quiet).toBeGreaterThan(150);
  });
  it('o servidor não vê S.crewWon (as vitórias guardadas no aparelho): vale só o que os perfis dizem agora; no pior caso a frase deixa de aparecer, nunca aparece uma vitória que o app não dá', () => {
    const friends = [Object.assign({ uid: f1 }, prof(0)), Object.assign({ uid: f2 }, prof(0))];
    expect(SO.crewGoal(appState(127, SUNDAY, true), friends, SUNDAY).done).toBe(false); // 7 de 12 metas: a turma não fechou
    expect(SO.crewGoal(appState(127, SUNDAY, true, { crewWon: { [MON]: 1 } }), friends, SUNDAY).done).toBe(true); // o app guardou a vitória (ela fechou antes)
    expect(won(trio(127, 0, 0))).toBe(''); // o servidor só tem os perfis de agora
  });
  it('perfis estranhos (texto, número, lista, objeto vazio, máscara fora do limite) nunca quebram a conta, e o resultado é sempre um texto', () => {
    const junk = [null, undefined, 'x', 5, [], {}, { wm: 'a', day: 3 }, { wm: 7, day: SUNDAY, sh: 'yes' }, { wm: 7, day: SUNDAY }, { wm: {}, day: SUNDAY }, prof(127), prof(1e9), prof(-1), prof(3.5)];
    for (let i = 0; i < 600; i++) {
      const ids = [me, f1, f2, f3, f1], profiles = new Map(ids.map((id) => [id, pick(junk)]));
      const t = CP.crewWonOf(profiles, me, ids, SUNDAY);
      expect(typeof t).toBe('string');
      if (t) expect(t).toBe(TITLE);
    }
  });
});

describe('monthOf e monthWonOf: o desafio da turma do MÊS, visto pelo servidor (a frase do mês no resumo de domingo, só no primeiro domingo do mês)', () => {
  const JAN3 = '2027-01-03', DEC = '2026-12', RULE = 'Turma firme'; // 3/1/2027: domingo e o primeiro de janeiro. O mês que fechou é dezembro de 2026, o da "Turma firme" (17 dos 31 dias)
  // mm = os dias do mês do dia do perfil (aqui, janeiro) em que a pessoa bateu a meta, mp = os do mês anterior a esse (aqui, dezembro: a conta que o servidor lê)
  const mprof = (mm, mp, o) => Object.assign({ nm: 'X', mc: 'concha', ins: [], pct: 0, met: false, st: 0, day: JAN3, sh: true, mm: mm, mp: mp }, o || {});
  const map = (obj) => new Map(Object.keys(obj).map((k) => [k, obj[k]]));
  const me = uid(1), f1 = uid(2), f2 = uid(3), f3 = uid(4);
  const won = (m, ids, today) => CP.monthWonOf(m, me, ids || [me, f1, f2], today || JAN3);
  const trio = (a, b, c) => map({ [me]: mprof(0, a), [f1]: mprof(0, b), [f2]: mprof(0, c) }); // os dias de dezembro de cada um
  const OK = { t: RULE, m: 'dezembro' };
  const ymPrev = (k) => addDays(k.slice(0, 7) + '-01', -1).slice(0, 7);
  it('3/1/2027 é o primeiro domingo de janeiro, e o mês que fechou é dezembro de 2026, o da "Turma firme" (17 dos 31 dias, a maior parte da turma)', () => {
    expect(new Date(Date.UTC(2027, 0, 3)).getUTCDay()).toBe(0);
    const g = C.crewMonthInfo(C.defaults(1), [0, 0, 0, 0], DEC, JAN3);
    expect(g).toMatchObject({ key: DEC, D: 31, need: 3, text: 'Pelo menos 3 das 4 pessoas batem a meta em pelo menos 17 dias deste mês' });
    expect(g.c).toMatchObject({ id: 'mmost', t: RULE });
  });
  it('monthOf: os dias do mês pedido que o perfil conta (mm se o perfil é do próprio mês, mp se é do mês seguinte, 0 se é de antes) ou null quando não dá para saber', () => {
    expect(CP.monthOf(mprof(5, 17), DEC, JAN3)).toBe(17); // perfil de janeiro: dezembro é o mês anterior a ele, mp
    expect(CP.monthOf(mprof(20, 3, { day: '2026-12-31' }), DEC, JAN3)).toBe(20); // perfil de 31/12: mm é o de dezembro
    expect(CP.monthOf(mprof(20, 3, { day: '2026-11-30' }), DEC, JAN3)).toBe(0); // perfil de novembro: ainda não registrou nada em dezembro
    expect(CP.monthOf(mprof(20, 3, { day: '2027-02-01' }), DEC, '2027-02-01')).toBeNull(); // perfil de fevereiro: dezembro ficou dois meses para trás
    // dias que não cabem no mês: nunca mais que o tamanho do mês (fevereiro tem 28), nunca fora de 0 a 31, e a parte quebrada some
    expect(CP.monthOf(mprof(31, 31, { day: '2027-03-02' }), '2027-02', '2027-03-02')).toBe(28);
    expect(CP.monthOf(mprof(31, 99), DEC, JAN3)).toBe(31);
    expect(CP.monthOf(mprof(99, 0, { day: '2026-12-31' }), DEC, JAN3)).toBe(31);
    expect(CP.monthOf(mprof(0, -5), DEC, JAN3)).toBe(0);
    expect(CP.monthOf(mprof(0, 17.9), DEC, JAN3)).toBe(17);
    // sem como saber: app antigo (sem mm), texto ou número quebrado no lugar da conta, progresso em pausa, um dia que ainda nem chegou, um dia que não é dia
    [mprof(undefined, 17), mprof(null, 17), mprof('9', 17), mprof(NaN, 17), mprof(Infinity, 17), mprof(5, 17, { sh: false }), mprof(5, 17, { day: addDays(JAN3, 3) }),
      mprof(5, 17, { day: 'ontem' }), mprof(5, 17, { day: undefined })].forEach((q) => expect(CP.monthOf(q, DEC, JAN3)).toBeNull());
    expect(CP.monthOf(mprof(5, undefined), DEC, JAN3)).toBeNull(); // perfil de janeiro sem o mês anterior (mp)
    expect(CP.monthOf(mprof(5, '17'), DEC, JAN3)).toBeNull();
    expect(CP.monthOf(mprof(5, undefined, { day: '2026-12-31' }), DEC, JAN3)).toBe(5); // o perfil de dezembro não precisa dele
    expect(CP.monthOf(mprof(5, 17, { day: addDays(JAN3, 2) }), DEC, JAN3)).toBe(17); // dois dias à frente (o fuso explica) ainda vale
    [null, undefined, 'x', 5, [], {}, true].forEach((q) => expect(CP.monthOf(q, DEC, JAN3)).toBeNull());
  });
  it('a turma fecha a conta de dezembro: o resultado é o título e o nome do mês; uma pessoa a menos nos 17 dias e a frase some (4 pessoas pedem 3 com 17 dias ou mais)', () => {
    const four = (a, b, c, d) => map({ [me]: mprof(0, a), [f1]: mprof(0, b), [f2]: mprof(0, c), [f3]: mprof(0, d) }), ids4 = [me, f1, f2, f3];
    expect(won(four(17, 17, 17, 0), ids4)).toEqual(OK);
    expect(won(four(31, 17, 17, 0), ids4)).toEqual(OK);
    expect(won(four(17, 17, 16, 0), ids4)).toBeNull(); // só 2 das 4 chegam a 17
    expect(won(four(4, 31, 31, 31), ids4)).toEqual(OK); // eu não preciso estar entre os que chegam a 17: bastam 4 dias meus
    expect(won(four(31, 31, 16, 16), ids4)).toBeNull();
    expect(won(trio(17, 17, 0))).toEqual(OK); // 3 pessoas pedem 2
    expect(won(trio(17, 16, 16))).toBeNull();
  });
  it('eu preciso ter batido a meta em pelo menos 4 dias do mês (CREW_MONTH_MINE): com a conta fechada só pelos outros, não há vitória (o app diz "falta você")', () => {
    expect(C.CREW_MONTH_MINE).toBe(4);
    [0, 1, 3].forEach((n) => expect([n, won(trio(n, 31, 31))]).toEqual([n, null]));
    [4, 5, 31].forEach((n) => expect([n, won(trio(n, 31, 31))]).toEqual([n, OK]));
  });
  it('só nos 7 primeiros dias do mês (o único domingo deles é o primeiro): do dia 8 em diante nunca, nem com a turma perfeita; nos 7 primeiros, o mês que fechou, com o título dele', () => {
    let inside = 0;
    for (let i = 0; i < 365; i++) {
      const today = addDays('2027-01-01', i), dom = +today.slice(8);
      const all = map({ [me]: mprof(31, 31, { day: today }), [f1]: mprof(31, 31, { day: today }), [f2]: mprof(31, 31, { day: today }) });
      const r = won(all, null, today), prev = ymPrev(today);
      if (dom <= 7) { inside++; expect([today, r]).toEqual([today, { t: C.crewMonthInfo(C.defaults(1), [0, 0, 0], prev, today).c.t, m: C.MONTH_NAMES[+prev.slice(5, 7) - 1] }]); }
      else expect([today, r]).toEqual([today, null]);
    }
    expect(inside).toBe(12 * 7); // sete dias por mês, todos os meses de 2027
  });
  it('antes da estreia (dezembro de 2026 é o primeiro mês com desafio da turma) não há vitória do mês, mesmo com a turma perfeita', () => {
    expect(C.CREW_MONTH_FROM).toBe('2026-12');
    const all = (today) => map({ [me]: mprof(31, 31, { day: today }), [f1]: mprof(31, 31, { day: today }), [f2]: mprof(31, 31, { day: today }) });
    ['2026-11-01', '2026-11-05', '2026-12-01', '2026-12-06', '2026-12-07'].forEach((d) => expect([d, won(all(d), null, d)]).toEqual([d, null]));
    expect(won(all('2027-01-01'), null, '2027-01-01')).toEqual(OK);
  });
  it('em cada primeiro domingo de 2027 a vitória do mês que fechou sai com o título da regra daquele mês e o nome certo (fevereiro com 28 dias, os meses de 30 e 31)', () => {
    const want = [['2027-01-03', 'Turma firme', 'dezembro'], ['2027-02-07', 'Quase todos a bordo', 'janeiro'], ['2027-03-07', 'Turma firme', 'fevereiro'], ['2027-04-04', 'Maré do mês', 'março'],
      ['2027-05-02', 'Ritmo forte', 'abril'], ['2027-06-06', 'Quase todos a bordo', 'maio'], ['2027-07-04', 'Maré do mês', 'junho'], ['2027-08-01', 'Ritmo forte', 'julho'],
      ['2027-09-05', 'Turma firme', 'agosto'], ['2027-10-03', 'Ritmo forte', 'setembro'], ['2027-11-07', 'Turma firme', 'outubro'], ['2027-12-05', 'Maré do mês', 'novembro']];
    want.forEach(([today, t, m]) => {
      expect(new Date(Date.parse(today + 'T00:00:00Z')).getUTCDay()).toBe(0); // é domingo
      expect(+today.slice(8)).toBeLessThanOrEqual(7); // e o primeiro do mês
      const all = map({ [me]: mprof(31, 31, { day: today }), [f1]: mprof(31, 31, { day: today }), [f2]: mprof(31, 31, { day: today }) });
      expect([today, won(all, null, today)]).toEqual([today, { t: t, m: m }]);
    });
    expect(new Set(want.map((w) => w[1]))).toEqual(new Set(C.CREW_MONTHLY.map((c) => c.t)));
  });
  it('os limites de cada regra são os do app: fevereiro (28 dias) pede 15 na "Turma firme"; março (31) pede 18 por pessoa, em média, na "Maré do mês"; o terceiro, um a menos, e a frase some', () => {
    const FEB = '2027-03-07', MAR = '2027-04-04';
    const at = (today, a, b, c) => map({ [me]: mprof(0, a, { day: today }), [f1]: mprof(0, b, { day: today }), [f2]: mprof(0, c, { day: today }) });
    expect(won(at(FEB, 15, 15, 0), null, FEB)).toEqual({ t: 'Turma firme', m: 'fevereiro' });
    expect(won(at(FEB, 15, 14, 0), null, FEB)).toBeNull();
    expect(won(at(FEB, 31, 31, 31), null, FEB)).toEqual({ t: 'Turma firme', m: 'fevereiro' }); // 31 num mês de 28 conta 28
    expect(won(at(MAR, 18, 18, 18), null, MAR)).toEqual({ t: 'Maré do mês', m: 'março' }); // 54 metas = 3 × 18
    expect(won(at(MAR, 18, 18, 17), null, MAR)).toBeNull(); // 53
    expect(won(at(MAR, 31, 20, 3), null, MAR)).toEqual({ t: 'Maré do mês', m: 'março' }); // a média é da turma: 54 também
  });
  it('sem a minha conta (progresso em pausa, app antigo, sem perfil, perfil de um dia à frente) não há turma para mim: nada', () => {
    const friends = { [f1]: mprof(0, 31), [f2]: mprof(0, 31) };
    [mprof(0, 31, { sh: false }), mprof(undefined, 31), mprof(0, undefined), null, mprof(0, 31, { day: addDays(JAN3, 3) })].forEach((mine, i) => {
      const m = map(Object.assign({}, friends)); if (mine) m.set(me, mine);
      expect([i, won(m)]).toEqual([i, null]);
    });
    expect(won(map(Object.assign({ [me]: mprof(0, 31) }, friends)))).toEqual(OK); // com a minha conta, a vitória aparece
  });
  it('um amigo parado há até 3 dias ainda conta (do perfil dele, vale mm se é de dezembro e mp se é de janeiro); parado há 4, não: a turma volta a ser só eu', () => {
    const two = (b) => map({ [me]: mprof(0, 31), [f1]: b }), ids2 = [me, f1];
    expect(won(two(mprof(31, 0, { day: '2026-12-31' })), ids2)).toEqual(OK); // parado há 3 dias: perfil de dezembro, vale o mm (31)
    expect(won(two(mprof(16, 31, { day: '2026-12-31' })), ids2)).toBeNull(); // 16 de 17
    expect(won(two(mprof(31, 0, { day: '2026-12-30' })), ids2)).toBeNull(); // parado há 4 dias: fora da conta, sobra uma pessoa, e uma pessoa só não tem desafio
    expect(won(two(mprof(5, 31, { day: '2027-01-02' })), ids2)).toEqual(OK); // perfil de janeiro: vale o mp (31), não o mm (5)
    expect(won(two(mprof(31, 5, { day: '2027-01-02' })), ids2)).toBeNull(); // o mp é 5
  });
  it('quem não mostra a conta do mês (pausa, app antigo, sem perfil, dia à frente demais, parado há mais de 3 dias) fica fora da conta de quantas pessoas', () => {
    // eu com 4 dias e o primeiro amigo com 31: com 2 pessoas na conta a regra pede as duas com 17 dias (eu não chego); com 3 pessoas pede 2, e um terceiro com 31 fecha
    const base = (third) => { const m = map({ [me]: mprof(0, 4), [f1]: mprof(0, 31) }); if (third) m.set(f2, third); return m; };
    expect(won(base(null), [me, f1, f2])).toBeNull();
    expect(won(base(mprof(0, 31)))).toEqual(OK); // o terceiro mostra a conta e bateu: fecha
    expect(won(base(mprof(31, 0, { day: '2026-12-31' })))).toEqual(OK); // parado há 3 dias: ainda conta
    [mprof(0, 31, { sh: false }), mprof(undefined, 31), mprof(0, undefined), null, mprof(0, 31, { day: addDays(JAN3, 3) }), mprof(31, 0, { day: '2026-12-30' })].forEach((third, i) => {
      expect([i, won(base(third))]).toEqual([i, null]);
    });
  });
  it('o resultado nunca depende da ordem dos amigos nem de eles estarem repetidos; só a minha conta vem primeiro', () => {
    const m = map({ [me]: mprof(0, 20), [f1]: mprof(0, 17), [f2]: mprof(0, 3), [f3]: mprof(0, 25) });
    const base = won(m, [me, f1, f2, f3]);
    expect(base).toEqual(OK); // 20, 17 e 25 chegam a 17 (3 de 4)
    [[me, f3, f2, f1], [me, f2, f1, f3], [me, f1, f3, f2]].forEach((ids) => expect(won(m, ids)).toEqual(base));
  });
  // o app de quem olha: os meus dias batidos (hits = os dias 'AAAA-MM-DD') e o "mostrar o progresso" (shares), meta manual de 2.000 ml
  const appState = (hits, shares) => {
    const base = C.defaults(1), S = Object.assign({}, base, { onboarded: true, social: { on: true, nick: 'Eu', share: shares, code: '' }, days: {} });
    S.goal = Object.assign({}, base.goal, { mode: 'manual', manual: 2000 });
    hits.forEach((d) => { S.days[d] = { goal: 2000, entries: [{ id: 'a', t: 1, ml: 2000, d: 'water' }] }; });
    return S;
  };
  const MONTHS = ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01', '2027-07-01', '2027-08-01', '2027-09-01', '2027-10-01', '2027-11-01', '2027-12-01'];
  // uma pessoa sorteada: os dias batidos do mês anterior ao de today e deste (até today), cada dia com a chance dens
  const hitsOfPerson = (today, dens) => {
    const first = ymPrev(today) + '-01', out = [];
    for (let d = first; d <= today; d = addDays(d, 1)) if (rnd() < dens) out.push(d);
    return out;
  };
  it('é a mesma conta do app (crewMonthDue) em milhares de turmas sorteadas, nos 7 primeiros dias do mês e nos outros, antes e depois da estreia', () => {
    let wins = 0, quiet = 0; const titles = new Set(), names = new Set();
    for (let i = 0; i < 3000; i++) {
      const today = addDays(pick(MONTHS), rnd() < 0.8 ? Math.floor(rnd() * 7) : 7 + Math.floor(rnd() * 21)), n = 2 + Math.floor(rnd() * 7), dens = 0.25 + rnd() * 0.75;
      const ids = Array.from({ length: n }, (_, k) => uid(2000 + k + i * 10)), profiles = new Map(), friends = [];
      const shares = rnd() < 0.92, S = appState(hitsOfPerson(today, Math.min(1, dens + (rnd() - 0.5) * 0.4)), shares);
      profiles.set(ids[0], SO.profilePayload(S, today)); // o meu perfil é o que o app publica de verdade
      ids.slice(1).forEach((id) => {
        if (rnd() < 0.08) return; // sem perfil
        const k = rnd() < 0.8 ? today : addDays(today, pick([-1, -2, -3, -4, -5, -40, 1, 2, 3])), F = appState(hitsOfPerson(k > today ? today : k, Math.min(1, dens + (rnd() - 0.5) * 0.4)), true);
        const p = SO.profilePayload(F, k);
        if (rnd() < 0.1) { delete p.mm; delete p.mp; } // app antigo
        if (rnd() < 0.08) { p.sh = false; delete p.mm; delete p.mp; } // em pausa
        profiles.set(id, p); friends.push(Object.assign({ uid: id }, p));
      });
      const due = SO.crewMonthDue(S, friends, today).filter((x) => x.past), prev = ymPrev(today);
      const want = due.length ? { t: due[0].c.t, m: C.MONTH_NAMES[+prev.slice(5, 7) - 1] } : null;
      expect([today, n, CP.monthWonOf(profiles, ids[0], ids, today)]).toEqual([today, n, want]);
      if (want) { wins++; titles.add(want.t); names.add(want.m); } else quiet++;
    }
    expect(wins).toBeGreaterThan(150); // o sorteio exercita os dois lados: há vitórias e há meses sem vitória
    expect(quiet).toBeGreaterThan(150);
    expect(titles.size).toBe(4); // e as quatro regras do mês
    expect(names.size).toBeGreaterThan(6);
  });
  it('se o MEU perfil é de uns dias atrás (o app tem dias que o perfil ainda não tem), o servidor pode deixar de dar uma vitória, mas nunca dá uma que o app não dá', () => {
    let differ = 0, both = 0;
    for (let i = 0; i < 2000; i++) {
      const today = addDays(pick(MONTHS), Math.floor(rnd() * 7)), n = 2 + Math.floor(rnd() * 5), dens = 0.3 + rnd() * 0.7;
      const ids = Array.from({ length: n }, (_, k) => uid(9000 + k + i * 10)), profiles = new Map(), friends = [];
      const S = appState(hitsOfPerson(today, dens), true), k = addDays(today, -Math.floor(rnd() * 12));
      profiles.set(ids[0], SO.profilePayload(S, k)); // publicado há 0 a 11 dias, com os dias que vieram depois já no aparelho
      ids.slice(1).forEach((id) => { const p = SO.profilePayload(appState(hitsOfPerson(today, Math.min(1, dens + (rnd() - 0.5) * 0.4)), true), today); profiles.set(id, p); friends.push(Object.assign({ uid: id }, p)); });
      const due = SO.crewMonthDue(S, friends, today).filter((x) => x.past), srv = CP.monthWonOf(profiles, ids[0], ids, today);
      if (srv) { expect([today, due.length]).toEqual([today, 1]); expect(srv.t).toBe(due[0].c.t); both++; } else if (due.length) differ++;
    }
    expect(both).toBeGreaterThan(100);
    expect(differ).toBeGreaterThan(20); // e o sorteio mostra que isso acontece: há meses em que o app dá a vitória e o servidor, que só vê o perfil, ainda não
  });
  it('perfis e dias estranhos (texto, número, lista, objeto vazio, contas fora do limite) nunca quebram a conta, e o resultado é null ou o título e o nome do mês', () => {
    const junk = [null, undefined, 'x', 5, [], {}, { mm: 'a', day: 3 }, { mm: 7, day: JAN3, sh: 'yes' }, { mm: 7, mp: 30, day: JAN3 }, { mm: {}, mp: [], day: JAN3 }, mprof(31, 31), mprof(1e9, -4), mprof(31.7, 31.2), mprof(NaN, 3), mprof(0, 17, { day: 20270103 })];
    const titles = C.CREW_MONTHLY.map((c) => c.t);
    for (let i = 0; i < 800; i++) {
      const ids = [me, f1, f2, f3, f1], profiles = new Map(ids.map((id) => [id, pick(junk)])), r = CP.monthWonOf(profiles, me, ids, JAN3);
      if (r !== null) { expect(titles).toContain(r.t); expect(r.m).toBe('dezembro'); }
    }
    [undefined, null, 5, '', 'x', '2027-1-3', '2027-01-3', {}, []].forEach((today) => expect(CP.monthWonOf(trio(31, 31, 31), me, [me, f1, f2], today)).toBeNull());
    expect(CP.monthWonOf(new Map(), me, [me], JAN3)).toBeNull(); // sozinho, sem perfil
    expect(CP.monthWonOf(trio(31, 31, 31), me, [], JAN3)).toBeNull(); // sem a lista de pessoas, só eu
  });
  it('datas que não são datas (fora do formato, com lixo no fim ou no começo, ou um objeto que vira texto de data) nunca viram uma conta (0 dias) nem quebram nada: null', () => {
    const parece = { toString: () => '2026-12-31' }; // um objeto que "parece" uma data quando vira texto (o Firestore não manda isso, a conta não pode confiar em quem manda)
    ['1999-xx-xx', '2026-12', '20261231', '2026/12/31', ' 2026-12-31', '2026-12-31\n', '', parece, ['2026-12-31'], 20261231, true].forEach((day) => {
      expect([String(day), CP.monthOf(mprof(5, 17, { day: day }), DEC, JAN3)]).toEqual([String(day), null]);
    });
    // o "hoje" do servidor também: só AAAA-MM-DD de verdade abre a conta (a sabotagem que tirava essa conferência dava a vitória a '2027-01-0' e a '2027-01-03\n')
    ['2027-01-0', '2027-01-', '2027-01', '2027-01-03\n', ' 2027-01-03', '2027-01-03 ', { toString: () => JAN3 }, [JAN3]].forEach((today) => {
      expect([String(today), CP.monthWonOf(trio(31, 31, 31), me, [me, f1, f2], today)]).toEqual([String(today), null]);
    });
    expect(CP.monthWonOf(trio(31, 31, 31), me, [me, f1, f2], JAN3)).toEqual(OK); // e com a data certa a mesma turma vence
  });
  it('monthOf: o mês pedido tem o tamanho dele (28 dias em fevereiro, 29 no bissexto, 30 em novembro), mesmo com 31 dias contados no perfil, tanto no mês do próprio perfil (mm) quanto no seguinte (mp)', () => {
    expect(CP.monthOf(mprof(31, 0, { day: '2027-02-28' }), '2027-02', '2027-02-28')).toBe(28);
    expect(CP.monthOf(mprof(31, 0, { day: '2028-02-29' }), '2028-02', '2028-02-29')).toBe(29);
    expect(CP.monthOf(mprof(31, 0, { day: '2026-11-30' }), '2026-11', '2026-11-30')).toBe(30);
    expect(CP.monthOf(mprof(31, 0, { day: '2026-12-31' }), '2026-12', '2026-12-31')).toBe(31);
    expect(CP.monthOf(mprof(0, 31, { day: '2026-12-01' }), '2026-11', '2026-12-01')).toBe(30); // no mês seguinte quem fala é o mp
    expect(CP.monthOf(mprof(0, 31, { day: '2027-03-01' }), '2027-02', '2027-03-01')).toBe(28);
    expect(CP.monthOf(mprof(0, 31, { day: '2028-03-01' }), '2028-02', '2028-03-01')).toBe(29);
  });
});

describe('zonesAt: os fusos em que agora é domingo, 19h', () => {
  it('Brasil no domingo às 22:xx de Greenwich; todos os outros ficam de fora', () => {
    const z = CP.zonesAt(at(2026, 10, 18, 22, 5));
    ['America/Sao_Paulo', 'America/Fortaleza', 'America/Bahia', 'America/Recife', 'America/Argentina/Buenos_Aires', 'America/Buenos_Aires'].forEach((tz) => expect(z).toContain(tz));
    ['UTC', 'America/New_York', 'Europe/Lisbon', 'Asia/Tokyo', 'Asia/Kolkata', 'Pacific/Auckland'].forEach((tz) => expect(z).not.toContain(tz));
  });
  it('os apelidos antigos que alguns aparelhos informam também entram (Índia: 13:30 de Greenwich = 19:00 lá)', () => {
    const z = CP.zonesAt(at(2026, 10, 18, 13, 40));
    expect(z).toContain('Asia/Kolkata');
    expect(z).toContain('Asia/Calcutta');
    expect(CP.zonesAt(at(2026, 10, 18, 19, 0))).toEqual(expect.arrayContaining(['UTC', 'Etc/UTC', 'Etc/GMT']));
  });
  it('todo fuso devolvido está mesmo no domingo das 19h, e sem repetição', () => {
    for (let h = 0; h < 7 * 24; h += 5) {
      const now = at(2026, 10, 18) + h * HOUR + 17 * 60e3, z = CP.zonesAt(now);
      expect(new Set(z).size).toBe(z.length);
      z.forEach((tz) => expect(isWeeklyHour(now, tz)).toBe(true));
    }
  });
  it('nenhuma hora da semana junta fusos demais (a consulta do Firestore aceita 30 por vez e a função divide em partes)', () => {
    for (let h = 0; h < 7 * 24; h++) { const n = CP.zonesAt(at(2026, 10, 12) + h * HOUR).length; expect(n).toBeLessThan(120); }
  });
  it('numa semana comum, cada fuso cai numa hora cheia, uma só: ninguém fica sem o resumo, ninguém recebe duas vezes (o job roda de hora em hora)', () => {
    const zones = ['America/Sao_Paulo', 'America/Fortaleza', 'America/Manaus', 'America/New_York', 'Europe/Lisbon', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Pacific/Auckland',
      'Australia/Lord_Howe', 'America/St_Johns', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC', 'Africa/Casablanca', 'America/Santiago', 'Asia/Tehran', 'Australia/Adelaide'];
    const count = Object.fromEntries(zones.map((z) => [z, 0]));
    for (let h = 0; h < 7 * 24; h++) { const z = CP.zonesAt(at(2026, 10, 12) + h * HOUR); zones.forEach((tz) => { if (z.indexOf(tz) >= 0) count[tz]++; }); }
    zones.forEach((tz) => expect([tz, count[tz]]).toEqual([tz, 1]));
  });
  it('zonesAt devolve exatamente os fusos em que isWeeklyHour vale (nem a mais, nem a menos), em horas sorteadas do ano', () => {
    const zones = ['America/Sao_Paulo', 'America/New_York', 'Europe/Lisbon', 'Asia/Tokyo', 'Asia/Kolkata', 'Pacific/Auckland', 'Australia/Lord_Howe', 'America/St_Johns', 'UTC', 'Asia/Calcutta', 'Asia/Kathmandu'];
    for (let i = 0; i < 80; i++) {
      const now = at(2026, 1, 1) + Math.floor(rnd() * 365 * 24) * HOUR + Math.floor(rnd() * 60) * 60e3, z = CP.zonesAt(now);
      zones.forEach((tz) => expect([tz, now, z.indexOf(tz) >= 0]).toEqual([tz, now, isWeeklyHour(now, tz)]));
    }
  });
  it('em todos os domingos do ano, mesmo nas semanas em que o horário de verão vira, cada um cai numa hora cheia, uma só (e nenhuma em outro dia)', () => {
    ['America/New_York', 'Europe/Lisbon', 'Pacific/Auckland', 'Australia/Sydney', 'Australia/Lord_Howe', 'America/St_Johns', 'Pacific/Chatham', 'America/Santiago', 'Africa/Casablanca'].forEach((tz) => {
      const days = {};
      for (let t = at(2026, 1, 1); t < at(2027, 1, 8); t += HOUR) if (isWeeklyHour(t, tz)) { const L = local(t, tz); expect(L.dow).toBe(0); days[L.day] = (days[L.day] || 0) + 1; }
      const keys = Object.keys(days);
      expect([tz, keys.length]).toEqual([tz, 53]); // os 53 domingos de 4/1/2026 a 3/1/2027
      keys.forEach((k) => expect([tz, k, days[k]]).toEqual([tz, k, 1]));
    });
  });
  it('ZONES_EXTRA não repete nomes', () => { expect(new Set(CP.ZONES_EXTRA).size).toBe(CP.ZONES_EXTRA.length); });
  it('ZONES_EXTRA só tem nomes que o Intl aceita (um nome inválido nunca vai para a consulta do Firestore)', () => {
    CP.ZONES_EXTRA.forEach((tz) => { expect(() => new Intl.DateTimeFormat('en', { timeZone: tz }), tz).not.toThrow(); });
  });
  it('os nomes primários da IANA que a lista do Node não tem (Asia/Kolkata, America/Indiana/Indianapolis, Pacific/Chuuk…) e o "GMT" entram na hora certa', () => {
    const names = ['Asia/Kolkata', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville', 'Pacific/Chuuk', 'Pacific/Pohnpei', 'America/Argentina/Cordoba',
      'America/Argentina/Mendoza', 'America/Argentina/Jujuy', 'America/Argentina/Catamarca', 'America/Atikokan', 'Africa/Asmara', 'GMT', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh'];
    names.forEach((tz) => {
      let found = null;
      for (let t = at(2026, 10, 24, 0, 0); t < at(2026, 10, 26, 6, 0) && found == null; t += 15 * 60e3) if (isWeeklyHour(t, tz)) found = t;
      expect([tz, found != null]).toEqual([tz, true]);
      expect([tz, CP.zonesAt(found).indexOf(tz) >= 0]).toEqual([tz, true]);
    });
  });
});
