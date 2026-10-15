# Maré 💧

App de hidratação em pt-BR (PWA). Funciona offline e sem conta; a nuvem (sincronização e lembretes por push) é opcional e usa Firebase.

**No ar:** https://chrismello0211.github.io/mare/

## Como publicar uma versão nova

1. Envie os arquivos alterados para a branch `main` (GitHub → *Add file* → *Upload files*, ou `git push`).
2. A aba **Actions** publica a pasta `public/` sozinha, em cerca de 1 minuto. Se falhar, a mensagem diz qual arquivo está faltando.
3. A cada versão nova, aumente `VERSION` em `public/sw.js` **e** `APP_VERSION` em `public/js/app.js` (os dois iguais). É isso que faz o aparelho mostrar "Nova versão disponível".

Configuração única já feita: *Settings → Pages → Source = GitHub Actions*.

## Rodar no computador

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # lógica (Vitest)
npm run test:e2e     # interface em vários aparelhos (Playwright)
```

## Firebase

Projeto `mare-hidratacao` (login anônimo, Firestore em `southamerica-east1`, push web). As regras de segurança estão em `firestore.rules`. Os lembretes por push dependem da Cloud Function `sendReminders` (`functions/`), que exige o plano Blaze.

Tudo o que precisa saber para continuar o projeto está em [`HANDOFF.md`](HANDOFF.md).
