// Maré — testes da lógica pura da conta (public/js/account.js). Rodar: npm test
// Guardam o que importa na conta: e-mail e senha conferidos antes de ir ao servidor, mensagens que nunca mostram texto técnico (nos dois
// "dialetos" de erro do Firebase), e o backup dos ajustes: o que sai do aparelho (e o que NÃO sai), como volta e que nada vindo da nuvem
// entra no app sem passar pela limpeza.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as C from '../public/js/core.js';
import * as A from '../public/js/account.js';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const U = (n) => n + 'x'.repeat(28 - n.length);

// um app já usado: ajustes mexidos, registros, lembretes ligados, recados dispensados, amigos ligados
function used() {
  const S = C.defaults(1700000000000);
  S.onboarded = true;
  Object.assign(S.profile, { name: 'Marianne', weight: 61.5, activity: 'high', wake: '06:30', sleep: '22:45', unit: 'oz', theme: 'dark', others: false, mix: true, mascot: 'cavalo' });
  Object.assign(S.goal, { mode: 'manual', manual: 2300, climate: true, bonus: 300, temp: 34, day: '2026-10-22' });
  S.cups = [120, 200, 300, 450]; S.last = 'sparkling'; S.lastO = 'tea';
  Object.assign(S.reminders, { enabled: true, interval: 60, smart: false, nextAt: 1790000000000 });
  S.days = { '2026-10-20': { goal: 2300, u: 5, entries: [{ id: 'a', t: 1, ml: 250, d: 'water' }] } };
  S.insignias = { concha: 1, estrela: 2 };
  Object.assign(S.social, { on: true, nick: 'Mari', share: false, code: 'ABCD2345', push: false, goal: true, hit: true, week: false });
  S.ui = { tip_news12: 1, tip_news15: 1, tip_install: 1, invite: 'ZZZZ2222', crewAt: '2026-10-20', unseenIns: ['estrela'], wv: { x: 1 }, frRank: 'week' };
  return S;
}

// medalhas (1.7.0): o backup guarda o instante em que cada uma saiu, em MINUTOS. Três instantes de verdade, em dias e horas diferentes (o último,
// a um milissegundo de virar o minuto seguinte: o arredondamento tem de ser estável) e ids de medalhas reais do app.
const MIN = 6e4, at = (ms) => Math.round(ms / MIN);
const T1 = Date.UTC(2025, 8, 3, 15, 30, 12, 345), T2 = Date.UTC(2025, 9, 1, 12, 0, 0, 0), T3 = Date.UTC(2025, 9, 20, 23, 59, 59, 999); // em 2025: sempre no passado
function medalsUsed() { const S = used(); S.achievements = { first: T1, s7: T2, crew: T3 }; return S; }
// o app todo conquistado: as 30 medalhas, uma por dia (para medir o tamanho do pior caso)
function allMedals() { const S = used(); C.ACHIEVEMENTS.forEach((a, i) => { S.achievements[a.id] = Date.UTC(2025, 8, 1 + i, 9, 15 + (i % 40), 7, 123); }); return S; }

describe('e-mail', () => {
  it('cleanEmail tira espaços (até os invisíveis), põe em minúsculas e limita o tamanho', () => {
    expect(A.cleanEmail('  Ana.Paula@Gmail.COM \n')).toBe('ana.paula@gmail.com');
    expect(A.cleanEmail('a​n a@x.com﻿')).toBe('ana@x.com');
    expect(A.cleanEmail(null)).toBe('');
    expect(A.cleanEmail(undefined)).toBe('');
    expect(A.cleanEmail('a'.repeat(400) + '@x.com').length).toBe(A.EMAIL_MAX + 1);
  });
  it('aceita e-mails de verdade', () => {
    ['ana@gmail.com', 'ana.paula@gmail.com', 'ana+mare@gmail.com', 'a_b-c@sub.dominio.com.br', 'x@y.co', 'marianne123@outlook.com', "o'neil@x.org",
      'a@xn--80ak6aa92e.com', '1@2.io'].forEach((e) => expect(A.validEmail(e), e).toBe(true));
  });
  it('recusa o que não é e-mail', () => {
    ['', 'a', 'ana', 'ana@', '@gmail.com', 'ana@gmail', 'ana@gmail.', 'ana@.com', 'ana@@gmail.com', 'ana@gm@ail.com', 'a na@gmail.com',
      'ana@gmail.c', 'ana@-gmail.com', 'ana@gmail-.com', 'ana@gmail..com', '.ana@gmail.com', 'ana.@gmail.com', 'an..a@gmail.com', 'ana@gmail.com,bia@gmail.com',
      'ana@gmail.com;', '<ana@gmail.com>', 'ana@gmail.c0m', 'ana@gmail.123', 'a'.repeat(65) + '@gmail.com', 'a@' + 'b'.repeat(250) + '.com', null, undefined, 42, {}]
      .forEach((e) => expect(A.validEmail(e), String(e)).toBe(false));
  });
});

describe('senha', () => {
  it('pede de 8 a 128 caracteres e recusa as óbvias', () => {
    expect(A.passwordProblem('')).toMatch(/Digite/);
    expect(A.passwordProblem(undefined)).toMatch(/Digite/);
    expect(A.passwordProblem(12345678)).toMatch(/Digite/); // só texto
    expect(A.passwordProblem('1234567')).toMatch(/pelo menos 8/);
    expect(A.passwordProblem('x'.repeat(129))).toMatch(/no máximo 128/);
    expect(A.passwordProblem('        ')).toMatch(/só espaços/);
    expect(A.passwordProblem('12345678')).toMatch(/fácil de adivinhar/);
    expect(A.passwordProblem('Password')).toMatch(/fácil de adivinhar/); // sem diferenciar maiúsculas
    expect(A.passwordProblem('aaaaaaaa')).toMatch(/fácil de adivinhar/);
    expect(A.passwordProblem('zzzzzzzzzzzz')).toMatch(/fácil de adivinhar/);
    expect(A.passwordProblem('ana@gmail.com', 'Ana@Gmail.com')).toMatch(/igual ao e-mail/);
  });
  it('aceita senhas razoáveis, com espaço, acento e emoji', () => {
    ['cavalomarinho9', 'minha água 2026', 'Sênha-Forte!', 'ab'.repeat(64), 'abcdefg1', 'senha com espaços e 🐠'].forEach((p) => expect(A.passwordProblem(p), p).toBe(''));
  });
  it('a senha NUNCA é alterada: espaços nas pontas contam (quem digita assim, entra assim)', () => {
    expect(A.passwordProblem(' abcdefgh ')).toBe('');
    expect(A.signInProblem('a@b.co', ' x ')).toBe('');
  });
});

describe('formulários: o que se confere antes de falar com o servidor', () => {
  it('entrar', () => {
    expect(A.signInProblem('', 'x')).toMatch(/Digite o e-mail/);
    expect(A.signInProblem('ana', 'x')).toMatch(/não parece certo/);
    expect(A.signInProblem('ana@gmail.com', '')).toMatch(/Digite a senha/);
    expect(A.signInProblem('  ANA@gmail.com ', 'qualquer')).toBe('');
  });
  it('criar conta', () => {
    expect(A.createProblem('', 'abcdefgh1')).toMatch(/Digite o e-mail/);
    expect(A.createProblem('ana@', 'abcdefgh1')).toMatch(/não parece certo/);
    expect(A.createProblem('ana@gmail.com', 'curta')).toMatch(/pelo menos 8/);
    expect(A.createProblem('ana@gmail.com', 'cavalomarinho9')).toBe('');
  });
  it('esqueci a senha', () => {
    expect(A.resetProblem('')).toMatch(/Digite o e-mail/);
    expect(A.resetProblem('ana')).toMatch(/não parece certo/);
    expect(A.resetProblem(' Ana@gmail.com ')).toBe('');
  });
});

describe('mensagens do login', () => {
  it('as duas famílias de erro de senha errada dizem a MESMA frase, que não revela se o e-mail existe', () => {
    const same = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found', 'auth/invalid-password'].map(A.authText);
    expect(new Set(same).size).toBe(1);
    expect(same[0]).toMatch(/incorretos/);
    expect(same[0]).not.toMatch(/não existe|não encontr|cadastrad/i);
    ['auth/wrong-password', 'auth/invalid-credential', 'auth/user-not-found'].forEach((c) => expect(A.isBadLogin(c)).toBe(true));
    ['auth/too-many-requests', 'auth/network-request-failed', 'auth/email-already-in-use'].forEach((c) => expect(A.isBadLogin(c)).toBe(false));
  });
  it('toda mensagem é texto de gente: sem códigos, sem "Firebase", sem "auth/", terminando em ponto', () => {
    A.AUTH_CODES.forEach((c) => {
      const t = A.authText(c);
      expect(t.length, c).toBeGreaterThan(10);
      expect(t, c).not.toMatch(/auth\/|firebase|exception|undefined|\[object/i);
      expect(/[.!?]$/.test(t), c).toBe(true);
    });
  });
  it('código desconhecido, vazio ou estranho vira a mensagem padrão (nunca estoura)', () => {
    [undefined, null, '', 'auth/algo-novo', 42, {}, 'firestore/permission-denied'].forEach((c) => expect(typeof A.authText(c)).toBe('string'));
    expect(A.authText('auth/algo-novo')).toBe(A.authText('unknown'));
    expect(A.authText('firestore/permission-denied')).toBe(A.authText('permission-denied'));
  });
  it('cobre os erros que o Firebase de verdade devolve em criar conta, entrar, redefinir e excluir', () => {
    ['auth/email-already-in-use', 'auth/invalid-email', 'auth/weak-password', 'auth/missing-password', 'auth/user-disabled', 'auth/too-many-requests',
      'auth/network-request-failed', 'auth/requires-recent-login', 'auth/credential-already-in-use', 'auth/provider-already-linked',
      'auth/operation-not-allowed', 'auth/internal-error', 'auth/quota-exceeded', 'auth/user-token-expired'].forEach((c) => {
      expect(A.AUTH_CODES, c).toContain(c);
      expect(A.authText(c), c).not.toBe(A.authText('unknown'));
    });
  });
});

describe('mensagens da troca de conta e dos erros do próprio app', () => {
  // o app e o firebase.js lançam erros com códigos "mare/…": cada um que a pessoa pode ver precisa de uma frase em português. O "session-ended" não vira frase:
  // o app o trata como "sua conta saiu deste aparelho" (cartão e aviso próprios).
  const SRC = ['../public/js/app.js', '../public/js/firebase.js'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  it('todo código "mare/…" que o app ou o firebase.js lançam tem frase (menos o que vira o estado "conta que saiu")', () => {
    const used = Array.from(new Set((SRC.match(/mare\/[a-z][a-z-]*[a-z]/g) || []))).sort();
    expect(used.length).toBeGreaterThan(5);
    used.filter((c) => c !== 'mare/session-ended').forEach((c) => {
      expect(A.AUTH_CODES, c).toContain(c);
      expect(A.authText(c), c).not.toBe(A.authText('unknown'));
    });
    expect(A.AUTH_CODES).not.toContain('mare/session-ended');
  });
  it('a troca de conta explica o que aconteceu e o que fazer', () => {
    expect(A.authText('mare/leave-failed')).toMatch(/nada mudou/);
    expect(A.authText('mare/leave-failed')).toMatch(/turma/);
    expect(A.authText('mare/other-account')).toMatch(/outra conta/);
    expect(A.authText('mare/other-account')).toMatch(/Apagar tudo/); // o caminho: apagar o aparelho e entrar pela tela inicial
    expect(A.authText('mare/other-account')).toMatch(/Entrar na conta/);
    expect(A.authText('mare/pending')).toMatch(/nuvem/);
    expect(A.authText('mare/no-data')).toMatch(/internet/);
  });
  it('as duas chaves do aparelho são diferentes e estáveis (o firebase.js usa a mesma da marca de sincronização)', () => {
    expect(A.ACCT_KEY).toBe('mare:acct');
    expect(A.MARK_KEY).toBe('mare:cloud');
    expect(A.ACCT_KEY).not.toBe(A.MARK_KEY);
    expect(readFileSync(new URL('../public/js/firebase.js', import.meta.url), 'utf8')).toMatch(/const MARK = MARK_KEY;/); // a marca que o app apaga é a que o firebase.js lê
  });
});

describe('a dica local da conta (mare:acct)', () => {
  it('só vale com uid e e-mail certos', () => {
    expect(A.cleanAcct({ uid: U('ana'), email: 'Ana@Gmail.com', verified: true })).toEqual({ uid: U('ana'), email: 'ana@gmail.com', verified: true });
    expect(A.cleanAcct({ uid: U('ana'), email: 'ana@gmail.com' }).verified).toBe(false);
    expect(A.cleanAcct({ uid: U('ana'), email: 'ana@gmail.com', verified: 'sim' }).verified).toBe(false);
    [null, undefined, 5, 'x', {}, { uid: U('ana') }, { email: 'a@b.co' }, { uid: 'curto', email: 'a@b.co' }, { uid: U('ana'), email: 'sem-arroba' }, { uid: 'a/b'.repeat(5), email: 'a@b.co' }]
      .forEach((r) => expect(A.cleanAcct(r), JSON.stringify(r)).toBe(null));
  });
  it('emailShort encurta só e-mails longos', () => {
    expect(A.emailShort('ana@gmail.com')).toBe('ana@gmail.com');
    const l = A.emailShort('maria.eduarda.santos.pereira@gmail.com');
    expect(l.length).toBeLessThan('maria.eduarda.santos.pereira@gmail.com'.length);
    expect(l).toMatch(/…@gmail\.com$/);
  });
});

describe('backup dos ajustes: o que sai do aparelho', () => {
  it('leva os ajustes e as escolhas dos amigos, e só isso', () => {
    const snap = A.prefsSnapshot(used());
    expect(snap.profile).toEqual({ name: 'Marianne', weight: 61.5, activity: 'high', wake: '06:30', sleep: '22:45', unit: 'oz', theme: 'dark', others: false, mix: true, mascot: 'cavalo' });
    expect(snap.goal).toEqual({ mode: 'manual', manual: 2300, climate: true });
    expect(snap.cups).toEqual([120, 200, 300, 450]);
    expect(snap.last).toBe('sparkling'); expect(snap.lastO).toBe('tea');
    expect(snap.social).toEqual({ on: true, nick: 'Mari', share: false, goal: true, push: false, hit: true, week: false });
    expect(snap.createdAt).toBe(1700000000000);
  });
  it('NÃO leva registros, lembretes ligados, horário do próximo, clima de hoje, convite pendente nem o código de convite', () => {
    const j = JSON.stringify(A.prefsSnapshot(used()));
    ['entries', 'days', '"ml"', 'nextAt', '1790000000000', 'enabled', 'bonus', 'temp', 'ZZZZ2222', 'ABCD2345', 'crewAt', 'unseenIns', '"wv"', 'insignias', 'achievements', 'missions']
      .forEach((x) => expect(j, x).not.toContain(x));
    expect(A.prefsSnapshot(used()).reminders).toEqual({ interval: 60, smart: false });
  });
  it('dos recados (ui) só vão os dispensados (tip_*) e a visão do ranking', () => {
    expect(A.prefsSnapshot(used()).ui).toEqual({ tip_install: 1, tip_news12: 1, tip_news15: 1, frRank: 'week' }); // o cartão de novidades da 1.5.0 também viaja: quem entra em outro aparelho não o vê de novo
    const S = used(); S.ui = { tip_a: 0, tip_b: 1, 'tip_com espaço': 1, 'tip_': 1, tip_ok: true, frRank: 'inventado', outro: 1 };
    expect(A.prefsSnapshot(S).ui).toEqual({ tip_b: 1, tip_ok: 1, frRank: 'day' });
  });
  it('as medalhas vão com o instante em que saíram, em minutos, só as que o app conhece e na ordem do app', () => {
    const S = medalsUsed();
    Object.assign(S.achievements, { inventada: T1, goal: 0, s3: 'x', s14: -4, s30: null, early: NaN, sunset: Infinity });
    const snap = A.prefsSnapshot(S);
    expect(snap.ach).toEqual({ first: at(T1), s7: at(T2), crew: at(T3) });
    expect(Object.keys(snap.ach)).toEqual(['first', 's7', 'crew']); // a ordem do app, não a de quem gravou: o texto é o mesmo em qualquer aparelho
    expect(at(T3)).toBe(at(T3 + 1)); // a um milissegundo do minuto seguinte, o arredondamento é o mesmo nos dois lados
    expect(A.prefsSnapshot(used()).ach).toEqual({});
    const velho = used(); delete velho.achievements; // estado de uma versão muito antiga, sem o campo
    expect(A.prefsSnapshot(velho).ach).toEqual({});
  });
  it('é estável: o mesmo estado dá sempre o mesmo texto (senão o app regravaria à toa)', () => {
    const a = A.prefsPack(used(), 5).j, S = used();
    S.ui = { frRank: 'week', tip_install: 1, tip_news15: 1, tip_news12: 1 }; // outra ordem das chaves
    expect(A.prefsPack(S, 9).j).toBe(a);
    S.profile.weight = 62;
    expect(A.prefsPack(S, 9).j).not.toBe(a);
    // com medalhas: a ordem em que saíram e os segundos de cada uma não mudam o texto; uma medalha nova ou outro minuto, sim
    const m = A.prefsPack(medalsUsed(), 5).j, M = medalsUsed();
    M.achievements = { crew: T3 + 20, s7: T2 + 10000, first: T1 - 5000 }; // outra ordem e outros segundos, mesmos minutos
    expect(A.prefsPack(M, 9).j).toBe(m);
    M.achievements.goal = T1; expect(A.prefsPack(M, 9).j).not.toBe(m);
    M.achievements = { first: T1 + 5 * MIN, s7: T2, crew: T3 }; expect(A.prefsPack(M, 9).j).not.toBe(m);
  });
  it('o documento tem v, u e j, e o texto cabe no limite das regras do Firestore (conferido no firestore.rules)', () => {
    const p = A.prefsPack(used(), 1790000000123);
    expect(Object.keys(p).sort()).toEqual(['j', 'u', 'v']);
    expect(p.v).toBe(1); expect(p.u).toBe(1790000000123); expect(typeof p.j).toBe('string');
    expect(p.j.length).toBeLessThan(A.PREFS_MAX);
    expect(RULES).toContain('d.j.size() <= ' + A.PREFS_MAX);
    expect(RULES).toContain('d.keys().hasOnly([\'v\', \'u\', \'j\'])');
    expect(A.prefsPack(used()).u).toBeGreaterThan(1.7e12); // sem u, usa a hora de agora
  });
  it('no pior caso (nome e apelido no limite, muitos recados) ainda cabe; se passar, solta os recados e, se ainda passar, não faz backup', () => {
    const S = used();
    S.profile.name = 'ç'.repeat(30); S.social.nick = '🐠'.repeat(20);
    for (let i = 0; i < 60; i++) S.ui['tip_' + 'x'.repeat(20) + i] = 1;
    const p = A.prefsPack(S, 1);
    expect(p).not.toBe(null);
    expect(p.j.length).toBeLessThanOrEqual(A.PREFS_MAX);
    // recados demais fazem passar do limite: o backup solta SÓ os recados (e a visão do ranking) e o resto do backup fica inteiro
    const M = used(); M.ui.frRank = 'week';
    for (let i = 0; i < 400; i++) M.ui['tip_' + 'y'.repeat(20) + i] = 1;
    expect(JSON.stringify(A.prefsSnapshot(M)).length).toBeGreaterThan(A.PREFS_MAX); // sem soltar, passaria do limite
    const q = A.prefsPack(M, 2);
    expect(q).not.toBe(null);
    expect(q.j.length).toBeLessThanOrEqual(A.PREFS_MAX);
    const solto = JSON.parse(q.j);
    expect(solto.ui).toEqual({});
    expect(solto.profile.name).toBe(A.prefsSnapshot(M).profile.name);
    expect(solto.cups).toEqual(A.prefsSnapshot(M).cups);
    // simula um estado impossível: sobra mesmo sem os recados → null
    const T = used(); T.profile.name = 'x'.repeat(5000);
    expect(A.prefsPack(T, 1)).toBe(null);
  });
  it('com as 30 medalhas o texto ainda cabe com folga, e cada medalha cabe com a sua data', () => {
    const S = allMedals(), p = A.prefsPack(S, 1), o = JSON.parse(p.j);
    expect(C.ACHIEVEMENTS.length).toBe(30);
    expect(Object.keys(o.ach)).toEqual(C.ACHIEVEMENTS.map((a) => a.id));
    C.ACHIEVEMENTS.forEach((a) => expect(o.ach[a.id], a.id).toBe(at(S.achievements[a.id])));
    expect(p.j.length).toBeLessThan(A.PREFS_MAX - 2000); // sobra para o nome, o apelido e os recados, no pior caso
    S.profile.name = 'ç'.repeat(30); S.social.nick = '🐠'.repeat(20);
    for (let i = 0; i < 60; i++) S.ui['tip_' + 'x'.repeat(20) + i] = 1;
    const q = A.prefsPack(S, 1);
    expect(q).not.toBe(null);
    expect(q.j.length).toBeLessThanOrEqual(A.PREFS_MAX);
    expect(Object.keys(JSON.parse(q.j).ach)).toHaveLength(30); // o pior caso de antes continua cabendo, agora com as 30 datas dentro
  });
  it('se passar do limite, saem primeiro os recados e só depois as datas das medalhas (os ajustes nunca saem)', () => {
    // 1) só os recados já resolvem: as datas ficam
    const M = allMedals();
    for (let i = 0; i < 400; i++) M.ui['tip_' + 'y'.repeat(20) + i] = 1;
    const a = A.prefsPack(M, 2);
    expect(a).not.toBe(null);
    const oa = JSON.parse(a.j);
    expect(oa.ui).toEqual({}); expect(Object.keys(oa.ach)).toHaveLength(30);
    // 2) sem os recados ainda passa, mas sem as datas cabe: as datas saem e o resto do backup fica inteiro
    const S = allMedals(); S.ui = {};
    const semDatas = (x) => JSON.stringify(Object.assign(A.prefsSnapshot(x), { ach: {} })).length;
    S.profile.name = 'x'.repeat(A.PREFS_MAX - semDatas(S) + S.profile.name.length - 50); // sem as datas sobram 50; com elas passa do limite
    expect(semDatas(S)).toBe(A.PREFS_MAX - 50);
    expect(JSON.stringify(A.prefsSnapshot(S)).length).toBeGreaterThan(A.PREFS_MAX);
    const b = A.prefsPack(S, 3);
    expect(b).not.toBe(null);
    expect(b.j.length).toBeLessThanOrEqual(A.PREFS_MAX);
    const ob = JSON.parse(b.j);
    expect(ob.ach).toEqual({}); expect(ob.profile.name).toBe(S.profile.name); expect(ob.cups).toEqual(A.prefsSnapshot(S).cups); expect(ob.social).toEqual(A.prefsSnapshot(S).social);
    // 3) nem sem as datas cabe: não faz backup (como antes)
    S.profile.name = 'x'.repeat(A.PREFS_MAX);
    expect(A.prefsPack(S, 4)).toBe(null);
  });
});

describe('backup dos ajustes: o que volta é sempre limpo', () => {
  it('lixo vira o padrão do app, sem estourar', () => {
    const D = C.defaults();
    [null, undefined, 5, 'x', [], {}, { profile: 5, goal: [], cups: 'a', social: null, ui: 3 }, { ach: 7 }, { ach: 'first' }, { ach: [at(T1), at(T2)] }, { ach: null }, { ach: { first: { x: 1 }, goal: [at(T1), at(T2)], s3: true } }].forEach((raw) => {
      const p = A.cleanPrefs(raw);
      expect(p.ach).toEqual({});
      expect(p.profile).toEqual(Object.assign({}, D.profile, { name: '' }));
      expect(p.goal).toEqual({ mode: 'auto', manual: 2500, climate: false });
      expect(p.cups).toEqual(D.cups);
      expect(p.last).toBe('water'); expect(p.lastO).toBe('coffee');
      expect(p.reminders).toEqual({ interval: 90, smart: true });
      expect(p.social).toEqual({ on: false, nick: '', share: true, goal: null, push: true, hit: false, week: true });
      expect(p.ui).toEqual({}); expect(p.createdAt).toBe(0);
    });
  });
  it('valores fora do limite são cortados ou trocados pelo padrão', () => {
    const p = A.cleanPrefs({ profile: { name: ' <b>Ana</b>\u0007 ' + 'x'.repeat(50), weight: 999, activity: 'maluca', wake: '25:00', sleep: '7pm', unit: 'litros', theme: 'rosa', others: 'sim', mix: 1, mascot: 'dragao' },
      goal: { mode: 'x', manual: 99999, climate: 1 }, cups: [1, 2, 3, 99999], last: 'coffee', lastO: 'water', reminders: { interval: 7, smart: false },
      social: { on: 'sim', nick: '<i>Mari</i>' + 'y'.repeat(40), share: 0, goal: 'sim', push: 0, hit: 1, week: null }, createdAt: 5, ui: { tip_x: 1, outro: 1, frRank: 'zzz' } });
    expect(p.profile.name.length).toBeLessThanOrEqual(30);
    expect(p.profile.name).not.toMatch(/[<>\u0007]/);
    expect(p.profile).toMatchObject({ weight: 250, activity: 'moderate', wake: '07:00', sleep: '23:00', unit: 'ml', theme: 'auto', others: true, mix: false, mascot: '' });
    expect(p.goal).toEqual({ mode: 'auto', manual: 6000, climate: false });
    expect(p.cups).toEqual([30, 30, 30, 2000]);
    expect(p.last).toBe('water'); expect(p.lastO).toBe('coffee'); // a bebida errada para cada gota é trocada
    expect(p.reminders).toEqual({ interval: 90, smart: false });
    expect(p.social.nick.length).toBeLessThanOrEqual(20); expect(p.social.nick).not.toMatch(/[<>]/);
    expect(p.social).toMatchObject({ on: false, share: true, goal: null, push: true, hit: false, week: true }); // só um true ou false de verdade conta
    expect(p.ui).toEqual({ tip_x: 1, frRank: 'day' });
    expect(p.createdAt).toBe(0); // 5 ms não é uma data de criação plausível
  });
  it('medalhas: só as que o app conhece, com um instante que faça sentido (depois de 2017 e, no máximo, amanhã)', () => {
    const now = Date.now();
    const p = A.cleanPrefs({ ach: { first: at(T1), goal: at(now + 30 * 36e5), s3: at(1.4e12), s7: 'ontem', s14: -5, s30: 0, early: null, sunset: NaN, mission: Infinity,
      m10: at(now + 20 * 36e5), weekend: at(1.5e12 - 2 * MIN), d10: at(1.5e12 + 2 * MIN), inventada: at(T1), crew: String(at(T3)), s60: at(T2) + 0.123456789 } });
    expect(Object.keys(p.ach).sort()).toEqual(['crew', 'd10', 'first', 'm10', 's60']);
    expect(p.ach.s60).toBe(Math.round((at(T2) + 0.123456789) * MIN)); // um minuto quebrado (de outro app) vira milissegundo inteiro
    expect(p.ach.first).toBe(at(T1) * MIN); // volta em milissegundos, nos minutos cheios
    expect(p.ach.crew).toBe(at(T3) * MIN); // um número escrito como texto também vale (o JSON de outro aparelho)
    expect(p.ach.m10).toBe(at(now + 20 * 36e5) * MIN); // 20 h à frente (relógio adiantado do outro aparelho) ainda vale; 30 h, não
    expect(p.ach.d10).toBe(at(1.5e12 + 2 * MIN) * MIN);
    Object.keys(p.ach).forEach((k) => expect(Number.isInteger(p.ach[k]), k).toBe(true));
  });
  it('acordar e dormir iguais voltam ao padrão (o app não aceita os dois no mesmo horário)', () => {
    const p = A.cleanPrefs({ profile: { wake: '08:00', sleep: '08:00' } });
    expect(p.profile.wake).toBe('07:00'); expect(p.profile.sleep).toBe('23:00');
  });
  it('a data de criação só vale se for plausível (depois de 2001, não no futuro distante)', () => {
    expect(A.cleanPrefs({ createdAt: 1700000000000 }).createdAt).toBe(1700000000000);
    expect(A.cleanPrefs({ createdAt: Date.now() + 5 * 864e5 }).createdAt).toBe(0);
    expect(A.cleanPrefs({ createdAt: -1 }).createdAt).toBe(0);
    expect(A.cleanPrefs({ createdAt: 'ontem' }).createdAt).toBe(0);
  });
  it('prefsParse recusa documentos que não são um backup válido', () => {
    const ok = A.prefsPack(used(), 77);
    expect(A.prefsParse(ok)).not.toBe(null);
    [null, undefined, 5, 'x', [], {}, { v: 1 }, Object.assign({}, ok, { v: 2 }), Object.assign({}, ok, { v: '1' }), Object.assign({}, ok, { j: 5 }), Object.assign({}, ok, { j: '' }),
      Object.assign({}, ok, { j: '{' }), Object.assign({}, ok, { j: '[]' }), Object.assign({}, ok, { j: 'null' }), Object.assign({}, ok, { j: '"texto"' }),
      Object.assign({}, ok, { j: 'x'.repeat(A.PREFS_MAX + 1) }),
      Object.assign({}, ok, { j: JSON.stringify({ profile: { name: 'Ana' }, sobra: 'x'.repeat(A.PREFS_MAX) }) }), // JSON válido, mas maior que o limite das regras
      Object.assign({}, ok, { u: 0 }), Object.assign({}, ok, { u: -1 }), Object.assign({}, ok, { u: 'agora' }),
      Object.assign({}, ok, { u: NaN }), Object.assign({}, ok, { u: Infinity })].forEach((r) => expect(A.prefsParse(r), JSON.stringify(r) && JSON.stringify(r).slice(0, 60)).toBe(null));
  });
  it('ida e volta: o que sai é o que volta (e o "u" acompanha)', () => {
    const S = used(), pack = A.prefsPack(S, 123456), back = A.prefsParse(JSON.parse(JSON.stringify(pack)));
    expect(back.u).toBe(123456);
    expect(back.prefs).toEqual(A.cleanPrefs(A.prefsSnapshot(S)));
    expect(back.prefs.profile.name).toBe('Marianne');
    expect(back.prefs.social.nick).toBe('Mari');
  });
  it('JSON com "__proto__" e afins não contamina nada', () => {
    const p = A.prefsParse({ v: 1, u: 5, j: '{"__proto__":{"x":1},"profile":{"__proto__":{"y":2},"name":"Ana"},"constructor":{"prototype":{"z":3}}}' });
    expect(p.prefs.profile.name).toBe('Ana');
    expect(({}).x).toBeUndefined(); expect(({}).y).toBeUndefined(); expect(({}).z).toBeUndefined();
    expect(Object.keys(p.prefs).sort()).toEqual(['ach', 'cups', 'createdAt', 'goal', 'last', 'lastO', 'profile', 'reminders', 'social', 'ui'].sort());
  });
  it('JSON com "__proto__" e "constructor" dentro das medalhas também não contamina nada', () => {
    const ms = at(T1), j = '{"ach":{"__proto__":{"first":' + ms + ',"polluted":1},"constructor":{"prototype":{"z":3}},"first":' + ms + ',"hasOwnProperty":' + ms + '}}';
    const p = A.prefsParse({ v: 1, u: 5, j: j });
    expect(p.prefs.ach).toEqual({ first: ms * MIN });
    expect(Object.getPrototypeOf(p.prefs.ach)).toBe(Object.prototype);
    expect(({}).first).toBeUndefined(); expect(({}).polluted).toBeUndefined(); expect(({}).z).toBeUndefined();
    const S = C.defaults(); A.applyPrefs(S, p.prefs, 'restore');
    expect(S.achievements).toEqual({ first: ms * MIN });
    expect(({}).first).toBeUndefined();
  });
});

describe('aplicar ajustes ao app', () => {
  const fresh = () => { const S = C.defaults(); S.reminders.enabled = true; S.reminders.nextAt = 999; S.social.code = 'KEEP2345'; return S; };
  const prefs = () => A.cleanPrefs(A.prefsSnapshot(used()));
  it('restaurar: aplica tudo, inclusive os amigos ligados, e mantém o que é do aparelho (lembretes ligados, horário, código)', () => {
    const S = fresh();
    A.applyPrefs(S, prefs(), 'restore');
    expect(S.profile).toMatchObject({ name: 'Marianne', weight: 61.5, unit: 'oz', theme: 'dark', mascot: 'cavalo', others: false, mix: true });
    expect(S.goal).toMatchObject({ mode: 'manual', manual: 2300, climate: true, bonus: 0, temp: null });
    expect(S.cups).toEqual([120, 200, 300, 450]); expect(S.last).toBe('sparkling'); expect(S.lastO).toBe('tea');
    expect(S.reminders).toMatchObject({ interval: 60, smart: false, enabled: true, nextAt: 999 });
    expect(S.social).toMatchObject({ on: true, nick: 'Mari', share: false, goal: true, push: false, hit: true, week: false, code: 'KEEP2345' });
    expect(S.ui).toMatchObject({ tip_install: 1, tip_news12: 1, tip_news15: 1, frRank: 'week' });
    expect(S.createdAt).toBe(1700000000000); // a mais antiga
  });
  it('sincronizar (ajustes mais novos de outro aparelho): igual, mas não liga nem desliga os amigos', () => {
    const S = fresh(); S.social.on = false;
    A.applyPrefs(S, prefs(), 'sync');
    expect(S.social.on).toBe(false); expect(S.social.nick).toBe('Mari');
    const T = fresh(); T.social.on = true; T.social.nick = 'Antigo';
    const p = prefs(); p.social.on = false;
    A.applyPrefs(T, p, 'sync');
    expect(T.social.on).toBe(true); expect(T.social.nick).toBe('Mari');
  });
  it('os recados dispensados só se somam (um aparelho não "reabre" o recado que o outro fechou)', () => {
    const S = fresh(); S.ui.tip_climate = 1;
    A.applyPrefs(S, prefs(), 'restore');
    expect(S.ui.tip_climate).toBe(1); expect(S.ui.tip_install).toBe(1);
  });
  it('a data de criação nunca fica mais nova que a do aparelho', () => {
    const S = fresh(); S.createdAt = 1600000000000;
    A.applyPrefs(S, prefs(), 'restore');
    expect(S.createdAt).toBe(1600000000000);
  });
  it('ida e volta completa: S → nuvem → aparelho novo dá os mesmos ajustes', () => {
    const a = used(), pack = A.prefsPack(a, 10), b = C.defaults();
    A.applyPrefs(b, A.prefsParse(JSON.parse(JSON.stringify(pack))).prefs, 'restore');
    expect(A.prefsSnapshot(b)).toEqual(A.prefsSnapshot(a));
  });
  it('restaurar: as medalhas da conta entram com a data em que saíram de verdade; a mais antiga de cada uma vale e as que só existem aqui ficam', () => {
    const p = A.cleanPrefs(A.prefsSnapshot(medalsUsed()));
    const S = fresh(); S.achievements = { first: T1 + 3 * 864e5, goal: T2 }; // "Primeira gota" daqui é mais nova que a da conta; "Na mosca" só existe aqui
    A.applyPrefs(S, p, 'restore');
    expect(S.achievements.first).toBe(at(T1) * MIN); // a da conta é mais antiga e vence (em minutos cheios)
    expect(S.achievements.goal).toBe(T2); // só daqui: fica como está
    expect(S.achievements.s7).toBe(at(T2) * MIN); expect(S.achievements.crew).toBe(at(T3) * MIN); // só da conta: entram
    expect(Object.keys(S.achievements).sort()).toEqual(['crew', 'first', 'goal', 's7']);
  });
  it('a data daqui, se for mais antiga, fica (uma medalha nunca "rejuvenesce" ao ler a conta)', () => {
    const p = A.cleanPrefs(A.prefsSnapshot(medalsUsed()));
    const S = fresh(); S.achievements = { first: T1 - 5 * 864e5, s7: T2 + 1 };
    A.applyPrefs(S, p, 'restore');
    expect(S.achievements.first).toBe(T1 - 5 * 864e5); // 5 dias antes da data da conta: a daqui é a mais antiga e fica
    expect(S.achievements.s7).toBe(T2); // 1 ms depois da data da conta: a da conta é a mais antiga e vence
    const igual = fresh(); igual.achievements = { first: at(T1) * MIN };
    expect(A.applyPrefs(igual, p, 'restore').achievements.first).toBe(at(T1) * MIN); // a mesma data: nada muda
  });
  it('sincronizar também junta as medalhas (idempotente) e nunca tira nenhuma', () => {
    const p = A.cleanPrefs(A.prefsSnapshot(medalsUsed()));
    const S = fresh(); S.achievements = { s30: T2 };
    A.applyPrefs(S, p, 'sync');
    const once = JSON.stringify(S.achievements);
    expect(Object.keys(S.achievements).sort()).toEqual(['crew', 'first', 's30', 's7']);
    A.applyPrefs(S, p, 'sync'); A.applyPrefs(S, p, 'restore');
    expect(JSON.stringify(S.achievements)).toBe(once);
    const semAch = A.cleanPrefs(A.prefsSnapshot(used())); // ajustes de um aparelho que não tinha medalha nenhuma (ou de uma versão antiga)
    A.applyPrefs(S, semAch, 'sync');
    expect(JSON.stringify(S.achievements)).toBe(once); // uma nuvem sem medalhas não apaga as daqui
  });
  it('ajustes de uma versão sem "ach" (anterior à 1.7.0) continuam entrando, sem medalhas e sem erro', () => {
    const velho = JSON.parse(JSON.stringify(A.prefsSnapshot(used()))); delete velho.ach;
    const p = A.prefsParse({ v: 1, u: 9, j: JSON.stringify(velho) });
    expect(p.prefs.ach).toEqual({});
    const S = fresh(); S.achievements = { first: T1 };
    A.applyPrefs(S, p.prefs, 'restore');
    expect(S.achievements).toEqual({ first: T1 });
    expect(S.profile.name).toBe('Marianne');
  });
  it('ida e volta com medalhas: S → nuvem → aparelho novo dá as mesmas medalhas, e a nuvem não parece "atrasada" (senão o app regravaria a cada leitura)', () => {
    const a = medalsUsed(), pack = A.prefsPack(a, 10), b = C.defaults(), back = A.prefsParse(JSON.parse(JSON.stringify(pack)));
    A.applyPrefs(b, back.prefs, 'restore');
    expect(A.prefsSnapshot(b)).toEqual(A.prefsSnapshot(a));
    expect(Object.keys(b.achievements).sort()).toEqual(['crew', 'first', 's7']);
    expect(A.achAhead(a.achievements, back.prefs.ach)).toBe(false);
    expect(A.achAhead(b.achievements, back.prefs.ach)).toBe(false);
    const all = allMedals(), c = C.defaults(), cb = A.prefsParse(A.prefsPack(all, 11));
    A.applyPrefs(c, cb.prefs, 'restore');
    expect(Object.keys(c.achievements)).toHaveLength(30);
    C.ACHIEVEMENTS.forEach((x) => expect(Math.abs(c.achievements[x.id] - all.achievements[x.id]), x.id).toBeLessThanOrEqual(MIN / 2)); // a data só perde os segundos
    expect(A.achAhead(all.achievements, cb.prefs.ach)).toBe(false);
  });
});

describe('a nuvem ficou para trás? (achAhead)', () => {
  const m = 28333333 * MIN; // um minuto cheio
  it('não, quando a nuvem tem todas as medalhas daqui, com a mesma data ou uma mais antiga', () => {
    expect(A.achAhead({}, {})).toBe(false);
    expect(A.achAhead({ first: m }, { first: m })).toBe(false);
    expect(A.achAhead({ first: m }, { first: m - 5 * MIN })).toBe(false); // a da nuvem é mais antiga: vale a da nuvem
    expect(A.achAhead({ first: m + 20000 }, { first: m })).toBe(false); // segundos de diferença não contam (o backup é em minutos)
    expect(A.achAhead({ first: m + 40000 }, { first: m })).toBe(false); // a daqui é mais nova (por arredondamento, um minuto): a nuvem já tem a mais antiga
    expect(A.achAhead({ first: m }, { first: m, goal: m, s3: m })).toBe(false); // a nuvem pode ter medalhas a mais: o app junta
  });
  it('sim, quando falta uma medalha na nuvem ou a data daqui é mais antiga (por mais de meio minuto)', () => {
    expect(A.achAhead({ first: m }, {})).toBe(true);
    expect(A.achAhead({ first: m, s7: m }, { first: m })).toBe(true);
    expect(A.achAhead({ first: m - MIN }, { first: m })).toBe(true);
    expect(A.achAhead({ first: m - 5 * 864e5 }, { first: m })).toBe(true);
    expect(A.achAhead({ crew: m }, { first: m })).toBe(true); // a nuvem tem outra medalha, mas não esta
  });
  it('só conta o que vale: medalhas desconhecidas e datas sem sentido não fazem a nuvem parecer atrasada', () => {
    expect(A.achAhead({ inventada: m }, {})).toBe(false);
    expect(A.achAhead({ first: 0, goal: -1, s3: 'x', s7: NaN, s14: null, s30: Infinity }, {})).toBe(false);
    expect(A.achAhead(null, null)).toBe(false);
    expect(A.achAhead(undefined, 5)).toBe(false);
    expect(A.achAhead({ first: m }, 'texto')).toBe(true);
    expect(A.achAhead({ first: m }, [m])).toBe(true);
  });
});

describe('entrar num aparelho novo: o plano de restauração', () => {
  const profile = (o) => Object.assign({ v: 1, nm: 'Mari', mc: 'cavalo', ins: ['concha'], pct: 40, met: false, st: 3, day: '2026-10-22', sh: true, gl: 2300, wm: 7 }, o);
  const days = { '2026-09-02': { goal: 2000, u: 1, entries: [] }, '2026-10-20': { goal: 2300, u: 2, entries: [] }, 'lixo': {} };
  it('com backup: os ajustes completos pulam o onboarding e tudo volta', () => {
    const plan = A.restorePlan({ prefs: A.prefsPack(used(), 50), user: { wake: '05:00' }, profile: profile(), days: days });
    expect(plan.complete).toBe(true); expect(plan.prefsU).toBe(50); expect(plan.found).toBe(true);
    const S = C.defaults();
    expect(A.applyPlan(S, plan)).toBe(true);
    expect(S.onboarded).toBe(true);
    expect(S.profile.name).toBe('Marianne'); expect(S.profile.wake).toBe('06:30'); // o backup manda sobre o users
    expect(S.social.on).toBe(true);
  });
  it('sem backup (conta criada pelo administrador): aproveita horários, unidade e apelido; o onboarding continua, pré-preenchido', () => {
    const plan = A.restorePlan({ prefs: null, user: { wake: '05:30', sleep: '21:30', unit: 'oz', goal: 2300, tz: 'America/Fortaleza' }, profile: profile({ nm: 'Marianne' }), days: days });
    expect(plan.complete).toBe(false); expect(plan.found).toBe(true);
    expect(plan.base).toEqual({ wake: '05:30', sleep: '21:30', unit: 'oz', name: 'Marianne' });
    expect(plan.days).toBe(2); expect(plan.first).toBe('2026-09-02');
    const S = C.defaults(Date.now());
    expect(A.applyPlan(S, plan)).toBe(false);
    expect(S.onboarded).toBe(false);
    expect(S.profile).toMatchObject({ name: 'Marianne', wake: '05:30', sleep: '21:30', unit: 'oz', weight: 70, activity: 'moderate' }); // peso e atividade ficam para ela
    expect(S.social).toMatchObject({ on: true, nick: 'Marianne', share: true, goal: true });
    expect(S.createdAt).toBe(C.keyToDate('2026-09-02').getTime());
  });
  it('os amigos só voltam se o perfil ainda existe na nuvem, mesmo que o backup diga que estavam ligados', () => {
    const plan = A.restorePlan({ prefs: A.prefsPack(used(), 50), profile: null, days: {} });
    expect(plan.social).toBe(null);
    const S = C.defaults(); S.social.code = 'OLD22222';
    A.applyPlan(S, plan);
    expect(S.social.on).toBe(false); expect(S.social.code).toBe('');
  });
  it('sem perfil nem backup: tudo continua desligado e padrão', () => {
    const S = C.defaults();
    A.applyPlan(S, A.restorePlan({ prefs: null, user: null, profile: null, days: {} }));
    expect(S.social.on).toBe(false); expect(S.onboarded).toBe(false);
    expect(A.restorePlan({ prefs: null, user: null, profile: null, days: {} }).found).toBe(false);
    expect(A.restorePlan(null).found).toBe(false);
    expect(A.restorePlan({}).found).toBe(false);
  });
  it('as escolhas de aviso do servidor (users.social) valem mais que as do backup', () => {
    const plan = A.restorePlan({ prefs: A.prefsPack(used(), 5), user: { social: { push: true, hit: false, week: true } }, profile: profile(), days: {} });
    expect(plan.social).toMatchObject({ push: true, hit: false, week: true });
    const sem = A.restorePlan({ prefs: null, user: { social: { push: 'sim' } }, profile: profile({ gl: null, sh: false }), days: {} });
    expect(sem.social).toMatchObject({ push: true, hit: false, week: true, goal: null, share: false }); // sem boolean de verdade, o padrão
  });
  it('dados estranhos da nuvem (horários, unidade, apelido) são ignorados', () => {
    const plan = A.restorePlan({ prefs: null, user: { wake: '99:99', sleep: 5, unit: 'galões' }, profile: profile({ nm: '<script>' + 'x'.repeat(60) }), days: {} });
    expect(plan.base.wake).toBeUndefined(); expect(plan.base.sleep).toBeUndefined(); expect(plan.base.unit).toBeUndefined();
    expect(plan.base.name.length).toBeLessThanOrEqual(20); expect(plan.base.name).not.toMatch(/[<>]/);
    const iguais = A.restorePlan({ prefs: null, user: { wake: '07:00', sleep: '07:00' }, profile: null, days: {} });
    expect(iguais.base.wake).toBeUndefined();
  });
  it('um backup quebrado não impede a restauração dos registros: segue como "sem backup"', () => {
    const plan = A.restorePlan({ prefs: { v: 1, u: 5, j: '{quebrado' }, user: { wake: '05:00' }, profile: null, days: days });
    expect(plan.complete).toBe(false); expect(plan.base.wake).toBe('05:00'); expect(plan.found).toBe(true);
  });
});
