// Maré — Service Worker (Parte 4): cache offline, atualização controlada, push e ação "+250 ml" da notificação.
// A cada deploy, aumente VERSION (e APP_VERSION em js/app.js): é isso que dispara o aviso "Nova versão disponível".
// Não use firebase-messaging-sw.js: o firebase.js registra o token FCM neste SW e o push chega aqui como "data".
const VERSION = '1.1.0';
const CACHE = 'mare-' + VERSION, RUNTIME = 'mare-sdk', TAG = 'mare-lembrete';
const SHELL = new URL('./', self.location).href, ROOT = new URL('./', self.location).pathname;
const CORE = ['./', './manifest.webmanifest', './css/app.css', './js/app.js', './js/core.js', './js/store.js',
  './js/ui.js', './js/views.js', './js/platform.js', './js/art.js', './js/kit.js', './js/social.js', './js/friends-view.js'];
// Opcionais: a instalação não falha se ainda não existirem (os PNGs vêm do script da Parte 5)
const EXTRA = ['./js/firebase-config.js', './js/firebase.js', './js/social-cloud.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/badge-72.png'];

// Guarda o app no cache. Roda na instalação e de novo se o cache sumir: vários apps dividem esta mesma origem
// (usuario.github.io) e alguns Service Workers deles apagam TODOS os caches que não são seus ao atualizar.
function precache() {
  const get = (u) => new Request(u, { cache: 'reload' }); // ignora o cache HTTP para não guardar arquivo velho
  return caches.open(CACHE).then((c) => c.addAll(CORE.map(get))
    .then(() => Promise.all(EXTRA.map((u) => c.add(get(u)).catch(() => null)))));
}
self.addEventListener('install', (e) => {
  e.waitUntil(precache());
  // Sem skipWaiting aqui: a página mostra "Nova versão disponível" e a pessoa escolhe a hora (platform.js)
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.indexOf('mare-') === 0 && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname === ROOT + 'sw.js') return;
    if (req.mode === 'navigate') {
      // A tela do app (com qualquer ?add=, ?tab=, ?source=) sai do cache; outras páginas tentam a rede primeiro
      const app = url.pathname === ROOT || url.pathname === ROOT + 'index.html';
      if (app) {
        const hit = caches.match(SHELL);
        // Sem cache (apagado por outro app da mesma origem)? Serve da rede agora e refaz o cache em segundo plano
        e.waitUntil(hit.then((r) => (r ? null : precache().catch(() => null))));
        e.respondWith(hit.then((r) => r || fetch(req)));
      } else e.respondWith(fetch(req).catch(() => caches.match(SHELL)));
      return;
    }
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // SDK do Firebase (URL com versão, nunca muda): cache-first, para a nuvem também abrir offline
  if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) {
    e.respondWith(caches.open(RUNTIME).then((c) => c.match(req).then((r) => r || fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
  }
});

/* ---------- push (enviado pela Cloud Function) ---------- */
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { body: e.data ? e.data.text() : '' }; }
  const d = p.data || p; // o FCM entrega os campos dentro de "data"
  const jobs = [self.registration.showNotification(d.title || 'Hora de beber água 💧', {
    body: d.body || 'Toque para registrar no Maré.', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png',
    tag: d.tag || TAG, renotify: true, vibrate: [80, 40, 80], data: { url: d.url || './?source=push' },
    actions: [{ action: 'add250', title: d.action || '+250 ml' }], // só Android/desktop; o iOS ignora
  })];
  if (d.badge != null && self.navigator && self.navigator.setAppBadge) jobs.push(self.navigator.setAppBadge(+d.badge).catch(() => null));
  // O iOS exige que todo push mostre uma notificação: nunca retorne sem chamar showNotification
  e.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification, url = new URL((n.data && n.data.url) || './', self.location).href;
  n.close();
  e.waitUntil(e.action === 'add250' ? quickLog(250) : focusOrOpen(url));
});
function focusOrOpen(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (let i = 0; i < list.length; i++) if (list[i].focus) return list[i].focus();
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  });
}
// Botão "+250 ml": grava na caixa de entrada (o app importa ao abrir, ver platform.drainInbox) e confirma em silêncio
function quickLog(ml) {
  const item = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), ml: ml, d: 'water' };
  return idbPut(item).then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => { list.forEach((c) => { c.postMessage({ type: 'inbox' }); }); })
    .then(() => self.registration.showNotification('+' + ml + ' ml registrados ✓', {
      body: 'Bom gole! Já está guardado no Maré.', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png',
      tag: TAG, silent: true, data: { url: './?source=notif' } }))
    .then(() => new Promise((r) => { setTimeout(r, 4000); }))
    .then(() => self.registration.getNotifications({ tag: TAG }))
    .then((ns) => { ns.forEach((x) => { x.close(); }); }),
  () => focusOrOpen(new URL('./?add=' + ml, self.location).href)); // sem IndexedDB: abre o app já registrando
}
function idbPut(item) {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('mare', 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains('inbox')) rq.result.createObjectStore('inbox', { keyPath: 'id' }); };
    rq.onerror = () => { rej(rq.error); };
    rq.onsuccess = () => {
      const db = rq.result, tx = db.transaction('inbox', 'readwrite');
      tx.objectStore('inbox').put(item);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
    };
  });
}
