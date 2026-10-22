// Maré — telas dos amigos (Parte 9; ranking da turma na 1.2.0). Só monta HTML a partir de S e SOC (store.js); nunca altera nada.
// Quem muda o estado e conversa com a nuvem é o app.js. Contrato de cliques (data-action): fr-join, fr-share, fr-invite, fr-copy, fr-code,
// fr-find, fr-send, fr-back, fr-accept, fr-decline, fr-decline-all, fr-cancel, fr-open, fr-wave, fr-profile, fr-mascot, fr-about,
// fr-newcode, fr-leave, fr-retry, fr-intro, fr-alerts (avisos por notificação, 1.1.1), fr-rank (visão do ranking: data-v = day, week ou streak),
// fr-goal, fr-goal-on, fr-goal-off (a meta em ml aparece para a turma), fr-hit e fr-week (avisos opcionais, 1.2.0).
// Campos: #frNick (entrada), #frNickIn (data-field="nick", no perfil), #frCode (código de convite).
// Princípios (guardados por tests/social.test.js): a turma é uma só e tem ranking (decisão do dono na 1.2.0); a meta em ml só aparece se a pessoa
// deixar; nunca os litros bebidos nem os horários; textos sempre positivos (ninguém é "o último": quem não entra na conta fica numa lista à parte).
import { INSIGNIAS, mascotOf, addDays, keyToDate } from './core.js';
import { S, SOC, esc, plural, today, shortDate, vol } from './store.js';
import { sheetHead } from './ui.js';
import { notifStatus } from './platform.js';
import { badge } from './art.js';
import { btn, sbtn, sec, row, sw, seg, empty, att, shareIco, tip } from './kit.js';
import { MAX_FRIENDS, NICK_MAX, WEEK, RANKS, rankId, rankBoard, podium, memberOf, myMember, weekOf, turma, turmaWeek, turmaStreak, fmtCode,
  liveOf, statusText, waveFor, waveIn, WAVE_TEXT, myLive, ringOf, unseenWaves, firstNick, profilePayload, errText } from './social.js';

/* ---------- peças ---------- */
// Avatar: o mascote num medalhão com um anel de progresso em volta. ring = ringOf(...) ou null (sem anel). size em px.
export function avatar(mc, size, ring) {
  const w = size >= 84 ? 6 : size >= 48 ? 4 : 3, gap = size >= 84 ? 4 : 3, inner = size - 2 * (w + gap), c = size / 2, r = (size - w) / 2, C = 2 * Math.PI * r;
  const off = (size - inner) / 2, cls = ring ? ring.cls : 'off';
  let rg = '';
  if (ring) {
    rg = '<svg class="rg" viewBox="0 0 ' + size + ' ' + size + '" focusable="false" aria-hidden="true"><circle class="rg-t" cx="' + c + '" cy="' + c + '" r="' + r.toFixed(2) +
      '" stroke-width="' + w + '"/>' + (ring.pct > 0 ? '<circle class="rg-p" cx="' + c + '" cy="' + c + '" r="' + r.toFixed(2) + '" stroke-width="' + w +
      '" stroke-dasharray="' + ((C * ring.pct) / 100).toFixed(2) + ' ' + C.toFixed(2) + '"/>' : '') + '</svg>';
  }
  return '<span class="av ' + cls + '" style="width:' + size + 'px;height:' + size + 'px">' + rg + '<span class="av-b" style="left:' + off + 'px;top:' + off + 'px">' +
    badge(mc, { size: inner }) + '</span>' + (cls === 'met' && size >= 44 ? '<i class="av-ok" aria-hidden="true">✓</i>' : '') + '</span>';
}
const myAvatar = (size) => avatar(mascotOf(S).id, size, ringOf(myLive(S, today())));
const mine = () => S.social || {};
// As bolinhas dos últimos 7 dias, do mais antigo (esquerda) até hoje (direita): cheia = bateu a meta; com anel = hoje, o dia ainda está em andamento.
// Sem a semana conhecida (pausa, versão antiga do app, perfil novo): nada.
function dots(w) {
  if (!w.known) return '';
  return '<span class="dots" role="img" aria-label="Meta batida em ' + w.n + ' dos últimos 7 dias">' +
    w.days.slice().reverse().map((on, i) => '<i class="dt' + (on ? ' on' : i === WEEK - 1 ? ' now' : '') + '"></i>').join('') + '</span>';
}
// A mesma semana em ponto grande, com a letra do dia da semana embaixo (painel do amigo e perfil)
const LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
function weekStrip(w, t) {
  let cells = '';
  for (let i = WEEK - 1; i >= 0; i--) {
    cells += '<span class="wk"><i class="dt big' + (w.days[i] ? ' on' : i === 0 ? ' now' : '') + '"></i><small>' + LETTER[keyToDate(addDays(t, -i)).getDay()] + '</small></span>';
  }
  return '<div class="wk-row" role="img" aria-label="Meta batida em ' + w.n + ' dos últimos 7 dias">' + cells + '</div>';
}
// Todo mundo que está no ranking: eu (com os meus dados, mesmo com o progresso em pausa para os amigos) e a turma
function members(t) { return [myMember(S, t)].concat(SOC.st.friends.map((f) => memberOf(f, t))); }

/* ---------- a aba Amigos ---------- */
// Aviso discreto no topo: conectando, sem internet, servidor sem as regras... (a lista guardada no aparelho continua à vista)
function notice() {
  const st = SOC.st;
  let e = '', t = '', retry = false;
  if (SOC.mode === 'off') { e = '☁️'; t = 'Sem conexão com a nuvem do Maré. Você vê o que o app guardou da última vez.'; retry = true; }
  else if (st.err) { e = st.err === 'offline' ? '📡' : '☁️'; t = st.err === 'offline' ? 'Sem internet agora: mostrando o que o Maré viu por último.' : errText(st.err); retry = true; }
  else if (SOC.mode === 'wait' || !st.ready) { e = '🌊'; t = 'Atualizando sua turma…'; }
  if (!t) return '';
  return '<div class="notice" role="status"><span class="em" aria-hidden="true">' + e + '</span><span class="nt">' + t + '</span>' +
    (retry ? '<button type="button" data-action="fr-retry">Tentar de novo</button>' : '') + '</div>';
}

// O resumo que muda com a visão: o dia de hoje, a semana ou as sequências. Sempre positivo.
const TIDE = { day: ['Maré da turma', 'Quem já bateu a meta hoje'], week: ['Semana da turma', 'Dias na meta da turma nos últimos 7 dias'], streak: ['Sequências da turma', ''] };
function summaryOf(ms, by) {
  if (by === 'week') return turmaWeek(ms);
  if (by === 'streak') return turmaStreak(ms);
  return turma(myLive(S, today()), SOC.st.friends.map((f) => liveOf(f, today())));
}
function tideCard(tm, by) {
  const p = tm.total ? Math.round((tm.met / tm.total) * 100) : 0, lbl = TIDE[by];
  return '<section class="tide ' + tm.kind + '" aria-label="' + lbl[0] + '"><span class="tide-k">' + lbl[0] + '</span><p class="tide-t">' + tm.text + '</p><p class="tide-s">' + tm.sub +
    '</p>' + (tm.kind === 'quiet' || !tm.total ? '' : '<div class="bar" role="progressbar" aria-label="' + lbl[1] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      p + '"><i data-w="' + p + '"></i></div>') + '</section>';
}

/* o ranking da turma */
const MEDAL = ['🥇', '🥈', '🥉'];
const REST = { day: 'Sem dados de hoje', week: 'Sem dados da semana', streak: 'Sem dados de sequência' };
// O número grande de cada visão: % da meta de hoje, dias na meta na semana ou dias seguidos. Quem tem 0 mostra "–" na sequência.
function bigOf(it, by) {
  if (by === 'day') return it.v + '%';
  if (by === 'week') return it.v + '/' + WEEK;
  return it.v > 0 ? '🔥 ' + it.v : '–';
}
const nb = (t) => t.replace(/ /g, '\u00A0'); // o número e a unidade nunca se separam em duas linhas
const goalOf = (m) => (m.gl ? 'meta ' + nb(vol(m.gl)) : '');
// O texto pequeno sob o nome. Na visão "Hoje" a % já é o número grande, então só entra o que ela não diz.
function noteOf(m, by) {
  const l = m.live;
  if (m.me && mine().share === false) return 'Em pausa para os seus amigos';
  if (by === 'day' && l.kind === 'going') return l.st > 0 ? '🔥 ' + plural(l.st, 'dia seguido', 'dias seguidos') : '';
  if (by === 'day' && l.kind === 'met') return 'Meta batida hoje 🎉';
  return statusText(l);
}
function ariaOf(it, by) {
  const m = it.m, nm = m.me ? 'Você' : m.nm;
  return (it.v > 0 ? it.rank + 'º lugar: ' : '') + nm + ', ' + (by === 'day' ? it.v + '% da meta de hoje' : by === 'week' ? it.v + ' de ' + WEEK + ' dias na meta' :
    plural(it.v, 'dia seguido', 'dias seguidos')) + (m.gl ? ', meta ' + vol(m.gl) : '');
}
// O botão de aceno de quem está na turma (pódio e linhas): "oi" para quem está no caminho, "parabéns" para quem bateu a meta; um por dia
function waveBtn(m, wv, cls) {
  const nm = esc(m.nm), label = wv.done ? 'Aceno enviado para ' + nm + ' hoje' : wv.kind === 'cheer' ? 'Dar parabéns a ' + nm : 'Acenar para ' + nm;
  return '<button class="fr-wave' + (cls ? ' ' + cls : '') + (wv.done ? ' done' : '') + '" type="button" data-action="fr-wave" data-id="' + m.uid + '"' +
    (wv.done ? ' disabled' : '') + ' aria-label="' + label + '"><span aria-hidden="true">' + (wv.done ? '✓' : wv.kind === 'cheer' ? '🎉' : '👋') + '</span></button>';
}
// "acenou para você" sem o emoji (para quem lê a tela em voz alta)
const waveSay = (k) => WAVE_TEXT[k].replace(/\u00A0.*$/, '');
function podiumCell(it, by, t) {
  const m = it.m, rank = Math.min(3, it.rank), open = m.me ? 'data-action="fr-profile"' : 'data-action="fr-open" data-id="' + m.uid + '"', wv = m.f ? waveFor(m.f, t) : null;
  const inn = m.f ? waveIn(m.f, t) : null; // o aceno que ele me mandou: um emoji no canto do avatar (as linhas dizem em texto; o pódio não tem espaço)
  return '<li class="pd r' + rank + (m.me ? ' me' : '') + '"><button type="button" class="pd-b" ' + open + ' aria-label="' + esc(ariaOf(it, by) + (inn ? '. ' + m.nm + ' ' + waveSay(inn.k) : '')) + '">' +
    '<span class="pd-a">' + avatar(m.mc, 56, ringOf(m.live)) + (inn ? '<i class="pd-in" aria-hidden="true">' + (inn.k === 'cheer' ? '🎉' : '👋') + '</i>' : '') + '</span><b class="pd-n">' + esc(m.me ? 'Você' : m.nm) + '</b>' +
    '<span class="pd-s"><i class="md" aria-hidden="true">' + MEDAL[rank - 1] + '</i><b>' + bigOf(it, by) + '</b>' +
    (goalOf(m) ? '<small>' + goalOf(m) + '</small>' : '') + '</span></button>' + (wv ? waveBtn(m, wv, 'pd-w') : '') + '</li>';
}
// Uma linha do ranking. it = { m, rank, v } (no ranking) ou { m, rank: 0, v: 0, rest: true } (fora da conta desta visão)
function rankRow(it, by, t) {
  const m = it.m, f = m.f, rest = !!it.rest, nm = esc(m.nm);
  const note = noteOf(m, by), inn = f ? waveIn(f, t) : null, wv = f ? waveFor(f, t) : null;
  const open = m.me ? 'data-action="fr-profile"' : 'data-action="fr-open" data-id="' + m.uid + '"';
  const num = rest ? '' : it.v > 0 ? it.rank : '–';
  const big = rest ? '' : bigOf(it, by);
  return '<li class="rk-r' + (m.me ? ' me' : '') + (rest ? ' off' : '') + '"><span class="rk-n" aria-hidden="true">' + num + '</span>' +
    '<button class="rk-main" type="button" ' + open + ' aria-label="' + esc(rest ? (m.me ? 'Você' : m.nm) + ', ' + statusText(m.live) : ariaOf(it, by)) + '">' + avatar(m.mc, 46, ringOf(m.live)) +
    '<span class="rk-t"><b>' + nm + (m.me ? ' <i class="you">você</i>' : '') + '</b>' + (note ? '<small class="fr-s ' + m.live.kind + '">' + note + '</small>' : '') +
    (inn ? '<small class="fr-w">' + WAVE_TEXT[inn.k] + '</small>' : '') + dots(m.week) + '</span>' +
    (big || goalOf(m) ? '<span class="rk-v">' + (big ? '<b' + (by === 'day' && m.live.kind === 'met' ? ' class="ok"' : '') + '>' + big + '</b>' : '') +
      (goalOf(m) ? '<small>' + goalOf(m) + '</small>' : '') + '</span>' : '') + '</button>' + (wv ? waveBtn(m, wv) : '') + '</li>';
}
function rankCard(ms, by, t) {
  const bd = rankBoard(ms, by), pod = podium(bd.ranked), top = pod ? pod.length : 0;
  const rows = bd.ranked.slice(top).map((it) => rankRow(it, by, t)).join('');
  const rest = bd.rest.map((m) => rankRow({ m: m, rank: 0, v: 0, rest: true }, by, t)).join('');
  return '<section class="card rk" aria-label="Ranking da turma"><div class="card-h"><h2>Ranking da turma</h2><small>' + plural(ms.length, 'pessoa', 'pessoas') + '</small></div>' +
    seg('fr-rank', by, RANKS.map((r) => [r.id, r.n]), 'Ver o ranking de') +
    (pod ? '<ol class="pod">' + pod.map((it) => podiumCell(it, by, t)).join('') + '</ol>' : '') +
    (rows ? '<ul class="rk-l">' + rows + '</ul>' : '') +
    (rest ? '<p class="rk-rest">' + REST[by] + '</p><ul class="rk-l">' + rest + '</ul>' : '') + '</section>';
}
function reqCard(list, incoming) {
  const items = list.map((r) => {
    const nm = esc(r.nm);
    return incoming
      ? '<li class="fr rq"><div class="rq-top">' + avatar(r.mc, 44, null) + '<span class="fr-t"><b>' + nm + '</b><small>quer acompanhar o dia com você 💌</small></span></div>' +
        '<div class="rq-b"><button class="btn sm" type="button" data-action="fr-accept" data-id="' + r.uid + '">Aceitar</button>' +
        '<button class="btn sm ghost" type="button" data-action="fr-decline" data-id="' + r.uid + '" aria-label="Agora não: recusar o pedido de ' + nm + '">Agora não</button></div></li>'
      : '<li class="fr"><div class="fr-main">' + avatar(r.mc, 44, null) + '<span class="fr-t"><b>' + nm + '</b><small>convite enviado · aguardando</small></span></div>' +
        '<button class="btn sm ghost" type="button" data-action="fr-cancel" data-id="' + r.uid + '" aria-label="Cancelar o convite para ' + nm + '">Cancelar</button></li>';
  }).join('');
  // Com 3 pedidos ou mais (um convite espalhado demais, por exemplo), dá para recusar todos de uma vez (com confirmação)
  const all = incoming && list.length >= 3 ? '<p class="rq-all"><button type="button" class="lnk" data-action="fr-decline-all">Recusar todos</button></p>' : '';
  return '<section class="card"><div class="card-h"><h2>' + (incoming ? 'Pedidos de amizade' : 'Convites enviados') + '</h2><small>' + list.length +
    '</small></div><ul class="fr-list">' + items + '</ul>' + all + '</section>';
}
// Convite para ligar os avisos (pedido, aceite e aceno chegam como notificação, até com o Maré fechado). Só aparece enquanto falta a permissão,
// a pessoa não desligou os avisos e não dispensou o cartão. Bloqueado no navegador ou sem suporte: nada de insistir (Ajustes explica).
function pushCard() {
  if (S.ui.tip_fpush || mine().push === false) return '';
  const st = notifStatus();
  if (st === 'default') {
    return tip('fpush', '🔔', 'Receba avisos da turma', 'Saiba na hora quando alguém pedir amizade, aceitar o seu pedido ou acenar para você, até com o Maré fechado.',
      ['fr-alerts', 'Ativar avisos']);
  }
  if (st === 'install') {
    return tip('fpush', '🔔', 'Avisos da turma no iPhone', 'Para receber avisos com o Maré fechado, instale o app na Tela de Início.', ['install-help', 'Como instalar']);
  }
  return '';
}
// A meta em ml só aparece para a turma se a pessoa disser que sim (null = ainda não escolheu): um cartão pergunta uma vez, e Ajustes e o perfil mudam depois.
function goalCard() {
  if (mine().goal === true || mine().goal === false || !SOC.st.friends.length) return ''; // sem ninguém na turma ainda não há para quem mostrar
  const g = profilePayload(Object.assign({}, S, { social: Object.assign({}, mine(), { share: true, goal: true }) }), today()).gl || 2000;
  return '<section class="card tip goalq"><span class="em" aria-hidden="true">🎯</span><div class="tip-b"><b>Mostrar sua meta aos amigos?</b>' +
    '<p>Seus amigos passam a ver “meta ' + nb(vol(g)) + '” ao lado da sua porcentagem. ' +
    'Com os dois números dá para estimar quanto você bebeu. Você muda isso quando quiser, em Ajustes.</p>' +
    '<div class="btns two"><button class="btn sm" type="button" data-action="fr-goal-on">Mostrar</button>' +
    '<button class="btn sm ghost" type="button" data-action="fr-goal-off">Agora não</button></div></div></section>';
}
function aloneCard() {
  return '<section class="card"><div class="card-h"><h2>Sua turma</h2></div>' +
    empty('🐠', 'Seu recife ainda está sozinho. Convide a primeira pessoa e acompanhem o dia um do outro.') + '</section>';
}
function inviteCard() {
  const code = SOC.st.code || mine().code, off = code ? '' : ' disabled';
  return '<section class="card invite"><div class="card-h"><h2>Convide alguém</h2></div>' +
    '<p class="inv-t">Mande seu convite. Quando a pessoa aceitar, ela entra na sua turma e vocês passam a acompanhar o dia um do outro.</p>' +
    (code ? '<div class="code" aria-label="Seu código de convite: ' + fmtCode(code).split('').join(' ') + '">' + fmtCode(code) + '</div>'
      : '<div class="code wait">Gerando seu código…</div>') +
    '<button class="btn block" type="button" data-action="fr-invite"' + off + '>' + shareIco() + '<span>Compartilhar convite</span></button>' +
    '<div class="btns two"><button class="btn ghost" type="button" data-action="fr-copy"' + off + '>Copiar código</button>' +
    '<button class="btn ghost" type="button" data-action="fr-code">Inserir código</button></div></section>';
}
export function friendsView(ctx) {
  if (!mine().on) return introView(ctx || {});
  const st = SOC.st, t = today(), by = rankId(S.ui.frRank), ms = members(t), any = st.friends.length > 0;
  return '<header class="page-h fr-h"><div><h1 class="h1">Amigos</h1><p class="eyebrow">Cada gole conta, juntos</p></div>' +
    '<button class="chip fr-me" type="button" data-action="fr-profile" aria-label="Meu perfil">' + myAvatar(34) + '<span>Perfil</span></button></header>' +
    notice() + (st.reqIn.length ? reqCard(st.reqIn, true) : '') + pushCard() + goalCard() +
    (any ? tideCard(summaryOf(ms, by), by) + rankCard(ms, by, t) : aloneCard()) + inviteCard() +
    (st.reqOut.length ? reqCard(st.reqOut, false) : '') +
    '<p class="hint">Todo mundo da turma vê todo mundo, e cada um decide o que mostrar. ' +
    '<button type="button" class="lnk" data-action="fr-about">Como funciona a privacidade</button></p>';
}

/* ---------- entrada: apelido, o que os amigos veem e o aviso de privacidade ---------- */
// Convite aberto por link (ctx.invite = { code, st: 'loading'|'ok'|'gone'|'self'|'err', who, err }): o aviso e o texto do botão principal.
// O app.js repinta só #frInv e #frCta quando a busca termina, para não apagar o apelido que a pessoa já começou a digitar.
export function inviteInfo(inv) {
  if (!inv) return { html: '', cta: 'Ativar amigos' };
  if (inv.st === 'ok') {
    return { html: '<div class="callout inv"><b>💌 ' + esc(inv.who.nm) + ' convidou você!</b><br>Ative os amigos e o pedido de amizade segue na hora. ' +
      '<button type="button" class="lnk" data-action="fr-skip">Ignorar convite</button></div>', cta: 'Ativar e pedir amizade' };
  }
  if (inv.st === 'loading') return { html: '<div class="callout inv">💌 Procurando o seu convite…</div>', cta: 'Ativar amigos' };
  const t = inv.st === 'gone' ? 'Esse convite não existe mais. Peça um novo para quem te convidou.'
    : inv.st === 'self' ? 'Esse é o seu próprio convite 😄 Mande para alguém.' : errText(inv.err);
  return { html: '<div class="callout inv">' + t + ' <button type="button" class="lnk" data-action="fr-skip">Ok</button></div>', cta: 'Ativar amigos' };
}
function introView(ctx) {
  const sc = mine(), nick = sc.nick || firstNick(S.profile.name), share = sc.share !== false, off = SOC.mode === 'off', inv = inviteInfo(ctx.invite);
  const feat = (e, b, t) => '<li><span class="em" aria-hidden="true">' + e + '</span><div><b>' + b + '</b><p>' + t + '</p></div></li>';
  return '<header class="page-h"><h1 class="h1">Amigos</h1><p class="eyebrow">Cada gole conta, juntos</p></header>' +
    '<section class="fr-hero" aria-hidden="true"><span class="h-l">' + badge('tartaruga', { size: 64 }) + '</span><span class="h-c">' + badge('cavalo', { size: 104, cls: 'float' }) +
    '</span><span class="h-r">' + badge('golfinho', { size: 64 }) + '</span></section>' +
    '<h2 class="fr-title">Beba água em boa companhia</h2>' +
    '<p class="fr-lead">Convide quem você gosta e formem uma turma só: todo mundo acompanha o dia de todo mundo, com um ranking amistoso para animar a turma.</p>' +
    '<div id="frInv">' + inv.html + '</div><ul class="fr-feat">' +
    feat('🏆', 'Uma turma, um ranking', 'Veja quem vai bem hoje, na semana ou em sequência. Todo mundo que entra se junta à mesma turma.') +
    feat('🔒', 'Só entra quem aceita', 'Ninguém aparece para a turma sem aceitar um convite, e você sai quando quiser.') +
    feat('👋', 'Acenos e parabéns', 'Mande um incentivo para quem está se esforçando ou bateu a meta.') + '</ul>' +
    '<section class="card see"><div class="card-h"><h2>O que a turma vê</h2></div>' +
    '<p class="see-k ok">Veem</p><p class="see-t">Seu apelido, seu mascote e suas insígnias (marcos, nunca o total de litros), a porcentagem da meta de hoje, sua sequência e quais dos últimos 7 dias você bateu a meta.</p>' +
    '<p class="see-k">Só se você deixar</p><p class="see-t">A sua meta do dia em ml. Com ela e a porcentagem dá para estimar quanto você bebeu, por isso o Maré pergunta antes.</p>' +
    '<p class="see-k no">Nunca veem</p><p class="see-t">Os registros de cada gole, os horários, seu peso, sua localização e seu nome completo.</p></section>' +
    '<section class="card"><label class="lbl" for="frNick">Seu apelido</label><input class="in wide" id="frNick" type="text" maxlength="' + NICK_MAX +
    '" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Como seus amigos te chamam?" value="' + esc(nick) + '">' +
    '<small class="fld-h">É o nome que aparece para seus amigos.</small>' +
    '<div class="row nb">' + '<div class="row-l"><span>Mostrar meu progresso do dia</span><small>Porcentagem da meta, sequência e os últimos 7 dias. Desligado, seus amigos veem só o apelido e as insígnias.</small></div>' +
    '<div class="row-c">' + sw('fr-share', share, 'Mostrar meu progresso do dia aos amigos') + '</div></div>' +
    '<div class="err" id="frErr" role="alert">' + (off ? errText('off') : '') + '</div>' +
    '<button class="btn block" type="button" id="frCta" data-action="fr-join">' + inv.cta + '</button>' + // sempre ativo: com a nuvem fora, tocar tenta subi-la de novo
    '<p class="ob-fine">Você sai quando quiser em Ajustes: seu perfil é apagado da nuvem na hora. ' +
    '<button type="button" data-action="fr-about">Como funciona</button></p></section>';
}

/* ---------- painéis ---------- */
// Uma insígnia em miniatura (perfil e amigo): colorida se conquistada, silhueta se não. Se pick, a conquistada é um botão (trocar o mascote)
function insTile(x, on, cur, pick) {
  const b = badge(x.id, { size: 40, locked: !on }), cap = '<b>' + x.n + '</b>';
  if (on && pick) {
    return '<button class="rf' + (cur ? ' cur' : '') + '" type="button" data-action="fr-mascot" data-id="' + x.id + '" aria-pressed="' + att(cur) + '" aria-label="' +
      x.n + (cur ? ', é o seu mascote' : ', usar como mascote') + '">' + b + cap + '</button>';
  }
  return '<div class="rf' + (on ? '' : ' off') + (cur ? ' cur' : '') + '"' + (on ? '' : ' aria-label="' + x.n + ', ainda bloqueada"') + '>' + b + cap + '</div>';
}
export function friendSheet(uid) {
  const f = SOC.st.friends.filter((x) => x.uid === uid)[0];
  if (!f) return '';
  const t = today(), l = liveOf(f, t), w = weekOf(f, t), wv = waveFor(f, t), inn = waveIn(f, t), nm = esc(f.nm), got = {};
  f.ins.forEach((id) => { got[id] = 1; });
  const wLabel = wv.done ? '✓ Aceno enviado hoje' : wv.kind === 'cheer' ? '🎉 Dar parabéns' : '👋 Acenar';
  return sheetHead(nm) + '<div class="fs" data-friend="' + f.uid + '"><div class="fs-av">' + avatar(f.mc, 104, ringOf(l)) + '</div>' +
    '<p class="fs-s ' + l.kind + '">' + statusText(l) + '</p>' + (l.st > 0 ? '<p class="fs-f">🔥 ' + plural(l.st, 'dia seguido', 'dias seguidos') + ' na meta</p>' : '') +
    (f.gl && l.kind !== 'paused' ? '<p class="fs-g">Meta do dia: <b>' + vol(f.gl) + '</b></p>' : '') +
    (inn ? '<p class="fs-w">' + nm + ' ' + WAVE_TEXT[inn.k] + '</p>' : '') +
    (w.known ? '<div class="card-h out"><h2>Últimos 7 dias</h2><small>' + w.n + ' de ' + WEEK + ' na meta</small></div>' + weekStrip(w, t) : '') +
    '<div class="card-h out"><h2>Insígnias</h2><small>' + f.ins.length + ' de ' + INSIGNIAS.length + '</small></div>' +
    '<div class="reef mini">' + INSIGNIAS.map((x) => insTile(x, !!got[x.id], x.id === f.mc, false)).join('') + '</div>' +
    (f.since ? '<p class="note center">Na turma desde ' + shortDate(f.since) + '</p>' : '') +
    '<div class="btns stk"><button class="btn' + (wv.done ? ' ghost' : '') + '" type="button" data-action="fr-wave" data-id="' + f.uid + '"' + (wv.done ? ' disabled' : '') + '>' + wLabel + '</button>' +
    btn('close-sheet', 'Fechar', 'ghost') + '</div></div>';
}
// "Meu perfil": como os amigos me veem. Troca de mascote, apelido e as chaves de privacidade ficam aqui.
export function profileSheet() {
  const sc = mine(), t = today(), l = liveOf(profilePayload(S, t), t), mas = mascotOf(S), got = S.insignias || {}, me = myMember(S, t);
  const goalNote = sc.goal === true ? 'Seus amigos veem a meta do dia ao lado da porcentagem. Dá para estimar quanto você bebeu.' : 'Desligado: seus amigos não veem a sua meta em ml.';
  return sheetHead('Meu perfil') + '<div class="fs"><div class="fs-av">' + avatar(mas.id, 104, ringOf(l)) + '</div>' +
    '<p class="fs-nm" id="frNm">' + esc(sc.nick || 'Amigo') + '</p><p class="fs-s ' + l.kind + '">' + statusText(l) + '</p>' +
    (me.week.known ? weekStrip(me.week, t) : '') +
    '<label class="lbl lft" for="frNickIn">Apelido</label><input class="in wide" id="frNickIn" type="text" data-field="nick" maxlength="' + NICK_MAX +
    '" autocomplete="off" autocapitalize="words" enterkeyhint="done" value="' + esc(sc.nick) + '" aria-label="Apelido que seus amigos veem">' +
    '<div class="row nb lft"><div class="row-l"><span>Mostrar meu progresso do dia</span><small>Porcentagem da meta, sequência e os últimos 7 dias.</small></div><div class="row-c">' +
    sw('fr-share', sc.share !== false, 'Mostrar meu progresso do dia aos amigos') + '</div></div>' +
    '<div class="row nb lft"><div class="row-l"><span>Mostrar minha meta em ml</span><small>' + goalNote + '</small></div><div class="row-c">' +
    sw('fr-goal', sc.goal === true, 'Mostrar minha meta em ml aos amigos') + '</div></div>' +
    '<div class="card-h out"><h2>Meu mascote</h2><small>toque para trocar</small></div>' +
    '<div class="reef mini">' + INSIGNIAS.map((x) => insTile(x, !!got[x.id], x.id === mas.id, true)).join('') + '</div>' +
    '<p class="note center">Sua turma vê seu mascote, as insígnias que você conquistou' + (sc.share !== false ? ', a porcentagem da meta de hoje, a sequência e quais dos últimos 7 dias você bateu a meta' : '') +
    (sc.goal === true && sc.share !== false ? ' e a sua meta em ml' : '') + '. Nunca os registros de cada gole.</p><div class="btns stk">' + btn('close-sheet', 'Fechar', 'ghost') + '</div></div>';
}
// "Inserir código": d = { raw, who, err }. who = { code, uid, nm, mc } depois que o código foi encontrado.
export function codeSheet(d) {
  d = d || {};
  const who = d.who;
  return sheetHead('Inserir código') + (who
    ? '<p class="sheet-text">Encontrei! Quer acompanhar o dia com essa pessoa?</p><div class="who">' + avatar(who.mc, 64, null) + '<div><b>' + esc(who.nm) +
      '</b><small>vai receber seu pedido de amizade</small></div></div>' +
      '<p class="note">Quando ela aceitar, vocês entram na mesma turma: todo mundo da turma de cada um passa a ver todo mundo.</p>' +
      '<div class="err" id="frErr" role="alert">' + esc(d.err || '') + '</div>' +
      '<div class="btns"><button class="btn ghost" type="button" data-action="fr-back">Voltar</button>' + btn('fr-send', 'Enviar pedido') + '</div>'
    : '<p class="sheet-text">Digite o código que a pessoa te mandou (8 letras e números). Pode colar o link do convite também.</p>' +
      '<label class="lbl" for="frCode">Código de convite</label><input class="in wide code-in" id="frCode" type="text" inputmode="text" autocapitalize="characters" ' +
      'autocomplete="off" autocorrect="off" spellcheck="false" maxlength="80" placeholder="ABCD-EFGH" value="' + esc(d.raw || '') + '">' +
      '<div class="err" id="frErr" role="alert">' + esc(d.err || '') + '</div><div class="btns">' + btn('close-sheet', 'Cancelar', 'ghost') + btn('fr-find', 'Procurar') + '</div>');
}
export function aboutSheet() {
  const li = (t) => '<li>' + t + '</li>';
  return sheetHead('Como funciona a privacidade') +
    '<p class="sheet-text">Os amigos do Maré formam uma turma só: quem entra vê todo mundo e todo mundo vê quem entra, com um ranking para animar. Você decide quando entrar e o que aparece de você.</p>' +
    '<p class="see-k ok">A turma vê</p><ul class="bul">' + li('seu apelido, seu mascote e suas insígnias (marcos, como ter passado de 100 litros, nunca o seu total)') +
    li('a porcentagem da meta de hoje que você fez, sua sequência e quais dos últimos 7 dias você bateu a meta (se você deixar o progresso ligado)') + '</ul>' +
    '<p class="see-k">Só se você deixar</p><ul class="bul">' + li('a sua meta do dia em ml. Com ela e a porcentagem dá para estimar quanto você bebeu; por isso fica desligada até você escolher, e dá para mudar em Ajustes a qualquer hora') + '</ul>' +
    '<p class="see-k no">Ninguém vê</p><ul class="bul">' + li('os registros de cada gole nem os horários') + li('seu peso e a unidade que você usa') +
    li('sua localização') + li('seu nome completo (só o apelido)') + '</ul>' +
    '<p class="see-k">Como a turma cresce</p><ul class="bul">' + li('quando alguém aceita um pedido, as turmas dos dois se juntam: todo mundo passa a ver todo mundo') +
    li('a turma tem até ' + (MAX_FRIENDS + 1) + ' pessoas; se a junção passaria disso, as turmas continuam separadas') +
    li('ninguém entra sem aceitar um convite') + '</ul>' +
    '<p class="see-k">Sair</p><p class="see-t">Em Ajustes → Amigos → Sair da turma, seu perfil, seus convites e suas amizades são apagados da nuvem na hora. Como a turma é uma só, não dá para tirar uma pessoa só: quem quiser sair, sai de tudo.</p>' +
    '<div class="btns stk">' + btn('close-sheet', 'Entendi') + '</div>';
}

/* ---------- peças em outras telas ---------- */
// Faixa da tela Hoje: a turma de relance (só com amigos). Toque abre a aba Amigos.
export function crewHTML() {
  const st = SOC.st;
  if (!mine().on || !st.friends.length) return '';
  const t = today(), tm = turma(myLive(S, t), st.friends.map((f) => liveOf(f, t))), show = st.friends.slice(0, 2), more = st.friends.length - show.length;
  return '<section class="card crew"><button class="crew-b" type="button" data-action="tab" data-tab="friends" aria-label="Maré da turma: ' + tm.text + '. Abrir amigos">' +
    '<span class="av-stack">' + myAvatar(38) + show.map((f) => avatar(f.mc, 38, ringOf(liveOf(f, t)))).join('') + (more > 0 ? '<span class="av-more">+' + more + '</span>' : '') +
    '</span><span class="crew-t"><span class="crew-k">Maré da turma</span><b>' + tm.text + '</b><small>' + tm.sub + '</small></span><span class="crew-go" aria-hidden="true">›</span></button></section>';
}
// Bolinha na aba Amigos: pedidos esperando resposta ou acenos que ainda não vi
export function tabDots() {
  if (!mine().on) return {};
  const st = SOC.st;
  return { friends: st.reqIn.length > 0 || unseenWaves(st.friends, S.ui.wv, today()).length > 0 };
}
// "Avisos dos amigos" em Ajustes: ligado só com a escolha ligada E a permissão dada (como os lembretes). Bloqueado ou iPhone sem instalar:
// a chave fica desligada e o toque abre a ajuda. Sem suporte a push (ou app nativo): só o aviso, sem chave que não faria nada.
export function alertsNote() {
  const st = notifStatus(), on = mine().push !== false;
  if (st === 'denied') return 'Bloqueados no navegador: toque no botão para ver como liberar';
  if (st === 'install') return 'No iPhone, instale o Maré na Tela de Início para ativar';
  if (st === 'unsupported' || st === 'native') return 'Este navegador só mostra os avisos com o Maré aberto';
  if (st === 'granted' && on) return 'Pedido de amizade, aceite, acenos e novos amigos na turma chegam como notificação';
  return st === 'default' && on ? 'Desligados: ative para saber na hora de pedidos e acenos' : 'Desligados';
}
export const alertsOn = () => notifStatus() === 'granted' && mine().push !== false;
// Os avisos opcionais (1.2.0) só valem com os avisos dos amigos ligados: sem a permissão ou sem suporte, a chave fica desligada e a nota explica.
export const hitOn = () => alertsOn() && mine().hit === true;
export const weekOn = () => alertsOn() && mine().week !== false;
function optNote(on, onText, offText) {
  const st = notifStatus();
  if (st === 'denied' || st === 'install' || st === 'unsupported' || st === 'native') return alertsNote();
  return on ? onText : offText;
}
export const hitNote = () => optNote(hitOn(), 'Uma notificação quando alguém da turma bater a meta do dia', 'Desligado: só avisa quem você escolher');
export const weekNote = () => optNote(weekOn(), 'Domingo, às 19h, um resumo de como foi a semana da turma', 'Desligado');
function alertsRow() {
  const st = notifStatus(), none = st === 'unsupported' || st === 'native';
  return row('Avisos dos amigos', alertsNote(), none ? '' : sw('fr-alerts', alertsOn(), 'Avisos dos amigos'), 'frAlertNote') +
    (none ? '' : row('Avisar quando um amigo bater a meta', hitNote(), sw('fr-hit', hitOn(), 'Avisar quando um amigo bater a meta'), 'frHitNote') +
      row('Resumo da semana da turma', weekNote(), sw('fr-week', weekOn(), 'Resumo da semana da turma'), 'frWeekNote'));
}
// Grupo "Amigos" em Ajustes
export function settingsFriendsHTML() {
  const sc = mine();
  if (!sc.on) return sec('Amigos') + '<div class="group">' + row('Amigos', 'Forme uma turma com quem você gosta e acompanhem o dia uns dos outros.', sbtn('fr-intro', 'Conhecer')) + '</div>';
  return sec('Amigos') + '<div class="group">' +
    row('Meu perfil público', esc(sc.nick || 'Amigo') + ' · o que seus amigos veem', sbtn('fr-profile', 'Abrir')) +
    row('Mostrar meu progresso do dia', 'Porcentagem da meta, sequência e os últimos 7 dias. Desligado, seus amigos veem só o apelido e as insígnias.',
      sw('fr-share', sc.share !== false, 'Mostrar meu progresso do dia aos amigos')) +
    row('Mostrar minha meta em ml', 'Seus amigos veem a meta do dia ao lado da porcentagem. Dá para estimar quanto você bebeu.',
      sw('fr-goal', sc.goal === true, 'Mostrar minha meta em ml aos amigos')) +
    alertsRow() +
    row('Novo código de convite', 'Quem tem o código antigo não consegue mais usá-lo. Sua turma continua.', sbtn('fr-newcode', 'Trocar')) +
    row('Sair da turma', 'Apaga seu perfil, convites e amizades da nuvem.', sbtn('fr-leave', 'Sair', 'ghost danger')) + '</div>';
}
// Assinatura do que a aba mostra: o app só redesenha quando ela muda (um amigo atualizar o perfil não faz a tela piscar à toa)
export function friendsSig() {
  const st = SOC.st;
  return JSON.stringify([SOC.mode, st.ready, st.err, st.code, st.friends, st.reqIn, st.reqOut, S.social, S.ui.frRank, S.profile.unit, today(), mascotOf(S).id,
    myLive(S, today()), notifStatus(), !!S.ui.tip_fpush]);
}
