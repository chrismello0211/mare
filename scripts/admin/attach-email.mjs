// Maré — recuperação de uma conta anônima (a pessoa perdeu o celular e nunca criou conta): liga o e-mail dela ao MESMO uid da conta antiga.
// Depois a pessoa, no aparelho novo, usa "Entrar na conta" → "Esqueci a senha" no Maré, cria a própria senha e entra: registros, amigos e turma voltam.
//   node scripts/admin/attach-email.mjs <uid | começo do uid | apelido> <e-mail>      só mostra o que faria (e o comando exato para gravar)
//   node scripts/admin/attach-email.mjs <uid inteiro> <e-mail> --apply                faz (só com o uid inteiro, igual ao da prévia) e confere
// Opções: --even-empty (conta sem registros), --replace (troca um e-mail que já exista), --with-temp-password (veja LEIA-ME.md),
//         --recreate-login (a conta só tem dados: recria o login com o mesmo uid), --forget-devices (tira os avisos push do aparelho antigo).
// Saídas: 0 deu certo · 1 não deu (explica) · 3 a prévia achou um impedimento · 4 gravou, mas o Firebase não aceitou gerar o link de senha.
import { connect, parseArgs, planAttach, describeAttach, applyAttach, applyCommand, instructions, maskEmail, die, run } from './lib.mjs';

run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2), []);
  if (pos.length !== 2 || flags.help) die('Uso:  node scripts/admin/attach-email.mjs <uid ou apelido> <e-mail> [--apply]\n(sem --apply só mostra o que faria; com --apply use o uid inteiro, igual ao da prévia)\n' +
    'Apelido com espaço precisa de aspas:  "Mari Souza"');
  const ctx = connect();
  console.log(ctx.emulated ? '[EMULADOR local]\n' : 'Projeto: mare-hidratacao\n');
  const opts = { evenEmpty: !!flags['even-empty'], replace: !!flags.replace, tempPassword: !!flags['with-temp-password'], recreateLogin: !!flags['recreate-login'],
    forgetDevices: !!flags['forget-devices'], exactUid: !!flags.apply };
  const plan = await planAttach(ctx, pos[0], pos[1], opts);
  console.log(describeAttach(plan));
  if (plan.problems.length) { console.log(''); process.exit(3); }
  if (!flags.apply) {
    console.log('\nNada foi alterado (é só a prévia). Confira se é MESMO a conta da pessoa (apelido, amigos, quando foi usada pela última vez). Se for, grave com:\n\n  ' + applyCommand(plan, opts));
    return;
  }
  const r = await applyAttach(ctx, plan, opts);
  console.log('\nFeito: a conta ' + r.uid + ' agora tem o e-mail ' + maskEmail(r.email) + (r.recreated ? ' (login recriado com o mesmo uid)' : '') +
    (r.tempPassword ? ' (e uma senha aleatória que ninguém conhece)' : '') + '. O uid continua o mesmo.');
  if (opts.forgetDevices) console.log(r.forgot ? 'Os avisos push do aparelho antigo (' + r.forgot + ') saíram da conta.' : 'Não havia avisos push registrados na conta.');
  if (!r.check.ok) {
    console.log('\nATENÇÃO: o Firebase NÃO aceitou gerar o link de senha para esse e-mail (' + r.check.code + '). O e-mail ficou gravado, mas o "Esqueci a senha" ainda não vai funcionar.');
    console.log(r.tempPassword
      ? 'Mesmo com a senha aleatória não funcionou: confira se "E-mail/senha" está ativado em Authentication > Método de login (console do Firebase) e repita este mesmo comando (ele só confere de novo).'
      : '1) Confira se "E-mail/senha" está ativado em Authentication > Método de login (console do Firebase) e repita este mesmo comando (ele só confere de novo).\n' +
        '2) Se continuar, repita com --with-temp-password (dá à conta uma senha aleatória que ninguém conhece).');
    process.exit(4);
  }
  console.log('Conferido: o Firebase reconhece o e-mail para criar a senha pelo link ("Esqueci a senha").');
  console.log('\n' + instructions(plan));
  console.log('\nO e-mail sai do Firebase (noreply@mare-hidratacao.firebaseapp.com) e pode cair no spam. Esta conferência não prova que ele chegou: se em 5 minutos não aparecer, o plano B (migrate-days.mjs) copia os registros para uma conta nova.');
});
