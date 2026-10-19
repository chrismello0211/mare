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

// Um grupo de amigos variado, para ver todos os estados da lista: bateu a meta, no caminho, sem registros, progresso em pausa, ausente.
export const CREW = [
  { uid: UID.bia, prof: { nm: 'Bia', mc: 'tartaruga', ins: ['concha', 'estrela', 'baiacu', 'tartaruga'], pct: 100, met: true, st: 12 } },
  { uid: UID.caio, prof: { nm: 'Caio', mc: 'estrela', ins: ['concha', 'estrela'], pct: 45, st: 3 } },
  { uid: UID.duda, prof: { nm: 'Duda', mc: 'cavalo', ins: ['concha', 'estrela', 'baiacu', 'tartaruga', 'cavalo'], pct: 0, st: 0 } },
  { uid: UID.edu, prof: { nm: 'Edu', mc: 'concha', ins: ['concha'], pct: null, sh: false, st: 0 } },
  { uid: UID.fe, prof: { nm: 'Fê', mc: 'baiacu', ins: ['concha', 'estrela', 'baiacu'], pct: 30, st: 5, ago: 4 } },
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
