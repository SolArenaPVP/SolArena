import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  server: {
    port: 5190,
    // shared/ (types used by both the game and the server) sits next to app/.
    fs: { allow: ['..'] },
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
