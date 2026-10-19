// Desenho dos bichinhos das insígnias, no quadro 100×100. Rode "npm run art" para gerar public/js/art.js.
// Estilo: formas redondas, duas cores chapadas por bicho, olhos grandes, bochechas e sorriso.
// Regras (para funcionar igual em qualquer navegador, inclusive iOS 12): só <path>, <circle>, <ellipse>, <polygon> e <g>;
// nada de id, <use>, <defs>, gradiente ou clip-path. O "medalhão" (fundo, anel e brilho) é feito em CSS (.bdg).
// Classes que o CSS usa: cr = o desenho todo; fc = o rostinho; hl = brilho; bb = bolhinhas.
// No estado "bloqueado" o CSS pinta tudo de cinza-azulado (silhueta) e esconde fc, hl e bb. Nos tamanhos pequenos esconde bb.
import { tube, part } from './tube.mjs';

const f = (n) => Math.round(n * 10) / 10;
const INK = '#23324B', BLUSH = '#FF8DA1';
const eye = (x, y, r) => { r = r || 1; return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(2.7 * r)}" ry="${f(3.3 * r)}" fill="${INK}"/><circle cx="${f(x + 0.9 * r)}" cy="${f(y - 1.2 * r)}" r="${f(1.05 * r)}" fill="#fff"/>`; };
const cheek = (x, y, r) => { r = r || 1; return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(3.4 * r)}" ry="${f(2.1 * r)}" fill="${BLUSH}" opacity=".6"/>`; };
const smile = (x, y, w, r) => { w = w || 5; r = r || 1; return `<path d="M${f(x - w / 2)} ${f(y)}Q${f(x)} ${f(y + w * 0.6)} ${f(x + w / 2)} ${f(y)}" fill="none" stroke="${INK}" stroke-width="${f(1.6 * r)}" stroke-linecap="round"/>`; };
// rostinho de frente: dois olhos, duas bochechas e um sorriso
const front = (x, y, gap, s) => { gap = gap || 14; s = s || 1; return `<g class="fc">` + eye(x - gap / 2, y, s) + eye(x + gap / 2, y, s) + cheek(x - gap / 2 - 5 * s, y + 5.2 * s, s) + cheek(x + gap / 2 + 5 * s, y + 5.2 * s, s) + smile(x, y + 4.6 * s, 5 * s, s) + `</g>`; };
const hl = (d, o) => `<path class="hl" d="${d}" fill="#fff" opacity="${o || 0.4}"/>`;
const poly = (cx, cy, rs, a0) => rs.map((r, i) => { const a = (a0 + (i * 360) / rs.length) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
// bolhinhas decorativas
const bub = (list) => list.map((b) => `<circle class="bb" cx="${b[0]}" cy="${b[1]}" r="${b[2]}" fill="#fff" opacity=".7"/><circle class="bb" cx="${f(b[0] - b[2] * 0.3)}" cy="${f(b[1] - b[2] * 0.3)}" r="${f(b[2] * 0.28)}" fill="#fff"/>`).join('');
// barbatana de cauda (duas pontas), ancorada no começo da linha-guia; dorsal e peitoral dependem da meia-largura w do corpo
const FLUKES = () => 'M2 0C0 -5 -3 -11 -10 -15C-9 -9 -8 -4 -5 0C-8 4 -9 9 -10 15C-3 11 0 5 2 0Z';

export const C = {};

/* 1 — Concha (vieira) · 0 L */
C.concha = () => {
  const R = 40, cx = 50, cy = 78, n = 7, a0 = -170, a1 = -10;
  const P = [], Cc = [];
  for (let k = 0; k <= n; k++) { const a = (a0 + (k * (a1 - a0)) / n) * Math.PI / 180; P.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  for (let k = 0; k < n; k++) { const a = (a0 + ((k + 0.5) * (a1 - a0)) / n) * Math.PI / 180; Cc.push([cx + (R + 9) * Math.cos(a), cy + (R + 9) * Math.sin(a)]); }
  let d = `M${cx} ${cy}L${f(P[0][0])} ${f(P[0][1])}`;
  for (let k = 0; k < n; k++) d += `Q${f(Cc[k][0])} ${f(Cc[k][1])} ${f(P[k + 1][0])} ${f(P[k + 1][1])}`;
  d += 'Z';
  let ridges = '';
  for (let k = 1; k < n; k++) { const a = (a0 + (k * (a1 - a0)) / n) * Math.PI / 180; ridges += `M${cx} ${cy - 2}L${f(cx + (R + 1) * Math.cos(a))} ${f(cy + (R + 1) * Math.sin(a))}`; }
  return `<g class="cr"><path d="M30 80Q32 71 40 72L60 72Q68 71 70 80Q71 88 60 88L40 88Q29 88 30 80Z" fill="#F08F7C"/>` +
    `<path d="${d}" fill="#FFB9A8"/><path d="${ridges}" fill="none" stroke="#F4917F" stroke-width="2" stroke-linecap="round" opacity=".55"/>` +
    hl('M26 52Q32 36 46 31Q36 40 33 56Z', 0.5) +
    `<circle cx="50" cy="78" r="5" fill="#F4917F"/>` + front(50, 56, 17, 1.28) + `</g>`;
};

/* 2 — Estrela-do-mar · 10 L */
C.estrela = () => {
  const pts = (cx, cy) => poly(cx, cy, [37, 18, 37, 18, 37, 18, 37, 18, 37, 18], -98).map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
  const dots = [];
  for (let k = 0; k < 5; k++) { const a = (-98 + k * 72) * Math.PI / 180; [0.5, 0.72].forEach((t, j) => dots.push(`<circle cx="${f(50 + 37 * t * Math.cos(a))}" cy="${f(55 + 37 * t * Math.sin(a))}" r="${j ? 1.4 : 2}" fill="#FFD7B0"/>`)); }
  return `<g class="cr"><polygon points="${pts(50, 58)}" fill="#F58A4B" stroke="#F58A4B" stroke-width="9" stroke-linejoin="round"/>` +
    `<polygon points="${pts(50, 55)}" fill="#FFA96B" stroke="#FFA96B" stroke-width="9" stroke-linejoin="round"/>` + dots.join('') + front(50, 56, 12, 0.95) + `</g>`;
};

/* 3 — Baiacu · 30 L */
C.baiacu = () => {
  let sp = '';
  for (let k = 0; k < 16; k++) {
    const a = (k * 360) / 16 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = 50, cy = 54, rx = 31, ry = 29;
    const bx = cx + rx * ca, by = cy + ry * sa, tx = cx + (rx + 8) * ca, ty = cy + (ry + 8) * sa, px = -sa * 3.6, py = ca * 3.6;
    sp += `M${f(bx + px)} ${f(by + py)}L${f(tx)} ${f(ty)}L${f(bx - px)} ${f(by - py)}Z`;
  }
  return `<g class="cr"><path d="M80 66L94 60Q96 72 88 80Q80 78 78 72Z" fill="#F2A93B"/><path d="${sp}" fill="#F2A93B"/>` +
    `<ellipse cx="50" cy="54" rx="31" ry="29" fill="#FFD76A"/>` +
    `<path d="M22 60Q26 82 50 83Q74 82 78 60Q70 76 50 76Q30 76 22 60Z" fill="#FFF0BE"/>` +
    `<ellipse cx="20" cy="58" rx="5.5" ry="8" fill="#F2A93B" transform="rotate(25 20 58)"/><ellipse cx="80" cy="58" rx="5.5" ry="8" fill="#F2A93B" transform="rotate(-25 80 58)"/>` +
    `<circle cx="41" cy="31" r="2.3" fill="#F2A93B"/><circle cx="52" cy="28.5" r="2.7" fill="#F2A93B"/><circle cx="62" cy="32" r="2.1" fill="#F2A93B"/>` +
    hl('M26 46Q28 34 38 28Q32 38 33 50Z', 0.5) +
    `<g class="fc">` + eye(39, 50, 1.25) + eye(61, 50, 1.25) + cheek(30, 59, 1.1) + cheek(70, 59, 1.1) + `<ellipse cx="50" cy="61" rx="2.6" ry="3" fill="#E36A5D"/></g></g>`;
};

/* 4 — Tartaruga-marinha · 60 L */
C.tartaruga = () => `<g class="cr">` + bub([[22, 29, 3.2], [30, 20, 1.9], [75, 27, 2.5]]) +
  `<g transform="translate(51 53) scale(.88) translate(-51 -53)">` +
  `<path d="M12 64L4 69Q10 72 17 69Z" fill="#7FD3A4"/>` +
  `<ellipse cx="30" cy="73" rx="10" ry="5" fill="#7FD3A4" transform="rotate(18 30 73)"/>` +
  `<ellipse cx="82" cy="60" rx="12" ry="9" fill="#9BE3B9"/><circle cx="87" cy="51" r="11.5" fill="#9BE3B9"/>` +
  `<path d="M16 64C16 40 34 26 54 27C73 28 85 43 85 64Z" fill="#4FBF86"/>` +
  `<path d="M16 64C16 58 18 52 22 47C22 56 30 62 40 64Z" fill="#3FA774" opacity=".5"/>` +
  `<path d="M42 40L54 34L66 40L66 52L54 58L42 52Z" fill="none" stroke="#2E9A68" stroke-width="2" stroke-linejoin="round" opacity=".85"/>` +
  `<path d="M42 40L30 38M42 52L28 56M54 58L54 64M66 52L78 56M66 40L76 36M54 34L54 28" fill="none" stroke="#2E9A68" stroke-width="2" stroke-linecap="round" opacity=".85"/>` +
  hl('M24 50Q28 38 40 32Q32 40 30 52Z', 0.4) +
  `<path d="M14 64H86Q87 72 79 73H21Q13 72 14 64Z" fill="#F3DDA1"/>` +
  `<ellipse cx="70" cy="73" rx="12" ry="5.2" fill="#7FD3A4" transform="rotate(-22 70 73)"/>` +
  `<g class="fc">` + eye(90, 50, 0.95) + cheek(88, 58, 0.9) + smile(95, 57, 4.4, 0.9) + `</g></g></g>`;

/* 5 — Cavalo-marinho · 100 L (a insígnia do exemplo do Chris) */
C.cavalo = () => {
  const COL = '#FFB347', DARK = '#F08A24', LIGHT = '#FFE3A8';
  // cauda: espiral que sai da barriga, desce pelas costas, passa por baixo e enrola para a frente
  const cx = 51, cy = 79, tail = [];
  [[-90, 13], [-130, 12.6], [-175, 12], [-220, 11], [-265, 9.8], [-310, 8.4], [-355, 7], [-395, 5.8], [-430, 4.8]].forEach((a) => {
    const t = a[0] * Math.PI / 180; tail.push([cx + a[1] * Math.cos(t), cy + a[1] * Math.sin(t)]);
  });
  const body = [[54, 31], [49, 41], [49, 51], [54, 60], [51, 66]];
  const bprof = [[0, 15], [0.3, 19], [0.6, 31], [0.85, 26], [1, 13]];
  const bodyT = tube(body, bprof, 18);
  const tailT = tube(tail, [[0, 13], [0.2, 12], [0.5, 9], [0.8, 5.8], [1, 3.4]], 28);
  const snout = tube([[60, 25], [68, 27], [76, 31]], [[0, 12], [0.5, 9.6], [1, 7.4]], 8);
  const fin = 'M39 50C28 45 22 53 25 62C27 68 33 70 40 67C35 62 35 55 39 50Z';
  const finLines = 'M37 53C31 53 28 57 28 61M38 58C33 59 31 62 31.5 65';
  return `<g class="cr">` + bub([[21, 31, 4], [30, 19, 2.4], [81, 60, 4.2], [75, 74, 2.6], [86, 44, 2.2]]) +
    `<g transform="translate(50 50) scale(.97) translate(-50 -50)">` +
    `<path d="${fin}" fill="${LIGHT}"/><path d="${finLines}" fill="none" stroke="${DARK}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>` +
    `<path d="${tailT}" fill="${COL}"/><path d="${bodyT}" fill="${COL}"/>` +
    `<circle cx="56" cy="25" r="12.5" fill="${COL}"/><path d="${snout}" fill="${COL}"/>` +
    `<ellipse cx="59" cy="55.5" rx="7.4" ry="12.5" fill="${LIGHT}" transform="rotate(-6 59 55.5)"/>` +
    `<path d="M53.5 48.5Q59 50.5 64 48.5M52.8 54.5Q59 56.8 65.2 54.5M53.6 60.5Q59 62.5 64 60.5" fill="none" stroke="${DARK}" stroke-width="1.5" stroke-linecap="round" opacity=".38"/>` +
    `<path d="M47 17C45 9 50 8 52 11C52 5 57 5 58 10C61 5 66 8 64 14C60 13 57 15 55 18Z" fill="${DARK}"/>` +
    hl('M46 26Q47 17 55 15Q49 20 50 29Z', 0.5) +
    `<g class="fc">` + eye(58.5, 25, 1.1) + cheek(62, 32, 0.95) + smile(70, 31, 4.4, 0.9) + `</g></g></g>`;
};

/* 6 — Polvo · 175 L */
C.polvo = () => {
  const COL = '#B98CF2', DARK = '#9768DD', LIGHT = '#E2CCFF';
  const L = [
    [[31, 50], [22, 61], [16, 74], [20, 84], [28, 83]],
    [[39, 54], [34, 69], [31, 83], [37, 90], [43, 86]],
    [[46, 56], [45, 71], [43, 85], [48, 91]],
  ];
  const mir = (s) => s.map((p) => [100 - p[0], p[1]]);
  const prof = [[0, 12], [0.45, 8.6], [1, 3.6]];
  let t = '';
  [...L, ...L.map(mir)].forEach((s) => { t += `<path d="${tube(s, prof, 16)}" fill="${COL}"/>`; });
  const dots = [[19.5, 78], [22, 83.5], [34, 86.5], [39, 88.6], [80.5, 78], [78, 83.5], [66, 86.5], [61, 88.6]]
    .map((d) => `<circle cx="${d[0]}" cy="${d[1]}" r="1.5" fill="${LIGHT}" opacity=".85"/>`).join('');
  return `<g class="cr"><g transform="translate(50 52) scale(.95) translate(-50 -52)">` + t + dots +
    `<path d="M24 44C24 21 36 11 50 11C64 11 76 21 76 44C76 53 68 58 50 58C32 58 24 53 24 44Z" fill="${COL}"/>` +
    `<path d="M26 47C30 55 40 58 50 58C60 58 70 55 74 47C70 53 62 54 50 54C38 54 30 53 26 47Z" fill="${DARK}" opacity=".45"/>` +
    hl('M30 36Q31 22 44 16Q36 24 36 40Z', 0.5) +
    `<circle cx="64" cy="24" r="2.2" fill="${LIGHT}" opacity=".8"/><circle cx="70" cy="31" r="1.5" fill="${LIGHT}" opacity=".8"/>` +
    front(50, 38, 20, 1.2) + `</g></g>`;
};

/* 7 — Água-viva · 275 L */
C['agua-viva'] = () => {
  const COL = '#F7A9D6', DARK = '#EE82BD', LIGHT = '#FFD6EC';
  const bell = 'M19 50C19 27 33 13 50 13C67 13 81 27 81 50C75 54 70 49 64 54C58 59 55 54 50 54C45 54 42 59 36 54C30 49 25 54 19 50Z';
  const rim = 'M19 50C25 54 30 49 36 54C42 59 45 54 50 54C55 54 58 59 64 54C70 49 75 54 81 50';
  const tent = (x, dx, len) => `M${x} 54C${x + dx} ${54 + len * 0.3} ${x - dx} ${54 + len * 0.6} ${x + dx * 0.5} ${54 + len}`;
  const thin = (x, dx, len) => `<path d="${tent(x, dx, len)}" fill="none" stroke="${DARK}" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>`;
  const arm = (x, dx, len) => `<path d="${tent(x, dx, len)}" fill="none" stroke="${COL}" stroke-width="6.5" stroke-linecap="round"/>`;
  return `<g class="cr"><g transform="translate(50 50) scale(.94) translate(-50 -48)">` +
    thin(32, 5, 32) + thin(68, -5, 32) + thin(41, -5, 38) + thin(59, 5, 38) + arm(48, 6, 34) + arm(53, -6, 30) +
    `<path d="${bell}" fill="${COL}"/><path d="${rim}" fill="none" stroke="${DARK}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>` +
    hl('M26 40C26 28 34 20 44 17C37 25 34 34 35 44Z', 0.55) +
    `<circle cx="66" cy="26" r="2.4" fill="${LIGHT}"/><circle cx="72" cy="35" r="1.6" fill="${LIGHT}"/><circle cx="59" cy="20" r="1.5" fill="${LIGHT}"/>` +
    front(50, 34, 19, 1.15) + `</g></g>`;
};

/* 8 — Golfinho · 400 L */
C.golfinho = () => {
  const COL = '#6FA9E8', DARK = '#4F86CC', LIGHT = '#E9F4FF';
  const spine = [[14, 80], [24, 66], [38, 52], [54, 43], [69, 40], [79, 42]];
  const prof = [[0, 4], [0.14, 12], [0.4, 27], [0.68, 33], [0.9, 30], [1, 25]];
  const body = tube(spine, prof, 26);
  const belly = tube(spine, prof, 26, { a: 1, b: 0.12, t0: 0.16, t1: 0.97 });
  const beak = tube([[84, 47], [91, 51], [96, 54]], [[0, 12], [1, 6.5]], 6);
  const dorsal = (w) => `M-9 ${-w + 2}C-7 ${-w - 5} -13 ${-w - 10} -19 ${-w - 11}C-17 ${-w - 4} -14 ${-w} 4 ${-w + 2}Z`;
  const flip = (w) => `M3 ${w - 8}C-3 ${w - 4} -9 ${w + 4} -9 ${w + 11}C-3 ${w + 8} 3 ${w + 3} 10 ${w - 7}Z`;
  return `<g class="cr"><g transform="translate(50 52) scale(.93) translate(-50 -52)">` +
    part(spine, prof, 0.01, FLUKES, `fill="${DARK}"`) + part(spine, prof, 0.52, dorsal, `fill="${DARK}"`) +
    `<path d="${body}" fill="${COL}"/><path d="${beak}" fill="${COL}"/><path d="${belly}" fill="${LIGHT}"/>` +
    part(spine, prof, 0.7, flip, `fill="${DARK}"`) +
    hl('M30 56Q40 44 56 40Q44 46 38 60Z', 0.42) +
    `<g class="fc">` + eye(74, 41, 1.3) + cheek(70, 50, 1.05) + `<path d="M81 52Q87 57 93 54" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/></g></g></g>`;
};

/* 9 — Baleia · 700 L */
C.baleia = () => {
  const COL = '#4C8FE0', DARK = '#356FC0', LIGHT = '#D4E9FF';
  const spine = [[20, 36], [24, 50], [36, 62], [54, 68], [72, 64], [85, 56]];
  const prof = [[0, 4], [0.14, 10], [0.36, 28], [0.62, 40], [0.86, 38], [1, 30]];
  const body = tube(spine, prof, 26);
  const belly = tube(spine, prof, 26, { a: 1, b: 0.05, t0: 0.4, t1: 0.97 });
  const flukes = 'M20 36C12 36 6 31 5 23C11 24 16 27 20 31C24 27 29 24 35 23C34 31 28 36 20 36Z';
  const spout = 'M68 36C66 28 59 24 54 25M68 36C70 28 77 24 82 25';
  return `<g class="cr"><g transform="translate(50 50) scale(.95) translate(-50 -48)">` +
    `<path d="${flukes}" fill="${DARK}"/>` +
    `<path d="${spout}" fill="none" stroke="#8FD6FF" stroke-width="3.2" stroke-linecap="round"/>` +
    `<circle cx="53" cy="23" r="2.2" fill="#8FD6FF"/><circle cx="83" cy="23" r="2.2" fill="#8FD6FF"/><circle cx="60" cy="17" r="1.6" fill="#8FD6FF"/><circle cx="76" cy="17" r="1.6" fill="#8FD6FF"/>` +
    `<path d="${body}" fill="${COL}"/><path d="${belly}" fill="${LIGHT}"/>` +
    `<path d="M62 70C60 78 66 82 74 80C72 76 72 72 74 68Z" fill="${DARK}"/>` +
    `<path d="M50 74Q56 78 62 74M56 79Q61 82 66 78M63 83Q67 85 71 82" fill="none" stroke="${COL}" stroke-width="1.3" stroke-linecap="round" opacity=".35"/>` +
    hl('M40 54Q48 44 62 44Q52 48 46 58Z', 0.4) +
    `<g class="fc">` + eye(76, 55, 1.2) + cheek(72, 63, 1) + `<path d="M80 62Q85 66 88 61" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/></g></g></g>`;
};

/* 10 — Narval · 1000 L */
C.narval = () => {
  const COL = '#A9C6F2', DARK = '#7FA3DB', LIGHT = '#F2F8FF';
  const spine = [[12, 66], [26, 66], [44, 63], [62, 58], [76, 54], [84, 52]];
  const prof = [[0, 4], [0.16, 14], [0.4, 28], [0.7, 37], [0.9, 35], [1, 29]];
  const body = tube(spine, prof, 26);
  const belly = tube(spine, prof, 26, { a: 1, b: 0.12, t0: 0.3, t1: 0.98 });
  const tusk = tube([[84, 42], [91, 31], [98, 16]], [[0, 7], [1, 1.8]], 10);
  const flip = (w) => `M3 ${w - 8}C-3 ${w - 4} -9 ${w + 4} -9 ${w + 10}C-3 ${w + 7} 3 ${w + 3} 10 ${w - 7}Z`;
  let stripes = '';
  [[86.6, 36.9], [90.2, 30.6], [93.8, 24.3]].forEach((p) => { stripes += `M${f(p[0] - 2.6)} ${f(p[1] - 0.8)}L${f(p[0] + 2.6)} ${f(p[1] + 1.8)}`; });
  const spots = [[30, 62, 2.3], [40, 56, 1.7], [51, 53, 2.5], [61, 50, 1.8], [45, 62, 1.5], [36, 67, 1.3]]
    .map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="${DARK}" opacity=".55"/>`).join('');
  return `<g class="cr"><g transform="translate(50 52) scale(.93) translate(-50 -52)">` +
    part(spine, prof, 0.01, FLUKES, `fill="${DARK}"`) +
    `<path d="${tusk}" fill="#FFE8A3"/><path d="${stripes}" fill="none" stroke="#E7C25E" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="${body}" fill="${COL}"/><path d="${belly}" fill="${LIGHT}"/>` + spots +
    part(spine, prof, 0.72, flip, `fill="${DARK}"`) +
    hl('M44 53Q54 44 70 46Q56 50 50 58Z', 0.45) +
    `<g class="fc">` + eye(77, 53, 1.35) + cheek(72, 62, 1.1) + `<path d="M81 62Q87 66 91 61" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/></g></g></g>`;
};

// ordem do recife (a mesma de INSIGNIAS em core.js)
export const ORDER = ['concha', 'estrela', 'baiacu', 'tartaruga', 'cavalo', 'polvo', 'agua-viva', 'golfinho', 'baleia', 'narval'];
