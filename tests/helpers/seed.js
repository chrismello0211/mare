// Maré — estado de partida dos testes de interface (usado por e2e.spec.js e e2e-friends.spec.js).
// Estado pronto, pulando o onboarding. É montado dentro do navegador para usar o fuso do aparelho emulado.
// Opções: todayMl, entries [[ml, bebida]], history [dias, ml por dia] (para ter litros acumulados), insignias { id: há quantos dias },
// profile, social, ui, last, medals.
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
    const ins = {};
    Object.keys(opt.insignias || {}).forEach((id) => { ins[id] = now.getTime() - 864e5 * (1 + opt.insignias[id]); }); // valor = há quantos dias
    localStorage.setItem('mare:v1', JSON.stringify({
      v: 1, onboarded: true, createdAt: now.getTime() - 10 * 864e5,
      profile: Object.assign({ name: 'Ana', weight: 70, activity: 'moderate', wake: '07:00', sleep: '23:00', unit: 'ml', theme: 'light' }, opt.profile || {}),
      goal: { mode: 'manual', manual: 2800, climate: false, bonus: 0, temp: null, day: '' },
      cups: [150, 250, 350, 500], last: opt.last || 'water', reminders: { enabled: false, interval: 90, smart: true, nextAt: 0 },
      days: days, achievements: opt.medals ? { first: 1, goal: 1, s3: 1, s7: 1, s14: 1, s30: 1, early: 1, sunset: 1, mission: 1, m10: 1, weekend: 1, d10: 1 } : {}, missions: {}, insignias: ins, social: Object.assign({ on: false, nick: '', share: true, code: '' }, opt.social || {}),
      ui: Object.assign({ tip_install: 1, tip_climate: 1, tip_news: 1 }, opt.ui || {}),
    }));
  }, o || {});
}
