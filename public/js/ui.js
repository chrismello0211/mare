// Maré — base da interface (Parte 3A): ícones, avisos, painel inferior, botão voltar,
// animações, efeitos e a gota líquida. Não conhece as telas: só oferece peças.
import { reducedMotion, haptic } from './platform.js';
import { esc, clamp } from './store.js';

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

/* ---------- ícones (traço, 24×24) ---------- */
const ICON = {
  today: '<path d="M12 3.5C8.8 7.6 6 11 6 14.2a6 6 0 0 0 12 0C18 11 15.2 7.6 12 3.5z"/>',
  history: '<path d="M4 20h16M7 16v-5M12 16V6M17 16v-8"/>',
  journey: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6l-1-3h-4z"/>',
  friends: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.4 19.5a5.6 5.6 0 0 1 11.2 0"/><path d="M15.4 5.7a3 3 0 0 1 0 5.7M17.6 14.3a5.2 5.2 0 0 1 3.1 5.2"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
};
export const svgI = (n, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>';

/* ---------- animação ---------- */
// step(k) recebe 0→1 com easing; retornar false cancela.
export function tween(ms, step) {
  const t0 = Date.now();
  (function frame() {
    const x = Math.min(1, (Date.now() - t0) / ms);
    if (step(1 - Math.pow(1 - x, 3)) === false || x >= 1) return;
    requestAnimationFrame(frame);
  })();
}
// Elementos com data-w="60" (e data-p="height" opcional) crescem até o valor via transição do CSS.
export function animBars(root) {
  const els = $$('[data-w]', root);
  if (!els.length) return;
  const set = () => els.forEach((el) => { el.style[el.getAttribute('data-p') || 'width'] = el.getAttribute('data-w') + '%'; });
  if (reducedMotion()) { set(); return; }
  void root.offsetWidth; // força o layout para a transição partir do valor inicial
  requestAnimationFrame(set);
}

/* ---------- botão voltar (Android) e histórico ---------- */
// Painéis e abas empilham entradas no histórico; o "voltar" do sistema fecha o painel ou volta para Hoje.
// Voltas programáticas são agrupadas num único history.go(-n), e pushes durante uma volta ficam na fila.
let silent = 0, queued = 0, pending = 0, popFn = null;
export const onBack = (fn) => { popFn = fn; };
export function hPush() {
  if (silent || pending) queued++;
  else history.pushState({ mare: 1 }, '');
}
export function hBack(n) {
  if (!pending) setTimeout(flushBack, 0);
  pending += n || 1;
}
function flushQueued() { while (queued > 0) { queued--; history.pushState({ mare: 1 }, ''); } }
function flushBack() {
  let n = pending;
  pending = 0;
  const c = Math.min(queued, n); // um push e uma volta no mesmo instante se anulam
  queued -= c; n -= c;
  if (n > 0) { silent++; history.go(-n); } else if (!silent) flushQueued();
}
window.addEventListener('popstate', () => {
  if (silent) { silent--; if (!silent) flushQueued(); return; }
  if (sheetOpen) { closeSheet(true); return; }
  if (popFn) popFn();
});

/* ---------- avisos ---------- */
const toastEl = $('#toast');
let toastT = 0, toastFn = null;
// html é conteúdo confiável (montado pelo app); textos do usuário devem passar por esc().
export function toast(html, act) {
  clearTimeout(toastT);
  toastFn = act ? act.fn : null;
  const shown = toastEl.classList.contains('show');
  toastEl.innerHTML = '<div class="toast-in' + (act ? ' act' : '') + '"><span>' + html + '</span>' +
    (act ? '<button type="button" data-action="toast-act">' + esc(act.label) + '</button>' : '') + '</div>';
  if (!shown) { void toastEl.offsetWidth; toastEl.classList.add('show'); }
  toastT = setTimeout(hideToast, act ? 5200 : 3400);
}
export function hideToast() { clearTimeout(toastT); toastEl.classList.remove('show'); toastFn = null; }
export function runToastAction() { const f = toastFn; hideToast(); if (f) f(); }

export function showBanner(text, label, action) {
  if ($('.banner')) return;
  const b = document.createElement('div');
  b.className = 'banner';
  b.innerHTML = '<div class="banner-in" role="status">' + esc(text) +
    '<button class="btn sm" type="button" data-action="' + action + '">' + esc(label) + '</button></div>';
  document.body.appendChild(b);
}

// Região invisível para leitores de tela (o #fx é aria-hidden)
const live = document.createElement('div');
live.className = 'sr';
live.setAttribute('aria-live', 'polite');
document.body.appendChild(live);
export function announce(t) { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 60); }

/* ---------- painel inferior ---------- */
const sheet = $('#sheet'), panel = $('.sheet-panel');
export const sheetBody = $('#sheetBody');
let sheetOpen = false, lastFocus = null, lockY = 0, confirmFn = null;
export const sheetIsOpen = () => sheetOpen;
export const sheetHead = (title) => '<div class="sheet-head"><h2 id="sheetTitle" tabindex="-1" style="outline:none">' + title +
  '</h2><button class="btn-x" type="button" data-action="close-sheet" aria-label="Fechar">' + svgI('close') + '</button></div>';

// Se já estiver aberto, só troca o conteúdo (sem nova entrada no histórico).
export function openSheet(html) {
  sheetBody.innerHTML = html;
  panel.scrollTop = 0;
  if (!sheetOpen) {
    sheetOpen = true;
    lastFocus = document.activeElement;
    lockY = window.pageYOffset || 0;
    document.body.style.top = -lockY + 'px'; // trava o fundo sem pular a rolagem (iOS)
    document.body.classList.add('lock');
    sheet.hidden = false;
    void sheet.offsetWidth;
    sheet.classList.add('open');
    hPush();
  }
  // Foco no título (acessível) e não no campo, para o teclado não cobrir o painel.
  const t = $('#sheetTitle');
  if (t) { try { t.focus({ preventScroll: true }); } catch (e) { /* navegador antigo */ } }
}
const closeFns = [];
export const onSheetClose = (fn) => { closeFns.push(fn); }; // avisado sempre que o painel fecha (botão, fundo, Esc, arrastar ou "voltar")
export function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheetOpen = false;
  confirmFn = null;
  closeFns.forEach((fn) => { try { fn(); } catch (e) { /* um gancho com erro não pode travar o fechamento */ } });
  sheet.classList.remove('open');
  document.body.classList.remove('lock');
  document.body.style.top = '';
  window.scrollTo(0, lockY);
  setTimeout(() => { if (!sheetOpen) { sheet.hidden = true; sheetBody.innerHTML = ''; } }, 340);
  if (lastFocus && lastFocus !== document.body && lastFocus.focus && document.body.contains(lastFocus)) {
    try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
  }
  if (!fromPop) hBack();
}
export function confirmSheet(title, text, okLabel, danger, fn) {
  openSheet(sheetHead(title) + '<p class="sheet-text">' + text + '</p><div class="btns">' +
    '<button class="btn ghost" type="button" data-action="close-sheet">Cancelar</button>' +
    '<button class="btn' + (danger ? ' danger' : '') + '" type="button" data-action="confirm-ok">' + okLabel + '</button></div>');
  confirmFn = fn;
}
export function runConfirm() { const f = confirmFn; confirmFn = null; closeSheet(); if (f) f(); }

// Esc fecha; Tab fica preso dentro do painel
document.addEventListener('keydown', (e) => {
  if (!sheetOpen) return;
  if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const f = $$('button:not([disabled]), input:not([type="file"]), select, textarea', panel).filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Arrastar para baixo fecha (quando o conteúdo está no topo)
let drag = null;
panel.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1 || panel.scrollTop > 0) { drag = null; return; }
  drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, dy: 0, t0: Date.now(), on: false };
}, { passive: true });
panel.addEventListener('touchmove', (e) => {
  if (!drag) return;
  const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y;
  if (!drag.on) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (dy < 0 || Math.abs(dx) > Math.abs(dy) || panel.scrollTop > 0) { drag = null; return; }
    drag.on = true;
    panel.style.transition = 'none';
  }
  drag.dy = Math.max(0, dy);
  panel.style.transform = 'translateY(' + drag.dy + 'px)';
  if (e.cancelable) e.preventDefault();
}, { passive: false });
function dragEnd() {
  const d = drag;
  drag = null;
  if (!d || !d.on) return;
  panel.style.transition = '';
  panel.style.transform = '';
  if (d.dy > 120 || d.dy / Math.max(1, Date.now() - d.t0) > 0.6) closeSheet();
}
panel.addEventListener('touchend', dragEnd);
panel.addEventListener('touchcancel', dragEnd);

/* ---------- efeitos ---------- */
const fx = $('#fx');
// Gota que cai do topo da gota grande até a superfície da água (yv em coordenadas do viewBox)
export function splash(el, yv) {
  if (reducedMotion() || !el) return;
  const r = el.getBoundingClientRect();
  if (r.bottom < 80 || r.top > window.innerHeight - 80) return; // gota fora da tela: sem efeito
  const s = r.height / 240, x = r.left + r.width / 2, y0 = r.top - 30, y1 = r.top + clamp(yv, 24, 226) * s;
  const d = document.createElement('div');
  d.className = 'fx-drop';
  d.style.left = x + 'px';
  d.style.top = y0 + 'px';
  fx.appendChild(d);
  void d.offsetWidth;
  d.style.transform = 'translateY(' + (y1 - y0 - 7) + 'px)';
  setTimeout(() => {
    d.remove();
    const ring = document.createElement('div');
    ring.className = 'fx-ring';
    ring.style.left = x + 'px';
    ring.style.top = y1 + 'px';
    fx.appendChild(ring);
    setTimeout(() => { ring.remove(); }, 650);
  }, 430);
}
export function confetti() {
  if (reducedMotion()) return;
  const C = ['#6CCBFF', '#1A7FE8', '#34D399', '#F5B556', '#FF7EB6', '#B794F4'];
  let h = '';
  for (let i = 0; i < 64; i++) {
    h += '<i class="cf' + (i % 3 === 1 ? ' cf1' : i % 3 === 2 ? ' cf2' : '') + '" style="left:' + (Math.random() * 100).toFixed(1) +
      '%;background:' + C[i % C.length] + ';animation-delay:' + (Math.random() * 0.5).toFixed(2) +
      's;animation-duration:' + (1.9 + Math.random()).toFixed(2) + 's"></i>';
  }
  const box = document.createElement('div');
  box.className = 'cf-box';
  box.innerHTML = h;
  fx.appendChild(box);
  setTimeout(() => { box.remove(); }, 3800);
}
// Emoji que sobe e some a partir de um elemento (aceno enviado a um amigo)
export function floatEmoji(el, emoji) {
  if (reducedMotion() || !el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const e = document.createElement('div');
  e.className = 'fx-emoji';
  e.textContent = emoji;
  e.style.left = (r.left + r.width / 2) + 'px';
  e.style.top = (r.top + r.height / 2) + 'px';
  fx.appendChild(e);
  setTimeout(() => { e.remove(); }, 1000);
}
// Cartão central de conquista (medalha, missão, nível). Fila: um de cada vez.
const pops = [];
let popping = false;
export const popBusy = () => popping || pops.length > 0; // há um cartão de conquista na tela ou na fila
export function pop(e, kind, title, sub) {
  pops.push([e, kind, title, sub]);
  if (!popping) nextPop();
}
function nextPop() {
  const p = pops.shift();
  if (!p) { popping = false; return; }
  popping = true;
  haptic('success');
  announce(p[1] + ': ' + p[2]);
  const el = document.createElement('div');
  el.className = 'medal-pop';
  el.innerHTML = '<div class="mp-in"><span class="mp-e">' + p[0] + '</span><span class="mp-k">' + esc(p[1]) +
    '</span><b>' + esc(p[2]) + '</b><small>' + esc(p[3]) + '</small></div>';
  fx.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => { el.remove(); nextPop(); }, 360);
  }, reducedMotion() ? 1800 : 2400);
}

/* ---------- a gota líquida ---------- */
// viewBox 200×240. Ondas: caminhos longos que deslizam na horizontal (SMIL, nativo e leve).
// O nível sobe/desce trocando o transform dos grupos .lv. O texto branco é recortado pela
// mesma onda, então o número fica branco exatamente onde a água passa.
const DROP = 'M100 6C82 34 18 92 18 150A82 82 0 0 0 182 150C182 92 118 34 100 6Z';
function wave(amp, half) {
  let x = -240, d = 'M-240 0Q' + (x + half / 2) + ' ' + -amp + ' ' + (x + half) + ' 0';
  for (x += half; x < 460; x += half) d += 'T' + (x + half) + ' 0';
  return d + 'V320H-240Z';
}
const W1 = wave(5, 50), W2 = wave(6, 60);
const BUBBLES = [[72, 3, 3.4, 0], [118, 2.2, 2.8, 1.1], [96, 2.6, 4.1, 2]].map((b) =>
  '<circle class="bub" cx="' + b[0] + '" cy="74" r="' + b[1] + '" opacity="0">' +
  '<animate attributeName="cy" values="74;8" dur="' + b[2] + 's" begin="' + b[3] + 's" repeatCount="indefinite"/>' +
  '<animate attributeName="opacity" values="0;.9;0" dur="' + b[2] + 's" begin="' + b[3] + 's" repeatCount="indefinite"/></circle>').join('');

export const levelY = (p) => 238 - clamp(p, 0, 1) * 236;

// id: prefixo único por gota na página. txt: { pct, num, sub, label }
export function dropSVG(id, txt) {
  const a = !reducedMotion();
  const mv = (dx, s) => (a ? '<animateTransform attributeName="transform" type="translate" from="0 0" to="' + dx + ' 0" dur="' + s + 's" repeatCount="indefinite"/>' : '');
  const lv = '<g class="lv" transform="translate(0 238)">';
  const texts = (w) =>
    '<text class="t-pct' + w + '" x="100" y="122" text-anchor="middle">' + esc(txt.pct) + '</text>' +
    '<text class="t-num' + w + '" x="100" y="168" text-anchor="middle">' + esc(txt.num) + '</text>' +
    '<text class="t-sub' + w + '" x="100" y="192" text-anchor="middle">' + esc(txt.sub) + '</text>';
  return '<svg viewBox="0 0 200 240" role="img" aria-label="' + esc(txt.label || '') + '"><defs>' +
    '<clipPath id="' + id + 'C"><path d="' + DROP + '"/></clipPath>' +
    // máscara (e não clipPath): clipPath só aceita formas, e o <g class="lv"> que sobe/desce com a água o invalidava
    '<mask id="' + id + 'W" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="240">' + lv + '<path fill="#fff" d="' + W1 + '">' + mv(-100, 3.6) + '</path></g></mask>' +
    '<linearGradient id="' + id + 'G" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st1"/><stop offset="1" class="st2"/></linearGradient>' +
    '</defs><path class="d-bg" d="' + DROP + '"/>' + texts('') +
    '<g clip-path="url(#' + id + 'C)">' +
      lv + '<g transform="translate(0 -5)"><path class="w-back" d="' + W2 + '">' + mv(120, 5.2) + '</path></g></g>' +
      lv + '<path fill="url(#' + id + 'G)" d="' + W1 + '">' + mv(-100, 3.6) + '</path>' + (a ? BUBBLES : '') + '</g>' +
    '</g><g mask="url(#' + id + 'W)">' + texts(' w') + '</g>' +
    '<path class="shine" d="M46 128A60 60 0 0 1 66 96"/><path class="d-line" d="' + DROP + '"/></svg>';
}

// Sobe/desce a água e conta o número junto. Chamadas seguidas cancelam a anterior sem "pulo".
// o: { fmt(n)→texto, sub, label, keepText, instant, ms }
export function dropTo(el, total, goal, o) {
  if (!el) return;
  o = o || {};
  const s = el._st || (el._st = { y: 238, n: 0, tok: 0 });
  const y0 = s.y, n0 = s.n, y1 = levelY(goal ? total / goal : 0), tok = ++s.tok;
  const lv = $$('.lv', el), nums = $$('.t-num', el), pcts = $$('.t-pct', el);
  if (!o.keepText) {
    $$('.t-sub', el).forEach((t) => { t.textContent = o.sub || ''; });
    const svg = $('svg', el);
    if (svg && o.label) svg.setAttribute('aria-label', o.label);
  }
  const paint = (y, n) => {
    s.y = y; s.n = n;
    const tr = 'translate(0 ' + y.toFixed(2) + ')';
    lv.forEach((g) => { g.setAttribute('transform', tr); });
    if (o.keepText) return;
    const v = o.fmt ? o.fmt(n) : String(Math.round(n)), pc = Math.round((n / (goal || 1)) * 100) + '%';
    nums.forEach((t) => { t.textContent = v; t.style.fontSize = v.length > 5 ? '38px' : ''; });
    pcts.forEach((t) => { t.textContent = pc; });
  };
  if (reducedMotion() || o.instant || (Math.abs(y0 - y1) < 0.01 && n0 === total)) { paint(y1, total); return; }
  tween(o.ms || 1100, (k) => {
    if (s.tok !== tok) return false;
    paint(y0 + (y1 - y0) * k, n0 + (total - n0) * k);
  });
}
