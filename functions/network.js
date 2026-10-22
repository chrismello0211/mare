// Maré — a turma única (1.2.0). Os amigos do Maré formam UMA turma: quando alguém aceita um pedido, as duas turmas (a de quem pediu e a de quem
// aceitou) viram uma só, e todo mundo vira amigo de todo mundo. Quem faz isso é o servidor (Admin SDK, que ignora as regras): as regras de
// firestore.rules nunca aceitam um aplicativo criando uma amizade já ativa. As amizades criadas aqui levam "auto: true".
//
//   growNetwork    roda quando um pedido vira amizade (gatilho onFriendship em index.js): fecha a turma e avisa quem já estava nela
//                  ("X entrou na turma"). Quem aceitou e quem pediu já sabem um do outro: o aviso deles só fala das OUTRAS pessoas.
//   reconcileAll   roda uma vez por dia (reconcileNetworks): completa o que faltar (turmas feitas antes da 1.2.0, uma gravação que falhou, um
//                  "remover amizade" de um aplicativo antigo) e apaga amizades automáticas de quem já saiu. Não avisa ninguém: o app mostra
//                  "X entrou na turma" sozinho quando a lista muda.
//
// Limites: uma turma tem no máximo CREW_MAX (31) pessoas (cada uma com até 30 amigos, o limite do app). Juntar turmas que passariam disso
// não faz nada: fica só a amizade que a pessoa aceitou. Só a parte pura (planClosure, autoDoc, pairId) depende de nada; o resto fala com o Firestore.
import { pairOf, otherOf, pairId, cleanName, messageOf } from './social-push.js';
import { route, notifyFriendship } from './friend-push.js';

export const CREW_MAX = 31;
const BATCH = 400; // o Firestore aceita 500 gravações por lote
const SCAN = 500;
const MAX_NEW = 3000; // teto de amizades novas por rodada diária: se algo estranho disparar, o estrago para aqui

export { pairId };
// Um documento friendships/{id} de verdade: dois ids, um estado conhecido e o id do documento igual ao dos dois (senão não é uma amizade)
function validPairDoc(id, x) {
  const p = pairOf(x);
  return p && id === pairId(p.m[0], p.m[1]) ? p : null;
}
const unique = (l) => Array.from(new Set(l));
// A amizade ou o pedido já existe / sumiu (códigos gRPC do Admin SDK)
const alreadyExists = (e) => !!e && (e.code === 6 || /ALREADY_EXISTS/.test(String(e.code) + String(e.message)));
const notFound = (e) => !!e && (e.code === 5 || /NOT_FOUND/.test(String(e.code) + String(e.message)));

/* ---------- a parte pura ---------- */
// members: os ids da turma. pairs: Map id → { st } do que já existe entre eles. Devolve quais amizades faltam (create) e quais pedidos pendentes
// dentro da turma passam a ser amizade (upgrade), como ids de amizade.
export function planClosure(members, pairs) {
  const ms = unique(members).sort(), create = [], upgrade = [];
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const id = pairId(ms[i], ms[j]), p = pairs.get(id);
      if (!p) create.push(id); else if (p.st === 'pending') upgrade.push(id);
    }
  }
  return { create: create, upgrade: upgrade };
}
const nameIn = (p) => cleanName(p && p.nm) || 'Amigo';
const mascotIn = (p) => (p && typeof p.mc === 'string' && p.mc.length > 0 && p.mc.length <= 16 ? p.mc : 'concha');
// O documento de uma amizade automática, no mesmo formato das que os aplicativos criam (m na ordem do id; nome e mascote dos dois lados)
export function autoDoc(id, profiles, ts) {
  const ids = id.split('_'), pa = profiles.get(ids[0]), pb = profiles.get(ids[1]);
  return { m: ids, by: ids[0], st: 'active', nm: nameIn(pa), mc: mascotIn(pa), tn: nameIn(pb), tc: mascotIn(pb), at: ts, ok: ts, auto: true };
}

/* ---------- o Firestore ---------- */
// A turma de start: ele e quem se liga a ele por amizades ATIVAS, de amigo em amigo. skip = id de uma amizade que não conta como ligação.
// over = true se passou de max pessoas (para de olhar: a turma não será juntada). pairs = tudo o que foi lido (ativas e pendentes).
export async function crewOf(db, start, o) {
  const max = (o && o.max) || CREW_MAX, skip = o && o.skip;
  const seen = new Set([start]), queue = [start], pairs = new Map();
  let over = false;
  while (queue.length && !over) {
    const u = queue.shift();
    const snap = await db.collection('friendships').where('m', 'array-contains', u).limit(600).get();
    snap.forEach((doc) => {
      const p = validPairDoc(doc.id, doc.data());
      if (!p) return;
      pairs.set(doc.id, { st: p.st, by: p.by, auto: p.auto === true });
      if (p.st !== 'active' || doc.id === skip) return;
      const x = otherOf(p.m, u);
      if (!seen.has(x)) { seen.add(x); queue.push(x); if (seen.size > max) over = true; }
    });
  }
  return { members: Array.from(seen), pairs: pairs, over: over };
}
// Os amigos ATIVOS de uid (ids). Como a turma é uma só, é a turma inteira dele (menos ele). No máximo 60: o app guarda 30.
export async function friendsOf(db, uid) {
  const snap = await db.collection('friendships').where('m', 'array-contains', uid).limit(600).get(), out = [];
  snap.forEach((doc) => { const p = validPairDoc(doc.id, doc.data()); if (p && p.st === 'active' && p.m.indexOf(uid) >= 0) out.push(otherOf(p.m, uid)); });
  return out.slice(0, 60);
}
// Perfis (profiles/{uid}) dos ids, os que existem: Map uid → dados
async function profilesOf(db, uids) {
  const out = new Map();
  for (let i = 0; i < uids.length; i += 300) {
    const part = uids.slice(i, i + 300), snaps = await db.getAll(...part.map((u) => db.doc('profiles/' + u)));
    snaps.forEach((s, j) => { if (s.exists) out.set(part[j], s.data()); });
  }
  return out;
}
// Grava as amizades novas (create) e os pedidos que viram amizade (patch), em lotes. Se um lote falha porque algo mudou no meio do caminho
// (outra execução criou a amizade, alguém recusou o pedido), tenta de novo uma por uma e deixa passar só o que "já existe" ou "sumiu".
// Devolve { created, upgraded }.
async function apply(ops, d) {
  const r = { created: 0, upgraded: 0 };
  for (let i = 0; i < ops.length; i += BATCH) {
    const chunk = ops.slice(i, i + BATCH);
    try {
      const b = d.db.batch();
      chunk.forEach((o) => { if (o.doc) b.create(o.ref, o.doc); else b.update(o.ref, o.patch); });
      await b.commit();
      chunk.forEach((o) => { if (o.doc) r.created++; else r.upgraded++; });
    } catch (e) {
      for (const o of chunk) {
        const how = await one(o, d);
        if (how === 'created') r.created++; else if (how === 'upgraded') r.upgraded++;
      }
    }
  }
  return r;
}
async function one(o, d) {
  try {
    if (o.doc) { await o.ref.create(o.doc); return 'created'; }
    await o.ref.update(o.patch);
    return 'upgraded';
  } catch (e) {
    if (o.doc && alreadyExists(e)) { // já existe: se for um pedido pendente dentro da turma, ele vira amizade
      return d.db.runTransaction(async (tx) => {
        const s = await tx.get(o.ref);
        if (s.exists && s.data().st === 'pending') { tx.update(o.ref, { st: 'active', ok: o.doc.ok, auto: true }); return 'upgraded'; }
        return 'kept';
      });
    }
    if (!o.doc && notFound(e)) return 'gone';
    throw e;
  }
}
// As operações de um plano de fechamento. profiles: Map uid → perfil (de quem existe).
function opsOf(plan, profiles, d) {
  const ts = d.Timestamp.fromMillis(d.now());
  return plan.create.map((id) => ({ ref: d.db.doc('friendships/' + id), doc: autoDoc(id, profiles, ts) }))
    .concat(plan.upgrade.map((id) => ({ ref: d.db.doc('friendships/' + id), patch: { st: 'active', ok: ts, auto: true } })));
}

// O que o gatilho onFriendship faz com uma gravação: avisa quem deve ser avisado (pedido, aceite, aceno) e, se um pedido virou amizade, junta as
// turmas. O aviso sai primeiro e não depende da junção: se ela falhar, o erro vai para o registro e o resto já foi feito (a conferência diária
// completa o que ficou faltando). Devolve { sent, grown }.
export async function handleFriendship(ch, d) {
  const sent = await notifyFriendship(ch, d);
  let grown = null;
  try { grown = await growNetwork(ch, d); } catch (e) { d.log.error('turma única falhou', { err: e && e.message }); }
  return { sent: sent, grown: grown };
}

// ch = { before, after }: o documento friendships/{par} antes e depois. Só age quando um pedido virou amizade por um aplicativo (as amizades
// "auto" que o próprio servidor cria não disparam nada: sem laço). Devolve { created, upgraded, joined, why? }.
export async function growNetwork(ch, d) {
  const out = { created: 0, upgraded: 0, joined: 0 };
  const A = pairOf(ch.after), B = pairOf(ch.before);
  if (!A || !B || B.st !== 'pending' || A.st !== 'active' || A.auto === true) return out;
  const a = A.m[0], b = A.m[1], skip = pairId(a, b);
  // As duas turmas, cada uma sem contar a amizade que acabou de nascer (assim não se misturam antes da hora)
  const ca = await crewOf(d.db, a, { skip: skip, max: CREW_MAX }), cb = await crewOf(d.db, b, { skip: skip, max: CREW_MAX });
  const now = ca.pairs.get(skip) || cb.pairs.get(skip);
  if (!now || now.st !== 'active') return Object.assign(out, { why: 'a amizade já não existe' }); // desfeita no meio do caminho: não a recriamos
  const all = unique(ca.members.concat(cb.members));
  if (ca.over || cb.over || all.length > CREW_MAX) { d.log.info('turma grande demais para juntar', { size: all.length, max: CREW_MAX }); return Object.assign(out, { why: 'grande demais' }); }
  const pairs = new Map(ca.pairs);
  cb.pairs.forEach((v, k) => { pairs.set(k, v); });
  const profiles = await profilesOf(d.db, all);
  const keep = (u) => profiles.has(u) || u === a || u === b; // quem não tem perfil (saiu) não entra
  const sa = ca.members.filter(keep), sb = cb.members.filter(keep), members = unique(sa.concat(sb));
  const r = await apply(opsOf(planClosure(members, pairs), profiles, d), d);
  out.created = r.created; out.upgraded = r.upgraded;
  if (r.created || r.upgraded) d.log.info('turma única', { size: members.length, created: r.created, upgraded: r.upgraded });
  if (sa.some((u) => sb.indexOf(u) >= 0)) return out; // já eram da mesma turma: ninguém chegou
  // Quem já estava em cada lado recebe o aviso das pessoas do outro lado. Quem aceitou e quem pediu já sabem um do outro (o aviso de aceite
  // e a tela do app cobrem isso): para eles, só valem as outras pessoas. A conta de cada aviso é por pessoa (a mesma turma, vista de cada um).
  const nameOfUid = (u) => nameIn(profiles.get(u));
  const jobs = [];
  const add = (to, from, list) => {
    const arr = list.filter((x) => !(to === a && x === b) && !(to === b && x === a));
    if (arr.length) jobs.push({ to: to, from: from, names: arr.map(nameOfUid).sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase(), 'pt-BR') || (x < y ? -1 : 1)), n: arr.length });
  };
  sa.forEach((u) => { add(u, b, sb); });
  sb.forEach((u) => { add(u, a, sa); });
  for (let i = 0; i < jobs.length; i += 6) {
    const got = await Promise.all(jobs.slice(i, i + 6).map((j) => {
      const ev = { kind: 'joined', from: j.from, to: j.to, names: j.names, n: j.n };
      return route(ev, messageOf(ev), d).catch((e) => { d.log.error('aviso de amigos falhou', { kind: 'joined', err: e && e.message }); return 0; });
    }));
    out.joined += got.reduce((s, x) => s + x, 0);
  }
  return out;
}

// Passa por todas as amizades ativas e completa cada turma (2 a CREW_MAX pessoas ligadas por amizades ativas) que ainda não é completa.
// Turmas maiores que o limite ficam como estão. Também apaga as amizades automáticas de quem não tem mais perfil (saiu). Devolve as contas.
// Uma falha do Firestore ou da rede (UNAVAILABLE, DEADLINE_EXCEEDED…) numa turma, ou ao apagar as órfãs, vai para o registro (nível de erro, com o
// tamanho da turma) e conta em "failed": as outras turmas seguem, e a que falhou fica para a conferência do dia seguinte. A leitura inicial das
// amizades, essa sim, derruba a rodada (sem ela não há o que conferir).
export async function reconcileAll(d, opts) {
  const scan = (opts && opts.scan) || SCAN, maxNew = (opts && opts.maxNew) || MAX_NEW; // opts: só os testes mexem
  const docs = new Map(); // id → { m, auto }
  for (let last = null; ;) {
    let q = d.db.collection('friendships').where('st', '==', 'active').orderBy('__name__').limit(scan);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    snap.forEach((doc) => { const p = validPairDoc(doc.id, doc.data()); if (p) docs.set(doc.id, { m: p.m, auto: p.auto === true }); });
    if (snap.size < scan) break;
    last = snap.docs[snap.docs.length - 1];
  }
  const out = { pairs: docs.size, crews: 0, created: 0, upgraded: 0, big: 0, orphans: 0, capped: false, failed: 0 };
  const failed = (what, e, more) => { out.failed++; d.log.error(what, Object.assign({ err: e && e.message }, more)); };
  // Amizades automáticas cujo dono já saiu (a saída apaga as amizades dele, mas uma gravação do servidor no mesmo instante pode recriar uma)
  const autoIds = Array.from(docs.keys()).filter((id) => docs.get(id).auto);
  if (autoIds.length) {
    try {
      const who = unique([].concat(...autoIds.map((id) => docs.get(id).m))), have = await profilesOf(d.db, who);
      const dead = autoIds.filter((id) => docs.get(id).m.some((u) => !have.has(u)));
      for (let i = 0; i < dead.length; i += BATCH) {
        const part = dead.slice(i, i + BATCH), b = d.db.batch();
        part.forEach((id) => { b.delete(d.db.doc('friendships/' + id)); });
        await b.commit();
        part.forEach((id) => { docs.delete(id); }); // só sai da conta o que foi mesmo apagado
        out.orphans += part.length;
      }
    } catch (e) { failed('amizades automáticas de quem saiu não foram apagadas', e, { found: autoIds.length }); }
  }
  // Turmas: quem se liga a quem por amizades ativas
  const up = new Map(), find = (x) => { let r = x; while (up.get(r) !== r) r = up.get(r); up.set(x, r); return r; };
  docs.forEach((v) => { v.m.forEach((u) => { if (!up.has(u)) up.set(u, u); }); const x = find(v.m[0]), y = find(v.m[1]); if (x !== y) up.set(x, y); });
  const crews = new Map();
  Array.from(up.keys()).forEach((u) => { const r = find(u); if (!crews.has(r)) crews.set(r, []); crews.get(r).push(u); });
  let budget = maxNew;
  for (const members of crews.values()) {
    if (members.length < 3) continue;
    if (members.length > CREW_MAX) { out.big++; d.log.info('turma grande demais para completar', { size: members.length }); continue; }
    const missing = planClosure(members, docs).create;
    if (!missing.length) { out.crews++; continue; }
    if (missing.length > budget) { out.capped = true; d.log.error('limite de amizades novas por rodada', { missing: missing.length, budget: budget }); continue; }
    try {
      const profiles = await profilesOf(d.db, members), live = members.filter((u) => profiles.has(u));
      const r = await apply(opsOf(planClosure(live, docs), profiles, d), d);
      budget -= r.created + r.upgraded; out.created += r.created; out.upgraded += r.upgraded; out.crews++;
    } catch (e) { failed('turma não completada (fica para a próxima conferência)', e, { size: members.length, missing: missing.length }); }
  }
  d.log.info('turmas conferidas', out);
  return out;
}
