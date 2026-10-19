// Maré — "Avisos dos amigos" na nuvem (public/js/alerts-sync.js) contra o emulador do Firestore, COM as regras de segurança de verdade.
// É o pedaço do app que leva a chave de Ajustes (S.social.push) para users/{uid}.social.push, onde a função onFriendship a consulta.
// Cada "aparelho" é um login diferente usando o mesmo código que o firebase.js usa. Rodar: npm run test:rules
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAlertsSync } from '../../public/js/alerts-sync.js';
import { wantsAlerts } from '../../functions/social-push.js';
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
  t.cloud = () => readDoc('users/' + uid);
  return t;
}

describe('quem não mexeu na chave não grava nada', () => {
  test('ligado desde o começo (o que o servidor já assume): nenhuma escrita, nem com várias chamadas', async () => {
    const a = phone(ANA);
    a.sync.push(); a.sync.push(); a.sync.push();
    await sleep(150);
    expect(a.writes).toEqual([]);
    expect(await a.cloud()).toBeNull();
    expect(a.saves).toBe(0);
  });
  test('qualquer valor que não seja um false de verdade vale ligado: lixo nunca vai para a nuvem', async () => {
    for (const v of [undefined, null, 0, '', 'false', NaN, {}, []]) {
      const a = phone(ANA);
      a.setPush(v);
      a.sync.push();
      expect(a.writes, 'valor ' + String(v)).toEqual([]);
    }
  });
  test('amigos desligados neste aparelho: não grava, mesmo com a chave desligada', async () => {
    const a = phone(ANA, { social: { on: false, push: false } });
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

describe('desligar e ligar', () => {
  test('desligar grava social.push = false com as regras de verdade e só então guarda a marca', async () => {
    const a = phone(ANA);
    a.setPush(false);
    a.sync.push();
    expect(a.mark.social).toBeUndefined(); // ainda não voltou
    await until(() => a.saves === 1, 'a marca ser salva');
    expect(a.writes).toEqual([{ social: { push: false }, updatedAt: '<serverTimestamp>' }]);
    expect(a.mark.social).toBe(false);
    const d = await a.cloud();
    expect(d.social).toEqual({ push: false });
    expect(d.updatedAt).toBeTruthy();
    expect(a.warns).toEqual([]);
  });
  test('a função do servidor lê exatamente o que o app gravou (wantsAlerts)', async () => {
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect(wantsAlerts(await a.cloud())).toBe(false);
    a.setPush(true); a.sync.push();
    await until(() => a.saves === 2, 'salvar de novo');
    expect(wantsAlerts(await a.cloud())).toBe(true);
    expect((await a.cloud()).social).toEqual({ push: true });
  });
  test('ligar de novo grava true; depois disso, repetir a chamada não grava mais nada', async () => {
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'desligar');
    a.setPush(true); a.sync.push();
    await until(() => a.saves === 2, 'ligar');
    a.sync.push(); a.sync.push();
    await sleep(150);
    expect(a.writes.map((w) => w.social.push)).toEqual([false, true]);
    expect(a.mark.social).toBe(true);
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
    expect((await a.cloud()).social).toEqual({ push: true });
    expect(a.mark.social).toBe(true);
  });
  test('ligou e desligou antes da primeira resposta: a escolha final é a que fica na nuvem', async () => {
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    a.setPush(true); a.sync.push();
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 3, 'as três gravações');
    expect((await a.cloud()).social).toEqual({ push: false });
  });
  test('o resto do documento da pessoa (fuso, meta, lembretes, aparelhos) continua como estava', async () => {
    await seedDoc('users/' + ANA, { tz: 'America/Fortaleza', unit: 'ml', goal: 2800, reminder: { enabled: true, interval: 90, smart: true, nextAt: null },
      fcm: { h1: { token: 'tok-1', ua: 'teste' } }, today: { day: '2026-10-19', ml: 600 } });
    const a = phone(ANA);
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    const d = await a.cloud();
    expect(d).toMatchObject({ tz: 'America/Fortaleza', unit: 'ml', goal: 2800, reminder: { enabled: true, interval: 90 }, fcm: { h1: { token: 'tok-1' } },
      today: { ml: 600 }, social: { push: false } });
  });
  test('o aparelho já guardava que a nuvem tem "desligado" (marca): não regrava; mas se a escolha mudou, grava', async () => {
    const a = phone(ANA);
    a.mark.social = false; a.setPush(false);
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
    expect((await a.cloud()).social).toEqual({ push: false });
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
    bad.setPush(false); bad.sync.push();
    await until(() => bad.warns.length === 1, 'recusa');
    const good = phone(ANA); // o app reaberto, agora com o login certo e a mesma marca de antes (sem o campo)
    good.mark = bad.mark;
    good.setPush(false); good.sync.push();
    await until(() => good.saves === 1, 'salvar');
    expect((await good.cloud()).social).toEqual({ push: false });
    expect(good.mark.social).toBe(false);
  });
  test('regras que recusam este campo (versão antiga publicada): nada além do aviso — o app continua inteiro', async () => {
    const OLD = 'rules_version = "2"; service cloud.firestore { match /databases/{d}/documents { match /users/{u} { allow read, write: if request.auth != null && request.auth.uid == u && request.resource == null || false; } } }';
    const old = track(await initializeTestEnvironment({ projectId: 'demo-mare-alerts-old', firestore: { host: hp[0], port: +hp[1], rules: OLD } }));
    try {
      const t = { warns: [], saves: 0 }, S = C.defaults(1), mark = { uid: ANA };
      S.social = Object.assign({}, S.social, { on: true, push: false });
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
    expect((await a.cloud()).social).toEqual({ push: false });
    expect(await b.cloud()).toBeNull();
    expect(wantsAlerts(await b.cloud())).toBe(true); // sem documento: vale ligado (quem nunca mexeu recebe)
  });
  test('só a escolha viaja: nenhum nome, código ou amigo vai junto', async () => {
    const a = phone(ANA, { social: { nick: 'Ana Secreta', code: 'ABCD2345' } });
    a.setPush(false); a.sync.push();
    await until(() => a.saves === 1, 'salvar');
    expect(JSON.stringify(a.writes)).not.toMatch(/Secreta|ABCD2345/);
    expect(JSON.stringify(await a.cloud())).not.toMatch(/Secreta|ABCD2345/);
  });
});
