// Maré — testes da lógica pura dos avisos de amigos (functions/social-push.js). Rodar: npm test
// O que o servidor decide sem tocar no Firebase: que mudanças numa amizade viram aviso (e para quem), o texto, quem recebe e o limite
// contra repetição e spam. A parte que fala com o Firestore e com o FCM é testada em tests/rules/friend-push.test.js e tests/rules/network.test.js
// (npm run test:rules). O relógio e o horário de silêncio estão em tests/clock.test.js, a fila do silêncio em tests/quiet.test.js e a conta da
// turma (meta batida, semana) em tests/crew.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as P from '../functions/social-push.js';
import * as SO from '../public/js/social.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), BRU = U('bruno'), CAI = U('caio'); // ANA < BRU < CAI (a ordem do id da amizade)
const ts = (ms) => ({ toMillis: () => ms }); // parece um Timestamp do Firestore
const T0 = Date.UTC(2026, 9, 19, 11, 0, 0);
const pair = (o) => Object.assign({ m: [ANA, BRU], by: ANA, st: 'pending', nm: 'Ana', mc: 'cavalo', tn: 'Bruno', tc: 'polvo', cd: 'BBBB2222', at: ts(T0) }, o);
const active = (o) => pair(Object.assign({ st: 'active', ok: ts(T0 + 1000) }, o));
const wave = (k, at) => ({ k: k, d: '2026-10-19', at: ts(at) });

describe('nomes: a mesma limpeza do app', () => {
  // O servidor não importa nada de public/ (a pasta functions/ sobe sozinha para a nuvem), então a limpeza do nome existe em dois lugares.
  // Aqui as duas cópias são comparadas como texto, sem comentários: se alguém mexer em uma e esquecer da outra, o teste reprova.
  const clean = (src) => {
    const lines = src.split('\n'), from = lines.findIndex((l) => l.startsWith('const INVISIBLE =')), at = lines.findIndex((l) => l.startsWith('function tidy('));
    const to = lines.findIndex((l, i) => i > at && l === '}');
    expect(from).toBeGreaterThan(-1); expect(at).toBeGreaterThan(from); expect(to).toBeGreaterThan(at);
    return lines.slice(from, to + 1).filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s+\/\/ .*$/, '').trim()).join('\n');
  };
  it('o código que limpa o nome é igual ao de public/js/social.js', () => {
    const app = clean(read('../public/js/social.js')), srv = clean(read('../functions/social-push.js'));
    expect(srv).toBe(app);
    expect(srv).toContain('function capMarks(');
    expect(srv).toContain('const INVISIBLE = /[\\u00AD');
  });
  it('as constantes compartilhadas são iguais às do app', () => {
    expect(P.NICK_MAX).toBe(SO.NICK_MAX);
    expect(P.UID_RE.source).toBe(SO.UID_RE.source);
    expect(P.WAVE_KINDS).toEqual(SO.WAVE_KINDS);
    [0, 1, 1.5, -3, NaN, null, undefined, 'x', {}, { toMillis: () => 7 }, { toMillis: 3 }, { toMillis: () => NaN }].forEach((v) => expect(P.tsMs(v)).toBe(SO.tsMs(v)));
  });
  it('nenhum caractere invisível solto nos arquivos do servidor (só escapes \\uXXXX): o que o editor ou o zip mexerem não muda o código', () => {
    const files = readdirSync(new URL('../functions/', import.meta.url)).filter((f) => f.endsWith('.js'));
    expect(files.sort()).toEqual(expect.arrayContaining(['clock.js', 'crew-push.js', 'friend-push.js', 'index.js', 'network.js', 'quiet.js', 'social-push.js']));
    files.forEach((f) => {
      // eslint-disable-next-line no-control-regex
      expect([f, /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00A0\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u2000-\u200F\u202A-\u202F\u205F-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]/.test(read('../functions/' + f))]).toEqual([f, false]);
    });
  });
  const NOMES = ['Chris', 'Marianne', '  Ana   Paula  ', 'João', 'Zé 🐢', 'Fê', 'A'.repeat(40), 'Nome\u200Bcom\u200Dinvisível', '\u202Eabc\u202C',
    'texto\u0300\u0301\u0302\u0303\u0304\u0305 zalgo', '<b>negrito</b>', 'linha\nquebrada\ttab', '\u0000nulo\u0007', '', '   ', '\u200B\u200B', '\u0301\u0302',
    '👩\u200D👩\u200D👧\u200D👦 família', '🏳\uFE0F\u200D🌈', 'عربي', 'ไทย', '日本語の名前', 'a\u00ADb', 'x\uFE0Fy', '\u2800\u3164', 'ABCDEFGHIJKLMNOPQRST', 'ABCDEFGHIJKLMNOPQRSTU',
    '😀'.repeat(25), 'é'.normalize('NFD').repeat(30), '\uD83C', 'a\uDBFF\uDFFFb'];
  NOMES.forEach((n) => {
    it('igual ao cleanNick do app: ' + JSON.stringify(n).slice(0, 40), () => {
      expect(P.cleanName(n)).toBe(SO.cleanNick(n));
    });
  });
  it('só texto vale como nome (o que não é texto vira vazio)', () => {
    [null, undefined, 42, {}, [], true, () => 'x'].forEach((v) => expect(P.cleanName(v)).toBe(''));
  });
  it('o limite é o do app (20 caracteres, sem cortar emoji no meio)', () => {
    expect(P.NICK_MAX).toBe(SO.NICK_MAX);
    expect(Array.from(P.cleanName('😀'.repeat(25)))).toHaveLength(20);
  });
});

describe('eventsOf: que mudanças viram aviso', () => {
  it('pedido novo avisa quem RECEBEU o pedido (quem pediu é o primeiro do par)', () => {
    expect(P.eventsOf(null, pair())).toEqual([{ kind: 'request', from: ANA, to: BRU }]);
  });
  it('pedido novo feito pelo segundo do par: o aviso vai para o primeiro', () => {
    expect(P.eventsOf(null, pair({ by: BRU }))).toEqual([{ kind: 'request', from: BRU, to: ANA }]);
  });
  it('"antes" que não é uma amizade de verdade conta como documento novo', () => {
    expect(P.eventsOf(undefined, pair())).toHaveLength(1);
    expect(P.eventsOf({}, pair())).toHaveLength(1);
    expect(P.eventsOf('lixo', pair())).toHaveLength(1);
  });
  it('apagar (recusar, cancelar, desfazer amizade) nunca avisa', () => {
    expect(P.eventsOf(pair(), null)).toEqual([]);
    expect(P.eventsOf(active(), null)).toEqual([]);
    expect(P.eventsOf(active(), undefined)).toEqual([]);
  });
  it('documento criado já ativo, ou com "by" de fora do par, não avisa', () => {
    expect(P.eventsOf(null, active())).toEqual([]);
    expect(P.eventsOf(null, pair({ by: CAI }))).toEqual([]);
    expect(P.eventsOf(null, pair({ by: undefined }))).toEqual([]);
  });
  it('aceite avisa quem PEDIU, em nome de quem aceitou', () => {
    expect(P.eventsOf(pair(), active())).toEqual([{ kind: 'accepted', from: BRU, to: ANA }]);
    expect(P.eventsOf(pair({ by: BRU }), active({ by: BRU }))).toEqual([{ kind: 'accepted', from: ANA, to: BRU }]);
  });
  it('aceite de um pedido cujo "by" é de fora do par não avisa ninguém (muito menos quem nem é da amizade)', () => {
    expect(P.eventsOf(pair({ by: CAI }), active({ by: CAI }))).toEqual([]);
    expect(P.eventsOf(pair({ by: undefined }), active({ by: undefined }))).toEqual([]);
    expect(P.eventsOf(pair({ by: CAI }), active())).toEqual([]);
  });
  it('um pedido que continua pendente (qualquer outra mudança) não avisa de novo', () => {
    expect(P.eventsOf(pair(), pair({ nm: 'Ana Maria' }))).toEqual([]);
    expect(P.eventsOf(pair(), pair())).toEqual([]);
  });
  it('uma amizade ativa que muda sem aceno novo não avisa', () => {
    expect(P.eventsOf(active(), active({ nm: 'Outro' }))).toEqual([]);
    expect(P.eventsOf(active(), active())).toEqual([]);
  });
  it('aceno novo avisa o OUTRO lado, com o tipo do aceno', () => {
    const w = { [ANA]: wave('hi', T0 + 5000) };
    expect(P.eventsOf(active(), active({ w: w }))).toEqual([{ kind: 'wave', from: ANA, to: BRU, wave: 'hi', again: false }]);
    const c = { [BRU]: wave('cheer', T0 + 5000) };
    expect(P.eventsOf(active(), active({ w: c }))).toEqual([{ kind: 'wave', from: BRU, to: ANA, wave: 'cheer', again: false }]);
  });
  it('só o aceno que mudou avisa (o outro, que já estava lá, não)', () => {
    const antes = { [ANA]: wave('hi', T0 + 5000) };
    const depois = { [ANA]: wave('hi', T0 + 5000), [BRU]: wave('hi', T0 + 9000) };
    expect(P.eventsOf(active({ w: antes }), active({ w: depois }))).toEqual([{ kind: 'wave', from: BRU, to: ANA, wave: 'hi', again: true }]);
  });
  it('um segundo aceno do mesmo lado (carimbo mais novo) avisa; o mesmo carimbo ou um mais velho não', () => {
    const w = (at) => ({ [ANA]: wave('hi', at) });
    expect(P.eventsOf(active({ w: w(T0 + 5000) }), active({ w: w(T0 + 700000) }))).toHaveLength(1);
    expect(P.eventsOf(active({ w: w(T0 + 5000) }), active({ w: w(T0 + 5000) }))).toEqual([]);
    expect(P.eventsOf(active({ w: w(T0 + 5000) }), active({ w: w(T0 + 4000) }))).toEqual([]);
  });
  it('aceno de "parabéns" e de "oi" são tipos diferentes; outro tipo, aceno sem carimbo e aceno de quem é de fora são ignorados', () => {
    const v = (w) => P.eventsOf(active(), active({ w: w }));
    expect(v({ [ANA]: wave('cheer', T0 + 1) })[0].wave).toBe('cheer');
    expect(v({ [ANA]: { k: 'sos', d: '2026-10-19', at: ts(T0 + 1) } })).toEqual([]);
    expect(v({ [ANA]: { k: 'hi', d: '2026-10-19' } })).toEqual([]);
    expect(v({ [ANA]: { k: 'hi', d: '2026-10-19', at: 'ontem' } })).toEqual([]);
    expect(v({ [CAI]: wave('hi', T0 + 1) })).toEqual([]);
    expect(v({ [ANA]: 'oi' })).toEqual([]);
    expect(v(null)).toEqual([]);
    expect(v('x')).toEqual([]);
  });
  it('carimbo em número também vale (testes e documentos antigos)', () => {
    expect(P.eventsOf(active(), active({ w: { [ANA]: { k: 'hi', d: 'x', at: T0 + 1 } } }))).toHaveLength(1);
  });
  it('"antes" com estado desconhecido vale como documento que não existia: nenhum aceno "novo" contra um documento estranho', () => {
    const estranho = pair({ st: 'banida', w: { [ANA]: wave('hi', T0 + 1000) } });
    expect(P.eventsOf(estranho, active({ w: { [ANA]: wave('hi', T0 + 5000) } }))).toEqual([]);
    expect(P.eventsOf(estranho, active())).toEqual([]);
  });
  it('em "pendente" não há acenos (só amigos acenam), mesmo que o documento traga um', () => {
    expect(P.eventsOf(pair(), pair({ w: { [ANA]: wave('hi', T0 + 1) } }))).toEqual([]);
  });
  it('"acenar de volta": se quem recebe também acenou há pouco, o aviso não sugere isso', () => {
    const ambos = { [ANA]: wave('hi', T0 + 1000), [BRU]: wave('hi', T0 + 4000) };
    expect(P.eventsOf(active({ w: { [ANA]: ambos[ANA] } }), active({ w: ambos }))[0].again).toBe(true);
    const antigo = { [ANA]: wave('hi', T0 + 13 * 3600e3), [BRU]: wave('hi', T0) };
    expect(P.eventsOf(active({ w: { [BRU]: antigo[BRU] } }), active({ w: antigo }))[0]).toMatchObject({ from: ANA, again: false });
    const dentro = { [ANA]: wave('hi', T0 + 11 * 3600e3), [BRU]: wave('hi', T0) };
    expect(P.eventsOf(active({ w: { [BRU]: dentro[BRU] } }), active({ w: dentro }))[0]).toMatchObject({ from: ANA, again: true });
  });
  it('"acenar de volta": com exatamente 12 h de diferença já não é "há pouco" (1 ms a menos ainda é)', () => {
    const justo = { [ANA]: wave('hi', T0 + P.BACK_MS), [BRU]: wave('hi', T0) };
    expect(P.eventsOf(active({ w: { [BRU]: justo[BRU] } }), active({ w: justo }))[0]).toMatchObject({ from: ANA, again: false });
    const quase = { [ANA]: wave('hi', T0 + P.BACK_MS - 1), [BRU]: wave('hi', T0) };
    expect(P.eventsOf(active({ w: { [BRU]: quase[BRU] } }), active({ w: quase }))[0]).toMatchObject({ from: ANA, again: true });
  });
  it('documentos que não são amizade nunca quebram nem avisam', () => {
    const lixo = [null, undefined, 0, 'x', [], {}, { m: [] }, { m: [ANA] }, { m: [ANA, ANA], st: 'pending', by: ANA }, { m: [ANA, 'curto'], st: 'pending', by: ANA },
      { m: [ANA, BRU, CAI], st: 'pending', by: ANA }, { m: [ANA, BRU], st: 'banida', by: ANA }, { m: ['a/b', BRU], st: 'pending', by: 'a/b' },
      { m: [ANA, BRU], st: 'pending', by: ANA, w: { [ANA]: { k: 'hi', at: ts(1) } }, nm: Symbol.iterator.toString() }];
    lixo.slice(0, 13).forEach((x) => { expect(P.eventsOf(null, x)).toEqual([]); expect(P.eventsOf(pair(), x)).toEqual([]); });
    expect(() => P.eventsOf(lixo[13], lixo[13])).not.toThrow();
  });
  it('o resultado não depende de a ordem de "m" ser a do id (quem pediu é "by")', () => {
    expect(P.eventsOf(null, pair({ m: [BRU, ANA], by: ANA }))).toEqual([{ kind: 'request', from: ANA, to: BRU }]);
  });
  it('nunca avisa a quem fez a ação', () => {
    const casos = [P.eventsOf(null, pair()), P.eventsOf(pair(), active()), P.eventsOf(active(), active({ w: { [ANA]: wave('hi', T0 + 1), [BRU]: wave('cheer', T0 + 2) } }))];
    casos.flat().forEach((e) => expect(e.from).not.toBe(e.to));
  });
});

describe('messageOf: o texto do aviso', () => {
  const rq = { kind: 'request', from: ANA, to: BRU };
  const ac = { kind: 'accepted', from: BRU, to: ANA };
  const hi = (again) => ({ kind: 'wave', from: ANA, to: BRU, wave: 'hi', again: !!again });
  const ch = (again) => ({ kind: 'wave', from: ANA, to: BRU, wave: 'cheer', again: !!again });
  it('pedido de amizade', () => {
    const m = P.messageOf(rq, 'Marianne');
    expect(m.title).toBe('Pedido de amizade\u00A0💌');
    expect(m.body).toBe('Marianne quer acompanhar o dia com você. Toque para responder.');
  });
  it('pedido aceito', () => {
    const m = P.messageOf(ac, 'Rafa');
    expect(m.title).toBe('Rafa aceitou seu pedido\u00A0🤗');
    expect(m.body).toBe('Agora vocês se acompanham. Que tal um aceno?');
  });
  it('oi e parabéns, com e sem "acenar de volta"', () => {
    expect(P.messageOf(hi(), 'Chris')).toMatchObject({ title: 'Chris acenou para você\u00A0👋', body: 'Toque para acenar de volta.' });
    expect(P.messageOf(hi(true), 'Chris')).toMatchObject({ title: 'Chris acenou para você\u00A0👋', body: 'Toque para ver seus amigos.' });
    expect(P.messageOf(ch(), 'Chris')).toMatchObject({ title: 'Chris mandou parabéns pra você\u00A0🎉', body: 'Continue assim! Toque para ver seus amigos.' });
    expect(P.messageOf(ch(true), 'Chris')).toMatchObject({ title: 'Chris mandou parabéns pra você\u00A0🎉', body: 'Toque para ver seus amigos.' });
  });
  it('usa as mesmas palavras do app (acenou para você, mandou parabéns pra você)', () => {
    expect(P.messageOf(hi(), 'X').title).toContain(SO.WAVE_TEXT.hi.replace(/\u00A0.*$/, ''));
    expect(P.messageOf(ch(), 'X').title).toContain(SO.WAVE_TEXT.cheer.replace(/\u00A0.*$/, ''));
  });
  it('o emoji nunca fica sozinho na linha (espaço que não quebra)', () => {
    [rq, ac, hi(), ch()].forEach((e) => expect(P.messageOf(e, 'Ana').title).toMatch(/\u00A0\S+$/u));
  });
  it('o nome passa pela limpeza do app: invisíveis, < >, tamanho', () => {
    expect(P.messageOf(rq, '  <b>Ana</b>\u200B  ').body).toContain('bAna/b quer');
    expect(P.messageOf(rq, 'A'.repeat(50)).body.startsWith('A'.repeat(20) + ' quer')).toBe(true);
    expect(P.messageOf(hi(), 'Zé\u202E\u0000').title).toBe('Zé acenou para você\u00A0👋');
  });
  it('sem nome que se leia, o aviso fala "Alguém" (nunca "undefined" nem vazio)', () => {
    ['', '   ', '\u200B', null, undefined, 7, {}, '\u0301'].forEach((n) => {
      const m = P.messageOf(hi(), n);
      expect(m.title).toBe('Alguém acenou para você\u00A0👋');
      expect(JSON.stringify(m)).not.toMatch(/undefined|null|NaN|\[object/);
    });
  });
  it('o texto de quem pede nunca vira instrução: nome com quebra de linha e aspas continua um nome só', () => {
    const m = P.messageOf(rq, 'Ana\nCuidado: "clique aqui"');
    expect(m.body).not.toContain('\n');
    expect(m.body.startsWith('Ana Cuidado: "clique aqui"'.slice(0, 20))).toBe(true);
  });
  it('tag: o mesmo tipo da mesma pessoa se substitui; tipos e pessoas diferentes empilham', () => {
    const tags = [P.messageOf(rq, 'A').tag, P.messageOf(ac, 'A').tag, P.messageOf(hi(), 'A').tag, P.messageOf({ kind: 'wave', from: CAI, to: BRU, wave: 'hi' }, 'A').tag];
    expect(new Set(tags).size).toBe(4);
    expect(P.messageOf(hi(), 'A').tag).toBe(P.messageOf(ch(), 'B').tag); // oi e parabéns da mesma pessoa: um substitui o outro
    expect(tags[2]).toBe('mare-amigo-wave-' + ANA);
  });
  it('o toque leva para a aba Amigos', () => {
    expect(P.messageOf(rq, 'A').url).toBe('./?tab=friends');
    expect(P.URL_FRIENDS).toBe('./?tab=friends');
  });
  it('todo valor do push é texto (o FCM só aceita texto em "data") e cabe no limite com folga', () => {
    [rq, ac, hi(), ch()].forEach((e) => Object.values(P.messageOf(e, 'N'.repeat(99))).forEach((v) => { expect(typeof v).toBe('string'); expect(v.length).toBeLessThan(200); }));
  });
  it('a duração do push: pedidos e aceites esperam 2 dias; acenos, 6 horas; entradas na turma, 1 dia; meta batida, 3 horas; resumos, 12 e 6 horas', () => {
    expect(P.TTL).toEqual({ request: 172800, accepted: 172800, wave: 21600, joined: 86400, hit: 10800, week: 43200, digest: 21600 });
    P.KINDS.forEach((k) => { expect(P.TTL[k]).toBeGreaterThan(0); expect(P.TTL[k]).toBeLessThanOrEqual(2419200); }); // o FCM aceita até 28 dias
  });
  it('payloadOf: o pacote que vai ao FCM (só "data", tudo texto, kind "friend" para o sw.js)', () => {
    [rq, ac, hi(), ch(true)].forEach((e) => {
      const m = P.messageOf(e, 'Ana'), d = P.payloadOf(e, m);
      expect(Object.keys(d).sort()).toEqual(['body', 'ev', 'kind', 'tag', 'title', 'url']);
      expect(d).toEqual({ kind: 'friend', ev: e.kind, tag: m.tag, url: m.url, title: m.title, body: m.body });
      Object.values(d).forEach((v) => expect(typeof v).toBe('string'));
    });
    expect(P.payloadOf(hi(), P.messageOf(hi(), 'Ana')).ev).toBe('wave'); // "ev" é o tipo do evento, não o do aceno
  });
});

describe('quem recebe', () => {
  it('tokensOf lista só aparelhos com token de verdade, no máximo 10', () => {
    const f = { t1: { token: 'aaa', ua: 'x' }, t2: { token: '' }, t3: {}, t4: null, t5: { token: 7 }, t6: { token: 'bbb' }, t7: 'x' };
    expect(P.tokensOf({ fcm: f })).toEqual([{ h: 't1', token: 'aaa' }, { h: 't6', token: 'bbb' }]);
    const muitos = {}; for (let i = 0; i < 15; i++) muitos['t' + i] = { token: 'k' + i };
    expect(P.tokensOf({ fcm: muitos })).toHaveLength(10);
  });
  it('tokensOf nunca quebra com dados estranhos', () => {
    [null, undefined, 0, 'x', [], {}, { fcm: null }, { fcm: 'x' }, { fcm: [] }, { fcm: 5 }].forEach((u) => expect(P.tokensOf(u)).toEqual([]));
  });
  it('wantsAlerts: só um false explícito desliga (sem o campo, vale ligado)', () => {
    expect(P.wantsAlerts({})).toBe(true);
    expect(P.wantsAlerts(null)).toBe(true);
    expect(P.wantsAlerts({ social: {} })).toBe(true);
    expect(P.wantsAlerts({ social: { push: true } })).toBe(true);
    expect(P.wantsAlerts({ social: { push: 'false' } })).toBe(true);
    expect(P.wantsAlerts({ social: { push: 0 } })).toBe(true);
    expect(P.wantsAlerts({ social: null })).toBe(true);
    expect(P.wantsAlerts({ social: { push: false } })).toBe(false);
  });
});

describe('admit: limite contra repetição e spam', () => {
  const rq = (from) => ({ kind: 'request', from: from || ANA, to: BRU });
  const ac = (from) => ({ kind: 'accepted', from: from || ANA, to: BRU });
  const wv = (from) => ({ kind: 'wave', from: from || ANA, to: BRU, wave: 'hi' });
  const MIN = 60e3, HOUR = 3600e3;
  // aplica uma sequência de [momento, evento] e devolve o que passou (true/false), guardando o registro entre uma e outra
  const run = (seq, log) => { const out = []; seq.forEach(([at, ev]) => { const r = P.admit(log, ev, at); out.push(r.ok); if (r.ok) log = r.log; }); return { out, log }; };

  it('o primeiro aviso passa e grava o registro', () => {
    const r = P.admit(null, rq(), T0);
    expect(r.ok).toBe(true);
    expect(r.log).toEqual({ t: { ['request_' + ANA]: T0 }, h: [T0], q: [T0] });
  });
  it('o mesmo aviso repetido logo em seguida (entrega em dobro) não passa; passa depois da janela', () => {
    expect(run([[T0, wv()], [T0 + 1000, wv()], [T0 + 4 * MIN, wv()], [T0 + 5 * MIN, wv()]]).out).toEqual([true, false, false, true]);
    expect(run([[T0, ac()], [T0 + 59e3, ac()], [T0 + 60e3, ac()]]).out).toEqual([true, false, true]);
  });
  it('pedido repetido da mesma pessoa só avisa de novo depois de 24 horas', () => {
    expect(run([[T0, rq()], [T0 + 23 * HOUR, rq()], [T0 + 24 * HOUR + 1, rq()]]).out).toEqual([true, false, true]);
  });
  it('tipos e pessoas diferentes não se atrapalham', () => {
    expect(run([[T0, rq(ANA)], [T0, rq(CAI)], [T0, wv(ANA)], [T0, ac(ANA)], [T0, wv(CAI)]]).out).toEqual([true, true, true, true, true]);
  });
  it('rejeitar não altera nada: o registro de quem foi barrado não é devolvido', () => {
    const a = P.admit(null, wv(), T0), b = P.admit(a.log, wv(), T0 + 1);
    expect(b.ok).toBe(false);
    expect(b.why).toBe('repetido');
    expect(b.log).toBeUndefined();
  });
  it('teto de 20 avisos por hora (mesmo de pessoas diferentes); a hora seguinte começa limpa', () => {
    const seq = []; for (let i = 0; i < 25; i++) seq.push([T0 + i * 1000, wv(U('amigo' + i))]);
    const r = run(seq);
    expect(r.out.filter(Boolean)).toHaveLength(20);
    expect(r.out.slice(0, 20).every(Boolean)).toBe(true);
    expect(P.admit(r.log, wv(U('novo')), T0 + 30 * 1000).why).toBe('limite');
    expect(P.admit(r.log, wv(U('novo')), T0 + HOUR + 21 * 1000).ok).toBe(true); // passou uma hora do 20º... e do 1º
  });
  it('teto de 5 PEDIDOS por hora: quem juntar muita gente para pedir amizade não enche o celular dos outros', () => {
    const seq = []; for (let i = 0; i < 9; i++) seq.push([T0 + i * 1000, rq(U('pessoa' + i))]);
    const r = run(seq);
    expect(r.out).toEqual([true, true, true, true, true, false, false, false, false]);
    expect(P.admit(r.log, rq(U('outra')), T0 + 20000).why).toBe('limite');
    expect(P.admit(r.log, wv(U('amiga')), T0 + 20000).ok).toBe(true); // acenos de amigos de verdade continuam passando
    expect(P.admit(r.log, rq(U('outra')), T0 + HOUR + 5000).ok).toBe(true); // a hora passou
  });
  it('acenos e aceites contam no teto geral, mas não no de pedidos', () => {
    const seq = []; for (let i = 0; i < 4; i++) seq.push([T0 + i, rq(U('p' + i))]);
    for (let i = 0; i < 10; i++) seq.push([T0 + 100 + i, wv(U('w' + i))]);
    seq.push([T0 + 200, rq(U('p9'))]);
    expect(run(seq).out.every(Boolean)).toBe(true);
  });
  it('o registro se limpa sozinho: nada com mais de 24 horas, nada de uma hora atrás nas listas', () => {
    const a = P.admit(null, rq(), T0);
    const b = P.admit(a.log, wv(CAI), T0 + 25 * HOUR);
    expect(Object.keys(b.log.t)).toEqual(['wave_' + CAI]);
    expect(b.log.h).toEqual([T0 + 25 * HOUR]);
    expect(b.log.q).toEqual([]);
  });
  it('o registro nunca passa de 100 entradas (guarda as mais novas)', () => {
    let log = null;
    for (let i = 0; i < 150; i++) { const r = P.admit(log, wv(U('amigo' + i)), T0 + i * 10 * MIN); expect(r.ok).toBe(true); log = r.log; }
    const keys = Object.keys(log.t);
    expect(keys.length).toBeLessThanOrEqual(P.KEEP);
    expect(keys).toContain('wave_' + U('amigo149'));
    expect(keys).not.toContain('wave_' + U('amigo0'));
  });
  it('a poda tira as entradas mais VELHAS e nunca a que acabou de entrar (todas dentro das 24 h, para a validade não esconder a ordem)', () => {
    let log = null;
    for (let i = 0; i < 110; i++) { const r = P.admit(log, wv(U('amigo' + i)), T0 + i * 10 * MIN); expect(r.ok).toBe(true); log = r.log; }
    const keys = Object.keys(log.t);
    expect(keys).toHaveLength(P.KEEP);
    expect(keys).toContain('wave_' + U('amigo109'));
    expect(keys).toContain('wave_' + U('amigo10'));
    expect(keys).not.toContain('wave_' + U('amigo0'));
    expect(keys).not.toContain('wave_' + U('amigo9'));
    expect(P.admit(log, wv(U('amigo109')), T0 + 109 * 10 * MIN + 1000).why).toBe('repetido'); // a última continua protegida contra repetição
  });
  it('registro estragado ou estranho não derruba nem libera o que não deve', () => {
    [undefined, null, 0, 'x', [], { t: 'x' }, { t: [], h: 'x', q: 5 }, { t: { a: 'x', b: NaN, c: -1 }, h: [NaN, 'a', null], q: {} }].forEach((log) => {
      const r = P.admit(log, wv(), T0);
      expect(r.ok).toBe(true);
      expect(r.log.h).toEqual([T0]);
      expect(Object.keys(r.log.t)).toContain('wave_' + ANA);
    });
  });
  it('um carimbo no futuro (relógio errado) não bloqueia ninguém para sempre', () => {
    const log = { t: { ['wave_' + ANA]: T0 + 10 * HOUR }, h: [T0 + 10 * HOUR], q: [] };
    expect(P.admit(log, wv(), T0).ok).toBe(true);
  });
  it('carimbos no futuro nas listas da hora (relógio errado de quem gravou) não contam para os tetos', () => {
    const futuro = []; for (let i = 0; i < 30; i++) futuro.push(T0 + 10 * HOUR + i);
    const log = { t: {}, h: futuro, q: futuro.slice(0, 10) };
    const r = P.admit(log, rq(), T0);
    expect(r.ok).toBe(true);
    expect(r.log.h).toEqual([T0]);
    expect(r.log.q).toEqual([T0]);
  });
  it('não altera o registro recebido', () => {
    const log = { t: { ['wave_' + CAI]: T0 - 1000 }, h: [T0 - 1000], q: [] }, copia = JSON.parse(JSON.stringify(log));
    P.admit(log, wv(), T0);
    expect(log).toEqual(copia);
  });
  it('as janelas e tetos combinados', () => {
    expect(P.WINDOW).toEqual({ request: 24 * HOUR, accepted: 60e3, wave: 5 * MIN, joined: 5 * MIN, hit: 12 * HOUR, week: 20 * HOUR });
    expect(P.CAP).toEqual({ all: 20, request: 5 });
    expect(P.KEEP).toBe(100);
    P.KINDS.forEach((k) => { expect(P.WINDOW[k]).toBeGreaterThan(0); expect(P.WINDOW[k]).toBeLessThanOrEqual(24 * HOUR); }); // o registro só guarda 24 h
  });
  it('os tipos novos (entrada na turma, meta batida, resumo) têm a sua janela e entram nos tetos', () => {
    const j = (from) => ({ kind: 'joined', from: from || ANA, to: BRU }), h = (from) => ({ kind: 'hit', from: from || ANA, to: BRU }), w = { kind: 'week', from: 'crew', to: BRU };
    expect(run([[T0, j()], [T0 + 4 * MIN, j()], [T0 + 5 * MIN, j()], [T0 + 5 * MIN, j(CAI)]]).out).toEqual([true, false, true, true]);
    expect(run([[T0, h()], [T0 + 11 * HOUR, h()], [T0 + 12 * HOUR, h()], [T0 + 12 * HOUR, h(CAI)]]).out).toEqual([true, false, true, true]);
    expect(run([[T0, w], [T0 + 19 * HOUR, w], [T0 + 20 * HOUR, w]]).out).toEqual([true, false, true]);
    const seq = []; for (let i = 0; i < 12; i++) seq.push([T0 + i, h(U('hit' + i))]); for (let i = 0; i < 10; i++) seq.push([T0 + 100 + i, j(U('jn' + i))]);
    expect(run(seq).out.filter(Boolean)).toHaveLength(20); // entram no teto geral de 20 por hora, e não no de pedidos
    expect(P.admit(null, h(), T0).log.q).toEqual([]);
  });
});

describe('1.2.0: a turma única, a meta batida e o resumo da semana', () => {
  const joined = (names, n, from) => ({ kind: 'joined', from: from || ANA, to: BRU, names: names, n: n });
  it('quem o servidor aceita sozinho para fechar a turma ("auto") não gera aviso de aceite nem de pedido', () => {
    expect(P.eventsOf(pair(), active({ auto: true }))).toEqual([]);
    expect(P.eventsOf(pair({ by: BRU }), active({ by: BRU, auto: true }))).toEqual([]);
    expect(P.eventsOf(pair(), active())).toEqual([{ kind: 'accepted', from: BRU, to: ANA }]); // aceite de gente de verdade continua avisando
    expect(P.eventsOf(pair(), active({ auto: false }))).toHaveLength(1);
    expect(P.eventsOf(null, active({ auto: true }))).toEqual([]); // nasceu pronta: nada
  });
  it('acenos dentro de uma amizade automática avisam como em qualquer outra', () => {
    const w = { [ANA]: wave('hi', T0 + 5000) };
    expect(P.eventsOf(active({ auto: true }), active({ auto: true, w: w }))).toEqual([{ kind: 'wave', from: ANA, to: BRU, wave: 'hi', again: false }]);
  });
  it('joinedText: as mesmas palavras do app (public/js/social.js) para 1, 2, 3 e muitos nomes', () => {
    [['Ana'], ['Ana', 'Bia'], ['Ana', 'Bia', 'Caio'], ['Ana', 'Bia', 'Caio', 'Duda'], ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fê', 'Gabi']].forEach((l) => {
      expect(P.joinedText(l, l.length)).toBe(SO.joinedText(l.map((nm) => ({ nm: nm }))));
    });
  });
  it('joinedText: o total pode ser maior que os nomes que vieram; nome vazio vira "Alguém"; nunca quebra', () => {
    expect(P.joinedText(['Ana', 'Bia'], 5)).toBe('Ana, Bia e mais 3 pessoas entraram na turma');
    expect(P.joinedText(['Ana', 'Bia'], 3)).toBe('Ana, Bia e mais 1 pessoa entraram na turma'.replace('1 pessoa entraram', '1 pessoa entraram'));
    expect(P.joinedText(['Ana'], 2)).toBe('Ana e Alguém entraram na turma');
    expect(P.joinedText([], 0)).toBe('Alguém entrou na turma');
    expect(P.joinedText(['\u200B', '  '], 2)).toBe('Alguém e Alguém entraram na turma');
    expect(P.joinedText(null, undefined)).toBe('Alguém entrou na turma');
    expect(P.joinedText(['<b>Ana</b>'], 1)).toBe('bAna/b entrou na turma');
  });
  it('joined: o título diz quem chegou, o corpo convida (1 pessoa: a um aceno; várias: a ver a turma), o tag é de quem trouxe', () => {
    expect(P.messageOf(joined(['Bia'], 1, CAI))).toEqual({ title: 'Bia entrou na turma\u00A0🌊', body: 'Que tal dar as boas-vindas com um aceno?', tag: 'mare-amigo-joined-' + CAI, url: './?tab=friends' });
    expect(P.messageOf(joined(['Bia', 'Caio'], 2))).toMatchObject({ title: 'Bia e Caio entraram na turma\u00A0🌊', body: 'Toque para ver a turma.' });
    expect(P.messageOf(joined(['Bia', 'Caio', 'Duda', 'Edu'], 4)).title).toBe('Bia, Caio e mais 2 pessoas entraram na turma\u00A0🌊');
    expect(P.messageOf(joined(['Bia'], undefined)).body).toBe('Que tal dar as boas-vindas com um aceno?'); // sem "n", conta os nomes
    expect(P.messageOf(joined([], undefined)).title).toBe('Alguém entrou na turma\u00A0🌊');
  });
  it('hit: o título diz quem bateu a meta; o corpo sugere um parabéns; um tag só para todos (vários amigos na mesma noite não enchem a tela)', () => {
    const a = P.messageOf({ kind: 'hit', from: ANA, to: BRU }, 'Bia'), b = P.messageOf({ kind: 'hit', from: CAI, to: BRU }, 'Caio');
    expect(a).toEqual({ title: 'Bia bateu a meta de hoje\u00A0🎉', body: 'Que tal mandar um parabéns? Toque para ver a turma.', tag: 'mare-turma-meta', url: './?tab=friends' });
    expect(b.tag).toBe(a.tag);
    expect(P.messageOf({ kind: 'hit', from: ANA, to: BRU }, '\u200B').title).toBe('Alguém bateu a meta de hoje\u00A0🎉');
    expect(a.title + a.body).not.toMatch(/\d+ ?ml|litros|\d+%/); // nunca revela volume nem porcentagem
  });
  it('weekMessage: positivo, sem placar nem nomes; "semana perfeita" quando todos bateram todos os dias; o dia da pessoa só aparece se ela bateu algum', () => {
    expect(P.weekMessage({ hits: 23, total: 35, mine: 5 })).toEqual({ title: 'Resumo da semana da turma\u00A0🌊',
      body: 'A turma bateu a meta 23 vezes nos últimos 7 dias. Você bateu em 5 dias. Toque para ver a turma.', tag: 'mare-turma-semana', url: './?tab=friends' });
    expect(P.weekMessage({ hits: 1, total: 14, mine: 1 }).body).toBe('A turma bateu a meta 1 vez nos últimos 7 dias. Você bateu em 1 dia. Toque para ver a turma.');
    expect(P.weekMessage({ hits: 9, total: 21, mine: 0 }).body).toBe('A turma bateu a meta 9 vezes nos últimos 7 dias. Toque para ver a turma.');
    expect(P.weekMessage({ hits: 9, total: 21, mine: null }).body).toBe('A turma bateu a meta 9 vezes nos últimos 7 dias. Toque para ver a turma.');
    expect(P.weekMessage({ hits: 21, total: 21, mine: 7 }).body).toBe('Semana perfeita! Todo mundo bateu a meta todos os dias.');
    expect(P.weekMessage({ hits: 0, total: 0, mine: null }).body).not.toContain('Semana perfeita'); // sem ninguém para contar não é "perfeita"
    expect(JSON.stringify(P.weekMessage({ hits: 4, total: 14, mine: 2 }))).not.toMatch(/undefined|null|NaN|ranking| (último|última|perdeu|menos) /);
  });
  it('weekMessage nunca quebra com números estranhos', () => {
    [{}, { hits: 'x', total: NaN, mine: 'y' }, { hits: -4, total: -1, mine: 99 }, { hits: 1e9, total: 1e9, mine: 7.9 }].forEach((w) => {
      const m = P.weekMessage(w);
      expect(JSON.stringify(m)).not.toMatch(/undefined|null|NaN|Infinity/);
      expect(typeof m.body).toBe('string');
    });
  });
  it('digestMessage: a conta de cada coisa, na ordem pedidos, aceites, entradas, acenos, metas, resumo; o primeiro texto em maiúscula', () => {
    const d = (l) => P.digestMessage(l.map((k) => (typeof k === 'string' ? { k: k } : k)));
    expect(d(['wave', 'wave', 'request', 'hit']).body).toBe('1 pedido de amizade, 2 acenos e 1 meta batida. Toque para ver a turma.');
    expect(d(['request', 'request']).body).toBe('2 pedidos de amizade. Toque para ver a turma.');
    expect(d(['wave', 'accepted']).body).toBe('1 pedido aceito e 1 aceno. Toque para ver a turma.');
    expect(d([{ k: 'joined', n: 3 }, { k: 'joined', n: 1 }, 'wave']).body).toBe('4 pessoas novas na turma e 1 aceno. Toque para ver a turma.');
    expect(d([{ k: 'joined', n: 1 }, 'hit']).body).toBe('1 pessoa nova na turma e 1 meta batida. Toque para ver a turma.');
    expect(d(['week', 'wave']).body).toBe('1 aceno e o resumo da semana. Toque para ver a turma.');
    expect(d(['request', 'accepted', { k: 'joined', n: 2 }, 'wave', 'hit', 'week']).body).toBe(
      '1 pedido de amizade, 1 pedido aceito, 2 pessoas novas na turma, 1 aceno, 1 meta batida e o resumo da semana. Toque para ver a turma.');
    expect(d(['wave', 'wave']).title).toBe('Novidades da turma\u00A0🌊');
    expect(d(['wave', 'wave']).tag).toBe('mare-turma-novidades');
    expect(d(['wave', 'wave']).url).toBe('./?tab=friends');
  });
  it('digestMessage ignora o que não é aviso e nunca quebra', () => {
    [null, undefined, [], 'x', [null, 7, {}, { k: 'fogo' }, { k: '__proto__' }, { k: 'constructor' }]].forEach((l) => {
      const m = P.digestMessage(l);
      expect(JSON.stringify(m)).not.toMatch(/undefined|null|NaN|\[object/);
      expect(typeof m.title).toBe('string');
    });
    expect(P.digestMessage([{ k: 'joined', n: 'x' }]).body).toContain('1 pessoa nova na turma');
  });
  it('payloadOf com os tipos novos e com o resumo de avisos: só texto, ev diz o tipo', () => {
    const evs = [joined(['Bia'], 1), { kind: 'hit', from: ANA, to: BRU }, { kind: 'week', from: 'crew', to: BRU }, { kind: 'digest' }];
    const ms = [P.messageOf(evs[0]), P.messageOf(evs[1], 'Bia'), P.weekMessage({ hits: 3, total: 14, mine: 1 }), P.digestMessage([{ k: 'wave' }, { k: 'hit' }])];
    evs.forEach((e, i) => {
      const d = P.payloadOf(e, ms[i]);
      expect(Object.keys(d).sort()).toEqual(['body', 'ev', 'kind', 'tag', 'title', 'url']);
      expect(d.kind).toBe('friend');
      expect(d.ev).toBe(e.kind);
      Object.values(d).forEach((v) => { expect(typeof v).toBe('string'); expect(v.length).toBeLessThan(300); });
    });
  });
  it('todos os textos novos usam espaço que não quebra antes do emoji', () => {
    [P.messageOf(joined(['Bia'], 1)), P.messageOf({ kind: 'hit', from: ANA, to: BRU }, 'Bia'), P.weekMessage({ hits: 3, total: 14 }), P.digestMessage([{ k: 'wave' }, { k: 'hit' }])]
      .forEach((m) => expect(m.title).toMatch(/\u00A0\S+$/u));
  });
  it('wantsKind: "Avisos dos amigos" desliga tudo; o aviso de meta só liga com um true; o resumo vale ligado até um false', () => {
    const u = (social) => ({ social: social });
    P.KINDS.filter((k) => k !== 'hit' && k !== 'week').forEach((k) => {
      expect(P.wantsKind({}, k)).toBe(true);
      expect(P.wantsKind(u({ push: true, hit: false, week: false }), k)).toBe(true);
      expect(P.wantsKind(u({ push: false }), k)).toBe(false);
    });
    expect(P.wantsKind({}, 'hit')).toBe(false);
    expect(P.wantsKind(null, 'hit')).toBe(false);
    expect(P.wantsKind(u({}), 'hit')).toBe(false);
    expect(P.wantsKind(u({ hit: 'true' }), 'hit')).toBe(false);
    expect(P.wantsKind(u({ hit: 1 }), 'hit')).toBe(false);
    expect(P.wantsKind(u({ hit: true }), 'hit')).toBe(true);
    expect(P.wantsKind(u({ push: false, hit: true }), 'hit')).toBe(false);
    expect(P.wantsKind({}, 'week')).toBe(true);
    expect(P.wantsKind(null, 'week')).toBe(true);
    expect(P.wantsKind(u({ week: 'false' }), 'week')).toBe(true);
    expect(P.wantsKind(u({ week: 0 }), 'week')).toBe(true);
    expect(P.wantsKind(u({ week: false }), 'week')).toBe(false);
    expect(P.wantsKind(u({ push: false, week: true }), 'week')).toBe(false);
  });
  it('wantsKind concorda com o que o app grava (ASSUME e wantOf em public/js/alerts-sync.js)', async () => {
    const AS = await import('../public/js/alerts-sync.js');
    [{}, { push: false }, { hit: true }, { week: false }, { push: false, hit: true, week: false }, { push: true, hit: false, week: true }].forEach((sc) => {
      const w = AS.wantOf(sc), u = { social: { push: w.push, hit: w.hit, week: w.week } };
      expect(P.wantsKind(u, 'request')).toBe(sc.push !== false);
      expect(P.wantsKind(u, 'hit')).toBe(sc.push !== false && sc.hit === true);
      expect(P.wantsKind(u, 'week')).toBe(sc.push !== false && sc.week !== false);
      // quem nunca gravou nada (nada difere do que o servidor assume) é lido pelo servidor como o app o assume
      if (w.push === AS.ASSUME.push && w.hit === AS.ASSUME.hit && w.week === AS.ASSUME.week) {
        expect([P.wantsKind({}, 'request'), P.wantsKind({}, 'hit'), P.wantsKind({}, 'week')]).toEqual([AS.ASSUME.push, AS.ASSUME.hit, AS.ASSUME.push && AS.ASSUME.week]);
      }
    });
  });
  it('pairId do servidor = pairId do app, em centenas de pares (inclusive maiúsculas e minúsculas misturadas)', () => {
    const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const uid = () => { let o = ''; const n = 10 + Math.floor(rnd() * 20); for (let i = 0; i < n; i++) o += abc[Math.floor(rnd() * abc.length)]; return o; };
    for (let i = 0; i < 500; i++) { const a = uid(), b = uid(); expect(P.pairId(a, b)).toBe(SO.pairId(a, b)); expect(P.pairId(a, b)).toBe(P.pairId(b, a)); }
    expect(P.pairId('Abcdefghij', 'abcdefghij')).toBe(SO.pairId('Abcdefghij', 'abcdefghij')); // só a caixa difere
    expect(P.pairId('Abcdefghij', 'abcdefghij')).toBe(P.pairId('abcdefghij', 'Abcdefghij'));
  });
});
