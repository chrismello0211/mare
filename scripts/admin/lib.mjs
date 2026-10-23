// Maré — ferramentas do administrador (rodam no Cloud Shell, com a sua conta Google): a lógica de achar e recuperar a conta de alguém.
// Fica separada da linha de comando (inspect.mjs, attach-email.mjs, migrate-days.mjs) para ser testada com o emulador (tests/rules/admin-tools.test.js).
// Regras de ouro: nada aqui apaga nada (a única exceção é o --forget-devices, que tira os avisos push do aparelho antigo); quem muda alguma coisa
// só o faz com --apply, e só com o uid inteiro (nunca por apelido); senhas nunca são lidas, mostradas nem guardadas.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayTotal } from '../../public/js/core.js';
import { cleanEmail, validEmail } from '../../public/js/account.js'; // o MESMO que o app faz com o e-mail digitado (espaços e caracteres invisíveis saem)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PROJECT = 'mare-hidratacao';
export const EMULATED = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class Fail extends Error {}
export const die = (msg) => { throw new Fail(msg); };

// O firebase-admin é o de functions/node_modules (o mesmo que a nuvem usa): "cd functions && npm install" uma vez.
export function admin() {
  if (!existsSync(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin', 'package.json'))) {
    die('Falta instalar o firebase-admin. Rode uma vez:   cd functions && npm install   (e volte para a pasta do projeto)');
  }
  const req = createRequire(path.join(ROOT, 'functions', 'package.json'));
  return { app: req('firebase-admin/app'), auth: req('firebase-admin/auth'), fs: req('firebase-admin/firestore') };
}
// Conecta ao projeto do Maré (ou, com FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST, aos emuladores locais). Sempre o projeto certo, não importa o que o Cloud Shell tenha ativo.
export function connect() {
  const A = admin();
  // No Cloud Shell as credenciais são as da pessoa (não de uma conta de serviço): a API de contas do Firebase pode exigir dizer em qual projeto cobrar a cota.
  if (!EMULATED && !process.env.GOOGLE_CLOUD_QUOTA_PROJECT) process.env.GOOGLE_CLOUD_QUOTA_PROJECT = PROJECT;
  const app = A.app.initializeApp({ projectId: EMULATED ? (process.env.MARE_PROJECT || 'demo-mare') : PROJECT });
  return { auth: A.auth.getAuth(app), db: A.fs.getFirestore(app), FieldValue: A.fs.FieldValue, emulated: EMULATED };
}

/* ---------- linha de comando ---------- */
// valueFlags: os parâmetros que levam um valor (--name Ana). O resto de "--algo" é um interruptor.
export function parseArgs(argv, valueFlags) {
  const flags = {}, pos = [], vals = new Set(valueFlags || []);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) === '--') {
      const k = a.slice(2);
      if (vals.has(k) && argv[i + 1] !== undefined) { flags[k] = argv[i + 1]; i++; } else flags[k] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}
// Códigos de saída: 0 deu certo · 1 não deu e explicou (Fail) · 2 erro inesperado · 3 a prévia achou um impedimento · 4 gravou, mas a conferência falhou
export async function run(main) {
  try { await main(); process.exit(0); } catch (e) {
    if (e instanceof Fail) { console.error('\n' + e.message + '\n'); process.exit(1); }
    console.error('\nErro inesperado:', e && e.stack ? e.stack : e);
    process.exit(2);
  }
}

/* ---------- texto ---------- */
// "mariana@gmail.com" → "ma***@gmail.com"; locais curtos (até 3 letras) mostram só a primeira, para não entregar o endereço
export const maskEmail = (e) => {
  const s = String(e || ''), at = s.indexOf('@');
  return at < 1 ? (s ? '***' : '-') : s.slice(0, at <= 3 ? 1 : 2) + '***' + s.slice(at);
};
export const when = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
export const dayBr = (k) => (DAY_RE.test(k || '') ? k.slice(8) + '/' + k.slice(5, 7) + '/' + k.slice(2, 4) : '-');
export const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const agoText = (ms, now) => {
  if (!ms) return '';
  const d = Math.max(0, Math.floor(((now || Date.now()) - ms) / 864e5));
  return d === 0 ? 'hoje' : 'há ' + plural(d, 'dia', 'dias');
};

/* ---------- ler a conta e a nuvem ---------- */
export async function listAll(auth) {
  const out = [];
  let tok;
  do { const r = await auth.listUsers(1000, tok); r.users.forEach((u) => { out.push(u); }); tok = r.pageToken; } while (tok);
  return out;
}
export function loginOf(u) {
  const ps = (u.providerData || []).map((p) => p.providerId);
  if (ps.length) return ps.map((p) => (p === 'password' ? 'e-mail e senha' : p.replace('.com', ''))).join(' + ') + (u.email ? ' (' + maskEmail(u.email) + ')' : '');
  return u.email ? 'e-mail ainda sem senha (' + maskEmail(u.email) + ')' : 'anônimo';
}
const msOf = (t) => { const n = Date.parse(t || ''); return isFinite(n) ? n : 0; };
const LOST_LOGIN = 'sem login (o login foi apagado; só restam os dados)';
// Os registros de uma conta como mapa dia → { goal, entries, u, ut }. Só para contar e juntar: nada daqui é mostrado.
// Só entram registros que são objetos (lixo no meio da lista não derruba a conta inteira); bad conta os que ficaram de fora.
export async function daysMap(db, uid) {
  const out = {};
  (await db.collection('users').doc(uid).collection('days').get()).forEach((d) => {
    if (!DAY_RE.test(d.id)) return;
    const x = d.data(), list = Array.isArray(x.entries) ? x.entries : [], ok = list.filter((e) => e && typeof e === 'object' && !Array.isArray(e));
    out[d.id] = { goal: +x.goal || 0, entries: ok, bad: list.length - ok.length, u: +x.u || 0, ut: d.updateTime };
  });
  return out;
}
// Um retrato de todas as contas: só nomes e contagens (nenhum volume bebido, peso ou horário). Inclui as contas cujo LOGIN já não existe
// no Firebase mas cujos dados continuam no Firestore (orphan: true): é o que sobra se uma limpeza automática apagou o login anônimo.
export async function snapshot(ctx) {
  const users = await listAll(ctx.auth), profiles = {}, friends = {}, keysOf = {};
  (await ctx.db.collection('profiles').get()).forEach((d) => { profiles[d.id] = d.data(); });
  (await ctx.db.collection('friendships').where('st', '==', 'active').get()).forEach((d) => {
    const m = d.get('m');
    if (!Array.isArray(m) || m.length !== 2) return;
    (friends[m[0]] = friends[m[0]] || []).push(m[1]); (friends[m[1]] = friends[m[1]] || []).push(m[0]);
  });
  // os dias de todas as contas numa leitura só, e só os nomes dos documentos (nenhum registro é lido aqui)
  (await ctx.db.collectionGroup('days').select().get()).forEach((d) => {
    const owner = d.ref.parent.parent;
    if (!owner || !owner.parent || owner.parent.id !== 'users' || !DAY_RE.test(d.id)) return;
    (keysOf[owner.id] = keysOf[owner.id] || []).push(d.id);
  });
  const known = new Set(users.map((u) => u.uid)), seen = {};
  const lost = Object.keys(keysOf).concat(Object.keys(profiles)).filter((id) => { if (known.has(id) || seen[id]) return false; seen[id] = 1; return true; });
  const ids = users.map((u) => u.uid).concat(lost), prefs = {};
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => ctx.db.collection('users').doc(id).collection('backup').doc('prefs'));
    (await ctx.db.getAll(...refs)).forEach((s, j) => { prefs[ids[i + j]] = s.exists; });
  }
  const row = (uid, extra) => {
    const keys = (keysOf[uid] || []).slice().sort(), p = profiles[uid] || null;
    return Object.assign({ uid: uid, nick: p && p.nm ? String(p.nm) : '', mascot: p && p.mc ? String(p.mc) : '', days: keys.length, first: keys[0] || '', last: keys[keys.length - 1] || '',
      prefs: !!prefs[uid], friends: friends[uid] || [], orphan: false }, extra);
  };
  const rows = users.map((u) => row(u.uid, { login: loginOf(u), anon: !u.email && !(u.providerData || []).length, disabled: !!u.disabled, created: msOf(u.metadata && u.metadata.creationTime),
    seen: Math.max(msOf(u.metadata && u.metadata.lastRefreshTime), msOf(u.metadata && u.metadata.lastSignInTime)) }));
  lost.forEach((uid) => { rows.push(row(uid, { login: LOST_LOGIN, anon: false, disabled: false, created: 0, seen: 0, orphan: true })); });
  return rows;
}
export function formatRows(rows, opts) {
  opts = opts || {};
  const nickOf = {};
  rows.forEach((r) => { nickOf[r.uid] = r.nick; });
  let list = rows.slice().sort((a, b) => b.seen - a.seen);
  const empty = list.filter((r) => !r.days && !r.nick && !r.prefs && !(r.friends.length)).length;
  if (!opts.all) list = list.filter((r) => r.days || r.nick || r.prefs || r.friends.length);
  if (opts.name) { const f = fold(opts.name); list = list.filter((r) => fold(r.nick).indexOf(f) >= 0); }
  const out = [];
  list.forEach((r, i) => {
    out.push((i + 1) + ') ' + (r.nick || '(sem apelido)') + (r.disabled ? '  [DESATIVADA]' : '') + '  ·  ' + r.login);
    out.push('   ' + (r.days ? plural(r.days, 'dia', 'dias') + ' de registro (' + dayBr(r.first) + ' a ' + dayBr(r.last) + ')' : 'sem registros na nuvem') +
      '  ·  ajustes guardados: ' + (r.prefs ? 'sim' : 'não') + '  ·  amigos: ' + r.friends.length + '  ·  visto em ' + when(r.seen));
    if (opts.friends) out.push('   amigos: ' + (r.friends.map((u) => nickOf[u] || u.slice(0, 8) + '…').join(', ') || '-'));
    out.push('   uid: ' + r.uid);
  });
  if (!opts.all && !opts.name && empty) out.push('', '(' + plural(empty, 'conta vazia omitida', 'contas vazias omitidas') + '; --all mostra)');
  if (!list.length) out.push('Nenhuma conta encontrada' + (opts.name ? ' com o apelido "' + opts.name + '"' : '') + '.');
  return out.join('\n');
}
const candidates = (hit) => hit.map((r) => '  ' + r.uid + '  ' + (r.nick || '(sem apelido)') + '  ·  ' + r.login + '  ·  ' + plural(r.days, 'dia', 'dias') + (r.seen ? '  ·  visto ' + agoText(r.seen) : '')).join('\n');
// Acha UMA conta pelo uid inteiro, pelo começo do uid (8+ letras) ou pelo apelido nos Amigos (3+ letras). Se houver QUALQUER dúvida (o apelido
// serve para mais de uma conta, mesmo que um deles seja igual e os outros só parecidos), lista as candidatas e para: nunca chuta.
// opts.exact: só aceita o uid inteiro (é o que o --apply exige: a prévia mostra o uid, e o que se grava é exatamente aquele).
export async function resolveUser(ctx, ref, rows, opts) {
  opts = opts || {};
  const q = String(ref || '').trim();
  if (!q) die('Faltou dizer qual conta (o uid ou o apelido).');
  const list = rows || await snapshot(ctx);
  let hit = list.filter((r) => r.uid === q);
  if (opts.exact && !hit.length) {
    die('Para gravar (--apply) use o uid inteiro da conta, igual ao que a prévia mostrou' + (list.some((r) => r.uid.indexOf(q) === 0 || fold(r.nick).indexOf(fold(q)) >= 0)
      ? ' (o apelido e o começo do uid só servem para a prévia: eles podem apontar para outra conta).' : '. Não achei nenhuma conta com o uid "' + q + '".'));
  }
  if (!hit.length && q.length >= 8) hit = list.filter((r) => r.uid.indexOf(q) === 0);
  if (!hit.length) {
    const f = fold(q);
    if (f.length < 3) die('Para achar por apelido, use pelo menos 3 letras ("' + q + '" é curto demais). Ou use o uid: veja com   node scripts/admin/inspect.mjs --all');
    hit = list.filter((r) => fold(r.nick).indexOf(f) >= 0);
  }
  if (!hit.length) die('Não achei nenhuma conta para "' + q + '". Veja as contas com:  node scripts/admin/inspect.mjs --all');
  if (hit.length > 1) die('"' + q + '" serve para mais de uma conta. Use o uid inteiro de uma destas:\n' + candidates(hit));
  return hit[0];
}

/* ---------- ligar um e-mail à conta antiga (recuperação) ---------- */
export const normMail = cleanEmail;
export const validMail = validEmail;
const authCode = (e) => (e && e.code) || String(e);
// Só olha: devolve o que seria feito e o que impede. problems = impede; warnings = só avisa.
export async function planAttach(ctx, ref, rawEmail, opts) {
  opts = opts || {};
  const email = normMail(rawEmail);
  if (!validMail(email)) die('Esse e-mail não parece certo: "' + String(rawEmail || '').trim() + '". Confira se não falta algo (o "@", o ponto do final).');
  const rows = await snapshot(ctx);
  const row = await resolveUser(ctx, ref, rows, { exact: !!opts.exactUid });
  let user = null;
  if (!row.orphan) {
    try { user = await ctx.auth.getUser(row.uid); } catch (e) { if (authCode(e) === 'auth/user-not-found') die('O login da conta ' + row.uid + ' sumiu agora há pouco. Rode a prévia de novo.'); throw e; }
  }
  const nickOf = {};
  rows.forEach((r) => { nickOf[r.uid] = r.nick; });
  const plan = { uid: row.uid, email: email, nick: row.nick, days: row.days, first: row.first, last: row.last, created: row.created, seen: row.seen, orphan: !!row.orphan,
    friends: row.friends.map((u) => nickOf[u] || u.slice(0, 8) + '…'), providers: user ? (user.providerData || []).map((p) => p.providerId) : [], current: user ? user.email || '' : '',
    problems: [], warnings: [], conflict: null, noop: false, login: row.login };
  if (String(rawEmail || '').trim().toLowerCase() !== email) plan.warnings.push('O e-mail digitado tinha espaços ou caracteres invisíveis (vêm do copiar e colar); vou usar: ' + email);
  if (row.orphan) {
    if (!opts.recreateLogin) plan.problems.push('O login desta conta não existe mais no Firebase (só restam os dados). Se é essa mesmo, repita com --recreate-login: ele recria o login com o MESMO uid e este e-mail.');
    else plan.warnings.push('O login desta conta será RECRIADO com o mesmo uid (os registros, os amigos e a turma continuam ligados a ele).');
  }
  if (user && user.disabled) plan.warnings.push('A conta está DESATIVADA no Firebase: mesmo com o e-mail, ela não conseguirá entrar até ser reativada.');
  // Só contas anônimas (ou com um e-mail ainda sem senha) são o alvo. E-mail e senha com o MESMO e-mail passa como "já ligado" (serve para conferir de
  // novo depois de um --with-temp-password); com outro e-mail só com --replace; Google e afins nunca.
  const other = plan.providers.filter((p) => p !== 'password'), hasPw = plan.providers.length > other.length;
  const sameMail = !!(user && user.email && user.email.toLowerCase() === email);
  if (other.length) plan.problems.push('Esta conta já tem login (' + other.join(', ') + '): quem a usa já consegue entrar com o próprio e-mail. Este comando serve só para contas anônimas.');
  else if (sameMail) plan.noop = true;
  else if (user && user.email && !opts.replace) {
    plan.problems.push(hasPw
      ? 'Esta conta já tem login por e-mail e senha (' + maskEmail(user.email) + '). Se a pessoa criou a conta sozinha, ela consegue entrar; se esse e-mail foi ligado por engano (com --with-temp-password), use --replace.'
      : 'Esta conta já tem o e-mail ' + maskEmail(user.email) + '. Para trocar mesmo assim, use --replace.');
  }
  let found = null;
  try { found = await ctx.auth.getUserByEmail(email); } catch (e) { if (authCode(e) !== 'auth/user-not-found') throw e; }
  if (found && found.uid !== row.uid) {
    const o = rows.find((r) => r.uid === found.uid);
    plan.conflict = { uid: found.uid, days: o ? o.days : 0, created: o ? o.created : 0, login: o ? o.login : '' };
    plan.problems.push('Este e-mail já pertence a OUTRA conta (uid ' + found.uid + ', criada em ' + when(plan.conflict.created) + ', ' + plural(plan.conflict.days, 'dia', 'dias') +
      '): provavelmente a pessoa já criou uma conta nova no aparelho novo. Os registros da conta antiga podem ser copiados para ela com:\n   node scripts/admin/migrate-days.mjs ' +
      row.uid + ' ' + found.uid);
  }
  if (!row.days && !opts.evenEmpty) plan.problems.push('Esta conta não tem nenhum registro na nuvem: pode ser o uid errado. Se é essa mesmo, repita com --even-empty.');
  if (!row.prefs) plan.warnings.push('Não há ajustes guardados (a conta antiga nunca teve e-mail): na entrada o app restaura os registros, os horários e o apelido, e pede de novo o peso e a atividade.');
  return plan;
}
export function describeAttach(plan, now) {
  const l = [];
  l.push('Conta:     ' + (plan.nick || '(sem apelido)') + '  ·  ' + plan.login);
  l.push('uid:       ' + plan.uid);
  l.push('Criada em: ' + when(plan.created) + '   ·   usada pela última vez: ' + (plan.seen ? when(plan.seen) + ' (' + agoText(plan.seen, now) + ')' : '-'));
  l.push('Amigos:    ' + (plan.friends.length ? plan.friends.length + ' (' + plan.friends.join(', ') + ')' : 'nenhum'));
  l.push('Registros na nuvem: ' + (plan.days ? plural(plan.days, 'dia', 'dias') + ' (' + dayBr(plan.first) + ' a ' + dayBr(plan.last) + ')' : 'nenhum'));
  l.push('E-mail a ligar: ' + plan.email + (plan.noop ? '   (já está ligado)' : ''));
  plan.warnings.forEach((w) => { l.push('Atenção:   ' + w); });
  plan.problems.forEach((p) => { l.push('NÃO DÁ:     ' + p); });
  return l.join('\n');
}
// O comando exato que grava o que a prévia mostrou: com o uid inteiro (nunca o apelido) e as mesmas opções
export function applyCommand(plan, opts) {
  opts = opts || {};
  return 'node scripts/admin/attach-email.mjs ' + plan.uid + ' ' + plan.email + ' --apply' + (opts.evenEmpty ? ' --even-empty' : '') + (opts.replace ? ' --replace' : '') +
    (opts.tempPassword ? ' --with-temp-password' : '') + (opts.recreateLogin ? ' --recreate-login' : '') + (opts.forgetDevices ? ' --forget-devices' : '');
}
// Liga o e-mail ao MESMO uid (registros, amigos e turma ficam onde estão) e confere que o Firebase reconhece o e-mail para redefinir a senha
// (o link gerado na conferência é descartado: nunca é mostrado nem enviado). Com tempPassword, a conta ganha também uma senha aleatória que
// ninguém conhece (não é mostrada nem guardada): só para o caso de o Firebase não reconhecer e-mail sem senha na redefinição.
// Com recreateLogin (conta sem login, só dados), o login é criado de novo com o mesmo uid. Com forgetDevices, os avisos push do aparelho antigo
// (users/{uid}.fcm) saem: o aparelho novo registra o dele quando a pessoa ligar os lembretes.
export async function applyAttach(ctx, plan, opts) {
  opts = opts || {};
  if (plan.problems.length) die('Não posso aplicar: ' + plan.problems[0].split('\n')[0]);
  const patch = {};
  if (!plan.noop) { patch.email = plan.email; patch.emailVerified = false; }
  if (opts.tempPassword) patch.password = randomBytes(24).toString('base64url');
  try {
    if (plan.orphan) await ctx.auth.createUser(Object.assign({ uid: plan.uid }, patch.email ? patch : { email: plan.email, emailVerified: false }));
    else if (Object.keys(patch).length) await ctx.auth.updateUser(plan.uid, patch);
  } catch (e) {
    const c = authCode(e);
    if (c === 'auth/email-already-exists') die('Este e-mail passou a pertencer a OUTRA conta depois da prévia (alguém acabou de criá-la). Nada foi alterado. Rode a prévia de novo.');
    if (c === 'auth/uid-already-exists') die('O login desta conta já existe de novo. Nada foi alterado. Rode a prévia de novo.');
    if (c === 'auth/user-not-found') die('O login desta conta não existe mais. Nada foi alterado. Rode a prévia de novo.');
    die('O Firebase recusou a gravação (' + c + '). Nada foi alterado: confira e repita o comando.');
  }
  const after = await ctx.auth.getUser(plan.uid);
  if (after.uid !== plan.uid || (after.email || '').toLowerCase() !== plan.email) die('Conferi depois de gravar e o e-mail não ficou como esperado (uid ' + after.uid + ', e-mail ' + maskEmail(after.email) + '). Nada mais foi feito.');
  let forgot = 0;
  if (opts.forgetDevices) {
    const ref = ctx.db.collection('users').doc(plan.uid), s = await ref.get(), f = s.exists ? s.get('fcm') : null;
    forgot = f && typeof f === 'object' ? Object.keys(f).length : 0;
    if (forgot) await ref.update({ fcm: ctx.FieldValue.delete() });
  }
  const check = { ok: false, code: '' };
  try { await ctx.auth.generatePasswordResetLink(plan.email); check.ok = true; } catch (e) { check.code = authCode(e); }
  return { uid: after.uid, email: after.email, providers: (after.providerData || []).map((p) => p.providerId), check: check, tempPassword: !!opts.tempPassword, recreated: !!plan.orphan, forgot: forgot };
}
export function instructions(plan) {
  return [
    'Agora, no celular novo da pessoa (com o Maré já instalado na Tela de Início, na versão 1.3.0 ou mais nova):',
    '  1. Na tela de boas-vindas, tocar em "Entrar na conta" (fica logo abaixo do botão "Começar"). NÃO tocar em "Começar" nem em "Criar conta".',
    '     (Se ela já tinha passado das boas-vindas: Ajustes → "Já tenho conta". Isso apaga o que houver no aparelho novo, que ainda não vale nada.)',
    '  2. Tocar em "Esqueci a senha", digitar ' + plan.email + ' e "Enviar o link".',
    '  3. Abrir o e-mail (olhar também o spam), tocar no link e criar a senha dela. Eu não vejo nem guardo a senha.',
    '  4. Voltar ao Maré, tocar em "Já criei a senha, entrar" e entrar com o e-mail e a senha nova: os registros, os amigos e a turma voltam.',
  ].join('\n');
}

/* ---------- plano B: copiar os registros de uma conta para outra ---------- */
const entryKey = (e) => (e && e.id ? String(e.id) : JSON.stringify(e));
// Junta os dois lados de um dia. O DESTINO vem primeiro: se o mesmo registro (mesmo id) existe nos dois, vale a versão do destino. A marca de
// alteração (u) vai para agora (nunca menor que a de nenhum dos lados): o app só adota um dia da nuvem quando o u dele é MAIOR que o do aparelho,
// e o aparelho do destino costuma ter o u mais novo; com o u antigo ele ignoraria a união e a apagaria na próxima vez que mexesse naquele dia.
export function mergeDay(a, b, now) {
  const seen = {}, entries = [];
  (b.entries || []).concat(a.entries || []).forEach((e) => {
    const k = entryKey(e);
    if (!seen[k]) { seen[k] = 1; entries.push(e); }
  });
  entries.sort((x, y) => (+x.t || 0) - (+y.t || 0));
  const goal = b.goal || a.goal || 2000;
  return { goal: goal, entries: entries, u: Math.max(a.u || 0, b.u || 0, now || Date.now()) };
}
// O destino já tem todos os registros do dia da origem? (Então não há o que copiar, e rodar de novo não regrava nada.)
const holds = (b, a) => { const have = {}; (b.entries || []).forEach((e) => { have[entryKey(e)] = 1; }); return (a.entries || []).every((e) => have[entryKey(e)]); };
export async function planMigrate(ctx, fromRef, toRef, opts) {
  opts = opts || {};
  const rows = await snapshot(ctx);
  const from = await resolveUser(ctx, fromRef, rows, { exact: !!opts.exactUid }), to = await resolveUser(ctx, toRef, rows, { exact: !!opts.exactUid });
  if (from.uid === to.uid) die('A origem e o destino são a mesma conta.');
  if (to.orphan) die('O destino (' + to.uid + ') não tem login: ninguém consegue entrar nele. Escolha uma conta com login como destino.');
  const A = await daysMap(ctx.db, from.uid), B = await daysMap(ctx.db, to.uid);
  const nickOf = {};
  rows.forEach((r) => { nickOf[r.uid] = r.nick; });
  const plan = { from: from, to: to, copy: [], merge: [], same: [], docs: {}, pre: {}, bad: 0 };
  Object.keys(A).sort().forEach((k) => {
    plan.bad += A[k].bad;
    if (!B[k]) { plan.copy.push(k); plan.docs[k] = A[k]; }
    else if (holds(B[k], A[k])) plan.same.push(k);
    else { plan.merge.push(k); plan.docs[k] = mergeDay(A[k], B[k]); plan.pre[k] = B[k].ut; }
  });
  return plan;
}
export function describeMigrate(plan, now) {
  const side = (r, tag) => tag + (r.nick || '(sem apelido)') + '  ·  ' + r.login + '  ·  ' + plural(r.days, 'dia', 'dias') + '  ·  uid ' + r.uid +
    (r.seen ? '  ·  usada ' + agoText(r.seen, now) : '');
  return [side(plan.from, 'De:    '), side(plan.to, 'Para:  '),
    plural(plan.copy.length, 'dia será copiado', 'dias serão copiados') + ', ' + plural(plan.merge.length, 'dia será juntado (os dois lados tinham registros)', 'dias serão juntados (os dois lados tinham registros)') +
    ', ' + plural(plan.same.length, 'dia já estava completo no destino', 'dias já estavam completos no destino') + '.',
    plan.bad ? 'Atenção: ' + plural(plan.bad, 'registro ilegível na origem ficou de fora', 'registros ilegíveis na origem ficaram de fora') + '.' : '',
    'Quando um registro existe nos dois lados, vale o do destino. Não vai junto: amigos e turma (a pessoa refaz pelo código do convite); nada é apagado na conta de origem.']
    .filter(Boolean).join('\n');
}
export function migrateCommand(plan) { return 'node scripts/admin/migrate-days.mjs ' + plan.from.uid + ' ' + plan.to.uid + ' --apply'; }
// Grava no destino. Dia que o destino não tinha: create() (se alguém o criou nesse meio tempo, o lote falha em vez de pisar nele). Dia juntado:
// update() só se o documento continua como a prévia o leu (lastUpdateTime). Um lote que falha não grava nada; os anteriores já valeram, e repetir o
// comando recalcula e continua de onde parou (rodar de novo não duplica).
export async function applyMigrate(ctx, plan) {
  const keys = plan.copy.concat(plan.merge).sort(), isCopy = new Set(plan.copy), now = Date.now();
  const col = ctx.db.collection('users').doc(plan.to.uid).collection('days');
  let done = 0;
  for (let i = 0; i < keys.length; i += 400) {
    const b = ctx.db.batch(), part = keys.slice(i, i + 400);
    part.forEach((k) => {
      const d = plan.docs[k], data = { goal: d.goal, total: dayTotal(d), entries: d.entries, u: isCopy.has(k) ? (d.u || now) : Math.max(d.u || 0, now), updatedAt: ctx.FieldValue.serverTimestamp() };
      if (isCopy.has(k)) b.create(col.doc(k), data); else b.update(col.doc(k), data, { lastUpdateTime: plan.pre[k] });
    });
    try { await b.commit(); } catch (e) {
      const c = e && (e.code !== undefined ? e.code : e.message);
      if (c === 6 || c === 9 || c === 5 || /ALREADY_EXISTS|FAILED_PRECONDITION|NOT_FOUND|already exists|no longer|not found/i.test(String(e && e.message))) {
        die('O destino mudou durante a cópia (alguém registrou algo agora). ' + (done ? plural(done, 'dia já foi gravado', 'dias já foram gravados') + ' antes disso; ' : 'Nada foi gravado. ') +
          'É seguro repetir o comando: ele recalcula e continua de onde parou.');
      }
      die('A gravação parou (' + (c || 'erro') + '). ' + (done ? plural(done, 'dia já foi gravado', 'dias já foram gravados') + '. ' : 'Nada foi gravado. ') + 'É seguro repetir o comando.');
    }
    done += part.length;
  }
  return done;
}
