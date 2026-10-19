// Maré — as listas de arquivos do app andam juntas. Quem copia o ZIP por cima do repositório e quem usa o app sem internet dependem de três
// listas (os imports de js/, as listas CORE/EXTRA do sw.js e a conferência do .github/workflows/pages.yml). Se um módulo novo entra numa
// e esquece das outras, o app quebra só no ar (ou só offline). Estes testes reprovam antes disso. Rodar: npm test
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const PUB = new URL('../public/', import.meta.url);
const read = (u) => readFileSync(u, 'utf8');
const JS = readdirSync(new URL('js/', PUB)).filter((f) => f.endsWith('.js')).sort();
const SW = read(new URL('sw.js', PUB));
const PAGES = read(new URL('../.github/workflows/pages.yml', import.meta.url));
const arr = (name) => { const m = new RegExp('const ' + name + ' = \\[([^\\]]*)\\]').exec(SW); return m ? (m[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1)) : []; };
const CORE = arr('CORE'), EXTRA = arr('EXTRA');
const imports = (src) => {
  const out = [], re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
};

describe('arquivos do app', () => {
  it('as listas do sw.js foram lidas (guarda contra mudar o formato sem querer)', () => {
    expect(CORE.length).toBeGreaterThan(8);
    expect(EXTRA.length).toBeGreaterThan(4);
    expect(CORE).toContain('./js/app.js');
    expect(EXTRA).toContain('./js/firebase.js');
  });
  it('todo import relativo de js/ aponta para um arquivo que existe', () => {
    const ruins = [];
    JS.forEach((f) => { imports(read(new URL('js/' + f, PUB))).forEach((i) => { if (!existsSync(new URL('js/' + i.replace(/^\.\//, ''), PUB))) ruins.push(f + ' → ' + i); }); });
    expect(ruins).toEqual([]);
  });
  it('todo arquivo de js/ está guardado pelo Service Worker (CORE ou EXTRA), senão não abre sem internet', () => {
    const lista = new Set(CORE.concat(EXTRA));
    expect(JS.filter((f) => !lista.has('./js/' + f))).toEqual([]);
  });
  it('todo arquivo citado nas listas do Service Worker existe', () => {
    const faltam = CORE.concat(EXTRA).filter((u) => u !== './' && !existsSync(new URL(u.replace(/^\.\//, ''), PUB)));
    expect(faltam).toEqual([]);
  });
  it('todo arquivo de js/ está na conferência do pages.yml (um envio pela metade não vai ao ar)', () => {
    const m = /for f in([\s\S]*?); do/.exec(PAGES);
    expect(m).not.toBeNull();
    const lista = new Set(m[1].replace(/\\\s*\n/g, ' ').split(/\s+/).filter(Boolean));
    expect(JS.filter((f) => !lista.has('js/' + f))).toEqual([]);
    [...lista].forEach((f) => { expect(existsSync(new URL(f, PUB)), f + ' está na conferência mas não existe').toBe(true); });
  });
  it('o módulo dos avisos dos amigos está em todas as listas', () => {
    expect(JS).toContain('alerts-sync.js');
    expect(EXTRA).toContain('./js/alerts-sync.js');
    expect(PAGES).toContain('js/alerts-sync.js');
    expect(imports(read(new URL('js/firebase.js', PUB)))).toContain('./alerts-sync.js');
  });
});
