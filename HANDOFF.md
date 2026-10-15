# Maré — PWA de hidratação · Handoff para o Claude Code

Leia este arquivo inteiro antes de alterar o código. Ele explica o que está pronto, as decisões tomadas e o que falta. O código foi entregue em 5 partes numa conversa. **O estado real hoje (Firebase criado, GitHub Pages, correções feitas e o que falta) está no "Adendo — Parte 6", as bebidas da versão 1.0.2 (água na meta, outros líquidos à parte) estão no "Adendo — Parte 7" e o interruptor opcional "Somar outros líquidos na meta" da versão 1.0.3 está no "Adendo — Parte 8", todos no final.** Onde as seções antigas dizem "ainda não foi executado", "criar o projeto" ou falam de fatores de hidratação, vale o adendo.

## O que é

PWA de hidratação em pt-BR, pensado para ir às lojas depois (via Capacitor). Funciona 100% offline e sem conta (local-first). O Firebase é uma camada OPCIONAL de sincronização e push: o app nunca depende dele para funcionar. Enquanto `FIREBASE_ENABLED = false`, nada do Firebase é carregado.

## Diferenciais de produto (o porquê das coisas)

- Ritmo do dia: além da meta, calcula quanto a pessoa deveria ter bebido até agora (curva levemente adiantada entre acordar e 1h antes de dormir) e mostra "+200 ml à frente" ou "300 ml abaixo do ritmo".
- Lembretes inteligentes: só dentro da janela acordada, pausam ao bater a meta, ficam mais frequentes quando a pessoa está atrás do ritmo (modo adaptativo). Cada gole reagenda o próximo lembrete.
- Ação na notificação (Android): botão "+250 ml" registra sem abrir o app (SW → IndexedDB → o app drena ao abrir).
- Meta: peso × 35 ml + atividade + clima do dia (opcional, Open-Meteo, 1 consulta/dia, coordenadas arredondadas).
- Só água e água com gás contam na meta. Café, chá, suco, leite, coco e isotônico ficam numa segunda gota (âmbar), em contagem à parte e opcional; refrigerante e álcool não existem mais no app (ver Parte 7). Quem preferir a meta de hidratação liga, só em Ajustes, "Somar outros líquidos na meta" (desligado de fábrica; os outros líquidos contam até metade da meta, ver Parte 8).
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
├── HANDOFF.md  README.md
├── package.json              # dev: serve, vitest, playwright, sharp
├── playwright.config.js  vitest.config.js
├── firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
├── .github/workflows/pages.yml   # publica public/ no GitHub Pages a cada push na main
├── scripts/icons.mjs         # gera PNGs a partir do SVG
├── public/                   # ← raiz publicada (GitHub Pages e, se quiser, Firebase Hosting)
│   ├── index.html  manifest.webmanifest  sw.js
│   ├── css/app.css
│   ├── icons/                # icon.svg + PNGs gerados por scripts/icons.mjs (já versionados)
│   └── js/ app.js  core.js  store.js  ui.js  views.js  platform.js  firebase.js  firebase-config.js
├── functions/  package.json  index.js
└── tests/  core.test.js  e2e.spec.js
```

## Modelo de dados

```text
localStorage "mare:v1"
{ v, onboarded, createdAt,
  profile:{ name, weight, activity, wake:"07:00", sleep:"23:00", unit:"ml|oz", theme:"auto|light|dark",
            others(bool, 2ª gota; padrão true), mix(bool, "somar outros líquidos na meta"; padrão false, só vale com others) },
  goal:{ mode:"auto|manual", manual, climate, bonus, temp, day },
  cups:[150,250,350,500], last("water|sparkling"), lastO(último "outro líquido"),
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
- [x] Criar todos os arquivos nos caminhos exatos.
- [x] `npm install` → `npm test` → `npm run test:e2e` (29 testes de lógica e 109 execuções de interface, sem falhas; ver Parte 6).
- [x] Revisar os screenshots em `test-results/shots/` (aparelhos pequenos e grandes, antigos e novos).
- [x] `npm run icons` para gerar icon-192, icon-512, maskable-512, apple-touch-icon (180) e badge-72 (os PNGs já estão no repositório).
- [ ] Lighthouse mobile (PWA, Performance, Acessibilidade) e corrigir apontamentos.
- [ ] Teste em aparelho real: SW exige HTTPS. Use um preview channel do Firebase Hosting
      (`firebase hosting:channel:deploy teste`) ou um túnel (`npx cloudflared tunnel --url http://localhost:5173`).
      Para iOS 12–15, BrowserStack ou aparelhos reais.

### 2. Firebase
- [x] Criar o projeto (`mare-hidratacao`, hoje no plano Spark). **Pendente: migrar para Blaze** (Functions e Cloud Scheduler exigem).
- [x] Authentication → habilitar o provedor Anônimo.
- [x] Firestore em `southamerica-east1` (mesma região de `functions/index.js`), regras de `firestore.rules` já publicadas.
- [x] Cloud Messaging → Web Push certificates → chave VAPID gerada e colada em `firebase-config.js`.
- [x] Preencher `public/js/firebase-config.js`, `FIREBASE_ENABLED` ligado e `.firebaserc` ajustado.
- [x] Firebase JS SDK 10.14.1 (constante `V` em `firebase.js`) carrega e faz login anônimo a partir do endereço real do GitHub Pages.
- [ ] Depois do Blaze: `firebase deploy --only firestore,functions` (e `hosting`, se quiser o endereço `web.app`). Ver Parte 6.
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
- A fórmula de meta é uma heurística, não orientação médica (há aviso nos Ajustes). Desde a 1.0.2 não há mais fatores de hidratação: a meta é de água, e os outros líquidos têm contagem própria. Na 1.0.3 há o interruptor opcional que soma os outros líquidos 1:1 até metade da meta; continua não havendo fator por bebida (ver Parte 8).

## Roadmap sugerido
- Endpoint `quickLog` (HTTPS + token HMAC curto no payload do push) para a ação da notificação sincronizar na hora.
- Resumo semanal por push (domingo 19h); i18n (en/es) extraindo as strings para um dicionário.
- Widgets nativos (WidgetKit/Glance) com o nível da maré; Apple Watch/Wear OS; Siri/App Intents.


## Adendo — Parte 3 (o app.js virou 4 módulos)

### Estrutura atualizada de public/js/
- core.js: lógica pura, coberta por testes.
- store.js: estado S, save/load, datas e unidades.
- ui.js: avisos, painel inferior, botão voltar, efeitos e gota líquida.
- views.js: HTML de todas as telas e painéis, sem efeitos colaterais.
- app.js: ponto de entrada. Ações, lembretes, clima, celebrações, onboarding e nuvem.
- platform.js: tudo que depende do navegador ou do sistema. É o ponto de troca para o Capacitor.
- firebase.js e firebase-config.js (Parte 4): carregados com import() dinâmico. Se faltarem, o app segue local.

### Contratos que a Parte 4 precisa cumprir
- firebase.js exporta initCloud(hooks), que retorna uma Promise<cloud>.
  - hooks.state() devolve o S atual.
  - hooks.onRemote(days) recebe { 'AAAA-MM-DD': { goal, entries, u } }.
  - hooks.onStatus recebe 'on', 'error' ou 'off'.
- O objeto cloud precisa ter:
  - syncDays(keys) e syncMeta(): chamados sem await, com debounce interno.
  - enablePush(): devolve Promise, é idempotente e renova o token FCM.
  - wipe(): devolve Promise.
  - push: booleano.
- sw.js:
  - Ação "add250": grava { id, t, ml, d } no IndexedDB "mare" v1, store "inbox" (keyPath id), e envia { type: 'inbox' } às janelas abertas.
  - Clique na notificação: foca uma janela aberta ou abre './?source=notif'.
  - Mensagem { type: 'SKIP_WAITING' }: chama self.skipWaiting().

### Decisões e detalhes
- Cada dia tem o campo u (ms da última alteração). A sincronização é "última gravação vence", por dia.
- As ações close-sheet, confirm-ok e toast-act são despachadas pelo app.js para as funções do ui.js. Isso corrige o comentário do topo do views.js.
- O próximo lembrete parte do último gole de hoje, então abrir o app não adia nada.
  - Sem push do servidor, um timer avisa na tela com o app aberto.
  - Com o app recém-minimizado, o timer usa a notificação do sistema.
- Clima: as coordenadas arredondadas ficam em S.ui.geo por 7 dias, para não pedir o GPS todo dia.
- Importar backup preserva os lembretes e as dicas deste aparelho. Todo o conteúdo passa por sanitize().
- iPhone: o app instalado na Tela de Início tem armazenamento separado do Safari. Por isso o app incentiva a instalação no início e orienta exportar/importar o backup.

### Testes extras
- Fluxos principais:
  - onboarding completo, com o "voltar" do Android em cada passo;
  - registrar, desfazer, editar e excluir;
  - registro retroativo pelo calendário;
  - virada do dia com o app aberto (mockar Date).
- Meta batida mostra confete e cartão. Missão e medalha aparecem uma vez só.
- Em Chrome antigo, conferir se os botões com display:flex (copos, abas, calendário) aparecem corretamente. Se não, envolver o conteúdo num span com display:flex.
- .ics no iPhone: conferir se a folha de compartilhar oferece o Calendário. Se não oferecer, abrir o arquivo por link direto quando estiver no Safari.


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
  - grupos de bebidas (água × outros líquidos) e retirada de refrigerante e álcool;
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
  - segunda gota: registrar café/chá à parte sem mexer na meta, água com gás na meta, editor de registro, interruptor em Ajustes e limpeza de dados antigos (refrigerante/álcool);
  - movimento reduzido;
  - layout sem rolagem lateral e alvos de toque de pelo menos 44 px;
  - abrir offline com o SW (só no Chromium).
- Qualquer erro de JavaScript na página reprova o teste.

### Lacunas (próximos passos)
- views.js e ui.js dependem do DOM e só são cobertos pelo e2e. Se quiser teste de unidade, use Vitest com jsdom.
- functions/index.js replica a lógica do core.js. Extraia nextAt, local e windowOf para um módulo e teste a paridade com core.nextReminderAt.
- Backup, .ics e push precisam de teste manual no Android e no iPhone.
- O Playwright usa o WebKit atual. Para iOS 12–15, Android antigo e iPhone físico (iOS 16.4+ instalado), use BrowserStack ou aparelhos reais.


## Adendo — Parte 6 (estado real em 15/10/2026: Firebase no ar, nuvem implantada e publicação no GitHub Pages)

### Onde está cada coisa
- **Repositório:** https://github.com/chrismello0211/mare (público, branch `main`).
- **App no ar:** https://chrismello0211.github.io/mare/. Quem publica é o GitHub Actions (`.github/workflows/pages.yml`), que envia a pasta `public/`. Em *Settings → Pages* a fonte é **GitHub Actions**, e não "Deploy from a branch": a raiz do repositório não tem `index.html` (o app mora em `public/`), então o modo antigo só mostrava a página em branco do Jekyll. Antes de publicar, o fluxo confere se todos os arquivos do app existem e, se faltar algum, falha dizendo qual.
- **Vários PWAs na mesma origem:** o dono publica outros apps em `chrismello0211.github.io/<app>/`. Mesma origem significa que `localStorage`, IndexedDB e Cache Storage são compartilhados. Por isso tudo do Maré tem prefixo `mare` (`mare:v1`, `mare:cloud`, cache `mare-<versão>`, banco IndexedDB `mare`), e o manifest tem `"id": "/mare/"` (com `"/"` o Chrome trataria os apps como o mesmo app). Não retire esses prefixos.
- **Caches apagados por outros apps (resolvido na 1.0.1):** os Service Workers de `domino-da-galera`, `caca-palavras-da-galera` e `pontual` apagam, ao ativar, TODOS os caches da origem que não são deles (`keys.filter(k => k !== CACHE).map(caches.delete)`), inclusive `mare-*`. Sem defesa, o Maré perderia o cache offline sempre que um desses apps atualizasse. Desde a 1.0.1, o `sw.js` do Maré refaz o próprio cache sozinho quando percebe que ele sumiu (função `precache()`, chamada na instalação e quando a tela inicial não é encontrada no cache). O teste e2e "refaz o cache se outro app da mesma origem o apagar" cobre isso. A correção definitiva, nos outros apps, é filtrar só o próprio prefixo (o `mergulho` e o `treino-gym` já fazem assim).
- **Subcaminho:** SW, manifest e links são relativos, então o app funciona em qualquer pasta. Testado servindo em `/mare/`: SW ativo e controlando a página, abre offline (inclusive com `?source=pwa` e `?add=250`), ícones e atalhos do manifest respondem 200, sem erros no console.
- **Atualizar o app no ar:** enviar os arquivos para a `main` (site do GitHub → *Add file → Upload files*, ou `git push`). A aba *Actions* publica sozinha em cerca de 1 minuto. A cada versão nova, aumente `VERSION` em `public/sw.js` e `APP_VERSION` em `public/js/app.js` (iguais).

### Firebase (projeto `mare-hidratacao`, número 331167358767)
- App web "Mare PWA" (os valores estão em `public/js/firebase-config.js`). A chave de API do Firebase é pública por natureza: quem protege os dados são as regras do Firestore (cada pessoa só lê e grava `users/{uid}` e `users/{uid}/days/*`, e os campos aceitos são validados). Opcional: restringir a chave por referenciador HTTP no Google Cloud (liberar `https://chrismello0211.github.io/*`, `https://mare-hidratacao.web.app/*`, `https://mare-hidratacao.firebaseapp.com/*` e `http://localhost:*`, e as APIs citadas em "Chave de API" na Parte 4).
- **Authentication:** provedor Anônimo ligado. A "limpeza automática de contas anônimas" ficou **desligada de propósito**: ligada, o Firebase apaga contas anônimas com mais de 30 dias e os dados da nuvem ficariam sem dono (e os lembretes parariam).
- **Firestore:** banco `(default)`, edição Standard, `southamerica-east1`, modo de produção. As regras de `firestore.rules` já estão publicadas (colar o arquivo em *Firestore → Regras*; o conteúdo publicado é idêntico ao arquivo, sem a quebra de linha final, SHA-256 `661a4813687556a70257de484a53ebe9d88dc3fcb31eaed056d1ce40e968b442`).
- **Cloud Messaging:** API V1 ativa e chave VAPID gerada (a chave pública está em `firebase-config.js`).
- **Índices:** `firestore.indexes.json` desliga os índices automáticos de `days.entries` e `users.fcm` (lista e mapa que nunca são consultados). Já aplicado com `firebase deploy --only firestore`.
- **Plano e nuvem:** projeto no plano **Blaze**. Em 15/10/2026 foi feito `firebase deploy --only firestore,functions`: a function `sendReminders` (2ª geração, Node 22, `southamerica-east1`) e o job do Cloud Scheduler `firebase-schedule-sendReminders-southamerica-east1` (a cada 15 min; o fuso do job é UTC, mas o fuso de cada pessoa vem do campo `tz`). Na primeira implantação foi aceita a política de limpeza do Artifact Registry (imagens com mais de 1 dia são apagadas, para não gerar cobrança). APIs habilitadas pelo próprio deploy: Cloud Functions, Cloud Build, Artifact Registry, Cloud Scheduler, Cloud Run, Eventarc, Pub/Sub e Firebase Extensions.
- **Como implantar de novo:** o Cloud Shell (https://shell.cloud.google.com/?project=mare-hidratacao) já traz o Firebase CLI e entra com a conta logada, sem `firebase login`. Basta `git clone https://github.com/chrismello0211/mare`, `cd mare/functions && npm install`, voltar à raiz e `firebase deploy --only functions --project mare-hidratacao` (ou `firestore,functions`).
- **Visitantes de fora (resolvido na 1.0.1):** o app é público; poucos minutos depois do primeiro deploy já havia usuários anônimos de outros fusos (Fortaleza, Los Angeles) criados por quem só abriu o endereço, porque a nuvem ligava já na abertura, antes mesmo do onboarding. Desde a 1.0.1 a nuvem só liga **depois do onboarding** (`startCloud()` em `app.js`, chamada ao concluir o onboarding, ao restaurar um backup e na abertura quando o app já está configurado). Quem só abre e fecha o app, e também robôs e prévias de links, não cria conta nem documento, e a primeira abertura baixa menos (o SDK do Firebase só é carregado depois). As regras continuam limitando cada pessoa aos próprios documentos. Os dois documentos de visitantes antigos (`users/9JtSWY…` Fortaleza e `users/KKrZVo…` Los Angeles) podem ser apagados no console; não são do dono. Se um dia virar problema (spam de contas), ligue o App Check.
- **`FIREBASE_ENABLED = !navigator.webdriver`:** navegadores automatizados (Playwright, Selenium) ficam 100% locais, para os testes não criarem usuários nem documentos no projeto real.
- Testado no endereço real do GitHub Pages: login anônimo funciona e as regras permitem o dono e negam acesso a dados de outro usuário.

### Correções feitas depois das 5 partes
- `sw.js`: errata da Parte 5 aplicada (`SHELL` e `ROOT` calculados a partir de `self.location`; `CORE` usa `'./'`).
- `ui.js` (`dropSVG`): o texto branco "dentro da água" nunca aparecia, porque `<clipPath>` só aceita formas e o `<g>` que sobe e desce com a água o invalidava. Trocado por `<mask>`.
- `app.css`: `input[type="time"]` mais largo e fonte menor nos horários do onboarding, para caber "07:00 AM" em aparelhos com relógio de 12 h.
- `manifest.webmanifest`: `"id": "/mare/"`.
- `sw.js` (1.0.1): `precache()` separado da instalação e chamado de novo quando o cache sumir (ver "Caches apagados por outros apps"). `VERSION` e `APP_VERSION` foram para `1.0.1`; quem já tem a 1.0.0 vê o aviso "Nova versão disponível".
- `app.js` (1.0.1): `startCloud()` liga a nuvem só depois do onboarding (ver "Visitantes de fora"). `initCloudLayer()` continua igual; se os lembretes forem ativados antes de a nuvem terminar de ligar, o registro do push acontece assim que ela ficar pronta.
- `firebase-config.js`: valores reais do projeto e a regra do `navigator.webdriver` (acima). `.firebaserc` aponta para `mare-hidratacao`.

### Como foi validado
- `npm test`: 29 testes de lógica, todos passando.
- `npm run test:e2e`: 109 execuções de interface em 13 perfis (iPhone SE, 8, 12, 14 Pro Max, iPad Mini e Pro 11, Pixel 5, Galaxy S9+, Moto G4, Galaxy Tab S4, tela de 280 px, iPhone SE e Pixel 5 na horizontal): 104 passam e 5 são puladas de propósito (o teste "lembretes ativados no onboarding registram o push…" não roda nos perfis de iPhone/iPad, porque no iOS a permissão de notificação só existe com o app instalado na Tela de Início). Entre elas estão os testes do cache apagado por outro app e os 3 da nuvem ("só liga depois do onboarding", "liga na abertura com o app já configurado" e o registro do push); nesses, o Firebase é substituído por um dublê (`stubCloud`), então nada é gravado no projeto real. O teste "só liga depois do onboarding" foi conferido também contra o código antigo (1.0.0) e falha nele, como deve; os outros dois protegem o comportamento que não pode se perder (a nuvem continua ligando, e o push continua sendo registrado).
- Atenção: na máquina onde isso foi rodado só havia Chromium. Os perfis de iPhone e iPad foram **emulados no Chromium** (tamanho de tela, toque e user agent), e não no WebKit de verdade. No seu computador, `npx playwright install` e `npm run test:e2e` usam o WebKit real. Safari/iPhone continua exigindo teste em aparelho.
- Revisão visual dos screenshots de Hoje, Histórico, Jornada e Ajustes em todos os perfis.
- Nuvem, em produção: com um usuário sintético em `users/` (`reminder.nextAt` no passado, token falso), "Forçar execução" do job fez a function achar o usuário, calcular o próximo lembrete (+90 min), registrar `lastSentAt` e chamar o FCM (o token falso foi recusado, como esperado). O usuário de teste foi apagado.
- **Ainda não testado:** a chegada de uma notificação real num aparelho (precisa de um token FCM de verdade: abrir o app no celular, ativar os lembretes e permitir notificações).

### O que falta (em ordem)
1. **Push de verdade:** abrir o app num Android (Chrome), concluir o onboarding (a nuvem só liga depois dele), ativar os lembretes e permitir notificações; depois achar o documento da pessoa em `users/` (o que tem `fcm` preenchido; não apague os dois de visitantes antigos) e forçar um envio: editar `users/{uid}.reminder.nextAt` para um horário passado (e, se for de madrugada, ajustar `wake`/`sleep` para a hora atual estar dentro da janela) e usar "Forçar execução" no Cloud Scheduler (ou `gcloud scheduler jobs run firebase-schedule-sendReminders-southamerica-east1 --location=southamerica-east1`). Conferir o botão "+250 ml". Repetir no iPhone com iOS 16.4+ e o app instalado na Tela de Início (no iOS não há botões de ação). Se der erro de permissão no envio, conferir se a conta de serviço da function (por padrão a do Compute Engine) tem papel com `cloudmessaging.messages.create` (por exemplo, Editor ou "Firebase Cloud Messaging API Admin").
2. **Aparelhos reais**, principalmente iPhone/Safari: instalar na Tela de Início, abrir offline, clima/geolocalização, `.ics`, backup e restauração.
3. **Orçamento:** criar um alerta de orçamento no Google Cloud (Faturamento → Orçamentos e alertas). O uso esperado é mínimo (um job a cada 15 min e poucas leituras), mas o Blaze cobra por uso.
4. **Opcional:** Firebase Hosting (`firebase deploy --only hosting` → https://mare-hidratacao.web.app, com os cabeçalhos de `firebase.json`), Firebase App Check, Lighthouse mobile e as pendências de "Antes das lojas".
5. **Para as lojas (TWA/Bubblewrap):** o Digital Asset Links exige `/.well-known/assetlinks.json` na **raiz da origem**. Em `chrismello0211.github.io/mare/` isso não é possível (a raiz pertence ao repositório `chrismello0211.github.io`). Quando chegar a hora, use o Firebase Hosting (`mare-hidratacao.web.app`) ou um domínio próprio e ajuste o `"id"` do manifest se a origem mudar.

## Adendo — Parte 7 (versão 1.0.2: só água conta na meta, outros líquidos numa segunda gota)

> A Parte 8 (1.0.3) acrescentou um interruptor opcional que muda onde esta parte diz "só água": com ele ligado, `dayTotal` passa a incluir os outros líquidos (até metade da meta) e `dayWater` é que continua sendo só de água. Com o interruptor desligado, que é o padrão, tudo abaixo vale como está escrito.

### O que o dono pediu e por quê
- Tirar **álcool e refrigerante** do app (não combinam com um app de saúde).
- A gota principal passa a contar **só água e água com gás**. Café, chá, suco, leite, coco e isotônico vão para uma **segunda gota**, com contagem separada ("água × outros líquidos"). Motivo: não há consenso entre nutricionistas em contar essas bebidas como água, então o app não mistura as duas coisas, e a pessoa decide se quer acompanhar os outros líquidos.
- O dono observou que, em teoria, a meta deveria ser de "hidratação" e não de "água". Na 1.0.2 isso **não foi feito de propósito** (ver "Ideia guardada" abaixo); o texto do app diz "meta de água". A 1.0.3 entregou a ideia como opção (Parte 8).

### Modelo de dados e lógica (`core.js`)
- `DRINKS` tem 8 bebidas, cada uma com um grupo `g`: `'w'` (`water`, `sparkling`) ou `'o'` (`coconut`, `tea`, `coffee`, `juice`, `milk`, `sport`). `WATERS` e `OTHERS` são os dois filtros. **Não existem mais fatores de hidratação.**
- `eff(e)` devolve os ml se a bebida é do grupo água e 0 se é outro líquido. `dayTotal(day)` é, portanto, o total de **água** do dia: é o que vale para meta (`isMet`), sequência, níveis, missões, medalhas, insights, badge de copos restantes, lembretes e os campos `today.ml` e `total` que vão para a nuvem. `dayOther(day)` é o total de outros líquidos (só exibição). `isMet` continua exigindo pelo menos um registro e `dayTotal >= meta`: um dia só de café nunca "bate a meta".
- **`soda` e `alcohol` foram aposentados** (`RETIRED`, `retired(id)`): `migrate()` descarta esses registros ao carregar (sem alterar o objeto recebido) e `cleanEntries()` (app.js) faz o mesmo ao importar backup e ao puxar dias da nuvem. Os dias antigos são **recalculados**: como só a água conta agora, quem tinha registrado café, chá etc. vê o total desses dias cair; esses registros continuam no histórico, agora como "outros líquidos". O dado limpo só é regravado no aparelho quando algo muda (o `boot()` não faz `save()`); como `migrate()` roda a cada abertura, isso é seguro.
- Estado novo: `S.profile.others` (bool, padrão `true`; `migrate()` trata ausente como `true`) liga/desliga a segunda gota; `S.last` é a água do registro rápido (`water` ou `sparkling`); `S.lastO` é o último "outro líquido" (padrão `coffee`). Se um `last` antigo apontava para um outro líquido, `migrate()` o move para `lastO` e volta `last` para `water`.
- Missões: `pure` ("Beba 1,5 L só de água") saiu, porque agora a meta inteira já é só de água, e `noon` ("Chegue a 1 L antes do meio-dia") entrou no lugar. `six` e `thirds` passaram a contar só registros de água ("Beba água 6 vezes hoje", "Beba água de manhã, à tarde e à noite"). Medalhas: `variety` (variedade de bebidas) saiu e entrou `s14` ("Quinzena firme", 14 dias seguidos na meta, emoji 💎 porque 🧊 é Unicode 12 e não aparece no iOS 12). Continuam 12 medalhas, 5 missões e 8 níveis. `context(S)` e `insights` ignoram outros líquidos (um dia só com café não conta como dia com dados).

### Telas (`views.js`, `app.js`, `app.css`)
- **Hoje:** a gota principal (água) ganhou ao lado, na base, uma gota pequena **âmbar** ("Outros líquidos") com o total de hoje e a legenda embaixo. O nível dela é relativo à meta de água, só para dar noção visual. Tocar nela abre o painel **Outros líquidos** (`othersSheet`): escolhe a bebida (coco, chá, café, suco, leite, isotônico) e toca no volume para registrar; o botão "Outro volume ou horário" abre o editor já nessa bebida. O aviso após registrar diz "à parte" e tem "Desfazer".
- O **registro rápido** passou a ser só de água: seletor "Água / Com gás" (`data-action="set-water"`) + "Outro" (volume/horário) + os 4 copos. Em telas com menos de 300 px o emoji do seletor é escondido (`.sg-e`) para "Com gás" caber numa linha.
- **Editor de registro** (`entrySheet`): as bebidas aparecem em grupos (água, separador, outros líquidos) e uma nota ("Outros líquidos contam à parte e não entram na meta de água.") aparece quando se escolhe um outro líquido.
- **Ajustes:** novo grupo "Outros líquidos" com o interruptor "Registrar outros líquidos" (`S.profile.others`). Desligado, a segunda gota, o painel e as bebidas "outros" do editor somem e os registros desse tipo ficam escondidos das listas (**não são apagados**; ao religar, voltam).
- **Histórico:** o painel de um dia mostra "+ X de outros líquidos, contados à parte" quando houver. Gráficos, calendário e médias usam só água. **Jornada** e o texto de compartilhar falam em "de água".
- Layout da segunda gota: posicionamento absoluto à direita do ponto mais largo da gota principal, com tamanhos por media query (72 px por padrão, 62 px em telas baixas ou estreitas, 76 px em telas grandes e 50 px abaixo de 300 px). Cores novas: `--oth1 --oth2 --othb --othink --odropbg --odropline`, claro e escuro. O teste de layout confere que ela não passa da borda, não encosta na gota principal e tem pelo menos 44 px de área de toque.

### Nuvem
- **Nenhuma mudança** em `firestore.rules`, `firestore.indexes.json` nem `functions/index.js`: os campos gravados são os mesmos, e `today.ml`/`total` agora são só de água (a Cloud Function compara com a meta de água, como esperado). Não é preciso reimplantar nada no Firebase; basta publicar o site.
- Um aparelho que ainda esteja na 1.0.1 e grave refrigerante/álcool na nuvem não quebra nada: a 1.0.2 descarta esses registros ao puxar.

### Como foi validado
- `npm test`: 34 testes de lógica (novos: grupos água × outros, catálogo, missões, medalhas, `migrate` com refrigerante/álcool e `last` → `lastO`).
- `npm run test:e2e`: 149 execuções nos mesmos 13 perfis da Parte 6 (144 passam, 5 puladas de propósito pelo mesmo motivo de antes). Testes novos: outros líquidos à parte (sem mexer na água, com "Desfazer"), água com gás na meta, editor com nota, interruptor em Ajustes, dados antigos com refrigerante/álcool, e o teste de layout agora confere a segunda gota. Os perfis de iPhone/iPad continuam **emulados no Chromium**; Safari real exige aparelho.
- Revisão visual da gota principal + segunda gota (claro e escuro, de 280 a 768 px, com 0, 350 ml e 12.000 ml em outros líquidos), do painel Outros líquidos, do editor, de Ajustes, do painel do dia e da Jornada.

### Ideia guardada: "Somar outros líquidos na meta" (construída na 1.0.3, ver Parte 8)
Na 1.0.2 ela ficou só anotada: um interruptor em Ajustes que soma os outros líquidos ao total, com a forma mais simples de passar o modo sendo uma flag de módulo em `core.js` (`setMix(bool)`), para não alterar as assinaturas, e o padrão **desligado**. A 1.0.3 fez exatamente assim; os detalhes e o que mudou em relação a esta parte estão na Parte 8.

### Para publicar (1.0.2)
Na 1.0.2, `VERSION` (sw.js) e `APP_VERSION` (app.js) estavam em `1.0.2`. O passo a passo de publicação não muda de versão para versão (extrair o ZIP por cima do repositório, commit e push na `main`; ver o fim da Parte 8).

## Adendo — Parte 8 (versão 1.0.3: "Somar outros líquidos na meta", opcional)

### O que o dono pediu e por quê
- O dono topou a ideia guardada na Parte 7, com uma condição de desenho: o interruptor existe **só em Ajustes**, de forma discreta, para quem preferir a meta de hidratação ("talvez tenha gente que prefira dessa forma"). Ele também repassou material da esposa (artigo do CFN "Sucos, água de coco ou bebidas gaseificadas não substituem a água pura"; tabelas de um "Beverage Hydration Index" (BHI) geradas por IA, com "fatores" por bebida; os motivos pelos quais nutricionistas não contam outros líquidos; e uma "dica de ouro": volume computado = volume × fator, com uma trava exigindo que 50–60% da meta venha do botão "Água" para o dia valer como concluído) e deixou o Claude **avaliar e decidir**.
- Decisões: (1) interruptor opcional, **desligado de fábrica**, só em Ajustes e só visível com "Registrar outros líquidos" ligado; (2) a trava virou um **limite**: os outros líquidos contam 1:1 até **metade da meta do dia**, então no mínimo metade da meta sempre vem de água; (3) **sem fatores por bebida**.
- Por que sem fatores: o BHI vem de Maughan et al., Am J Clin Nutr, 2016 (72 homens euidratados e em jejum, 1 L em 30 min). Só a solução de reidratação oral (1,54), o leite integral (1,50) e o desnatado (1,58) retiveram significativamente mais líquido que a água; refrigerante comum e diet, chá quente e gelado, café, cerveja leve, suco de laranja, água com gás e isotônico não diferiram significativamente dela. Os fatores abaixo de 1,0 das tabelas coladas (0,7; 0,6; negativos) não são do estudo, e o próprio texto manda travar em 1,0. Com esse teto, todo "outro líquido" vale 1:1, e um fator por bebida só acrescentaria falsa precisão. Se um dia quiserem fatores, o ponto de entrada é `counted()` em `core.js`.
- Observação **não aplicada**: o artigo do CFN fala em cerca de 250 ml para cada 10 kg (25 ml/kg), e a fórmula do app é peso × 35 ml + atividade + clima. A meta não foi mexida; fica como decisão do dono.

### Lógica (`core.js`, `store.js`, `app.js`)
- Estado: `S.profile.mix` (bool, padrão `false`; `migrate()` só aceita `=== true`). Ele vai no backup JSON e **não** vai para a nuvem.
- Flag de módulo em `core.js`: `MIX_MAX = 0.5`, `setMix(bool)`, `mixOn()`. `store.applyMix()` liga o flag só se `S.profile.others !== false && S.profile.mix === true`: com a segunda gota desligada os registros "outros" ficam escondidos e não podem entrar na conta. `applyMix()` roda em `setS()` (abrir o app, importar backup, apagar tudo) e em `rulesChanged()` (`app.js`), que é chamado ao mexer em "Registrar outros líquidos" ou em "Somar outros líquidos na meta" e também refaz lembretes, badge e a tela.
- Totais: `counted(entries, goal) = Σ água + (mix ? min(Σ outros, round(meta × MIX_MAX)) : 0)`.
  - `dayTotal(day)` = `counted`: é o total **da meta** (gota principal, `isMet`, sequência, ritmo, histórico, calendário, missões de volume, lembretes, badge e, na nuvem, `today.ml` e `total`).
  - `dayWater(day)` = **sempre só água**: níveis e "L de água" da Jornada (`allMl()`), medalha `l100`, `stats.totalMl`/`stats.level` na nuvem e o texto de compartilhar.
  - `dayOther(day)` = outros líquidos registrados, brutos (a segunda gota mostra tudo o que foi registrado); `otherCounted(day)` = a parte deles que entrou na meta (0 com o interruptor desligado).
  - Isso muda a Parte 7: lá `dayTotal` era sempre só água; agora só é assim com o interruptor desligado.
- O limite usa a meta **gravada no dia** (`day.goal`, ou 2000 se faltar), e não a de hoje, então o histórico não muda quando a meta é editada. Ele não oscila com o que já foi bebido.
- Vale para **todos os dias**, inclusive os anteriores: ligar ou desligar recalcula histórico, calendário, sequência e médias; nenhum registro é alterado. Medalhas e missões já conquistadas nunca são retiradas. `rulesChanged()` não comemora nada: o que ficar devido só sai no **próximo registro** (se o histórico passar a ter vários dias batidos, as medalhas de meta saem em fila, uma após a outra).
- Missões e medalhas: `am500`, `by19` e `noon` (de volume) usam `counted`; `six` e `thirds` continuam só com registros de água. Em `context(S)`, "bater a meta" (`daysMet`, `sunset`, `weekend`) usa o total da meta (percorre os registros em ordem de horário, aplicando o limite ao acumulado de outros líquidos, para achar a hora em que a meta foi batida), enquanto `totalMl`, `entries` (primeira gota) e `early` (500 ml de água antes das 9h) são só de água. Em `insights()`, horários e "% da água antes do meio-dia" são só de água; "melhor dia" e "semana vs. anterior" usam `dayTotal`.
- Lembretes: `lastToday()` (`app.js`), de onde parte o próximo lembrete, só ignora outros líquidos quando o interruptor está desligado.

### Telas (`views.js`, `app.js`)
- **Ajustes, grupo "Outros líquidos":** abaixo de "Registrar outros líquidos" aparece, só se ele estiver ligado, a linha "Somar outros líquidos na meta" (`data-k="mix"`), com uma frase: "Café, chá, suco e companhia contam na meta, até metade dela; o resto precisa ser água. Vale também para o histórico." Uma versão mais longa (com "muitos nutricionistas preferem a meta só com água") foi cortada na revisão visual: virava 6 linhas em 375 px, o contrário de discreto. Com o interruptor ligado, a nota da linha de cima perde o trecho "É uma contagem à parte…".
- **Hoje:** o aviso ao registrar um outro líquido diz "· à parte" (desligado) ou, ligado, "· soma na meta", "· soma só X (limite de metade da meta)" ou "· já no limite de metade da meta" (conta pela diferença do total). A segunda gota **continua mostrando tudo o que foi registrado**, inclusive o que passou do limite. O painel Outros líquidos e a nota do editor de registro (`otherNote()`) trocam o texto conforme o modo.
- **Histórico:** o painel do dia mostra "Inclui X de outros líquidos (o limite é metade da meta; você registrou Y)" (ligado) ou "+ X de outros líquidos, contados à parte" (desligado); a dica da tela e o texto de compartilhar ("na meta" × "na meta de água") também mudam.

### Nuvem
- Nenhuma mudança em `firestore.rules`, `firestore.indexes.json` nem `functions/index.js`: não é preciso reimplantar nada no Firebase, basta publicar o site.
- `today.ml` e o `total` de cada dia passam a seguir o total da meta (com o interruptor ligado inclui outros líquidos), que é o que a Cloud Function compara com `goal`. `stats.totalMl` e `stats.level` (em `pushMeta`, `firebase.js`) seguem só de água, como o nível no app. Ao ligar ou desligar, `planReminder()` → `syncMeta()` atualiza `today.ml`; os dias anteriores só são regravados quando alterados, e nada lê o `total` deles.

### Como foi validado
- `npm test`: 42 testes de lógica (8 novos: desligado de fábrica, ligado com limite, a trava, limite por dia, sequência/recorde, missões, medalhas e `context`, e `migrate`; um `afterEach` volta a flag para desligado).
- `npm run test:e2e`: 189 execuções nos mesmos 13 perfis (184 passam, 5 puladas de propósito, o mesmo teste de push no iOS de antes). Testes novos, em 8 perfis cada: interruptor em Ajustes (desligado de fábrica; ligar e desligar mudam a gota e não mexem nos registros), limite de metade da meta com os três avisos e o painel do dia, completar a meta com café comemora, interruptor some e a soma não vale sem a segunda gota (e volta junto ao religar), e a nota do editor de registro. A `seed()` dos testes passou a aceitar `profile` para sobrescrever campos do perfil. Os perfis de iPhone/iPad continuam **emulados no Chromium**.
- Revisão visual (claro e escuro, de 280 a 430 px): Hoje, painel Outros líquidos, aviso no limite, Ajustes com o interruptor ligado, desligado e sem a segunda gota, Histórico e painel do dia.

### Ideias para depois
- O limite de metade está em `MIX_MAX` (`core.js`); a esposa do dono falou em 50% a 60%, então basta trocar o número se quiserem.
- Hoje só avisa do limite no momento do registro (aviso) e no painel do dia. Se virar dúvida frequente, dá para mostrar uma nota discreta perto da segunda gota quando `dayOther > limite`.

### Para publicar
`VERSION` (sw.js) e `APP_VERSION` (app.js) estão em `1.0.3`. Extrair o ZIP por cima do repositório, commit e push na `main`; o Actions publica em cerca de 1 minuto e quem já tem o app vê "Nova versão disponível". Não precisa reimplantar o Firebase. Os itens de "O que falta" da Parte 6 (principalmente o push real em aparelho) continuam valendo.
