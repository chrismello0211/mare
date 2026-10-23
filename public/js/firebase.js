// Maré — nuvem opcional (Parte 4): login (anônimo, ou com e-mail e senha desde a 1.3.0), cópia dos dados no Firestore e token de push (FCM).
// O app.js só carrega este arquivo se FIREBASE_ENABLED = true. Qualquer falha aqui deixa o app 100% local.
// Contrato: initCloud(hooks) → Promise<cloud>; hooks = { state, onRemote, onStatus, onPrefs } (ver adendo da Parte 3 no HANDOFF).
// cloud = { uid, acct, social(cache), push, syncDays, syncMeta, syncPrefs, enablePush, flush, afterLink, detach, dispose, wipe, resync }; cloud.social() devolve a camada
// de amigos (social-cloud.js). syncMeta() também leva a escolha "Avisos dos amigos" (S.social.push) para users/{uid}.social.push, que a função
// onFriendship consulta (alerts-sync.js).
// Conta (1.3.0): accountKit() → { current, check, create, signIn, signOut, reset, resend, refresh, reauth, deleteUser, fetchData } fala só com o login
// (e, em fetchData, lê a conta no Firestore); funciona ANTES do onboarding, para quem chega num aparelho novo e toca em "Já tenho conta".
// hooks (1.3.0) também aceita onEnded(): o login da conta sumiu com o app aberto (a senha foi trocada em outro lugar, a conta foi desativada…).
import { firebaseConfig, VAPID_KEY, USE_EMULATORS } from './firebase-config.js';
import { dayKey, dayTotal, dayWater, goalToday, streak, bestStreak, levelFor, hash } from './core.js';
import { createAlertsSync } from './alerts-sync.js';
import { prefsPack, prefsParse, cleanAcct, ACCT_KEY, MARK_KEY } from './account.js';

// Confirme a versão mais recente nas notas de versão do Firebase JS SDK e teste antes de trocar. Versões novas podem
// exigir navegadores mais recentes: se o import falhar num aparelho antigo, a nuvem só fica desligada nele.
const V = '10.14.1';
const CDN = 'https://www.gstatic.com/firebasejs/' + V + '/';
const MARK = MARK_KEY; // 'mare:cloud' = { uid, pullAt, pushAt, fcm, social, pu, ph }: o que já foi trocado com a nuvem neste aparelho (pu/ph: ajustes da conta)
let emulated = false, emulatedCheck = false; // os emuladores (só em desenvolvimento) se conectam uma vez por login: o SDK recusa uma segunda

function readMark() { try { return JSON.parse(localStorage.getItem(MARK) || '{}') || {}; } catch (e) { return {}; } }
function readHint() { try { return cleanAcct(JSON.parse(localStorage.getItem(ACCT_KEY) || 'null')); } catch (e) { return null; } }
const fail = (code) => { const e = new Error(code); e.code = code; return e; };
const timeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => { rej(fail('mare/slow')); }, ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});
const who = (u) => (u ? { uid: u.uid, email: u.email || '', verified: !!u.emailVerified, anon: !!u.isAnonymous } : null);
const hasAcct = (u) => !!(u && !u.isAnonymous && u.email);

// Os módulos do SDK são baixados uma vez só e compartilhados entre o login por e-mail (accountKit) e a nuvem (initCloud). O app, o login e o Firestore
// são pegos a cada chamada: o SDK devolve sempre os mesmos (a segunda tentativa de iniciar cai no catch e pega a instância existente).
// (O app pode religar a nuvem depois de uma falha, por exemplo sem internet ao abrir: o SDK só aceita iniciar o login uma vez, então
// quem chama de novo pega o mesmo login em vez de falhar para sempre.)
let modsP = null;
function loadMods() {
  if (!modsP) {
    modsP = Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js')])
      .catch((e) => { modsP = null; throw e; }); // sem rede: a próxima chamada tenta baixar de novo
  }
  return modsP;
}
async function loadKit() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) throw new Error('firebase-config.js incompleto');
  const mods = await loadMods();
  const A = mods[0], AU = mods[1], FS = mods[2];
  const app = A.initializeApp(firebaseConfig);
  // initializeAuth sem popup/redirect: mais leve. Ao ligar login Google/Apple, inclua browserPopupRedirectResolver.
  let auth;
  try { auth = AU.initializeAuth(app, { persistence: [AU.indexedDBLocalPersistence, AU.browserLocalPersistence] }); }
  catch (e) { auth = AU.getAuth(app); }
  try { auth.languageCode = 'pt-BR'; } catch (e) { /* os e-mails do login (confirmar e-mail, redefinir senha) saem em português */ }
  let db;
  try { db = FS.initializeFirestore(app, { localCache: FS.persistentLocalCache({ tabManager: FS.persistentMultipleTabManager() }) }); }
  catch (e) { db = FS.getFirestore(app); } // sem IndexedDB (ex.: aba privada): cache só em memória
  if (USE_EMULATORS && !emulated && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    emulated = true;
    AU.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    FS.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { A: A, AU: AU, FS: FS, app: app, auth: auth, db: db };
}

/* ---------- conta (e-mail e senha) ---------- */
// Cada operação devolve o que a tela precisa ({ uid, email, verified, anon }) ou lança um erro com .code ('auth/…', 'mare/…', 'permission-denied'…),
// que o app traduz com authText (account.js). Nada aqui guarda nem repete a senha.
export async function accountKit() {
  const k = await loadKit(), A = k.A, AU = k.AU, FS = k.FS, auth = k.auth, db = k.db;
  // espera o login do aparelho ser lido do armazenamento (logo depois de abrir o app, currentUser ainda pode estar vazio)
  const ready = () => timeout(new Promise((res) => { const off = AU.onAuthStateChanged(auth, () => { off(); res(); }); }), 10000);
  const soft = async (p) => { try { return await p; } catch (e) { if (e && (e.code === 'permission-denied' || e.code === 'not-found')) return null; throw e; } };
  return {
    current: () => who(auth.currentUser),
    // Confere e-mail e senha SEM mexer no login deste aparelho: entra num segundo "app" do Firebase, que só existe na memória, e sai em seguida.
    // Quem vai trocar de conta (e apagar o que há aqui) só segue depois de saber que a senha serve. Devolve { uid, email, verified, anon }.
    async check(email, pw) {
      let app2;
      try { app2 = A.getApp('mare-check'); } catch (e) { app2 = A.initializeApp(firebaseConfig, 'mare-check'); }
      let auth2;
      try { auth2 = AU.initializeAuth(app2, { persistence: AU.inMemoryPersistence }); } catch (e) { auth2 = AU.getAuth(app2); }
      if (USE_EMULATORS && !emulatedCheck && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        emulatedCheck = true;
        AU.connectAuthEmulator(auth2, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
      const r = await AU.signInWithEmailAndPassword(auth2, email, pw);
      const out = who(r.user);
      try { await AU.signOut(auth2); } catch (e) { /* só existe na memória */ }
      return out;
    },
    // Criar a conta = vincular e-mail e senha ao login anônimo do aparelho. O uid NÃO muda: registros, amigos e turma ficam como estavam.
    async create(email, pw) {
      await ready();
      const u = auth.currentUser;
      if (!u) throw fail('mare/no-session');
      if (!u.isAnonymous) throw fail('auth/provider-already-linked');
      const r = await AU.linkWithCredential(u, AU.EmailAuthProvider.credential(email, pw));
      // A dica local da conta é gravada JÁ, sem esperar ninguém: se o app fechar agora, o próximo começo reconhece a conta (sem a dica, um login com
      // e-mail que o aparelho não conhece é descartado, e o aparelho viraria outra pessoa na nuvem).
      try { localStorage.setItem(ACCT_KEY, JSON.stringify({ uid: r.user.uid, email: String(r.user.email || '').toLowerCase(), verified: !!r.user.emailVerified })); } catch (e) { /* o app grava de novo em seguida */ }
      try { await AU.sendEmailVerification(r.user); } catch (e) { /* o e-mail de confirmação é um extra: a conta já existe (dá para reenviar depois) */ }
      try { await r.user.getIdToken(true); } catch (e) { /* o token novo (com a claim "email") vem na próxima renovação */ }
      return who(r.user);
    },
    async signIn(email, pw) {
      await ready();
      const r = await AU.signInWithEmailAndPassword(auth, email, pw);
      return who(r.user);
    },
    async signOut() { await AU.signOut(auth); },
    // Sem actionCodeSettings de propósito: a página de redefinição é a do próprio Firebase, que não exige cadastrar o endereço do app
    async reset(email) { await ready(); await AU.sendPasswordResetEmail(auth, email); },
    async resend() {
      await ready();
      const u = auth.currentUser;
      if (!hasAcct(u)) throw fail('mare/no-session');
      try { await u.reload(); } catch (e) { /* segue com o que já se sabe */ }
      if (!u.emailVerified) await AU.sendEmailVerification(u);
      return who(u);
    },
    // O e-mail foi confirmado (a pessoa tocou no link do e-mail)? Só consulta; devolve null se não houver login.
    async refresh() {
      await ready();
      const u = auth.currentUser;
      if (!u) return null;
      try { await u.reload(); } catch (e) { return Object.assign(who(u), { error: (e && e.code) || 'unknown' }); }
      return who(u);
    },
    async reauth(pw) {
      await ready();
      const u = auth.currentUser;
      if (!hasAcct(u)) throw fail('mare/no-session');
      await AU.reauthenticateWithCredential(u, AU.EmailAuthProvider.credential(u.email, pw));
    },
    // Sem login não há o que apagar: diz isso em vez de "dar certo" (quem chama acabaria dizendo que a conta foi excluída)
    async deleteUser() { const u = auth.currentUser; if (!u) throw fail('mare/no-session'); await AU.deleteUser(u); },
    // Tudo o que a conta guarda na nuvem, para um aparelho novo que acabou de entrar: ajustes (prefs), users/{uid}, perfil dos amigos e TODOS os
    // registros. Os três primeiros são opcionais (o administrador pode ter criado a conta de uma pessoa que nunca gravou ajustes, ou as regras
    // novas ainda não estarem no ar): uma recusa de permissão ou a falta do documento vira null. Os registros e a falta de internet não: falham.
    // Também grava a marca de sincronização deste aparelho, para a nuvem não baixar tudo de novo nem enviar tudo de volta ao ligar.
    async fetchData() {
      await ready();
      const u = auth.currentUser;
      if (!u) throw fail('mare/no-session');
      // Sempre do servidor: sem internet a leitura FALHA (em vez de voltar vazia do cache e parecer uma conta sem registros)
      const uid = u.uid, one = (ref) => soft(FS.getDocFromServer(ref).then((s) => (s.exists() ? s.data() : null)));
      const read = () => timeout(Promise.all([
        one(FS.doc(db, 'users', uid, 'backup', 'prefs')), one(FS.doc(db, 'users', uid)), one(FS.doc(db, 'profiles', uid)),
        FS.getDocsFromServer(FS.collection(db, 'users', uid, 'days')),
      ]), 25000);
      // Logo depois de entrar, a conexão do Firestore pode ainda estar com o login anterior (o anônimo): a leitura dos registros é recusada.
      // Reinicia a conexão (ela passa a usar o login novo) e lê de novo, UMA vez; se continuar recusada, o erro segue para a tela ("tentar de novo").
      let out;
      try { out = await read(); } catch (e) {
        if (!e || e.code !== 'permission-denied') throw e;
        try { await timeout(FS.disableNetwork(db).then(() => FS.enableNetwork(db)), 8000); } catch (e2) { /* tenta ler mesmo assim */ }
        out = await read();
      }
      const days = {};
      let maxAt = 0;
      out[3].forEach((d) => {
        const x = d.data(), t = x.updatedAt && x.updatedAt.toMillis ? x.updatedAt.toMillis() : 0;
        days[d.id] = { goal: x.goal, entries: x.entries || [], u: x.u || 0 };
        if (t > maxAt) maxAt = t;
      });
      const pr = prefsParse(out[0]), us = out[1], mk = { uid: uid, pullAt: maxAt, pushAt: Date.now(), fcm: '', pu: pr ? pr.u : 0, ph: 0 };
      if (us && us.social && typeof us.social === 'object') mk.social = { push: us.social.push !== false, hit: us.social.hit === true, week: us.social.week !== false };
      try { localStorage.setItem(MARK, JSON.stringify(mk)); } catch (e) { /* ignora */ }
      return { uid: uid, prefs: out[0], user: us, profile: out[2], days: days };
    },
  };
}

/* ---------- nuvem ---------- */
export async function initCloud(hooks) {
  const k = await loadKit(), AU = k.AU, FS = k.FS, auth = k.auth, db = k.db, app = k.app;
  const hint = readHint();
  // O login que este aparelho pode usar é o que combina com o que ele sabe de si: com conta (dica), só o login DESSA conta; sem conta, só o anônimo.
  // Qualquer outro que o armazenamento do navegador ainda guarde (uma saída que não terminou, uma entrada que ficou pela metade) não é deste
  // estado do aparelho: é descartado, para nunca misturar os registros daqui com os de outra conta.
  const mine = (u) => (hint ? !u.isAnonymous && u.uid === hint.uid : u.isAnonymous);
  const user = await timeout(new Promise((res, rej) => {
    let off = null, signing = false;
    off = AU.onAuthStateChanged(auth, (u) => {
      if (u && mine(u)) { if (off) off(); res(u); }
      else if (u) AU.signOut(auth).catch(() => {}); // outro login: sai (o ouvinte volta, agora sem login, e cai num dos dois casos abaixo)
      // Este aparelho TINHA uma conta e o login sumiu (a senha foi trocada em outro lugar, a conta foi desativada…): NÃO cria um login anônimo
      // novo por baixo dos panos, porque isso faria o aparelho virar outra pessoa na nuvem (amigos, turma e registros ficariam para trás).
      // O app avisa e pede para entrar de novo.
      else if (hint) { if (off) off(); rej(fail('mare/session-ended')); }
      else if (!signing) { signing = true; AU.signInAnonymously(auth).catch(rej); }
    }, rej);
  }), 20000);

  const uid = user.uid, uref = FS.doc(db, 'users', uid), days = FS.collection(db, 'users', uid, 'days'), prefsRef = FS.doc(db, 'users', uid, 'backup', 'prefs');
  let mark = readMark(), pending = {}, metaDirty = false, prefsDirty = false, timer = 0, wiping = false, disposed = false, acctOn = hasAcct(user), retried = false;
  // prefsReady: já se sabe o que a nuvem guarda de ajustes (só importa para quem tem conta): antes disso os ajustes DESTE aparelho não sobem, senão
  // os de outro aparelho, mais novos, seriam pisados. pushLost: um envio de registros foi recusado (regra, cota…): a marca de "enviado até" fica em
  // zero e o próximo começo do app reenvia tudo. writes: os envios de registros ainda sem resposta do servidor (o "sair" espera por eles).
  let prefsReady = !acctOn, pushLost = false, writes = [], offAuth = null;
  if (mark.uid !== uid) mark = { uid: uid, pullAt: 0, pushAt: 0, fcm: '' }; // conta nova: envia tudo na primeira vez
  const report = (e) => { console.warn('[nuvem]', e && e.message ? e.message : e); hooks.onStatus('error'); };
  const saveMark = () => { try { localStorage.setItem(MARK, JSON.stringify(mark)); } catch (e) { /* ignora */ } };

  // Com conta: se o login sumir com o app aberto (a senha foi trocada em outro lugar, a conta foi desativada), o app é avisado e passa ao mesmo estado
  // de quando abre sem o login ("Sua conta saiu deste aparelho"). Fora disso as gravações seriam recusadas em silêncio.
  function watchSession() {
    if (offAuth || !hooks.onEnded) return;
    offAuth = AU.onAuthStateChanged(auth, (u) => { if (!u && !disposed && !wiping) hooks.onEnded(); });
  }

  // Escritas não esperam o servidor: com o cache persistente, o Firestore guarda a fila e envia quando houver rede. A marca "enviado até" só avança se
  // nenhum envio foi recusado; se algum for, volta a zero (e fica), para o próximo começo reenviar o que a nuvem não recebeu.
  function pushDays(keys) {
    const S = hooks.state(), at = Date.now();
    keys = keys.filter((kk) => S.days[kk]);
    for (let i = 0; i < keys.length; i += 400) {
      const b = FS.writeBatch(db);
      keys.slice(i, i + 400).forEach((kk) => {
        const d = S.days[kk];
        b.set(FS.doc(days, kk), { goal: d.goal || goalToday(S, kk), total: dayTotal(d), entries: d.entries || [],
          u: d.u || at, updatedAt: FS.serverTimestamp() });
      });
      const w = b.commit().then(() => {}, (e) => { pushLost = true; mark.pushAt = 0; saveMark(); report(e); });
      writes.push(w);
      w.then(() => { writes = writes.filter((x) => x !== w); });
    }
    if (!pushLost) mark.pushAt = at;
    saveMark();
  }
  function pushMeta() {
    const S = hooks.state(), kd = dayKey(), p = S.profile, r = S.reminders;
    let tz = 'America/Sao_Paulo', totalMl = 0;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* mantém o padrão */ }
    Object.keys(S.days).forEach((d) => { totalMl += dayWater(S.days[d]); }); // litros de água: é o que define o nível (como no app)
    // Sem nome e sem localização: a nuvem recebe só o necessário para lembretes e estatísticas
    const doc = {
      tz: tz, wake: p.wake, sleep: p.sleep, unit: p.unit, goal: goalToday(S, kd), today: { day: kd, ml: dayTotal(S.days[kd]) },
      stats: { streak: streak(S.days, kd), best: bestStreak(S.days), totalMl: totalMl, level: levelFor(totalMl).i },
      updatedAt: FS.serverTimestamp(),
    };
    // Com conta, o mesmo users/{uid} é de TODOS os aparelhos da pessoa. Um aparelho sem push e com os lembretes desligados (um celular novo, por
    // exemplo) não grava "reminder": senão desligaria os lembretes que o outro aparelho ainda usa.
    if (!acctOn || r.enabled || mark.fcm) {
      doc.reminder = { enabled: !!r.enabled, interval: r.interval, smart: !!r.smart, nextAt: r.enabled && r.nextAt ? FS.Timestamp.fromMillis(r.nextAt) : null };
    }
    FS.setDoc(uref, doc, { merge: true }).catch(report);
  }
  // Ajustes da conta (nome, peso, metas, copos, tema, escolhas dos amigos): um documento só, e só se mudou desde a última gravação (ph = marca do
  // texto). Só com conta: as regras do servidor recusam o login anônimo. Se a gravação falhar por permissão logo depois de criar a conta (o
  // fluxo de rede ainda usa o login sem a claim "email"), reinicia a conexão uma vez e tenta de novo.
  function pushPrefs() {
    if (!acctOn || !prefsReady) return;
    const S = hooks.state();
    if (!S.onboarded) return;
    const pack = prefsPack(S, Date.now());
    if (!pack) return;
    const h = hash(pack.j);
    if (mark.ph === h) return;
    mark.ph = h; mark.pu = pack.u; saveMark();
    FS.setDoc(prefsRef, pack).catch((e) => {
      if (mark.ph === h) { mark.ph = 0; saveMark(); } // não chegou: a próxima rodada tenta de novo
      console.warn('[nuvem] ajustes:', e && e.message ? e.message : e);
      if (e && e.code === 'permission-denied' && !retried && !disposed) { retried = true; restartStreams().then(() => { prefsDirty = true; later(); }); }
    });
  }
  // "Avisos dos amigos" (1.1.1): a função onFriendship só avisa quem não desligou a chave (users/{uid}.social.push). Gravada À PARTE de pushMeta
  // e só quando a escolha difere do que o servidor já assume (ligado): ver alerts-sync.js, onde estão as regras e os testes.
  const alerts = createAlertsSync({ FS: FS, uref: uref, state: () => hooks.state(), mark: () => mark, saveMark: saveMark,
    warn: (e) => { console.warn('[nuvem] avisos dos amigos:', e && e.message ? e.message : e); } });
  // Traz só os dias alterados na nuvem desde a última vez
  async function pull() {
    const q = mark.pullAt ? FS.query(days, FS.where('updatedAt', '>', FS.Timestamp.fromMillis(mark.pullAt))) : days;
    const snap = await FS.getDocs(q), out = {};
    let max = mark.pullAt, n = 0;
    snap.forEach((d) => {
      const x = d.data(), t = x.updatedAt && x.updatedAt.toMillis ? x.updatedAt.toMillis() : 0;
      out[d.id] = { goal: x.goal, entries: x.entries || [], u: x.u || 0 };
      if (t > max) max = t;
      n++;
    });
    if (n) hooks.onRemote(out);
    mark.pullAt = max; saveMark();
  }
  // Ajustes mais novos gravados por OUTRO aparelho da mesma conta: o app aplica (sem ligar nem desligar os amigos)
  async function pullPrefs() {
    if (!acctOn || !hooks.onPrefs) return;
    let snap;
    // Sempre do servidor (o cache pode estar velho): sem rede ou sem as regras novas, falha e os ajustes daqui NÃO sobem (prefsReady fica falso)
    try { snap = await FS.getDocFromServer(prefsRef); } catch (e) { return; }
    prefsReady = true; // a nuvem respondeu: se tem ajustes, vêm abaixo; se não tem, os daqui podem subir
    if (!snap.exists()) return;
    const p = prefsParse(snap.data());
    if (!p || p.u <= (mark.pu || 0)) return;
    hooks.onPrefs(p.prefs, p.u);
    const again = prefsPack(hooks.state(), p.u);
    mark.pu = p.u; mark.ph = again ? hash(again.j) : 0; saveMark(); // o que acabou de ser aplicado não precisa voltar para a nuvem
  }
  function flush() {
    clearTimeout(timer);
    if (disposed || wiping) return;
    const keys = Object.keys(pending);
    pending = {};
    if (keys.length) pushDays(keys);
    if (metaDirty) { metaDirty = false; pushMeta(); alerts.push(); }
    if (prefsDirty) {
      prefsDirty = false;
      // ainda não se sabe o que a nuvem guarda: pergunta primeiro e só então envia (uma tentativa por vez; sem rede, fica para a próxima mudança)
      if (acctOn && !prefsReady) pullPrefs().then(() => { if (prefsReady && !disposed) { prefsDirty = true; later(); } }, () => {});
      else pushPrefs();
    }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(flush, 1500); };
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); }; // o app pode ser fechado
  document.addEventListener('visibilitychange', onHide);
  // O Firestore leva o login de quando abriu a conexão: depois de criar a conta (o token ganha a claim "email"), reinicia a conexão
  const restartStreams = async () => { try { await timeout(FS.disableNetwork(db).then(() => FS.enableNetwork(db)), 8000); } catch (e) { /* a próxima conexão já usa o login novo */ } };

  async function enablePush() {
    if (!VAPID_KEY || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return false;
    const M = await import(CDN + 'firebase-messaging.js');
    if (!(await M.isSupported())) return false;
    const reg = await timeout(navigator.serviceWorker.ready, 10000);
    const token = await M.getToken(M.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return false;
    const h = 't' + hash(token).toString(36), upd = {};
    upd['fcm.' + h] = { token: token, ua: String(navigator.userAgent).slice(0, 160), at: FS.serverTimestamp() };
    if (mark.fcm && mark.fcm !== h) upd['fcm.' + mark.fcm] = FS.deleteField(); // token renovado: remove o antigo
    // updateDoc aceita caminho com ponto, mas exige o documento existindo: o setDoc garante isso
    FS.setDoc(uref, { updatedAt: FS.serverTimestamp() }, { merge: true }).then(() => FS.updateDoc(uref, upd)).catch(report);
    mark.fcm = h; saveMark();
    cloud.push = true;
    return true;
  }
  // Amigos (Parte 9): o módulo só é carregado quando alguém usa. Fica guardado aqui para a tela e o wipe() falarem com a mesma instância.
  let socialP = null;
  function social(cacheRaw) {
    if (!socialP) {
      socialP = import('./social-cloud.js').then((m) => m.createSocial({ FS: FS, db: db, uid: uid, cache: cacheRaw }))
        .catch((e) => { socialP = null; throw e; }); // falhou ao carregar (ex.: sem rede): a próxima chamada tenta de novo
    }
    return socialP;
  }
  function dispose() {
    disposed = true; clearTimeout(timer); pending = {}; metaDirty = false; prefsDirty = false; alerts.reset();
    try { document.removeEventListener('visibilitychange', onHide); } catch (e) { /* ignora */ }
    if (offAuth) { try { offAuth(); } catch (e) { /* ignora */ } offAuth = null; }
  }
  // O push deste aparelho (token do FCM): o módulo só é baixado se o aparelho TEM um registro de push, e tudo é limitado no tempo (numa rede meio
  // parada, o download ou a chamada nunca voltariam e a saída ficaria presa). Sem push registrado aqui, não há o que tirar.
  async function dropPush() {
    if (!mark.fcm && !cloud.push) return;
    try { const M = await timeout(import(CDN + 'firebase-messaging.js'), 6000); await timeout(M.deleteToken(M.getMessaging(app)), 6000); } catch (e) { /* sem push, ou sem rede */ }
  }
  // Sair da conta neste aparelho: confere que o primeiro contato com a nuvem terminou e que os registros chegaram (e espera o servidor confirmar), tira o
  // push DESTE aparelho da conta e solta tudo. Quem chama só então encerra o login. Não mexe nos amigos nem apaga nada na nuvem: a conta continua inteira,
  // esperando o próximo login. Lança 'mare/pending' se algum registro não chegou à nuvem (sem internet, envio recusado…): sair assim perderia o que ainda
  // não foi enviado. force = a pessoa aceitou sair mesmo assim: não espera nada (o push deste aparelho ainda é tirado, se a rede deixar).
  async function detach(waitMs, force) {
    const ms = waitMs || 12000;
    if (!force) {
      // Os dias mexidos enquanto a nuvem estava fora (e os que o primeiro contato agenda) só entram na fila depois dele: sem esperar, "sair" não os veria
      try { await timeout(started, ms); } catch (e) { throw fail('mare/pending'); }
    }
    flush();
    if (!force) {
      try { await timeout(Promise.all(writes.slice()), ms); await timeout(FS.waitForPendingWrites(db), ms); } catch (e) { throw fail('mare/pending'); }
      if (pushLost) throw fail('mare/pending'); // um envio foi recusado: esses registros não estão na nuvem
    }
    if (mark.fcm) {
      const upd = {};
      upd['fcm.' + mark.fcm] = FS.deleteField();
      try { await timeout(FS.updateDoc(uref, upd), force ? 3000 : 8000); } catch (e) { /* o documento pode nem existir */ }
    }
    await dropPush();
    try { localStorage.removeItem(MARK); } catch (e) { /* ignora */ }
    dispose();
  }
  // A conta acabou de ser criada neste aparelho (vínculo do e-mail): passa a gravar os ajustes e a conexão ganha o login novo
  async function afterLink() {
    const u = auth.currentUser;
    cloud.acct = who(u);
    acctOn = hasAcct(u);
    prefsReady = true; // conta nova: ainda não há ajustes guardados na nuvem para trazer antes de gravar os daqui
    watchSession();
    await restartStreams();
    prefsDirty = acctOn; metaDirty = true;
    later();
  }
  // opts.social = false: não sai da rede de amigos (quem chama faz isso, e por último). opts.strict = true: lê a lista de registros SÓ do servidor
  // e falha se não der (apagar a conta não pode deixar registros para trás por ter lido um cache velho); sem isso, o servidor primeiro e o cache se a
  // rede não deixar (apagar tudo neste aparelho faz o que dá).
  async function wipe(opts) {
    opts = opts || {};
    wiping = true; clearTimeout(timer); pending = {}; metaDirty = false; prefsDirty = false; alerts.reset();
    try {
      // Antes de tudo, sai da rede de amigos (perfil, convites, amizades). Quem tem os amigos ligados já saiu pelo app (resetAll não apaga
      // nada se isso falhar); aqui fica a garantia para quem nunca entrou ou ainda não tem as regras publicadas: se falhar, o resto segue.
      if (opts.social !== false) { try { await timeout(social(null).then((sc) => sc.leave()), 20000); } catch (e) { /* amigos podem não existir ou estar fora do ar */ } }
      let snap;
      try { snap = await timeout(FS.getDocsFromServer(days), 20000); } catch (e) { if (opts.strict) throw e; snap = await FS.getDocs(days); }
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const b = FS.writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => { b.delete(d.ref); });
        await b.commit();
      }
      try { await FS.deleteDoc(prefsRef); } catch (e) { /* sem ajustes guardados (ou as regras novas ainda não estão no ar) */ }
      await FS.deleteDoc(uref);
      await dropPush();
      mark = { uid: uid, pullAt: 0, pushAt: 0, fcm: '' }; saveMark();
      cloud.push = false;
    } catch (e) {
      mark.pushAt = 0; saveMark(); // a limpeza parou no meio: o que ficou na nuvem está incompleto, e o próximo começo do app reenvia tudo
      throw e;
    } finally { wiping = false; }
  }
  // Reenvia tudo o que este aparelho tem (registros, dados do lembrete e ajustes): usado quando uma limpeza da nuvem não deveria ter acontecido
  function resync() {
    if (wiping || disposed) return;
    Object.keys(hooks.state().days).forEach((kk) => { pending[kk] = 1; });
    metaDirty = true; prefsDirty = acctOn;
    later();
  }

  const cloud = {
    uid: uid,
    acct: who(user),
    social: social,
    push: !!mark.fcm,
    syncDays: (keys) => { if (wiping || disposed) return; (keys || []).forEach((kk) => { pending[kk] = 1; }); later(); },
    syncMeta: () => { if (wiping || disposed) return; metaDirty = true; later(); },
    syncPrefs: () => { if (wiping || disposed || !acctOn) return; prefsDirty = true; later(); },
    enablePush: enablePush,
    flush: flush,
    afterLink: afterLink,
    detach: detach,
    dispose: dispose,
    wipe: wipe,
    resync: resync,
  };
  // Primeiro traz o que mudou na nuvem (registros e, com conta, os ajustes); depois envia o que mudou aqui enquanto ela esteve fora (lista
  // calculada já, antes que um envio novo atualize pushAt)
  const S0 = hooks.state(), since = mark.pushAt;
  const catchUp = Object.keys(S0.days).filter((kk) => !since || (S0.days[kk].u || 0) > since);
  // started: o primeiro contato terminou (deu certo ou não). O "sair" espera por ele: até lá, o que foi mexido com a nuvem fora ainda não está na fila de envio.
  const started = Promise.all([pull().catch(report), pullPrefs().catch(() => {})]).then(() => { catchUp.forEach((kk) => { pending[kk] = 1; }); metaDirty = true; prefsDirty = acctOn; later(); });
  if (acctOn) watchSession();
  hooks.onStatus('on');
  return cloud;
}
