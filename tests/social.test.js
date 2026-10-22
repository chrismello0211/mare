// Maré — testes da lógica pura dos amigos (public/js/social.js). Rodar: npm test
// Além de conferir as contas, estes testes guardam os princípios do recurso: a turma é uma só e tem ranking (decisão do dono na 1.2.0),
// a meta em ml só sai com um "sim", nunca saem os volumes bebidos, só texto positivo e nenhum dado vindo da nuvem chega à tela sem passar pela limpeza.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../public/js/core.js';
import * as SO from '../public/js/social.js';

const T = '2026-10-18'; // "hoje" de quem olha
const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), BRU = U('bruno'), CAI = U('caio');

// estado de um app com água suficiente para ter algumas insígnias
function state(o) {
  o = o || {};
  const S = C.defaults(1);
  S.onboarded = true;
  S.goal.mode = 'manual'; S.goal.manual = o.goal || 2000;
  S.days = o.days || {};
  S.insignias = o.insignias || { concha: 1, estrela: 2 };
  S.social = Object.assign({ on: true, nick: 'Chris', share: true, code: '' }, o.social);
  if (o.mascot) S.profile.mascot = o.mascot;
  return S;
}
const dayWith = (ml, goal) => ({ goal: goal || 2000, entries: ml ? [{ id: 'a', t: 1, ml: ml, d: 'water' }] : [] });

describe('código de convite', () => {
  it('alfabeto sem I, L, O, 0 e 1; 31 símbolos; 8 letras', () => {
    expect(SO.CODE_CHARS).toHaveLength(31);
    expect(SO.CODE_CHARS).not.toMatch(/[ILO01]/);
    expect(new Set(SO.CODE_CHARS.split('')).size).toBe(31);
    expect(SO.CODE_LEN).toBe(8);
  });
  it('genCode sempre gera códigos válidos (aleatório de verdade)', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) { const c = SO.genCode(); expect(SO.validCode(c)).toBe(true); seen.add(c); }
    expect(seen.size).toBe(2000); // 8 letras em 31 símbolos: colisão em 2000 sorteios seria quase impossível
  });
  it('genCode usa o sorteador recebido e nunca estoura o alfabeto (nem com 0 ou 0.999…)', () => {
    expect(SO.genCode(() => 0)).toBe('AAAAAAAA');
    expect(SO.genCode(() => 0.9999999999)).toBe('99999999');
    expect(SO.genCode(() => 1)).toBe('99999999'); // 1 não deveria sair, mas se sair não quebra
    let n = 0;
    expect(SO.genCode(() => (n++ % 31) / 31)).toBe('ABCDEFGH');
  });
  it('normCode aceita traço, espaços, minúsculas e lixo; validCode é rígido', () => {
    expect(SO.normCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(SO.normCode('ab cd.ef_gh')).toBe('ABCDEFGH');
    expect(SO.normCode(null)).toBe('');
    expect(SO.normCode(undefined)).toBe('');
    expect(SO.normCode(1234)).toBe('1234');
    expect(SO.validCode('ABCDEFGH')).toBe(true);
    ['ABCDEFG', 'ABCDEFGHJ', 'ABCDEFG0', 'ABCDEFGI', 'ABCDEFGL', 'ABCDEFGO', 'ABCDEFG1', 'abcdefgh', 'ABCD-EFG', '', null, undefined, 12345678].forEach((c) => {
      expect(SO.validCode(c)).toBe(false);
    });
  });
  it('fmtCode põe o traço no meio, só em código válido', () => {
    expect(SO.fmtCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(SO.fmtCode('xyz')).toBe('xyz');
    expect(SO.fmtCode(null)).toBe('');
  });
  it('codeFromURL lê ?amigo= de qualquer jeito razoável e ignora o resto', () => {
    expect(SO.codeFromURL('?amigo=ABCD-EFGH')).toBe('ABCDEFGH');
    expect(SO.codeFromURL('?amigo=abcdefgh')).toBe('ABCDEFGH');
    expect(SO.codeFromURL('?x=1&amigo=ABCD%20EFGH&y=2')).toBe('ABCDEFGH');
    expect(SO.codeFromURL('?amigo=ABCD-EFGH#frag')).toBe('ABCDEFGH');
    expect(SO.codeFromURL('?source=push&amigo=KMNP-QRST')).toBe('KMNPQRST');
    expect(SO.codeFromURL('')).toBe('');
    expect(SO.codeFromURL(null)).toBe('');
    expect(SO.codeFromURL('?amigo=')).toBe('');
    expect(SO.codeFromURL('?amigo=curto')).toBe('');
    expect(SO.codeFromURL('?amigo=ABCDEFG0')).toBe('');
    expect(SO.codeFromURL('?amigo=%E0%A4%A')).toBe(''); // % quebrado não derruba
    expect(SO.codeFromURL('?outroamigo=ABCDEFGH')).toBe('');
    expect(SO.codeFromURL('?amigo=ABCDEFGH<script>')).toBe(''); // sobra lixo: o código não fecha em 8
  });
  it('inviteLink troca qualquer ?consulta e #fragmento pelo convite', () => {
    expect(SO.inviteLink('https://x.github.io/mare/', 'ABCDEFGH')).toBe('https://x.github.io/mare/?amigo=ABCDEFGH');
    expect(SO.inviteLink('https://x.github.io/mare/?source=push#oi', 'ABCDEFGH')).toBe('https://x.github.io/mare/?amigo=ABCDEFGH');
    expect(SO.codeFromURL('?' + SO.inviteLink('https://x/', 'KMNPQRST').split('?')[1])).toBe('KMNPQRST'); // ida e volta
  });
});

describe('nomes e pares', () => {
  it('cleanNick tira controles e < >, junta espaços e limita a 20 letras', () => {
    expect(SO.cleanNick('  Chris   Mello ')).toBe('Chris Mello');
    expect(SO.cleanNick('<b>Ana</b>')).toBe('bAna/b');
    expect(SO.cleanNick('a\u0000b\u0007c\td\ne')).toBe('abc d e');
    expect(SO.cleanNick(null)).toBe('');
    expect(SO.cleanNick(undefined)).toBe('');
    expect(SO.cleanNick('x'.repeat(50))).toHaveLength(SO.NICK_MAX);
    expect(SO.cleanNick('   ')).toBe('');
  });
  it('cleanNick tira o que não se enxerga ou inverte a leitura (anti-disfarce)', () => {
    expect(SO.cleanNick('A\u200Bna')).toBe('Ana'); // largura zero
    expect(SO.cleanNick('\u202EanA')).toBe('anA'); // "override" da direita para a esquerda
    expect(SO.cleanNick('\uFEFFAna\u2066')).toBe('Ana');
    expect(SO.cleanNick('\u200B\u200C\u200D')).toBe(''); // só invisíveis: vira vazio (e o app usa "Amigo")
    expect(SO.cleanNick('Ana\u00A0\u00A0Lu')).toBe('Ana Lu'); // espaço "duro" vira espaço comum
  });
  it('cleanNick barra também os "brancos" que enganam: enchimentos, Braille em branco, hífen suave, etiquetas…', () => {
    // cada um destes é invisível (ou quase) e permitiria um apelido que parece vazio ou idêntico ao de outra pessoa
    const blanks = ['\u3164', '\u115F', '\u1160', '\uFFA0', '\u2800', '\u061C', '\u00AD', '\u180E', '\u034F', '\u17B4', '\u17B5', '\u2062', '\u206A',
      '\uFE01', '\uFE0E', '\u{E0041}', '\u{E007F}', '\u{E0101}', '\u{1D173}', '\uFFF9', '\uFFFB', '\u{1BCA0}'];
    blanks.forEach((b) => {
      const hex = b.codePointAt(0).toString(16).toUpperCase();
      expect(SO.cleanNick(b + b + b), 'só U+' + hex).toBe('');
      expect(SO.cleanNick('A' + b + 'na'), 'no meio, U+' + hex).toBe('Ana');
    });
    expect(SO.cleanNick('Ana\u3164')).toBe('Ana'); // não dá para "imitar" a Ana com um nome que só parece igual
  });
  it('cleanNick tira também os formatadores invisíveis (categoria Cf) de outras escritas, mesmo os que a lista explícita não cita', () => {
    // sinais de número e de fim de versículo (árabe, siríaco), numeral kaithi e controles de hieróglifos: invisíveis ou quase, e só enganam
    ['\u0600', '\u0601', '\u0605', '\u06DD', '\u070F', '\u08E2', '\u{110BD}', '\u{110CD}', '\u{13430}', '\u{1343F}'].forEach((b) => {
      const hex = b.codePointAt(0).toString(16).toUpperCase();
      expect(SO.cleanNick(b + b), 'só U+' + hex).toBe('');
      expect(SO.cleanNick('A' + b + 'na'), 'no meio, U+' + hex).toBe('Ana');
    });
  });
  it('cleanNick mantém o que é legítimo: acentos (inclusive decompostos), emoji com FE0F, nomes de outras escritas', () => {
    expect(SO.cleanNick('José')).toBe('José');
    expect(SO.cleanNick('Jose\u0301')).toBe('Jose\u0301'); // acento "solto" (1 marca)
    expect(SO.cleanNick('Vie\u0323\u0302t')).toBe('Vie\u0323\u0302t'); // vietnamita decomposto: 2 marcas na mesma letra
    expect(SO.cleanNick('❤️ Lu')).toBe('❤️ Lu'); // FE0F (emoji) não é removido
    expect(SO.cleanNick('☀\uFE0F')).toBe('☀\uFE0F');
    expect(SO.cleanNick('李小龍')).toBe('李小龍');
    expect(SO.cleanNick('Αλέξης')).toBe('Αλέξης');
    expect(SO.cleanNick('محمد')).toBe('محمد');
    expect(SO.cleanNick('हिन्दी')).toBe('हिन्दी');
  });
  it('cleanNick limita marcas combinantes empilhadas (texto "zalgo") e não aceita nome só de marcas', () => {
    const marks = '\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u0309';
    const z = SO.cleanNick('Z' + marks + 'a' + marks + 'l' + marks);
    expect(z).toBe('Z\u0300\u0301a\u0300\u0301l\u0300\u0301'); // no máximo 2 por letra
    expect(SO.cleanNick(marks)).toBe(''); // só marcas: não é um nome
    expect(SO.cleanNick(' \u0301 \u0302 ')).toBe('');
    expect(SO.cleanNick('\u20D0\u20D1\u1AB0\u1DC0\uFE20x')).toBe('\u20D0\u20D1x'); // outros blocos de marcas contam igual
    expect(Array.from(SO.cleanNick('Z' + marks.repeat(50))).length).toBeLessThanOrEqual(SO.NICK_MAX);
  });
  it('cleanNick tira também os controles C1 (U+0080–U+009F), que alguns navegadores desenham como nada', () => {
    expect(SO.cleanNick('\u0085\u0085\u009F')).toBe(''); // só C1: vira vazio (e o app usa "Amigo")
    expect(SO.cleanNick('Ana\u0085Lu\u0090')).toBe('AnaLu');
    expect(SO.cleanNick('\u0080\u0081 \u009D')).toBe('');
    expect(SO.cleanNick('\u007FAna')).toBe('Ana'); // DEL também
  });
  it('cleanNick limita as marcas empilhadas de QUALQUER escrita (cirílico, hebraico, árabe, védico), não só as dos blocos mais comuns', () => {
    const run = (cp, n) => String.fromCodePoint(cp).repeat(n);
    [[0x2DE0, 'cirílico estendido'], [0x0591, 'acentos do hebraico'], [0x0610, 'sinais pequenos do árabe'], [0x1CD0, 'védico'], [0x0483, 'cirílico'], [0xA66F, 'cirílico combinante']].forEach((c) => {
      const m = String.fromCodePoint(c[0]);
      expect(SO.cleanNick('a' + run(c[0], 12)), c[1]).toBe('a' + m + m); // no máximo 2
      expect(SO.cleanNick(run(c[0], 12)), c[1] + ' sozinho').toBe(''); // só marcas: não é nome
    });
    expect(SO.cleanNick('x' + run(0x1CD0, 3) + 'y' + run(0x0591, 3) + 'z')).toBe('x\u1CD0\u1CD0y\u0591\u0591z');
  });
  it('cleanNick segue aceitando o que é legítimo com marcas: emoji com FE0F e chaveiro (keycap), árabe com 2 sinais, hebraico com pontos', () => {
    expect(SO.cleanNick('1\uFE0F\u20E3')).toBe('1\uFE0F\u20E3'); // 1️⃣ (FE0F + chaveiro: 2 marcas)
    expect(SO.cleanNick('#\uFE0F\u20E3 *\uFE0F\u20E3')).toBe('#\uFE0F\u20E3 *\uFE0F\u20E3');
    expect(SO.cleanNick('\u0628\u0650\u0651')).toBe('\u0628\u0650\u0651'); // بِّ: letra + kasra + shadda
    expect(SO.cleanNick('\u0628\u064E\u064F\u0650')).toBe('\u0628\u064E\u064F'); // com 3 sinais, o terceiro cai
    expect(SO.cleanNick('\u05E9\u05C1\u05B8')).toBe('\u05E9\u05C1\u05B8'); // hebraico com ponto e vogal
    expect(SO.cleanNick('e\u0301\u0302')).toBe('e\u0301\u0302');
    expect(SO.cleanNick('❤️')).toBe('❤️');
  });
  it('cleanNick não corta emoji ao meio e não deixa espaço sobrando no fim', () => {
    const t = SO.cleanNick('🐙'.repeat(30));
    expect(Array.from(t)).toHaveLength(20);
    expect(t).toBe('🐙'.repeat(20)); // nenhum par de surrogates partido
    expect(SO.cleanNick('a'.repeat(19) + ' b')).toBe('a'.repeat(19)); // o corte cai no espaço: sem espaço pendurado
    expect(SO.cleanNick('João da Silva')).toBe('João da Silva');
  });
  it('tsMs: carimbo do Firestore ou número; qualquer outra coisa (inclusive "toMillis" que não é função) vale 0', () => {
    expect(SO.tsMs({ toMillis: () => 1234 })).toBe(1234);
    expect(SO.tsMs(5000)).toBe(5000);
    ['x', '123', null, undefined, NaN, Infinity, {}, [], { toMillis: 5 }, { toMillis: 'x' }, { toMillis: () => NaN }, true].forEach((v) => { expect(SO.tsMs(v)).toBe(0); });
  });
  it('pairId é o mesmo nos dois sentidos e compara em minúsculas', () => {
    expect(SO.pairId(ANA, BRU)).toBe(SO.pairId(BRU, ANA));
    expect(SO.pairId('Zed0000000', 'aaa0000000')).toBe('aaa0000000_Zed0000000'); // "a" < "z", mesmo com Z maiúsculo
    expect(SO.pairId('aaa0000000', 'Zed0000000')).toBe('aaa0000000_Zed0000000');
    expect(SO.pairId('Abc0000000', 'abc0000000')).toBe(SO.pairId('abc0000000', 'Abc0000000')); // empate ignorando caixa: desempata
    expect(SO.pairId(ANA, BRU).split('_')).toEqual([ANA, BRU]);
  });
  it('otherOf devolve o outro lado', () => {
    expect(SO.otherOf([ANA, BRU], ANA)).toBe(BRU);
    expect(SO.otherOf([ANA, BRU], BRU)).toBe(ANA);
    expect(SO.otherOf(null, ANA)).toBe('');
    expect(SO.otherOf([ANA], ANA)).toBe('');
  });
});

describe('o que vai para a nuvem (profilePayload)', () => {
  it('só os campos combinados, nos tipos que as regras do servidor aceitam', () => {
    const S = state({ days: { [T]: dayWith(1234) } });
    const p = SO.profilePayload(S, T);
    expect(Object.keys(p).sort()).toEqual(['day', 'gl', 'ins', 'mc', 'met', 'nm', 'pct', 'sh', 'st', 'v', 'wm']);
    expect(p).toEqual({ v: 1, nm: 'Chris', mc: 'estrela', ins: ['concha', 'estrela'], pct: 61, met: false, st: 0, day: T, sh: true, gl: null, wm: 0 }); // meta em ml: só com o "sim"
    expect(Number.isInteger(p.pct) && Number.isInteger(p.st) && Number.isInteger(p.wm)).toBe(true);
  });
  it('nunca vazam volumes, peso, meta em ml, horários ou localização', () => {
    const S = state({ days: { [T]: dayWith(1234, 2345) }, goal: 2345 });
    S.profile.weight = 83; S.profile.name = 'Christopher Mello'; S.profile.wake = '05:41'; S.goal.temp = 29;
    const json = JSON.stringify(SO.profilePayload(S, T));
    ['1234', '2345', '83', '05:41', '29', 'Christopher', 'weight', 'goal', 'ml'].forEach((s) => { expect(json).not.toContain(s); });
  });
  it('pct passa de 100? Fica em 100. Arredonda para baixo. Sem registros: 0', () => {
    expect(SO.profilePayload(state({ days: { [T]: dayWith(9999) } }), T).pct).toBe(100);
    expect(SO.profilePayload(state({ days: { [T]: dayWith(1999) } }), T).pct).toBe(99); // 99,95% não vira 100
    expect(SO.profilePayload(state({ days: { [T]: dayWith(1) } }), T).pct).toBe(0);
    expect(SO.profilePayload(state({ days: {} }), T).pct).toBe(0);
  });
  it('a meta é a do dia (a mesma da tela); sem registro do dia, a das configurações', () => {
    expect(SO.profilePayload(state({ goal: 2000, days: { [T]: dayWith(1500, 3000) } }), T).pct).toBe(50); // dia com meta de 3 L
    expect(SO.profilePayload(state({ goal: 4000, days: {} }), T).pct).toBe(0);
    const S = state({ goal: 2500, days: { [T]: { entries: [{ id: 'a', t: 1, ml: 1250, d: 'water' }] } } }); // dia sem meta gravada
    expect(SO.profilePayload(S, T).pct).toBe(50);
  });
  it('bateu a meta: met = true, pct = 100 e sequência contando hoje', () => {
    const days = { '2026-10-16': dayWith(2000), '2026-10-17': dayWith(2500), [T]: dayWith(2000) };
    const p = SO.profilePayload(state({ days: days }), T);
    expect(p).toMatchObject({ met: true, pct: 100, st: 3 });
  });
  it('sem a meta de hoje, a sequência de ontem ainda vale', () => {
    const days = { '2026-10-16': dayWith(2000), '2026-10-17': dayWith(2000), [T]: dayWith(500) };
    expect(SO.profilePayload(state({ days: days }), T)).toMatchObject({ met: false, pct: 25, st: 2 });
  });
  it('share desligado: só nome, mascote e insígnias; o progresso vira "em pausa"', () => {
    const days = { '2026-10-17': dayWith(2000), [T]: dayWith(2000) };
    const p = SO.profilePayload(state({ days: days, social: { share: false } }), T);
    expect(p).toMatchObject({ sh: false, pct: null, met: false, st: 0, nm: 'Chris' });
    expect(p.ins).toEqual(['concha', 'estrela']);
  });
  it('apelido vazio ou só de lixo vira "Amigo"; apelido é limpo', () => {
    expect(SO.profilePayload(state({ social: { nick: '' } }), T).nm).toBe('Amigo');
    expect(SO.profilePayload(state({ social: { nick: '<>' } }), T).nm).toBe('Amigo');
    expect(SO.profilePayload(state({ social: { nick: ' Ana  <3 ' } }), T).nm).toBe('Ana 3');
  });
  it('mascote: a escolhida se foi conquistada; senão a mais alta; insígnias na ordem do recife', () => {
    const ins = { concha: 1, estrela: 2, baiacu: 3 };
    expect(SO.profilePayload(state({ insignias: ins, mascot: 'estrela' }), T).mc).toBe('estrela');
    expect(SO.profilePayload(state({ insignias: ins, mascot: 'narval' }), T).mc).toBe('baiacu'); // ainda não é sua
    expect(SO.profilePayload(state({ insignias: ins }), T).mc).toBe('baiacu');
    expect(SO.profilePayload(state({ insignias: { baiacu: 3, concha: 1 } }), T).ins).toEqual(['concha', 'baiacu']);
  });
  it('não usa "state.social" sozinho: sem objeto social, ainda funciona (backup antigo)', () => {
    const S = state(); delete S.social;
    expect(SO.profilePayload(S, T)).toMatchObject({ nm: 'Amigo', sh: true });
  });
  it('samePayload compara só o que importa', () => {
    const a = SO.profilePayload(state({ days: { [T]: dayWith(500) } }), T);
    expect(SO.samePayload(a, Object.assign({}, a))).toBe(true);
    expect(SO.samePayload(a, Object.assign({}, a, { pct: 26 }))).toBe(false);
    expect(SO.samePayload(a, Object.assign({}, a, { ins: ['concha'] }))).toBe(false);
    expect(SO.samePayload(a, Object.assign({}, a, { nm: 'Outro' }))).toBe(false);
    expect(SO.samePayload(a, Object.assign({}, a, { day: '2026-10-19' }))).toBe(false);
    expect(SO.samePayload(a, null)).toBe(false);
    expect(SO.samePayload(null, a)).toBe(false);
  });
});

describe('o que chega da nuvem (cleanFriend, cleanRequest)', () => {
  const prof = (o) => Object.assign({ v: 1, nm: 'Bruno', mc: 'polvo', ins: ['concha', 'polvo'], pct: 40, met: false, st: 3, day: T, sh: true }, o);
  const pair = (o) => Object.assign({ m: [ANA, BRU], by: ANA, st: 'active', nm: 'Ana', mc: 'cavalo', tn: 'Bruno', tc: 'polvo', at: { toMillis: () => 1000 }, ok: { toMillis: () => 2000 } }, o);

  it('um perfil bom passa inteiro', () => {
    const f = SO.cleanFriend(BRU, prof(), pair(), ANA);
    expect(f).toMatchObject({ uid: BRU, nm: 'Bruno', mc: 'polvo', ins: ['concha', 'polvo'], pct: 40, met: false, st: 3, day: T, sh: true, since: 2000, mine: null, theirs: null });
    expect(Object.keys(f).sort()).toEqual(['day', 'gl', 'ins', 'mc', 'met', 'mine', 'nm', 'pct', 'sh', 'since', 'st', 'theirs', 'uid', 'wm']); // nenhum horário de atividade do amigo
  });
  it('uid inválido: descarta', () => {
    ['', 'curto', 'a/b' + 'x'.repeat(20), null, undefined, 'x'.repeat(65), 'ã'.repeat(20)].forEach((u) => { expect(SO.cleanFriend(u, prof(), pair(), ANA)).toBeNull(); });
  });
  it('dados hostis são domados: nome, mascote, insígnias, números e dia', () => {
    const f = SO.cleanFriend(BRU, prof({ nm: '<img src=x onerror=alert(1)>' + 'z'.repeat(100), mc: '../../etc', ins: ['polvo', 'hacker', 'concha', 'polvo', 5, null], pct: 9999, st: 1e12, day: 'ontem' }), pair(), ANA);
    expect(f.nm).not.toMatch(/[<>]/);
    expect(Array.from(f.nm).length).toBeLessThanOrEqual(SO.NICK_MAX);
    expect(f.mc).toBe('concha'); // mascote desconhecido: volta para a concha
    expect(f.ins).toEqual(['concha', 'polvo']); // só as conhecidas, sem repetir, na ordem do recife
    expect(f.pct).toBe(100);
    expect(f.st).toBe(9999);
    expect(f.day).toBe('');
  });
  it('nome vindo da nuvem passa pela mesma limpeza (invisíveis, controles, espaços)', () => {
    const f = SO.cleanFriend(BRU, prof({ nm: '\u202E  Bru\u200Bno\n\t ' }), pair(), ANA);
    expect(f.nm).toBe('Bruno');
    expect(SO.cleanFriend(BRU, prof({ nm: '\u200B\u200B' }), pair(), ANA).nm).toBe('Bruno'); // nome vazio: cai no nome da amizade
  });
  it('horários que venham no perfil (gravados por fora das regras) são ignorados: nenhum carimbo de atividade chega à tela, nem estranho', () => {
    ['x', 5, { toMillis: 5 }, { toMillis: () => 1700000000000 }, null].forEach((u) => {
      const f = SO.cleanFriend(BRU, prof({ u: u }), pair({ ok: { toMillis: 'x' }, at: { toMillis: 7 } }), ANA);
      expect(f).not.toHaveProperty('u');
      expect(f.since).toBe(0); // e um carimbo estranho na amizade não derruba a limpeza
    });
    expect(SO.cleanRequest(BRU, { by: ANA, nm: 'A', tn: 'B', at: { toMillis: 9 } }, ANA).at).toBe(0);
  });
  it('nome de amigo feito só de "brancos" (enchimento Hangul, Braille) cai no nome da amizade, não vira um nome vazio', () => {
    expect(SO.cleanFriend(BRU, prof({ nm: '\u3164\u3164\u3164' }), pair({ by: ANA }), ANA).nm).toBe('Bruno');
    expect(SO.cleanFriend(BRU, prof({ nm: '\u2800' }), null, ANA).nm).toBe('Amigo');
  });
  it('números ruins viram 0, e pct nulo continua nulo (progresso em pausa)', () => {
    const f = SO.cleanFriend(BRU, prof({ pct: 'abc', st: NaN, met: 'sim' }), pair(), ANA);
    expect(f).toMatchObject({ pct: 0, st: 0, met: false });
    expect(SO.cleanFriend(BRU, prof({ pct: null, sh: false }), pair(), ANA)).toMatchObject({ pct: null, sh: false });
    expect(SO.cleanFriend(BRU, prof({ pct: -40 }), pair(), ANA).pct).toBe(0);
  });
  it('sem perfil ainda (amigo novo que não publicou): usa o nome e o mascote da amizade', () => {
    // eu sou ANA e fui eu quem pediu: o nome dele é o do convite (tn, tc)
    expect(SO.cleanFriend(BRU, null, pair({ by: ANA }), ANA)).toMatchObject({ nm: 'Bruno', mc: 'polvo', ins: [], pct: null, day: '' });
    // ele pediu: o nome dele é o do pedido (nm, mc)
    expect(SO.cleanFriend(ANA, null, pair({ by: ANA }), BRU)).toMatchObject({ nm: 'Ana', mc: 'cavalo' });
    expect(SO.cleanFriend(BRU, undefined, undefined, ANA)).toMatchObject({ nm: 'Amigo', mc: 'concha' });
  });
  it('acenos: o meu e o dele, só com tipo e dia válidos', () => {
    const w = { [ANA]: { k: 'hi', d: T, at: 1 }, [BRU]: { k: 'cheer', d: '2026-10-17', at: 2 } };
    const f = SO.cleanFriend(BRU, prof(), pair({ w: w }), ANA);
    expect(f.mine).toEqual({ k: 'hi', d: T });
    expect(f.theirs).toEqual({ k: 'cheer', d: '2026-10-17' });
    const bad = SO.cleanFriend(BRU, prof(), pair({ w: { [ANA]: { k: 'hack', d: T }, [BRU]: { k: 'hi', d: 'x' } } }), ANA);
    expect(bad.mine).toBeNull();
    expect(bad.theirs).toBeNull();
    expect(SO.cleanFriend(BRU, prof(), pair({ w: 'texto' }), ANA).mine).toBeNull();
    expect(SO.cleanFriend(BRU, prof(), pair({ w: null }), ANA).theirs).toBeNull();
  });
  it('since: aceite se houver; senão o pedido; senão 0', () => {
    expect(SO.cleanFriend(BRU, prof(), pair({ ok: undefined }), ANA).since).toBe(1000);
    expect(SO.cleanFriend(BRU, prof(), pair({ ok: undefined, at: undefined }), ANA).since).toBe(0);
  });
  it('cleanRequest: de quem é o nome certo e quem pediu', () => {
    const p = { m: [ANA, BRU], by: ANA, st: 'pending', nm: 'Ana', mc: 'cavalo', tn: 'Bruno', tc: 'polvo', at: { toMillis: () => 5000 } };
    // eu sou BRU: recebi o pedido da ANA; o nome que vejo é o dela
    expect(SO.cleanRequest(ANA, p, BRU)).toEqual({ uid: ANA, mine: false, nm: 'Ana', mc: 'cavalo', at: 5000 });
    // eu sou ANA: pedi ao BRU; vejo o nome do convite
    expect(SO.cleanRequest(BRU, p, ANA)).toEqual({ uid: BRU, mine: true, nm: 'Bruno', mc: 'polvo', at: 5000 });
    expect(SO.cleanRequest('x', p, ANA)).toBeNull();
    expect(SO.cleanRequest(BRU, null, ANA)).toBeNull();
    expect(SO.cleanRequest(ANA, Object.assign({}, p, { nm: '<b>' + 'y'.repeat(60) }), BRU).nm).not.toMatch(/[<>]/);
  });
});

describe('convite lido da nuvem (cleanInvite)', () => {
  const raw = (o) => Object.assign({ uid: BRU, nm: 'Bruno', mc: 'polvo' }, o);
  it('devolve só quem convidou (nome e mascote) e se sou eu', () => {
    expect(SO.cleanInvite('ABCDEFGH', raw(), ANA)).toEqual({ code: 'ABCDEFGH', uid: BRU, nm: 'Bruno', mc: 'polvo', self: false });
    expect(SO.cleanInvite('ABCDEFGH', raw({ uid: ANA }), ANA).self).toBe(true);
  });
  it('convite revogado (rv) é como se não existisse: o dono trocou o código ou saiu dos amigos', () => {
    expect(SO.cleanInvite('ABCDEFGH', raw({ rv: true }), ANA)).toBeNull();
    expect(SO.cleanInvite('ABCDEFGH', raw({ rv: true, nm: '-', mc: '-' }), ANA)).toBeNull();
    expect(SO.cleanInvite('ABCDEFGH', raw({ rv: false }), ANA)).not.toBeNull(); // só "true" revoga; o resto é lixo ignorado
  });
  it('documento estranho: null ou limpo, nunca cru', () => {
    ['x', 5, null, undefined, [], 'ABCDEFG0'].forEach((r) => { expect(SO.cleanInvite('ABCDEFGH', r, ANA)).toBeNull(); });
    expect(SO.cleanInvite('curto', raw(), ANA)).toBeNull();
    expect(SO.cleanInvite('ABCDEFGH', raw({ uid: 'a/b' }), ANA)).toBeNull();
    const w = SO.cleanInvite('ABCDEFGH', raw({ nm: '<script>' + 'y'.repeat(60), mc: '../x' }), ANA);
    expect(w.nm).not.toMatch(/[<>]/);
    expect(w.mc).toBe('concha');
  });
});

describe('estado de um amigo hoje (liveOf, statusText)', () => {
  const f = (o) => Object.assign({ pct: 0, met: false, st: 0, day: T, sh: true }, o);
  it('categorias: desconhecido, pausa, ausente, meta batida, andando, parado', () => {
    expect(SO.liveOf(null, T).kind).toBe('unknown');
    expect(SO.liveOf(f({ sh: false, pct: null }), T).kind).toBe('paused');
    expect(SO.liveOf(f({ day: '2026-10-17' }), T)).toMatchObject({ kind: 'away', away: 1 });
    expect(SO.liveOf(f({ met: true, pct: 100 }), T)).toMatchObject({ kind: 'met', pct: 100 });
    expect(SO.liveOf(f({ pct: 35 }), T)).toMatchObject({ kind: 'going', pct: 35 });
    expect(SO.liveOf(f({ pct: 0 }), T).kind).toBe('idle');
    expect(SO.liveOf(f({ day: '' }), T).kind).toBe('unknown'); // sem dia = ainda não publicou nada: não conta como "ausente"
    expect(SO.liveOf(f({ day: 'lixo' }), T).kind).toBe('away'); // dia que existe mas está muito longe
  });
  it('sequência só vale se ele apareceu hoje ou ontem', () => {
    expect(SO.liveOf(f({ st: 5 }), T).st).toBe(5);
    expect(SO.liveOf(f({ st: 5, day: '2026-10-17' }), T).st).toBe(5);
    expect(SO.liveOf(f({ st: 5, day: '2026-10-16' }), T).st).toBe(0);
  });
  it('fuso à frente: o dia dele é amanhã para mim e conta como hoje', () => {
    expect(SO.liveOf(f({ day: '2026-10-19', pct: 20 }), T)).toMatchObject({ kind: 'going', away: 0 });
  });
  it('um dia que ainda nem chegou (nem o fuso explica) não vale como "hoje para sempre"', () => {
    expect(SO.liveOf(f({ day: '2026-10-20', pct: 20 }), T).kind).toBe('going'); // 2 dias à frente: no limite do que o fuso explica
    expect(SO.liveOf(f({ day: '2026-10-21', pct: 20, met: true }), T)).toMatchObject({ kind: 'unknown', pct: 0, st: 0 });
    expect(SO.liveOf(f({ day: '2099-12-31', pct: 100, met: true, st: 9999 }), T)).toMatchObject({ kind: 'unknown', pct: 0, st: 0 });
    expect(SO.liveOf(f({ day: '9999-99-99', met: true }), T).kind).toBe('unknown');
    expect(SO.statusText(SO.liveOf(f({ day: '2099-12-31', met: true }), T))).toBe('Ainda sem novidades');
  });
  it('em pausa não mostra nada do progresso', () => {
    expect(SO.liveOf(f({ sh: false, pct: null, met: true, st: 9 }), T)).toMatchObject({ kind: 'paused', pct: 0, st: 0 });
  });
  it('statusText: sempre uma frase gentil', () => {
    expect(SO.statusText(SO.liveOf(f({ met: true }), T))).toBe('Meta batida hoje\u00A0🎉');
    expect(SO.statusText(SO.liveOf(f({ pct: 42 }), T))).toBe('42% da meta de hoje');
    expect(SO.statusText(SO.liveOf(f(), T))).toBe('Ainda sem registros hoje');
    expect(SO.statusText(SO.liveOf(f({ sh: false }), T))).toBe('Progresso do dia em pausa');
    expect(SO.statusText(SO.liveOf(f({ day: '2026-10-17' }), T))).toBe('Esteve por aqui ontem');
    expect(SO.statusText(SO.liveOf(f({ day: '2026-10-10' }), T))).toBe('Sem novidades há 8 dias');
    expect(SO.statusText(SO.liveOf(f({ day: '2026-01-01' }), T))).toBe('Sem novidades há mais de um mês');
    expect(SO.statusText({ kind: 'unknown' })).toBe('Ainda sem novidades');
    expect(SO.statusText({ kind: 'qualquer-outra-coisa' })).toBe('');
  });
  it('daysBetween: diferença em dias, nunca negativa, 99 para dados ruins', () => {
    expect(SO.daysBetween('2026-10-17', T)).toBe(1);
    expect(SO.daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(SO.daysBetween('2026-10-19', T)).toBe(0);
    expect(SO.daysBetween('x', T)).toBe(99);
    expect(SO.daysBetween(T, undefined)).toBe(99);
    ['9999-99-99', '0000-00-00', '2026-13-45'].forEach((d) => { expect(Number.isFinite(SO.daysBetween(d, T))).toBe(true); expect(Number.isFinite(SO.daysBetween(T, d))).toBe(true); });
  });
});

describe('ordem por nome (desempate) e textos sempre positivos', () => {
  it('byName: alfabética em pt-BR, sem ligar para maiúsculas nem acentos, nunca por progresso', () => {
    const mk = (nm, pct, st, uid) => ({ nm: nm, uid: uid || U(nm.toLowerCase()), pct: pct, st: st });
    const list = [mk('Zélia', 100, 99), mk('ana', 0, 0), mk('Álvaro', 50, 5), mk('Bruno', 100, 30), mk('édson', 10, 1)];
    expect(list.slice().sort(SO.byName).map((x) => x.nm)).toEqual(['Álvaro', 'ana', 'Bruno', 'édson', 'Zélia']);
    // embaralhando o progresso, a ordem não muda
    const shuffled = list.map((x, i) => Object.assign({}, x, { pct: (i * 37) % 101, st: (i * 11) % 9 }));
    expect(shuffled.sort(SO.byName).map((x) => x.nm)).toEqual(['Álvaro', 'ana', 'Bruno', 'édson', 'Zélia']);
  });
  it('mesmo nome: desempata pelo uid, de forma estável', () => {
    const a = { nm: 'Ana', uid: U('a1') }, b = { nm: 'ana', uid: U('a2') };
    expect([b, a].sort(SO.byName).map((x) => x.uid)).toEqual([a.uid, b.uid]);
    expect([a, b].sort(SO.byName).map((x) => x.uid)).toEqual([a.uid, b.uid]);
  });
  const L = (kind, away) => ({ kind: kind, pct: kind === 'met' ? 100 : 30, st: 0, away: away || 0 });
  const ME = (kind) => ({ kind: kind, pct: 50, st: 0, away: 0 });
  it('turma: sozinho, ninguém ativo', () => {
    expect(SO.turma(ME('going'), [])).toMatchObject({ kind: 'quiet', total: 1, met: 0 });
    expect(SO.turma(ME('met'), [L('paused'), L('unknown'), L('away', 5)])).toMatchObject({ kind: 'quiet', met: 1 });
  });
  it('turma: ninguém bateu, alguns bateram, todos bateram', () => {
    expect(SO.turma(ME('going'), [L('going'), L('idle')])).toMatchObject({ kind: 'none', met: 0, total: 3 });
    const some = SO.turma(ME('met'), [L('going'), L('met')]);
    expect(some).toMatchObject({ kind: 'some', met: 2, total: 3 });
    expect(some.text).toBe('2 de 3 já bateram a meta hoje');
    expect(some.sub).toBe('Só falta 1 pessoa para a turma completa!');
    expect(SO.turma(ME('met'), [L('met'), L('going'), L('going')])).toMatchObject({ met: 2, total: 4, text: '2 de 4 já bateram a meta hoje', sub: 'Falta pouco para a turma completa!' });
    expect(SO.turma(ME('met'), [L('going'), L('going'), L('going')])).toMatchObject({ met: 1, total: 4, text: '1 de 4 já bateu a meta hoje' }); // singular
    expect(SO.turma(ME('met'), [L('met')])).toMatchObject({ kind: 'all', met: 2, total: 2, text: 'Turma completa!' });
  });
  it('turma: amigos em pausa ou sumidos não entram na conta nem "puxam para baixo"', () => {
    expect(SO.turma(ME('met'), [L('met'), L('paused'), L('away', 10), L('unknown')]).kind).toBe('all');
    expect(SO.turma(ME('met'), [L('met'), L('away', 3)])).toMatchObject({ kind: 'some', total: 3 }); // 3 dias ainda conta
  });
  it('nenhum texto do recurso é negativo, compara pessoas ou cita nomes', () => {
    const texts = [];
    ['met', 'going', 'idle', 'paused', 'away', 'unknown'].forEach((k) => { [0, 1, 2, 9, 40].forEach((a) => texts.push(SO.statusText({ kind: k, pct: 33, st: 0, away: a }))); });
    [['going', []], ['met', []], ['going', ['going']], ['met', ['going']], ['met', ['met']], ['going', ['met', 'met', 'going']]].forEach((c) => {
      const t = SO.turma(ME(c[0]), c[1].map((k) => L(k)));
      texts.push(t.text, t.sub);
    });
    Object.keys(SO.WAVE_TEXT).forEach((k) => texts.push(SO.WAVE_TEXT[k]));
    // a turma tem ranking (1.2.0), mas ninguém é "o último": os textos nunca humilham nem comparam de forma negativa
    const members = [SO.myMember(state({ days: { [T]: dayWith(500) } }), T), SO.memberOf(SO.cleanFriend(BRU, { v: 1, nm: 'Bruno', mc: 'polvo', ins: [], pct: 10, met: false, st: 0, day: T, sh: true, wm: 3 }, null, ANA), T)];
    texts.push(SO.turmaWeek(members).text, SO.turmaWeek(members).sub, SO.turmaWeek([members[0]]).text, SO.turmaStreak(members).text, SO.turmaStreak(members).sub,
      SO.turmaStreak([members[0]]).text, SO.joinedText([{ nm: 'Ana' }]), SO.joinedText([{ nm: 'Ana' }, { nm: 'Bia' }]), SO.joinedText([{ nm: 'Ana' }, { nm: 'Bia' }, { nm: 'Caio' }, { nm: 'Duda' }]));
    // "nos últimos 7 dias" é só o calendário; o que não pode existir é alguém ser "o último"
    const ruins = /perd|pior|(^|\s)(o|a|em|ser|ficar|ficou) [uú]ltim[oa](?![a-zà-ú])|atrás|atras|falh|fracass|culpa|vergonha|devendo|devedor|vencedor|campe|derrot|lanterna|preguiç|preguic/i;
    texts.forEach((t) => { expect(t).not.toMatch(ruins); });
    expect(texts.every((t) => typeof t === 'string')).toBe(true);
  });
});

describe('turma única: a semana, o ranking e o pódio (1.2.0)', () => {
  const D = (n) => C.addDays(T, -n); // n dias antes de "hoje"
  const prof = (o) => Object.assign({ v: 1, nm: 'Bruno', mc: 'polvo', ins: [], pct: 0, met: false, st: 0, day: T, sh: true, gl: null, wm: 0 }, o);
  let seq = 0;
  // um amigo como a camada de nuvem entrega e a tela usa (memberOf); name vira o uid, então cada um é único
  const mk = (name, o) => SO.memberOf(SO.cleanFriend(U(name.toLowerCase() + (seq++)), prof(Object.assign({ nm: name }, o)), null, ANA), T);
  const names = (list) => list.map((it) => (it.m ? it.m.nm : it.nm));

  describe('o que vai para a nuvem: meta em ml e os 7 dias', () => {
    it('a meta em ml (gl) só sai com um "sim" de verdade: sem escolha, "não" ou progresso em pausa, vai null', () => {
      const days = { [T]: dayWith(1234, 2345) };
      [undefined, null, false, 0, 'true', 1].forEach((g) => {
        expect(SO.profilePayload(state({ days: days, social: { goal: g } }), T).gl, 'goal ' + JSON.stringify(g)).toBeNull();
      });
      expect(SO.profilePayload(state({ days: days, goal: 2345, social: { goal: true } }), T).gl).toBe(2345);
      expect(SO.profilePayload(state({ days: days, goal: 2345, social: { goal: true, share: false } }), T).gl).toBeNull(); // em pausa, nada do progresso sai
    });
    it('a meta que sai é a do dia (a mesma da tela), arredondada e dentro do teto', () => {
      expect(SO.profilePayload(state({ days: { [T]: dayWith(100, 3000) }, social: { goal: true } }), T).gl).toBe(3000);
      expect(SO.profilePayload(state({ days: {}, goal: 2500, social: { goal: true } }), T).gl).toBe(2500); // sem registro do dia: a das configurações
      const huge = state({ days: { [T]: { goal: 99999, entries: [] } }, social: { goal: true } });
      expect(SO.profilePayload(huge, T).gl).toBe(SO.GOAL_MAX);
    });
    it('mesmo com a meta liberada, o que foi bebido nunca sai (nem os litros, nem os horários)', () => {
      const S = state({ days: { [T]: dayWith(1234, 2345) }, goal: 2345, social: { goal: true } });
      const json = JSON.stringify(SO.profilePayload(S, T));
      expect(json).toContain('2345');
      ['1234', '"ml"', 'entries', 'weight', 'wake'].forEach((x) => { expect(json).not.toContain(x); });
    });
    it('wm: um bit por dia (bit 0 = o dia do perfil) para os últimos 7 dias; o oitavo dia e os dias sem meta ficam de fora', () => {
      const days = { [T]: dayWith(2000), [D(2)]: dayWith(2500), [D(6)]: dayWith(2000), [D(7)]: dayWith(3000), [D(3)]: dayWith(1999) };
      const p = SO.profilePayload(state({ days: days }), T);
      expect(p.wm).toBe(1 + 4 + 64); // hoje, anteontem e há 6 dias; D(3) não bateu e D(7) já saiu da janela
      expect(SO.weekMask(state({ days: {} }), T)).toBe(0);
      const all = {}; for (let i = 0; i < 9; i++) all[D(i)] = dayWith(2000);
      expect(SO.weekMask(state({ days: all }), T)).toBe(127);
    });
    it('progresso em pausa: sem máscara (wm null) e sem meta (gl null)', () => {
      const p = SO.profilePayload(state({ days: { [T]: dayWith(2000) }, social: { share: false, goal: true } }), T);
      expect(p).toMatchObject({ sh: false, wm: null, gl: null, pct: null });
    });
    it('samePayload percebe mudança na meta e na semana (senão o perfil novo não seria enviado)', () => {
      const a = SO.profilePayload(state({ days: { [T]: dayWith(500) }, social: { goal: true } }), T);
      expect(SO.samePayload(a, Object.assign({}, a))).toBe(true);
      expect(SO.samePayload(a, Object.assign({}, a, { gl: 3000 }))).toBe(false);
      expect(SO.samePayload(a, Object.assign({}, a, { gl: null }))).toBe(false);
      expect(SO.samePayload(a, Object.assign({}, a, { wm: 3 }))).toBe(false);
    });
  });

  describe('o que chega da nuvem: gl e wm', () => {
    const clean = (o) => SO.cleanFriend(BRU, prof(o), null, ANA);
    it('meta: de 100 a 10000 ml vale; fora disso, ou lixo, é como se a pessoa não mostrasse', () => {
      expect(clean({ gl: 2500 }).gl).toBe(2500);
      expect(clean({ gl: 2500.7 }).gl).toBe(2500);
      expect(clean({ gl: 99999 }).gl).toBe(SO.GOAL_MAX);
      [null, undefined, '', 0, 99, -50, 'abc', NaN, {}, []].forEach((v) => { expect(clean({ gl: v }).gl, 'gl ' + JSON.stringify(v)).toBeNull(); });
    });
    it('semana: máscara de 0 a 127; sem ela, nada (versão antiga do app)', () => {
      expect(clean({ wm: 5 }).wm).toBe(5);
      expect(clean({ wm: 999 }).wm).toBe(127);
      expect(clean({ wm: -4 }).wm).toBe(0);
      expect(clean({ wm: null }).wm).toBeNull();
      expect(clean({ wm: undefined }).wm).toBeNull();
    });
    it('a cópia guardada no aparelho leva os dois campos (e volta igual)', () => {
      const f = clean({ gl: 2800, wm: 21 });
      const st = SO.cleanState({ uid: ANA, code: '', at: 1, friends: [f], reqIn: [], reqOut: [] });
      expect(st.friends[0]).toMatchObject({ gl: 2800, wm: 21 });
      expect(SO.profileOfCached(f)).toMatchObject({ gl: 2800, wm: 21 });
    });
  });

  describe('weekOf: os 7 dias vistos do dia de quem olha', () => {
    it('perfil de hoje: o bit i é o dia (hoje − i)', () => {
      const w = SO.weekOf({ day: T, wm: 0b0000101, sh: true }, T);
      expect(w).toMatchObject({ known: true, n: 2 });
      expect(w.days).toEqual([true, false, true, false, false, false, false]);
    });
    it('quem não abre o app há alguns dias: a janela anda e os dias sem registro contam como não batidos', () => {
      const w1 = SO.weekOf({ day: D(1), wm: 0b0000101, sh: true }, T); // ontem batida (bit 0) e anteontem... não: bit 2 = há 3 dias
      expect(w1.days).toEqual([false, true, false, true, false, false, false]);
      expect(w1.n).toBe(2);
      const w3 = SO.weekOf({ day: D(3), wm: 0b1111111, sh: true }, T);
      expect(w3.days).toEqual([false, false, false, true, true, true, true]); // só cabem 4 dos 7 dias dele na janela de quem olha
      expect(w3.n).toBe(4);
      expect(SO.weekOf({ day: D(6), wm: 0b1111111, sh: true }, T).days).toEqual([false, false, false, false, false, false, true]);
    });
    it('ausente há 7 dias ou mais: semana conhecida, mas vazia', () => {
      expect(SO.weekOf({ day: D(7), wm: 0b1111111, sh: true }, T)).toMatchObject({ known: true, n: 0 });
      expect(SO.weekOf({ day: D(40), wm: 127, sh: true }, T)).toMatchObject({ known: true, n: 0 });
    });
    it('fuso à frente (o dia dele é amanhã para mim) conta como hoje', () => {
      expect(SO.weekOf({ day: C.addDays(T, 1), wm: 1, sh: true }, T).days[0]).toBe(true);
    });
    it('sem como saber: sem máscara, em pausa, sem dia ou com um dia que ainda nem chegou', () => {
      [{ day: T, wm: null, sh: true }, { day: T, wm: undefined, sh: true }, { day: T, wm: 5, sh: false }, { wm: 5, sh: true }, { day: '', wm: 5, sh: true },
        { day: C.addDays(T, 3), wm: 5, sh: true }, null, undefined].forEach((p) => {
        expect(SO.weekOf(p, T), JSON.stringify(p)).toMatchObject({ known: false, n: 0 });
      });
    });
    it('máscara hostil (maior que 127) é cortada nos 7 bits', () => {
      expect(SO.weekOf({ day: T, wm: 100000, sh: true }, T).n).toBeLessThanOrEqual(7);
      expect(SO.weekOf({ day: T, wm: 255, sh: true }, T).n).toBe(7);
    });
  });

  describe('memberOf e myMember', () => {
    it('memberOf junta o estado de hoje, a semana e a meta do amigo', () => {
      const m = mk('Ana', { pct: 40, st: 3, gl: 2500, wm: 3 });
      expect(m).toMatchObject({ nm: 'Ana', me: false, gl: 2500 });
      expect(m.live).toMatchObject({ kind: 'going', pct: 40, st: 3 });
      expect(m.week).toMatchObject({ known: true, n: 2 });
    });
    it('myMember usa os meus dados mesmo com o progresso em pausa para os amigos (e minha meta aparece só para mim)', () => {
      const S = state({ days: { [T]: dayWith(1000, 2000), [D(1)]: dayWith(2000) }, social: { share: false, goal: null, nick: 'Chris' } });
      const me = SO.myMember(S, T);
      expect(me).toMatchObject({ me: true, nm: 'Chris', gl: 2000 });
      expect(me.live).toMatchObject({ kind: 'going', pct: 50 });
      expect(me.week).toMatchObject({ known: true, n: 1 }); // só ontem (hoje ainda não bateu)
      expect(S.social.share).toBe(false); // não mexe no estado que recebeu
      expect(S.social.goal).toBeNull();
    });
  });

  describe('rankBoard', () => {
    const board = (list, by) => SO.rankBoard(list, by);
    it('Hoje: do maior para o menor % (quem bateu a meta vale 100); empate divide a posição (1, 1, 3)', () => {
      const a = mk('Ana', { pct: 80 }), b = mk('Bia', { pct: 80 }), c = mk('Caio', { pct: 20 }), d = mk('Duda', { met: true, pct: 100 });
      const r = board([c, a, d, b], 'day');
      expect(names(r.ranked)).toEqual(['Duda', 'Ana', 'Bia', 'Caio']);
      expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
      expect(r.ranked.map((x) => x.v)).toEqual([100, 80, 80, 20]);
      expect(r.rest).toEqual([]);
    });
    it('Hoje: empate no % desempata pela sequência, depois pela semana e por fim pelo nome; a posição continua dividida', () => {
      const a = mk('Ana', { pct: 50, st: 2, wm: 1 }), b = mk('Bia', { pct: 50, st: 5, wm: 1 }), c = mk('Caio', { pct: 50, st: 5, wm: 7 }), d = mk('Alice', { pct: 50, st: 5, wm: 7 });
      const r = board([a, b, c, d], 'day');
      expect(names(r.ranked)).toEqual(['Alice', 'Caio', 'Bia', 'Ana']);
      expect(r.ranked.map((x) => x.rank)).toEqual([1, 1, 1, 1]);
    });
    it('Hoje: quem ainda não apareceu hoje, está em pausa ou não publicou perfil fica fora da conta, em ordem alfabética (nunca "em último")', () => {
      const ok = mk('Ana', { pct: 10 }), away = mk('Zeca', { day: D(2), pct: 90 }), pause = mk('Bia', { sh: false, pct: null }), none = mk('Caio', { day: '' });
      const r = board([away, ok, pause, none], 'day');
      expect(names(r.ranked)).toEqual(['Ana']);
      expect(names(r.rest)).toEqual(['Bia', 'Caio', 'Zeca']);
    });
    it('Hoje: quem abriu o app mas ainda não registrou (0%) entra na conta', () => {
      const idle = mk('Ana', { pct: 0 }), going = mk('Bia', { pct: 5 });
      const r = board([idle, going], 'day');
      expect(names(r.ranked)).toEqual(['Bia', 'Ana']);
      expect(r.ranked[1]).toMatchObject({ rank: 2, v: 0 });
    });
    it('Semana: pelo número de dias na meta nos últimos 7; quem não tem a semana conhecida fica à parte', () => {
      const a = mk('Ana', { wm: 0b1111111 }), b = mk('Bia', { wm: 0b0000111 }), c = mk('Caio', { wm: 0b0000101 }), old = mk('Velho', { wm: null }), pause = mk('Pausa', { sh: false, wm: null });
      const r = board([c, old, a, pause, b], 'week');
      expect(names(r.ranked)).toEqual(['Ana', 'Bia', 'Caio']);
      expect(r.ranked.map((x) => x.v)).toEqual([7, 3, 2]);
      expect(names(r.rest)).toEqual(['Pausa', 'Velho']);
    });
    it('Semana: quem sumiu há dias perde os dias que saíram da janela, não a conta inteira', () => {
      const gone = mk('Ana', { day: D(4), wm: 0b1111111 }), here = mk('Bia', { wm: 0b0000011 });
      const r = board([gone, here], 'week');
      expect(r.ranked.map((x) => [x.m.nm, x.v])).toEqual([['Ana', 3], ['Bia', 2]]);
    });
    it('Sequência: pelos dias seguidos na meta; sequência só vale se a pessoa apareceu hoje ou ontem', () => {
      const a = mk('Ana', { st: 12 }), b = mk('Bia', { st: 3 }), c = mk('Caio', { st: 30, day: D(2) }), d = mk('Duda', { st: 0 });
      const r = board([b, c, d, a], 'streak');
      expect(r.ranked.map((x) => [x.m.nm, x.v])).toEqual([['Ana', 12], ['Bia', 3], ['Caio', 0], ['Duda', 0]]); // Caio sumiu há 2 dias: a sequência dele acabou
      expect(r.ranked.map((x) => x.rank)).toEqual([1, 2, 3, 3]);
    });
    it('quem mostra o progresso em pausa ou não tem perfil sai da Sequência também', () => {
      const r = board([mk('Ana', { st: 4 }), mk('Pausa', { sh: false }), mk('Novo', { day: '' })], 'streak');
      expect(names(r.ranked)).toEqual(['Ana']);
      expect(names(r.rest)).toEqual(['Novo', 'Pausa']);
    });
    it('visão desconhecida vale "Hoje"; rankId aceita só as três visões', () => {
      expect(board([mk('Ana', { pct: 5 })], 'xyz').by).toBe('day');
      expect(board([], undefined).by).toBe('day');
      ['day', 'week', 'streak'].forEach((v) => { expect(SO.rankId(v)).toBe(v); });
      ['', null, undefined, 'Hoje', 'WEEK', {}, 3].forEach((v) => { expect(SO.rankId(v)).toBe('day'); });
      expect(SO.RANKS.map((r) => r.id)).toEqual(['day', 'week', 'streak']);
    });
    it('é uma partição estável: todo mundo aparece uma vez, a ordem não depende da ordem de chegada, e a entrada não é alterada', () => {
      const list = [];
      for (let i = 0; i < 40; i++) list.push(mk('P' + (i % 7), { pct: (i * 37) % 101, st: (i * 11) % 9, wm: (i * 13) % 128, day: i % 9 === 0 ? D(3) : T, sh: i % 11 !== 0, met: i % 5 === 0 }));
      ['day', 'week', 'streak'].forEach((by) => {
        const copy = list.slice(), r1 = board(list, by), r2 = board(list.slice().reverse(), by);
        expect(list).toEqual(copy);
        const all = r1.ranked.map((x) => x.m).concat(r1.rest);
        expect(all).toHaveLength(list.length);
        expect(new Set(all.map((m) => m.uid)).size).toBe(list.length);
        expect(r1.ranked.map((x) => x.m.uid)).toEqual(r2.ranked.map((x) => x.m.uid));
        expect(r1.rest.map((m) => m.uid)).toEqual(r2.rest.map((m) => m.uid));
        r1.ranked.forEach((x, i) => {
          expect(x.rank).toBe(1 + r1.ranked.filter((y) => y.v > x.v).length); // a posição é 1 + quantos estão estritamente melhores
          if (i) expect(r1.ranked[i - 1].v).toBeGreaterThanOrEqual(x.v);
        });
      });
    });
    it('eu apareço na conta em qualquer visão, mesmo com o progresso em pausa para os amigos', () => {
      const me = SO.myMember(state({ days: { [T]: dayWith(500) }, social: { share: false } }), T);
      ['day', 'week', 'streak'].forEach((by) => {
        expect(board([me, mk('Ana', { pct: 30 })], by).ranked.map((x) => x.m.me)).toContain(true);
      });
    });
  });

  describe('podium', () => {
    const items = (vs) => { let rank = 0, prev = -1; return vs.map((v, i) => { if (v !== prev) rank = i + 1; prev = v; return { m: { nm: 'P' + i }, rank: rank, v: v }; }); };
    it('precisa de pelo menos três pessoas, as três com algo a mostrar', () => {
      expect(SO.podium(items([]))).toBeNull();
      expect(SO.podium(items([50, 40]))).toBeNull();
      expect(SO.podium(items([50, 40, 0]))).toBeNull(); // um pódio com zero não anima ninguém
      expect(SO.podium(items([0, 0, 0]))).toBeNull();
      expect(SO.podium(items([50, 40, 1]))).not.toBeNull();
    });
    it('posições diferentes: 2º, 1º e 3º (o primeiro no meio)', () => {
      expect(SO.podium(items([90, 70, 50, 30])).map((x) => x.rank)).toEqual([2, 1, 3]);
      expect(SO.podium(items([90, 70, 50, 30])).map((x) => x.m.nm)).toEqual(['P1', 'P0', 'P2']);
    });
    it('com empate entre os três primeiros, vale a ordem da lista (sem trocar quem é "o do meio")', () => {
      expect(SO.podium(items([80, 80, 50])).map((x) => x.m.nm)).toEqual(['P0', 'P1', 'P2']);
      expect(SO.podium(items([80, 60, 60])).map((x) => x.m.nm)).toEqual(['P0', 'P1', 'P2']);
      expect(SO.podium(items([70, 70, 70, 70])).map((x) => x.m.nm)).toEqual(['P0', 'P1', 'P2']);
    });
    it('só mostra três, não importa quantos sejam', () => {
      expect(SO.podium(items([9, 8, 7, 6, 5, 4, 3]))).toHaveLength(3);
    });
  });

  describe('resumos da turma', () => {
    const me = (o) => SO.myMember(state(Object.assign({ days: {} }, o)), T);
    it('semana: ninguém mais conhecido = quieta; ninguém bateu = semana nova; todo mundo todo dia = perfeita; senão conta as vezes', () => {
      expect(SO.turmaWeek([me()])).toMatchObject({ kind: 'quiet' });
      expect(SO.turmaWeek([me(), mk('Ana', { wm: null })])).toMatchObject({ kind: 'quiet' }); // a semana dela é desconhecida
      expect(SO.turmaWeek([me(), mk('Ana', { wm: 0 })])).toMatchObject({ kind: 'none', met: 0, total: 14 });
      const days = {}; for (let i = 0; i < 7; i++) days[D(i)] = dayWith(2000);
      expect(SO.turmaWeek([me({ days: days }), mk('Ana', { wm: 127 })])).toMatchObject({ kind: 'all', met: 14, total: 14, text: 'Semana perfeita!' });
      const some = SO.turmaWeek([me(), mk('Ana', { wm: 0b11 }), mk('Bia', { wm: 0b1 })]);
      expect(some).toMatchObject({ kind: 'some', met: 3, total: 21 });
      expect(some.text).toBe('A turma bateu a meta 3 vezes');
      expect(SO.turmaWeek([me(), mk('Ana', { wm: 0b1 })]).text).toBe('A turma bateu a meta 1 vez'); // singular
    });
    it('sequência: a maior entre quem mostra o progresso', () => {
      expect(SO.turmaStreak([me()])).toMatchObject({ kind: 'quiet' });
      expect(SO.turmaStreak([me(), mk('Ana', { st: 0 })])).toMatchObject({ kind: 'none' });
      expect(SO.turmaStreak([me(), mk('Ana', { st: 12 }), mk('Bia', { st: 3 })])).toMatchObject({ kind: 'some', text: 'A maior sequência da turma: 12 dias' });
      expect(SO.turmaStreak([me(), mk('Ana', { st: 1 })]).text).toBe('A maior sequência da turma: 1 dia');
      expect(SO.turmaStreak([me(), mk('Ana', { st: 40, sh: false })])).toMatchObject({ kind: 'quiet' }); // quem está em pausa não conta nem como "conhecido"
    });
    it('joinedText: um, dois e vários nomes', () => {
      const L = (...n) => n.map((x) => ({ nm: x }));
      expect(SO.joinedText(L('Ana'))).toBe('Ana entrou na turma');
      expect(SO.joinedText(L('Ana', 'Bia'))).toBe('Ana e Bia entraram na turma');
      expect(SO.joinedText(L('Ana', 'Bia', 'Caio'))).toBe('Ana, Bia e mais 1 pessoa entraram na turma');
      expect(SO.joinedText(L('Ana', 'Bia', 'Caio', 'Duda', 'Edu'))).toBe('Ana, Bia e mais 3 pessoas entraram na turma');
    });
  });

  describe('arrivals: gente nova na turma', () => {
    const fr = (uid) => ({ uid: uid, nm: 'x' }), rq = (uid) => ({ uid: uid, nm: 'x' });
    it('quem chegou depois do estado anterior entra em "joined"; quem aceitou um pedido meu fica só em "accepted"', () => {
      const prev = { at: 5, friends: [fr(ANA)], reqIn: [], reqOut: [rq(BRU)] };
      const next = { at: 6, friends: [fr(ANA), fr(BRU), fr(CAI)], reqIn: [], reqOut: [] };
      const a = SO.arrivals(prev, next);
      expect(a.accepted.map((x) => x.uid)).toEqual([BRU]);
      expect(a.joined.map((x) => x.uid)).toEqual([CAI]);
    });
    it('sem estado anterior de verdade (aparelho novo, cópia vazia): a lista inteira não é novidade', () => {
      const next = { friends: [fr(ANA), fr(BRU)], reqIn: [], reqOut: [] };
      expect(SO.arrivals(null, next).joined).toEqual([]);
      expect(SO.arrivals({ at: 0, friends: [], reqIn: [], reqOut: [] }, next).joined).toEqual([]);
      expect(SO.arrivals(undefined, next).joined).toEqual([]);
    });
    it('quem já era amigo não é novidade, e quem saiu não aparece', () => {
      const prev = { at: 5, friends: [fr(ANA), fr(BRU)], reqIn: [], reqOut: [] };
      expect(SO.arrivals(prev, { at: 6, friends: [fr(ANA), fr(BRU)], reqIn: [], reqOut: [] }).joined).toEqual([]);
      expect(SO.arrivals(prev, { at: 6, friends: [fr(ANA)], reqIn: [], reqOut: [] }).joined).toEqual([]);
    });
  });
});

describe('acenos', () => {
  const f = (o) => Object.assign({ pct: 10, met: false, st: 0, day: T, sh: true, mine: null, theirs: null }, o);
  it('quem bateu a meta recebe parabéns; os outros, um oi', () => {
    expect(SO.waveFor(f({ met: true }), T).kind).toBe('cheer');
    expect(SO.waveFor(f(), T).kind).toBe('hi');
    expect(SO.waveFor(f({ sh: false }), T).kind).toBe('hi'); // em pausa: não dá para saber, então só um oi
    expect(SO.waveFor(f({ day: '2026-10-10' }), T).kind).toBe('hi');
  });
  it('um aceno por amigo por dia: done depois que eu acenei hoje', () => {
    expect(SO.waveFor(f(), T).done).toBe(false);
    expect(SO.waveFor(f({ mine: { k: 'hi', d: T } }), T).done).toBe(true);
    expect(SO.waveFor(f({ mine: { k: 'hi', d: '2026-10-17' } }), T).done).toBe(false);
    expect(SO.waveFor(f({ mine: { k: 'hi', d: '2026-10-19' } }), T).done).toBe(true); // fuso à frente
  });
  it('waveIn: o aceno dele de hoje ou de ontem; mais antigo, não', () => {
    expect(SO.waveIn(f({ theirs: { k: 'hi', d: T } }), T)).toEqual({ k: 'hi', d: T });
    expect(SO.waveIn(f({ theirs: { k: 'cheer', d: '2026-10-17' } }), T)).toEqual({ k: 'cheer', d: '2026-10-17' });
    expect(SO.waveIn(f({ theirs: { k: 'hi', d: '2026-10-16' } }), T)).toBeNull();
    expect(SO.waveIn(f(), T)).toBeNull();
  });
  it('um dia que ainda nem chegou (2 dias ou mais à frente: nem o fuso explica) não vale como "hoje": nem aceno meu, nem dele, nem o dia do perfil', () => {
    // T = 2026-10-18. Um dia à frente é só o fuso (vale como hoje); passou de 2 dias é dado inventado ou relógio errado.
    expect(SO.waveFor(f({ mine: { k: 'hi', d: '2026-10-20' } }), T).done).toBe(true); // 2 dias à frente ainda cabe no fuso
    expect(SO.waveFor(f({ mine: { k: 'hi', d: '2026-10-21' } }), T).done).toBe(false); // 3 dias: não
    expect(SO.waveFor(f({ mine: { k: 'hi', d: '9999-12-31' } }), T).done).toBe(false); // e o botão não fica trancado "para sempre"
    expect(SO.waveIn(f({ theirs: { k: 'hi', d: '2026-10-20' } }), T)).toEqual({ k: 'hi', d: '2026-10-20' });
    expect(SO.waveIn(f({ theirs: { k: 'cheer', d: '2026-10-21' } }), T)).toBeNull();
    expect(SO.waveIn(f({ theirs: { k: 'cheer', d: '9999-12-31' } }), T)).toBeNull(); // nem fica "novo" para sempre na aba
    expect(SO.unseenWaves([Object.assign({ uid: BRU }, f({ theirs: { k: 'hi', d: '9999-12-31' } }))], {}, T)).toEqual([]);
    expect(SO.liveOf({ day: '2026-10-20', pct: 30, met: false, st: 2, sh: true }, T)).toMatchObject({ kind: 'going', pct: 30 }); // 2 dias à frente: ainda "hoje"
    expect(SO.liveOf({ day: '2026-10-21', pct: 30, met: false, st: 2, sh: true }, T).kind).toBe('unknown');
    expect(SO.liveOf({ day: '9999-12-31', pct: 100, met: true, st: 9999, sh: true }, T)).toEqual({ kind: 'unknown', pct: 0, st: 0, away: 99 });
    expect(SO.seenWaves([Object.assign({ uid: BRU }, f({ theirs: { k: 'hi', d: '9999-12-31' } }))], T)).toEqual({});
  });
  it('os tipos de aceno combinam com os das regras do servidor', () => {
    expect(SO.WAVE_KINDS).toEqual(['hi', 'cheer']);
    expect(Object.keys(SO.WAVE_TEXT).sort()).toEqual(['cheer', 'hi']);
  });
});

describe('cópia guardada no aparelho (cleanState)', () => {
  it('lixo vira estado vazio', () => {
    [null, undefined, 5, 'x', [], {}].forEach((r) => {
      expect(SO.cleanState(r)).toEqual({ uid: '', code: '', friends: [], reqIn: [], reqOut: [], at: 0 });
    });
  });
  it('ida e volta: o que foi guardado volta igual', () => {
    const f = SO.cleanFriend(BRU, { nm: 'Bruno', mc: 'polvo', ins: ['concha', 'polvo'], pct: 40, met: false, st: 3, day: T, sh: true },
      { m: [ANA, BRU], by: ANA, st: 'active', nm: 'Ana', mc: 'cavalo', tn: 'Bruno', tc: 'polvo', ok: 2000, w: { [ANA]: { k: 'hi', d: T }, [BRU]: { k: 'cheer', d: T } } }, ANA);
    const raw = { code: 'ABCDEFGH', at: 77, friends: [f], reqIn: [{ uid: CAI, nm: 'Caio', mc: 'baleia', at: 9 }], reqOut: [{ uid: BRU, nm: 'Bruno', mc: 'polvo', at: 8 }] };
    const back = SO.cleanState(JSON.parse(JSON.stringify(raw)));
    expect(back.code).toBe('ABCDEFGH');
    expect(back.at).toBe(77);
    expect(back.friends).toHaveLength(1);
    expect(back.friends[0]).toMatchObject({ uid: BRU, nm: 'Bruno', mc: 'polvo', pct: 40, st: 3, since: 2000, mine: { k: 'hi', d: T }, theirs: { k: 'cheer', d: T } });
    expect(back.reqIn[0]).toEqual({ uid: CAI, mine: false, nm: 'Caio', mc: 'baleia', at: 9 });
    expect(back.reqOut[0]).toEqual({ uid: BRU, mine: true, nm: 'Bruno', mc: 'polvo', at: 8 });
  });
  it('uid: guarda só um uid de verdade (a camada de nuvem compara com a conta de agora)', () => {
    expect(SO.cleanState({ uid: ANA }).uid).toBe(ANA);
    ['', 'curto', 5, null, { x: 1 }, 'a/b' + 'x'.repeat(20), 'x'.repeat(65)].forEach((u) => { expect(SO.cleanState({ uid: u, code: 'ABCDEFGH' }).uid).toBe(''); });
    expect(SO.cleanState({ code: 'ABCDEFGH' }).uid).toBe(''); // cópia sem dono (de antes): nunca é "da conta de agora"
  });
  it('itens ruins são descartados, o resto fica; listas gigantes são cortadas', () => {
    const raw = { code: 'curto', friends: [null, 5, { uid: 'x' }, { uid: BRU, nm: 'Bruno' }], reqIn: [{ uid: 'x' }, null, { uid: CAI, nm: '<b>' }], reqOut: 'não é lista' };
    const s = SO.cleanState(raw);
    expect(s.code).toBe('');
    expect(s.friends.map((x) => x.uid)).toEqual([BRU]);
    expect(s.reqIn.map((x) => x.uid)).toEqual([CAI]);
    expect(s.reqIn[0].nm).not.toMatch(/[<>]/);
    expect(s.reqOut).toEqual([]);
    const many = { friends: Array.from({ length: 200 }, (_, i) => ({ uid: U('f' + i), nm: 'F' + i })) };
    expect(SO.cleanState(many).friends).toHaveLength(SO.MAX_FRIENDS);
  });
});

describe('peças da interface', () => {
  it('myLive: meu estado real, mesmo com o progresso em pausa para os amigos', () => {
    const S = state({ days: { [T]: dayWith(1000) }, social: { share: false } });
    expect(SO.profilePayload(S, T)).toMatchObject({ pct: null, sh: false }); // o que sai do aparelho continua escondido
    expect(SO.myLive(S, T)).toMatchObject({ kind: 'going', pct: 50 });
    const met = state({ days: { [T]: dayWith(2000) }, social: { share: false } });
    expect(SO.myLive(met, T)).toMatchObject({ kind: 'met', pct: 100 });
    expect(SO.myLive(state({ days: {} }), T)).toMatchObject({ kind: 'idle', pct: 0 });
  });
  it('myLive não altera o estado que recebeu', () => {
    const S = state({ days: { [T]: dayWith(500) }, social: { share: false } });
    const before = JSON.stringify(S);
    SO.myLive(S, T);
    expect(JSON.stringify(S)).toBe(before);
  });
  it('ringOf: anel cheio para meta, proporcional para o dia em andamento e sem anel quando não há o que mostrar', () => {
    expect(SO.ringOf({ kind: 'met', pct: 100 })).toEqual({ pct: 100, cls: 'met' });
    expect(SO.ringOf({ kind: 'going', pct: 42 })).toEqual({ pct: 42, cls: 'go' });
    expect(SO.ringOf({ kind: 'going', pct: 100 }).pct).toBe(99); // 100% só com a meta batida
    expect(SO.ringOf({ kind: 'going', pct: 0 }).pct).toBe(1);
    expect(SO.ringOf({ kind: 'idle', pct: 0 })).toEqual({ pct: 0, cls: 'idle' });
    ['paused', 'away', 'unknown'].forEach((k) => { expect(SO.ringOf({ kind: k, pct: 50 })).toEqual({ pct: null, cls: 'off' }); });
  });
  it('firstNick: só o primeiro nome, limpo e curto', () => {
    expect(SO.firstNick('  Ana Souza ')).toBe('Ana');
    expect(SO.firstNick('')).toBe('');
    expect(SO.firstNick(null)).toBe('');
    expect(SO.firstNick('<b>Zé</b> Silva')).not.toMatch(/[<>]/);
    expect(Array.from(SO.firstNick('Maximiliano'.repeat(5))).length).toBeLessThanOrEqual(SO.NICK_MAX);
  });
  it('inviteText: convida sem expor nome nem dados; o código aparece formatado', () => {
    const t = SO.inviteText('ABCDEFGH');
    expect(t).toContain('ABCD-EFGH');
    expect(t).toMatch(/Maré/);
    expect(SO.inviteText('')).not.toMatch(/undefined|null|\(ou use/);
  });
  describe('acenos novos', () => {
    const f = (uid, theirs) => ({ uid: uid, theirs: theirs || null, mine: null });
    const fs = [f(ANA, { k: 'hi', d: T }), f(BRU, { k: 'cheer', d: '2026-10-17' }), f(CAI, { k: 'hi', d: '2026-10-10' }), f(U('dani'))];
    it('só conta o aceno de hoje ou de ontem que ainda não foi visto', () => {
      expect(SO.unseenWaves(fs, {}, T).map((x) => x.uid)).toEqual([ANA, BRU]);
      expect(SO.unseenWaves(fs, null, T).map((x) => x.uid)).toEqual([ANA, BRU]);
      expect(SO.unseenWaves(fs, { [ANA]: T + ':hi' }, T).map((x) => x.uid)).toEqual([BRU]);
    });
    it('abrir a aba marca tudo como visto; um aceno novo (outro dia ou outro tipo) volta a contar', () => {
      const seen = SO.seenWaves(fs, T);
      expect(seen).toEqual({ [ANA]: T + ':hi', [BRU]: '2026-10-17:cheer' });
      expect(SO.unseenWaves(fs, seen, T)).toEqual([]);
      const again = fs.map((x) => (x.uid === ANA ? f(ANA, { k: 'cheer', d: T }) : x));
      expect(SO.unseenWaves(again, seen, T).map((x) => x.uid)).toEqual([ANA]);
      const tomorrow = '2026-10-19';
      expect(SO.unseenWaves(fs, seen, tomorrow)).toEqual([]); // o aceno de ontem de ontem já saiu da janela
    });
    it('quem deixou de ser amigo sai do mapa de vistos', () => {
      expect(Object.keys(SO.seenWaves([fs[0]], T))).toEqual([ANA]);
    });
  });
  describe('arrivals', () => {
    const fr = (uid) => ({ uid: uid, nm: 'x' }), rq = (uid) => ({ uid: uid, nm: 'x' });
    it('quem aceitou um pedido meu aparece como novo amigo', () => {
      const prev = { friends: [], reqIn: [], reqOut: [rq(BRU), rq(CAI)] };
      const next = { friends: [fr(BRU)], reqIn: [], reqOut: [rq(CAI)] };
      expect(SO.arrivals(prev, next).accepted.map((x) => x.uid)).toEqual([BRU]);
    });
    it('quem já era amigo ou me pediu antes não é novidade; pedido novo é', () => {
      const prev = { friends: [fr(ANA)], reqIn: [rq(BRU)], reqOut: [] };
      const next = { friends: [fr(ANA)], reqIn: [rq(BRU), rq(CAI)], reqOut: [] };
      const a = SO.arrivals(prev, next);
      expect(a.accepted).toEqual([]);
      expect(a.requests.map((x) => x.uid)).toEqual([CAI]);
    });
    it('sem estado anterior (primeira vez): nada é "aceitou", mas todo pedido é novo', () => {
      const a = SO.arrivals(null, { friends: [fr(ANA)], reqIn: [rq(BRU)], reqOut: [] });
      expect(a.accepted).toEqual([]);
      expect(a.requests.map((x) => x.uid)).toEqual([BRU]);
    });
  });
  describe('mensagens de erro', () => {
    const src = readFileSync(new URL('../public/js/social-cloud.js', import.meta.url), 'utf8');
    const used = new Set(); let m;
    const re = /err\('([a-z]+)'/g;
    while ((m = re.exec(src))) used.add(m[1]);
    it('todo código de erro que a camada de nuvem lança tem uma mensagem amigável', () => {
      expect(used.size).toBeGreaterThan(8);
      used.forEach((c) => { expect(SO.ERR_CODES, 'sem mensagem para ' + c).toContain(c); });
      ['off', 'slow', 'unknown'].forEach((c) => { expect(SO.ERR_CODES).toContain(c); });
    });
    it('nenhuma mensagem vaza termo técnico e todas são frases completas', () => {
      SO.ERR_CODES.forEach((c) => {
        const t = SO.errText(c);
        expect(t, c).toMatch(/[.!)😄]$/);
        expect(t, c).not.toMatch(/firestore|firebase|permission|denied|uid|exception|undefined|null|regras do/i);
      });
      expect(SO.errText('algo-inesperado')).toBe(SO.errText('unknown'));
      expect(SO.errText(undefined)).toBe(SO.errText('unknown'));
    });
    it('o limite de amigos da mensagem acompanha MAX_FRIENDS', () => {
      expect(SO.errText('full')).toContain(String(SO.MAX_FRIENDS));
    });
  });
});
