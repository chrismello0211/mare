// Maré — telas dos amigos (Parte 9). Só monta HTML a partir de S e SOC (store.js); nunca altera nada.
// Quem muda o estado e conversa com a nuvem é o app.js. Contrato de cliques (data-action): fr-join, fr-share, fr-invite, fr-copy, fr-code,
// fr-find, fr-send, fr-back, fr-accept, fr-decline, fr-decline-all, fr-cancel, fr-open, fr-wave, fr-remove, fr-profile, fr-mascot, fr-about,
// fr-newcode, fr-leave, fr-retry, fr-intro. Campos: #frNick (entrada), #frNickIn (data-field="nick", no perfil), #frCode (código de convite).
// Princípios (guardados por tests/social.test.js): sem ranking (lista em ordem alfabética), sem litros, textos sempre positivos.
import { INSIGNIAS, mascotOf } from './core.js';
import { S, SOC, esc, plural, today, shortDate } from './store.js';
import { sheetHead } from './ui.js';
import { badge } from './art.js';
import { btn, sbtn, sec, row, sw, empty, att, shareIco } from './kit.js';
import { MAX_FRIENDS, NICK_MAX, fmtCode, liveOf, statusText, turma, waveFor, waveIn, WAVE_TEXT, myLive, ringOf, unseenWaves, firstNick,
  profilePayload, errText } from './social.js';

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

/* ---------- a aba Amigos ---------- */
// Aviso discreto no topo: conectando, sem internet, servidor sem as regras... (a lista guardada no aparelho continua à vista)
function notice() {
  const st = SOC.st;
  let e = '', t = '', retry = false;
  if (SOC.mode === 'off') { e = '☁️'; t = 'Sem conexão com a nuvem do Maré. Você vê o que o app guardou da última vez.'; retry = true; }
  else if (st.err) { e = st.err === 'offline' ? '📡' : '☁️'; t = st.err === 'offline' ? 'Sem internet agora: mostrando o que o Maré viu por último.' : errText(st.err); retry = true; }
  else if (SOC.mode === 'wait' || !st.ready) { e = '🌊'; t = 'Atualizando seus amigos…'; }
  if (!t) return '';
  return '<div class="notice" role="status"><span class="em" aria-hidden="true">' + e + '</span><span class="nt">' + t + '</span>' +
    (retry ? '<button type="button" data-action="fr-retry">Tentar de novo</button>' : '') + '</div>';
}

function friendRow(f, t) {
  const l = liveOf(f, t), ring = ringOf(l), wv = waveFor(f, t), inn = waveIn(f, t), nm = esc(f.nm);
  const label = wv.done ? 'Aceno enviado para ' + nm + ' hoje' : wv.kind === 'cheer' ? 'Dar parabéns a ' + nm : 'Acenar para ' + nm;
  return '<li class="fr"><button class="fr-main" type="button" data-action="fr-open" data-id="' + f.uid + '">' + avatar(f.mc, 52, ring) +
    '<span class="fr-t"><b>' + nm + '</b><small class="fr-s ' + l.kind + '">' + statusText(l) + '</small>' +
    (l.st > 0 ? '<small class="fr-f">🔥 ' + plural(l.st, 'dia seguido', 'dias seguidos') + '</small>' : '') +
    (inn ? '<small class="fr-w">' + WAVE_TEXT[inn.k] + '</small>' : '') + '</span></button>' +
    '<button class="fr-wave' + (wv.done ? ' done' : '') + '" type="button" data-action="fr-wave" data-id="' + f.uid + '"' + (wv.done ? ' disabled' : '') +
    ' aria-label="' + label + '"><span aria-hidden="true">' + (wv.done ? '✓' : wv.kind === 'cheer' ? '🎉' : '👋') + '</span></button></li>';
}
function tideCard(tm) {
  const p = Math.round((tm.met / tm.total) * 100);
  return '<section class="tide ' + tm.kind + '" aria-label="Maré da turma"><span class="tide-k">Maré da turma</span><p class="tide-t">' + tm.text + '</p><p class="tide-s">' + tm.sub +
    '</p>' + (tm.kind === 'quiet' ? '' : '<div class="bar" role="progressbar" aria-label="Quem já bateu a meta hoje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
      p + '"><i data-w="' + p + '"></i></div>') + '</section>';
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
function friendsCard(t) {
  const fs = SOC.st.friends;
  return '<section class="card"><div class="card-h"><h2>Sua turma</h2><small>' + (fs.length ? plural(fs.length, 'amigo', 'amigos') : '') + '</small></div>' +
    (fs.length ? '<ul class="fr-list">' + fs.map((f) => friendRow(f, t)).join('') + '</ul>'
      : empty('🐠', 'Seu recife ainda está sozinho. Convide a primeira pessoa e acompanhem o dia um do outro.')) + '</section>';
}
function inviteCard() {
  const code = SOC.st.code || mine().code, off = code ? '' : ' disabled';
  return '<section class="card invite"><div class="card-h"><h2>Convide alguém</h2></div>' +
    '<p class="inv-t">Mande seu convite. Quando a pessoa aceitar, vocês passam a acompanhar o dia um do outro.</p>' +
    (code ? '<div class="code" aria-label="Seu código de convite: ' + fmtCode(code).split('').join(' ') + '">' + fmtCode(code) + '</div>'
      : '<div class="code wait">Gerando seu código…</div>') +
    '<button class="btn block" type="button" data-action="fr-invite"' + off + '>' + shareIco() + '<span>Compartilhar convite</span></button>' +
    '<div class="btns two"><button class="btn ghost" type="button" data-action="fr-copy"' + off + '>Copiar código</button>' +
    '<button class="btn ghost" type="button" data-action="fr-code">Inserir código</button></div></section>';
}
export function friendsView(ctx) {
  if (!mine().on) return introView(ctx || {});
  const st = SOC.st, t = today(), tm = turma(myLive(S, t), st.friends.map((f) => liveOf(f, t)));
  return '<header class="page-h fr-h"><div><h1 class="h1">Amigos</h1><p class="eyebrow">Cada gole conta, juntos</p></div>' +
    '<button class="chip fr-me" type="button" data-action="fr-profile" aria-label="Meu perfil">' + myAvatar(34) + '<span>Perfil</span></button></header>' +
    notice() + (st.reqIn.length ? reqCard(st.reqIn, true) : '') + (st.friends.length ? tideCard(tm) : '') + friendsCard(t) + inviteCard() +
    (st.reqOut.length ? reqCard(st.reqOut, false) : '') +
    '<p class="hint">Aqui ninguém compete: a lista é em ordem alfabética e ninguém vê os litros do outro. ' +
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
    '<p class="fr-lead">Convide quem você gosta e acompanhem o dia um do outro. Aqui ninguém compete: é só um incentivo gostoso para todo mundo continuar.</p>' +
    '<div id="frInv">' + inv.html + '</div><ul class="fr-feat">' +
    feat('💙', 'Sem ranking e sem comparação', 'A lista é em ordem alfabética e ninguém vê os litros do outro.') +
    feat('🔒', 'Só amigos que você aprova', 'Seu perfil só aparece para quem aceitou o seu convite ou foi aceito por você.') +
    feat('👋', 'Acenos e parabéns', 'Mande um incentivo para quem está se esforçando ou bateu a meta.') + '</ul>' +
    '<section class="card see"><div class="card-h"><h2>O que seus amigos veem</h2></div>' +
    '<p class="see-k ok">Veem</p><p class="see-t">Seu apelido, seu mascote e suas insígnias (marcos, nunca o total de litros), a porcentagem da meta de hoje que você fez e sua sequência de dias.</p>' +
    '<p class="see-k no">Nunca veem</p><p class="see-t">Quantos litros você bebeu, seu peso, sua meta em ml, os horários dos goles, sua localização e seu nome completo.</p></section>' +
    '<section class="card"><label class="lbl" for="frNick">Seu apelido</label><input class="in wide" id="frNick" type="text" maxlength="' + NICK_MAX +
    '" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Como seus amigos te chamam?" value="' + esc(nick) + '">' +
    '<small class="fld-h">É o nome que aparece para seus amigos.</small>' +
    '<div class="row nb">' + '<div class="row-l"><span>Mostrar meu progresso do dia</span><small>Porcentagem da meta e sequência. Desligado, seus amigos veem só o apelido e as insígnias.</small></div>' +
    '<div class="row-c">' + sw('fr-share', share, 'Mostrar meu progresso do dia aos amigos') + '</div></div>' +
    '<div class="err" id="frErr" role="alert">' + (off ? errText('off') : '') + '</div>' +
    '<button class="btn block" type="button" id="frCta" data-action="fr-join"' + (off ? ' disabled' : '') + '>' + inv.cta + '</button>' +
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
  const t = today(), l = liveOf(f, t), wv = waveFor(f, t), inn = waveIn(f, t), nm = esc(f.nm), got = {};
  f.ins.forEach((id) => { got[id] = 1; });
  const wLabel = wv.done ? '✓ Aceno enviado hoje' : wv.kind === 'cheer' ? '🎉 Dar parabéns' : '👋 Acenar';
  return sheetHead(nm) + '<div class="fs" data-friend="' + f.uid + '"><div class="fs-av">' + avatar(f.mc, 104, ringOf(l)) + '</div>' +
    '<p class="fs-s ' + l.kind + '">' + statusText(l) + '</p>' + (l.st > 0 ? '<p class="fs-f">🔥 ' + plural(l.st, 'dia seguido', 'dias seguidos') + ' na meta</p>' : '') +
    (inn ? '<p class="fs-w">' + nm + ' ' + WAVE_TEXT[inn.k] + '</p>' : '') +
    '<div class="card-h out"><h2>Insígnias</h2><small>' + f.ins.length + ' de ' + INSIGNIAS.length + '</small></div>' +
    '<div class="reef mini">' + INSIGNIAS.map((x) => insTile(x, !!got[x.id], x.id === f.mc, false)).join('') + '</div>' +
    (f.since ? '<p class="note center">Amigos desde ' + shortDate(f.since) + '</p>' : '') +
    '<div class="btns stk"><button class="btn' + (wv.done ? ' ghost' : '') + '" type="button" data-action="fr-wave" data-id="' + f.uid + '"' + (wv.done ? ' disabled' : '') + '>' + wLabel + '</button>' +
    btn('fr-remove', 'Remover amizade', 'ghost danger', ' data-id="' + f.uid + '"') + '</div></div>';
}
// "Meu perfil": como os amigos me veem. Troca de mascote, apelido e a chave "mostrar meu progresso" ficam aqui.
export function profileSheet() {
  const sc = mine(), t = today(), l = liveOf(profilePayload(S, t), t), mas = mascotOf(S), got = S.insignias || {};
  return sheetHead('Meu perfil') + '<div class="fs"><div class="fs-av">' + avatar(mas.id, 104, ringOf(l)) + '</div>' +
    '<p class="fs-nm" id="frNm">' + esc(sc.nick || 'Amigo') + '</p><p class="fs-s ' + l.kind + '">' + statusText(l) + '</p>' +
    '<label class="lbl lft" for="frNickIn">Apelido</label><input class="in wide" id="frNickIn" type="text" data-field="nick" maxlength="' + NICK_MAX +
    '" autocomplete="off" autocapitalize="words" enterkeyhint="done" value="' + esc(sc.nick) + '" aria-label="Apelido que seus amigos veem">' +
    '<div class="row nb lft"><div class="row-l"><span>Mostrar meu progresso do dia</span><small>Porcentagem da meta e sequência.</small></div><div class="row-c">' +
    sw('fr-share', sc.share !== false, 'Mostrar meu progresso do dia aos amigos') + '</div></div>' +
    '<div class="card-h out"><h2>Meu mascote</h2><small>toque para trocar</small></div>' +
    '<div class="reef mini">' + INSIGNIAS.map((x) => insTile(x, !!got[x.id], x.id === mas.id, true)).join('') + '</div>' +
    '<p class="note center">Seus amigos veem seu mascote, as insígnias que você conquistou' + (sc.share !== false ? ', a porcentagem da meta de hoje e a sequência' : '') +
    '. Nunca os litros.</p><div class="btns stk">' + btn('close-sheet', 'Fechar', 'ghost') + '</div></div>';
}
// "Inserir código": d = { raw, who, err }. who = { code, uid, nm, mc } depois que o código foi encontrado.
export function codeSheet(d) {
  d = d || {};
  const who = d.who;
  return sheetHead('Inserir código') + (who
    ? '<p class="sheet-text">Encontrei! Quer acompanhar o dia com essa pessoa?</p><div class="who">' + avatar(who.mc, 64, null) + '<div><b>' + esc(who.nm) +
      '</b><small>vai receber seu pedido de amizade</small></div></div><div class="err" id="frErr" role="alert">' + esc(d.err || '') + '</div>' +
      '<div class="btns"><button class="btn ghost" type="button" data-action="fr-back">Voltar</button>' + btn('fr-send', 'Enviar pedido') + '</div>'
    : '<p class="sheet-text">Digite o código que a pessoa te mandou (8 letras e números). Pode colar o link do convite também.</p>' +
      '<label class="lbl" for="frCode">Código de convite</label><input class="in wide code-in" id="frCode" type="text" inputmode="text" autocapitalize="characters" ' +
      'autocomplete="off" autocorrect="off" spellcheck="false" maxlength="80" placeholder="ABCD-EFGH" value="' + esc(d.raw || '') + '">' +
      '<div class="err" id="frErr" role="alert">' + esc(d.err || '') + '</div><div class="btns">' + btn('close-sheet', 'Cancelar', 'ghost') + btn('fr-find', 'Procurar') + '</div>');
}
export function aboutSheet() {
  const li = (t) => '<li>' + t + '</li>';
  return sheetHead('Como funciona a privacidade') +
    '<p class="sheet-text">Os amigos do Maré são um incentivo, não uma competição. Você decide quem entra e o que aparece.</p>' +
    '<p class="see-k ok">Seus amigos veem</p><ul class="bul">' + li('seu apelido, seu mascote e suas insígnias (marcos, como ter passado de 100 litros, nunca o seu total)') + li('a porcentagem da meta de hoje que você fez (se você deixar ligado)') +
    li('sua sequência de dias na meta') + '</ul>' +
    '<p class="see-k no">Ninguém vê</p><ul class="bul">' + li('quantos litros ou mililitros você bebeu') + li('seu peso, sua meta em ml ou a unidade que você usa') +
    li('os horários dos seus registros') + li('sua localização') + li('seu nome completo (só o apelido)') + '</ul>' +
    '<p class="see-k">Quem pode ver</p><ul class="bul">' + li('só quem aceitou seu convite ou teve o pedido aceito por você') + li('até ' + MAX_FRIENDS + ' amigos') +
    li('você pode remover qualquer amizade quando quiser') + '</ul>' +
    '<p class="see-k">Sair</p><p class="see-t">Em Ajustes → Amigos → Sair dos amigos, seu perfil, seus convites e suas amizades são apagados da nuvem na hora.</p>' +
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
// Grupo "Amigos" em Ajustes
export function settingsFriendsHTML() {
  const sc = mine();
  if (!sc.on) return sec('Amigos') + '<div class="group">' + row('Amigos', 'Acompanhe o dia de quem você gosta, sem competição.', sbtn('fr-intro', 'Conhecer')) + '</div>';
  return sec('Amigos') + '<div class="group">' +
    row('Meu perfil público', esc(sc.nick || 'Amigo') + ' · o que seus amigos veem', sbtn('fr-profile', 'Abrir')) +
    row('Mostrar meu progresso do dia', 'Porcentagem da meta e sequência. Desligado, seus amigos veem só o apelido e as insígnias.',
      sw('fr-share', sc.share !== false, 'Mostrar meu progresso do dia aos amigos')) +
    row('Novo código de convite', 'Quem tem o código antigo não consegue mais usá-lo. Seus amigos continuam.', sbtn('fr-newcode', 'Trocar')) +
    row('Sair dos amigos', 'Apaga seu perfil, convites e amizades da nuvem.', sbtn('fr-leave', 'Sair', 'ghost danger')) + '</div>';
}
// Assinatura do que a aba mostra: o app só redesenha quando ela muda (um amigo atualizar o perfil não faz a tela piscar à toa)
export function friendsSig() {
  const st = SOC.st;
  return JSON.stringify([SOC.mode, st.ready, st.err, st.code, st.friends, st.reqIn, st.reqOut, S.social, today(), mascotOf(S).id, myLive(S, today())]);
}
