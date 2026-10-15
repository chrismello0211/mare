# Maré — PWA de hidratação · Handoff para o Claude Code

Leia este arquivo inteiro antes de alterar o código. Ele explica o que está pronto, as decisões tomadas e o que falta. O código foi entregue em 5 partes numa conversa. **O estado real hoje (Firebase criado, GitHub Pages, correções feitas e o que falta) está no "Adendo — Parte 6", no final.** Onde as seções antigas dizem "ainda não foi executado" ou "criar o projeto", vale o adendo.

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
- [x] Criar todos os arquivos nos caminhos exatos.
- [x] `npm install` → `npm test` → `npm run test:e2e` (29 testes de lógica e 77 de interface, todos passando; ver Parte 6).
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
- Fatores de hidratação e a fórmula de meta são heurísticas, não orientação médica (há aviso nos Ajustes).

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


## Adendo — Parte 6 (estado real em 15/10/2026: Firebase criado e publicação no GitHub Pages)

### Onde está cada coisa
- **Repositório:** https://github.com/chrismello0211/mare (público, branch `main`).
- **App no ar:** https://chrismello0211.github.io/mare/. Quem publica é o GitHub Actions (`.github/workflows/pages.yml`), que envia a pasta `public/`. Em *Settings → Pages* a fonte é **GitHub Actions**, e não "Deploy from a branch": a raiz do repositório não tem `index.html` (o app mora em `public/`), então o modo antigo só mostrava a página em branco do Jekyll. Antes de publicar, o fluxo confere se todos os arquivos do app existem e, se faltar algum, falha dizendo qual.
- **Vários PWAs na mesma origem:** o dono publica outros apps em `chrismello0211.github.io/<app>/`. Mesma origem significa que `localStorage`, IndexedDB e Cache Storage são compartilhados. Por isso tudo do Maré tem prefixo `mare` (`mare:v1`, `mare:cloud`, cache `mare-<versão>`, banco IndexedDB `mare`), e o manifest tem `"id": "/mare/"` (com `"/"` o Chrome trataria os apps como o mesmo app). Não retire esses prefixos.
- **Subcaminho:** SW, manifest e links são relativos, então o app funciona em qualquer pasta. Testado servindo em `/mare/`: SW ativo e controlando a página, abre offline (inclusive com `?source=pwa` e `?add=250`), ícones e atalhos do manifest respondem 200, sem erros no console.
- **Atualizar o app no ar:** enviar os arquivos para a `main` (site do GitHub → *Add file → Upload files*, ou `git push`). A aba *Actions* publica sozinha em cerca de 1 minuto. A cada versão nova, aumente `VERSION` em `public/sw.js` e `APP_VERSION` em `public/js/app.js` (iguais).

### Firebase (projeto `mare-hidratacao`, número 331167358767)
- App web "Mare PWA" (os valores estão em `public/js/firebase-config.js`). A chave de API do Firebase é pública por natureza: quem protege os dados são as regras do Firestore (cada pessoa só lê e grava `users/{uid}` e `users/{uid}/days/*`, e os campos aceitos são validados). Opcional: restringir a chave por referenciador HTTP no Google Cloud (liberar `https://chrismello0211.github.io/*`, `https://mare-hidratacao.web.app/*`, `https://mare-hidratacao.firebaseapp.com/*` e `http://localhost:*`, e as APIs citadas em "Chave de API" na Parte 4).
- **Authentication:** provedor Anônimo ligado. A "limpeza automática de contas anônimas" ficou **desligada de propósito**: ligada, o Firebase apaga contas anônimas com mais de 30 dias e os dados da nuvem ficariam sem dono (e os lembretes parariam).
- **Firestore:** banco `(default)`, edição Standard, `southamerica-east1`, modo de produção. As regras de `firestore.rules` já estão publicadas (colar o arquivo em *Firestore → Regras*; o conteúdo publicado é idêntico ao arquivo, sem a quebra de linha final, SHA-256 `661a4813687556a70257de484a53ebe9d88dc3fcb31eaed056d1ce40e968b442`).
- **Cloud Messaging:** API V1 ativa e chave VAPID gerada (a chave pública está em `firebase-config.js`).
- **Índices:** `firestore.indexes.json` desliga os índices automáticos de `days.entries` e `users.fcm` (lista e mapa que nunca são consultados). Ainda não foi aplicado: sai junto com `firebase deploy --only firestore`.
- **`FIREBASE_ENABLED = !navigator.webdriver`:** navegadores automatizados (Playwright, Selenium) ficam 100% locais, para os testes não criarem usuários nem documentos no projeto real.
- Testado no endereço real do GitHub Pages: login anônimo funciona e as regras permitem o dono e negam acesso a dados de outro usuário.

### Correções feitas depois das 5 partes
- `sw.js`: errata da Parte 5 aplicada (`SHELL` e `ROOT` calculados a partir de `self.location`; `CORE` usa `'./'`).
- `ui.js` (`dropSVG`): o texto branco "dentro da água" nunca aparecia, porque `<clipPath>` só aceita formas e o `<g>` que sobe e desce com a água o invalidava. Trocado por `<mask>`.
- `app.css`: `input[type="time"]` mais largo e fonte menor nos horários do onboarding, para caber "07:00 AM" em aparelhos com relógio de 12 h.
- `manifest.webmanifest`: `"id": "/mare/"`.
- `firebase-config.js`: valores reais do projeto e a regra do `navigator.webdriver` (acima). `.firebaserc` aponta para `mare-hidratacao`.

### Como foi validado
- `npm test`: 29 testes de lógica, todos passando.
- `npm run test:e2e`: 77 testes de interface, todos passando, em 13 perfis (iPhone SE, 8, 12, 14 Pro Max, iPad Mini e Pro 11, Pixel 5, Galaxy S9+, Moto G4, Galaxy Tab S4, tela de 280 px, iPhone SE e Pixel 5 na horizontal).
- Atenção: na máquina onde isso foi rodado só havia Chromium. Os perfis de iPhone e iPad foram **emulados no Chromium** (tamanho de tela, toque e user agent), e não no WebKit de verdade. No seu computador, `npx playwright install` e `npm run test:e2e` usam o WebKit real. Safari/iPhone continua exigindo teste em aparelho.
- Revisão visual dos screenshots de Hoje, Histórico, Jornada e Ajustes em todos os perfis.

### O que falta (em ordem)
1. **Plano Blaze** (a pessoa faz no console). Defina um alerta de orçamento. O uso esperado é mínimo, mas Functions e Scheduler exigem o plano.
2. **Deploy da nuvem:** `firebase deploy --only firestore,functions --project mare-hidratacao`. O job do Cloud Scheduler é criado sozinho pela function `sendReminders` (a cada 15 min, `southamerica-east1`, Node 22). Sem ferramentas locais, dá para fazer no Cloud Shell: `git clone https://github.com/chrismello0211/mare`, `cd mare/functions && npm install`, depois `npx firebase-tools deploy --only firestore,functions --project mare-hidratacao`. Confirme antes as versões de `firebase-functions` e `firebase-admin` (Parte 4). Ainda não executado.
3. **Push de verdade:** testar no Android Chrome (com o botão "+250 ml") e no iPhone com iOS 16.4+ e o app instalado na Tela de Início (no iOS não há botões de ação). Para forçar um envio: editar `users/{uid}.reminder.nextAt` para um horário passado e usar "Forçar execução" no Cloud Scheduler.
4. **Aparelhos reais**, principalmente iPhone/Safari: instalar na Tela de Início, abrir offline, clima/geolocalização, `.ics`, backup e restauração.
5. **Opcional:** Firebase Hosting (`firebase deploy --only hosting` → https://mare-hidratacao.web.app, com os cabeçalhos de `firebase.json`), Firebase App Check, Lighthouse mobile e as pendências de "Antes das lojas".
6. **Para as lojas (TWA/Bubblewrap):** o Digital Asset Links exige `/.well-known/assetlinks.json` na **raiz da origem**. Em `chrismello0211.github.io/mare/` isso não é possível (a raiz pertence ao repositório `chrismello0211.github.io`). Quando chegar a hora, use o Firebase Hosting (`mare-hidratacao.web.app`) ou um domínio próprio e ajuste o `"id"` do manifest se a origem mudar.
