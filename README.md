# Maré 💧

App de hidratação em pt-BR (PWA). Funciona offline e sem conta; a nuvem (sincronização e lembretes por push) é opcional e usa Firebase.

**No ar:** https://chrismello0211.github.io/mare/

**Versão 1.1.1:** **avisos por push dos amigos** (pedido de amizade, pedido aceito e aceno de "oi" ou "parabéns" chegam no celular, com o app fechado). Vem da Cloud Function nova `onFriendship`, então **esta versão tem um passo de publicação a mais** (comando abaixo). Detalhes na Parte 10 do [`HANDOFF.md`](HANDOFF.md).

**Versão 1.1.0:** insígnias do mar (uma coleção de bichinhos que se desbloqueia com os litros de água acumulados) e **amigos** (opcional, por código, sem ranking e sem volumes). Detalhes na Parte 9 do [`HANDOFF.md`](HANDOFF.md).

## Como publicar uma versão nova

1. Envie os arquivos alterados para a branch `main` (GitHub → *Add file* → *Upload files*, ou `git push`).
2. A aba **Actions** publica a pasta `public/` sozinha, em cerca de 1 minuto. Se falhar, a mensagem diz qual arquivo está faltando.
3. A cada versão nova, aumente `VERSION` em `public/sw.js` **e** `APP_VERSION` em `public/js/app.js` (os dois iguais). É isso que faz o aparelho mostrar "Nova versão disponível".

Configuração única já feita: *Settings → Pages → Source = GitHub Actions*.

**O push na `main` publica só o site.** As Cloud Functions e as regras do Firestore são publicadas à parte (seção Firebase). Na 1.1.1 isso é obrigatório para os avisos dos amigos funcionarem.

## Rodar no computador

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # lógica (Vitest)
npm run test:rules   # regras do Firestore, camada de amigos e a função de avisos (emulador local, sem Java)
npm run test:e2e     # interface em vários aparelhos (Playwright)
npm run art          # regenera os desenhos das insígnias (public/js/art.js; não edite esse arquivo à mão)
```

## Firebase

Projeto `mare-hidratacao` (login anônimo, Firestore em `southamerica-east1`, push web, plano Blaze). As regras de segurança estão em `firestore.rules`. **O push na `main` publica só o site, não as regras nem as funções.** Quando `firestore.rules` ou `functions/` mudarem, publique-os no Cloud Shell (https://shell.cloud.google.com/?project=mare-hidratacao, já logado):

```bash
cd ~/mare && git pull && cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules --project mare-hidratacao
```

(Na primeira vez, `git clone https://github.com/chrismello0211/mare.git ~/mare` antes.) Sem as regras novas o app funciona, só não liga os amigos (1.1.0) nem grava a escolha de avisos (1.1.1). Sem a função nova, o site funciona normalmente e os pedidos e acenos continuam aparecendo ao abrir o app; só não chega o push.

Cloud Functions (`functions/`, exigem o plano Blaze): `sendReminders` (lembretes de água, a cada 15 min) e `onFriendship` (1.1.1; avisa por push quando alguém pede amizade, aceita ou acena). Para conferir depois de publicar: Firebase → *Functions* deve listar as duas, e os registros de `onFriendship` dizem `aviso de amigos` a cada push enviado (ou `aviso de amigos não enviado`, com o motivo).

Tudo o que precisa saber para continuar o projeto está em [`HANDOFF.md`](HANDOFF.md).
