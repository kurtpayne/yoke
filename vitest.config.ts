import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

// Plugin to handle .txt imports as raw text (matching Wrangler's behavior)
function rawTextPlugin() {
  return {
    name: 'raw-text',
    transform(_code: string, id: string) {
      if (id.endsWith('.txt')) {
        const content = fs.readFileSync(id, 'utf-8');
        return {
          code: `export default ${JSON.stringify(content)};`,
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [rawTextPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@worker': path.resolve(__dirname, 'worker/src'),
    },
  },
});
