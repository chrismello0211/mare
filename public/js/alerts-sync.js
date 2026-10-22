// Maré — escolhas de aviso dos amigos na nuvem: leva S.social.push, S.social.hit e S.social.week para users/{uid}.social, que as funções
// (functions/) consultam antes de mandar um push: push = "Avisos dos amigos" (1.1.1), hit = "Avisar quando um amigo bater a meta" e
// week = "Resumo da semana da turma" (1.2.0). Fica num módulo à parte, com o SDK recebido pronto (como social-cloud.js), para rodar
// igual no navegador (firebase.js, SDK do CDN) e nos testes (tests/rules/alerts-sync.test.js, SDK do npm, emulador e regras de verdade).
//
// As regras do jogo:
//  • só quem usa os amigos neste aparelho (social.on) grava alguma coisa;
//  • só grava quando alguma escolha difere do que o servidor já assume (ASSUME: push ligado, hit desligado, week ligado). Quem nunca mexeu
//    nunca grava e, se as regras novas ainda não estiverem publicadas, a recusa não atrapalha mais nada: esta gravação é à parte da dos lembretes;
//  • cada gravação leva as TRÊS escolhas (e não só a que mudou): assim, mesmo que uma gravação falhe e a seguinte passe, a nuvem fica com o
//    estado completo e a marca nunca mente;
//  • a marca (mark.social, guardada no aparelho) só muda quando o servidor confirma. Se falhar, a próxima chamada tenta de novo.
//    Antes da 1.2.0 a marca era só um booleano (a chave push): knownOf() ainda lê essa forma;
//  • "sent" = o que já foi pedido nesta abertura e ainda não voltou: não repete o mesmo pedido e não perde a mudança de ideia no meio.
//
// d = { FS, uref, state: () => S, mark: () => marca viva, saveMark: () => void, warn: (erro) => void }
export const ASSUME = { push: true, hit: false, week: true };
const KEYS = ['push', 'hit', 'week'];
// As escolhas de S.social como as funções as entendem: só um false (push, week) ou um true (hit) de verdade conta; o resto vale o padrão
export const wantOf = (sc) => ({ push: sc.push !== false, hit: sc.hit === true, week: sc.week !== false });
// O que a nuvem já sabe, a partir da marca guardada (booleano antigo, objeto novo ou nada)
export function knownOf(m) {
  const o = m && typeof m === 'object' ? m : null;
  return { push: o ? o.push !== false : m !== false, hit: o ? o.hit === true : ASSUME.hit, week: o ? o.week !== false : ASSUME.week };
}
export function createAlertsSync(d) {
  let sent;
  return {
    push: function () {
      const sc = d.state().social;
      if (!sc || sc.on !== true) return;
      const mark = d.mark(), want = wantOf(sc), last = sent !== undefined ? sent : knownOf(mark.social);
      if (KEYS.every(function (k) { return want[k] === last[k]; })) return;
      sent = want;
      d.FS.setDoc(d.uref, { social: { push: want.push, hit: want.hit, week: want.week }, updatedAt: d.FS.serverTimestamp() }, { merge: true })
        .then(function () { mark.social = { push: want.push, hit: want.hit, week: want.week }; d.saveMark(); }, function (e) { sent = undefined; d.warn(e); });
    },
    // apagar tudo na nuvem: nada do que foi pedido vale mais
    reset: function () { sent = undefined; },
  };
}
