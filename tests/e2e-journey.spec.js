// Maré — testes de interface da Jornada da 1.6.0: as 24 medalhas (por grupo, com quanto falta), "Mais perto de conquistar" e "Seus padrões" em gráficos.
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

test('jornada: as 24 medalhas vêm em 5 grupos, e as que faltam mostram quanto já foi', async ({ page }) => {
  await seed(page, { history: [5, 2800], insignias: OCEAN }); // 5 dias seguidos na meta, às 10h
  await page.goto('/');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.mg-h h3')).toHaveText(['Começos e missões', 'Sequências', 'Metas batidas', 'Rotina do dia', 'Fins de semana e datas']);
  await expect(page.locator('.medals .medal')).toHaveCount(24);
  const won = await page.locator('.medals .medal:not(.off)').count(); // o número do título é o das medalhas conquistadas que estão na tela
  expect(won).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Medalhas$/ }) }).locator('small')).toHaveText(won + ' de 24');
  // a contagem de cada grupo (os grupos que não dependem do dia da semana em que o teste roda)
  await expect(page.locator('.mg-h').nth(0)).toContainText('2 de 5'); // Primeira gota e Na mosca
  await expect(page.locator('.mg-h').nth(1)).toContainText('1 de 6'); // Pegando o ritmo
  await expect(page.locator('.mg-h').nth(2)).toContainText('0 de 5');
  await expect(page.locator('.mg-h').nth(3)).toContainText('2 de 5'); // Antes do pôr do sol e Relógio da maré
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
  await expect(p2.locator('.medals .medal')).toHaveCount(24);
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
  const cards = page.locator('section.card').filter({ has: page.locator('.ins-list') });
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

test('quem já usava o Maré ganha as medalhas novas de uma vez, sem chuva de cartões, com a data em que as merecia; o cartão de novidades conta', async ({ page }) => {
  // o estado da 1.5.x: 40 dias seguidos na meta, às 10h, e só as 12 medalhas daquela versão guardadas
  await seed(page, { history: [40, 2800], insignias: REEF5, medals: ['first', 'goal', 's3', 's7', 's14', 's30', 'sunset', 'd10', 'weekend'], ui: { tip_news16: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Agora são 24 medalhas');
  await page.waitForTimeout(2500); // se houvesse cartão de medalha por causa da atualização, ele já estaria na tela
  await expect(page.locator('.medal-pop')).toHaveCount(0);
  await expect(page.locator('#sheet')).toBeHidden();
  const st = await stored(page), got = st.achievements;
  ['d30', 'sunset5', 'win25', 'weekends4'].forEach((id) => { expect(got[id], id).toBeGreaterThan(0); });
  ['s60', 's100', 'd100', 'm30', 'early7', 'thirds7', 'back'].forEach((id) => { expect(got[id], id).toBeUndefined(); });
  // a data é a do dia em que o histórico passou a cumprir a medalha, e não a de hoje
  expect(got.d30, 'a 30ª meta bateu há 11 dias').toBe(await NOON(page, 11));
  expect(got.sunset5, 'a 5ª meta bateu há 36 dias').toBe(await NOON(page, 36));
  expect(got.win25, 'a 25ª meta bateu há 16 dias').toBe(await NOON(page, 16));
  OLD12.filter((id) => st.achievements[id] === 1).forEach((id) => { expect(got[id], id + ' (já guardada) não muda').toBe(1); });
  // o painel de novidades diz quantas já vieram, e a Jornada mostra as datas
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('12 medalhas novas');
  await expect(sheetOf(page)).toContainText(/Você já conquistou [45] das novas, com a data em que as merecia\./); // 4 (5 se o 22 de março cair nos últimos 40 dias)
  await sheetOf(page).getByRole('button', { name: 'Ver minhas medalhas' }).click();
  await expect(tab(page, 'Jornada')).toHaveAttribute('aria-current', 'page');
  await expect(medal(page, 'Trinta na meta')).not.toHaveClass(/off/);
  await expect(medal(page, 'Trinta na meta').locator('em')).toBeVisible();
  await expect(medal(page, 'Cem na meta')).toHaveClass(/off/);
  await expect(medal(page, 'Cem na meta')).toContainText('40 de 100 dias');
  await expect(medal(page, 'Maré viva')).toContainText('40 de 60 dias'); // 40 dias seguidos
  await expect(page.locator('.mission.near')).toContainText('Maré viva: faltam 20 dias'); // a mais adiantada: 40 de 60 (67%); Cem na meta, 40%
  // reabrir o app não mexe em nada (nem nas datas)
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  const again = (await stored(page)).achievements;
  expect(again).toEqual(got);
  // e registrar água depois disso não faz chover cartão de medalha antiga
  await tab(page, 'Hoje').click();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré'); // abrir o painel apagou o cartão (também depois de recarregar)
  expect((await stored(page)).ui.tip_news16).toBe(1);
  await cup(page, '250 ml').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('.medal-pop')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
});

test('o cartão de novidades só fala da turma para quem mostra o progresso a ela, e dispensá-lo o apaga para sempre', async ({ page }) => {
  // sem a turma ligada: nada sobre a turma, nem no cartão nem no painel
  await seed(page, { history: [6, 2800], insignias: OCEAN, ui: { tip_news16: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Agora são 24 medalhas');
  await expect(page.locator('#tTips .tip')).not.toContainText('turma');
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('Veja o que cada uma pede, na Jornada.');
  await expect(sheetOf(page)).not.toContainText('para a turma');
  await expect(sheetOf(page).getByRole('button', { name: 'Ver minhas medalhas' })).toBeVisible();
  await expect(sheetOf(page).getByRole('button', { name: 'Conhecer a turma' })).toBeVisible();
  await expect(sheetOf(page).getByRole('button', { name: 'Depois' })).toBeVisible();
  await expect(sheetOf(page)).toContainText('Das versões anteriores');
  await expect(sheetOf(page)).toContainText('12 medalhas novas');
  await sheetOf(page).getByRole('button', { name: 'Conhecer a turma' }).click();
  await expect(page.locator('#tabbar').getByRole('button', { name: /^Amigos/ })).toHaveAttribute('aria-current', 'page');
});

test('o cartão de novidades: com a turma ligada e o progresso compartilhado ele avisa que as medalhas novas aparecem para a turma', async ({ page }) => {
  await stubFriendsCloud(page, { code: 'ABCD2345' });
  await seed(page, { history: [6, 2800], insignias: OCEAN, social: SOCIAL_ON, ui: { tip_news16: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('As medalhas novas também aparecem para a turma.');
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page)).toContainText('Elas também aparecem no seu perfil para a turma.');
});

test('o cartão de novidades: quem está na turma mas não compartilha o progresso não ouve falar de medalhas na turma', async ({ page }) => {
  await stubFriendsCloud(page, { code: 'ABCD2345' });
  await seed(page, { history: [6, 2800], insignias: OCEAN, social: Object.assign({}, SOCIAL_ON, { share: false }), ui: { tip_news16: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Agora são 24 medalhas');
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
  await seed(page, { history: [6, 2800], insignias: OCEAN, ui: { tip_news16: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Novidades no Maré');
  await page.locator('#tTips .tip').getByRole('button', { name: 'Dispensar dica' }).click();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
  await expect(page.locator('#sheet')).toBeHidden();
  expect((await stored(page)).ui.tip_news16).toBe(1);
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
  expect(got.s60).toBeUndefined();
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

test('layout: a Jornada com 24 medalhas e os gráficos cabe em qualquer tela, no tema claro e no escuro', async ({ page }, info) => {
  // 21 dias com horários variados (cedo, tarde, noite), alguns dias de meta e outros não
  const rows = [];
  for (let i = 1; i <= 21; i++) rows.push([i, i % 3 ? [[7, 40, 400], [9, 30, 350], [12, 30, 700], [16, 0, 600], [20, 30, 500]] : [[10, 0, 300], [22, 20, 400]], 2000]);
  const look = async (pg, scheme) => {
    await pg.locator('#tabbar').getByRole('button', { name: 'Jornada', exact: true }).click();
    await pg.waitForTimeout(900); // as barras terminam de crescer
    await expect(pg.locator('html')).toHaveAttribute('data-theme', scheme);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, 'rolagem lateral (' + scheme + ')').toBeLessThanOrEqual(0);
    const out = await pg.evaluate(() => {
      const w = window.innerWidth, bad = [];
      document.querySelectorAll('.medals .medal, .mission.near, .rh, .wk-plot.sm, .rh-leg span, .mg-h').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.left < -0.5 || r.right > w + 0.5) bad.push(e.className + ' ' + Math.round(r.left) + '–' + Math.round(r.right));
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
