// Maré — testes das regras de segurança do Firestore (firestore.rules). Rodar: npm run test:rules
// Cada teste usa dois ou três "usuários" com login de verdade no emulador (ana, bruno e caio) e confere o que o servidor
// aceita e o que recusa. O que importa aqui é a PRIVACIDADE: só amigos aprovados leem o perfil, ninguém aceita o próprio
// pedido, ninguém mexe no que é do outro, e o servidor recusa dados fora do formato.
import { describe, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, collection, query, where, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pairId as pid } from '../../public/js/social.js'; // o MESMO cálculo que o app usa: se divergir das regras, os testes quebram

const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const RULES = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firestore.rules'), 'utf8');
const U = (n) => n + 'x'.repeat(28 - n.length); // ids com 28 letras, como os de um login anônimo
const ANA = U('ana'), BRU = U('bruno'), CAI = U('caio'); // em ordem alfabética: ANA < BRU < CAI
const ok = assertSucceeds, no = assertFails;
const without = (o, ...ks) => { const c = Object.assign({}, o); ks.forEach((k) => { delete c[k]; }); return c; };

let env;
// Cada as()/anon() abre um login de teste com conexões próprias, que a biblioteca só encerra no fim de toda a bateria: anota e encerra ao fim de cada teste
const ctxs = [];
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-mare-rules', firestore: { host: hp[0], port: +hp[1], rules: RULES } });
  ['authenticatedContext', 'unauthenticatedContext'].forEach((k) => {
    const orig = env[k].bind(env);
    env[k] = function () { const c = orig.apply(null, arguments); ctxs.push(c); return c; };
  });
});
afterAll(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
afterEach(() => { ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } }); });

const as = (u) => env.authenticatedContext(u).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const ago = (min) => Timestamp.fromMillis(Date.now() - min * 60000);

// documentos válidos (cada teste muda só o campo que quer provar)
const prof = (o) => Object.assign({ v: 1, nm: 'Ana', mc: 'cavalo', ins: ['concha', 'estrela'], pct: 40, met: false, st: 3, day: '2026-10-18', sh: true }, o);
const codeDoc = (u, o) => Object.assign({ uid: u, nm: 'Ana', mc: 'cavalo' }, o);
// Cada pessoa tem um código de convite vigente; o pedido de amizade leva o do DESTINATÁRIO em "cd" e as regras conferem
const CODE = { [ANA]: 'AAAA2222', [BRU]: 'BBBB2222', [CAI]: 'CCCC2222' };
const seedCodes = () => seed(async (d) => {
  for (const u of [ANA, BRU, CAI]) await setDoc(doc(d, 'codes', CODE[u]), { uid: u, nm: u.slice(0, 3), mc: 'concha' });
});
const req = (by, o) => {
  const other = by === ANA ? BRU : ANA;
  return Object.assign({ m: pid(by, other).split('_'), by: by, st: 'pending', nm: 'Ana', mc: 'cavalo', tn: 'Bruno', tc: 'polvo', cd: CODE[other], at: serverTimestamp() }, o);
};
const friendDoc = (o) => Object.assign({ m: [ANA, BRU], by: ANA, st: 'active', nm: 'Ana', mc: 'cavalo', tn: 'Bruno', tc: 'polvo', cd: CODE[BRU], at: ago(60), ok: ago(30) }, o);
const AB = pid(ANA, BRU);
const seedPair = (o) => seed((d) => setDoc(doc(d, 'friendships', AB), friendDoc(o)));
const seedProfile = (u, o) => seed((d) => setDoc(doc(d, 'profiles', u), Object.assign(prof(), o)));

describe('o que já existia: users e days continuam só do dono', () => {
  test('dono grava o próprio users/{uid}; os outros não leem nem gravam', async () => {
    await ok(setDoc(doc(as(ANA), 'users', ANA), { goal: 2000, tz: 'America/Sao_Paulo', updatedAt: serverTimestamp() }));
    await ok(getDoc(doc(as(ANA), 'users', ANA)));
    await no(getDoc(doc(as(BRU), 'users', ANA)));
    await no(setDoc(doc(as(BRU), 'users', ANA), { goal: 1 }));
    await no(getDoc(doc(anon(), 'users', ANA)));
  });
  test('um amigo aprovado NÃO lê os dados privados (users e days)', async () => {
    await seedPair();
    await seed((d) => setDoc(doc(d, 'users', ANA), { goal: 2000 }));
    await seed((d) => setDoc(doc(d, 'users', ANA, 'days', '2026-10-18'), { goal: 2000, total: 100, entries: [], u: 1 }));
    await no(getDoc(doc(as(BRU), 'users', ANA)));
    await no(getDoc(doc(as(BRU), 'users', ANA, 'days', '2026-10-18')));
  });
  test('formato inválido continua recusado', async () => {
    await no(setDoc(doc(as(ANA), 'users', ANA), { goal: 2000, nome: 'Ana' }));
    await no(setDoc(doc(as(ANA), 'users', ANA, 'days', 'ontem'), { goal: 2000, total: 0, entries: [] }));
    await ok(setDoc(doc(as(ANA), 'users', ANA, 'days', '2026-10-18'), { goal: 2000, total: 0, entries: [] }));
  });
});

describe('profiles: o perfil que os amigos veem', () => {
  test('o dono cria e atualiza um perfil válido', async () => {
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof()));
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ pct: 80, st: 4 })));
    await ok(getDoc(doc(as(ANA), 'profiles', ANA)));
  });
  test('pct pode faltar ou ser null (progresso em pausa)', async () => {
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ pct: null, sh: false, st: 0 })));
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), without(prof({ sh: false }), 'pct')));
  });
  test('recusa documentos fora do formato', async () => {
    const bad = [
      ['campo a mais', prof({ peso: 70 })], ['sem nome', without(prof(), 'nm')], ['nome vazio', prof({ nm: '' })],
      ['nome com 81 letras', prof({ nm: 'a'.repeat(81) })], ['nome que não é texto', prof({ nm: 5 })], ['mascote vazio', prof({ mc: '' })],
      ['mascote enorme', prof({ mc: 'm'.repeat(17) })], ['ins não é lista', prof({ ins: 'concha' })],
      ['ins com 13 itens', prof({ ins: Array.from({ length: 13 }, (_, i) => 'x' + i) })], ['pct 101', prof({ pct: 101 })],
      ['pct negativo', prof({ pct: -1 })], ['pct decimal', prof({ pct: 50.5 })], ['pct texto', prof({ pct: '50' })],
      ['met texto', prof({ met: 'sim' })], ['st negativo', prof({ st: -1 })], ['st gigante', prof({ st: 10000 })],
      ['st decimal', prof({ st: 1.5 })], ['dia inválido', prof({ day: 'hoje' })], ['sem sh', without(prof(), 'sh')],
      ['sh texto', prof({ sh: 'sim' })], ['v diferente de 1', prof({ v: 2 })],
      // nenhum documento público leva horário: nem o do servidor, nem o do aparelho, nem um número
      ['u com a hora do servidor', prof({ u: serverTimestamp() })], ['u com a hora do aparelho', prof({ u: Timestamp.now() })], ['u número', prof({ u: 123 })],
      ['sem ins', without(prof(), 'ins')], ['sem day', without(prof(), 'day')], ['sem met', without(prof(), 'met')], ['sem st', without(prof(), 'st')], ['sem mc', without(prof(), 'mc')],
    ];
    for (const [nome, d] of bad) await no(setDoc(doc(as(ANA), 'profiles', ANA), d), nome);
  });
  test('cada item de ins é um texto curto: nada de documentos gordos escondidos na lista', async () => {
    const big = 'x'.repeat(25), okId = 'agua-viva';
    const bad = [
      ['item número', prof({ ins: [5] })], ['item mapa', prof({ ins: [{ a: 1 }] })], ['item nulo', prof({ ins: [null] })],
      ['item booleano', prof({ ins: [true] })], ['item com 25 letras', prof({ ins: [big] })], ['item de 70 mil letras', prof({ ins: ['y'.repeat(70000)] })],
      ['item ruim na última posição (12ª)', prof({ ins: Array.from({ length: 11 }, () => okId).concat([big]) })],
      ['item ruim no meio', prof({ ins: [okId, okId, okId, 7, okId] })], ['ins nulo', prof({ ins: null })],
    ];
    for (const [nome, d] of bad) await no(setDoc(doc(as(ANA), 'profiles', ANA), d), nome);
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ ins: [] })));
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ ins: ['concha', 'estrela', 'baiacu', 'tartaruga', 'cavalo', 'polvo', 'agua-viva', 'golfinho', 'baleia', 'narval'] })));
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ ins: ['a'.repeat(24)] }))); // no limite
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ ins: ['insignia-nova-de-uma-versao-futura'.slice(0, 24)] }))); // um id que o servidor nunca viu: sem lista fixa
  });
  test('aceita nome no limite (80, folga para acentos e emoji) e 12 insígnias', async () => {
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ nm: 'a'.repeat(80), ins: Array.from({ length: 12 }, (_, i) => 'x' + i) })));
  });
  test('o apelido mais pesado que o app permite (20 emojis = 80 bytes) é aceito', async () => {
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ nm: '🐙'.repeat(20) })));
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof({ nm: 'ç'.repeat(20) })));
  });
  test('ninguém grava o perfil de outra pessoa; sem login nada funciona', async () => {
    await no(setDoc(doc(as(BRU), 'profiles', ANA), prof()));
    await no(setDoc(doc(anon(), 'profiles', ANA), prof()));
    await seedProfile(ANA);
    await no(deleteDoc(doc(as(BRU), 'profiles', ANA)));
    await no(getDoc(doc(anon(), 'profiles', ANA)));
  });
  test('leitura: só o dono e amigos aprovados', async () => {
    await seedProfile(ANA);
    await ok(getDoc(doc(as(ANA), 'profiles', ANA)));
    await no(getDoc(doc(as(BRU), 'profiles', ANA))); // desconhecido
    await seed((d) => setDoc(doc(d, 'friendships', AB), without(friendDoc({ st: 'pending' }), 'ok')));
    await no(getDoc(doc(as(BRU), 'profiles', ANA))); // pedido pendente não basta
    await no(getDoc(doc(as(ANA), 'profiles', BRU))); // nem para o outro lado
    await seed((d) => setDoc(doc(d, 'friendships', AB), friendDoc()));
    await ok(getDoc(doc(as(BRU), 'profiles', ANA))); // amizade ativa: BRU lê ANA
    await no(getDoc(doc(as(CAI), 'profiles', ANA))); // um terceiro continua de fora
  });
  test('leitura vale nos dois sentidos de ordem alfabética e some quando a amizade acaba', async () => {
    await seedProfile(BRU);
    await seedPair();
    await ok(getDoc(doc(as(ANA), 'profiles', BRU)));
    await ok(deleteDoc(doc(as(BRU), 'friendships', AB)));
    await no(getDoc(doc(as(ANA), 'profiles', BRU)));
  });
  test('o que o amigo enxerga no perfil é só o combinado: nada de volumes, peso, horário ou localização (a meta em ml só no campo opcional gl)', async () => {
    await seedPair();
    await ok(setDoc(doc(as(BRU), 'profiles', BRU), prof({ nm: 'Bruno', mc: 'polvo' })));
    const s = await ok(getDoc(doc(as(ANA), 'profiles', BRU)));
    const keys = Object.keys(s.data()).sort().join();
    if (keys !== 'day,ins,mc,met,nm,pct,sh,st,v') throw new Error('o perfil mostra mais (ou menos) do que o combinado: ' + keys);
    // e o servidor não deixa o app (nem uma versão futura ou adulterada) acrescentar campos sensíveis
    for (const extra of [{ ml: 1800 }, { total: 1800 }, { goal: 2000 }, { peso: 70 }, { tz: 'America/Sao_Paulo' }, { loc: 'SP' }, { u: serverTimestamp() }, { e: [] }]) {
      await no(setDoc(doc(as(BRU), 'profiles', BRU), prof(extra)), JSON.stringify(Object.keys(extra)));
    }
  });
  test('com a meta em ml (gl) e os 7 dias (wm): inteiros dentro dos limites, null ou ausentes; qualquer outra coisa é recusada', async () => {
    const good = [['sem gl nem wm', prof()], ['gl 0', prof({ gl: 0 })], ['gl 1800', prof({ gl: 1800 })], ['gl 10000 (o teto)', prof({ gl: 10000 })], ['gl null', prof({ gl: null })],
      ['wm 0', prof({ wm: 0 })], ['wm 1', prof({ wm: 1 })], ['wm 127 (os sete dias)', prof({ wm: 127 })], ['wm null (em pausa)', prof({ wm: null })], ['os dois juntos', prof({ gl: 2500, wm: 85 })],
      ['em pausa: sem pct, sem gl, sem os 7 dias', prof({ sh: false, pct: null, gl: null, wm: null })]];
    for (const [nome, d] of good) await ok(setDoc(doc(as(ANA), 'profiles', ANA), d), nome);
    const bad = [['gl 10001', prof({ gl: 10001 })], ['gl negativo', prof({ gl: -1 })], ['gl decimal', prof({ gl: 1800.5 })], ['gl texto', prof({ gl: '1800' })], ['gl booleano', prof({ gl: true })],
      ['gl lista', prof({ gl: [1800] })], ['gl mapa', prof({ gl: { ml: 1800 } })], ['gl NaN', prof({ gl: NaN })], ['gl infinito', prof({ gl: Infinity })],
      ['wm 128', prof({ wm: 128 })], ['wm negativo', prof({ wm: -1 })], ['wm decimal', prof({ wm: 3.5 })], ['wm texto', prof({ wm: '7' })], ['wm booleano', prof({ wm: true })],
      ['wm lista', prof({ wm: [1] })], ['wm mapa', prof({ wm: { d: 1 } })], ['wm NaN', prof({ wm: NaN })], ['wm infinito', prof({ wm: Infinity })]];
    for (const [nome, d] of bad) await no(setDoc(doc(as(ANA), 'profiles', ANA), d), nome);
  });
  test('compartilhando a meta em ml e os 7 dias, o amigo lê os dois; quem não é amigo não; o dono tira a meta (ou muda os dias) quando quiser; o amigo não mexe em nada', async () => {
    await seedPair();
    await ok(setDoc(doc(as(BRU), 'profiles', BRU), prof({ nm: 'Bruno', mc: 'polvo', gl: 2400, wm: 93 })));
    const s = await ok(getDoc(doc(as(ANA), 'profiles', BRU)));
    const keys = Object.keys(s.data()).sort().join();
    if (keys !== 'day,gl,ins,mc,met,nm,pct,sh,st,v,wm') throw new Error('o perfil compartilhado deveria ter exatamente os campos combinados: ' + keys);
    if (s.data().gl !== 2400 || s.data().wm !== 93) throw new Error('o amigo deveria ler a meta e os 7 dias');
    await no(getDoc(doc(as(CAI), 'profiles', BRU)));
    await ok(updateDoc(doc(as(BRU), 'profiles', BRU), { gl: deleteField() })); // "mostrar minha meta" desligado: o campo some
    const t = (await ok(getDoc(doc(as(ANA), 'profiles', BRU)))).data();
    if ('gl' in t) throw new Error('sem a escolha da pessoa, a meta em ml não pode ficar no perfil');
    await ok(updateDoc(doc(as(BRU), 'profiles', BRU), { wm: 127 }));
    await no(updateDoc(doc(as(BRU), 'profiles', BRU), { gl: 10001 }));
    await no(updateDoc(doc(as(BRU), 'profiles', BRU), { wm: 128 }));
    await no(updateDoc(doc(as(ANA), 'profiles', BRU), { gl: 1 })); // o amigo não escreve no perfil do outro
    await no(updateDoc(doc(as(ANA), 'profiles', BRU), { wm: 0 }));
  });
  test('ser amigo de alguém não dá acesso ao perfil dos amigos dele', async () => {
    await seedPair(); // ANA e BRU
    await seedProfile(CAI);
    await no(getDoc(doc(as(ANA), 'profiles', CAI)));
    await no(getDoc(doc(as(BRU), 'profiles', CAI)));
  });
  test('não há listagem de perfis, nem do próprio', async () => {
    await seedProfile(ANA);
    await no(getDocs(collection(as(ANA), 'profiles')));
    await no(getDocs(query(collection(as(ANA), 'profiles'), where('nm', '==', 'Ana'))));
  });
  test('o dono apaga o próprio perfil', async () => {
    await seedProfile(ANA);
    await ok(deleteDoc(doc(as(ANA), 'profiles', ANA)));
  });
});

describe('codes: o convite', () => {
  const C = 'ABCD2345';
  const live = () => seed((d) => setDoc(doc(d, 'codes', C), { uid: ANA, nm: 'Ana', mc: 'cavalo' }));
  const dead = () => seed((d) => setDoc(doc(d, 'codes', C), { uid: ANA, nm: 'Ana', mc: 'cavalo', rv: true }));
  test('quem está logado cria o próprio código', async () => {
    await ok(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA)));
  });
  test('recusa código fora do alfabeto ou do tamanho', async () => {
    for (const c of ['abcd2345', 'ABCD234', 'ABCD23456', 'ABCDO345', 'ABCD0345', 'ABCDI345', 'ABCDL345', 'ABCD1345', 'ABCD-345', 'ÁBCD2345']) {
      await no(setDoc(doc(as(ANA), 'codes', c), codeDoc(ANA)), c);
    }
  });
  test('recusa documento fora do formato ou em nome de outro', async () => {
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(BRU)));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { peso: 1 })));
    await no(setDoc(doc(as(ANA), 'codes', C), without(codeDoc(ANA), 'nm')));
    await no(setDoc(doc(as(ANA), 'codes', C), without(codeDoc(ANA), 'mc')));
    await no(setDoc(doc(as(ANA), 'codes', C), without(codeDoc(ANA), 'uid')));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { nm: '' })));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { nm: 'a'.repeat(81) })));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { mc: '' })));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { mc: 'm'.repeat(17) })));
    await no(setDoc(doc(anon(), 'codes', C), codeDoc(ANA)));
  });
  test('o convite não leva horário (nem do servidor, nem do aparelho): quem tem o código não vê quando a pessoa abre o app', async () => {
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { u: serverTimestamp() })));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { u: Timestamp.now() })));
    await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { u: 123 })));
    await live();
    await no(updateDoc(doc(as(ANA), 'codes', C), { u: serverTimestamp() }));
    await no(updateDoc(doc(as(ANA), 'codes', C), { nm: 'Aninha', u: Timestamp.now() }));
  });
  test('qualquer pessoa logada lê UM código (e só vê nome e mascote); sem login, não', async () => {
    await live();
    const s = await ok(getDoc(doc(as(BRU), 'codes', C)));
    if (Object.keys(s.data()).sort().join() !== 'mc,nm,uid') throw new Error('o convite guarda mais do que nome e mascote: ' + Object.keys(s.data()).join());
    await no(getDoc(doc(anon(), 'codes', C)));
  });
  test('listar: só os meus (where uid == eu); nunca todos', async () => {
    await live();
    await seed((d) => setDoc(doc(d, 'codes', 'ZZZZ2222'), { uid: BRU, nm: 'Bruno', mc: 'polvo' }));
    const mine = await ok(getDocs(query(collection(as(ANA), 'codes'), where('uid', '==', ANA))));
    if (mine.size !== 1) throw new Error('esperava 1 código meu, veio ' + mine.size);
    await no(getDocs(query(collection(as(ANA), 'codes'), where('uid', '==', BRU))));
    await no(getDocs(collection(as(ANA), 'codes')));
    await no(getDocs(collection(anon(), 'codes')));
  });
  test('só o dono atualiza; ninguém toma o código de outro nem passa o seu adiante', async () => {
    await live();
    await ok(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { nm: 'Aninha', mc: 'polvo' })));
    await no(setDoc(doc(as(BRU), 'codes', C), codeDoc(BRU))); // tentativa de tomar o código
    await no(updateDoc(doc(as(BRU), 'codes', C), { uid: BRU }));
    await no(updateDoc(doc(as(BRU), 'codes', C), { nm: 'Intruso' }));
    await no(updateDoc(doc(as(ANA), 'codes', C), { uid: BRU })); // nem o dono entrega o código a outra pessoa
    await no(updateDoc(doc(anon(), 'codes', C), { nm: 'Intruso' }));
    const s = await getDoc(doc(as(ANA), 'codes', C));
    if (s.data().uid !== ANA || s.data().nm !== 'Aninha') throw new Error('o convite deveria seguir da Ana, com o nome acertado só por ela');
  });
  test('convites nunca são apagados: nem pelo dono, nem revogados, nem num lote, nem por um terceiro', async () => {
    await live();
    await no(deleteDoc(doc(as(ANA), 'codes', C)), 'dono, convite vigente');
    await no(deleteDoc(doc(as(BRU), 'codes', C)), 'terceiro');
    await no(deleteDoc(doc(anon(), 'codes', C)), 'sem login');
    const db = as(ANA), b = writeBatch(db);
    b.delete(doc(db, 'codes', C));
    await no(b.commit(), 'lote');
    await env.clearFirestore();
    await dead();
    await no(deleteDoc(doc(as(ANA), 'codes', C)), 'dono, convite revogado');
    const s = await getDoc(doc(as(ANA), 'codes', C));
    if (!s.exists() || s.data().rv !== true) throw new Error('o convite revogado deveria seguir existindo');
  });
  test('apagar não libera o código: a Ana não consegue sumir com o dela para a Bruna ocupar o identificador', async () => {
    await live();
    await no(deleteDoc(doc(as(ANA), 'codes', C)));
    await no(setDoc(doc(as(BRU), 'codes', C), codeDoc(BRU, { nm: 'Ana' })));
    const s = await getDoc(doc(as(BRU), 'codes', C));
    if (s.data().uid !== ANA) throw new Error('o identificador deveria seguir sendo da Ana');
  });
  describe('revogar (trocar de código)', () => {
    test('o dono revoga com um update (rv: true); o código continua ocupado e legível', async () => {
      await live();
      await ok(updateDoc(doc(as(ANA), 'codes', C), { rv: true }));
      const s = await ok(getDoc(doc(as(BRU), 'codes', C)));
      if (s.data().rv !== true || s.data().uid !== ANA) throw new Error('o documento deveria seguir existindo, revogado e ainda do dono');
    });
    test('rv só pode valer true (nada de false, texto ou número) e só o dono revoga', async () => {
      await live();
      for (const v of [false, 'sim', 1, null, ['x'], { a: 1 }]) await no(updateDoc(doc(as(ANA), 'codes', C), { rv: v }), String(JSON.stringify(v)));
      await no(updateDoc(doc(as(BRU), 'codes', C), { rv: true })); // um terceiro não revoga o código dos outros
      await no(updateDoc(doc(anon(), 'codes', C), { rv: true }));
    });
    test('rv também não passa já falso na criação', async () => {
      await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { rv: false })));
      await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA, { rv: 'sim' })));
    });
    test('revogado, o código não reabre: nem sem rv, nem com rv falso, nem apagando o campo', async () => {
      await dead();
      await no(setDoc(doc(as(ANA), 'codes', C), codeDoc(ANA))); // recriar o mesmo código sem rv
      await no(updateDoc(doc(as(ANA), 'codes', C), { rv: false }));
      await no(updateDoc(doc(as(ANA), 'codes', C), { rv: deleteField() }));
      await ok(updateDoc(doc(as(ANA), 'codes', C), { nm: 'Aninha' })); // mudar o nome é só um acerto: continua revogado
      await ok(updateDoc(doc(as(ANA), 'codes', C), { nm: 'Scrub', mc: 'x', rv: true }));
      const s = await getDoc(doc(as(ANA), 'codes', C));
      if (s.data().rv !== true) throw new Error('o código deveria seguir revogado');
    });
    test('ao sair dos amigos o app apaga o nome do convite (nm "-", mc "-") e revoga, numa gravação só', async () => {
      await live();
      await ok(updateDoc(doc(as(ANA), 'codes', C), { nm: '-', mc: '-', rv: true }));
      const s = await getDoc(doc(as(BRU), 'codes', C));
      if (s.data().nm !== '-' || s.data().mc !== '-' || s.data().rv !== true || s.data().uid !== ANA) throw new Error('o convite deveria ficar sem nome e revogado');
      await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA, { cd: C }))); // e ninguém pede amizade com ele
    });
    test('ninguém mais consegue criar um código revogado com outro dono (o identificador fica ocupado)', async () => {
      await dead();
      await no(setDoc(doc(as(BRU), 'codes', C), codeDoc(BRU, { nm: 'Ana' }))); // fingir ser a Ana no link antigo
      await no(setDoc(doc(as(BRU), 'codes', C), codeDoc(BRU, { nm: 'Ana', rv: true })));
      const s = await getDoc(doc(as(ANA), 'codes', C));
      if (s.data().uid !== ANA) throw new Error('o dono do identificador mudou');
    });
    test('trocar de código de forma atômica: cria o novo e revoga o antigo numa única gravação', async () => {
      await live();
      const db = as(ANA), b = writeBatch(db);
      b.set(doc(db, 'codes', 'NEWC2222'), codeDoc(ANA));
      b.update(doc(db, 'codes', C), { rv: true });
      await ok(b.commit());
      const novo = await getDoc(doc(db, 'codes', 'NEWC2222')), velho = await getDoc(doc(db, 'codes', C));
      if (novo.data().rv || velho.data().rv !== true) throw new Error('o novo deveria valer e o antigo estar revogado');
    });
    test('uma troca atômica que colide com o código de outra pessoa falha inteira (o antigo continua valendo)', async () => {
      await live();
      await seed((d) => setDoc(doc(d, 'codes', 'NEWC2222'), { uid: CAI, nm: 'Caio', mc: 'baleia' }));
      const db = as(ANA), b = writeBatch(db);
      b.set(doc(db, 'codes', 'NEWC2222'), codeDoc(ANA));
      b.update(doc(db, 'codes', C), { rv: true });
      await no(b.commit());
      const velho = await getDoc(doc(db, 'codes', C));
      if (velho.data().rv) throw new Error('nada deveria ter mudado');
    });
  });
});

describe('friendships: pedido, aceite e fim', () => {
  beforeEach(seedCodes);
  test('quem pede cria um pedido válido (nos dois sentidos de ordem)', async () => {
    await ok(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
    await seed((d) => deleteDoc(doc(d, 'friendships', AB)));
    await ok(setDoc(doc(as(BRU), 'friendships', AB), req(BRU)));
  });
  test('recusa pedido fora do formato', async () => {
    const bad = [
      ['by de outra pessoa', req(ANA, { by: BRU })], ['já nasce ativo', req(ANA, { st: 'active' })], ['campo a mais', req(ANA, { ok: serverTimestamp() })],
      ['sem nome', without(req(ANA), 'nm')], ['sem tn', without(req(ANA), 'tn')], ['m trocado', req(ANA, { m: [BRU, ANA] })],
      ['m com três', req(ANA, { m: [ANA, BRU, CAI].sort() })], ['at do aparelho', req(ANA, { at: Timestamp.now() })],
      ['nome longo', req(ANA, { nm: 'a'.repeat(81) })], ['mascote longo', req(ANA, { tc: 'm'.repeat(17) })], ['st vazio', req(ANA, { st: '' })],
      ['w já preenchido', req(ANA, { w: {} })],
    ];
    for (const [nome, d] of bad) await no(setDoc(doc(as(ANA), 'friendships', AB), d), nome);
  });
  test('id fora de ordem ou de quem não é membro é recusado', async () => {
    await no(setDoc(doc(as(ANA), 'friendships', BRU + '_' + ANA), req(ANA)));
    await no(setDoc(doc(as(CAI), 'friendships', AB), req(CAI, { m: [ANA, BRU], by: CAI }))); // terceiro forjando amizade alheia
    await no(setDoc(doc(as(CAI), 'friendships', AB), req(ANA))); // terceiro dizendo ser a ANA
    await no(setDoc(doc(as(ANA), 'friendships', 'sozinho'), req(ANA)));
    await no(setDoc(doc(as(ANA), 'friendships', ANA + '_' + ANA), req(ANA, { m: [ANA, ANA] })));
    await no(setDoc(doc(anon(), 'friendships', AB), req(ANA)));
  });
  test('pedir de novo com o pedido já existente não vale (nem vira aceite)', async () => {
    await ok(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
    await no(setDoc(doc(as(BRU), 'friendships', AB), req(BRU, { st: 'active' })));
  });
  test('o pedido precisa levar um código de convite vigente de quem vai receber', async () => {
    const bad = [
      ['sem cd', without(req(ANA), 'cd')], ['cd de outra pessoa', req(ANA, { cd: CODE[CAI] })], ['cd do próprio pedinte', req(ANA, { cd: CODE[ANA] })],
      ['cd que não existe', req(ANA, { cd: 'ZZZZ2222' })], ['cd curto', req(ANA, { cd: 'BBBB222' })], ['cd longo', req(ANA, { cd: 'BBBB22222' })],
      ['cd em minúsculas', req(ANA, { cd: 'bbbb2222' })], ['cd com caminho', req(ANA, { cd: 'B/../CCCC' })], ['cd número', req(ANA, { cd: 22222222 })],
      ['cd nulo', req(ANA, { cd: null })], ['cd lista', req(ANA, { cd: [CODE[BRU]] })],
    ];
    for (const [nome, d] of bad) await no(setDoc(doc(as(ANA), 'friendships', AB), d), nome);
    await ok(setDoc(doc(as(ANA), 'friendships', AB), req(ANA))); // com o código certo, passa
    const s = await getDoc(doc(as(BRU), 'friendships', AB));
    if (s.data().cd !== CODE[BRU]) throw new Error('o código usado deveria ficar gravado no pedido');
  });
  test('trocar o código de convite fecha a porta: quem já conhecia o identificador não consegue pedir', async () => {
    // o BRU troca o código como o app faz: cria o novo e REVOGA o antigo (que fica ocupado)
    await ok(setDoc(doc(as(BRU), 'codes', 'BBBB3333'), codeDoc(BRU, { nm: 'Bruno', mc: 'polvo' })));
    await ok(updateDoc(doc(as(BRU), 'codes', CODE[BRU]), { rv: true }));
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA))); // o código antigo morreu
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA, { cd: CODE[CAI] }))); // e o de outra pessoa não vale
    await ok(setDoc(doc(as(ANA), 'friendships', AB), req(ANA, { cd: 'BBBB3333' }))); // o novo vale
  });
  test('o código antigo não volta a valer nem se outra pessoa tentar ocupá-lo para se passar por quem trocou', async () => {
    await ok(updateDoc(doc(as(BRU), 'codes', CODE[BRU]), { rv: true }));
    await no(setDoc(doc(as(CAI), 'codes', CODE[BRU]), codeDoc(CAI, { nm: 'Bruno', mc: 'polvo' }))); // o CAI não toma o identificador
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
  });
  test('um código que não existe mais (apagado por fora, no console, por exemplo) também não vale', async () => {
    await no(deleteDoc(doc(as(BRU), 'codes', CODE[BRU]))); // o app nunca apaga convite; pelas regras, ninguém consegue
    await seed((d) => deleteDoc(doc(d, 'codes', CODE[BRU])));
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
  });
  test('um convite que foi limpo na saída dos amigos (revogado, sem nome) não vale para pedido', async () => {
    await ok(updateDoc(doc(as(BRU), 'codes', CODE[BRU]), { nm: '-', mc: '-', rv: true }));
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
  });
  test('quem não tem código (nunca entrou ou saiu) não recebe pedidos', async () => {
    await seed((d) => deleteDoc(doc(d, 'codes', CODE[BRU])));
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
  });
  test('o pedido já enviado segue valendo depois que quem recebeu troca o código (aceitar e recusar continuam)', async () => {
    await ok(setDoc(doc(as(ANA), 'friendships', AB), req(ANA)));
    await ok(updateDoc(doc(as(BRU), 'codes', CODE[BRU]), { rv: true }));
    await ok(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp() }));
    await ok(deleteDoc(doc(as(ANA), 'friendships', AB)));
  });
  test('só os dois membros leem a amizade', async () => {
    await seedPair();
    await ok(getDoc(doc(as(ANA), 'friendships', AB)));
    await ok(getDoc(doc(as(BRU), 'friendships', AB)));
    await no(getDoc(doc(as(CAI), 'friendships', AB)));
    await no(getDoc(doc(anon(), 'friendships', AB)));
  });
  test('listar: só where m array-contains eu', async () => {
    await seedPair();
    await seed((d) => setDoc(doc(d, 'friendships', pid(BRU, CAI)), friendDoc({ m: [BRU, CAI], by: BRU })));
    const mine = await ok(getDocs(query(collection(as(ANA), 'friendships'), where('m', 'array-contains', ANA))));
    if (mine.size !== 1) throw new Error('ANA deveria ver 1 amizade, viu ' + mine.size);
    const bru = await ok(getDocs(query(collection(as(BRU), 'friendships'), where('m', 'array-contains', BRU))));
    if (bru.size !== 2) throw new Error('BRU deveria ver 2 amizades, viu ' + bru.size);
    await no(getDocs(query(collection(as(ANA), 'friendships'), where('m', 'array-contains', BRU))));
    await no(getDocs(collection(as(ANA), 'friendships')));
    await no(getDocs(query(collection(anon(), 'friendships'), where('m', 'array-contains', ANA))));
  });

  describe('aceitar', () => {
    const pendente = () => seed((d) => setDoc(doc(d, 'friendships', AB), without(friendDoc({ st: 'pending' }), 'ok')));
    test('quem RECEBEU o pedido aceita', async () => {
      await pendente(); // pedido da ANA para o BRU
      await ok(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp() }));
    });
    test('quem fez o pedido não aceita o próprio pedido', async () => {
      await pendente();
      await no(updateDoc(doc(as(ANA), 'friendships', AB), { st: 'active', ok: serverTimestamp() }));
    });
    test('um terceiro não aceita', async () => {
      await pendente();
      await no(updateDoc(doc(as(CAI), 'friendships', AB), { st: 'active', ok: serverTimestamp() }));
    });
    test('aceitar não deixa mudar mais nada (quem pediu, nomes, membros)', async () => {
      await pendente();
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp(), by: BRU }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp(), nm: 'Outro' }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp(), m: [BRU, CAI] }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp(), w: { [BRU]: { k: 'hi', d: '2026-10-18', at: serverTimestamp() } } }));
    });
    test('o aceite exige ok = hora do servidor e st = active', async () => {
      await pendente();
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: Timestamp.now() }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active' }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'blocked', ok: serverTimestamp() }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ok: serverTimestamp() }));
    });
    test('amizade já ativa não "aceita" de novo nem volta a pendente', async () => {
      await seedPair();
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp() }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'pending' }));
      await no(updateDoc(doc(as(ANA), 'friendships', AB), { st: 'pending' }));
    });
  });

  describe('acenos', () => {
    const w = (o) => ({ k: 'hi', d: '2026-10-18', at: serverTimestamp(), ...o });
    test('um amigo acena (oi e parabéns)', async () => {
      await seedPair();
      await ok(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w() }));
      await ok(updateDoc(doc(as(ANA), 'friendships', AB), { ['w.' + ANA]: w({ k: 'cheer' }) }));
      const s = await getDoc(doc(as(ANA), 'friendships', AB));
      if (!s.data().w[BRU] || !s.data().w[ANA]) throw new Error('os dois acenos deveriam estar gravados');
    });
    test('só a própria entrada muda: não dá para acenar "como o outro"', async () => {
      await seedPair();
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + ANA]: w() }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { w: { [BRU]: w(), [ANA]: w() } }));
    });
    test('recusa aceno fora do formato', async () => {
      await seedPair();
      const bad = [['tipo inventado', w({ k: 'xingar' })], ['dia inválido', w({ d: 'ontem' })], ['at do aparelho', w({ at: Timestamp.now() })],
        ['campo a mais', w({ txt: 'oi' })], ['sem tipo', without(w(), 'k')], ['tipo número', w({ k: 1 })], ['texto livre no lugar', 'oi']];
      for (const [nome, v] of bad) await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: v }), nome);
    });
    test('limite: um aceno a cada 10 minutos por amizade', async () => {
      await seedPair();
      await ok(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w() }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w({ k: 'cheer' }) })); // logo em seguida
      await ok(updateDoc(doc(as(ANA), 'friendships', AB), { ['w.' + ANA]: w() })); // o outro lado tem o próprio limite
    });
    test('passados 10 minutos, pode acenar de novo', async () => {
      await seedPair({ w: { [BRU]: { k: 'hi', d: '2026-10-17', at: ago(11) } } });
      await ok(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w() }));
      await env.clearFirestore();
      await seedPair({ w: { [BRU]: { k: 'hi', d: '2026-10-17', at: ago(2) } } });
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w() }));
    });
    test('não dá para acenar em pedido pendente, nem de fora', async () => {
      await seed((d) => setDoc(doc(d, 'friendships', AB), without(friendDoc({ st: 'pending' }), 'ok')));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w() }));
      await env.clearFirestore();
      await seedPair();
      await no(updateDoc(doc(as(CAI), 'friendships', AB), { ['w.' + CAI]: w() }));
      await no(updateDoc(doc(anon(), 'friendships', AB), { ['w.' + BRU]: w() }));
    });
    test('acenar não deixa mexer em mais nada junto', async () => {
      await seedPair();
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w(), nm: 'Outro' }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w(), by: BRU }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w(), st: 'pending' }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w(), m: [BRU, CAI] }));
    });
    test('ninguém edita nomes ou membros da amizade por conta própria', async () => {
      await seedPair();
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { nm: 'Outro' }));
      await no(updateDoc(doc(as(ANA), 'friendships', AB), { m: [ANA, CAI] }));
      await no(updateDoc(doc(as(ANA), 'friendships', AB), { cd: CODE[CAI] }));
      await no(updateDoc(doc(as(BRU), 'friendships', AB), { cd: CODE[ANA] }));
    });
  });

  describe('apagar', () => {
    test('os dois lados apagam um pedido ou uma amizade; um terceiro, não', async () => {
      await seedPair();
      await no(deleteDoc(doc(as(CAI), 'friendships', AB)));
      await no(deleteDoc(doc(anon(), 'friendships', AB)));
      await ok(deleteDoc(doc(as(ANA), 'friendships', AB)));
      await seed((d) => setDoc(doc(d, 'friendships', AB), without(friendDoc({ st: 'pending' }), 'ok')));
      await ok(deleteDoc(doc(as(BRU), 'friendships', AB))); // recusar
      await seed((d) => setDoc(doc(d, 'friendships', AB), without(friendDoc({ st: 'pending' }), 'ok')));
      await ok(deleteDoc(doc(as(ANA), 'friendships', AB))); // cancelar o pedido
    });
  });
});

describe('turma única (1.2.0): amizades automáticas, criadas só pelo servidor', () => {
  beforeEach(seedCodes);
  const autoDoc = (o) => without(friendDoc(Object.assign({ auto: true }, o)), 'cd'); // como o servidor grava: sem "cd", com "auto: true"
  const seedAuto = (o) => seed((d) => setDoc(doc(d, 'friendships', AB), autoDoc(o)));
  const w = (o) => Object.assign({ k: 'hi', d: '2026-10-18', at: serverTimestamp() }, o);
  test('o app nunca cria amizade com "auto": nem como pedido, nem já ativa, nem em nome de outra pessoa (o pedido sem a marca passa)', async () => {
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA, { auto: true })));
    await no(setDoc(doc(as(ANA), 'friendships', AB), req(ANA, { auto: false })));
    await no(setDoc(doc(as(ANA), 'friendships', AB), autoDoc({ by: ANA })));
    await no(setDoc(doc(as(BRU), 'friendships', AB), autoDoc({ by: ANA })));
    await no(setDoc(doc(as(BRU), 'friendships', AB), autoDoc({ by: BRU })));
    await no(setDoc(doc(as(CAI), 'friendships', AB), autoDoc())); // um terceiro forjando
    await no(setDoc(doc(as(ANA), 'friendships', AB), friendDoc())); // ativa, mesmo sem a marca
    await ok(setDoc(doc(as(ANA), 'friendships', AB), req(ANA))); // o controle: o pedido de verdade entra, então as recusas acima eram por causa da marca
  });
  test('ninguém põe "auto" ao aceitar ou acenar, nem tira ou muda a marca de uma amizade automática', async () => {
    await seed((d) => setDoc(doc(d, 'friendships', AB), without(friendDoc({ st: 'pending' }), 'ok')));
    await no(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp(), auto: true })); // aceitar com a marca
    await ok(updateDoc(doc(as(BRU), 'friendships', AB), { st: 'active', ok: serverTimestamp() })); // controle: o aceite sem ela passa
    await no(updateDoc(doc(as(ANA), 'friendships', AB), { ['w.' + ANA]: w(), auto: true })); // acenar com a marca
    await env.clearFirestore();
    await seedAuto();
    await no(updateDoc(doc(as(ANA), 'friendships', AB), { auto: deleteField() }));
    await no(updateDoc(doc(as(ANA), 'friendships', AB), { auto: false }));
    await no(updateDoc(doc(as(BRU), 'friendships', AB), { auto: deleteField(), ['w.' + BRU]: w() })); // nem escondida dentro de um aceno
    const s = (await ok(getDoc(doc(as(ANA), 'friendships', AB)))).data();
    if (s.auto !== true) throw new Error('a marca "auto" deveria seguir intacta');
  });
  test('amizade automática vale como qualquer outra: os dois leem, o perfil abre nos dois sentidos, o aceno funciona e qualquer um desfaz', async () => {
    await seedAuto();
    await seedProfile(ANA);
    await seedProfile(BRU, { nm: 'Bruno', mc: 'polvo' });
    await ok(getDoc(doc(as(ANA), 'friendships', AB)));
    await ok(getDoc(doc(as(BRU), 'friendships', AB)));
    await no(getDoc(doc(as(CAI), 'friendships', AB)));
    const mine = await ok(getDocs(query(collection(as(BRU), 'friendships'), where('m', 'array-contains', BRU))));
    if (mine.size !== 1) throw new Error('a lista do BRU deveria trazer a amizade automática');
    await ok(getDoc(doc(as(BRU), 'profiles', ANA)));
    await ok(getDoc(doc(as(ANA), 'profiles', BRU)));
    await no(getDoc(doc(as(CAI), 'profiles', ANA)));
    await ok(updateDoc(doc(as(BRU), 'friendships', AB), { ['w.' + BRU]: w() }));
    await ok(updateDoc(doc(as(ANA), 'friendships', AB), { ['w.' + ANA]: w({ k: 'cheer' }) }));
    await no(updateDoc(doc(as(CAI), 'friendships', AB), { ['w.' + CAI]: w() }));
    await no(deleteDoc(doc(as(CAI), 'friendships', AB)));
    await ok(deleteDoc(doc(as(ANA), 'friendships', AB)));
    await no(getDoc(doc(as(BRU), 'profiles', ANA)));
    await no(getDoc(doc(as(ANA), 'profiles', BRU)));
  });
  test('turma de três (duas amizades feitas à mão, uma automática): todos leem todos; quem sai apaga as suas e deixa de ler e de ser lido, os outros dois seguem', async () => {
    const AC = pid(ANA, CAI), BC = pid(BRU, CAI);
    await seed(async (d) => {
      await setDoc(doc(d, 'friendships', AB), friendDoc()); // a mão
      await setDoc(doc(d, 'friendships', BC), friendDoc({ m: [BRU, CAI], by: BRU, tn: 'Caio' })); // a mão
      await setDoc(doc(d, 'friendships', AC), autoDoc({ m: [ANA, CAI], by: ANA, tn: 'Caio' })); // fechada pelo servidor
    });
    for (const u of [ANA, BRU, CAI]) await seedProfile(u, { nm: u.slice(0, 3) });
    for (const [a, b] of [[ANA, BRU], [BRU, ANA], [ANA, CAI], [CAI, ANA], [BRU, CAI], [CAI, BRU]]) await ok(getDoc(doc(as(a), 'profiles', b)), a.slice(0, 3) + ' lê ' + b.slice(0, 3));
    await ok(deleteDoc(doc(as(CAI), 'friendships', AC))); // Caio sai da turma: apaga as duas amizades dele
    await ok(deleteDoc(doc(as(CAI), 'friendships', BC)));
    for (const [a, b] of [[ANA, CAI], [CAI, ANA], [BRU, CAI], [CAI, BRU]]) await no(getDoc(doc(as(a), 'profiles', b)), a.slice(0, 3) + ' não lê ' + b.slice(0, 3));
    await ok(getDoc(doc(as(ANA), 'profiles', BRU)));
    await ok(getDoc(doc(as(BRU), 'profiles', ANA)));
  });
});

describe('ids com maiúsculas e minúsculas (como os do login anônimo de verdade)', () => {
  // 'Zed…' < 'ada…' pela tabela ASCII, mas 'ada…' < 'zed…' em minúsculas: o app e as regras precisam concordar na segunda
  const ZED = 'Zed' + 'x'.repeat(25), ADA = 'ada' + 'x'.repeat(25), N9 = '9nine' + 'x'.repeat(23);
  test('o par é montado igual no app e nas regras; o perfil abre para o amigo e fecha para o resto', async () => {
    for (const [a, b] of [[ZED, ADA], [ADA, ZED], [N9, ZED], [ZED, N9], [N9, ADA]]) {
      const id = pid(a, b);
      if (id !== pid(b, a)) throw new Error('o par não é simétrico');
      await env.clearFirestore();
      await seed((d) => setDoc(doc(d, 'profiles', b), prof()));
      await seed((d) => setDoc(doc(d, 'codes', 'BBBB2222'), { uid: b, nm: 'B', mc: 'concha' })); // o convite de quem vai receber
      await ok(setDoc(doc(as(a), 'friendships', id), { m: id.split('_'), by: a, st: 'pending', nm: 'A', mc: 'concha', tn: 'B', tc: 'concha', cd: 'BBBB2222', at: serverTimestamp() }));
      await no(getDoc(doc(as(a), 'profiles', b)));
      await ok(updateDoc(doc(as(b), 'friendships', id), { st: 'active', ok: serverTimestamp() }));
      await ok(getDoc(doc(as(a), 'profiles', b)));
      await no(getDoc(doc(as(CAI), 'profiles', b)));
    }
  });
  test('o id na ordem "errada" (maiúscula antes) é recusado', async () => {
    const certo = pid(ZED, ADA), errado = certo.split('_').reverse().join('_');
    await seed((d) => setDoc(doc(d, 'codes', 'AAAA2222'), { uid: ADA, nm: 'Ada', mc: 'concha' })); // o convite existe: só a ordem do id é o problema
    await no(setDoc(doc(as(ZED), 'friendships', errado), { m: errado.split('_'), by: ZED, st: 'pending', nm: 'A', mc: 'concha', tn: 'B', tc: 'concha', cd: 'AAAA2222', at: serverTimestamp() }));
  });
});

describe('fluxo completo, do convite ao fim', () => {
  test('convite → pedido → aceite → perfis visíveis → aceno → remoção → perfis fechados', async () => {
    await ok(setDoc(doc(as(ANA), 'profiles', ANA), prof()));
    await ok(setDoc(doc(as(ANA), 'codes', 'ABCD2345'), codeDoc(ANA)));
    await ok(setDoc(doc(as(BRU), 'profiles', BRU), prof({ nm: 'Bruno', mc: 'polvo' })));
    const c = await ok(getDoc(doc(as(BRU), 'codes', 'ABCD2345')));
    if (c.data().uid !== ANA) throw new Error('o código deveria apontar para a ANA');
    await no(getDoc(doc(as(BRU), 'profiles', ANA)));
    await ok(setDoc(doc(as(BRU), 'friendships', AB), req(BRU, { nm: 'Bruno', mc: 'polvo', tn: 'Ana', tc: 'cavalo', cd: 'ABCD2345' })));
    await no(getDoc(doc(as(BRU), 'profiles', ANA))); // ainda pendente
    await ok(updateDoc(doc(as(ANA), 'friendships', AB), { st: 'active', ok: serverTimestamp() }));
    await ok(getDoc(doc(as(BRU), 'profiles', ANA)));
    await ok(getDoc(doc(as(ANA), 'profiles', BRU)));
    await ok(updateDoc(doc(as(ANA), 'friendships', AB), { ['w.' + ANA]: { k: 'cheer', d: '2026-10-18', at: serverTimestamp() } }));
    await ok(deleteDoc(doc(as(ANA), 'friendships', AB)));
    await no(getDoc(doc(as(BRU), 'profiles', ANA)));
    await no(getDoc(doc(as(ANA), 'profiles', BRU)));
  });
});

describe('avisos dos amigos (1.1.1): a escolha em users/{uid}.social e o registro pushlog', () => {
  const mine = (u) => doc(as(u || ANA), 'users', u || ANA);
  test('o dono liga e desliga os avisos (social.push), criando o documento ou atualizando', async () => {
    await ok(setDoc(mine(), { social: { push: false }, updatedAt: serverTimestamp() }, { merge: true })); // como o app grava (sem o documento ainda)
    await ok(setDoc(mine(), { social: { push: true }, updatedAt: serverTimestamp() }, { merge: true }));
    await ok(updateDoc(mine(), { 'social.push': false }));
    const s = (await ok(getDoc(mine()))).data();
    if (s.social.push !== false) throw new Error('o valor gravado deveria ser false');
  });
  test('social é um mapa só com push, hit e week, cada um true ou false (qualquer um pode faltar): nada de texto, número, nulo, campo a mais ou outro nome', async () => {
    const bads = [{ push: 'sim' }, { push: 1 }, { push: 0 }, { push: null }, { push: [] }, { hit: 'sim' }, { hit: 1 }, { hit: 0 }, { hit: null }, { hit: {} }, { week: 'sim' }, { week: 1 }, { week: null }, { week: [] },
      { push: true, hit: false, week: 'sim' }, { push: true, extra: 1 }, { hit: true, outro: false }, { week: true, push: false, hit: true, quarto: true }, { pushh: true }, { on: true }, { Hit: true }, { weekly: true },
      true, 'push', 7, null, [true], [{ push: true }]];
    for (const bad of bads) await no(setDoc(mine(), { social: bad }, { merge: true }), JSON.stringify(bad));
    await seed((d) => setDoc(doc(d, 'users', ANA), { goal: 2000 }));
    for (const [k, v] of [['social.push', 'nao'], ['social.hit', 'nao'], ['social.week', 1], ['social.hit', null], ['social.extra', true]]) await no(updateDoc(mine(), { [k]: v }), k);
  });
  test('as três escolhas (push, hit e week), juntas ou em separado, entram: é assim que o app grava (e o mapa vazio também vale)', async () => {
    await ok(setDoc(mine(), { social: { push: true, hit: false, week: true }, updatedAt: serverTimestamp() }, { merge: true })); // o padrão que o servidor assume
    await ok(setDoc(mine(), { social: { push: false, hit: true, week: false }, updatedAt: serverTimestamp() }, { merge: true }));
    await ok(updateDoc(mine(), { 'social.hit': false }));
    await ok(updateDoc(mine(), { 'social.week': true }));
    await ok(updateDoc(mine(), { 'social.push': true }));
    const s = (await ok(getDoc(mine()))).data();
    if (s.social.push !== true || s.social.hit !== false || s.social.week !== true) throw new Error('as três escolhas deveriam estar gravadas: ' + JSON.stringify(s.social));
    for (const part of [{ hit: true }, { week: false }, { push: false }, { hit: true, week: true }, {}]) await ok(setDoc(mine(), { social: part }), JSON.stringify(part)); // cada uma pode vir sozinha
  });
  test('o campo novo não afrouxa o resto: nenhum outro campo entra por ele', async () => {
    await no(setDoc(mine(), { social: { push: true }, apelido: 'x' }, { merge: true }));
    await no(setDoc(mine(), { social: { push: true }, goal: 99999 }, { merge: true })); // meta absurda continua recusada
    await ok(setDoc(mine(), { social: { push: true }, goal: 2000, tz: 'America/Fortaleza' }, { merge: true }));
  });
  test('quem já tem a escolha gravada continua gravando o resto (fcm, lembretes, meta) sem tocar nela', async () => {
    await seed((d) => setDoc(doc(d, 'users', ANA), { goal: 2000, social: { push: false } }));
    await ok(setDoc(mine(), { fcm: { h1: { token: 'abc', ua: 'x', at: serverTimestamp() } }, updatedAt: serverTimestamp() }, { merge: true }));
    await ok(setDoc(mine(), { reminder: { enabled: true, interval: 90 }, updatedAt: serverTimestamp() }, { merge: true }));
    const s = (await ok(getDoc(mine()))).data();
    if (s.social.push !== false) throw new Error('a escolha não podia mudar');
  });
  test('ninguém mexe nem lê a escolha de outra pessoa, nem um amigo aprovado', async () => {
    await seedPair();
    await seed((d) => setDoc(doc(d, 'users', ANA), { social: { push: true } }));
    await no(setDoc(doc(as(BRU), 'users', ANA), { social: { push: false } }, { merge: true }));
    await no(updateDoc(doc(as(BRU), 'users', ANA), { 'social.push': false }));
    await no(getDoc(doc(as(BRU), 'users', ANA)));
    await no(getDoc(doc(as(CAI), 'users', ANA)));
    await no(getDoc(doc(anon(), 'users', ANA)));
    await no(setDoc(doc(anon(), 'users', ANA), { social: { push: false } }, { merge: true }));
  });
  test('pushlog (o registro de limite do servidor) é fechado para o app: ninguém lê, grava, lista nem apaga', async () => {
    await seed((d) => setDoc(doc(d, 'pushlog', ANA), { t: {}, h: [], q: [], exp: new Date() }));
    for (const who of [as(ANA), as(BRU), as(CAI), anon()]) {
      await no(getDoc(doc(who, 'pushlog', ANA)));
      await no(setDoc(doc(who, 'pushlog', ANA), { t: {}, h: [], q: [] }));
      await no(updateDoc(doc(who, 'pushlog', ANA), { h: [] }));
      await no(deleteDoc(doc(who, 'pushlog', ANA)));
      await no(getDocs(collection(who, 'pushlog')));
      await no(setDoc(doc(who, 'pushlog', 'qualquer'), { t: {} }));
    }
    await seedPair();
    await no(getDoc(doc(as(BRU), 'pushlog', ANA))); // nem um amigo aprovado
  });
  test('pushq (a fila do horário de silêncio) também é fechada para o app: ninguém lê, grava, lista nem apaga', async () => {
    await seed((d) => setDoc(doc(d, 'pushq', ANA), { items: [], due: 1, exp: new Date() }));
    for (const who of [as(ANA), as(BRU), as(CAI), anon()]) {
      await no(getDoc(doc(who, 'pushq', ANA)));
      await no(setDoc(doc(who, 'pushq', ANA), { items: [], due: 1 }));
      await no(updateDoc(doc(who, 'pushq', ANA), { due: 2 }));
      await no(deleteDoc(doc(who, 'pushq', ANA)));
      await no(getDocs(collection(who, 'pushq')));
      await no(setDoc(doc(who, 'pushq', 'qualquer'), { items: [] }));
    }
    await seedPair();
    await no(getDoc(doc(as(BRU), 'pushq', ANA))); // nem um amigo aprovado
  });
});
