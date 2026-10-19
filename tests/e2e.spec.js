// Maré — testes de interface (Parte 5). Rodar: npm run test:e2e
// Cada teste roda em todos os aparelhos do playwright.config.js. Qualquer erro de JavaScript na página reprova.
import { test, expect } from '@playwright/test';
import { seed } from './helpers/seed.js';

let errors = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); });
});
test.afterEach(() => { expect(errors, 'erros de JavaScript na página').toEqual([]); });

const tab = (page, name) => page.locator('#tabbar').getByRole('button', { name: name, exact: true });
const cup = (page, label) => page.getByRole('button', { name: 'Adicionar ' + label, exact: true });

test('onboarding completo, primeiro registro e desfazer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  await page.locator('#obName').fill('Ana');
  await page.locator('#obWeight').fill('72,5');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('radio', { name: /Ativo/ }).click();
  await page.getByRole('button', { name: 'Voltar' }).click(); // volta e confere que o peso ficou guardado
  await expect(page.locator('#obWeight')).toHaveValue('72,5');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Ativo/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); // atividade
  await page.getByRole('button', { name: 'Continuar', exact: true }).click(); // horários
  await expect(page.locator('#obGoal')).toHaveText('3,3 L'); // 72,5 × 35 + 700, arredondado: 3.250 ml
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click(); // depende do suporte a notificação
  await expect(page.locator('.h1')).toContainText('Ana');
  await expect(page.locator('#tabbar')).toBeVisible();
  await cup(page, '250 ml').click();
  await expect(page.locator('#toast')).toContainText('+250 ml de água');
  await expect(page.locator('#drop svg')).toHaveAttribute('aria-label', /^250 ml de 3\.250 ml/);
  await expect(page.locator('#tLog')).toContainText('1 registro');
  await page.locator('#toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('#tLog')).toContainText('Nada por aqui ainda');
});

test('histórico: registro retroativo, edição e exclusão', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await tab(page, 'Histórico').click();
  await page.getByRole('button', { name: /^Ontem:/ }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.locator('#sheetTitle')).toHaveText('Ontem');
  await sheet.getByRole('button', { name: '+ Adicionar registro' }).click();
  await page.locator('#eMl').fill('500');
  await page.locator('#eTime').fill('10:00');
  await sheet.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(sheet.locator('.day-sum b')).toHaveText('500 ml');
  await sheet.locator('.log-item').first().click();
  await page.locator('#eMl').fill('300');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet.locator('.day-sum b')).toHaveText('300 ml');
  await sheet.locator('.log-item').first().click();
  await sheet.getByRole('button', { name: 'Excluir' }).click();
  await expect(sheet).toContainText('Nenhum registro neste dia.');
  await expect(page.locator('#toast')).toContainText('Registro excluído');
});

test('bater a meta mostra a comemoração', async ({ page }) => {
  await seed(page, { todayMl: 2550 });
  await page.goto('/');
  await cup(page, '250 ml').click();
  await expect(page.locator('.medal-pop')).toContainText('Você bateu a meta!');
  await expect(page.locator('#tMeta .pace')).toContainText('Meta batida');
});

test('ajustes: onças e tema escuro', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await tab(page, 'Ajustes').click();
  await page.getByRole('radio', { name: 'Onças (oz)' }).click();
  await page.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await tab(page, 'Hoje').click();
  await expect(cup(page, '8 oz')).toBeVisible();
});

/* ---------- insígnias (bichinhos do mar) ---------- */
const sheetOf = (page) => page.locator('#sheetBody');
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));

test('jornada: insígnia atual, recife com silhuetas e o painel de cada bichinho', async ({ page }) => {
  await seed(page, { history: [26, 2500], insignias: { concha: 30, estrela: 20, baiacu: 10, tartaruga: 3 } }); // 65 L de água
  await page.goto('/');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.level .lv-n')).toHaveText('Tartaruga-marinha');
  await expect(page.locator('.level .lv-k')).toHaveText('Insígnia 4 de 10');
  await expect(page.locator('.level .lv-s')).toContainText('Faltam 35 L para Cavalo-marinho');
  await expect(page.locator('.level .lv-s')).toContainText('65 L de água');
  await expect(page.locator('.reef .rf')).toHaveCount(10);
  await expect(page.locator('.reef .rf.off')).toHaveCount(6);
  // bloqueada: o nome aparece, o bichinho é uma silhueta e a curiosidade fica escondida
  await page.getByRole('button', { name: /^Cavalo-marinho, bloqueada, desbloqueia com 100 L/ }).click();
  const sheet = sheetOf(page);
  await expect(sheet.locator('#sheetTitle')).toHaveText('Cavalo-marinho');
  await expect(sheet).toContainText('Chega aos 100 L de água. Faltam 35 L.');
  await expect(sheet.locator('.bdg.lock')).toBeVisible();
  await expect(sheet.locator('.fact.off')).toContainText('Beba mais um pouquinho');
  await expect(sheet).not.toContainText('papai quem carrega'); // a curiosidade só vem com a insígnia
  await sheet.locator('.btns').getByRole('button', { name: 'Fechar' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  // conquistada: curiosidade e "usar como mascote"
  await page.getByRole('button', { name: /^Tartaruga-marinha, conquistada em/ }).click();
  await expect(sheet.locator('#sheetTitle')).toHaveText('Tartaruga-marinha');
  await expect(sheet.locator('.fact')).toContainText('Muitas tartarugas-marinhas voltam');
  await expect(sheet.locator('.bdg.lock')).toHaveCount(0);
});

test('mascote: escolher outra insígnia conquistada muda o destaque no recife e fica salvo', async ({ page }) => {
  await seed(page, { history: [26, 2500], insignias: { concha: 30, estrela: 20, baiacu: 10, tartaruga: 3 } });
  await page.goto('/');
  await tab(page, 'Jornada').click();
  await expect(page.locator('.rf.cur')).toContainText('Tartaruga-marinha'); // sem escolha: a mais alta
  await page.getByRole('button', { name: /^Baiacu, conquistada/ }).click();
  await sheetOf(page).getByRole('button', { name: 'Usar como meu mascote' }).click();
  await expect(page.locator('#toast')).toContainText('Mascote trocado');
  await expect(sheetOf(page).getByRole('button', { name: '✓ É o seu mascote' })).toBeVisible();
  await sheetOf(page).getByRole('button', { name: '✓ É o seu mascote' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('.rf.cur')).toContainText('Baiacu');
  expect((await stored(page)).profile.mascot).toBe('baiacu');
});

test('desbloquear: cruzar um marco comemora uma única vez e a insígnia fica para sempre', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page, { history: [3, 3300], insignias: { concha: 5 }, medals: true }); // 9,9 L: falta pouco para a estrela-do-mar (10 L)
  await page.goto('/');
  await cup(page, '250 ml').click(); // 10,15 L
  await expect(sheetOf(page).locator('#sheetTitle')).toHaveText('Nova insígnia!', { timeout: 9000 });
  await expect(sheetOf(page)).toContainText('Estrela-do-mar');
  await expect(sheetOf(page)).toContainText('Você sabia?');
  await expect(sheetOf(page).locator('.bdg.lock')).toHaveCount(0);
  await sheetOf(page).getByRole('button', { name: 'Que legal!' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  let st = await stored(page);
  expect(typeof st.insignias.estrela).toBe('number');
  expect(st.ui.unseenIns).toEqual([]);
  // apagar o registro e registrar de novo não repete a festa; recarregar também não
  await page.locator('#tLog .log-item').first().click();
  await sheetOf(page).getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator('#tLog')).toContainText('Nada por aqui ainda');
  await cup(page, '250 ml').click();
  await page.waitForTimeout(3200);
  await expect(page.locator('#sheet')).toBeHidden();
  await page.reload();
  await page.waitForTimeout(3200);
  await expect(page.locator('#sheet')).toBeHidden();
  st = await stored(page);
  expect(Object.keys(st.insignias).sort()).toEqual(['concha', 'estrela']);
});

test('desbloquear: o registro manual fecha o painel dele e só depois vem a comemoração', async ({ page }) => {
  await seed(page, { history: [3, 3300], insignias: { concha: 5 }, medals: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  await page.locator('#eMl').fill('300');
  await sheetOf(page).getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(sheetOf(page).locator('#sheetTitle')).toHaveText('Nova insígnia!', { timeout: 9000 });
  await expect(sheetOf(page)).toContainText('Estrela-do-mar');
  // o botão "Ver meu recife" leva à Jornada e fecha o painel
  await sheetOf(page).getByRole('button', { name: 'Ver meu recife' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(tab(page, 'Jornada')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.level .lv-n')).toHaveText('Estrela-do-mar');
});

test('desbloquear: o fundo do painel e o "voltar" também contam como "visto"', async ({ page }) => {
  await seed(page, { history: [3, 3300], insignias: { concha: 5 }, medals: true });
  await page.goto('/');
  await cup(page, '250 ml').click();
  await expect(sheetOf(page).locator('#sheetTitle')).toHaveText('Nova insígnia!', { timeout: 9000 });
  await page.evaluate(() => { history.back(); }); // botão voltar do Android
  await expect(page.locator('#sheet')).toBeHidden();
  expect((await stored(page)).ui.unseenIns).toEqual([]);
  await page.waitForTimeout(3000);
  await expect(page.locator('#sheet')).toBeHidden(); // não volta a aparecer
});

test('quem já usava o Maré ganha as insígnias de uma vez e só a mais alta é comemorada', async ({ page }) => {
  await seed(page, { history: [26, 2500], ui: { tip_news: 0 }, medals: true }); // 65 L e nenhuma insígnia guardada (estado da versão 1.0.x)
  await page.goto('/');
  await expect(page.locator('#tTips')).toContainText('Novidades no Maré');
  await expect(sheetOf(page).locator('#sheetTitle')).toHaveText('Nova insígnia!', { timeout: 9000 });
  await expect(sheetOf(page)).toContainText('Tartaruga-marinha');
  await sheetOf(page).getByRole('button', { name: 'Que legal!' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  const st = await stored(page);
  expect(Object.keys(st.insignias).sort()).toEqual(['baiacu', 'concha', 'estrela', 'tartaruga']);
  Object.keys(st.insignias).forEach((id) => { expect(st.insignias[id], id).toBeLessThanOrEqual(Date.now()); });
  expect(st.ui.unseenIns).toEqual([]);
  // a dica de novidades abre o painel e some em seguida
  await page.locator('#tTips').getByRole('button', { name: 'Ver as novidades' }).click();
  await expect(sheetOf(page).locator('#sheetTitle')).toHaveText('Novidades do Maré');
  await expect(sheetOf(page)).toContainText('Insígnias do mar');
  await expect(sheetOf(page)).toContainText('Você já tem 4 de 10');
  await sheetOf(page).getByRole('button', { name: 'Depois' }).click();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
});

test('quem está começando agora ganha a concha de presente, sem festa nem dica de novidades', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click();
  await expect(page.locator('#tabbar')).toBeVisible();
  await expect(page.locator('#tTips')).not.toContainText('Novidades no Maré');
  await page.waitForTimeout(2500);
  await expect(page.locator('#sheet')).toBeHidden();
  await cup(page, '250 ml').click();
  await page.waitForTimeout(2500);
  await expect(page.locator('#sheet')).toBeHidden(); // a concha (0 L) nunca é comemorada
  const st = await stored(page);
  expect(Object.keys(st.insignias)).toEqual(['concha']);
  await tab(page, 'Jornada').click();
  await expect(page.locator('.level .lv-n')).toHaveText('Concha');
  await expect(page.locator('.reef .rf:not(.off)')).toHaveCount(1);
});

test('backup antigo (sem insígnias): restaura, concede em silêncio e não deixa o backup ligar os amigos', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const days = {};
  const now = Date.now(), p2 = (n) => (n < 10 ? '0' : '') + n;
  for (let i = 1; i <= 26; i++) {
    const d = new Date(now - i * 864e5), k = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    days[k] = { goal: 2800, entries: [{ id: 'b' + i, t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).getTime(), ml: 2500, d: 'water' }] };
  }
  const backup = { app: 'mare', v: 1, data: { v: 1, onboarded: true, profile: { name: 'Bia', weight: 60, theme: 'light', mascot: 'dragao' }, days: days,
    insignias: { fantasma: 1, estrela: 'x' }, social: { on: true, nick: 'Invasor', share: true, code: 'ABCD2345' } } };
  await tab(page, 'Ajustes').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar' }).click()]);
  await chooser.setFiles({ name: 'mare-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await sheetOf(page).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.locator('#toast')).toContainText('Backup restaurado');
  await page.waitForTimeout(3000);
  await expect(page.locator('#sheet')).toBeHidden(); // concessão silenciosa
  const st = await stored(page);
  expect(Object.keys(st.insignias).sort()).toEqual(['baiacu', 'concha', 'estrela', 'tartaruga']); // 65 L; ids inventados e valores ruins caíram
  expect(st.profile.mascot).toBe('');
  expect(st.social).toEqual({ on: false, nick: '', share: true, code: '', push: true }); // amigos são deste aparelho (e a chave de avisos nasce ligada)
});

test('insígnias: a arte cabe no medalhão e a silhueta da bloqueada funciona', async ({ page }) => {
  await seed(page, { history: [30, 2500], insignias: { concha: 90, estrela: 80, baiacu: 70, tartaruga: 60, cavalo: 50 } }); // 75 L
  await page.goto('/');
  await tab(page, 'Jornada').click();
  const geo = await page.evaluate(() => [].slice.call(document.querySelectorAll('.reef .rf')).map((rf) => {
    const g = rf.querySelector('svg > g.cr'), b = g.getBBox(), lock = rf.classList.contains('off');
    const fills = [].slice.call(g.querySelectorAll('[fill]:not([fill="none"])')).map((e) => getComputedStyle(e).fill);
    return { name: rf.querySelector('b').textContent, x: b.x, y: b.y, r: b.x + b.width, bt: b.y + b.height, lock: lock, fills: fills.filter((f, i, a) => a.indexOf(f) === i).length,
      face: getComputedStyle(g.querySelector('.fc')).display };
  }));
  expect(geo.length).toBe(10);
  geo.forEach((x) => {
    expect(x.x, x.name + ' passa da esquerda').toBeGreaterThanOrEqual(-1);
    expect(x.y, x.name + ' passa do topo').toBeGreaterThanOrEqual(-1);
    expect(x.r, x.name + ' passa da direita').toBeLessThanOrEqual(101);
    expect(x.bt, x.name + ' passa da base').toBeLessThanOrEqual(101);
    if (x.lock) { expect(x.fills, x.name + ' bloqueada tem uma cor só').toBe(1); expect(x.face).toBe('none'); } else { expect(x.fills, x.name).toBeGreaterThan(1); expect(x.face).not.toBe('none'); }
  });
});

test('voltar do Android fecha o painel e depois volta para Hoje', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.evaluate(() => { history.back(); });
  await expect(page.locator('#sheet')).toBeHidden();
  await tab(page, 'Jornada').click();
  await expect(page.getByRole('heading', { name: 'Jornada' })).toBeVisible();
  await page.evaluate(() => { history.back(); });
  await expect(tab(page, 'Hoje')).toHaveAttribute('aria-current', 'page');
});

test('atalho do ícone ?add=250 registra e limpa o endereço', async ({ page }) => {
  await seed(page);
  await page.goto('/?add=250');
  await expect(page.locator('#tLog')).toContainText('1 registro');
  await expect(page).toHaveURL(/\/$/);
});

test('layout: sem rolagem lateral, alvos de toque confortáveis e screenshots', async ({ page }, info) => {
  await seed(page, { todayMl: 1200 });
  await page.goto('/');
  for (const name of ['Hoje', 'Histórico', 'Jornada', 'Amigos', 'Ajustes']) {
    await tab(page, name).click();
    await page.waitForTimeout(700); // animações de entrada
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, 'rolagem lateral em ' + name).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'test-results/shots/' + info.project.name + ' - ' + name + '.png', fullPage: true });
  }
  expect(await page.$$eval('#tabbar .tab', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0);
  await tab(page, 'Hoje').click();
  expect(await page.$$eval('.cup', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length)).toBe(0);
  // segunda gota: dentro da tela, à direita da parte mais larga da gota principal e com área de toque confortável
  const g = await page.evaluate(() => {
    const b = document.querySelector('#drop2btn').getBoundingClientRect(), m = document.querySelector('#drop').getBoundingClientRect();
    return { left: b.left, right: b.right, w: b.width, h: b.height, iw: window.innerWidth, edge: m.left + m.width / 2 + m.width * 0.41 };
  });
  expect(g.right, 'segunda gota passa da borda da tela').toBeLessThanOrEqual(g.iw - 2);
  expect(g.left, 'segunda gota encosta na gota principal').toBeGreaterThanOrEqual(g.edge + 2);
  expect(g.w).toBeGreaterThanOrEqual(44);
  expect(g.h).toBeGreaterThanOrEqual(44);
});

// Segunda gota: café, chá, suco etc. ficam numa contagem à parte e não entram na meta de água
const mainLabel = (page) => page.locator('#drop svg');
const other = (page) => page.locator('#drop2 .t-num').first();

test('outros líquidos: registro à parte, sem mexer na meta de água', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^0 ml de 2\.800 ml/);
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.locator('#sheetTitle')).toHaveText('Outros líquidos');
  await expect(sheet.getByRole('radio')).toHaveCount(6); // coco, chá, café, suco, leite, isotônico
  await sheet.getByRole('radio', { name: /Chá/ }).click();
  await expect(sheet.getByRole('radio', { name: /Chá/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Adicionar 150 ml de chá' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('+150 ml de chá');
  await expect(page.locator('#toast')).toContainText('à parte');
  await expect(other(page)).toHaveText('150', { timeout: 6000 });
  await expect(page.getByRole('button', { name: /^Outros líquidos: 150 ml hoje/ })).toBeVisible();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^0 ml de 2\.800 ml/); // a água não mexeu
  await expect(page.locator('#tLog')).toContainText('Chá');
  await expect(page.locator('#tLog')).toContainText('outros líquidos');
  await page.locator('#toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('#tLog')).toContainText('Nada por aqui ainda');
  await expect(other(page)).toHaveText('0', { timeout: 6000 });
});

test('água com gás conta na meta, como a água comum', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('radio', { name: /Com gás/ }).click();
  await expect(page.getByRole('radio', { name: /Com gás/ })).toHaveAttribute('aria-checked', 'true');
  await cup(page, '250 ml').click();
  await expect(page.locator('#toast')).toContainText('+250 ml de água com gás');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^250 ml de 2\.800 ml/);
  await expect(other(page)).toHaveText('0');
});

test('registro com data e hora: o editor separa água de outros líquidos', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.getByRole('button', { name: /Água$/ })).toBeVisible();
  await expect(sheet.locator('#eNote')).toHaveText('');
  await sheet.getByRole('button', { name: /Café/ }).click();
  await expect(sheet.locator('#eNote')).toContainText('não entram na meta de água');
  await page.locator('#eMl').fill('120');
  await sheet.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.locator('#tLog')).toContainText('Café');
  await expect(other(page)).toHaveText('120', { timeout: 6000 });
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^0 ml de 2\.800 ml/);
});

test('ajustes: esconder e mostrar a segunda gota', async ({ page }) => {
  await seed(page, { entries: [[500, 'water'], [200, 'coffee']] });
  await page.goto('/');
  await expect(page.locator('#drop2')).toBeVisible();
  await expect(page.locator('#tLog')).toContainText('2 registros');
  await tab(page, 'Ajustes').click();
  const sw = page.getByRole('switch', { name: 'Registrar outros líquidos' });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await tab(page, 'Hoje').click();
  await expect(page.locator('#drop2')).toHaveCount(0);
  await expect(page.locator('#tLog')).toContainText('1 registro'); // o café fica guardado, mas escondido
  await expect(page.locator('#tLog')).not.toContainText('Café');
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  await expect(page.locator('#sheetBody').getByRole('button', { name: /Café/ })).toHaveCount(0);
  await page.locator('#sheetBody').getByRole('button', { name: 'Cancelar' }).click();
  await tab(page, 'Ajustes').click();
  await page.getByRole('switch', { name: 'Registrar outros líquidos' }).click();
  await tab(page, 'Hoje').click();
  await expect(page.locator('#drop2')).toBeVisible();
  await expect(page.locator('#tLog')).toContainText('2 registros');
  await expect(other(page)).toHaveText('200', { timeout: 6000 });
});

test('dados antigos: refrigerante e álcool saem; café vira "outros líquidos"', async ({ page }) => {
  await seed(page, { entries: [[500, 'water'], [350, 'soda'], [300, 'alcohol'], [100, 'coffee']], last: 'coffee' });
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^500 ml de 2\.800 ml/); // nem o refri nem o álcool viram "água"
  await expect(other(page)).toHaveText('100', { timeout: 6000 });
  await expect(page.locator('#tLog')).toContainText('2 registros');
  await expect(page.locator('#tLog')).not.toContainText('Refrigerante');
  await expect(page.locator('#tLog')).not.toContainText('alcoólica');
  await expect(page.getByRole('radio', { name: /^💧/ })).toHaveAttribute('aria-checked', 'true'); // copos rápidos voltam para a água
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  await expect(page.locator('#sheetBody').getByRole('radio', { name: /Café/ })).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => { history.back(); });
  await expect(page.locator('#sheet')).toBeHidden();
  // o app só regrava o aparelho quando algo muda: ao registrar um copo, o que ficou salvo já vem limpo
  await cup(page, '250 ml').click();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^750 ml de 2\.800 ml/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
  expect(saved.last).toBe('water');
  expect(saved.lastO).toBe('coffee');
  const tipos = [];
  Object.keys(saved.days).forEach((k) => { saved.days[k].entries.forEach((e) => { tipos.push(e.d); }); });
  expect(tipos.sort()).toEqual(['coffee', 'water', 'water']);
});

// "Somar outros líquidos na meta": opcional, discreto (só em Ajustes) e desligado de fábrica. Ligado, café, chá etc. contam na
// meta até metade dela (a trava: pelo menos metade da meta tem de vir da água). A seed usa meta de 2.800 ml: limite = 1.400 ml.
test('somar outros líquidos na meta: opcional, só em Ajustes e desligado de fábrica', async ({ page }) => {
  await seed(page, { entries: [[1000, 'water'], [500, 'coffee']] });
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^1\.000 ml de 2\.800 ml/);
  await expect(page.getByRole('button', { name: /^Outros líquidos: 500 ml hoje/ })).toBeVisible();
  await tab(page, 'Ajustes').click();
  const mix = page.getByRole('switch', { name: 'Somar outros líquidos na meta' });
  await expect(mix).toHaveAttribute('aria-checked', 'false');
  await mix.click();
  await expect(mix).toHaveAttribute('aria-checked', 'true');
  await tab(page, 'Hoje').click();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^1\.500 ml de 2\.800 ml/); // o café entrou na meta
  await expect(page.getByRole('button', { name: /^Outros líquidos: 500 ml hoje/ })).toBeVisible(); // a segunda gota continua mostrando tudo
  await tab(page, 'Ajustes').click();
  await mix.click();
  await expect(mix).toHaveAttribute('aria-checked', 'false');
  await tab(page, 'Hoje').click();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^1\.000 ml de 2\.800 ml/); // desligar devolve a conta só de água
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mare:v1')));
  expect(saved.profile.mix).toBe(false);
  expect(Object.keys(saved.days).map((k) => saved.days[k].entries.length)).toEqual([2]); // os registros nunca são mexidos
});

test('somar outros líquidos na meta: conta até metade da meta e avisa a cada registro', async ({ page }) => {
  await seed(page, { entries: [[1000, 'water'], [1000, 'coffee']], profile: { mix: true } });
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^2\.000 ml de 2\.800 ml/);
  const add = async (ml) => {
    await page.getByRole('button', { name: /^Outros líquidos/ }).click();
    const sheet = page.locator('#sheetBody');
    await sheet.getByRole('radio', { name: /Café/ }).click();
    await sheet.getByRole('button', { name: 'Adicionar ' + ml + ' ml de café' }).click();
    await expect(page.locator('#sheet')).toBeHidden();
  };
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  await expect(page.locator('#sheetBody')).toContainText('somam na meta, até metade dela');
  await page.evaluate(() => { history.back(); });
  await expect(page.locator('#sheet')).toBeHidden();
  await add(250); // 1.000 → 1.250 de café: ainda cabe nos 1.400
  await expect(page.locator('#toast')).toContainText('soma na meta');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^2\.250 ml de 2\.800 ml/);
  await add(500); // 1.750 de café: só 150 ml cabem
  await expect(page.locator('#toast')).toContainText('soma só 150 ml (limite de metade da meta)');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^2\.400 ml de 2\.800 ml/);
  await add(250); // já no limite
  await expect(page.locator('#toast')).toContainText('já no limite de metade da meta');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^2\.400 ml de 2\.800 ml/);
  await expect(page.getByRole('button', { name: /^Outros líquidos: 2\.000 ml hoje/ })).toBeVisible(); // tudo o que foi registrado
  await tab(page, 'Histórico').click();
  await page.locator('.cal-d.today').click();
  const oth = page.locator('#sheetBody .day-oth');
  await expect(oth).toContainText('Inclui 1.400 ml de outros líquidos');
  await expect(oth).toContainText('o limite é metade da meta; você registrou 2.000 ml');
  await expect(page.locator('#sheetBody .day-sum b')).toHaveText('2.400 ml');
});

test('somar outros líquidos na meta: completar a meta com café comemora, sem passar de metade', async ({ page }) => {
  await seed(page, { entries: [[1400, 'water'], [1300, 'coffee']], profile: { mix: true } }); // 1.400 + 1.300 = 2.700
  await page.goto('/');
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^2\.700 ml de 2\.800 ml/);
  await page.getByRole('button', { name: /^Outros líquidos/ }).click();
  const sheet = page.locator('#sheetBody');
  await sheet.getByRole('radio', { name: /Café/ }).click();
  await sheet.getByRole('button', { name: 'Adicionar 150 ml de café' }).click(); // 1.450 → só 100 ml cabem: 2.800 = meta
  await expect(page.locator('.medal-pop')).toContainText('Você bateu a meta!');
  await expect(page.locator('#toast')).toContainText('soma só 100 ml (limite de metade da meta)');
});

test('somar outros líquidos na meta: sem a segunda gota, o interruptor some e a soma não vale', async ({ page }) => {
  await seed(page, { entries: [[1000, 'water'], [500, 'coffee']], profile: { others: false, mix: true } });
  await page.goto('/');
  await expect(page.locator('#drop2')).toHaveCount(0);
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^1\.000 ml de 2\.800 ml/);
  await tab(page, 'Ajustes').click();
  await expect(page.getByRole('switch', { name: 'Somar outros líquidos na meta' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Registrar outros líquidos' }).click();
  await expect(page.getByRole('switch', { name: 'Somar outros líquidos na meta' })).toHaveAttribute('aria-checked', 'true');
  await tab(page, 'Hoje').click();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^1\.500 ml de 2\.800 ml/); // a preferência voltou junto
});

test('somar outros líquidos na meta: o editor de registro explica a regra em vigor', async ({ page }) => {
  await seed(page, { profile: { mix: true } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Outro volume ou horário' }).click();
  const sheet = page.locator('#sheetBody');
  await sheet.getByRole('button', { name: /Café/ }).click();
  await expect(sheet.locator('#eNote')).toHaveText('Outros líquidos somam na meta, até metade dela.');
  await page.locator('#eMl').fill('300');
  await sheet.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(mainLabel(page)).toHaveAttribute('aria-label', /^300 ml de 2\.800 ml/);
});

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });
  test('registra sem a animação da gota caindo', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await cup(page, '250 ml').click();
    await expect(page.locator('#tLog')).toContainText('1 registro');
    await expect(page.locator('.fx-drop')).toHaveCount(0);
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('abre sem internet depois da primeira visita', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service Worker testado no Chromium');
    await seed(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#drop')).toBeVisible();
    await context.setOffline(false);
  });

  // No github.io vários apps dividem a mesma origem e alguns Service Workers apagam todos os caches que não são deles
  test('refaz o cache se outro app da mesma origem o apagar', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Service Worker testado no Chromium');
    await seed(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
    await page.reload(); // online: abre pela rede e refaz o cache em segundo plano
    await expect(page.locator('#drop')).toBeVisible();
    await expect.poll(() => page.evaluate(() => caches.match(new URL('./', location.href).href).then(Boolean))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#drop')).toBeVisible();
    await context.setOffline(false);
  });
});

// A nuvem (login anônimo + documento no Firestore) só deve ligar depois do onboarding: quem apenas abre a tela de
// boas-vindas (ou um robô) não cria conta nem documento. Os módulos do Firebase são trocados por stubs.
async function stubCloud(page) {
  await page.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: 'export const FIREBASE_ENABLED = true; export const firebaseConfig = {}; export const VAPID_KEY = ""; export const USE_EMULATORS = false;' }));
  await page.route('**/js/firebase.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: 'export async function initCloud() { window.__cloudInit = (window.__cloudInit || 0) + 1; return { push: false, syncDays() {}, syncMeta() {}, enablePush: async () => { window.__pushEnabled = (window.__pushEnabled || 0) + 1; return true; }, wipe: async () => {} }; }' }));
}
const cloudInits = (page) => page.evaluate(() => window.__cloudInit || 0);

test('a nuvem só liga depois do onboarding', async ({ page }) => {
  await stubCloud(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Beba água no seu ritmo' })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await cloudInits(page)).toBe(0);
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click(); // perfil, atividade, horários
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  expect(await cloudInits(page)).toBe(0); // ainda no onboarding
  await page.getByRole('button', { name: /Agora não|Começar a usar/ }).click();
  await expect(page.locator('#tabbar')).toBeVisible();
  await expect.poll(() => cloudInits(page)).toBe(1);
});

test('com o app já configurado, a nuvem liga na abertura', async ({ page }) => {
  await stubCloud(page);
  await seed(page);
  await page.goto('/');
  await expect(page.locator('#drop')).toBeVisible();
  await expect.poll(() => cloudInits(page)).toBe(1);
});

test('lembretes ativados no onboarding registram o push quando a nuvem liga', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'permissão de notificação simulada só no Chromium');
  await context.grantPermissions(['notifications']);
  await stubCloud(page);
  await page.goto('/');
  test.skip(/iPhone|iPad/.test(await page.evaluate(() => navigator.userAgent)), 'no iOS as notificações exigem o app instalado');
  await page.getByRole('button', { name: 'Começar', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Perfeito, continuar' }).click();
  await page.getByRole('button', { name: 'Ativar lembretes' }).click();
  await expect(page.locator('#tabbar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__pushEnabled || 0)).toBe(1);
});
