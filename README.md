# Maré 💧

App de hidratação em pt-BR (PWA). Funciona offline e sem conta; a nuvem (sincronização e lembretes por push) é opcional e usa Firebase.

**No ar:** https://chrismello0211.github.io/mare/

**Versão 1.2.0:** **uma turma só, com ranking.** Quem aceita um pedido junta as turmas (todo mundo vê todo mundo), a aba Amigos virou um ranking com três visões (Hoje, Semana, Sequência), pódio e aceno, e a **meta em ml** do amigo pode aparecer (opcional, a pessoa escolhe). O número vermelho no ícone saiu (era os copos que faltavam, não notificações). Chegam também o **horário de silêncio** (avisos esperam a pessoa acordar), o aviso opcional de **"um amigo bateu a meta"** e o **resumo da semana da turma** (domingo, 19h). Como as funções novas precisam ser publicadas, **esta versão tem um passo de publicação a mais** (seção Firebase). Detalhes na Parte 11 do [`HANDOFF.md`](HANDOFF.md).

**Versão 1.1.1:** **avisos por push dos amigos** (pedido de amizade, pedido aceito e aceno de "oi" ou "parabéns" chegam no celular, com o app fechado). Vem da Cloud Function nova `onFriendship`, então **esta versão tem um passo de publicação a mais** (comando abaixo). Detalhes na Parte 10 do [`HANDOFF.md`](HANDOFF.md).

**Versão 1.1.0:** insígnias do mar (uma coleção de bichinhos que se desbloqueia com os litros de água acumulados) e **amigos** (opcional, por código; na 1.1.x sem ranking e sem volumes, o que a 1.2.0 mudou). Detalhes na Parte 9 do [`HANDOFF.md`](HANDOFF.md).

## Como publicar uma versão nova

1. Envie os arquivos alterados para a branch `main` (GitHub → *Add file* → *Upload files*, ou `git push`).
2. A aba **Actions** publica a pasta `public/` sozinha, em cerca de 1 minuto. Se falhar, a mensagem diz qual arquivo está faltando.
3. A cada versão nova, aumente `VERSION` em `public/sw.js` **e** `APP_VERSION` em `public/js/app.js` (os dois iguais). É isso que faz o aparelho mostrar "Nova versão disponível".

Configuração única já feita: *Settings → Pages → Source = GitHub Actions*.

**O push na `main` publica só o site.** As Cloud Functions e as regras do Firestore são publicadas à parte (seção Firebase). Na 1.1.1 e na 1.2.0 isso é obrigatório para os avisos dos amigos e a turma única funcionarem.

## Rodar no computador

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # lógica (Vitest)
npm run test:rules   # regras do Firestore, camada de amigos, turma única, horário de silêncio e as funções de avisos (emulador local, sem Java)
npm run test:e2e     # interface em vários aparelhos (Playwright)
npm run art          # regenera os desenhos das insígnias (public/js/art.js; não edite esse arquivo à mão)
```

## Firebase

Projeto `mare-hidratacao` (login anônimo, Firestore em `southamerica-east1`, push web, plano Blaze). As regras de segurança estão em `firestore.rules`. **O push na `main` publica só o site, não as regras nem as funções.** Quando `firestore.rules` ou `functions/` mudarem, publique-os no Cloud Shell (https://shell.cloud.google.com/?project=mare-hidratacao, já logado):

```bash
cd ~/mare && git pull && cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules --project mare-hidratacao
```

(Na primeira vez, `git clone https://github.com/chrismello0211/mare.git ~/mare` antes.) Sem as regras novas o app funciona, só não liga os amigos (1.1.0), não grava a escolha de avisos (1.1.1) nem a meta em ml e os avisos opcionais (1.2.0). Sem as funções novas, o site funciona normalmente e os pedidos e acenos continuam aparecendo ao abrir o app; só não chega o push e as turmas não se completam sozinhas. Na primeira vez que `onProfile` (gatilho novo da 1.2.0) for publicado, o Google pode recusar com `Permission denied while using the Eventarc Service Agent`: espere uns 4 minutos e rode o mesmo comando de novo.

Cloud Functions (`functions/`, exigem o plano Blaze), seis desde a 1.2.0:

- `sendReminders`: lembretes de água, a cada 15 min.
- `onFriendship`: avisa por push quando alguém pede amizade, aceita ou acena (1.1.1) e **junta as turmas** quando um pedido vira amizade (1.2.0).
- `onProfile`: aviso opcional de "um amigo bateu a meta" (1.2.0).
- `flushHeld`: a cada 15 min, entrega os avisos que esperavam a pessoa acordar (1.2.0).
- `weeklyCrew`: de hora em hora, manda o resumo da semana a quem está no domingo, 19h (1.2.0).
- `reconcileNetworks`: todo dia às 03:30 (Brasília), confere as turmas e completa o que faltar (1.2.0).

Para conferir depois de publicar: `firebase functions:list` (ou Firebase → *Functions*) deve listar as seis; os registros de `onFriendship` dizem `aviso de amigos` a cada push enviado (ou `aviso de amigos não enviado`, com o motivo) e `turma única` quando uma turma cresce.

**Uma vez, depois da primeira publicação da 1.2.0:** force a execução de `reconcileNetworks` (Cloud Scheduler → o trabalho `firebase-schedule-reconcileNetworks-southamerica-east1` → *Forçar execução*) para que as amizades que já existiam virem uma turma na hora, e não só às 03:30. Avise o grupo antes: se A é amigo de B e de C, B e C passam a ser amigos entre si.

Tudo o que precisa saber para continuar o projeto está em [`HANDOFF.md`](HANDOFF.md).
