// Vitest roda só os testes de lógica; os *.spec.js são do Playwright
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.js'], environment: 'node' } });
