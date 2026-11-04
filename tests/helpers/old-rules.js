// Maré — as regras do Firestore de antes das versões novas, tiradas das regras de hoje (firestore.rules). Servem para provar que o app novo
// continua de pé quando o site sai antes das regras (o site publica sozinho em cerca de 1 minuto; as regras e as funções vão à parte).
// Cada recorte confere que achou o que ia tirar: se o firestore.rules mudar de forma e o recorte não casar mais, o teste quebra aqui, em vez de
// rodar com uma regra "antiga" que na verdade é outra coisa.
function cut(rules, what, find, to) {
  const hit = typeof find === 'string' ? rules.indexOf(find) >= 0 : find.test(rules);
  if (!hit) throw new Error('old-rules.js: não achei ' + what + ' em firestore.rules');
  return rules.replace(find, to);
}
// Regras da 1.7.0 (as que estavam no ar antes da 1.8.0): o perfil já tem a segunda palavra das medalhas (md2), mas a pct só vai até 100
export function rules17x(rules) {
  return cut(rules, 'o teto da pct (1.7.0)', 'd.pct >= 0 && d.pct <= 150', 'd.pct >= 0 && d.pct <= 100');
}
// Regras da 1.5.0 e da 1.6.0 (as que estavam no ar antes da 1.7.0): o perfil tem as medalhas (md, 24 bits), mas não a segunda palavra (md2).
// A pct também só vai até 100 (como em todas as regras de antes da 1.8.0)
export function rules16x(rules) {
  let s = cut(rules17x(rules), 'a lista de campos do perfil (1.6.x)', "'wm', 'md', 'md2'])", "'wm', 'md'])");
  s = cut(s, 'a regra do campo md2', /\n\s*&& \(!\('md2' in d\)[^\n]*/, '');
  return s;
}
// Regras da 1.2.0 até a 1.4.x (as que estavam no ar antes da 1.5.0): o perfil tem a meta em ml (gl) e os 7 dias (wm), mas não as medalhas (md nem md2)
export function rules14x(rules) {
  let s = cut(rules16x(rules), 'a lista de campos do perfil', "'sh', 'gl', 'wm', 'md'])", "'sh', 'gl', 'wm'])");
  s = cut(s, 'a regra do campo md', /\n\s*&& \(!\('md' in d\)[^\n]*/, '');
  return s;
}
// Regras da 1.1.x: além disso, o perfil não tem a meta em ml (gl) nem os 7 dias (wm)
export function rules11x(rules) {
  let s = rules14x(rules);
  s = cut(s, 'a lista de campos do perfil (1.1.x)', "'sh', 'gl', 'wm'])", "'sh'])");
  s = cut(s, 'a regra do campo gl', /\n\s*&& \(!\('gl' in d\)[^\n]*/, '');
  s = cut(s, 'a regra do campo wm', /\n\s*&& \(!\('wm' in d\)[^\n]*/, '');
  return s;
}
// Regras da 1.1.0: além disso, users/{uid} não tem "social" (as escolhas de aviso)
export function rules110(rules) {
  let s = rules11x(rules);
  s = cut(s, 'o campo social em users', "'stats', 'social', 'updatedAt'", "'stats', 'updatedAt'");
  s = cut(s, 'a regra do mapa social', /\n\s*&& \(!\('social' in d\)[\s\S]*?social\.week is bool\)\)\)/, '');
  return s;
}
// Regras da 1.2.x (antes da conta, 1.3.0): users/{uid} não tem a subcoleção backup (os ajustes da conta). Quem lê ou grava ali é recusado.
export function rules12x(rules) {
  return cut(rules, 'a regra do backup dos ajustes', /\n\s*match \/backup\/\{doc\} \{[^}]*\}/, '');
}
