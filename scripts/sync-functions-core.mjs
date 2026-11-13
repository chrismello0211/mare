// Maré — copia o motor do app (public/js/core.js, que não importa nada) para functions/core.js (1.13.0). O servidor usa a MESMA conta do desafio da turma que o app
// (o resumo de domingo diz se a turma venceu a semana), e a pasta functions/ é publicada sozinha (sem public/): por isso a cópia fica ao lado das funções.
// Rodar depois de QUALQUER mudança em public/js/core.js: npm run sync:functions (tests/crew.test.js reprova se as duas deixarem de ser idênticas, byte a byte).
import { copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
copyFileSync(root + 'public/js/core.js', root + 'functions/core.js');
const same = readFileSync(root + 'public/js/core.js').equals(readFileSync(root + 'functions/core.js'));
console.log(same ? 'functions/core.js atualizado (idêntico a public/js/core.js)' : 'ERRO: as duas cópias diferem');
process.exit(same ? 0 : 1);
