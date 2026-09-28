import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // SVG rendering needs a DOM; round-trip tests opt into the node environment.
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
