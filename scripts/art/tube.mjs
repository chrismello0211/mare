// Gerador de "tubos" orgânicos: uma linha-guia (spine) e um perfil de largura viram um contorno suave em SVG.
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// Catmull-Rom uniforme -> pontos densos
function dense(pts, per = 24) {
  const P = [pts[0]].concat(pts, [pts[pts.length - 1]]);
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// reamostra por comprimento de arco em n+1 estações
function resample(d, n) {
  const L = [0];
  for (let i = 1; i < d.length; i++) L.push(L[i - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
  const tot = L[L.length - 1], out = [];
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const s = (tot * i) / n;
    while (j < d.length - 1 && L[j] < s) j++;
    const a = d[j - 1], b = d[j], seg = L[j] - L[j - 1] || 1, u = (s - L[j - 1]) / seg;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
const smooth = (t) => t * t * (3 - 2 * t);
function widthAt(prof, t) {
  if (t <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    if (t <= prof[i][0]) { const a = prof[i - 1], b = prof[i], u = smooth((t - a[0]) / (b[0] - a[0] || 1)); return a[1] + (b[1] - a[1]) * u; }
  }
  return prof[prof.length - 1][1];
}
// pontos -> caminho suave (Catmull-Rom -> Bézier cúbica)
function smoothPath(pts, move) {
  let d = (move ? 'M' : 'L') + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += 'C' + f1(c1[0]) + ' ' + f1(c1[1]) + ' ' + f1(c2[0]) + ' ' + f1(c2[1]) + ' ' + f1(p2[0]) + ' ' + f1(p2[1]);
  }
  return d;
}
// spine: pontos de controle; prof: [[t, largura], ...] com t de 0 a 1; n: estações.
// opt: { a, b, t0, t1 }: faixa entre as frações a e b da meia-largura (1 = lado +N, -1 = lado -N) e trecho t0..t1 da linha.
export function tube(spine, prof, n, opt) {
  n = n || 18;
  opt = opt || {};
  const a = opt.a == null ? 1 : opt.a, b = opt.b == null ? -1 : opt.b, t0 = opt.t0 || 0, t1 = opt.t1 == null ? 1 : opt.t1;
  const full = a === 1 && b === -1 && t0 === 0 && t1 === 1;
  const all = resample(dense(spine), 200), A = [], B = [];
  const N = Math.max(4, Math.round(n * (t1 - t0)));
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0) * (i / N), k = Math.round(t * 200);
    const p = all[k], p0 = all[Math.max(0, k - 1)], p1 = all[Math.min(200, k + 1)];
    let tx = p1[0] - p0[0], ty = p1[1] - p0[1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const w = widthAt(prof, t) / 2;
    A.push([p[0] + -ty * w * a, p[1] + tx * w * a]);
    B.push([p[0] + -ty * w * b, p[1] + tx * w * b]);
  }
  const w0 = widthAt(prof, t0) / 2, w1 = widthAt(prof, t1) / 2;
  let d = smoothPath(A, true);
  d += full && w1 > 0.2 ? 'A' + f1(w1) + ' ' + f1(w1) + ' 0 0 0 ' + f1(B[N][0]) + ' ' + f1(B[N][1]) : 'L' + f1(B[N][0]) + ' ' + f1(B[N][1]);
  d += smoothPath(B.slice().reverse(), false);
  d += full && w0 > 0.2 ? 'A' + f1(w0) + ' ' + f1(w0) + ' 0 0 0 ' + f1(A[0][0]) + ' ' + f1(A[0][1]) : '';
  return d + 'Z';
}
// só a linha-guia suave (para tentáculos desenhados com traço)
export function line(spine, n) { return smoothPath(resample(dense(spine), n || 14), true); }
export const pt = f1;

// Ponto da linha-guia na fração t (0..1) e direção (tx, ty), mais a meia-largura do perfil nesse ponto.
export function at(spine, prof, t) {
  const all = resample(dense(spine), 200), k = Math.max(1, Math.min(199, Math.round(t * 200)));
  const p = all[k], p0 = all[k - 1], p1 = all[k + 1];
  let tx = p1[0] - p0[0], ty = p1[1] - p0[1];
  const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
  return { x: p[0], y: p[1], tx, ty, w: widthAt(prof, t) / 2, deg: (Math.atan2(ty, tx) * 180) / Math.PI };
}
// Peça (nadadeira etc.) ancorada na linha-guia: no desenho local, +x segue o corpo rumo à cabeça e +y aponta para a barriga.
export function part(spine, prof, t, fn, attrs) {
  const a = at(spine, prof, t);
  return `<path d="${fn(Math.round(a.w * 10) / 10)}" transform="translate(${f1(a.x)} ${f1(a.y)}) rotate(${f1(a.deg)})" ${attrs || ''}/>`;
}
