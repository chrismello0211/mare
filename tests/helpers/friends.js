// Maré — apoio aos testes de interface dos amigos: troca js/firebase.js pela "nuvem de mentira" (fake-cloud.browser.js), que roda no
// navegador e imita o social-cloud.js em memória. window.__fake dá ao teste os controles (amigo novo, pedido, aceno, falhas…).
import { readFileSync } from 'node:fs';

const FAKE = readFileSync(new URL('./fake-cloud.browser.js', import.meta.url), 'utf8');

// uids de mentira (10 a 64 letras e números, como pedem as regras)
export const UID = {
  bia: 'biauid00000000000000000001', caio: 'caiouid0000000000000000002', duda: 'dudauid000000000000000003',
  edu: 'eduuid000000000000000000004', fe: 'feuid0000000000000000000005', gabi: 'gabiuid000000000000000006',
  hugo: 'hugouid000000000000000007', ze: 'zeuidzeuidzeuid0000000000001',
};

// Um grupo de amigos variado, para ver todos os estados do ranking: bateu a meta, no caminho, sem registros, progresso em pausa, ausente.
// gl = a meta em ml que a pessoa deixou aparecer (Duda não liberou); wm = os últimos 7 dias (bit 0 = hoje; Edu, em pausa, não manda; Fê parou há 4 dias).
// Com o Ana de 50% (1400 ml de 2800), o ranking de "Hoje" é: Bia 100%, Ana 50%, Caio 45%, Duda 0% e, fora da conta, Edu e Fê.
export const CREW = [
  { uid: UID.bia, prof: { nm: 'Bia', mc: 'tartaruga', ins: ['concha', 'estrela', 'baiacu', 'tartaruga'], pct: 100, met: true, st: 12, gl: 2800, wm: 127 } },
  { uid: UID.caio, prof: { nm: 'Caio', mc: 'estrela', ins: ['concha', 'estrela'], pct: 45, st: 3, gl: 3200, wm: 0b0111011 } },
  { uid: UID.duda, prof: { nm: 'Duda', mc: 'cavalo', ins: ['concha', 'estrela', 'baiacu', 'tartaruga', 'cavalo'], pct: 0, st: 0, wm: 0 } },
  { uid: UID.edu, prof: { nm: 'Edu', mc: 'concha', ins: ['concha'], pct: null, sh: false, st: 0, wm: null } },
  { uid: UID.fe, prof: { nm: 'Fê', mc: 'baiacu', ins: ['concha', 'estrela', 'baiacu'], pct: 30, st: 5, ago: 4, wm: 127 } },
];

// seed = { friends: [{uid, prof, pair}], reqIn: [{uid, prof}], code, codes, nextCode, startErr, cache, initFail }
export async function stubFriendsCloud(page, seed) {
  await page.addInitScript((s) => { window.__fakeSeed = s; }, seed || {});
  await page.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: 'export const FIREBASE_ENABLED = true; export const firebaseConfig = {}; export const VAPID_KEY = ""; export const USE_EMULATORS = false;' }));
  await page.route('**/js/firebase.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
}

// Atalho para o estado "já uso os amigos neste aparelho"
export const SOCIAL_ON = { on: true, nick: 'Ana', share: true, code: 'ABCD2345' };
