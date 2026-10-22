// Maré — a turma única (1.2.0) de ponta a ponta no servidor. Quando alguém aceita um pedido, as duas turmas (a de quem pediu e a de quem aceitou)
// viram uma só: o servidor cria as amizades que faltam (marcadas "auto: true"), avisa quem já estava na turma ("X entrou na turma") e uma
// conferência diária completa o que ficou pela metade. Roda o código de verdade (functions/network.js e friend-push.js) com o Admin SDK contra o
// emulador do Firestore, um FCM de mentira e um relógio nosso. A última parte usa o app de verdade (public/js/social-cloud.js) com as regras
// de segurança de verdade, e a penúltima o index.js que o firebase deploy publica. A parte pura (planClosure, autoDoc) está em tests/crew.test.js.
// Rodar: npm run test:rules. Precisa do Admin SDK da pasta functions/ (cd functions && npm install); sem ele, estes testes são pulados.
import { test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { serverEnv, U, T0, TODAY, DAY } from '../helpers/server-env.js';
import { growNetwork, handleFriendship, reconcileAll, crewOf, friendsOf, CREW_MAX } from '../../functions/network.js';
import { flushQueue } from '../../functions/friend-push.js';

const E = serverEnv('demo-mare-network');
E.setup();
const NB = String.fromCharCode(160); // o espaço que não quebra, entre o texto e o emoji
const J = (t) => t + NB + '🌊'; // o título de um aviso "entrou na turma"
const ANA = U('ana'), BIA = U('bia'), CAIO = U('caio'), DUDA = U('duda'), EDU = U('edu'), FABI = U('fabi'), GUI = U('gui');
const NAMES = { [ANA]: 'Ana', [BIA]: 'Bia', [CAIO]: 'Caio', [DUDA]: 'Duda', [EDU]: 'Edu', [FABI]: 'Fabi', [GUI]: 'Gui' };

/* ---------- montar o cenário ---------- */
// Os ids das amizades entre todos de uma lista (todos com todos), em ordem
const pairsOf = (list) => { const o = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) o.push(E.pid(list[i], list[j])); return o.sort(); };
const prof = (nm) => ({ v: 1, nm: nm, mc: 'concha', ins: ['concha'], pct: 0, met: false, st: 0, day: TODAY, sh: true, gl: 2000, wm: 0 });
// Vários documentos de uma vez ([caminho, dados]), em lotes (o Firestore aceita 500 por lote)
async function writeAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = E.adb.batch();
    ops.slice(i, i + 400).forEach((o) => { b.set(E.adb.doc(o[0]), o[1]); });
    await b.commit();
  }
}
// n ids de teste "<p>01".."<p>nn"
const ids = (p, n) => Array.from({ length: n }, (_, i) => U(p + String(i + 1).padStart(2, '0')));
// Pessoas com perfil ("Pessoa 1", "Pessoa 2"…) ligadas em cadeia (a 1ª à 2ª, a 2ª à 3ª…): como ficaram as turmas feitas amizade por amizade, antes da 1.2.0
async function chain(list, o) {
  const ops = list.map((u, i) => ['profiles/' + u, prof('Pessoa ' + (i + 1))]);
  for (let i = 0; i + 1 < list.length; i++) { const id = E.pid(list[i], list[i + 1]), m = id.split('_'); ops.push(['friendships/' + id, E.activeDoc(m[0], m[1], o)]); }
  await writeAll(ops);
}
// Uma turma completa (todos amigos de todos), cada um com perfil e aparelho; uma pessoa sozinha, com perfil e aparelho
async function team(list, phone) { const names = {}; list.forEach((u) => { names[u] = NAMES[u]; }); await E.crew(names); for (const u of list) await E.phone(u, 1, phone); }
async function solo(u, phone) { await E.profile(u, NAMES[u]); await E.phone(u, 1, phone); }

// O que o gatilho vê quando "other" aceita o pedido de "by": o pedido pendente (que fica gravado) e a mesma amizade já ativa, como o app grava (st e ok)
async function accepted(by, other, over) {
  await E.pending(by, other, over);
  const id = E.pid(by, other), before = await E.snap(id);
  await E.adb.doc('friendships/' + id).update({ st: 'active', ok: E.TS(E.clock.t) });
  return { before: before, after: await E.snap(id) };
}
const grow = async (by, other, over) => growNetwork(await accepted(by, other, over), E.deps());
// Todos amigos de todos: os documentos certos (id = par em ordem, dois membros, ativos), nenhum a mais, nenhum a menos
async function expectComplete(list) {
  const docs = await E.friendshipDocs();
  expect(Object.keys(docs).sort()).toEqual(pairsOf(list));
  Object.keys(docs).forEach((id) => { expect(docs[id].m.join('_')).toBe(id); expect(docs[id].st).toBe('active'); });
}
// Carimbos do Firestore em milissegundos, para comparar documentos inteiros
const plain = (d) => { const o = Object.assign({}, d); ['at', 'ok'].forEach((k) => { if (o[k] && o[k].toMillis) o[k] = o[k].toMillis(); }); return o; };
// A amizade automática entre a e b, como o servidor a cria (nomes de NAMES, relógio de T0)
const autoDocOf = (a, b) => { const m = E.pid(a, b).split('_'); return { m: m, by: m[0], st: 'active', nm: NAMES[m[0]], mc: 'concha', tn: NAMES[m[1]], tc: 'concha', at: T0, ok: T0, auto: true }; };

// O banco do Admin SDK com ganchos nos lotes (onBatch: um lote novo; beforeCommit: logo antes de confirmar), para contar gravações e simular corridas
function wrapDb(hooks) {
  return new Proxy(E.adb, {
    get(t, k) {
      if (k === 'batch') {
        return () => {
          const b = t.batch(), r = { ops: 0, commits: 0 };
          if (hooks.onBatch) hooks.onBatch(r);
          const px = new Proxy(b, {
            get(bt, bk) {
              const v = bt[bk];
              if (bk === 'create' || bk === 'update' || bk === 'set' || bk === 'delete') return (...a) => { r.ops++; v.apply(bt, a); return px; };
              if (bk === 'commit') return async () => { r.commits++; if (hooks.beforeCommit) await hooks.beforeCommit(t, r); return v.call(bt); };
              return typeof v === 'function' ? v.bind(bt) : v;
            },
          });
          return px;
        };
      }
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
// Quantas gravações cada lote levou e quantas vezes foi confirmado
function spyDb() { const batches = []; return { db: wrapDb({ onBatch: (r) => { batches.push(r); } }), batches: batches }; }
// Uma corrida: antes de confirmar o primeiro lote, outra execução grava (ou, com null, apaga) estes documentos: { caminho: dados | null }
function raceDb(rival) {
  let done = false;
  return wrapDb({ beforeCommit: async (t) => {
    if (done) return;
    done = true;
    for (const p of Object.keys(rival)) { if (rival[p] === null) await t.doc(p).delete(); else await t.doc(p).set(rival[p]); }
  } });
}
// O banco com as gravações de algumas amizades falhando, como o Firestore falha de vez em quando (14 UNAVAILABLE): quem pede a referência dessas
// amizades recebe uma que recusa tudo (o lote e a gravação uma a uma, que é o que o servidor tenta depois que um lote falha). O resto funciona.
function flakyDb(isBad) {
  const boom = () => Object.assign(new Error('14 UNAVAILABLE: o Firestore sumiu por um instante'), { code: 14 });
  return new Proxy(E.adb, {
    get(t, k) {
      if (k === 'doc') return (p) => (isBad(p) ? { path: p, create: () => Promise.reject(boom()), update: () => Promise.reject(boom()), set: () => Promise.reject(boom()), delete: () => Promise.reject(boom()) } : t.doc(p));
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
// O banco em que o lote de gravações é montado normalmente, mas o commit() falha (o Firestore some na hora de gravar, 14 UNAVAILABLE)
function failingCommitDb() {
  const boom = () => Object.assign(new Error('14 UNAVAILABLE: o Firestore sumiu por um instante'), { code: 14 });
  return new Proxy(E.adb, {
    get(t, k) {
      if (k === 'batch') return () => { const b = t.batch(); return new Proxy(b, { get(bt, bk) { if (bk === 'commit') return () => Promise.reject(boom()); const v = bt[bk]; return typeof v === 'function' ? v.bind(bt) : v; } }); };
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
// O banco com a consulta das amizades fora do ar (o resto funciona)
function brokenDb() {
  return new Proxy(E.adb, {
    get(t, k) {
      if (k === 'collection') return (n) => { if (n === 'friendships') throw new Error('Firestore fora do ar'); return t.collection(n); };
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/* ============================== juntar as turmas ============================== */
E.suite('a turma única: quando um pedido vira amizade', () => {
  test('duas pessoas sozinhas: fica só a amizade que elas fizeram, e ninguém é avisado de nada', async () => {
    await solo(ANA); await solo(BIA);
    expect(await grow(ANA, BIA)).toEqual({ created: 0, upgraded: 0, joined: 0 });
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA)]);
    expect((await E.snap(E.pid(ANA, BIA))).auto).toBeUndefined(); // a amizade dos dois é "de verdade"
    expect(E.fcm.calls).toHaveLength(0);
    expect(E.logs.filter((l) => l.m === 'turma única')).toHaveLength(0);
  });

  [['a novata pediu e Ana, da turma, aceitou', DUDA, ANA], ['Ana, da turma, pediu e a novata aceitou', ANA, DUDA]].forEach(([quem, by, other]) => {
    test('uma pessoa sozinha entra numa turma de três (' + quem + '): vira amiga de todos e só as outras são avisadas', async () => {
      await team([ANA, BIA, CAIO]); await solo(DUDA);
      expect(await grow(by, other)).toEqual({ created: 2, upgraded: 0, joined: 3 });
      await expectComplete([ANA, BIA, CAIO, DUDA]);
      // as duas amizades novas: no formato das que os aplicativos criam, com a marca "auto"
      const docs = await E.friendshipDocs();
      expect(plain(docs[E.pid(BIA, DUDA)])).toEqual(autoDocOf(BIA, DUDA));
      expect(plain(docs[E.pid(CAIO, DUDA)])).toEqual(autoDocOf(CAIO, DUDA));
      // a que as duas pessoas fizeram e as da turma antiga continuam sem a marca
      [[ANA, DUDA], [ANA, BIA], [ANA, CAIO], [BIA, CAIO]].forEach((p) => { expect(docs[E.pid(p[0], p[1])].auto).toBeUndefined(); });
      // quem aceitou já sabe de quem entrou; os outros dois são avisados; a novata ouve quem já estava lá (sem quem aceitou)
      expect(E.titles(ANA)).toEqual([]);
      expect(E.titles(BIA)).toEqual([J('Duda entrou na turma')]);
      expect(E.titles(CAIO)).toEqual([J('Duda entrou na turma')]);
      expect(E.titles(DUDA)).toEqual([J('Bia e Caio entraram na turma')]);
      expect(E.lastTo(BIA)).toMatchObject({ data: { kind: 'friend', ev: 'joined', tag: 'mare-amigo-joined-' + DUDA, url: './?tab=friends', body: 'Que tal dar as boas-vindas com um aceno?' },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } } });
      expect(E.lastTo(DUDA).data).toMatchObject({ ev: 'joined', tag: 'mare-amigo-joined-' + ANA, body: 'Toque para ver a turma.' });
      expect(E.logs.find((l) => l.m === 'turma única')).toMatchObject({ size: 4, created: 2, upgraded: 0 });
    });
  });

  test('duas turmas viram uma só: todo mundo vira amigo de todo mundo, e cada um ouve quem veio do outro lado', async () => {
    await team([ANA, BIA, CAIO]); await team([DUDA, EDU]);
    const all = [ANA, BIA, CAIO, DUDA, EDU];
    // Caio (turma de 3) pediu a Duda (turma de 2) e Duda aceitou: faltam 3 × 2 − 1 = 5 amizades
    expect(await grow(CAIO, DUDA)).toEqual({ created: 5, upgraded: 0, joined: 5 });
    await expectComplete(all);
    for (const u of all) expect((await friendsOf(E.adb, u)).sort()).toEqual(all.filter((x) => x !== u).sort());
    expect(E.titles(ANA)).toEqual([J('Duda e Edu entraram na turma')]);
    expect(E.titles(BIA)).toEqual([J('Duda e Edu entraram na turma')]);
    expect(E.titles(CAIO)).toEqual([J('Edu entrou na turma')]); // quem pediu já conhece Duda
    expect(E.titles(DUDA)).toEqual([J('Ana e Bia entraram na turma')]); // quem aceitou já conhece Caio
    expect(E.titles(EDU)).toEqual([J('Ana, Bia e mais 1 pessoa entraram na turma')]);
    expect(Object.values(await E.friendshipDocs()).filter((d) => d.auto === true)).toHaveLength(5);
  });

  test('um pedido pendente entre duas pessoas que passam a ser da mesma turma vira amizade; pedido de gente de fora continua pedido', async () => {
    await team([ANA, BIA]); await team([CAIO, DUDA]); await solo(FABI);
    await E.pending(DUDA, BIA, { nm: 'Duda', tn: 'Bia', at: E.TS(T0 - DAY) }); // Duda tinha pedido a Bia e ela não respondeu
    await E.pending(FABI, ANA, { nm: 'Fabi', tn: 'Ana' }); // Fabi pediu a Ana: não é da turma
    expect(await grow(ANA, CAIO)).toEqual({ created: 2, upgraded: 1, joined: 4 });
    const up = await E.snap(E.pid(BIA, DUDA));
    expect(plain(up)).toMatchObject({ st: 'active', auto: true, by: DUDA, nm: 'Duda', tn: 'Bia', ok: T0 });
    expect(up.at.toMillis()).toBe(T0 - DAY); // a data do pedido continua a do pedido
    expect((await E.snap(E.pid(FABI, ANA))).st).toBe('pending');
    expect((await E.snap(E.pid(FABI, ANA))).auto).toBeUndefined();
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA, CAIO, DUDA]).concat([E.pid(FABI, ANA)]).sort());
    expect(E.titles(ANA)).toEqual([J('Duda entrou na turma')]);
    expect(E.titles(BIA)).toEqual([J('Caio e Duda entraram na turma')]);
    expect(E.titles(CAIO)).toEqual([J('Bia entrou na turma')]);
    expect(E.titles(DUDA)).toEqual([J('Ana e Bia entraram na turma')]);
    expect(E.titles(FABI)).toEqual([]);
  });

  test('quem não tem perfil (já saiu) fica de fora da turma: não ganha amizades nem avisos', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    await E.adb.doc('profiles/' + CAIO).delete();
    expect(await grow(DUDA, ANA)).toEqual({ created: 1, upgraded: 0, joined: 2 });
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA, CAIO]).concat([E.pid(ANA, DUDA), E.pid(BIA, DUDA)]).sort()); // sem Caio–Duda
    expect(E.titles(BIA)).toEqual([J('Duda entrou na turma')]);
    expect(E.titles(DUDA)).toEqual([J('Bia entrou na turma')]); // Caio não aparece
    expect(E.titles(CAIO)).toEqual([]);
  });

  test('quem ainda não publicou o perfil aparece como "Amigo" (nas amizades e nos avisos)', async () => {
    await team([ANA, BIA]); await E.phone(DUDA); // Duda não tem perfil
    expect(await grow(DUDA, ANA)).toEqual({ created: 1, upgraded: 0, joined: 2 });
    expect(plain(await E.snap(E.pid(BIA, DUDA)))).toMatchObject({ m: [BIA, DUDA], nm: 'Bia', tn: 'Amigo', mc: 'concha', tc: 'concha', auto: true });
    expect(E.titles(BIA)).toEqual([J('Amigo entrou na turma')]);
  });

  test('o nome nos avisos e nas amizades passa pela mesma limpeza do app (sem < >, sem caracteres invisíveis)', async () => {
    await team([ANA, BIA]); await solo(DUDA);
    await E.adb.doc('profiles/' + DUDA).update({ nm: 'Du<b>da' + String.fromCharCode(0x200B) });
    await grow(DUDA, ANA);
    expect(E.titles(BIA)).toEqual([J('Dubda entrou na turma')]);
    expect((await E.snap(E.pid(BIA, DUDA))).tn).toBe('Dubda');
  });

  test('cada pessoa recebe um envio só, com todos os aparelhos dela', async () => {
    await team([ANA, BIA]); await solo(DUDA);
    await E.phone(BIA, 2);
    await grow(DUDA, ANA);
    expect(E.sentTo(BIA)).toHaveLength(1);
    expect(E.sentTo(BIA)[0].tokens).toEqual([E.tokenOf(BIA, 1), E.tokenOf(BIA, 2)]);
  });

  test('a conta de uma turma de verdade: 31 pessoas ainda é uma turma, e as 435 amizades que faltam saem em dois lotes (400 + 35)', async () => {
    const L = ids('l', 30), NOVO = U('novo');
    await chain(L); await E.profile(NOVO, 'Novo');
    await E.phone(NOVO); await E.phone(L[5]);
    const spy = spyDb();
    const r = await growNetwork(await accepted(NOVO, L[0]), E.deps({ db: spy.db }));
    expect(r).toMatchObject({ created: 435, upgraded: 0, joined: 2 }); // 465 pares − 29 da cadeia − 1 que o Novo fez
    expect(spy.batches.map((b) => b.ops)).toEqual([400, 35]);
    expect(spy.batches.map((b) => b.commits)).toEqual([1, 1]);
    await expectComplete(L.concat([NOVO]));
    expect(E.titles(L[5])).toEqual([J('Novo entrou na turma')]);
    expect(E.titles(NOVO)).toEqual([J('Pessoa 10, Pessoa 11 e mais 27 pessoas entraram na turma')]);
    expect(E.logOf('sem aparelho')).toHaveLength(28); // as outras 28 pessoas foram avisadas também (só não têm aparelho aqui)
  });

  test('uma turma que passaria de 31 pessoas não é juntada: fica só a amizade que a pessoa aceitou', async () => {
    const L = ids('l', 20), R = ids('r', 12);
    await chain(L); await chain(R); await E.phone(L[3]); await E.phone(R[3]);
    expect(await grow(L[0], R[0])).toEqual({ created: 0, upgraded: 0, joined: 0, why: 'grande demais' });
    expect(await E.friendshipIds()).toHaveLength(19 + 11 + 1);
    expect(E.logs.find((l) => l.m === 'turma grande demais para juntar')).toMatchObject({ size: 32, max: CREW_MAX });
    expect(E.fcm.calls).toHaveLength(0);
  });

  test('uma turma de um lado só já passando de 31 também não é juntada (e a busca para cedo)', async () => {
    const L = ids('l', 33);
    await chain(L); await solo(DUDA);
    expect(await grow(DUDA, L[0])).toMatchObject({ created: 0, upgraded: 0, joined: 0, why: 'grande demais' });
    expect(await E.friendshipIds()).toHaveLength(32 + 1);
  });

  test('o aceite foi desfeito antes de o gatilho rodar: a amizade não é recriada e nada é feito', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    const ch = await accepted(DUDA, ANA);
    await E.adb.doc('friendships/' + E.pid(DUDA, ANA)).delete();
    expect(await growNetwork(ch, E.deps())).toEqual({ created: 0, upgraded: 0, joined: 0, why: 'a amizade já não existe' });
    await expectComplete([ANA, BIA, CAIO]);
    expect(E.fcm.calls).toHaveLength(0);
  });

  test('só um pedido que virou amizade junta turmas: pedido novo, aceno, recusa e documento estranho não fazem nada', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    await E.pending(DUDA, ANA);
    const m = E.pid(DUDA, ANA).split('_'), p = E.pairDoc(DUDA, ANA, { m: m }), a = E.activeDoc(DUDA, ANA, { m: m });
    const cases = [[null, p], [p, p], [a, a], [a, null], [p, null], [null, a], [null, null], [p, Object.assign({}, a, { m: [DUDA] })], [{ st: 'pending' }, { st: 'active' }], [p, Object.assign({}, a, { st: 'estranho' })],
      [p, Object.assign({}, a, { m: [DUDA, DUDA] })], [Object.assign({}, p, { st: 'estranho' }), a]];
    const before = await E.friendshipIds();
    for (const c of cases) expect(await growNetwork({ before: c[0], after: c[1] }, E.deps())).toEqual({ created: 0, upgraded: 0, joined: 0 });
    expect(await E.friendshipIds()).toEqual(before);
    expect(E.fcm.calls).toHaveLength(0);
  });

  test('uma amizade "auto" que passa de pedido a ativa nunca junta turmas, mesmo entre duas turmas separadas', async () => {
    await team([ANA, BIA]); await team([CAIO, DUDA]);
    const id = E.pid(BIA, CAIO), m = id.split('_'), doc = E.activeDoc(m[0], m[1], { auto: true });
    await E.adb.doc('friendships/' + id).set(doc);
    expect(await growNetwork({ before: Object.assign({}, doc, { st: 'pending' }), after: doc }, E.deps())).toEqual({ created: 0, upgraded: 0, joined: 0 });
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA]).concat(pairsOf([CAIO, DUDA]), [id]).sort());
    expect(E.fcm.calls).toHaveLength(0);
  });
});

/* ============================== o gatilho entregue mais de uma vez, e as falhas ============================== */
E.suite('a turma única: repetição, corrida e falhas', () => {
  test('o gatilho entregue de novo (o Eventarc pode repetir): nada é criado e ninguém é avisado outra vez', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    const ch = await accepted(DUDA, ANA);
    expect(await growNetwork(ch, E.deps())).toEqual({ created: 2, upgraded: 0, joined: 3 });
    const calls = E.fcm.calls.length, before = await E.friendshipDocs();
    E.clock.t = E.at(0, 10); // dez minutos depois: o limite contra repetição (5 min) já não segura, quem segura é a conta da turma
    expect(await growNetwork(ch, E.deps())).toEqual({ created: 0, upgraded: 0, joined: 0 });
    expect(E.fcm.calls).toHaveLength(calls);
    expect(await E.friendshipDocs()).toEqual(before);
  });

  test('uma rodada que parou no meio: a nova tentativa completa o que falta e não repete avisos (o app mostra a novidade sozinho)', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    const ch = await accepted(DUDA, ANA), m = E.pid(BIA, DUDA).split('_');
    await E.adb.doc('friendships/' + E.pid(BIA, DUDA)).set(E.activeDoc(m[0], m[1], { auto: true, nm: 'Bia', tn: 'Duda' })); // a 1ª rodada criou só esta
    expect(await growNetwork(ch, E.deps())).toEqual({ created: 1, upgraded: 0, joined: 0 });
    await expectComplete([ANA, BIA, CAIO, DUDA]);
    expect(E.fcm.calls).toHaveLength(0);
  });

  test('três execuções ao mesmo tempo para o mesmo aceite: cada amizade nasce uma vez e cada pessoa recebe um aviso só', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    const ch = await accepted(DUDA, ANA);
    const out = await Promise.all([growNetwork(ch, E.deps()), growNetwork(ch, E.deps()), growNetwork(ch, E.deps())]);
    expect(out.reduce((s, r) => s + r.created, 0)).toBe(2);
    await expectComplete([ANA, BIA, CAIO, DUDA]);
    expect([BIA, CAIO, DUDA].map((u) => E.sentTo(u).length)).toEqual([1, 1, 1]);
    expect(E.errors()).toEqual([]);
  });

  test('as amizades criadas pelo servidor não disparam nada de novo (sem laço): nem aviso, nem outra junção', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    await growNetwork(await accepted(DUDA, ANA), E.deps());
    const calls = E.fcm.calls.length, ids0 = await E.friendshipIds(), docs = await E.friendshipDocs();
    const autos = Object.keys(docs).filter((id) => docs[id].auto === true);
    expect(autos).toHaveLength(2);
    for (const id of autos) {
      const d = docs[id], asked = Object.assign({}, d, { st: 'pending' });
      const nada = { sent: 0, grown: { created: 0, upgraded: 0, joined: 0 } };
      expect(await handleFriendship({ before: null, after: d }, E.deps())).toEqual(nada); // a amizade automática nasce já ativa
      expect(await handleFriendship({ before: asked, after: d }, E.deps())).toEqual(nada); // um pedido pendente que o servidor aceitou
    }
    expect(E.fcm.calls).toHaveLength(calls);
    expect(await E.friendshipIds()).toEqual(ids0);
  });

  test('o aviso de aceite e a junção saem juntos; quem pediu recebe os dois, na ordem', async () => {
    await team([ANA, BIA]); await solo(DUDA);
    const r = await handleFriendship(await accepted(DUDA, ANA), E.deps()); // Duda pediu a Ana e Ana aceitou
    expect(r).toEqual({ sent: 1, grown: { created: 1, upgraded: 0, joined: 2 } });
    expect(E.titles(DUDA)).toEqual(['Ana aceitou seu pedido' + NB + '🤗', J('Bia entrou na turma')]);
    expect(E.titles(BIA)).toEqual([J('Duda entrou na turma')]);
    expect(E.titles(ANA)).toEqual([]);
  });

  test('se juntar as turmas falhar, o aviso de aceite já saiu e o erro vai para o registro (o gatilho não cai)', async () => {
    await team([ANA, BIA]); await solo(DUDA);
    const r = await handleFriendship(await accepted(DUDA, ANA), E.deps({ db: brokenDb() }));
    expect(r).toEqual({ sent: 1, grown: null });
    expect(E.titles(DUDA)).toEqual(['Ana aceitou seu pedido' + NB + '🤗']);
    expect(E.errors().map((l) => [l.m, l.err])).toEqual([['turma única falhou', 'Firestore fora do ar']]);
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA), E.pid(ANA, DUDA)].sort());
  });

  test('se o FCM estiver fora do ar, a turma é fechada do mesmo jeito (e os avisos que falharam vão para o registro)', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    E.fcm.down = new Error('FCM fora do ar');
    const r = await handleFriendship(await accepted(DUDA, ANA), E.deps());
    expect(r).toEqual({ sent: 0, grown: { created: 2, upgraded: 0, joined: 0 } });
    await expectComplete([ANA, BIA, CAIO, DUDA]);
    expect(E.errors().map((l) => l.m)).toEqual(Array(4).fill('aviso de amigos falhou')); // o aceite e as três entradas
  });

  test('um aviso que falha para uma pessoa não impede os outros', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    E.fcm.failFor = (t) => t === E.tokenOf(BIA);
    expect(await grow(DUDA, ANA)).toEqual({ created: 2, upgraded: 0, joined: 2 });
    expect(E.titles(BIA)).toEqual([]);
    expect(E.titles(CAIO)).toEqual([J('Duda entrou na turma')]);
    expect(E.titles(DUDA)).toEqual([J('Bia e Caio entraram na turma')]);
    expect(E.errors().map((l) => [l.m, l.kind])).toEqual([['aviso de amigos falhou', 'joined']]);
    await expectComplete([ANA, BIA, CAIO, DUDA]);
  });

  test('quem desligou os avisos dos amigos não recebe "entrou na turma"; a turma é fechada do mesmo jeito', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    await E.phone(BIA, 1, { social: { push: false } });
    expect(await grow(DUDA, ANA)).toEqual({ created: 2, upgraded: 0, joined: 2 });
    expect(E.titles(BIA)).toEqual([]);
    expect(await E.pushq(BIA)).toBeNull();
    expect(E.logOf('desligado')).toHaveLength(1);
    await expectComplete([ANA, BIA, CAIO, DUDA]);
  });

  test('corrida: uma amizade de verdade que aparece no meio do caminho não é tocada; as outras são criadas', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    const ch = await accepted(DUDA, ANA), id = E.pid(BIA, DUDA), m = id.split('_');
    const rival = { ['friendships/' + id]: E.activeDoc(m[0], m[1], { nm: 'Bia', tn: 'Duda', ok: E.TS(T0 + 5000) }) }; // Bia e Duda se aceitaram um ao outro agora mesmo
    expect(await growNetwork(ch, E.deps({ db: raceDb(rival) }))).toMatchObject({ created: 1, upgraded: 0 });
    const d = await E.snap(id);
    expect(d.auto).toBeUndefined();
    expect(d.ok.toMillis()).toBe(T0 + 5000);
    await expectComplete([ANA, BIA, CAIO, DUDA]);
    expect(E.errors()).toEqual([]);
  });

  test('corrida: um pedido que aparece no meio do caminho entre duas pessoas da turma vira amizade', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA);
    const ch = await accepted(DUDA, ANA), id = E.pid(BIA, DUDA), m = id.split('_');
    const rival = { ['friendships/' + id]: E.pairDoc(BIA, DUDA, { m: m, nm: 'Bia', tn: 'Duda' }) }; // Bia pediu a Duda agora mesmo
    expect(await growNetwork(ch, E.deps({ db: raceDb(rival) }))).toMatchObject({ created: 1, upgraded: 1 });
    expect(plain(await E.snap(id))).toMatchObject({ st: 'active', auto: true, by: BIA, ok: T0 });
    await expectComplete([ANA, BIA, CAIO, DUDA]);
  });

  test('corrida: um pedido que sumiu no meio do caminho (recusado) não derruba a junção nem é recriado', async () => {
    await team([ANA, BIA]); await team([CAIO, DUDA]);
    await E.pending(DUDA, BIA, { nm: 'Duda', tn: 'Bia' });
    const ch = await accepted(ANA, CAIO), id = E.pid(BIA, DUDA);
    const r = await growNetwork(ch, E.deps({ db: raceDb({ ['friendships/' + id]: null }) })); // Bia recusou o pedido de Duda agora mesmo
    expect(r).toMatchObject({ created: 2, upgraded: 0 });
    expect(await E.snap(id)).toBeNull();
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA, CAIO, DUDA]).filter((x) => x !== id));
    expect(E.errors()).toEqual([]);
  });

  test('quem está dormindo recebe os "entrou na turma" ao acordar; vários viram um aviso só ("Novidades da turma")', async () => {
    await team([ANA, BIA, CAIO]); await solo(DUDA); await solo(EDU);
    await E.phone(BIA, 1, { wake: '20:00', sleep: '22:00' }); // às 11h dela está dormindo; acorda às 20h
    await grow(DUDA, ANA); // Duda entra
    E.clock.t = E.at(1);
    await grow(EDU, CAIO); // Edu entra, uma hora depois
    const q = await E.pushq(BIA);
    expect(q.items.map((x) => [x.k, x.n, x.title])).toEqual([['joined', 1, J('Duda entrou na turma')], ['joined', 1, J('Edu entrou na turma')]]);
    expect(q.due).toBe(E.at(9)); // 20:00 em Fortaleza = 23:00 em Greenwich
    expect(E.sentTo(BIA)).toHaveLength(0);
    expect(E.titles(CAIO)).toEqual([J('Duda entrou na turma')]); // Caio está acordado: o de Duda saiu na hora (e quem aceita Edu, não é avisado dele)
    E.clock.t = E.at(9, 1);
    expect(await flushQueue(BIA, E.deps())).toBe(1);
    expect(E.lastTo(BIA).data).toMatchObject({ ev: 'digest', title: 'Novidades da turma' + NB + '🌊', body: '2 pessoas novas na turma. Toque para ver a turma.' });
    expect(await E.pushq(BIA)).toBeNull();
  });
});

/* ============================== crewOf e friendsOf ============================== */
E.suite('crewOf e friendsOf: quem é da turma de alguém', () => {
  test('crewOf: quem se liga a ela por amizades ativas, de amigo em amigo; pedidos pendentes aparecem em pairs, mas não ligam ninguém', async () => {
    await chain([ANA, BIA, CAIO, DUDA]);
    await E.pending(EDU, ANA); await E.link(FABI, GUI);
    const c = await crewOf(E.adb, ANA);
    expect(c.members.sort()).toEqual([ANA, BIA, CAIO, DUDA]);
    expect(c.over).toBe(false);
    expect(c.pairs.get(E.pid(EDU, ANA))).toMatchObject({ st: 'pending', by: EDU, auto: false });
    expect(c.pairs.get(E.pid(ANA, BIA)).st).toBe('active');
    expect(c.pairs.has(E.pid(FABI, GUI))).toBe(false);
    expect((await crewOf(E.adb, FABI)).members.sort()).toEqual([FABI, GUI]);
    expect((await crewOf(E.adb, EDU)).members).toEqual([EDU]); // só um pedido: ainda não é de turma nenhuma
  });

  test('crewOf: a amizade em "skip" não conta como ligação (mas é lida: quem chama sabe que ela existe)', async () => {
    await chain([ANA, BIA, CAIO]);
    const c = await crewOf(E.adb, ANA, { skip: E.pid(ANA, BIA) });
    expect(c.members).toEqual([ANA]);
    expect(c.pairs.get(E.pid(ANA, BIA)).st).toBe('active');
    expect((await crewOf(E.adb, BIA, { skip: E.pid(ANA, BIA) })).members.sort()).toEqual([BIA, CAIO]);
  });

  test('crewOf: passou do limite, para de olhar (over)', async () => {
    const L = ids('l', 40);
    await chain(L);
    const big = await crewOf(E.adb, L[0]);
    expect(big.over).toBe(true);
    expect(big.members.length).toBeGreaterThan(CREW_MAX);
    expect(big.members.length).toBeLessThan(40);
    const few = await crewOf(E.adb, L[0], { max: 3 });
    expect(few.over).toBe(true);
    expect(few.members.length).toBe(4);
    expect((await crewOf(E.adb, L[35], { max: 100 })).over).toBe(false);
  });

  test('crewOf e friendsOf ignoram o que não é uma amizade de verdade (id que não bate, membros demais, estado desconhecido)', async () => {
    await E.link(ANA, BIA);
    await E.adb.doc('friendships/qualquercoisa').set(E.activeDoc(ANA, CAIO)); // o id não é o do par
    await E.adb.doc('friendships/' + E.pid(ANA, DUDA)).set(Object.assign(E.activeDoc(ANA, DUDA), { st: 'estranho' }));
    await E.adb.doc('friendships/' + E.pid(ANA, EDU)).set(Object.assign(E.activeDoc(ANA, EDU), { m: [ANA, EDU, FABI] }));
    expect((await crewOf(E.adb, ANA)).members.sort()).toEqual([ANA, BIA]);
    expect(await friendsOf(E.adb, ANA)).toEqual([BIA]);
  });

  test('friendsOf: só as amizades ativas, de quem pede (pedidos pendentes e amizades dos outros ficam de fora)', async () => {
    await E.link(ANA, BIA); await E.link(ANA, CAIO); await E.link(BIA, CAIO); await E.pending(DUDA, ANA); await E.pending(ANA, EDU);
    expect((await friendsOf(E.adb, ANA)).sort()).toEqual([BIA, CAIO]);
    expect((await friendsOf(E.adb, DUDA))).toEqual([]);
    expect((await friendsOf(E.adb, FABI))).toEqual([]);
  });

  test('friendsOf: no máximo 60 (o app guarda 30)', async () => {
    const S = ids('s', 65), ops = S.map((u) => { const id = E.pid(ANA, u), m = id.split('_'); return ['friendships/' + id, E.activeDoc(m[0], m[1])]; });
    await writeAll(ops);
    expect(await friendsOf(E.adb, ANA)).toHaveLength(60);
  });
});

/* ============================== a conferência diária ============================== */
E.suite('reconcileAll: a conferência diária das turmas', () => {
  test('completa uma turma feita amizade por amizade (cadeia de cinco: faltam 6) e não avisa ninguém', async () => {
    const L = ids('c', 5);
    await chain(L); for (const u of L) await E.phone(u);
    const r = await reconcileAll(E.deps());
    expect(r).toEqual({ pairs: 4, crews: 1, created: 6, upgraded: 0, big: 0, orphans: 0, capped: false, failed: 0 });
    await expectComplete(L);
    const docs = await E.friendshipDocs(), autos = Object.keys(docs).filter((id) => docs[id].auto === true);
    expect(autos).toHaveLength(6);
    autos.forEach((id) => { const m = id.split('_'); expect(docs[id]).toMatchObject({ m: m, by: m[0], st: 'active', auto: true }); expect(docs[id].nm).toMatch(/^Pessoa \d$/); expect(docs[id].tn).toMatch(/^Pessoa \d$/); });
    expect(E.fcm.calls).toHaveLength(0);
    expect(E.logs.find((l) => l.m === 'turmas conferidas')).toMatchObject(r);
  });

  test('uma segunda conferência não muda mais nada', async () => {
    await chain(ids('c', 5));
    await reconcileAll(E.deps());
    const before = await E.friendshipDocs();
    expect(await reconcileAll(E.deps())).toEqual({ pairs: 10, crews: 1, created: 0, upgraded: 0, big: 0, orphans: 0, capped: false, failed: 0 });
    expect(await E.friendshipDocs()).toEqual(before);
  });

  test('os amigos de antes da 1.2.0 (um no meio, vários em volta) viram uma turma: todos amigos de todos', async () => {
    await E.profile(ANA, 'Ana'); await E.profile(BIA, 'Bia'); await E.profile(CAIO, 'Caio'); await E.profile(DUDA, 'Duda');
    await E.link(ANA, BIA); await E.link(ANA, CAIO); await E.link(ANA, DUDA);
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 3, crews: 1, created: 3 });
    await expectComplete([ANA, BIA, CAIO, DUDA]);
    expect(plain((await E.friendshipDocs())[E.pid(BIA, CAIO)])).toEqual(autoDocOf(BIA, CAIO));
  });

  test('duas turmas separadas: cada uma é completada, e uma não se mistura com a outra', async () => {
    await chain([ANA, BIA, CAIO]); await chain([DUDA, EDU, FABI]);
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 4, crews: 2, created: 2 });
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA, CAIO]).concat(pairsOf([DUDA, EDU, FABI])).sort());
  });

  test('um par solto não é turma: nada é feito', async () => {
    await chain([ANA, BIA]); await chain([CAIO, DUDA]);
    expect(await reconcileAll(E.deps())).toEqual({ pairs: 2, crews: 0, created: 0, upgraded: 0, big: 0, orphans: 0, capped: false, failed: 0 });
    expect(await E.friendshipIds()).toHaveLength(2);
  });

  test('turma com mais de 31 pessoas: fica como está (e vai para o registro)', async () => {
    await chain(ids('l', 32));
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 31, crews: 0, created: 0, big: 1 });
    expect(await E.friendshipIds()).toHaveLength(31);
    expect(E.logs.find((l) => l.m === 'turma grande demais para completar')).toMatchObject({ size: 32 });
  });

  test('turma com exatamente 31 pessoas: completa as 435 que faltam em dois lotes (400 + 35)', async () => {
    const L = ids('l', 31);
    await chain(L);
    const spy = spyDb();
    expect(await reconcileAll(E.deps({ db: spy.db }))).toMatchObject({ pairs: 30, crews: 1, created: 435, capped: false });
    expect(spy.batches.map((b) => b.ops)).toEqual([400, 35]);
    await expectComplete(L);
  });

  [11, 10].forEach((n) => {
    test('lê as amizades ativas de página em página (' + n + ' pessoas, páginas de 3): nenhuma fica de fora da conta', async () => {
      const L = ids('p', n);
      await chain(L);
      const r = await reconcileAll(E.deps(), { scan: 3 });
      expect(r).toMatchObject({ pairs: n - 1, crews: 1, created: (n * (n - 1)) / 2 - (n - 1) });
      await expectComplete(L);
    });
  });

  test('quem não tem perfil não ganha amizade (nem a turma é desfeita)', async () => {
    await chain([ANA, BIA, CAIO]);
    await E.adb.doc('profiles/' + CAIO).delete();
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 2, crews: 1, created: 0 });
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA), E.pid(BIA, CAIO)].sort());
  });

  test('amizades automáticas de quem já saiu são apagadas; as de verdade ficam (quem sai apaga as suas na hora)', async () => {
    await team([ANA, BIA, CAIO]);
    const docs = await E.friendshipDocs();
    for (const id of [E.pid(ANA, CAIO), E.pid(BIA, CAIO)]) await E.adb.doc('friendships/' + id).update({ auto: true });
    await E.adb.doc('profiles/' + CAIO).delete(); // Caio saiu e o servidor recriou as automáticas no mesmo instante
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 3, crews: 0, created: 0, orphans: 2 }); // "pairs" é o que foi lido, antes de apagar
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA)]);
    // as de verdade (sem "auto") não são apagadas pela conferência, mesmo sem perfil
    await E.adb.doc('friendships/' + E.pid(ANA, CAIO)).set(docs[E.pid(ANA, CAIO)]);
    expect(await reconcileAll(E.deps())).toMatchObject({ orphans: 0 });
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA), E.pid(ANA, CAIO)].sort());
  });

  test('um pedido pendente entre duas pessoas da mesma turma vira amizade na conferência', async () => {
    await chain([ANA, BIA, CAIO]);
    await E.pending(CAIO, ANA, { nm: 'Caio', tn: 'Ana', at: E.TS(T0 - DAY) });
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 2, crews: 1, created: 0, upgraded: 1 });
    expect(plain(await E.snap(E.pid(ANA, CAIO)))).toMatchObject({ st: 'active', auto: true, by: CAIO, nm: 'Caio', ok: T0 });
    await expectComplete([ANA, BIA, CAIO]);
  });

  test('o teto de amizades novas por rodada: o que passar dele fica para o dia seguinte (e o registro avisa)', async () => {
    const Y = ids('y', 5);
    await chain([ANA, BIA, CAIO]); await chain(Y); // a primeira turma falta 1; a segunda falta 6
    const r = await reconcileAll(E.deps(), { maxNew: 6 }); // sobram 5 para a segunda, que precisa de 6
    expect(r).toMatchObject({ created: 1, capped: true, crews: 1 });
    expect(await E.friendshipIds()).toHaveLength(2 + 4 + 1); // só a primeira turma foi completada
    expect(E.errors().map((l) => [l.m, l.missing, l.budget])).toEqual([['limite de amizades novas por rodada', 6, 5]]);
    // no dia seguinte, com o teto de volta, a segunda é completada
    expect(await reconcileAll(E.deps())).toMatchObject({ created: 6, capped: false });
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA, CAIO]).concat(pairsOf(Y)).sort());
  });

  test('o teto é "no máximo": o que cabe exatamente nele é criado', async () => {
    const Y = ids('y', 5);
    await chain([ANA, BIA, CAIO]); await chain(Y);
    expect(await reconcileAll(E.deps(), { maxNew: 7 })).toMatchObject({ created: 7, capped: false, crews: 2 }); // 1 + 6
    expect(E.errors()).toEqual([]);
    expect(await E.friendshipIds()).toEqual(pairsOf([ANA, BIA, CAIO]).concat(pairsOf(Y)).sort());
  });

  // Uma falha do Firestore numa turma (em qualquer ordem em que as turmas apareçam) não derruba a conferência: as outras turmas seguem
  [['a de três falha e a de cinco é completada', [ANA, BIA, CAIO], ids('y', 5)], ['a de cinco falha e a de três é completada', ids('y', 5), [ANA, BIA, CAIO]]].forEach(([quem, bad, ok]) => {
    test('uma turma que falha (o Firestore some por um instante) não impede as outras: ' + quem + ', o erro vai para o registro e a falha fica para a próxima', async () => {
      const links = (l) => l.slice(1).map((u, i) => E.pid(l[i], u)); // as amizades da cadeia (uma de cada vez, como eram antes da 1.2.0)
      const full = (l) => (l.length * (l.length - 1)) / 2;
      await chain(bad); await chain(ok);
      const badIds = pairsOf(bad);
      const r = await reconcileAll(E.deps({ db: flakyDb((p) => p.indexOf('friendships/') === 0 && badIds.indexOf(p.slice('friendships/'.length)) >= 0) }));
      expect(r).toMatchObject({ failed: 1, crews: 1, created: full(ok) - (ok.length - 1) }); // só a turma boa foi completada
      expect(await E.friendshipIds()).toEqual(pairsOf(ok).concat(links(bad)).sort());
      expect(E.errors().map((l) => [l.m, l.size, l.missing, String(l.err).slice(0, 14)])).toEqual([['turma não completada (fica para a próxima conferência)', bad.length, full(bad) - (bad.length - 1), '14 UNAVAILABLE']]);
      expect(E.logs.find((l) => l.m === 'turmas conferidas')).toMatchObject({ failed: 1 });
      // na conferência seguinte (o Firestore voltou), a que falhou é completada
      expect(await reconcileAll(E.deps())).toMatchObject({ failed: 0, crews: 2, created: full(bad) - (bad.length - 1) });
      expect(await E.friendshipIds()).toEqual(pairsOf(ok).concat(pairsOf(bad)).sort());
    });
  });

  test('apagar as amizades automáticas de quem saiu falha: a conferência segue e completa as turmas (a falha é contada, e as órfãs saem na próxima)', async () => {
    await team([ANA, BIA, CAIO]);
    for (const id of [E.pid(ANA, CAIO), E.pid(BIA, CAIO)]) await E.adb.doc('friendships/' + id).update({ auto: true });
    await E.adb.doc('profiles/' + CAIO).delete(); // Caio saiu e o servidor recriou as automáticas no mesmo instante
    const Y = ids('y', 4);
    await chain(Y); // outra turma, esta incompleta (faltam 3)
    const orphans = [E.pid(ANA, CAIO), E.pid(BIA, CAIO)].map((id) => 'friendships/' + id);
    const r = await reconcileAll(E.deps({ db: flakyDb((p) => orphans.indexOf(p) >= 0) }));
    expect(r).toMatchObject({ failed: 1, orphans: 0, created: 3, crews: 2 }); // com as órfãs ainda lá, a turma de Caio parece completa e entra na conta; a outra foi completada
    expect((await E.friendshipIds()).filter((id) => id.indexOf(CAIO) >= 0)).toHaveLength(2); // as órfãs continuam lá
    expect(E.errors().map((l) => [l.m, l.found])).toEqual([['amizades automáticas de quem saiu não foram apagadas', 2]]);
    expect(await reconcileAll(E.deps())).toMatchObject({ failed: 0, orphans: 2, created: 0 });
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA)].concat(pairsOf(Y)).sort());
  });

  test('o lote que apaga as órfãs falha só na hora de gravar: nada é contado como apagado, a falha é contada e a próxima rodada apaga', async () => {
    await team([ANA, BIA, CAIO]);
    for (const id of [E.pid(ANA, CAIO), E.pid(BIA, CAIO)]) await E.adb.doc('friendships/' + id).update({ auto: true });
    await E.adb.doc('profiles/' + CAIO).delete(); // Caio saiu e o servidor recriou as automáticas no mesmo instante
    const r = await reconcileAll(E.deps({ db: failingCommitDb() }));
    expect(r).toMatchObject({ failed: 1, orphans: 0 }); // o lote não gravou: não pode contar como apagado
    expect((await E.friendshipIds()).filter((id) => id.indexOf(CAIO) >= 0)).toHaveLength(2); // as órfãs continuam lá
    expect(E.errors().map((l) => [l.m, l.found])).toEqual([['amizades automáticas de quem saiu não foram apagadas', 2]]);
    expect(await reconcileAll(E.deps())).toMatchObject({ failed: 0, orphans: 2 });
    expect(await E.friendshipIds()).toEqual([E.pid(ANA, BIA)]);
  });

  test('duas conferências ao mesmo tempo: cada amizade nasce uma vez e nada falha', async () => {
    const L = ids('c', 6);
    await chain(L);
    const out = await Promise.all([reconcileAll(E.deps()), reconcileAll(E.deps()), reconcileAll(E.deps())]);
    expect(out.reduce((s, r) => s + r.created, 0)).toBe(15 - 5);
    await expectComplete(L);
    expect(E.errors()).toEqual([]);
  });
});

/* ============================== o app de verdade, com as regras de verdade ============================== */
E.suite('de ponta a ponta, com o app de verdade e as regras de verdade', () => {
  // Ids que misturam maiúsculas e minúsculas: a ordem do ASCII ("Bruna" < "Zelia" < "abel") não é a do pairId, que compara em minúsculas
  const ZELIA = U('Zelia'), ABEL = U('abel'), BRUNA = U('Bruna'), CARLOS = U('carlos');
  async function four() {
    const P = {}, code = {};
    for (const x of [[ZELIA, 'Zélia'], [ABEL, 'Abel'], [BRUNA, 'Bruna'], [CARLOS, 'Carlos']]) { P[x[0]] = E.person(x[1], x[0]); code[x[0]] = await E.join(P[x[0]]); await E.phone(x[0]); }
    return { P: P, code: code };
  }
  const watch = async (a, b, act) => { const id = E.pid(a, b), before = await E.snap(id); await act(); return { before: before, after: await E.snap(id) }; };
  // "from pede a to pelo convite e to aceita", pelas regras de verdade; devolve o que o gatilho veria
  const ask = async (X, from, to) => { await X.P[from].sc.request(X.code[to]); return watch(from, to, () => X.P[to].sc.accept(from)); };
  // Os quatro vão se juntando: Zélia–Abel; Bruna pede a Zélia; Carlos pede a Abel
  async function merged() {
    const X = await four();
    expect(await handleFriendship(await ask(X, ZELIA, ABEL), E.deps())).toEqual({ sent: 1, grown: { created: 0, upgraded: 0, joined: 0 } });
    expect(await handleFriendship(await ask(X, BRUNA, ZELIA), E.deps())).toEqual({ sent: 1, grown: { created: 1, upgraded: 0, joined: 2 } });
    expect(await handleFriendship(await ask(X, CARLOS, ABEL), E.deps())).toEqual({ sent: 1, grown: { created: 2, upgraded: 0, joined: 3 } });
    return X;
  }
  const seen = (X, u) => X.P[u].sc.state().friends.map((f) => f.nm).sort();

  test('os quatro vão se juntando (pedido, aceite, servidor); no fim cada um vê os outros três, e os avisos dizem quem chegou', async () => {
    const X = await merged();
    await E.friendshipIds().then((l) => expect(l).toEqual(pairsOf([ZELIA, ABEL, BRUNA, CARLOS])));
    for (const u of Object.keys(X.P)) await X.P[u].sc.refresh();
    expect(seen(X, ZELIA)).toEqual(['Abel', 'Bruna', 'Carlos']);
    expect(seen(X, ABEL)).toEqual(['Bruna', 'Carlos', 'Zélia']);
    expect(seen(X, BRUNA)).toEqual(['Abel', 'Carlos', 'Zélia']);
    expect(seen(X, CARLOS)).toEqual(['Abel', 'Bruna', 'Zélia']);
    Object.keys(X.P).forEach((u) => { expect(X.P[u].sc.state().reqIn).toEqual([]); expect(X.P[u].sc.state().reqOut).toEqual([]); });
    expect(E.titles(ZELIA)).toEqual(['Abel aceitou seu pedido' + NB + '🤗', J('Carlos entrou na turma')]);
    expect(E.titles(ABEL)).toEqual([J('Bruna entrou na turma')]);
    expect(E.titles(BRUNA)).toEqual(['Zélia aceitou seu pedido' + NB + '🤗', J('Abel entrou na turma'), J('Carlos entrou na turma')]);
    expect(E.titles(CARLOS)).toEqual(['Abel aceitou seu pedido' + NB + '🤗', J('Bruna e Zélia entraram na turma')]);
  });

  test('amigos automáticos leem o perfil um do outro e acenam; quem não é da turma não lê nada', async () => {
    const X = await merged();
    const db = (u) => E.env.authenticatedContext(u).firestore();
    await assertSucceeds(FS.getDoc(FS.doc(db(CARLOS), 'profiles', BRUNA))); // Carlos e Bruna são amigos só pela turma
    await assertFails(FS.getDoc(FS.doc(db(U('estranho')), 'profiles', BRUNA)));
    await X.P[CARLOS].sc.refresh();
    const t = await watch(ZELIA, CARLOS, () => X.P[CARLOS].sc.wave(ZELIA, 'hi', TODAY)); // Carlos acena para Zélia (amizade automática)
    expect(await handleFriendship(t, E.deps())).toMatchObject({ sent: 1 });
    expect(E.lastTo(ZELIA).data).toMatchObject({ ev: 'wave', title: 'Carlos acenou para você' + NB + '👋' });
  });

  test('quem desfaz uma amizade automática a vê voltar na conferência do dia; quem sai da turma (leave) não volta', async () => {
    const X = await merged();
    await X.P[CARLOS].sc.refresh();
    await X.P[CARLOS].sc.remove(ZELIA); // Carlos desfaz a amizade (automática) com Zélia
    expect(await E.snap(E.pid(CARLOS, ZELIA))).toBeNull();
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 5, crews: 1, created: 1, upgraded: 0 });
    expect(await E.snap(E.pid(CARLOS, ZELIA))).toMatchObject({ auto: true, st: 'active' });
    // Carlos sai da turma: apaga as amizades dele, o perfil e os convites; a conferência não o traz de volta
    await X.P[CARLOS].sc.leave();
    expect((await E.adb.doc('profiles/' + CARLOS).get()).exists).toBe(false);
    expect(await reconcileAll(E.deps())).toMatchObject({ pairs: 3, crews: 1, created: 0, orphans: 0 });
    expect(await E.friendshipIds()).toEqual(pairsOf([ZELIA, ABEL, BRUNA]));
    await X.P[ZELIA].sc.refresh();
    expect(seen(X, ZELIA)).toEqual(['Abel', 'Bruna']);
  });
});

/* ============================== o gatilho e a conferência de verdade (functions/index.js) ============================== */
// O mesmo arquivo que o firebase deploy publica, ligado ao emulador e ao Admin SDK de verdade, com o transporte do FCM trocado por um que só anota o envio.
// Com o relógio de verdade: quem recebe nunca dorme (wake igual a sleep).
const snapOf = (d) => ({ exists: d != null, data: () => d });
E.suite('o gatilho e a conferência de verdade (functions/index.js)', () => {
  let mod, sent;
  beforeAll(async () => {
    process.env.GCLOUD_PROJECT = E.project;
    mod = await import('../../functions/index.js'); // inicia o app padrão do Admin SDK, como na nuvem
  });
  afterAll(async () => { await E.A.app.deleteApp(E.A.app.getApp()).catch(() => {}); });
  beforeEach((ctx) => {
    const m = E.A.msg.getMessaging(); // o mesmo que o index.js usa (app padrão)
    if (typeof m.enableLegacyHttpTransport !== 'function' || !m.messagingRequestHandler || typeof m.messagingRequestHandler.invokeHttpRequestHandlerForSendResponse !== 'function') ctx.skip();
    m.enableLegacyHttpTransport();
    sent = [];
    m.messagingRequestHandler.invokeHttpRequestHandlerForSendResponse = async (host, p, request) => { sent.push(request.message); return { success: true, messageId: 'projects/demo/messages/' + sent.length }; };
  });
  const run = (id, before, after) => mod.onFriendship.run({ data: { before: snapOf(before), after: snapOf(after) }, params: { pair: id } });
  const titlesTo = (uid) => sent.filter((x) => x.token === E.tokenOf(uid)).map((x) => x.data.title);

  test('onFriendship: um pedido que vira amizade fecha a turma e avisa quem já estava nela', async () => {
    await team([ANA, BIA, CAIO], E.AWAKE); await solo(DUDA, E.AWAKE);
    const ch = await accepted(DUDA, ANA);
    await run(E.pid(DUDA, ANA), ch.before, ch.after);
    await expectComplete([ANA, BIA, CAIO, DUDA]);
    expect(titlesTo(DUDA)).toEqual(['Ana aceitou seu pedido' + NB + '🤗', J('Bia e Caio entraram na turma')]);
    expect(titlesTo(BIA)).toEqual([J('Duda entrou na turma')]);
    expect(titlesTo(CAIO)).toEqual([J('Duda entrou na turma')]);
    expect(titlesTo(ANA)).toEqual([]);
  });

  test('onFriendship: as amizades que o próprio servidor criou voltam ao gatilho e não fazem nada (sem laço)', async () => {
    await team([ANA, BIA, CAIO], E.AWAKE); await solo(DUDA, E.AWAKE);
    const ch = await accepted(DUDA, ANA);
    await run(E.pid(DUDA, ANA), ch.before, ch.after);
    const calls = sent.length, docs = await E.friendshipDocs(), before = Object.keys(docs);
    for (const id of before.filter((k) => docs[k].auto === true)) await run(id, null, docs[id]);
    expect(sent).toHaveLength(calls);
    expect(await E.friendshipIds()).toEqual(before.sort());
  });

  test('reconcileNetworks: completa as turmas feitas amizade por amizade e não avisa ninguém', async () => {
    const L = ids('c', 4);
    await chain(L); for (const u of L) await E.phone(u, 1, E.AWAKE);
    await mod.reconcileNetworks.run({});
    await expectComplete(L);
    expect(sent).toHaveLength(0);
  });
});
