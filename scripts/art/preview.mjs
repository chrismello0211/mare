// Maré — pré-visualização dos bichinhos com o CSS de verdade do app (medalhão, anel, silhueta de "bloqueada", tema escuro).
// Ferramenta de apoio para desenhar ou ajustar uma insígnia: lê scripts/art/creatures.mjs (não o art.js), então dá para ver o desenho antes de
// rodar `npm run art`. Não tem teste automático e não entra no app. Precisa do Playwright com o Chromium (o mesmo dos testes de interface).
//
//   node scripts/art/preview.mjs saida.png                       todos os bichinhos, em dois tamanhos (150 e 46 px)
//   node scripts/art/preview.mjs saida.png orca,perola           só alguns
//   node scripts/art/preview.mjs saida.png orca --sizes=240      outros tamanhos (separados por vírgula)
//   node scripts/art/preview.mjs saida.png --dark --lock         também no tema escuro e a silhueta de "bloqueada"
//   node scripts/art/preview.mjs saida.png --cols=5              quantos por linha (padrão 3)
//
// Um id pode levar variante (id:variante) quando a função do bichinho aceita um argumento. O PNG sai com o dobro da resolução.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) { console.error('Uso: node scripts/art/preview.mjs saida.png [ids separados por vírgula] [--sizes=150,46] [--dark] [--lock] [--cols=N]'); process.exit(1); }
const flag = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : d; };

const { C } = await import(pathToFileURL(path.join(ROOT, 'scripts/art/creatures.mjs')).href + '?t=' + Date.now());
let ids = args.slice(1).find((x) => !x.startsWith('--'));
ids = ids ? ids.split(',') : Object.keys(C);
ids.forEach((id) => { if (typeof C[id.split(':')[0]] !== 'function') { console.error('Bichinho desconhecido: ' + id); process.exit(1); } });
const sizes = flag('sizes', '150,46').split(',').map(Number);
const cols = +flag('cols', 3);
const css = readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');

const badge = (svg, px, lock) => '<span class="bdg' + (lock ? ' lock' : '') + (px <= 40 ? ' s' : '') + '" style="font-size:' + px + 'px"><svg viewBox="0 0 100 100">' + svg + '</svg></span>';
const cell = (id, theme) => {
  const svg = C[id.split(':')[0]](id.split(':')[1]);
  const row = sizes.map((px) => badge(svg, px, false)).join('') + (args.includes('--lock') ? badge(svg, 46, true) : '');
  return '<div class="cell" data-theme="' + theme + '"><div class="bs">' + row + '</div><div class="nm">' + id + '</div></div>';
};
const themes = args.includes('--dark') ? ['light', 'dark'] : ['light'];
let html = '<!doctype html><meta charset="utf-8"><style>' + css + '\nbody{margin:0;padding:12px;background:#fff}.grid{display:grid;grid-template-columns:repeat(' + cols +
  ',auto);gap:10px;width:max-content}.cell{padding:10px;border-radius:12px;background:var(--bg,#f4f7fb);color:var(--tx,#18222f)}.cell[data-theme=dark]{background:#0f1722;color:#e6edf6}' +
  '.bs{display:flex;align-items:center;gap:12px}.nm{font:12px system-ui;margin-top:6px;opacity:.7}</style><body><div class="grid">';
ids.forEach((id) => { themes.forEach((t) => { html += cell(id, t); }); });
html += '</div></body>';

const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } });
await p.setContent(html);
await p.waitForTimeout(150);
await (await p.$('.grid')).screenshot({ path: out });
await b.close();
console.log('ok', out, ids.length + ' bichinhos');
