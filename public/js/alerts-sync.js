// Maré — "Avisos dos amigos" (1.1.1) na nuvem: leva a escolha S.social.push para users/{uid}.social.push, que a função onFriendship
// (functions/) consulta antes de mandar um push. Fica num módulo à parte, com o SDK recebido pronto (como social-cloud.js), para rodar
// igual no navegador (firebase.js, SDK do CDN) e nos testes (tests/rules/alerts-sync.test.js, SDK do npm, emulador e regras de verdade).
//
// As regras do jogo:
//  • só quem usa os amigos neste aparelho (social.on) grava alguma coisa;
//  • só grava quando a escolha difere do que o servidor já assume: "ligado" (sem o campo, vale ligado). Quem nunca mexeu nunca grava e,
//    se as regras novas ainda não estiverem publicadas, a recusa não atrapalha mais nada: esta gravação é à parte da dos lembretes;
//  • a marca (mark.social, guardada no aparelho) só muda quando o servidor confirma. Se falhar, a próxima chamada tenta de novo;
//  • "sent" = o que já foi pedido nesta abertura e ainda não voltou: não repete o mesmo pedido e não perde a mudança de ideia no meio.
//
// d = { FS, uref, state: () => S, mark: () => marca viva, saveMark: () => void, warn: (erro) => void }
export function createAlertsSync(d) {
  let sent;
  return {
    push: function () {
      const sc = d.state().social;
      if (!sc || sc.on !== true) return;
      const mark = d.mark(), want = sc.push !== false, last = sent !== undefined ? sent : mark.social !== false;
      if (want === last) return;
      sent = want;
      d.FS.setDoc(d.uref, { social: { push: want }, updatedAt: d.FS.serverTimestamp() }, { merge: true })
        .then(function () { mark.social = want; d.saveMark(); }, function (e) { sent = undefined; d.warn(e); });
    },
    // apagar tudo na nuvem: nada do que foi pedido vale mais
    reset: function () { sent = undefined; },
  };
}
