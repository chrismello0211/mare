// Maré — conta (1.3.0): validação de e-mail e senha, mensagens do login em português e o backup dos ajustes na nuvem.
// Tudo aqui é puro (sem Firebase e sem tela): o firebase.js faz o login e fala com o Firestore, o app.js liga as peças.
//
// Como a conta funciona (resumo; os detalhes estão na Parte 12 do HANDOFF):
//  • Criar conta = vincular e-mail e senha ao login anônimo que o aparelho já tem. O identificador (uid) NÃO muda, então registros,
//    amigos e turma continuam exatamente onde estavam.
//  • Os registros (days) já iam para a nuvem desde a 1.0. O que só existia no aparelho (nome, peso, atividade, metas, copos, tema,
//    escolhas dos amigos) agora também vai, num único documento (users/{uid}/backup/prefs), mas SÓ para quem tem conta.
//  • Entrar num aparelho novo = baixar tudo isso de volta (restorePlan) e aplicar (applyPrefs).
import { ACTIVITY, drink, insigniaById, defaults, keyToDate, mascotOf } from './core.js';
import { cleanNick, rankId } from './social.js';

export const PW_MIN = 8, PW_MAX = 128, EMAIL_MAX = 254;
export const PREFS_MAX = 4000; // o mesmo limite das regras do Firestore (validPrefs)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F-\u009F<>]/g, '').trim().slice(0, n);

/* ---------- e-mail e senha ---------- */
// Tira espaços (inclusive os invisíveis que o copiar e colar traz) e põe em minúsculas: o login do Firebase não diferencia maiúsculas
export const cleanEmail = (s) => String(s == null ? '' : s).replace(/[\s ​-‍⁠﻿]/g, '').toLowerCase().slice(0, EMAIL_MAX + 1);
export function validEmail(s) {
  const e = String(s == null ? '' : s);
  if (e.length < 5 || e.length > EMAIL_MAX) return false;
  const at = e.indexOf('@');
  if (at < 1 || at !== e.lastIndexOf('@') || at > 64) return false;
  const local = e.slice(0, at), dom = e.slice(at + 1);
  if (/[\s,;:<>()[\]\\"]/.test(e)) return false;
  if (local.charAt(0) === '.' || local.charAt(local.length - 1) === '.' || local.indexOf('..') >= 0) return false;
  // domínio: partes de letras, números e hífen (sem hífen nas pontas), ao menos um ponto, final de 2 letras ou mais
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(dom)) return false;
  return /^([a-z]{2,}|xn--[a-z0-9-]{2,})$/i.test(dom.slice(dom.lastIndexOf('.') + 1));
}
// As senhas mais usadas do mundo (e as que alguém tentaria para um app de água): recusadas de cara
const WEAK = ['12345678', '123456789', '1234567890', '87654321', '12341234', '11111111', '00000000', 'password', 'password1', 'qwertyui',
  'qwerty123', 'abcd1234', 'abc12345', 'senha123', 'senha1234', 'minhasenha', 'mare1234', 'maremare', 'iloveyou', '1q2w3e4r'];
// Texto do problema com a senha, ou '' se estiver boa. O Firebase aceita 6 letras; o Maré pede 8, que é o mínimo atual recomendado.
export function passwordProblem(pw, email) {
  const p = typeof pw === 'string' ? pw : '';
  if (!p) return 'Digite uma senha.';
  if (p.length < PW_MIN) return 'A senha precisa ter pelo menos ' + PW_MIN + ' caracteres.';
  if (p.length > PW_MAX) return 'A senha pode ter no máximo ' + PW_MAX + ' caracteres.';
  if (!/\S/.test(p)) return 'A senha não pode ser só espaços.';
  if (/^(.)\1+$/.test(p) || WEAK.indexOf(p.toLowerCase()) >= 0) return 'Essa senha é fácil de adivinhar. Escolha outra.';
  if (email && p.toLowerCase() === cleanEmail(email)) return 'A senha não pode ser igual ao e-mail.';
  return '';
}
// Confere o formulário antes de falar com o servidor. Devolve o texto do problema ou ''.
export function signInProblem(email, pw) {
  if (!cleanEmail(email)) return AUTH['auth/missing-email'];
  if (!validEmail(cleanEmail(email))) return AUTH['auth/invalid-email'];
  if (typeof pw !== 'string' || !pw) return AUTH['auth/missing-password'];
  return '';
}
export function createProblem(email, pw) {
  const e = cleanEmail(email);
  if (!e) return AUTH['auth/missing-email'];
  if (!validEmail(e)) return AUTH['auth/invalid-email'];
  return passwordProblem(pw, e);
}
export function resetProblem(email) {
  const e = cleanEmail(email);
  if (!e) return AUTH['auth/missing-email'];
  return validEmail(e) ? '' : AUTH['auth/invalid-email'];
}

/* ---------- mensagens do login (nunca texto técnico) ---------- */
// Dois "dialetos" de erro: o emulador e projetos sem a proteção de enumeração de e-mails dizem wrong-password e user-not-found; projetos
// com a proteção ligada (o padrão dos novos) dizem sempre invalid-credential, para não revelar quais e-mails têm conta. Mesma frase nos dois.
const BAD_LOGIN = 'E-mail ou senha incorretos. Se esqueceu a senha, toque em “Esqueci a senha”.';
const AUTH = {
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Toque em “Já tenho conta” para entrar nela.',
  'auth/invalid-email': 'Esse e-mail não parece certo. Confira se não falta algo, como o “@”.',
  'auth/missing-email': 'Digite o e-mail.',
  'auth/missing-password': 'Digite a senha.',
  'auth/weak-password': 'Escolha uma senha mais forte, com pelo menos ' + PW_MIN + ' caracteres.',
  'auth/wrong-password': BAD_LOGIN,
  'auth/invalid-credential': BAD_LOGIN,
  'auth/invalid-login-credentials': BAD_LOGIN,
  'auth/user-not-found': BAD_LOGIN,
  'auth/invalid-password': BAD_LOGIN,
  'auth/user-disabled': 'Esta conta foi desativada. Fale com quem cuida do Maré.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  'auth/quota-exceeded': 'Muitos e-mails enviados por hoje. Tente de novo mais tarde.',
  'auth/network-request-failed': 'Sem conexão com a internet. Confira a rede e tente de novo.',
  'auth/requires-recent-login': 'Por segurança, digite sua senha para continuar.',
  'auth/user-token-expired': 'Sua sessão expirou. Entre de novo.',
  'auth/credential-already-in-use': 'Este e-mail já está em uso por outra conta.',
  'auth/provider-already-linked': 'Este aparelho já está numa conta.',
  'auth/operation-not-allowed': 'O login por e-mail ainda não foi ligado neste app. Tente de novo mais tarde.',
  'auth/internal-error': 'O serviço de login falhou. Tente de novo em instantes.',
  'auth/app-not-authorized': 'Este aplicativo não está autorizado a usar o login. Tente de novo mais tarde.',
  'auth/invalid-api-key': 'O login não está configurado direito neste app. Tente de novo mais tarde.',
  'auth/web-storage-unsupported': 'Este navegador bloqueou o armazenamento que o login precisa. Saia da navegação privada e tente de novo.',
  'auth/timeout': 'Demorou demais. Confira a internet e tente de novo.',
  'mare/off': 'A nuvem do Maré não está disponível agora. Confira a internet e tente de novo.',
  off: 'A nuvem do Maré não está disponível agora. Confira a internet e tente de novo.',
  slow: 'Está demorando mais que o normal. Confira sua conexão e tente de novo.',
  'mare/slow': 'Está demorando mais que o normal. Confira sua conexão e tente de novo.',
  'mare/no-session': 'Ainda não conectei este aparelho à nuvem. Espere um instante e tente de novo.',
  'mare/pending': 'Ainda há registros que não chegaram à nuvem. Conecte-se à internet e tente de novo.',
  'mare/no-data': 'Entrei na conta, mas não consegui baixar seus dados. Confira a internet e tente de novo.',
  'mare/leave-failed': 'Não consegui sair da turma agora, então nada mudou. Confira a internet e tente de novo.',
  'mare/other-account': 'Este e-mail é de outra conta, diferente da que este aparelho tinha. Para entrar nela, toque em “Apagar tudo” em Ajustes e depois em “Entrar na conta” na tela inicial.',
  'permission-denied': 'O servidor do Maré recusou a operação. Tente de novo mais tarde.',
  unavailable: 'Sem conexão com a nuvem agora. Tente de novo quando a internet voltar.',
  unknown: 'Não deu certo. Tente de novo.',
};
export const AUTH_CODES = Object.keys(AUTH);
export function authText(code) {
  const c = String(code == null ? '' : code);
  if (AUTH[c]) return AUTH[c];
  const short = c.indexOf('firestore/') === 0 ? c.slice(10) : c;
  return AUTH[short] || AUTH.unknown;
}
// Os códigos de erro do login que, se acontecerem, dizem que a senha (ou o e-mail) digitada não serve
export const isBadLogin = (code) => ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found', 'auth/invalid-password'].indexOf(code) >= 0;

/* ---------- a dica local da conta (mare:acct) ---------- */
// O aparelho guarda só o que a tela precisa para desenhar o cartão da conta sem esperar a rede: uid, e-mail e se foi confirmado.
export const ACCT_KEY = 'mare:acct';
// A marca de sincronização da nuvem neste aparelho (firebase.js: o que já foi trocado com a nuvem). Quem apaga o aparelho de vez também a apaga:
// senão, ao entrar de novo na mesma conta, só viria o que mudou depois dela e o histórico não voltaria.
export const MARK_KEY = 'mare:cloud';
export function cleanAcct(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const email = cleanEmail(raw.email);
  // o Firebase já aceitou este e-mail (o administrador pode ter cadastrado um fora do padrão do formulário): aqui só se confere o formato mínimo
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > EMAIL_MAX || typeof raw.uid !== 'string' || !/^[A-Za-z0-9]{10,64}$/.test(raw.uid)) return null;
  return { uid: raw.uid, email: email, verified: raw.verified === true };
}
// Mostra o e-mail sem escancarar: "ana.paula@gmail.com" → "an…@gmail.com" só quando o espaço é curto; na tela do cartão vai inteiro.
export const emailShort = (e) => { const s = String(e || ''), at = s.indexOf('@'); return s.length <= 26 || at < 0 ? s : s.slice(0, Math.max(3, Math.min(at, 12))) + '…' + s.slice(at); };

/* ---------- backup dos ajustes (users/{uid}/backup/prefs) ---------- */
// O que vai para a nuvem de quem tem conta. Fora de propósito: lembretes ligados/desligados e horário do próximo (são deste aparelho e da
// permissão de notificação dele), o clima de hoje, o convite pendente, a lista de amigos (vive em friendships/profiles) e os registros
// (vivem em days). Só os recados que a pessoa já dispensou (tip_*) e a visão do ranking vêm de "ui".
export function prefsSnapshot(S) {
  const p = S.profile, g = S.goal, r = S.reminders, c = S.social, ui = {};
  Object.keys(S.ui || {}).sort().forEach((k) => { if (/^tip_[A-Za-z0-9_]{1,24}$/.test(k) && S.ui[k]) ui[k] = 1; });
  if (S.ui && S.ui.frRank) ui.frRank = rankId(S.ui.frRank);
  return {
    createdAt: +S.createdAt || 0,
    profile: { name: p.name, weight: p.weight, activity: p.activity, wake: p.wake, sleep: p.sleep, unit: p.unit, theme: p.theme,
      others: p.others !== false, mix: p.mix === true, mascot: p.mascot || '' },
    goal: { mode: g.mode, manual: g.manual, climate: !!g.climate },
    cups: S.cups.slice(0, 4),
    last: S.last, lastO: S.lastO,
    reminders: { interval: r.interval, smart: r.smart !== false },
    social: { on: c.on === true, nick: c.nick || '', share: c.share !== false, goal: c.goal === true ? true : c.goal === false ? false : null,
      push: c.push !== false, hit: c.hit === true, week: c.week !== false },
    ui: ui,
  };
}
// O documento como vai para o Firestore. null se, por algum motivo, passar do limite (aí o app só não faz o backup dos ajustes).
export function prefsPack(S, u) {
  const snap = prefsSnapshot(S);
  let j = JSON.stringify(snap);
  if (j.length > PREFS_MAX) { snap.ui = {}; j = JSON.stringify(snap); }
  if (j.length > PREFS_MAX) return null;
  return { v: 1, u: u || Date.now(), j: j };
}
// Limpa o que veio da nuvem como se fosse um backup de arquivo: nada daqui é confiável até passar por aqui. Sempre devolve um objeto
// completo e válido (o que faltar ou estiver errado vira o padrão do app).
export function cleanPrefs(o) {
  const D = defaults(), src = o && typeof o === 'object' ? o : {};
  const sp = src.profile && typeof src.profile === 'object' ? src.profile : {}, sg = src.goal && typeof src.goal === 'object' ? src.goal : {};
  const sr = src.reminders && typeof src.reminders === 'object' ? src.reminders : {}, ss = src.social && typeof src.social === 'object' ? src.social : {};
  const w = +sp.weight, ui = {};
  const profile = {
    name: str(sp.name, 30),
    weight: isFinite(w) && w > 0 ? clamp(Math.round(w * 10) / 10, 30, 250) : D.profile.weight,
    activity: ACTIVITY[sp.activity] ? sp.activity : D.profile.activity,
    wake: HHMM.test(sp.wake) ? sp.wake : D.profile.wake,
    sleep: HHMM.test(sp.sleep) ? sp.sleep : D.profile.sleep,
    unit: sp.unit === 'oz' ? 'oz' : 'ml',
    theme: ['auto', 'light', 'dark'].indexOf(sp.theme) >= 0 ? sp.theme : 'auto',
    others: sp.others !== false,
    mix: sp.mix === true,
    mascot: insigniaById(sp.mascot) ? sp.mascot : '',
  };
  if (profile.wake === profile.sleep) { profile.wake = D.profile.wake; profile.sleep = D.profile.sleep; }
  const goal = { mode: sg.mode === 'manual' ? 'manual' : 'auto', manual: clamp(Math.round(+sg.manual) || D.goal.manual, 500, 6000), climate: sg.climate === true };
  const cups = Array.isArray(src.cups) && src.cups.length === 4 ? src.cups.map((c, i) => clamp(Math.round(+c) || D.cups[i], 30, 2000)) : D.cups.slice();
  const l = drink(src.last), lo = drink(src.lastO);
  const iv = +sr.interval;
  const reminders = { interval: [45, 60, 90, 120].indexOf(iv) >= 0 ? iv : D.reminders.interval, smart: sr.smart !== false };
  const social = { on: ss.on === true, nick: cleanNick(ss.nick), share: ss.share !== false, goal: ss.goal === true ? true : ss.goal === false ? false : null,
    push: ss.push !== false, hit: ss.hit === true, week: ss.week !== false };
  if (src.ui && typeof src.ui === 'object') {
    Object.keys(src.ui).slice(0, 60).forEach((k) => { if (/^tip_[A-Za-z0-9_]{1,24}$/.test(k) && src.ui[k]) ui[k] = 1; });
    if (src.ui.frRank) ui.frRank = rankId(src.ui.frRank);
  }
  const ca = +src.createdAt;
  return {
    createdAt: isFinite(ca) && ca > 1e12 && ca <= Date.now() + 864e5 ? Math.round(ca) : 0,
    profile: profile, goal: goal, cups: cups,
    last: l.g === 'w' ? l.id : D.last, lastO: lo.g === 'o' ? lo.id : D.lastO,
    reminders: reminders, social: social, ui: ui,
  };
}
// O documento da nuvem → { u, prefs } limpo, ou null se não for um backup válido
export function prefsParse(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || typeof raw.j !== 'string' || raw.j.length < 2 || raw.j.length > PREFS_MAX) return null;
  const u = +raw.u;
  if (!isFinite(u) || u <= 0) return null;
  let o = null;
  try { o = JSON.parse(raw.j); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return { u: u, prefs: cleanPrefs(o) };
}
// Aplica ajustes limpos (de cleanPrefs) ao estado S.
//  • mode 'restore' (aparelho novo, acabou de entrar na conta): tudo, inclusive se os amigos estavam ligados.
//  • mode 'sync' (o app abriu e a nuvem tem ajustes mais novos, de outro aparelho): igual, menos ligar ou desligar os amigos (isso só
//    acontece pelo fluxo dos amigos, que mexe no perfil da nuvem).
// Lembretes: só o intervalo e a escolha "inteligentes"; ligar ou não é do aparelho (precisa da permissão de notificação dele).
export function applyPrefs(S, p, mode) {
  Object.keys(p.profile).forEach((k) => { S.profile[k] = p.profile[k]; });
  Object.keys(p.goal).forEach((k) => { S.goal[k] = p.goal[k]; });
  S.cups = p.cups.slice();
  S.last = p.last; S.lastO = p.lastO;
  S.reminders.interval = p.reminders.interval; S.reminders.smart = p.reminders.smart;
  const keepOn = mode === 'sync';
  Object.keys(p.social).forEach((k) => { if (!(keepOn && k === 'on')) S.social[k] = p.social[k]; });
  Object.keys(p.ui).forEach((k) => { S.ui[k] = p.ui[k]; });
  if (p.createdAt && (!S.createdAt || p.createdAt < S.createdAt)) S.createdAt = p.createdAt;
  return S;
}

/* ---------- entrar num aparelho novo ---------- */
// data = o que o firebase.js baixou da conta: { prefs: documento bruto | null, user: users/{uid} | null, profile: profiles/{uid} | null, days }.
// O que fazer: os ajustes completos (quando há backup) pulam o onboarding; sem backup (conta criada pelo administrador, ou que ainda
// não chegou a gravar) o app aproveita o que a nuvem já sabia (horários, unidade, apelido) e deixa o onboarding pré-preenchido,
// com os registros já no lugar. Os amigos voltam se o perfil ainda existe na nuvem.
export function restorePlan(data) {
  const d = data || {}, pr = prefsParse(d.prefs), us = d.user && typeof d.user === 'object' ? d.user : {}, pf = d.profile && typeof d.profile === 'object' ? d.profile : null;
  const ps = pr ? pr.prefs.social : null, uso = us.social && typeof us.social === 'object' ? us.social : {};
  const base = {}, nick = pf ? cleanNick(pf.nm) : '', mc = pf && typeof pf.mc === 'string' && insigniaById(pf.mc) ? pf.mc : '';
  if (HHMM.test(us.wake)) base.wake = us.wake;
  if (HHMM.test(us.sleep)) base.sleep = us.sleep;
  if (base.wake && base.wake === base.sleep) { delete base.wake; delete base.sleep; }
  if (us.unit === 'oz' || us.unit === 'ml') base.unit = us.unit;
  if (nick) base.name = nick;
  let social = null;
  if (pf) {
    social = {
      on: true,
      nick: (ps && ps.nick) || nick || '',
      share: ps ? ps.share : pf.sh !== false,
      goal: ps ? ps.goal : (+pf.gl > 0 ? true : null),
      push: typeof uso.push === 'boolean' ? uso.push : ps ? ps.push : true,
      hit: typeof uso.hit === 'boolean' ? uso.hit : ps ? ps.hit : false,
      week: typeof uso.week === 'boolean' ? uso.week : ps ? ps.week : true,
    };
  }
  const keys = d.days && typeof d.days === 'object' ? Object.keys(d.days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort() : [];
  return { prefs: pr ? pr.prefs : null, prefsU: pr ? pr.u : 0, base: base, mascot: mc, social: social, complete: !!pr, days: keys.length, first: keys[0] || '',
    found: !!(pr || keys.length || pf || d.user) };
}
// Aplica o plano ao estado S de um aparelho que ainda não fez o onboarding. Devolve se o onboarding foi dispensado.
export function applyPlan(S, plan) {
  if (plan.prefs) {
    applyPrefs(S, plan.prefs, 'restore');
    S.onboarded = true;
  } else {
    Object.keys(plan.base).forEach((k) => { S.profile[k] = plan.base[k]; });
    // O mascote que os amigos veem: se for o que o app escolheria sozinho (a insígnia mais alta), continua automático; senão, fica o escolhido.
    // (O app concede as insígnias dos registros ANTES de chamar applyPlan: é delas que sai o mascote automático.)
    if (plan.mascot) { S.profile.mascot = ''; if (mascotOf(S).id !== plan.mascot) S.profile.mascot = plan.mascot; }
  }
  // o perfil na nuvem manda: se ele existe, os amigos estão ligados; se não, não (mesmo que o backup dissesse que sim)
  if (plan.social) Object.keys(plan.social).forEach((k) => { S.social[k] = plan.social[k]; });
  else { S.social.on = false; S.social.code = ''; }
  // "desde quando" usa o dia mais antigo que veio da conta (as médias e a Jornada contam a partir daí)
  if (plan.first) { const t = keyToDate(plan.first).getTime(); if (isFinite(t) && (!S.createdAt || t < S.createdAt)) S.createdAt = t; }
  return !!plan.prefs;
}
