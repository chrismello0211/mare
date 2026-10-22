// Maré — testes da camada de amigos (public/js/social-cloud.js) contra o emulador do Firestore, COM as regras de segurança de verdade.
// Cada "pessoa" é um login diferente (ana, bruno, caio) usando o mesmo código que o app usa. Rodar: npm run test:rules
// Aqui se prova o comportamento de ponta a ponta: convite → pedido → aceite → perfil visível → acenos → sair, mais os casos difíceis
// (pedidos ao mesmo tempo, código repetido, documentos maliciosos, regras não publicadas, offline) e a privacidade.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSocial, SocialError, mapErr } from '../../public/js/social-cloud.js';
import { profilePayload, pairId as pid, liveOf, statusText, CODE_CHARS, MAX_FRIENDS, fmtCode, weekOf } from '../../public/js/social.js';
import * as C from '../../public/js/core.js';
import { rules11x } from '../helpers/old-rules.js';

FS.setLogLevel('silent'); // as recusas são esperadas nestes testes: sem barulho no terminal
const { doc, getDoc, setDoc, deleteDoc, getDocs, collection, query, where, Timestamp } = FS;

const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const RULES = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firestore.rules'), 'utf8');
const OLD = rules11x(RULES); // as regras da 1.1.x: o perfil sem gl e wm (o site novo pode sair antes das regras)
const CLOSED = 'rules_version = "2"; service cloud.firestore { match /databases/{d}/documents { match /{x=**} { allow read, write: if false; } } }';
const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), BRU = U('bruno'), CAI = U('caio');
const TODAY = '2026-10-18';

let env, closed, old;
const people = [];
// Cada login de teste (contexto) abre conexões próprias com o emulador e a biblioteca só as encerra no fim de TODA a bateria. Sem
// encerrar cada um ao fim do teste, elas se acumulam e, lá pelo 50º teste, o emulador deixa de responder. Por isso os contextos
// que o teste abre são anotados aqui e encerrados no afterEach.
const ctxs = [];
function track(e) {
  ['authenticatedContext', 'unauthenticatedContext'].forEach((k) => {
    const orig = e[k].bind(e);
    e[k] = function () { const c = orig.apply(null, arguments); ctxs.push(c); return c; };
  });
  return e;
}
beforeAll(async () => {
  env = track(await initializeTestEnvironment({ projectId: 'demo-mare-social', firestore: { host: hp[0], port: +hp[1], rules: RULES } }));
  closed = track(await initializeTestEnvironment({ projectId: 'demo-mare-social-closed', firestore: { host: hp[0], port: +hp[1], rules: CLOSED } }));
  old = track(await initializeTestEnvironment({ projectId: 'demo-mare-social-old', firestore: { host: hp[0], port: +hp[1], rules: OLD } }));
});
afterAll(async () => { if (env) await env.cleanup(); if (closed) await closed.cleanup(); if (old) await old.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await old.clearFirestore(); });
afterEach(() => {
  while (people.length) people.pop().sc.stop(); // nenhuma escuta aberta passa para o teste seguinte
  ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } });
});

// grava ou lê SEM as regras (como o servidor faria). Devolve o que a função devolver.
const seed = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const seedOld = async (fn) => { let out; await old.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, what, ms) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > (ms || 6000)) throw new Error('esperei e não aconteceu: ' + what);
    await sleep(25);
  }
}
// sorteador que devolve, em ordem, exatamente estes códigos (e repete a lista se pedirem mais)
const seq = (...codes) => {
  const r = [];
  codes.forEach((c) => { c.split('').forEach((ch) => { r.push((CODE_CHARS.indexOf(ch) + 0.5) / CODE_CHARS.length); }); });
  let i = 0;
  return () => r[i++ % r.length];
};

// Uma pessoa: login, app (estado S) e a camada de amigos. S.social.nick é o apelido; mexer em S e chamar publish()/touch() publica.
function person(nick, uid, o) {
  o = o || {};
  const e = o.env || env, S = C.defaults(1);
  S.onboarded = true; S.insignias = { concha: 1 }; S.social = { on: true, nick: nick, share: true, code: '' };
  S.goal.mode = 'manual'; S.goal.manual = 2000; // meta fixa: as porcentagens dos testes são fáceis de conferir
  const sc = createSocial({ FS: o.FS || FS, db: e.authenticatedContext(uid).firestore(), uid, rand: o.rand, cache: o.cache, leaveMs: o.leaveMs });
  const p = { nick, uid, S, sc, payload: () => profilePayload(S, TODAY), hooks: null };
  p.hooks = { payload: p.payload };
  people.push(p);
  return p;
}
const drink = (p, ml) => { p.S.days[TODAY] = { goal: 2000, entries: [{ id: 'e', t: 1, ml: ml, d: 'water' }] }; };
// entra na turma: perfil + código, e liga as hooks (como o app faz)
async function join(p) { const c = await p.sc.join({ payload: p.payload() }); p.sc.start(p.hooks); return c; }
// Os dois já amigos, pelo caminho de verdade (convite → pedido → aceite), esperando as escutas ao vivo chegarem
const loaded = (p, o) => p.sc.state().friends.some((f) => f.uid === o && f.day); // o amigo existe e o perfil dele já carregou
async function befriend(a, b) {
  const bc = await join(b);
  if (!a.sc.state().code) await join(a);
  await a.sc.request(bc);
  await until(() => b.sc.state().reqIn.some((r) => r.uid === a.uid), 'o pedido chegou');
  await b.sc.accept(a.uid);
  await until(() => loaded(a, b.uid) && loaded(b, a.uid), 'a amizade e os perfis chegaram');
}
const code = (p) => p.sc.state().code;
const err = async (promise) => { try { await promise; } catch (e) { return e; } return null; };

/* ============================== entrar na turma ============================== */
describe('entrar na turma (perfil e código)', () => {
  test('join publica só os campos combinados e cria um código válido', async () => {
    const ana = person('Ana', ANA); drink(ana, 1234);
    const c = await join(ana);
    expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(code(ana)).toBe(c);
    const prof = (await seed((d) => getDoc(doc(d, 'profiles', ANA)))).data();
    expect(Object.keys(prof).sort()).toEqual(['day', 'gl', 'ins', 'mc', 'met', 'nm', 'pct', 'sh', 'st', 'v', 'wm']); // e nenhum horário: nem "u"
    expect(prof).toMatchObject({ v: 1, nm: 'Ana', mc: 'concha', ins: ['concha'], pct: 61, met: false, st: 0, day: TODAY, sh: true, gl: null, wm: 0 }); // a meta em ml só vai se a pessoa deixar
    expect(JSON.stringify(prof)).not.toMatch(/1234|2000/); // nenhum volume
    const cd = (await seed((d) => getDoc(doc(d, 'codes', c)))).data();
    expect(Object.keys(cd).sort()).toEqual(['mc', 'nm', 'uid']); // o convite também não leva horário
    expect(cd).toMatchObject({ uid: ANA, nm: 'Ana', mc: 'concha' });
  });
  test('entrar de novo reaproveita o mesmo código (e não cria outro)', async () => {
    const ana = person('Ana', ANA);
    const c1 = await join(ana);
    const ana2 = person('Ana', ANA); // o app reabriu: outra instância, mesma conta
    const c2 = await ana2.sc.join({ payload: ana2.payload(), code: c1 });
    expect(c2).toBe(c1);
    const all = await seed((d) => getDocs(query(collection(d, 'codes'), where('uid', '==', ANA))));
    expect(all.size).toBe(1);
  });
  test('sobras de código (duas abas ao mesmo tempo): vale só o sugerido (sem sugestão, sempre o mesmo); as outras são revogadas', async () => {
    await seed(async (d) => {
      await setDoc(doc(d, 'codes', 'AAAAAAAA'), { uid: ANA, nm: 'Ana', mc: 'concha' });
      await setDoc(doc(d, 'codes', 'BBBBBBBB'), { uid: ANA, nm: 'Ana', mc: 'concha' });
    });
    const ana = person('Ana', ANA);
    expect(await ana.sc.join({ payload: ana.payload() })).toBe('AAAAAAAA'); // sem sugestão: o de menor id (toda aba escolhe o mesmo, sem depender de horário)
    const ana2 = person('Ana', ANA);
    await seed((d) => setDoc(doc(d, 'codes', 'CCCCCCCC'), { uid: ANA, nm: 'Ana', mc: 'concha' }));
    expect(await ana2.sc.join({ payload: ana2.payload(), code: 'CCCCCCCC' })).toBe('CCCCCCCC'); // com sugestão: o sugerido
    const left = await seed((d) => getDocs(query(collection(d, 'codes'), where('uid', '==', ANA))));
    expect(left.docs.filter((x) => x.data().rv !== true).map((x) => x.id)).toEqual(['CCCCCCCC']); // só um vale
    expect(left.docs.filter((x) => x.data().rv === true).map((x) => x.id).sort()).toEqual(['AAAAAAAA', 'BBBBBBBB']); // os outros ficam revogados (ocupados)
  });
  test('código sorteado que já é de outra pessoa: sorteia outro, sem tocar no dela', async () => {
    await seed((d) => setDoc(doc(d, 'codes', 'KMNPQRST'), { uid: CAI, nm: 'Caio', mc: 'baleia' }));
    const ana = person('Ana', ANA, { rand: seq('KMNPQRST', 'KMNPQRST', 'WXYZ2345') });
    expect(await join(ana)).toBe('WXYZ2345');
    const caio = (await seed((d) => getDoc(doc(d, 'codes', 'KMNPQRST')))).data();
    expect(caio).toMatchObject({ uid: CAI, nm: 'Caio', mc: 'baleia' });
  });
  test('join sem perfil é recusado', async () => {
    const ana = person('Ana', ANA);
    expect((await err(ana.sc.join({}))).code).toBe('bad');
    expect((await err(ana.sc.join())).code).toBe('bad');
  });
  test('publish só envia quando algo mudou; mudar apelido ou mascote atualiza o convite também', async () => {
    const ana = person('Ana', ANA);
    const c = await join(ana);
    expect(await ana.sc.publish(ana.payload())).toBe(false); // igual: nada a enviar
    drink(ana, 500);
    expect(await ana.sc.publish(ana.payload())).toBe(true);
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).data().pct).toBe(25);
    ana.S.social.nick = 'Aninha'; ana.S.insignias = { concha: 1, estrela: 2 };
    expect(await ana.sc.publish(ana.payload())).toBe(true);
    expect((await seed((d) => getDoc(doc(d, 'codes', c)))).data()).toMatchObject({ nm: 'Aninha', mc: 'estrela' });
    const inv = await person('Bruno', BRU).sc.lookup(c);
    expect(inv).toMatchObject({ uid: ANA, nm: 'Aninha', mc: 'estrela', self: false });
  });
  test('compartilhar desligado: o perfil fica só com nome e insígnias; o progresso vira "em pausa"', async () => {
    const ana = person('Ana', ANA); drink(ana, 2000);
    ana.S.social.share = false;
    await join(ana);
    const prof = (await seed((d) => getDoc(doc(d, 'profiles', ANA)))).data();
    expect(prof).toMatchObject({ sh: false, pct: null, met: false, st: 0 });
  });
  test('trocar o código: o antigo deixa de valer (e fica revogado, ocupado), o novo vale, só um vale', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    const old = await join(ana); await join(bru);
    const nu = await ana.sc.newCode();
    expect(nu).not.toBe(old);
    expect(code(ana)).toBe(nu);
    expect(await bru.sc.lookup(old)).toBeNull();
    expect(await bru.sc.lookup(nu)).toMatchObject({ uid: ANA });
    const all = await seed((d) => getDocs(query(collection(d, 'codes'), where('uid', '==', ANA))));
    expect(all.docs.filter((x) => x.data().rv !== true).map((x) => x.id)).toEqual([nu]);
    const dead = (await seed((d) => getDoc(doc(d, 'codes', old)))).data();
    expect(dead).toMatchObject({ uid: ANA, rv: true }); // o documento continua existindo, do mesmo dono: ninguém recria esse código
  });
  test('newCode e request exigem ter entrado na turma', async () => {
    const ana = person('Ana', ANA);
    expect((await err(ana.sc.newCode())).code).toBe('notjoined');
    expect((await err(ana.sc.request('ABCDEFGH'))).code).toBe('notjoined');
  });
  test('uid inválido nem cria a camada', () => {
    expect(() => createSocial({ FS, db: env.authenticatedContext(ANA).firestore(), uid: 'a/b' })).toThrow();
  });
});

/* ============================== convite e pedido ============================== */
describe('convite e pedido de amizade', () => {
  test('lookup mostra só nome e mascote de quem convida', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    const c = await join(ana); await join(bru);
    const who = await bru.sc.lookup(c);
    expect(who).toEqual({ code: c, uid: ANA, nm: 'Ana', mc: 'concha', self: false });
    expect(await bru.sc.lookup(fmtCode(c).toLowerCase())).toMatchObject({ uid: ANA }); // aceita "abcd-efgh" em minúsculas
    expect((await ana.sc.lookup(c)).self).toBe(true);
  });
  test('código que não existe ou está malformado: null, sem erro', async () => {
    const ana = person('Ana', ANA); await join(ana);
    expect(await ana.sc.lookup('ZZZZZZZZ')).toBeNull();
    expect(await ana.sc.lookup('curto')).toBeNull();
    expect(await ana.sc.lookup('')).toBeNull();
    expect(await ana.sc.lookup(null)).toBeNull();
  });
  test('pedir → o outro recebe → aceita → os dois são amigos e se veem', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    drink(bru, 1000); bru.S.insignias = { concha: 1, estrela: 2, baiacu: 3 };
    const bcode = await join(bru); await join(ana);
    const r = await ana.sc.request(bcode);
    expect(r).toEqual({ kind: 'sent', uid: BRU, nm: 'Bruno', mc: 'baiacu' });
    await until(() => ana.sc.state().reqOut.length === 1 && bru.sc.state().reqIn.length === 1, 'o pedido apareceu nos dois lados');
    expect(ana.sc.state().reqOut.map((x) => [x.uid, x.nm, x.mine])).toEqual([[BRU, 'Bruno', true]]);
    expect(bru.sc.state().reqIn.map((x) => [x.uid, x.nm, x.mine])).toEqual([[ANA, 'Ana', false]]);
    expect(ana.sc.state().friends).toEqual([]);
    // enquanto é só um pedido, ninguém lê o perfil de ninguém
    expect((await err(getDoc(doc(env.authenticatedContext(ANA).firestore(), 'profiles', BRU)))).code).toBe('permission-denied');
    await bru.sc.accept(ANA);
    await until(() => loaded(ana, BRU) && loaded(bru, ANA) && !ana.sc.state().reqOut.length && !bru.sc.state().reqIn.length, 'virou amizade');
    const af = ana.sc.state().friends, bf = bru.sc.state().friends;
    expect(af.map((f) => f.uid)).toEqual([BRU]);
    expect(af[0]).toMatchObject({ nm: 'Bruno', mc: 'baiacu', ins: ['concha', 'estrela', 'baiacu'], pct: 50, met: false, day: TODAY, sh: true });
    expect(bf.map((f) => f.uid)).toEqual([ANA]);
    expect(bf[0]).toMatchObject({ nm: 'Ana', mc: 'concha', pct: 0 });
    expect(ana.sc.state().reqOut).toEqual([]);
    expect(bru.sc.state().reqIn).toEqual([]);
    expect(statusText(liveOf(af[0], TODAY))).toBe('50% da meta de hoje');
  });
  test('os dois se convidaram: o segundo pedido já fecha a amizade (sem documento a mais)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    const ac = await join(ana), bc = await join(bru);
    expect((await ana.sc.request(bc)).kind).toBe('sent');
    expect((await bru.sc.request(ac)).kind).toBe('accepted');
    await until(() => loaded(ana, BRU) && loaded(bru, ANA), 'amizade nos dois lados');
    expect(ana.sc.state().friends.map((f) => f.uid)).toEqual([BRU]);
    expect(bru.sc.state().friends.map((f) => f.uid)).toEqual([ANA]);
    const all = await seed((d) => getDocs(collection(d, 'friendships')));
    expect(all.size).toBe(1);
    expect(all.docs[0].data().st).toBe('active');
  });
  test('pedidos ao mesmo tempo, um para o outro: no fim são amigos (um "sent", outro "accepted"), várias vezes seguidas', async () => {
    // O caso difícil: os dois pedem no mesmo instante, com a escuta ao vivo ligada (como no app). Repete para pegar corrida de verdade.
    for (let i = 0; i < 8; i++) {
      const a = person('Ana' + i, U('ana' + i)), b = person('Bia' + i, U('bia' + i));
      const ac = await join(a), bc = await join(b);
      await sleep(10 + (i % 4) * 30); // varia a defasagem entre a escuta e o pedido
      const [ra, rb] = await Promise.all([a.sc.request(bc), b.sc.request(ac)]);
      expect([ra.kind, rb.kind].sort()).toEqual(['accepted', 'sent']);
      const doc1 = await seed((d) => getDoc(doc(d, 'friendships', pid(a.uid, b.uid))));
      expect(doc1.data().st).toBe('active');
      await until(() => loaded(a, b.uid) && loaded(b, a.uid), 'amizade nos dois lados');
    }
  });
  test('erros claros: o próprio código, código inexistente, já amigos, pedido já enviado', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    const ac = await join(ana), bc = await join(bru);
    expect((await err(ana.sc.request(ac))).code).toBe('self');
    expect((await err(ana.sc.request('ZZZZZZZZ'))).code).toBe('notfound');
    expect((await err(ana.sc.request('xx'))).code).toBe('notfound');
    await ana.sc.request(bc);
    const again = await err(ana.sc.request(bc));
    expect(again.code).toBe('pending');
    expect(again.who).toMatchObject({ uid: BRU, nm: 'Bruno' }); // a tela mostra de quem se trata
    await until(() => bru.sc.state().reqIn.length === 1, 'pedido em Bruno');
    await bru.sc.accept(ANA);
    const ex = await err(ana.sc.request(bc));
    expect(ex.code).toBe('exists');
    expect(ex.who.uid).toBe(BRU);
    expect(ex).toBeInstanceOf(SocialError);
  });
  test('o pedido guarda o código usado; se a pessoa troca o código no meio do caminho, vira "não encontrei" (e o novo código funciona)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await ana.sc.request(bc);
    expect((await seed((d) => getDoc(doc(d, 'friendships', pid(ANA, BRU))))).data().cd).toBe(bc); // as regras exigem esse código vigente
    await ana.sc.cancel(BRU);
    await until(() => !ana.sc.state().reqOut.length, 'pedido cancelado');
    // O Bruno troca o código DEPOIS de a Ana encontrar o convite e ANTES de o pedido sair (a corrida que o app precisa saber explicar)
    let raced = false;
    const wrapped = Object.assign({}, FS, { setDoc: async (ref, data, opts) => {
      if (/^friendships\//.test(ref.path) && !raced) { raced = true; await bru.sc.newCode(); }
      return FS.setDoc(ref, data, opts);
    } });
    const racing = createSocial({ FS: wrapped, db: env.authenticatedContext(ANA).firestore(), uid: ANA });
    await racing.join({ payload: ana.payload() });
    expect((await err(racing.request(bc))).code).toBe('notfound');
    expect((await seed((d) => getDoc(doc(d, 'friendships', pid(ANA, BRU))))).exists()).toBe(false); // nada ficou pela metade
    const r = await racing.request(code(bru)); // com o código novo, passa
    expect(r.kind).toBe('sent');
    expect((await seed((d) => getDoc(doc(d, 'friendships', pid(ANA, BRU))))).data().cd).toBe(code(bru));
  });
  test('recusar apaga o pedido nos dois lados, e dá para pedir de novo depois', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await ana.sc.request(bc);
    await until(() => bru.sc.state().reqIn.length === 1 && ana.sc.state().reqOut.length === 1, 'pedido nos dois lados');
    await bru.sc.decline(ANA);
    await until(() => !ana.sc.state().reqOut.length && !bru.sc.state().reqIn.length, 'pedido apagado nos dois lados');
    expect((await ana.sc.request(bc)).kind).toBe('sent');
  });
  test('cancelar o pedido que eu mandei', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await ana.sc.request(bc);
    await until(() => bru.sc.state().reqIn.length === 1, 'pedido chegou');
    await ana.sc.cancel(BRU);
    await until(() => !bru.sc.state().reqIn.length && !ana.sc.state().reqOut.length, 'pedido cancelado');
  });
  test('desfazer a amizade: some dos dois lados e o perfil volta a ficar fechado', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    expect(ana.sc.state().friends).toHaveLength(1);
    await bru.sc.remove(ANA);
    await until(() => !ana.sc.state().friends.length && !bru.sc.state().friends.length, 'amizade desfeita nos dois lados');
    expect((await err(getDoc(doc(env.authenticatedContext(ANA).firestore(), 'profiles', BRU)))).code).toBe('permission-denied');
    expect((await err(getDoc(doc(env.authenticatedContext(BRU).firestore(), 'profiles', ANA)))).code).toBe('permission-denied');
  });
  test('apagar o que já não existe termina bem (outra pessoa já tinha desfeito)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await ana.sc.decline(BRU);
    await ana.sc.remove(BRU);
    expect((await err(ana.sc.remove('curto'))).code).toBe('bad');
  });
  test('não dá para aceitar o próprio pedido nem um pedido que não existe', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await ana.sc.request(bc);
    await until(() => ana.sc.state().reqOut.length === 1, 'pedido apareceu');
    expect((await err(ana.sc.accept(BRU))).code).toBe('gone'); // é o meu próprio pedido
    expect((await err(ana.sc.accept(CAI))).code).toBe('gone'); // não existe nada com o Caio
  });
  test('o pedido leva o nome e o mascote de quem pediu; o convite, os de quem convidou', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    ana.S.insignias = { concha: 1, estrela: 2, baiacu: 3, tartaruga: 4 };
    await join(ana); const bc = await join(bru);
    await ana.sc.request(bc);
    const d = (await seed((x) => getDoc(doc(x, 'friendships', pid(ANA, BRU))))).data();
    expect(d).toMatchObject({ by: ANA, st: 'pending', nm: 'Ana', mc: 'tartaruga', tn: 'Bruno', tc: 'concha' });
    expect(d.m).toEqual(pid(ANA, BRU).split('_'));
  });
  test('limite de amigos: com a turma cheia, não dá para pedir nem aceitar mais', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    const ac = await join(ana); const bc = await join(bru); await join(cai);
    await seed(async (d) => {
      for (let i = 0; i < MAX_FRIENDS; i++) {
        const f = U('f' + i);
        await setDoc(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'active', nm: 'F' + i, mc: 'concha', tn: 'Ana', tc: 'concha', at: Timestamp.now(), ok: Timestamp.now() });
      }
    });
    await until(() => ana.sc.state().friends.length === MAX_FRIENDS, 'a turma cheia chegou');
    expect((await err(ana.sc.request(bc))).code).toBe('full');
    await cai.sc.request(ac); // Caio pode pedir (o limite é de quem recebe)...
    await until(() => ana.sc.state().reqIn.length === 1, 'pedido do Caio chegou');
    expect((await err(ana.sc.accept(CAI))).code).toBe('full'); // ...mas Ana não aceita além do limite
  });
  test('pedidos pendentes também contam para o limite de quem pede', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await seed(async (d) => {
      for (let i = 0; i < MAX_FRIENDS; i++) {
        const f = U('g' + i);
        await setDoc(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: ANA, st: 'pending', nm: 'Ana', mc: 'concha', tn: 'G' + i, tc: 'concha', at: Timestamp.now() });
      }
    });
    await until(() => ana.sc.state().reqOut.length === MAX_FRIENDS, 'os pedidos pendentes chegaram');
    expect((await err(ana.sc.request(bc))).code).toBe('full');
  });
  test('um terceiro (Caio) não enxerga nada da amizade entre Ana e Bruno', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    await befriend(ana, bru); await join(cai);
    await cai.sc.refresh(); // (com a escuta ligada, espera a primeira resposta da nuvem)
    expect(cai.sc.state().ready).toBe(true);
    expect(cai.sc.state().friends).toEqual([]);
    expect(cai.sc.state().reqIn).toEqual([]);
    const cdb = env.authenticatedContext(CAI).firestore();
    expect((await err(getDoc(doc(cdb, 'profiles', ANA)))).code).toBe('permission-denied');
    expect((await err(getDoc(doc(cdb, 'friendships', pid(ANA, BRU))))).code).toBe('permission-denied');
    expect((await err(getDocs(collection(cdb, 'friendships')))).code).toBe('permission-denied'); // nem listar tudo
    expect((await err(getDocs(collection(cdb, 'profiles')))).code).toBe('permission-denied');
  });
});

/* ============================== acenos ============================== */
describe('acenos', () => {
  test('um "oi": quem recebe vê, quem mandou vê que já mandou', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await ana.sc.wave(BRU, 'hi', TODAY);
    await until(() => ana.sc.state().friends[0].mine && bru.sc.state().friends[0].theirs, 'aceno nos dois lados');
    expect(ana.sc.state().friends[0].mine).toEqual({ k: 'hi', d: TODAY });
    expect(ana.sc.state().friends[0].theirs).toBeNull();
    expect(bru.sc.state().friends[0].theirs).toEqual({ k: 'hi', d: TODAY });
    expect(bru.sc.state().friends[0].mine).toBeNull();
  });
  test('"parabéns" também; e cada um tem o seu aceno na mesma amizade', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await ana.sc.wave(BRU, 'cheer', TODAY);
    await bru.sc.wave(ANA, 'hi', TODAY);
    await until(() => ana.sc.state().friends[0].theirs && bru.sc.state().friends[0].theirs, 'os dois acenos chegaram');
    expect(ana.sc.state().friends[0]).toMatchObject({ mine: { k: 'cheer', d: TODAY }, theirs: { k: 'hi', d: TODAY } });
    expect(bru.sc.state().friends[0]).toMatchObject({ mine: { k: 'hi', d: TODAY }, theirs: { k: 'cheer', d: TODAY } });
  });
  test('o servidor segura aceno repetido em menos de 10 minutos', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await ana.sc.wave(BRU, 'hi', TODAY);
    expect((await err(ana.sc.wave(BRU, 'cheer', TODAY))).code).toBe('wave');
  });
  test('aceno velho (mais de 10 min) pode ser trocado por um novo', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await seed((d) => FS.updateDoc(doc(d, 'friendships', pid(ANA, BRU)), { ['w.' + ANA]: { k: 'hi', d: '2026-10-17', at: Timestamp.fromMillis(Date.now() - 11 * 60000) } }));
    await ana.sc.wave(BRU, 'cheer', TODAY);
    await until(() => bru.sc.state().friends[0].theirs && bru.sc.state().friends[0].theirs.k === 'cheer', 'aceno novo chegou');
    expect(bru.sc.state().friends[0].theirs).toEqual({ k: 'cheer', d: TODAY });
  });
  test('tipo e dia inválidos nem saem do aparelho', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    expect((await err(ana.sc.wave(BRU, 'beijo', TODAY))).code).toBe('bad');
    expect((await err(ana.sc.wave(BRU, 'hi', 'hoje'))).code).toBe('bad');
    expect((await err(ana.sc.wave('curto', 'hi', TODAY))).code).toBe('bad');
  });
  test('acenar para quem é só um pedido ainda não vale', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await ana.sc.request(bc);
    await until(() => ana.sc.state().reqOut.length === 1, 'pedido apareceu');
    expect((await err(ana.sc.wave(BRU, 'hi', TODAY))).code).toBe('gone');
  });
  test('acenar para quem não é amigo (documento inexistente) falha sem criar nada', async () => {
    const ana = person('Ana', ANA); await join(ana);
    expect(await err(ana.sc.wave(CAI, 'hi', TODAY))).not.toBeNull();
    const all = await seed((d) => getDocs(collection(d, 'friendships')));
    expect(all.size).toBe(0);
  });
});

/* ============================== ao vivo ============================== */
describe('atualização ao vivo (sem puxar para atualizar)', () => {
  test('start: fica pronto e traz a lista; mudanças do amigo chegam sozinhas', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const ana2 = person('Ana', ANA); // outra instância (app reaberto) só ouvindo
    expect(ana2.sc.state().ready).toBe(false);
    ana2.sc.start(ana2.hooks);
    await until(() => ana2.sc.state().ready && ana2.sc.state().friends.length === 1, 'lista inicial');
    expect(ana2.sc.state().err).toBe('');
    drink(bru, 1500);
    await bru.sc.publish(bru.payload());
    await until(() => ana2.sc.state().friends[0].pct === 75, 'progresso do amigo ao vivo');
    drink(bru, 2000);
    await bru.sc.publish(bru.payload());
    await until(() => ana2.sc.state().friends[0].met === true, 'meta batida ao vivo');
    expect(statusText(liveOf(ana2.sc.state().friends[0], TODAY))).toBe('Meta batida hoje\u00A0🎉');
  });
  test('quem desliga o compartilhamento passa a aparecer "em pausa"', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    drink(bru, 1000);
    await befriend(ana, bru);
    await until(() => ana.sc.state().friends[0] && ana.sc.state().friends[0].pct === 50, 'estado inicial');
    bru.S.social.share = false;
    await bru.sc.publish(bru.payload());
    await until(() => ana.sc.state().friends[0].sh === false, 'pausa chegou');
    expect(liveOf(ana.sc.state().friends[0], TODAY).kind).toBe('paused');
    expect(ana.sc.state().friends[0].pct).toBeNull();
  });
  test('pedido novo aparece sozinho em quem recebe; aceite aparece sozinho em quem pediu', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    const ac = await join(ana); const bc = await join(bru);
    await until(() => ana.sc.state().ready && bru.sc.state().ready, 'escutas prontas');
    await ana.sc.request(bc);
    await until(() => bru.sc.state().reqIn.length === 1, 'pedido chegou em Bruno');
    await until(() => ana.sc.state().reqOut.length === 1, 'pedido aparece para Ana');
    await bru.sc.accept(ANA);
    await until(() => ana.sc.state().friends.length === 1 && ana.sc.state().reqOut.length === 0, 'aceite chegou em Ana');
    await until(() => ana.sc.state().friends[0].ins.length === 1, 'perfil do novo amigo carregou');
    expect(ac).toBeTruthy();
  });
  test('aceno chega sozinho', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await until(() => bru.sc.state().friends.length === 1, 'amizade ao vivo em Bruno');
    await ana.sc.wave(BRU, 'hi', TODAY);
    await until(() => bru.sc.state().friends[0].theirs && bru.sc.state().friends[0].theirs.k === 'hi', 'aceno ao vivo');
  });
  test('quando a amizade acaba, o amigo some sem virar erro', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await until(() => ana.sc.state().friends.length === 1, 'amizade ao vivo');
    await bru.sc.remove(ANA);
    await until(() => ana.sc.state().friends.length === 0, 'amigo sumiu');
    await sleep(300);
    expect(ana.sc.state().err).toBe(''); // a escuta do perfil dele foi recusada, mas isso não é um problema do app
  });
  test('os ouvintes são avisados (com junção de mudanças seguidas) e podem sair', async () => {
    const ana = person('Ana', ANA);
    let n = 0, last = null;
    const off = ana.sc.on((s) => { n++; last = s; });
    await join(ana);
    await until(() => n >= 1 && last.ready, 'aviso de pronto');
    expect(last.code).toMatch(/^[A-Z2-9]{8}$/);
    off();
    const seen = n;
    await ana.sc.newCode();
    await sleep(150);
    expect(n).toBe(seen); // saiu: não recebe mais
  });
  test('uma rajada de atualizações chega à tela como UMA notificação só (não uma por documento)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const box = {}; // guarda o ouvinte do perfil do Bruno para disparar várias atualizações no mesmo instante
    const spy = Object.assign({}, FS, { onSnapshot: function (ref, next, bad) {
      if (ref && ref.path === 'profiles/' + BRU && typeof next === 'function') return FS.onSnapshot(ref, function (snap) { box.cb = next; box.snap = snap; next(snap); }, bad);
      return FS.onSnapshot.apply(FS, arguments);
    } });
    const ana2 = person('Ana', ANA, { FS: spy });
    let n = 0;
    ana2.sc.on(() => { n++; });
    ana2.sc.start(ana2.hooks);
    await until(() => box.snap && ana2.sc.state().friends.length === 1 && ana2.sc.state().friends[0].day, 'o amigo carregou');
    await sleep(250); // assenta
    const n0 = n;
    for (let i = 0; i < 8; i++) box.cb(box.snap); // oito atualizações seguidas
    await sleep(250);
    expect(n - n0).toBe(1);
  });
  test('a cópia do aparelho aparece antes da primeira resposta da nuvem, e a nuvem manda depois', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    drink(bru, 600);
    await befriend(ana, bru);
    const saved = JSON.parse(JSON.stringify(ana.sc.state()));
    const ana2 = person('Ana', ANA, { cache: saved });
    const s0 = ana2.sc.state();
    expect(s0.ready).toBe(false);
    expect(s0.friends.map((f) => [f.nm, f.pct])).toEqual([['Bruno', 30]]);
    expect(s0.code).toBe(code(ana));
    drink(bru, 1400);
    await bru.sc.publish(bru.payload());
    ana2.sc.start(ana2.hooks);
    await until(() => ana2.sc.state().ready && ana2.sc.state().friends[0].pct === 70, 'dados novos substituem a cópia');
  });
  test('amigo que sumiu da nuvem some da cópia também (a nuvem manda)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const saved = JSON.parse(JSON.stringify(ana.sc.state()));
    await bru.sc.remove(ANA);
    const ana2 = person('Ana', ANA, { cache: saved });
    expect(ana2.sc.state().friends).toHaveLength(1);
    ana2.sc.start(ana2.hooks);
    await until(() => ana2.sc.state().ready && ana2.sc.state().friends.length === 0, 'cópia velha descartada');
  });
  test('touch: junta várias mudanças e envia o perfil depois de um instante', async () => {
    const ana = person('Ana', ANA); await join(ana);
    drink(ana, 200); ana.sc.touch();
    drink(ana, 400); ana.sc.touch();
    drink(ana, 800); ana.sc.touch();
    const read = async () => (await seed((d) => getDoc(doc(d, 'profiles', ANA)))).data().pct;
    expect(await read()).toBe(0); // ainda não enviou: o envio é agendado para daqui a ~1 s
    const t0 = Date.now();
    while ((await read()) !== 40) {
      if (Date.now() - t0 > 6000) throw new Error('o touch não enviou o perfil');
      await sleep(100);
    }
  });
  test('flush envia na hora; sem payload (não entrou), não faz nada', async () => {
    const ana = person('Ana', ANA); await join(ana);
    drink(ana, 1000);
    expect(await ana.sc.flush()).toBe(true);
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).data().pct).toBe(50);
    ana.sc.start({ payload: () => null });
    expect(await ana.sc.flush()).toBe(false);
  });
});

/* ============================== sair ============================== */
describe('sair da turma', () => {
  test('apaga perfil, convites, pedidos e amizades; os outros veem a amizade acabar', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    await befriend(ana, bru);
    const cc = await join(cai); await ana.sc.request(cc); // um pedido pendente também
    const ac = code(ana);
    await until(() => cai.sc.state().reqIn.length === 1, 'pedido chegou no Caio');
    await ana.sc.leave();
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).exists()).toBe(false);
    // o convite fica revogado e SEM nome (só o identificador, que continua ocupado: o link antigo nunca vira outra pessoa)
    expect((await seed((d) => getDoc(doc(d, 'codes', ac)))).data()).toMatchObject({ uid: ANA, nm: '-', mc: '-', rv: true });
    expect((await seed((d) => getDocs(collection(d, 'friendships')))).size).toBe(0);
    await until(() => !bru.sc.state().friends.length && !cai.sc.state().reqIn.length, 'os outros viram a amizade acabar');
    expect(ana.sc.state()).toMatchObject({ code: '', friends: [], reqIn: [], reqOut: [] });
    expect(await bru.sc.lookup(ac)).toBeNull();
  });
  test('depois de sair dá para entrar de novo, do zero', async () => {
    const ana = person('Ana', ANA);
    const c1 = await join(ana);
    await ana.sc.leave();
    const c2 = await join(ana);
    expect(c2).toMatch(/^[A-Z2-9]{8}$/);
    expect(c2).not.toBe(c1);
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).exists()).toBe(true);
  });
  test('sair sem nunca ter entrado termina bem', async () => {
    const ana = person('Ana', ANA);
    await ana.sc.leave();
    expect(ana.sc.state().friends).toEqual([]);
  });
  test('sair não mexe nos dados privados (users/days) nem na vida dos outros', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    await befriend(ana, bru); await befriend(bru, cai);
    await seed((d) => setDoc(doc(d, 'users', ANA), { goal: 2000 }));
    await ana.sc.leave();
    expect((await seed((d) => getDoc(doc(d, 'users', ANA)))).exists()).toBe(true);
    await until(() => bru.sc.state().friends.length === 1 && bru.sc.state().friends[0].uid === CAI, 'só a amizade com o Caio sobrou');
    await sleep(200);
    expect(bru.sc.state().friends.map((f) => f.uid)).toEqual([CAI]); // a amizade Bruno–Caio continua
  });
});

/* ============================== dados maliciosos ============================== */
describe('o que vem da nuvem nunca chega cru à tela', () => {
  test('perfil de amigo com lixo (gravado por fora das regras) sai limpo', async () => {
    await seed(async (d) => {
      await setDoc(doc(d, 'friendships', pid(ANA, BRU)), { m: [ANA, BRU], by: BRU, st: 'active', nm: '<b>Bruno</b>', mc: 'hacker', tn: 'Ana', tc: 'concha', at: Timestamp.now(), ok: Timestamp.now(),
        w: { [BRU]: { k: 'hack', d: 'x' }, [ANA]: { k: 'hi', d: TODAY } } });
      await setDoc(doc(d, 'profiles', BRU), { v: 1, nm: '<img src=x onerror=alert(1)>' + 'z'.repeat(200), mc: '../../x', ins: ['polvo', 'inexistente', 'concha', 7], pct: 5000, met: 'sim', st: 1e15, day: 'nunca', sh: true, u: Timestamp.now(), extra: 'x' });
    });
    const ana = person('Ana', ANA); await join(ana);
    await until(() => ana.sc.state().friends.length === 1 && ana.sc.state().friends[0].ins.length, 'amigo estranho chegou');
    const f = ana.sc.state().friends[0];
    expect(f.nm).not.toMatch(/[<>]/);
    expect(Array.from(f.nm).length).toBeLessThanOrEqual(20);
    expect(f).toMatchObject({ mc: 'concha', ins: ['concha', 'polvo'], pct: 100, met: false, st: 9999, day: '', theirs: null, mine: { k: 'hi', d: TODAY } });
    expect(liveOf(f, TODAY).kind).toBe('unknown');
    expect(Object.keys(f).sort()).not.toContain('u'); // campos que não são do combinado (carimbo de hora, extras) não passam para a tela
    expect(Object.keys(f).sort()).not.toContain('extra');
  });
  test('documentos estranhos na coleção são ignorados (id que não bate, membros demais ou de menos, estado desconhecido)', async () => {
    const EVA = U('eva'), DAN = U('dan');
    await seed(async (d) => {
      await setDoc(doc(d, 'friendships', 'qualquercoisa'), { m: [ANA, BRU], by: BRU, st: 'active', nm: 'X', mc: 'concha', tn: 'Y', tc: 'concha' }); // id que não é de par nenhum
      await setDoc(doc(d, 'friendships', pid(ANA, CAI)), { m: [ANA, BRU], by: BRU, st: 'active', nm: 'X', mc: 'concha', tn: 'Y', tc: 'concha' }); // id de outro par
      await setDoc(doc(d, 'friendships', pid(ANA, U('fay'))), { m: [ANA, 'a/b'], by: CAI, st: 'active' }); // membro com id inválido
      await setDoc(doc(d, 'friendships', pid(ANA, BRU)), { m: [ANA, BRU, CAI], by: BRU, st: 'active', nm: 'Bruno', mc: 'polvo', tn: 'Ana', tc: 'concha' }); // três membros
      await setDoc(doc(d, 'friendships', pid(ANA, DAN)), { m: [ANA], by: ANA, st: 'pending', nm: 'Ana', mc: 'concha', tn: 'Dan', tc: 'concha' }); // um membro só
      await setDoc(doc(d, 'friendships', pid(ANA, EVA)), { m: [ANA, EVA], by: EVA, st: 'sei-la', nm: 'Eva', mc: 'concha', tn: 'Ana', tc: 'concha' }); // estado desconhecido
    });
    const ana = person('Ana', ANA); await join(ana);
    await ana.sc.refresh(); // a primeira resposta já traz os documentos estranhos
    expect(ana.sc.state().ready).toBe(true);
    expect(ana.sc.state().friends).toEqual([]);
    expect(ana.sc.state().reqIn).toEqual([]);
    expect(ana.sc.state().reqOut).toEqual([]);
  });
  test('convite com lixo: lookup devolve limpo ou null', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await seed(async (d) => {
      await setDoc(doc(d, 'codes', 'KMNPQRST'), { uid: 'a/b', nm: 'X', mc: 'concha' });
      await setDoc(doc(d, 'codes', 'WXYZ2345'), { uid: BRU, nm: '<script>' + 'y'.repeat(99), mc: 'zzz' });
    });
    expect(await ana.sc.lookup('KMNPQRST')).toBeNull();
    const w = await ana.sc.lookup('WXYZ2345');
    expect(w.nm).not.toMatch(/[<>]/);
    expect(w.mc).toBe('concha');
  });
});

/* ============================== regras não publicadas, offline ============================== */
describe('quando algo dá errado', () => {
  test('regras fechadas (ainda não publicadas): erro "rules", a camada avisa e o app segue', async () => {
    const ana = person('Ana', ANA, { env: closed });
    expect((await err(ana.sc.join({ payload: ana.payload() }))).code).toBe('rules');
    expect((await err(ana.sc.lookup('KMNPQRST'))).code).toBe('rules');
    ana.sc.start(ana.hooks);
    await until(() => ana.sc.state().ready && ana.sc.state().err === 'rules', 'erro de regras no estado');
    expect(ana.sc.state().friends).toEqual([]);
    expect((await err(ana.sc.refresh())).code).toBe('rules');
    // flush também avisa, sem lançar para quem agenda
    ana.sc.touch();
    expect((await err(ana.sc.flush())).code).toBe('rules');
  });
  test('mapErr traduz os erros do Firestore para o vocabulário da tela', () => {
    expect(mapErr({ code: 'permission-denied' }).code).toBe('rules');
    expect(mapErr({ code: 'firestore/permission-denied' }).code).toBe('rules');
    expect(mapErr({ code: 'unavailable' }).code).toBe('offline');
    expect(mapErr({ code: 'deadline-exceeded' }).code).toBe('offline');
    expect(mapErr({ message: 'Failed to get document because the client is offline.' }).code).toBe('offline');
    expect(mapErr({ code: 'not-found' }).code).toBe('gone');
    expect(mapErr({ code: 'unauthenticated' }).code).toBe('auth');
    expect(mapErr({ code: 'resource-exhausted' }).code).toBe('busy');
    expect(mapErr(new Error('qualquer coisa')).code).toBe('unknown');
    expect(mapErr(null).code).toBe('unknown');
    const mine = new SocialError('full');
    expect(mapErr(mine)).toBe(mine);
  });
  test('se o envio do perfil falha, o próximo toque tenta de novo (não finge que enviou)', async () => {
    const ana = person('Ana', ANA, { env: closed });
    drink(ana, 500);
    expect((await err(ana.sc.publish(ana.payload()))).code).toBe('rules');
    expect((await err(ana.sc.publish(ana.payload()))).code).toBe('rules'); // não ficou marcado como enviado
  });
});

/* ============================== casos de abuso e de falha no meio do caminho (revisão independente) ============================== */
const codesOf = async (u) => (await seed((d) => getDocs(query(collection(d, 'codes'), where('uid', '==', u))))).docs.map((x) => Object.assign({ id: x.id }, x.data()));
const liveOnly = (list) => list.filter((x) => x.rv !== true).map((x) => x.id);
const unavailable = () => Object.assign(new Error('unavailable'), { code: 'unavailable' });
// FS que deixa o commit dos lotes falhar enquanto box.fail for verdadeiro, e/ou roda box.beforeCommit() antes do commit de verdade
// Envolve o writeBatch: beforeCommit (uma vez, antes de gravar), fail (o lote falha como se estivesse sem rede) e onCommit(n) (quantas gravações tinha)
function batchHook(box) {
  return Object.assign({}, FS, { writeBatch: (d) => {
    const b = FS.writeBatch(d), commit = b.commit.bind(b);
    let n = 0;
    ['set', 'update', 'delete'].forEach((k) => { const f = b[k].bind(b); b[k] = function () { n++; return f.apply(null, arguments); }; });
    b.commit = async () => {
      if (box.beforeCommit && !box.ran) { box.ran = true; await box.beforeCommit(); }
      if (box.fail) throw unavailable();
      if (box.onCommit) box.onCommit(n);
      return commit();
    };
    return b;
  } });
}
// FS que envolve runTransaction (a saída dos amigos e a troca de convite usam transação): box.fail (true, ou função do nº da chamada: a transação
// falha como se estivesse sem rede e não grava nada), box.beforeCommit (roda uma vez, antes de a transação gravar; pode devolver uma promessa
// para segurar a gravação), box.onTx(n) (quantas gravações a transação levava) e box.calls (quantas transações foram pedidas)
function txHook(box) {
  return Object.assign({}, FS, { runTransaction: async (d, fn, o) => {
    const call = box.calls = (box.calls || 0) + 1;
    if (box.beforeCommit && !box.ran) { box.ran = true; await box.beforeCommit(); }
    if (typeof box.fail === 'function' ? box.fail(call) : box.fail) throw unavailable();
    return FS.runTransaction(d, async (tx) => {
      let n = 0;
      const w = {};
      ['set', 'update', 'delete'].forEach((k) => { w[k] = function () { n++; tx[k].apply(tx, arguments); return w; }; });
      w.get = (r) => tx.get(r);
      await fn(w);
      if (box.onTx) box.onTx(n);
    }, o);
  } });
}

describe('convite revogado: a porta fechada continua fechada', () => {
  test('trocar o código é tudo-ou-nada: se a gravação falha, o antigo segue valendo e nada fica pela metade', async () => {
    const box = { fail: true };
    const ana = person('Ana', ANA, { FS: txHook(box) });
    const old = await join(ana);
    expect((await err(ana.sc.newCode())).code).toBe('offline'); // a falha chega à tela (antes ficava calada)
    expect(box.calls).toBe(1);
    expect(code(ana)).toBe(old);
    const all = await codesOf(ANA);
    expect(liveOnly(all)).toEqual([old]);
    expect(all).toHaveLength(1); // nenhum código novo ficou para trás
    box.fail = false;
    const nu = await ana.sc.newCode(); // tentar de novo funciona
    expect(liveOnly(await codesOf(ANA))).toEqual([nu]);
    expect((await codesOf(ANA)).find((x) => x.id === old).rv).toBe(true);
  });
  test('um convite antigo que some no meio da troca: o servidor recusa a transação inteira, a troca refaz a conta e termina (nada fica pela metade)', async () => {
    const box = {};
    const ana = person('Ana', ANA, { FS: txHook(box) });
    const old = await join(ana);
    box.beforeCommit = () => seed((d) => deleteDoc(doc(d, 'codes', old))); // some entre a leitura e a gravação (outra aba saiu, limpeza manual…)
    const nu = await ana.sc.newCode();
    expect(box.calls).toBe(2); // a 1ª foi recusada por inteiro; a 2ª, sem o convite que sumiu, passou
    const all = await codesOf(ANA);
    expect(all.map((x) => x.id)).toEqual([nu]); // só o novo; nenhum código novo ficou "sobrando" da transação recusada
    expect(liveOnly(all)).toEqual([nu]);
  });
  test('abrir o app não mexe no convite: só mudar nome ou mascote o atualiza (quem tem o código não vê quando você aparece)', async () => {
    const writes = [];
    const note = (k) => function (ref) { if (ref && /^codes\//.test(ref.path)) writes.push(k); return FS[k].apply(FS, arguments); };
    const spy = Object.assign({}, FS, { setDoc: note('setDoc'), updateDoc: note('updateDoc'), deleteDoc: note('deleteDoc') });
    const ana = person('Ana', ANA, { FS: spy });
    const c = await join(ana);
    expect(writes).toEqual(['setDoc']); // a criação do convite
    writes.length = 0;
    const ana2 = person('Ana', ANA, { FS: spy }); // o app reabriu: mesma conta, mesmo nome e mascote
    expect(await ana2.sc.join({ payload: ana2.payload(), code: c })).toBe(c);
    drink(ana2, 700);
    expect(await ana2.sc.publish(ana2.payload())).toBe(true); // o progresso muda o tempo todo...
    drink(ana2, 900);
    expect(await ana2.sc.publish(ana2.payload())).toBe(true);
    expect(writes).toEqual([]); // ...e o convite não é tocado
    ana2.S.social.nick = 'Aninha';
    expect(await ana2.sc.publish(ana2.payload())).toBe(true);
    expect(writes).toEqual(['updateDoc']); // só uma troca de nome mexe nele
    expect((await seed((d) => getDoc(doc(d, 'codes', c)))).data()).toMatchObject({ nm: 'Aninha' });
  });
  test('o sorteio caiu num código de outra pessoa: sorteia de novo, sem tocar no dela, e o antigo é revogado do mesmo jeito', async () => {
    await seed((d) => setDoc(doc(d, 'codes', 'KMNPQRST'), { uid: CAI, nm: 'Caio', mc: 'baleia' }));
    const ana = person('Ana', ANA, { rand: seq('KMNPQRST', 'KMNPQRST', 'WXYZ2345', 'KMNPQRST', 'HJKMNPQR') });
    const first = await join(ana); // KMNPQRST (do Caio) duas vezes, depois WXYZ2345
    expect(first).toBe('WXYZ2345');
    expect(await ana.sc.newCode()).toBe('HJKMNPQR'); // KMNPQRST de novo (Caio), depois HJKMNPQR
    expect(liveOnly(await codesOf(ANA))).toEqual(['HJKMNPQR']);
    expect((await seed((d) => getDoc(doc(d, 'codes', 'KMNPQRST')))).data()).toMatchObject({ uid: CAI, nm: 'Caio' });
  });
  test('uma aba antiga (que ainda acha que o código é o velho) não ressuscita o código trocado em outra aba', async () => {
    const aba1 = person('Ana', ANA); const old = await join(aba1);
    const aba2 = person('Ana', ANA); await aba2.sc.join({ payload: aba2.payload(), code: old });
    const nu = await aba2.sc.newCode();
    expect(liveOnly(await codesOf(ANA))).toEqual([nu]);
    aba1.S.social.nick = 'Aninha'; // a aba velha muda o apelido: sincroniza o nome no convite que CONHECE (o revogado)
    expect(await aba1.sc.publish(aba1.payload())).toBe(true);
    const all = await codesOf(ANA);
    expect(liveOnly(all)).toEqual([nu]); // continua valendo só o novo
    expect(all.find((x) => x.id === old).rv).toBe(true); // o velho segue revogado
    expect(all).toHaveLength(2);
    expect(await person('Bruno', BRU).sc.lookup(old)).toBeNull();
    expect(await aba1.sc.join({ payload: aba1.payload(), code: old })).toBe(nu); // e a aba velha se acerta com o código novo ao entrar
    expect(code(aba1)).toBe(nu);
  });
  test('mudar apelido ou mascote só ATUALIZA o convite: nunca cria um código que não existe mais', async () => {
    const ana = person('Ana', ANA); const c = await join(ana);
    await seed((d) => deleteDoc(doc(d, 'codes', c))); // o convite sumiu (outra aba saiu, limpeza manual…)
    ana.S.social.nick = 'Aninha';
    expect(await ana.sc.publish(ana.payload())).toBe(true); // o perfil é enviado; o convite não é recriado por tabela
    expect((await seed((d) => getDoc(doc(d, 'codes', c)))).exists()).toBe(false);
    expect(await codesOf(ANA)).toEqual([]);
    const novo = await ana.sc.join({ payload: ana.payload(), code: c }); // entrar de novo é o caminho que cria um convite
    expect(novo).not.toBe(c);
    expect(liveOnly(await codesOf(ANA))).toEqual([novo]);
  });
  test('ninguém toma um código que o dono trocou (nem para se passar por ele): o servidor recusa e o convite segue "não existe"', async () => {
    const ana = person('Ana', ANA); const old = await join(ana);
    await ana.sc.newCode();
    const evil = env.authenticatedContext(CAI).firestore();
    expect((await err(setDoc(doc(evil, 'codes', old), { uid: CAI, nm: 'Ana', mc: 'concha' }))).code).toBe('permission-denied');
    expect((await seed((d) => getDoc(doc(d, 'codes', old)))).data()).toMatchObject({ uid: ANA, rv: true });
    const bru = person('Bruno', BRU); await join(bru);
    expect(await bru.sc.lookup(old)).toBeNull();
    expect((await err(bru.sc.request(old))).code).toBe('notfound');
  });
  test('quem tem o código antigo não consegue mais pedir amizade (nem forçando o pedido por fora do app)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const old = await join(bru);
    await bru.sc.newCode();
    expect((await err(ana.sc.request(old))).code).toBe('notfound');
    const raw = env.authenticatedContext(ANA).firestore();
    const forced = { m: pid(ANA, BRU).split('_'), by: ANA, st: 'pending', nm: 'Ana', mc: 'concha', tn: 'Bruno', tc: 'concha', cd: old, at: FS.serverTimestamp() };
    expect((await err(setDoc(doc(raw, 'friendships', pid(ANA, BRU)), forced))).code).toBe('permission-denied');
  });
  test('sair da turma revoga os convites (sem nome) e entrar de novo cria um convite diferente', async () => {
    const ana = person('Ana', ANA); const c1 = await join(ana);
    await ana.sc.newCode(); // dois convites no histórico: um revogado e um vigente
    const c2 = code(ana);
    await ana.sc.leave();
    const all = await codesOf(ANA);
    expect(all.map((x) => x.id).sort()).toEqual([c1, c2].sort());
    all.forEach((x) => { expect(x).toMatchObject({ nm: '-', mc: '-', rv: true }); });
    expect(await person('Bruno', BRU).sc.lookup(c2)).toBeNull();
    const c3 = await join(ana);
    expect([c1, c2]).not.toContain(c3);
    expect(liveOnly(await codesOf(ANA))).toEqual([c3]);
  });
});

describe('sair da turma à prova de falha (tudo ou nada)', () => {
  const mineIn = async (coll) => (await seed((d) => getDocs(collection(d, coll)))).size;
  const profileExists = async (u) => (await seed((d) => getDoc(doc(d, 'profiles', u || ANA)))).exists();
  test('o outro lado desfaz a amizade no instante em que eu saio: a saída refaz a conta, termina bem e não deixa nada público', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    await befriend(ana, bru);
    const cc = await join(cai); await ana.sc.request(cc);
    const ac = code(ana);
    await until(() => cai.sc.state().reqIn.length === 1, 'pedido chegou');
    const box = { beforeCommit: () => bru.sc.remove(ANA) }; // o Bruno desfaz a amizade entre a leitura e a gravação
    const sai = person('Ana', ANA, { FS: txHook(box) });
    await sai.sc.leave();
    expect(box.ran).toBe(true);
    expect(box.calls).toBe(2); // a primeira transação foi recusada por inteiro (nada gravado); a segunda, com a conta refeita, passou
    expect(await profileExists()).toBe(false);
    expect(await mineIn('friendships')).toBe(0);
    expect((await seed((d) => getDoc(doc(d, 'codes', ac)))).data()).toMatchObject({ rv: true, nm: '-', mc: '-' });
  });
  test('sem internet, sair falha ANTES de gravar qualquer coisa (o perfil não some pela metade)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    const off = Object.assign({}, FS, { getDocsFromServer: async () => { throw unavailable(); } });
    const sai = person('Ana', ANA, { FS: off });
    expect((await err(sai.sc.leave())).code).toBe('offline');
    expect(await profileExists()).toBe(true);
    expect(liveOnly(await codesOf(ANA))).toHaveLength(1);
  });
  test('a gravação falha (sem rede): NADA muda (perfil, convite e amizades ficam como estavam), o estado da tela também, e tentar de novo termina', async () => {
    const box = { fail: true };
    const ana = person('Ana', ANA, { FS: txHook(box) }), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const ac = code(ana);
    expect((await err(ana.sc.leave())).code).toBe('offline'); // o erro chega à tela
    expect(box.calls).toBe(1);
    expect(await profileExists()).toBe(true); // o perfil continua como estava: os amigos seguem vendo, e a tela pode dizer a verdade ("não apaguei nada")
    expect(await mineIn('friendships')).toBe(1);
    expect(liveOnly(await codesOf(ANA))).toEqual([ac]);
    expect((await codesOf(ANA))[0]).toMatchObject({ nm: 'Ana', mc: 'concha' }); // o convite nem foi limpo
    expect(ana.sc.state()).toMatchObject({ code: ac }); // e o aparelho continua com o que tinha
    expect(ana.sc.state().friends).toHaveLength(1);
    ana.sc.start(ana.hooks); // como o app faz depois da falha: volta a ouvir
    await until(() => ana.sc.state().ready && ana.sc.state().friends.length === 1, 'voltou a ouvir');
    drink(ana, 400);
    expect(await ana.sc.publish(ana.payload())).toBe(true); // e volta a publicar normalmente
    box.fail = false;
    await ana.sc.leave(); // tentar de novo termina o serviço
    expect(await profileExists()).toBe(false);
    expect(await mineIn('friendships')).toBe(0);
    expect((await codesOf(ANA)).every((x) => x.rv === true && x.nm === '-' && x.mc === '-')).toBe(true);
    await until(() => !bru.sc.state().friends.length, 'o Bruno viu a amizade acabar');
  });
  test('o servidor também é tudo-ou-nada: uma gravação recusada no meio da transação não aplica NENHUMA das outras', async () => {
    // A mesma transação que a saída usa, com uma amizade que não é minha de propósito: o servidor recusa tudo, inclusive o apagar do perfil
    const ana = person('Ana', ANA); const c = await join(ana);
    await seed((d) => setDoc(doc(d, 'friendships', pid(BRU, CAI)), { m: pid(BRU, CAI).split('_'), by: BRU, st: 'active', nm: 'B', mc: 'concha', tn: 'C', tc: 'concha' }));
    const db = env.authenticatedContext(ANA).firestore();
    const e = await err(FS.runTransaction(db, async (tx) => {
      tx.delete(doc(db, 'profiles', ANA));
      tx.update(doc(db, 'codes', c), { nm: '-', mc: '-', rv: true });
      tx.delete(doc(db, 'friendships', pid(BRU, CAI))); // não sou membro: recusado
    }));
    expect(e && e.code).toBe('permission-denied');
    expect(await profileExists()).toBe(true);
    expect(liveOnly(await codesOf(ANA))).toEqual([c]);
    expect(await mineIn('friendships')).toBe(1);
  });
  test('um envio agendado ANTES de sair não recria o perfil depois (touch + sair)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    drink(ana, 500); ana.sc.touch();
    await ana.sc.leave();
    await sleep(1500); // passa o tempo do envio agendado
    expect(await profileExists()).toBe(false);
    expect(await ana.sc.flush()).toBe(false);
  });
  test('um publish que chega no meio da saída é ignorado (não ressuscita o perfil que está sendo apagado)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    const saindo = ana.sc.leave();
    drink(ana, 900);
    expect(await ana.sc.publish(ana.payload(), true)).toBe(false);
    await saindo;
    expect(await profileExists()).toBe(false);
  });
  test('depois de sair, entrar de novo volta a publicar normalmente', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await ana.sc.leave();
    drink(ana, 1000);
    await join(ana);
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).data().pct).toBe(50);
    expect(await ana.sc.publish(Object.assign({}, ana.payload(), { pct: 60 }))).toBe(true);
  });
  test('sair duas vezes seguidas termina bem nas duas (o convite já limpo continua aceitando a limpeza)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await ana.sc.leave();
    await ana.sc.leave();
    expect(await profileExists()).toBe(false);
    expect((await codesOf(ANA)).every((x) => x.rv === true && x.nm === '-')).toBe(true);
  });
  test('duas instâncias saindo ao mesmo tempo (duas abas): as duas terminam bem', async () => {
    const a1 = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(a1, bru);
    const a2 = person('Ana', ANA);
    const [r1, r2] = await Promise.all([err(a1.sc.leave()), err(a2.sc.leave())]);
    expect([r1, r2]).toEqual([null, null]);
    expect(await profileExists()).toBe(false);
    expect(await mineIn('friendships')).toBe(0);
    expect((await codesOf(ANA)).every((x) => x.rv === true && x.nm === '-')).toBe(true);
  });
  test('pedir para sair de novo enquanto a saída ainda corre (a tela desistiu de esperar) não começa outra: as duas chamadas esperam a mesma', async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const box = { beforeCommit: () => gate }; // segura a saída bem na hora de gravar
    const ana = person('Ana', ANA, { FS: txHook(box) }), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const p1 = ana.sc.leave();
    await until(() => box.ran, 'a saída chegou na hora de gravar');
    const p2 = ana.sc.leave(); // a pessoa tocou de novo
    expect(p2).toBe(p1);
    release();
    expect(await err(Promise.all([p1, p2]))).toBeNull();
    expect(box.calls).toBe(1); // uma única transação, não duas saídas uma por cima da outra
    expect(await profileExists()).toBe(false);
    expect(await mineIn('friendships')).toBe(0);
    const p3 = ana.sc.leave(); // terminada a saída, pedir de novo é uma saída nova (e termina bem)
    expect(p3).not.toBe(p1);
    expect(await err(p3)).toBeNull();
    // a saída que falha também libera a vez: a seguinte tenta de verdade
    const folha = person('Ana', ANA, { FS: txHook({ fail: true }) });
    const f1 = folha.sc.leave(), f2 = folha.sc.leave();
    expect(f2).toBe(f1);
    expect((await err(f1)).code).toBe('offline');
    const f3 = folha.sc.leave();
    expect(f3).not.toBe(f1);
    expect((await err(f3)).code).toBe('offline');
  });
  test('religar a escuta no meio da saída não faz nada: nenhuma escuta nova abre e nada fica ligado depois (a pessoa não volta a "aparecer")', async () => {
    const box = {}; // conta as escutas de verdade: abertas e ainda ligadas (olhar só o estado da tela não pega: a 1ª resposta chega antes do fim da saída)
    const watch = Object.assign({}, FS, { onSnapshot: function () {
      box.opened = (box.opened || 0) + 1; box.open = (box.open || 0) + 1;
      const off = FS.onSnapshot.apply(FS, arguments); let done = false;
      return () => { if (!done) { done = true; box.open--; } off(); };
    } });
    const ana = person('Ana', ANA, { FS: watch }); await join(ana);
    expect(box.open).toBeGreaterThan(0); // antes da saída a escuta estava ligada
    const saindo = ana.sc.leave();
    expect(box.open).toBe(0); // sair desliga a escuta na hora
    const antes = box.opened;
    ana.sc.start(ana.hooks); // o app (ou um temporizador) tenta religar no meio da saída
    expect(box.opened).toBe(antes); // e nada abre
    await saindo;
    await sleep(400);
    expect(box.opened).toBe(antes);
    expect(box.open).toBe(0); // terminada a saída, não sobrou escuta nenhuma
    expect(ana.sc.state()).toMatchObject({ ready: false, code: '', friends: [], reqIn: [], reqOut: [] });
    ana.sc.start(ana.hooks); // passada a saída, religar volta a funcionar
    await until(() => ana.sc.state().ready, 'a escuta voltou depois da saída');
    expect(box.open).toBeGreaterThan(0);
  });
  test('enquanto sai, nenhuma outra gravação passa na frente: tudo responde "busy" e nada é gravado', async () => {
    let release; const gate = new Promise((r) => { release = r; });
    const box = { beforeCommit: () => gate }; // segura a saída bem na hora de gravar
    const ana = person('Ana', ANA, { FS: txHook(box) }), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    await befriend(ana, bru);
    await join(cai); await cai.sc.request(code(ana));
    await until(() => ana.sc.state().reqIn.length === 1, 'o pedido do Caio chegou');
    const bc = code(bru);
    const saindo = ana.sc.leave();
    await until(() => box.ran, 'a saída chegou na hora de gravar');
    const tries = {
      join: ana.sc.join({ payload: ana.payload() }), newCode: ana.sc.newCode(), request: ana.sc.request(bc), accept: ana.sc.accept(CAI),
      decline: ana.sc.decline(CAI), declineAll: ana.sc.declineAll(), wave: ana.sc.wave(BRU, 'hi', TODAY), remove: ana.sc.remove(BRU), cancel: ana.sc.cancel(CAI),
    };
    for (const k of Object.keys(tries)) expect((await err(tries[k])).code, k).toBe('busy');
    expect(await ana.sc.lookup(bc)).toMatchObject({ uid: BRU }); // ler continua liberado
    release();
    await saindo;
    expect(await profileExists()).toBe(false); // nada ressuscitou o perfil
    expect(await mineIn('friendships')).toBe(0); // nenhum pedido novo, nenhum aceite
    expect((await codesOf(ANA)).every((x) => x.rv === true && x.nm === '-')).toBe(true); // e nenhum convite novo
    const again = await join(ana); // passada a saída, tudo volta a funcionar
    expect(again).toMatch(/^[A-Z2-9]{8}$/);
  });
  test('a saída tem prazo: passado o tempo, nenhuma etapa nova começa (nada é gravado) e o erro chega à tela', async () => {
    const ana = person('Ana', ANA); await join(ana);
    const box = {};
    const slow = Object.assign({}, txHook(box), { getDocsFromServer: async function () { await sleep(90); return FS.getDocsFromServer.apply(FS, arguments); } });
    const sai = person('Ana', ANA, { FS: slow, leaveMs: 40 });
    expect((await err(sai.sc.leave())).code).toBe('offline');
    expect(box.calls || 0).toBe(0); // nenhuma transação começou
    expect(await profileExists()).toBe(true);
    expect(liveOnly(await codesOf(ANA))).toHaveLength(1);
    const folga = person('Ana', ANA, { FS: slow, leaveMs: 8000 }); // a mesma lentidão, com prazo de sobra: termina
    await folga.sc.leave();
    expect(await profileExists()).toBe(false);
  });
});

describe('sair com uma enxurrada de pedidos (mais de 200 documentos)', () => {
  // N pedidos de desconhecidos para a Ana, semeados em lotes de 200
  const strangers = (n) => seed(async (d) => {
    for (let k = 0; k < n; k += 200) {
      const b = FS.writeBatch(d);
      for (let i = k; i < Math.min(n, k + 200); i++) {
        const f = 'aaf' + String(i).padStart(3, '0') + 'x'.repeat(22);
        b.set(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'pending', nm: 'F' + i, mc: 'concha', tn: 'Ana', tc: 'concha', cd: 'AAAA2222', at: Timestamp.fromMillis(1000 + i) });
      }
      await b.commit();
    }
  });
  const count = async (c) => (await seed((d) => getDocs(collection(d, c)))).size;
  test('sai em etapas de até 200 gravações: as amizades primeiro; perfil e convite só na última', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await strangers(450);
    const sizes = [];
    const sai = person('Ana', ANA, { FS: txHook({ onTx: (n) => sizes.push(n) }) });
    await sai.sc.leave();
    expect(sizes).toEqual([200, 200, 52]); // 200 + 200 + (50 que sobraram + perfil + 1 convite)
    expect(await count('friendships')).toBe(0);
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).exists()).toBe(false);
    expect((await codesOf(ANA)).every((x) => x.rv === true && x.nm === '-')).toBe(true);
  }, 60000);
  test('se uma etapa falha, a pessoa segue nos amigos (perfil e convite intactos), só com menos amizades; tentar de novo termina', async () => {
    const ana = person('Ana', ANA); const ac = await join(ana);
    await strangers(450);
    const box = { fail: (call) => call === 3 }; // as duas primeiras etapas passam; a última (a do perfil) falha
    const sai = person('Ana', ANA, { FS: txHook(box) });
    expect((await err(sai.sc.leave())).code).toBe('offline');
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).exists()).toBe(true); // perfil e convite continuam: um estado válido
    expect(liveOnly(await codesOf(ANA))).toEqual([ac]);
    expect(await count('friendships')).toBe(50);
    box.fail = false;
    await sai.sc.leave();
    expect(await count('friendships')).toBe(0);
    expect((await seed((d) => getDoc(doc(d, 'profiles', ANA)))).exists()).toBe(false);
  }, 60000);
});

describe('muitos pedidos (enxurrada) e pedidos que somem no meio', () => {
  const count = async () => (await seed((d) => getDocs(collection(d, 'friendships')))).size;
  // 210 pedidos de desconhecidos cujos ids vêm ANTES do Bruno na ordem: o documento do Bruno fica depois da primeira página (200)
  const flood = (st) => seed(async (d) => {
    const b = FS.writeBatch(d);
    for (let i = 0; i < 210; i++) {
      const f = 'aaf' + String(i).padStart(3, '0') + 'x'.repeat(22);
      b.set(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'pending', nm: 'F' + i, mc: 'concha', tn: 'Ana', tc: 'concha', cd: 'AAAA2222', at: Timestamp.fromMillis(1000 + i) });
    }
    if (st !== false) b.set(doc(d, 'friendships', pid(ANA, BRU)), Object.assign({ m: pid(ANA, BRU).split('_'), by: BRU, st: 'pending', nm: 'Bruno', mc: 'polvo', tn: 'Ana', tc: 'concha', cd: 'AAAA2222', at: Timestamp.now() }, st));
    await b.commit();
  });
  test('o pedido do Bruno está além da primeira página: digitar o código dele ainda fecha a amizade (e a tela mostra no máximo 30 pedidos)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await flood();
    await until(() => ana.sc.state().reqIn.length === MAX_FRIENDS, 'a enxurrada chegou (limitada a 30 na tela)');
    const r = await ana.sc.request(bc);
    expect(r).toMatchObject({ kind: 'accepted', uid: BRU });
    expect((await seed((d) => getDoc(doc(d, 'friendships', pid(ANA, BRU))))).data().st).toBe('active');
  });
  test('além da primeira página: amizade que já existe vira "exists" e pedido meu vira "pending" (nunca um erro de regras)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); const bc = await join(bru);
    await flood({ by: ANA, st: 'active', ok: Timestamp.now() });
    expect((await err(ana.sc.request(bc))).code).toBe('exists');
    await env.clearFirestore();
    await join(ana); await join(bru);
    await flood({ by: ANA, st: 'pending' });
    expect((await err(ana.sc.request(code(bru)))).code).toBe('pending');
  });
  test('aceitar e recusar o pedido que está além da primeira página também funciona', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await join(ana); await join(bru);
    await flood();
    await ana.sc.accept(BRU);
    expect((await seed((d) => getDoc(doc(d, 'friendships', pid(ANA, BRU))))).data().st).toBe('active');
    await ana.sc.remove(BRU);
    expect((await seed((d) => getDoc(doc(d, 'friendships', pid(ANA, BRU))))).exists()).toBe(false);
    await ana.sc.remove(BRU); // já não existe: terminar bem, mesmo com a página cheia
  });
  test('declineAll: recusa todos os pedidos que recebi (e só eles), mesmo os que a tela não mostra', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU), cai = person('Caio', CAI);
    await join(ana); const bc = await join(bru); await join(cai);
    await ana.sc.request(bc); // um pedido MEU: tem que continuar
    await flood(false);       // 210 pedidos de desconhecidos para mim (a tela mostra só 30)
    await seed((d) => setDoc(doc(d, 'friendships', pid(ANA, CAI)), { m: pid(ANA, CAI).split('_'), by: CAI, st: 'active', nm: 'Caio', mc: 'baleia', tn: 'Ana', tc: 'concha', at: Timestamp.now(), ok: Timestamp.now() }));
    await until(() => ana.sc.state().reqIn.length === MAX_FRIENDS && ana.sc.state().friends.length === 1 && ana.sc.state().reqOut.length === 1, 'estado carregado');
    expect(await ana.sc.declineAll()).toBe(210);
    const left = await seed((d) => getDocs(collection(d, 'friendships')));
    expect(left.docs.map((x) => x.id).sort()).toEqual([pid(ANA, BRU), pid(ANA, CAI)].sort()); // ficaram: o meu pedido e o amigo
    await until(() => ana.sc.state().reqIn.length === 0, 'a tela esvaziou os pedidos');
    expect(ana.sc.state().friends).toHaveLength(1);
    expect(ana.sc.state().reqOut).toHaveLength(1);
    expect(await ana.sc.declineAll()).toBe(0); // sem nada a recusar: termina bem
  });
  test('declineAll com mais de 500 pedidos: vários lotes (um lote do Firestore aceita no máximo 500 gravações)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await seed(async (d) => {
      for (let k = 0; k < 2; k++) { // 520 pedidos de desconhecidos, semeados em dois lotes
        const b = FS.writeBatch(d);
        for (let i = k * 260; i < (k + 1) * 260; i++) {
          const f = 'aaf' + String(i).padStart(3, '0') + 'x'.repeat(22);
          b.set(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'pending', nm: 'F' + i, mc: 'concha', tn: 'Ana', tc: 'concha', cd: 'AAAA2222', at: Timestamp.fromMillis(1000 + i) });
        }
        await b.commit();
      }
    });
    await until(() => ana.sc.state().reqIn.length === MAX_FRIENDS, 'a enxurrada chegou (a tela mostra 30)');
    const lotes = [];
    const spy = person('Ana', ANA, { FS: batchHook({ onCommit: (n) => lotes.push(n) }) });
    spy.sc.start(spy.hooks);
    await until(() => spy.sc.state().ready && spy.sc.state().reqIn.length === MAX_FRIENDS, 'a outra instância também carregou');
    expect(await spy.sc.declineAll()).toBe(520);
    expect(Math.max.apply(null, lotes)).toBeLessThanOrEqual(200);
    expect((await seed((d) => getDocs(collection(d, 'friendships')))).size).toBe(0);
  }, 60000);
  test('declineAll aguenta um dos pedidos já ter sumido no meio (o remetente cancelou agora)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await seed(async (d) => {
      for (const n of ['p1', 'p2', 'p3']) { const f = U(n); await setDoc(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'pending', nm: n, mc: 'concha', tn: 'Ana', tc: 'concha', at: Timestamp.now() }); }
    });
    await until(() => ana.sc.state().reqIn.length === 3, 'três pedidos');
    const box = { beforeCommit: () => seed((d) => deleteDoc(doc(d, 'friendships', pid(ANA, U('p2'))))) }; // um some entre a leitura e o lote
    const sai = person('Ana', ANA, { FS: batchHook(box) });
    sai.sc.start(sai.hooks);
    await until(() => sai.sc.state().reqIn.length === 3, 'a outra instância também viu os três');
    expect(await sai.sc.declineAll()).toBe(3);
    expect((await seed((d) => getDocs(collection(d, 'friendships')))).size).toBe(0);
  });
  test('declineAll antes da primeira resposta da nuvem: confere no servidor antes de agir (não confia na cópia do aparelho)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await seed(async (d) => {
      for (const n of ['p1', 'p2', 'p3']) { const f = U(n); await setDoc(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'pending', nm: n, mc: 'concha', tn: 'Ana', tc: 'concha', at: Timestamp.now() }); }
    });
    await until(() => ana.sc.state().reqIn.length === 3, 'três pedidos');
    const saved = JSON.parse(JSON.stringify(ana.sc.state()));
    await seed((d) => deleteDoc(doc(d, 'friendships', pid(ANA, U('p3'))))); // o p3 cancelou depois de a cópia ser feita
    const nova = person('Ana', ANA, { cache: saved }); // app reaberto, sem escuta ainda
    expect(nova.sc.state()).toMatchObject({ ready: false });
    expect(nova.sc.state().reqIn).toHaveLength(3); // a tela ainda mostra os três da cópia
    expect(await nova.sc.declineAll()).toBe(2); // recusa o que existe de verdade
    expect(await count()).toBe(0);
  });
  test('declineAll sem conseguir falar com a nuvem: falha com "offline" e não apaga nada', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await seed(async (d) => { const f = U('p1'); await setDoc(doc(d, 'friendships', pid(ANA, f)), { m: pid(ANA, f).split('_'), by: f, st: 'pending', nm: 'p1', mc: 'concha', tn: 'Ana', tc: 'concha', at: Timestamp.now() }); });
    await until(() => ana.sc.state().reqIn.length === 1, 'o pedido');
    const saved = JSON.parse(JSON.stringify(ana.sc.state()));
    const off = Object.assign({}, FS, { getDocsFromServer: async () => { throw unavailable(); } });
    const nova = person('Ana', ANA, { cache: saved, FS: off });
    expect((await err(nova.sc.declineAll())).code).toBe('offline');
    expect(await count()).toBe(1);
  });
  test('sem a escuta ligada, refresh lê TODAS as amizades (não só a primeira página de 200)', async () => {
    const ana = person('Ana', ANA); await join(ana);
    await flood(); // 210 pedidos 'aaf…' + o pedido do Bruno, que fica depois da primeira página
    const nova = person('Ana', ANA); // não ligada: refresh lê direto do servidor
    await nova.sc.refresh();
    expect(nova.sc.state().reqIn).toHaveLength(MAX_FRIENDS); // a tela mostra no máximo 30...
    expect(nova.sc.state().reqIn.some((r) => r.uid === BRU)).toBe(true); // ...mas conhece o do Bruno (que a primeira página deixaria de fora)
  });
  test('acenar para quem acabou de desfazer a amizade devolve "gone", não "tente de novo": a tela explica certo', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    ana.sc.stop(); // a escuta de Ana não vê o fim da amizade (como num instante de corrida)
    await bru.sc.remove(ANA);
    expect((await err(ana.sc.wave(BRU, 'hi', TODAY))).code).toBe('gone');
  });
  test('e um aceno repetido em menos de 10 minutos continua sendo "wave" (tente daqui a pouco)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    await ana.sc.wave(BRU, 'hi', TODAY);
    expect((await err(ana.sc.wave(BRU, 'cheer', TODAY))).code).toBe('wave');
  });
});

describe('a escuta do perfil de um amigo se recupera sozinha', () => {
  // FS em que as PRIMEIRAS "times" escutas do perfil de "uid" são recusadas na hora (como o servidor ainda sem saber do aceite).
  // A recusa chega num microtask: depois da chamada (o app já guardou a escuta) e ANTES de qualquer resposta da rede, que precisa de uma volta
  // do laço de eventos. Com setTimeout(0) a ordem ficava ao acaso: sob carga, o aviso "a amizade ficou ativa" passava na frente da recusa,
  // o app não tinha o que refazer naquele instante e só tentava de novo no temporizador (2 s, depois 6 s): o teste falhava de vez em quando.
  const flaky = (uid, times) => {
    let left = times;
    return Object.assign({}, FS, { onSnapshot: function (ref, a, b) {
      if (left > 0 && ref && ref.path === 'profiles/' + uid && typeof b === 'function') { left--; Promise.resolve().then(() => { b({ code: 'permission-denied' }); }); return () => {}; }
      return FS.onSnapshot.apply(FS, arguments);
    } });
  };
  test('escuta recusada logo depois do aceite: o perfil do amigo aparece depois, sem reabrir o app', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU, { FS: flaky(ANA, 2) });
    drink(ana, 1000);
    await befriend(ana, bru); // o "befriend" só termina quando o perfil dela chegou no Bruno: se a escuta não se recuperasse, travaria aqui
    expect(bru.sc.state().friends[0]).toMatchObject({ uid: ANA, nm: 'Ana', pct: 50, day: TODAY });
    expect(bru.sc.state().err).toBe('');
  });
  test('a escuta recusada no aceite volta assim que o servidor confirma (não espera o temporizador de 2 s)', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU, { FS: flaky(ANA, 1) });
    drink(ana, 1000);
    const bc = await join(bru); await join(ana);
    await ana.sc.request(bc);
    await until(() => bru.sc.state().reqIn.some((r) => r.uid === ANA), 'pedido chegou');
    const t0 = Date.now();
    await bru.sc.accept(ANA);
    await until(() => loaded(bru, ANA), 'perfil dela chegou no Bruno', 1800); // antes do temporizador de 2 s
    expect(Date.now() - t0).toBeLessThan(1900);
  });
  test('o amigo sai da lista enquanto a nova tentativa está agendada: nenhum temporizador do app fica vivo', async () => {
    // Anota os temporizadores criados POR social-cloud.js (o chamador direto), para provar que nenhum sobra depois de stop()
    const pending = new Set(), realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
    globalThis.setTimeout = function (fn, ms) {
      const args = Array.prototype.slice.call(arguments, 2);
      if (!/social-cloud\.js/.test(String(new Error().stack).split('\n')[2] || '')) return realSet.apply(this, arguments);
      const h = realSet(function () { pending.delete(h); return fn.apply(this, args); }, ms);
      pending.add(h);
      return h;
    };
    globalThis.clearTimeout = function (h) { pending.delete(h); return realClear.apply(this, arguments); };
    try {
      const ana = person('Ana', ANA), bru = person('Bruno', BRU, { FS: flaky(ANA, 99) }); // nunca deixa a escuta abrir
      await join(ana); const bc = await join(bru);
      await ana.sc.request(bc);
      await until(() => bru.sc.state().reqIn.length === 1, 'pedido chegou');
      await bru.sc.accept(ANA);
      await until(() => bru.sc.state().friends.length === 1, 'amigo na lista');
      expect(bru.sc.state().friends[0].day).toBe(''); // sem perfil (escuta recusada): mostra só o que a amizade sabe
      await sleep(120); // os avisos de tela (40 ms) já passaram; sobra só a nova tentativa agendada
      expect(pending.size).toBeGreaterThanOrEqual(1); // prova de que o anotador enxerga os temporizadores do app
      await ana.sc.remove(BRU);
      await until(() => bru.sc.state().friends.length === 0, 'amigo saiu');
      await sleep(120);
      expect(pending.size).toBe(0); // a amizade acabou: a nova tentativa foi cancelada
      // e com um amigo que continua na lista, stop() também cancela a nova tentativa
      await ana.sc.request(bc);
      await until(() => bru.sc.state().reqIn.length === 1, 'novo pedido chegou');
      await bru.sc.accept(ANA);
      await until(() => bru.sc.state().friends.length === 1, 'amigo de volta');
      await sleep(120);
      expect(pending.size).toBeGreaterThanOrEqual(1);
      bru.sc.stop();
      await sleep(120);
      expect(pending.size).toBe(0);
    } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
  });
});

describe('a cópia do aparelho só vale para a mesma conta', () => {
  test('o estado leva o uid da conta e a cópia feita dele volta inteira', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const saved = JSON.parse(JSON.stringify(ana.sc.state()));
    expect(saved.uid).toBe(ANA);
    expect(person('Ana', ANA, { cache: saved }).sc.state().friends.map((f) => f.uid)).toEqual([BRU]);
  });
  test('o login mudou (outra conta no mesmo aparelho): a cópia da conta antiga é ignorada e entrar funciona', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    await befriend(ana, bru);
    const saved = JSON.parse(JSON.stringify(ana.sc.state()));
    const cai = person('Caio', CAI, { cache: saved });
    expect(cai.sc.state()).toMatchObject({ uid: CAI, code: '', friends: [], reqIn: [], reqOut: [] });
    const c = await join(cai); // antes: tentava gravar no convite da Ana e falhava para sempre
    expect(c).not.toBe(saved.code);
    expect((await seed((d) => getDoc(doc(d, 'codes', saved.code)))).data()).toMatchObject({ uid: ANA, nm: 'Ana' }); // o convite da Ana ficou intacto
    expect(cai.sc.state().friends).toEqual([]);
  });
  test('cópia sem dono (formato antigo) nunca vale', () => {
    const saved = { code: 'ABCDEFGH', at: 5, friends: [{ uid: BRU, nm: 'Bruno', mc: 'polvo', ins: ['concha'], pct: 10, met: false, st: 1, day: TODAY, sh: true, since: 1 }], reqIn: [], reqOut: [] };
    expect(person('Ana', ANA, { cache: saved }).sc.state()).toMatchObject({ code: '', friends: [] });
  });
  test('mesmo com a cópia certa, um código "meu" que na verdade é de outra pessoa não trava a entrada nem é alterado', async () => {
    await seed((d) => setDoc(doc(d, 'codes', 'KMNPQRST'), { uid: CAI, nm: 'Caio', mc: 'baleia' }));
    const cache = { uid: ANA, code: 'KMNPQRST', at: 1, friends: [], reqIn: [], reqOut: [] };
    const ana = person('Ana', ANA, { cache });
    const c = await ana.sc.join({ payload: ana.payload(), code: 'KMNPQRST' });
    expect(c).not.toBe('KMNPQRST');
    expect((await seed((d) => getDoc(doc(d, 'codes', 'KMNPQRST')))).data()).toMatchObject({ uid: CAI, nm: 'Caio', mc: 'baleia' });
    expect(liveOnly(await codesOf(ANA))).toEqual([c]);
  });
});

/* ============================== o perfil da 1.2.0: meta em ml (gl) e os 7 dias (wm) ============================== */
const metDay = (p, k) => { p.S.days[k] = { goal: 2000, entries: [{ id: 'e' + k, t: 1, ml: 2000, d: 'water' }] }; }; // o dia k com a meta batida
describe('o perfil da 1.2.0 com as regras de verdade: a meta em ml só com a escolha da pessoa, e os últimos 7 dias', () => {
  const profOf = async (uid) => (await seed((d) => getDoc(doc(d, 'profiles', uid)))).data();
  test('a meta em ml só vai se a pessoa deixar (gl); desligar apaga o valor; pausar o progresso zera tudo', async () => {
    const ana = person('Ana', ANA); drink(ana, 1234);
    await join(ana);
    expect((await profOf(ANA)).gl).toBeNull();
    ana.S.social.goal = true; await ana.sc.publish(ana.payload());
    expect((await profOf(ANA)).gl).toBe(2000);
    ana.S.social.goal = false; await ana.sc.publish(ana.payload());
    expect((await profOf(ANA)).gl).toBeNull();
    ana.S.social.goal = true; ana.S.social.share = false; await ana.sc.publish(ana.payload()); // pausou o progresso: a meta também some
    expect(await profOf(ANA)).toMatchObject({ sh: false, pct: null, met: false, st: 0, gl: null, wm: null });
  });
  test('os 7 dias vão como uma máscara de 7 bits (o bit 0 é o dia do perfil), em todo o intervalo que as regras aceitam: de 0 a 127', async () => {
    const ana = person('Ana', ANA); drink(ana, 500);
    await join(ana);
    expect((await profOf(ANA)).wm).toBe(0);
    metDay(ana, TODAY); metDay(ana, C.addDays(TODAY, -1)); metDay(ana, C.addDays(TODAY, -3));
    await ana.sc.publish(ana.payload());
    expect((await profOf(ANA)).wm).toBe(1 + 2 + 8);
    for (let i = 0; i < 7; i++) metDay(ana, C.addDays(TODAY, -i));
    await ana.sc.publish(ana.payload());
    expect((await profOf(ANA)).wm).toBe(127);
  });
  test('o amigo recebe a semana de quem a mostra e a meta em ml só de quem deixou', async () => {
    const ana = person('Ana', ANA), bru = person('Bruno', BRU);
    metDay(ana, TODAY); drink(bru, 1000); bru.S.social.goal = true; // Ana não mostra a meta; Bruno mostra
    await befriend(ana, bru);
    const fb = ana.sc.state().friends.filter((f) => f.uid === BRU)[0], fa = bru.sc.state().friends.filter((f) => f.uid === ANA)[0];
    expect(fb).toMatchObject({ nm: 'Bruno', pct: 50, gl: 2000, wm: 0 });
    expect(fa).toMatchObject({ nm: 'Ana', pct: 100, met: true, gl: null, wm: 1 });
    expect(weekOf(fa, TODAY)).toMatchObject({ known: true, n: 1 });
  });
});

/* ============================== o site novo antes das regras novas ============================== */
// O site sai sozinho em cerca de 1 minuto depois do push; as regras e as funções vão à parte. Nesse intervalo o app novo fala com as regras da 1.1.x,
// que não conhecem "gl" nem "wm": o perfil cai para o formato antigo (sem a meta em ml e sem os 7 dias) em vez de ser recusado.
describe('o site novo antes das regras novas (o servidor ainda está na 1.1.x): os amigos seguem funcionando', () => {
  const profOld = async (uid) => (await seedOld((d) => getDoc(doc(d, 'profiles', uid)))).data();
  const spyFS = (log) => Object.assign({}, FS, { setDoc: function (ref) { if (String(ref.path).indexOf('profiles/') === 0) log.push(ref.path); return FS.setDoc.apply(FS, arguments); } });
  test('entrar e publicar passam: o perfil vai no formato antigo e o convite sai normal', async () => {
    const ana = person('Ana', ANA, { env: old }); drink(ana, 1234);
    const c = await join(ana);
    expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(Object.keys(await profOld(ANA)).sort()).toEqual(['day', 'ins', 'mc', 'met', 'nm', 'pct', 'sh', 'st', 'v']);
    drink(ana, 2000); await ana.sc.publish(ana.payload());
    expect(await profOld(ANA)).toMatchObject({ pct: 100, met: true });
    ana.S.social.goal = true; await ana.sc.publish(ana.payload()); // ligar a meta em ml também não quebra (só não chega aos amigos ainda)
    expect(Object.keys(await profOld(ANA))).not.toContain('gl');
    expect(ana.sc.state().err).toBeFalsy();
  });
  test('dois amigos nesse servidor se enxergam como antes; só a semana e a meta em ml ficam de fora', async () => {
    const ana = person('Ana', ANA, { env: old }), bru = person('Bruno', BRU, { env: old });
    metDay(ana, TODAY); drink(bru, 1000); bru.S.social.goal = true;
    await befriend(ana, bru);
    const fb = ana.sc.state().friends.filter((f) => f.uid === BRU)[0];
    expect(fb).toMatchObject({ nm: 'Bruno', pct: 50, gl: null, wm: null });
    expect(weekOf(fb, TODAY).known).toBe(false);
  });
  test('quantas tentativas: uma com as regras novas; duas (a segunda no formato antigo) com as antigas; e a recusa de verdade continua chegando à tela', async () => {
    const novo = [], velho = [], fechado = [];
    const a = person('Ana', ANA, { FS: spyFS(novo) }); await a.sc.publish(a.payload(), true);
    expect(novo).toHaveLength(1);
    const b = person('Bia', BRU, { env: old, FS: spyFS(velho) }); await b.sc.publish(b.payload(), true);
    expect(velho).toHaveLength(2);
    const c = person('Caio', CAI, { env: closed, FS: spyFS(fechado) });
    const e = await err(c.sc.publish(c.payload(), true));
    expect(e && e.code).toBe('rules');
    expect(fechado).toHaveLength(2);
  });
  test('um erro de rede não vira "formato antigo": uma tentativa só, e a tela recebe "sem conexão" (não "regras")', async () => {
    const calls = [];
    const net = Object.assign({}, FS, { setDoc: function (ref) { calls.push(String(ref.path)); return Promise.reject(Object.assign(new Error('sem rede'), { code: 'unavailable' })); } });
    const a = person('Ana', ANA, { FS: net });
    const e = await err(a.sc.publish(a.payload(), true));
    expect(e && e.code).toBe('offline');
    expect(calls).toHaveLength(1);
  });
  test('um perfil que já está no formato antigo (sem gl nem wm) não tenta duas vezes: a recusa vem direto', async () => {
    const calls = [];
    const c = person('Caio', CAI, { env: closed, FS: spyFS(calls) });
    const p = c.payload(); delete p.gl; delete p.wm;
    const e = await err(c.sc.publish(p, true));
    expect(e && e.code).toBe('rules');
    expect(calls).toHaveLength(1);
  });
});
