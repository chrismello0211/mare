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

// Carrega o sw.js num contexto isolado. opt: { windows: [{url, focus, postMessage}], idb: 'ok' (caixa de entrada de mentira; sem isso o
// IndexedDB "não existe") }. Cada janela de mentira é do Maré (url = BASE) a menos que o teste diga outra coisa.
function boot(opt) {
  opt = opt || {};
  const handlers = {}, shown = [], opened = [], badges = [], cleared = [], closed = [], settled = [], stored = [];
  const windows = (opt.windows || []).map((w) => Object.assign({ posts: [], focused: 0, url: BASE,
    postMessage(m) { this.posts.push(m); }, focus() { this.focused++; return Promise.resolve(this); } }, w));
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
      // slowShow: a notificação só "termina de aparecer" um pouco depois, como no navegador: quem não a entrega ao waitUntil não a espera
      showNotification: (title, o) => { shown.push({ title, o }); return opt.slowShow ? new Promise((r) => { setTimeout(() => { settled.push(1); r(); }, 5); }) : Promise.resolve(); },
      getNotifications: () => Promise.resolve([{ close: () => { closed.push(1); } }]),
    },
    clients: { matchAll: () => Promise.resolve(windows), openWindow: (u) => { opened.push(u); return Promise.resolve(); }, claim: () => Promise.resolve() },
    // setAppBadge nunca deve ser chamado (o selo saiu); clearAppBadge é o que zera. badgeFails: a API existe, mas recusa (permissão negada)
    navigator: opt.noBadge ? {} : { setAppBadge: (n) => { badges.push(n); return Promise.resolve(); },
      clearAppBadge: () => { cleared.push(1); return opt.badgeFails ? Promise.reject(new Error('sem permissão')) : Promise.resolve(); } },
    skipWaiting() {},
  };
  // o único timer do sw.js é a pausa de 4 s antes de fechar o "+250 ml registrados": aqui ela dura 1 ms
  const ctx = { self, URL, Promise, console, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 1)), Request: function Request(u) { this.url = u; }, caches: { open: () => Promise.resolve({ addAll: () => Promise.resolve(), add: () => Promise.resolve() }), keys: () => Promise.resolve([]), match: () => Promise.resolve(null) },
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
  // push: o FCM entrega { data: {...}, from, priority, fcmMessageId }; raw = true manda o texto como está
  const push = (payload, raw) => fire('push', { data: payload === undefined ? null : { json: () => (raw ? JSON.parse(payload) : payload), text: () => String(raw ? payload : JSON.stringify(payload)) } });
  const click = (data, action) => fire('notificationclick', { action: action || '', notification: { data: data, close: () => { closed.push('n'); } } });
  return { handlers, shown, opened, badges, cleared, closed, windows, push, click, fire, settled, stored };
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
