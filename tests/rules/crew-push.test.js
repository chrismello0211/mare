// Maré — os dois avisos opcionais da turma (1.2.0), de ponta a ponta no servidor:
//   notifyHit   "Fulano bateu a meta de hoje": só para quem ligou "Avisar quando um amigo bater a meta" (users/{uid}.social.hit = true).
//   sendWeekly  "Resumo da semana da turma": domingo, 19h no relógio de cada um, para quem não desligou (users/{uid}.social.week).
// Roda o código de verdade (functions/crew-push.js, friend-push.js e network.js) com o Admin SDK contra o emulador do Firestore, um FCM de mentira
// e um relógio nosso; a última parte usa o index.js que o firebase deploy publica. A conta pura (hitOf, weekOf, weekOfCrew, zonesAt) está em
// tests/crew.test.js. Rodar: npm run test:rules. Precisa do Admin SDK da pasta functions/ (cd functions && npm install); sem ele, são pulados.
import { test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { serverEnv, U, T0, TODAY, MIN, HOUR, DAY } from '../helpers/server-env.js';
import { notifyHit, sendWeekly, zonesAt } from '../../functions/crew-push.js';
import { flushQueue } from '../../functions/friend-push.js';

const E = serverEnv('demo-mare-crewpush');
E.setup();
const NB = String.fromCharCode(160); // o espaço que não quebra, antes do emoji
const ANA = U('ana'), BIA = U('bia'), CAIO = U('caio'), DUDA = U('duda'), EDU = U('edu'), FABI = U('fabi'), GUI = U('gui'), HELO = U('helo');
const NAMES = { [ANA]: 'Ana', [BIA]: 'Bia', [CAIO]: 'Caio', [DUDA]: 'Duda', [EDU]: 'Edu', [FABI]: 'Fabi', [GUI]: 'Gui', [HELO]: 'Helô' };
const ON = (extra) => Object.assign({ social: { hit: true } }, E.AWAKE, extra || {}); // quem ligou o aviso de meta; nunca dorme (os testes de silêncio têm o seu)
const prof = (over) => Object.assign({ v: 1, nm: 'Ana', mc: 'concha', ins: ['concha'], pct: 100, met: true, st: 3, day: TODAY, sh: true, gl: 2000, wm: 1 }, over || {});
const wasNot = (over) => prof(Object.assign({ pct: 80, met: false }, over || {})); // o mesmo perfil, um instante antes de a meta ser batida
const hit = (uid, over, before) => notifyHit({ uid: uid, before: before === undefined ? wasNot() : before, after: prof(over) }, E.deps());
const team = async (list, over) => { const names = {}; list.forEach((u) => { names[u] = NAMES[u]; }); await E.crew(names, over); };
// O banco do Admin SDK contando as transações que se abrem: cada aviso entregue (ou barrado lá dentro) abre uma. Prova que quem não vai receber nem
// chega a pedir uma: a conta é feita antes, porque numa turma de 31 pessoas seriam 30 transações a cada meta batida só para ouvir "desligado".
function countTx() {
  const c = { n: 0 };
  c.db = new Proxy(E.adb, { get(t, k) {
    if (k === 'runTransaction') return (...a) => { c.n++; return t.runTransaction(...a); };
    const v = t[k];
    return typeof v === 'function' ? v.bind(t) : v;
  } });
  return c;
}
// Um objeto do Admin SDK (a coleção, a consulta, o resultado…) que anota as chamadas e os campos de cada documento lido, sem mudar nada do que ele faz
function trace(x, log, path) {
  if (!x || (typeof x !== 'object' && typeof x !== 'function')) return x;
  if (Array.isArray(x.docs)) log.snaps.push(x.docs.map((d) => Object.keys(d.data()).sort()));
  return new Proxy(x, { get(t, k) {
    const v = t[k];
    if (typeof v !== 'function') return v;
    return (...a) => {
      const p = path + '.' + String(k), r = v.apply(t, a);
      log.calls.push([p, a]);
      return r && typeof r.then === 'function' ? r.then((y) => trace(y, log, p)) : trace(r, log, p);
    };
  } });
}
// Carimbos do Firestore em milissegundos
const SUN = Date.UTC(2026, 9, 25, 22, 30, 0); // domingo, 25/10/2026, 22:30 em Greenwich = 19:30 em Fortaleza e em São Paulo
const SUNDAY = '2026-10-25';

/* ============================== meta batida ============================== */
E.suite('notifyHit: "um amigo bateu a meta de hoje" (opcional)', () => {
  test('só quem ligou o aviso, tem aparelho e não desligou os avisos recebe; quem bateu a meta e quem não é amigo, não', async () => {
    await team([ANA, BIA, CAIO, DUDA, EDU, FABI, GUI]);
    await E.phone(ANA, 1, ON()); // quem bateu a meta nunca é avisado de si
    await E.phone(BIA, 1, ON()); // ligou: recebe
    await E.phone(CAIO, 1, ON({ social: { hit: false } })); // desligou
    await E.phone(DUDA, 1, E.AWAKE); // nunca mexeu: por padrão ninguém recebe
    await E.phone(EDU, 1, ON({ social: { hit: true, push: false } })); // desligou TODOS os avisos dos amigos
    await E.phone(FABI, 0, ON()); // ligou, mas não tem aparelho
    // Gui é da turma e nem tem users/{uid}
    await E.profile(HELO, 'Helô'); await E.phone(HELO, 1, ON()); // Helô liga o aviso, mas não é da turma
    expect(await hit(ANA)).toBe(1);
    expect(E.fcm.calls).toHaveLength(1);
    expect(E.lastTo(BIA)).toMatchObject({ tokens: [E.tokenOf(BIA)], webpush: { headers: { Urgency: 'high', TTL: '10800' } },
      data: { kind: 'friend', ev: 'hit', tag: 'mare-turma-meta', url: './?tab=friends', title: 'Ana bateu a meta de hoje' + NB + '🎉', body: 'Que tal mandar um parabéns? Toque para ver a turma.' } });
  });

  test('só quem vai receber chega a abrir uma transação: sem o aviso ligado, com os avisos desligados ou sem aparelho, nem entra na fila de envios', async () => {
    await team([ANA, BIA, CAIO, DUDA, EDU, FABI, GUI]);
    await E.phone(BIA, 1, ON()); // a única que recebe
    await E.phone(CAIO, 1, ON({ social: { hit: false } }));
    await E.phone(DUDA, 1, E.AWAKE); // nunca mexeu
    await E.phone(EDU, 1, ON({ social: { hit: true, push: false } }));
    await E.phone(FABI, 0, ON()); // ligou, mas perdeu o aparelho
    // Gui nem tem users/{uid}
    const spy = countTx();
    expect(await notifyHit({ uid: ANA, before: wasNot(), after: prof() }, E.deps({ db: spy.db }))).toBe(1);
    expect(spy.n).toBe(1);
    expect(E.logOf('desligado')).toHaveLength(0);
    expect(E.logOf('sem aparelho')).toHaveLength(0);
  });

  test('o nome é o do perfil que acabou de ser publicado, limpo como o app limpa (e "Alguém" se não houver nome)', async () => {
    await team([ANA, BIA]); await E.phone(BIA, 1, ON());
    await hit(ANA, { nm: 'Ana<b>' + String.fromCharCode(0x200B) });
    expect(E.titles(BIA)).toEqual(['Anab bateu a meta de hoje' + NB + '🎉']);
    await E.adb.doc('pushlog/' + BIA).delete();
    await hit(ANA, { nm: undefined });
    expect(E.titles(BIA)[1]).toBe('Alguém bateu a meta de hoje' + NB + '🎉');
  });

  test('só avisa na primeira vez do dia em que a meta aparece batida, e só de quem mostra o progresso', async () => {
    await team([ANA, BIA]); await E.phone(BIA, 1, ON());
    const done = { met: true, pct: 100, sh: true, day: TODAY };
    expect(await hit(ANA, {}, prof(done))).toBe(0); // publicou de novo com a meta já batida hoje
    expect(await hit(ANA, { sh: false }, wasNot())).toBe(0); // pausou o compartilhamento
    expect(await hit(ANA, { met: false, pct: 90 }, wasNot())).toBe(0); // ainda não bateu
    expect(await hit(ANA, {}, null)).toBe(1); // primeiro perfil já com a meta batida
    expect(E.sentTo(BIA)).toHaveLength(1);
    await E.adb.doc('pushlog/' + BIA).delete();
    expect(await hit(ANA, { day: '2026-10-20' }, prof({ day: TODAY }))).toBe(1); // a meta batida de OUTRO dia conta como novidade
    expect(await hit(ANA, { day: 'ontem' }, wasNot())).toBe(0); // dia que não é um dia
  });

  test('a mesma pessoa bater a meta de novo em menos de 12 horas não avisa outra vez (o limite segura); passadas as 12 horas, avisa', async () => {
    await team([ANA, BIA]); await E.phone(BIA, 1, ON());
    expect(await hit(ANA)).toBe(1);
    E.clock.t = E.at(11, 59);
    expect(await hit(ANA)).toBe(0);
    expect(E.logOf('repetido')).toHaveLength(1);
    E.clock.t = E.at(12);
    expect(await hit(ANA)).toBe(1);
    expect(E.sentTo(BIA)).toHaveLength(2);
  });

  test('vários amigos batem a meta: um aviso para cada um, todos com o mesmo tag (o novo troca o anterior na tela)', async () => {
    await team([ANA, BIA, CAIO]); await E.phone(CAIO, 1, ON());
    await hit(ANA); await hit(BIA, { nm: 'Bia' });
    expect(E.titles(CAIO)).toEqual(['Ana bateu a meta de hoje' + NB + '🎉', 'Bia bateu a meta de hoje' + NB + '🎉']);
    expect(E.sentTo(CAIO).map((c) => c.data.tag)).toEqual(['mare-turma-meta', 'mare-turma-meta']);
  });

  test('quem está dormindo recebe ao acordar, se a meta ainda é de hoje (4 horas); se acordar tarde, o aviso já venceu', async () => {
    await team([ANA, BIA, CAIO]);
    await E.phone(BIA, 1, { social: { hit: true }, wake: '13:00', sleep: '23:00' }); // às 11h dela está dormindo; acorda às 13h (daqui a 2 h)
    await E.phone(CAIO, 1, { social: { hit: true }, wake: '20:00', sleep: '22:00' }); // acorda às 20h (daqui a 9 h)
    expect(await hit(ANA)).toBe(0);
    expect(E.sentTo(BIA)).toHaveLength(0);
    expect((await E.pushq(BIA)).items.map((x) => [x.k, x.tag])).toEqual([['hit', 'mare-turma-meta']]);
    expect((await E.pushq(BIA)).due).toBe(E.at(2));
    E.clock.t = E.at(2, 1);
    expect(await flushQueue(BIA, E.deps())).toBe(1);
    expect(E.lastTo(BIA).data).toMatchObject({ ev: 'hit', title: 'Ana bateu a meta de hoje' + NB + '🎉' });
    E.clock.t = E.at(9, 1);
    expect(await flushQueue(CAIO, E.deps())).toBe(0);
    expect(E.logOf('vencidos')).toHaveLength(1);
    expect(E.sentTo(CAIO)).toHaveLength(0);
    expect(await E.pushq(CAIO)).toBeNull();
  });

  test('o aviso de meta que esperou o silêncio vale 4 horas: quem acorda 3 h 59 min depois recebe; 4 h 01 min depois, já venceu', async () => {
    await team([ANA, BIA, CAIO]);
    await E.phone(BIA, 1, { social: { hit: true }, wake: '14:59', sleep: '23:00' }); // às 11h dela está dormindo
    await E.phone(CAIO, 1, { social: { hit: true }, wake: '15:01', sleep: '23:00' });
    expect(await hit(ANA)).toBe(0);
    expect((await E.pushq(BIA)).due).toBe(E.at(3, 59));
    expect((await E.pushq(CAIO)).due).toBe(E.at(4, 1));
    E.clock.t = E.at(3, 59);
    expect(await flushQueue(BIA, E.deps())).toBe(1);
    E.clock.t = E.at(4, 1);
    expect(await flushQueue(CAIO, E.deps())).toBe(0);
    expect(E.logOf('vencidos')).toHaveLength(1);
    expect(E.sentTo(CAIO)).toHaveLength(0);
  });

  test('um amigo que o FCM recusa não impede os outros; o erro vai para o registro', async () => {
    await team([ANA, BIA, CAIO, DUDA]);
    for (const u of [BIA, CAIO, DUDA]) await E.phone(u, 1, ON());
    E.fcm.failFor = (t) => t === E.tokenOf(CAIO);
    expect(await hit(ANA)).toBe(2);
    expect(E.titles(BIA)).toHaveLength(1); expect(E.titles(DUDA)).toHaveLength(1); expect(E.titles(CAIO)).toHaveLength(0);
    expect(E.errors().map((l) => [l.m, l.kind])).toEqual([['aviso de amigos falhou', 'hit']]);
  });

  test('sem amigos, ou com amigos que nem ligaram o aviso: nada é enviado', async () => {
    await team([ANA]);
    expect(await hit(ANA)).toBe(0);
    await team([BIA, CAIO]); await E.link(ANA, BIA); await E.phone(BIA, 1, E.AWAKE);
    expect(await hit(ANA)).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
  });

  test('a mesma pessoa com dois aparelhos recebe um envio só, com os dois', async () => {
    await team([ANA, BIA]); await E.phone(BIA, 2, ON());
    await hit(ANA);
    expect(E.sentTo(BIA)).toHaveLength(1);
    expect(E.sentTo(BIA)[0].tokens).toEqual([E.tokenOf(BIA, 1), E.tokenOf(BIA, 2)]);
  });

  test('uma turma cheia (31 pessoas): os 30 amigos que ligaram o aviso recebem, cada um o seu', async () => {
    const L = Array.from({ length: 31 }, (_, i) => U('t' + String(i + 1).padStart(2, '0')));
    const ops = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const id = E.pid(L[i], L[j]), m = id.split('_'); ops.push(['friendships/' + id, E.activeDoc(m[0], m[1])]); }
    for (let i = 0; i < ops.length; i += 400) { const b = E.adb.batch(); ops.slice(i, i + 400).forEach((o) => { b.set(E.adb.doc(o[0]), o[1]); }); await b.commit(); }
    for (const u of L.slice(1)) await E.phone(u, 1, ON());
    expect(await hit(L[0])).toBe(30);
    expect(E.fcm.calls).toHaveLength(30);
    expect(new Set(E.fcm.calls.map((c) => c.tokens[0])).size).toBe(30);
  });

  test('de ponta a ponta com o app: o perfil que a pessoa publica com a meta batida avisa quem ligou o aviso', async () => {
    const A = E.person('Ana', ANA), B = E.person('Bia', BIA);
    await E.join(A); const code = await E.join(B);
    await E.phone(BIA, 1, ON());
    await A.sc.request(code); await B.sc.accept(ANA);
    const ref = E.adb.doc('profiles/' + ANA), was = (await ref.get()).data();
    await A.sc.publish(Object.assign(A.payload(), { pct: 100, met: true, st: 1 }), true); // a pessoa bateu a meta: o app publica o perfil (pelas regras de verdade)
    const now = (await ref.get()).data();
    expect(now).toMatchObject({ met: true, nm: 'Ana' });
    expect(await notifyHit({ uid: ANA, before: was, after: now }, E.deps())).toBe(1);
    expect(E.lastTo(BIA).data).toMatchObject({ ev: 'hit', title: 'Ana bateu a meta de hoje' + NB + '🎉' });
    // publicar o mesmo perfil de novo não avisa de novo
    expect(await notifyHit({ uid: ANA, before: now, after: now }, E.deps())).toBe(0);
  });
});

/* ============================== resumo da semana ============================== */
// Cada pessoa da lista com perfil (dia SUNDAY e a máscara dos 7 dias em wm[uid]) e aparelho (user[uid] = campos extras de users/{uid}: tz, social…)
async function weekCrew(list, wm, user) {
  const over = {};
  list.forEach((u) => { over[u] = { day: SUNDAY, wm: wm && wm[u] != null ? wm[u] : 0 }; });
  await team(list, over);
  for (const u of list) await E.phone(u, 1, Object.assign({}, user && user[u]));
}
const BODY = (hits, mine) => 'A turma bateu a meta ' + (hits === 1 ? '1 vez' : hits + ' vezes') + ' nos últimos 7 dias.' + (mine ? ' Você bateu em ' + (mine === 1 ? '1 dia' : mine + ' dias') + '.' : '') + ' Toque para ver a turma.';
const TITLE = 'Resumo da semana da turma' + NB + '🌊';

E.suite('sendWeekly: "resumo da semana da turma" (domingo, 19h, no relógio de cada um)', () => {
  test('só quem está no domingo, entre 19h e 19h59, no relógio dele, recebe: Fortaleza e São Paulo sim; Nova York, Lisboa e Tóquio, não', async () => {
    const all = [ANA, BIA, CAIO, DUDA, EDU];
    await weekCrew(all, { [ANA]: 7, [BIA]: 7, [CAIO]: 7, [DUDA]: 7, [EDU]: 7 }, {
      [ANA]: { tz: 'America/Fortaleza' }, [BIA]: { tz: 'America/Sao_Paulo' }, [CAIO]: { tz: 'America/New_York' }, [DUDA]: { tz: 'Europe/Lisbon' }, [EDU]: { tz: 'Asia/Tokyo' } });
    for (const u of all) await E.adb.doc('users/' + u).update(E.AWAKE);
    E.clock.t = SUN;
    expect(await sendWeekly(E.deps())).toEqual({ seen: 2, sent: 2 });
    expect(E.titles(ANA)).toEqual([TITLE]);
    expect(E.titles(BIA)).toEqual([TITLE]);
    expect([CAIO, DUDA, EDU].map((u) => E.sentTo(u).length)).toEqual([0, 0, 0]);
    expect(E.lastTo(ANA)).toMatchObject({ webpush: { headers: { Urgency: 'high', TTL: '43200' } },
      data: { kind: 'friend', ev: 'week', tag: 'mare-turma-semana', url: './?tab=friends', title: TITLE, body: BODY(15, 3) } }); // 5 pessoas × 3 dias; ela bateu 3
    expect(E.logs.find((l) => l.m === 'resumo da semana')).toMatchObject({ seen: 2, sent: 2 });
  });

  test('a hora certa é do início (19:00:00) ao fim (19:59:59) do domingo; um segundo antes, um segundo depois, outro dia: nada', async () => {
    await weekCrew([ANA, BIA], { [ANA]: 7, [BIA]: 7 }, { [ANA]: E.AWAKE });
    const cases = [['domingo 18:59:59', Date.UTC(2026, 9, 25, 21, 59, 59), false], ['domingo 19:00:00', Date.UTC(2026, 9, 25, 22, 0, 0), true], ['domingo 19:59:59', Date.UTC(2026, 9, 25, 22, 59, 59), true],
      ['domingo 20:00:00', Date.UTC(2026, 9, 25, 23, 0, 0), false], ['sábado 19:30', Date.UTC(2026, 9, 24, 22, 30, 0), false], ['segunda 19:30', Date.UTC(2026, 9, 26, 22, 30, 0), false],
      ['domingo meio-dia', Date.UTC(2026, 9, 25, 15, 0, 0), false]];
    for (const c of cases) {
      await E.adb.doc('pushlog/' + ANA).delete();
      E.clock.t = c[1];
      const before = E.sentTo(ANA).length;
      await sendWeekly(E.deps());
      expect([c[0], E.sentTo(ANA).length - before]).toEqual([c[0], c[2] ? 1 : 0]);
    }
  });

  test('o texto conta só quem mostra os 7 dias: a turma bateu N vezes e você bateu M dias; perfil de alguns dias atrás ainda conta o que cabe na semana', async () => {
    await weekCrew([ANA, BIA, CAIO], { [ANA]: 7, [BIA]: 3, [CAIO]: 0 }, { [ANA]: E.AWAKE });
    await E.adb.doc('profiles/' + BIA).update({ day: '2026-10-23', wm: 3 }); // Bia não publica desde sexta: os dois dias dela (sex e qui) ainda estão na semana
    await E.adb.doc('profiles/' + CAIO).update({ sh: false, wm: null, pct: null }); // Caio não mostra o progresso: fora da conta
    E.clock.t = SUN;
    await sendWeekly(E.deps());
    expect(E.lastTo(ANA).data.body).toBe(BODY(5, 3)); // Ana 3 + Bia 2; Caio não conta
  });

  test('semana perfeita: todo mundo bateu a meta todos os dias', async () => {
    await weekCrew([ANA, BIA, CAIO], { [ANA]: 127, [BIA]: 127, [CAIO]: 127 }, { [ANA]: E.AWAKE });
    E.clock.t = SUN;
    await sendWeekly(E.deps());
    expect(E.lastTo(ANA).data.body).toBe('Semana perfeita! Todo mundo bateu a meta todos os dias.');
  });

  test('nada a contar, nada enviado: sem amigos, ninguém mais mostra os 7 dias, ou a turma não bateu a meta nenhuma vez', async () => {
    await weekCrew([ANA], { [ANA]: 7 }, { [ANA]: E.AWAKE }); // sozinha
    E.clock.t = SUN;
    expect(await sendWeekly(E.deps())).toEqual({ seen: 1, sent: 0 });
    await team([BIA], { [BIA]: { day: SUNDAY, wm: null, sh: false, pct: null } }); await E.link(ANA, BIA); // o único amigo não mostra o progresso
    expect((await sendWeekly(E.deps())).sent).toBe(0);
    await E.adb.doc('profiles/' + BIA).update({ sh: true, wm: 0, pct: 0 }); // agora mostra, mas a turma não bateu nada (e ela mesma bateu)
    await E.adb.doc('profiles/' + ANA).update({ wm: 0 });
    expect((await sendWeekly(E.deps())).sent).toBe(0);
    expect(E.fcm.calls).toHaveLength(0);
    await E.adb.doc('profiles/' + BIA).update({ wm: 1 }); // um acerto de um amigo basta
    expect((await sendWeekly(E.deps())).sent).toBe(1);
    expect(E.lastTo(ANA).data.body).toBe(BODY(1, 0)); // "1 vez", sem "você bateu"
  });

  test('quem desligou o resumo, desligou todos os avisos ou não tem aparelho não recebe; ligado explicitamente, recebe', async () => {
    const all = [ANA, BIA, CAIO, DUDA, EDU];
    await weekCrew(all, { [ANA]: 7, [BIA]: 7, [CAIO]: 7, [DUDA]: 7, [EDU]: 7 }, {
      [ANA]: E.AWAKE, [BIA]: Object.assign({ social: { week: false } }, E.AWAKE), [CAIO]: Object.assign({ social: { push: false } }, E.AWAKE),
      [DUDA]: Object.assign({ social: { week: true, hit: true } }, E.AWAKE), [EDU]: E.AWAKE });
    await E.phone(EDU, 0, E.AWAKE); // Edu perdeu o aparelho
    E.clock.t = SUN;
    const spy = countTx();
    expect(await sendWeekly(E.deps({ db: spy.db }))).toMatchObject({ sent: 2 });
    expect([ANA, BIA, CAIO, DUDA, EDU].map((u) => E.sentTo(u).length)).toEqual([1, 0, 0, 1, 0]);
    expect(spy.n).toBe(2); // só quem recebe abre uma transação: quem desligou o resumo, os avisos ou perdeu o aparelho nem entra
  });

  test('uma vez só por semana: o mesmo domingo repetido (outro disparo) não manda de novo; no domingo seguinte, manda', async () => {
    await weekCrew([ANA, BIA], { [ANA]: 7, [BIA]: 7 }, { [ANA]: E.AWAKE, [BIA]: E.AWAKE });
    E.clock.t = SUN;
    expect((await sendWeekly(E.deps())).sent).toBe(2); // Ana e Bia
    E.clock.t = SUN + 20 * MIN; // o mesmo domingo, 19h50
    expect((await sendWeekly(E.deps())).sent).toBe(0);
    expect(E.logOf('repetido')).toHaveLength(2);
    expect(E.sentTo(ANA)).toHaveLength(1);
    // uma semana depois: perfis atualizados para o novo domingo
    for (const u of [ANA, BIA]) await E.adb.doc('profiles/' + u).update({ day: '2026-11-01' });
    E.clock.t = SUN + 7 * DAY;
    expect((await sendWeekly(E.deps())).sent).toBe(2);
    expect(E.sentTo(ANA)).toHaveLength(2);
  });

  test('quem está dormindo às 19h (sleep às 18h) recebe ao acordar, de manhã; se acordar mais de 12 horas depois, o resumo já venceu', async () => {
    await weekCrew([ANA, BIA, CAIO], { [ANA]: 7, [BIA]: 7, [CAIO]: 7 }, { [ANA]: { wake: '07:00', sleep: '18:00' }, [BIA]: { wake: '08:00', sleep: '18:00' }, [CAIO]: E.AWAKE });
    E.clock.t = SUN;
    expect((await sendWeekly(E.deps())).sent).toBe(1); // só Caio (acordado)
    expect((await E.pushq(ANA)).items.map((x) => [x.k, x.tag])).toEqual([['week', 'mare-turma-semana']]);
    expect((await E.pushq(ANA)).due).toBe(Date.UTC(2026, 9, 26, 10, 0, 0)); // segunda 07:00 em Fortaleza
    E.clock.t = Date.UTC(2026, 9, 26, 10, 1, 0);
    expect(await flushQueue(ANA, E.deps())).toBe(1); // 11 h 31 min depois: ainda vale (12 h)
    expect(E.lastTo(ANA).data).toMatchObject({ ev: 'week', title: TITLE });
    E.clock.t = Date.UTC(2026, 9, 26, 11, 1, 0);
    expect(await flushQueue(BIA, E.deps())).toBe(0); // 12 h 31 min depois: venceu
    expect(E.logOf('vencidos')).toHaveLength(1);
  });

  test('o dia de quem recebe é o dia dele, não o de Greenwich: domingo 19h30 em Nova York (inverno) já é segunda em Greenwich', async () => {
    const NOV1 = '2026-11-01'; // o horário de verão dos EUA acabou nesta madrugada: Nova York está em UTC−5
    await team([ANA, BIA], { [ANA]: { day: NOV1, wm: 127 }, [BIA]: { day: NOV1, wm: 127 } });
    for (const u of [ANA, BIA]) await E.phone(u, 1, Object.assign({ tz: 'America/New_York' }, E.AWAKE));
    E.clock.t = Date.UTC(2026, 10, 2, 0, 30, 0); // segunda, 02/11, 00:30 em Greenwich = domingo, 01/11, 19:30 em Nova York
    expect((await sendWeekly(E.deps())).sent).toBe(2);
    expect(E.lastTo(ANA).data.body).toBe('Semana perfeita! Todo mundo bateu a meta todos os dias.'); // com o dia de Greenwich (02/11) seriam só 6 dos 7 dias
  });

  test('as zonas vão ao Firestore em grupos de no máximo 30 ("in" não aceita mais), e todas entram na conta', async () => {
    await weekCrew([ANA, BIA], { [ANA]: 7, [BIA]: 7 }, { [ANA]: E.AWAKE });
    E.clock.t = SUN;
    const groups = [];
    const db = new Proxy(E.adb, {
      get(t, k) {
        if (k === 'collection') {
          return (n) => {
            const c = t.collection(n);
            return new Proxy(c, { get(ct, ck) {
              if (ck === 'where') return (f, op, v) => { if (n === 'users' && f === 'tz') groups.push(v); return ct.where(f, op, v); };
              const x = ct[ck];
              return typeof x === 'function' ? x.bind(ct) : x;
            } });
          };
        }
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    await sendWeekly(E.deps({ db: db }));
    const zones = zonesAt(SUN);
    expect(zones.length).toBeGreaterThan(30); // a esta hora, mais de 30 nomes de fuso estão no domingo das 19h: o teste só vale com mais de um grupo
    expect(groups.length).toBe(Math.ceil(zones.length / 30));
    groups.forEach((g) => expect(g.length).toBeLessThanOrEqual(30));
    expect([].concat(...groups).sort()).toEqual(zones.slice().sort());
    expect(zones).toContain('America/Fortaleza');
  });

  test('a consulta dos usuários traz só o fuso, as escolhas de aviso e os aparelhos: o resto do documento (que pode ser grande) nem sai do Firestore', async () => {
    await weekCrew([ANA, BIA], { [ANA]: 7, [BIA]: 7 }, { [ANA]: E.AWAKE, [BIA]: E.AWAKE });
    await E.adb.doc('users/' + ANA).update({ today: { day: TODAY, ml: 1200, junk: 'x'.repeat(5000) }, stats: { streak: 4, best: 9 } }); // campos que o resumo não usa
    E.clock.t = SUN;
    const log = { calls: [], snaps: [] };
    const db = new Proxy(E.adb, { get(t, k) {
      if (k === 'collection') return (n) => (n === 'users' ? trace(t.collection(n), log, 'users') : t.collection(n));
      const v = t[k];
      return typeof v === 'function' ? v.bind(t) : v;
    } });
    expect(await sendWeekly(E.deps({ db: db }))).toMatchObject({ seen: 2, sent: 2 });
    const sel = log.calls.filter((c) => /\.select$/.test(c[0]));
    expect(sel.length).toBeGreaterThan(0);
    sel.forEach((c) => expect(c[1]).toEqual(['tz', 'social', 'fcm']));
    const docs = [].concat(...log.snaps);
    expect(docs).toHaveLength(2); // as duas pessoas estão no mesmo fuso
    docs.forEach((keys) => expect(keys.filter((f) => ['fcm', 'social', 'tz'].indexOf(f) < 0)).toEqual([]));
  });

  test('uma pessoa que dá erro não derruba as outras (o erro vai para o registro)', async () => {
    await weekCrew([ANA, BIA, CAIO], { [ANA]: 7, [BIA]: 7, [CAIO]: 7 }, { [ANA]: E.AWAKE, [BIA]: E.AWAKE, [CAIO]: E.AWAKE });
    E.clock.t = SUN;
    E.fcm.failFor = (t) => t === E.tokenOf(ANA);
    expect(await sendWeekly(E.deps())).toEqual({ seen: 3, sent: 2 });
    expect(E.errors().map((l) => l.m)).toEqual(['resumo da semana falhou']);
    expect([ANA, BIA, CAIO].map((u) => E.sentTo(u).length)).toEqual([0, 1, 1]);
  });

  test('um fuso que o servidor não conhece (ou nenhum) não quebra a rodada: a pessoa só não recebe', async () => {
    await weekCrew([ANA, BIA, CAIO], { [ANA]: 7, [BIA]: 7, [CAIO]: 7 }, { [ANA]: E.AWAKE, [BIA]: Object.assign({ tz: 'Marte/Olympus' }, E.AWAKE), [CAIO]: E.AWAKE });
    await E.adb.doc('users/' + CAIO).update({ tz: null });
    E.clock.t = SUN;
    expect(await sendWeekly(E.deps())).toMatchObject({ sent: 1 });
    expect(E.sentTo(ANA)).toHaveLength(1);
  });
});

/* ============================== o gatilho e o resumo de verdade (functions/index.js) ============================== */
// O mesmo arquivo que o firebase deploy publica, ligado ao emulador e ao Admin SDK de verdade, com o transporte do FCM trocado por um que só anota o envio.
const snapOf = (d) => ({ exists: d != null, data: () => d });
E.suite('o gatilho e o resumo de verdade (functions/index.js)', () => {
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
  const titlesTo = (uid) => sent.filter((x) => x.token === E.tokenOf(uid)).map((x) => x.data.title);
  const runProfile = (uid, before, after) => mod.onProfile.run({ data: { before: snapOf(before), after: snapOf(after) }, params: { uid: uid } });

  test('onProfile: a meta batida avisa quem ligou o aviso; qualquer outra mudança de perfil não faz nada', async () => {
    await team([ANA, BIA, CAIO]); await E.phone(BIA, 1, ON()); await E.phone(CAIO, 1, E.AWAKE);
    await runProfile(ANA, wasNot(), prof({ pct: 85, met: false })); // só andou
    await runProfile(ANA, null, wasNot()); // perfil novo, sem meta
    await runProfile(ANA, prof(), null); // perfil apagado
    expect(sent).toHaveLength(0);
    await runProfile(ANA, wasNot(), prof()); // bateu a meta
    expect(titlesTo(BIA)).toEqual(['Ana bateu a meta de hoje' + NB + '🎉']);
    expect(titlesTo(CAIO)).toEqual([]);
    await runProfile(ANA, wasNot(), prof()); // o mesmo evento entregue outra vez: o limite segura
    expect(sent).toHaveLength(1);
    await expect(mod.onProfile.run({ data: undefined, params: {} })).resolves.toBeUndefined();
  });

  test('weeklyCrew: o disparo agendado roda sem erro; no domingo das 19h (o relógio trocado por um nosso) o resumo sai, uma vez só', async () => {
    await expect(mod.weeklyCrew.run({})).resolves.toBeUndefined(); // sem ninguém no banco: só confere a ligação com o index.js
    await weekCrew([ANA, BIA], { [ANA]: 7, [BIA]: 7 }, { [ANA]: E.AWAKE, [BIA]: E.AWAKE });
    vi.useFakeTimers({ toFake: ['Date'], now: SUN });
    try { await mod.weeklyCrew.run({}); await mod.weeklyCrew.run({}); } finally { vi.useRealTimers(); }
    expect(titlesTo(ANA)).toEqual([TITLE]);
    expect(titlesTo(BIA)).toEqual([TITLE]);
  });
});
