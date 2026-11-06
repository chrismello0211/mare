// Maré — telas e painéis (Parte 3B). Só monta HTML a partir do estado; nunca o altera.
// Contrato com o app.js (Parte 3C):
//  • Cliques: elementos com data-action (+ data-day, data-id, data-ml, data-d, data-v, data-n, data-k, data-tab, data-tip),
//    tratados por delegação. O ui.js já cuida de close-sheet, confirm-ok e toast-act.
//  • Campos: inputs com data-field (name, weight, goal, wake, sleep, cup + data-i), evento "change".
//  • Painel de registro: #eMl, #eTime, #eErr. Onboarding: #obName, #obWeight, #obWake, #obSleep, #obGoal (data-total), #obDrop.
//  • "Hoje" é montado em partes com id (TODAY_PARTS) para atualizar sem redesenhar a gota (#drop).
//  • Barras com data-w crescem via ui.animBars; a gota enche via ui.dropTo(el, total, meta, dropOpts(total, meta)).
import { WATERS, OTHERS, ACTIVITY, INSIGNIAS, ACHIEVEMENTS, MEDAL_GROUPS, MEDALS_1_6, MEDALS_1_9, PATTERN_MIN, HM_WEEKS, achievementById, context, medalProgress, nearestMedal, patterns,
  months, heatmap,
  drink, isOther, dayTotal, dayOther, otherCounted, mixOn, isMet, calcGoal, goalToday, expectedBy,
  dayWindow, streak, bestStreak, insigniaById, unlockedInsignias, mascotOf, reefFor, missionFor, missionProgress, missionsOf, tierProgress, extraKey, weekGoal, monthGoal,
  stats, dayKey, keyToDate,
  addDays, minOf, fmtHM, fmtNum } from './core.js';
import { S, ACCT, esc, clamp, plural, byT, p2, cap, MONTHS, today, longDate, shortDate, relDay, goalNow, totalNow, otherNow, othersOn, allMl,
  firstName, U, vol, unitL, fromMl, big, compact, presets } from './store.js';
import { svgI, sheetHead, dropSVG } from './ui.js';
import { badge } from './art.js';
import { isIOS, isAndroid, iosVersion, isStandalone, isNative, canInstall, notifStatus } from './platform.js';
import { att, btn, sbtn, sec, row, stack, sw, seg, empty, stat, tip, steps, shareIco } from './kit.js';
import { crewHTML, settingsFriendsHTML, tabDots } from './friends-view.js';
import { accountHTML, accountTip } from './account-view.js';

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
  // Conta (1.3.0): a dica mais importante vai primeiro. Só aparece a partir do segundo dia de uso (quem acabou de chegar ainda não tem o que perder)
  // e some para sempre se for dispensada: o cartão em Ajustes continua lá. Quem já tem conta, ou perdeu o login e vê o aviso em Ajustes, não vê a dica.
  if (!ACCT.on && !ACCT.ended && !ui.tip_account && Object.keys(S.days).length >= 2) return accountTip();
  // Novidades (1.10.0): um cartão discreto, uma vez só, para quem já usava o Maré (missões extras, desafios da semana e do mês e as medalhas deles). Dispensar o
  // cartão ou abrir o painel o apaga para sempre (tip_news19). Quem está começando agora, ou chega por uma conta, já nasce com ele dispensado. Os cartões de antes
  // (tip_news12, da 1.2, tip_news15, da 1.5, tip_news16, da 1.6, tip_news17, da 1.7 e tip_news18, da 1.9) não voltam mais: o painel de agora traz também o que eles contavam.
  if (!ui.tip_news19) {
    return tip('news19', '🧭', 'Mais desafios no Maré', 'Missões extras todo dia, desafio da semana e do mês, e medalhas novas.', ['news', 'Ver as novidades']);
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
// As barras das missões extras e dos desafios também crescem a partir do valor anterior (por dia, semana ou mês), e não do zero
const lastXP = {};
const grow = (id, p) => { const from = lastXP[id] == null ? 0 : lastXP[id]; lastXP[id] = p; return from; };
const xbar = (id, p, label, text) => '<div class="bar" role="progressbar" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p +
  '"' + (text ? ' aria-valuetext="' + text + '"' : '') + '><i style="width:' + grow(id, p) + '%" data-w="' + p + '"></i></div>';
// Missões extras (1.10.0): a leve e a ousada de hoje, ao lado da missão do dia. Cumprir as três é o "Dia cheio".
function extrasHTML() {
  const k = today(), t = missionsOf(k), goal = goalNow(), day = S.days[k], ex = S.extras || {};
  let n = 0;
  const rows = [['e', 'Leve', t.easy], ['h', 'Ousada', t.hard]].map((x) => {
    const m = x[2], raw = Math.round(tierProgress(m, day, goal) * 100), done = !!ex[extraKey(k, x[0])] || raw >= 100, p = done ? 100 : raw;
    if (done) n++;
    return '<li class="ex-i' + (done ? ' done' : '') + '"><div class="m-ico" aria-hidden="true">' + m.e + '</div><div class="m-body"><span class="m-k">Missão ' + x[1].toLowerCase() +
      (done ? ' cumprida\u00a0✓' : '') + '</span><span class="m-t">' + m.t + '</span>' + xbar(k + ':' + x[0], p, 'Progresso da missão ' + x[1].toLowerCase()) + '</div></li>';
  });
  const full = n === 2 && (!!S.missions[k] || missionProgress(k, day, goal) >= 1);
  return '<section class="card extras" aria-label="Missões extras de hoje"><div class="card-h"><h2>Missões extras</h2><small>' + n + ' de 2</small></div><ul class="ex-list">' + rows.join('') + '</ul>' +
    (full ? '<p class="ex-full"><span aria-hidden="true">🍀</span> Dia cheio: as 3 missões de hoje</p>' : '') + '</section>';
}
// "Termina hoje", "termina amanhã", "termina em 3 dias" (o domingo, ou o último dia do mês, ainda conta)
const endsIn = (n) => (n <= 0 ? 'Termina hoje' : n === 1 ? 'Termina amanhã' : 'Termina em ' + n + ' dias');
// O que se diz de um desafio (g = weekGoal ou monthGoal): vencido, sem chance de fechar nesta janela (sem cobrança) ou quando termina
const chlStatus = (g) => (g.done ? 'Vencido 🎉' : g.over ? 'Essa fica para a próxima' : endsIn(g.toEnd));
// Uma linha de desafio (a da semana ou a do mês) na tela Hoje. Sem chance de fechar e sem nenhum dia contado, a linha nem aparece: não há o que mostrar.
function challengeRow(g, kind) {
  if (!g.done && g.over && !g.have) return '';
  const of = kind === 'w' ? 'da semana' : 'do mês', have = g.done ? g.need : Math.min(g.have, g.need), p = g.done ? 100 : Math.min(100, g.pct), txt = have + ' de ' + g.need + ' dias';
  return '<li class="ex-i ch-i' + (g.done ? ' done' : '') + (g.over ? ' over' : '') + '"><div class="m-ico" aria-hidden="true">' + g.c.e + '</div><div class="m-body"><span class="m-k">Desafio ' + of +
    (g.done ? ' vencido\u00a0✓' : '') + '</span><span class="m-t">' + g.c.t + '</span><span class="m-d">' + g.c.d + '</span>' + xbar(g.key, p, 'Progresso do desafio ' + of, txt) +
    '<div class="ch-f"><span>' + txt + '</span><span>' + chlStatus(g) + '</span></div></div></li>';
}
function challengesHTML() {
  const k = today(), rows = challengeRow(weekGoal(S, k), 'w') + challengeRow(monthGoal(S, k), 'm');
  return rows ? '<section class="card extras chl" aria-label="Desafios da semana e do mês"><div class="card-h"><h2>Desafios</h2><small>semana e mês</small></div><ul class="ex-list">' + rows + '</ul></section>' : '';
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
export const TODAY_PARTS = { tTop: topHTML, tMeta: metaHTML, tQuick: quickHTML, tCrew: crewHTML, tTips: tipsHTML, tMission: missionHTML, tExtras: extrasHTML, tChallenges: challengesHTML, tLog: logHTML };
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
    part('tQuick') + part('tCrew') + part('tTips') + part('tMission') + part('tExtras') + part('tChallenges') + part('tLog');
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
    ? (iosVersion() >= 1604 ? 'Depois de instalar, ative os lembretes e os avisos dos amigos em Ajustes.' : 'Notificações exigem iOS 16.4 ou mais recente; até lá, use os alarmes no calendário.') +
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
  list.push('Volte aqui e ative de novo.');
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
const bar = (v, label, text) => '<div class="bar" role="progressbar" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v +
  '"' + (text ? ' aria-valuetext="' + text + '"' : '') + '><i data-w="' + v + '"></i></div>';
// "faltam 3 dias", "falta 1 fim de semana": as unidades das medalhas vêm no plural (core.js), aqui se acerta o singular
const SING = { dias: 'dia', 'missões': 'missão', 'fins de semana': 'fim de semana', desafios: 'desafio' };
const leftText = (n, unit) => (n === 1 ? 'falta 1 ' + (SING[unit] || unit) : 'faltam ' + n + ' ' + unit);
const insRows = (list) => '<div class="ins-list">' + list.map((x) => '<div class="ins"><span class="em" aria-hidden="true">' + x.e + '</span><p>' + x.t + '</p></div>').join('') + '</div>';
const hr = (h) => h + 'h';
const WDN = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], WDL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

// "Seu ritmo no dia": a água de cada hora (as 2 últimas semanas somadas), com a janela de 3 h mais seca e a de mais água atrás das colunas
function rhythmHTML(r) {
  const n = r.v.length, win = (a) => a >= r.from && a + 3 <= r.from + n; // a janela cabe no gráfico
  const band = (a, cls) => (win(a) ? '<span class="rh-band ' + cls + '" style="left:' + ((a - r.from) / n * 100).toFixed(2) + '%;width:' + (300 / n).toFixed(2) + '%"></span>' : '');
  let cols = '', xs = '';
  r.v.forEach((v, i) => {
    const h = r.from + i;
    cols += '<span class="rh-b"><i data-p="height" data-w="' + (v > 0 ? Math.max(5, Math.round((v / r.max) * 100)) : 0) + '"></i></span>';
    xs += '<span class="rh-x">' + (h % 3 === 0 ? '<b>' + hr(h) + '</b>' : '') + '</span>';
  });
  const dry = win(r.dry), pk = r.peak >= 0 && win(r.peak);
  const sum = 'Água por hora do dia, nas últimas 2 semanas.' + (pk ? ' Mais água das ' + hr(r.peak) + ' às ' + hr(r.peak + 3) + '.' : '') +
    (dry ? ' Período mais seco das ' + hr(r.dry) + ' às ' + hr(r.dry + 3) + '.' : '');
  return '<div class="rh" role="img" aria-label="' + sum + '"><div class="rh-plot" aria-hidden="true">' + band(r.dry, 'dry') + (pk ? band(r.peak, 'pk') : '') + cols +
    '</div><div class="rh-xs" aria-hidden="true">' + xs + '</div>' +
    (dry || pk ? '<div class="rh-leg" aria-hidden="true">' + (dry ? '<span><i class="dry"></i>Mais seco, ' + hr(r.dry) + ' às ' + hr(r.dry + 3) + '</span>' : '') +
      (pk ? '<span><i class="pk"></i>Mais água, ' + hr(r.peak) + ' às ' + hr(r.peak + 3) + '</span>' : '') + '</div>' : '') + '</div>';
}
// "Sua semana": a média da meta em cada dia da semana (domingo primeiro, como o calendário), com a mesma cara do gráfico do Histórico
function weekHTML(w) {
  const top = Math.max(1, Math.max.apply(null, w.cols.map((c) => c.avg || 0))), max = top / 0.82;
  const cols = w.cols.map((c) => {
    const has = c.avg != null, pc = has ? Math.round(c.avg * 100) : 0;
    return '<div class="wk-col' + (has && c.avg >= 1 ? ' met' : '') + (c.wd === w.best ? ' best' : '') + '" role="img" aria-label="' + cap(WDL[c.wd]) + ': ' +
      (has ? 'em média ' + pc + '% da meta, em ' + plural(c.n, 'dia', 'dias') : 'sem registros') + '"><span class="wk-val" aria-hidden="true">' + (has ? pc + '%' : '') +
      '</span><span class="wk-bar" aria-hidden="true" data-p="height" data-w="' + (has ? Math.round((c.avg / max) * 100) : 0) + '"><i></i></span></div>';
  }).join('');
  const labels = w.cols.map((c) => '<span' + (c.wd === w.best ? ' class="on"' : '') + '>' + WDN[c.wd] + '</span>').join('');
  return '<div class="wk-plot sm"><div class="wk-grid" aria-hidden="true"><div class="wk-goal" style="bottom:' + Math.round((1 / max) * 100) + '%"><span>meta</span></div></div>' +
    cols + '</div><div class="wk-labels" aria-hidden="true">' + labels + '</div>';
}
// "Seus padrões": o resumo, o ritmo do dia e a semana, cada um num cartão. Menos de PATTERN_MIN dias de água: só o convite, com quantos já há.
function patternsHTML(pt) {
  if (!pt.ready) {
    return '<section class="card">' + empty('🔍', 'Registre água em pelo menos ' + PATTERN_MIN + ' dias e o Maré revela seus padrões: horário mais seco, melhor dia da semana e mais.' +
      (pt.n ? ' Você já tem ' + pt.n + ' de ' + PATTERN_MIN + '.' : '')) + '</section>';
  }
  return '<section class="card">' + insRows(pt.sum) + '</section>' +
    '<section class="card"><div class="card-h"><h3 class="pt-h">Seu ritmo no dia</h3><small>últimas 2 semanas</small></div>' + (pt.day.rhythm ? rhythmHTML(pt.day.rhythm) : '') + insRows(pt.day.texts) + '</section>' +
    '<section class="card"><div class="card-h"><h3 class="pt-h">Sua semana</h3><small>média da meta</small></div>' + weekHTML(pt.week) + (pt.week.texts.length ? insRows(pt.week.texts) : '') + '</section>';
}
// "Seus meses" (1.7.0): o mês de agora contra o anterior, em duas linhas de barras (a média por dia e os dias na meta) e duas frases. Sem dois meses para comparar:
// só o convite. Os números e os textos vêm de months() (core.js).
const moName = (m) => cap(MONTHS[+m.ym.slice(5, 7) - 1]);
function monthsHTML(mo) {
  if (!mo.ready) {
    return '<section class="card">' + empty('📅', 'Com pelo menos uma semana de uso em dois meses seguidos, o Maré compara a sua média por dia e os dias na meta de um mês com os do outro.') + '</section>';
  }
  const c = mo.cur, p = mo.prev, top = Math.max(1, c.avg, p.avg);
  const line = (m, w, v, on) => '<div class="mo-b' + (on ? ' on' : '') + '"><span class="mo-n">' + moName(m) + '</span><span class="mo-t" aria-hidden="true"><i data-w="' + w +
    '"></i></span><b class="mo-v">' + v + '</b></div>';
  return '<section class="card"><div class="mo-r"><p class="mo-k">Média por dia</p>' + line(c, Math.round((c.avg / top) * 100), vol(c.avg), true) +
    line(p, Math.round((p.avg / top) * 100), vol(p.avg), false) + '</div><div class="mo-r"><p class="mo-k">Dias na meta</p>' +
    line(c, Math.round(c.rate * 100), c.met + ' de ' + c.days, true) + line(p, Math.round(p.rate * 100), p.met + ' de ' + p.days, false) + '</div>' + insRows(mo.texts) + '</section>';
}
// O calendário colorido das últimas 13 semanas (heatmap em core.js): um quadradinho por dia, nos mesmos níveis do calendário do Histórico. Os quadradinhos são só
// para tocar (abrem o dia, como no Histórico): quem usa leitor de tela ouve o resumo, e o calendário do Histórico segue sendo o caminho para os dias, um a um.
function heatHTML(hm) {
  const dia = (k) => +k.slice(8) + ' de ' + MONTHS[+k.slice(5, 7) - 1];
  const cell = (c) => (c.l < 0 ? '<i class="hm-c pre"></i>'
    : '<i class="hm-c' + (c.l ? ' l' + c.l : '') + (c.today ? ' today' : '') + '" data-action="day" data-day="' + c.k + '" title="' + dia(c.k) + ': ' + (c.ml ? vol(c.ml) : 'sem registros') + '"></i>');
  const ms = hm.labels.map((x) => '<span style="left:' + ((x.w / HM_WEEKS) * 100).toFixed(2) + '%">' + x.m + '</span>').join('');
  const cols = hm.cols.map((col) => '<div class="hm-col">' + col.map(cell).join('') + '</div>').join('');
  return '<section class="card"><div class="card-h"><h3 class="pt-h">Seu calendário</h3><small>últimos 3 meses</small></div>' +
    '<div class="hm" role="img" aria-label="Calendário dos últimos 3 meses, uma coluna por semana e um quadradinho por dia. ' + hm.text + '"><div class="hm-ms" aria-hidden="true">' + ms +
    '</div><div class="hm-g" aria-hidden="true">' + cols + '</div></div><div class="legend" aria-hidden="true"><span>Menos</span><i class="cal-d"></i><i class="cal-d l1"></i>' +
    '<i class="cal-d l2"></i><i class="cal-d l3"></i><span>Meta</span></div>' + (hm.text ? insRows([{ e: '🎯', t: hm.text }]) : '') + '</section>';
}
// Desafios (1.10.0), na Jornada: o da semana com um pontinho por dia (de segunda a domingo), o do mês em barra, e o que já foi vencido
const WD_I = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'], WD_L = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
function chlWeek(g, k) {
  const have = g.done ? g.need : Math.min(g.have, g.need), got = g.days.map((v, i) => (v === 1 ? WD_L[i] : '')).filter(Boolean);
  const dots = g.days.map((v, i) => '<span class="wd ' + (v === 1 ? 'on' : v === 0 ? 'off' : 'fut') + (addDays(g.from, i) === k ? ' now' : '') + '"><i>' + (v === 1 ? '✓' : '') + '</i><small>' + WD_I[i] + '</small></span>').join('');
  return '<div class="chl-r' + (g.done ? ' done' : '') + '"><div class="chl-h"><span class="m-k">Desafio da semana' + (g.done ? ' vencido\u00a0✓' : '') + '</span><b>' + have + ' de ' + g.need + ' dias</b></div>' +
    '<p class="chl-t"><span aria-hidden="true">' + g.c.e + '</span> ' + g.c.t + '</p><p class="m-d">' + g.c.d + '</p>' +
    '<div class="wdots" role="img" aria-label="' + (got.length ? 'Dias que contaram nesta semana: ' + got.join(', ') + '.' : 'Nenhum dia contou ainda nesta semana.') + '">' + dots + '</div>' +
    '<p class="chl-s">' + chlStatus(g) + '</p></div>';
}
function chlMonth(g) {
  const have = g.done ? g.need : Math.min(g.have, g.need), p = g.done ? 100 : Math.min(100, g.pct);
  return '<div class="chl-r' + (g.done ? ' done' : '') + '"><div class="chl-h"><span class="m-k">Desafio do mês' + (g.done ? ' vencido\u00a0✓' : '') + '</span><b>' + have + ' de ' + g.need + ' dias</b></div>' +
    '<p class="chl-t"><span aria-hidden="true">' + g.c.e + '</span> ' + g.c.t + '</p><p class="m-d">' + g.c.d + '</p>' +
    bar(p, 'Progresso do desafio do mês', have + ' de ' + g.need + ' dias') + '<p class="chl-s">' + chlStatus(g) + '</p></div>';
}
function challengesJourneyHTML(ctx) {
  const k = today(), w = weekGoal(S, k), m = monthGoal(S, k), won = [];
  if (ctx.weeksWon) won.push(plural(ctx.weeksWon, 'semana', 'semanas'));
  if (ctx.monthsWon) won.push(plural(ctx.monthsWon, 'mês', 'meses'));
  const t = [];
  t.push(won.length ? 'Você já venceu ' + won.join(' e ') + ' de desafio.' : 'Nenhum desafio vencido ainda: o primeiro pode ser o desta semana.');
  if (ctx.trios) t.push('Dias cheios, com as 3 missões cumpridas: ' + ctx.trios + '.');
  return '<section class="card chl-j">' + chlWeek(w, k) + chlMonth(m) + insRows([{ e: '🍀', t: t.join(' ') }]) + '</section>';
}
// A medalha que falta e está mais perto, no mesmo desenho da missão do dia
function nearHTML(near) {
  if (!near) return '';
  const a = near.a;
  return '<section class="card mission near" aria-label="Medalha mais próxima"><div class="m-ico" aria-hidden="true">' + a.e + '</div><div class="m-body">' +
    '<span class="m-k">Mais perto de conquistar</span><span class="m-t">' + a.t + ': ' + leftText(near.need - near.have, near.unit) + '</span>' +
    bar(near.pct, 'Progresso até a medalha ' + a.t) + '<span class="m-d">' + a.d + '</span></div></section>';
}
// Uma medalha: conquistada (com a data) ou bloqueada (com quanto já foi, quando ela tem andamento)
function medalTile(a, got, c) {
  const ts = got[a.id], head = '<span class="em" aria-hidden="true">' + a.e + '</span><b>' + a.t + '</b><small>' + a.d + '</small>';
  if (ts) return '<div class="medal">' + head + '<em>' + shortDate(ts) + '</em></div>';
  const pr = medalProgress(a, c);
  return '<div class="medal off">' + head + (pr
    ? '<span class="mprog" aria-hidden="true"><i data-w="' + pr.pct + '"></i></span><span class="mprog-t"><span class="sr">Ainda não conquistada: </span>' + pr.have + ' de ' + pr.need + ' ' + pr.unit + '</span>'
    : '<span class="sr">Ainda não conquistada</span>') + '</div>';
}
// As medalhas por grupo (MEDAL_GROUPS, em core.js): do mais simples ao mais difícil dentro de cada um
function medalsHTML(got, c) {
  return MEDAL_GROUPS.map((g) => {
    const list = g.ids.map(achievementById).filter(Boolean), n = list.filter((a) => got[a.id]).length;
    return '<div class="mg-h"><h3>' + g.t + '</h3><small>' + n + ' de ' + list.length + '</small></div><div class="medals">' + list.map((a) => medalTile(a, got, c)).join('') + '</div>';
  }).join('');
}
export function journeyView() {
  const tot = allMl(), rf = reefFor(S, tot), got = S.achievements || {}, pt = patterns(S, today(), S.profile), mine = S.insignias || {}, mas = mascotOf(S), ctx = context(S);
  const mo = months(S, today()), hm = heatmap(S, today());
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length, mis = Object.keys(S.missions || {}).length, pct = Math.round(rf.p * 100);
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
    '<div class="card-h out"><h2>Desafios</h2><small>semana e mês</small></div>' + challengesJourneyHTML(ctx) +
    '<div class="card-h out"><h2>Seus padrões</h2><small>últimas 4 semanas</small></div>' + patternsHTML(pt) +
    '<div class="card-h out"><h2>Seus meses</h2><small>' + (mo.ready ? MONTHS[+mo.cur.ym.slice(5, 7) - 1] + ' e ' + MONTHS[+mo.prev.ym.slice(5, 7) - 1] : 'mês a mês') + '</small></div>' +
    monthsHTML(mo) + heatHTML(hm) +
    '<div class="card-h out"><h2>Medalhas</h2><small>' + n + ' de ' + ACHIEVEMENTS.length + '</small></div>' + nearHTML(nearestMedal(S, ctx)) + medalsHTML(got, ctx) +
    '<button class="btn block ghost mt" type="button" data-action="share">' + shareIco() + '<span style="margin-left:8px">Compartilhar meu progresso</span></button>';
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
// Novidades do Maré (o cartão da tela Hoje abre este painel). 1.10.0: o que veio com as missões extras e os desafios vem primeiro; o que veio nas versões 1.1 a 1.9 fica na
// seção de baixo. O cartão é para quem já usava o Maré (quem chega agora já nasce com ele dispensado), com ou sem turma: o botão da turma só aparece para quem está nela.
export function newsSheet() {
  const have = unlockedInsignias(S).length, ni = (e, b, t) => '<div class="news-i"><span class="em" aria-hidden="true">' + e + '</span><div><b>' + b + '</b><p>' + t + '</p></div></div>';
  const got = S.achievements || {}, fresh = ACHIEVEMENTS.slice(MEDALS_1_6, MEDALS_1_9).filter((a) => got[a.id]).length, added = MEDALS_1_9 - MEDALS_1_6;
  const fresh10 = ACHIEVEMENTS.slice(MEDALS_1_9).filter((a) => got[a.id]).length, added10 = ACHIEVEMENTS.length - MEDALS_1_9, crew = !!(S.social && S.social.on);
  return sheetHead('Novidades do Maré') +
    ni('🧭', 'Mais duas missões por dia', 'Além da missão do dia, agora tem uma leve e uma ousada, sempre de tipos diferentes. Cumprir as três é um “Dia cheio” 🍀. Elas ficam na tela Hoje.') +
    ni('📅', 'Desafio da semana e do mês', 'Cada semana (de segunda a domingo) e cada mês têm um desafio, igual para todo mundo: quantos dias você cumpre uma regra, como bater a meta em 5 dias. ' +
      'Dá para acompanhar na Hoje e na Jornada. Se uma semana ficar corrida, tudo bem: a próxima traz outro.') +
    ni('🏅', added10 + ' medalhas novas', 'Trio de missões, Sete trios, Semana vencida, Quatro semanas vencidas, Trimestre de desafios, Mês vencido e Três meses vencidos. ' +
      (fresh10 ? 'Você já conquistou ' + fresh10 + ' das ' + added10 + '. ' : '') + 'Elas também aparecem no seu perfil para a turma.') +
    ni('💙', 'Sem pressão', 'Nenhuma missão ou desafio pede mais água do que a sua meta: eles olham o ritmo e a constância do seu dia.') +
    '<p class="news-h">Das versões anteriores</p>' +
    ni('📈', 'A porcentagem vai além de 100%', 'A turma vê quanto você fez da meta do dia de verdade: 118% aparece como 118%, até 150% (acima disso, “150%+”). O ranking de Hoje usa esse número.') +
    ni('🙈', 'Mostrar só até 100%', 'Prefere que a turma não saiba quanto você passou da meta? Desligue “Mostrar quanto passei da meta” em Meu perfil ou em Ajustes → Amigos. ' +
      'Seus amigos passam a ver só “Meta batida hoje”, e o seu lugar no ranking também para em 100%.') +
    ni('🏅', added + ' medalhas novas', 'Entraram um mês e cem dias de Maré, o verão em dia, fins de semana de ouro, o Dia dos Oceanos e a Turma completa, que só sai quando você e pelo menos dois amigos batem a meta no mesmo dia. ' +
      (fresh ? 'Você já conquistou ' + fresh + ' das novas, com a data em que as merecia. ' : '') + 'Elas também aparecem no seu perfil para a turma.') +
    ni('📅', 'Seus meses', 'A Jornada ganhou o seu mês contra o anterior, com a média por dia e os dias na meta, e um calendário colorido dos últimos 3 meses: um quadradinho por dia.') +
    ni('☁️', 'Medalhas na conta', 'Quem tem conta passa a guardar também o dia em que cada medalha saiu, e ela volta do mesmo jeito em outro aparelho.') +
    ni('🎯', 'Quanto falta e seus padrões', 'Cada medalha que ainda não saiu mostra quanto você já andou, e os seus padrões têm gráficos: a água de cada hora do dia e a média de cada dia da semana. Aparecem depois de 4 dias de registro.') +
    '<div class="news-i">' + badge('orca', { size: 48 }) + '<div><b>Mais cinco bichinhos no recife</b><p>Arraia-manta, orca, peixe-pescador, lula-gigante e a pérola entraram na coleção, que agora vai até 2.000 L de água. ' +
    (have > 1 ? 'Você já tem ' + have + ' de ' + INSIGNIAS.length + '.' : 'Você começa com a concha.') + '</p></div></div>' +
    ni('🏆', 'Uma turma, um ranking', 'Os amigos agora formam uma turma só: todo mundo vê todo mundo, com ranking do dia, da semana e da sequência. Cada um decide o que mostra, e a meta em ml só aparece se você deixar.') +
    ni('🔔', 'Avisos mais espertos', 'Os avisos respeitam seu horário de sono. Dá para escolher saber quando um amigo bate a meta e receber o resumo da semana da turma no domingo.') +
    '<div class="btns stk">' + (crew ? btn('fr-profile', 'Escolher o que a turma vê') : '') + btn('news-go', 'Ver minhas medalhas', crew ? 'ghost' : '') + btn('close-sheet', 'Depois', 'ghost') + '</div>';
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
  return '<header class="page-h"><h1 class="h1">Ajustes</h1></header>' + accountHTML() +
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
      (ACCT.on ? '' : row('Apagar tudo', 'Remove registros e ajustes deste aparelho', sbtn('reset', 'Apagar', 'ghost danger'))) + '</div>' +
    '<p class="about">Maré ' + esc(info.version || '') + ' · ' + (ACCT.on ? 'seus dados ficam no aparelho e na sua conta' : info.sync === 'on' ? 'seus dados ficam neste aparelho; a cópia na nuvem só volta com uma conta' : 'seus dados ficam neste aparelho') +
      '.<br>A meta diária é uma estimativa e não substitui orientação médica. Com doença renal ou cardíaca, siga a recomendação do seu médico.' +
      '<br>Previsão do tempo: Open-Meteo.com (CC BY 4.0).</p>';
}

/* ---------- onboarding (6 passos) ---------- */
// ob = { step, name, weight, activity, wake, sleep }
export const OB_STEPS = 6;
const next = (label) => btn('ob-next', label || 'Continuar', 'block');
const OB = [
  (ob) => ({
    b: '<div class="ob-hero"><div class="drop-wrap" id="obDrop">' + dropSVG('od', { pct: '', num: '', sub: '', label: 'Gota de água enchendo' }) + '</div></div>' +
      (ob.rest
        ? '<h1 class="ob-title center">Encontramos sua conta</h1><p class="ob-text center">Seus ' + plural(ob.rest, 'dia', 'dias') + ' de registros já estão aqui. ' +
          'Falta só confirmar alguns dados para calcular a sua meta.</p>'
        : '<h1 class="ob-title center">Beba água no seu ritmo</h1><p class="ob-text center">O Maré calcula sua meta, lembra você nos momentos certos e ' +
          'transforma cada copo em progresso.</p>'),
    f: ob.rest ? next('Continuar')
      : next('Começar') + '<p class="ob-fine">Leva menos de 1 minuto. Já usa o Maré? <button type="button" data-action="ac-signin">Entrar na conta</button> · ' +
        '<button type="button" data-action="import">Restaurar backup</button></p>',
  }),
  (ob) => ({
    b: '<h1 class="ob-title">Vamos personalizar</h1><p class="ob-text">Seu peso define a base da meta e não aparece para ninguém. ' + (ACCT.on ? 'Ele fica no seu aparelho e na sua conta.' : 'Ele fica no seu aparelho (e na sua conta, se você criar uma).') + '</p>' +
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
