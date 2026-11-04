// Maré — estado de partida dos testes de interface (usado por e2e.spec.js e e2e-friends.spec.js).
// Estado pronto, pulando o onboarding. É montado dentro do navegador para usar o fuso do aparelho emulado.
// Opções: todayMl, entries [[ml, bebida]], history [dias, ml por dia] (para ter litros acumulados), insignias { id: há quantos dias },
// rows [[dias atrás, [[hora, min, ml, bebida?], ...], meta?]] (dias com horários à escolha), profile, social, ui, last, medals (true = as 30 medalhas; ou uma lista
// de ids, como ['first', 's7']; ou { id: instante em ms } para escolher a data de cada uma), reminders, missions [dias atrás, ...] (as missões cumpridas nesses dias, às 20h).
export async function seed(page, o) {
  await page.addInitScript((opt) => {
    if (sessionStorage.getItem('mare:seeded')) return; // só na 1ª carga: recarregar mantém o que o teste fez
    sessionStorage.setItem('mare:seeded', '1');
    const p2 = (n) => (n < 10 ? '0' : '') + n, now = new Date(), days = {};
    const k = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    if (opt.todayMl) days[k] = { goal: 2800, entries: [{ id: 'seed', t: now.getTime() - 60000, ml: opt.todayMl, d: 'water' }] };
    if (opt.entries) days[k] = { goal: 2800, entries: opt.entries.map((e, i) => ({ id: 'seed' + i, t: now.getTime() - (opt.entries.length - i) * 60000, ml: e[0], d: e[1] })) };
    // history: [dias, ml por dia]: água dos dias anteriores, para ter litros acumulados (insígnias)
    if (opt.history) {
      for (let i = 1; i <= opt.history[0]; i++) {
        const d = new Date(now.getTime() - i * 864e5), dk = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
        days[dk] = { goal: 2800, entries: [{ id: 'h' + i, t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).getTime(), ml: opt.history[1], d: 'water' }] };
      }
    }
    // rows: [[dias atrás, [[hora, minuto, ml, bebida?], ...], meta?], ...]: dias passados com registros em horários à escolha (padrões, medalhas); meta = 2800 se não vier
    (opt.rows || []).forEach((r, j) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - r[0]), dk = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      days[dk] = { goal: r[2] || 2800, entries: r[1].map((e, i) => ({ id: 'r' + j + '-' + i, t: new Date(d.getFullYear(), d.getMonth(), d.getDate(), e[0], e[1]).getTime(), ml: e[2], d: e[3] || 'water' })) };
    });
    const mis = {}; // missões cumpridas: a chave é o dia e o valor é a hora em que foram cumpridas (20h)
    (opt.missions || []).forEach((n) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 20); mis[d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())] = d.getTime(); });
    const ins = {};
    Object.keys(opt.insignias || {}).forEach((id) => { ins[id] = now.getTime() - 864e5 * (1 + opt.insignias[id]); }); // valor = há quantos dias
    const ach = {}, every = ['first', 'goal', 's3', 's7', 's14', 's30', 'early', 'sunset', 'mission', 'm10', 'weekend', 'd10', 's60', 's100', 'd30', 'd100', 'm30', 'early7', 'sunset5', 'thirds7', 'win25', 'back', 'weekends4', 'wwd', 'm1', 'use100', 'summer', 'weekends12', 'oceans', 'crew'];
    if (opt.medals && typeof opt.medals === 'object' && !Array.isArray(opt.medals)) Object.keys(opt.medals).forEach((id) => { ach[id] = opt.medals[id]; }); // { id: instante em ms }
    else (opt.medals === true ? every : Array.isArray(opt.medals) ? opt.medals : []).forEach((id) => { ach[id] = 1; });
    localStorage.setItem('mare:v1', JSON.stringify({
      v: 1, onboarded: true, createdAt: now.getTime() - 10 * 864e5,
      profile: Object.assign({ name: 'Ana', weight: 70, activity: 'moderate', wake: '07:00', sleep: '23:00', unit: 'ml', theme: 'light' }, opt.profile || {}),
      goal: { mode: 'manual', manual: 2800, climate: false, bonus: 0, temp: null, day: '' },
      cups: [150, 250, 350, 500], last: opt.last || 'water', reminders: Object.assign({ enabled: false, interval: 90, smart: true, nextAt: 0 }, opt.reminders || {}),
      days: days, achievements: ach, missions: mis, insignias: ins, social: Object.assign({ on: false, nick: '', share: true, code: '' }, opt.social || {}),
      ui: Object.assign({ tip_install: 1, tip_climate: 1, tip_news12: 1, tip_news15: 1, tip_news16: 1, tip_news17: 1, tip_news18: 1, tip_account: 1 }, opt.ui || {}), // tip_account: 1 = a dica da conta (1.3.0) já foi dispensada; tip_news18: 1 = o cartão de novidades da turma (1.9.0) também (os testes do cartão passam tip_news18: 0; os de antes, 12 a 17, já não aparecem)
    }));
  }, o || {});
}
