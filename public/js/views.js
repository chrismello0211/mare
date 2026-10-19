// Maré — telas e painéis (Parte 3B). Só monta HTML a partir do estado; nunca o altera.
// Contrato com o app.js (Parte 3C):
//  • Cliques: elementos com data-action (+ data-day, data-id, data-ml, data-d, data-v, data-n, data-k, data-tab, data-tip),
//    tratados por delegação. O ui.js já cuida de close-sheet, confirm-ok e toast-act.
//  • Campos: inputs com data-field (name, weight, goal, wake, sleep, cup + data-i), evento "change".
//  • Painel de registro: #eMl, #eTime, #eErr. Onboarding: #obName, #obWeight, #obWake, #obSleep, #obGoal (data-total), #obDrop.
//  • "Hoje" é montado em partes com id (TODAY_PARTS) para atualizar sem redesenhar a gota (#drop).
//  • Barras com data-w crescem via ui.animBars; a gota enche via ui.dropTo(el, total, meta, dropOpts(total, meta)).
import { WATERS, OTHERS, ACTIVITY, INSIGNIAS, ACHIEVEMENTS, drink, isOther, dayTotal, dayOther, otherCounted, mixOn, isMet, calcGoal, goalToday, expectedBy,
  dayWindow, streak, bestStreak, insigniaById, unlockedInsignias, mascotOf, reefFor, missionFor, missionProgress, stats, insights, dayKey, keyToDate,
  addDays, minOf, fmtHM, fmtNum } from './core.js';
import { S, esc, clamp, plural, byT, p2, cap, MONTHS, today, longDate, shortDate, relDay, goalNow, totalNow, otherNow, othersOn, allMl,
  firstName, U, vol, unitL, fromMl, big, compact, presets } from './store.js';
import { svgI, sheetHead, dropSVG } from './ui.js';
import { badge } from './art.js';
import { isIOS, isAndroid, iosVersion, isStandalone, isNative, canInstall, notifStatus } from './platform.js';
import { att, btn, sbtn, sec, row, stack, sw, seg, empty, stat, tip, steps, shareIco } from './kit.js';
import { crewHTML, settingsFriendsHTML, tabDots } from './friends-view.js';

/* ---------- peças ---------- */
// btn, sbtn, sec, row, stack, sw, seg, empty, stat, tip, steps e shareIco vêm de kit.js (compartilhadas com friends-view.js)
// Texto curto sobre como os outros líquidos entram na conta (depende do interruptor "Somar na meta" em Ajustes)
export const otherNote = () => (mixOn() ? 'Outros líquidos somam na meta, até metade dela.' : 'Outros líquidos contam à parte e não entram na meta de água.');
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
// Registro rápido de ÁGUA (a que conta na meta): água comum ou com gás. Os outros líquidos têm a segunda gota.
function quickHTML() {
  return '<section class="card" aria-label="Registro rápido de água"><div class="quick-top">' +
    seg('set-water', drink(S.last).id, WATERS.map((d) => [d.id, '<span class="sg-e">' + d.e + '&nbsp;</span>' + d.n]), 'Tipo de água') +
    '<button class="btn-icon" type="button" data-action="add-custom" aria-label="Outro volume ou horário">' + svgI('plus') +
    '<small>Outro</small></button></div><div class="cups">' + S.cups.map((ml) => '<button class="cup" type="button" data-action="add" data-ml="' +
    ml + '" aria-label="Adicionar ' + vol(ml) + '">' + glass(ml) + '<span>' + vol(ml) + '</span></button>').join('') + '</div></section>';
}
function tipsHTML() {
  const ui = S.ui, ios = isIOS();
  if (!ui.tip_news) {
    return tip('news', '🐚', 'Novidades no Maré', 'Cada marco de água agora vira um bichinho do mar para colecionar, e dá para acompanhar o dia de quem você gosta.',
      ['news', 'Ver as novidades']);
  }
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
// Com "outros líquidos" desligado em Ajustes, esses registros ficam guardados, mas não aparecem nas listas.
const shown = (es) => (othersOn() ? es : es.filter((e) => !isOther(e)));
function entryItem(k, e) {
  const d = drink(e.d);
  return '<li><button class="log-item" type="button" data-action="edit-entry" data-day="' + k + '" data-id="' + esc(e.id) + '">' +
    '<span class="li-e" aria-hidden="true">' + d.e + '</span><span class="li-b"><b>' + d.l + '</b><small>' + fmtHM(minOf(e.t)) +
    (d.g === 'o' ? ' · outros líquidos' : '') + '</small></span><span class="li-v">' + vol(e.ml) + '</span></button></li>';
}
function entryList(k) {
  const d = S.days[k], es = d && d.entries ? shown(d.entries.slice().sort(byT).reverse()) : [];
  return es.length ? '<ul class="log-list">' + es.map((e) => entryItem(k, e)).join('') + '</ul>' : '';
}
function logHTML() {
  const k = today(), d = S.days[k], n = d && d.entries ? shown(d.entries).length : 0;
  return '<section class="card"><div class="card-h"><h2>Registros de hoje</h2><small>' + (n ? plural(n, 'registro', 'registros') : '') + '</small></div>' +
    (n ? entryList(k) : empty('🥛', 'Nada por aqui ainda. Que tal começar com um copo agora?')) + '</section>';
}
export const TODAY_PARTS = { tTop: topHTML, tMeta: metaHTML, tQuick: quickHTML, tCrew: crewHTML, tTips: tipsHTML, tMission: missionHTML, tLog: logHTML };
const part = (id) => '<div id="' + id + '">' + TODAY_PARTS[id]() + '</div>';
// A segunda gota (outros líquidos) fica no canto da principal. Como a principal, não é redesenhada a cada registro:
// o app.js só sobe e desce o nível dela (paintDrop2).
export const drop2Label = (ml) => 'Outros líquidos: ' + vol(ml) + ' hoje. Toque para registrar';
function drop2HTML() {
  return '<button class="drop2" id="drop2btn" type="button" data-action="others" aria-label="' + drop2Label(otherNow()) + '">' +
    '<span class="drop-wrap alt" id="drop2">' + dropSVG('hd2', { pct: '', num: '', sub: '', label: '' }).replace(' role="img" aria-label=""', ' aria-hidden="true"') +
    '</span><span class="d2-cap" aria-hidden="true">Outros líquidos</span></button>';
}
export function todayView() {
  return part('tTop') + '<section class="hero" aria-label="Progresso de hoje"><div class="drops"><div class="drop-wrap" id="drop">' +
    dropSVG('hd', { pct: '', num: '', sub: '', label: 'Progresso de hoje' }) + '</div>' + (othersOn() ? drop2HTML() : '') +
    '</div><div class="hero-meta" id="tMeta">' + metaHTML() + '</div></section>' +
    part('tQuick') + part('tCrew') + part('tTips') + part('tMission') + part('tLog');
}
export function dropOpts(total, goal) {
  return { fmt: (n) => fmtNum(n, U()), sub: 'de ' + vol(goal),
    label: vol(total) + ' de ' + vol(goal) + ' (' + Math.round((total / goal) * 100) + '% da meta)' };
}
export const dropOpts2 = () => ({ fmt: (n) => fmtNum(n, U()), sub: unitL() });

/* ---------- painéis ---------- */
// Painel da segunda gota: escolhe o líquido e registra num toque (4 volumes dos copos rápidos)
export function othersSheet(sel) {
  const cur = drink(sel);
  return sheetHead('Outros líquidos') +
    '<p class="sheet-text">' + (mixOn() ? 'Café, chá, suco e companhia somam na meta, até metade dela. O resto precisa ser água.'
      : 'Café, chá, suco e companhia ficam numa contagem à parte e não entram na meta de água.') + '</p>' +
    '<div class="drinks o" role="radiogroup" aria-label="Bebida">' + OTHERS.map((d) =>
      '<button class="drink" type="button" role="radio" aria-checked="' + att(d.id === cur.id) + '" data-action="set-other" data-d="' + d.id +
      '"><span class="em" aria-hidden="true">' + d.e + '</span><b>' + d.n + '</b></button>').join('') + '</div>' +
    '<span class="lbl lbl-cups">' + cur.n + ': toque no volume para registrar</span><div class="cups alt">' + S.cups.map((ml) =>
      '<button class="cup" type="button" data-action="add-o" data-ml="' + ml + '" aria-label="Adicionar ' + vol(ml) + ' de ' + esc(cur.l.toLowerCase()) +
      '">' + glass(ml) + '<span>' + vol(ml) + '</span></button>').join('') + '</div>' +
    btn('add-custom-o', 'Outro volume ou horário', 'block ghost mt');
}
// dr = { mode: 'add'|'edit', day, id, d, ml, time: 'HH:MM' }
export function entrySheet(dr) {
  const edit = dr.mode === 'edit', other = drink(dr.d).g === 'o';
  const chip = (x) => '<button class="pill' + (x.g === 'o' ? ' o' : '') + '" type="button" data-action="draft-drink" data-d="' + x.id +
    '" aria-pressed="' + att(x.id === dr.d) + '">' + x.e + '&nbsp;' + x.n + '</button>';
  return sheetHead(edit ? 'Editar registro' : 'Novo registro') +
    (dr.day !== today() ? '<p class="sheet-text">Registro de ' + relDay(dr.day) + '</p>' : '') +
    '<span class="lbl">Bebida</span><div class="dchips">' + WATERS.map(chip).join('') +
      (othersOn() || other ? '<i class="dsep" aria-hidden="true"></i>' + OTHERS.map(chip).join('') : '') + '</div>' +
    '<p class="e-note" id="eNote">' + (other ? otherNote() : '') + '</p>' +
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
  const oth = othersOn() ? dayOther(d) : 0, cnt = otherCounted(d); // cnt: parte dos outros líquidos que entrou na meta (0 se desligado)
  return sheetHead(cap(relDay(k))) + '<div class="day-sum"><div><b>' + vol(total) + '</b><small>de ' + vol(goal) + ' · ' + pc + '% da meta</small></div>' +
    (isMet(d) ? '<span class="pace done"><span class="dot" aria-hidden="true"></span>Meta batida</span>' : '') + '</div>' +
    '<div class="bar"><i data-w="' + Math.min(100, pc) + '"></i></div>' +
    (oth ? '<p class="day-oth">' + (mixOn()
      ? 'Inclui <b>' + vol(cnt) + '</b> de outros líquidos' + (oth > cnt ? ' (o limite é metade da meta; você registrou ' + vol(oth) + ')' : '')
      : '+ <b>' + vol(oth) + '</b> de outros líquidos, contados à parte') + '</p>' : '') +
    (entryList(k) || empty('📝', 'Nenhum registro neste dia.')) +
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
    '<p class="hint">Toque em qualquer dia para ver, corrigir ou adicionar registros esquecidos. ' +
    (mixOn() ? 'A meta e os gráficos somam a água e, até metade da meta, os outros líquidos.' : 'A meta e os gráficos contam só água, com ou sem gás.') + '</p>';
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
// Uma peça do recife: o medalhão (colorido se já conquistada, silhueta se não), o nome e a data ou a meta de água
function reefTile(x, mine, mas) {
  const ts = mine[x.id], on = !!ts;
  return '<button class="rf' + (on ? '' : ' off') + (on && x.id === mas.id ? ' cur' : '') + '" type="button" data-action="ins" data-id="' + x.id +
    '" aria-label="' + x.n + ', ' + (on ? 'conquistada em ' + shortDate(ts) : 'bloqueada, desbloqueia com ' + big(x.at * 1000)) + '">' +
    badge(x.id, { size: 0, locked: !on }) + '<b>' + x.n + '</b><small>' + (on ? shortDate(ts) : big(x.at * 1000)) + '</small></button>';
}
export function journeyView() {
  const tot = allMl(), rf = reefFor(S, tot), got = S.achievements || {}, ins = insights(S, today(), S.profile), mine = S.insignias || {}, mas = mascotOf(S);
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length, mis = Object.keys(S.missions || {}).length, pct = Math.round(rf.p * 100);
  const bar = (v, label) => '<div class="bar" role="progressbar" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v +
    '"><i data-w="' + v + '"></i></div>';
  return '<header class="page-h"><h1 class="h1">Jornada</h1><p class="eyebrow">Cada gole te leva mais longe</p></header>' +
    '<section class="level"><span class="lv-b">' + badge(rf.cur.id, { size: 132, label: rf.cur.n, cls: 'float' }) + '</span>' +
    '<p class="lv-k">Insígnia ' + (rf.i + 1) + ' de ' + INSIGNIAS.length + '</p><p class="lv-n">' + rf.cur.n + '</p>' +
    (rf.next
      ? '<div class="lv-prog">' + bar(pct, 'Progresso até a próxima insígnia') + badge(rf.next.id, { size: 36, locked: true, label: 'Próxima: ' + rf.next.n + ', bloqueada' }) +
        '</div><p class="lv-s">Faltam ' + big(Math.max(100, rf.leftMl)) + ' para ' + rf.next.n
      : '<div class="lv-prog">' + bar(100, 'Recife completo') + '</div><p class="lv-s">Você completou o recife! Cada gole continua valendo') +
    '<br>' + big(tot) + ' de água · ' + plural(mis, 'missão cumprida', 'missões cumpridas') + '</p></section>' +
    '<div class="card-h out"><h2>Seu recife</h2><small>' + rf.have + ' de ' + INSIGNIAS.length + '</small></div>' +
    '<section class="reef" aria-label="Insígnias">' + INSIGNIAS.map((x) => reefTile(x, mine, mas)).join('') + '</section>' +
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
// Painel de uma insígnia (toque no recife). Conquistada: curiosidade e "usar como mascote". Bloqueada: quanto falta.
export function insigniaSheet(id) {
  const x = insigniaById(id) || INSIGNIAS[0], ts = (S.insignias || {})[x.id], on = !!ts, tot = allMl(), L = tot / 1000, mas = mascotOf(S);
  if (on) {
    return sheetHead(x.n) + '<div class="ins-sheet">' + badge(x.id, { size: 150, label: x.n, cls: 'float' }) +
      '<span class="ins-k">Conquistada em ' + shortDate(ts) + '</span><p class="ins-s">' + x.cheer + '</p>' +
      '<div class="fact"><b>Você sabia?</b>' + x.fact + '</div>' +
      (S.social && S.social.on ? '<p class="note">Seus amigos veem o seu mascote no perfil.</p>' : '') +
      '<div class="btns">' + (x.id === mas.id ? btn('close-sheet', '✓ É o seu mascote', 'ghost') : btn('mascot', 'Usar como meu mascote', '', ' data-id="' + x.id + '"')) +
      (x.id === mas.id ? '' : btn('close-sheet', 'Fechar', 'ghost')) + '</div></div>';
  }
  const p = Math.round(Math.min(1, Math.max(0, L / x.at)) * 100);
  return sheetHead(x.n) + '<div class="ins-sheet">' + badge(x.id, { size: 150, locked: true, label: x.n + ', ainda bloqueada' }) +
    '<span class="ins-k">Ainda bloqueada</span><p class="ins-s">Chega aos ' + big(x.at * 1000) + ' de água. Faltam ' + big(Math.max(100, Math.round(x.at * 1000 - tot))) + '.</p>' +
    '<div class="bar" role="progressbar" aria-label="Progresso até ' + x.n + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i data-w="' + p + '"></i></div>' +
    '<div class="fact off"><b>Curiosidade</b>Beba mais um pouquinho para descobrir uma curiosidade sobre este bichinho.</div>' +
    '<div class="btns">' + btn('close-sheet', 'Fechar', 'ghost') + '</div></div>';
}
// "Desbloqueou!": o painel de comemoração (vem de app.js quando a água acumulada cruza um marco)
export function unlockSheet(id) {
  const x = insigniaById(id) || INSIGNIAS[0];
  return sheetHead('Nova insígnia!') + '<div class="ins-sheet unlock"><i class="glow" aria-hidden="true"></i><i class="sp a" aria-hidden="true">✨</i>' +
    '<i class="sp b" aria-hidden="true">✨</i><i class="sp c" aria-hidden="true">✨</i><i class="sp d" aria-hidden="true">✨</i>' +
    badge(x.id, { size: 150, label: x.n }) + '<span class="ins-k">Você desbloqueou</span><p class="ins-n">' + x.n + '</p>' +
    '<p class="ins-s">' + x.cheer + '<br>Já são ' + big(Math.max(allMl(), x.at * 1000)) + ' de água!</p>' + // max: se a pessoa desfez o copo logo depois, o marco continua valendo
    '<div class="fact"><b>Você sabia?</b>' + x.fact + '</div>' +
    (S.social && S.social.on && S.social.share !== false ? '<p class="note">Seus amigos vão ver essa insígnia no seu perfil.</p>' : '') +
    '<div class="btns">' + btn('close-sheet', 'Que legal!') + btn('reef', 'Ver meu recife', 'ghost') + '</div></div>';
}
// Novidades da versão 1.1 (a dica da tela Hoje abre este painel)
export function newsSheet() {
  const have = unlockedInsignias(S).length;
  return sheetHead('Novidades do Maré') +
    '<div class="news-i">' + badge('cavalo', { size: 48 }) + '<div><b>Insígnias do mar</b><p>Cada marco de água vira um bichinho para colecionar: da concha ao narval. ' +
    (have > 1 ? 'Você já tem ' + have + ' de ' + INSIGNIAS.length + '.' : 'Você começa com a concha.') + '</p></div></div>' +
    '<div class="news-i"><span class="em" aria-hidden="true">🤗</span><div><b>Amigos, sem competição</b><p>Acompanhe o dia de quem você gosta, se a pessoa permitir, e mande um incentivo. Não tem ranking nem comparação de litros.</p></div></div>' +
    '<div class="btns stk">' + btn('news-friends', 'Conhecer os amigos') + btn('news-go', 'Ver meu recife', 'ghost') + btn('close-sheet', 'Depois', 'ghost') + '</div>';
}
export function shareText() {
  const st = streak(S.days, today()), m = mascotOf(S);
  return 'Ganhei a insígnia ' + m.n + ' ' + m.e + ' no Maré' + (st > 1 ? ', com ' + st + ' dias seguidos ' + (mixOn() ? 'na meta' : 'na meta de água') : '') +
    '. Já são ' + big(allMl()) + ' de água! 💧';
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
    sec('Outros líquidos') + '<div class="group">' +
      row('Registrar outros líquidos', 'Uma segunda gota para café, chá, suco, leite, coco e isotônico.' +
        (mixOn() ? '' : ' É uma contagem à parte: não entra na meta de água.'), sw('toggle', othersOn(), 'Registrar outros líquidos', ' data-k="others"')) +
      // opcional e discreto: só aparece com a segunda gota ligada. Vem desligado (muitos nutricionistas preferem a meta só com água)
      (othersOn() ? row('Somar outros líquidos na meta', 'Café, chá, suco e companhia contam na meta, até metade dela; o resto precisa ser água. ' +
        'Vale também para o histórico.', sw('toggle', p.mix === true, 'Somar outros líquidos na meta', ' data-k="mix"')) : '') + '</div>' +
    settingsFriendsHTML() +
    sec('Aparência') + '<div class="group">' +
      stack('Tema', '', seg('theme', p.theme, [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], 'Tema')) +
      stack('Unidade', '', seg('unit', p.unit, [['ml', 'Mililitros (ml)'], ['oz', 'Onças (oz)']], 'Unidade')) + '</div>' +
    sec('Seus dados') + '<div class="group">' +
      stack('Backup', 'Guarde uma cópia dos registros ou leve para outro aparelho', sbtn('export', 'Exportar') + ' ' + sbtn('import', 'Importar')) +
      row('Apagar tudo', 'Remove registros e ajustes deste aparelho', sbtn('reset', 'Apagar', 'ghost danger')) + '</div>' +
    '<p class="about">Maré ' + esc(info.version || '') + ' · ' + (info.sync === 'on' ? 'seus dados ficam no aparelho, com cópia na nuvem' : 'seus dados ficam neste aparelho') +
      '.<br>A meta diária é uma estimativa e não substitui orientação médica. Com doença renal ou cardíaca, siga a recomendação do seu médico.' +
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
const TABS = [['today', 'Hoje'], ['history', 'Histórico'], ['journey', 'Jornada'], ['friends', 'Amigos'], ['settings', 'Ajustes']];
export function tabbarHTML(cur) {
  const dots = tabDots(); // bolinha: pedidos de amizade ou acenos novos
  return TABS.map((t) => '<button class="tab" type="button" data-action="tab" data-tab="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page"' : '') +
    '><span class="ti">' + svgI(t[0]) + (dots[t[0]] ? '<i class="td" aria-hidden="true"></i>' : '') + '</span>' + t[1] +
    (dots[t[0]] ? '<span class="sr"> (novidades)</span>' : '') + '</button>').join('');
}
