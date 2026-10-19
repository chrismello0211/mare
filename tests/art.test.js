// Maré — testes da arte das insígnias: o art.js publicado é o que o gerador produz, cada bichinho existe, o SVG é bem formado
// e só usa o que funciona em qualquer navegador (inclusive iOS 12). Rodar: npm test
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ART, badge } from '../public/js/art.js';
import { INSIGNIAS } from '../public/js/core.js';
import { buildArt } from '../scripts/art/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Confere se as tags abrem e fecham na ordem certa e se todo atributo tem valor entre aspas
function wellFormed(svg) {
  const stack = [], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0, m;
  while ((m = re.exec(svg))) {
    if (svg.slice(last, m.index).trim() !== '') return 'texto solto: ' + svg.slice(last, m.index).slice(0, 30);
    last = re.lastIndex;
    if (m[4]) continue; // auto-fechada
    if (m[1]) { if (stack.pop() !== m[2]) return 'fechamento fora de ordem em </' + m[2] + '>'; } else stack.push(m[2]);
  }
  if (svg.slice(last).trim() !== '') return 'sobrou texto no fim';
  return stack.length ? 'tag aberta: ' + stack.join(',') : '';
}

describe('arte das insígnias', () => {
  it('o art.js publicado é exatamente o que o gerador (npm run art) produz', () => {
    expect(readFileSync(path.join(root, 'public/js/art.js'), 'utf8')).toBe(buildArt());
  });
  it('há um desenho para cada insígnia, e só para elas', () => {
    expect(Object.keys(ART)).toEqual(INSIGNIAS.map((x) => x.id));
  });
  it.each(INSIGNIAS.map((x) => x.id))('%s: SVG bem formado, simples e compatível', (id) => {
    const svg = ART[id];
    expect(wellFormed(svg)).toBe('');
    expect(svg.startsWith('<g class="cr">') && svg.endsWith('</g>')).toBe(true); // um único grupo raiz, que o CSS usa para a silhueta
    expect(svg).toContain('class="fc"'); // todo bichinho tem rostinho
    expect(svg).not.toMatch(/\sid=|<use|<defs|url\(#|clip-path|<image|<script|<style|<foreignObject|\bon\w+=|href=/i);
    expect(svg).not.toMatch(/NaN|undefined|Infinity|null/);
    expect(svg).not.toMatch(/[^\x20-\x7E]/); // só ASCII: nada de caractere estranho dentro do desenho
    expect(svg.length).toBeLessThan(9000); // leve: o app inteiro carrega do cache, mas o art.js pesa em toda atualização
    // todo número de coordenada é finito e razoável (o quadro é 100×100; as peças podem sair um pouco)
    (svg.replace(/#[0-9A-Fa-f]{3,8}/g, '').match(/-?\d+(\.\d+)?/g) || []).forEach((n) => { expect(Math.abs(+n)).toBeLessThan(400); }); // sem as cores #RRGGBB
  });
  it('badge(): medalhão com tamanho em font-size, silhueta quando bloqueado e rótulo acessível', () => {
    const on = badge('cavalo', { size: 64, label: 'Cavalo-marinho' });
    expect(on).toContain('class="bdg"');
    expect(on).toContain('style="font-size:64px"');
    expect(on).toContain('role="img" aria-label="Cavalo-marinho"');
    expect(on).toContain(ART.cavalo);
    expect(wellFormed(on)).toBe('');
    const off = badge('cavalo', { size: 36, locked: true, cls: 'x' });
    expect(off).toContain('class="bdg lock s x"'); // até 40 px: sem as bolhinhas
    expect(off).toContain('aria-hidden="true"');
    expect(off).not.toContain('role="img"');
    expect(badge('estrela', { size: 0 })).not.toContain('style='); // tamanho 0: quem decide é o CSS
    expect(badge('nao-existe')).toContain(ART.concha); // id desconhecido não quebra a tela
    expect(badge('polvo')).toContain('font-size:56px'); // padrão
  });
});
