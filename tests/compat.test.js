// Maré — guarda-corpos de compatibilidade. O app promete funcionar no iOS 12.2+ e no Chrome 70+ (aparelhos antigos de família e amigos).
// Estes testes leem tudo o que vai para o ar (public/) e reprovam sintaxe, APIs, CSS e emojis novos demais, para que uma edição futura
// não quebre um aparelho antigo sem ninguém perceber. Se um deles reprovar: troque pelo equivalente antigo (a mensagem diz qual regra).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { transformSync } from 'esbuild';

const ROOT = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); // (Windows: tira a barra antes da letra do disco)
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(ROOT);
const ext = (e) => files.filter((f) => f.endsWith(e));
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const read = (f) => readFileSync(f, 'utf8');
const JS = ext('.js'), CSS = ext('.css'), TEXT = files.filter((f) => /\.(js|css|html|json|webmanifest|svg)$/.test(f));

/* ---------- JavaScript: sintaxe ---------- */
// O esbuild reescreve a sintaxe que o alvo não entende (?., ??, campos de classe, BigInt, regex com lookbehind…). Se o resultado para os
// navegadores antigos for diferente do resultado para "esnext", o arquivo usa algo que eles não entendem.
const OLD = ['chrome70', 'safari12', 'ios12', 'firefox68'];
const gen = (code, target) => transformSync(code, { loader: 'js', format: 'esm', target: target, legalComments: 'none', charset: 'utf8' }).code;
describe('JavaScript: sintaxe aceita por iOS 12.2+ e Chrome 70+', () => {
  JS.forEach((f) => {
    it(rel(f), () => {
      const src = read(f);
      expect(gen(src, OLD) === gen(src, 'esnext'), 'usa sintaxe nova demais (?. ?? campos de classe, lookbehind, BigInt…)').toBe(true);
    });
  });
});

/* ---------- JavaScript: APIs ---------- */
const API = [
  [/\.(flat|flatMap|findLast|findLastIndex|replaceAll|toSorted|toReversed|toSpliced)\(/, 'Array/String novos (flat, flatMap, replaceAll…): iOS 12 não tem'],
  [/(?<!clients)\.matchAll\(/, 'String.matchAll: iOS 12 não tem'],
  [/\.at\(-?\d/, 'Array.at / String.at: iOS 12 não tem'],
  [/Object\.(fromEntries|hasOwn)\b/, 'Object.fromEntries / hasOwn: iOS 12 não tem'],
  [/Promise\.(allSettled|any)\b/, 'Promise.allSettled / any: iOS 12 não tem'],
  [/\bstructuredClone\b/, 'structuredClone: iOS 12 não tem (use JSON.parse(JSON.stringify(x)))'],
  [/crypto\.randomUUID/, 'crypto.randomUUID: iOS 12 não tem'],
  [/\bnew ResizeObserver\b/, 'ResizeObserver: iOS 12 não tem'],
  [/Intl\.(RelativeTimeFormat|ListFormat|DisplayNames|Segmenter)\b/, 'Intl novo: iOS 12 não tem'],
  [/\.(replaceChildren|showModal|requestSubmit)\(/, 'DOM novo: iOS 12 não tem'],
  [/matchMedia\([^)]*\)\.addEventListener\b/, 'matchMedia().addEventListener: o iOS 12 só tem addListener'],
];
describe('JavaScript: nada de APIs que o iOS 12 não tem', () => {
  JS.forEach((f) => {
    it(rel(f), () => {
      const code = gen(read(f), 'esnext'); // já sem comentários
      const hits = API.filter((a) => a[0].test(code)).map((a) => a[1]);
      expect(hits).toEqual([]);
    });
  });
});

/* ---------- CSS ---------- */
// Quebra o CSS em blocos "seletor { declarações }" (os de dentro de @media também)
function blocks(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, ''), out = [], stack = [];
  let start = 0;
  for (let k = 0; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') { stack.push(src.slice(start, k).trim()); start = k + 1; }
    else if (ch === '}') {
      const body = src.slice(start, k);
      if (body.trim()) out.push({ sel: stack[stack.length - 1] || '', body: body });
      stack.pop(); start = k + 1;
    } else if (ch === ';' && !stack.length) start = k + 1;
  }
  return out;
}
const decl = (body, prop) => new RegExp('(^|[;\\s])' + prop + '\\s*:', 'i').test(body);
const CSS_BAN = [
  [/aspect-ratio\s*:/, 'aspect-ratio'], [/(^|[;{\s])inset\s*:/, 'inset'], [/\bclamp\(/, 'clamp()'], [/:is\(|:where\(|:has\(/, ':is() / :where() / :has()'],
  [/@container|@layer/, '@container / @layer'], [/color-mix\(/, 'color-mix()'], [/[0-9](dvh|svh|lvh|dvw|svw|lvw)\b/, 'dvh/svh/lvh'],
  [/(^|[;{\s])(scale|translate|rotate)\s*:/, 'propriedades de transformação separadas (scale:, translate:)'], [/:not\([^)]*,[^)]*\)/, ':not(a, b) com vírgula'],
  [/\bsubgrid\b|\bmasonry\b|@property|:focus-visible\s*\{[^}]*\}\s*,/, 'recurso de CSS novo'],
];
describe('CSS: nada que o iOS 12.2 / Chrome 70 não entendem', () => {
  CSS.forEach((f) => {
    const css = read(f), bl = blocks(css);
    it(rel(f) + ': propriedades e seletores', () => {
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(CSS_BAN.filter((b) => b[0].test(stripped)).map((b) => b[1])).toEqual([]);
    });
    it(rel(f) + ': gap só em grade (com grid-gap ao lado), nunca em flexbox', () => {
      const bad = bl.filter((b) => /(^|[;\s])(row-|column-)?gap\s*:/.test(b.body) && !decl(b.body, 'grid-gap') && !decl(b.body, 'grid-row-gap') && !decl(b.body, 'grid-column-gap'));
      expect(bad.map((b) => b.sel)).toEqual([]);
    });
    it(rel(f) + ': backdrop-filter sempre com a versão -webkit-', () => {
      const bad = bl.filter((b) => /(^|[;\s])backdrop-filter\s*:/.test(b.body) && !decl(b.body, '-webkit-backdrop-filter'));
      expect(bad.map((b) => b.sel)).toEqual([]);
    });
    it(rel(f) + ': sticky com -webkit-sticky antes', () => {
      const bad = bl.filter((b) => /position\s*:\s*sticky/.test(b.body) && !/position\s*:\s*-webkit-sticky/.test(b.body));
      expect(bad.map((b) => b.sel)).toEqual([]);
    });
  });
});

/* ---------- emojis ---------- */
// Emojis do Unicode 12 em diante (2019+) viram um quadradinho vazio no iOS 12 e em Androids antigos. Intervalos gerados a partir da tabela
// oficial de versões de emoji; só entram aqui caracteres soltos (sequências com ZWJ degradam para os emojis que as formam, sem quadradinho).
const NEW = [[0x26A7, 0x26A7], [0x1F6D5, 0x1F6D9], [0x1F6DC, 0x1F6DF], [0x1F6FA, 0x1F6FC], [0x1F7E0, 0x1F7EB], [0x1F7F0, 0x1F7F0], [0x1F90C, 0x1F90F],
  [0x1F93F, 0x1F93F], [0x1F971, 0x1F972], [0x1F977, 0x1F979], [0x1F97B, 0x1F97B], [0x1F9A3, 0x1F9AF], [0x1F9BA, 0x1F9BF], [0x1F9C3, 0x1F9CF],
  [0x1FA70, 0x1FA7C], [0x1FA80, 0x1FAC6], [0x1FAC8, 0x1FAC8], [0x1FACC, 0x1FADD], [0x1FADF, 0x1FAEB], [0x1FAEF, 0x1FAFA]];
const tooNew = (cp) => NEW.some((r) => cp >= r[0] && cp <= r[1]);
function cps(text) {
  const out = [];
  for (const ch of text) out.push(ch.codePointAt(0));
  (text.match(/\\u\{([0-9a-fA-F]+)\}/g) || []).forEach((m) => out.push(parseInt(m.slice(3, -1), 16))); // escapes \u{1FAF6} no código
  (text.match(/\\u(d[89ab][0-9a-f]{2})\\u(d[c-f][0-9a-f]{2})/gi) || []).forEach((m) => { // pares substitutos 🫶
    const h = parseInt(m.slice(2, 6), 16), l = parseInt(m.slice(8, 12), 16);
    out.push((h - 0xD800) * 0x400 + (l - 0xDC00) + 0x10000);
  });
  return out;
}
describe('Emojis: nenhum do Unicode 12+ (iOS 12 mostraria um quadradinho)', () => {
  TEXT.forEach((f) => {
    it(rel(f), () => {
      const bad = Array.from(new Set(cps(read(f)).filter(tooNew))).map((c) => 'U+' + c.toString(16).toUpperCase() + ' ' + String.fromCodePoint(c));
      expect(bad).toEqual([]);
    });
  });
});
