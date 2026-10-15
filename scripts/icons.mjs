// Maré — gera os PNGs do app a partir de public/icons/icon.svg (Parte 5). Uso: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const dir = new URL('../public/icons/', import.meta.url);
const svg = await readFile(new URL('icon.svg', dir), 'utf8');
// Quadrado cheio: o iOS e a máscara do Android aplicam o próprio arredondamento
const full = svg.replace('rx="112"', 'rx="0"');
// Maskable: arte reduzida para caber na zona segura (círculo de 80% do ícone)
const safe = full.replace('<g id="art">', '<g id="art" transform="translate(256 256) scale(.84) translate(-256 -256)">');
// Badge da notificação (Android): silhueta branca em fundo transparente; o sistema usa só a transparência
const drop = (svg.match(/<path id="drop" d="([^"]+)"/) || [])[1];
if (!drop) throw new Error('icon.svg precisa de <path id="drop" d="...">');
const badge = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="76 69 360 360"><path d="' + drop + '" fill="#fff"/></svg>';

const jobs = [
  ['icon-192.png', svg, 192], ['icon-512.png', svg, 512], ['maskable-512.png', safe, 512],
  ['apple-touch-icon.png', full, 180], ['badge-72.png', badge, 72],
];
for (const [name, src, size] of jobs) {
  let img = sharp(Buffer.from(src), { density: 300 }).resize(size, size);
  if (name === 'apple-touch-icon.png') img = img.flatten({ background: '#1265D6' }); // iOS não aceita transparência
  await writeFile(new URL(name, dir), await img.png().toBuffer());
  console.log('✓ ' + name + ' (' + size + ' px)');
}
