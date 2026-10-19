// Maré — nuvem opcional (Parte 4): login anônimo, cópia dos dados no Firestore e token de push (FCM).
// O app.js só carrega este arquivo se FIREBASE_ENABLED = true. Qualquer falha aqui deixa o app 100% local.
// Contrato: initCloud(hooks) → Promise<cloud>; hooks = { state, onRemote, onStatus } (ver adendo da Parte 3 no HANDOFF).
// cloud = { uid, social(cache), push, syncDays, syncMeta, enablePush, wipe }; cloud.social() devolve a camada de amigos (social-cloud.js).
// syncMeta() também leva a escolha "Avisos dos amigos" (S.social.push) para users/{uid}.social.push, que a função onFriendship consulta (alerts-sync.js).
import { firebaseConfig, VAPID_KEY, USE_EMULATORS } from './firebase-config.js';
import { dayKey, dayTotal, dayWater, goalToday, streak, bestStreak, levelFor, hash } from './core.js';
import { createAlertsSync } from './alerts-sync.js';

// Confirme a versão mais recente nas notas de versão do Firebase JS SDK e teste antes de trocar. Versões novas podem
// exigir navegadores mais recentes: se o import falhar num aparelho antigo, a nuvem só fica desligada nele.
const V = '10.14.1';
const CDN = 'https://www.gstatic.com/firebasejs/' + V + '/';
const MARK = 'mare:cloud'; // { uid, pullAt, pushAt, fcm }: o que já foi trocado com a nuvem neste aparelho
let emulated = false; // os emuladores (só em desenvolvimento) se conectam uma vez: o SDK recusa uma segunda

function readMark() { try { return JSON.parse(localStorage.getItem(MARK) || '{}') || {}; } catch (e) { return {}; } }
const timeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => { rej(new Error('timeout')); }, ms);
  p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});

export async function initCloud(hooks) {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) throw new Error('firebase-config.js incompleto');
  const mods = await Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js')]);
  const A = mods[0], AU = mods[1], FS = mods[2];
  const app = A.initializeApp(firebaseConfig);
  // initializeAuth sem popup/redirect: mais leve. Ao ligar login Google/Apple, inclua browserPopupRedirectResolver.
  // (O app pode religar a nuvem depois de uma falha, por exemplo sem internet ao abrir: o SDK só aceita iniciar o login uma vez, então
  // numa segunda chamada pega o mesmo login em vez de falhar para sempre.)
  let auth;
  try { auth = AU.initializeAuth(app, { persistence: [AU.indexedDBLocalPersistence, AU.browserLocalPersistence] }); }
  catch (e) { auth = AU.getAuth(app); }
  let db;
  try { db = FS.initializeFirestore(app, { localCache: FS.persistentLocalCache({ tabManager: FS.persistentMultipleTabManager() }) }); }
  catch (e) { db = FS.getFirestore(app); } // sem IndexedDB (ex.: aba privada): cache só em memória
  if (USE_EMULATORS && !emulated && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    emulated = true;
    AU.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    FS.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  const user = await timeout(new Promise((res, rej) => {
    let off = null;
    off = AU.onAuthStateChanged(auth, (u) => {
      if (u) { if (off) off(); res(u); } else AU.signInAnonymously(auth).catch(rej);
    }, rej);
  }), 20000);

  const uid = user.uid, uref = FS.doc(db, 'users', uid), days = FS.collection(db, 'users', uid, 'days');
  let mark = readMark(), pending = {}, metaDirty = false, timer = 0, wiping = false;
  if (mark.uid !== uid) mark = { uid: uid, pullAt: 0, pushAt: 0, fcm: '' }; // conta nova: envia tudo na primeira vez
  const report = (e) => { console.warn('[nuvem]', e && e.message ? e.message : e); hooks.onStatus('error'); };
  const saveMark = () => { try { localStorage.setItem(MARK, JSON.stringify(mark)); } catch (e) { /* ignora */ } };

  // Escritas não esperam o servidor: com o cache persistente, o Firestore guarda a fila e envia quando houver rede
  function pushDays(keys) {
    const S = hooks.state(), at = Date.now();
    keys = keys.filter((k) => S.days[k]);
    for (let i = 0; i < keys.length; i += 400) {
      const b = FS.writeBatch(db);
      keys.slice(i, i + 400).forEach((k) => {
        const d = S.days[k];
        b.set(FS.doc(days, k), { goal: d.goal || goalToday(S, k), total: dayTotal(d), entries: d.entries || [],
          u: d.u || at, updatedAt: FS.serverTimestamp() });
      });
      b.commit().catch(report);
    }
    mark.pushAt = at; saveMark();
  }
  function pushMeta() {
    const S = hooks.state(), k = dayKey(), p = S.profile, r = S.reminders;
    let tz = 'America/Sao_Paulo', totalMl = 0;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* mantém o padrão */ }
    Object.keys(S.days).forEach((d) => { totalMl += dayWater(S.days[d]); }); // litros de água: é o que define o nível (como no app)
    // Sem nome e sem localização: a nuvem recebe só o necessário para lembretes e estatísticas
    FS.setDoc(uref, {
      tz: tz, wake: p.wake, sleep: p.sleep, unit: p.unit, goal: goalToday(S, k), today: { day: k, ml: dayTotal(S.days[k]) },
      reminder: { enabled: !!r.enabled, interval: r.interval, smart: !!r.smart,
        nextAt: r.enabled && r.nextAt ? FS.Timestamp.fromMillis(r.nextAt) : null },
      stats: { streak: streak(S.days, k), best: bestStreak(S.days), totalMl: totalMl, level: levelFor(totalMl).i },
      updatedAt: FS.serverTimestamp(),
    }, { merge: true }).catch(report);
  }
  // "Avisos dos amigos" (1.1.1): a função onFriendship só avisa quem não desligou a chave (users/{uid}.social.push). Gravada À PARTE de pushMeta
  // e só quando a escolha difere do que o servidor já assume (ligado): ver alerts-sync.js, onde estão as regras e os testes.
  const alerts = createAlertsSync({ FS: FS, uref: uref, state: () => hooks.state(), mark: () => mark, saveMark: saveMark,
    warn: (e) => { console.warn('[nuvem] avisos dos amigos:', e && e.message ? e.message : e); } });
  // Traz só os dias alterados na nuvem desde a última vez (por enquanto, cada aparelho é uma conta anônima)
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
  function flush() {
    clearTimeout(timer);
    const keys = Object.keys(pending);
    pending = {};
    if (keys.length) pushDays(keys);
    if (metaDirty) { metaDirty = false; pushMeta(); alerts.push(); }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(flush, 1500); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); }); // o app pode ser fechado

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
  async function wipe() {
    wiping = true; clearTimeout(timer); pending = {}; metaDirty = false; alerts.reset();
    try {
      // Antes de tudo, sai da rede de amigos (perfil, convites, amizades). Quem tem os amigos ligados já saiu pelo app (resetAll não apaga
      // nada se isso falhar); aqui fica a garantia para quem nunca entrou ou ainda não tem as regras publicadas: se falhar, o resto segue.
      try { await timeout(social(null).then((sc) => sc.leave()), 20000); } catch (e) { /* amigos podem não existir ou estar fora do ar */ }
      const docs = (await FS.getDocs(days)).docs;
      for (let i = 0; i < docs.length; i += 400) {
        const b = FS.writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => { b.delete(d.ref); });
        await b.commit();
      }
      await FS.deleteDoc(uref);
      try { const M = await import(CDN + 'firebase-messaging.js'); await M.deleteToken(M.getMessaging(app)); } catch (e) { /* sem push */ }
      mark = { uid: uid, pullAt: 0, pushAt: 0, fcm: '' }; saveMark();
      cloud.push = false;
    } finally { wiping = false; }
  }

  const cloud = {
    uid: uid,
    social: social,
    push: !!mark.fcm,
    syncDays: (keys) => { if (wiping) return; (keys || []).forEach((k) => { pending[k] = 1; }); later(); },
    syncMeta: () => { if (wiping) return; metaDirty = true; later(); },
    enablePush: enablePush,
    wipe: wipe,
  };
  // Primeiro traz o que mudou na nuvem; depois envia o que mudou aqui enquanto ela esteve fora (lista calculada já,
  // antes que um envio novo atualize pushAt)
  const S0 = hooks.state(), since = mark.pushAt;
  const catchUp = Object.keys(S0.days).filter((k) => !since || (S0.days[k].u || 0) > since);
  pull().catch(report).then(() => { catchUp.forEach((k) => { pending[k] = 1; }); metaDirty = true; later(); });
  hooks.onStatus('on');
  return cloud;
}
