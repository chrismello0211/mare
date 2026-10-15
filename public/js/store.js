// Maré — estado e utilidades compartilhadas (Parte 3A).
// O app.js foi dividido em store.js, ui.js, views.js e app.js (mesma lógica, arquivos menores).
import { dayKey, keyToDate, addDays, goalToday, dayTotal, dayWater, dayOther, setMix, defaults, migrate, OZ, fmtVol, fmtNum, fmtL } from './core.js';

export const KEY = 'mare:v1';
// Estado vivo. "export let" é live binding: quem importa S sempre enxerga o valor atual.
export let S = defaults();
export function setS(v) { S = v; applyMix(); }
// "Somar outros líquidos na meta" só vale com a segunda gota ligada: com ela desligada, os registros desse tipo ficam escondidos
// e não podem entrar na conta. Chame depois de mudar S.profile.mix ou S.profile.others.
export function applyMix() { setMix(S.profile.others !== false && S.profile.mix === true); }
export const hooks = { saveError: null };

export function load() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return defaults(); }
}
let warned = false;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) {
    if (!warned && hooks.saveError) { warned = true; hooks.saveError(e); }
    return false;
  }
}

/* ---------- texto e números ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Aceita "72,5" e "72.5" (teclados pt-BR mandam vírgula)
export const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : NaN; };
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
export const byT = (a, b) => a.t - b.t;
export const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
export const p2 = (n) => (n < 10 ? '0' : '') + n;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- datas ---------- */
export const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const today = () => dayKey();
export const longDate = (k) => { const d = keyToDate(k); return WD[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]; };
export const shortDate = (ms) => { const d = new Date(ms); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); };
export const relDay = (k) => (k === today() ? 'hoje' : k === addDays(today(), -1) ? 'ontem' : longDate(k));
export const shiftYm = (ym, n) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1);
};

/* ---------- dia e meta ---------- */
export const goalNow = () => goalToday(S, today());
export const totalNow = () => dayTotal(S.days[today()]); // o que conta na meta: água (+ outros líquidos, se "somar na meta")
export const otherNow = () => dayOther(S.days[today()]); // outros líquidos de hoje (a 2ª gota mostra tudo o que foi registrado)
export const othersOn = () => S.profile.others !== false; // a pessoa pode esconder a segunda gota em Ajustes
export function ensureDay(k) {
  if (!S.days[k]) S.days[k] = { goal: goalToday(S, k), entries: [] };
  if (!Array.isArray(S.days[k].entries)) S.days[k].entries = [];
  return S.days[k];
}
// A meta fica gravada em cada dia; só o dia de hoje acompanha mudanças nos ajustes.
export function syncTodayGoal() { const k = today(); if (S.days[k]) S.days[k].goal = goalToday(S, k); }
// Litros de ÁGUA de todos os dias (níveis e "L de água"): não mudam com "somar na meta"
export function allMl() { let s = 0; Object.keys(S.days).forEach((k) => { s += dayWater(S.days[k]); }); return s; }
export const firstName = () => esc(String(S.profile.name || '').trim().split(/\s+/)[0]);

/* ---------- unidades (dados sempre em ml; só a exibição muda) ---------- */
export const U = () => S.profile.unit;
export const vol = (ml) => fmtVol(ml, U());
export const unitL = () => (U() === 'oz' ? 'oz' : 'ml');
export const toMl = (v) => Math.round(U() === 'oz' ? v * OZ : v);
export const fromMl = (ml) => Math.round(U() === 'oz' ? ml / OZ : ml);
export const big = (ml) => (U() === 'oz' ? vol(ml) : fmtL(ml));
export const compact = (ml) => (U() === 'oz' ? fmtNum(ml, 'oz') : (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
export const presets = () => (U() === 'oz'
  ? [4, 6, 8, 10, 12, 16, 20, 24, 32].map((o) => Math.round(o * OZ))
  : [100, 150, 200, 250, 300, 350, 400, 500, 600, 750, 1000]);
