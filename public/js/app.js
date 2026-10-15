// Maré — aplicativo (Parte 3C). Liga estado, telas, lembretes, clima, celebrações e a nuvem opcional.
// Toda alteração segue: muda S → save() → afterChange() (lembrete, conquistas, badge, nuvem) → atualiza só o necessário.
import { ACTIVITY, drink, isWater, retired, uid, dayKey, keyToDate, minOf, fmtHM, expectedBy, nextReminderAt, climateBonus, goalToday,
  levelFor, missionFor, missionProgress, newAchievements, streak, buildICS, defaults, migrate } from './core.js';
import { KEY, S, setS, hooks, load, save, clamp, num, plural, byT, shiftYm, today, goalNow, totalNow, otherNow, othersOn, ensureDay,
  syncTodayGoal, allMl, U, vol, toMl, fromMl, big } from './store.js';
import { $, $$, tween, animBars, onBack, hPush, hBack, toast, runToastAction, showBanner, sheetBody, sheetIsOpen, openSheet,
  closeSheet, confirmSheet, runConfirm, splash, confetti, pop, levelY, dropTo } from './ui.js';
import { isNative, reducedMotion, onMedia, haptic, registerSW, applyUpdate, notifStatus, requestNotifPermission, showNotification,
  scheduleNative, setBadge, drainInbox, initInstall, canInstall, promptInstall, getCoords, fetchMaxTemp, saveFile, share,
  persistStorage } from './platform.js';
import { TODAY_PARTS, todayView, historyView, journeyView, settingsView, onboardingView, OB_STEPS, tabbarHTML, othersSheet, OTHER_NOTE,
  entrySheet, daySheet, installSheet, notifHelpSheet, dropOpts, dropOpts2, drop2Label, paceInfo, goalSumHTML, remNoteText, shareText,
  fmtW } from './views.js';

export const APP_VERSION = '1.0.2'; // aumente a cada deploy, junto com VERSION no sw.js

const view = $('#view'), tabbar = $('#tabbar'), TABS = ['today', 'history', 'journey', 'settings'];
const HHMM = /^\d{2}:\d{2}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
let tab = 'today', ym = '', ob = null, dr = null, dropSt = null, dropSt2 = null, curDay = '', remT = 0, climBusy = false, fileIn = null;
let cloud = null, syncState = 'off', cloudOn = false;

/* ---------- utilidades ---------- */
const info = () => ({ version: 'v' + APP_VERSION, sync: syncState, push: !!(cloud && cloud.push) });
function sync(keys) { try { if (cloud) cloud.syncDays(keys); } catch (e) { /* a nuvem é opcional */ } }
function syncMeta() { try { if (cloud) cloud.syncMeta(); } catch (e) { /* idem */ } }
const touch = (k) => { if (S.days[k]) S.days[k].u = Date.now(); }; // u = última alteração do dia (usado na sincronização)
const snap = () => ({ total: totalNow(), goal: goalNow(), lv: levelFor(allMl()).i });
const typing = () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && view.contains(a); };
const findEntry = (k, id) => { const d = S.days[k]; return (d && d.entries ? d.entries.filter((e) => e.id === id)[0] : null) || null; };
// Hora do último gole de ÁGUA de hoje: o lembrete parte dele. Café, chá etc. não adiam o próximo lembrete de água.
const lastToday = () => { const d = S.days[today()], es = d && d.entries ? d.entries.filter(isWater) : []; return es.reduce((m, e) => Math.max(m, e.t), 0); };
// Refrigerante e álcool saíram do app: registros antigos deles (backup, nuvem) são descartados
const cleanEntries = (list) => list.filter((e) => e && isFinite(e.t) && e.ml > 0 && e.ml <= 5000 && !retired(e.d))
  .map((e) => ({ id: String(e.id || uid()).slice(0, 24), t: +e.t, ml: Math.round(+e.ml), d: drink(e.d).id })).sort(byT);
function refreshPart(id) { const el = $('#' + id); if (el && TODAY_PARTS[id]) el.innerHTML = TODAY_PARTS[id](); }
function press(el) { $$('.pill', el.parentNode).forEach((p) => { p.setAttribute('aria-pressed', p === el ? 'true' : 'false'); }); }
function updateBadge() { const left = goalNow() - totalNow(); setBadge(left > 0 ? Math.ceil(left / 250) : 0); }
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
  tabbar.innerHTML = tabbarHTML(tab);
  view.innerHTML = tab === 'history' ? historyView(ym) : tab === 'journey' ? journeyView() : tab === 'settings' ? settingsView(info()) : todayView();
  bars(view, !still);
  if (tab === 'today') paintDrop();
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
  syncTodayGoal(); save();
  tab = 'today';
  render(); planReminder(); updateBadge(); persistStorage();
  startCloud();
  toast('Tudo pronto! Sua meta de hoje é ' + vol(goalNow()) + ' 💧');
}

/* ---------- registros ---------- */
function quickAdd(ml, did) {
  const k = today(), d = drink(did || S.last), before = snap(), e = { id: uid(), t: Date.now(), ml: Math.round(ml), d: d.id };
  ensureDay(k).entries.push(e);
  touch(k); save(); haptic('light');
  afterChange([k], before, d.g === 'o' ? 'o' : true);
  toast('+' + vol(e.ml) + ' de ' + d.l.toLowerCase() + (d.g === 'o' ? ' ' + d.e + ' · à parte' : ' 💧'),
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
  updateBadge();
  sync(keys);
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
  const lv = levelFor(allMl());
  if (lv.i > b.lv) pop(lv.e, 'Novo nível', lv.n, big(allMl()) + ' hidratados até aqui');
  newAchievements(S).forEach((a) => { S.achievements[a.id] = Date.now(); pop(a.e, 'Nova medalha', a.t, a.d); });
  save();
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
function testNotif() {
  const st = notifStatus();
  if (st === 'default') { requestNotifPermission().then((p) => { if (p === 'granted') testNotif(); }); return; }
  if (st !== 'granted' && st !== 'native') { openSheet(notifHelpSheet(st)); return; }
  showNotification('Teste do Maré 💧', 'É assim que seus lembretes vão chegar.');
  toast('Notificação enviada. Ela aparece em instantes.');
}

/* ---------- meta e clima ---------- */
function goalChanged() {
  syncTodayGoal(); planReminder(); updateBadge(); // planReminder também salva e sincroniza
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
  const json = JSON.stringify({ app: 'mare', v: 1, exportedAt: new Date().toISOString(), data: S });
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
  return s;
}
function applyBackup(s) {
  s.reminders = S.reminders; s.ui = S.ui; s.onboarded = true; // lembretes e dicas pertencem a este aparelho
  if (tab !== 'today' && !ob) hBack();
  setS(s);
  ob = null; tab = 'today'; dropSt = null; dropSt2 = null;
  syncTodayGoal(); save(); applyTheme();
  render(); planReminder(); updateBadge();
  startCloud();
  sync(Object.keys(S.days));
  toast('Backup restaurado ✓');
}
function resetAll() {
  confirmSheet('Apagar todos os dados?', 'Registros, medalhas e ajustes deste aparelho serão removidos' +
    (cloud ? ', inclusive a cópia na nuvem' : '') + '. Não dá para desfazer.', 'Apagar tudo', true, () => {
    if (cloud && cloud.wipe) cloud.wipe().catch(() => {});
    clearTimeout(remT); scheduleNative(0); setBadge(0);
    try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
    if (tab !== 'today') hBack();
    setS(defaults()); save();
    tab = 'today'; dropSt = null; dropSt2 = null;
    startOnboarding();
  });
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
function initCloudLayer() {
  import('./firebase-config.js')
    .then((c) => (c.FIREBASE_ENABLED ? import('./firebase.js') : null))
    .then((m) => (m ? m.initCloud({ state: () => S, onRemote: mergeRemote, onStatus: (st) => { syncState = st; } }) : null))
    .then((c) => {
      if (!c) return;
      cloud = c; syncState = 'on';
      syncMeta();
      if (S.reminders.enabled && notifStatus() === 'granted' && cloud.enablePush) cloud.enablePush().then(refreshUI, () => {});
    })
    .catch((e) => { syncState = 'off'; console.warn('[nuvem] desligada:', e && e.message ? e.message : e); });
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
  save();
  if (keys.indexOf(today()) >= 0) planReminder();
  updateBadge(); refreshUI();
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
    if (n) n.textContent = drink(d.d).g === 'o' ? OTHER_NOTE : '';
  },
  'draft-ml': (el, d) => { if (dr) { dr.ml = +d.ml; $('#eMl').value = fromMl(dr.ml); press(el); } },
  'entry-save': () => saveEntry(),
  'entry-del': () => deleteEntry(),
  day: (el, d) => openDay(d.day),
  cal: (el, d) => { ym = shiftYm(ym || today().slice(0, 7), +d.n); render(true); },
  'tip-x': (el, d) => { S.ui['tip_' + d.tip] = 1; save(); refreshPart('tTips'); },
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
    if (d.k === 'others') { S.profile.others = !othersOn(); save(); render(true); return; } // a segunda gota só aparece em Hoje
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
  planReminder(); updateBadge(); refreshClimate(false);
  if (!sheetIsOpen()) render(true);
  return true;
}
function onResume() {
  pullInbox();
  if (!S.onboarded || ob) return;
  if (!checkDay()) {
    const r = S.reminders;
    if (r.enabled && r.nextAt && r.nextAt < Date.now()) planReminder(Date.now()); else armTimer();
    refreshPart('tMeta');
  }
  refreshClimate(false);
}
function handleURL() {
  const q = location.search, add = /[?&]add=(\d+)/.exec(q), t = /[?&]tab=(\w+)/.exec(q);
  if (!q) return;
  try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) { /* ignora */ }
  if (!S.onboarded) return;
  if (add) setTimeout(() => { quickAdd(clamp(+add[1], 10, 3000), 'water'); }, 500); // atalho do ícone (Android)
  else if (t) go(t[1]);
}

/* ---------- início ---------- */
function boot() {
  hooks.saveError = () => { toast('Não consegui salvar no aparelho. Libere espaço ou saia da navegação privada.'); };
  setS(load());
  applyTheme();
  onMedia('(prefers-color-scheme: dark)', () => { if (S.profile.theme === 'auto') applyTheme(); });
  const bg = $('.sheet-bg');
  if (bg) bg.style.cursor = 'pointer'; // sem isso o iOS não entrega o toque no fundo do painel ao listener do document
  curDay = today();
  syncTodayGoal();
  render();
  handleURL();
  registerSW({
    onUpdate: () => showBanner('Nova versão disponível', 'Atualizar', 'update'),
    onMessage: (m) => { if (m.type === 'inbox') pullInbox(); },
  });
  initInstall(() => { if (tab === 'today' && S.onboarded && !ob) refreshPart('tTips'); });
  pullInbox();
  if (S.onboarded) {
    const r = S.reminders;
    if (r.enabled && (!r.nextAt || r.nextAt < Date.now())) planReminder(Date.now());
    else { armTimer(); const m = reminderText(); scheduleNative(r.enabled ? r.nextAt : 0, m.title, m.body); }
    updateBadge(); refreshClimate(false); persistStorage();
  }
  startCloud();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onResume(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) onResume(); });
  setInterval(() => { // o ritmo muda com o relógio, mesmo sem novos registros
    if (document.visibilityState === 'visible' && S.onboarded && !ob && !checkDay() && tab === 'today') refreshPart('tMeta');
  }, 60000);
}
boot();
