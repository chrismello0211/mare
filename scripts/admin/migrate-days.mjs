// Maré — plano B da recuperação: copia os REGISTROS de uma conta para outra (por exemplo, a pessoa já criou uma conta nova no aparelho novo
// e a conta antiga não pode receber o e-mail dela). Não apaga nada. Amigos e turma não vão junto: a pessoa os refaz pelo código do convite.
//   node scripts/admin/migrate-days.mjs <origem> <destino>                    só mostra o que faria (e o comando exato para gravar)
//   node scripts/admin/migrate-days.mjs <uid origem> <uid destino> --apply    copia (só com os uids inteiros, iguais aos da prévia)
// origem e destino na prévia: o uid inteiro, o começo do uid ou o apelido.
import { connect, parseArgs, planMigrate, describeMigrate, migrateCommand, applyMigrate, die, run } from './lib.mjs';

run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2), []);
  if (pos.length !== 2 || flags.help) die('Uso:  node scripts/admin/migrate-days.mjs <origem> <destino> [--apply]\n(sem --apply só mostra o que faria; com --apply use os uids inteiros, iguais aos da prévia)');
  const ctx = connect();
  console.log(ctx.emulated ? '[EMULADOR local]\n' : 'Projeto: mare-hidratacao\n');
  const plan = await planMigrate(ctx, pos[0], pos[1], { exactUid: !!flags.apply });
  console.log(describeMigrate(plan));
  if (!plan.copy.length && !plan.merge.length) { console.log('\nNada a copiar.'); return; }
  if (!flags.apply) { console.log('\nNada foi alterado (é só a prévia). Confira as duas contas. Se for isso mesmo, copie com:\n\n  ' + migrateCommand(plan)); return; }
  const n = await applyMigrate(ctx, plan);
  console.log('\nFeito: ' + n + ' dia(s) gravado(s) na conta de destino. Peça para a pessoa FECHAR o Maré de vez (tirar da lista de aplicativos abertos) e abrir de novo, ' +
    'sem registrar nada antes: os registros chegam sozinhos na abertura.');
});
