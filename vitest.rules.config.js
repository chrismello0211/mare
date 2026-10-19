// Testes que falam com o emulador do Firestore (regras de segurança e camada de amigos). Use: npm run test:rules
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/rules/*.test.js'], environment: 'node', testTimeout: 30000, hookTimeout: 30000, fileParallelism: false } });
