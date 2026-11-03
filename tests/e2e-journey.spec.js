// Maré — testes de interface da Jornada (1.6.0 e 1.7.0): as 30 medalhas (por grupo, com quanto falta), "Mais perto de conquistar", "Seus padrões" em gráficos e "Seus meses".
// Cada teste roda em todos os aparelhos do playwright.config.js. Qualquer erro de JavaScript na página reprova.
// Os históricos são montados com tests/helpers/seed.js (history = um registro às 10h por dia; rows = dias com horários à escolha). Como a data do teste
// muda, nada aqui depende do dia da semana em que ele roda: o que depende (fim de semana, 22 de março) fica de fora das contas exatas.
import { test, expect } from '@playwright/test';
import { seed } from './helpers/seed.js';
import { stubFriendsCloud, SOCIAL_ON } from './helpers/friends.js';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
});
test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

const tab = (page, name) => page.locator('#tabbar').getByRole('button', { name: name, exact: true });
const cup = (page, label) => page.getByRole('button', { name: 'Adicionar ' + label, exact: true });
const sheetOf = (page) => page.locator('#sheetBody');
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
const medal = (page, name) => page.locator('.medals .medal').filter({ has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) });
const OLD12 = ['first', 'goal', 's3', 's7', 's14', 's30', 'early', 'sunset', 'mission', 'm10', 'weekend', 'd10'];
const NOON = (page, ago) => page.evaluate((n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.getTime(); }, ago); // o meio-dia de n dias atrás: a data de uma medalha retroativa
const OCEAN = { concha: 6 }; // com a concha guardada, quem tem uma estrela-do-mar (10 L) a ganha em silêncio, sem o painel "Nova insígnia!"
const REEF5 = { concha: 40, estrela: 38, baiacu: 30, tartaruga: 20, cavalo: 10 };

test('jornada: as 30 medalhas vêm em 6 grupos, e as que faltam mostram quanto já foi', async ({ page }) => {
  await seed(page, { history: [5, 2800], insignias: OCEAN }); // 5 dias seguidos na meta, às 10h
  await page.goto('/');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.mg-h h3')).toHaveText(['Começos e missões', 'Sequências', 'Metas batidas', 'Rotina do dia', 'Fins de semana e datas', 'Com a turma']);
  await expect(page.locator('.medals .medal')).toHaveCount(30);
  const won = await page.locator('.medals .medal:not(.off)').count(); // o número do título é o das medalhas conquistadas que estão na tela
  expect(won).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Medalhas$/ }) }).locator('small')).toHaveText(won + ' de 30');
  // a contagem de cada grupo (os grupos que não dependem do dia da semana em que o teste roda)
  await expect(page.locator('.mg-h').nth(0)).toContainText('2 de 7'); // Primeira gota e Na mosca
  await expect(page.locator('.mg-h').nth(1)).toContainText('1 de 6'); // Pegando o ritmo
  await expect(page.locator('.mg-h').nth(2)).toContainText('0 de 5');
  await expect(page.locator('.mg-h').nth(3)).toContainText('2 de 5'); // Antes do pôr do sol e Relógio da maré
  await expect(page.locator('.mg-h').nth(5)).toContainText('0 de 1'); // Turma completa
  // conquistada: sem barra e com a data
  await expect(medal(page, 'Pegando o ritmo')).not.toHaveClass(/off/);
  await expect(medal(page, 'Pegando o ritmo').locator('em')).toBeVisible();
  await expect(medal(page, 'Relógio da maré')).not.toHaveClass(/off/);
  // bloqueada com andamento: quanto já foi, em texto e em barra
  const s7 = medal(page, 'Semana fluida');
  await expect(s7).toHaveClass(/off/);
  await expect(s7).toContainText('5 de 7 dias');
  await expect(s7.locator('.mprog i')).toHaveAttribute('data-w', '71');
  await expect(medal(page, 'Quinzena firme')).toContainText('5 de 14 dias');
  await expect(medal(page, 'Dez na meta')).toContainText('5 de 10 dias');
  await expect(medal(page, 'Mês de ouro')).toContainText('5 de 25 dias');
  await expect(medal(page, 'Explorador')).toContainText('0 de 10 missões');
  await expect(medal(page, 'Alvorada')).toContainText('0 de 7 dias');
  // as medalhas da 1.7.0: dias de uso, fins de semana de ouro, e as que são "tudo ou nada" (o verão, o Dia dos Oceanos e a turma)
  await expect(medal(page, 'Um mês de Maré')).toContainText('5 de 30 dias');
  await expect(medal(page, 'Cem dias de Maré')).toContainText('5 de 100 dias');
  await expect(medal(page, 'Fins de semana de ouro')).toContainText(' de 12 fins de semana');
  for (const nome of ['Verão em dia', 'Turma completa']) {
    const m = medal(page, nome);
    await expect(m, nome).toHaveClass(/off/);
    await expect(m.locator('.mprog'), nome).toHaveCount(0);
    await expect(m.locator('.sr'), nome).toHaveText('Ainda não conquistada');
  }
  await expect(medal(page, 'Verão em dia')).toContainText('Meta batida em 30 dias entre 21 de dezembro e 20 de março');
  await expect(medal(page, 'Turma completa')).toContainText('Você e pelo menos 2 amigos bateram a meta no mesmo dia');
  await expect(medal(page, 'Dia dos Oceanos')).toContainText('Água registrada em 8 de junho');
  // "tudo ou nada": sem barra, só o aviso para o leitor de tela
  const back = medal(page, 'Volta por cima');
  await expect(back).toHaveClass(/off/);
  await expect(back.locator('.mprog')).toHaveCount(0);
  await expect(back.locator('.sr')).toHaveText('Ainda não conquistada');
  // a descrição de cada medalha continua lá
  await expect(back).toContainText('Bateu a meta depois de 3 dias sem bater');
});

test('"Mais perto de conquistar" aponta a medalha mais adiantada, no desenho da missão do dia, e some quando nada foi começado', async ({ page }) => {
  await seed(page, { history: [5, 2800], insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const near = page.locator('.mission.near');
  await expect(near).toHaveCount(1);
  await expect(near).toContainText('Mais perto de conquistar');
  await expect(near.locator('.m-t')).toHaveText('Semana fluida: faltam 2 dias'); // 5 de 7 dias seguidos (71%), a mais adiantada
  await expect(near).toContainText('7 dias seguidos na meta');
  await expect(near.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '71');
  await expect(near.locator('.bar i')).toHaveAttribute('data-w', '71');
  // o cartão fica entre o título "Medalhas" e o primeiro grupo
  await expect(page.locator('.card-h.out + .mission.near + .mg-h')).toHaveCount(1);
  // sem nada começado (nenhum registro): não há o que apontar
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await seed(p2, {});
  await p2.goto('/');
  await p2.locator('#tabbar').getByRole('button', { name: 'Jornada', exact: true }).click();
  await expect(p2.locator('.medals .medal')).toHaveCount(30);
  await expect(p2.locator('.mission.near')).toHaveCount(0);
  await expect(p2.locator('.card-h.out + .mg-h')).toHaveCount(1);
  await p2.close();
});

test('"falta 1": uma medalha a um passo de sair fala no singular, em cada unidade (dia, missão, fim de semana)', async ({ page }) => {
  await seed(page, { history: [6, 2800], insignias: OCEAN }); // 6 de 7 dias seguidos na meta
  await page.goto('/');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.mission.near .m-t')).toHaveText('Semana fluida: falta 1 dia');
  await expect(medal(page, 'Semana fluida')).toContainText('6 de 7 dias');
  await expect(page.locator('.mission.near .bar i')).toHaveAttribute('data-w', '86');
  const other = async (opt, title, left, tile) => { // outra tela, com outro histórico
    const p2 = await page.context().newPage();
    p2.on('pageerror', (e) => { errors.push(e.message); });
    await seed(p2, opt);
    await p2.goto('/');
    await p2.locator('#tabbar').getByRole('button', { name: 'Jornada', exact: true }).click();
    await expect(p2.locator('.mission.near .m-t')).toHaveText(title + ': ' + left);
    await expect(p2.locator('.medals .medal.off', { has: p2.locator('b', { hasText: new RegExp('^' + title + '$') }) })).toContainText(tile);
    await p2.close();
  };
  await other({ missions: [1, 2, 3, 4, 5, 6, 7, 8, 9], insignias: OCEAN }, 'Explorador', 'falta 1 missão', '9 de 10 missões'); // 9 de 10 missões (90%)
  // os 3 fins de semana mais recentes (sábado e domingo, os dois na meta): 3 de 4 (75%), à frente de tudo o mais
  const rows = [], now = new Date();
  for (let n = 1, found = 0; n <= 27 && found < 3; n++) {
    if (new Date(now.getFullYear(), now.getMonth(), now.getDate() - n).getDay() !== 0) continue; // um domingo, n dias atrás
    rows.push([n, [[10, 0, 2000]], 2000], [n + 1, [[10, 0, 2000]], 2000]); // ele e o sábado de antes
    found++;
  }
  await other({ rows: rows, insignias: OCEAN }, 'Fins de semana firmes', 'falta 1 fim de semana', '3 de 4 fins de semana');
});

test('seus padrões: com menos de 4 dias de água só o convite, dizendo quantos já há', async ({ page }) => {
  await seed(page, { rows: [[1, [[8, 0, 500]]], [2, [[9, 0, 500]]]], insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const box = page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Seus padrões$/ }) });
  await expect(box.locator('small')).toHaveText('últimas 4 semanas');
  await expect(page.locator('.empty', { hasText: 'Registre água em pelo menos 4 dias' })).toContainText('Você já tem 2 de 4.');
  await expect(page.locator('.rh')).toHaveCount(0);
  await expect(page.locator('.wk-plot.sm')).toHaveCount(0);
  const p2 = await page.context().newPage(); // e sem nenhum dia, o convite não fala de "0 de 4"
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await seed(p2, {});
  await p2.goto('/');
  await p2.locator('#tabbar').getByRole('button', { name: 'Jornada', exact: true }).click();
  await expect(p2.locator('.empty', { hasText: 'Registre água em pelo menos 4 dias' })).not.toContainText('Você já tem');
  await p2.close();
});

test('seus padrões: o resumo, o ritmo do dia (com a faixa mais seca e a de mais água) e a semana, cada um num cartão', async ({ page }) => {
  // 10 dias seguidos: 500 ml às 8h e 1500 ml às 15h, meta de 2000 ml (todos batem a meta às 15h)
  const rows = []; for (let i = 1; i <= 10; i++) rows.push([i, [[8, 0, 500], [15, 0, 1500]], 2000]);
  await seed(page, { rows: rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const pat = page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Seus padrões$/ }) });
  await expect(pat).toBeVisible();
  // resumo
  const cards = page.locator('section.card').filter({ has: page.locator('.ins-list') }).filter({ hasNot: page.locator('.hm, .mo-b') }); // os cartões de "Seus meses" têm as suas frases também
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Você bateu a meta em 10 dos últimos 10 dias (100%). Constância de respeito!');
  await expect(cards.nth(0)).toContainText('+133% de hidratação nos últimos 7 dias em relação aos 7 anteriores.');
  // ritmo do dia
  const rh = cards.nth(1);
  await expect(rh.getByRole('heading', { name: 'Seu ritmo no dia' })).toBeVisible();
  await expect(rh.locator('small').first()).toHaveText('últimas 2 semanas');
  await expect(rh.getByRole('img', { name: /Água por hora do dia, nas últimas 2 semanas\. Mais água das 13h às 16h\. Período mais seco das 9h às 12h\./ })).toBeVisible();
  await expect(rh.locator('.rh-b')).toHaveCount(16); // das 7h às 22h, o horário em que a pessoa está acordada
  await expect(rh.locator('.rh-band.dry')).toHaveAttribute('style', /left:12\.50%;width:18\.75%/); // 9h: a terceira coluna de 16
  await expect(rh.locator('.rh-band.pk')).toHaveAttribute('style', /left:37\.50%;width:18\.75%/); // 13h
  await expect(rh.locator('.rh-leg')).toContainText('Mais seco, 9h às 12h');
  await expect(rh.locator('.rh-leg')).toContainText('Mais água, 13h às 16h');
  await expect(rh.locator('.rh-x b')).toHaveText(['9h', '12h', '15h', '18h', '21h']); // um rótulo a cada 3 horas, nas horas "redondas"
  await expect(rh).toContainText('Seu período mais seco costuma ser das 9h às 12h. Deixe uma garrafa por perto nesse horário.');
  await expect(rh).toContainText('Só 25% da sua água vem antes do meio-dia. Um copo ao acordar faz diferença.');
  await expect(rh).toContainText('Você costuma completar a meta por volta das 15h.');
  await expect(rh).not.toContainText('primeiro copo'); // acordou às 7h e bebeu às 8h: nada a avisar
  // a coluna das 15h é a mais alta, e as horas sem água não têm barra
  const hs = await rh.locator('.rh-b i').evaluateAll((els) => els.map((e) => +e.getAttribute('data-w')));
  expect(hs[15 - 7]).toBe(100);
  expect(hs[8 - 7]).toBe(33);
  expect(hs[10 - 7]).toBe(0);
  // semana
  const wk = cards.nth(2);
  await expect(wk.getByRole('heading', { name: 'Sua semana' })).toBeVisible();
  await expect(wk.locator('.wk-plot.sm .wk-col')).toHaveCount(7);
  await expect(wk.locator('.wk-val')).toHaveText(['100%', '100%', '100%', '100%', '100%', '100%', '100%']);
  await expect(wk.locator('.wk-labels span')).toHaveText(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']);
  await expect(wk.locator('.wk-col.best')).toHaveCount(1);
  await expect(wk.locator('.wk-col.met')).toHaveCount(7); // 100% da meta (e só isso) ganha a marca de "meta batida"
  await expect(wk.locator('.wk-labels .on')).toHaveCount(1);
  await expect(wk).toContainText('em média 100% da meta.');
  await expect(wk).not.toContainText('ponto fraco'); // todos os dias iguais: não há um mais fraco
  await expect(wk.locator('.wk-col').first()).toHaveAttribute('aria-label', /^Domingos: em média 100% da meta, em \d dias?$/);
  // as barras crescem até o valor (a animação termina no destino)
  await expect(wk.locator('.wk-bar').first()).toHaveAttribute('data-w', '82');
});

test('seus padrões: a hora com pouca água ganha uma coluna mínima visível, e a semana abaixo da meta não enche o gráfico', async ({ page }) => {
  // 10 dias: 1980 ml às 8h e só 20 ml às 15h (1% da hora mais cheia); a meta é de 4000 ml, então todos os dias ficam em 50% (2000 de 4000)
  const rows = []; for (let i = 1; i <= 10; i++) rows.push([i, [[8, 0, 1980], [15, 0, 20]], 4000]);
  await seed(page, { rows: rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const hs = await page.locator('.rh .rh-b i').evaluateAll((els) => els.map((e) => +e.getAttribute('data-w')));
  expect(hs[8 - 7]).toBe(100);
  expect(hs[15 - 7]).toBe(5); // 1% de verdade, mas nunca menos de 5% de altura (para dar para ver)
  expect(hs[10 - 7]).toBe(0); // sem água, sem coluna
  // a semana: todos os dias a 50%. A barra é medida contra a meta (100%), não contra o melhor dia: 50% / (100% / 0,82) = 41
  const wk = page.locator('.wk-plot.sm');
  await expect(wk.locator('.wk-val').first()).toHaveText('50%');
  await expect(wk.locator('.wk-bar').first()).toHaveAttribute('data-w', '41');
  await expect(wk.locator('.wk-col.met')).toHaveCount(0);
  await expect(wk.locator('.wk-goal')).toHaveAttribute('style', /^bottom:82%$/); // a linha da meta (100%) fica a 82% da altura
});

test('seus padrões: o dia da semana sem nenhum registro fica em branco (sem "0%") e o leitor de tela ouve "sem registros"', async ({ page }) => {
  const rows = []; for (let i = 1; i <= 5; i++) rows.push([i, [[9, 0, 1000]], 2000]); // 5 dias seguidos: sobram 2 dias da semana sem registro
  await seed(page, { rows: rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const wk = page.locator('.wk-plot.sm');
  await expect(wk.locator('.wk-col')).toHaveCount(7);
  await expect(wk.locator('.wk-col[aria-label$="sem registros"]')).toHaveCount(2);
  const vals = await wk.locator('.wk-val').allTextContents();
  expect(vals.filter((v) => v === '').length).toBe(2);
  expect(vals.filter((v) => v === '50%').length).toBe(5);
  await expect(wk.locator('.wk-bar[data-w="0"]')).toHaveCount(2);
});

test('seus padrões: a semana mostra o melhor dia e o ponto fraco, e o fim de semana contra os dias úteis', async ({ page }) => {
  // 4 semanas inteiras: sábados e domingos com 40% da meta, os outros dias com 100% (meta de 2000 ml)
  const rows = [];
  for (let i = 1; i <= 28; i++) {
    const wd = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - i).getDay();
    rows.push([i, [[9, 0, wd === 0 || wd === 6 ? 800 : 2000]], 2000]);
  }
  await seed(page, { rows: rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const wk = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Sua semana' }) });
  await expect(wk).toContainText(/Você se hidrata melhor (às|aos) \p{L}+: em média 100% da meta\./u);
  await expect(wk).toContainText(/Seu ponto fraco são os (domingos|sábados): em média 40% da meta\./);
  await expect(wk).toContainText('Nos fins de semana você fica em média em 40% da meta, contra 100% nos dias úteis.');
  await expect(wk.locator('.wk-val')).toHaveText(['40%', '100%', '100%', '100%', '100%', '100%', '40%']);
  // o gráfico acompanha: as colunas dos fins de semana são mais baixas
  const h = await wk.locator('.wk-bar').evaluateAll((els) => els.map((e) => +e.getAttribute('data-w')));
  expect(h[0]).toBeLessThan(h[1]);
  expect(h[6]).toBeLessThan(h[5]);
  expect(h[0]).toBe(h[6]);
});

// Dois meses de uso, montados no navegador (o fuso do teste é o do aparelho): o mês anterior com 1000 ml por dia (50% da meta de 2000) e o mês de agora, até
// ontem, com 3000 ml (meta batida). O "mês de agora" é o do último dia que acabou; se ele ainda tem menos de 7 dias (começo de mês), vale o mês que passou.
// Com holes = true, os dias 5, 10, 15, 20, 25 e 30 de cada mês ficam sem nenhum registro (nCur e nPrev contam só os dias com água; curDays e prevDays, os do calendário).
async function twoMonths(page, holes) {
  await page.goto('about:blank');
  return page.evaluate((holes) => {
    const NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const now = new Date(), D = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n), ym = (d) => d.getFullYear() * 12 + d.getMonth(), last = D(1);
    const cur = last.getDate() < 7 ? ym(last) - 1 : ym(last), rows = [];
    let nCur = 0, nPrev = 0, cal = 0, oldest = 0;
    for (let n = 1; n <= 75; n++) {
      const d = D(n), m = ym(d), hole = holes && d.getDate() % 5 === 0;
      if (m === cur) { cal++; if (!hole) { rows.push([n, [[10, 0, 3000]], 2000]); nCur++; } oldest = n; } else if (m === cur - 1) { if (!hole) { rows.push([n, [[10, 0, 1000]], 2000]); nPrev++; } oldest = n; }
    }
    const len = (m) => new Date(Math.floor(m / 12), (m % 12) + 1, 0).getDate();
    return { rows: rows, cur: NAMES[cur % 12], prev: NAMES[(cur - 1) % 12], nCur: nCur, nPrev: nPrev, span: oldest + 1, curDays: cal, prevDays: len(cur - 1), sample: rows[0][0], sampleMl: rows[0][1][0][2] };
  }, !!holes);
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

test('seus meses: com pouco histórico só o convite, e o calendário já mostra o que há', async ({ page }) => {
  await seed(page, { history: [3, 2800], insignias: OCEAN }); // o app foi criado há 10 dias; 3 deles com a meta batida
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const head = page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Seus meses$/ }) });
  await expect(head.locator('small')).toHaveText('mês a mês');
  await expect(page.locator('.empty', { hasText: 'Com pelo menos uma semana de uso em dois meses seguidos' })).toBeVisible();
  await expect(page.locator('.mo-b')).toHaveCount(0);
  const cal = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Seu calendário' }) });
  await expect(cal.locator('.card-h small')).toHaveText('últimos 3 meses');
  await expect(cal.locator('.hm-col')).toHaveCount(13); // 13 semanas, a última é a de hoje
  await expect(cal.locator('.hm-c.today')).toHaveCount(1);
  await expect(cal.locator('.hm-c.l3')).toHaveCount(3); // os 3 dias com a meta batida
  await expect(cal.locator('.hm-c.pre').first()).toBeVisible(); // o espaço de antes de a pessoa começar fica vazio, sem cor
  expect(await cal.locator('.hm-ms span').count()).toBeGreaterThanOrEqual(1);
  await expect(cal.getByRole('img', { name: /Calendário dos últimos 3 meses, uma coluna por semana e um quadradinho por dia\. Você bateu a meta em 3 de 11 dias\./ })).toBeVisible();
  await expect(cal.locator('.ins-list')).toContainText('Você bateu a meta em 3 de 11 dias.'); // do primeiro dia de uso até hoje
  await expect(cal.locator('.legend')).toContainText('Menos');
  await expect(cal.locator('.legend')).toContainText('Meta');
});

test('seus meses: o mês de agora contra o anterior em barras e em duas frases, e o calendário pinta cada dia pelo nível da meta', async ({ page }) => {
  const pl = await twoMonths(page);
  await seed(page, { rows: pl.rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const head = page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Seus meses$/ }) });
  await expect(head.locator('small')).toHaveText(pl.cur + ' e ' + pl.prev);
  const mo = page.locator('section.card').filter({ has: page.locator('.mo-b') });
  await expect(mo.locator('.mo-k')).toHaveText(['Média por dia', 'Dias na meta']);
  await expect(mo.locator('.mo-n')).toHaveText([cap(pl.cur), cap(pl.prev), cap(pl.cur), cap(pl.prev)]);
  await expect(mo.locator('.mo-b.on')).toHaveCount(2); // o mês de agora é o destacado, nas duas linhas
  await expect(mo.locator('.mo-v')).toHaveText(['3.000 ml', '1.000 ml', pl.curDays + ' de ' + pl.curDays, '0 de ' + pl.prevDays]);
  await expect(mo.locator('.mo-v').nth(3)).toBeVisible();
  expect(await mo.locator('.mo-t i').evaluateAll((els) => els.map((e) => +e.getAttribute('data-w')))).toEqual([100, 33, 100, 0]);
  await page.waitForTimeout(900); // as barras crescem até o valor
  expect(await mo.locator('.mo-t i').evaluateAll((els) => els.map((e) => Math.round((e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width) * 100)))).toEqual([100, 33, 100, 0]);
  await expect(mo).toContainText('Sua média por dia em ' + pl.cur + ' está 200% acima da de ' + pl.prev + '.');
  await expect(mo).toContainText('Você bateu a meta em 100% dos dias de ' + pl.cur + ', contra 0% em ' + pl.prev + '. Que evolução!');
  // o calendário: cada dia no seu nível (meta batida, metade da meta, sem registro) e o texto conta os dias na meta
  const cal = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Seu calendário' }) });
  await expect(cal.locator('.hm-c.l3')).toHaveCount(pl.nCur);
  await expect(cal.locator('.hm-c.l2')).toHaveCount(pl.nPrev); // 1000 de 2000 ml: metade da meta
  await expect(cal.locator('.ins-list')).toContainText('Você bateu a meta em ' + pl.nCur + ' de ' + pl.span + ' dias.');
  expect(await cal.locator('.hm-ms span').count()).toBeGreaterThanOrEqual(2); // dois ou três rótulos de mês, nunca sobrepostos (o layout confere as posições)
});

test('seus meses: os dias sem nenhum registro contam no mês, e o "N de M" e a média usam os dias do calendário, não só os dias com água', async ({ page }) => {
  const pl = await twoMonths(page, true);
  expect(pl.curDays, 'o mês de agora precisa ter dias sem registro').toBeGreaterThan(pl.nCur);
  expect(pl.prevDays, 'o mês anterior também').toBeGreaterThan(pl.nPrev);
  await seed(page, { rows: pl.rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const mo = page.locator('section.card').filter({ has: page.locator('.mo-b') });
  const ml = (n) => n.toLocaleString('pt-BR') + ' ml', avgC = Math.round((pl.nCur * 3000) / pl.curDays), avgP = Math.round((pl.nPrev * 1000) / pl.prevDays);
  await expect(mo.locator('.mo-v')).toHaveText([ml(avgC), ml(avgP), pl.nCur + ' de ' + pl.curDays, '0 de ' + pl.prevDays]); // a meta foi batida nos dias com água; os outros contam como dia sem meta
  await expect(mo).toContainText('Você bateu a meta em ' + Math.round((pl.nCur / pl.curDays) * 100) + '% dos dias de ' + pl.cur + ', contra 0% em ' + pl.prev + '.');
  const top = Math.max(avgC, avgP);
  await page.waitForTimeout(900); // as barras crescem até o valor
  expect(await mo.locator('.mo-t i').evaluateAll((els) => els.map((e) => +e.getAttribute('data-w')))).toEqual([Math.round((avgC / top) * 100), Math.round((avgP / top) * 100), Math.round((pl.nCur / pl.curDays) * 100), 0]);
});

test('seus meses: tocar num quadradinho do calendário abre o dia, como no Histórico', async ({ page }) => {
  const pl = await twoMonths(page);
  await seed(page, { rows: pl.rows, insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const k = await page.evaluate((n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }, pl.sample);
  const cell = page.locator('.hm-c[data-day="' + k + '"]');
  await expect(cell).toHaveCount(1);
  await expect(cell).toHaveAttribute('title', /^\d{1,2} de [a-zç]+: [\d.]+ ml$/);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheetBody .day-sum b')).toHaveText((pl.sampleMl >= 1000 ? Math.floor(pl.sampleMl / 1000) + '.' + String(pl.sampleMl % 1000).padStart(3, '0') : String(pl.sampleMl)) + ' ml');
  await expect(sheetOf(page)).toContainText('de 2.000 ml');
  await expect(sheetOf(page).getByRole('button', { name: 'Adicionar registro' })).toBeVisible(); // o mesmo painel do Histórico: dá para acrescentar um registro
});

test('quem já usava o Maré ganha as medalhas novas de uma vez, sem chuva de cartões, com a data em que as merecia; o cartão de novidades conta', async ({ page }) => {
  // o estado da 1.6.x: 40 dias seguidos na meta, às 10h, e só as 24 medalhas daquela versão que estavam guardadas (as de 1.6.0 que o histórico cumpre ainda não foram dadas)
  await seed(page, { history: [40, 2800], insignias: REEF5, medals: ['first', 'goal', 's3', 's7', 's14', 's30', 'sunset', 'd10', 'weekend'], ui: { tip_news17: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('6 medalhas novas');
  await expect(page.locator('#tTips .tip')).toContainText('o seu mês contra o anterior');
  await page.waitForTimeout(2500); // se houvesse cartão de medalha por causa da atualização, ele já estaria na tela
  await expect(page.locator('.medal-pop')).toHaveCount(0);
  await expect(page.locator('#sheet')).toBeHidden();
  const st = await stored(page), got = st.achievements;
  ['d30', 'sunset5', 'win25', 'weekends4', 'm1'].forEach((id) => { expect(got[id], id).toBeGreaterThan(0); });
  ['s60', 's100', 'd100', 'm30', 'early7', 'thirds7', 'back', 'use100', 'weekends12', 'crew'].forEach((id) => { expect(got[id], id).toBeUndefined(); }); // a da turma só sai ao vivo, nunca pelo histórico
  // a data é a do dia em que o histórico passou a cumprir a medalha, e não a de hoje
  expect(got.d30, 'a 30ª meta bateu há 11 dias').toBe(await NOON(page, 11));
  expect(got.m1, 'o 30º dia de água foi há 11 dias').toBe(await NOON(page, 11));
  expect(got.sunset5, 'a 5ª meta bateu há 36 dias').toBe(await NOON(page, 36));
  expect(got.win25, 'a 25ª meta bateu há 16 dias').toBe(await NOON(page, 16));
  OLD12.filter((id) => st.achievements[id] === 1).forEach((id) => { expect(got[id], id + ' (já guardada) não muda').toBe(1); });
  // o painel de novidades diz quantas já vieram, e a Jornada mostra as datas
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('6 medalhas novas');
  await expect(sheetOf(page)).toContainText(/Você já conquistou [1-3] das novas, com a data em que as merecia\./); // o mês de Maré e, conforme o dia do teste, o Dia dos Oceanos ou o verão
  await expect(sheetOf(page)).toContainText('Seus meses');
  await expect(sheetOf(page)).toContainText('Medalhas na conta');
  await sheetOf(page).getByRole('button', { name: 'Ver minhas medalhas' }).click();
  await expect(tab(page, 'Jornada')).toHaveAttribute('aria-current', 'page');
  await expect(medal(page, 'Trinta na meta')).not.toHaveClass(/off/);
  await expect(medal(page, 'Trinta na meta').locator('em')).toBeVisible();
  await expect(medal(page, 'Um mês de Maré')).not.toHaveClass(/off/);
  await expect(medal(page, 'Um mês de Maré').locator('em')).toBeVisible();
  await expect(medal(page, 'Cem na meta')).toHaveClass(/off/);
  await expect(medal(page, 'Cem na meta')).toContainText('40 de 100 dias');
  await expect(medal(page, 'Cem dias de Maré')).toContainText('40 de 100 dias');
  await expect(medal(page, 'Maré viva')).toContainText('40 de 60 dias'); // 40 dias seguidos
  await expect(page.locator('.mission.near')).toContainText('Maré viva: faltam 20 dias'); // a mais adiantada: 40 de 60 (67%); Cem na meta e Cem dias de Maré, 40%
  // reabrir o app não mexe em nada (nem nas datas)
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  const again = (await stored(page)).achievements;
  expect(again).toEqual(got);
  // e registrar água depois disso não faz chover cartão de medalha antiga
  await tab(page, 'Hoje').click();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré'); // abrir o painel apagou o cartão (também depois de recarregar)
  const ui = (await stored(page)).ui;
  expect([ui.tip_news17, ui.tip_news16, ui.tip_news15, ui.tip_news12]).toEqual([1, 1, 1, 1]);
  await cup(page, '250 ml').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('.medal-pop')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
});

test('o cartão de novidades só fala da turma para quem mostra o progresso a ela, e dispensá-lo o apaga para sempre', async ({ page }) => {
  // sem a turma ligada: nada sobre a turma, nem no cartão nem no painel
  await seed(page, { history: [6, 2800], insignias: OCEAN, ui: { tip_news17: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('6 medalhas novas');
  await expect(page.locator('#tTips .tip')).not.toContainText('turma');
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('Veja o que cada uma pede, na Jornada.');
  await expect(sheetOf(page)).not.toContainText('para a turma');
  await expect(sheetOf(page).getByRole('button', { name: 'Ver minhas medalhas' })).toBeVisible();
  await expect(sheetOf(page).getByRole('button', { name: 'Conhecer a turma' })).toBeVisible();
  await expect(sheetOf(page).getByRole('button', { name: 'Depois' })).toBeVisible();
  await expect(sheetOf(page)).toContainText('Das versões anteriores');
  await expect(sheetOf(page)).toContainText('Quanto falta e seus padrões');
  await expect(sheetOf(page)).toContainText('Mais cinco bichinhos no recife');
  await sheetOf(page).getByRole('button', { name: 'Conhecer a turma' }).click();
  await expect(page.locator('#tabbar').getByRole('button', { name: /^Amigos/ })).toHaveAttribute('aria-current', 'page');
});

test('o cartão de novidades: com a turma ligada e o progresso compartilhado ele avisa que as medalhas novas aparecem para a turma', async ({ page }) => {
  await stubFriendsCloud(page, { code: 'ABCD2345' });
  await seed(page, { history: [6, 2800], insignias: OCEAN, social: SOCIAL_ON, ui: { tip_news17: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('As medalhas novas também aparecem para a turma.');
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('Elas também aparecem no seu perfil para a turma.');
});

test('o cartão de novidades: quem está na turma mas não compartilha o progresso não ouve falar de medalhas na turma', async ({ page }) => {
  await stubFriendsCloud(page, { code: 'ABCD2345' });
  await seed(page, { history: [6, 2800], insignias: OCEAN, social: Object.assign({}, SOCIAL_ON, { share: false }), ui: { tip_news17: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('6 medalhas novas');
  await expect(page.locator('#tTips .tip')).not.toContainText('turma');
  // o painel também não promete a turma: com o progresso escondido, os amigos não veem as medalhas
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('Veja o que cada uma pede, na Jornada.');
  await expect(sheetOf(page)).not.toContainText('para a turma');
  await sheetOf(page).getByRole('button', { name: 'Depois' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré'); // abrir o painel já tinha apagado o cartão
});

test('o cartão de novidades: dispensar no "x" o apaga para sempre, sem abrir o painel', async ({ page }) => {
  await seed(page, { history: [6, 2800], insignias: OCEAN, ui: { tip_news17: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Novidades no Maré');
  await page.locator('#tTips .tip').getByRole('button', { name: 'Dispensar dica' }).click();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
  await expect(page.locator('#sheet')).toBeHidden();
  expect((await stored(page)).ui.tip_news17).toBe(1);
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
});

test('importar um backup da 1.5 (só as medalhas antigas) já traz as medalhas novas que o histórico cumpre, em silêncio e com a data certa', async ({ page }) => {
  await seed(page, { insignias: OCEAN });
  await page.goto('/');
  const days = {}, now = new Date(), p2 = (n) => (n < 10 ? '0' : '') + n;
  for (let i = 1; i <= 40; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), k = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    days[k] = { goal: 2000, entries: [{ id: 'b' + i, t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).getTime(), ml: 2500, d: 'water' }] };
  }
  const backup = { app: 'mare', v: 1, data: { v: 1, onboarded: true, profile: { name: 'Bia', weight: 60, theme: 'light' }, days: days, achievements: { first: 1, goal: 1, s3: 1 } } };
  await tab(page, 'Ajustes').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar' }).click()]);
  await chooser.setFiles({ name: 'mare-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await sheetOf(page).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.locator('#toast')).toContainText('Backup restaurado');
  await page.waitForTimeout(2500);
  await expect(page.locator('.medal-pop')).toHaveCount(0);
  const got = (await stored(page)).achievements;
  expect(got.first, 'o que o backup trazia fica como estava').toBe(1);
  expect(got.s3).toBe(1);
  ['s7', 's14', 's30', 'd10', 'd30', 'sunset', 'sunset5', 'win25'].forEach((id) => { expect(got[id], id).toBeGreaterThan(1); });
  expect(got.s7, 'a 7ª meta seguida bateu há 34 dias').toBe(await NOON(page, 34));
  expect(got.s30, 'a 30ª bateu há 11 dias').toBe(await NOON(page, 11));
  expect(got.d30, 'a 30ª bateu há 11 dias').toBe(await NOON(page, 11));
  expect(got.m1, 'o 30º dia de água foi há 11 dias').toBe(await NOON(page, 11));
  expect(got.s60).toBeUndefined();
  expect(got.use100).toBeUndefined();
  expect(got.crew).toBeUndefined();
});

test('medalha nova ao vivo: bater a meta depois de 3 dias sem bater comemora "Volta por cima" uma vez só', async ({ page }) => {
  test.setTimeout(60000);
  // há 6 dias a meta foi batida; de 5 a 1 dias atrás, não; hoje faltam 500 ml (meta de 2800 ml)
  const rows = [[6, [[10, 0, 2800]]]]; for (let i = 1; i <= 5; i++) rows.push([i, [[10, 0, 500]]]);
  await seed(page, { rows: rows, todayMl: 2300, insignias: OCEAN });
  await page.goto('/');
  expect((await stored(page)).achievements.back, 'ainda não').toBeUndefined();
  await cup(page, '500 ml').click();
  await expect(page.locator('.medal-pop')).toContainText('Você bateu a meta!');
  await expect(page.locator('.medal-pop')).toContainText('Volta por cima', { timeout: 25000 }); // os cartões saem um de cada vez
  await expect(page.locator('.medal-pop')).toContainText('Bateu a meta depois de 3 dias sem bater');
  const live = (await stored(page)).achievements, nowMs = await page.evaluate(() => Date.now());
  expect(typeof live.back).toBe('number');
  expect(Math.abs(nowMs - live.back), 'a medalha ao vivo leva a hora de agora (não a de um dia retroativo)').toBeLessThan(2 * 60000);
  await expect(page.locator('.medal-pop')).toHaveCount(0, { timeout: 25000 });
  await tab(page, 'Jornada').click();
  await expect(medal(page, 'Volta por cima')).not.toHaveClass(/off/);
  await expect(medal(page, 'Volta por cima').locator('em')).toBeVisible();
});

test('layout: a Jornada com 30 medalhas, os gráficos e o seu mês cabe em qualquer tela, no tema claro e no escuro', async ({ page }, info) => {
  // 70 dias (dois meses de uso, em qualquer dia do ano) com horários variados (cedo, tarde, noite), alguns dias de meta e outros não
  const rows = [];
  for (let i = 1; i <= 70; i++) rows.push([i, i % 3 ? [[7, 40, 400], [9, 30, 350], [12, 30, 700], [16, 0, 600], [20, 30, 500]] : [[10, 0, 300], [22, 20, 400]], 2000]);
  const look = async (pg, scheme) => {
    await pg.locator('#tabbar').getByRole('button', { name: 'Jornada', exact: true }).click();
    await pg.waitForTimeout(900); // as barras terminam de crescer
    await expect(pg.locator('html')).toHaveAttribute('data-theme', scheme);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, 'rolagem lateral (' + scheme + ')').toBeLessThanOrEqual(0);
    const out = await pg.evaluate(() => {
      const w = window.innerWidth, bad = [];
      document.querySelectorAll('.medals .medal, .mission.near, .rh, .wk-plot.sm, .rh-leg span, .mg-h, .mo-b, .mo-v, .hm, .hm-g, .hm .hm-c, .hm + .legend').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.left < -0.5 || r.right > w + 0.5) bad.push(e.className + ' ' + Math.round(r.left) + '–' + Math.round(r.right));
      });
      document.querySelectorAll('.hm-ms span').forEach((b) => { // os rótulos de mês do calendário ficam dentro do cartão e não se sobrepõem
        const r = b.getBoundingClientRect(), c = b.closest('.card').getBoundingClientRect();
        if (r.left < c.left || r.right > c.right) bad.push('mês ' + b.textContent);
      });
      const ms = Array.prototype.slice.call(document.querySelectorAll('.hm-ms span')).map((b) => b.getBoundingClientRect());
      for (let q = 1; q < ms.length; q++) if (ms[q].left < ms[q - 1].right + 2) bad.push('rótulos de mês sobrepostos');
      // cada rótulo fica em cima da semana em que o mês começa (a coluna com o dia 1), ou em cima da primeira coluna (o rótulo que diz o mês de quem abre o calendário)
      const cols = Array.prototype.slice.call(document.querySelectorAll('.hm-col')), at = cols.filter((c) => c.querySelector('.hm-c[data-day$="-01"]')).map((c) => c.getBoundingClientRect().left).concat([cols[0].getBoundingClientRect().left]);
      ms.forEach((r, q) => { if (!at.some((x) => Math.abs(x - r.left) <= 4)) bad.push('rótulo de mês ' + q + ' fora da sua semana'); });
      document.querySelectorAll('.mo-b').forEach((b) => { // o nome do mês e o valor cabem na linha, e a barra tem largura
        const n = b.querySelector('.mo-n'), t = b.querySelector('.mo-t'), v = b.querySelector('.mo-v');
        if (n.scrollWidth > n.clientWidth + 0.5 || v.scrollWidth > v.clientWidth + 0.5 || t.getBoundingClientRect().width < 30) bad.push('linha do mês ' + n.textContent);
      });
      document.querySelectorAll('.rh-x b').forEach((b) => { // os rótulos de hora ficam dentro do cartão
        const r = b.getBoundingClientRect(), c = b.closest('.card').getBoundingClientRect();
        if (r.left < c.left || r.right > c.right) bad.push('hora ' + b.textContent);
      });
      document.querySelectorAll('.medal').forEach((m) => { // nada vaza para fora do bloco da medalha
        const r = m.getBoundingClientRect();
        m.querySelectorAll('b, small, .mprog-t, em').forEach((c) => { const q = c.getBoundingClientRect(); if (q.right > r.right + 0.5 || q.left < r.left - 0.5) bad.push('medalha ' + c.textContent); });
      });
      return bad;
    });
    expect(out, 'blocos fora da tela (' + scheme + ')').toEqual([]);
    await pg.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Jornada ' + scheme + '.png', fullPage: true });
    // o gráfico do ritmo tem altura e as colunas, largura (nada colapsou)
    const g = await pg.evaluate(() => { const p = document.querySelector('.rh-plot').getBoundingClientRect(), b = document.querySelector('.rh-b').getBoundingClientRect(); return { h: p.height, bw: b.width }; });
    expect(g.h).toBeGreaterThan(80);
    expect(g.bw).toBeGreaterThan(6);
    // o calendário colorido: 13 colunas, quadradinhos quadrados e legíveis (pelo menos 9 px) até na tela mais estreita
    const h = await pg.evaluate(() => { const c = document.querySelector('.hm-c[data-day]').getBoundingClientRect(); return { w: c.width, h: c.height, cols: document.querySelectorAll('.hm-col').length, mo: document.querySelectorAll('.mo-b').length }; });
    expect(h.cols).toBe(13);
    expect(h.mo, 'o mês contra o anterior aparece (dois meses de uso)').toBe(4);
    expect(h.w, 'quadradinho do calendário').toBeGreaterThanOrEqual(9);
    expect(Math.abs(h.w - h.h), 'quadradinho quadrado').toBeLessThanOrEqual(1);
  };
  await seed(page, { rows: rows, todayMl: 900, profile: { theme: 'light' }, insignias: REEF5 });
  await page.goto('/');
  await look(page, 'light');
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await seed(p2, { rows: rows, todayMl: 900, profile: { theme: 'dark' }, insignias: REEF5 });
  await p2.goto('/');
  await look(p2, 'dark');
  await p2.close();
});
