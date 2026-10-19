// Maré — testes da lógica pura dos amigos (public/js/social.js). Rodar: npm test
// Além de conferir as contas, estes testes guardam os princípios do recurso: nada de ranking, nada de volumes saindo do aparelho,
// só texto positivo e nenhum dado vindo da nuvem chega à tela sem passar pela limpeza.
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
    expect(Object.keys(p).sort()).toEqual(['day', 'ins', 'mc', 'met', 'nm', 'pct', 'sh', 'st', 'v']);
    expect(p).toEqual({ v: 1, nm: 'Chris', mc: 'estrela', ins: ['concha', 'estrela'], pct: 61, met: false, st: 0, day: T, sh: true });
    expect(Number.isInteger(p.pct) && Number.isInteger(p.st)).toBe(true);
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
    expect(Object.keys(f).sort()).toEqual(['day', 'ins', 'mc', 'met', 'mine', 'nm', 'pct', 'sh', 'since', 'st', 'theirs', 'uid']); // nenhum horário de atividade do amigo
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

describe('sem competição: ordem neutra e textos sempre positivos', () => {
  it('a lista é alfabética (pt-BR, sem ligar para maiúsculas nem acentos), nunca por progresso', () => {
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
    const ruins = /perd|pior|último|ultimo|atrás|atras|falh|fracass|culpa|vergonha|devendo|devedor|ranking|vencedor|campe|derrot|lanterna|preguiç|preguic/i;
    texts.forEach((t) => { expect(t).not.toMatch(ruins); });
    expect(texts.every((t) => typeof t === 'string')).toBe(true);
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
