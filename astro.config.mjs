// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ccc-k-fujimura.github.io',
  base: '/learn-sql-from-browser',
  // sql のコードブロックはエディタに置き換えるので、ビルド時の色分けは要らない
  markdown: { syntaxHighlight: false },
  vite: {
    // PGlite は WASM とデータファイルを自分のモジュールの URL から読むので、事前バンドルから外す
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
    // PGlite が中で動的 import を使うので、Worker を ES モジュールとして出力する
    worker: { format: 'es' },
  },
});
