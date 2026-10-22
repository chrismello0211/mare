// Maré — testes da turma única e dos avisos da turma (functions/network.js e functions/crew-push.js, só a parte pura). Rodar: npm test
// planClosure/autoDoc: quem vira amigo de quem quando duas turmas se juntam. hitOf, weekOf, weekOfCrew, zonesAt: "um amigo bateu a meta" e o
// resumo de domingo, com a conta da semana IGUAL à do app (public/js/social.js). O Firestore e o FCM ficam em tests/rules/*.test.js (emulador).
import { describe, it, expect } from 'vitest';
import * as N from '../functions/network.js';
import * as CP from '../functions/crew-push.js';
import { pairId, pairOf, UID_RE } from '../functions/social-push.js';
import { isWeeklyHour, local } from '../functions/clock.js';
import * as SO from '../public/js/social.js';

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
