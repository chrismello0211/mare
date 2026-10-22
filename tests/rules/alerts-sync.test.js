// Maré — "Avisos dos amigos" na nuvem (public/js/alerts-sync.js) contra o emulador do Firestore, COM as regras de segurança de verdade.
// É o pedaço do app que leva as três chaves de Ajustes (S.social.push, hit e week) para users/{uid}.social, onde as funções as consultam:
//   push = "Avisos dos amigos" (1.1.1), hit = "Avisar quando um amigo bater a meta" e week = "Resumo da semana da turma" (1.2.0).
// Cada "aparelho" é um login diferente usando o mesmo código que o firebase.js usa. Rodar: npm run test:rules
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAlertsSync, wantOf, knownOf, ASSUME } from '../../public/js/alerts-sync.js';
import { wantsAlerts, wantsKind } from '../../functions/social-push.js';
import * as C from '../../public/js/core.js';

FS.setLogLevel('silent'); // as recusas são esperadas aqui: sem barulho no terminal
const hp = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const RULES = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firestore.rules'), 'utf8');
const U = (n) => n + 'x'.repeat(28 - n.length);
const ANA = U('ana'), BRU = U('bruno');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, what, ms) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (e) { v = false; }
    if (v) return v;
    if (Date.now() - t0 > (ms || 6000)) throw new Error('esperei e não aconteceu: ' + what);
    await sleep(20);
  }
}
// As três escolhas como ficam na nuvem
const TRIO = (push, hit, week) => ({ push: push, hit: hit, week: week });
const DEFAULT = TRIO(true, false, true); // o que o servidor assume quando nada foi gravado

let env;
const ctxs = []; // cada login abre conexões próprias: encerradas no afterEach (como em social-cloud.test.js)
function track(e) {
  ['authenticatedContext', 'unauthenticatedContext'].forEach((k) => {
    const orig = e[k].bind(e);
    e[k] = function () { const c = orig.apply(null, arguments); ctxs.push(c); return c; };
  });
  return e;
}
beforeAll(async () => { env = track(await initializeTestEnvironment({ projectId: 'demo-mare-alerts', firestore: { host: hp[0], port: +hp[1], rules: RULES } })); });
afterAll(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
afterEach(() => { ctxs.splice(0).forEach((c) => { try { c.cleanup(); } catch (e) { /* já encerrado */ } }); });

const seedDoc = async (p, data) => { await env.withSecurityRulesDisabled(async (ctx) => { await FS.setDoc(FS.doc(ctx.firestore(), p), data); }); };
const readDoc = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { const s = await FS.getDoc(FS.doc(ctx.firestore(), p)); out = s.exists() ? s.data() : null; }); return out; };

// Um aparelho: o estado do app (S), a marca guardada no aparelho (mark) e tudo o que o módulo fez (gravações, avisos, marcas salvas).
// as = quem faz as gravações (padrão: o dono do documento); hold = as gravações ficam esperando a resposta (rede travada)
function phone(uid, o) {
  o = o || {};
  const S = C.defaults(1);
  S.onboarded = true; S.social = Object.assign({}, S.social, { on: true, nick: 'Ana', push: true }, o.social || {});
  const t = { S: S, mark: { uid: uid, pullAt: 0, pushAt: 0, fcm: '' }, writes: [], warns: [], saves: 0, hold: !!o.hold };
  const db = env.authenticatedContext(o.as || uid).firestore();
  const spy = Object.assign({}, FS, { setDoc: function () {
    t.writes.push(JSON.parse(JSON.stringify(arguments[1], (k, v) => (v && v._methodName ? '<serverTimestamp>' : v))));
    return t.hold ? new Promise(() => {}) : FS.setDoc.apply(FS, arguments);
  } });
  t.sync = createAlertsSync({ FS: spy, uref: FS.doc(db, 'users', uid), state: () => S, mark: () => t.mark, saveMark: () => { t.saves++; }, warn: (e) => { t.warns.push(e); } });
  t.setPush = (v) => { S.social.push = v; };
  t.set = (k, v) => { S.social[k] = v; };
  t.cloud = () => readDoc('users/' + uid);
  return t;
}

describe('as contas puras: o que o app quer e o que a nuvem já sabe', () => {
  test('o padrão que o servidor assume: push ligado, hit desligado, week ligado', () => {
    expect(ASSUME).toEqual(DEFAULT);
    expect(wantOf({})).toEqual(DEFAULT);
  });
  test('só um false de verdade desliga push e week, e só um true de verdade liga hit; o resto vale o padrão', () => {
    expect(wantOf({ push: false, hit: true, week: false })).toEqual(TRIO(false, true, false));
    expect(wantOf({ push: true, hit: false, week: true })).toEqual(DEFAULT);
    for (const v of [undefined, null, 0, 1, '', 'false', 'true', 'sim', NaN, {}, []]) expect(wantOf({ push: v, hit: v, week: v }), String(v)).toEqual(DEFAULT);
  });
  test('knownOf lê a marca em qualquer forma: nada, o booleano da 1.1.1 ou o objeto da 1.2.0', () => {
    for (const m of [undefined, null, 'x', 7, [], true, {}]) expect(knownOf(m), String(m)).toEqual(DEFAULT);
    expect(knownOf(false)).toEqual(TRIO(false, false, true)); // a marca antiga: só a chave push
    expect(knownOf({ push: false })).toEqual(TRIO(false, false, true));
    expect(knownOf({ hit: true, week: false })).toEqual(TRIO(true, true, false));
    expect(knownOf(TRIO(false, true, false))).toEqual(TRIO(false, true, false));
  });
});

describe('quem não mexeu nas chaves não grava nada', () => {
  test('tudo no padrão (o que o servidor já assume): nenhuma escrita, nem com várias chamadas', async () => {
    const a = phone(ANA);
    a.sync.push(); a.sync.push(); a.sync.push();
    await sleep(150);
    expect(a.writes).toEqual([]);
    expect(await a.cloud()).toBeNull();
    expect(a.saves).toBe(0);
  });
  test('qualquer valor que não seja o explícito vale o padrão: lixo nunca vai para a nuvem', async () => {
    for (const k of ['push', 'week']) {
      for (const v of [undefined, null, 0, 1, '', 'false', 'sim', NaN, {}, []]) {
        const a = phone(ANA);
        a.set(k, v);
        a.sync.push();
        expect(a.writes, k + ' = ' + String(v)).toEqual([]);
      }
    }
    for (const v of [undefined, null, 0, 1, '', 'true', 'sim', NaN, {}, [], false]) {
      const a = phone(ANA);
      a.set('hit', v);
      a.sync.push();
      expect(a.writes, 'hit = ' + String(v)).toEqual([]);
    }
  });
  test('amigos desligados neste aparelho: não grava, mesmo com as chaves mudadas', async () => {
    const a = phone(ANA, { social: { on: false, push: false, hit: true, week: false } });
    a.sync.push();
    await sleep(150);
    expect(a.writes).toEqual([]);
    expect(await a.cloud()).toBeNull();
  });
  test('estado sem a parte dos amigos (app muito antigo ou corrompido) não quebra nem grava', async () => {
    const a = phone(ANA);
    delete a.S.social;
    expect(() => a.sync.push()).not.toThrow();
    a.S.social = null;
    expect(() => a.sync.push()).not.toThrow();
    expect(a.writes).toEqual([]);
  });
});

describe('desligar e ligar os avisos dos amigos (push)', () => {
  test('desligar grava as três escolhas com as regras de verdade e só então guarda a marca', async () => {
    const a = phone(ANA);
    a.setPush(false);
    a.sync.push();
    expect(a.mark.social).toBeUndefined(); // ainda não voltou
    await until(() => a.saves === 1, 'a marca ser salva');
    expect(a.writes).toEqual([{ social: TRIO(false, false, true), updatedAt: '<serverTimestamp>' }]);
    expect(a.mark.social).toEqual(TRIO(false, false, true));
    const d = await a.cloud();
    expect(d.social).toEqual(TRIO(false, false, true));
    expect(d.updatedAt).toBeTruthy();
    expect(a.warns).toEqual([]);
  });
  test('a função do servidor lê exatamente o que o app gravou, em todas as combinações das três chaves', async () => {
    let i = 0;
    for (const push of [true, false]) {
      for (const hit of [false, true]) {
        for (const week of [true, false]) {
          const a = phone(U('u' + (++i)), { social: { push: push, hit: hit, week: week } }), tag = JSON.stringify(TRIO(push, hit, week));
          a.sync.push();
          if (push && !hit && week) { await sleep(60); expect(a.writes, tag).toEqual([]); } // o padrão não grava
          else await until(() => a.saves === 1, 'salvar ' + tag);
          const cloud = await a.cloud();
          expect(wantsAlerts(cloud), 'push ' + tag).toBe(push);
          expect(wantsKind(cloud, 'hit'), 'hit ' + tag).toBe(push && hit);
          expect(wantsKind(cloud, 'week'), 'week ' + tag).toBe(push && week);
          expect(wantsKind(cloud, 'wave'), 'aceno ' + tag).toBe(push);
        }
      }
    }
  });
  test('ligar de novo grava o padrão; depois disso, repetir a chamada não grava mais nada', async () => {
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'desligar');
    a.setPush(true); a.sync.push();
    await until(() => a.saves === 2, 'ligar');
    a.sync.push(); a.sync.push();
    await sleep(150);
    expect(a.writes.map((w) => w.social.push)).toEqual([false, true]);
    expect(a.mark.social).toEqual(DEFAULT);
    expect((await a.cloud()).social).toEqual(DEFAULT);
  });
  test('o mesmo pedido em andamento não é repetido (rede lenta), e a marca só muda quando a nuvem confirma', async () => {
    const a = phone(ANA, { hold: true });
    a.setPush(false);
    a.sync.push(); a.sync.push(); a.sync.push();
    await sleep(100);
    expect(a.writes).toHaveLength(1);
    expect(a.mark.social).toBeUndefined();
    expect(a.saves).toBe(0);
  });
  test('mudou de ideia antes da resposta: as duas escolhas saem, na ordem, e a última é a que fica', async () => {
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    a.setPush(true); a.sync.push();
    await until(() => a.saves === 2, 'as duas gravações');
    expect(a.writes.map((w) => w.social.push)).toEqual([false, true]);
    expect((await a.cloud()).social).toEqual(DEFAULT);
    expect(a.mark.social).toEqual(DEFAULT);
  });
  test('ligou e desligou antes da primeira resposta: a escolha final é a que fica na nuvem', async () => {
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    a.setPush(true); a.sync.push();
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 3, 'as três gravações');
    expect((await a.cloud()).social).toEqual(TRIO(false, false, true));
  });
  test('o resto do documento da pessoa (fuso, meta, lembretes, aparelhos) continua como estava', async () => {
    await seedDoc('users/' + ANA, { tz: 'America/Fortaleza', unit: 'ml', goal: 2800, reminder: { enabled: true, interval: 90, smart: true, nextAt: null },
      fcm: { h1: { token: 'tok-1', ua: 'teste' } }, today: { day: '2026-10-19', ml: 600 } });
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    const d = await a.cloud();
    expect(d).toMatchObject({ tz: 'America/Fortaleza', unit: 'ml', goal: 2800, reminder: { enabled: true, interval: 90 }, fcm: { h1: { token: 'tok-1' } },
      today: { ml: 600 }, social: TRIO(false, false, true) });
  });
  test('o aparelho já guardava que a nuvem tem "desligado" (marca): não regrava; mas se a escolha mudou, grava', async () => {
    const a = phone(ANA);
    a.mark.social = TRIO(false, false, true); a.setPush(false);
    a.sync.push();
    await sleep(120);
    expect(a.writes).toEqual([]); // a nuvem já sabe
    a.setPush(true); a.sync.push();
    await until(() => a.saves === 1, 'ligar');
    expect(a.writes.map((w) => w.social.push)).toEqual([true]);
  });
  test('conta nova (marca sem o campo) com a chave já desligada neste aparelho: grava o "desligado"', async () => {
    const a = phone(ANA, { social: { push: false } }); // por exemplo, backup importado num aparelho novo
    a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect((await a.cloud()).social).toEqual(TRIO(false, false, true));
  });
});

describe('as chaves novas da 1.2.0: hit (avisar quando um amigo bater a meta) e week (resumo da semana)', () => {
  test('ligar o aviso de meta grava hit: true, e o servidor passa a avisar essa pessoa', async () => {
    const a = phone(ANA);
    a.set('hit', true); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect(a.writes).toEqual([{ social: TRIO(true, true, true), updatedAt: '<serverTimestamp>' }]);
    const cloud = await a.cloud();
    expect(wantsKind(cloud, 'hit')).toBe(true);
    expect(wantsKind(cloud, 'week')).toBe(true);
    expect(a.mark.social).toEqual(TRIO(true, true, true));
  });
  test('desligar o resumo da semana grava week: false', async () => {
    const a = phone(ANA);
    a.set('week', false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect((await a.cloud()).social).toEqual(TRIO(true, false, false));
    expect(wantsKind(await a.cloud(), 'week')).toBe(false);
    expect(wantsKind(await a.cloud(), 'wave')).toBe(true); // os outros avisos seguem ligados
  });
  test('cada gravação leva as TRÊS escolhas, mesmo mudando só uma: a nuvem nunca fica com metade do estado', async () => {
    const a = phone(ANA);
    a.set('hit', true); a.sync.push();
    await until(() => a.saves === 1, 'primeira');
    a.set('week', false); a.sync.push();
    await until(() => a.saves === 2, 'segunda');
    expect(a.writes.map((w) => w.social)).toEqual([TRIO(true, true, true), TRIO(true, true, false)]);
    expect((await a.cloud()).social).toEqual(TRIO(true, true, false));
  });
  test('voltar ao padrão grava o padrão: o aviso de meta desligado de novo não fica ligado na nuvem', async () => {
    const a = phone(ANA);
    a.set('hit', true); a.sync.push();
    await until(() => a.saves === 1, 'ligar');
    a.set('hit', false); a.sync.push();
    await until(() => a.saves === 2, 'desligar');
    expect((await a.cloud()).social).toEqual(DEFAULT);
    expect(wantsKind(await a.cloud(), 'hit')).toBe(false);
    a.sync.push(); a.sync.push();
    await sleep(100);
    expect(a.writes).toHaveLength(2); // e repetir não grava mais nada
  });
  test('a marca da 1.1.1 (só um booleano) é entendida: quem já tinha "desligado" não regrava, e a primeira mudança nova leva as três escolhas', async () => {
    const a = phone(ANA, { social: { push: false } });
    a.mark.social = false; // como o aparelho guardava antes
    a.sync.push();
    await sleep(120);
    expect(a.writes).toEqual([]);
    a.set('hit', true); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect(a.writes).toEqual([{ social: TRIO(false, true, true), updatedAt: '<serverTimestamp>' }]);
    expect(a.mark.social).toEqual(TRIO(false, true, true));
  });
  test('a marca antiga "ligado" (true) vale o padrão: nada a gravar para quem nunca mexeu', async () => {
    const a = phone(ANA);
    a.mark.social = true;
    a.sync.push();
    await sleep(100);
    expect(a.writes).toEqual([]);
  });
  test('o aviso de meta é escolha de cada um: ligar o seu não liga o de outra pessoa', async () => {
    const a = phone(ANA), b = phone(BRU);
    a.set('hit', true); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    b.sync.push();
    await sleep(100);
    expect(wantsKind(await a.cloud(), 'hit')).toBe(true);
    expect(await b.cloud()).toBeNull();
    expect(wantsKind(await b.cloud(), 'hit')).toBe(false); // sem documento: ninguém é avisado de meta por padrão
  });
});

describe('quando a nuvem recusa ou some', () => {
  test('recusa das regras (login de outra pessoa): avisa, não guarda a marca e tenta de novo na próxima', async () => {
    const a = phone(ANA, { as: BRU }); // BRU tentando gravar no documento de ANA: as regras barram
    a.setPush(false);
    a.sync.push();
    await until(() => a.warns.length === 1, 'o aviso da recusa');
    expect(a.mark.social).toBeUndefined();
    expect(a.saves).toBe(0);
    expect(String(a.warns[0].code || a.warns[0].message)).toMatch(/permission|denied/i);
    a.sync.push(); // próxima gravação do app: tenta de novo (não ficou "enviado" para sempre)
    await until(() => a.warns.length === 2, 'a nova recusa');
    expect(a.writes).toHaveLength(2);
    expect(await a.cloud()).toBeNull();
  });
  test('depois de uma recusa, a mesma escolha é reenviada e funciona quando a nuvem aceita', async () => {
    const bad = phone(ANA, { as: BRU });
    bad.setPush(false); bad.set('hit', true); bad.sync.push();
    await until(() => bad.warns.length === 1, 'recusa');
    const good = phone(ANA); // o app reaberto, agora com o login certo e a mesma marca de antes (sem o campo)
    good.mark = bad.mark;
    good.setPush(false); good.set('hit', true); good.sync.push();
    await until(() => good.saves === 1, 'salvar');
    expect((await good.cloud()).social).toEqual(TRIO(false, true, true)); // as três, completas
    expect(good.mark.social).toEqual(TRIO(false, true, true));
  });
  test('regras que recusam este campo (versão antiga publicada): nada além do aviso — o app continua inteiro', async () => {
    const OLD = 'rules_version = "2"; service cloud.firestore { match /databases/{d}/documents { match /users/{u} { allow read, write: if request.auth != null && request.auth.uid == u && request.resource == null || false; } } }';
    const old = track(await initializeTestEnvironment({ projectId: 'demo-mare-alerts-old', firestore: { host: hp[0], port: +hp[1], rules: OLD } }));
    try {
      const t = { warns: [], saves: 0 }, S = C.defaults(1), mark = { uid: ANA };
      S.social = Object.assign({}, S.social, { on: true, push: false, hit: true });
      const db = old.authenticatedContext(ANA).firestore();
      const sync = createAlertsSync({ FS: FS, uref: FS.doc(db, 'users', ANA), state: () => S, mark: () => mark, saveMark: () => { t.saves++; }, warn: (e) => { t.warns.push(e); } });
      expect(() => sync.push()).not.toThrow();
      await until(() => t.warns.length === 1, 'o aviso');
      expect(t.saves).toBe(0);
      expect(mark.social).toBeUndefined();
    } finally { await old.cleanup(); }
  });
  test('reset() (apagar tudo na nuvem) esquece o pedido em andamento: o próximo envio é novo', async () => {
    const a = phone(ANA, { hold: true });
    a.setPush(false);
    a.sync.push();
    a.sync.push();
    expect(a.writes).toHaveLength(1);
    a.sync.reset();
    a.sync.push();
    expect(a.writes).toHaveLength(2);
  });
});

describe('privacidade e isolamento', () => {
  test('cada pessoa só mexe no próprio documento; a escolha de uma nunca muda a da outra', async () => {
    const a = phone(ANA), b = phone(BRU);
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    b.sync.push(); // Bruno não mexeu: nada
    await sleep(100);
    expect((await a.cloud()).social).toEqual(TRIO(false, false, true));
    expect(await b.cloud()).toBeNull();
    expect(wantsAlerts(await b.cloud())).toBe(true); // sem documento: vale ligado (quem nunca mexeu recebe)
  });
  test('só as escolhas viajam: nenhum nome, código, meta ou amigo vai junto', async () => {
    const a = phone(ANA, { social: { nick: 'Ana Secreta', code: 'ABCD2345', goal: 2750, hit: true } });
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect(JSON.stringify(a.writes)).not.toMatch(/Secreta|ABCD2345|2750/);
    expect(JSON.stringify(await a.cloud())).not.toMatch(/Secreta|ABCD2345|2750/);
    expect(Object.keys(a.writes[0]).sort()).toEqual(['social', 'updatedAt']);
    expect(Object.keys(a.writes[0].social).sort()).toEqual(['hit', 'push', 'week']);
  });
});
