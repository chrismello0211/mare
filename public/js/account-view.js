// Maré — telas da conta (1.3.0): cartão em Ajustes, dica da tela Hoje e os painéis de criar conta, entrar, esqueci a senha e excluir.
// Só monta HTML a partir do estado (ACCT em store.js); quem age é o app.js (ações data-action "ac-…").
// Campos dos painéis: #acEmail e #acPw (Enter vai de um ao outro e depois aperta o botão marcado com data-primary), erros em #acErr.
import { ACCT, esc } from './store.js';
import { sheetHead } from './ui.js';
import { btn, sbtn, sec, row, tip } from './kit.js';
import { emailShort } from './account.js';

/* ---------- Ajustes: o cartão da conta ---------- */
export function accountHTML() {
  if (ACCT.ended) {
    return sec('Conta') + '<div class="group"><div class="row stack"><div class="row-l"><span>⚠️ Sua conta saiu deste aparelho</span>' +
      '<small>Entre de novo com <b>' + esc(emailShort(ACCT.email)) + '</b> para voltar a guardar seus dados na conta. Os registros que estão aqui continuam no aparelho.</small></div>' +
      '<div class="row-c">' + btn('ac-reenter', 'Entrar de novo', 'sm') + '</div></div></div>';
  }
  if (!ACCT.on) {
    return sec('Conta') + '<div class="group"><div class="row stack"><div class="row-l"><span>🔒 Proteja seus dados</span>' +
      '<small>Sem conta, se o celular quebrar ou for trocado, seus registros e ajustes ficam para trás. Com e-mail e senha você recupera tudo em outro aparelho, com seus amigos.</small></div>' +
      '<div class="row-c btns-in">' + btn('ac-create', 'Criar conta', 'sm') + btn('ac-switch', 'Já tenho conta', 'sm ghost') + '</div></div></div>';
  }
  return sec('Conta') + '<div class="group">' +
    row('<span class="acct-email">' + esc(ACCT.email) + '</span>', ACCT.verified ? '✓ E-mail confirmado' : 'E-mail ainda não confirmado', '') +
    row('Seus dados estão na conta', 'Registros, ajustes e amigos voltam em qualquer aparelho em que você entrar.', '') +
    (ACCT.verified ? '' : row('Confirme o e-mail', 'Toque no link que enviamos. Assim você sabe que o endereço está certo para recuperar a conta.', sbtn('ac-resend', 'Reenviar'))) +
    row('Senha', 'Enviamos um link para o seu e-mail criar uma senha nova.', sbtn('ac-pass', 'Trocar')) +
    row('Sair da conta', 'Este aparelho volta ao início. A conta e os dados continuam guardados.', sbtn('ac-out', 'Sair')) +
    row('Excluir conta', 'Apaga a conta e tudo o que ela guarda, aqui e na nuvem.', sbtn('ac-del', 'Excluir', 'ghost danger')) + '</div>';
}

/* ---------- Hoje: a dica ---------- */
export const accountTip = () => tip('account', '🔒', 'Proteja seus dados',
  'Crie uma conta com e-mail e senha. Se trocar de celular ou perder o aparelho, seus registros, ajustes e amigos voltam em minutos.', ['ac-create', 'Criar conta']);

/* ---------- painéis ---------- */
const emailIn = (v, ro) => '<label class="lbl" for="acEmail">E-mail</label><input class="in wide" id="acEmail" type="email" inputmode="email" autocomplete="email" ' +
  'autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="254" placeholder="voce@exemplo.com" value="' + esc(v || '') + '"' + (ro ? ' readonly' : '') + '>';
const pwIn = (label, ph, ac) => '<label class="lbl" for="acPw">' + label + '</label><div class="pw"><input class="in wide" id="acPw" type="password" autocomplete="' + ac + '" ' +
  'autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="128" placeholder="' + ph + '"><button class="pw-eye" type="button" data-action="ac-eye" ' +
  'aria-pressed="false" aria-label="Mostrar a senha">Mostrar</button></div>';
const errBox = (t) => '<div class="err" id="acErr" role="alert">' + esc(t || '') + '</div>';
const primary = (action, label, danger) => btn(action, label, danger ? 'danger' : '', ' data-primary="1"');

// d = { email, err }
export function createSheet(d) {
  d = d || {};
  return sheetHead('Criar conta') +
    '<p class="sheet-text">Seus registros, ajustes e amigos ficam guardados na conta. Se trocar de celular, é só entrar nela.</p>' +
    emailIn(d.email) + pwIn('Senha', 'Pelo menos 8 caracteres', 'new-password') +
    '<p class="note">O e-mail serve só para entrar e recuperar a conta. Com a conta, seu peso e seus ajustes também ficam guardados na nuvem, só para você. Os amigos nunca veem seu peso.</p>' +
    errBox(d.err) + '<div class="btns stk">' + primary('ac-do-create', 'Criar conta') + btn('close-sheet', 'Agora não', 'ghost') + '</div>' +
    '<p class="ob-fine">Já tem conta? <button type="button" data-action="ac-switch">Entrar nela</button></p>';
}
// d = { email, err, fixed, title, note, stage: 'form' | 'retry' }
export function signinSheet(d) {
  d = d || {};
  if (d.stage === 'retry') {
    return sheetHead('Quase lá') + '<p class="sheet-text">Entrei na conta, mas não consegui baixar seus dados agora. Confira a internet e tente de novo.</p>' +
      errBox(d.err) + '<div class="btns stk">' + primary('ac-retry', 'Tentar de novo') + btn('close-sheet', 'Fechar', 'ghost') + '</div>';
  }
  return sheetHead(d.title || 'Entrar na conta') +
    '<p class="sheet-text">' + (d.note || 'Digite o e-mail e a senha da sua conta. Seus registros, ajustes e amigos voltam neste aparelho.') + '</p>' +
    emailIn(d.email, d.fixed) + pwIn('Senha', 'Sua senha', 'current-password') +
    '<p class="ob-fine lft"><button type="button" data-action="ac-forgot">Esqueci a senha</button></p>' +
    errBox(d.err) + '<div class="btns stk">' + primary('ac-do-signin', 'Entrar') + btn('close-sheet', 'Cancelar', 'ghost') + '</div>';
}
export function resetSheet(d) {
  d = d || {};
  return sheetHead('Esqueci a senha') + '<p class="sheet-text">Digite o e-mail da sua conta. Enviamos um link para você criar uma senha nova.</p>' +
    emailIn(d.email) + errBox(d.err) +
    '<div class="btns stk">' + primary('ac-do-reset', 'Enviar o link') + btn('ac-back', 'Voltar', 'ghost') + '</div>';
}
export function resetDoneSheet(email) {
  return sheetHead('Confira seu e-mail') +
    '<p class="sheet-text">Se existir uma conta com <b>' + esc(email) + '</b>, o link chega em instantes. Olhe também a caixa de spam. ' +
    'Depois de criar a senha nova, volte aqui e entre.</p>' +
    '<div class="btns stk">' + btn('ac-back', 'Já criei a senha, entrar') + btn('close-sheet', 'Fechar', 'ghost') + '</div>';
}
export function deleteSheet(d) {
  d = d || {};
  return sheetHead('Excluir conta') +
    '<p class="sheet-text">Isto apaga a conta <b>' + esc(ACCT.email) + '</b> e tudo o que ela guarda na nuvem: registros, ajustes, perfil e amizades. ' +
    'Os dados deste aparelho também saem. Não dá para desfazer.</p>' + pwIn('Digite sua senha para confirmar', 'Sua senha', 'current-password') +
    errBox(d.err) + '<div class="btns stk">' + primary('ac-do-delete', 'Excluir tudo', true) + btn('close-sheet', 'Cancelar', 'ghost') + '</div>';
}
