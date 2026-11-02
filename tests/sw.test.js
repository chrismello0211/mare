// Maré — testes do Service Worker (public/sw.js) sem navegador: o arquivo roda de verdade, dentro de um "self" de mentira, e os eventos
// de push e de toque na notificação são entregues a ele como o navegador entregaria. O que se prova aqui: como cada push vira notificação
// (lembretes continuam iguais; avisos dos amigos ganham o texto do servidor, sem o botão "+250 ml"; nenhum dos dois acende o selo do ícone,
// que saiu na 1.2.0, e os dois zeram o que uma versão antiga deixou lá) e o que o toque faz.
// Rodar: npm test. (O mesmo arquivo, num Chromium de verdade, é coberto por tests/e2e-friends.spec.js.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const BASE = 'https://chrismello0211.github.io/mare/';

const VER = /const VERSION = '([^']+)'/.exec(SRC)[1];

// Carrega o sw.js num contexto isolado. opt: { windows: [{url, focus, postMessage}], idb: 'ok' (caixa de entrada de mentira; sem isso o
// IndexedDB "não existe") }. Cada janela de mentira é do Maré (url = BASE) a menos que o teste diga outra coisa.
// Atualização automática (1.5.1): active = já havia um worker ativo (a instalação é uma atualização) · cacheKeys = caches que já existem ·
// appJs = o que o cache novo guarda como js/app.js (null = o cache não tem o arquivo) · addAllFails = a rede falhou ao guardar o app ·
// shell = o que caches.match(SHELL) devolve. Os timers longos (a espera pelas respostas das telas, ACK_MS) ficam parados até t.tick().
function boot(opt) {
  opt = opt || {};
  const handlers = {}, shown = [], opened = [], badges = [], cleared = [], closed = [], settled = [], stored = [];
  const skips = [], deleted = [], held = [], order = [];
  let wid = 0;
  const windows = (opt.windows || []).map((w) => Object.assign({ id: 'w' + (++wid), posts: [], focused: 0, navigated: [], url: BASE,
    postMessage(m) { this.posts.push(m); }, focus() { this.focused++; return Promise.resolve(this); },
    navigate(u) { this.navigated.push(u); return Promise.resolve(this); } }, w));
  // IndexedDB de mentira: só o que a caixa de entrada usa (open → onupgradeneeded/onsuccess → transaction.objectStore.put → oncomplete)
  const fakeIdb = () => ({ open: () => {
    const rq = { result: { objectStoreNames: { contains: () => true }, createObjectStore() {}, close() {},
      transaction: () => { const tx = { objectStore: () => ({ put: (it) => { stored.push(it); setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0); } }) }; return tx; } } };
    setTimeout(() => { if (rq.onsuccess) rq.onsuccess(); }, 0);
    return rq;
  } });
  const self = {
    location: new URL(BASE + 'sw.js'),
    addEventListener: (t, fn) => { handlers[t] = fn; },
    registration: {
      active: opt.active ? { state: 'activated' } : null, // no install, é o worker que já estava ativo (null na 1ª instalação)
      // slowShow: a notificação só "termina de aparecer" um pouco depois, como no navegador: quem não a entrega ao waitUntil não a espera
      showNotification: (title, o) => { shown.push({ title, o }); return opt.slowShow ? new Promise((r) => { setTimeout(() => { settled.push(1); r(); }, 5); }) : Promise.resolve(); },
      getNotifications: () => Promise.resolve([{ close: () => { closed.push(1); } }]),
    },
    clients: { matchAll: () => (opt.matchAllFails ? Promise.reject(new Error('sem clientes')) : Promise.resolve(opt.matchAll ? opt.matchAll(windows) : windows)),
      openWindow: (u) => { opened.push(u); return Promise.resolve(); }, claim: () => { order.push('claim'); return opt.claimFails ? Promise.reject(new Error('claim')) : Promise.resolve(); } },
    // setAppBadge nunca deve ser chamado (o selo saiu); clearAppBadge é o que zera. badgeFails: a API existe, mas recusa (permissão negada)
    navigator: opt.noBadge ? {} : { setAppBadge: (n) => { badges.push(n); return Promise.resolve(); },
      clearAppBadge: () => { cleared.push(1); return opt.badgeFails ? Promise.reject(new Error('sem permissão')) : Promise.resolve(); } },
    skipWaiting() { skips.push(order.slice()); order.push('skip'); return Promise.resolve(); }, // guarda o que já tinha acontecido: skipWaiting só vale depois do cache
  };
  // Timers do sw.js: a pausa de 4 s antes de fechar o "+250 ml registrados" dura 1 ms; a espera de ACK_MS (2,5 s) pelas respostas das telas fica
  // parada até o teste chamar tick() (assim dá para entregar o "sw-ack" no meio, como o navegador entregaria).
  const timer = (fn, ms) => { if (ms === 2500) { held.push(fn); return 0; } return setTimeout(fn, Math.min(ms, 1)); }; // 2500 = ACK_MS do sw.js
  const keys = opt.cacheKeys || [];
  const cache = {
    addAll: () => { order.push('addAll'); return opt.addAllFails ? Promise.reject(new Error('sem rede')) : Promise.resolve(); },
    add: () => Promise.resolve(),
    // o que o cache novo guarda como js/app.js: por padrão, o app.js desta mesma versão
    match: (u) => Promise.resolve(opt.appJs === null || u !== './js/app.js' ? null : { text: () => Promise.resolve(opt.appJs === undefined ? "export const APP_VERSION = '" + VER + "';" : opt.appJs) }),
  };
  const ctx = { self, URL, Promise, console, setTimeout: timer, Request: function Request(u) { this.url = u; },
    caches: { open: () => Promise.resolve(cache), keys: () => Promise.resolve(keys.slice()), delete: (k) => { deleted.push(k); return Promise.resolve(true); },
      match: (r) => Promise.resolve(opt.shell && (r === BASE || (r && r.url === BASE)) ? opt.shell : null) },
    fetch: () => Promise.reject(new Error('sem rede')),
    indexedDB: opt.idb === 'ok' ? fakeIdb() : { open: () => { throw new Error('IndexedDB indisponível'); } } };
  vm.runInNewContext(SRC, ctx);
  // entrega um evento e espera tudo o que o SW pediu para esperar (waitUntil), como o navegador faz
  const fire = async (type, ev) => {
    const waits = [];
    const e = Object.assign({ waitUntil: (p) => { waits.push(p); } }, ev);
    handlers[type](e);
    await Promise.all(waits);
  };
  // a espera de ACK_MS acabou: libera os timers parados e deixa as promessas seguirem
  const tick = async () => { while (held.length) held.shift()(); await new Promise((r) => { setTimeout(r, 15); }); };
  // espera uma condição ficar verdadeira (as mensagens do worker saem de promessas, sem timer)
  const until = async (cond) => { for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => { setTimeout(r, 2); }); return cond(); };
  // push: o FCM entrega { data: {...}, from, priority, fcmMessageId }; raw = true manda o texto como está
  const push = (payload, raw) => fire('push', { data: payload === undefined ? null : { json: () => (raw ? JSON.parse(payload) : payload), text: () => String(raw ? payload : JSON.stringify(payload)) } });
  const click = (data, action) => fire('notificationclick', { action: action || '', notification: { data: data, close: () => { closed.push('n'); } } });
  return { handlers, shown, opened, badges, cleared, closed, windows, push, click, fire, settled, stored, skips, deleted, held, order, tick, until };
}
const FCM = (data) => ({ data: data, from: '123456789', priority: 'high', fcmMessageId: 'abc-123' }); // o envelope de verdade

const FRIEND = { kind: 'friend', ev: 'wave', tag: 'mare-amigo-wave-anaxxxxxxxxxxxxxxxxxxxxxxxxx', url: './?tab=friends',
  title: 'Ana acenou para você 👋', body: 'Toque para acenar de volta.' };

describe('push de amigos (kind "friend")', () => {
  it('vira UMA notificação com o texto do servidor, o mesmo tag e a aba Amigos como destino', async () => {
    const t = boot();
    await t.push(FCM(FRIEND));
    expect(t.shown).toHaveLength(1);
    const n = t.shown[0];
    expect(n.title).toBe('Ana acenou para você 👋');
    expect(n.o.body).toBe('Toque para acenar de volta.');
    expect(n.o.tag).toBe(FRIEND.tag);
    expect(n.o.renotify).toBe(true);
    expect(n.o.data).toEqual({ url: './?tab=friends', go: 'friends' });
    expect(n.o.icon).toBe('icons/icon-192.png');
    expect(n.o.badge).toBe('icons/badge-72.png');
  });
  it('não leva o botão "+250 ml" (não é lembrete) e não acende o selo do ícone (só zera o que sobrou)', async () => {
    const t = boot();
    await t.push(FCM(Object.assign({}, FRIEND, { badge: '4', action: '+250 ml' }))); // mesmo que o servidor mandasse
    expect(t.shown[0].o.actions).toBeUndefined();
    expect(t.badges).toEqual([]);
    expect(t.cleared).toHaveLength(1);
  });
  it('a notificação é entregue ao waitUntil: o navegador mantém o worker vivo até ela aparecer (o iOS exige uma por push)', async () => {
    const t = boot({ slowShow: true });
    await t.push(FCM(FRIEND));
    expect(t.shown).toHaveLength(1);
    expect(t.settled).toHaveLength(1);
  });
  it('funciona com o envelope do FCM e com o payload "solto"', async () => {
    const a = boot(), b = boot();
    await a.push(FCM(FRIEND));
    await b.push(FRIEND);
    expect(a.shown[0]).toEqual(b.shown[0]);
  });
  it('campos que faltam têm padrão: o aviso nunca fica sem texto (o iOS exige uma notificação por push)', async () => {
    const t = boot();
    await t.push(FCM({ kind: 'friend' }));
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0].title).toBe('Maré 💧');
    expect(t.shown[0].o).toMatchObject({ body: 'Toque para ver seus amigos.', tag: 'mare-amigos', data: { url: './?tab=friends', go: 'friends' } });
  });
  it('a URL vem do servidor, mas o destino ao tocar é sempre a aba Amigos', async () => {
    const t = boot();
    await t.push(FCM(Object.assign({}, FRIEND, { url: './?tab=settings' })));
    expect(t.shown[0].o.data.go).toBe('friends');
  });
  it('outro "kind", maiúsculas ou texto parecido não é aviso de amigos', async () => {
    for (const k of ['Friend', 'friends', 'FRIEND', '', 'reminder', undefined]) {
      const t = boot();
      await t.push(FCM({ kind: k, title: 'X', body: 'Y' }));
      expect(t.shown[0].o.actions).toEqual([{ action: 'add250', title: '+250 ml' }]); // continua sendo lembrete
    }
  });
});

describe('push de lembrete: nada mudou', () => {
  const REM = { kind: 'reminder', tag: 'mare-lembrete', url: './?source=push', badge: '3', title: 'Hora de um gole 💧', action: '+250 ml', body: 'Faltam 750 ml para a meta de hoje.' };
  it('mostra o texto e o botão "+250 ml"; o selo do ícone não acende (nem se um servidor antigo ainda mandar "badge") e o que sobrou é zerado', async () => {
    const t = boot();
    await t.push(FCM(REM));
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0].title).toBe('Hora de um gole 💧');
    expect(t.shown[0].o).toMatchObject({ body: 'Faltam 750 ml para a meta de hoje.', tag: 'mare-lembrete', renotify: true, data: { url: './?source=push' } });
    expect(t.shown[0].o.actions).toEqual([{ action: 'add250', title: '+250 ml' }]);
    expect(t.badges).toEqual([]); // REM traz badge: '3', como o servidor da 1.1.x mandava
    expect(t.cleared).toHaveLength(1);
  });
  it('a notificação do lembrete também é entregue ao waitUntil', async () => {
    const t = boot({ slowShow: true });
    await t.push(FCM(REM));
    expect(t.shown).toHaveLength(1);
    expect(t.settled).toHaveLength(1);
  });
  it('usa o rótulo do botão que o servidor mandou (+8 oz para quem usa onças)', async () => {
    const t = boot();
    await t.push(FCM(Object.assign({}, REM, { action: '+8 oz' })));
    expect(t.shown[0].o.actions[0].title).toBe('+8 oz');
  });
  it('sem a API do selo no aparelho, ou com ela recusando: o aviso aparece do mesmo jeito', async () => {
    const a = boot({ noBadge: true }), b = boot({ badgeFails: true }), c = boot({ noBadge: true });
    await a.push(FCM(REM));
    await b.push(FCM(REM));
    await c.push(FCM(FRIEND));
    [a, b, c].forEach((t) => { expect(t.shown).toHaveLength(1); });
    expect(b.cleared).toHaveLength(1);
  });
  it('a ativação de uma versão nova do service worker zera o selo que uma versão antiga deixou', async () => {
    const t = boot();
    await t.fire('activate', {});
    expect(t.cleared).toHaveLength(1);
    expect(t.badges).toEqual([]);
    const f = boot({ badgeFails: true });
    await f.fire('activate', {}); // recusado: não derruba a ativação
    expect(f.cleared).toHaveLength(1);
  });
  it('push sem dados, sem JSON ou vazio ainda mostra uma notificação (regra do iOS)', async () => {
    const a = boot(), b = boot(), c = boot();
    await a.push(undefined);
    await b.push('texto que não é json', true);
    await c.push({});
    [a, b, c].forEach((t) => {
      expect(t.shown).toHaveLength(1);
      expect(t.shown[0].title).toBe('Hora de beber água 💧');
      expect(t.shown[0].o.tag).toBe('mare-lembrete');
    });
  });
});

describe('toque na notificação', () => {
  it('amigos, com o Maré aberto: pede para o app abrir a aba Amigos e traz a janela para a frente (sem abrir outra)', async () => {
    const t = boot({ windows: [{}] });
    await t.click({ url: './?tab=friends', go: 'friends' });
    expect(t.windows[0].posts).toEqual([{ type: 'go', tab: 'friends' }]);
    expect(t.windows[0].focused).toBe(1);
    expect(t.opened).toEqual([]);
    expect(t.closed).toContain('n'); // a notificação some ao tocar
  });
  it('amigos, com o Maré fechado: abre a janela direto na aba Amigos', async () => {
    const t = boot();
    await t.click({ url: './?tab=friends', go: 'friends' });
    expect(t.opened).toEqual([BASE + '?tab=friends']);
  });
  it('só a primeira janela que dá para focar recebe o aviso', async () => {
    const t = boot({ windows: [{ focus: undefined }, {}, {}] });
    await t.click({ url: './?tab=friends', go: 'friends' });
    expect(t.windows[0].posts).toEqual([]);
    expect(t.windows[1].posts).toEqual([{ type: 'go', tab: 'friends' }]);
    expect(t.windows[2].posts).toEqual([]);
    expect(t.windows[1].focused).toBe(1);
  });
  it('lembrete: só traz o app para a frente (nada de trocar de aba)', async () => {
    const t = boot({ windows: [{}] });
    await t.click({ url: './?source=push' });
    expect(t.windows[0].posts).toEqual([]);
    expect(t.windows[0].focused).toBe(1);
  });
  it('lembrete com o app fechado abre a URL do lembrete', async () => {
    const t = boot();
    await t.click({ url: './?source=push' });
    expect(t.opened).toEqual([BASE + '?source=push']);
  });
  it('notificação sem dados: abre o app e não quebra', async () => {
    const a = boot(), b = boot({ windows: [{}] });
    await a.click(undefined);
    await b.click(null);
    expect(a.opened).toEqual([BASE]);
    expect(b.windows[0].focused).toBe(1);
  });
  it('botão "+250 ml" sem IndexedDB: cai no plano B (abre o app já registrando)', async () => {
    const t = boot();
    await t.click({ url: './?source=push' }, 'add250');
    expect(t.opened).toEqual([BASE + '?add=250']);
  });
});

// Vários apps dividem a origem usuario.github.io; clients.matchAll devolve as janelas de TODOS. Um toque na notificação do Maré só pode
// trazer para a frente (ou mandar mensagem para) uma janela que está na pasta do Maré.
describe('toque na notificação: janelas de outros apps na mesma origem', () => {
  const OUTRO = 'https://chrismello0211.github.io/outro-app/';
  const PARECIDA = 'https://chrismello0211.github.io/mare-extra/'; // começa com "mare", mas não é a pasta do Maré
  it('amigos: a janela de outro app não é focada nem recebe mensagem; sem janela do Maré, abre a dele (direto na aba Amigos)', async () => {
    const t = boot({ windows: [{ url: OUTRO }, { url: PARECIDA }] });
    await t.click({ url: './?tab=friends', go: 'friends' });
    t.windows.forEach((w) => { expect(w.posts).toEqual([]); expect(w.focused).toBe(0); });
    expect(t.opened).toEqual([BASE + '?tab=friends']);
  });
  it('com outro app na frente da lista, quem recebe o aviso e o foco é a janela do Maré', async () => {
    const t = boot({ windows: [{ url: OUTRO }, {}, { url: PARECIDA }] });
    await t.click({ url: './?tab=friends', go: 'friends' });
    expect(t.windows[0].posts).toEqual([]);
    expect(t.windows[0].focused).toBe(0);
    expect(t.windows[1].posts).toEqual([{ type: 'go', tab: 'friends' }]);
    expect(t.windows[1].focused).toBe(1);
    expect(t.windows[2].posts).toEqual([]);
    expect(t.opened).toEqual([]);
  });
  it('lembrete: o outro app também não ganha o foco (abre o Maré)', async () => {
    const t = boot({ windows: [{ url: OUTRO }] });
    await t.click({ url: './?source=push' });
    expect(t.windows[0].focused).toBe(0);
    expect(t.opened).toEqual([BASE + '?source=push']);
  });
  it('subpáginas do Maré (com parâmetros) contam como o Maré', async () => {
    const t = boot({ windows: [{ url: BASE + '?tab=friends&x=1' }, { url: BASE + 'index.html#hoje' }] });
    await t.click({ url: './?tab=friends', go: 'friends' });
    expect(t.windows[0].focused).toBe(1);
    expect(t.windows[0].posts).toEqual([{ type: 'go', tab: 'friends' }]);
    expect(t.windows[1].focused).toBe(0);
  });
  it('janela sem url (o navegador não informou) nunca é usada', async () => {
    const t = boot({ windows: [{ url: undefined }, { url: null }, { url: 42 }] });
    await t.click({ url: './?tab=friends', go: 'friends' });
    t.windows.forEach((w) => { expect(w.posts).toEqual([]); expect(w.focused).toBe(0); });
    expect(t.opened).toEqual([BASE + '?tab=friends']);
  });
  it('botão "+250 ml": guarda na caixa de entrada e avisa ("inbox") só as janelas do Maré, sem abrir nada', async () => {
    const t = boot({ idb: 'ok', windows: [{ url: OUTRO }, {}, { url: undefined }, { url: BASE + '?tab=friends' }] });
    await t.click({ url: './?source=push' }, 'add250');
    expect(t.stored).toHaveLength(1);
    expect(t.stored[0]).toMatchObject({ ml: 250, d: 'water' });
    expect(t.windows[0].posts).toEqual([]);
    expect(t.windows[1].posts).toEqual([{ type: 'inbox' }]);
    expect(t.windows[2].posts).toEqual([]);
    expect(t.windows[3].posts).toEqual([{ type: 'inbox' }]);
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0].title).toBe('+250 ml registrados ✓');
    expect(t.opened).toEqual([]);
  });
  it('botão "+250 ml" sem nenhuma janela do Maré: grava e confirma, mas não acorda janela de ninguém', async () => {
    const t = boot({ idb: 'ok', windows: [{ url: OUTRO }] });
    await t.click({ url: './?source=push' }, 'add250');
    expect(t.stored).toHaveLength(1);
    expect(t.windows[0].posts).toEqual([]);
    expect(t.shown[0].title).toBe('+250 ml registrados ✓');
    expect(t.opened).toEqual([]);
  });
});

/* ---------- atualização automática (1.5.1) ---------- */
// Antes da 1.5.1 o worker novo ficava "esperando" até a pessoa tocar em "Atualizar" (e uma amiga ficou para trás sem ver o botão). Agora ele
// assume sozinho depois de guardar o app inteiro, apaga os caches antigos e avisa as telas abertas; quem não responde é recarregado pelo worker.
const OUTRO = 'https://chrismello0211.github.io/outro-app/';
const NEXT = BASE + '?upd=1';
const ack = (t, i) => t.fire('message', { data: { type: 'sw-ack' }, source: { id: t.windows[i].id } });

describe('atualização automática: instalação', () => {
  it('guarda o app inteiro e SÓ DEPOIS assume o controle (skipWaiting), sem esperar a pessoa tocar em "Atualizar"', async () => {
    const t = boot({ active: true });
    await t.fire('install', {});
    expect(t.skips).toHaveLength(1);
    expect(t.skips[0]).toContain('addAll'); // o cache já estava completo quando o skipWaiting foi pedido
  });
  it('falhou ao guardar o app (sem rede no meio do download)? a instalação falha e o worker antigo segue valendo: nunca assume com o cache incompleto', async () => {
    const t = boot({ active: true, addAllFails: true });
    await expect(t.fire('install', {})).rejects.toThrow();
    expect(t.skips).toHaveLength(0);
  });
  it('o CDN ainda entregou o app.js da versão antiga logo depois do deploy? a instalação falha (nada de instalação "misturada") e tenta de novo na próxima checagem', async () => {
    const t = boot({ active: true, appJs: "export const APP_VERSION = '1.4.0'; // velho" });
    await expect(t.fire('install', {})).rejects.toThrow(/1\.4\.0/);
    expect(t.skips).toHaveLength(0);
  });
  it('a conferência só reprova uma versão DIFERENTE: sem o arquivo no cache, ou sem conseguir ler a versão nele, a instalação segue (nunca trava as atualizações)', async () => {
    for (const appJs of [null, '', '// minificado, sem a constante', "const APP_VERSION = '" + VER + "'"]) {
      const t = boot({ active: true, appJs });
      await t.fire('install', {});
      expect(t.skips, String(appJs)).toHaveLength(1);
    }
  });
  it('1ª instalação também funciona (o skipWaiting não atrapalha: não havia worker antes)', async () => {
    const t = boot();
    await t.fire('install', {});
    expect(t.skips).toHaveLength(1);
  });
});

describe('atualização automática: ativação', () => {
  it('uma ATUALIZAÇÃO (já havia worker ativo): apaga só os caches antigos do Maré, assume as telas e avisa cada tela do Maré', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.4.0', 'mare-1.5.0', 'mare-' + VER, 'mare-sdk', 'forgex-v3'], windows: [{}, {}] });
    await t.fire('install', {});
    await t.fire('activate', {});
    expect(t.deleted.sort()).toEqual(['mare-1.4.0', 'mare-1.5.0']); // nem o cache desta versão, nem o do SDK, nem o de outro app
    expect(t.order.indexOf('claim')).toBeGreaterThan(-1);
    await t.until(() => t.windows.every((w) => w.posts.length));
    t.windows.forEach((w) => { expect(w.posts).toEqual([{ type: 'sw-updated', version: VER }]); });
  });
  it('a ativação NÃO espera as telas responderem (as requisições do app esperam a ativação terminar): termina com o timer de espera ainda parado', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{}] });
    await t.fire('install', {});
    await t.fire('activate', {}); // se esperasse o timer de 2,5 s, este await nunca terminaria
    expect(t.windows[0].navigated).toEqual([]);
    await t.until(() => t.held.length === 1);
    expect(t.held).toHaveLength(1);
  });
  it('1ª instalação (nenhum worker antes, nenhum cache de outra versão): não avisa nem recarrega ninguém', async () => {
    const t = boot({ cacheKeys: ['mare-sdk'], windows: [{}] });
    await t.fire('install', {});
    await t.fire('activate', {});
    await t.tick();
    expect(t.windows[0].posts).toEqual([]);
    expect(t.windows[0].navigated).toEqual([]);
  });
  it('uma atualização em que outro app da mesma origem já apagou os caches antigos: o worker que estava ativo basta para saber que é uma atualização', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-sdk'], windows: [{}] });
    await t.fire('install', {});
    await t.fire('activate', {});
    await t.until(() => t.windows[0].posts.length);
    expect(t.windows[0].posts).toEqual([{ type: 'sw-updated', version: VER }]);
  });
  it('o worker foi reiniciado entre a instalação e a ativação (a memória some): ainda reconhece a atualização pelos caches antigos que sobraram', async () => {
    const t = boot({ cacheKeys: ['mare-1.4.0', 'mare-' + VER], windows: [{}] }); // sem fire('install'): como um worker acordado só para ativar
    await t.fire('activate', {});
    await t.until(() => t.windows[0].posts.length);
    expect(t.windows[0].posts).toEqual([{ type: 'sw-updated', version: VER }]);
  });
  it('só as telas do Maré são avisadas: janelas de outro app na mesma origem, de pasta parecida ou sem endereço ficam de fora', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{ url: OUTRO }, {}, { url: 'https://chrismello0211.github.io/mare-extra/' }, { url: undefined }, { url: BASE + '?tab=friends' }] });
    await t.fire('activate', {});
    await t.until(() => t.windows[1].posts.length && t.windows[4].posts.length);
    expect(t.windows.map((w) => w.posts.length)).toEqual([0, 1, 0, 0, 1]);
    await t.tick();
    expect(t.windows.map((w) => w.navigated.length)).toEqual([0, 1, 0, 0, 1]);
    expect(t.windows[0].navigated).toEqual([]);
  });
  it('as telas que NÃO responderam (versões antigas não conhecem o aviso) são recarregadas pelo worker, no endereço limpo do app (com ?upd=1)', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.4.0'], windows: [{ url: BASE + '?add=250&source=push' }, { url: BASE + '?tab=friends' }] });
    await t.fire('activate', {});
    await t.until(() => t.held.length === 1);
    expect(t.windows.map((w) => w.navigated.length)).toEqual([0, 0]); // ainda dentro da espera
    await t.tick();
    expect(t.windows[0].navigated).toEqual([NEXT]); // nada de repetir ?add=250 (registraria 250 ml de novo)
    expect(t.windows[1].navigated).toEqual([NEXT]);
  });
  it('quem respondeu "sw-ack" (telas da 1.5.1 em diante) cuida de si: o worker não a recarrega; a que ficou calada é recarregada', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{}, {}, {}] });
    await t.fire('activate', {});
    await t.until(() => t.held.length === 1 && t.windows.every((w) => w.posts.length));
    await ack(t, 0);
    await ack(t, 2);
    await t.tick();
    expect(t.windows.map((w) => w.navigated.length)).toEqual([0, 1, 0]);
  });
  it('uma tela aberta DEPOIS do aviso (já nasceu nova, não estava na lista) nunca é recarregada; nem a que recarregou sozinha e mudou de id', async () => {
    let phase = 0;
    const bad = [];
    const mk = (id) => ({ id: id, url: BASE, postMessage() {}, navigate() { bad.push(id); return Promise.resolve(); } });
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{ id: 'velha' }, { id: 'recarregou' }],
      matchAll: (ws) => (phase === 0 ? ws : [ws[0], mk('nova-id'), mk('recem-aberta')]) });
    await t.fire('activate', {});
    await t.until(() => t.held.length === 1 && t.windows[0].posts.length);
    phase = 1; // na segunda olhada: 'velha' continua lá, 'recarregou' virou 'nova-id' e apareceu 'recem-aberta'
    await t.tick();
    expect(t.windows[0].navigated).toEqual([NEXT]);
    expect(bad).toEqual([]); // 'recarregou'/'nova-id'/'recem-aberta' não estavam no aviso: ninguém recarregou
  });
  it('navigate que falha (tela que fechou, navegador sem a função) não derruba nada, e as outras telas ainda são recarregadas', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{ navigate() { return Promise.reject(new Error('fechou')); } }, { navigate() { throw new Error('boom'); } }, { navigate: undefined }, {}] });
    await t.fire('activate', {});
    await t.until(() => t.held.length === 1 && t.windows[3].posts.length);
    await t.tick();
    expect(t.windows[3].navigated).toEqual([NEXT]);
  });
  it('uma tela que fechou no instante do aviso (postMessage lança) não impede as outras de serem avisadas nem recarregadas', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{ postMessage() { throw new Error('fechou'); } }, {}] });
    await t.fire('activate', {});
    await t.until(() => t.held.length === 1 && t.windows[1].posts.length);
    await t.tick();
    expect(t.windows[1].posts).toEqual([{ type: 'sw-updated', version: VER }]);
    expect(t.windows[1].navigated).toEqual([NEXT]);
  });
  it('matchAll falhando: o aviso nunca vira erro solto (a ativação em si não depende dele)', async () => {
    const a = boot({ active: true, cacheKeys: ['mare-1.5.0'], matchAllFails: true });
    await a.fire('install', {});
    await a.fire('activate', {});
    await a.tick();
    expect(a.skips).toHaveLength(1); // a ativação aconteceu normalmente
  });
  it('sem nenhuma tela do Maré aberta (a atualização chegou com o app fechado): não há o que avisar, e nenhum timer fica pendurado', async () => {
    const t = boot({ active: true, cacheKeys: ['mare-1.5.0'], windows: [{ url: OUTRO }] });
    await t.fire('activate', {});
    await new Promise((r) => { setTimeout(r, 20); });
    expect(t.held).toHaveLength(0);
    expect(t.windows[0].posts).toEqual([]);
  });
});

describe('atualização automática: mensagens das telas', () => {
  it('o botão "Atualizar" das telas antigas (SKIP_WAITING) continua funcionando', async () => {
    const t = boot();
    await t.fire('message', { data: { type: 'SKIP_WAITING' } });
    expect(t.skips).toHaveLength(1);
  });
  it('"sw-hello": o worker responde a versão dele para quem perguntou (a tela compara com a dela)', async () => {
    const t = boot({ windows: [{}] });
    const posts = [];
    await t.fire('message', { data: { type: 'sw-hello' }, source: { id: 'x', postMessage: (m) => posts.push(m) } });
    expect(posts).toEqual([{ type: 'sw-version', version: VER }]);
    expect(t.windows[0].posts).toEqual([]);
  });
  it('"sw-hello" sem saber quem perguntou: responde só às telas do Maré', async () => {
    const t = boot({ windows: [{}, { url: OUTRO }, {}] });
    await t.fire('message', { data: { type: 'sw-hello' } });
    expect(t.windows.map((w) => w.posts.length)).toEqual([1, 0, 1]);
    expect(t.windows[0].posts[0]).toEqual({ type: 'sw-version', version: VER });
  });
  it('mensagens estranhas (sem dados, texto, tipo desconhecido, "sw-ack" sem id) são ignoradas sem erro', async () => {
    const t = boot({ windows: [{}] });
    for (const d of [undefined, null, 'oi', 42, {}, { type: 'qualquer' }, { type: 'sw-ack' }]) await t.fire('message', { data: d });
    await t.fire('message', { data: { type: 'sw-ack' }, source: {} });
    expect(t.skips).toHaveLength(0);
    expect(t.windows[0].posts).toEqual([]);
  });
});

describe('atualização automática: a tela do app com ?upd=1 e os outros caminhos continuam iguais', () => {
  const nav = (url) => { const r = { p: undefined }; return { r, e: { request: { method: 'GET', url: url, mode: 'navigate' }, respondWith: (p) => { r.p = p; }, waitUntil() {} } }; };
  it('a tela do app com ?upd=1 sai do cache como qualquer outra abertura do app (a busca na URL é ignorada)', async () => {
    const t = boot({ shell: 'TELA-DO-APP' });
    for (const u of [BASE + '?upd=1', BASE + '?add=250', BASE + 'index.html?upd=1']) {
      const { r, e } = nav(u);
      t.handlers.fetch(e);
      expect(r.p, u).toBeDefined();
      expect(await r.p, u).toBe('TELA-DO-APP');
    }
  });
  it('o próprio sw.js nunca passa pelo cache (a checagem de versão nova sempre vai à rede)', () => {
    const t = boot({ shell: 'x' });
    const { r, e } = nav(BASE + 'sw.js');
    t.handlers.fetch(e);
    expect(r.p).toBeUndefined();
  });
});

describe('versão', () => {
  it('sw.js, app.js e package.json anunciam a mesma versão (é ela que dispara o "Nova versão disponível")', () => {
    const sw = /const VERSION = '([^']+)'/.exec(SRC)[1];
    const app = /export const APP_VERSION = '([^']+)'/.exec(readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8'))[1];
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    expect(app).toBe(sw);
    expect(pkg).toBe(sw);
  });
  it('o cache do app leva a versão no nome', () => {
    expect(SRC).toContain("const CACHE = 'mare-' + VERSION");
  });
});
