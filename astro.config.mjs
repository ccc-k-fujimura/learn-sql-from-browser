// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ccc-k-fujimura.github.io',
  base: '/learn-sql-from-browser',
  vite: {
    // PGlite は WASM とデータファイルを自分のモジュールの URL から読むので、事前バンドルから外す
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  },
});
