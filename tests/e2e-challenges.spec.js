// Maré — testes de interface das missões extras e dos desafios da semana e do mês (1.10.0): os cartões da tela Hoje, os avisos de missão cumprida, o desafio
// vencido, a seção da Jornada, o cartão de novidades e o painel. Cada teste roda em todos os aparelhos do playwright.config.js. Qualquer erro de JavaScript na página reprova.
// As missões e os desafios saem da DATA, então os testes de regra fixam o relógio num dia escolhido (page.clock.install: ele segue andando, mas parte do meio-dia
// desse dia, em São Paulo). Os dias são achados com o core.js, que faz o mesmo sorteio que o app, e não escritos à mão: se uma lista mudar, o teste acha outro dia.
import { test, expect } from '@playwright/test';
import * as C from '../public/js/core.js';
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
const OCEAN = { concha: 6 }; // com a concha guardada, quem tem uma estrela-do-mar (10 L) a ganha em silêncio, sem o painel "Nova insígnia!"
const ALL = C.ACHIEVEMENTS.map((a) => a.id);
const except = (ids) => ALL.filter((id) => ids.indexOf(id) < 0); // todas as medalhas guardadas, menos estas (para ver a medalha sair ao vivo)

// um dia (chave AAAA-MM-DD) que serve ao teste, achado com o mesmo sorteio do app; o relógio parte do meio-dia dele em São Paulo (UTC-3, sem horário de verão)
const dayWhere = (ok, from, n) => { let k = from || '2026-06-01'; for (let i = 0; i < (n || 800); i++, k = C.addDays(k, 1)) if (ok(k)) return k; throw new Error('nenhum dia serve'); };
const noon = (k) => new Date(k + 'T15:00:00Z');
const clean = () => C.defaults();
const ids = (k) => { const t = C.missionsOf(k); return t.main.id + '/' + t.easy.id + '/' + t.hard.id; };
const sunday = (k) => C.keyToDate(k).getDay() === 0;
const weekId = (k) => C.weekGoal(clean(), k).c.id;
const monthId = (k) => C.monthGoal(clean(), k).c.id;
async function open(page, k, opt) {
  await page.clock.install({ time: noon(k) });
  await seed(page, Object.assign({ insignias: OCEAN }, opt));
  await page.goto('/');
  await expect(page.locator('#tExtras .extras')).toBeVisible();
}
const pop = (page) => page.locator('.medal-pop');

// os dias dos testes (os sorteios mudam de uma lista para outra, não de um dia para outro)
const LEVE3 = dayWhere((k) => { const t = C.missionsOf(k); return t.easy.id === 'e3' && ['am500', 'by19', 'noon', 'thirds'].indexOf(t.main.id) >= 0; });
const JUNTAS = dayWhere((k) => { const t = C.missionsOf(k); return t.main.id === 'by19' && (t.easy.id === 'elunch' || t.easy.id === 'eaft'); });
const CHEIO = dayWhere((k) => C.missionsOf(k).hard.id === 'hv17');
const SEMANA = dayWhere((k) => sunday(k) && weekId(k) === 'wused');
// um dia em que a missão do dia é "Beba água 6 vezes", a leve é de volume (metade da meta ou 1 L) e a ousada é "em que parte do dia": com 650 ml em 6 registros só a do dia fecha
const SOZINHA = dayWhere((k) => { const t = C.missionsOf(k); return t.main.id === 'six' && ['ehalf', 'e1l'].indexOf(t.easy.id) >= 0 && t.hard.f === 'spr'; });
const MES = dayWhere((k) => k.slice(8) === '28' && monthId(k) === 'mused' && ['wmorn', 'wthirds', 'wsix', 'wmis', 'wtrio'].indexOf(weekId(k)) >= 0, '2026-06-28', 1500);

/* ---------- Hoje: os cartões ---------- */
test('hoje: a missão do dia fica como era, e logo abaixo vêm as missões extras (leve e ousada) e os desafios da semana e do mês', async ({ page }) => {
  await open(page, LEVE3, { medals: true });
  const t = C.missionsOf(LEVE3), wk = C.weekGoal(clean(), LEVE3), mo = C.monthGoal(clean(), LEVE3);
  await expect(page.locator('#tMission .mission .m-t')).toHaveText(t.main.t);
  await expect(page.locator('#tMission .mission .m-k')).toHaveText('Missão do dia');
  const ex = page.locator('#tExtras');
  await expect(ex.locator('h2')).toHaveText('Missões extras');
  await expect(ex.locator('.card-h small')).toHaveText('0 de 2');
  await expect(ex.locator('.ex-i')).toHaveCount(2);
  await expect(ex.locator('.ex-i').nth(0).locator('.m-k')).toHaveText('Missão leve');
  await expect(ex.locator('.ex-i').nth(0).locator('.m-t')).toHaveText(t.easy.t);
  await expect(ex.locator('.ex-i').nth(1).locator('.m-k')).toHaveText('Missão ousada');
  await expect(ex.locator('.ex-i').nth(1).locator('.m-t')).toHaveText(t.hard.t);
  await expect(ex.locator('.ex-full')).toHaveCount(0);
  const ch = page.locator('#tChallenges');
  await expect(ch.locator('h2')).toHaveText('Desafios');
  await expect(ch.locator('.ch-i').nth(0).locator('.m-k')).toHaveText('Desafio da semana');
  await expect(ch.locator('.ch-i').nth(0).locator('.m-t')).toHaveText(wk.c.t);
  await expect(ch.locator('.ch-i').nth(0).locator('.m-d')).toHaveText(wk.c.d);
  await expect(ch.locator('.ch-i').nth(1).locator('.m-k')).toHaveText('Desafio do mês');
  await expect(ch.locator('.ch-i').nth(1).locator('.m-t')).toHaveText(mo.c.t);
  await expect(ch.locator('.ch-i').nth(1).locator('.ch-f span').first()).toHaveText('0 de ' + mo.c.need + ' dias');
  // a ordem na tela: missão do dia, extras, desafios e, por fim, os registros
  const order = await page.evaluate(() => ['tMission', 'tExtras', 'tChallenges', 'tLog'].map((id) => document.getElementById(id).getBoundingClientRect().top));
  expect(order[0]).toBeLessThan(order[1]); expect(order[1]).toBeLessThan(order[2]); expect(order[2]).toBeLessThan(order[3]);
  // leitor de tela: cada barra diz o que mede
  await expect(ex.locator('[role="progressbar"]').nth(0)).toHaveAttribute('aria-label', 'Progresso da missão leve');
  await expect(ch.locator('[role="progressbar"]').nth(0)).toHaveAttribute('aria-valuetext', '0 de ' + wk.c.need + ' dias');
});

test('missão leve: o andamento cresce a cada gole, o cumprimento comemora uma vez só e fica guardado', async ({ page }) => {
  test.setTimeout(60000);
  await open(page, LEVE3, { medals: true }); // as medalhas já guardadas: aqui só a missão comemora
  const bar = page.locator('#tExtras .ex-i').nth(0).locator('.bar');
  await cup(page, '250 ml').click();
  await cup(page, '250 ml').click();
  await expect(bar.locator('i')).toHaveAttribute('data-w', '67'); // 2 de 3
  await expect(bar).toHaveAttribute('aria-valuenow', '67');
  await expect(pop(page)).toHaveCount(0);
  await cup(page, '250 ml').click();
  await expect(pop(page)).toContainText('Missão leve cumprida');
  await expect(pop(page)).toContainText('Beba água 3 vezes hoje');
  await expect(pop(page)).toContainText('1 de 3 missões hoje');
  await expect(page.locator('#tExtras .ex-i').nth(0)).toHaveClass(/done/);
  await expect(page.locator('#tExtras .ex-i').nth(0).locator('.m-k')).toHaveText('Missão leve cumprida ✓');
  await expect(page.locator('#tExtras .card-h small')).toHaveText('1 de 2');
  await expect(bar.locator('i')).toHaveAttribute('data-w', '100');
  const st = await stored(page);
  expect(st.extras[LEVE3 + ':e'], 'a leve fica guardada com a hora').toBeGreaterThan(0);
  expect(st.extras[LEVE3 + ':h']).toBeUndefined();
  await expect(pop(page)).toHaveCount(0, { timeout: 8000 });
  await cup(page, '250 ml').click(); // um gole a mais não comemora de novo
  await page.waitForTimeout(900);
  await expect(pop(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#tExtras .ex-i').nth(0).locator('.m-k')).toHaveText('Missão leve cumprida ✓');
  await page.waitForTimeout(2200);
  await expect(pop(page)).toHaveCount(0); // e recarregar não repete a festa
  expect((await stored(page)).extras[LEVE3 + ':e']).toBe(st.extras[LEVE3 + ':e']);
});

test('duas missões que fecham no mesmo registro saem num cartão só, depois do cartão da meta', async ({ page }) => {
  test.setTimeout(60000);
  await open(page, JUNTAS, { medals: true, todayMl: 2300 }); // um registro de 2.300 ml às 11h59; faltam 500 para a meta (2.800)
  await cup(page, '500 ml').click();
  await expect(pop(page)).toContainText('Você bateu a meta!');
  await expect(pop(page)).toContainText('Missões cumpridas', { timeout: 15000 });
  await expect(pop(page)).toContainText('2 missões de uma vez');
  await expect(pop(page)).toContainText('2 de 3 missões hoje');
  await expect(pop(page)).toHaveCount(0, { timeout: 15000 }); // e só: nenhum cartão a mais
  const st = await stored(page);
  expect(st.missions[JUNTAS]).toBeGreaterThan(0);
  expect(st.extras[JUNTAS + ':e']).toBeGreaterThan(0);
  expect(st.extras[JUNTAS + ':h']).toBeUndefined();
  await expect(page.locator('#tExtras .card-h small')).toHaveText('1 de 2');
  await expect(page.locator('#tMission .mission')).toHaveClass(/done/);
});

test('dia cheio: a terceira missão do dia comemora o trio, e a medalha "Trio de missões" sai ao vivo, uma vez só', async ({ page }) => {
  test.setTimeout(90000);
  // a do dia e a leve já estavam cumpridas (de manhã); falta a ousada, "Bata a meta antes das 17h"
  await open(page, CHEIO, { medals: except(['trio', 'trio7']), todayMl: 2300, missions: [0], extras: [[0, 'e']] });
  await expect(page.locator('#tExtras .card-h small')).toHaveText('1 de 2');
  await expect(page.locator('#tExtras .ex-full')).toHaveCount(0);
  await cup(page, '500 ml').click();
  await expect(pop(page)).toContainText('Você bateu a meta!');
  await expect(pop(page)).toContainText('Missão ousada cumprida', { timeout: 15000 });
  await expect(pop(page)).toContainText('Bata a meta antes das 17h');
  await expect(pop(page)).toContainText('Dia cheio: as 3 missões de hoje');
  await expect(pop(page)).toContainText('Nova medalha', { timeout: 15000 });
  await expect(pop(page)).toContainText('Trio de missões');
  await expect(pop(page)).toContainText('Cumpriu as 3 missões do mesmo dia');
  await expect(pop(page)).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('#tExtras .ex-full')).toHaveText('🍀 Dia cheio: as 3 missões de hoje');
  await expect(page.locator('#tExtras .card-h small')).toHaveText('2 de 2');
  const st = await stored(page);
  expect(st.extras[CHEIO + ':h']).toBeGreaterThan(0);
  expect(st.achievements.trio).toBeGreaterThan(1);
  expect(st.achievements.trio7).toBeUndefined();
  await page.reload();
  await page.waitForTimeout(2200);
  await expect(pop(page)).toHaveCount(0);
  expect((await stored(page)).achievements.trio).toBe(st.achievements.trio);
});

/* ---------- Hoje: o desafio da semana e o do mês ---------- */
test('desafio da semana: o registro que fecha a conta comemora (com a medalha Semana vencida), guarda e não repete', async ({ page }) => {
  test.setTimeout(90000);
  // domingo, "Sem dia em branco" (água em 6 dias da semana): de segunda a sexta já houve água (5 dias); o registro de hoje é o sexto
  const rows = [6, 5, 4, 3, 2].map((n) => [n, [[10, 0, 500]]]);
  await open(page, SEMANA, { medals: except(['wk1']), rows: rows });
  const w = C.weekGoal(clean(), SEMANA), row = page.locator('#tChallenges .ch-i').nth(0);
  await expect(row.locator('.m-t')).toHaveText('Sem dia em branco');
  await expect(row.locator('.ch-f span').first()).toHaveText('5 de 6 dias');
  await expect(row.locator('.ch-f span').last()).toHaveText('Termina hoje');
  expect(w.toEnd).toBe(0);
  await cup(page, '250 ml').click();
  await expect(pop(page)).toContainText('Desafio da semana', { timeout: 25000 }); // pode haver uma missão cumprida antes: os cartões saem um de cada vez
  await expect(pop(page)).toContainText('Sem dia em branco');
  await expect(pop(page)).toContainText('Você venceu a semana!');
  await expect(pop(page)).toContainText('Semana vencida', { timeout: 25000 }); // a medalha, logo depois
  await expect(pop(page)).toContainText('Completou o desafio da semana');
  await expect(pop(page)).toHaveCount(0, { timeout: 25000 });
  await expect(row).toHaveClass(/done/);
  await expect(row.locator('.m-k')).toHaveText('Desafio da semana vencido ✓');
  await expect(row.locator('.ch-f span').first()).toHaveText('6 de 6 dias');
  await expect(row.locator('.ch-f span').last()).toHaveText('Vencido 🎉');
  const st = await stored(page);
  expect(st.challenges[w.key], 'guardado pela segunda-feira da semana').toBeGreaterThan(0);
  expect(w.key).toBe(C.addDays(SEMANA, -6));
  expect(st.achievements.wk1).toBeGreaterThan(1);
  await page.reload();
  await page.waitForTimeout(2200);
  await expect(pop(page)).toHaveCount(0);
  expect((await stored(page)).challenges[w.key]).toBe(st.challenges[w.key]);
  await expect(page.locator('#tChallenges .ch-i').nth(0)).toHaveClass(/done/);
});

test('desafio do mês: fecha no dia 28 com a medalha Mês vencido, e a Jornada passa a contar a semana e o mês vencidos', async ({ page }) => {
  test.setTimeout(90000);
  await open(page, MES, { medals: except(['mo1', 'mo3']), history: [24, 2800] }); // 24 dias antes de hoje com água: com o de hoje, 25
  const m = C.monthGoal(clean(), MES), row = page.locator('#tChallenges .ch-i').last();
  await expect(row.locator('.m-t')).toHaveText('Presença');
  await expect(row.locator('.ch-f span').first()).toHaveText('24 de 25 dias');
  await cup(page, '250 ml').click();
  await expect(pop(page)).toContainText('Desafio do mês', { timeout: 25000 });
  await expect(pop(page)).toContainText('Presença');
  await expect(pop(page)).toContainText('Você venceu o mês!');
  await expect(pop(page)).toContainText('Mês vencido', { timeout: 25000 });
  await expect(pop(page)).toHaveCount(0, { timeout: 25000 });
  await expect(row.locator('.m-k')).toHaveText('Desafio do mês vencido ✓');
  const st = await stored(page);
  expect(st.challenges[m.key], 'guardado por AAAA-MM').toBeGreaterThan(0);
  expect(m.key).toBe(MES.slice(0, 7));
  expect(st.achievements.mo1).toBeGreaterThan(1);
  await tab(page, 'Jornada').click();
  await expect(page.locator('.chl-j')).toContainText('Você já venceu 1 mês de desafio.');
  await expect(page.locator('.chl-j .chl-r').nth(1)).toHaveClass(/done/);
  await expect(page.locator('.chl-j .chl-r').nth(1).locator('.chl-s')).toHaveText('Vencido 🎉');
  await expect(medal(page, 'Mês vencido')).not.toHaveClass(/off/);
  await expect(medal(page, 'Três meses vencidos')).toContainText('1 de 3 desafios');
});

test('quando já não dá para fechar a semana: "Essa fica para a próxima", sem cobrança; sem nenhum dia contado, a linha nem aparece', async ({ page }) => {
  // domingo, "Sem dia em branco" (6 dias): só segunda e terça tiveram água, então nem com o domingo dá (2 + 1 = 3 de 6)
  await open(page, SEMANA, { medals: true, rows: [[6, [[10, 0, 500]]], [5, [[10, 0, 500]]]] });
  const row = page.locator('#tChallenges .ch-i').filter({ hasText: 'Desafio da semana' });
  await expect(row).toHaveClass(/over/);
  await expect(row.locator('.ch-f span').first()).toHaveText('2 de 6 dias');
  await expect(row.locator('.ch-f span').last()).toHaveText('Essa fica para a próxima');
  await expect(row).not.toContainText(/perdeu|fracassou|falhou/i);
  // sem dia nenhum: a linha da semana some (o do mês, se couber, continua)
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await p2.clock.install({ time: noon(SEMANA) });
  await seed(p2, { insignias: OCEAN, medals: true });
  await p2.goto('/');
  await expect(p2.locator('#tExtras .extras')).toBeVisible();
  await expect(p2.locator('#tChallenges')).not.toContainText('Desafio da semana');
  await p2.close();
});

/* ---------- Jornada ---------- */
test('jornada: a seção Desafios mostra a semana (um pontinho por dia), o mês em barra e o que já foi vencido; as 7 medalhas vêm num grupo', async ({ page }) => {
  await seed(page, { history: [5, 2800], insignias: OCEAN, challenges: [['w', 1], ['w', 2], ['m', 1]], missions: [1], extras: [[1, 'e'], [1, 'h']] });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const head = page.locator('.card-h.out', { has: page.locator('h2', { hasText: /^Desafios$/ }) });
  await expect(head).toHaveCount(1);
  await expect(head.locator('small')).toHaveText('semana e mês');
  const sec = page.locator('.chl-j');
  await expect(sec.locator('.chl-r')).toHaveCount(2);
  await expect(sec.locator('.chl-r').nth(0).locator('.m-k')).toContainText('Desafio da semana');
  await expect(sec.locator('.wd')).toHaveCount(7);
  await expect(sec.locator('.wd small')).toHaveText(['S', 'T', 'Q', 'Q', 'S', 'S', 'D']);
  await expect(sec.locator('.wd.now')).toHaveCount(1);
  await expect(sec.locator('.wdots')).toHaveAttribute('aria-label', /^(Dias que contaram nesta semana: .+\.|Nenhum dia contou ainda nesta semana\.)$/);
  await expect(sec.locator('.chl-r').nth(1).locator('.m-k')).toContainText('Desafio do mês');
  await expect(sec.locator('.chl-r').nth(1).locator('.bar')).toHaveAttribute('aria-valuetext', /^\d+ de \d+ dias$/);
  await expect(sec).toContainText('Você já venceu 2 semanas e 1 mês de desafio.');
  await expect(sec).toContainText('Dias cheios, com as 3 missões cumpridas: 1.');
  // o grupo de medalhas, no meio dos outros, com as que já saíram pelo que está guardado
  await expect(page.locator('.mg-h h3')).toHaveText(['Começos e missões', 'Sequências', 'Metas batidas', 'Rotina do dia', 'Fins de semana e datas', 'Desafios', 'Com a turma']);
  await expect(page.locator('.mg-h').nth(5)).toContainText('3 de 7'); // Trio de missões, Semana vencida e Mês vencido… e só: 2 semanas não bastam para as quatro
  await expect(medal(page, 'Trio de missões')).not.toHaveClass(/off/);
  await expect(medal(page, 'Semana vencida')).not.toHaveClass(/off/);
  await expect(medal(page, 'Mês vencido')).not.toHaveClass(/off/);
  const four = medal(page, 'Quatro semanas vencidas');
  await expect(four).toHaveClass(/off/);
  await expect(four).toContainText('2 de 4 desafios');
  await expect(medal(page, 'Sete trios')).toContainText('1 de 7 dias');
  await expect(medal(page, 'Trimestre de desafios')).toContainText('2 de 12 desafios');
  await expect(page.locator('.medals .medal')).toHaveCount(37);
});

test('jornada: os pontinhos da semana trazem ✓ no dia que contou, ficam vazios no que não contou e apagados nos que ainda não chegaram, e o resumo do leitor de tela lista os dias', async ({ page }) => {
  // uma quarta-feira em que o desafio da semana é "Sem dia em branco": um registro de água já faz o dia contar
  const K = dayWhere((k) => C.keyToDate(k).getDay() === 3 && weekId(k) === 'wused');
  await page.clock.install({ time: noon(K) });
  await seed(page, { insignias: OCEAN, rows: [[2, [[9, 0, 300]]]], todayMl: 500 }); // segunda: um registro; terça: nenhum; quarta (hoje): 500 ml
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const sec = page.locator('.chl-j'), dots = sec.locator('.wd');
  await expect(dots).toHaveCount(7);
  await expect(dots.locator('i')).toHaveText(['✓', '', '✓', '', '', '', '']);
  await expect(dots.locator('small')).toHaveText(['S', 'T', 'Q', 'Q', 'S', 'S', 'D']);
  for (const i of [0, 2]) { await expect(dots.nth(i)).toHaveClass(/\bon\b/); await expect(dots.nth(i)).not.toHaveClass(/\b(off|fut)\b/); } // segunda e quarta contaram
  await expect(dots.nth(1)).toHaveClass(/\boff\b/); // terça passou em branco
  await expect(dots.nth(1)).not.toHaveClass(/\b(on|fut)\b/);
  for (const i of [3, 4, 5, 6]) { await expect(dots.nth(i)).toHaveClass(/\bfut\b/); await expect(dots.nth(i)).not.toHaveClass(/\b(on|off)\b/); } // quinta a domingo ainda não chegaram
  await expect(sec.locator('.wd.now')).toHaveCount(1);
  await expect(dots.nth(2)).toHaveClass(/\bnow\b/); // hoje é quarta
  await expect(sec.locator('.wdots')).toHaveAttribute('aria-label', 'Dias que contaram nesta semana: segunda, quarta.');
  await expect(sec.locator('.chl-r').nth(0).locator('.chl-h b')).toHaveText('2 de 6 dias');
});

test('jornada: sem nada vencido ainda, a seção convida em vez de cobrar', async ({ page }) => {
  await seed(page, { insignias: OCEAN });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.chl-j')).toContainText('Nenhum desafio vencido ainda: o primeiro pode ser o desta semana.');
  await expect(page.locator('.chl-j')).not.toContainText('Dias cheios');
  await expect(page.locator('.mg-h').nth(5)).toContainText('0 de 7');
  // sem registro nenhum, nenhum dia da semana contou: nada de ✓ e o resumo do leitor de tela diz isso
  await expect(page.locator('.chl-j .wd.on')).toHaveCount(0);
  await expect(page.locator('.chl-j .wd i')).toHaveText(['', '', '', '', '', '', '']);
  await expect(page.locator('.chl-j .wdots')).toHaveAttribute('aria-label', 'Nenhum dia contou ainda nesta semana.');
});

/* ---------- novidades ---------- */
test('o cartão de novidades da 1.10.0 aparece para quem já usava o Maré, com ou sem turma, e o painel conta o que há de novo', async ({ page }) => {
  await seed(page, { history: [3, 2800], insignias: OCEAN, ui: { tip_news19: 0 } }); // fora da turma
  await page.goto('/');
  const card = page.locator('#tTips .tip');
  await expect(card).toContainText('Mais desafios no Maré');
  await expect(card).toContainText('Missões extras todo dia, desafio da semana e do mês, e medalhas novas.');
  await card.getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page).locator('#sheetTitle')).toHaveText('Novidades do Maré');
  await expect(sheetOf(page)).toContainText('Mais duas missões por dia');
  await expect(sheetOf(page)).toContainText('Desafio da semana e do mês');
  await expect(sheetOf(page)).toContainText('7 medalhas novas');
  await expect(sheetOf(page)).toContainText('Trio de missões, Sete trios, Semana vencida');
  await expect(sheetOf(page)).toContainText('Sem pressão');
  await expect(sheetOf(page)).not.toContainText('Você já conquistou 0');
  await expect(sheetOf(page).locator('.news-h')).toHaveText('Das versões anteriores');
  await expect(sheetOf(page)).toContainText('A porcentagem vai além de 100%');
  await expect(sheetOf(page)).toContainText('6 medalhas novas'); // as da 1.7.0 continuam contadas, agora na seção de baixo
  await expect(sheetOf(page).getByRole('button', { name: 'Escolher o que a turma vê' })).toHaveCount(0); // sem turma, nada de botão da turma
  await expect(page.locator('#tTips')).not.toContainText('Mais desafios no Maré'); // abrir o painel apagou o cartão
  const ui = (await stored(page)).ui;
  expect([ui.tip_news19, ui.tip_news18, ui.tip_news17, ui.tip_news16, ui.tip_news15, ui.tip_news12]).toEqual([1, 1, 1, 1, 1, 1]);
  await sheetOf(page).getByRole('button', { name: 'Ver minhas medalhas' }).click();
  await expect(tab(page, 'Jornada')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.chl-j')).toBeVisible();
  await tab(page, 'Hoje').click();
  await page.waitForTimeout(500); // voltar para a Hoje desempilha o histórico do navegador (history.go, que é assíncrono): recarregar no meio da volta aborta a navegação (net::ERR_ABORTED)
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Mais desafios no Maré');
  // quem já tem medalhas das novas vê quantas (e, sem nenhuma, a frase nem aparece)
  await expect(sheetOf(page)).toBeHidden();
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await seed(p2, { history: [3, 2800], insignias: OCEAN, ui: { tip_news19: 0 }, medals: ['trio', 'wk1'] });
  await p2.goto('/');
  await p2.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(p2.locator('#sheetBody')).toContainText('Você já conquistou 2 das 7.');
  await p2.close();
});

test('o cartão de novidades: o "x" o apaga para sempre sem abrir o painel; na turma, o painel traz o botão do perfil', async ({ page }) => {
  await stubFriendsCloud(page, { code: 'ABCD2345' });
  await seed(page, { history: [3, 2800], insignias: OCEAN, social: SOCIAL_ON, ui: { tip_news19: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Mais desafios no Maré');
  await page.locator('#tTips .tip').getByRole('button', { name: 'Dispensar dica' }).click();
  await expect(page.locator('#tTips')).not.toContainText('Mais desafios no Maré');
  await expect(page.locator('#sheet')).toBeHidden();
  expect((await stored(page)).ui.tip_news19).toBe(1);
  await page.reload();
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Mais desafios no Maré');
  // quem está na turma encontra o painel do mesmo jeito (só não há mais o cartão): o botão do perfil da turma está lá
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await stubFriendsCloud(p2, { code: 'ABCD2345' });
  await seed(p2, { history: [3, 2800], insignias: OCEAN, social: SOCIAL_ON, ui: { tip_news19: 0 } });
  await p2.goto('/');
  await p2.locator('#tTips .tip').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(p2.locator('#sheetBody').getByRole('button', { name: 'Escolher o que a turma vê' })).toBeVisible();
  await p2.close();
});

test('quem entra na turma ou liga o interruptor da porcentagem não mexe no cartão de novidades (ele é de todos, não só da turma)', async ({ page }) => {
  await stubFriendsCloud(page, { code: 'ABCD2345' });
  await seed(page, { history: [3, 2800], insignias: OCEAN, social: SOCIAL_ON, ui: { tip_news19: 0 } });
  await page.goto('/');
  await expect(page.locator('#tTips .tip')).toContainText('Mais desafios no Maré');
  await tab(page, 'Amigos').click();
  await tab(page, 'Hoje').click();
  await expect(page.locator('#tTips .tip')).toContainText('Mais desafios no Maré');
  expect((await stored(page)).ui.tip_news19).toBe(0);
});

/* ---------- o que vem de antes ---------- */
test('um aparelho com o estado da 1.9.0 (sem extras nem desafios guardados) abre normal, mostra os cartões e passa a guardar nos mapas novos', async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install({ time: noon('2026-07-03') }); // no começo de um mês: no fim dele, o desafio do mês que já não dá para vencer some do cartão
  await seed(page, { insignias: OCEAN, medals: true, todayMl: 500 });
  await page.addInitScript(() => { // o que a 1.9.0 guardava: sem "extras" e sem "challenges"
    if (sessionStorage.getItem('mare:old19')) return;
    sessionStorage.setItem('mare:old19', '1');
    const s = JSON.parse(localStorage.getItem('mare:v1')); delete s.extras; delete s.challenges; s.v = 1;
    localStorage.setItem('mare:v1', JSON.stringify(s));
  });
  await page.goto('/');
  await expect(page.locator('#tExtras .extras')).toBeVisible();
  await expect(page.locator('#tChallenges')).toContainText('Desafio do mês');
  const ml = (await stored(page));
  expect(ml.extras === undefined || typeof ml.extras === 'object').toBe(true);
  await cup(page, '250 ml').click();
  await page.waitForTimeout(600);
  const st = await stored(page);
  expect(typeof st.extras).toBe('object'); expect(typeof st.challenges).toBe('object');
  expect(Array.isArray(st.extras)).toBe(false); expect(Array.isArray(st.challenges)).toBe(false);
});

test('backup em arquivo: leva as missões extras e os desafios vencidos, e o que vem sujo do arquivo é limpo na importação', async ({ page }) => {
  await seed(page, { insignias: OCEAN });
  await page.goto('/');
  const k = await page.evaluate(() => { const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); });
  const day = { goal: 2000, entries: [{ id: 'b1', t: Date.now() - 60000, ml: 500, d: 'water' }] };
  const long = 'x'.repeat(40) + ':e';
  const backup = { app: 'mare', v: 1, data: { v: 1, onboarded: true, profile: { name: 'Bia', weight: 60, theme: 'light' }, days: { [k]: day },
    achievements: { first: 1 }, missions: { [k]: 5 },
    extras: { [k + ':e']: 7, [k + ':h']: 'ontem', [long]: 9, '2026-06-01:h': null, ruim: NaN },
    challenges: { '2026-06-01': 11, '2026-06': 12, 'lixo': 'sim' } } };
  await tab(page, 'Ajustes').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar' }).click()]);
  await chooser.setFiles({ name: 'mare-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await sheetOf(page).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.locator('#toast')).toContainText('Backup restaurado');
  const st = await stored(page);
  expect(st.extras[k + ':e']).toBe(7);
  expect(st.extras[k + ':h'], 'texto não vale').toBeUndefined();
  expect(Object.keys(st.extras).every((x) => x.length <= 24)).toBe(true);
  expect(st.challenges['2026-06-01']).toBe(11);
  expect(st.challenges['2026-06']).toBe(12);
  expect(st.challenges.lixo).toBeUndefined();
});

/* ---------- o que não pode mudar e o que não pode errar ---------- */
test('a missão do dia sozinha comemora como sempre ("Missão cumprida", "Amanhã tem missão nova"), sem acordar as extras', async ({ page }) => {
  test.setTimeout(60000);
  await open(page, SOZINHA, { medals: true, entries: [[100, 'water'], [100, 'water'], [100, 'water'], [100, 'water'], [100, 'water']] }); // 5 goles de 100 ml, entre 11h55 e 11h59
  await cup(page, '150 ml').click(); // o 6º
  await expect(pop(page)).toContainText('Missão cumprida');
  await expect(pop(page)).toContainText('Beba água 6 vezes hoje');
  await expect(pop(page)).toContainText('Amanhã tem missão nova');
  await expect(pop(page)).toHaveCount(0, { timeout: 10000 }); // e só: nenhum cartão a mais
  const st = await stored(page);
  expect(st.missions[SOZINHA]).toBeGreaterThan(0);
  expect(Object.keys(st.extras), 'nenhuma extra fechou com 650 ml').toEqual([]);
  await expect(page.locator('#tExtras .card-h small')).toHaveText('0 de 2');
  await expect(page.locator('#tMission .mission')).toHaveClass(/done/);
});

test('as duas extras sem a missão do dia não fazem o "Dia cheio"; com ela, fazem', async ({ page }) => {
  await open(page, LEVE3, { medals: true, extras: [[0, 'e'], [0, 'h']] });
  await expect(page.locator('#tExtras .card-h small')).toHaveText('2 de 2');
  await expect(page.locator('#tExtras .ex-full')).toHaveCount(0);
  const p2 = await page.context().newPage();
  p2.on('pageerror', (e) => { errors.push(e.message); });
  await p2.clock.install({ time: noon(LEVE3) });
  await seed(p2, { insignias: OCEAN, medals: true, extras: [[0, 'e'], [0, 'h']], missions: [0] });
  await p2.goto('/');
  await expect(p2.locator('#tExtras .ex-full')).toHaveText('🍀 Dia cheio: as 3 missões de hoje');
  await p2.close();
});

test('desafio vencido e guardado: a linha segue vencida, com o total, mesmo sem nenhum dia contado agora; a Jornada conta a semana e o mês', async ({ page }) => {
  await open(page, SEMANA, { medals: true, challenges: [['w', 0], ['m', 0]] }); // vencidos antes (e os registros daqueles dias, apagados)
  const w = C.weekGoal(clean(), SEMANA), m = C.monthGoal(clean(), SEMANA), rows = page.locator('#tChallenges .ch-i');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveClass(/done/);
  await expect(rows.nth(0).locator('.m-k')).toHaveText('Desafio da semana vencido ✓');
  await expect(rows.nth(0).locator('.ch-f span').first()).toHaveText(w.c.need + ' de ' + w.c.need + ' dias');
  await expect(rows.nth(0).locator('.ch-f span').last()).toHaveText('Vencido 🎉');
  await expect(rows.nth(0).locator('.bar i')).toHaveAttribute('data-w', '100');
  await expect(rows.nth(1)).toHaveClass(/done/);
  await expect(rows.nth(1).locator('.ch-f span').first()).toHaveText(m.c.need + ' de ' + m.c.need + ' dias');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.chl-j')).toContainText('Você já venceu 1 semana e 1 mês de desafio.');
});

/* ---------- tamanho de tela ---------- */
// O leiaute não pode depender do texto do dia: além de um dia comum, três dias com os textos mais compridos de cada lista (achados no core.js, que sorteia como o app):
// a missão do dia e a leve mais longas, a ousada mais longa e o desafio da semana e do mês mais longos. Se a lista mudar, o teste procura outro dia.
const longest = (pool) => pool.slice().sort((a, b) => (b.t + (b.d || '')).length - (a.t + (a.d || '')).length)[0].id;
const tryDay = (ok) => { try { return dayWhere(ok, '2026-06-01', 3000); } catch (e) { return '2026-06-01'; } };
const TXT_DIA = tryDay((k) => { const t = C.missionsOf(k); return t.main.id === longest(C.MISSIONS) && t.easy.id === longest(C.MISSIONS_EASY); });
const TXT_OUSADA = tryDay((k) => { const t = C.missionsOf(k); return t.hard.id === longest(C.MISSIONS_HARD) && t.easy.id === longest(C.MISSIONS_EASY); });
const TXT_DESAFIO = tryDay((k) => weekId(k) === longest(C.WEEKLY) && monthId(k) === longest(C.MONTHLY));
const LROWS = [[1, [[8, 0, 600], [12, 0, 1000], [20, 0, 1200]], 2800], [2, [[9, 0, 3000]], 2800], [3, [[7, 40, 400]], 2800]];
const lopt = (theme) => ({ rows: LROWS, todayMl: 900, profile: { theme: theme }, insignias: { concha: 60, estrela: 50, baiacu: 40, tartaruga: 30, cavalo: 20, polvo: 10 },
  challenges: [['w', 1], ['m', 1]], missions: [1], extras: [[1, 'e'], [1, 'h']] });
// abre o app num dia, no tema, e confere a tela Hoje e a Jornada: nada passa da largura da tela nem do cartão, e os 7 pontinhos da semana têm tamanho
async function lookAt(pg, info, k, scheme) {
  await pg.clock.install({ time: noon(k) });
  await seed(pg, lopt(scheme));
  await pg.goto('/');
  await expect(pg.locator('html')).toHaveAttribute('data-theme', scheme);
  await expect(pg.locator('#tExtras .extras')).toBeVisible();
  await pg.waitForTimeout(900); // as barras terminam de crescer
  const check = (sel) => pg.evaluate((s) => {
    const w = window.innerWidth, bad = [];
    document.querySelectorAll(s).forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.left < -0.5 || r.right > w + 0.5) bad.push(e.className + ' ' + Math.round(r.left) + '–' + Math.round(r.right));
    });
    document.querySelectorAll('.extras, .chl-j, .chl').forEach((c) => { // nada vaza para fora do cartão
      const cr = c.getBoundingClientRect();
      c.querySelectorAll('.m-ico, .m-body, .m-k, .m-t, .m-d, .bar, .ch-f span, .chl-h b, .chl-t, .chl-s, .wd, .ex-full').forEach((x) => {
        const r = x.getBoundingClientRect();
        if (r.right > cr.right + 0.5 || r.left < cr.left - 0.5) bad.push('fora do cartão: ' + x.className + ' ' + (x.textContent || '').slice(0, 24));
      });
    });
    return { over: document.documentElement.scrollWidth - w, bad: bad };
  }, sel);
  const tag = k + ' ' + scheme;
  let x = await check('.extras, .ex-i, .ch-f, .ex-full, #tChallenges, #tChallenges .ch-i');
  expect(x.over, 'rolagem lateral na Hoje (' + tag + ')').toBeLessThanOrEqual(0);
  expect(x.bad, 'blocos fora da tela na Hoje (' + tag + ')').toEqual([]);
  await pg.locator('#tChallenges').scrollIntoViewIfNeeded();
  await pg.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Hoje missões ' + tag + '.png', fullPage: true });
  await pg.locator('#tabbar').getByRole('button', { name: 'Jornada', exact: true }).click();
  await pg.waitForTimeout(900);
  x = await check('.chl-j, .chl-r, .wdots, .wd, .chl-h, .medals .medal');
  expect(x.over, 'rolagem lateral na Jornada (' + tag + ')').toBeLessThanOrEqual(0);
  expect(x.bad, 'blocos fora da tela na Jornada (' + tag + ')').toEqual([]);
  const dots = await pg.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.wd i'), (i) => { const r = i.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }));
  expect(dots, 'os 7 pontinhos têm tamanho').toHaveLength(7);
  dots.forEach((d) => { expect(+d.split('x')[0], 'pontinho').toBeGreaterThanOrEqual(20); });
  await pg.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Jornada desafios ' + tag + '.png', fullPage: true });
}
const another = async (page) => { const p = await page.context().newPage(); p.on('pageerror', (e) => { errors.push(e.message); }); return p; };

test('layout: as missões extras, os desafios e a seção da Jornada cabem em qualquer tela, no tema claro e no escuro', async ({ page }, info) => {
  await lookAt(page, info, TXT_DIA, 'light');
  const p2 = await another(page);
  await lookAt(p2, info, TXT_DIA, 'dark');
  await p2.close();
});

test('layout: os textos mais compridos (a missão ousada e os desafios da semana e do mês) também cabem, sem rolagem lateral', async ({ page }, info) => {
  await lookAt(page, info, TXT_OUSADA, 'light');
  const p2 = await another(page);
  await lookAt(p2, info, TXT_DESAFIO, 'dark');
  await p2.close();
});
