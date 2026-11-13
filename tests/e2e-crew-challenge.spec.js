// Maré — testes de interface do desafio da turma (1.11.0 a 1.14.0): a linha em "Desafios", na Hoje, e o cartão da aba Amigos; a festa quando a turma vence (com as medalhas Remando juntos e Time da maré, e Navegando juntos e Frota da maré para o mês);
// o "falta só você"; a segunda-feira de tolerância; quem entra na conta; a turma sozinha e a pausa; o que a Jornada mostra; o desafio do MÊS da turma (1.13.0: a linha "Deste mês" em Amigos); e o leiaute em qualquer tela, em cada regra da semana e do mês. A conta em si
// (as regras da semana, quem entra, a grade da semana) está em tests/crew-challenge.test.js e a do mês em tests/crew-month.test.js; aqui se confere o que aparece na tela e o que fica guardado. Qualquer erro de JavaScript na página reprova.
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
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 1 semana.');
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
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 4 semanas.');
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
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 2 semanas.');
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

/* ---------- o desafio do mês da turma (1.13.0) ---------- */
// Uma linha a mais no cartão de Amigos ("Deste mês", depois da "Desta semana"); a Hoje segue só com a da semana. A conta vem do que cada amigo publica no perfil: mm (os dias deste mês em que bateu a meta, até o dia do
// perfil) e mp (os do mês anterior). Quem ainda usa um app sem esses campos fica fora da conta do mês. A conta em si (as quatro regras, quem entra, a graça dos 7 primeiros dias) está em tests/crew-month.test.js; aqui se
// confere o que aparece na tela, o que fica guardado e a festa. Desde a 1.14.0 o mês da turma também dá medalha (Navegando juntos, no primeiro mês, e Frota da maré, no terceiro) e entra na conta "Desafios da turma vencidos" da Jornada, à parte das semanas ("2 semanas e 1 mês"): as medalhas Remando juntos e Time da maré seguem contando só as semanas.
const DEC17 = '2026-12-17'; // quinta-feira: dezembro tem 31 dias, o desafio é "Turma firme" (17 dias) e faltam 14 dias para fechar
const monthRow = (pg) => pg.locator('.crw-c .crw').nth(1); // a linha do mês: a segunda do cartão, depois da semana
// a Bia (20 dias do mês na meta) e o Caio (10): o Caio ainda não chegou a 17
const MBIA = () => mk(UID.bia, 'Bia', 0b1111, { mm: 20, mp: 25 });
const MCAIO = (mm) => mk(UID.caio, 'Caio', 0b1100, { mm: mm, mp: 12 });

test('o desafio do mês da turma fica só na aba Amigos, depois do da semana, com o andamento e o prazo, e acompanha o perfil dos amigos ao vivo', async ({ page }) => {
  test.setTimeout(60000);
  // quinta-feira, 17/12/2026. Eu bati a meta em 3 dias do mês (14, 15 e 16); a Bia, em 20; o Caio, em 10. "Turma firme": 2 das 3 pessoas precisam de 17 dias, e só a Bia chegou lá
  await openAt(page, DEC17, [MBIA(), MCAIO(10)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, medals: except(['cw1']) });
  // na Hoje segue só a linha da semana: o mês da turma não entra lá
  const ch = page.locator('#tChallenges');
  await expect(ch.locator('.crw')).toHaveCount(1);
  await expect(ch.locator('.ch-i')).toHaveCount(3);
  await expect(ch).not.toContainText('Deste mês');
  await expect(ch).not.toContainText('Turma firme');
  await tabF(page).click();
  const card = page.locator('.crw-c');
  await expect(card).toBeVisible();
  await expect(card.locator('.crw')).toHaveCount(2);
  await expect(card.locator('.crw').nth(0).locator('.m-k')).toHaveText('Desta semana');
  const row = monthRow(page), bar = row.locator('[role="progressbar"]');
  await expect(row.locator('.m-k')).toHaveText('Deste mês');
  await expect(row.locator('.m-ico')).toHaveText('⚓');
  await expect(row.locator('.m-t')).toHaveText('Turma firme');
  await expect(row.locator('.m-d')).toHaveText('Pelo menos 2 das 3 pessoas batem a meta em pelo menos 17 dias deste mês');
  await expect(row.locator('.ch-f span').nth(0)).toHaveText('1 de 2 pessoas');
  await expect(row.locator('.ch-f span').nth(1)).toHaveText('Termina em 14 dias');
  await expect(bar).toHaveAttribute('aria-label', 'Progresso do desafio do mês da turma');
  await expect(bar).toHaveAttribute('aria-valuenow', '50');
  await expect(bar).toHaveAttribute('aria-valuetext', '1 de 2 pessoas');
  await expect(row).not.toHaveClass(/\b(done|wait)\b/);
  await expect(card.locator('.card-h small')).toHaveText('3 pessoas'); // o cabeçalho segue contando as pessoas da semana
  const ys = await card.locator('.crw').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(ys[0], 'a semana vem antes do mês').toBeLessThan(ys[1]);
  // o Caio abre o app e o perfil dele passa a dizer 18 dias: a conta fecha, e falta só eu bater mais um dia dos 4 que a vitória pede de mim
  await page.evaluate((u) => window.__fake.person(u, { mm: 18 }), UID.caio);
  await expect(row).toHaveClass(/\bwait\b/);
  await expect(row.locator('.ch-f span').nth(0)).toHaveText('2 de 2 pessoas');
  await expect(row.locator('.ch-f span').nth(1)).toHaveText('Falta você: mais 1 dia');
  await expect(bar).toHaveAttribute('aria-valuenow', '100');
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0); // a turma cumpriu, mas a vitória pede que eu também bata a meta em 4 dias do mês
  expect(Object.keys((await stored(page)).crewWon)).toEqual([]);
});

test('quem ainda usa um app sem os dias do mês fica fora da conta do mês, e sem ninguém para contar a linha do mês some', async ({ page }) => {
  test.setTimeout(60000);
  // a Bia já publica os dias do mês; o Caio, ainda no app de antes (sem mm nem mp), segue na conta da semana
  await openAt(page, DEC17, [MBIA(), mk(UID.caio, 'Caio', 0b1100)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, medals: except(['cw1']) });
  await tabF(page).click();
  const card = page.locator('.crw-c');
  await expect(card.locator('.card-h small')).toHaveText('3 pessoas'); // a semana: eu, a Bia e o Caio
  const row = monthRow(page);
  await expect(row.locator('.m-d')).toHaveText('As 2 pessoas batem a meta em pelo menos 17 dias deste mês'); // o mês: só eu e a Bia
  await expect(row.locator('.ch-f span').nth(0)).toHaveText('1 de 2 pessoas');
  // a Bia também fica sem a conta do mês (app antigo): sobra só eu, não há turma do mês, e fica a linha da semana
  await page.evaluate((u) => window.__fake.person(u, { mm: null, mp: null }), UID.bia);
  await expect(card.locator('.crw')).toHaveCount(1);
  await expect(card.locator('.crw .m-k')).toHaveText('Desta semana');
  await expect(card).not.toContainText('Deste mês');
});

test('"Falta você" diz quantos dias do mês ainda faltam dos 4 que a vitória pede de mim', async ({ page }) => {
  test.setTimeout(60000);
  // a turma já fechou a conta: a Bia (20 dias) e o Caio (18) passaram dos 17
  const friends = [MBIA(), MCAIO(18)];
  await openAt(page, DEC17, friends, { rows: [HIT(1)], todayMl: 900, medals: except(['cw1']) }); // eu: 1 dia do mês na meta (o 16)
  await tabF(page).click();
  await expect(monthRow(page)).toHaveClass(/\bwait\b/);
  await expect(monthRow(page).locator('.ch-f span').nth(1)).toHaveText('Falta você: mais 3 dias');
  await expect(monthRow(page).locator('.ch-f span').nth(0)).toHaveText('2 de 2 pessoas');
  const p2 = await another(page);
  await openAt(p2, DEC17, friends, { rows: [HIT(2), HIT(1)], todayMl: 900, medals: except(['cw1']) }); // eu: 2 dias (15 e 16)
  await tabF(p2).click();
  await expect(monthRow(p2).locator('.ch-f span').nth(1)).toHaveText('Falta você: mais 2 dias');
  await p2.close();
});

test('quando o dia que completa os 4 chega, a festa traz o desafio do mês e a medalha Navegando juntos, uma vez só; a vitória fica guardada com a chave do mês e a Jornada conta o mês à parte das semanas', async ({ page }) => {
  test.setTimeout(90000);
  // 17/12/2026: a Bia (20 dias) e o Caio (18) já passaram dos 17; eu bati a meta em 3 dias do mês (14, 15 e 16) e hoje ainda não: 2.600 ml, faltam 200
  await openAt(page, DEC17, [MBIA(), MCAIO(18)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 2600, medals: except(['cw1', 'cm1', 'cm3']) });
  await tabF(page).click();
  const row = monthRow(page);
  await expect(row).toHaveClass(/\bwait\b/);
  await expect(row.locator('.ch-f span').nth(1)).toHaveText('Falta você: mais 1 dia'); // no singular
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0);
  expect(Object.keys((await stored(page)).crewWon)).toEqual([]);
  await tab(page, 'Hoje').click();
  await expect(page.locator('#tChallenges .crw')).toHaveCount(1);
  const heard0 = await touches(page);
  await cup(page, '250 ml').click(); // 2.850 ml: a meta de hoje, o 4º dia do mês
  await expect(pop(page)).toContainText('Você bateu a meta!'); // a festa da meta vem primeiro
  const won = pop(page).filter({ hasText: 'A turma venceu o mês!' });
  await expect(won).toBeVisible({ timeout: 12000 });
  await expect(won).toContainText('Desafio do mês da turma');
  await expect(won).toContainText('Turma firme');
  await expect(pop(page)).toContainText('Navegando juntos', { timeout: 9000 }); // a medalha vem logo depois do cartão do desafio
  await expect(pop(page)).toContainText('A turma venceu o desafio do mês');
  const st = await stored(page);
  expect(Object.keys(st.crewWon), 'só este mês, pela chave AAAA-MM').toEqual(['2026-12']);
  expect(st.crewWon['2026-12']).toBeGreaterThan(0);
  expect(st.achievements.cm1, 'Navegando juntos').toBeGreaterThan(0);
  expect(st.achievements.cm3, 'Frota da maré ainda não').toBeUndefined();
  expect(st.achievements.cw1, 'o mês não dá a medalha das semanas').toBeUndefined();
  expect(((await payload(page)).md2 || 0) & 32768, 'a turma passa a ver a medalha no meu perfil (md2, bit 15)').toBe(32768);
  expect(((await payload(page)).md2 || 0) & 8192, 'e a medalha das semanas segue sem aparecer (bit 13)').toBe(0);
  await expect.poll(() => touches(page), 'o perfil sai de novo para a nuvem (a turma só veria a medalha na próxima vez que algo mudasse)').toBeGreaterThan(heard0);
  await expect(pop(page)).toHaveCount(0, { timeout: 12000 }); // e a festa acaba: nada de cartão extra
  // na aba Amigos a linha fica vencida; depois de vencida, nada desfaz (a Bia "perde" dias e a linha continua)
  await tabF(page).click();
  await expect(row).toHaveClass(/\bdone\b/);
  await expect(row).not.toHaveClass(/\bwait\b/);
  await expect(row.locator('.m-k')).toHaveText('Deste mês · vencido ✓');
  await expect(row.locator('.ch-f span').nth(0)).toHaveText('2 de 2 pessoas');
  await expect(row.locator('.ch-f span').nth(1)).toHaveText('Vencido 🎉');
  await expect(row.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
  await page.evaluate((u) => window.__fake.person(u, { mm: 5 }), UID.bia);
  await page.waitForTimeout(500);
  await expect(row).toHaveClass(/\bdone\b/);
  await expect(pop(page)).toHaveCount(0);
  // recarregar não repete a festa nem muda a hora guardada
  await page.reload();
  await page.waitForTimeout(2600);
  await expect(pop(page)).toHaveCount(0);
  expect((await stored(page)).crewWon['2026-12']).toBe(st.crewWon['2026-12']);
  // a Jornada conta o mês à parte das semanas: "1 mês", a Navegando juntos conquistada, a Frota da maré com a conta (1 de 3) e a Remando juntos (das semanas) por conquistar
  await tab(page, 'Jornada').click();
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 1 mês.');
  await expect(medal(page, 'Navegando juntos')).not.toHaveClass(/\boff\b/);
  await expect(medal(page, 'Navegando juntos').locator('em')).toBeVisible();
  await expect(medal(page, 'Frota da maré')).toHaveClass(/\boff\b/);
  await expect(medal(page, 'Frota da maré')).toContainText('1 de 3 desafios');
  await expect(medal(page, 'Remando juntos')).toHaveClass(/\boff\b/);
  await expect(medal(page, 'Remando juntos')).toContainText('A turma venceu o desafio da semana');
});

test('a vitória do mês que chega pelo perfil de um amigo, sem eu beber nada, também vira festa e medalha, avisa a turma e redesenha a Jornada que está aberta', async ({ page }) => {
  test.setTimeout(90000);
  // 17/12/2026: eu já bati a meta em 4 dias do mês (13 a 16); a Bia tem 20 dias e o Caio, 10: a turma ainda não fechou a conta (2 das 3 pessoas precisam de 17 dias, e só a Bia chegou lá)
  await openAt(page, DEC17, [MBIA(), MCAIO(10)], { rows: [HIT(4), HIT(3), HIT(2), HIT(1)], todayMl: 900, medals: except(['cw1', 'cm1', 'cm3']) });
  await tab(page, 'Jornada').click(); // fico olhando a Jornada, sem tocar em nada
  await expect(medal(page, 'Navegando juntos')).toHaveClass(/\boff\b/);
  await expect(page.locator('.chl-j')).not.toContainText('Desafios da turma vencidos');
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0);
  const heard0 = await touches(page);
  await page.evaluate((u) => window.__fake.person(u, { mm: 18 }), UID.caio); // o Caio abre o app: o perfil dele passa a dizer 18 dias, e a conta fecha sem eu fazer nada
  const won = pop(page).filter({ hasText: 'A turma venceu o mês!' });
  await expect(won).toBeVisible({ timeout: 12000 });
  await expect(won).toContainText('Turma firme');
  await expect(pop(page)).toContainText('Navegando juntos', { timeout: 9000 });
  // a Jornada que estava aberta já mostra a medalha e a conta do mês, sem eu trocar de aba
  await expect(medal(page, 'Navegando juntos')).not.toHaveClass(/\boff\b/);
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 1 mês.');
  // a turma passa a ver a medalha: o perfil sai de novo para a nuvem (e leva o bit da Navegando juntos)
  await expect.poll(() => touches(page), 'o perfil sai de novo para a nuvem sem que eu tenha bebido nada').toBeGreaterThan(heard0);
  expect(((await payload(page)).md2 || 0) & 32768, 'md2, bit 15').toBe(32768);
  const st = await stored(page);
  expect(Object.keys(st.crewWon)).toEqual(['2026-12']);
  expect(st.achievements.cm1, 'Navegando juntos').toBeGreaterThan(0);
  await expect(pop(page)).toHaveCount(0, { timeout: 12000 });
});

// as quatro regras, cada uma no mês em que o app a sorteia (a data decide, igual para todo mundo); no dia 15, com a mesma turma: eu com 2 dias, a Bia com 20 e o Caio com 10
// [dia, id, emoji, título, descrição, o andamento, o % da barra, o prazo]
const MONTH_RULES = [
  ['2026-12-15', 'mmost', '⚓', 'Turma firme', 'Pelo menos 2 das 3 pessoas batem a meta em pelo menos 17 dias deste mês', '1 de 2 pessoas', '50', 'Termina em 16 dias'],
  ['2027-01-15', 'mnear', '🚢', 'Quase todos a bordo', 'Cada pessoa da turma bate a meta em pelo menos 14 dias deste mês', '1 de 3 pessoas', '33', 'Termina em 16 dias'],
  ['2027-03-15', 'mtotal', '🌊', 'Maré do mês', 'Juntos, a turma bate a meta 54 vezes neste mês: 18 por pessoa, em média', '32 de 54 metas', '59', 'Termina em 16 dias'],
  ['2027-04-15', 'mhalf', '💪', 'Ritmo forte', 'Pelo menos 2 das 3 pessoas batem a meta em pelo menos 20 dias deste mês', '1 de 2 pessoas', '50', 'Termina em 15 dias'],
];
for (const m of MONTH_RULES) {
  test('o desafio do mês "' + m[1] + '" (' + m[3] + '): o texto, a conta, a barra e o prazo na aba Amigos', async ({ page }) => {
    test.setTimeout(60000);
    // a semana de hoje já vem vencida (crewWon), para só o mês estar em jogo
    await openAt(page, m[0], [MBIA(), MCAIO(10)], { rows: [HIT(2), HIT(1)], todayMl: 900, crewWon: [0], medals: except(['cw1']) });
    expect(C.crewMonthInfo(C.defaults(), [0, 0], m[0].slice(0, 7), m[0]).c.id, 'o mês sorteia essa regra').toBe(m[1]);
    await tabF(page).click();
    const row = monthRow(page);
    await expect(row.locator('.m-k')).toHaveText('Deste mês');
    await expect(row.locator('.m-ico')).toHaveText(m[2]);
    await expect(row.locator('.m-t')).toHaveText(m[3]);
    await expect(row.locator('.m-d')).toHaveText(m[4]);
    await expect(row.locator('.ch-f span').nth(0)).toHaveText(m[5]);
    await expect(row.locator('.ch-f span').nth(1)).toHaveText(m[7]);
    await expect(row.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', m[6]);
    await expect(row.locator('[role="progressbar"]')).toHaveAttribute('aria-valuetext', m[5]);
    await expect(row).not.toHaveClass(/\b(done|wait)\b/);
    await page.waitForTimeout(600);
    await expect(pop(page)).toHaveCount(0);
  });
}

test('o mês já vencido fica vencido: a linha diz "vencido", nenhuma festa repete e nada é regravado', async ({ page }) => {
  test.setTimeout(60000);
  // 17/12/2026: a turma venceu o mês (guardado há 1 minuto) e depois o Caio ficou com 10 dias no perfil: a conta de hoje não fecharia, mas a vitória não se desfaz
  await openAt(page, DEC17, [MBIA(), MCAIO(10)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, crewWonMonths: [0], medals: except(['cw1']) });
  const before = (await stored(page)).crewWon;
  expect(Object.keys(before)).toEqual(['2026-12']);
  await tabF(page).click();
  const row = monthRow(page);
  await expect(row).toHaveClass(/\bdone\b/);
  await expect(row.locator('.m-k')).toHaveText('Deste mês · vencido ✓');
  await expect(row.locator('.m-t')).toHaveText('Turma firme');
  await expect(row.locator('.ch-f span').nth(0)).toHaveText('2 de 2 pessoas');
  await expect(row.locator('.ch-f span').nth(1)).toHaveText('Vencido 🎉');
  await expect(row.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100');
  await page.waitForTimeout(1200);
  await expect(pop(page)).toHaveCount(0);
  expect((await stored(page)).crewWon).toEqual(before);
});

test('na primeira semana do mês seguinte ainda dá para fechar o mês que acabou: a festa diz "mês passado" e a vitória vai para o mês certo', async ({ page }) => {
  test.setTimeout(75000);
  // domingo, 3/1/2027. Em dezembro eu bati a meta em 4 dias (28 a 31); a Bia, em 20, e o Caio, em 18 (é o mp deles: o mês antes do dia do perfil). "Turma firme" de dezembro: 2 das 3 pessoas com 17 dias
  const friends = [mk(UID.bia, 'Bia', 0, { mm: 1, mp: 20 }), mk(UID.caio, 'Caio', 0, { mm: 0, mp: 18 })];
  await openAt(page, '2027-01-03', friends, { rows: [HIT(3), HIT(4), HIT(5), HIT(6)], todayMl: 900, medals: except(['cw1', 'cm1', 'cm3']) }); // a semana de hoje ("Quatro dias a bordo") não fecha: os amigos têm 0 dias nela
  await expect(pop(page)).toContainText('Desafio do mês da turma');
  await expect(pop(page)).toContainText('Turma firme');
  await expect(pop(page)).toContainText('A turma venceu o mês passado!');
  const st = await stored(page);
  expect(Object.keys(st.crewWon), 'só dezembro, pela chave AAAA-MM').toEqual(['2026-12']);
  expect(st.crewWon['2026-12']).toBeGreaterThan(0);
  expect(st.achievements.cw1, 'o mês não dá a medalha das semanas').toBeUndefined();
  expect(st.achievements.cm1, 'Navegando juntos, pelo mês passado').toBeGreaterThan(0);
  await expect(pop(page)).toContainText('Navegando juntos', { timeout: 9000 });
  await expect(pop(page)).toHaveCount(0, { timeout: 12000 });
  // a aba Amigos mostra janeiro, o mês de hoje, que recomeça sem vitória e com outra regra
  await tabF(page).click();
  const row = monthRow(page);
  await expect(row.locator('.m-k')).toHaveText('Deste mês');
  await expect(row.locator('.m-t')).toHaveText('Quase todos a bordo');
  await expect(row).not.toHaveClass(/\bdone\b/);
  // recarregar não repete a festa nem muda a hora guardada
  await page.reload();
  await page.waitForTimeout(2600);
  await expect(pop(page)).toHaveCount(0);
  expect((await stored(page)).crewWon['2026-12']).toBe(st.crewWon['2026-12']);
});

test('dois meses fecham juntos na primeira semana do seguinte: uma festa só, que diz "2 meses", e as duas vitórias ficam guardadas', async ({ page }) => {
  test.setTimeout(75000);
  // domingo, 7/2/2027 (o último dia da graça de janeiro). Fevereiro: bati a meta em 7 dias (1 a 7) e os amigos já têm 28 ("Turma firme": 15 dias). Janeiro: bati em 14 dias (18 a 31) e a Bia e o Caio, em 31 (mp):
  // "Quase todos a bordo" pede 14 dias de cada uma das 3 pessoas. A semana de hoje não fecha (os amigos têm 0 dias nela)
  const friends = [mk(UID.bia, 'Bia', 0, { mm: 28, mp: 31 }), mk(UID.caio, 'Caio', 0, { mm: 28, mp: 31 })];
  const rows = [];
  for (let ago = 0; ago <= 20; ago++) rows.push(HIT(ago));
  await openAt(page, '2027-02-07', friends, { rows: rows, medals: except(['cw1', 'cm1', 'cm3']) });
  await expect(pop(page)).toContainText('Desafio do mês da turma');
  await expect(pop(page)).toContainText('A turma venceu 2 meses!');
  await expect(pop(page)).toContainText('Turma firme'); // a festa traz o desafio de fevereiro (o mês de hoje), não o de janeiro ("Quase todos a bordo")
  await expect(pop(page)).not.toContainText('Quase todos a bordo');
  const st = await stored(page);
  expect(Object.keys(st.crewWon).sort(), 'janeiro e fevereiro, pelas chaves AAAA-MM').toEqual(['2027-01', '2027-02']);
  expect(st.crewWon['2027-01']).toBeGreaterThan(0);
  expect(st.crewWon['2027-02']).toBeGreaterThan(0);
  expect(st.achievements.cw1, 'o mês não dá a medalha das semanas').toBeUndefined();
  expect(st.achievements.cm1, 'Navegando juntos (2 meses de uma vez dão uma medalha só: a Frota da maré pede 3)').toBeGreaterThan(0);
  expect(st.achievements.cm3, 'Frota da maré ainda não').toBeUndefined();
  await expect(pop(page)).toContainText('Navegando juntos', { timeout: 9000 });
  await expect(pop(page)).toHaveCount(0, { timeout: 12000 });
  await tabF(page).click();
  const row = monthRow(page);
  await expect(row).toHaveClass(/\bdone\b/);
  await expect(row.locator('.m-t')).toHaveText('Turma firme'); // fevereiro
  await expect(row.locator('.m-k')).toHaveText('Deste mês · vencido ✓');
});

test('o terceiro mês vencido traz a Frota da maré: os dois de antes já tinham dado a Navegando juntos (em silêncio, pelo rastro) e a festa do mês é seguida da medalha nova', async ({ page }) => {
  test.setTimeout(90000);
  // 17/12/2026, como na festa do primeiro mês, mas a turma já tinha vencido outubro e novembro (as vitórias estão guardadas)
  await openAt(page, DEC17, [MBIA(), MCAIO(18)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 2600, crewWonMonths: [1, 2], medals: except(['cw1', 'cm1', 'cm3']) });
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0); // o rastro cumpre a Navegando juntos sem festa
  const st0 = await stored(page);
  expect(Object.keys(st0.crewWon).sort()).toEqual(['2026-10', '2026-11']);
  expect(st0.achievements.cm1, 'Navegando juntos veio do rastro').toBeGreaterThan(0);
  expect(st0.achievements.cm3, 'Frota da maré ainda não').toBeUndefined();
  await cup(page, '250 ml').click(); // 2.850 ml: a meta de hoje, o 4º dia do mês
  const won = pop(page).filter({ hasText: 'A turma venceu o mês!' });
  await expect(won).toBeVisible({ timeout: 12000 });
  await expect(pop(page)).toContainText('Frota da maré', { timeout: 9000 });
  await expect(pop(page)).toContainText('A turma venceu o desafio do mês, 3 vezes');
  const st = await stored(page);
  expect(Object.keys(st.crewWon).sort()).toEqual(['2026-10', '2026-11', '2026-12']);
  expect(st.achievements.cm3, 'Frota da maré').toBeGreaterThan(0);
  expect(st.achievements.cm1, 'a Navegando juntos não muda').toBe(st0.achievements.cm1);
  expect(((await payload(page)).md2 || 0) & 98304, 'a turma vê as duas no meu perfil (md2, bits 15 e 16)').toBe(98304);
  await expect(pop(page)).toHaveCount(0, { timeout: 12000 });
  await tab(page, 'Jornada').click();
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 3 meses.');
  await expect(medal(page, 'Frota da maré')).not.toHaveClass(/\boff\b/);
  await expect(medal(page, 'Frota da maré').locator('em')).toBeVisible();
});

test('a Jornada conta as semanas e os meses da turma à parte, cada um com o seu plural, e cada medalha da turma olha só a sua conta', async ({ page }) => {
  test.setTimeout(60000);
  // 17/12/2026: a turma venceu 2 semanas (as duas anteriores, guardadas) e 1 mês (novembro)
  await openAt(page, DEC17, [MBIA(), MCAIO(10)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, crewWon: [1, 2], crewWonMonths: [1], medals: except(['cw1', 'cw4', 'cm1', 'cm3']) });
  await tab(page, 'Jornada').click();
  await expect(page.locator('.chl-j')).toContainText('Desafios da turma vencidos: 2 semanas e 1 mês.');
  await expect(medal(page, 'Remando juntos')).not.toHaveClass(/\boff\b/); // as semanas dão as delas
  await expect(medal(page, 'Time da maré')).toHaveClass(/\boff\b/);
  await expect(medal(page, 'Time da maré')).toContainText('2 de 4 desafios');
  await expect(medal(page, 'Navegando juntos')).not.toHaveClass(/\boff\b/); // e o mês dá a dele
  await expect(medal(page, 'Frota da maré')).toHaveClass(/\boff\b/);
  await expect(medal(page, 'Frota da maré')).toContainText('1 de 3 desafios');
  await page.waitForTimeout(800);
  await expect(pop(page)).toHaveCount(0); // tudo veio do rastro: sem festa
});

// A frase da Jornada só diz o que há: só semanas, só meses, ou as duas (as sabotagens "mostra 0 meses" e "só aparece com um mês" mostraram que só o caso das duas estava coberto). É a última frase do cartão.
for (const c of [{ nome: 'só semanas vencidas', won: [1], months: [], frase: 'Desafios da turma vencidos: 1 semana.' }, { nome: 'só meses vencidos', won: [], months: [1, 2], frase: 'Desafios da turma vencidos: 2 meses.' },
  { nome: 'três semanas e um mês', won: [1, 2, 3], months: [1], frase: 'Desafios da turma vencidos: 3 semanas e 1 mês.' }]) {
  test('a Jornada, ' + c.nome + ': "' + c.frase + '" (nunca "0 semanas" nem "0 meses")', async ({ page }) => {
    test.setTimeout(60000);
    await openAt(page, DEC17, [MBIA(), MCAIO(10)], { rows: [HIT(3), HIT(2), HIT(1)], todayMl: 900, crewWon: c.won, crewWonMonths: c.months });
    await tab(page, 'Jornada').click();
    await expect(page.locator('.chl-j')).toContainText(c.frase);
    const txt = await page.locator('.chl-j').evaluate((e) => (e.textContent || '').replace(/\s+/g, ' ').trim());
    expect(txt.endsWith(c.frase), 'a frase da turma é a última do cartão: ' + txt.slice(-90)).toBe(true);
    expect(txt).not.toContain('0 semanas');
    expect(txt).not.toContain('0 meses');
    await page.waitForTimeout(500);
    await expect(pop(page)).toHaveCount(0); // tudo veio do rastro: sem festa
  });
}

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

/* ---------- tamanho de tela: a linha do mês (1.13.0) ---------- */
// O cartão de Amigos com as duas linhas (semana e mês) tem de caber em qualquer largura (280 px incluída), no tema claro e no escuro, em cada uma das quatro regras do mês, no último dia do mês (o prazo diz "Termina hoje"), com
// uma turma de 6 pessoas que já fechou a conta e eu sem nenhum dia na meta: é o aviso mais comprido ("Falta você: mais 4 dias") e os números de três algarismos da "Maré do mês" (108 metas).
const nextYm = (ym) => (ym.slice(5) === '12' ? (+ym.slice(0, 4) + 1) + '-01' : ym.slice(0, 5) + String(+ym.slice(5) + 1).padStart(2, '0'));
// o primeiro mês (a partir de dezembro de 2026) em que o desafio do mês da turma é o de id `id`
const ymOf = (id) => {
  let ym = '2026-12';
  for (let i = 0; i < 40; i++, ym = nextYm(ym)) if (C.crewMonthInfo(C.defaults(), [0, 0], ym, ym + '-15').c.id === id) return ym;
  throw new Error('nenhum mês de ' + id);
};
const SIX_M = [UID.bia, UID.caio, UID.duda, UID.edu, UID.fe].map((u, i) => mk(u, ['Bia', 'Caio', 'Duda', 'Edu', 'Fê'][i], 127, { mm: 31, mp: 31 })); // 5 amigos e eu: todos os amigos com o mês cheio
async function monthLook(pg, info, id, scheme, extra) {
  const ym = ymOf(id), last = C.monthEnd(ym + '-01'), done = !!(extra && extra.done), tag = id + ' ' + scheme + (done ? ' vencido' : '');
  await pg.clock.install({ time: noon(last) });
  await stubFriendsCloud(pg, { friends: SIX_M, code: 'ABCD2345' });
  await seed(pg, { insignias: OCEAN, social: SOCIAL_ON, todayMl: 300, profile: { theme: scheme }, missions: [0], extras: [[0, 'e'], [0, 'h']], challenges: [['w', 0], ['m', 0]], crewWonMonths: done ? [0] : [] });
  await pg.goto('/');
  await expect(pg.locator('html')).toHaveAttribute('data-theme', scheme);
  await pg.locator('#tabbar').getByRole('button', { name: /^Amigos/ }).click();
  await expect(pg.locator('.crw-c .crw')).toHaveCount(2);
  await pg.waitForTimeout(900); // as barras terminam de crescer
  const row = monthRow(pg);
  await expect(row.locator('.m-t')).toHaveText(C.CREW_MONTHLY.find((c) => c.id === id).t);
  await expect(row.locator('.m-k')).toHaveText(done ? 'Deste mês · vencido ✓' : 'Deste mês');
  await expect(row.locator('.ch-f span').nth(1)).toHaveText(done ? 'Vencido 🎉' : 'Falta você: mais 4 dias');
  const x = await fits(pg, '.crw-c');
  expect(x.over, 'rolagem lateral em Amigos (' + tag + ')').toBeLessThanOrEqual(0);
  expect(x.bad, 'blocos fora do cartão em Amigos (' + tag + ')').toEqual([]);
  await pg.locator('.crw-c').scrollIntoViewIfNeeded();
  await pg.screenshot({ path: 'test-results/shots/' + info.project.name + ' - Amigos desafio do mês da turma ' + tag + '.png', fullPage: true });
}
for (const id of C.CREW_MONTHLY.map((c) => c.id)) {
  test('layout: o desafio do mês da turma "' + id + '" (a linha do mês no cartão de Amigos) cabe em qualquer tela, no tema claro e no escuro', async ({ page }, info) => {
    test.setTimeout(100000);
    await monthLook(page, info, id, 'light');
    const p2 = await another(page);
    await monthLook(p2, info, id, 'dark');
    await p2.close();
  });
}
test('layout: a linha do mês já vencida ("Deste mês · vencido ✓", o rótulo mais comprido) também cabe', async ({ page }, info) => {
  test.setTimeout(60000);
  await monthLook(page, info, 'mtotal', 'dark', { done: true });
});
