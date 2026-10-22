// Maré — as regras do Firestore de antes das versões novas, tiradas das regras de hoje (firestore.rules). Servem para provar que o app novo
// continua de pé quando o site sai antes das regras (o site publica sozinho em cerca de 1 minuto; as regras e as funções vão à parte).
// Cada recorte confere que achou o que ia tirar: se o firestore.rules mudar de forma e o recorte não casar mais, o teste quebra aqui, em vez de
// rodar com uma regra "antiga" que na verdade é outra coisa.
function cut(rules, what, find, to) {
  const hit = typeof find === 'string' ? rules.indexOf(find) >= 0 : find.test(rules);
  if (!hit) throw new Error('old-rules.js: não achei ' + what + ' em firestore.rules');
  return rules.replace(find, to);
}
// Regras da 1.1.x: o perfil não tem a meta em ml (gl) nem os 7 dias (wm)
export function rules11x(rules) {
  let s = cut(rules, 'a lista de campos do perfil', "'sh', 'gl', 'wm'])", "'sh'])");
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
