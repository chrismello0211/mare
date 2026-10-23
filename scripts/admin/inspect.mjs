// Maré — lista as contas do projeto: só nomes e contagens (nenhum volume bebido, peso ou horário). Serve para achar o uid de alguém.
//   node scripts/admin/inspect.mjs                 as contas com registros, apelido ou amigos
//   node scripts/admin/inspect.mjs --name mari     só as de apelido parecido
//   node scripts/admin/inspect.mjs --friends       mostra também os amigos de cada uma
//   node scripts/admin/inspect.mjs --all           inclui as contas vazias
import { connect, parseArgs, snapshot, formatRows, run } from './lib.mjs';

run(async () => {
  const { flags } = parseArgs(process.argv.slice(2), ['name']);
  const ctx = connect();
  console.log(ctx.emulated ? '[EMULADOR local]' : 'Projeto: mare-hidratacao');
  const rows = await snapshot(ctx);
  console.log('\n' + rows.length + ' contas no total.\n');
  console.log(formatRows(rows, { all: !!flags.all, name: flags.name === true ? '' : flags.name, friends: !!flags.friends }));
});
