// Vitest roda só os testes de lógica (tests/*.test.js). Os *.spec.js são do Playwright e os de tests/rules/ precisam do
// emulador do Firestore (npm run test:rules, que sobe tudo sozinho).
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/*.test.js'], environment: 'node' } });
