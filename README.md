# Maré 💧

App de hidratação em pt-BR (PWA). Funciona offline e sem conta; a nuvem (sincronização e lembretes por push) é opcional e usa Firebase.

**No ar:** https://chrismello0211.github.io/mare/

**Versão 1.3.0:** **conta com e-mail e senha (opcional).** Em Ajustes → Conta, "Criar conta" liga um e-mail e uma senha ao aparelho **sem mudar nada do que já existe** (registros, amigos e turma ficam onde estavam), e quem tem conta guarda também o nome, o peso e os ajustes na nuvem. **Celular novo, quebrado ou perdido:** "Entrar na conta" na primeira tela traz tudo de volta. Há também "Sair da conta" e "Excluir conta", e ferramentas para o administrador **recuperar a conta de quem nunca criou uma** (`scripts/admin/`, Cloud Shell). Esta versão **não muda as funções**, mas tem dois passos de publicação a mais: **ligar o login por e-mail** no console do Firebase e **publicar as regras** (seção Firebase). Detalhes na Parte 12 do [`HANDOFF.md`](HANDOFF.md).

**Versão 1.2.0:** **uma turma só, com ranking.** Quem aceita um pedido junta as turmas (todo mundo vê todo mundo), a aba Amigos virou um ranking com três visões (Hoje, Semana, Sequência), pódio e aceno, e a **meta em ml** do amigo pode aparecer (opcional, a pessoa escolhe). O número vermelho no ícone saiu (era os copos que faltavam, não notificações). Chegam também o **horário de silêncio** (avisos esperam a pessoa acordar), o aviso opcional de **"um amigo bateu a meta"** e o **resumo da semana da turma** (domingo, 19h). Como as funções novas precisam ser publicadas, **esta versão tem um passo de publicação a mais** (seção Firebase). Detalhes na Parte 11 do [`HANDOFF.md`](HANDOFF.md).

**Versão 1.1.1:** **avisos por push dos amigos** (pedido de amizade, pedido aceito e aceno de "oi" ou "parabéns" chegam no celular, com o app fechado). Vem da Cloud Function nova `onFriendship`, então **esta versão tem um passo de publicação a mais** (comando abaixo). Detalhes na Parte 10 do [`HANDOFF.md`](HANDOFF.md).

**Versão 1.1.0:** insígnias do mar (uma coleção de bichinhos que se desbloqueia com os litros de água acumulados) e **amigos** (opcional, por código; na 1.1.x sem ranking e sem volumes, o que a 1.2.0 mudou). Detalhes na Parte 9 do [`HANDOFF.md`](HANDOFF.md).

## Como publicar uma versão nova

1. Envie os arquivos alterados para a branch `main` (GitHub → *Add file* → *Upload files*, ou `git push`).
2. A aba **Actions** publica a pasta `public/` sozinha, em cerca de 1 minuto. Se falhar, a mensagem diz qual arquivo está faltando.
3. A cada versão nova, aumente `VERSION` em `public/sw.js` **e** `APP_VERSION` em `public/js/app.js` (os dois iguais). É isso que faz o aparelho mostrar "Nova versão disponível".

Configuração única já feita: *Settings → Pages → Source = GitHub Actions*.

**O push na `main` publica só o site.** As Cloud Functions e as regras do Firestore são publicadas à parte (seção Firebase). Na 1.1.1 e na 1.2.0 isso é obrigatório para os avisos dos amigos e a turma única funcionarem; na 1.3.0, para o backup dos ajustes da conta (e o login por e-mail precisa ser ligado no console).

## Rodar no computador

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # lógica (Vitest)
npm run test:rules   # regras do Firestore, camada de amigos, turma única, horário de silêncio, funções de avisos, a conta e as ferramentas do administrador (emulador local, sem Java)
npm run test:e2e     # interface em vários aparelhos (Playwright)
npm run art          # regenera os desenhos das insígnias (public/js/art.js; não edite esse arquivo à mão)
```

## Firebase

Projeto `mare-hidratacao` (login anônimo e, desde a 1.3.0, **e-mail e senha**; Firestore em `southamerica-east1`, push web, plano Blaze). **Para a conta funcionar, ligue o provedor** (já ligado em 23/10/2026) em [Authentication → Método de login](https://console.firebase.google.com/project/mare-hidratacao/authentication/providers) → *E-mail/senha* (só a primeira opção; "link por e-mail" fica desligado). As regras de segurança estão em `firestore.rules`. **O push na `main` publica só o site, não as regras nem as funções.** Quando `firestore.rules` ou `functions/` mudarem, publique-os no Cloud Shell (https://shell.cloud.google.com/?project=mare-hidratacao, já logado):

```bash
cd ~/mare && git pull && cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules --project mare-hidratacao
```

(Na primeira vez, `git clone https://github.com/chrismello0211/mare.git ~/mare` antes.) Sem as regras novas o app funciona, só não liga os amigos (1.1.0), não grava a escolha de avisos (1.1.1), nem a meta em ml e os avisos opcionais (1.2.0), nem o backup dos ajustes da conta (1.3.0). **A 1.3.0 não muda nenhuma função:** basta `firebase deploy --only firestore:rules --project mare-hidratacao` (as regras da 1.3.0 já foram publicadas em 23/10/2026, pelo console). Sem as funções novas, o site funciona normalmente e os pedidos e acenos continuam aparecendo ao abrir o app; só não chega o push e as turmas não se completam sozinhas. Na primeira vez que `onProfile` (gatilho novo da 1.2.0) for publicado, o Google pode recusar com `Permission denied while using the Eventarc Service Agent`: espere uns 4 minutos e rode o mesmo comando de novo.

Cloud Functions (`functions/`, exigem o plano Blaze), seis desde a 1.2.0:

- `sendReminders`: lembretes de água, a cada 15 min.
- `onFriendship`: avisa por push quando alguém pede amizade, aceita ou acena (1.1.1) e **junta as turmas** quando um pedido vira amizade (1.2.0).
- `onProfile`: aviso opcional de "um amigo bateu a meta" (1.2.0).
- `flushHeld`: a cada 15 min, entrega os avisos que esperavam a pessoa acordar (1.2.0).
- `weeklyCrew`: de hora em hora, manda o resumo da semana a quem está no domingo, 19h (1.2.0).
- `reconcileNetworks`: todo dia às 03:30 (Brasília), confere as turmas e completa o que faltar (1.2.0).

Para conferir depois de publicar: `firebase functions:list` (ou Firebase → *Functions*) deve listar as seis; os registros de `onFriendship` dizem `aviso de amigos` a cada push enviado (ou `aviso de amigos não enviado`, com o motivo) e `turma única` quando uma turma cresce.

**Uma vez, depois da primeira publicação da 1.2.0:** force a execução de `reconcileNetworks` (Cloud Scheduler → o trabalho `firebase-schedule-reconcileNetworks-southamerica-east1` → *Forçar execução*) para que as amizades que já existiam virem uma turma na hora, e não só às 03:30. Avise o grupo antes: se A é amigo de B e de C, B e C passam a ser amigos entre si.

## Recuperar a conta de quem perdeu o celular

Quem **nunca criou conta** e perdeu o aparelho ainda tem os registros na nuvem, presos a um identificador que só o celular sabia. O administrador liga o e-mail da pessoa a esse identificador (`scripts/admin/attach-email.mjs`, no Cloud Shell) e, no aparelho novo, ela usa **Entrar na conta → Esqueci a senha**, cria a senha e volta com registros, amigos e turma. Passo a passo e comandos: [`scripts/admin/LEIA-ME.md`](scripts/admin/LEIA-ME.md); a visão geral está na Parte 12 do [`HANDOFF.md`](HANDOFF.md).

Tudo o que precisa saber para continuar o projeto está em [`HANDOFF.md`](HANDOFF.md).
