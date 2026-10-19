// Gera public/js/art.js a partir de creatures.mjs.  Uso: npm run art   (ou: node scripts/art/build.mjs --check, que só confere)
// O resultado é determinístico: tests/art.test.js confere que o art.js publicado é exatamente o que este script gera.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { C, ORDER } from './creatures.mjs';
import { INSIGNIAS } from '../../public/js/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'public', 'js', 'art.js');

export function buildArt() {
  const ids = INSIGNIAS.map((x) => x.id);
  if (JSON.stringify(ids) !== JSON.stringify(ORDER)) throw new Error('ORDER em creatures.mjs difere de INSIGNIAS em core.js: ' + ORDER + ' ≠ ' + ids);
  ORDER.forEach((id) => { if (typeof C[id] !== 'function') throw new Error('Falta o desenho de ' + id); });
  const lines = ORDER.map((id) => {
    const svg = C[id]();
    if (/\sid=|<use|<defs|url\(#|clip-path|<image|<script|on\w+=/i.test(svg)) throw new Error('Desenho de ' + id + ' usa recurso proibido');
    return "  '" + id + "': '" + svg.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "',";
  });
  return `// Maré — arte das insígnias (bichinhos do mar). GERADO por scripts/art/build.mjs: não edite à mão; mude scripts/art/creatures.mjs
// e rode "npm run art". Cada desenho vive num quadro 100×100, só com <path>/<circle>/<ellipse>/<polygon>/<g>, sem id, <use>,
// gradiente nem clip-path, para ficar igual em qualquer navegador (inclusive iOS 12). O medalhão (fundo, anel, brilho) e o estado
// "bloqueado" (silhueta) são CSS: ver .bdg em css/app.css.
export const ART = {
${lines.join('\n')}
};

// HTML de uma insígnia. o: { size: px (padrão 56; 0 = o CSS decide), locked: bool (silhueta), label: texto para leitor de tela (sem ele,
// fica oculta), cls: classes extras }. O tamanho vai em font-size porque o medalhão usa "em". Até 40 px as bolhinhas somem (classe s).
export function badge(id, o) {
  o = o || {};
  const px = o.size == null ? 56 : o.size;
  return '<span class="bdg' + (o.locked ? ' lock' : '') + (px && px <= 40 ? ' s' : '') + (o.cls ? ' ' + o.cls : '') + '"' + (px ? ' style="font-size:' + px + 'px"' : '') +
    (o.label ? ' role="img" aria-label="' + o.label + '"' : ' aria-hidden="true"') + '><svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">' +
    (ART[id] || ART.concha) + '</svg></span>';
}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = buildArt();
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== out) { console.error('public/js/art.js está desatualizado: rode "npm run art".'); process.exit(1); }
    console.log('art.js em dia (' + out.length + ' bytes)');
  } else {
    writeFileSync(OUT, out);
    console.log('art.js gerado (' + out.length + ' bytes) em ' + path.relative(process.cwd(), OUT));
  }
}
