// Maré — testes da atualização automática, lado da página (public/js/platform.js, 1.5.1), sem navegador: o arquivo roda de verdade com um
// navigator.serviceWorker de mentira e as mensagens do worker (sw-updated, sw-version) chegam como o navegador as entregaria.
// O que se prova: a tela só considera que ficou para trás quando o worker que a controla é de uma versão MAIOR que a dela; ela responde
// "sw-ack" (para o worker não recarregá-la no susto); a 1ª instalação nunca recarrega; a trava anti-laço funciona; o botão "Atualizar" continua.
// (O lado do worker está em tests/sw.test.js; o app inteiro, com um Service Worker de verdade, em tests/e2e-update.spec.js.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const HREF = 'https://chrismello0211.github.io/mare/';
const NEW = 'https://chrismello0211.github.io/mare/?upd=1';

// O ambiente de mentira: um navigator.serviceWorker (EventTarget), a "registration", document/window (EventTarget), location e sessionStorage.
function env(o) {
  o = o || {};
  const store = {};
  const sw = new EventTarget();
  const mkCtl = () => ({ posts: [], postMessage(m) { this.posts.push(m); } });
  sw.controller = o.controller === undefined ? mkCtl() : o.controller;
  sw.registered = [];
  const reg = new EventTarget();
  reg.waiting = o.waiting || null; reg.installing = null; reg.updates = 0;
  reg.update = () => { reg.updates++; return o.updateFails ? Promise.reject(new Error('sem rede')) : Promise.resolve(); };
  sw.register = (u, opt) => { sw.registered.push([u, opt]); return o.registerFails ? Promise.reject(new Error('bloqueado')) : Promise.resolve(reg); };
  const doc = new EventTarget(); doc.readyState = 'complete'; doc.visibilityState = o.visibility || 'visible';
  const win = new EventTarget();
  const loc = { hostname: o.host || 'chrismello0211.github.io', protocol: o.protocol || 'https:', href: o.href || HREF, replaced: [], reloaded: 0,
    replace(u) { if (o.replaceFails) throw new Error('boom'); this.replaced.push(u); }, reload() { this.reloaded++; } };
  const ss = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { if (o.ssFails) throw new Error('privado'); store[k] = String(v); } };
  vi.stubGlobal('navigator', o.noSW ? { userAgent: 'teste' } : { userAgent: 'teste', serviceWorker: sw });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('location', loc);
  vi.stubGlobal('sessionStorage', ss);
  const emit = (target, type, props) => { target.dispatchEvent(Object.assign(new Event(type), props || {})); };
  return { sw, reg, doc, win, loc, store, emit,
    msg: (data, source) => emit(sw, 'message', { data, source }),                       // o worker fala com a tela
    flush: async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); } };       // deixa o register().then(...) rodar
}
const load = async () => { vi.resetModules(); return import('../public/js/platform.js'); };
const hellos = (e) => e.sw.controller.posts.filter((m) => m.type === 'sw-hello').length;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('newer(): a tela só fica "velha" para uma versão MAIOR', () => {
  it('compara número a número (1.5.10 > 1.5.9) e nunca considera maior o que é igual, menor ou estranho', async () => {
    env();
    const { newer } = await load();
    const yes = [['1.5.1', '1.5.0'], ['1.5.10', '1.5.9'], ['1.6.0', '1.5.9'], ['2.0.0', '1.99.99'], ['1.6', '1.5.9'], ['1.5.1', '1.5']];
    const no = [['1.5.0', '1.5.1'], ['1.5.1', '1.5.1'], ['1.5', '1.5.0'], ['1.5.9', '1.5.10'], ['1.4.0', '1.5.0'], ['2', '2.0.0'],
      ['1.5.1', undefined], [undefined, '1.5.0'], [null, null], ['', '1.0.0'], ['1.0.0', ''], ['abc', '1.0.0'], ['1.5.1-beta', '1.5.0'], ['1.5.1', 'x'], [151, '1.5.0'], ['1.5.1.2', '1.5.0']];
    yes.forEach(([a, b]) => { expect(newer(a, b), a + ' > ' + b).toBe(true); });
    no.forEach(([a, b]) => { expect(newer(a, b), a + ' > ' + b).toBe(false); });
  });
});

describe('reloadApp() e a trava anti-laço', () => {
  it('recarrega pelo endereço limpo do app com ?upd=1 (sem ?add=, ?tab= nem #) e anota versão e hora', async () => {
    const e = env({ href: HREF + 'index.html?add=250&tab=friends#x' });
    const { reloadApp } = await load();
    reloadApp('1.5.1');
    expect(e.loc.replaced).toEqual([NEW]);
    expect(JSON.parse(e.store['mare:ar'])).toEqual({ v: '1.5.1', t: Date.now() });
  });
  it('sem sessionStorage (navegação privada) ou com location.replace falhando, ainda recarrega', async () => {
    const a = env({ ssFails: true });
    let m = await load();
    m.reloadApp('1.5.1');
    expect(a.loc.replaced).toEqual([NEW]);
    const b = env({ replaceFails: true });
    m = await load();
    m.reloadApp('1.5.1');
    expect(b.loc.reloaded).toBe(1);
  });
  it('autoReloadOk: a mesma versão que recarregou sozinha há menos de 5 min e continua aqui NÃO recarrega de novo; versão diferente, tempo passado ou lixo guardado, sim', async () => {
    const e = env();
    const { autoReloadOk, reloadApp } = await load();
    expect(autoReloadOk('1.5.1')).toBe(true);                // nunca recarregou
    reloadApp('1.5.1');
    expect(autoReloadOk('1.5.1')).toBe(false);               // recarregou agora e continua na 1.5.1: a recarga não adiantou
    expect(autoReloadOk('1.5.2')).toBe(true);                // mudou de versão: é outra atualização
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(autoReloadOk('1.5.1')).toBe(false);
    vi.advanceTimersByTime(61 * 1000);
    expect(autoReloadOk('1.5.1')).toBe(true);                // passou de 5 min
    e.store['mare:ar'] = '{{ não é json';
    expect(autoReloadOk('1.5.1')).toBe(true);
    e.store['mare:ar'] = JSON.stringify({ v: '', t: Date.now() }); // o botão "Atualizar" grava sem versão
    expect(autoReloadOk('1.5.1')).toBe(true);
    const f = env({ ssFails: true });
    f.store['mare:ar'] = JSON.stringify({ v: '1.5.1', t: Date.now() });
    expect(autoReloadOk('1.5.1')).toBe(false); // lê normalmente mesmo que gravar falhe
  });
});

describe('registerSW(): só onde há Service Worker e HTTPS (ou localhost)', () => {
  it('sem Service Worker no navegador, ou em http fora do localhost: não registra nada e não quebra', async () => {
    env({ noSW: true });
    let m = await load();
    expect(() => m.registerSW({ version: '1.5.1' })).not.toThrow();
    const e = env({ protocol: 'http:', host: 'exemplo.com' });
    m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    expect(e.sw.registered).toEqual([]);
  });
  it('registra ./sw.js sem usar o cache HTTP para a checagem de versão (o GitHub Pages guarda 10 min)', async () => {
    const e = env();
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    expect(e.sw.registered).toEqual([['./sw.js', { updateViaCache: 'none' }]]);
  });
  it('registro recusado (modo privado, política do navegador) não derruba o app', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = env({ registerFails: true });
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('registerSW(): o worker avisa que assumiu ("sw-updated")', () => {
  it('versão do worker MAIOR que a da tela: responde "sw-ack" (o worker não a recarrega) e pede a recarga ao app, uma vez só', async () => {
    const e = env();
    const m = await load(), onStale = vi.fn();
    m.registerSW({ version: '1.5.0', onStale });
    await e.flush();
    e.msg({ type: 'sw-updated', version: '1.5.1' });
    e.msg({ type: 'sw-updated', version: '1.5.1' }); // o aviso pode chegar repetido (duas janelas, reenvio): a recarga é pedida uma vez
    expect(e.sw.controller.posts.filter((p) => p.type === 'sw-ack')).toHaveLength(2);
    expect(onStale).toHaveBeenCalledTimes(1);
  });
  it('mesma versão (a tela já nasceu nova) ou mais antiga: responde "sw-ack" mas NÃO recarrega', async () => {
    for (const v of ['1.5.1', '1.5.0', '1.4.9']) {
      const e = env();
      const m = await load(), onStale = vi.fn();
      m.registerSW({ version: '1.5.1', onStale });
      await e.flush();
      e.msg({ type: 'sw-updated', version: v });
      expect(e.sw.controller.posts.some((p) => p.type === 'sw-ack'), v).toBe(true);
      expect(onStale, v).not.toHaveBeenCalled();
    }
  });
  it('sem a versão da tela (h.version) ou do worker, na dúvida não recarrega', async () => {
    const e = env();
    const m = await load(), onStale = vi.fn();
    m.registerSW({ onStale });
    await e.flush();
    e.msg({ type: 'sw-updated', version: '9.9.9' });
    e.msg({ type: 'sw-updated' });
    expect(onStale).not.toHaveBeenCalled();
  });
  it('sem controller na hora (tela ainda não reivindicada), o "sw-ack" volta pelo próprio worker que mandou o aviso', async () => {
    const e = env({ controller: null });
    const m = await load();
    m.registerSW({ version: '1.5.0', onStale() {} });
    await e.flush();
    const src = { posts: [], postMessage(x) { this.posts.push(x); } };
    e.msg({ type: 'sw-updated', version: '1.5.1' }, src);
    expect(src.posts).toEqual([{ type: 'sw-ack' }]);
  });
  it('sem onStale, cai no aviso "Nova versão disponível" (onUpdate)', async () => {
    const e = env();
    const m = await load(), onUpdate = vi.fn();
    m.registerSW({ version: '1.5.0', onUpdate });
    await e.flush();
    e.msg({ type: 'sw-updated', version: '1.5.1' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
  it('as outras mensagens do worker (inbox, go) seguem para o app, e as do protocolo novo não vazam para ele', async () => {
    const e = env();
    const m = await load(), onMessage = vi.fn();
    m.registerSW({ version: '1.5.1', onMessage, onStale() {} });
    await e.flush();
    e.msg({ type: 'inbox' });
    e.msg({ type: 'go', tab: 'friends' });
    e.msg(undefined);
    e.msg({ type: 'sw-updated', version: '1.5.1' });
    e.msg({ type: 'sw-version', version: '1.5.1' });
    expect(onMessage.mock.calls.map((c) => c[0])).toEqual([{ type: 'inbox' }, { type: 'go', tab: 'friends' }, {}]);
  });
});

describe('registerSW(): quando outro worker assume (controllerchange) a tela pergunta a versão', () => {
  it('pergunta "sw-hello" ao novo controller e só pede a recarga se a resposta for uma versão MAIOR (nenhuma recarga às cegas)', async () => {
    const e = env();
    const m = await load(), onStale = vi.fn();
    m.registerSW({ version: '1.5.0', onStale });
    await e.flush();
    const before = hellos(e);
    e.sw.controller = { posts: [], postMessage(x) { this.posts.push(x); } }; // outro worker assumiu
    e.emit(e.sw, 'controllerchange');
    expect(e.sw.controller.posts).toEqual([{ type: 'sw-hello' }]);
    expect(before).toBeGreaterThanOrEqual(1); // e já tinha perguntado ao abrir
    expect(onStale).not.toHaveBeenCalled();   // só perguntar não recarrega
    e.msg({ type: 'sw-version', version: '1.5.1' });
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(e.loc.replaced).toEqual([]); // quem recarrega é o app (quando estiver tranquilo), não o platform.js
  });
  it('1ª instalação: o worker reivindica a tela (controllerchange) e a versão dele é a da própria tela: nada recarrega', async () => {
    const e = env({ controller: null });
    const m = await load(), onStale = vi.fn();
    m.registerSW({ version: '1.5.1', onStale });
    await e.flush();
    e.sw.controller = { posts: [], postMessage(x) { this.posts.push(x); } };
    e.emit(e.sw, 'controllerchange');
    e.msg({ type: 'sw-version', version: '1.5.1' });
    expect(onStale).not.toHaveBeenCalled();
    expect(e.loc.replaced).toEqual([]);
    expect(e.loc.reloaded).toBe(0);
  });
  it('controllerchange sem controller (registro removido) não pergunta nada nem quebra', async () => {
    const e = env();
    const m = await load();
    m.registerSW({ version: '1.5.1', onStale() {} });
    await e.flush();
    e.sw.controller = null;
    expect(() => e.emit(e.sw, 'controllerchange')).not.toThrow();
  });
  it('resposta de versão menor, igual ou repetida nunca recarrega', async () => {
    const e = env();
    const m = await load(), onStale = vi.fn();
    m.registerSW({ version: '1.5.1', onStale });
    await e.flush();
    ['1.5.1', '1.5.0', '1.4.0', undefined, 'x'].forEach((v) => e.msg({ type: 'sw-version', version: v }));
    expect(onStale).not.toHaveBeenCalled();
  });
});

describe('registerSW(): procurar versão nova', () => {
  it('ao abrir (com o app à vista): procura uma versão nova no servidor e pergunta ao worker qual é a dele', async () => {
    const e = env();
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    expect(e.reg.updates).toBe(1);
    expect(hellos(e)).toBe(1);
  });
  it('com a tela escondida não procura nada (nem gasta a rede do aparelho)', async () => {
    const e = env({ visibility: 'hidden' });
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    expect(e.reg.updates).toBe(0);
    e.emit(e.doc, 'visibilitychange');
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(e.reg.updates).toBe(0);
  });
  it('ao voltar para o app, ao voltar do cache de avançar/voltar (só se veio do cache), ao ter internet de novo e de 20 em 20 minutos', async () => {
    const e = env();
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    const n0 = e.reg.updates;
    e.emit(e.doc, 'visibilitychange');
    expect(e.reg.updates).toBe(n0 + 1);
    e.emit(e.win, 'pageshow', { persisted: false });
    expect(e.reg.updates).toBe(n0 + 1);
    e.emit(e.win, 'pageshow', { persisted: true });
    expect(e.reg.updates).toBe(n0 + 2);
    e.emit(e.win, 'online');
    expect(e.reg.updates).toBe(n0 + 3);
    vi.advanceTimersByTime(19 * 60 * 1000);
    expect(e.reg.updates).toBe(n0 + 3);
    vi.advanceTimersByTime(61 * 1000);
    expect(e.reg.updates).toBe(n0 + 4);
    expect(hellos(e)).toBe(n0 + 4); // cada checagem também pergunta a versão do worker (aviso perdido com o iPhone suspenso)
  });
  it('sem internet (reg.update rejeita) nada vira erro solto', async () => {
    const e = env({ updateFails: true });
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    e.emit(e.doc, 'visibilitychange');
    await e.flush();
    expect(e.reg.updates).toBe(2);
  });
});

describe('registerSW(): worker "esperando" (plano B: só sobra se a instalação dele não deu certo)', () => {
  it('só avisa "Nova versão disponível" se ele CONTINUAR esperando depois de alguns segundos (sem piscar a faixa antes da recarga automática)', async () => {
    const w = { state: 'installed', postMessage() {} };
    const e = env({ waiting: w });
    const m = await load(), onUpdate = vi.fn();
    m.registerSW({ version: '1.5.1', onUpdate });
    await e.flush();
    expect(onUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(onUpdate).not.toHaveBeenCalled(); // ainda dentro da espera: a recarga automática tem esse tempo para acontecer
    vi.advanceTimersByTime(600);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
  it('um worker esperando numa tela que nenhum worker controla (recarga forçada) não vira aviso', async () => {
    const w = { state: 'installed', postMessage() {} };
    const e = env({ waiting: w, controller: null });
    const m = await load(), onUpdate = vi.fn();
    m.registerSW({ version: '1.5.1', onUpdate });
    await e.flush();
    vi.advanceTimersByTime(5000);
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('se o worker assumiu sozinho nesse meio-tempo, a faixa nem aparece', async () => {
    const w = { state: 'installed', postMessage() {} };
    const e = env({ waiting: w });
    const m = await load(), onUpdate = vi.fn();
    m.registerSW({ version: '1.5.1', onUpdate });
    await e.flush();
    w.state = 'activated';
    vi.advanceTimersByTime(5000);
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('um worker novo que termina de instalar com a tela já controlada passa pela mesma regra; na 1ª instalação (sem controller) não avisa', async () => {
    const e = env();
    const m = await load(), onUpdate = vi.fn();
    m.registerSW({ version: '1.5.1', onUpdate });
    await e.flush();
    const w = Object.assign(new EventTarget(), { state: 'installing' });
    e.reg.installing = w;
    e.emit(e.reg, 'updatefound');
    w.state = 'installed';
    e.emit(w, 'statechange');
    vi.advanceTimersByTime(3100);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const f = env({ controller: null }), onU2 = vi.fn();
    const m2 = await load();
    m2.registerSW({ version: '1.5.1', onUpdate: onU2 });
    await f.flush();
    const w2 = Object.assign(new EventTarget(), { state: 'installing' });
    f.reg.installing = w2;
    f.emit(f.reg, 'updatefound');
    w2.state = 'installed';
    f.emit(w2, 'statechange');
    vi.advanceTimersByTime(5000);
    expect(onU2).not.toHaveBeenCalled();
  });
});

describe('applyUpdate(): o botão "Atualizar" continua valendo', () => {
  it('sem worker esperando: só recarrega (pelo endereço limpo, com ?upd=1)', async () => {
    const e = env();
    const m = await load();
    m.registerSW({ version: '1.5.1' });
    await e.flush();
    m.applyUpdate();
    expect(e.loc.replaced).toEqual([NEW]);
  });
  it('com um worker esperando: manda ele assumir (SKIP_WAITING) e recarrega quando ele assumir, ou depois de 3 s se o aviso não vier', async () => {
    const w = { state: 'installed', posts: [], postMessage(x) { this.posts.push(x); } };
    const e = env({ waiting: w });
    const m = await load();
    m.registerSW({ version: '1.5.1', onStale() {} });
    await e.flush();
    m.applyUpdate();
    expect(w.posts).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(e.loc.replaced).toEqual([]);
    e.emit(e.sw, 'controllerchange'); // ele assumiu: como foi a pessoa que pediu, recarrega na hora (sem perguntar versão)
    expect(e.loc.replaced).toEqual([NEW]);
    vi.advanceTimersByTime(3100);
    expect(e.loc.replaced).toHaveLength(2); // o plano B de 3 s também dispara (recarregar duas vezes para o mesmo endereço é inofensivo)
  });
});
