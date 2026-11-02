// Maré — camada de plataforma (Parte 2). Tudo o que depende do navegador ou do sistema fica aqui.
// App de loja (Capacitor): este é o ponto de troca. isNative() + native('Plugin').
// No bundle nativo, importe @capacitor/haptics e @capacitor/local-notifications para que
// os plugins apareçam em window.Capacitor.Plugins.

const ua = navigator.userAgent || '';
const noop = function () {};
function quiet(p) { if (p && p.catch) p.catch(noop); return p; }

/* ---------- ambiente ---------- */
export function isNative() {
  const Cap = window.Capacitor;
  return !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
}
export function native(name) {
  return isNative() && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] || null : null;
}
export const isIOS = () => /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(ua);
// Retorna maior*100 + menor (iOS 16.4 → 1604). 0 se não for iOS.
export function iosVersion() {
  let m = /OS (\d+)_(\d+)/.exec(ua);
  if (!m && isIOS()) m = /Version\/(\d+)\.(\d+)/.exec(ua); // iPadOS com UA de Mac
  return m ? +m[1] * 100 + +m[2] : 0;
}
export function isStandalone() {
  if (navigator.standalone === true) return true;
  if (!window.matchMedia) return false;
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}
export const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export function onMedia(query, cb) {
  if (!window.matchMedia) return null;
  const m = matchMedia(query);
  if (m.addEventListener) m.addEventListener('change', cb);
  else if (m.addListener) m.addListener(cb); // Safari < 14
  return m;
}

/* ---------- vibração / haptics ---------- */
export function haptic(kind) {
  try {
    const H = native('Haptics');
    if (H) {
      quiet(kind === 'success' ? H.notification({ type: 'SUCCESS' }) : H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' }));
      return;
    }
    // Sem nenhum toque na página ainda (ex.: festa que aparece na abertura), o Chrome bloqueia a vibração e reclama no console
    if (navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) navigator.vibrate(kind === 'success' ? [12, 60, 18] : kind === 'medium' ? 18 : 8);
  } catch (e) {}
}

/* ---------- service worker e atualizações ---------- */
// Desde a 1.5.1 o app se atualiza sozinho (veja sw.js): o worker novo assume por conta própria e avisa as telas abertas. Aqui ficam o registro,
// a procura por versão nova e a conversa com o worker; QUANDO recarregar é decisão do app.js (onStale), que espera um momento tranquilo.
// Tudo se resume a uma comparação: a tela só fica "velha" quando o worker que a controla é de uma versão MAIOR que a dela.
let waitingSW = null, updating = false, staleSeen = false;
const AR_KEY = 'mare:ar';

// "1.5.10" é maior que "1.5.9" (compara número a número). Versão ausente ou com texto estranho nunca é "maior": na dúvida, a tela não recarrega.
export function newer(a, b) {
  const ok = function (v) { return typeof v === 'string' && /^\d+(\.\d+){0,2}$/.test(v); };
  if (!ok(a) || !ok(b)) return false;
  const x = a.split('.'), y = b.split('.');
  for (let i = 0; i < 3; i++) {
    const p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0;
    if (p !== q) return p > q;
  }
  return false;
}
// Recarrega pelo endereço limpo do app (?add= e ?tab= não podem se repetir) e marca "?upd=1": a tela nova mostra "Maré atualizado ✓".
// Guarda quem recarregou (versão e hora): se a recarga não trocar de versão, a trava abaixo impede um laço de recargas.
export function reloadApp(version) {
  try { sessionStorage.setItem(AR_KEY, JSON.stringify({ v: version || '', t: Date.now() })); } catch (e) { /* sem sessionStorage */ }
  try { location.replace(new URL('./?upd=1', location.href).href); } catch (e) { location.reload(); }
}
// false se esta mesma versão já recarregou sozinha há menos de 5 minutos e continua aqui (a recarga não adiantou): nada de laço, o aviso fica
export function autoReloadOk(version) {
  try {
    const r = JSON.parse(sessionStorage.getItem(AR_KEY) || 'null');
    return !(r && r.v && r.v === version && Date.now() - r.t < 300000);
  } catch (e) { return true; }
}
// h: { version (a desta tela), onStale (a tela ficou para trás: recarregar), onUpdate (um worker ficou esperando), onMessage (inbox, go) }
export function registerSW(h) {
  h = h || {};
  if (!('serviceWorker' in navigator)) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'https:' && !local) return;
  const sw = navigator.serviceWorker;
  const say = function (m, to) { try { (to || sw.controller).postMessage(m); } catch (e) { /* sem worker no controle */ } };
  const hello = function () { if (sw.controller) say({ type: 'sw-hello' }); }; // "qual é a sua versão?": a resposta chega como 'sw-version'
  const stale = function () {
    if (staleSeen) return;
    staleSeen = true;
    if (h.onStale) h.onStale(); else if (h.onUpdate) h.onUpdate();
  };
  // Outro worker assumiu (atualização, ou a 1ª instalação reivindicando esta tela): pergunta a versão dele. Só recarrega se for mais nova que a
  // desta tela, então a 1ª instalação e as trocas por uma versão igual não recarregam nada.
  sw.addEventListener('controllerchange', function () {
    if (updating) { reloadApp(h.version); return; } // a pessoa tocou em "Atualizar"
    hello();
  });
  sw.addEventListener('message', function (e) {
    const m = e.data || {};
    if (m.type === 'sw-updated') { say({ type: 'sw-ack' }, sw.controller || e.source); if (newer(m.version, h.version)) stale(); } // "ack": esta tela cuida de si
    else if (m.type === 'sw-version') { if (newer(m.version, h.version)) stale(); }
    else if (h.onMessage) h.onMessage(m);
  });
  // Um worker "esperando" (um worker novo sempre assume sozinho, então só sobra isto se a instalação dele não deu certo). O aviso só aparece se ele
  // continuar esperando depois de alguns segundos: sem isso, a faixa piscaria por um instante antes da recarga automática.
  const found = function (w) {
    waitingSW = w;
    setTimeout(function () { if (w.state === 'installed' && h.onUpdate) h.onUpdate(); }, 3000);
  };
  const go = function () {
    sw.register('./sw.js', { updateViaCache: 'none' }).then(function (reg) { // 'none': o sw.js nunca vem do cache HTTP (o GitHub Pages guarda 10 min)
      if (reg.waiting && sw.controller) found(reg.waiting);
      reg.addEventListener('updatefound', function () {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && sw.controller) found(w); });
      });
      // Procura versão nova ao abrir, ao voltar para o app, ao voltar a ter internet e de tempos em tempos com o app aberto. O sw.js é pequeno e o
      // navegador só baixa o app de novo se ele mudou. hello() confere se esta tela não ficou para trás de um worker que já assumiu (aviso perdido
      // enquanto o iPhone a mantinha suspensa, tela devolvida pelo cache de voltar/avançar).
      const check = function () {
        if (document.visibilityState !== 'visible') return;
        quiet(reg.update());
        hello();
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('pageshow', function (e) { if (e.persisted) check(); });
      window.addEventListener('online', check);
      setInterval(check, 20 * 60 * 1000);
      check();
    }).catch(function (e) { console.warn('[sw] registro falhou', e); });
  };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
}
// O botão "Atualizar" (plano B): com um worker esperando, manda ele assumir e recarrega; sem nenhum, só recarrega
export function applyUpdate() {
  if (!waitingSW) { reloadApp(); return; }
  updating = true;
  waitingSW.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(function () { reloadApp(); }, 3000); // plano B se o controllerchange não vier
}

/* ---------- notificações ---------- */
// 'granted' | 'denied' | 'default' | 'unsupported' | 'install' (iPhone sem instalar) | 'native'
export function notifStatus() {
  if (native('LocalNotifications')) return 'native';
  if (isIOS() && !isStandalone()) return iosVersion() >= 1604 ? 'install' : 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission;
}
// Precisa ser chamada dentro de um toque/clique (exigência do Safari).
export function requestNotifPermission() {
  const LN = native('LocalNotifications');
  if (LN) {
    return LN.requestPermissions().then(function (r) { return r && r.display === 'granted' ? 'granted' : 'denied'; }, function () { return 'denied'; });
  }
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  return new Promise(function (res) {
    let done = false;
    const fin = function (p) { if (!done) { done = true; res(p || Notification.permission); } };
    try {
      const p = Notification.requestPermission(fin); // Safari antigo usa callback
      if (p && p.then) p.then(fin, function () { fin(); });
    } catch (e) { fin(); }
  });
}
export function showNotification(title, body, extra) {
  const LN = native('LocalNotifications');
  if (LN) {
    return quiet(LN.schedule({ notifications: [{ id: 2, title: title, body: body, schedule: { at: new Date(Date.now() + 1000) } }] }));
  }
  const opts = Object.assign({
    body: body, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png',
    tag: 'mare-lembrete', renotify: true, vibrate: [80, 40, 80], data: { url: './' },
    actions: [{ action: 'add250', title: '+250 ml' }], // Android; o iOS ignora
  }, extra || {});
  const fallback = function () {
    try { new Notification(title, { body: body, icon: opts.icon }); return true; } catch (e) { return false; }
  };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.showNotification(title, opts).then(function () { return true; }); })
      .catch(fallback);
  }
  return Promise.resolve(fallback());
}
// Lembrete agendado pelo sistema (só no app nativo). Na web retorna false e não faz nada.
export function scheduleNative(at, title, body) {
  const LN = native('LocalNotifications');
  if (!LN) return false;
  quiet(Promise.resolve(LN.cancel({ notifications: [{ id: 1 }] })).catch(noop).then(function () {
    if (!at || at <= Date.now()) return null;
    return LN.schedule({ notifications: [{
      id: 1, title: title || 'Hora de beber água 💧', body: body || 'Toque para registrar no Maré.',
      schedule: { at: new Date(at), allowWhileIdle: true },
    }] });
  }));
  return true;
}

/* ---------- selo no ícone ---------- */
// Desde a 1.2.0 o Maré não acende mais o selo (era a conta de copos que faltam e parecia um contador de notificações): só zera o que
// uma versão antiga deixou lá.
export function clearBadge() {
  try { if (navigator.clearAppBadge) quiet(navigator.clearAppBadge()); } catch (e) {}
}

/* ---------- caixa de entrada das ações de notificação ---------- */
// O sw.js grava { id, t, ml, d } no IndexedDB "mare" (v1), store "inbox" (keyPath "id").
// O app lê e esvazia na MESMA transação, então duas leituras seguidas nunca duplicam.
export function drainInbox() {
  return new Promise(function (res) {
    if (!window.indexedDB) { res([]); return; }
    let req;
    try { req = indexedDB.open('mare', 1); } catch (e) { res([]); return; }
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { keyPath: 'id' });
    };
    req.onerror = function () { res([]); };
    req.onsuccess = function () {
      const db = req.result;
      try {
        const tx = db.transaction('inbox', 'readwrite'), st = tx.objectStore('inbox'), g = st.getAll();
        let items = [];
        g.onsuccess = function () { items = g.result || []; if (items.length) st.clear(); };
        tx.oncomplete = function () { db.close(); res(items); };
        tx.onerror = tx.onabort = function () { db.close(); res([]); };
      } catch (e) { db.close(); res([]); }
    };
  });
}

/* ---------- instalação ---------- */
let deferredPrompt = null;
export function initInstall(onChange) {
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; if (onChange) onChange(); });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; if (onChange) onChange(); });
}
export const canInstall = () => !!deferredPrompt;
export function promptInstall() {
  if (!deferredPrompt) return Promise.resolve(false);
  const d = deferredPrompt;
  deferredPrompt = null;
  try { d.prompt(); } catch (e) { return Promise.resolve(false); }
  return d.userChoice.then(function (c) { return !!c && c.outcome === 'accepted'; }, function () { return false; });
}

/* ---------- localização e clima (Open-Meteo) ---------- */
export function getCoords() {
  return new Promise(function (res, rej) {
    if (!navigator.geolocation) { rej(new Error('sem geolocalização')); return; }
    navigator.geolocation.getCurrentPosition(function (p) {
      // 1 casa decimal ≈ 11 km: basta para o clima e não expõe o endereço
      res({ lat: Math.round(p.coords.latitude * 10) / 10, lon: Math.round(p.coords.longitude * 10) / 10 });
    }, rej, { enableHighAccuracy: false, timeout: 15000, maximumAge: 6 * 3600000 });
  });
}
function withTimeout(p, ms) {
  return new Promise(function (res, rej) {
    const t = setTimeout(function () { rej(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
  });
}
// Máxima prevista para hoje (°C, inteiro). Gratuito só para uso não comercial: ver HANDOFF.
export function fetchMaxTemp(lat, lon) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&daily=temperature_2m_max&timezone=auto&forecast_days=1';
  return withTimeout(fetch(url, { cache: 'no-store' }), 10000)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (j) {
      const t = j && j.daily && j.daily.temperature_2m_max && j.daily.temperature_2m_max[0];
      if (typeof t !== 'number') throw new Error('sem temperatura');
      return Math.round(t);
    });
}

/* ---------- arquivos, compartilhar, copiar ---------- */
// No celular usa a folha de compartilhar (no iPhone é o caminho que funciona no app instalado);
// no computador, download normal. Retorna 'shared' | 'download' | 'cancel'.
export function saveFile(name, text, mime) {
  const download = function () {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return 'download';
  };
  try {
    if ((isIOS() || isAndroid()) && window.File && navigator.canShare) {
      const f = new File([text], name, { type: mime });
      if (navigator.canShare({ files: [f] })) {
        return navigator.share({ files: [f], title: name }).then(
          function () { return 'shared'; },
          function (e) { return e && e.name === 'AbortError' ? 'cancel' : download(); });
      }
    }
  } catch (e) {}
  return Promise.resolve(download());
}
export function copyText(t) {
  const legacy = function () {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : false;
    } catch (e) { return false; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t).then(function () { return 'copied'; }, legacy);
  }
  return Promise.resolve(legacy());
}
// Retorna 'shared' | 'copied' | 'cancel' | false
export function share(text, url) {
  const full = text + (url ? ' ' + url : '');
  if (navigator.share) {
    return navigator.share({ text: text, url: url }).then(
      function () { return 'shared'; },
      function (e) { return e && e.name === 'AbortError' ? 'cancel' : copyText(full); });
  }
  return copyText(full);
}

/* ---------- armazenamento persistente ---------- */
// Pede ao navegador para não apagar os dados sob pressão de espaço (Chrome respeita).
export function persistStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; });
  } catch (e) {}
  return Promise.resolve(false);
}
