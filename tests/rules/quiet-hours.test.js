// Maré — horário de silêncio (1.2.0) de ponta a ponta no servidor. Os avisos dos amigos que chegam com a pessoa dormindo (fora do wake e do sleep
// dela, no fuso dela) esperam em pushq/{uid} e saem ao acordar. Roda o código de verdade (functions/friend-push.js e quiet.js) com o Admin SDK
// contra o emulador do Firestore e um FCM de mentira, com um relógio nosso. A parte pura da fila está em tests/quiet.test.js.
// Rodar: npm run test:rules. Precisa do Admin SDK da pasta functions/ (cd functions && npm install); sem ele, estes testes são pulados.
import { test, expect } from 'vitest';
import { assertFails } from '@firebase/rules-unit-testing';
import * as FS from 'firebase/firestore';
import { serverEnv, U, TODAY, MIN, DAY } from '../helpers/server-env.js';
import { notifyFriendship, route, flushQueue, flushDue } from '../../functions/friend-push.js';
import { messageOf, weekMessage } from '../../functions/social-push.js';

const E = serverEnv('demo-mare-quiet');
E.setup();
const ANA = U('ana'), BRU = U('bruno'), CAI = U('caio'), DUDA = U('duda');
const NB = ' ';
const notify = (before, after, over) => notifyFriendship({ before: before, after: after }, E.deps(over));
const wv = (k, ms) => ({ k: k, d: TODAY, at: E.TS(ms) });
// "Fulano pediu amizade a Ana" e "Fulano acenou para Ana", como o servidor os vê
const askAna = (by, nm) => notify(null, E.pairDoc(by, ANA, { nm: nm || 'Bruno' }));
const waveAna = (from, k, ms) => notify(E.activeDoc(ANA, from), E.activeDoc(ANA, from, { w: { [from]: wv(k || 'hi', ms == null ? E.clock.t : ms) } }));
const flush = (uid, over) => flushQueue(uid || ANA, E.deps(over));
const D20 = (h, m) => Date.UTC(2026, 9, 20, h, m || 0, 0); // 20/10/2026 às h:m em Greenwich (Fortaleza = Greenwich − 3 h)
const NIGHT = () => E.at(12, 30); // 02:30 em Greenwich do dia 20 = 23:30 em Fortaleza: já dormindo
const WAKE = () => E.at(20); // 10:00 em Greenwich = 07:00 em Fortaleza: a hora de acordar
const sleeping = async (uid) => !!(await E.pushq(uid));
const sends = () => E.logs.filter((l) => l.m === 'aviso de amigos');

/* ============================== acordada x dormindo ============================== */
E.suite('o aviso espera a pessoa acordar', () => {
  test('acordada (11:00 em Fortaleza): sai na hora, e nada fica na fila', async () => {
    await E.phone(ANA);
    expect(await askAna(BRU)).toBe(1);
    expect(E.fcm.calls).toHaveLength(1);
    expect(await E.pushq(ANA)).toBeNull();
  });
  test('dormindo (23:30): não sai; espera na fila até as 07:00 dela, e o limite contra repetição já foi gasto', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT();
    expect(await askAna(BRU)).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
    const q = await E.pushq(ANA);
    expect(Object.keys(q).sort()).toEqual(['due', 'exp', 'items']);
    expect(q.items).toEqual([{ k: 'request', at: NIGHT(), tag: 'mare-amigo-request-' + BRU, title: 'Pedido de amizade' + NB + '💌',
      body: 'Bruno quer acompanhar o dia com você. Toque para responder.', url: './?tab=friends' }]);
    expect(q.due).toBe(WAKE());
    expect(q.exp.toMillis()).toBe(NIGHT() + 3 * DAY); // 48 h de validade + 1 dia para o Firestore apagar
    expect((await E.pushlog(ANA)).t).toEqual({ ['request_' + BRU]: NIGHT() });
    expect(E.logOf('silêncio')).toHaveLength(1);
  });
  test('acorda às 07:00 (inclusive) e dorme às 23:00 (exclusive), no relógio de Fortaleza', async () => {
    await E.phone(ANA);
    const cases = [['06:59', D20(9, 59), true], ['07:00', D20(10, 0), false], ['12:00', D20(15, 0), false], ['22:59', D20(1, 59), false], ['23:00', D20(2, 0), true], ['00:00', D20(3, 0), true], ['03:30', D20(6, 30), true]];
    for (const c of cases) {
      E.clock.t = c[1];
      await E.adb.doc('pushlog/' + ANA).delete(); await E.adb.doc('pushq/' + ANA).delete(); // zera o limite e a fila entre os casos
      const before = E.fcm.calls.length;
      await askAna(U('p' + c[0].replace(':', '')));
      expect([c[0], E.fcm.calls.length - before, await sleeping(ANA)]).toEqual([c[0], c[2] ? 0 : 1, c[2]]);
    }
  });
  test('o mesmo evento entregue duas vezes com ela dormindo: um item só na fila (o limite segura)', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT();
    expect(await askAna(BRU)).toBe(0);
    expect(await askAna(BRU)).toBe(0);
    expect((await E.pushq(ANA)).items).toHaveLength(1);
    expect(E.logOf('repetido')).toHaveLength(1);
  });
  test('o mesmo evento entregue por três instâncias ao mesmo tempo, com ela dormindo: um item só (a transação decide)', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT();
    await Promise.all([askAna(BRU), askAna(BRU), askAna(BRU)]);
    expect((await E.pushq(ANA)).items).toHaveLength(1);
    expect((await E.pushlog(ANA)).h).toEqual([NIGHT()]);
  });
  test('avisos de pessoas diferentes durante a noite: todos esperam, do mais antigo ao mais novo', async () => {
    await E.phone(ANA); await E.profile(DUDA, 'Duda');
    E.clock.t = NIGHT(); await askAna(BRU);
    E.clock.t = NIGHT() + 60 * MIN; await askAna(CAI, 'Caio');
    E.clock.t = NIGHT() + 150 * MIN; await waveAna(DUDA, 'hi');
    const q = await E.pushq(ANA);
    expect(q.items.map((x) => [x.k, x.tag])).toEqual([['request', 'mare-amigo-request-' + BRU], ['request', 'mare-amigo-request-' + CAI], ['wave', 'mare-amigo-wave-' + DUDA]]);
    expect(q.items[2].title).toBe('Duda acenou para você' + NB + '👋');
    expect(q.due).toBe(WAKE());
  });
  test('o mesmo amigo acena de novo mais tarde: o aceno novo troca o antigo na fila (mesmo tag), como na tela do aparelho', async () => {
    await E.phone(ANA); await E.profile(BRU, 'Bruno');
    E.clock.t = NIGHT(); await waveAna(BRU, 'hi');
    E.clock.t = NIGHT() + 10 * MIN; await waveAna(BRU, 'cheer');
    const q = await E.pushq(ANA);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ k: 'wave', at: NIGHT() + 10 * MIN, title: 'Bruno mandou parabéns pra você' + NB + '🎉' });
  });
  test('três pedidos de pessoas diferentes ao mesmo tempo com ela dormindo: os três esperam, nenhum se perde (a transação refaz quem esbarra)', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT();
    await Promise.all([1, 2, 3].map((i) => askAna(U('pessoa' + i), 'Pessoa ' + i)));
    const q = await E.pushq(ANA);
    expect(q.items.map((x) => x.tag).sort()).toEqual([1, 2, 3].map((i) => 'mare-amigo-request-' + U('pessoa' + i)).sort());
    expect((await E.pushlog(ANA)).q).toHaveLength(3);
    expect(E.errors()).toEqual([]);
  });
  test('o limite de pedidos por hora vale também dormindo: o sexto pedido nem entra na fila', async () => {
    await E.phone(ANA);
    for (let i = 1; i <= 6; i++) { E.clock.t = NIGHT() + i * 1000; await askAna(U('pessoa' + i), 'Pessoa ' + i); }
    expect((await E.pushq(ANA)).items).toHaveLength(5);
    expect(E.logOf('limite')).toHaveLength(1);
  });
});

/* ============================== ao acordar ============================== */
E.suite('ao acordar, a fila é entregue', () => {
  test('um aviso só sai como ele mesmo: o mesmo pacote que sairia na hora, e a fila some', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT(); await askAna(BRU);
    E.clock.t = WAKE() + MIN;
    expect(await flush()).toBe(1);
    expect(E.fcm.calls).toHaveLength(1);
    expect(E.fcm.calls[0].tokens).toEqual([E.tokenOf(ANA)]);
    expect(E.fcm.calls[0].data).toEqual({ kind: 'friend', ev: 'request', tag: 'mare-amigo-request-' + BRU, url: './?tab=friends', title: 'Pedido de amizade' + NB + '💌',
      body: 'Bruno quer acompanhar o dia com você. Toque para responder.' });
    expect(E.fcm.calls[0].webpush).toEqual({ headers: { Urgency: 'high', TTL: '172800' } });
    expect(await E.pushq(ANA)).toBeNull();
    expect(sends()[0]).toMatchObject({ kind: 'request', sent: 1, failed: 0, held: 1, dropped: 0 });
  });
  test('o que sai ao acordar usa o prazo do FCM do tipo do aviso (aceno: 6 h)', async () => {
    await E.phone(ANA); await E.profile(BRU, 'Bruno');
    E.clock.t = NIGHT(); await waveAna(BRU, 'hi');
    E.clock.t = WAKE() + MIN; await flush();
    expect(E.lastTo(ANA).webpush.headers.TTL).toBe('21600');
    expect(E.lastTo(ANA).data).toMatchObject({ ev: 'wave', title: 'Bruno acenou para você' + NB + '👋', body: 'Toque para acenar de volta.' });
  });
  test('ainda dormindo: não sai, a fila fica e, se ela mudou o horário de acordar, ganha a hora nova', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT(); await askAna(BRU);
    E.clock.t = D20(7, 0); // 04:00 em Fortaleza
    expect(await flush()).toBe(0);
    expect((await E.pushq(ANA)).due).toBe(WAKE());
    await E.adb.doc('users/' + ANA).update({ wake: '09:00' });
    E.clock.t = WAKE() + MIN; // 07:01: passou da hora antiga, mas ela agora só acorda às 09:00
    expect(await flush()).toBe(0);
    expect((await E.pushq(ANA)).due).toBe(D20(12, 0));
    expect(E.fcm.calls).toHaveLength(0);
    E.clock.t = D20(12, 1);
    expect(await flush()).toBe(1);
  });
  test('vários avisos viram um só, "Novidades da turma", com a conta de cada coisa', async () => {
    await E.phone(ANA); await E.profile(DUDA, 'Duda');
    E.clock.t = NIGHT(); await askAna(BRU);
    E.clock.t = NIGHT() + 5 * MIN; await askAna(CAI, 'Caio');
    E.clock.t = NIGHT() + 10 * MIN; await waveAna(DUDA, 'hi');
    E.clock.t = WAKE() + 5 * MIN;
    expect(await flush()).toBe(1);
    expect(E.fcm.calls).toHaveLength(1);
    expect(E.fcm.calls[0].data).toEqual({ kind: 'friend', ev: 'digest', tag: 'mare-turma-novidades', url: './?tab=friends', title: 'Novidades da turma' + NB + '🌊',
      body: '2 pedidos de amizade e 1 aceno. Toque para ver a turma.' });
    expect(E.fcm.calls[0].webpush.headers).toEqual({ Urgency: 'high', TTL: '21600' });
    expect(sends()[0]).toMatchObject({ kind: 'digest', sent: 1, held: 3, dropped: 0 });
    expect(await E.pushq(ANA)).toBeNull();
  });
  test('o que venceu na espera não sai: uma meta batida às 23:30 já é notícia velha às 07:00', async () => {
    await E.phone(ANA, 1, { social: { hit: true } });
    E.clock.t = NIGHT();
    expect(await route({ kind: 'hit', from: BRU, to: ANA }, messageOf({ kind: 'hit', from: BRU }, 'Bruno'), E.deps())).toBe(0);
    expect((await E.pushq(ANA)).items.map((x) => x.k)).toEqual(['hit']);
    E.clock.t = WAKE() + MIN; // 7 h 31 min depois: a meta só vale 4 h
    expect(await flush()).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
    expect(await E.pushq(ANA)).toBeNull();
    expect(E.logOf('vencidos')).toHaveLength(1);
  });
  test('um aviso vencido no meio de vários não aparece no resumo: sobra um só e sai como ele mesmo', async () => {
    await E.phone(ANA, 1, { social: { hit: true } });
    E.clock.t = NIGHT(); await route({ kind: 'hit', from: BRU, to: ANA }, messageOf({ kind: 'hit', from: BRU }, 'Bruno'), E.deps());
    E.clock.t = NIGHT() + 10 * MIN; await askAna(CAI, 'Caio');
    E.clock.t = WAKE() + MIN;
    expect(await flush()).toBe(1);
    expect(E.fcm.calls[0].data).toMatchObject({ ev: 'request', title: 'Pedido de amizade' + NB + '💌' });
    expect(sends()[0]).toMatchObject({ kind: 'request', held: 1, dropped: 1 });
  });
  test('quem desligou os avisos no meio da noite não recebe nada ao acordar, e a fila é descartada', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT(); await askAna(BRU);
    await E.adb.doc('users/' + ANA).update({ social: { push: false } });
    E.clock.t = WAKE() + MIN;
    expect(await flush()).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
    expect(await E.pushq(ANA)).toBeNull();
    expect(E.logOf('desligado')).toHaveLength(1);
  });
  test('quem desligou só um tipo (o resumo da semana) no meio da noite não o recebe; o resto sai', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT();
    await route({ kind: 'week', from: 'crew', to: ANA }, weekMessage({ hits: 5, total: 14, mine: 2 }), E.deps());
    E.clock.t = NIGHT() + 10 * MIN; await askAna(BRU);
    expect((await E.pushq(ANA)).items.map((x) => x.k)).toEqual(['week', 'request']);
    await E.adb.doc('users/' + ANA).update({ social: { week: false } });
    E.clock.t = WAKE() + MIN;
    expect(await flush()).toBe(1);
    expect(E.fcm.calls[0].data.ev).toBe('request'); // o resumo da semana ficou de fora; sobrou um aviso só, que sai como ele mesmo
    expect(sends()[0]).toMatchObject({ held: 1, dropped: 1 });
  });
  test('sem aparelho ao acordar (saiu do cadastro, conta apagada): a fila é descartada, sem enviar nem quebrar', async () => {
    await E.phone(ANA); await E.phone(BRU);
    E.clock.t = NIGHT(); await askAna(CAI); await notify(null, E.pairDoc(CAI, BRU));
    await E.adb.doc('users/' + ANA).update({ fcm: {} });
    await E.adb.doc('users/' + BRU).delete();
    E.clock.t = WAKE() + MIN;
    expect(await flush(ANA)).toBe(0);
    expect(await flush(BRU)).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
    expect(await E.pushq(ANA)).toBeNull(); expect(await E.pushq(BRU)).toBeNull();
    expect(E.logOf('sem aparelho').length).toBeGreaterThanOrEqual(2);
  });
  test('fila que não existe: nada acontece', async () => {
    await E.phone(ANA);
    expect(await flush()).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
    expect(E.logOf('vazia')).toHaveLength(1);
  });
  test('duas execuções ao mesmo tempo entregam uma vez só (a fila é reivindicada na transação)', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT(); await askAna(BRU); E.clock.t = NIGHT() + 6 * MIN; await askAna(CAI, 'Caio');
    E.clock.t = WAKE() + MIN;
    const out = await Promise.all([flush(), flush(), flush()]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(1);
    expect(E.fcm.calls).toHaveLength(1);
    expect(await E.pushq(ANA)).toBeNull();
  });
  test('um pedido que chegou de madrugada gasta o limite das 03:00: o mesmo pedido às 08:00 não avisa de novo', async () => {
    await E.phone(ANA);
    E.clock.t = D20(6, 0); await askAna(BRU); // 03:00 em Fortaleza
    E.clock.t = D20(10, 5); await flush();
    expect(E.fcm.calls).toHaveLength(1);
    E.clock.t = D20(11, 0); // 08:00
    expect(await askAna(BRU)).toBe(0);
    expect(E.fcm.calls).toHaveLength(1);
    expect(E.logOf('repetido')).toHaveLength(1);
  });
  test('se o FCM cai na entrega da fila: nada quebra para quem chama, o erro é de quem manda, e a fila não é reenviada (melhor perder um aviso que mandar dois)', async () => {
    await E.phone(ANA);
    E.clock.t = NIGHT(); await askAna(BRU);
    E.clock.t = WAKE() + MIN;
    E.fcm.down = new Error('fcm indisponível');
    await expect(flush()).rejects.toThrow('fcm indisponível');
    expect(await E.pushq(ANA)).toBeNull();
    E.fcm.down = null;
    expect(await flush()).toBe(0);
  });
  test('aparelho morto descoberto na entrega da fila sai do cadastro, como no envio direto', async () => {
    await E.phone(ANA, 2);
    E.fcm.dead.add(E.tokenOf(ANA, 2));
    E.clock.t = NIGHT(); await askAna(BRU);
    E.clock.t = WAKE() + MIN;
    expect(await flush()).toBe(1);
    expect(Object.keys((await E.userDoc(ANA)).fcm)).toEqual(['h1']);
  });
});

/* ============================== o relógio de cada um ============================== */
E.suite('o horário de silêncio é o de cada pessoa', () => {
  // cases: [rótulo, instante, está dormindo?]
  const check = async (uid, cases) => {
    for (const c of cases) {
      E.clock.t = c[1];
      await E.adb.doc('pushlog/' + uid).delete(); await E.adb.doc('pushq/' + uid).delete();
      const before = E.fcm.calls.length;
      await notify(null, E.pairDoc(BRU, uid, { nm: 'Bruno' }));
      expect([c[0], E.fcm.calls.length - before, await sleeping(uid)]).toEqual([c[0], c[2] ? 0 : 1, c[2]]);
    }
  };
  test('dormir depois da meia-noite (acorda 12:00, dorme 02:00): a janela dá a volta', async () => {
    await E.phone(ANA, 1, { wake: '12:00', sleep: '02:00' });
    await check(ANA, [['11:00', T(14, 0, 19), true], ['11:59', T(14, 59, 19), true], ['12:00', T(15, 0, 19), false], ['23:30', D20(2, 30), false], ['01:59', D20(4, 59), false],
      ['02:00', D20(5, 0), true], ['08:00', D20(11, 0), true]]);
    E.clock.t = T(14, 0, 19); await E.adb.doc('pushq/' + ANA).delete(); await E.adb.doc('pushlog/' + ANA).delete(); await askAna(BRU);
    expect((await E.pushq(ANA)).due).toBe(T(15, 0, 19)); // acorda às 12:00 de hoje
  });
  test('wake igual a sleep: nunca dorme, nem de madrugada', async () => {
    await E.phone(ANA, 1, { wake: '07:00', sleep: '07:00' });
    await check(ANA, [['03:30', D20(6, 30), false], ['07:00', D20(10, 0), false], ['23:30', D20(2, 30), false]]);
  });
  test('o fuso decide: o mesmo instante é madrugada em Fortaleza e manhã em Nova York', async () => {
    await E.phone(ANA); // Fortaleza
    await E.phone(BRU, 1, { tz: 'America/New_York' });
    E.clock.t = D20(2, 30); // 23:30 em Fortaleza, 22:30 em Nova York
    expect(await notify(null, E.pairDoc(CAI, ANA))).toBe(0);
    expect(await notify(null, E.pairDoc(CAI, BRU))).toBe(1);
    expect(await sleeping(ANA)).toBe(true);
    expect(await sleeping(BRU)).toBe(false);
  });
  test('Tóquio: 14:00 em Greenwich é 23:00 lá, dormindo; acorda às 07:00 de lá (22:00 em Greenwich)', async () => {
    await E.phone(ANA, 1, { tz: 'Asia/Tokyo' });
    expect(await askAna(BRU)).toBe(0);
    expect((await E.pushq(ANA)).due).toBe(T(22, 0, 19));
  });
  test('sem fuso no documento vale São Paulo (UTC-3 em outubro), como o app; sem wake e sleep valem 07:00 e 23:00', async () => {
    await E.adb.doc('users/' + ANA).set({ fcm: { h1: { token: E.tokenOf(ANA), ua: 'x', at: E.TS(0) } } });
    await check(ANA, [['11:00', T(14, 0, 19), false], ['22:59', D20(1, 59), false], ['23:00', D20(2, 0), true], ['06:59', D20(9, 59), true], ['07:00', D20(10, 0), false]]);
  });
  test('horário estragado no documento não quebra o aviso (ou sai, ou espera: nunca some nem derruba a função)', async () => {
    await E.phone(ANA, 1, { wake: 'abc', sleep: '99:99' });
    const before = E.fcm.calls.length;
    await expect(askAna(BRU)).resolves.toBeTypeOf('number');
    expect(E.fcm.calls.length - before + ((await sleeping(ANA)) ? 1 : 0)).toBe(1);
    expect(E.errors()).toEqual([]);
  });
  test('na noite em que o horário de verão vira (Nova York, 8/3/2026), a fila acorda na hora certa: 07:00 EDT = 11:00 em Greenwich', async () => {
    await E.phone(ANA, 1, { tz: 'America/New_York' });
    E.clock.t = Date.UTC(2026, 2, 8, 6, 30); // 01:30 EST (o relógio ainda vai pular para 03:00)
    expect(await askAna(BRU)).toBe(0);
    expect((await E.pushq(ANA)).due).toBe(Date.UTC(2026, 2, 8, 11, 0));
  });
});

/* ============================== o job que entrega as filas (flushDue) ============================== */
E.suite('flushDue: o job de 15 em 15 minutos', () => {
  const hold = async (uid, extra) => { await E.phone(uid, 1, extra); E.clock.t = NIGHT(); await notify(null, E.pairDoc(DUDA, uid, { nm: 'Duda' })); };
  test('só entrega as filas cuja hora de acordar já chegou, uma vez cada', async () => {
    await hold(ANA); // acorda 07:00 = 10:00 em Greenwich
    await hold(BRU, { wake: '08:00' }); // 11:00
    await hold(CAI, { wake: '06:00' }); // 09:00
    const run = async (t) => { E.clock.t = t; return flushDue(E.deps()); };
    expect(await run(D20(8, 59))).toEqual({ seen: 0, sent: 0 });
    expect(await run(D20(9, 30))).toEqual({ seen: 1, sent: 1 });
    expect(E.sentTo(CAI)).toHaveLength(1); expect(E.sentTo(ANA)).toHaveLength(0); expect(E.sentTo(BRU)).toHaveLength(0);
    expect(await run(D20(10, 30))).toEqual({ seen: 1, sent: 1 });
    expect(E.sentTo(ANA)).toHaveLength(1);
    expect(await run(D20(11, 30))).toEqual({ seen: 1, sent: 1 });
    expect(E.sentTo(BRU)).toHaveLength(1);
    expect(await run(D20(12, 0))).toEqual({ seen: 0, sent: 0 });
    expect(E.fcm.calls).toHaveLength(3);
  });
  test('na hora exata de acordar já entrega (due <= agora)', async () => {
    await hold(ANA);
    E.clock.t = WAKE();
    expect(await flushDue(E.deps())).toEqual({ seen: 1, sent: 1 });
  });
  test('muitas filas vencidas, página pequena: todas saem, nenhuma duas vezes, nenhuma é pulada', async () => {
    const ids = [1, 2, 3, 4, 5, 6, 7].map((i) => U('pessoa' + i));
    for (const id of ids) await hold(id);
    E.clock.t = WAKE() + MIN;
    expect(await flushDue(E.deps(), { page: 2 })).toEqual({ seen: 7, sent: 7 });
    ids.forEach((id) => expect(E.sentTo(id)).toHaveLength(1));
    expect((await E.adb.collection('pushq').get()).size).toBe(0);
  });
  test('uma fila que falha não derruba as outras (o erro fica no registro)', async () => {
    const ok1 = U('boa1'), ruim = U('ruim'), ok2 = U('boa2');
    for (const id of [ok1, ruim, ok2]) await hold(id);
    E.fcm.failFor = (t) => t.indexOf('tok-' + ruim) === 0;
    E.clock.t = WAKE() + MIN;
    expect(await flushDue(E.deps())).toEqual({ seen: 3, sent: 2 });
    expect(E.errors()).toEqual([{ lvl: 'error', m: 'fila de avisos falhou', uid: ruim, err: 'FCM caiu para tok-' + ruim + '-1' }]);
    expect(E.sentTo(ok1)).toHaveLength(1); expect(E.sentTo(ok2)).toHaveLength(1);
  });
  test('quem ainda dorme (mudou o horário) tem a fila adiada, não entregue nem apagada; a rodada seguinte não repete o trabalho', async () => {
    await hold(ANA);
    await E.adb.doc('users/' + ANA).update({ wake: '09:00' });
    E.clock.t = WAKE() + MIN;
    expect(await flushDue(E.deps())).toEqual({ seen: 1, sent: 0 });
    expect((await E.pushq(ANA)).due).toBe(D20(12, 0));
    expect(await flushDue(E.deps())).toEqual({ seen: 0, sent: 0 });
  });
  test('a fila fica fechada para o app: nem ler, nem escrever (só o servidor)', async () => {
    await hold(ANA);
    const db = E.env.authenticatedContext(ANA).firestore();
    await assertFails(FS.getDoc(FS.doc(db, 'pushq', ANA)));
    await assertFails(FS.setDoc(FS.doc(db, 'pushq', ANA), { items: [], due: 0 }));
    await assertFails(FS.deleteDoc(FS.doc(db, 'pushq', ANA)));
    expect(await sleeping(ANA)).toBe(true);
  });
});

// T(h, m, dia): o dia de outubro de 2026 (19 por padrão) às h:m em Greenwich
function T(h, m, day) { return Date.UTC(2026, 9, day || 20, h, m || 0, 0); }
