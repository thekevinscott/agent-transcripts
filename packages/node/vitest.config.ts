import { defineConfig } from 'vitest/config';

// Lives at the package root (not under src/) so the testing-conventions
// location check — which scans src/ — never treats it as an untested source
// file. Unit tests are colocated with their subject as `*.test.ts`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
