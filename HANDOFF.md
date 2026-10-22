# Maré — PWA de hidratação · Handoff para o Claude Code

Leia este arquivo inteiro antes de alterar o código. Ele explica o que está pronto, as decisões tomadas e o que falta. O código foi entregue em 5 partes numa conversa. **O estado real hoje (Firebase criado, GitHub Pages, correções feitas e o que falta) está no "Adendo — Parte 6", as bebidas da versão 1.0.2 (água na meta, outros líquidos à parte) estão no "Adendo — Parte 7" o interruptor opcional "Somar outros líquidos na meta" da versão 1.0.3 está no "Adendo — Parte 8", as insígnias do mar e o sistema de amigos da versão 1.1.0 estão no "Adendo — Parte 9", e os avisos por push dos amigos da versão 1.1.1 (inclusive o passo novo de publicar a função) estão no "Adendo — Parte 10", e a turma única com ranking, a meta em ml, o horário de silêncio e os avisos opcionais da versão 1.2.0 (inclusive o passo de publicar regras e funções e a conferência diária das turmas) estão no "Adendo — Parte 11", todos no final.** Onde as seções antigas dizem "ainda não foi executado", "criar o projeto" ou falam de fatores de hidratação, vale o adendo.

## O que é

PWA de hidratação em pt-BR, pensado para ir às lojas depois (via Capacitor). Funciona 100% offline e sem conta (local-first). O Firebase é uma camada OPCIONAL de sincronização e push: o app nunca depende dele para funcionar. Enquanto `FIREBASE_ENABLED = false`, nada do Firebase é carregado.

## Diferenciais de produto (o porquê das coisas)

- Ritmo do dia: além da meta, calcula quanto a pessoa deveria ter bebido até agora (curva levemente adiantada entre acordar e 1h antes de dormir) e mostra "+200 ml à frente" ou "300 ml abaixo do ritmo".
- Lembretes inteligentes: só dentro da janela acordada, pausam ao bater a meta, ficam mais frequentes quando a pessoa está atrás do ritmo (modo adaptativo). Cada gole reagenda o próximo lembrete.
- Ação na notificação (Android): botão "+250 ml" registra sem abrir o app (SW → IndexedDB → o app drena ao abrir).
- Meta: peso × 35 ml + atividade + clima do dia (opcional, Open-Meteo, 1 consulta/dia, coordenadas arredondadas).
- Só água e água com gás contam na meta. Café, chá, suco, leite, coco e isotônico ficam numa segunda gota (âmbar), em contagem à parte e opcional; refrigerante e álcool não existem mais no app (ver Parte 7). Quem preferir a meta de hidratação liga, só em Ajustes, "Somar outros líquidos na meta" (desligado de fábrica; os outros líquidos contam até metade da meta, ver Parte 8).
- Registro retroativo, missões diárias, 12 medalhas, 10 insígnias de bichinhos do mar (da concha ao narval, por litros de água acumulados; ver Parte 9), sequência de dias.
- Amigos (1.1.0, opcional): convite por código, perfil público mínimo (apelido, mascote, insígnias, % da meta de hoje e sequência) visto só por amigos aprovados, acenos de "oi" e "parabéns". Na 1.1.0 era **sem ranking e sem volumes**; **a 1.2.0 mudou isso por pedido do dono** (turma única com ranking Hoje/Semana/Sequência e meta em ml opcional, ver Parte 11), sempre com texto positivo: é para motivar (ver Partes 9 e 11). Desde a 1.1.1, pedido, aceite e aceno também chegam como **notificação push** com o app fechado (ver Parte 10).
- Insights locais: período mais seco do dia, melhor dia da semana, % da água antes do meio-dia, semana vs. semana anterior.
- Visual: gota SVG com ondas, texto "líquido", gota caindo + respingo a cada registro, confete na meta, tema claro/escuro, respeita "reduzir movimento".
- Plano B sem push: exporta lembretes recorrentes para o calendário (.ics).
- Atalhos no ícone (Android), backup JSON, voltar do Android fecha painéis. (O selo com os copos que faltam saiu na 1.2.0: parecia um contador de notificações; ver Parte 11.)

## Decisões técnicas

Vanilla JS com ES modules e sem etapa de build: zero dependências em runtime, abre rápido em aparelhos antigos e embrulha fácil no Capacitor. Se quiser Vite depois, a divisão em módulos já está pronta.

Compatibilidade: o código evita de propósito `?.`, `??`, `gap` em flexbox, `aspect-ratio`, `structuredClone`, `inset` e `clamp()`. A meta é rodar em iOS 12.2+ e Chrome 70+. Push exige iOS 16.4+ com o app instalado na Tela de Início. Não "modernize" a sintaxe sem considerar isso.

Dados: o estado inteiro fica em `localStorage` (chave `mare:v1`). IndexedDB é usado só pelo Service Worker, como caixa de entrada das ações de notificação. O local é a fonte da verdade. Com Firebase ligado, os dias alterados são enviados com debounce, e o Firestore usa cache persistente offline.

Notificações: na web não existe agendamento local com o app fechado. Por isso o push vem do servidor: uma Cloud Function roda a cada 15 min e consulta usuários com `reminder.nextAt <= agora`. As mensagens são "data-only" e o nosso `sw.js` monta a notificação (com ações). Não use `firebase-messaging-sw.js`. Sem Firebase, os lembretes funcionam apenas com o app aberto, e o .ics serve de plano B. Desde a 1.1.1 há uma segunda função, `onFriendship` (gatilho em `friendships/*`), que avisa os amigos (pedido, aceite, aceno) pelo mesmo caminho: FCM só com `data` → `sw.js` monta a notificação (Parte 10).

Atualizações: o SW é versionado e a página mostra o aviso "Nova versão disponível → Atualizar". A cada deploy, aumente `VERSION` em `public/sw.js` e `APP_VERSION` em `public/js/app.js`.

## Estrutura

```text
mare/
├── HANDOFF.md  README.md
├── package.json              # dev: serve, vitest, playwright, sharp, esbuild, firebase (só nos testes), hidane
├── playwright.config.js  vitest.config.js  vitest.rules.config.js
├── firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
├── .github/workflows/pages.yml   # publica public/ no GitHub Pages a cada push na main
├── scripts/
│   ├── icons.mjs             # gera PNGs a partir do SVG
│   ├── art/  build.mjs  creatures.mjs  tube.mjs   # geram public/js/art.js (npm run art)
│   └── rules-test.mjs        # sobe um emulador do Firestore e roda tests/rules (npm run test:rules)
├── public/                   # ← raiz publicada (GitHub Pages e, se quiser, Firebase Hosting)
│   ├── index.html  manifest.webmanifest  sw.js
│   ├── css/app.css
│   ├── icons/                # icon.svg + PNGs gerados por scripts/icons.mjs (já versionados)
│   └── js/ app.js  core.js  store.js  ui.js  views.js  platform.js  firebase.js  firebase-config.js
│           art.js (GERADO)  kit.js  social.js  friends-view.js  social-cloud.js   # 1.1.0 (Parte 9)
│           alerts-sync.js                                                         # 1.1.1 (Parte 10)
├── functions/  package.json  index.js  social-push.js  friend-push.js              # os dois últimos: 1.1.1 (Parte 10)
│               clock.js  quiet.js  network.js  crew-push.js                        # 1.2.0 (Parte 11)
└── tests/  core.test.js  art.test.js  social.test.js  compat.test.js  e2e.spec.js  e2e-friends.spec.js
    │       push.test.js  sw.test.js  files.test.js  e2e-alerts.spec.js              # 1.1.1 (Parte 10)
    │       clock.test.js  quiet.test.js  crew.test.js                               # 1.2.0 (Parte 11)
    ├── helpers/  seed.js  friends.js  fake-cloud.browser.js
    │             server-env.js  dst-sweep.mjs  old-rules.js                          # 1.2.0 (Parte 11)
    └── rules/  firestore.rules.test.js  social-cloud.test.js  friend-push.test.js
                alerts-sync.test.js  firebase-cloud.test.js                           # contra o emulador do Firestore (npm run test:rules)
                network.test.js  quiet-hours.test.js  crew-push.test.js              # 1.2.0 (Parte 11)
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
  achievements:{ id: ts }, missions:{ "AAAA-MM-DD": 1 }, ui:{},
  insignias:{ id: ts },                                  // 1.1.0: insígnias do mar conquistadas (Parte 9)
  social:{ on, nick, share, code, push, goal, hit, week } // 1.1.0: amigos; fica FORA do backup. push (1.1.1): avisos dos amigos, nasce true.
                                                          // 1.2.0: goal = meta em ml para a turma (null = ainda não decidiu), hit = aviso de meta batida (nasce false), week = resumo da semana (nasce true)
  profile.mascot: id da insígnia que os amigos veem ('' = a mais alta conquistada) }
localStorage "mare:social"   // cópia da lista de amigos { uid, code, at, friends, reqIn, reqOut }; só vale para o mesmo uid

Firestore
users/{uid}: name, tz, wake, sleep, unit, goal, today:{day, ml},
             reminder:{enabled, interval, smart, nextAt(Timestamp), lastSentAt},
             fcm:{ <hash>: {token, ua, at} }, stats:{streak, best, totalMl, level},
             social:{ push?, hit?, week? }  (só existe se a pessoa mexeu; padrões: push ligado, hit desligado, week ligado), updatedAt
users/{uid}/days/{AAAA-MM-DD}: goal, total, entries[], updatedAt

Firestore, amigos (1.1.0, Parte 9; nenhum documento público leva carimbo de hora do dono)
profiles/{uid}:            v, nm, mc, ins[], pct?, met, st, day, sh, gl?, wm?   (1.2.0: gl = meta em ml, só com o "sim" da pessoa; wm = máscara de 7 bits dos últimos 7 dias)
codes/{CÓDIGO8}:           uid, nm, mc, rv?                    (nunca é apagado; rv = revogado)
friendships/{menor_maior}: m[2], by, st, nm, mc, tn, tc, cd, at, ok?, w?, auto?   (w[uid] = { k, d, at }; auto: true = criada pelo servidor para completar a turma, 1.2.0)

Firestore, avisos dos amigos (1.1.1, Parte 10; só o servidor lê e grava, as regras negam tudo ao app)
pushlog/{uid}:             t{"tipo_quem": ms}, h[ms], q[ms], exp   (freio contra repetição e spam; exp = TTL opcional)
pushq/{uid}:               items[{k, at, tag, title, body, url, n?}], due, exp   (1.2.0, Parte 11: avisos que esperam a pessoa acordar; só o servidor)
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
- Amigos (1.1.0): as limitações próprias (identidade anônima por aparelho, link de convite no iOS, sem bloqueio, o que foi aceito de propósito nas revisões) estão no fim da Parte 9. Os avisos por push (1.1.1) têm as suas na Parte 10.
- iOS: push só com o app instalado na Tela de Início e iOS 16.4+. Ações na notificação não existem no iOS (tocar abre o app).
- Sem Firebase, lembretes só disparam com o app aberto ou recém-minimizado. Para isso existe o .ics.
- Safari pode apagar dados de sites não instalados após ~7 dias sem uso. Instalado na Tela de Início, isso não acontece; por isso o app incentiva a instalação.
- Open-Meteo é grátis só para uso não comercial. No lançamento comercial, assine o plano ou troque o provedor.
- Atalhos do ícone e a ação "+250 ml" são apenas Android. (O selo com número no ícone saiu na 1.2.0, Parte 11.)
- A fórmula de meta é uma heurística, não orientação médica (há aviso nos Ajustes). Desde a 1.0.2 não há mais fatores de hidratação: a meta é de água, e os outros líquidos têm contagem própria. Na 1.0.3 há o interruptor opcional que soma os outros líquidos 1:1 até metade da meta; continua não havendo fator por bebida (ver Parte 8).

## Roadmap sugerido
- Endpoint `quickLog` (HTTPS + token HMAC curto no payload do push) para a ação da notificação sincronizar na hora.
- ~~Resumo semanal por push (domingo 19h)~~ (feito na 1.2.0, Parte 11); i18n (en/es) extraindo as strings para um dicionário.
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
- functions/index.js replica a lógica do core.js. Extraia nextAt, local e windowOf para um módulo e teste a paridade com core.nextReminderAt. (Feito na 1.2.0: `functions/clock.js`, com `tests/clock.test.js` comparando com o `core.js`, inclusive nas viradas do horário de verão.)
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


## Adendo — Parte 9 (versão 1.1.0: insígnias do mar e amigos)

> **Atualização (1.2.0, Parte 11):** o dono pediu uma **turma única com ranking**. Mudaram: a lista deixou de ser alfabética (agora há ranking Hoje/Semana/Sequência), a meta em ml pode aparecer (opt-in), "Remover amizade" saiu (ficou "Sair da turma"), o selo do ícone saiu e as amizades passaram a se completar sozinhas no servidor. O que esta parte diz sobre "nada de ranking" e "ordem alfabética" vale só para a 1.1.x.

### O que o dono pediu e por quê
- Duas ideias vindas do grupo do dono, entregues juntas porque se alimentam: (1) um **sistema de amizade** para acompanhar o progresso diário dos amigos, **só se eles permitirem**, **sem competição** (é um app de saúde: a ideia é motivar, não ranquear); (2) um **joguinho de insígnias**: ao passar de certas quantidades de água (ele deu o exemplo de 100 L e de um cavalo-marinho), a pessoa desbloqueia uma insígnia que fica no **perfil público**. Ele deixou o Claude decidir onde encaixar e como: "bem testado, bem bacana, bem construído e de forma motivacional".
- Decisões de desenho (todas do Claude, dentro da autorização do dono):
  - As insígnias são **bichinhos do mar** (10, da concha ao narval) e são o "joguinho": colecionar, escolher o **mascote** do perfil e ver o recife. Marcos por **litros de água acumulados**, que é uma conta que só cresce, então ninguém "perde" insígnia e ninguém precisa de streak perfeito para progredir. Ficam num "recife" na aba Jornada.
  - Amigos são uma **5ª aba ("Amigos")**, e **opcionais em dois níveis**: a pessoa precisa ativar (com apelido) e ainda escolhe se mostra o progresso do dia. Quem não ativa nunca é cobrado: nenhuma faixa, nenhum aviso.
  - **Nada de ranking e nada de números absolutos (decisão da 1.1.0, revertida pelo dono na 1.2.0; ver Parte 11):** a lista é em ordem alfabética, ninguém vê litros, ml, peso, horários ou localização de ninguém. Só **% da meta de hoje (0 a 100)**, se bateu a meta, **sequência** e as insígnias. A "Maré da turma" fala só de coisas boas ("3 de 4 já bateram a meta hoje") e nunca de quem está atrás.
  - Interação positiva e leve: **um aceno por amigo por dia** ("oi" 👋 para quem está no caminho, "parabéns" 🎉 para quem bateu a meta), com festinha quando a turma inteira bate a meta (uma vez por dia) e quando uma amizade nasce.
  - Privacidade em primeiro lugar: perfil lido só por amigos aprovados, convite por **código** (nunca por busca de nomes), e dá para **trocar o código**, **remover** qualquer amizade e **sair** (apaga tudo da nuvem, ou não apaga nada: ver "Sair dos amigos").

### Insígnias do mar (`core.js`, `art.js`, `views.js`, `app.js`)
- Tabela `INSIGNIAS` (`core.js`), marcos em litros de **água acumulada** (`allMl()` em `store.js`, que usa `dayWater`: só água, mesmo com "Somar outros líquidos na meta" ligado):

  | id | nome | litros |
  |---|---|---|
  | `concha` | Concha | 0 (nasce com a pessoa, sem festa) |
  | `estrela` | Estrela-do-mar | 10 |
  | `baiacu` | Baiacu | 30 |
  | `tartaruga` | Tartaruga-marinha | 60 |
  | `cavalo` | Cavalo-marinho | 100 |
  | `polvo` | Polvo | 175 |
  | `agua-viva` | Água-viva | 275 |
  | `golfinho` | Golfinho | 400 |
  | `baleia` | Baleia | 700 |
  | `narval` | Narval | 1000 |

  Cada uma tem `cheer` (frase de parabéns) e `fact` ("Você sabia?", uma curiosidade real e bem conhecida do bicho; se trocar por outra, confira a fonte). Para mudar marcos ou textos basta editar a tabela; `core.test.js` confere a ordem, os marcos crescentes e o `levelFor`. O `e` (emoji) é só uma reserva para textos sem desenho (vai no texto de "Compartilhar meu progresso"): o cavalo-marinho usa 🌊 porque **não existe emoji de cavalo-marinho**. Todos os emojis do app precisam ser do Unicode 11 ou anterior (o `compat.test.js` confere).
- **Conquistada, nunca sai** (como as medalhas): `S.insignias = { id: timestamp }`. `newInsignias(S, totalMl)` diz o que falta guardar; `grantInsignias(live)` (`app.js`) guarda. `live = true` é o gole que cruzou o marco (vira comemoração: entra na fila `S.ui.unseenIns` e o painel "Você desbloqueou" aparece quando a tela está calma, ver `showUnlock()`); `live = false` é concessão silenciosa, **datada pelo histórico** de registros (`insigniaDates`): primeira abertura depois de atualizar, backup restaurado, dados de outro aparelho. Quem já usava o app ganha as que merecia de uma vez e só a mais alta é comemorada (`welcomeInsignias()`).
- **Mascote:** `S.profile.mascot` (id, ou `''` = a mais alta conquistada). `mascotOf(S)` sempre devolve uma insígnia já conquistada. É o que os amigos veem no avatar. Troca-se no painel da insígnia (Jornada) ou em "Meu perfil".
- **Arte:** os desenhos são **gerados**. Edite `scripts/art/creatures.mjs` (formas) e rode `npm run art` (`scripts/art/build.mjs` + `tube.mjs`), que reescreve `public/js/art.js`. **Não edite `art.js` à mão.** Regras da arte (para o iOS 12 desenhar igual): só `<path>/<circle>/<ellipse>/<polygon>/<g>`, **sem `id`, `<use>`, gradiente nem `clip-path`**, em um quadro de 100×100. O medalhão (fundo, anel, brilho, bolhinhas) e a **silhueta de "bloqueada"** são CSS (`.bdg` e `.bdg.lock` em `app.css`). `badge(id, { size, locked, label, cls })` (em `art.js`) monta o HTML; sem `label` o desenho fica oculto para leitor de tela.
- **Telas:** Jornada ganhou o card do nível atual (medalhão que flutua + barra até a próxima insígnia + quanto falta) e o **recife** (grade com as 10, as bloqueadas em silhueta com os litros que faltam). Tocar numa abre o painel (curiosidade, "Usar como meu mascote"; bloqueada: quanto falta). A janela de novidades da 1.1.0 (`newsSheet`) apresenta as insígnias e os amigos uma única vez.
- A tabela antiga `LEVELS` (8 níveis temáticos, Gota … Maré cheia, de 0 a 2000 L) **foi substituída** pelas 10 insígnias (0 a 1000 L). `levelFor(totalMl)` continua em `core.js`, agora sobre `INSIGNIAS`, e o campo `stats.level` que vai para a nuvem passa a ser o índice da insígnia (0 a 9; antes 0 a 7). Nada no servidor lê esse campo (a Cloud Function só usa `tz`, `wake`, `sleep`, `unit`, `goal`, `today`, `reminder` e `fcm`). As **medalhas** (12) e as **missões** continuam como estavam.
- **As insígnias no perfil público revelam, de propósito, a faixa de litros da pessoa** (os ids vão em `profiles/{uid}.ins`): é o objetivo do joguinho (mostrar a conquista). Nada mais fino que isso sai do aparelho.

### Amigos: dados na nuvem (`firestore.rules`)
Três coleções novas; **`users/*` e `users/*/days/*` não mudaram** (continuam privados do dono). **Nenhum documento público leva carimbo de hora do dono** (nem `u`, nem `updatedAt`): quem tem um convite, ou é amigo, não pode saber quando a pessoa abre o app ou registra um gole. Os únicos horários são os de eventos que a pessoa faz de propósito dentro de uma amizade (`at` do pedido, `ok` do aceite e `at` de cada aceno), legíveis só pelos dois membros.
- `profiles/{uid}`: o que os amigos veem. Campos fechados (`hasOnly`; todos obrigatórios menos `pct`): `v` (=1), `nm` (apelido), `mc` (mascote), `ins` (ids das insígnias: até 12 textos de até 24 caracteres; o servidor não conhece a lista de ids, então insígnia nova não exige regra nova), `pct` (inteiro de 0 a 100, ou ausente/`null` quando o progresso está em pausa), `met` (bateu a meta), `st` (sequência), `day` (o dia a que o `pct` se refere) e `sh` (mostra progresso?). Só o dono escreve; **só o dono e amigos aprovados (`friendships/*` com `st == 'active'`) conseguem `get`**; não há `list`. Nunca há ml, peso, horário nem localização.
- `codes/{CÓDIGO}`: o convite. Código de **8 caracteres** do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sem I, L, O, 0, 1; ~40 bits, gerado com `crypto.getRandomValues`). Documento: `uid`, `nm`, `mc` e, se revogado, `rv: true`. **Qualquer pessoa logada pode `get`** (é assim que quem tem o código vê "nome + mascote" de quem convidou, e nada mais); só o dono faz `list` (e só dos seus: `where uid == eu`). **Convites nunca são apagados, nem pelo dono** (`allow delete: if false`): trocar o código (Ajustes → Amigos → Novo código) marca o antigo com `rv: true` e cria o novo **na mesma transação**; sair dos amigos revoga todos e troca nome e mascote por `-`. Um código revogado **continua ocupado para sempre** (ninguém mais consegue criá-lo com outro dono e se passar por quem o divulgou) e **não pode ser reaberto** (a regra de `update` não deixa tirar o `rv`). `lookup()` trata revogado como "não encontrei".
- `friendships/{uidMenor_uidMaior}`: a amizade entre dois usuários. O id junta os dois uids com `_`, **menor primeiro comparando em minúsculas** (`pairId`, igual em `social.js` e nas regras: os ids do login misturam maiúsculas e minúsculas). Campos: `m` (os dois uids), `by` (quem pediu), `st` (`'pending'` → `'active'`), `nm`/`mc` (quem pediu), `tn`/`tc` (nome e mascote de quem recebeu, vistos no convite), `cd` (o **código de convite usado no pedido**), `at`, `ok` (hora do aceite) e `w` (acenos: `w[uid] = { k: 'hi'|'cheer', d: 'AAAA-MM-DD', at }`).
  - **Criar** só como `pending`, só por quem pediu (`by == auth.uid`), com `at == request.time` e **só com `cd` = um código que existe agora, é do destinatário e não foi revogado** (`liveCode`). Isso é o que faz o "Novo código de convite" valer de verdade: saber o identificador de alguém (ele aparece no convite e para os amigos) **não basta** para pedir amizade. Pedidos já enviados continuam valendo depois da troca (aceitar ou recusar segue possível). **Aceitar** só por quem **recebeu** (muda só `st` e `ok`, com `ok == request.time`). **Aceno** só em amizade ativa, só na **própria** entrada de `w`, com `at == request.time` e **no mínimo 10 minutos** desde o anterior (o app só deixa 1 por amigo por dia). **Apagar**: qualquer um dos dois (recusar, cancelar e remover são o mesmo `delete`). Ler (`get`/`list`): só quem está em `m`.
- Pedido cruzado (A pede a B enquanto B já tinha pedido a A): o app percebe o `pending` do outro lado e **aceita na hora** (`request()` em `social-cloud.js` devolve `kind: 'accepted'`).
- Sem índices compostos: as consultas são `friendships where m array-contains <eu>` e `codes where uid == <eu>`.
- **Limite de 30 amigos** é do app (`MAX_FRIENDS`), porque as regras não contam documentos. Apelido até 20 letras no app (`NICK_MAX`); nas regras o teto é folgado (80) para nunca recusar 20 letras com acento ou emoji.

### Amigos: cliente
- `social.js` (**lógica pura**, sem DOM nem Firebase): código (`genCode`, `normCode`, `validCode`, `fmtCode`, `codeFromURL`, `inviteLink`), nomes (`cleanNick` tira controles C0 e C1, `< >`, caracteres invisíveis, de formato e de inversão de direção, limita sequências de acentos soltos a 2 e cai em "Amigo" se não sobrar letra), `profilePayload(S, dia)` (**o único lugar que decide o que sai do aparelho**), `cleanFriend`/`cleanRequest`/`cleanInvite`/`cleanState` (**tudo o que chega da nuvem passa por aqui**: um amigo mal-intencionado não consegue enviar HTML, números fora da faixa ou insígnias que não existem), `liveOf` (estado de hoje de um amigo: `met`, `going`, `idle`, `away`, `paused`, `unknown`), `turma`, `waveFor`/`waveIn`/`unseenWaves`/`arrivals`, `errText` (mensagens em português; nunca texto técnico do Firestore). Dia de aceno ou de perfil **mais de 2 dias à frente de hoje é ignorado** (relógio errado ou dado forjado não fixa um aceno "para sempre").
- `social-cloud.js` (**fala com o Firestore**): `createSocial({ FS, db, uid, rand, cache, leaveMs })` recebe o SDK já pronto, então roda igual no navegador (SDK do CDN, via `firebase.js`) e nos testes (SDK do npm contra o emulador). API: `join, start, stop, refresh, publish, touch, flush, newCode, lookup, request, accept, decline, cancel, remove, declineAll, wave, leave, state, on`. Erros são `SocialError` com `code`: `rules, offline, notfound, self, exists, pending, full, gone, wave, notjoined, bad, auth, busy, unknown` (a tela ainda usa `off`, nuvem indisponível, e `slow`, espera longa demais). Mantém **uma escuta** de `friendships` (array-contains) e **uma escuta de perfil por amigo** (no máximo 30), com tentativa de novo crescente (4 s até 5 min) quando cai. `publish` só grava se algo mudou (`samePayload`) e `touch()` junta mudanças (debounce) para não gastar escritas a cada gole; **só mexe no convite quando nome ou mascote mudaram** e só o **atualiza** (nunca cria nem reabre um código).
  - **Gravações em dois passos viram transações só de escrita** (`atomic`): trocar o código (`newCode`: cria o novo e revoga o antigo juntos) e sair (`leave`). Uma transação só de escrita **não entra na fila offline do SDK**: sem internet ela falha na hora e **nada muda**.
  - **`leave()` é tudo ou nada.** Primeiro desliga as escutas e zera o `hooks` (nenhum envio agendado recria o perfil), liga a bandeira `leaving` e lê os convites uma vez. Depois, em rodadas: lê as amizades (páginas de 200) e grava, **numa transação só, as últimas amizades + o perfil + a limpeza dos convites** (`nm: '-'`, `mc: '-'`, `rv: true`). Se há mais de 200 amizades, as rodadas anteriores apagam só amizades (perfil e convites vão por último). Se uma amizade some entre a leitura e a gravação (o outro lado desfez agora), as regras recusam a transação inteira e a rodada **lê de novo e repete** (até 4 vezes). Prazo de **15 s** (`leaveMs`): depois dele nenhuma etapa nova começa e o erro (`offline`) chega à tela. Enquanto sai, `join`, `newCode`, `request`, `accept`, `decline`/`cancel`/`remove`, `declineAll` e `wave` respondem `busy` (ler continua liberado), e `start` e `publish` não fazem nada.
  - `declineAll()` ("Recusar todos"): se a escuta ainda não respondeu, **confere no servidor** antes de agir; se não alcança, falha com `offline` e não apaga nada; apaga em lotes (o Firestore aceita no máximo 500 gravações por lote). `refresh()` sem escuta lê **todas** as amizades (sem o limite da página). A tela mostra no máximo 30 pedidos, mas `request`/`accept`/`decline` também acham pedidos além da primeira página de 200.
- `firebase.js`: `cloud.social(cacheRaw)` cria a camada sob demanda (import dinâmico). `cloud.wipe()` ("Apagar meus dados") **tenta sair dos amigos primeiro** (e segue mesmo se não conseguir; quem garante a ordem é o `app.js`, ver abaixo). `initializeAuth` cai para `getAuth` se já existir uma instância, e os emuladores só são ligados uma vez.
- `store.js`: `SOC = { mode: 'wait'|'ready'|'off', st }` é o que as telas leem. `app.js` (seção "amigos") liga tudo: `connectSoc(ms)` pega a camada (com **uma nova tentativa** de religar a nuvem se ela não tinha subido), `wireSoc` liga os ouvintes de cada instância, `retrySocial`, `exitCloud`/`afterLeft`/`leaveFriends`, `resetAll`/`eraseLocal`. Guarda a **cópia local `mare:social`** (primeira pintura e uso sem internet; limpa por `cleanState` e **presa ao uid**: se o login mudou, a cópia da conta antiga é ignorada). Operações que esperam o servidor passam por `guard(promessa, ms)` (rejeita com `code: 'slow'`): a tela avisa em vez de girar para sempre.
- `friends-view.js` e `kit.js`: HTML da aba, dos painéis (amigo, "Meu perfil", "Inserir código", "Como funciona a privacidade"), da faixa em Hoje e do grupo em Ajustes. `kit.js` foi extraído de `views.js` (botões, linhas, interruptores) para as duas telas dividirem as mesmas peças.
- Estado no aparelho: `S.social = { on, nick, share, code }` e `S.profile.mascot`. **Ficam de fora do backup** (`social` é zerado ao exportar e ao importar): o login é anônimo e por aparelho, então amigos pertencem a este aparelho. Chaves de `S.ui` usadas: `invite` (código recebido por link e ainda não usado), `wv` (acenos já vistos), `crewAt` (dia em que a festa da turma já saiu), `unseenIns` (fila de insígnias a comemorar) e as dicas `tip_*`.

### Amigos: fluxos e telas
- **Entrada** (aba Amigos, antes de ativar): explica o que os amigos veem e o que **nunca** veem; campo de apelido já preenchido com o primeiro nome; interruptor "Mostrar meu progresso do dia" (ligado de fábrica); botão "Ativar amigos". **Nada liga sozinho.** Sem a nuvem (aparelho sem internet na primeira vez, ou nuvem fora do ar) a tela avisa e não deixa ativar.
- **Convidar:** card com o código `ABCD-EFGH` (8 caracteres, com traço só na tela), "Convidar" (compartilhamento do aparelho com o **link** `…/mare/?amigo=ABCDEFGH`; se não houver, copia o texto) e "Copiar código". **Receber:** quem abre o link vê quem convidou e, ao ativar, o pedido é enviado junto; quem já tem os amigos ligados cai direto no painel "Inserir código" com o resultado. O mesmo painel aceita **digitar** o código ou **colar o link inteiro**.
- **Pedidos:** "Pedidos de amizade" (recebidos: Aceitar / Agora não; enviados: Cancelar; "Recusar todos" quando há vários). Aceitar faz festa ("Nova amizade", pop 🤗). Bolinha na aba quando há pedido ou aceno novo.
- **Lista da turma:** avatares com **anel de progresso** (verde com ✓: meta batida; azul que vai enchendo: no caminho; trilho claro: ainda sem registros; tracejado: progresso em pausa ou sem novidades), apelido e uma frase ("62% da meta de hoje", "Meta batida hoje 🎉", "Ainda sem registros hoje", "Progresso do dia em pausa", "Sem novidades há 4 dias"). **Ordem alfabética**, sem barra de classificação (1.1.0; a 1.2.0 trocou a lista por um ranking, Parte 11). Faixa "Maré da turma" no topo (só frases positivas; "Turma completa!" tem o card verde e a festa uma vez por dia). Quem está há mais de 3 dias sem aparecer não entra na conta da turma.
- **Painel do amigo:** avatar, frase de hoje, sequência, as 10 insígnias (as que ele não tem em silhueta, o mascote destacado), "Amigos desde…", botão de aceno e "Remover amizade" (com confirmação; a 1.2.0 tirou o "Remover amizade", Parte 11). **Aceno recebido:** aparece na lista ("acenou para você 👋" / "mandou parabéns pra você 🎉") com bolinha na aba até a pessoa ver.
- **Hoje:** uma faixa discreta com a turma só aparece **para quem tem amigos** e abre a aba. **Ajustes → Amigos:** "Meu perfil público", interruptor do progresso, "Novo código de convite" e "Sair dos amigos" (na 1.2.0: "Sair da turma", com mais chaves; Parte 11).
- **Sair dos amigos** só vale se a nuvem confirmar (senão o perfil continuaria público e o app diria que saiu). Se der certo: "Você saiu dos amigos. Seu perfil foi apagado da nuvem." Se não der (sem internet, por exemplo): avisa e **nada mudou**, a pessoa continua nos amigos. Se a espera estourar (rede travada) mas a gravação terminar depois, a tela acompanha o que de fato aconteceu (`afterLeft`) em vez de ficar dizendo outra coisa que a nuvem.
- **Apagar tudo (Ajustes), com os amigos ligados:** primeiro sai dos amigos. Se não conseguir, **não apaga nada** e abre o aviso "Não consegui sair dos amigos", com duas saídas: tentar de novo mais tarde ou "Apagar só neste aparelho" (`eraseLocal`), para ninguém ficar sem poder apagar os próprios dados (por exemplo, num aparelho onde a nuvem nunca sobe). Nesse segundo caminho o perfil continua na nuvem, visível só a quem já era amigo, até a pessoa ativar os amigos de novo e sair (o aviso diz isso com todas as letras).
- **Fuso:** `day` do perfil é o dia de quem publicou; quem olha de um fuso atrás ainda vê "hoje" (`liveOf` trata `day > hoje` como hoje, até 2 dias).
- Visual: avatares são as mesmas insígnias; cores novas com tema claro e escuro; ≤ 359 px tem regras próprias (textos curtos, botão do aceno compacto); alvos de toque de ~44 px. Revisado de 280 a 430 px.

### Segurança e privacidade: o que foi verificado
- `profilePayload` é o único caminho de saída. Testes conferem que **nada além dos campos permitidos** é enviado e que `share = false` zera `pct`, `met` e `st`.
- As regras foram testadas contra o emulador com 64 casos que **tentam o que não pode** (ler perfil de quem não é amigo, ler código alheio listando, aceitar o próprio pedido, forjar `by`, acenar duas vezes em 10 minutos, escrever na entrada do outro, campos extras, `u`/carimbos no perfil e no convite, reabrir ou apagar um código, pedir amizade com código antigo, pedido em nome de outro, `ins` fora do limite, apagar amizade de terceiros…), mais 96 casos de integração do `social-cloud.js` contra o mesmo emulador (convite, pedido, aceite, pedido cruzado, limite, recusa, remoção, acenos, escuta ao vivo, sair, falhas e quedas de rede injetadas, enxurradas de mais de 200 pedidos, cópia de outra conta).
- **Teste de mutação:** 52 defeitos plantados de propósito (regras, camada de nuvem, lógica pura e interface), um de cada vez; cada um precisa fazer **pelo menos um teste falhar** (todos pegos: 48 de primeira e 4 depois de reforçar testes que estavam fracos). Serve para provar que os testes realmente pegam o problema que dizem pegar, e não só passam. Ver "Como foi validado".
- Duas **revisões independentes** (dois revisores separados; a segunda já em cima das correções da primeira) tentaram quebrar as regras e a camada de nuvem. Resultado e o que foi feito de cada achado estão abaixo.

### Revisões independentes: o que acharam e o que foi feito
Nenhuma das duas achou como **ler o perfil de outra pessoa, forjar ou aceitar sozinho uma amizade, ou injetar HTML**. Os achados eram de contenção de abuso, revogação de convite, saída/apagar tudo e vazamento de horário. Na tabela, **R1** é a primeira revisão e **R2** a segunda.

| # | Achado (gravidade) | O que foi feito |
|---|---|---|
| R1·1 | Recusar = apagar, então quem tem o código pede de novo para sempre; enxurrada de pedidos enterra os de verdade; leitura só da 1ª página de 200 (média) | **Parcial.** Leituras sem limite de página e acha pedidos além dela; `declineAll` ("Recusar todos") em lotes. **Não construído:** lista de bloqueio. Defesa: "Novo código de convite" fecha a porta (pedido novo exige o código vigente) |
| R1·2 | Revogação de convite não durável: id livre podia ser recriado por outra pessoa; aba antiga recriava código revogado; `newCode` engolia erro (média) | **Corrigido.** Convite revogado vira "túmulo" (`rv`), pedido exige código vigente, `syncCode` só atualiza, `newCode` é transação (cria + revoga juntos, tudo ou nada) |
| R1·3 | `leave()`/`wipe()` podia deixar o perfil público e o app dizendo que apagou; hooks sobreviviam (média) | **Corrigido.** Saída em transação, repete se uma amizade some no meio, `leaving` trava o resto, e `resetAll` só apaga se saiu |
| R1·4 | Cópia local sem uid: trava a entrada se o login mudar (baixa-média) | **Corrigido.** A cópia leva o uid e é ignorada se não bater; `publish` não cria código |
| R1·5 | Escritas do perfil sem freio; `ins` sem validação (baixa) | **`ins` validado** (≤ 12 itens de ≤ 24 caracteres). **Freio de escrita não construído:** exigiria carimbo de hora no perfil, o que contraria a decisão de privacidade (ver R2·1). Recomendado: App Check e alerta de orçamento |
| R1·6 | Apelidos com caracteres invisíveis ou "zalgo" (baixa) | **Corrigido** (e reforçado por R2·3) |
| R1·7 | Aceno recusado sempre dizia "tente de novo" (baixa) | **Corrigido.** Confere se a amizade ainda existe: "não existe mais" ou "tente daqui a pouco" |
| R2·1 | `u` (carimbo) em perfis e convites revela quando a pessoa abre o app ou bebe (média) | **Corrigido.** `u` saiu das regras, do payload e dos convites; abrir o app não toca mais no convite. **Resta** (inerente a mostrar % ao vivo): um amigo com o app aberto vê quando o % muda |
| R2·2 | `leave()` não era atômico nem cancelável; a tela dizia "não apaguei nada" e a saída terminava depois (média) | **Corrigido.** Transação tudo ou nada, prazo de 15 s, `busy`, `afterLeft` quando termina depois da espera |
| R2·3 | Apelido ainda burlável (controles C1, marcas combinantes, formato) (baixa) | **Corrigido** |
| R2·4 | Dia de aceno no futuro distante fica "para sempre" (baixa) | **Corrigido** (mais de 2 dias à frente é ignorado) |
| R2·5 | "Apagar tudo" nunca funcionava se a nuvem não subiu na sessão (baixa, regressão) | **Corrigido.** Nova tentativa de religar a nuvem + "Apagar só neste aparelho" |
| R2·6 | Regras permitiam apagar códigos (o "túmulo" dependia do cliente) (baixa) | **Corrigido.** `allow delete: if false` |
| R2·7 | "Recusar todos" usava a cópia local e podia não recusar nada (baixa) | **Corrigido.** Confere no servidor se a escuta ainda não respondeu |
| R2·testes | Quatro afirmações de teste que não provavam o que diziam | **Corrigido.** Testes reescritos (escutas e temporizadores contados de verdade, junção de notificações, documentos malformados, asserções de `uid` e `u`) |

**Aceito de propósito (não construído) e por quê:**
- **Apagar tudo sem internet:** o perfil na nuvem só some quando a pessoa ativar os amigos de novo e sair. Um "marcador de apagamento pendente" persistido ficaria preso se o aparelho nunca mais tivesse a nuvem. O aviso diz a verdade.
- **% ao vivo revela o ritmo aproximado de quando se bebe** (e, por degraus, tamanhos de copo). É inerente a mostrar progresso do dia; a pessoa pode desligar "Mostrar meu progresso do dia".
- **Metadados do Firestore:** a API REST expõe `updateTime` dos documentos que a pessoa consegue ler (o próprio perfil e, para amigos, o dos amigos). Não dá para esconder isso do lado do app.
- **Emulador:** os testes das regras rodam no `hidane` (não oficial, sem Java). Conferir uma vez no emulador oficial (comando em "Para publicar").
- **Custo e abuso:** escritas do perfil sem freio e limite de 30 amigos só no app. Recomendado: App Check (já na lista "Antes das lojas") e alerta de orçamento do Blaze.
- **Sem lista de bloqueio** (ver R1·1) e, na 1.1.0, **sem push** de pedido/aceno (resolvido na 1.1.1, Parte 10). **Várias abas do mesmo aparelho abertas ao mesmo tempo não são um caso suportado** (o estado local é gravado pela última aba que salvar, como no resto do app); no servidor, os testes cobrem duas instâncias entrando e saindo juntas sem deixar nada pela metade.
- **Insígnias revelam a faixa de litros** (por desenho) e **sobram "túmulos" de convite sem nome** depois de sair (revogados, ocupados para sempre, de poucos bytes cada).
- **Não verificado em produção:** o instante exato em que o Firestore real corta a escuta do perfil de quem acabou de ser removido (o cliente de série desliga a escuta na hora; um cliente modificado poderia continuar recebendo até reiniciar) e a corrida "aceite local x escuta do perfil" (passou no `hidane`).

### Como foi validado
- `npm test` (Vitest): 194 testes de lógica: `core` (50), `art` (13), `social` (81) e `compat` (50).
- `npm run test:rules` (emulador do Firestore, via `hidane`, sem Java): 160 testes (`firestore.rules.test.js` 64, `social-cloud.test.js` 96).
- `npm run test:e2e` (Playwright): 727 execuções nos mesmos 13 perfis da Parte 6 (722 passam, 5 puladas de propósito: o mesmo teste de push no iOS). São 89 testes por perfil nos 8 perfis padrão (32 do app, incluindo os de insígnias, e **57 de amigos** em `tests/e2e-friends.spec.js`) e só os 3 testes `layout:` nos 5 perfis extras (8 × 89 + 5 × 3). Os perfis de iPhone/iPad continuam **emulados no Chromium**; Safari real exige aparelho. Os testes de "rede travada" (sair/apagar com a nuvem sem responder por mais de 40 s) usam o relógio controlado do Playwright (`page.clock`, a partir do Playwright 1.45), para "passar" a espera sem esperar de verdade.
- **Teste de mutação** (feito com scripts descartáveis, não incluídos no repositório): 52 mutações (12 nas regras, 19 na camada de nuvem, 10 na lógica pura e 11 na interface). Quatro sobreviveram em algum momento (religar a escuta no meio da saída; o aviso "Apagando…" ficar por cima do aviso de falha; não religar a escuta depois de uma saída que falha; não largar a escuta ao "Apagar só neste aparelho") e expuseram testes fracos: um só olhava o estado da tela (a 1ª resposta chega antes do fim da saída), outro esperava o aviso sumir sozinho, a nuvem falsa não parava de escutar ao sair como a real faz e, depois de corrigida, escondia a falta de `stop()` no apagar local (o teste agora deixa o apagar da nuvem sem resposta). Foram reescritos (contam as escutas abertas, olham o aviso uma vez só, a nuvem falsa imita a real) e as mutações passaram a ser pegas.
- **Nuvem falsa nos testes de interface:** o sandbox de testes não alcança o Firebase real, e `FIREBASE_ENABLED` é `false` com `navigator.webdriver`. Por isso `tests/helpers/friends.js` (`stubFriendsCloud`) troca `firebase-config.js` e `firebase.js` por `tests/helpers/fake-cloud.browser.js`, uma nuvem de mentira em memória que usa **as mesmas funções de limpeza** de `social.js`. O que a nuvem real faz está nos testes do emulador, não nos de interface. Para testar um cenário novo, passe `seed` (`friends`, `reqIn`, `code`, `startErr`, `initFail`, `cache`…). `tests/helpers/seed.js` (`seed(page, opções)`) monta o estado local.
- `tests/compat.test.js` (**guarda de compatibilidade**): lê tudo de `public/` e reprova sintaxe nova demais (via esbuild com alvo `chrome70`/`safari12`), APIs que o iOS 12 não tem, CSS que ele não entende (`gap` em flex, `aspect-ratio`, `inset`, `clamp()`, `backdrop-filter` sem `-webkit-`…) e **emojis do Unicode 12 em diante** (viram quadradinho no iOS 12). Se reprovar, a mensagem diz o que trocar. Dica: `\p{…}` em expressão regular funciona no iOS 12, mas o esbuild reescreve uma regex que **começa** com `\p{…}` e a guarda reprova; por isso elas ficam dentro de colchetes (`/[\p{Cf}]/gu`).
- Revisão visual (claro e escuro, 280/375/430 px) de todas as telas e painéis novos: entrada, lista, painel do amigo, "Meu perfil", "Inserir código", pedidos, privacidade, faixa em Hoje, Ajustes, recife, painel e festa de insígnia.
- **Ainda não testado:** o fluxo com **duas pessoas de verdade** no Firebase real (precisa de dois aparelhos com o app aberto), Safari/iPhone de verdade e o teste real de push (tarefa pendente da 1.0.x).

### Para publicar (1.1.0): **há um passo novo, as regras**
1. **Publicar as regras do Firestore ANTES (ou junto com) o site.** São o arquivo `firestore.rules` inteiro (as regras de `users/*` continuam iguais; foram acrescentadas `profiles`, `codes` e `friendships`).
   - Pelo console: Firebase → projeto `mare-hidratacao` → **Firestore Database → Regras** → apagar tudo, colar o conteúdo de `firestore.rules` → **Publicar**. Conferência: o texto publicado deve ser idêntico ao arquivo. SHA-256 do arquivo: `e1d32a79eed72be14e44e774bc4e31416bc9b8e3263d7ee65dd93f9bca9bdf0f` (`sha256sum firestore.rules`; o console pode tirar a última quebra de linha ao copiar de volta, o que não muda nada nas regras).
   - Ou pelo Cloud Shell (https://shell.cloud.google.com/?project=mare-hidratacao, já logado): `git clone` do repositório (ou `git pull`) e `firebase deploy --only firestore:rules --project mare-hidratacao`. (`npm run deploy` também publica as regras, mas junta `functions` e `hosting`.)
   - **Se esquecer:** o site funciona normalmente; só a ativação dos amigos mostra "Os amigos ainda não foram liberados no servidor do Maré. Tente de novo mais tarde." (erro `rules`). Nada quebra e nenhum dado é exposto.
2. **Conferência opcional no emulador oficial** (recomendada uma vez; leva uns 2 minutos no Cloud Shell, que já tem Java): `npm install && firebase emulators:exec --only firestore --project demo-mare-rules "npm run test:rules"`. Os testes das regras rodaram no `hidane`; se alguma diferença com o Firestore real existir, é aqui que aparece (o `rules-test.mjs` usa o emulador oficial quando `FIRESTORE_EMULATOR_HOST` está definido, o que o `emulators:exec` faz).
3. Extrair o ZIP por cima do repositório, commit e push na `main`; o Actions publica em cerca de 1 minuto e quem já tem o app vê "Nova versão disponível". `VERSION` (sw.js), `APP_VERSION` (app.js) e `package.json` estão em `1.1.0`. A lista de arquivos obrigatórios do `pages.yml` e as listas `CORE`/`EXTRA` do `sw.js` já incluem os módulos novos (`art.js`, `kit.js`, `social.js`, `friends-view.js`, `social-cloud.js`).
4. **Não precisa** reimplantar `functions` nem mexer em `firestore.indexes.json`.
5. Primeiro teste real (recomendado, uns 10 minutos, com a esposa ou um amigo): os dois abrem o app, concluem o onboarding, vão em **Amigos → Ativar amigos**; um toca em **Convidar** e manda o link; o outro abre, ativa e aceita; conferir o aceno 👋, o progresso mudando ao registrar água, **Novo código de convite**, **Remover amizade** e **Sair dos amigos**. No iPhone, lembrar que o link abre no Safari e não no app instalado (ver limitações): usar **Inserir código**.

### Limitações conhecidas (1.1.0)
- **Identidade = login anônimo do aparelho.** Limpar os dados do site, trocar de celular ou, no iOS, usar o app instalado em vez do Safari (armazenamento separado) cria **outra identidade**: a pessoa precisa ativar de novo e os amigos a veem como alguém novo. O perfil antigo fica órfão na nuvem (aparece como "Sem novidades há N dias" até alguém remover a amizade). Solução futura: vincular Google/Apple (`linkWithCredential`, já na lista "Antes das lojas").
- **iOS e links de convite:** o link do WhatsApp abre no Safari, que não compartilha dados com o app da Tela de Início. O app mostra o código e tem o painel **Inserir código** como caminho garantido; o texto do convite já inclui o código.
- **Sem aviso por push** de pedido ou aceno **(só na 1.1.0; resolvido na 1.1.1, Parte 10, com a Cloud Function `onFriendship`)**: eles aparecem ao abrir o app (aviso na tela, bolinha na aba) e continuam aparecendo.
- **Sem lista de bloqueio.** Recusar apaga o pedido, e quem ainda tem o código vigente pode pedir de novo. Defesa: **Novo código de convite**, que as regras tratam como porta fechada (pedido novo exige o código atual) e "Recusar todos". Para bloquear alguém específico, sem trocar o código para todos, seria preciso uma coleção de bloqueios e uma regra a mais.
- O limite de 30 amigos é só do app (as regras não contam documentos). Escritas do perfil não têm freio no servidor (ver "Aceito de propósito").
- Apelidos são livres (sem filtro de palavrões nem checagem de nomes parecidos), só higienizados contra caracteres invisíveis e de controle.
- Perfis órfãos não expiram sozinhos, e convites revogados nunca são apagados (de propósito). Se virar problema, dá para criar uma política de TTL do Firestore (com um campo novo de expiração) ou uma limpeza agendada com o Admin SDK, que ignora as regras.
- Apagar tudo sem internet deixa o perfil na nuvem até a pessoa voltar aos amigos e sair (explicado no aviso).
- Custo: o uso esperado é pequeno (uma escuta de amizades + uma por amigo, no máximo 30, e escritas só quando o perfil muda de verdade). Se o número de pessoas crescer, vale conferir leituras do Firestore no console e o alerta de orçamento (Parte 6, item 3 de "O que falta").

### Ideias para depois
- Login com Google/Apple para manter a identidade ao trocar de aparelho (e restaurar amigos junto).
- ~~Resumo semanal da turma por push~~ (feito na 1.2.0, Parte 11; os avisos de pedido, aceite e aceno já existiam desde a 1.1.1, Parte 10).
- Desafios **em grupo e cooperativos** ("a turma bebe 50 L juntos neste mês"), mantendo a regra de nunca comparar pessoas.
- Insígnias novas por constância (sequências), e uma escolha de "moldura" para o avatar.
- Lista de bloqueio e denúncia, se o app for aberto ao público em geral.
- App Check + freio de escrita no servidor, se a base de usuários crescer.


## Adendo — Parte 10 (versão 1.1.1: avisos por push dos amigos)

### O que o dono pediu e por quê
- Depois de publicar a 1.1.0 (site e regras), o dono relatou que "as notificações parecem não estar funcionando direito desse novo recurso": um **aceno** de "oi" e um **pedido de amizade** não chegavam como notificação ("deveria, certo?"). Ele deu autorização total para o Claude acessar o Firebase dele se precisasse.
- **Diagnóstico:** não era defeito, era a lacuna que a Parte 9 já listava ("sem aviso por push"). Na 1.1.0 pedido, aceite e aceno só aparecem **dentro do app** (aviso na tela e bolinha na aba, quando o app está aberto). A expectativa dele estava certa: tem que chegar no celular com o app fechado, como os lembretes de água. A 1.1.1 constrói isso. Não havia nada quebrado nos lembretes (`sendReminders`) nem nas regras.

### O que avisa, para quem e com que texto
Três eventos geram aviso. **Nada mais avisa** (recusar, cancelar, remover amizade, sair dos amigos e atualizar o perfil são silenciosos de propósito: ninguém é avisado de um "não").

| Evento (`kind`) | Quem recebe o push | Título | Texto |
|---|---|---|---|
| Pedido de amizade (`request`) | quem **recebeu** o pedido | `Pedido de amizade 💌` | `<nome> quer acompanhar o dia com você. Toque para responder.` |
| Pedido aceito (`accepted`) | quem **pediu** | `<nome> aceitou seu pedido 🤗` | `Agora vocês se acompanham. Que tal um aceno?` |
| Aceno de "oi" (`wave`, `hi`) | o **outro lado** | `<nome> acenou para você 👋` | `Toque para acenar de volta.` |
| Aceno de "parabéns" (`wave`, `cheer`) | o **outro lado** | `<nome> mandou parabéns pra você 🎉` | `Continue assim! Toque para ver seus amigos.` |

- Se quem recebe o aceno **já tinha acenado nas últimas 12 h** (`BACK_MS`), o texto não sugere "acenar de volta": os dois avisos de aceno passam a dizer só `Toque para ver seus amigos.`
- Entre o emoji e a palavra anterior vai um **espaço que não quebra** (o app faz igual), para o emoji nunca ficar sozinho na linha.
- **Pedido cruzado** (A pede a B quando B já tinha pedido a A: o app de A aceita na hora): B recebe "A aceitou seu pedido".
- O **nome** é o de quem fez a ação, do jeito que a tela de quem recebe o mostra: no pedido, o nome que veio no pedido (`nm`); nos outros, o do perfil (`profiles/{uid}.nm`, o mais novo), senão o que a amizade guardou (`nm`/`tn`). Passa por `cleanName`, uma cópia fiel da limpeza de apelido do app (`tidy()` de `social.js`): o aviso nunca mostra o que a tela não mostraria (invisíveis, texto "zalgo", `<` `>`). Sem nome vira "Alguém".

### Servidor: a função `onFriendship`
- **Arquivos** (`functions/`): `social-push.js` (**lógica pura**, sem Firebase: eventos, texto, pacote, quem recebe, limites), `friend-push.js` (conversa com o Firestore e o FCM; recebe `db`, `messaging`, `FieldValue`, relógio e log já prontos, então roda igual na nuvem e nos testes) e `index.js` (liga o gatilho ao Admin SDK, ao lado de `sendReminders`). `functions/` **não** tem a restrição de compatibilidade com iOS 12 (essa vale só para `public/`); roda em Node 22.
- **Gatilho:** `onDocumentWritten('friendships/{pair}')`, 2ª geração, `southamerica-east1` (a região do Firestore), 256 MiB, 60 s, `maxInstances: 1` (herdado do `setGlobalOptions`), **sem retentativa**. Roda a cada criação, mudança ou remoção de uma amizade. **Não grava nada em `friendships`**, então não há laço.
- **O que conta como evento** (`eventsOf(before, after)`): documento novo `pending` feito por um dos dois (`request`); `pending → active` (`accepted`, para quem pediu); e, em amizade `active`, um `w[uid].at` **maior que o anterior** com `k` em `hi` ou `cheer` (`wave`, para o outro lado). Apagar nunca avisa. Documento estranho (ids que não parecem uid, `m` fora de 2 itens, `st` desconhecido, `by` de fora do par, aceno com tipo inválido ou sem hora) não gera nada.
- **Quem recebe:** os aparelhos de `users/{para}.fcm` (no máximo 10) e só se `users/{para}.social.push` **não for `false`** (sem o campo vale ligado; só um `false` explícito desliga). Sem aparelho registrado ou com a chave desligada, não envia (o motivo vai para o log).
- **Envio:** `sendEachForMulticast` só com `data` (todo valor é texto): `kind: 'friend'`, `ev` (`request`/`accepted`/`wave`), `tag`, `url`, `title`, `body`. Cabeçalhos web push: `Urgency: high` e `TTL` (**pedido e aceite 172800 s = 2 dias; aceno 21600 s = 6 h**: aceno velho perde o sentido). **Sem `notification` no pacote**: quem monta a notificação é o `sw.js` (como nos lembretes; não existe `firebase-messaging-sw.js`). `tag = 'mare-amigo-<tipo>-<uid de quem fez>'`: um aviso do mesmo tipo e da mesma pessoa **substitui** o anterior na tela em vez de empilhar. `url = './?tab=friends'`.
- **Aparelhos mortos:** `messaging/registration-token-not-registered` e `messaging/invalid-registration-token` removem aquele `fcm.<hash>` do usuário (como no `sendReminders`); qualquer outro erro mantém o aparelho. Se a conta sumiu nesse meio tempo, a limpeza falha em silêncio.
- **Idempotência e freio (`admit`, `pushlog/{uid}`):** o Firestore entrega cada evento **pelo menos uma vez** (pode repetir), e um pedido de amizade só exige o código de convite de quem recebe (quem o tem poderia apagar e recriar pedidos para encher o celular de alguém). Por isso cada pessoa tem um registro `pushlog/{uid}` = `{ t, h, q, exp }`, que **só o servidor lê e grava** (as regras negam tudo ao app: `allow read, write: if false`):
  - `t`: `{ "<tipo>_<uid de quem fez>": ms }`, o último aviso de cada tipo vindo de cada pessoa. O mesmo aviso só passa de novo depois de: **pedido 24 h, aceite 60 s, aceno 5 min** (`WINDOW`). Guarda no máximo 100 entradas (`KEEP`; saem as mais velhas) e descarta entradas com mais de 24 h ou com mais de 1 minuto à frente do relógio do servidor (um carimbo no futuro não "congela" um aviso).
  - `h`: os avisos da última hora, **no máximo 20 por pessoa por hora** (`CAP.all`). `q`: os **pedidos** da última hora, **no máximo 5** (`CAP.request`).
  - `exp`: uma data 2 dias à frente (só serve a uma política de TTL opcional, ver "Para publicar").
  - A decisão e a gravação do registro acontecem **na mesma transação** (lê `users/{para}` e `pushlog/{para}` juntos), e o registro é gravado **antes** do envio. Assim duas entregas simultâneas do mesmo evento não passam as duas, e uma repetição cai na janela. **Preço assumido:** se o FCM falhar bem naquele instante, aquele aviso se perde (sem retentativas): "melhor perder um aviso que mandar dois". O pedido e o aceno continuam aparecendo no app.
  - O freio só segura o **push**; o pedido continua na lista de pedidos. Os acenos já têm um freio próprio nas regras (1 a cada 10 min por amigo).
- **Logs** (Firebase → Functions → `onFriendship` → Registros): `aviso de amigos` (com `kind`, `sent`, `failed`) quando enviou; `aviso de amigos não enviado` com `why` = `sem aparelho`, `desligado`, `repetido` ou `limite`; `aviso de amigos falhou` com o erro (um evento que falha não derruba os outros do mesmo documento).

### Cliente (`app.js`, `friends-view.js`, `alerts-sync.js`, `firebase.js`, `core.js`)
- **Chave "Avisos dos amigos"** (Ajustes → Amigos; só aparece com os amigos ligados): guarda `S.social.push` (nasce `true`; `migrate()` completa o campo em dados antigos). O que a tela mostra é o estado **efetivo**: permissão de notificação concedida **e** `push !== false`. Ao tocar:
  - sem permissão ainda: pede a permissão **no próprio toque** (síncrono, sem `await` antes: exigência do iOS) e, se concedida, liga e registra o aparelho;
  - permissão negada, ou iPhone sem o app instalado: abre a explicação (como liberar nos ajustes do aparelho / como instalar), sem ligar nada; a nota da linha diz o que falta;
  - ligada: desliga (`push = false`) e avisa o servidor.
  A linha se atualiza no lugar (`paintAlerts`), sem refazer a tela, e **mantém o foco do teclado**.
- **Cartão na aba Amigos**, logo depois dos pedidos: "Receba avisos dos amigos" (botão "Ativar avisos") ou, no iPhone sem instalar, "Avisos dos amigos no iPhone" ("Como instalar"). Aparece só enquanto falta a permissão (ainda não pedida, ou iPhone sem instalar) e some quando ela é concedida, quando a pessoa o dispensa no X (`S.ui.tip_fpush`) ou quando desliga a chave. Se a permissão foi negada no navegador ou o aparelho não tem suporte, o cartão não insiste (a linha de Ajustes explica). **Nunca pede a permissão sozinho:** só num toque.
- **Registro do aparelho:** `cloud.enablePush()` (via `ensurePush`) passou a rodar também **com os amigos ligados**, e não só com lembretes: na abertura com a nuvem pronta (`initCloudLayer`), ao entrar nos amigos (`joinFriends`) e ao ligar a chave (`setAlerts(true)`). Só registra se a permissão **já foi dada** (nunca pede). Sem amigos e sem lembretes o aparelho não se registra, e não existe aparelho para avisar.
- **Escolha no servidor:** `users/{uid}.social = { push: bool }` (as regras de `users` aceitam só esse mapa com só esse campo booleano). O app só grava quando a escolha **difere do que o servidor assume** (ligado): quem nunca mexeu não escreve nada. A gravação é separada do resumo e **tolerante a falhas** (`public/js/alerts-sync.js`, usado por `flush()` em `firebase.js`): a marca local `mark.social` (em `mare:cloud`) só muda depois de o servidor confirmar; há uma única gravação em voo por vez; se falhar, tenta de novo no próximo `flush`; `reset()` ao apagar tudo.
- **`sw.js` (1.1.1):** o envelope do FCM chega como `{ data: { … }, from, priority, fcmMessageId }`; o código usa `p.data || p`. Ramo `kind === 'friend'`: título e texto vêm no pacote, **sem** o botão "+250 ml", **sem** mexer no selo (badge) e com `renotify: true`. **Todo push mostra uma notificação** (`showNotification` sempre dentro do `waitUntil`: sem isso o Chrome e o Safari tratam como "push silencioso" e podem cortar o recurso). Toque: `data: { url, go: 'friends' }` → `focusOrOpen(url, go)`: se há janela do app aberta, ela recebe `postMessage({ type: 'go', tab: 'friends' })` (o app fecha o painel aberto e vai para a aba; **ignora durante o onboarding**); senão abre `./?tab=friends` (`handleURL()` entende `?tab=`).

### Dados e regras (`firestore.rules`)
- `users/{uid}`: `validUser` passou a aceitar `social` = mapa com **só** `push` booleano (nada de outras chaves).
- `pushlog/{uid}`: `allow read, write: if false` (só o Admin SDK da função, que ignora as regras).
- SHA-256 do `firestore.rules` da 1.1.1: `e1186f8cc1a27834c2e2bb5ea745c249787d7f7d521073e2f07ecdd876d19cf3` (`sha256sum firestore.rules`).
- Local: `S.social.push` (backup **não** leva `social`, como antes). Marca na nuvem: `mark.social` em `mare:cloud`.

### Como foi validado
- `npm test` (Vitest): **314** testes de lógica: `core` 51, `art` 13, `social` 81, `compat` 53, `push` 89 (`push.test.js`: nomes iguais aos do app, `eventsOf`, texto, quem recebe, `admit`), `sw` 21 (`sw.test.js`: o `sw.js` real num ambiente simulado: push de amigo, lembrete que não mudou, toque, versão) e `files` 6 (`files.test.js`: as três listas de arquivos do app andam juntas: imports de `js/`, `CORE`/`EXTRA` do `sw.js` e a conferência do `pages.yml`).
- `npm run test:rules` (emulador do Firestore, via `hidane`): **239** testes: `firestore.rules` 70, `social-cloud` 96, `friend-push` 39, `firebase-cloud` 15, `alerts-sync` 19. `friend-push.test.js` roda `notifyFriendship` e o **handler real do `index.js`** com o **Admin SDK de verdade contra o emulador** e um FCM de mentira (guarda o que recebeu, simula tokens mortos e falhas): pedido, aceite, pedido cruzado, acenos, repetição do mesmo evento (inclusive em paralelo), limites, chave desligada, sem aparelho, aparelhos mortos, documentos estranhos, nomes. `firebase-cloud.test.js` roda o **`firebase.js` real do app** contra o emulador (grava `social.push`, registra o aparelho, zera tudo ao apagar).
- `npm run test:e2e` (Playwright): **1273 execuções** nos mesmos 13 perfis da Parte 6: **1268 passam e 5 são puladas de propósito** (o mesmo teste de registro de push no iOS, que só existe com o app instalado). São **156 testes por perfil** nos 8 perfis padrão (32 do app, **57 de amigos** e **67 de avisos**, em `tests/e2e-alerts.spec.js`) e só os 5 testes `layout:` nos 5 perfis extras (8 × 156 + 5 × 5). Os perfis de iPhone/iPad continuam **emulados no Chromium**; Safari real exige aparelho. A primeira rodada completa reprovou 8 execuções, todas do **mesmo teste antigo da 1.1.0** ("backup antigo (sem insígnias)…"), que comparava o cadastro de amigos sem a chave nova (`push: true`): o app estava certo e o teste foi atualizado; a rodada completa seguinte passou sem falhas.
- **Teste de mutação** (scripts descartáveis, fora do repositório): **174 defeitos plantados** de propósito na lógica do servidor, na função, nas regras, no `alerts-sync`, no `sw.js` e na interface, um de cada vez; cada um tem que fazer **pelo menos um teste falhar**. De primeira, **154 foram pegos**. Dos **20 que sobreviveram**: **12 eram buracos reais nos testes** (reforçados: pedido aceito com `by` de fora do par; a fronteira exata de 12 h; `st` desconhecido no "antes"; ordem da poda de `t` com 110 envios; horários no futuro em `h` e `q`; aviso passado ao `waitUntil`; limpeza do `invalid-registration-token`; falha da limpeza depois do envio; nome do pedido vindo do pedido; "apagar tudo" zerar a memória do `alerts-sync`; botão fantasma em navegador sem suporte; permissão mudada fora do app), **5 eram erros do próprio script de mutação** (corrigidos) e **3 são equivalentes** (não mudam nada observável): `SP4f` (o `Math.abs` no "acenar de volta": o aceno novo é sempre o mais recente, porque as regras exigem `at == request.time`), `Ap14` (`!ob` ao receber `go`: com o app já configurado o onboarding não está na tela) e `V6b` (a assinatura da aba sem `tip_fpush`: dispensar o cartão já repinta a aba). Depois do reforço, todos os demais são pegos.
- **Push com Service Worker de verdade:** `tests/e2e-alerts.spec.js` ("Service Worker de verdade") registra o `sw.js` real e injeta o push pelo protocolo do Chrome (`ServiceWorker.deliverPushMessage`) com **o mesmo pacote que o servidor monta** (`payloadOf`), e confere a notificação e o toque. No ambiente de teste, o Chrome sob carga **perdeu cerca de 1 em 50** dessas entregas (a notificação não aparecia), o que parecia defeito do app e não era: o helper `sw.push(data, done)` reenvia até 2 vezes antes de desistir (prova: 80 de 80 e 105 de 105 em repetições forçadas).
- **Nada disso substitui o teste real em aparelhos** (ver "Não testado").

### Para publicar (1.1.1): **há um passo novo, a função**
O `git push` publica **só o site**. A função `onFriendship` e as regras novas são publicadas à parte. Passos, em ordem:
1. **Site:** extrair o ZIP por cima do repositório, commit e push na `main`. O Actions confere a lista de arquivos (agora inclui `js/alerts-sync.js`) e publica em cerca de 1 minuto. `VERSION` (`sw.js`), `APP_VERSION` (`app.js`) e `package.json` estão em `1.1.1`.
2. **Função e regras** (no Cloud Shell, https://shell.cloud.google.com/?project=mare-hidratacao, já logado e com o Firebase CLI):

   ```bash
   cd ~/mare && git pull && cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules --project mare-hidratacao
   ```

   (Primeira vez no Cloud Shell: `git clone https://github.com/chrismello0211/mare.git ~/mare` antes.) O comando cria `onFriendship`, reimplanta `sendReminders` (igual) e publica as regras.
   - **Na primeira implantação de uma função com gatilho do Firestore**, o Google às vezes recusa dizendo que as permissões do Eventarc ainda estão se propagando. Não é erro do código: esperar 3 a 5 minutos e repetir o mesmo comando.
   - Se o deploy perguntar sobre a política de limpeza de imagens do Artifact Registry, a resposta já adotada é aceitar (ver Parte 6).
3. **Conferir:** Firebase → **Functions** deve listar `sendReminders` e `onFriendship` (Node 22, `southamerica-east1`). Depois de um pedido ou aceno de teste, os **Registros** da `onFriendship` dizem `aviso de amigos` (enviou) ou `aviso de amigos não enviado` com o motivo (`why`).
4. **Opcional:** política de TTL no Firestore para o campo `exp` da coleção `pushlog` (Firestore → *Time to live* → coleção `pushlog`, campo `exp`), para os registros de limite se apagarem sozinhos. São documentos minúsculos (um por pessoa), então dá para ignorar.
5. **A ordem do site e da função quase não importa:** o site novo sem a função só deixa de ter push; a função sem o site novo só avisa quem já tem aparelho registrado. Se o site sair **antes das regras**, só a gravação da escolha "desligar" é recusada (e tentada de novo a cada sincronização até as regras entrarem); nada mais é afetado. O que importa é publicar os dois.

**Como a turma passa a receber** (cada pessoa, uma vez; vale avisar o grupo):
1. Tocar em **Atualizar** quando aparecer "Nova versão disponível" (sem isso o aparelho continua na 1.1.0) e abrir o app.
2. Aba **Amigos → Ativar avisos** no cartão (ou Ajustes → Amigos → **Avisos dos amigos**) e **permitir notificações**. No iPhone isso só existe com o app **instalado na Tela de Início** e iOS 16.4 ou mais novo (o cartão leva à explicação).
3. Teste de ponta a ponta com dois aparelhos: um fecha o app de verdade (desliza para fora); o outro pede amizade, aceita e acena. O push chega em segundos no Android; no iPhone pode demorar mais. Tocar na notificação abre a aba Amigos.

**Se não chegar push**, conferir nesta ordem: (1) a chave "Avisos dos amigos" do destinatário está ligada e a nota da linha não aponta falta de permissão? (2) o aparelho se registrou? (`users/{uid}.fcm` no Firestore precisa ter ao menos um item; sem aparelho o log diz `sem aparelho`); (3) o log da `onFriendship` mostra o evento? `repetido` e `limite` são normais quando o mesmo aviso se repete; (4) ajustes do sistema do celular: notificações do app desligadas, economia de bateria agressiva (Android) ou modo Foco/Não perturbar (iOS).

### Estado da implantação (19/10/2026)
- **Publicado e conferido no Cloud Shell do dono** (`~/mare`, `git pull` até o commit "newversion"; `sha256sum firestore.rules` = `e1186f8cc1a27834c2e2bb5ea745c249787d7f7d521073e2f07ecdd876d19cf3`; `functions/` e `package.json` na 1.1.1):
  - **Regras do Firestore publicadas** (`released rules firestore.rules to cloud.firestore`).
  - **`sendReminders`** atualizada (mesmo código).
  - **`onFriendship` criada** em `southamerica-east1` (Node 22, 256 MiB, 1 instância no máximo, sem retentativa). O gatilho do Eventarc `onfriendship-367444` (`google.cloud.firestore.document.v1.written`, `friendships/{pair}`, banco `(default)`) está **ativo**, e a instância subiu sem erro (a sonda de inicialização passou): o módulo carrega com as versões reais do Admin SDK e do `firebase-functions`.
  - A **primeira tentativa falhou**, como previsto, com `Permission denied while using the Eventarc Service Agent` (HTTP 400, "Retry the deployment in a few minutes"). A segunda, uns 4 minutos depois (`firebase deploy --only functions:onFriendship --project mare-hidratacao`), passou. `firebase functions:list` mostra as duas funções (v2, `nodejs22`).
  - Os registros da função só têm a auditoria da criação e a subida da instância: **ainda não houve nenhuma invocação real**. É o que falta: o teste de ponta a ponta com duas pessoas (ver "Como a turma passa a receber").
- **Cloud Shell hoje** traz Node v24 e npm 12: aparece o aviso `EBADENGINE` (inofensivo; a função roda em Node 22 na nuvem) e o `npm install` cria um `functions/package-lock.json` que **não é versionado** (fica só no Cloud Shell, vai junto no envio e o build passou com ele).
- **Para repetir:** a mesma sequência de "Para publicar (1.1.1)". Dica de automação: num Cloud Shell aberto pelo navegador embutido do app, a ação `type` não chega ao terminal; use `key` com no máximo 100 teclas por chamada, uma tecla por caractere (`space` para o espaço, `F` para maiúscula, `Return` para executar).

### Compatibilidade e limitações (1.1.1)
- **Aparelhos que ainda estão no `sw.js` da 1.1.0** (não tocaram em "Atualizar") mostram o push de amigo como se fosse um lembrete (com o botão "+250 ml") e o toque não leva à aba Amigos. Resolve-se tocando em **Atualizar**.
- **Sem horário de silêncio (1.1.1; resolvido na 1.2.0, Parte 11):** o push chega a qualquer hora (um aceno às 3 da manhã toca). `users/{uid}` já tem `tz`, `wake` e `sleep`, então dá para segurar o aviso fora da janela de vigília do destinatário se virar incômodo.
- **Sem retentativas:** se o FCM estiver fora do ar naquele instante, o push se perde (o pedido e o aceno continuam no app).
- **Token velho** só sai do cadastro no próximo envio que falhar para ele.
- **Quem não tem aparelho registrado não recebe:** é preciso ter dado a permissão com os amigos ligados (ou ter ligado os lembretes) depois de atualizar.
- **Aviso repetido é segurado:** o mesmo tipo da mesma pessoa só chega de novo depois da janela (pedido 24 h, aceite 60 s, aceno 5 min) e há tetos por pessoa (20 por hora, 5 pedidos por hora).
- **iOS:** push só no app instalado, 16.4+; a permissão só pode ser pedida num toque.
- **Custo:** cada gravação em `friendships` (pedido, aceite, aceno, remoção, saída) é uma invocação de 256 MiB por poucos milissegundos; com o uso previsto fica dentro da faixa gratuita do Blaze. O alerta de orçamento recomendado na Parte 6 continua valendo.

### Não testado (só um deploy e aparelhos reais mostram)
- A **entrega real** do FCM no aparelho e o **gatilho real** do Firestore (Eventarc → função): o ambiente de teste não alcança o Firebase. O corpo da função foi exercitado contra o emulador com um FCM de mentira, e o `sw.js` real recebeu pacotes idênticos aos que o servidor monta. A conta de serviço é a mesma do `sendReminders`, que já falou com o FCM em produção (Parte 6).
- iPhone/Safari de verdade (continuam emulados no Chromium) e o fluxo com **duas pessoas reais** no Firebase real (tarefa pendente desde a Parte 9).

### Ideias para depois
- **Horário de silêncio** pelo `wake`/`sleep`/`tz` do destinatário (a função já lê `users/{uid}` na transação). **Feito na 1.2.0 (Parte 11).**
- **Retentativas** do envio com o `pushlog` (hoje um aviso que falha se perde, de propósito).
- Aviso de "o amigo bateu a meta": **não construído de propósito**, porque é o que mais lembra competição; se vier, que seja opt-in e só para quem escolher. **Feito na 1.2.0 como opt-in (Parte 11), depois que o dono pediu.**
- Resumo semanal da turma por push (domingo 19h), reaproveitando a infraestrutura da `onFriendship`. **Feito na 1.2.0 (Parte 11).**


## Adendo — Parte 11 (versão 1.2.0: turma única com ranking, meta em ml, horário de silêncio e avisos opcionais)

### O que o dono pediu e por quê
Depois de usar a 1.1.1 com gente de verdade, o dono mandou um pedido com duas capturas da Tela de Início do iPhone (o ícone do Maré com um selo vermelho "13"):
- **"A tela de amigos, podemos dar uma vida?"** Quem testou disse: "tá legal, mas a gente não consegue fazer muita coisa, não dá pra ver muita coisa, não vi tanta serventia".
- **Uma turma só, não vários grupos.** Cada código aceito criava "um segundo grupo"; ele queria **uma rede única**, "como uma tela de ranking", parecida com a do aplicativo **ForgeX** ("uma pegada totalmente diferente, mas algo parecido; não se apegue exatamente ao que eu estou dizendo"). Ele mesmo reconhece que isso **sai da ideia inicial** (sem ranking) e diz que não tem problema.
- **Mostrar a meta do amigo em ml**, não só a porcentagem.
- **O número no ícone:** "faz sentido ter? pq onde estão essas notificações?".
- **As três "ideias para depois" do HANDOFF** (Parte 10) de que ele gostou: horário de silêncio, aviso de "o amigo bateu a meta" (opt-in) e resumo semanal da turma por push (domingo, 19h). Pediu que o Claude pensasse na melhor estratégia. Autorização total, como nas partes anteriores.

### Decisões do Claude (dentro da autorização)
- **Reverte a regra da Parte 9** ("nada de ranking, lista alfabética, nada de números absolutos") **por decisão do dono**. Fica o espírito: texto sempre positivo (ninguém é "o último": quem não entra na conta de uma visão fica numa lista à parte), tudo opcional, só quem aceita entra. A Maré da turma, os acenos e o "Turma completa!" continuam.
- **O ForgeX não foi visto.** Duas buscas na web deram resultados ambíguos, então o desenho é um **padrão de ranking genérico** (pódio, lista numerada, três visões) no estilo do Maré. Se ele quiser outra cara, basta mandar uma captura da tela de referência.
- **O "13" não era notificação.** Era `Math.ceil(copos que faltam / 250)`, o "badge com copos restantes" que o app colocava no ícone desde as primeiras versões. Como se parece com um contador de notificações e não é, **foi removido**: o app (`clearBadge()` em `platform.js`, na abertura e a cada push) e o `sw.js` (ao ativar e a cada push) zeram o selo, e o servidor parou de mandar `badge` nos lembretes. Em cada aparelho o número some na primeira vez que o app atualizado é aberto.
- **"Remover amizade" por pessoa saiu; ficou "Sair da turma".** Numa turma única todo mundo é amigo de todo mundo; se alguém removesse uma pessoa, a conferência do servidor recriaria o par no dia seguinte (`tests/rules/network.test.js` prova isso com o app e o servidor de verdade: remover uma amizade automática e rodar `reconcileAll` a restaura; `leave()` não é restaurado, porque quem saiu não tem mais perfil). Em vez de prometer o que não se cumpre, só existe sair (de tudo).
- **A meta em ml é opt-in.** Com a % e a meta dá para estimar quanto a pessoa bebeu; o app **pergunta uma vez** (só quando já há amigos) e o texto diz isso com todas as letras. Ligar/desligar fica em Ajustes e em "Meu perfil". Ao **sair da turma a escolha é zerada** (o "sim" valia para a turma que ficou para trás): numa turma nova o app pergunta de novo.
- **Padrões dos dois avisos novos:** **meta batida desligado** (é o que mais lembra competição, então só liga quem quiser) e **resumo da semana ligado** (só chega a quem já recebe os avisos dos amigos, tem aparelho registrado e amigos que mostram a semana; desliga em Ajustes → Amigos). O app assume `{ push: true, hit: false, week: true }` até a pessoa mexer.

### A turma única (`functions/network.js`)
- **Modelo:** a turma é o conjunto de pessoas ligadas por amizades **ativas** (de amigo em amigo) e é sempre **completa**: todo mundo tem amizade com todo mundo. Quando um pedido vira amizade (`pending → active` por um aplicativo), `growNetwork` calcula as duas turmas (`crewOf`, sem contar a amizade nova), junta as pessoas de cada lado que ainda têm perfil e cria o que falta (`planClosure`): **amizades novas** (`create`) e **pedidos pendentes entre membros da mesma turma, que viram amizade** (`upgrade`, em silêncio). Tudo em lotes de 400 (`BATCH`); se um lote falha, repete um a um e aceita "já existe"/"sumiu".
- **Quem escreve:** só o servidor (Admin SDK ignora as regras). As amizades criadas ou promovidas pelo servidor levam **`auto: true`**; as regras **nunca** aceitam um aplicativo criando uma amizade já ativa (o pedido do app tem exatamente 9 chaves e `st: 'pending'`; o aceite só muda `st` e `ok`; o aceno só muda `w`; `auto` é impossível para clientes). Amizade `auto` não gera "aceitou seu pedido" nem dispara outra junção (sem laço).
- **Limite:** uma turma tem no máximo **31 pessoas** (`CREW_MAX`; o app guarda até 30 amigos por pessoa, `MAX_FRIENDS`). Se a junção passar disso, **não faz nada**: fica só a amizade que a pessoa aceitou (como na 1.1.x), e o log diz `turma grande demais para juntar`.
- **Aviso "X entrou na turma":** cada pessoa que já estava em um dos lados recebe um push com os nomes de quem veio do outro lado (kind `joined`; "X entrou na turma", "X e Y entraram na turma", "X, Y e mais N pessoas entraram na turma"; o app mostra o mesmo texto como aviso de tela e `joinedText` é igual nos dois lados). **Quem aceitou e quem pediu não recebem esse aviso um do outro** (já têm o de "aceitou seu pedido" e a tela); só das outras pessoas.
- **Ordem no gatilho `onFriendship` (`handleFriendship`):** primeiro o aviso do evento (pedido, aceite, aceno), depois a junção. Se a junção falhar, o erro vai para o registro (`turma única falhou`) e a conferência diária completa.
- **`reconcileNetworks`** (todo dia às **03:30, horário de Brasília**; `reconcileAll`): varre as amizades ativas (páginas de 500), agrupa em turmas (união de conjuntos), **completa** as de 3 a 31 pessoas (no máximo 3000 amizades novas por rodada, `MAX_NEW`: se algo estranho disparar, o estrago para aí), deixa em paz as maiores que 31 e **apaga amizades `auto` cujo dono já saiu** (a saída apaga as amizades dele, mas uma gravação do servidor no mesmo instante pode recriar uma). **Não avisa ninguém** (o app mostra "X entrou na turma" sozinho quando a lista muda). **Uma falha isolada não derruba a rodada:** se a limpeza das órfãs ou o fechamento de uma turma falha (o Firestore some por um instante), o erro vai para o registro (`amizades automáticas de quem saiu não foram apagadas`; `turma não completada (fica para a próxima conferência)`), conta em `failed` no resultado e a conferência segue para as outras turmas; o que ficou para trás se completa na próxima rodada. `orphans` só soma o que foi mesmo apagado.
- **Efeito da primeira execução:** as amizades que já existiam entre pares (as da 1.1.x) **viram uma turma só**: se A é amigo de B e de C, B e C passam a ser amigos. Isso é o que o dono pediu, mas vale **avisar o grupo** antes.
- **Privacidade, dito com todas as letras no app** (Inserir código, "Como funciona a privacidade", tela de entrada): **aceitar um pedido junta as turmas**; quem entra vê todo mundo e todo mundo o vê; cada um decide o que mostra (progresso, meta em ml); sai quando quiser, de tudo.
- **Risco aceito:** qualquer membro pode trazer um desconhecido (o convidado só precisa ser aceito por quem o convidou) e ele passa a ver a turma inteira. A turma é avisada ("X entrou na turma") e cada um pode sair, mas **não há como tirar uma pessoa** nem bloquear. Ver "Ideias para depois".

### Ranking e telas (`social.js`, `friends-view.js`, `app.js`, `app.css`)
- **Aba Amigos**, de cima para baixo: cabeçalho e "Perfil"; aviso de conexão; pedidos recebidos; cartão de avisos por push; **cartão "Mostrar sua meta aos amigos?"** (uma vez, só com amigos e enquanto `S.social.goal` é `null`); **resumo da visão** ("Maré da turma" / "Semana da turma" / "Sequências da turma", sempre positivo); **Ranking da turma**; convite; convites enviados; nota de privacidade.
- **Três visões** (`RANKS`, escolha em `S.ui.frRank`): **Hoje** (% da meta de hoje), **Semana** (dias na meta nos últimos 7, `n/7`) e **Sequência** (dias seguidos, `🔥 n`). Cada uma tem quem conta (`COUNTS`) e desempates (`THEN`, no fim o nome e o uid, para a ordem nunca tremer): Hoje: %, depois sequência, depois semana; Semana: dias, depois % de hoje, depois sequência; Sequência: dias, depois semana, depois % de hoje.
- **Quem conta:** Hoje, quem já apareceu hoje (um amigo que não abriu o app hoje fica **fora**, não "em último"); Semana, quem tem os 7 dias conhecidos; Sequência, quem mostra o progresso e tem perfil. Quem não conta aparece depois, em ordem alfabética, sob "Sem dados de hoje/da semana/de sequência". **Empate divide a posição** (1, 1, 3); valor zero mostra "–" no lugar do número.
- **Pódio** só com pelo menos 3 pessoas e o 3º valor maior que zero ("um pódio de zeros não anima ninguém"); com posições todas diferentes a ordem de exibição é 2º, 1º, 3º; com empate, a da lista. Cada linha tem avatar com anel de progresso, apelido ("você" na sua), a frase de hoje, as **7 bolinhas da semana**, o número grande da visão, a **meta em ml** (`meta 2.500 ml`, só de quem deixou) e o **botão de aceno** (👋 para quem está no caminho, 🎉 para quem bateu a meta; um por dia por amigo; também no pódio).
- **A semana no perfil (`wm`):** máscara de 7 bits em que o bit i diz se o dia (`day − i`) bateu a meta; o bit 0 é o dia do perfil. Quem olha desloca a janela pelos dias que passaram: dias em que o amigo não abriu o app contam como não batidos. Sem `wm` (app antigo), em pausa ou com um dia que ainda nem chegou: "sem dados da semana" (`known: false`). `weekOf` existe igual em `public/js/social.js` e em `functions/crew-push.js`; `tests/crew.test.js` compara as duas em 4000 perfis sorteados (e nas viradas de mês e de ano).
- **Meta em ml (`gl`):** `profilePayload` só envia `gl` com `S.social.goal === true` e o progresso ligado (inteiro de 0 a 10000; o app só mostra de 100 a 10000). `null` = a pessoa ainda não decidiu = não sai. Vale também para o **seu próprio** ranking (`myMember` mostra a sua meta para você mesmo, mesmo em pausa para os amigos).
- **Ajustes → Amigos:** Meu perfil público, Mostrar meu progresso do dia, **Mostrar minha meta em ml**, Avisos dos amigos, **Avisar quando um amigo bater a meta**, **Resumo da semana da turma**, Novo código de convite e **Sair da turma**. Os dois avisos novos só valem com "Avisos dos amigos" ligado e a permissão dada: ligar um deles sem isso pede a permissão (se faltar) e liga também os "Avisos dos amigos".
- **Hoje:** a faixa "Maré da turma" continua (só com amigos); o aviso de tela "X entrou na turma 🐠" (com "Ver") aparece quando a lista cresce sem ser por um pedido seu.
- **Selo do ícone:** removido (ver Decisões).

### Horário de silêncio (`functions/clock.js`, `quiet.js`, `friend-push.js`)
- **Quando a pessoa dorme:** fora de `wake` (inclusive) até `sleep` (exclusive) no **relógio dela** (`tz`; dormir depois da meia-noite funciona). `wake == sleep` não define silêncio nenhum ("sempre acordada"); campos que faltam valem 07:00 e 23:00, como no app. A conta é **exata na virada do horário de verão** (`instantAt`, "uma hora que não existe vale a seguinte; uma que acontece duas vezes vale a primeira"); `tests/helpers/dst-sweep.mjs` varre os fusos e as viradas. `hm` (a hora "HH:MM" que o app grava) só devolve de 0 a 1440 minutos: texto fora do formato, hora ou minuto fora do intervalo e negativos valem 0, e "24:00" vale 1440, igual ao `core.js` (`tests/clock.test.js` compara as duas).
- **`route()` (friend-push.js)** é o caminho de **todo** aviso (pedido, aceite, aceno, entrada na turma, meta batida, resumo da semana): numa **única transação** lê `users/{to}`, `pushlog/{to}` e `pushq/{to}`, confere aparelho e chave (`wantsKind`), o limite (`admit`) e se está acordada. Acordada: envia. Dormindo: o aviso vai para a **fila** `pushq/{uid}` = `{ items[], due, exp }` (`due` = a próxima hora de acordar; o limite já foi gasto, então a repetição do mesmo evento não entra duas vezes).
- **Validade na fila** (`HOLD`): pedido e aceite 48 h, entrada na turma 24 h, aceno 12 h, resumo da semana 12 h, **meta batida 4 h** (notícia velha perde o sentido). A fila guarda no máximo 20 itens; um aviso do mesmo `tag` substitui o anterior.
- **`flushHeld`** (a cada 15 min): lê as filas com `due` vencido e entrega **um aviso só** se for um; se forem vários, o resumo **"Novidades da turma"** ("2 pedidos de amizade, 1 aceno e 1 meta batida. Toque para ver a turma."). Ainda dormindo (ela mudou o horário) só remarca; sem aparelho ou com os avisos desligados, joga a fila fora; tudo vencido, idem. A fila é reivindicada (apagada) **na mesma transação** que decide: duas execuções ao mesmo tempo não mandam duas vezes ("melhor perder um aviso que mandar dois").
- **TTL do push** (quanto tempo o FCM espera um aparelho desligado, `TTL`): pedido e aceite 2 dias, entrada na turma 1 dia, aceno 6 h, meta 3 h, resumo da semana 12 h, "Novidades" 6 h. **Janela de repetição** (`WINDOW`, por tipo e por quem fez): pedido 24 h, aceite 60 s, aceno 5 min, entrada 5 min, meta 12 h, resumo 20 h.
- **`sendReminders`** passou a usar `clock.js` (a conta era do `index.js`): é **a mesma do app** (`core.js`), agora também certa na noite em que o horário de verão vira (a do servidor antes podia sair uma hora fora nessa noite, para quem mora num fuso com horário de verão; no Brasil não há). `tests/clock.test.js` varre todas as viradas de 2026 em fusos de todo jeito e compara com `core.js`.

### Avisos opcionais: meta batida e resumo da semana (`functions/crew-push.js`)
- **Chaves** em `users/{uid}.social = { push?, hit?, week? }` (booleanos; qualquer uma pode faltar): `push` ("Avisos dos amigos") desliga **tudo**; `hit` ("Avisar quando um amigo bater a meta") só liga com um **true** de verdade (**padrão desligado**, de propósito: é o que mais lembra competição); `week` ("Resumo da semana da turma") vale ligado, só um **false** desliga. `public/js/alerts-sync.js` grava as três juntas (nunca só a que mudou), só quando algo difere do que o servidor assume, e a marca local (`mare:cloud.social`, agora um objeto) só muda depois de o servidor confirmar (a forma antiga, um booleano, ainda é lida).
- **Meta batida (`onProfile`):** roda a cada gravação em `profiles/{uid}`; sai logo (sem tocar no banco) se não é a **primeira vez do dia** em que o perfil mostra `met: true` com o progresso ligado (`hitOf`). Avisa só os **amigos que ligaram** o aviso, têm aparelho e não desligaram o push. Texto: "<nome> bateu a meta de hoje 🎉" / "Que tal mandar um parabéns? Toque para ver a turma." Um `tag` só para todos (vários amigos na mesma noite trocam o aviso em vez de empilhar).
- **Resumo da semana (`weeklyCrew`):** roda **de hora em hora**; só avisa quem está, no relógio dele, no **domingo entre 19:00 e 19:59** (`zonesAt`: os nomes de fuso que o Node conhece mais apelidos antigos que navegadores ainda mandam; consulta `users` com `tz in [...]`, 30 fusos por vez). Para cada pessoa: perfis da turma (a conta é `weekOfCrew`), **só se pelo menos mais uma pessoa mostra os 7 dias e a turma bateu a meta ao menos uma vez na semana**; "Semana perfeita! Todo mundo bateu a meta todos os dias." ou "A turma bateu a meta N vezes nos últimos 7 dias. Você bateu em K dias. Toque para ver a turma." (sem placar nem nomes). Quem não tem `tz` gravado não entra na consulta, e a consulta traz só os campos usados (`select('tz', 'social', 'fcm')`). Quem tem um `tz` que o Node não conhece e que não está na lista de apelidos (`ZONES_EXTRA`: `GMT`, `America/Argentina/Cordoba`, `America/Kentucky/Louisville`, `Pacific/Chuuk`… os nomes antigos que alguns navegadores ainda mandam) **não recebe o resumo**; `tests/crew.test.js` confere que cada nome da lista é válido no `Intl` e que os nomes principais entram em `zonesAt`.
- Os dois passam por `route()`: horário de silêncio, limite e FCM como todo aviso.

### Dados e regras (`firestore.rules`)
- `profiles/{uid}`: ganhou **`gl`** (inteiro de 0 a 10000, ou null) e **`wm`** (inteiro de 0 a 127, ou null), opcionais.
- `users/{uid}.social`: mapa com **só** `push`, `hit` e `week`, cada um booleano e opcional (`{}` vale).
- `friendships/{par}`: o documento pode ter **`auto: true`** (só o servidor grava; o app nunca).
- `pushq/{uid}`: fechado para o app (`if false`), como `pushlog`.
- SHA-256 do `firestore.rules` da 1.2.0: `52dbd3fe5a6c14919d154ad3846932bc4ddafaa38d2ee45c24c5de65ae18e293` (`sha256sum firestore.rules`).
- **O site novo antes das regras novas não quebra os amigos:** `putProfile` (`social-cloud.js`) tenta o perfil completo e, se as regras de antes recusarem (`permission-denied`) e o perfil tem `gl`/`wm`, grava de novo **no formato da 1.1.x** (sem esses dois campos); a abertura seguinte do app, já com as regras novas, publica o completo. Só as escolhas `hit`/`week` ficam sem gravar até as regras entrarem (`alerts-sync` tolera a recusa).
- **As regras novas são um superconjunto das antigas:** os aparelhos da 1.1.x continuam funcionando (ignoram `gl`, `wm` e `auto`).

### Como foi validado
- `npm test` (Vitest): **502** testes de lógica em 10 arquivos: `social` 119, `push` 105, `core` 52, `clock` 52, `crew` 45, `quiet` 28, `compat` 53, `sw` 29, `art` 13 e `files` 6. Novos: `clock.test.js` (fuso, horário de verão, `nextAt` igual ao `core.js`, `hm` à prova de lixo, `zonesAt` o ano inteiro), `quiet.test.js` (a fila), `crew.test.js` (`hitOf`, `weekOf`, `weekOfCrew`, igualdade com o app, nomes de fuso), `sw.test.js` (só as janelas do Maré).
- `npm run test:rules` (emulador do Firestore): **389** testes em 8 arquivos: `social-cloud` 104, `firestore.rules` 78, `network` 58, `friend-push` 39, `quiet-hours` 36, `alerts-sync` 29, `crew-push` 28 e `firebase-cloud` 16. `network.test.js` e `quiet-hours.test.js` rodam `growNetwork`, `reconcileAll`, `route` e `flushDue` contra o **Admin SDK de verdade no emulador** com um FCM de mentira (repetição, corrida entre instâncias, lotes que falham, turma de 31, pedidos cruzados, quem saiu no meio, o horário de verão de verdade); `crew-push.test.js` conta as **transações** (quem não vai receber nem chega a abrir uma). `tests/helpers/old-rules.js` monta as regras da 1.1.0/1.1.x a partir das de hoje para provar o caso "site novo, regras velhas".
- `npm run test:e2e` (Playwright): **1.593 execuções** nos mesmos 13 perfis de aparelho da Parte 6: **1.588 passam e 5 são puladas de propósito** (o mesmo teste de registro de push no iOS, que só existe com o app instalado). São **196 testes por perfil** nos 8 perfis padrão (32 do app, **79 de amigos** em `tests/e2e-friends.spec.js` e **85 de avisos** em `tests/e2e-alerts.spec.js`) e só os 5 testes `layout:` nos 5 perfis extras (8 × 196 + 5 × 5). Os perfis de iPhone/iPad continuam emulados no Chromium.
- **Teste de mutação** (scripts descartáveis, fora do repositório; cada defeito plantado tem que fazer pelo menos um teste falhar): turma única 48 (47 pegos + 1 equivalente: `NW04`, o `ca.over` já é coberto pelo tamanho total), horário de silêncio e relógio (rodadas anteriores, todos pegos), avisos opcionais 23 (22 pegos + 1 equivalente: `CP15`, o laço nunca recebe um grupo vazio), regras 24 (23 pegos + 1 equivalente: `RL15`, `keys()` num valor que não é mapa já dá erro e nega), `alerts-sync` 13 (todos pegos), perfil de reserva 8 (todos pegos) e as correções da revisão independente 31 (todos pegos: o único que sobreviveu na primeira rodada, `RV05` — contar as órfãs antes de gravar —, virou um teste novo que derruba só o `commit()`). Os sobreviventes de primeira viraram **testes novos** (quem não vai receber não abre transação; a fronteira exata de 4 h da meta na fila; campos extras em `social`; o lote que falha só na hora de gravar).
- **Um teste antigo que oscilava** (`social-cloud.test.js`, "a escuta do perfil de um amigo se recupera sozinha", falhava uma rodada em cada duas ou três): era o **teste**, não o app. A recusa simulada da escuta chegava num `setTimeout(0)` e, sob carga, a resposta da rede às vezes passava na frente; sem nada para refazer naquele instante, o app esperava o temporizador (2 s, depois 6 s) e estourava o prazo do teste. A recusa agora chega num microtask (antes de qualquer rede): 12 rodadas seguidas passaram. O comportamento do app (religar assim que o servidor confirma; ou no temporizador, se a recusa vier depois) não mudou.
- **Uma corrida num teste de tela** (`tests/e2e-alerts.spec.js`, "a aba Amigos não pisca…" e "a permissão muda por fora…"): os dois usavam a nuvem de mentira (`window.__fake`) logo depois de o cartão aparecer, mas ela só nasce quando a nuvem liga; numa rodada sob carga o teste chegou antes e falhou uma vez em 1.593. Era o **teste**: agora esperam `window.__fake` (48 repetições em 3 perfis passaram) e a rodada final inteira ficou verde.

### Revisão independente e correções finais
Antes de fechar a 1.2.0, dois revisores independentes (agentes só de leitura, que não viram as conclusões um do outro) leram o código novo: um as funções (`network.js`, `crew-push.js`, `friend-push.js`, `quiet.js`, `clock.js`, `index.js`) e as regras; o outro o cliente (`app.js`, `social.js`, `friends-view.js`, `alerts-sync.js`, `sw.js`, CSS). **Nenhum achou defeito grave, vazamento de privacidade ou injeção** (nomes e apelidos sempre passam por `esc()`/`textContent`; o servidor só escreve o que as regras proíbem o app de escrever). Os achados pequenos foram corrigidos e ganharam teste:
- **Conferência diária à prova de falha isolada** (`reconcileAll`) e **`hm` endurecido** (ver as seções acima), com testes que quebram o Firestore de propósito (`tests/rules/network.test.js`).
- **Nomes de fuso antigos** no resumo da semana e a **consulta enxuta** (`select`), ver "Avisos opcionais".
- **`sw.js` só mexe nas janelas do Maré.** Vários apps dividem a origem `usuario.github.io` e `clients.matchAll` devolve as janelas de **todos**: tocar numa notificação (ou no "+250 ml") podia focar, ou mandar mensagem para, a primeira janela de **qualquer** app. Agora só valem as da pasta do Maré (`ours()`), nos dois caminhos (`tests/sw.test.js`: outro app, pasta de nome parecido, janela sem `url`).
- **A nuvem que não subiu volta sozinha.** Quem abria o app sem internet ficava sem sincronização, sem lembretes do servidor e sem amigos até fechar e abrir o app. Agora há uma nova tentativa quando o navegador avisa que a internet voltou (`online`) e quando o app volta ao primeiro plano (`onResume`): **uma por evento** (nada de laço), nunca com o navegador dizendo que está sem rede, e só para quem ficou sem nuvem **por falha** (quem tem a nuvem desligada na configuração não conta). Quando sobe, a tela de entrada dos amigos para de mostrar o erro, e o botão "Ativar amigos" **não fica mais apagado** sem nuvem (tocar explica de novo e tenta subir a nuvem). Testes: `tests/e2e-friends.spec.js` ("abriu sem internet e a internet voltou", "ao voltar para o app com a nuvem fora", "uma tentativa por evento", "o navegador ainda diz que está sem rede").
- **A escolha da meta em ml é zerada ao sair da turma** (`afterLeft`), ver "Decisões".
- **Pódio:** a meta do degrau (`small`) ficou em **uma linha** (`white-space: nowrap`): se quebrasse, o degrau do 2º e o do 3º ficavam da mesma altura e a escada sumia (apareceu em 280 px); e com 9 px abaixo de 300 px de largura, para "meta 10.000 ml" (o teto que as regras aceitam) caber nos ~72 px do degrau. O teste de layout usa essa meta no 3º lugar em todos os 13 perfis.

**Limitações que a revisão apontou e ficaram como estão** (nenhuma expõe dados de ninguém; as duas primeiras são de custo):
- Os campos de `users/{uid}` **não têm tamanho nem forma limitados** nas regras (só `fcm`, `social`, `goal` e `tz` são conferidos): um aplicativo hostil logado (login anônimo) poderia gravar documentos grandes **no próprio** documento. Não expõe nada de ninguém, mas gasta cota. **Recomendado: App Check e um alerta de orçamento no Cloud Billing**; apertar as regras fica para depois.
- `onProfile` é disparado por gravação do cliente: um app hostil pode regravar o próprio perfil sem parar. Os **avisos** continuam limitados (janela de 12 h da meta batida, teto por pessoa), mas as invocações e leituras não. Mesma recomendação.
- A **sequência** de um amigo aparece com **um dia a mais** depois de perdida (o perfil só muda quando ele abre o app).

### Para publicar (1.2.0): **site, regras e funções**
O `git push` publica **só o site**. As regras e as funções novas vão à parte. Passos, em ordem:
1. **Site:** extrair o ZIP por cima do repositório, commit e push na `main` (o Actions publica em cerca de 1 minuto). **Nenhum arquivo novo em `public/`**, então a lista do `pages.yml` não muda. `VERSION` (`sw.js`), `APP_VERSION` (`app.js`) e `package.json` estão em `1.2.0`.
2. **Regras e funções** (Cloud Shell, https://shell.cloud.google.com/?project=mare-hidratacao):

   ```bash
   cd ~/mare && git pull && cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules --project mare-hidratacao
   ```

   Cria `onProfile`, `flushHeld`, `weeklyCrew` e `reconcileNetworks` (as três últimas criam trabalhos no Cloud Scheduler) e reimplanta `onFriendship` e `sendReminders`. **Na primeira implantação de `onProfile`** (gatilho do Firestore novo) o Google pode recusar com `Permission denied while using the Eventarc Service Agent`: esperar 3 a 5 minutos e repetir o mesmo comando (como na 1.1.1).
3. **Uma vez, logo depois:** rodar `reconcileNetworks` na hora (Cloud Scheduler → o trabalho `firebase-schedule-reconcileNetworks-southamerica-east1` → *Forçar execução*, ou `gcloud scheduler jobs run firebase-schedule-reconcileNetworks-southamerica-east1 --location=southamerica-east1`), para as amizades que já existem virarem uma turma já, e não às 03:30. O log diz `turmas conferidas` com as contas (`pairs`, `crews`, `created`, `upgraded`, `big`, `orphans`).
4. **Conferir:** `firebase functions:list` mostra as seis (`sendReminders`, `onFriendship`, `onProfile`, `flushHeld`, `weeklyCrew`, `reconcileNetworks`); `sha256sum firestore.rules` bate com o da seção "Dados e regras"; os registros de `onFriendship` dizem `turma única` quando uma turma cresce.
5. **Opcional:** política de TTL do Firestore para `pushq.exp` (e `pushlog.exp`), para os documentos pequenos se apagarem sozinhos.
6. **A ordem site/regras quase não importa:** o site novo antes das regras funciona (perfil no formato antigo, ver acima); as regras e as funções antes do site também (os aparelhos antigos continuam funcionando). Publique os dois no mesmo dia.

**O que dizer ao grupo:** (1) tocar em **Atualizar** quando aparecer "Nova versão disponível" e abrir o app; o número no ícone some; (2) agora há **uma turma só**: quem aceita um pedido junta as turmas (todo mundo passa a ver todo mundo); (3) o app pergunta uma vez se mostra a **meta em ml** (e dá para mudar em Ajustes); (4) em Ajustes → Amigos: o **resumo da semana da turma** (domingo, 19h) vem ligado para quem já recebe os avisos dos amigos e dá para desligar; o aviso de **meta batida** vem desligado e só liga quem quiser; (5) os avisos esperam a pessoa acordar (horário de acordar e dormir do Maré).

### Compatibilidade e limitações (1.2.0)
- **Aparelhos na 1.1.x** continuam funcionando, mas mostram a lista em ordem alfabética, sem ranking, sem a meta em ml e (até atualizarem) com o selo no ícone; o "Remover amizade" deles funciona, mas **o servidor recria o par** na junção ou na conferência diária. O resumo da semana e os avisos de entrada na turma chegam a eles como avisos de amigos normais, e a única chave que eles têm é a de "Avisos dos amigos" (desliga tudo).
- **Sem retentativas de envio** (como antes): se o FCM falha naquele instante, o push se perde; a fila do silêncio só segura o que **chegou** com a pessoa dormindo.
- **O push de quem dorme chega até 15 min depois de acordar** (o `flushHeld` roda de 15 em 15). Quem muda o horário de dormir no meio da noite tem a fila remarcada no próximo ciclo.
- **Turma de no máximo 31**; acima disso as pessoas continuam só com as amizades que aceitaram.
- **Sem como tirar ou bloquear uma pessoa da turma**; só sair (ver risco aceito acima).
- **O resumo da semana depende de `users/{uid}.tz`** (o app sempre grava; um nome de fuso fora da lista de `crew-push.js` fica sem o resumo) e de a pessoa ter aparelho registrado.
- **Custo e abuso:** ver "Limitações que a revisão apontou" (campos de `users/{uid}` sem limite de tamanho; `onProfile` disparado pelo cliente). Ligue o **App Check** e um **alerta de orçamento** no Cloud Billing.
- **Pushes de meta e resumo só chegam a quem registrou o aparelho** com a permissão dada (como os outros).

### Não testado (só um deploy e aparelhos reais mostram)
- Tudo o que depende do **Google real**: a entrega do FCM; o gatilho `onProfile` e os três trabalhos do Cloud Scheduler em produção; e **índices**: o emulador não cobra índices, e as consultas novas (`users` com `tz in`, `pushq` com `due <=` e `orderBy('due')`, `friendships` com `st == 'active'` e `orderBy('__name__')`) usam só os índices automáticos de um campo, o que deveria bastar. Se o Firestore pedir um índice, o erro no registro da função traz o link para criá-lo.
- O gosto visual da aba Amigos em aparelhos de verdade (o ranking foi desenhado sem ver o ForgeX) e o teste de ponta a ponta com **duas pessoas reais** (a tarefa pendente desde a Parte 9).

### Ideias para depois
- **Silenciar ou esconder uma pessoa** (só para mim) e **turma com dono** (quem entra precisa ser aprovado por quem criou), para o risco de "o amigo traz um desconhecido".
- **Retentativas** do envio com `pushlog`/`pushq` (hoje um aviso que falha se perde, de propósito).
- **Desafios cooperativos** da turma ("a turma bebe 50 L juntos neste mês"), mantendo a regra de nunca humilhar ninguém.
- Resumo do mês; i18n (en/es).
