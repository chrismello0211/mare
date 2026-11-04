// Maré — Service Worker (Parte 4): cache offline, atualização automática (1.5.1), push (lembretes e avisos dos amigos) e ação "+250 ml" da notificação.
// A cada deploy, aumente VERSION (e APP_VERSION em js/app.js): é isso que dispara a atualização, que acontece sozinha (veja "Atualização automática").
// Não use firebase-messaging-sw.js: o firebase.js registra o token FCM neste SW e o push chega aqui como "data".
const VERSION = '1.9.0';
const CACHE = 'mare-' + VERSION, RUNTIME = 'mare-sdk', TAG = 'mare-lembrete';
const SHELL = new URL('./', self.location).href, ROOT = new URL('./', self.location).pathname;
const NEXT = SHELL + '?upd=1', ACK_MS = 2500; // NEXT: endereço limpo do app; "?upd=1" faz a tela nova avisar "Maré atualizado ✓"
const CORE = ['./', './manifest.webmanifest', './css/app.css', './js/app.js', './js/core.js', './js/store.js',
  './js/ui.js', './js/views.js', './js/platform.js', './js/art.js', './js/kit.js', './js/social.js', './js/friends-view.js',
  './js/account.js', './js/account-view.js'];
// Opcionais: a instalação não falha se ainda não existirem (os PNGs vêm do script da Parte 5)
const EXTRA = ['./js/firebase-config.js', './js/firebase.js', './js/social-cloud.js', './js/alerts-sync.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/badge-72.png'];

// Guarda o app no cache. Roda na instalação e de novo se o cache sumir: vários apps dividem esta mesma origem
// (usuario.github.io) e alguns Service Workers deles apagam TODOS os caches que não são seus ao atualizar.
function precache() {
  const get = (u) => new Request(u, { cache: 'reload' }); // ignora o cache HTTP para não guardar arquivo velho
  return caches.open(CACHE).then((c) => c.addAll(CORE.map(get))
    .then(() => Promise.all(EXTRA.map((u) => c.add(get(u)).catch(() => null)))));
}
// Confere se o cache novo guardou o app.js DESTA versão: logo depois de um deploy, um CDN atrasado pode devolver o arquivo antigo, e um worker
// novo com arquivo velho no cache viraria uma instalação "misturada". Se não bater, a instalação falha (o worker antigo segue valendo) e a
// próxima checagem tenta de novo. Sem conseguir ler a versão no arquivo, não reprova (nunca travar as atualizações por causa da conferência).
function verify() {
  return caches.open(CACHE).then((c) => c.match('./js/app.js')).then((r) => (r ? r.text() : '')).then((t) => {
    const m = /APP_VERSION\s*=\s*'([^']+)'/.exec(t);
    if (m && m[1] !== VERSION) throw new Error('app.js é da versão ' + m[1] + ', esperava ' + VERSION);
  });
}

/* ---------- Atualização automática (1.5.1) ----------
   Antes: o worker novo ficava "esperando" até as telas fecharem e a pessoa precisava tocar em "Atualizar". No iPhone o app quase nunca fecha de
   verdade e o aviso era só uma faixa pequena no alto: quem não via o botão ficava para trás (foi o caso de uma amiga). Agora:
   1) instalação: guarda o app inteiro, confere o cache e SÓ ENTÃO assume (skipWaiting). Falhou? o worker antigo segue valendo;
   2) ativação: apaga os caches antigos, assume as telas abertas (claim) e, se isso foi uma atualização, avisa cada tela do Maré ("sw-updated");
   3) telas da 1.5.1 em diante respondem "sw-ack" e recarregam sozinhas num momento tranquilo (platform.js/app.js);
   4) as que não respondem em ACK_MS (versões antigas, que nem conhecem este aviso, ou telas congeladas) são recarregadas por aqui (navigate).
   Isto vale para as telas do Maré: as janelas de outros apps da mesma origem nunca são tocadas (ours). */
let UPDATING = false;    // este worker nasceu para trocar outro que já estava ativo (o app já estava instalado no aparelho)
let acked = {};          // ids das telas que responderam "sw-ack" (elas mesmas decidem a hora de recarregar)
self.addEventListener('install', (e) => {
  UPDATING = !!(self.registration && self.registration.active);
  e.waitUntil(precache().then(verify).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  let older = false;
  e.waitUntil(caches.keys()
    .then((keys) => {
      const old = keys.filter((k) => k.indexOf('mare-') === 0 && k !== CACHE && k !== RUNTIME);
      older = old.length > 0; // sobrou cache de outra versão: o app já estava instalado, então isto é uma atualização
      return Promise.all(old.map((k) => caches.delete(k)));
    })
    .then(() => self.clients.claim())
    .then(() => clearBadge()) // 1.2.0: sem selo no ícone; zera o número que uma versão antiga deixou
    // Sem "return": o aviso às telas corre por fora. A ativação não pode esperar a resposta delas, porque as requisições do app esperam a
    // ativação terminar (um worker "ativando" segura os fetches).
    .then(() => { if (UPDATING || older) notifyUpdated(); }));
});
// Avisa as telas do Maré, espera ACK_MS e recarrega só as que estavam abertas na hora do aviso e não responderam. Nunca lança erro.
function notifyUpdated() {
  const all =() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ours);
  return all().then((list) => {
    if (!list.length) return null;
    const ids = {};
    list.forEach((c) => { ids[c.id] = 1; try { c.postMessage({ type: 'sw-updated', version: VERSION }); } catch (err) { /* tela que fechou agora */ } });
    return new Promise((r) => { setTimeout(r, ACK_MS); })
      .then(all) // lista nova: o id muda quando a tela recarrega, e um objeto velho não consegue navegar
      .then((now) => Promise.all(now.filter((c) => ids[c.id] && !acked[c.id])
        .map((c) => Promise.resolve().then(() => c.navigate(NEXT))))); // endereço limpo: ?add= e ?tab= não podem se repetir (tela que fechou: o catch final segura)
  }).catch(() => null);
}
self.addEventListener('message', (e) => {
  const d = e.data || {}, src = e.source;
  if (d.type === 'SKIP_WAITING') self.skipWaiting(); // plano B: o botão "Atualizar" das telas antigas (≤ 1.5.0) manda isto
  else if (d.type === 'sw-ack') { if (src && src.id) acked[src.id] = 1; }
  else if (d.type === 'sw-hello') { // "qual é a sua versão?": a tela compara com a dela e recarrega se a do worker for mais nova
    const reply = (c) => { try { c.postMessage({ type: 'sw-version', version: VERSION }); } catch (err) { /* tela que fechou agora */ } };
    if (src && src.postMessage) reply(src);
    else e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => { ours(l).forEach(reply); }));
  }
});

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
  if (d.kind === 'friend') { // avisos dos amigos (1.1.1: pedido, aceite, aceno): sem o botão "+250 ml"; o toque abre a aba Amigos
    e.waitUntil(Promise.all([self.registration.showNotification(d.title || 'Maré 💧', {
      body: d.body || 'Toque para ver seus amigos.', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png',
      tag: d.tag || 'mare-amigos', renotify: true, vibrate: [60, 40, 60], data: { url: d.url || './?tab=friends', go: 'friends' },
    }), clearBadge()])); // o iOS exige que todo push mostre uma notificação: sempre chama showNotification
    return;
  }
  // O selo do ícone saiu na 1.2.0: o campo "badge" que um servidor antigo ainda mande é ignorado e o que sobrou de antes é zerado
  // O iOS exige que todo push mostre uma notificação: nunca retorne sem chamar showNotification
  e.waitUntil(Promise.all([self.registration.showNotification(d.title || 'Hora de beber água 💧', {
    body: d.body || 'Toque para registrar no Maré.', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png',
    tag: d.tag || TAG, renotify: true, vibrate: [80, 40, 80], data: { url: d.url || './?source=push' },
    actions: [{ action: 'add250', title: d.action || '+250 ml' }], // só Android/desktop; o iOS ignora
  }), clearBadge()]));
});
// Zera o selo do ícone (nunca falha: sem a API, ou recusada, não muda nada)
function clearBadge() {
  try { const n = self.navigator; return n && n.clearAppBadge ? Promise.resolve(n.clearAppBadge()).catch(() => null) : null; } catch (err) { return null; }
}

self.addEventListener('notificationclick', (e) => {
  const n = e.notification, data = n.data || {}, url = new URL(data.url || './', self.location).href;
  n.close();
  e.waitUntil(e.action === 'add250' ? quickLog(250) : focusOrOpen(url, data.go));
});
// As janelas do Maré: vários apps dividem esta mesma origem (usuario.github.io) e matchAll devolve as janelas de todos. Só as que estão na pasta do
// Maré contam; um toque na notificação nunca pode focar (nem mandar mensagem para) a aba de outro app.
function ours(list) { return list.filter((c) => typeof c.url === 'string' && c.url.indexOf(SHELL) === 0); }
// go = aba que o app deve abrir (avisos dos amigos): o app já aberto recebe a mensagem e troca de aba; sem janela aberta, abre a URL (?tab=friends)
function focusOrOpen(url, go) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
    const list = ours(all);
    for (let i = 0; i < list.length; i++) if (list[i].focus) {
      if (go) list[i].postMessage({ type: 'go', tab: go });
      return list[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  });
}
// Botão "+250 ml": grava na caixa de entrada (o app importa ao abrir, ver platform.drainInbox) e confirma em silêncio
function quickLog(ml) {
  const item = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), ml: ml, d: 'water' };
  return idbPut(item).then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => { ours(list).forEach((c) => { c.postMessage({ type: 'inbox' }); }); })
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
