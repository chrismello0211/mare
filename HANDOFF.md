# Maré — PWA de hidratação · Handoff para o Claude Code

Leia este arquivo inteiro antes de alterar o código. Ele explica o que está pronto, as decisões tomadas e o que falta. O código foi entregue em 5 partes numa conversa; se algum arquivo da estrutura abaixo estiver faltando, peça ao usuário.

## O que é

PWA de hidratação em pt-BR, pensado para ir às lojas depois (via Capacitor). Funciona 100% offline e sem conta (local-first). O Firebase é uma camada OPCIONAL de sincronização e push: o app nunca depende dele para funcionar. Enquanto `FIREBASE_ENABLED = false`, nada do Firebase é carregado.

## Diferenciais de produto (o porquê das coisas)

- Ritmo do dia: além da meta, calcula quanto a pessoa deveria ter bebido até agora (curva levemente adiantada entre acordar e 1h antes de dormir) e mostra "+200 ml à frente" ou "300 ml abaixo do ritmo".
- Lembretes inteligentes: só dentro da janela acordada, pausam ao bater a meta, ficam mais frequentes quando a pessoa está atrás do ritmo (modo adaptativo). Cada gole reagenda o próximo lembrete.
- Ação na notificação (Android): botão "+250 ml" registra sem abrir o app (SW → IndexedDB → o app drena ao abrir).
- Meta: peso × 35 ml + atividade + clima do dia (opcional, Open-Meteo, 1 consulta/dia, coordenadas arredondadas).
- 10 bebidas com fator de hidratação; álcool conta 0 e sugere um copo de água.
- Registro retroativo, missões diárias, 12 medalhas, 8 níveis temáticos, sequência de dias.
- Insights locais: período mais seco do dia, melhor dia da semana, % da água antes do meio-dia, semana vs. semana anterior.
- Visual: gota SVG com ondas, texto "líquido", gota caindo + respingo a cada registro, confete na meta, tema claro/escuro, respeita "reduzir movimento".
- Plano B sem push: exporta lembretes recorrentes para o calendário (.ics).
- Atalhos no ícone (Android), badge com copos restantes, backup JSON, voltar do Android fecha painéis.

## Decisões técnicas

Vanilla JS com ES modules e sem etapa de build: zero dependências em runtime, abre rápido em aparelhos antigos e embrulha fácil no Capacitor. Se quiser Vite depois, a divisão em módulos já está pronta.

Compatibilidade: o código evita de propósito `?.`, `??`, `gap` em flexbox, `aspect-ratio`, `structuredClone`, `inset` e `clamp()`. A meta é rodar em iOS 12.2+ e Chrome 70+. Push exige iOS 16.4+ com o app instalado na Tela de Início. Não "modernize" a sintaxe sem considerar isso.

Dados: o estado inteiro fica em `localStorage` (chave `mare:v1`). IndexedDB é usado só pelo Service Worker, como caixa de entrada das ações de notificação. O local é a fonte da verdade. Com Firebase ligado, os dias alterados são enviados com debounce, e o Firestore usa cache persistente offline.

Notificações: na web não existe agendamento local com o app fechado. Por isso o push vem do servidor: uma Cloud Function roda a cada 15 min e consulta usuários com `reminder.nextAt <= agora`. As mensagens são "data-only" e o nosso `sw.js` monta a notificação (com ações). Não use `firebase-messaging-sw.js`. Sem Firebase, os lembretes funcionam apenas com o app aberto, e o .ics serve de plano B.

Atualizações: o SW é versionado e a página mostra o aviso "Nova versão disponível → Atualizar". A cada deploy, aumente `VERSION` em `public/sw.js` e `APP_VERSION` em `public/js/app.js`.

## Estrutura

```text
mare/
├── HANDOFF.md
├── package.json              # dev: serve, vitest, playwright, sharp
├── playwright.config.js
├── firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
├── scripts/icons.mjs         # gera PNGs a partir do SVG
├── public/                   # ← raiz publicada no Hosting
│   ├── index.html  manifest.webmanifest  sw.js
│   ├── css/app.css
│   ├── icons/icon.svg        # PNGs gerados por scripts/icons.mjs
│   └── js/ app.js  core.js  platform.js  firebase.js  firebase-config.js
├── functions/  package.json  index.js
└── tests/  core.test.js  e2e.spec.js
```

## Modelo de dados

```text
localStorage "mare:v1"
{ v, onboarded, createdAt,
  profile:{ name, weight, activity, wake:"07:00", sleep:"23:00", unit:"ml|oz", theme:"auto|light|dark" },
  goal:{ mode:"auto|manual", manual, climate, bonus, temp, day },
  cups:[150,250,350,500], last,
  reminders:{ enabled, interval, smart, nextAt },
  days:{ "AAAA-MM-DD": { goal, entries:[{ id, t(ms), ml, d(drinkId) }] } },
  achievements:{ id: ts }, missions:{ "AAAA-MM-DD": 1 }, ui:{} }

Firestore
users/{uid}: name, tz, wake, sleep, unit, goal, today:{day, ml},
             reminder:{enabled, interval, smart, nextAt(Timestamp), lastSentAt},
             fcm:{ <hash>: {token, ua, at} }, stats:{streak, best, totalMl, level}, updatedAt
users/{uid}/days/{AAAA-MM-DD}: goal, total, entries[], updatedAt
```

## Checklist

### 1. Montar e validar (fazer primeiro)
- [ ] Criar todos os arquivos nos caminhos exatos.
- [ ] `npm install` → `npx playwright install` → `npm test` → `npm run test:e2e`.
      ATENÇÃO: o código ainda não foi executado nenhuma vez. Corrija o que falhar antes de qualquer outra coisa.
- [ ] Revisar os screenshots em `test-results/shots/` (aparelhos pequenos e grandes, antigos e novos).
- [ ] `npm run icons` para gerar icon-192, icon-512, maskable-512, apple-touch-icon (180) e badge-72.
- [ ] Lighthouse mobile (PWA, Performance, Acessibilidade) e corrigir apontamentos.
- [ ] Teste em aparelho real: SW exige HTTPS. Use um preview channel do Firebase Hosting
      (`firebase hosting:channel:deploy teste`) ou um túnel (`npx cloudflared tunnel --url http://localhost:5173`).
      Para iOS 12–15, BrowserStack ou aparelhos reais.

### 2. Firebase
- [ ] Criar o projeto no plano Blaze (Functions e Cloud Scheduler exigem).
- [ ] Authentication → habilitar o provedor Anônimo.
- [ ] Firestore em `southamerica-east1` (ou outra região, que deve ser a mesma de `functions/index.js`).
- [ ] Cloud Messaging → Web Push certificates → gerar a chave VAPID.
- [ ] Preencher `public/js/firebase-config.js`, mudar `FIREBASE_ENABLED` para `true` e ajustar `.firebaserc`.
- [ ] Confirmar a versão atual do Firebase JS SDK e atualizar a constante `V` em `public/js/firebase.js`.
- [ ] `firebase deploy --only firestore,functions,hosting`.
- [ ] Testar push no Android Chrome (com a ação "+250 ml") e no iPhone iOS 16.4+ com o app instalado.

### 3. Antes das lojas
- [ ] Vincular a conta anônima a Google/Apple (`linkWithCredential`) para multi-aparelho e restauração.
- [ ] Política de privacidade (LGPD) e termos; consentimento antes de Analytics, se for usar.
- [ ] Ligar "Apagar meus dados" à exclusão no Firestore e ao `deleteUser` (exigência da Apple se houver conta).
- [ ] Firebase App Check.
- [ ] Android: TWA via Bubblewrap/PWABuilder (rápido, exige `/.well-known/assetlinks.json`) ou Capacitor.
- [ ] iOS: Capacitor. A Apple tende a recusar "site embrulhado" (diretriz 4.2); recursos nativos resolvem isso:
      `@capacitor/local-notifications` (lembretes agendados sem servidor), `@capacitor/haptics`,
      push nativo, Apple Saúde/Health Connect e widgets. O ponto de troca é `public/js/platform.js` (`isNative()`).
- [ ] Screenshots no manifest (instalação rica no Android) e nas lojas; podem sair do Playwright.

## Limitações conhecidas
- iOS: push só com o app instalado na Tela de Início e iOS 16.4+. Ações na notificação não existem no iOS (tocar abre o app).
- Sem Firebase, lembretes só disparam com o app aberto ou recém-minimizado. Para isso existe o .ics.
- Safari pode apagar dados de sites não instalados após ~7 dias sem uso. Instalado na Tela de Início, isso não acontece; por isso o app incentiva a instalação.
- Open-Meteo é grátis só para uso não comercial. No lançamento comercial, assine o plano ou troque o provedor.
- Atalhos do ícone e a ação "+250 ml" são apenas Android. O badge depende do sistema.
- Fatores de hidratação e a fórmula de meta são heurísticas, não orientação médica (há aviso nos Ajustes).

## Roadmap sugerido
- Endpoint `quickLog` (HTTPS + token HMAC curto no payload do push) para a ação da notificação sincronizar na hora.
- Resumo semanal por push (domingo 19h); i18n (en/es) extraindo as strings para um dicionário.
- Widgets nativos (WidgetKit/Glance) com o nível da maré; Apple Watch/Wear OS; Siri/App Intents.


## Adendo — Parte 4 (Service Worker e Firebase)

### Como funciona
- **Push:** o app grava `reminder.nextAt` (Timestamp) no Firestore. A function `sendReminders` faz o seguinte:
  - envia só "data" para os tokens do usuário;
  - calcula o próximo horário no fuso dele (`tz`) e grava `nextAt` e `lastSentAt`;
  - remove tokens inválidos.
- **Sincronização:** grava primeiro no aparelho e envia à nuvem com debounce de 1,5 s, ou na hora em que o app vai para segundo plano.
  - Na abertura, traz da nuvem só o que mudou (`updatedAt > pullAt`).
  - Também reenvia o que mudou offline (`u > pushAt`).
  - Os marcadores ficam em `localStorage` "mare:cloud".
- **Privacidade:** nome e localização não vão para a nuvem. Vão horários, fuso, unidade, meta, total do dia, registros e estatísticas.

### Atenção
- **Desenvolvimento:** o SW serve tudo do cache. Use DevTools → Application → Service Workers → "Update on reload" ou aumente `VERSION`. Em produção, aumentar `VERSION` a cada deploy é obrigatório.
- **Push silencioso:** o iOS exige uma notificação visível para cada push. O `sw.js` sempre mostra uma; nunca envie push silencioso.
- **"+250 ml" pelo push:** o registro só chega à nuvem quando o app abre. Até lá o servidor não sabe dele. A solução é o endpoint `quickLog` (roadmap).
- **Atraso:** o agendador roda a cada 15 min, então o lembrete pode chegar até 15 min depois. "every 5 minutes" também funciona, com custo maior mas ainda baixo.
- **Versões a confirmar antes de subir:**
  - Firebase JS SDK, fixado em 10.14.1 (constante `V` em `firebase.js`) por compatibilidade;
  - `firebase-admin` e `firebase-functions`;
  - Node 22 nas Functions.
- **Chave de API:** se restringi-la no Google Cloud, libere Identity Toolkit, Token Service, Cloud Firestore, FCM Registration e Firebase Installations.
- **Hosting:** o `ignore` do hosting não exclui arquivos com ponto, para `/.well-known/assetlinks.json` (TWA) ser publicado.
- **CSP (a fazer):** permitir scripts de `www.gstatic.com` e conexões para `*.googleapis.com` e `api.open-meteo.com`. O `index.html` tem 2 scripts inline, então use hash.

### Testar
- **Emulators:** `cd functions && npm install`, depois `firebase emulators:start`, com `USE_EMULATORS = true` em localhost.
- **Push real:** Android Chrome e iPhone (iOS 16.4+, app instalado). Para forçar um envio, edite `users/{uid}.reminder.nextAt` para um horário passado e rode o job no Cloud Scheduler ("Forçar execução").
- **Regras:** com `@firebase/rules-unit-testing`, confirmar que um usuário não lê nem escreve dados de outro.


## Adendo — Parte 5 (testes, ícones e scripts)

### Rodar, nesta ordem
1. Aplicar a correção do sw.js:
   - SHELL passa a ser `new URL('./', self.location).href`;
   - em CORE, `'./index.html'` vira `'./'`.
   Motivo: servidores com "clean URLs" redirecionam /index.html para /, e o SW não pode usar resposta redirecionada numa navegação.
2. `npm install` e depois `npx playwright install` (baixa o Chromium e o WebKit).
3. `npm run icons`: gera icon-192, icon-512, maskable-512, apple-touch-icon e badge-72.
4. `npm test`: testes de lógica (Vitest).
5. `npm run test:e2e`: interface em 8 aparelhos.
   - O relatório abre com `npx playwright show-report`.
   - Os screenshots de cada aba e aparelho ficam em test-results/shots/.
6. `npm run dev`: abre o app em http://localhost:5173.
7. Para o deploy, instale a CLI do Firebase com `npm i -g firebase-tools`.

### O que os testes cobrem
- Lógica:
  - datas, incluindo virada de mês e de ano e ano bissexto;
  - fatores das bebidas;
  - meta (limites e arredondamento) e bônus de clima;
  - janela do dia e curva do ritmo;
  - 7 cenários de lembrete;
  - sequência, níveis, missões e medalhas;
  - estatísticas e insights;
  - formatação pt-BR, migração de estado e .ics.
- Interface, em todos os aparelhos:
  - onboarding com "voltar";
  - registrar e desfazer;
  - histórico retroativo, edição e exclusão;
  - comemoração da meta;
  - onças e tema escuro;
  - botão voltar do Android e atalho ?add=;
  - movimento reduzido;
  - layout sem rolagem lateral e alvos de toque de pelo menos 44 px;
  - abrir offline com o SW (só no Chromium).
- Qualquer erro de JavaScript na página reprova o teste.

### Lacunas (próximos passos)
- views.js e ui.js dependem do DOM e só são cobertos pelo e2e. Se quiser teste de unidade, use Vitest com jsdom.
- functions/index.js replica a lógica do core.js. Extraia nextAt, local e windowOf para um módulo e teste a paridade com core.nextReminderAt.
- Backup, .ics e push precisam de teste manual no Android e no iPhone.
- O Playwright usa o WebKit atual. Para iOS 12–15, Android antigo e iPhone físico (iOS 16.4+ instalado), use BrowserStack ou aparelhos reais.


## Adendo — Parte 3 (PENDENTE)

Os arquivos `public/js/app.js`, `public/js/store.js`, `public/js/ui.js` e `public/js/views.js` (Parte 3 da conversa original) **não estavam no texto usado para montar esta pasta**. Sem eles o app não abre, e `tests/core.test.js` falha ao importar `store.js` (`esc`, `num`, `plural`, `shiftYm`). O adendo original da Parte 3 (contrato `initCloud(hooks)` com `state`, `onRemote`, `onStatus`) também está faltando. Recuperar esses arquivos antes de rodar qualquer teste.
