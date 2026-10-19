// Maré — peças de HTML comuns às telas (botões, linhas de ajustes, interruptores, cartões vazios). Só montam texto: não conhecem o estado.
// Usadas por views.js (telas do dia a dia) e friends-view.js (amigos). Conteúdo recebido já deve estar escapado (esc) quando vem do usuário.
import { svgI } from './ui.js';

export const att = (b) => (b ? 'true' : 'false');
export const btn = (action, label, cls, extra) => '<button class="btn' + (cls ? ' ' + cls : '') + '" type="button" data-action="' + action + '"' +
  (extra || '') + '>' + label + '</button>';
export const sbtn = (action, label, cls) => '<button class="btn sm ' + (cls || 'ghost') + '" type="button" data-action="' + action + '">' + label + '</button>';
export const sec = (t) => '<h2 class="sec-t">' + t + '</h2>';
export const row = (label, note, ctrl, noteId) => '<div class="row"><div class="row-l"><span>' + label + '</span>' +
  (note || noteId ? '<small' + (noteId ? ' id="' + noteId + '"' : '') + '>' + (note || '') + '</small>' : '') +
  '</div><div class="row-c">' + ctrl + '</div></div>';
export const stack = (label, note, ctrl) => '<div class="row stack"><div class="row-l"><span>' + label + '</span>' +
  (note ? '<small>' + note + '</small>' : '') + '</div><div class="row-c">' + ctrl + '</div></div>';
export const sw = (action, on, label, extra) => '<button class="switch" type="button" role="switch" aria-checked="' + att(on) +
  '" aria-label="' + label + '" data-action="' + action + '"' + (extra || '') + '><span></span></button>';
export const seg = (action, cur, opts, label) => '<div class="seg" role="radiogroup" aria-label="' + label + '">' + opts.map((o) =>
  '<button type="button" role="radio" aria-checked="' + att(String(o[0]) === String(cur)) + '" data-action="' + action +
  '" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
export const empty = (e, t) => '<div class="empty"><span class="em" aria-hidden="true">' + e + '</span>' + t + '</div>';
export const stat = (e, l, v) => '<div class="stat"><span class="em" aria-hidden="true">' + e + '</span><small>' + l + '</small><b>' + v + '</b></div>';
export const tip = (id, e, title, text, b) => '<section class="card tip"><span class="em" aria-hidden="true">' + e + '</span><div class="tip-b"><b>' +
  title + '</b><p>' + text + '</p>' + (b ? btn(b[0], b[1], 'sm', b[2]) : '') + '</div><button class="tip-x" type="button" data-action="tip-x" data-tip="' +
  id + '" aria-label="Dispensar dica">×</button></section>';
export const steps = (list) => '<ol class="steps">' + list.map((s) => '<li>' + s + '</li>').join('') + '</ol>';
export const shareIco = () => svgI('share', 'ico-share');
