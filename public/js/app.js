// Maré — aplicativo (Parte 3C). Liga estado, telas, lembretes, clima, celebrações e a nuvem opcional.
// Toda alteração segue: muda S → save() → afterChange() (lembrete, conquistas, nuvem) → atualiza só o necessário.
import { ACTIVITY, drink, isWater, mixOn, retired, uid, dayKey, keyToDate, minOf, fmtHM, expectedBy, nextReminderAt, climateBonus, goalToday,
  missionFor, missionProgress, newAchievements, newInsignias, insigniaDates, insigniaById, streak, buildICS, defaults, migrate } from './core.js';
import { KEY, S, SOC, setS, applyMix, hooks, load, save, clamp, num, plural, byT, shiftYm, today, goalNow, totalNow, otherNow, othersOn, ensureDay,
  syncTodayGoal, allMl, U, vol, toMl, fromMl, big, esc } from './store.js';
import { $, $$, tween, animBars, onBack, hPush, hBack, toast, hideToast, runToastAction, showBanner, sheetBody, sheetIsOpen, openSheet,
  closeSheet, onSheetClose, confirmSheet, runConfirm, splash, confetti, pop, popBusy, levelY, dropTo, floatEmoji } from './ui.js';
import { isNative, reducedMotion, onMedia, haptic, registerSW, applyUpdate, notifStatus, requestNotifPermission, showNotification,
  scheduleNative, clearBadge, drainInbox, initInstall, canInstall, promptInstall, getCoords, fetchMaxTemp, saveFile, share,
  persistStorage, copyText } from './platform.js';
import { TODAY_PARTS, todayView, historyView, journeyView, settingsView, onboardingView, OB_STEPS, tabbarHTML, othersSheet, otherNote,
  entrySheet, daySheet, installSheet, notifHelpSheet, dropOpts, dropOpts2, drop2Label, paceInfo, goalSumHTML, remNoteText, shareText,
  insigniaSheet, unlockSheet, newsSheet, fmtW } from './views.js';
import { friendsView, friendSheet, profileSheet, codeSheet, aboutSheet, friendsSig, inviteInfo, alertsOn, alertsNote, hitOn, weekOn, hitNote, weekNote } from './friends-view.js';
import { CACHE_KEY, cleanState, cleanNick, codeFromURL, normCode, validCode, inviteLink, inviteText, fmtCode, profilePayload, liveOf, myLive, turma,
  waveFor, seenWaves, arrivals, joinedText, rankId, errText } from './social.js';

export const APP_VERSION = '1.2.0'; // aumente a cada deploy, junto com VERSION no sw.js

const view = $('#view'), tabbar = $('#tabbar'), TABS = ['today', 'history', 'journey', 'friends', 'settings'];
const HHMM = /^\d{2}:\d{2}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
let tab = 'today', ym = '', ob = null, dr = null, dropSt = null, dropSt2 = null, curDay = '', remT = 0, climBusy = false, fileIn = null;
let cloud = null, syncState = 'off', cloudOn = false, cloudP = null, cloudFailed = false; // cloudFailed: tentou subir e falhou (sem internet ao abrir o app, por exemplo)
// amigos: soc = camada de nuvem (social-cloud.js, criada sob demanda); frSig = o que a aba mostra agora; frInv = convite aberto por link (tela de entrada);
// frCode = painel "Inserir código"; waving = acenos em andamento; tabHTML = a barra de abas desenhada agora (só mexe quando muda)
let soc = null, socP = null, socWired = null, frSig = '', frInv = null, frCode = null, tabHTML = '';
const waving = {};

/* ---------- utilidades ---------- */
const info = () => ({ version: 'v' + APP_VERSION, sync: syncState, push: !!(cloud && cloud.push) });
function sync(keys) { try { if (cloud) cloud.syncDays(keys); } catch (e) { /* a nuvem é opcional */ } }
function syncMeta() { try { if (cloud) cloud.syncMeta(); } catch (e) { /* idem */ } }
const touch = (k) => { if (S.days[k]) S.days[k].u = Date.now(); }; // u = última alteração do dia (usado na sincronização)
const snap = () => ({ total: totalNow(), goal: goalNow() });
const typing = () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && view.contains(a); };
const findEntry = (k, id) => { const d = S.days[k]; return (d && d.entries ? d.entries.filter((e) => e.id === id)[0] : null) || null; };
// Hora do último gole de ÁGUA de hoje: o lembrete parte dele. Café, chá etc. não adiam o próximo lembrete de água,
// a não ser que a pessoa tenha ligado "Somar outros líquidos na meta" (aí eles contam como qualquer gole).
const lastToday = () => { const d = S.days[today()], es = d && d.entries ? d.entries.filter((e) => mixOn() || isWater(e)) : []; return es.reduce((m, e) => Math.max(m, e.t), 0); };
// Refrigerante e álcool saíram do app: registros antigos deles (backup, nuvem) são descartados
const cleanEntries = (list) => list.filter((e) => e && isFinite(e.t) && e.ml > 0 && e.ml <= 5000 && !retired(e.d))
  .map((e) => ({ id: String(e.id || uid()).slice(0, 24), t: +e.t, ml: Math.round(+e.ml), d: drink(e.d).id })).sort(byT);
function refreshPart(id) { const el = $('#' + id); if (el && TODAY_PARTS[id]) el.innerHTML = TODAY_PARTS[id](); }
function press(el) { $$('.pill', el.parentNode).forEach((p) => { p.setAttribute('aria-pressed', p === el ? 'true' : 'false'); }); }
function applyTheme() {
  let t = S.profile.theme;
  if (t === 'auto') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  const m = $('meta[name=theme-color]');
  if (m) m.setAttribute('content', t === 'dark' ? '#06121F' : '#F3F8FC');
}

/* ---------- telas ---------- */
function bars(root, anim) {
  if (anim) { animBars(root); return; }
  $$('[data-w]', root).forEach((el) => { el.style[el.getAttribute('data-p') || 'width'] = el.getAttribute('data-w') + '%'; });
}
function paintDrop() {
  const el = $('#drop');
  if (!el) return;
  if (dropSt) el._st = dropSt; // continua de onde parou: trocar de aba não "reenche" a gota
  const goal = goalNow(), total = totalNow();
  dropTo(el, total, goal, Object.assign(dropOpts(total, goal), { ms: dropSt ? 1100 : 1500 }));
  dropSt = el._st;
  paintDrop2(goal);
}
// Segunda gota (outros líquidos): o nível é a proporção em relação à meta de água, só para dar noção de tamanho
function paintDrop2(goal) {
  const el = $('#drop2');
  if (!el) return;
  if (dropSt2) el._st = dropSt2;
  const ml = otherNow();
  dropTo(el, ml, goal, Object.assign(dropOpts2(), { ms: dropSt2 ? 1100 : 1500 }));
  dropSt2 = el._st;
  const b = $('#drop2btn');
  if (b) b.setAttribute('aria-label', drop2Label(ml));
}
function render(still) {
  if (!S.onboarded) { if (ob) renderOb(); else startOnboarding(); return; }
  document.body.classList.remove('no-tabs');
  tabbar.hidden = false;
  if (tab === 'friends') markWavesSeen(); // abrir a aba é "ver" os acenos: a bolinha some
  tabHTML = tabbarHTML(tab);
  tabbar.innerHTML = tabHTML;
  view.innerHTML = tab === 'history' ? historyView(ym) : tab === 'journey' ? journeyView() : tab === 'friends' ? friendsView({ invite: frInvCtx() })
    : tab === 'settings' ? settingsView(info()) : todayView();
  bars(view, !still);
  if (tab === 'today') paintDrop();
  if (tab === 'friends') { frSig = friendsSig(); resolveInvite(); }
}
function refreshToday(fx) {
  if (tab !== 'today' || !$('#drop')) return;
  Object.keys(TODAY_PARTS).forEach(refreshPart);
  animBars($('#tMission'));
  // fx: true = caiu água na gota principal; 'o' = caiu outro líquido na segunda gota
  if (fx === 'o') { if ($('#drop2')) splash($('#drop2'), levelY(otherNow() / goalNow())); }
  else if (fx) splash($('#drop'), levelY(totalNow() / goalNow()));
  setTimeout(paintDrop, fx && !reducedMotion() ? 380 : 0); // a água sobe quando a gota toca a superfície
}
function refreshUI() {
  if (!S.onboarded || ob) return;
  if (tab === 'today') refreshToday(false);
  else if (!(tab === 'settings' && typing())) render(true);
  refreshDaySheet();
}
function openDay(k) { openSheet(daySheet(k)); sheetBody.setAttribute('data-day', k); animBars(sheetBody); }
function refreshDaySheet(keys) {
  const k = sheetBody.getAttribute('data-day');
  if (sheetIsOpen() && !dr && k && $('.day-sum', sheetBody) && (!keys || keys.indexOf(k) >= 0)) openDay(k);
}
function go(t, fromPop) {
  if (!S.onboarded || TABS.indexOf(t) < 0) return;
  if (t === tab) { window.scrollTo(0, 0); return; }
  const was = tab;
  tab = t;
  if (t !== 'history') ym = '';
  // Hoje é a base do histórico; as outras abas ficam a um "voltar" de distância (botão do Android)
  if (!fromPop) { if (was === 'today') hPush(); else if (t === 'today') hBack(); }
  render();
  window.scrollTo(0, 0);
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');
  try { view.focus({ preventScroll: true }); } catch (e) { /* navegador antigo */ }
}
onBack(() => { if (ob) obBack(true); else if (tab !== 'today') go('today', true); });

/* ---------- onboarding ---------- */
function startOnboarding() {
  const p = S.profile;
  ob = { step: 0, name: p.name, weight: p.weight, activity: p.activity, wake: p.wake, sleep: p.sleep };
  renderOb();
}
function renderOb() {
  document.body.classList.add('no-tabs');
  tabbar.hidden = true;
  view.innerHTML = onboardingView(ob);
  window.scrollTo(0, 0);
  if (ob.step === 0) dropTo($('#obDrop'), 62, 100, { keepText: true, ms: 1800 });
  const g = $('#obGoal'), to = g ? +g.getAttribute('data-total') : 0;
  if (g && !reducedMotion()) tween(900, (k) => { g.textContent = big(Math.round((to * k) / 50) * 50); });
}
function readOb() {
  const val = (id) => { const el = $('#' + id); return el ? el.value : null; };
  const n = val('obName'), w = num(val('obWeight')), a = val('obWake'), b = val('obSleep');
  if (n !== null) ob.name = n.trim().slice(0, 30);
  if (isFinite(w)) ob.weight = Math.round(w * 10) / 10;
  if (a) ob.wake = a.slice(0, 5);
  if (b) ob.sleep = b.slice(0, 5);
}
function obNext() {
  readOb();
  if (ob.step === 1 && !(ob.weight >= 30 && ob.weight <= 250)) { toast('Informe um peso entre 30 e 250 kg.'); return; }
  if (ob.step === 3 && (!HHMM.test(ob.wake) || !HHMM.test(ob.sleep) || ob.wake === ob.sleep)) { toast('Confira os horários de acordar e dormir.'); return; }
  if (ob.step >= OB_STEPS - 1) { finishOb(); return; }
  ob.step++;
  hPush(); haptic('light'); renderOb();
}
function obBack(fromPop) {
  if (!ob || !ob.step) return;
  readOb();
  ob.step--;
  if (!fromPop) hBack();
  renderOb();
}
function finishOb() {
  readOb();
  const p = S.profile, n = ob.step;
  ['name', 'weight', 'activity', 'wake', 'sleep'].forEach((k) => { p[k] = ob[k]; });
  S.onboarded = true;
  ob = null;
  if (n) hBack(n); // remove as entradas do onboarding: "voltar" na tela Hoje sai do app
  S.ui.tip_news12 = 1; // quem está começando agora já nasce com tudo: a dica de novidades é só para quem já usava
  grantInsignias(false); // a concha (0 L) vem de presente, sem festa
  syncTodayGoal(); save();
  tab = 'today';
  render(); planReminder(); persistStorage();
  startCloud();
  toast('Tudo pronto! Sua meta de hoje é ' + vol(goalNow()) + ' 💧');
  if (S.ui.invite) setTimeout(() => { if (S.onboarded && !ob) go('friends'); }, 1600); // chegou por um convite: leva a pessoa direto aos amigos
}

/* ---------- registros ---------- */
function quickAdd(ml, did) {
  const k = today(), d = drink(did || S.last), before = snap(), e = { id: uid(), t: Date.now(), ml: Math.round(ml), d: d.id };
  ensureDay(k).entries.push(e);
  touch(k); save(); haptic('light');
  afterChange([k], before, d.g === 'o' ? 'o' : true);
  // Outros líquidos: "à parte" por padrão. Com "Somar na meta" ligado, avisa quanto entrou (o limite é metade da meta).
  const gain = totalNow() - before.total;
  const note = !mixOn() ? ' · à parte' : gain >= e.ml ? ' · soma na meta'
    : gain > 0 ? ' · soma só ' + vol(gain) + ' (limite de metade da meta)' : ' · já no limite de metade da meta';
  toast('+' + vol(e.ml) + ' de ' + d.l.toLowerCase() + (d.g === 'o' ? ' ' + d.e + note : ' 💧'),
    { label: 'Desfazer', fn: () => { if (removeEntry(k, e.id)) toast('Registro desfeito'); } });
}
function removeEntry(k, id) {
  const d = S.days[k], before = snap();
  let out = null;
  if (!d) return null;
  d.entries = d.entries.filter((x) => { if (x.id !== id) return true; out = x; return false; });
  if (!out) return null;
  touch(k); save();
  afterChange([k], before, false);
  return out;
}
function restoreEntry(k, e) {
  const d = ensureDay(k), before = snap();
  if (d.entries.some((x) => x.id === e.id)) return;
  d.entries.push(e); d.entries.sort(byT);
  touch(k); save();
  afterChange([k], before, false);
  toast('Registro restaurado ✓');
}
function openEntry(k, e, fromDay, did) {
  dr = e ? { mode: 'edit', day: k, id: e.id, d: e.d, ml: e.ml, time: fmtHM(minOf(e.t)) }
    : { mode: 'add', day: k, id: '', d: did || S.last, ml: S.cups[1] || 250, time: k === today() ? fmtHM(minOf(Date.now())) : '12:00' };
  dr.from = fromDay ? 'day' : '';
  openSheet(entrySheet(dr));
}
function saveEntry() {
  if (!dr) return;
  const err = $('#eErr'), ml = toMl(num($('#eMl').value)), tm = String($('#eTime').value || '');
  const fail = (m) => { err.textContent = m; haptic('medium'); };
  if (!(ml >= 10 && ml <= 3000)) { fail('Informe um volume entre ' + vol(10) + ' e ' + vol(3000) + '.'); return; }
  if (!/^\d{1,2}:\d{2}/.test(tm)) { fail('Escolha o horário.'); return; }
  const k = dr.day, b = keyToDate(k), hh = tm.split(':');
  const t = new Date(b.getFullYear(), b.getMonth(), b.getDate(), +hh[0], +hh[1]).getTime();
  if (t > Date.now() + 60000) { fail('Esse horário ainda não chegou.'); return; }
  const before = snap(), edit = dr.mode === 'edit', from = dr.from, day = ensureDay(k), e = edit ? findEntry(k, dr.id) : null, dd = drink(dr.d);
  if (e) { e.ml = ml; e.d = dd.id; e.t = t; } else if (!edit) {
    day.entries.push({ id: uid(), t: t, ml: ml, d: dd.id });
    if (dd.g === 'o') S.lastO = dd.id; else S.last = dd.id; // cada gota lembra a última bebida usada
  }
  day.entries.sort(byT);
  touch(k); save();
  dr = null;
  afterChange([k], before, !edit && k === today() && from !== 'day' ? (dd.g === 'o' ? 'o' : true) : false);
  if (from === 'day') openDay(k); else closeSheet();
  toast(edit ? 'Registro atualizado ✓' : '+' + vol(ml) + ' às ' + tm.slice(0, 5) + ' ✓');
}
function deleteEntry() {
  if (!dr) return;
  const k = dr.day, from = dr.from, id = dr.id;
  dr = null;
  const e = removeEntry(k, id);
  if (from === 'day') openDay(k); else closeSheet();
  if (e) toast('Registro excluído', { label: 'Desfazer', fn: () => restoreEntry(k, e) });
}

/* ---------- depois de cada alteração ---------- */
function afterChange(keys, before, fx) {
  if (keys.indexOf(today()) >= 0) planReminder();
  celebrate(before, keys);
  sync(keys);
  socTouch(); crewCheck(SOC.st);
  if (tab === 'today') refreshToday(fx); else if (tab !== 'settings') render(true);
  refreshDaySheet(keys);
}
function celebrate(b, keys) {
  const k = today(), goal = goalNow(), total = totalNow();
  if (keys.indexOf(k) >= 0 && b.total < b.goal && total >= goal) {
    confetti();
    pop('🎯', 'Meta do dia', 'Você bateu a meta!', vol(total) + ' hoje · ' + plural(streak(S.days, k), 'dia seguido', 'dias seguidos'));
  }
  if (!S.missions[k] && missionProgress(k, S.days[k], goal) >= 1) {
    const m = missionFor(k);
    S.missions[k] = Date.now();
    pop(m.e, 'Missão cumprida', m.t, 'Amanhã tem missão nova');
  }
  newAchievements(S).forEach((a) => { S.achievements[a.id] = Date.now(); pop(a.e, 'Nova medalha', a.t, a.d); });
  if (grantInsignias(true).length) planUnlock(1600);
  save();
}

/* ---------- insígnias ---------- */
// Guarda em S.insignias as insígnias que a água acumulada já alcançou (como as medalhas, depois de conquistadas nunca saem).
// live = true: o gole que cruzou o marco acabou de acontecer, então vira comemoração (fila S.ui.unseenIns). Senão a concessão é silenciosa
// e datada pelo histórico de registros (primeira abertura após atualizar, backup, outro aparelho). A primeira (0 L) nunca é comemorada.
function grantInsignias(live) {
  const list = newInsignias(S, allMl());
  if (!list.length) return list;
  const dates = live ? null : insigniaDates(S);
  if (!Array.isArray(S.ui.unseenIns)) S.ui.unseenIns = [];
  list.forEach((x) => {
    S.insignias[x.id] = live ? Date.now() : (dates[x.id] || Date.now());
    if (live && x.at > 0 && S.ui.unseenIns.indexOf(x.id) < 0) S.ui.unseenIns.push(x.id);
  });
  return list;
}
// Quem já usava o Maré ganha as insígnias que merecia de uma vez, e só a mais alta é comemorada (uma única vez)
function welcomeInsignias() {
  const first = !Object.keys(S.insignias).length, list = grantInsignias(false), top = list[list.length - 1];
  if (first && top && top.at > 0) S.ui.unseenIns.push(top.id);
  if (list.length) save();
  if (S.ui.unseenIns && S.ui.unseenIns.length) planUnlock(1800);
}
let unlockT = 0, unlockId = '';
function planUnlock(ms) { clearTimeout(unlockT); unlockT = setTimeout(showUnlock, ms || 1200); }
// O painel "Nova insígnia!" espera a tela ficar tranquila: sem outro painel aberto (o registro manual fecha o dele logo depois de salvar),
// sem digitação, sem cartão de conquista aparecendo e com o app visível. Se a pessoa fechar o app antes, a fila continua para a próxima abertura.
function showUnlock() {
  const q = S.ui.unseenIns;
  if (!S.onboarded || ob || !Array.isArray(q) || !q.length) return;
  if (sheetIsOpen() || typing() || popBusy() || document.visibilityState !== 'visible') { planUnlock(1500); return; }
  const id = q[0];
  if (!insigniaById(id) || !S.insignias[id]) { q.shift(); save(); planUnlock(200); return; }
  unlockId = id;
  confetti(); haptic('success');
  openSheet(unlockSheet(id));
}
onSheetClose(() => {
  if (!unlockId) return;
  const q = S.ui.unseenIns, i = Array.isArray(q) ? q.indexOf(unlockId) : -1;
  unlockId = '';
  if (i >= 0) { q.splice(i, 1); save(); }
  if (Array.isArray(q) && q.length) planUnlock(900);
});
function setMascot(id) {
  if (!insigniaById(id) || !S.insignias[id]) return;
  S.profile.mascot = id; save(); haptic('light'); socTouch();
  openSheet(insigniaSheet(id));
  if (tab === 'journey') render(true);
  toast('Mascote trocado ✓');
}

/* ---------- lembretes ---------- */
function reminderText() {
  const goal = goalNow(), total = totalNow(), pc = paceInfo(total, goal);
  const T = ['Hora de um gole 💧', 'Pausa para a água 🌊', 'Seu corpo agradece 💙', 'Bora hidratar? 🥤'];
  return { title: T[new Date().getHours() % T.length], body: pc.c === 'behind' ? pc.t + '. Um copo agora te coloca de volta no ritmo.'
    : 'Faltam ' + vol(Math.max(0, goal - total)) + ' para a meta de hoje.' };
}
// O próximo lembrete parte do último gole de hoje (abrir o app não adia nada). Quem dispara: push do servidor
// (Firebase), notificação local (app nativo) ou o timer abaixo (app aberto ou recém-minimizado).
function planReminder(base) {
  const r = S.reminders, now = Date.now();
  if (r.enabled) {
    const p = S.profile, goal = goalNow();
    const o = { interval: r.interval, smart: r.smart, wake: p.wake, sleep: p.sleep, total: totalNow(), goal: goal,
      expected: expectedBy(now, goal, p.wake, p.sleep) };
    let at = nextReminderAt(base || lastToday() || now, o);
    if (at < now + 60000) at = nextReminderAt(now, o);
    r.nextAt = at;
  } else r.nextAt = 0;
  save(); armTimer();
  const m = reminderText();
  scheduleNative(r.nextAt, m.title, m.body);
  syncMeta();
  refreshPart('tMeta');
}
function armTimer() {
  clearTimeout(remT);
  const r = S.reminders, ms = r.nextAt - Date.now();
  if (r.enabled && r.nextAt && ms < 2147483647) remT = setTimeout(fireReminder, Math.max(1000, ms));
}
function fireReminder() {
  if (!S.reminders.enabled) return;
  if (totalNow() < goalNow()) {
    const m = reminderText();
    if (document.visibilityState === 'visible') {
      const d = $('#drop');
      haptic('medium');
      if (d) { d.classList.remove('nudge'); void d.offsetWidth; d.classList.add('nudge'); }
      toast(m.title + ' ' + m.body, { label: '+' + vol(250), fn: () => quickAdd(250) });
    } else if (!(cloud && cloud.push) && !isNative() && notifStatus() === 'granted') showNotification(m.title, m.body);
  }
  planReminder(Date.now());
}
function enableReminders() {
  const st = notifStatus();
  if (st === 'install' || st === 'denied') { openSheet(notifHelpSheet(st)); return; }
  // o pedido de permissão precisa sair direto do toque (exigência do Safari): nada assíncrono antes dele
  (st === 'unsupported' ? Promise.resolve('unsupported') : requestNotifPermission()).then((perm) => {
    if (perm !== 'granted' && perm !== 'unsupported') { toast('Sem permissão, os lembretes ficam desligados.'); refreshUI(); return; }
    S.reminders.enabled = true;
    planReminder();
    if (cloud && cloud.enablePush) cloud.enablePush().then(refreshUI, () => {});
    toast(perm === 'unsupported' ? 'Lembretes ativos enquanto o Maré estiver aberto. Reforce com o calendário em Ajustes.' : 'Lembretes ativados 🔔');
    refreshUI();
  });
}
function disableReminders() { S.reminders.enabled = false; planReminder(); toast('Lembretes desligados'); refreshUI(); }

/* ---------- avisos dos amigos (1.1.1; avisos opcionais na 1.2.0) ---------- */
// As funções do servidor mandam um push quando alguém pede amizade, aceita, acena ou entra na turma. Usam o mesmo registro de aparelho dos lembretes
// (cloud.enablePush), então basta ter os amigos ligados, não ter desligado a chave (S.social.push, começa ligada) e já ter a permissão de
// notificação. Quem manda é o servidor; aqui só se registra o aparelho e se grava a escolha (cloud.syncMeta leva S.social.push, hit e week junto).
// Dois avisos são opcionais: hit (um amigo bateu a meta; começa desligado) e week (o resumo da semana, domingo às 19h; começa ligado).
const wantsAlerts = () => S.social.on === true && S.social.push !== false;
// quiet = não redesenhar a tela quando o registro terminar (o redesenho tira o foco de quem usa o teclado)
function ensurePush(quiet) {
  if ((S.reminders.enabled || wantsAlerts()) && notifStatus() === 'granted' && cloud && cloud.enablePush) cloud.enablePush().then(quiet ? () => {} : refreshUI, () => {});
}
function setAlerts(on) {
  S.social.push = on; save(); haptic('light');
  syncMeta();
  if (on) ensurePush(true);
}
// Mostra o resultado: em Ajustes as chaves e as notas mudam no lugar (como "Mostrar meu progresso": o foco do teclado fica onde estava);
// na aba Amigos a tela se refaz (o cartão que convidava a ligar some)
function paintAlerts() {
  const on = alertsOn(), note = $('#frAlertNote');
  $$('[data-action="fr-alerts"][role="switch"]').forEach((x) => { x.setAttribute('aria-checked', on ? 'true' : 'false'); });
  [['fr-hit', 'frHitNote', hitOn(), hitNote()], ['fr-week', 'frWeekNote', weekOn(), weekNote()]].forEach((o) => {
    $$('[data-action="' + o[0] + '"][role="switch"]').forEach((x) => { x.setAttribute('aria-checked', o[2] ? 'true' : 'false'); });
    const n = $('#' + o[1]);
    if (n) n.textContent = o[3];
  });
  if (note) note.textContent = alertsNote();
  if (tab === 'friends') render(true);
}
function toggleAlerts() {
  const st = notifStatus();
  if (st === 'install' || st === 'denied') { openSheet(notifHelpSheet(st)); return; }
  if (st === 'unsupported' || st === 'native') { toast('Este navegador só mostra os avisos com o Maré aberto.'); return; }
  if (st === 'granted' && S.social.push !== false) { setAlerts(false); toast('Avisos dos amigos desligados'); paintAlerts(); return; }
  // ligar: o pedido de permissão precisa sair direto do toque (exigência do Safari): nada assíncrono antes dele
  requestNotifPermission().then((perm) => {
    if (perm !== 'granted') { toast('Sem permissão, os avisos dos amigos ficam desligados.'); paintAlerts(); return; }
    setAlerts(true);
    toast('Avisos dos amigos ligados 🔔');
    paintAlerts();
  });
}
// Os avisos opcionais (hit, week) só valem com os avisos dos amigos ligados: ligar um deles sem isso pede a permissão e liga os avisos junto
function toggleOpt(key) {
  const label = key === 'hit' ? 'Aviso de meta batida' : 'Resumo da semana';
  if (key === 'hit' ? hitOn() : weekOn()) { S.social[key] = false; save(); haptic('light'); syncMeta(); toast(label + ' desligado'); paintAlerts(); return; }
  const st = notifStatus();
  if (st === 'install' || st === 'denied') { openSheet(notifHelpSheet(st)); return; }
  if (st === 'unsupported' || st === 'native') { toast('Este navegador só mostra os avisos com o Maré aberto.'); return; }
  const turnOn = () => {
    S.social[key] = true; S.social.push = true; save(); haptic('light');
    syncMeta(); ensurePush(true);
    toast(label + ' ligado 🔔');
    paintAlerts();
  };
  if (st === 'granted') { turnOn(); return; }
  requestNotifPermission().then((perm) => {
    if (perm !== 'granted') { toast('Sem permissão, os avisos ficam desligados.'); paintAlerts(); return; }
    turnOn();
  });
}
// Toque numa notificação com o Maré já aberto: o Service Worker manda abrir a aba (sem recarregar nada)
function onSWMessage(m) {
  if (m.type === 'inbox') pullInbox();
  else if (m.type === 'go' && S.onboarded && !ob) { if (sheetIsOpen()) closeSheet(); go(String(m.tab)); }
}
function testNotif() {
  const st = notifStatus();
  if (st === 'default') { requestNotifPermission().then((p) => { if (p === 'granted') testNotif(); }); return; }
  if (st !== 'granted' && st !== 'native') { openSheet(notifHelpSheet(st)); return; }
  showNotification('Teste do Maré 💧', 'É assim que seus lembretes vão chegar.');
  toast('Notificação enviada. Ela aparece em instantes.');
}

/* ---------- meta e clima ---------- */
// Ligar/desligar a segunda gota ou o "somar na meta" muda o total do dia (e o dos anteriores): refaz ritmo, lembretes e telas.
// Sem festa nem medalhas aqui: as medalhas novas só saem no próximo registro, e as já conquistadas nunca são retiradas.
function rulesChanged() {
  applyMix();
  planReminder(); // planReminder também salva e sincroniza
  socTouch(); // a % da meta que os amigos veem muda junto
  render(true);
}
function goalChanged() {
  syncTodayGoal(); planReminder(); // planReminder também salva e sincroniza
  socTouch();
  const gs = $('#goalSum');
  if (gs) gs.innerHTML = goalSumHTML();
}
function setClimate(on) {
  const g = S.goal;
  g.climate = on;
  if (!on) { g.bonus = 0; g.temp = null; g.day = ''; }
  goalChanged(); refreshUI();
  if (on) refreshClimate(true);
}
function refreshClimate(force) {
  const g = S.goal, k = today(), geo = S.ui.geo, fin = () => { climBusy = false; refreshUI(); };
  if (climBusy || !g.climate || g.mode !== 'auto' || (g.day === k && !force)) return;
  climBusy = true;
  // coordenadas arredondadas (~11 km) valem 7 dias: evita pedir o GPS todo dia
  (geo && Date.now() - geo.at < 7 * 864e5 ? Promise.resolve(geo)
    : getCoords().then((c) => { S.ui.geo = { lat: c.lat, lon: c.lon, at: Date.now() }; save(); return c; }))
    .then((c) => fetchMaxTemp(c.lat, c.lon))
    .then((t) => {
      const was = goalNow();
      g.temp = t; g.bonus = climateBonus(t); g.day = k;
      goalChanged();
      if (goalNow() > was) toast('☀️ Máxima de ' + t + '°C hoje: meta ajustada para ' + vol(goalNow()));
    }, (e) => {
      if (e && e.code === 1) { g.climate = false; goalChanged(); toast('Sem acesso à localização, o ajuste pelo clima foi desligado.'); }
      else if (force) toast('Não consegui consultar o clima agora. Tento de novo mais tarde.');
    })
    .then(fin, fin);
}

/* ---------- caixa de entrada da notificação ---------- */
// Registros feitos pelo botão "+250 ml" da notificação: o sw.js grava no IndexedDB e avisa com { type: 'inbox' }
function pullInbox() {
  drainInbox().then((items) => {
    const before = snap(), keys = [];
    let n = 0;
    items.forEach((it) => {
      if (!it || !isFinite(it.t) || !(it.ml > 0)) return;
      const k = dayKey(new Date(+it.t)), d = ensureDay(k), id = String(it.id || uid());
      if (d.entries.some((e) => e.id === id)) return;
      d.entries.push({ id: id, t: +it.t, ml: Math.min(3000, Math.round(+it.ml)), d: drink(it.d).id });
      d.entries.sort(byT); touch(k); n++;
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    if (!n) return;
    save();
    if (!S.onboarded) return;
    afterChange(keys, before, false);
    toast('💧 ' + plural(n, 'registro feito', 'registros feitos') + ' pela notificação');
  });
}

/* ---------- dados: calendário, backup, apagar, compartilhar ---------- */
function exportICS() {
  saveFile('mare-lembretes.ics', buildICS(S.profile, S.reminders.interval), 'text/calendar').then((r) => {
    if (r === 'download') toast('Arquivo baixado: abra-o para adicionar os alarmes ao calendário.');
    else if (r === 'shared') toast('Escolha seu app de calendário para importar os alarmes.');
  });
}
function exportBackup() {
  const json = JSON.stringify({ app: 'mare', v: 1, exportedAt: new Date().toISOString(), data: Object.assign({}, S, { social: defaults().social }) });
  saveFile('mare-backup-' + today() + '.json', json, 'application/json').then((r) => {
    if (r !== 'cancel') toast('Backup pronto ✓ Guarde o arquivo num lugar seguro.');
  });
}
function importBackup() {
  if (!fileIn) {
    fileIn = document.createElement('input');
    fileIn.type = 'file';
    fileIn.accept = '.json,application/json';
    fileIn.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(fileIn);
    fileIn.addEventListener('change', () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) readBackup(f); });
  }
  fileIn.click();
}
function readBackup(f) {
  if (f.size > 5e6) { toast('Arquivo grande demais para um backup do Maré.'); return; }
  const rd = new FileReader(); // File.text() não existe no iOS 12–13
  rd.onerror = () => { toast('Não consegui ler o arquivo.'); };
  rd.onload = () => {
    let s = null;
    try { s = sanitize(JSON.parse(String(rd.result))); } catch (e) { s = null; }
    if (!s) { toast('Esse arquivo não parece um backup do Maré.'); return; }
    confirmSheet('Restaurar backup?', 'Os dados deste aparelho serão substituídos por ' + plural(Object.keys(s.days).length, 'dia', 'dias') +
      ' de registros do backup.', 'Restaurar', false, () => applyBackup(s));
  };
  rd.readAsText(f);
}
// Valida um backup (arquivo exportado ou estado puro). Retorna null se não for do Maré.
function sanitize(raw) {
  const src = raw && raw.app === 'mare' ? raw.data : raw;
  if (!src || typeof src !== 'object' || !src.days || typeof src.days !== 'object') return null;
  const s = migrate(src), p = s.profile, days = {};
  Object.keys(s.days).forEach((k) => {
    const d = s.days[k];
    if (DAY.test(k) && d && Array.isArray(d.entries)) days[k] = { goal: clamp(Math.round(+d.goal) || 2000, 500, 6000), u: +d.u || 0, entries: cleanEntries(d.entries) };
  });
  s.days = days;
  p.name = String(p.name || '').slice(0, 30);
  p.weight = clamp(+p.weight || 70, 30, 250);
  if (!ACTIVITY[p.activity]) p.activity = 'moderate';
  if (!HHMM.test(p.wake)) p.wake = '07:00';
  if (!HHMM.test(p.sleep)) p.sleep = '23:00';
  if (p.unit !== 'oz') p.unit = 'ml';
  if (['auto', 'light', 'dark'].indexOf(p.theme) < 0) p.theme = 'auto';
  s.cups = s.cups.map((c) => clamp(Math.round(+c) || 250, 30, 2000));
  s.goal.mode = s.goal.mode === 'manual' ? 'manual' : 'auto';
  s.goal.manual = clamp(+s.goal.manual || 2500, 500, 6000);
  s.goal.climate = !!s.goal.climate;
  s.last = drink(s.last).id;
  ['achievements', 'missions'].forEach((key) => {
    const o = {};
    Object.keys(s[key]).forEach((x) => { if (isFinite(s[key][x])) o[String(x).slice(0, 24)] = +s[key][x]; });
    s[key] = o;
  });
  const ins = {};
  Object.keys(s.insignias).forEach((x) => { if (insigniaById(x) && isFinite(s.insignias[x])) ins[x] = +s.insignias[x]; });
  s.insignias = ins;
  s.social = defaults().social; // amigos são deste aparelho (o login muda de aparelho para aparelho): nada disso vem do backup
  return s;
}
function applyBackup(s) {
  s.reminders = S.reminders; s.ui = S.ui; s.social = S.social; s.onboarded = true; // lembretes, dicas e amigos pertencem a este aparelho
  if (tab !== 'today' && !ob) hBack();
  setS(s);
  ob = null; tab = 'today'; dropSt = null; dropSt2 = null;
  grantInsignias(false); // o backup antigo não traz insígnias: saem do histórico, sem festa
  syncTodayGoal(); save(); applyTheme();
  render(); planReminder();
  startCloud();
  sync(Object.keys(S.days));
  socTouch();
  toast('Backup restaurado ✓');
}
let erasing = false; // saindo dos amigos para apagar tudo: um segundo "Apagar tudo" nesse meio tempo não repete
function resetAll() {
  confirmSheet('Apagar todos os dados?', 'Registros, medalhas e ajustes deste aparelho serão removidos' +
    (cloud ? ', inclusive a cópia na nuvem' : '') + '. Não dá para desfazer.', 'Apagar tudo', true, async () => {
    // Com os amigos ligados, primeiro sai da rede (perfil, convites, amizades). Se não der (sem internet, por exemplo), nada é apagado:
    // o perfil não pode continuar público na nuvem com o app dizendo que apagou tudo. A pessoa pode tentar de novo ou, se preferir,
    // apagar só o que é deste aparelho (uma saída para quem não consegue sair dos amigos nunca ficar sem poder apagar os próprios dados).
    if (S.social.on) {
      if (erasing) { toast('Apagando…'); return; }
      erasing = true;
      toast('Apagando…');
      try { await exitCloud(); } catch (e) {
        hideToast(); // o "Apagando…" não pode ficar por cima do aviso de que não deu
        confirmSheet('Não consegui sair dos amigos', 'Seu perfil continua na nuvem, visível só para quem já é seu amigo, e não deu para apagá-lo agora. ' +
          'Confira a internet e tente de novo. Se preferir, apague só os dados deste aparelho: o perfil nos amigos só some quando você ativar os amigos de novo e sair.',
        'Apagar só neste aparelho', true, eraseLocal);
        return;
      } finally { erasing = false; }
    }
    eraseLocal();
  });
}
// Apaga o que é deste aparelho (e a cópia na nuvem, se a conexão deixar) e volta para a tela de boas-vindas
function eraseLocal() {
  try { if (soc) soc.stop(); } catch (e) { /* a camada de amigos é opcional */ }
  if (cloud && cloud.wipe) cloud.wipe().catch(() => {});
  clearTimeout(remT); scheduleNative(0); clearBadge();
  try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
  dropSocCache(); SOC.st = cleanState(null); frSig = ''; frInv = null; frCode = null; // amigos: o wipe() da nuvem já apagou perfil e amizades
  if (tab !== 'today') hBack();
  setS(defaults()); save();
  tab = 'today'; dropSt = null; dropSt2 = null;
  startOnboarding();
}
function shareProgress() {
  share(shareText(), location.href.split(/[?#]/)[0]).then((r) => {
    if (r === 'copied') toast('Texto copiado ✓ É só colar onde quiser.');
    else if (r === false) toast('Não consegui compartilhar agora.');
  });
}

/* ---------- nuvem (opcional) ---------- */
// Sem firebase-config.js (ou com FIREBASE_ENABLED = false) o app segue 100% local.
// A nuvem só liga depois do onboarding: quem apenas abre a tela de boas-vindas não cria login nem documento
// (e a primeira abertura fica mais leve, sem baixar o SDK do Firebase).
function startCloud() {
  if (cloudOn || !S.onboarded) return;
  cloudOn = true;
  initCloudLayer();
}
// cloudP resolve com a nuvem pronta ou com null (desligada ou falhou): os amigos esperam por ela sem travar a tela
function initCloudLayer() {
  cloudP = import('./firebase-config.js')
    .then((c) => (c.FIREBASE_ENABLED ? import('./firebase.js') : null))
    .then((m) => (m ? m.initCloud({ state: () => S, onRemote: mergeRemote, onStatus: (st) => { syncState = st; } }) : null))
    .then((c) => {
      if (!c) { cloudDown(); return null; }
      cloud = c; syncState = 'on'; SOC.mode = 'ready'; cloudFailed = false;
      syncMeta();
      ensurePush();
      startSocial();
      if (tab === 'friends' && !S.social.on && !ob) render(true); // a tela de entrada ainda mostra o erro de quando a nuvem estava fora
      return c;
    })
    .catch((e) => { syncState = 'off'; cloudFailed = true; console.warn('[nuvem] desligada:', e && e.message ? e.message : e); cloudDown(); return null; });
}
function cloudDown() {
  SOC.mode = 'off';
  if (tab === 'friends' && S.onboarded && !ob) render(true);
}
// Dados da nuvem: por dia, vence a alteração mais recente (campo u, em ms)
function mergeRemote(days) {
  const keys = [];
  Object.keys(days || {}).forEach((k) => {
    const r = days[k], l = S.days[k];
    if (!DAY.test(k) || !r || !Array.isArray(r.entries) || (l && (+r.u || 0) <= (+l.u || 0))) return;
    S.days[k] = { goal: clamp(+r.goal || goalToday(S, k), 500, 6000), u: +r.u || 0, entries: cleanEntries(r.entries) };
    keys.push(k);
  });
  if (!keys.length) return;
  newAchievements(S).forEach((a) => { S.achievements[a.id] = Date.now(); }); // sem festa: são conquistas antigas
  grantInsignias(false);
  save();
  if (keys.indexOf(today()) >= 0) planReminder();
  refreshUI(); socTouch();
}

/* ---------- amigos ---------- */
// social-cloud.js guarda a verdade (perfil, convites, amizades, acenos) e avisa cada mudança; SOC.st é o que as telas mostram.
// A cópia em localStorage ('mare:social') é a primeira pintura e o que se vê sem internet. Tudo é opcional: sem nuvem, o app segue igual.
// Operações que esperam o servidor passam por guard(): se a rede estiver parada, a tela avisa em vez de ficar girando para sempre.
const guard = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => { rej({ code: 'slow' }); }, ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});
const codeOf = (e) => (e && e.code ? String(e.code) : 'unknown');
const socPayload = () => (S.onboarded && S.social.on ? profilePayload(S, today()) : null);
function readSocCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
function writeSocCache(st) {
  // uid: a cópia só vale para a conta que a gravou (se o login mudar neste aparelho, a lista antiga não é da conta nova)
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: (soc && soc.me) || st.uid || '', code: st.code, at: st.at, friends: st.friends, reqIn: st.reqIn, reqOut: st.reqOut })); } catch (e) { /* sem espaço: segue sem a cópia */ }
}
function dropSocCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignora */ } }
function socTouch() { try { if (soc && S.social.on) soc.touch(); } catch (e) { /* amigos são opcionais */ } }
function socFlush() { try { if (soc && S.social.on) soc.flush().catch(() => {}); } catch (e) { /* idem */ } }
function cloudReady() { if (!cloudP) startCloud(); return cloudP || Promise.resolve(null); }
function getSoc() {
  if (soc) return Promise.resolve(soc);
  if (!socP) {
    socP = cloudReady().then((c) => {
      if (!c || !c.social) throw { code: 'off' };
      return c.social(readSocCache());
    }).then((s) => { soc = s; wireSoc(s); return s; }, (e) => { socP = null; throw e; });
  }
  return socP;
}
// Refaz a conexão com a nuvem do zero (ela não subiu: sem internet ao abrir o app, por exemplo)
function reconnectCloud() { SOC.mode = 'wait'; cloudFailed = false; cloudOn = false; cloudP = null; socP = null; soc = null; startCloud(); }
// A nuvem não subiu quando o app abriu (sem internet) e agora a internet voltou, ou o app voltou ao primeiro plano: tenta de novo sozinha. Sem isso,
// a sincronização, os lembretes do servidor e os amigos ficavam parados até a pessoa fechar o app. Quem não tem nuvem nenhuma (FIREBASE_ENABLED
// desligado) não conta: lá nada falhou, então não há o que tentar. Uma tentativa por evento: se falhar de novo, espera o próximo.
function retryCloudIfDown() { if (cloudFailed && S.onboarded && !ob && navigator.onLine !== false) reconnectCloud(); }
// getSoc() com uma segunda chance: se a nuvem estava fora, tenta subi-la de novo uma vez antes de desistir. Quem sai dos amigos ou apaga
// tudo não pode ficar preso a uma falha de quando o app abriu.
async function connectSoc(ms) {
  try { return await guard(getSoc(), ms); } catch (e) {
    if (codeOf(e) !== 'off') throw e;
    reconnectCloud();
    return guard(getSoc(), ms);
  }
}
function wireSoc(s) { if (socWired === s) return; socWired = s; s.on(onSocial); } // uma vez por instância (ao religar a nuvem nasce outra)
// Com os amigos ligados neste aparelho: escuta a nuvem e confere o perfil e o código de convite (uma vez por abertura)
function startSocial() {
  if (!S.onboarded || !S.social.on) return;
  getSoc().then((s) => {
    s.start({ payload: socPayload });
    return s.join({ payload: socPayload(), code: S.social.code });
  }).then((code) => { if (code && code !== S.social.code && S.social.on) { S.social.code = code; save(); } },
    (e) => { console.warn('[amigos]', codeOf(e)); });
}
// Chega a cada mudança da camada de nuvem (amigo novo, progresso de alguém, pedido, aceno, erro de conexão)
function onSocial(st) {
  if (!S.social.on) return; // saiu dos amigos: o que chegar agora não vale
  const prev = SOC.st;
  SOC.st = st;
  if (st.code && st.code !== S.social.code) { S.social.code = st.code; save(); }
  writeSocCache(st);
  if (st.ready) announceSocial(prev, st);
  crewCheck(st);
  refreshFriendsUI();
}
// Avisos do que mudou desde a última vez: pedido aceito (festinha), gente nova na turma e pedido novo (toque no aviso abre a aba)
function announceSocial(prev, st) {
  const a = arrivals(prev, st), size = st.friends.length + 1;
  if (a.accepted.length) {
    const f = a.accepted[0];
    pop('🤗', 'Nova amizade', f.nm + ' aceitou seu pedido', a.joined.length ? 'Sua turma agora tem ' + size + ' pessoas'
      : a.accepted.length > 1 ? 'e mais ' + (a.accepted.length - 1) + (a.accepted.length > 2 ? ' pessoas' : ' pessoa') : 'Agora vocês se acompanham');
  } else if (a.joined.length) {
    toast(esc(joinedText(a.joined)) + ' 🐠', tab === 'friends' ? undefined : { label: 'Ver', fn: () => go('friends') });
  } else if (a.requests.length && tab !== 'friends' && !sheetIsOpen()) {
    const r = a.requests[0];
    toast(a.requests.length === 1 ? esc(r.nm) + ' quer acompanhar o dia com você 💌' : 'Você tem ' + a.requests.length + ' pedidos de amizade 💌',
      { label: 'Ver', fn: () => go('friends') });
  }
}
// Quando todo mundo da turma bateu a meta, uma comemoração por dia
function crewCheck(st) {
  if (!S.social.on || !st || !st.ready || !st.friends.length) return;
  const k = today();
  if (S.ui.crewAt === k) return;
  if (turma(myLive(S, k), st.friends.map((f) => liveOf(f, k))).kind !== 'all') return;
  S.ui.crewAt = k; save();
  if (!popBusy()) confetti();
  pop('🌊', 'Turma completa!', 'Todo mundo bateu a meta hoje', 'A maré está cheia');
}
// Os acenos de agora viram "vistos" quando a aba Amigos está aberta (a bolinha da aba some)
function markWavesSeen() {
  const seen = seenWaves(SOC.st.friends, today());
  if (JSON.stringify(seen) !== JSON.stringify(S.ui.wv || {})) { S.ui.wv = seen; save(); }
}
function paintTabs() {
  if (!S.onboarded || ob) return;
  const h = tabbarHTML(tab);
  if (h !== tabHTML) { tabHTML = h; tabbar.innerHTML = h; }
}
// Redesenha só o que depende dos amigos, e só se mudou: um amigo atualizar o perfil não faz a tela piscar nem a rolagem pular
function refreshFriendsUI() {
  if (!S.onboarded || ob) return;
  if (tab === 'friends') markWavesSeen();
  paintTabs();
  if (tab === 'today') refreshPart('tCrew');
  else if (tab === 'friends' && friendsSig() !== frSig && !typing()) render(true);
  refreshFriendSheet();
}
const friendById = (id) => SOC.st.friends.filter((f) => f.uid === id)[0] || null;
const friendSig = (id) => { const f = friendById(id); return f ? JSON.stringify(f) + today() : ''; };
function openFriend(id) {
  if (!friendById(id)) return;
  openSheet(friendSheet(id));
  sheetBody.setAttribute('data-fsig', friendSig(id));
}
function refreshFriendSheet() {
  if (!sheetIsOpen()) return;
  const el = $('[data-friend]', sheetBody);
  if (!el) return;
  const id = el.getAttribute('data-friend'), sg = friendSig(id);
  if (!sg) { closeSheet(); return; } // a amizade acabou
  if (sg !== sheetBody.getAttribute('data-fsig')) openFriend(id);
}
function busyBtn(el, on, label) {
  if (!el || !el.isConnected) return;
  if (on) { el.setAttribute('data-l', el.innerHTML); el.disabled = true; el.setAttribute('aria-busy', 'true'); if (label) el.textContent = label; }
  else { el.disabled = false; el.removeAttribute('aria-busy'); const l = el.getAttribute('data-l'); if (l != null) el.innerHTML = l; }
}
const frErr = (t) => { const e = $('#frErr'); if (e) e.textContent = t || ''; if (t) haptic('medium'); };

/* convite aberto por link (?amigo=CÓDIGO) antes de ativar os amigos */
const frInvCtx = () => (S.ui.invite && !S.social.on ? (frInv && frInv.code === S.ui.invite ? frInv : { code: S.ui.invite, st: 'loading' }) : null);
function paintInvite() {
  const box = $('#frInv'), cta = $('#frCta');
  if (!box) return;
  const i = inviteInfo(frInvCtx());
  box.innerHTML = i.html;
  if (cta && !cta.disabled) cta.textContent = i.cta;
}
function resolveInvite() {
  const code = S.ui.invite;
  if (!code || S.social.on || (frInv && frInv.code === code)) return;
  frInv = { code: code, st: 'loading' };
  getSoc().then((s) => s.lookup(code)).then((who) => {
    frInv = !who ? { code: code, st: 'gone' } : who.self ? { code: code, st: 'self' } : { code: code, st: 'ok', who: who };
  }, (e) => { frInv = { code: code, st: 'err', err: codeOf(e) }; }).then(paintInvite);
}
function openInvite(code) {
  if (tab === 'friends') render(true); else go('friends');
  if (!S.social.on) return; // a tela de entrada mostra o convite (S.ui.invite) e pede o apelido
  delete S.ui.invite; save();
  openCodeSheet(code);
  findCode($('[data-action="fr-find"]', sheetBody));
}

/* ativar, privacidade e perfil */
async function joinFriends(el) {
  if (S.social.on) return;
  const inp = $('#frNick'), nick = cleanNick(inp ? inp.value : '');
  if (!nick) { frErr('Escolha um apelido para seus amigos te reconhecerem.'); if (inp) inp.focus(); return; }
  frErr('');
  S.social.nick = nick;
  busyBtn(el, true, 'Ativando…');
  try {
    const s = await connectSoc(20000); // se a nuvem estava fora, tenta subi-la de novo uma vez
    const code = await guard(s.join({ payload: profilePayload(S, today()), code: S.social.code }), 25000);
    S.social.on = true; S.social.code = code; save();
    ensurePush(); // com a permissão já dada, o aparelho passa a receber os avisos dos amigos
    SOC.st = s.state(); SOC.mode = 'ready'; frSig = '';
    s.start({ payload: socPayload });
    const inv = S.ui.invite;
    if (inv) { delete S.ui.invite; frInv = null; save(); }
    if (tab === 'friends') render(true); else paintTabs();
    toast('Amigos ativados 💙');
    if (inv) await sendInvite(s, inv);
  } catch (e) { busyBtn(el, false); frErr(errText(codeOf(e))); }
}
async function sendInvite(s, code) {
  try {
    const r = await guard(s.request(code), 30000);
    if (r.kind === 'accepted') pop('🤗', 'Nova amizade', 'Você e ' + r.nm + ' agora se acompanham', 'Que tal mandar um aceno?');
    else toast('Pedido enviado para ' + esc(r.nm) + ' 💌');
  } catch (e) {
    const c = codeOf(e);
    if (c !== 'self' && c !== 'exists' && c !== 'pending') toast(errText(c)); // abrir o próprio convite ou de quem já é amigo não é erro
  }
}
function toggleShare() {
  S.social.share = S.social.share === false;
  save(); haptic('light');
  const on = S.social.share !== false;
  $$('[data-action="fr-share"]').forEach((x) => { x.setAttribute('aria-checked', on ? 'true' : 'false'); });
  if (!S.social.on) return;
  socTouch();
  if (sheetIsOpen() && $('#frNm', sheetBody)) openSheet(profileSheet()); // o texto sob o avatar muda junto
}
// A meta em ml só vai para a turma com um "sim" explícito (S.social.goal === true). null = ainda não escolheu (o cartão da aba Amigos pergunta)
function setGoalShare(on) {
  if (S.social.goal === on) { if (tab === 'friends') render(true); return; }
  S.social.goal = on; save(); haptic('light');
  $$('[data-action="fr-goal"][role="switch"]').forEach((x) => { x.setAttribute('aria-checked', on ? 'true' : 'false'); });
  if (S.social.on) socTouch(); // o perfil sai de novo, com ou sem a meta
  toast(on ? 'Sua meta aparece para a turma 🎯' : 'Sua meta fica só com você');
  if (sheetIsOpen() && $('#frNm', sheetBody)) openSheet(profileSheet());
  if (tab === 'friends') render(true);
}
function nickChanged(el, v) {
  const n = cleanNick(v);
  if (!n) { el.value = S.social.nick; toast('Escolha um apelido para seus amigos te reconhecerem.'); return; }
  S.social.nick = n; el.value = n; save(); socTouch();
  const nm = $('#frNm'); if (nm) nm.textContent = n;
  if (tab === 'settings') render(true);
}
function pickMascot(id) {
  if (!insigniaById(id) || !S.insignias[id]) return;
  S.profile.mascot = id; save(); haptic('light'); socTouch();
  openSheet(profileSheet());
  if (tab === 'today') refreshPart('tCrew'); else if (tab !== 'settings') render(true);
  toast('Mascote trocado ✓');
}

/* convidar e entrar por código */
function inviteShare() {
  const code = SOC.st.code || S.social.code;
  if (!code) return;
  share(inviteText(code), inviteLink(location.href, code)).then((r) => {
    if (r === 'copied') toast('Convite copiado ✓ É só colar no WhatsApp ou onde quiser.');
    else if (r === false) toast('Não consegui compartilhar agora.');
  });
}
function inviteCopy() {
  const code = SOC.st.code || S.social.code;
  if (!code) return;
  copyText(fmtCode(code)).then((r) => { toast(r === 'copied' ? 'Código copiado ✓' : 'Não consegui copiar. Anote o código que está na tela.'); });
}
function openCodeSheet(raw) { frCode = { raw: raw || '', who: null, err: '' }; openSheet(codeSheet(frCode)); }
async function findCode(el) {
  const inp = $('#frCode'), raw = inp ? inp.value : '', cur = { raw: raw, who: null, err: '' };
  frCode = cur;
  const code = codeFromURL(raw) || normCode(raw); // aceita o código ("abcd-efgh") ou o link inteiro do convite
  if (!validCode(code)) { frErr('O código tem 8 letras e números. Confira se está completo.'); return; }
  frErr('');
  busyBtn(el, true, 'Procurando…');
  try {
    const s = await guard(getSoc(), 15000);
    const who = await guard(s.lookup(code), 15000);
    if (!who) throw { code: 'notfound' };
    if (who.self) throw { code: 'self' };
    if (frCode !== cur || !sheetIsOpen()) return; // a pessoa fechou o painel enquanto procurava
    cur.who = who;
    openSheet(codeSheet(cur));
  } catch (e) { if (frCode === cur && sheetIsOpen()) { busyBtn(el, false); frErr(errText(codeOf(e))); } }
}
async function sendCode(el) {
  const cur = frCode, who = cur && cur.who;
  if (!who) return;
  busyBtn(el, true, 'Enviando…');
  try {
    const s = await guard(getSoc(), 15000);
    await guard(s.publish(socPayload()), 15000); // garante meu nome e mascote no pedido (no-op se nada mudou)
    const r = await guard(s.request(who.code), 30000);
    if (frCode === cur && sheetIsOpen()) closeSheet();
    if (r.kind === 'accepted') pop('🤗', 'Nova amizade', 'Você e ' + r.nm + ' agora se acompanham', 'Que tal mandar um aceno?');
    else toast('Pedido enviado para ' + esc(r.nm) + ' 💌');
  } catch (e) {
    if (frCode !== cur || !sheetIsOpen()) return;
    cur.err = errText(codeOf(e));
    openSheet(codeSheet(cur));
  }
}

/* pedidos, acenos e amizades */
// Aceitar junta as turmas dos dois lados (todo mundo passa a ver todo mundo): por isso a pessoa confirma antes
function acceptReq(id) {
  const r = SOC.st.reqIn.filter((x) => x.uid === id)[0];
  if (!r) return;
  if (!soc) { toast(errText('off')); return; }
  confirmSheet('Aceitar o pedido de ' + esc(r.nm) + '?', 'Os amigos do Maré formam uma turma só. Ao aceitar, você entra na turma de <b>' + esc(r.nm) +
    '</b>: vocês e os amigos de cada um passam a ver o progresso uns dos outros. Dá para sair quando quiser, em Ajustes.', 'Aceitar', false, () => doAccept(id, r));
}
function doAccept(id, r) {
  if (!soc) { toast(errText('off')); return; }
  haptic('success');
  soc.accept(id).then(() => { pop('🤗', 'Nova amizade', 'Você e ' + r.nm + ' agora se acompanham', 'Que tal mandar um aceno?'); },
    (e) => { toast(errText(codeOf(e))); });
}
function dropReq(id, how) {
  if (!soc) { toast(errText('off')); return; }
  (how === 'cancel' ? soc.cancel(id) : soc.decline(id)).then(() => { toast(how === 'cancel' ? 'Convite cancelado' : 'Pedido recusado'); },
    (e) => { toast(errText(codeOf(e))); });
}
// Recusa de uma vez todos os pedidos recebidos (a tela mostra no máximo 30, mas vale para todos)
function declineAllReqs() {
  if (!soc) { toast(errText('off')); return; }
  guard(soc.declineAll(), 30000).then((n) => { toast(n === 0 ? 'Nenhum pedido para recusar' : n === 1 ? 'Pedido recusado' : n + ' pedidos recusados'); },
    (e) => { toast(errText(codeOf(e))); });
}
function waveTo(el, id) {
  const f = friendById(id);
  if (!f) { toast(errText('gone')); return; }
  if (!soc) { toast(errText('off')); return; }
  const t = today(), w = waveFor(f, t);
  if (w.done || waving[id]) return; // um aceno por amigo por dia
  waving[id] = 1;
  haptic('light');
  floatEmoji(el, w.kind === 'cheer' ? '🎉' : '👋');
  toast((w.kind === 'cheer' ? 'Parabéns enviado para ' : 'Aceno enviado para ') + esc(f.nm) + (w.kind === 'cheer' ? ' 🎉' : ' 👋'));
  soc.wave(id, w.kind, t).then(() => { delete waving[id]; }, (e) => { delete waving[id]; toast(errText(codeOf(e))); });
}
function newCode() {
  if (!soc) { toast(errText('off')); return; }
  guard(soc.newCode(), 20000).then((c) => {
    S.social.code = c; save();
    toast('Novo código: ' + fmtCode(c) + ' ✓');
    if (tab === 'friends') render(true);
  }, (e) => { toast(errText(codeOf(e))); });
}
// Sai da rede de amigos na nuvem (perfil, convites, amizades). Resolve quando saiu; rejeita quando não deu, e então nada mudou lá (a saída
// é tudo ou nada). Se a espera estourar (rede travada), a gravação ainda pode terminar depois de a tela desistir: a tela acompanha o que
// de fato aconteceu (saiu: passa a refletir isso; falhou: volta a escutar), em vez de ficar dizendo uma coisa e a nuvem outra.
async function exitCloud() {
  const s = await connectSoc(15000);
  const p = s.leave();
  const again = () => { try { s.start({ payload: socPayload }); } catch (e) { /* a escuta volta quando der */ } };
  try { await guard(p, 40000); } catch (e) {
    if (codeOf(e) === 'slow') p.then(() => { if (S.social.on) afterLeft(); }, again); // (durante a saída, start() não faz nada: volta só se ela falhar)
    else again();
    throw e;
  }
}
// O aparelho passa a refletir que a pessoa saiu dos amigos (a nuvem já foi limpa)
function afterLeft() {
  S.social.on = false; S.social.code = ''; S.social.goal = null; delete S.ui.wv; save(); // goal = null: o "sim" à meta em ml valia para a turma que ficou para trás; na próxima, pergunta de novo
  SOC.st = cleanState(null); dropSocCache(); frSig = '';
  paintTabs();
  if (tab === 'today') refreshPart('tCrew'); else if (tab === 'friends' || tab === 'settings') render(true);
}
// Sair apaga tudo na nuvem; só vale se der certo (senão o perfil continuaria público e o app diria que saiu)
async function leaveFriends() {
  toast('Saindo da turma…');
  try { await exitCloud(); } catch (e) { toast(errText(codeOf(e))); return; }
  afterLeft();
  toast('Você saiu da turma. Seu perfil foi apagado da nuvem.');
}
function retrySocial() {
  if (SOC.mode === 'off') { // a nuvem não subiu: refaz a conexão do zero
    reconnectCloud();
    render(true);
    return;
  }
  if (soc) soc.refresh().catch(() => {}); else startSocial();
}

/* ---------- ações (data-action) ---------- */
const A = {
  'close-sheet': () => closeSheet(),
  'confirm-ok': () => runConfirm(),
  'toast-act': () => runToastAction(),
  update: () => applyUpdate(),
  tab: (el, d) => go(d.tab),
  add: (el, d) => quickAdd(+d.ml),
  // água comum ou com gás nos copos rápidos
  'set-water': (el, d) => { const w = drink(d.v); if (w.g !== 'w') return; S.last = w.id; save(); refreshPart('tQuick'); haptic('light'); },
  // segunda gota: painel dos outros líquidos (escolhe a bebida e toca no volume)
  others: () => openSheet(othersSheet(S.lastO)),
  'set-other': (el, d) => { const o = drink(d.d); if (o.g !== 'o') return; S.lastO = o.id; save(); openSheet(othersSheet(S.lastO)); haptic('light'); },
  'add-o': (el, d) => { closeSheet(); quickAdd(+d.ml, S.lastO); },
  'add-custom-o': () => openEntry(today(), null, false, S.lastO),
  'add-custom': () => openEntry(today()),
  'new-entry': (el, d) => openEntry(d.day, null, true),
  'edit-entry': (el, d) => { const e = findEntry(d.day, d.id); if (e) openEntry(d.day, e, sheetIsOpen()); },
  'draft-drink': (el, d) => {
    if (!dr) return;
    dr.d = d.d; press(el);
    const n = $('#eNote');
    if (n) n.textContent = drink(d.d).g === 'o' ? otherNote() : '';
  },
  'draft-ml': (el, d) => { if (dr) { dr.ml = +d.ml; $('#eMl').value = fromMl(dr.ml); press(el); } },
  'entry-save': () => saveEntry(),
  'entry-del': () => deleteEntry(),
  day: (el, d) => openDay(d.day),
  cal: (el, d) => { ym = shiftYm(ym || today().slice(0, 7), +d.n); render(true); },
  'tip-x': (el, d) => { S.ui['tip_' + d.tip] = 1; save(); refreshPart('tTips'); if (tab === 'friends') render(true); },
  install: () => {
    if (!canInstall()) { openSheet(installSheet()); return; }
    promptInstall().then((ok) => { if (ok) toast('Maré instalado! 🎉'); refreshPart('tTips'); });
  },
  'install-help': () => openSheet(installSheet()),
  'notif-help': () => openSheet(notifHelpSheet(notifStatus())),
  'reminders-on': () => enableReminders(),
  'reminders-toggle': () => {
    const st = notifStatus();
    if (S.reminders.enabled && st !== 'denied' && st !== 'install') disableReminders(); else enableReminders();
  },
  'climate-on': () => setClimate(true),
  toggle: (el, d) => {
    if (d.k === 'climate') { setClimate(!S.goal.climate); return; }
    if (d.k === 'others') { S.profile.others = !othersOn(); rulesChanged(); return; } // a segunda gota só aparece em Hoje
    if (d.k === 'mix') { S.profile.mix = S.profile.mix !== true; rulesChanged(); return; } // "Somar outros líquidos na meta"
    S.reminders.smart = !S.reminders.smart;
    planReminder(); render(true);
  },
  interval: (el, d) => { S.reminders.interval = +d.v; planReminder(); render(true); },
  activity: (el, d) => { S.profile.activity = d.v; goalChanged(); render(true); },
  'goal-mode': (el, d) => {
    if (d.v === 'manual' && S.goal.mode !== 'manual') S.goal.manual = goalNow(); // começa do valor que já vinha usando
    S.goal.mode = d.v; goalChanged(); render(true);
  },
  'goal-step': (el, d) => {
    S.goal.manual = clamp(S.goal.manual + (U() === 'oz' ? toMl(4) : 100) * +d.n, 500, 6000);
    const i = $('#sGoal');
    if (i) i.value = fromMl(S.goal.manual);
    goalChanged(); haptic('light');
  },
  theme: (el, d) => { S.profile.theme = d.v; save(); applyTheme(); render(true); },
  unit: (el, d) => { S.profile.unit = d.v; save(); syncMeta(); render(true); },
  'test-notif': () => testNotif(),
  ics: () => exportICS(),
  export: () => exportBackup(),
  import: () => importBackup(),
  reset: () => resetAll(),
  share: () => shareProgress(),
  // insígnias
  ins: (el, d) => { openSheet(insigniaSheet(d.id)); animBars(sheetBody); },
  mascot: (el, d) => setMascot(d.id),
  reef: () => { closeSheet(); go('journey'); },
  news: () => { S.ui.tip_news12 = 1; save(); refreshPart('tTips'); openSheet(newsSheet()); },
  'news-go': () => { closeSheet(); go('journey'); },
  'news-friends': () => { closeSheet(); go('friends'); },
  // amigos
  'fr-intro': () => go('friends'),
  'fr-join': (el) => joinFriends(el),
  'fr-share': () => toggleShare(),
  'fr-skip': () => { delete S.ui.invite; frInv = null; save(); paintInvite(); },
  'fr-invite': () => inviteShare(),
  'fr-copy': () => inviteCopy(),
  'fr-code': () => openCodeSheet(''),
  'fr-find': (el) => findCode(el),
  'fr-send': (el) => sendCode(el),
  'fr-back': () => { frCode = { raw: frCode ? frCode.raw : '', who: null, err: '' }; openSheet(codeSheet(frCode)); },
  'fr-accept': (el, d) => acceptReq(d.id),
  'fr-decline': (el, d) => dropReq(d.id, 'decline'),
  'fr-decline-all': () => confirmSheet('Recusar todos os pedidos?', 'Todos os pedidos de amizade que você recebeu serão recusados. Quem pediu não é avisado e só consegue ' +
    'pedir de novo com o seu código de convite atual. Para fechar essa porta, troque o código em Ajustes.', 'Recusar todos', true, declineAllReqs),
  'fr-cancel': (el, d) => dropReq(d.id, 'cancel'),
  'fr-open': (el, d) => openFriend(d.id),
  'fr-wave': (el, d) => waveTo(el, d.id),
  'fr-profile': () => openSheet(profileSheet()),
  'fr-mascot': (el, d) => pickMascot(d.id),
  'fr-about': () => openSheet(aboutSheet()),
  'fr-newcode': () => confirmSheet('Trocar o código de convite?', 'Quem tem o código antigo não consegue mais usá-lo. Sua turma e os pedidos que já chegaram continuam como estão.', 'Trocar', false, newCode),
  'fr-leave': () => confirmSheet('Sair da turma?', 'Seu perfil, seus convites e suas amizades serão apagados da nuvem, e você deixa de ver a turma e de ser visto por ela. Como a turma é uma só, ' +
    'não dá para sair só de uma pessoa. Seus registros de água continuam no aparelho. Para voltar, é só ativar de novo e pedir um novo convite.', 'Sair', true, leaveFriends),
  'fr-retry': () => retrySocial(),
  'fr-alerts': () => toggleAlerts(),
  'fr-hit': () => toggleOpt('hit'),
  'fr-week': () => toggleOpt('week'),
  'fr-rank': (el, d) => { const v = rankId(d.v); if (S.ui.frRank === v) return; S.ui.frRank = v; save(); haptic('light'); render(true); },
  'fr-goal': () => setGoalShare(S.social.goal !== true),
  'fr-goal-on': () => setGoalShare(true),
  'fr-goal-off': () => setGoalShare(false),
  'ob-next': () => obNext(),
  'ob-back': () => obBack(false),
  'ob-weight': (el, d) => {
    const i = $('#obWeight'), w = num(i.value);
    i.value = fmtW(clamp(Math.round(((isFinite(w) ? w : 70) + +d.n) * 10) / 10, 30, 250));
    haptic('light');
  },
  'ob-activity': (el, d) => {
    ob.activity = d.v; haptic('light');
    $$('.opt').forEach((o) => { o.setAttribute('aria-checked', o.getAttribute('data-v') === d.v ? 'true' : 'false'); });
  },
  'ob-notif': () => { finishOb(); enableReminders(); }, // mesmo toque: a permissão continua válida
  'ob-finish': () => finishOb(),
};

/* ---------- eventos ---------- */
document.addEventListener('click', (ev) => {
  const el = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
  if (!el || el.disabled) return;
  const fn = A[el.getAttribute('data-action')];
  if (!fn) return;
  ev.preventDefault();
  fn(el, el.dataset || {});
});
document.addEventListener('change', (ev) => {
  const el = ev.target, f = el && el.getAttribute ? el.getAttribute('data-field') : null;
  if (!f) return;
  const p = S.profile, v = String(el.value || '');
  if (f === 'nick') { nickChanged(el, v); return; } // apelido dos amigos: não mexe em meta nem em lembretes
  if (f === 'name') p.name = v.trim().slice(0, 30);
  else if (f === 'weight') {
    const w = num(v);
    if (w >= 30 && w <= 250) p.weight = Math.round(w * 10) / 10; else toast('Informe um peso entre 30 e 250 kg.');
    el.value = fmtW(p.weight);
  } else if (f === 'goal') {
    const ml = toMl(num(v));
    if (ml >= 500 && ml <= 6000) S.goal.manual = Math.round(ml / 10) * 10;
    el.value = fromMl(S.goal.manual);
  } else if (f === 'wake' || f === 'sleep') {
    const t = v.slice(0, 5);
    if (HHMM.test(t) && t !== p[f === 'wake' ? 'sleep' : 'wake']) p[f] = t; else el.value = p[f];
  } else if (f === 'cup') {
    const i = +el.getAttribute('data-i'), ml = toMl(num(v));
    if (ml >= 30 && ml <= 2000) S.cups[i] = Math.round(ml);
    el.value = fromMl(S.cups[i]);
  }
  goalChanged();
  const rn = $('#remNote');
  if (rn) rn.innerHTML = remNoteText(info().push);
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key !== 'Enter' || !t || t.tagName !== 'INPUT') return;
  e.preventDefault();
  if (t.id === 'eMl') saveEntry();
  else if (t.id === 'frCode') findCode($('[data-action="fr-find"]', sheetBody));
  else if (t.id === 'frNick') t.blur(); // fecha o teclado; o botão Ativar fica à vista
  else if (t.id === 'obName') { const w = $('#obWeight'); if (w) w.focus(); }
  else if (/^ob/.test(t.id)) obNext();
  else t.blur(); // dispara o "change" e fecha o teclado
});

/* ---------- retomar, virada do dia, atalhos ---------- */
function checkDay() {
  const k = today();
  if (k === curDay) return false;
  curDay = k;
  if (!S.onboarded || ob) return true;
  planReminder(); refreshClimate(false); socTouch(); // virou o dia: a % de hoje começa do zero para os amigos
  if (!sheetIsOpen()) render(true);
  return true;
}
function onResume() {
  pullInbox();
  clearBadge(); // um push de uma versão antiga do servidor ou do app pode ter acendido o selo com o app fechado
  if (!S.onboarded || ob) return;
  if (!checkDay()) {
    const r = S.reminders;
    if (r.enabled && r.nextAt && r.nextAt < Date.now()) planReminder(Date.now()); else armTimer();
    refreshPart('tMeta');
  }
  refreshClimate(false);
  if (soc && S.social.on && SOC.st.err) soc.refresh().catch(() => {}); // a escuta caiu enquanto o app estava longe: tenta de novo agora
  retryCloudIfDown();
}
function handleURL() {
  const q = location.search, add = /[?&]add=(\d+)/.exec(q), t = /[?&]tab=(\w+)/.exec(q), inv = codeFromURL(q);
  if (!q) return;
  try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) { /* ignora */ }
  if (inv) { S.ui.invite = inv; save(); } // convite por link (?amigo=CÓDIGO): guardado até o fim do onboarding, se a pessoa ainda não tem o app configurado
  if (!S.onboarded) return;
  if (inv) setTimeout(() => { openInvite(inv); }, 300);
  else if (add) setTimeout(() => { quickAdd(clamp(+add[1], 10, 3000), 'water'); }, 500); // atalho do ícone (Android)
  else if (t) go(t[1]);
}

/* ---------- início ---------- */
function boot() {
  hooks.saveError = () => { toast('Não consegui salvar no aparelho. Libere espaço ou saia da navegação privada.'); };
  setS(load());
  SOC.st = S.social.on ? cleanState(readSocCache()) : cleanState(null); // primeira pintura dos amigos, antes da nuvem responder
  applyTheme();
  onMedia('(prefers-color-scheme: dark)', () => { if (S.profile.theme === 'auto') applyTheme(); });
  const bg = $('.sheet-bg');
  if (bg) bg.style.cursor = 'pointer'; // sem isso o iOS não entrega o toque no fundo do painel ao listener do document
  curDay = today();
  syncTodayGoal();
  if (S.onboarded) welcomeInsignias();
  render();
  handleURL();
  registerSW({
    onUpdate: () => showBanner('Nova versão disponível', 'Atualizar', 'update'),
    onMessage: onSWMessage,
  });
  initInstall(() => { if (tab === 'today' && S.onboarded && !ob) refreshPart('tTips'); });
  pullInbox();
  if (S.onboarded) {
    const r = S.reminders;
    if (r.enabled && (!r.nextAt || r.nextAt < Date.now())) planReminder(Date.now());
    else { armTimer(); const m = reminderText(); scheduleNative(r.enabled ? r.nextAt : 0, m.title, m.body); }
    refreshClimate(false); persistStorage();
  }
  clearBadge(); // o selo do ícone saiu na 1.2.0 (era a conta de copos que faltam): quem veio de uma versão antiga ainda pode ter um número parado lá
  startCloud();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onResume(); else socFlush(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) onResume(); });
  window.addEventListener('online', retryCloudIfDown);
  setInterval(() => { // o ritmo muda com o relógio, mesmo sem novos registros
    if (document.visibilityState === 'visible' && S.onboarded && !ob && !checkDay() && tab === 'today') refreshPart('tMeta');
  }, 60000);
}
boot();
