// Maré — testes da fila do horário de silêncio (functions/quiet.js). Rodar: npm test
// Um aviso que chega com a pessoa dormindo espera em pushq/{uid} e sai quando ela acorda. Aqui só a parte pura: o que entra na fila, o que a fila
// esquece, o que sai. (A transação no Firestore e o envio estão em tests/rules/friend-push.test.js, contra o emulador.)
import { describe, it, expect } from 'vitest';
import * as Q from '../functions/quiet.js';
import { TTL, KINDS, digestMessage } from '../functions/social-push.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0); // segunda, 19/10/2026, 12:00 em Greenwich
const WAKE = NOW + 5 * HOUR; // quando ela acorda (um número qualquer: a fila só o guarda)
const NB = ' ';
const m = (kind, who, extra) => Object.assign({ title: 'Título ' + kind + who, body: 'Corpo ' + kind + who, tag: 'tag-' + kind + '-' + who, url: './?tab=friends' }, extra || {});
const held = (kind, who, at, extra) => Q.heldItem({ kind: kind, from: who }, m(kind, who, extra), at);

describe('HOLD: quanto tempo cada aviso ainda vale na fila', () => {
  it('um tempo para cada tipo de aviso da turma, e nenhum a mais', () => {
    expect(Object.keys(Q.HOLD).sort()).toEqual(KINDS.slice().sort());
  });
  it('pedido e aceite esperam 2 dias; entrada na turma 1 dia; aceno e resumo 12 h; meta batida só 4 h (fica velha logo)', () => {
    expect(Q.HOLD).toEqual({ request: 48 * HOUR, accepted: 48 * HOUR, joined: DAY, wave: 12 * HOUR, hit: 4 * HOUR, week: 12 * HOUR });
  });
  it('nenhum aviso espera mais de 2 dias, e o documento da fila some do Firestore no máximo 3 dias depois de chegar', () => {
    KINDS.forEach((k) => {
      expect(Q.HOLD[k]).toBeGreaterThan(0);
      expect(Q.HOLD[k]).toBeLessThanOrEqual(2 * DAY);
      expect(Q.addHeld(null, held(k, 'x', NOW), NOW, WAKE).exp.getTime()).toBeLessThanOrEqual(NOW + 3 * DAY);
    });
  });
  it('a fila guarda no máximo 20 avisos', () => { expect(Q.Q_MAX).toBe(20); });
});

describe('heldItem: o que fica guardado de um aviso', () => {
  it('só o necessário para montar o push depois: tipo, hora, tag, título, texto e endereço', () => {
    const it = held('wave', 'ana', NOW);
    expect(it).toEqual({ k: 'wave', at: NOW, tag: 'tag-wave-ana', title: 'Título waveana', body: 'Corpo waveana', url: './?tab=friends' });
  });
  it('não leva quem fez, nem quem recebe, nem nada que o aviso não mostre', () => {
    const it = Q.heldItem({ kind: 'wave', from: 'ana', to: 'bia', wave: 'hi', again: true, names: ['x'] }, m('wave', 'ana'), NOW);
    expect(Object.keys(it).sort()).toEqual(['at', 'body', 'k', 'tag', 'title', 'url']);
  });
  it('entrada na turma guarda quantas pessoas chegaram (n), para o resumo contar certo', () => {
    expect(Q.heldItem({ kind: 'joined', from: 'x', n: 4, names: ['A', 'B'] }, m('joined', 'x'), NOW).n).toBe(4);
    expect(Q.heldItem({ kind: 'joined', from: 'x', names: ['A', 'B'] }, m('joined', 'x'), NOW).n).toBe(2); // sem n: os nomes
    expect(Q.heldItem({ kind: 'joined', from: 'x' }, m('joined', 'x'), NOW).n).toBe(1); // sem nada: pelo menos 1
    expect(Q.heldItem({ kind: 'joined', from: 'x', n: 'abc', names: [] }, m('joined', 'x'), NOW).n).toBe(1);
    expect(Q.heldItem({ kind: 'joined', from: 'x', n: -3 }, m('joined', 'x'), NOW).n).toBe(1);
    expect(Q.heldItem({ kind: 'joined', from: 'x', n: 2.9 }, m('joined', 'x'), NOW).n).toBe(2);
  });
  it('os outros tipos não têm n', () => {
    ['request', 'accepted', 'wave', 'hit', 'week'].forEach((k) => expect(held(k, 'x', NOW)).not.toHaveProperty('n'));
  });
});

describe('addHeld: um aviso novo entra na fila', () => {
  it('fila vazia (ou ainda não existe): só ele, com a hora em que ela acorda', () => {
    const it = held('wave', 'ana', NOW);
    [null, undefined, {}, { items: 'x' }, 'lixo', 42].forEach((doc) => {
      const d = Q.addHeld(doc, it, NOW, WAKE);
      expect(d.items).toEqual([it]);
      expect(d.due).toBe(WAKE);
    });
  });
  it('o mesmo tag SUBSTITUI o anterior (e o novo vai para o fim): na tela do aparelho também seria assim', () => {
    const a1 = held('wave', 'ana', NOW - 3 * HOUR), b = held('wave', 'bia', NOW - 2 * HOUR), a2 = held('wave', 'ana', NOW - 1 * HOUR, { body: 'de novo' });
    let d = Q.addHeld(null, a1, NOW - 3 * HOUR, WAKE);
    d = Q.addHeld(d, b, NOW - 2 * HOUR, WAKE);
    d = Q.addHeld(d, a2, NOW - 1 * HOUR, WAKE);
    expect(d.items.map((x) => x.tag)).toEqual(['tag-wave-bia', 'tag-wave-ana']);
    expect(d.items[1].body).toBe('de novo');
  });
  it('tags diferentes se acumulam, do mais antigo ao mais novo', () => {
    let d = null;
    ['ana', 'bia', 'caio'].forEach((who, i) => { d = Q.addHeld(d, held('wave', who, NOW - (3 - i) * HOUR), NOW - (3 - i) * HOUR, WAKE); });
    expect(d.items.map((x) => x.tag)).toEqual(['tag-wave-ana', 'tag-wave-bia', 'tag-wave-caio']);
  });
  it('quem já venceu sai na hora (cada tipo no seu prazo)', () => {
    const oldHit = held('hit', 'x', NOW - 5 * HOUR), oldWave = held('wave', 'y', NOW - 13 * HOUR), oldReq = held('request', 'z', NOW - 40 * HOUR);
    const doc = { items: [oldHit, oldWave, oldReq], due: 1, exp: new Date(0) };
    const d = Q.addHeld(doc, held('joined', 'w', NOW), NOW, WAKE);
    expect(d.items.map((x) => x.k)).toEqual(['request', 'joined']); // a meta (4 h) e o aceno (12 h) venceram; o pedido (48 h) ainda vale
  });
  it('item estragado no documento (alguém mexeu à mão) é descartado, sem quebrar', () => {
    const ok = held('wave', 'ana', NOW - HOUR);
    const bad = [null, 7, 'x', [], {}, { k: 'zzz', at: NOW, tag: 't', title: 't', body: 'b', url: 'u' }, Object.assign({}, ok, { tag: '' }), Object.assign({}, ok, { title: 'x'.repeat(301) }),
      Object.assign({}, ok, { body: 'x'.repeat(601) }), Object.assign({}, ok, { url: 'x'.repeat(201) }), Object.assign({}, ok, { tag: 'x'.repeat(121) }), Object.assign({}, ok, { at: 'ontem' }),
      Object.assign({}, ok, { at: NaN }), Object.assign({}, ok, { at: NOW + 2 * HOUR }) /* do futuro */, Object.assign({}, ok, { tag: 5 })];
    const d = Q.addHeld({ items: bad.concat([ok]) }, held('hit', 'novo', NOW), NOW, WAKE);
    expect(d.items.map((x) => x.tag)).toEqual(['tag-wave-ana', 'tag-hit-novo']);
  });
  it('a fila nunca passa de 20: os mais antigos saem primeiro', () => {
    let d = null;
    for (let i = 0; i < 35; i++) d = Q.addHeld(d, held('wave', 'p' + i, NOW - (35 - i) * 60e3), NOW - (35 - i) * 60e3, WAKE);
    expect(d.items).toHaveLength(Q.Q_MAX);
    expect(d.items[0].tag).toBe('tag-wave-p15');
    expect(d.items[19].tag).toBe('tag-wave-p34');
  });
  it('exp: um dia depois do último prazo (o Firestore pode apagar o documento depois disso)', () => {
    const w = held('wave', 'a', NOW), r = held('request', 'b', NOW - HOUR);
    const d = Q.addHeld(Q.addHeld(null, r, NOW - HOUR, WAKE), w, NOW, WAKE);
    expect(d.exp).toBeInstanceOf(Date);
    expect(d.exp.getTime()).toBe(Math.max(NOW + Q.HOLD.wave, NOW - HOUR + Q.HOLD.request) + DAY);
  });
  it('não mexe no documento que recebeu', () => {
    const doc = Object.freeze({ items: Object.freeze([Object.freeze(held('wave', 'a', NOW - HOUR))]), due: 5, exp: new Date(9) });
    expect(() => Q.addHeld(doc, held('wave', 'b', NOW), NOW, WAKE)).not.toThrow();
    expect(doc.items).toHaveLength(1);
  });
  it('só guarda o que o próprio sistema entende: nenhum campo a mais no documento (as regras do Firestore fecham pushq para os apps)', () => {
    const d = Q.addHeld(null, held('wave', 'a', NOW), NOW, WAKE);
    expect(Object.keys(d).sort()).toEqual(['due', 'exp', 'items']);
  });
});

describe('takeHeld: na hora de acordar', () => {
  it('devolve o que ainda vale, do mais antigo ao mais novo, e quantos ficaram pelo caminho', () => {
    const a = held('wave', 'a', NOW - 2 * HOUR), b = held('wave', 'b', NOW - 5 * HOUR), c = held('hit', 'c', NOW - 6 * HOUR), d = held('request', 'd', NOW - 30 * HOUR);
    const t = Q.takeHeld({ items: [a, b, c, d] }, NOW);
    expect(t.items.map((x) => x.tag)).toEqual(['tag-request-d', 'tag-wave-b', 'tag-wave-a']); // a meta (6 h) venceu
    expect(t.dropped).toBe(1);
  });
  it('no limite exato do prazo ainda vale; um milissegundo depois, não', () => {
    const edge = held('hit', 'a', NOW - Q.HOLD.hit), over = held('hit', 'b', NOW - Q.HOLD.hit - 1);
    expect(Q.takeHeld({ items: [edge] }, NOW).items).toHaveLength(1);
    expect(Q.takeHeld({ items: [over] }, NOW)).toEqual({ items: [], dropped: 1 });
  });
  it('do futuro, só até 1 minuto de folga (relógios um pouco fora de hora)', () => {
    expect(Q.takeHeld({ items: [held('wave', 'a', NOW + 60e3)] }, NOW).items).toHaveLength(1);
    expect(Q.takeHeld({ items: [held('wave', 'a', NOW + 60e3 + 1)] }, NOW).items).toHaveLength(0);
  });
  it('documento vazio, estranho ou sem lista: nada, sem quebrar', () => {
    [null, undefined, {}, { items: null }, { items: 'x' }, 'lixo', 3, []].forEach((doc) => expect(Q.takeHeld(doc, NOW)).toEqual({ items: [], dropped: 0 }));
  });
  it('quem chegou ao mesmo tempo mantém uma ordem estável e previsível (do mais antigo ao mais novo)', () => {
    const l = [held('wave', 'c', NOW - 3 * HOUR), held('wave', 'a', NOW - 1 * HOUR), held('wave', 'b', NOW - 2 * HOUR)];
    expect(Q.takeHeld({ items: l }, NOW).items.map((x) => x.tag)).toEqual(['tag-wave-c', 'tag-wave-b', 'tag-wave-a']);
  });
});

describe('readyOf: o que sai', () => {
  it('um aviso só sai como ele mesmo: o mesmo texto, o mesmo tag e o prazo do FCM do tipo dele', () => {
    KINDS.forEach((k) => {
      const it = held(k, 'x', NOW), r = Q.readyOf([it]);
      expect(r.ev).toEqual({ kind: k });
      expect(r.m).toBe(it);
      expect(r.ttl).toBe(TTL[k]);
    });
  });
  it('vários viram um resumo só, "Novidades da turma", com a conta de cada coisa', () => {
    const items = [held('request', 'a', NOW), held('wave', 'b', NOW), held('wave', 'c', NOW), held('joined', 'd', NOW, {}), held('hit', 'e', NOW)];
    const r = Q.readyOf(items);
    expect(r.ev).toEqual({ kind: 'digest' });
    expect(r.ttl).toBe(TTL.digest);
    expect(r.m).toEqual(digestMessage(items));
    expect(r.m.title).toBe('Novidades da turma' + NB + '🌊');
    expect(r.m.body).toBe('1 pedido de amizade, 1 pessoa nova na turma, 2 acenos e 1 meta batida. Toque para ver a turma.');
    expect(r.m.tag).toBe('mare-turma-novidades');
  });
  it('o resumo conta as pessoas que entraram, não os avisos', () => {
    const j1 = Q.heldItem({ kind: 'joined', from: 'a', n: 3 }, m('joined', 'a'), NOW), j2 = Q.heldItem({ kind: 'joined', from: 'b', n: 2 }, m('joined', 'b'), NOW);
    expect(Q.readyOf([j1, j2]).m.body).toBe('5 pessoas novas na turma. Toque para ver a turma.');
  });
  it('o resumo da semana e a meta entram na conta com o nome certo', () => {
    expect(Q.readyOf([held('week', 'crew', NOW), held('wave', 'a', NOW)]).m.body).toBe('1 aceno e o resumo da semana. Toque para ver a turma.');
    expect(Q.readyOf([held('hit', 'a', NOW), held('hit', 'b', NOW), held('hit', 'c', NOW)]).m.body).toBe('3 metas batidas. Toque para ver a turma.');
  });
});

describe('a fila de ponta a ponta (as três funções juntas)', () => {
  it('uma noite inteira: chegam avisos, alguns esperam demais, ela acorda e recebe o que ainda vale', () => {
    let doc = null;
    const at = (h) => NOW + h * HOUR;
    doc = Q.addHeld(doc, held('hit', 'a', at(0)), at(0), at(8)); // meta batida às 12:00: vale até 16:00
    doc = Q.addHeld(doc, held('wave', 'b', at(1)), at(1), at(8)); // aceno às 13:00: vale até 01:00
    doc = Q.addHeld(doc, held('wave', 'b', at(3), { body: 'segundo aceno' }), at(3), at(8)); // o mesmo amigo acena de novo: troca o anterior
    doc = Q.addHeld(doc, held('request', 'c', at(4)), at(4), at(8)); // pedido às 16:00: vale 2 dias
    const t = Q.takeHeld(doc, at(8)); // acordou às 20:00
    expect(t.items.map((x) => x.k)).toEqual(['wave', 'request']); // a meta venceu às 16:00
    expect(t.items[0].body).toBe('segundo aceno');
    expect(t.dropped).toBe(1);
    const out = Q.readyOf(t.items);
    expect(out.ev.kind).toBe('digest');
    expect(out.m.body).toBe('1 pedido de amizade e 1 aceno. Toque para ver a turma.');
  });
  it('propriedade: depois de qualquer sequência de avisos, a fila é válida (no máximo 20, sem tag repetido, só avisos dentro do prazo)', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    let doc = null, now = NOW;
    for (let i = 0; i < 400; i++) {
      now += Math.floor(rnd() * 40 * 60e3);
      const k = KINDS[Math.floor(rnd() * KINDS.length)], who = 'p' + Math.floor(rnd() * 30);
      doc = Q.addHeld(doc, held(k, who, now), now, now + 3 * HOUR);
      expect(doc.items.length).toBeLessThanOrEqual(Q.Q_MAX);
      expect(new Set(doc.items.map((x) => x.tag)).size).toBe(doc.items.length);
      doc.items.forEach((x) => expect(now - x.at).toBeLessThanOrEqual(Q.HOLD[x.k]));
      expect(doc.exp.getTime()).toBeGreaterThan(now);
      if (rnd() < 0.05) doc = null; // às vezes ela acorda e a fila some
    }
  });
});
