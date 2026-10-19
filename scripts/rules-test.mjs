// Roda os testes das regras do Firestore (tests/rules/). Sobe sozinho um emulador local, roda e desliga.
//  • Padrão: "hidane", um emulador do Firestore sem Java que aplica as mesmas regras de segurança (vem no npm install).
//  • Quem já tem o emulador oficial (firebase emulators:start --only firestore) pode apontar para ele:
//      FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:rules
import { spawn } from 'node:child_process';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (n) => path.join(root, 'node_modules', '.bin', n + (process.platform === 'win32' ? '.cmd' : ''));
const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const waitPort = (port, ms) => new Promise((res, rej) => {
  const t0 = Date.now();
  (function tryOnce() {
    const c = net.connect(port, '127.0.0.1');
    c.on('connect', () => { c.destroy(); res(); });
    c.on('error', () => { c.destroy(); if (Date.now() - t0 > ms) rej(new Error('o emulador não abriu a porta ' + port)); else setTimeout(tryOnce, 150); });
  })();
});

let emu = null;
let host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) {
  if (!existsSync(bin('hidane'))) { console.error('hidane não encontrado: rode "npm install" primeiro.'); process.exit(1); }
  const port = await freePort();
  // sem variáveis de proxy: o tráfego é local
  const env = { PATH: process.env.PATH, HOME: process.env.HOME || process.env.USERPROFILE || '', SystemRoot: process.env.SystemRoot || '' };
  emu = spawn(bin('hidane'), ['--host', '127.0.0.1', '--port', String(port)], { env, stdio: 'ignore', shell: process.platform === 'win32' });
  emu.on('error', (e) => { console.error('Não consegui iniciar o emulador:', e.message); process.exit(1); });
  await waitPort(port, 15000);
  host = '127.0.0.1:' + port;
  console.log('Emulador do Firestore (hidane) em ' + host);
}
const stop = () => { if (emu && !emu.killed) emu.kill(); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const run = spawn(bin('vitest'), ['run', '--config', 'vitest.rules.config.js', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: { ...process.env, FIRESTORE_EMULATOR_HOST: host }, shell: process.platform === 'win32' });
run.on('exit', (code) => { stop(); process.exit(code === null ? 1 : code); });
