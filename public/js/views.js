// Maré — telas e painéis (Parte 3B). Só monta HTML a partir do estado; nunca o altera.
// Contrato com o app.js (Parte 3C):
//  • Cliques: elementos com data-action (+ data-day, data-id, data-ml, data-d, data-v, data-n, data-k, data-tab, data-tip),
//    tratados por delegação. O ui.js já cuida de close-sheet, confirm-ok e toast-act.
//  • Campos: inputs com data-field (name, weight, goal, wake, sleep, cup + data-i), evento "change".
//  • Painel de registro: #eMl, #eTime, #eErr. Onboarding: #obName, #obWeight, #obWake, #obSleep, #obGoal (data-total), #obDrop.
//  • "Hoje" é montado em partes com id (TODAY_PARTS) para atualizar sem redesenhar a gota (#drop).
//  • Barras com data-w crescem via ui.animBars; a gota enche via ui.dropTo(el, total, meta, dropOpts(total, meta)).
import { DRINKS, ACTIVITY, LEVELS, ACHIEVEMENTS, drink, eff, dayTotal, isMet, calcGoal, goalToday, expectedBy, dayWindow,
  streak, bestStreak, levelFor, missionFor, missionProgress, stats, insights, dayKey, keyToDate, addDays, minOf, fmtHM, fmtNum } from './core.js';
import { S, esc, clamp, plural, byT, p2, cap, MONTHS, today, longDate, shortDate, relDay, goalNow, totalNow, allMl, firstName,
  U, vol, unitL, fromMl, big, compact, presets } from './store.js';
import { svgI, sheetHead, dropSVG } from './ui.js';
import { isIOS, isAndroid, iosVersion, isStandalone, isNative, canInstall, notifStatus } from './platform.js';

/* ---------- peças ---------- */
const att = (b) => (b ? 'true' : 'false');
const btn = (action, label, cls, extra) => '<button class="btn' + (cls ? ' ' + cls : '') + '" type="button" data-action="' + action + '"' +
  (extra || '') + '>' + label + '</button>';
const sbtn = (action, label, cls) => '<button class="btn sm ' + (cls || 'ghost') + '" type="button" data-action="' + action + '">' + label + '</button>';
const sec = (t) => '<h2 class="sec-t">' + t + '</h2>';
const row = (label, note, ctrl, noteId) => '<div class="row"><div class="row-l"><span>' + label + '</span>' +
  (note || noteId ? '<small' + (noteId ? ' id="' + noteId + '"' : '') + '>' + (note || '') + '</small>' : '') +
  '</div><div class="row-c">' + ctrl + '</div></div>';
const stack = (label, note, ctrl) => '<div class="row stack"><div class="row-l"><span>' + label + '</span>' +
  (note ? '<small>' + note + '</small>' : '') + '</div><div class="row-c">' + ctrl + '</div></div>';
const sw = (action, on, label, extra) => '<button class="switch" type="button" role="switch" aria-checked="' + att(on) +
  '" aria-label="' + label + '" data-action="' + action + '"' + (extra || '') + '><span></span></button>';
const seg = (action, cur, opts, label) => '<div class="seg" role="radiogroup" aria-label="' + label + '">' + opts.map((o) =>
  '<button type="button" role="radio" aria-checked="' + att(String(o[0]) === String(cur)) + '" data-action="' + action +
  '" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
const empty = (e, t) => '<div class="empty"><span class="em" aria-hidden="true">' + e + '</span>' + t + '</div>';
const stat = (e, l, v) => '<div class="stat"><span class="em" aria-hidden="true">' + e + '</span><small>' + l + '</small><b>' + v + '</b></div>';
const tip = (id, e, title, text, b) => '<section class="card tip"><span class="em" aria-hidden="true">' + e + '</span><div class="tip-b"><b>' +
  title + '</b><p>' + text + '</p>' + (b ? btn(b[0], b[1], 'sm') : '') + '</div><button class="tip-x" type="button" data-action="tip-x" data-tip="' +
  id + '" aria-label="Dispensar dica">×</button></section>';
const steps = (list) => '<ol class="steps">' + list.map((s) => '<li>' + s + '</li>').join('') + '</ol>';
const shareIco = () => svgI('share', 'ico-share');
const fLabel = (d) => (d.f === 1 ? 'hidrata 100%' : d.f === 0 ? 'não conta na meta' : 'conta ' + Math.round(d.f * 100) + '%');
export const fmtW = (w) => String(Math.round((+w || 0) * 10) / 10).replace('.', ',');

function greet() {
  const h = new Date().getHours(), n = firstName();
  return (h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite') + (n ? ', ' + n : '');
}
// Copo com água proporcional ao volume (viewBox 28×34)
function glass(ml) {
  const y = 30.5 - clamp(ml / 650, 0.3, 0.9) * 26, k = (y - 3) * 0.1;
  return '<svg viewBox="0 0 28 34" aria-hidden="true"><path class="g-w" d="M' + (5.2 + k).toFixed(1) + ' ' + y.toFixed(1) + 'H' + (22.8 - k).toFixed(1) +
    'L20.1 30.6H7.9Z"/><path class="g-o" d="M4 3H24L21.3 30.3A2 2 0 0 1 19.3 32H8.7A2 2 0 0 1 6.7 30.3Z"/></svg>';
}

/* ---------- Hoje ---------- */
function topHTML() {
  const k = today(), st = streak(S.days, k);
  return '<header class="top"><div class="top-txt"><p class="eyebrow">' + cap(longDate(k)) + '</p><h1 class="h1">' + greet() + '</h1></div>' +
    '<button class="chip" type="button" data-action="tab" data-tab="journey" aria-label="' + plural(st, 'dia seguido', 'dias seguidos') + ' na meta">' +
    '<span aria-hidden="true">' + (st ? '🔥' : '💧') + '</span><span>' + st + '</span></button></header>';
}
export function paceInfo(total, goal, now) {
  if (total >= goal) return { c: 'done', t: 'Meta batida!' + (total - goal >= 50 ? ' +' + vol(total - goal) + ' extra' : ' 🎉') };
  now = now || Date.now();
  const p = S.profile, w = dayWindow(p.wake, p.sleep), exp = expectedBy(now, goal, p.wake, p.sleep), d = total - exp;
  if (!exp) return { c: '', t: total ? 'Ótimo começo de dia!' : 'Seu dia começa às ' + esc(p.wake) };
  if (minOf(now) >= w.end) return { c: 'behind', t: 'Faltam ' + vol(goal - total) + ' para a meta' };
  if (d >= -25) return { c: '', t: d < 50 ? 'No ritmo certo' : '+' + vol(d) + ' à frente do ritmo' };
  return { c: 'behind', t: vol(-d) + ' abaixo do ritmo' };
}
function nextLine(met) {
  const r = S.reminders, st = notifStatus();
  const b = (action, label, extra) => '<button type="button" data-action="' + action + '"' + (extra || '') + '>' + label + '</button>';
  if (r.enabled && st === 'denied') return '<p class="next">Notificações bloqueadas' + b('notif-help', 'Resolver') + '</p>';
  if (!r.enabled) return '<p class="next">Lembretes desligados' + b('reminders-on', 'Ativar') + '</p>';
  if (!r.nextAt || r.nextAt < Date.now() - 60000) return '';
  const when = (dayKey(new Date(r.nextAt)) === today() ? 'às ' : 'amanhã às ') + fmtHM(minOf(r.nextAt));
  return '<p class="next">' + (met ? 'Meta batida: lembretes voltam ' : 'Próximo lembrete ') + when + b('tab', 'Ajustar', ' data-tab="settings"') + '</p>';
}
function metaHTML() {
  const goal = goalNow(), total = totalNow(), pc = paceInfo(total, goal), g = S.goal;
  const hot = g.mode === 'auto' && g.climate && g.day === today() && g.bonus > 0;
  return '<div class="pace' + (pc.c ? ' ' + pc.c : '') + '"><span class="dot" aria-hidden="true"></span>' + pc.t + '</div>' + nextLine(total >= goal) +
    (hot ? '<p class="next">☀️ Máxima de ' + g.temp + '°C hoje: meta +' + vol(g.bonus) + '</p>' : '');
}
function quickHTML() {
  const d = drink(S.last);
  return '<section class="card" aria-label="Registro rápido"><div class="quick-top">' +
    '<button class="drink-pick" type="button" data-action="pick-drink" aria-label="Bebida atual: ' + d.l + '. Toque para trocar">' +
    '<span class="em" aria-hidden="true">' + d.e + '</span><span class="dp-t"><b>' + d.l + '</b><small>' + cap(fLabel(d)) +
    ' · toque para trocar</small></span><span class="caret" aria-hidden="true">▾</span></button>' +
    '<button class="btn-icon" type="button" data-action="add-custom" aria-label="Outro volume ou horário">' + svgI('plus') +
    '<small>Outro</small></button></div><div class="cups">' + S.cups.map((ml) => '<button class="cup" type="button" data-action="add" data-ml="' +
    ml + '" aria-label="Adicionar ' + vol(ml) + '">' + glass(ml) + '<span>' + vol(ml) + '</span></button>').join('') + '</div></section>';
}
function tipsHTML() {
  const ui = S.ui, ios = isIOS();
  if (!isStandalone() && !isNative() && !ui.tip_install && (canInstall() || ios || isAndroid())) {
    return tip('install', '📲', 'Instale o Maré', ios
      ? 'Na Tela de Início ele abre como app' + (iosVersion() >= 1604 ? ', libera os lembretes' : '') + ' e protege seus dados da limpeza automática do Safari.'
      : 'Abre em tela cheia, funciona offline e deixa os lembretes mais confiáveis.',
      canInstall() ? ['install', 'Instalar agora'] : ['install-help', 'Como instalar']);
  }
  if (S.goal.mode === 'auto' && !S.goal.climate && !ui.tip_climate && Object.keys(S.days).length >= 2) {
    return tip('climate', '☀️', 'Meta que acompanha o clima', 'Em dias quentes, o Maré aumenta sua meta sozinho. Usa só a sua região aproximada.',
      ['climate-on', 'Ativar']);
  }
  return '';
}
let lastMP = { k: '', p: 0 }; // a barra da missão cresce a partir do valor anterior, não do zero
function missionHTML() {
  const k = today(), m = missionFor(k), raw = Math.round(missionProgress(k, S.days[k], goalNow()) * 100);
  const done = !!S.missions[k] || raw >= 100, p = done ? 100 : raw, from = lastMP.k === k ? lastMP.p : 0;
  lastMP = { k: k, p: p };
  return '<section class="card mission' + (done ? ' done' : '') + '"><div class="m-ico" aria-hidden="true">' + m.e + '</div><div class="m-body">' +
    '<span class="m-k">' + (done ? 'Missão cumprida ✓' : 'Missão do dia') + '</span><span class="m-t">' + m.t + '</span>' +
    '<div class="bar" role="progressbar" aria-label="Progresso da missão" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '">' +
    '<i style="width:' + from + '%" data-w="' + p + '"></i></div></div></section>';
}
function entryItem(k, e) {
  const d = drink(e.d), v = eff(e);
  return '<li><button class="log-item" type="button" data-action="edit-entry" data-day="' + k + '" data-id="' + esc(e.id) + '">' +
    '<span class="li-e" aria-hidden="true">' + d.e + '</span><span class="li-b"><b>' + d.l + '</b><small>' + fmtHM(minOf(e.t)) +
    (v !== e.ml ? ' · ' + (v ? 'conta ' + vol(v) : 'não conta na meta') : '') + '</small></span><span class="li-v">' + vol(e.ml) + '</span></button></li>';
}
function entryList(k) {
  const d = S.days[k], es = d && d.entries ? d.entries.slice().sort(byT).reverse() : [];
  return es.length ? '<ul class="log-list">' + es.map((e) => entryItem(k, e)).join('') + '</ul>' : '';
}
function logHTML() {
  const k = today(), d = S.days[k], n = d && d.entries ? d.entries.length : 0;
  return '<section class="card"><div class="card-h"><h2>Registros de hoje</h2><small>' + (n ? plural(n, 'registro', 'registros') : '') + '</small></div>' +
    (n ? entryList(k) : empty('🫗', 'Nada por aqui ainda. Que tal começar com um copo agora?')) + '</section>';
}
export const TODAY_PARTS = { tTop: topHTML, tMeta: metaHTML, tQuick: quickHTML, tTips: tipsHTML, tMission: missionHTML, tLog: logHTML };
const part = (id) => '<div id="' + id + '">' + TODAY_PARTS[id]() + '</div>';
export function todayView() {
  return part('tTop') + '<section class="hero" aria-label="Progresso de hoje"><div class="drop-wrap" id="drop">' +
    dropSVG('hd', { pct: '', num: '', sub: '', label: 'Progresso de hoje' }) + '</div><div class="hero-meta" id="tMeta">' + metaHTML() + '</div></section>' +
    part('tQuick') + part('tTips') + part('tMission') + part('tLog');
}
export function dropOpts(total, goal) {
  return { fmt: (n) => fmtNum(n, U()), sub: 'de ' + vol(goal),
    label: vol(total) + ' de ' + vol(goal) + ' (' + Math.round((total / goal) * 100) + '% da meta)' };
}

/* ---------- painéis ---------- */
export function drinkSheet(sel) {
  return sheetHead('O que você está bebendo?') + '<div class="drinks" role="radiogroup" aria-label="Bebidas">' + DRINKS.map((d) =>
    '<button class="drink" type="button" role="radio" aria-checked="' + att(d.id === sel) + '" data-action="set-drink" data-d="' + d.id +
    '"><span class="em" aria-hidden="true">' + d.e + '</span><b>' + d.n + '</b><small>' + fLabel(d) + '</small></button>').join('') +
    '</div><p class="note">A bebida escolhida vale para os copos rápidos. Os fatores de hidratação são estimativas gerais, não orientação médica.</p>';
}
// dr = { mode: 'add'|'edit', day, id, d, ml, time: 'HH:MM' }
export function entrySheet(dr) {
  const edit = dr.mode === 'edit';
  return sheetHead(edit ? 'Editar registro' : 'Novo registro') +
    (dr.day !== today() ? '<p class="sheet-text">Registro de ' + relDay(dr.day) + '</p>' : '') +
    '<span class="lbl">Bebida</span><div class="dchips">' + DRINKS.map((x) => '<button class="pill" type="button" data-action="draft-drink" data-d="' +
      x.id + '" aria-pressed="' + att(x.id === dr.d) + '">' + x.e + '&nbsp;' + x.n + '</button>').join('') + '</div>' +
    '<label class="lbl" for="eMl">Quantidade</label><div class="amt"><input class="in" id="eMl" type="text" inputmode="numeric" pattern="[0-9]*" ' +
      'autocomplete="off" maxlength="5" value="' + fromMl(dr.ml) + '"><span class="unit">' + unitL() + '</span></div>' +
    '<div class="presets">' + presets().map((ml) => '<button class="pill" type="button" data-action="draft-ml" data-ml="' + ml + '" aria-pressed="' +
      att(Math.abs(ml - dr.ml) < 3) + '">' + vol(ml) + '</button>').join('') + '</div>' +
    '<div class="es-row"><label class="lbl" for="eTime">Horário</label><input class="in" id="eTime" type="time" value="' + esc(dr.time) + '"></div>' +
    '<div class="err" id="eErr" role="alert"></div><div class="btns">' +
    (edit ? btn('entry-del', 'Excluir', 'ghost danger') : btn('close-sheet', 'Cancelar', 'ghost')) + btn('entry-save', edit ? 'Salvar' : 'Adicionar') + '</div>';
}
export function daySheet(k) {
  const d = S.days[k], total = dayTotal(d), goal = (d && d.goal) || goalToday(S, k), pc = Math.round((total / goal) * 100);
  return sheetHead(cap(relDay(k))) + '<div class="day-sum"><div><b>' + vol(total) + '</b><small>de ' + vol(goal) + ' · ' + pc + '% da meta</small></div>' +
    (isMet(d) ? '<span class="pace done"><span class="dot" aria-hidden="true"></span>Meta batida</span>' : '') + '</div>' +
    '<div class="bar"><i data-w="' + Math.min(100, pc) + '"></i></div>' + (entryList(k) || empty('🫙', 'Nenhum registro neste dia.')) +
    btn('new-entry', '+ Adicionar registro', 'block ghost mt', ' data-day="' + k + '"');
}
export function installSheet() {
  const ios = isIOS();
  const list = ios
    ? ['Toque em <b>Compartilhar</b> ' + shareIco() + ' na barra do navegador.', 'Escolha <b>Adicionar à Tela de Início</b> (se não aparecer, role a lista).',
       'Toque em <b>Adicionar</b> e abra o Maré pelo novo ícone.']
    : ['Abra o menu <b>⋮</b> do navegador.', 'Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.', 'Confirme e abra o Maré pelo novo ícone.'];
  // No iPhone o app instalado NÃO enxerga os dados do Safari: avisar quem já tem registros
  const note = ios
    ? (iosVersion() >= 1604 ? 'Depois de instalar, ative os lembretes em Ajustes.' : 'Notificações exigem iOS 16.4 ou mais recente; até lá, use os alarmes no calendário.') +
      (Object.keys(S.days).length ? ' Atenção: no iPhone o app instalado começa vazio. Exporte um backup em Ajustes antes e importe no app instalado.' : '')
    : 'Instalado, o Maré funciona offline e os lembretes chegam com mais confiabilidade.';
  return sheetHead(ios ? 'Instalar no iPhone' : 'Instalar o Maré') + steps(list) + '<p class="note">' + note + '</p>' + btn('close-sheet', 'Entendi', 'block mt');
}
export function notifHelpSheet(st) {
  if (st === 'install') return installSheet();
  const list = isIOS()
    ? ['Abra os <b>Ajustes</b> do iPhone e toque em <b>Notificações</b>.', 'Encontre o <b>Maré</b> e ative <b>Permitir Notificações</b>.']
    : ['No app instalado: toque e segure o ícone do Maré → <b>Informações do app</b> → <b>Notificações</b>.',
       'No navegador: toque no ícone à esquerda do endereço → <b>Permissões</b> → <b>Notificações</b>.'];
  list.push('Volte aqui e ative os lembretes de novo.');
  return sheetHead(st === 'denied' ? 'Notificações bloqueadas' : 'Sem notificações neste navegador') + (st === 'denied' ? steps(list)
    : '<p class="sheet-text">Os lembretes funcionam enquanto o Maré estiver aberto. Para garantir, crie alarmes recorrentes no seu calendário.</p>') +
    '<div class="btns">' + btn('ics', 'Usar calendário', 'ghost') + btn('close-sheet', 'Entendi') + '</div>';
}

/* ---------- Histórico ---------- */
const WDS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export function historyView(ym) {
  const k = today(), goal = goalNow(), sx = stats(S, k), st = streak(S.days, k), best = bestStreak(S.days), days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(k, -i));
  const tots = days.map((d) => dayTotal(S.days[d]));
  // folga de 18%: a barra mais alta e o rótulo cabem na coluna; a linha da meta usa a mesma escala
  const max = Math.max(goal, Math.max.apply(null, tots)) / 0.82;
  const cols = days.map((d, i) => {
    const t = tots[i], met = isMet(S.days[d]);
    return '<button class="wk-col' + (met ? ' met' : '') + (d === k ? ' today' : '') + '" type="button" data-action="day" data-day="' + d +
      '" aria-label="' + cap(relDay(d)) + ': ' + vol(t) + (met ? ', meta batida' : '') + '"><span class="wk-val" aria-hidden="true">' +
      (t ? compact(t) : '') + '</span><span class="wk-bar" data-p="height" data-w="' + Math.round((t / max) * 100) + '"><i></i></span></button>';
  }).join('');
  const labels = days.map((d) => (d === k ? '<span class="on">Hoje</span>' : '<span>' + WDS[keyToDate(d).getDay()] + '</span>')).join('');
  return '<header class="page-h"><h1 class="h1">Histórico</h1><p class="eyebrow">Sua hidratação dia a dia</p></header>' +
    '<section class="card"><div class="card-h"><h2>Últimos 7 dias</h2><small>' + (sx.avg7 == null ? '' : 'média ' + vol(sx.avg7)) + '</small></div>' +
    '<div class="wk-plot"><div class="wk-grid" aria-hidden="true"><div class="wk-goal" style="bottom:' + Math.round((goal / max) * 100) +
    '%"><span>meta</span></div></div>' + cols + '</div><div class="wk-labels" aria-hidden="true">' + labels + '</div></section>' +
    '<div class="stats">' + stat('🔥', 'Sequência', plural(st, 'dia', 'dias')) + stat('🏅', 'Recorde', plural(best, 'dia', 'dias')) +
    stat('📊', 'Média 7 dias', sx.avg7 == null ? '—' : vol(sx.avg7)) +
    stat('🎯', 'Constância 30d', sx.cons30 == null ? '—' : Math.round(sx.cons30 * 100) + '%') + '</div>' +
    '<section class="card">' + calHTML(ym || k.slice(0, 7)) + '</section>' +
    '<p class="hint">Toque em qualquer dia para ver, corrigir ou adicionar registros esquecidos.</p>';
}
function calHTML(ym) {
  const k = today(), y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate();
  const keys = Object.keys(S.days).sort(), made = dayKey(new Date(S.createdAt || Date.now()));
  const minYm = (keys.length && keys[0] < made ? keys[0] : made).slice(0, 7);
  let h = WDS.map((w) => '<span class="cal-w" aria-hidden="true">' + w + '</span>').join('');
  for (let i = 0; i < first; i++) h += '<span aria-hidden="true"></span>';
  for (let d = 1; d <= n; d++) {
    const key = ym + '-' + p2(d), day = S.days[key], t = dayTotal(day), g = (day && day.goal) || goalToday(S, key);
    const cls = !t ? '' : isMet(day) ? ' l3' : t >= g / 2 ? ' l2' : ' l1';
    h += '<button class="cal-d' + cls + (key === k ? ' today' : '') + '" type="button" data-action="day" data-day="' + key + '"' + (key > k ? ' disabled' : '') +
      ' aria-label="' + d + ' de ' + MONTHS[m] + ': ' + (t ? vol(t) : 'sem registros') + '">' + d + '</button>';
  }
  const nav = (dir, label, off) => '<button class="cal-nav" type="button" data-action="cal" data-n="' + dir + '" aria-label="' + label + '"' +
    (off ? ' disabled' : '') + '>' + (dir < 0 ? '‹' : '›') + '</button>';
  return '<div class="cal-h">' + nav(-1, 'Mês anterior', ym <= minYm) + '<b>' + cap(MONTHS[m]) + ' ' + y + '</b>' + nav(1, 'Próximo mês', ym >= k.slice(0, 7)) +
    '</div><div class="cal">' + h + '</div><div class="legend" aria-hidden="true"><span>Menos</span><i class="cal-d"></i><i class="cal-d l1"></i>' +
    '<i class="cal-d l2"></i><i class="cal-d l3"></i><span>Meta</span></div>';
}

/* ---------- Jornada ---------- */
export function journeyView() {
  const tot = allMl(), lv = levelFor(tot), got = S.achievements || {}, ins = insights(S, today(), S.profile);
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length, mis = Object.keys(S.missions || {}).length, pct = Math.round(lv.p * 100);
  return '<header class="page-h"><h1 class="h1">Jornada</h1><p class="eyebrow">Cada gole te leva mais longe</p></header>' +
    '<section class="level"><span class="lv-e" aria-hidden="true">' + lv.e + '</span><p class="lv-k">Nível ' + (lv.i + 1) + ' de ' + LEVELS.length +
    '</p><p class="lv-n">' + lv.n + '</p><div class="bar" role="progressbar" aria-label="Progresso até o próximo nível" aria-valuemin="0" ' +
    'aria-valuemax="100" aria-valuenow="' + pct + '"><i data-w="' + pct + '"></i></div><p class="lv-s">' +
    (lv.next ? 'Faltam ' + big(Math.max(100, (lv.next.at - lv.liters) * 1000)) + ' para ' + lv.next.e + ' ' + lv.next.n : 'Você chegou ao topo da maré!') +
    '<br>' + big(tot) + ' hidratados · ' + plural(mis, 'missão cumprida', 'missões cumpridas') + '</p><div class="path" aria-hidden="true">' +
    LEVELS.map((l, i) => '<span' + (i <= lv.i ? ' class="on"' : '') + '>' + l.e + '</span>').join('') + '</div></section>' +
    '<div class="card-h out"><h2>Seus padrões</h2><small>últimas 4 semanas</small></div><section class="card">' + (ins.length
      ? '<div class="ins-list">' + ins.map((x) => '<div class="ins"><span class="em" aria-hidden="true">' + x.e + '</span><p>' + x.t + '</p></div>').join('') + '</div>'
      : empty('🔍', 'Registre por pelo menos 4 dias e o Maré revela seus padrões: horário mais seco, melhor dia da semana e mais.')) + '</section>' +
    '<div class="card-h out"><h2>Medalhas</h2><small>' + n + ' de ' + ACHIEVEMENTS.length + '</small></div><div class="medals">' +
    ACHIEVEMENTS.map((a) => {
      const ts = got[a.id];
      return '<div class="medal' + (ts ? '' : ' off') + '"><span class="em" aria-hidden="true">' + a.e + '</span><b>' + a.t + '</b><small>' + a.d + '</small>' +
        (ts ? '<em>' + shortDate(ts) + '</em>' : '<span class="sr">Ainda não conquistada</span>') + '</div>';
    }).join('') + '</div><button class="btn block ghost mt" type="button" data-action="share">' + shareIco() +
    '<span style="margin-left:8px">Compartilhar meu progresso</span></button>';
}
export function shareText() {
  const st = streak(S.days, today()), lv = levelFor(allMl());
  return 'Estou no nível ' + lv.n + ' ' + lv.e + ' no Maré' + (st > 1 ? ', com ' + st + ' dias seguidos na meta de hidratação' : '') +
    '. Já são ' + big(allMl()) + ' bem hidratados! 💧';
}

/* ---------- Ajustes ---------- */
function climateNote() {
  const g = S.goal;
  if (!g.climate) return 'Aumenta a meta em dias quentes, pela sua região aproximada';
  if (g.day === today() && g.temp != null) return 'Hoje: máxima de ' + g.temp + '°C' + (g.bonus ? ', meta +' + vol(g.bonus) : ', sem acréscimo');
  return 'Consultando a previsão de hoje…';
}
export function goalSumHTML() {
  const g = S.goal, c = calcGoal(S.profile, g.climate && g.day === today() ? g.bonus : 0);
  return fmtW(S.profile.weight) + ' kg × 35 ml = ' + vol(c.base) + (c.act ? ' · atividade +' + vol(c.act) : '') +
    (c.climate ? ' · calor +' + vol(c.climate) : '') + ' → <b>' + vol(c.total) + ' por dia</b>';
}
// push = true quando o push do servidor (Firebase) está ativo neste aparelho
export function remNoteText(push) {
  const r = S.reminders, p = S.profile, st = notifStatus();
  if (st === 'denied') return 'Bloqueados no navegador: toque no botão para ver como liberar';
  if (st === 'install') return 'No iPhone, instale o Maré na Tela de Início para ativar';
  if (!r.enabled) return st === 'unsupported' ? 'Este navegador só avisa com o app aberto' : 'Desligados';
  return 'Das ' + esc(p.wake) + ' às ' + fmtHM(dayWindow(p.wake, p.sleep).end) + (push || st === 'native' ? '' : ' · com o app aberto');
}
// info = { version, sync: 'off'|'on'|'error', push }
export function settingsView(info) {
  info = info || {};
  const p = S.profile, g = S.goal, r = S.reminders, st = notifStatus(), on = r.enabled && st !== 'denied' && st !== 'install', u = unitL();
  const numIn = (field, val, label, mode) => '<input class="in num" type="text" inputmode="' + mode + '" autocomplete="off" data-field="' + field +
    '" value="' + val + '" aria-label="' + label + '">';
  return '<header class="page-h"><h1 class="h1">Ajustes</h1></header>' +
    sec('Perfil') + '<div class="group">' +
      row('Nome', '', '<input class="in" type="text" data-field="name" value="' + esc(p.name) + '" placeholder="Opcional" maxlength="30" ' +
        'autocomplete="given-name" autocapitalize="words" enterkeyhint="done" aria-label="Nome">') +
      row('Peso', 'Base do cálculo da meta', numIn('weight', fmtW(p.weight), 'Peso em quilos', 'decimal') + '<span class="unit">kg</span>') +
      stack('Atividade física', (ACTIVITY[p.activity] || ACTIVITY.moderate).d,
        seg('activity', p.activity, Object.keys(ACTIVITY).map((k) => [k, ACTIVITY[k].l]), 'Atividade física')) + '</div>' +
    sec('Meta diária') + '<div class="group">' +
      stack('Como definir a meta', '', seg('goal-mode', g.mode, [['auto', 'Automática'], ['manual', 'Manual']], 'Modo da meta')) +
      (g.mode === 'auto'
        ? '<div class="row"><p class="goal-sum" id="goalSum">' + goalSumHTML() + '</p></div>' +
          row('Ajustar pelo clima', climateNote(), sw('toggle', g.climate, 'Ajustar meta pelo clima', ' data-k="climate"'))
        : row('Meta por dia', '', '<div class="stepper"><button type="button" data-action="goal-step" data-n="-1" aria-label="Diminuir meta">−</button>' +
            '<input class="in" id="sGoal" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-field="goal" value="' + fromMl(g.manual) +
            '" aria-label="Meta diária em ' + u + '"><button type="button" data-action="goal-step" data-n="1" aria-label="Aumentar meta">+</button></div>' +
            '<span class="unit">' + u + '</span>')) + '</div>' +
    sec('Rotina') + '<div class="group">' +
      row('Acordo às', '', '<input class="in" type="time" data-field="wake" value="' + esc(p.wake) + '" aria-label="Horário em que acorda">') +
      row('Durmo às', '', '<input class="in" type="time" data-field="sleep" value="' + esc(p.sleep) + '" aria-label="Horário em que dorme">') + '</div>' +
    sec('Lembretes') + '<div class="group">' +
      row('Lembretes', remNoteText(info.push), sw('reminders-toggle', on, 'Lembretes'), 'remNote') +
      (on ? stack('Intervalo', '', seg('interval', r.interval, [[45, '45 min'], [60, '1 h'], [90, '1h30'], [120, '2 h']], 'Intervalo dos lembretes')) +
        row('Lembretes inteligentes', 'Mais frequentes quando você fica para trás; pausam ao bater a meta',
          sw('toggle', r.smart, 'Lembretes inteligentes', ' data-k="smart"')) +
        row('Testar agora', '', sbtn('test-notif', 'Testar')) : '') +
      row('Alarmes no calendário', 'Plano B para quando a notificação falhar', sbtn('ics', 'Adicionar')) + '</div>' +
    sec('Copos rápidos') + '<div class="group"><div class="cups-edit">' + S.cups.map((ml, i) => '<label><input class="in" type="text" inputmode="numeric" ' +
      'pattern="[0-9]*" autocomplete="off" data-field="cup" data-i="' + i + '" value="' + fromMl(ml) + '" aria-label="Copo ' + (i + 1) + ' em ' + u +
      '"><small>' + u + '</small></label>').join('') + '</div></div>' +
    sec('Aparência') + '<div class="group">' +
      stack('Tema', '', seg('theme', p.theme, [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], 'Tema')) +
      stack('Unidade', '', seg('unit', p.unit, [['ml', 'Mililitros (ml)'], ['oz', 'Onças (oz)']], 'Unidade')) + '</div>' +
    sec('Seus dados') + '<div class="group">' +
      stack('Backup', 'Guarde uma cópia dos registros ou leve para outro aparelho', sbtn('export', 'Exportar') + ' ' + sbtn('import', 'Importar')) +
      row('Apagar tudo', 'Remove registros e ajustes deste aparelho', sbtn('reset', 'Apagar', 'ghost danger')) + '</div>' +
    '<p class="about">Maré ' + esc(info.version || '') + ' · ' + (info.sync === 'on' ? 'seus dados ficam no aparelho, com cópia na nuvem' : 'seus dados ficam neste aparelho') +
      '.<br>Metas e fatores de hidratação são estimativas e não substituem orientação médica. Com doença renal ou cardíaca, siga a recomendação do seu médico.' +
      '<br>Previsão do tempo: Open-Meteo.com (CC BY 4.0).</p>';
}

/* ---------- onboarding (6 passos) ---------- */
// ob = { step, name, weight, activity, wake, sleep }
export const OB_STEPS = 6;
const next = (label) => btn('ob-next', label || 'Continuar', 'block');
const OB = [
  () => ({
    b: '<div class="ob-hero"><div class="drop-wrap" id="obDrop">' + dropSVG('od', { pct: '', num: '', sub: '', label: 'Gota de água enchendo' }) + '</div></div>' +
      '<h1 class="ob-title center">Beba água no seu ritmo</h1><p class="ob-text center">O Maré calcula sua meta, lembra você nos momentos certos e ' +
      'transforma cada copo em progresso.</p>',
    f: next('Começar') + '<p class="ob-fine">Leva menos de 1 minuto. Já usa o Maré? <button type="button" data-action="import">Restaurar backup</button></p>',
  }),
  (ob) => ({
    b: '<h1 class="ob-title">Vamos personalizar</h1><p class="ob-text">Seu peso define a base da meta. Tudo fica guardado só no seu aparelho.</p>' +
      '<label class="field"><span>Como podemos te chamar?</span><input class="in wide" id="obName" type="text" value="' + esc(ob.name) +
      '" placeholder="Seu nome (opcional)" maxlength="30" autocomplete="given-name" autocapitalize="words" enterkeyhint="next"></label>' +
      '<div class="field"><span class="field-t" id="obWl">Seu peso</span><div class="weight"><button type="button" data-action="ob-weight" data-n="-1" ' +
      'aria-label="Diminuir peso">−</button><input class="in" id="obWeight" type="text" inputmode="decimal" autocomplete="off" maxlength="5" value="' +
      fmtW(ob.weight) + '" aria-labelledby="obWl"><button type="button" data-action="ob-weight" data-n="1" aria-label="Aumentar peso">+</button></div>' +
      '<p class="center muted">quilos</p></div>',
    f: next(),
  }),
  (ob) => ({
    b: '<h1 class="ob-title">Como é sua rotina de exercícios?</h1><p class="ob-text">Quem se movimenta mais perde mais água no suor, então a meta acompanha.</p>' +
      '<div role="radiogroup" aria-label="Nível de atividade">' + Object.keys(ACTIVITY).map((k) => {
        const a = ACTIVITY[k];
        return '<button class="opt" type="button" role="radio" aria-checked="' + att(ob.activity === k) + '" data-action="ob-activity" data-v="' + k +
          '"><span class="em" aria-hidden="true">' + a.e + '</span><span><b>' + a.l + '</b><small>' + a.d + (a.add ? ' · +' + vol(a.add) : '') + '</small></span></button>';
      }).join('') + '</div>',
    f: next(),
  }),
  (ob) => ({
    b: '<h1 class="ob-title">Quando você acorda e dorme?</h1><p class="ob-text">Seu ritmo de hidratação e os lembretes seguem esses horários. ' +
      'Nada de notificação de madrugada.</p><div class="times"><label class="field"><span>Acordo às</span><input class="in" id="obWake" type="time" value="' +
      esc(ob.wake) + '"></label><label class="field"><span>Durmo às</span><input class="in" id="obSleep" type="time" value="' + esc(ob.sleep) + '"></label></div>',
    f: next(),
  }),
  (ob) => {
    const c = calcGoal({ weight: ob.weight, activity: ob.activity }, 0);
    const bk = (l, v) => '<div><span>' + l + '</span><span>' + v + '</span></div>';
    return {
      b: '<p class="eyebrow center">Sua meta diária</p><div class="big-num" id="obGoal" data-total="' + c.total + '">' + big(c.total) + '</div>' +
        '<div class="breakdown">' + bk('Base: ' + fmtW(ob.weight) + ' kg × 35 ml', vol(c.base)) + (c.act ? bk('Atividade física', '+' + vol(c.act)) : '') +
        bk('<b>Meta por dia</b>', '<b>' + vol(c.total) + '</b>') + '</div><p class="ob-text center">São cerca de ' + Math.round(c.total / 250) +
        ' copos de 250 ml. Em dias quentes, dá para ativar o ajuste pelo clima. Tudo pode mudar nos Ajustes.</p>',
      f: next('Perfeito, continuar'),
    };
  },
  (ob) => {
    const st = notifStatus(), can = st === 'default' || st === 'granted' || st === 'native';
    const note = st === 'install'
      ? '📲 No iPhone, os lembretes chegam com o Maré instalado na Tela de Início: toque em <b>Compartilhar</b> ' + shareIco() +
        ' e em <b>Adicionar à Tela de Início</b>. O app instalado começa com dados próprios, então vale instalar já.'
      : st === 'unsupported' ? 'Este navegador não envia notificações. Você pode criar alarmes no calendário em Ajustes → Lembretes.'
      : st === 'denied' ? 'As notificações estão bloqueadas para este site. Dá para liberar depois nas configurações do aparelho.' : '';
    return {
      b: '<div class="bell center" aria-hidden="true" style="margin-bottom:18px">🔔</div><h1 class="ob-title center">Lembretes que respeitam você</h1>' +
        '<ul class="feat"><li><b>Só no seu horário</b>Das ' + esc(ob.wake) + ' até 1 hora antes de dormir.</li>' +
        '<li><b>Inteligentes</b>Mais frequentes quando você fica para trás e pausados ao bater a meta.</li>' +
        '<li><b>Registro num toque</b>' + (isAndroid() ? 'Toque em "+250 ml" na própria notificação.' : 'Toque na notificação e registre na hora.') + '</li></ul>' +
        (note ? '<p class="callout">' + note + '</p>' : ''),
      f: can ? btn('ob-notif', 'Ativar lembretes', 'block') + '<p class="ob-fine"><button type="button" data-action="ob-finish">Agora não</button></p>'
        : btn('ob-finish', 'Começar a usar', 'block'),
    };
  },
];
export function onboardingView(ob) {
  const s = clamp(ob.step, 0, OB_STEPS - 1), x = OB[s](ob);
  let dots = '';
  for (let i = 0; i < OB_STEPS; i++) dots += '<i class="' + (i < s ? 'past' : i === s ? 'on' : '') + '"></i>';
  return '<div class="ob"><div class="ob-top">' +
    (s ? '<button class="btn-x" type="button" data-action="ob-back" aria-label="Voltar">' + svgI('back') + '</button>' : '<span></span>') +
    '<div class="ob-dots" role="img" aria-label="Passo ' + (s + 1) + ' de ' + OB_STEPS + '">' + dots + '</div><span></span></div>' +
    '<div class="ob-body">' + x.b + '</div><div class="ob-foot">' + x.f + '</div></div>';
}

/* ---------- barra de abas ---------- */
const TABS = [['today', 'Hoje'], ['history', 'Histórico'], ['journey', 'Jornada'], ['settings', 'Ajustes']];
export function tabbarHTML(cur) {
  return TABS.map((t) => '<button class="tab" type="button" data-action="tab" data-tab="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page"' : '') +
    '><span class="ti">' + svgI(t[0]) + '</span>' + t[1] + '</button>').join('');
}
