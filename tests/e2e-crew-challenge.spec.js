// Maré — testes de interface do desafio da turma (1.11.0 e 1.12.0): a linha em "Desafios", na Hoje, e o cartão da aba Amigos; a festa quando a turma vence (com as medalhas Remando juntos e Time da maré);
// o "falta só você"; a segunda-feira de tolerância; quem entra na conta; a turma sozinha e a pausa; o que a Jornada mostra; e o leiaute em qualquer tela, em cada uma das seis regras. A conta em si
// (as seis regras, quem entra, a grade da semana) está em tests/crew-challenge.test.js; aqui se confere o que aparece na tela e o que fica guardado. Qualquer erro de JavaScript na página reprova.
// O desafio da turma sai da DATA e da semana de cada amigo (a máscara wm do perfil, que o bit 0 é o dia de hoje), então cada teste fixa o relógio (page.clock.install: ele segue andando, mas parte do
// meio-dia desse dia, em São Paulo) e monta a semana dos amigos à mão. A semana em que cada desafio cai é achada com o core.js, que sorteia como o app, e não escrita à mão.
import { test, expect } from '@playwright/test';
import * as C from '../public/js/core.js';
import { seed } from './helpers/seed.js';
import { stubFriendsCloud, UID, SOCIAL_ON } from './helpers/friends.js';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
});
test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

const tab = (page, name) => page.locator('#tabbar').getByRole('button', { name: name, exact: true });
const tabF = (page) => page.locator('#tabbar').getByRole('button', { name: /^Amigos/ }); // com bolinha o nome vira "Amigos (novidades)"
const cup = (page, label) => page.getByRole('button', { name: 'Adicionar ' + label, exact: true });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
const pop = (page) => page.locator('.medal-pop');
const medal = (page, name) => page.locator('.medals .medal').filter({ has: page.locator('b', { hasText: new RegExp('^' + name + '$') }) });
// o que o aparelho mandaria agora para a nuvem (espera a nuvem de mentira subir)
const payload = async (page) => { await page.waitForFunction(() => window.__fake && window.__fake.hooks && window.__fake.hooks.payload); return page.evaluate(() => window.__fake.hooks.payload()); };
// quantas vezes o app avisou a nuvem de que o perfil mudou (é o que faz a turma ver a medalha nova: o "payload" acima só mostra o que seria mandado, não que foi mandado)
const touches = (page) => page.evaluate(() => window.__fake.touches);
const OCEAN = { concha: 6 }; // com a concha guardada, quem tem uma estrela-do-mar (10 L) a ganha em silêncio, sem o painel "Nova insígnia!"
const ALL = C.ACHIEVEMENTS.map((a) => a.id);
const except = (ids) => ALL.filter((id) => ids.indexOf(id) < 0); // todas as medalhas guardadas, menos estas (para ver a medalha sair ao vivo)
const noon = (k) => new Date(k + 'T15:00:00Z'); // meio-dia em São Paulo (UTC-3, sem horário de verão)
const ZERO = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
// a segunda-feira (a partir de 16/11/2026) da semana em que o desafio da turma é o de id `id`
const monOf = (id) => {
  let mon = '2026-11-16';
  for (let i = 0; i < 40; i++, mon = C.addDays(mon, 7)) if (C.crewInfo(C.defaults(), ZERO, mon, mon).c.id === id) return mon;
  throw new Error('nenhuma semana de ' + id);
};
const HIT = (ago) => [ago, [[9, 0, 3000]]]; // um dia, há `ago` dias, com 3 L: meta de 2.800 ml batida
// um amigo: wm é a semana dele (bit 0 = hoje, bit 1 = ontem…); quem bateu a meta hoje já aparece com 100%
const mk = (uid, nm, wm, o) => ({ uid: uid, prof: Object.assign({ nm: nm, mc: 'concha', ins: ['concha'], pct: wm & 1 ? 100 : 20, met: !!(wm & 1), st: 1, gl: 2800, wm: wm, md: 0 }, o || {}) });
const another = async (page) => { const p = await page.context().newPage(); p.on('pageerror', (e) => { errors.push(e.message); }); return p; };
// o app num dia (relógio fixo), com os amigos dados. As missões e os desafios de hoje já vêm guardados: nenhum registro daqui fecha um deles e faz sair um cartão que depende do dia e da hora do teste
async function openAt(page, k, friends, opt) {
  await page.clock.install({ time: noon(k) });
  await stubFriendsCloud(page, { friends: friends, code: 'ABCD2345' });
  await seed(page, Object.assign({ insignias: OCEAN, social: SOCIAL_ON, missions: [0], extras: [[0, 'e'], [0, 'h']], challenges: [['w', 0], ['m', 0]] }, opt));
  await page.goto('/');
  await expect(page.locator('#view')).toBeVisible();
}

const MON_CROWD = monOf('ccrowd'), THU_CROWD = C.addDays(MON_CROWD, 3); // "Turma cheia": em 3 dias, 3 pessoas ou mais batem a meta no mesmo dia
const MON_TOTAL = monOf('ctotal'), THU_TOTAL = C.addDays(MON_TOTAL, 3); // "Maré da semana": 4 metas por pessoa
const MON_WEEKEND = monOf('cweek'); // "Fim de semana da turma"
const MON_CHAIN = monOf('cchain'), THU_CHAIN = C.addDays(MON_CHAIN, 3); // "Corrente da turma" (1.12.0): 3 dias seguidos com a maior parte da turma na meta
const MON_PAIRS = monOf('cpairs'), THU_PAIRS = C.addDays(MON_PAIRS, 3); // "Dois dias seguidos" (1.12.0): quase todos têm 2 dias seguidos na meta

/* ---------- a linha na Hoje e o cartão em Amigos ---------- */
test('o desafio da turma aparece na Hoje, depois dos da semana e do mês, e na aba Amigos, entre o resumo e o ranking, com o andamento e o prazo', async ({ page }) => {
  // quinta-feira de uma semana de "Turma cheia". Eu bati a meta de segunda a quarta; a Bia, de segunda a quinta; o Caio, na segunda e na terça: só 2 dias tiveram as 3 pessoas
  await openAt(page, THU_CROWD, [mk(UID.bia, 'Bia', 0b1111), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, medals: except(['cw1']) });
  const ch = page.locator('#tChallenges'), crw = ch.locator('.crw');
  await expect(crw).toHaveCount(1);
  await expect(ch.locator('.card-h small')).toHaveText('semana, mês e turma');
  await expect(ch.locator('section.chl')).toHaveAttribute('aria-label', 'Desafios da semana, do mês e da turma');
  await expect(ch.locator('.ch-i')).toHaveCount(3);
  await expect(ch.locator('.ch-i').nth(2)).toHaveClass(/\bcrw\b/); // depois do desafio da semana e do do mês
  await expect(ch.locator('.ch-i').nth(0).locator('.m-k')).toHaveText(/^Desafio da semana/); // (já vencido, por causa do que o teste guarda: o rótulo ganha "vencido ✓")
  await expect(crw.locator('.m-ico')).toHaveText('🤝');
  await expect(crw.locator('.m-k')).toHaveText('Desafio da turma');
  await expect(crw.locator('.m-t')).toHaveText('Turma cheia');
  await expect(crw.locator('.m-d')).toHaveText('Em 3 dias desta semana, 3 pessoas ou mais batem a meta no mesmo dia');
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('2 de 3 dias');
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Termina em 3 dias'); // quinta: faltam sexta, sábado e domingo
  const bar = crw.locator('[role="progressbar"]');
  await expect(bar).toHaveAttribute('aria-label', 'Progresso do desafio da turma');
  await expect(bar).toHaveAttribute('aria-valuenow', '67');
  await expect(bar).toHaveAttribute('aria-valuetext', '2 de 3 dias');
  await expect(crw).not.toHaveClass(/\b(done|wait)\b/);
  await expect(pop(page)).toHaveCount(0);
  expect(Object.keys((await stored(page)).crewWon)).toEqual([]); // nada vencido, nada guardado
  // a mesma conta na aba Amigos: o cartão fica entre o resumo da turma e o ranking, e o rótulo da linha é "Desta semana"
  await tabF(page).click();
  const card = page.locator('.crw-c');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-label', 'Desafio da turma');
  await expect(card.locator('h2')).toHaveText('Desafio da turma');
  await expect(card.locator('.card-h small')).toHaveText('3 pessoas');
  await expect(card.locator('.crw .m-k')).toHaveText('Desta semana');
  await expect(card.locator('.crw .m-t')).toHaveText('Turma cheia');
  await expect(card.locator('.crw .ch-f span').nth(0)).toHaveText('2 de 3 dias');
  await expect(card.locator('.crw .ch-f span').nth(1)).toHaveText('Termina em 3 dias');
  await expect(card.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '67');
  const tops = await page.evaluate(() => ['.tide', '.crw-c', 'section.rk'].map((s) => document.querySelector(s).getBoundingClientRect().top));
  expect(tops[0]).toBeLessThan(tops[1]);
  expect(tops[1]).toBeLessThan(tops[2]);
});

test('quem entra na conta: eu e os amigos que mostram a semana e apareceram nos últimos 3 dias (amigo em pausa ou que sumiu não conta, e o texto cresce com a turma)', async ({ page }) => {
  // quinta-feira de uma semana de "Maré da semana", com a turma de sempre: a Bia (4 dias), o Caio (3), a Duda (nenhum), o Edu (progresso em pausa) e a Fê (sumiu há 4 dias)
  const friends = [
    mk(UID.bia, 'Bia', 127), mk(UID.caio, 'Caio', 0b0111011), mk(UID.duda, 'Duda', 0),
    mk(UID.edu, 'Edu', null, { sh: false, pct: null, met: false }), mk(UID.fe, 'Fê', 127, { ago: 4 }),
  ];
  await openAt(page, THU_TOTAL, friends, { rows: [HIT(3), HIT(2)], todayMl: 900, medals: except(['cw1']) }); // eu: segunda e terça
  const crw = page.locator('#tChallenges .crw');
  await expect(crw).toHaveCount(1);
  await expect(crw.locator('.m-ico')).toHaveText('🌊');
  await expect(crw.locator('.m-t')).toHaveText('Maré da semana');
  await expect(crw.locator('.m-d')).toHaveText('Juntos, a turma bate a meta 16 vezes nesta semana: 4 por pessoa, em média'); // 4 pessoas: eu, Bia, Caio e Duda
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('9 de 16 metas'); // Bia 4 + Caio 3 (quinta, quarta e segunda) + Duda 0 + eu 2
  await expect(crw.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '56');
  await tabF(page).click();
  await expect(page.locator('.crw-c .card-h small')).toHaveText('4 pessoas');
});

/* ---------- a vitória ---------- */
test('quando a turma fecha a conta, a festa traz o desafio e a medalha Remando juntos, uma vez só; depois de vencido nada desfaz, e a Jornada conta', async ({ page }) => {
  test.setTimeout(75000);
  // o Caio ainda não bateu a meta na quarta: 2 de 3 dias
  await openAt(page, THU_CROWD, [mk(UID.bia, 'Bia', 0b1111), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, medals: except(['cw1', 'cw4']) });
  const crw = page.locator('#tChallenges .crw');
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('2 de 3 dias');
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0);
  const heard0 = await touches(page);
  await page.evaluate((u) => window.__fake.person(u, { wm: 0b1110 }), UID.caio); // o app do Caio manda o perfil novo: ele bateu a meta na quarta
  await expect(pop(page)).toContainText('Desafio da turma');
  await expect(pop(page)).toContainText('Turma cheia');
  await expect(pop(page)).toContainText('A turma venceu a semana!');
  await expect(crw).toHaveClass(/\bdone\b/);
  await expect(crw.locator('.m-k')).toHaveText('Desafio da turma vencido ✓');
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('3 de 3 dias');
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Vencido 🎉');
  await expect(crw.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
  await expect(pop(page)).toContainText('Remando juntos', { timeout: 9000 }); // a medalha vem logo depois do cartão do desafio
  await expect(pop(page)).toContainText('A turma venceu o desafio da semana');
  const st = await stored(page);
  expect(Object.keys(st.crewWon), 'só esta semana, pela segunda-feira').toEqual([MON_CROWD]);
  expect(st.crewWon[MON_CROWD]).toBeGreaterThan(0);
  expect(st.achievements.cw1, 'Remando juntos').toBeGreaterThan(0);
  expect(st.achievements.cw4, 'Time da maré ainda não').toBeUndefined();
  expect((await payload(page)).md2 & 8192, 'a turma passa a ver a medalha no meu perfil (md2, bit 13)').toBe(8192);
  await expect.poll(() => touches(page), 'o perfil sai de novo para a nuvem (sem isso a turma só veria a medalha na próxima vez que algo mudasse)').toBeGreaterThan(heard0);
  await expect(pop(page)).toHaveCount(0, { timeout: 9000 }); // e a festa acaba: nada de cartão extra
  // depois de vencido, nada desfaz: o Caio "perde" a quarta (o perfil dele mudou) e a linha continua vencida
  await page.evaluate((u) => window.__fake.person(u, { wm: 0b1100 }), UID.caio);
  await page.waitForTimeout(500);
  await expect(crw).toHaveClass(/\bdone\b/);
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('3 de 3 dias');
  await expect(pop(page)).toHaveCount(0);
  // recarregar não repete a festa nem muda a hora guardada
  await page.reload();
  await expect(page.locator('#tChallenges .crw')).toHaveClass(/\bdone\b/);
  await page.waitForTimeout(2600);
  await expect(pop(page)).toHaveCount(0);
  expect((await stored(page)).crewWon[MON_CROWD]).toBe(st.crewWon[MON_CROWD]);
  // a Jornada: a medalha conquistada, a próxima com a conta, e a linha do resumo
  await tab(page, 'Jornada').click();
  await expect(medal(page, 'Remando juntos')).not.toHaveClass(/\boff\b/);
  await expect(medal(page, 'Remando juntos').locator('em')).toBeVisible();
  await expect(medal(page, 'Time da maré')).toHaveClass(/\boff\b/);
  await expect(medal(page, 'Time da maré')).toContainText('1 de 4 desafios');
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 1.');
  // e na aba Amigos o cartão também mostra a semana vencida
  await tabF(page).click();
  await expect(page.locator('.crw-c .crw')).toHaveClass(/\bdone\b/);
  await expect(page.locator('.crw-c .crw .m-k')).toHaveText('Desta semana · vencido ✓');
});

test('a turma já fechou a conta e falta só eu bater a meta: a linha avisa, e o registro que bate a meta traz a vitória', async ({ page }) => {
  test.setTimeout(75000);
  // quinta-feira de "Turma cheia", com 4 pessoas: a Bia, o Caio e a Duda bateram a meta na segunda, na terça e na quarta (3 pessoas nos 3 dias). Eu ainda não bati nenhuma: 2.600 ml hoje, faltam 200
  const friends = [mk(UID.bia, 'Bia', 0b1110), mk(UID.caio, 'Caio', 0b1110), mk(UID.duda, 'Duda', 0b1110)];
  await openAt(page, THU_CROWD, friends, { todayMl: 2600, medals: except(['cw1']) });
  const crw = page.locator('#tChallenges .crw');
  await expect(crw).toHaveClass(/\bwait\b/);
  await expect(crw).not.toHaveClass(/\bdone\b/);
  await expect(crw.locator('.m-k')).toHaveText('Desafio da turma');
  await expect(crw.locator('.m-d')).toHaveText('Em 3 dias desta semana, 3 pessoas ou mais batem a meta no mesmo dia');
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('3 de 3 dias');
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Falta só você bater a meta');
  await expect(crw.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0); // a turma cumpriu, mas a vitória pede que eu também bata a meta em algum dia
  expect(Object.keys((await stored(page)).crewWon)).toEqual([]);
  await tabF(page).click();
  await expect(page.locator('.crw-c .crw')).toHaveClass(/\bwait\b/);
  await expect(page.locator('.crw-c .crw .ch-f span').nth(1)).toHaveText('Falta só você bater a meta');
  await tab(page, 'Hoje').click();
  await cup(page, '250 ml').click(); // 2.850 ml: a meta de hoje
  await expect(pop(page)).toContainText('Você bateu a meta!'); // a festa da meta vem primeiro
  await expect(pop(page).filter({ hasText: 'A turma venceu a semana!' })).toBeVisible({ timeout: 12000 });
  await expect(pop(page).filter({ hasText: 'Remando juntos' })).toBeVisible({ timeout: 12000 });
  await expect(crw).toHaveClass(/\bdone\b/);
  await expect(crw).not.toHaveClass(/\bwait\b/);
  await expect(crw.locator('.m-k')).toHaveText('Desafio da turma vencido ✓');
  const st = await stored(page);
  expect(st.crewWon[MON_CROWD]).toBeGreaterThan(0);
  expect(st.achievements.cw1).toBeGreaterThan(0);
});

/* ---------- as duas regras da 1.12.0 ---------- */
test('Corrente da turma: a linha conta os dias seguidos (2 de 3) e o prazo, na Hoje e em Amigos; quando o 3º dia seguido fecha, a festa traz o desafio e a vitória fica guardada', async ({ page }) => {
  test.setTimeout(75000);
  // quinta-feira de uma semana de "Corrente da turma", com 3 pessoas (a maior parte é 2 de 3): eu e a Bia batemos a meta na segunda e na terça; o Caio, de segunda a quarta
  await openAt(page, THU_CHAIN, [mk(UID.bia, 'Bia', 0b1100), mk(UID.caio, 'Caio', 0b1110)], { rows: [HIT(3), HIT(2)], todayMl: 900, medals: except(['cw1']) });
  const crw = page.locator('#tChallenges .crw');
  await expect(crw).toHaveCount(1);
  await expect(crw.locator('.m-ico')).toHaveText('🔗');
  await expect(crw.locator('.m-k')).toHaveText('Desafio da turma');
  await expect(crw.locator('.m-t')).toHaveText('Corrente da turma');
  await expect(crw.locator('.m-d')).toHaveText('Em 3 dias seguidos desta semana, pelo menos 2 das 3 pessoas batem a meta, em cada dia');
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('2 de 3 dias seguidos'); // segunda e terça valeram; na quarta só o Caio bateu
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Termina em 3 dias');
  await expect(crw.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '67');
  await expect(crw.locator('[role="progressbar"]')).toHaveAttribute('aria-valuetext', '2 de 3 dias seguidos');
  await expect(crw).not.toHaveClass(/\b(done|wait)\b/);
  await tabF(page).click();
  await expect(page.locator('.crw-c .crw .m-t')).toHaveText('Corrente da turma');
  await expect(page.locator('.crw-c .crw .ch-f span').nth(0)).toHaveText('2 de 3 dias seguidos');
  await tab(page, 'Hoje').click();
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0);
  expect(Object.keys((await stored(page)).crewWon)).toEqual([]);
  // a Bia abre o app e bate a meta na quarta: segunda, terça e quarta, com a maior parte da turma em cada dia
  await page.evaluate((u) => window.__fake.person(u, { wm: 0b1110 }), UID.bia);
  await expect(pop(page)).toContainText('Desafio da turma');
  await expect(pop(page)).toContainText('Corrente da turma');
  await expect(pop(page)).toContainText('A turma venceu a semana!');
  await expect(crw).toHaveClass(/\bdone\b/);
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('3 de 3 dias seguidos');
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Vencido 🎉');
  await expect(pop(page)).toContainText('Remando juntos', { timeout: 9000 });
  const st = await stored(page);
  expect(Object.keys(st.crewWon), 'só esta semana, pela segunda-feira').toEqual([MON_CHAIN]);
  expect(st.crewWon[MON_CHAIN]).toBeGreaterThan(0);
  expect(st.achievements.cw1, 'Remando juntos').toBeGreaterThan(0);
});

test('Dois dias seguidos: a linha conta quantas pessoas já têm o par (2 de 3, numa turma de 4); quando a terceira fecha o dela, a turma vence', async ({ page }) => {
  test.setTimeout(75000);
  // quinta-feira de uma semana de "Dois dias seguidos", com 4 pessoas (bastam 3 de 4): eu bati a meta na segunda e na terça, a Bia na terça e na quarta, o Caio só hoje e a Duda nenhum dia
  await openAt(page, THU_PAIRS, [mk(UID.bia, 'Bia', 0b0110), mk(UID.caio, 'Caio', 0b0001), mk(UID.duda, 'Duda', 0)], { rows: [HIT(3), HIT(2)], todayMl: 900, medals: except(['cw1']) });
  const crw = page.locator('#tChallenges .crw');
  await expect(crw).toHaveCount(1);
  await expect(crw.locator('.m-ico')).toHaveText('🔥');
  await expect(crw.locator('.m-t')).toHaveText('Dois dias seguidos');
  await expect(crw.locator('.m-d')).toHaveText('Pelo menos 3 das 4 pessoas têm 2 dias seguidos na meta nesta semana');
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('2 de 3 pessoas');
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Termina em 3 dias');
  await expect(crw.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '67');
  await expect(crw).not.toHaveClass(/\b(done|wait)\b/);
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0);
  // o Caio também bateu a meta na quarta: agora ele tem o par (quarta e quinta)
  await page.evaluate((u) => window.__fake.person(u, { wm: 0b0011 }), UID.caio);
  await expect(pop(page)).toContainText('Dois dias seguidos');
  await expect(pop(page)).toContainText('A turma venceu a semana!');
  await expect(crw).toHaveClass(/\bdone\b/);
  await expect(crw.locator('.ch-f span').nth(0)).toHaveText('3 de 3 pessoas');
  const st = await stored(page);
  expect(Object.keys(st.crewWon)).toEqual([MON_PAIRS]);
  expect(st.crewWon[MON_PAIRS]).toBeGreaterThan(0);
});

test('a quarta vitória da turma traz o Time da maré, com as três anteriores já guardadas', async ({ page }) => {
  test.setTimeout(75000);
  await openAt(page, THU_CROWD, [mk(UID.bia, 'Bia', 0b1111), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, crewWon: [1, 2, 3], medals: except(['cw4']) }); // Remando juntos já veio das 3 vitórias
  await expect(page.locator('#tChallenges .crw .ch-f span').nth(0)).toHaveText('2 de 3 dias');
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0);
  await page.evaluate((u) => window.__fake.person(u, { wm: 0b1110 }), UID.caio);
  await expect(pop(page)).toContainText('A turma venceu a semana!');
  await expect(pop(page)).toContainText('Time da maré', { timeout: 9000 });
  await expect(pop(page)).toContainText('A turma venceu o desafio da semana, 4 vezes');
  const st = await stored(page);
  expect(Object.keys(st.crewWon)).toHaveLength(4);
  expect(st.crewWon[MON_CROWD]).toBeGreaterThan(0);
  expect(st.achievements.cw4, 'Time da maré').toBeGreaterThan(0);
  expect((await payload(page)).md2 & 16384, 'a turma vê a medalha (md2, bit 14)').toBe(16384);
  await tab(page, 'Jornada').click();
  await expect(medal(page, 'Time da maré')).not.toHaveClass(/\boff\b/);
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 4.');
});

test('quem já tinha vitórias da turma guardadas (backup, outro aparelho) ganha a medalha em silêncio, e a Jornada mostra quantas faltam para a próxima', async ({ page }) => {
  await openAt(page, THU_CROWD, [mk(UID.bia, 'Bia', 0b1111), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, crewWon: [1, 2], medals: except(['cw1', 'cw4']) });
  await expect(page.locator('#tChallenges .crw')).toHaveCount(1);
  await page.waitForTimeout(2600); // se houvesse cartão de medalha por causa das vitórias guardadas, ele já estaria na tela
  await expect(pop(page)).toHaveCount(0);
  const st = await stored(page);
  expect(st.achievements.cw1, 'Remando juntos').toBeGreaterThan(0);
  expect(st.achievements.cw4, 'Time da maré: só 2 vitórias').toBeUndefined();
  expect(Object.keys(st.crewWon)).toHaveLength(2);
  await tab(page, 'Jornada').click();
  await expect(medal(page, 'Remando juntos')).not.toHaveClass(/\boff\b/);
  await expect(medal(page, 'Remando juntos').locator('em')).toBeVisible(); // com a data
  await expect(medal(page, 'Time da maré')).toHaveClass(/\boff\b/);
  await expect(medal(page, 'Time da maré')).toContainText('2 de 4 desafios');
  await expect(medal(page, 'Time da maré').locator('.mprog i')).toHaveAttribute('data-w', '50');
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 2.');
});

/* ---------- a segunda-feira de tolerância ---------- */
test('na segunda-feira ainda dá para fechar a semana que passou (o domingo dos amigos só chega depois), e na terça já não', async ({ page }) => {
  test.setTimeout(75000);
  const MON = C.addDays(MON_WEEKEND, 7); // a segunda-feira seguinte a uma semana de "Fim de semana da turma"
  // segunda: o sábado e o domingo da semana que acabou (para o app, ontem e anteontem) foram de meta batida para os três
  await openAt(page, MON, [mk(UID.bia, 'Bia', 0b110), mk(UID.caio, 'Caio', 0b110)], { rows: [HIT(1), HIT(2)], todayMl: 300, medals: except(['cw1']) });
  await expect(pop(page)).toContainText('Desafio da turma');
  await expect(pop(page)).toContainText('Fim de semana da turma');
  await expect(pop(page)).toContainText('A turma venceu a semana passada!');
  await expect(pop(page)).toContainText('Remando juntos', { timeout: 9000 });
  const st = await stored(page);
  expect(Object.keys(st.crewWon), 'a vitória é da semana que passou, e não da de hoje').toEqual([MON_WEEKEND]);
  // a linha da Hoje é a da semana que acabou de começar
  const crw = page.locator('#tChallenges .crw');
  await expect(crw).toHaveCount(1);
  await expect(crw).not.toHaveClass(/\b(done|wait)\b/);
  await expect(crw.locator('.m-k')).toHaveText('Desafio da turma');
  await expect(crw.locator('.ch-f span').nth(1)).toHaveText('Termina em 6 dias');
  // na terça, com a mesma semana, já não: a janela de 7 dias do perfil deles não alcança mais o sábado (e a tolerância é só da segunda)
  const p2 = await another(page);
  await openAt(p2, C.addDays(MON, 1), [mk(UID.bia, 'Bia', 0b1100), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(2), HIT(3)], todayMl: 300, medals: except(['cw1']) });
  await expect(p2.locator('#tChallenges .crw')).toHaveCount(1);
  await p2.waitForTimeout(2600);
  await expect(pop(p2)).toHaveCount(0);
  expect(Object.keys((await stored(p2)).crewWon)).toEqual([]);
  await p2.close();
});

/* ---------- sem turma de verdade, não há desafio ---------- */
test('sozinho, com amigos que sumiram ou estão em pausa, com o meu progresso em pausa ou com os amigos desligados: sem linha na Hoje e sem cartão em Amigos (a pausa explica)', async ({ page }) => {
  test.setTimeout(75000);
  const none = async (pg, why) => {
    await expect(pg.locator('#tChallenges .crw'), why + ': linha da Hoje').toHaveCount(0);
    await expect(pg.locator('#tChallenges .card-h small'), why).toHaveText('semana e mês');
    await expect(pg.locator('#tChallenges section.chl'), why).toHaveAttribute('aria-label', 'Desafios da semana e do mês');
  };
  // (a) amigos ligados, mas ainda sem nenhum amigo
  await openAt(page, THU_CROWD, [], { todayMl: 900 });
  await expect(page.locator('#tChallenges .ch-i')).toHaveCount(2);
  await none(page, 'sozinho');
  await tabF(page).click();
  await expect(page.getByRole('heading', { name: 'Sua turma' })).toBeVisible();
  await expect(page.locator('.crw-c')).toHaveCount(0);
  // (b) só amigos que não contam: a Bia sumiu há 4 dias, o Edu está em pausa e a Fê usa um app sem a semana
  const p2 = await another(page);
  await openAt(p2, THU_CROWD, [mk(UID.bia, 'Bia', 127, { ago: 4 }), mk(UID.edu, 'Edu', null, { sh: false, pct: null, met: false }), mk(UID.fe, 'Fê', null)], { todayMl: 900 });
  await expect(p2.locator('#tabbar')).toBeVisible();
  await p2.waitForTimeout(700); // a turma chega da nuvem de mentira
  await none(p2, 'amigos que não contam');
  await tabF(p2).click();
  await expect(p2.locator('.rk')).toBeVisible(); // a turma está lá (o ranking), só não há conta para o desafio
  await expect(p2.locator('.crw-c')).toHaveCount(0);
  await p2.close();
  // (c) eu em pausa: a Hoje não tem a linha; o cartão de Amigos explica; mostrar o progresso de novo traz tudo de volta
  const p3 = await another(page);
  await openAt(p3, THU_CROWD, [mk(UID.bia, 'Bia', 0b1111), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900 });
  await expect(p3.locator('#tChallenges .crw')).toHaveCount(1);
  await tab(p3, 'Ajustes').click();
  const sw = p3.getByRole('switch', { name: 'Mostrar meu progresso do dia aos amigos' });
  await sw.click(); // pausa
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await tab(p3, 'Hoje').click();
  await none(p3, 'eu em pausa');
  await tabF(p3).click();
  const card = p3.locator('.crw-c');
  await expect(card).toBeVisible();
  await expect(card.locator('h2')).toHaveText('Desafio da turma');
  await expect(card.locator('.crw-n')).toHaveText('Seu progresso está em pausa para os amigos, então você fica de fora do desafio da turma. Em Meu perfil dá para mostrá-lo de novo.');
  await expect(card.locator('.crw')).toHaveCount(0);
  await tab(p3, 'Ajustes').click();
  await sw.click(); // volta a mostrar
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await tab(p3, 'Hoje').click();
  await expect(p3.locator('#tChallenges .crw')).toHaveCount(1);
  await expect(p3.locator('#tChallenges .card-h small')).toHaveText('semana, mês e turma');
  await tabF(p3).click();
  await expect(p3.locator('.crw-c .crw')).toHaveCount(1);
  await expect(p3.locator('.crw-n')).toHaveCount(0);
  await p3.close();
  // (d) amigos desligados neste aparelho: nada de turma
  const p4 = await another(page);
  await openAt(p4, THU_CROWD, [mk(UID.bia, 'Bia', 0b1111)], { social: { on: false }, todayMl: 900 });
  await none(p4, 'amigos desligados');
  await p4.close();
});

/* ---------- tamanho de tela ---------- */
// A linha e o cartão têm de caber em qualquer largura (280 px incluída), com o texto mais comprido de cada um dos seis desafios (uma turma de 6 pessoas: números de dois algarismos), no tema claro e no escuro,
// e na hora em que o aviso mais comprido aparece ("Falta só você bater a meta"). O domingo é o dia em que o prazo diz "Termina hoje".
const SIX = [UID.bia, UID.caio, UID.duda, UID.edu, UID.fe].map((u, i) => mk(u, ['Bia', 'Caio', 'Duda', 'Edu', 'Fê'][i], 127)); // 5 amigos e eu: 6 pessoas, todos os amigos com a semana cheia
// confere um bloco: nada passa da largura da tela, e o que está dentro do cartão não vaza dele
const fits = (pg, sel) => pg.evaluate((s) => {
  const w = window.innerWidth, bad = [];
  document.querySelectorAll(s).forEach((card) => {
    const cr = card.getBoundingClientRect();
    if (cr.left < -0.5 || cr.right > w + 0.5) bad.push('cartão fora da tela ' + Math.round(cr.left) + '–' + Math.round(cr.right));
    card.querySelectorAll('.m-ico, .m-body, .m-k, .m-t, .m-d, .bar, .ch-f, .ch-f span, .card-h h2, .card-h small, .crw-n').forEach((x) => {
      const r = x.getBoundingClientRect();
      if (r.right > cr.right + 0.5 || r.left < cr.left - 0.5) bad.push('fora do cartão: ' + x.className + ' ' + (x.textContent || '').slice(0, 30));
    });
  });
  return { over: document.documentElement.scrollWidth - w, bad: bad, n: document.querySelectorAll(s).length };
}, sel);
async function crewLook(pg, info, id, scheme, extra) {
  const sun = C.addDays(monOf(id), 6), tag = id + ' ' + scheme + (extra && extra.tag ? ' ' + extra.tag : '');
  await pg.clock.install({ time: noon(sun) });
  await stubFriendsCloud(pg, { friends: SIX, code: 'ABCD2345' });
  await seed(pg, { insignias: OCEAN, social: Object.assign({}, SOCIAL_ON, (extra && extra.social) || {}), todayMl: 300, profile: { theme: scheme }, missions: [0], extras: [[0, 'e'], [0, 'h']], challenges: [['w', 0], ['m', 0]] });
  await pg.goto('/');
  await expect(pg.locator('html')).toHaveAttribute('data-theme', scheme);
  const paused = !!(extra && extra.social && extra.social.share === false);
  if (!paused) await expect(pg.locator('#tChallenges .crw')).toHaveCount(1);
  await pg.waitForTimeout(900); // as barras terminam de crescer
  let x;
  if (!paused) {
    x = await fits(pg, '#tChallenges section.chl');
    expect(x.over, 'rolagem lateral na Hoje (' + tag + ')').toBeLessThanOrEqual(0);
    expect(x.bad, 'blocos fora do cartão na Hoje (' + tag + ')').toEqual([]);
    await pg.locator('#tChallenges').scrollIntoViewIfNeeded();
    await pg.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Hoje desafio da turma ' + tag + '.png', fullPage: true });
  }
  await pg.locator('#tabbar').getByRole('button', { name: /^Amigos/ }).click();
  await expect(pg.locator('.crw-c')).toHaveCount(1);
  await pg.waitForTimeout(900);
  x = await fits(pg, '.crw-c');
  expect(x.over, 'rolagem lateral em Amigos (' + tag + ')').toBeLessThanOrEqual(0);
  expect(x.bad, 'blocos fora do cartão em Amigos (' + tag + ')').toEqual([]);
  await pg.locator('.crw-c').scrollIntoViewIfNeeded();
  await pg.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Amigos desafio da turma ' + tag + '.png', fullPage: true });
}

// um teste por desafio da lista (assim uma entrada nova de uma leva futura já entra aqui sozinha), cada um no tema claro e no escuro
for (const id of C.CREW_CHALLENGES.map((c) => c.id)) {
  test('layout: o desafio da turma "' + id + '" (a linha da Hoje e o cartão de Amigos) cabe em qualquer tela, no tema claro e no escuro', async ({ page }, info) => {
    test.setTimeout(100000);
    await crewLook(page, info, id, 'light');
    const p2 = await another(page);
    await crewLook(p2, info, id, 'dark');
    await p2.close();
  });
}

test('layout: o aviso de pausa (a frase mais comprida do cartão) também cabe', async ({ page }, info) => {
  test.setTimeout(60000);
  await crewLook(page, info, 'ctotal', 'dark', { social: { share: false }, tag: 'pausa' });
});
