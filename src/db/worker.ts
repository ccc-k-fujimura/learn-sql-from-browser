import { PGlite } from '@electric-sql/pglite';
import seed from '../data/intro/seed.sql?raw';
import { run } from './run';

// ponytail: 題材データは入門の版だけ。初級を作るときに、ページからレベルの版を渡す
let queue = PGlite.create();
queue.then(
  () => postMessage({ type: 'ready' }),
  (e) => postMessage({ type: 'fatal', message: String(e) }),
);

// 実行は 1 つずつ順に行い、リセットと学習者の SQL のあいだに別の実行を挟ませない
onmessage = ({ data: { id, sql } }: MessageEvent<{ id: number; sql: string }>) => {
  queue = queue.then(async (db) => {
    postMessage({ id, ...(await run(db, seed, sql)) });
    return db;
  });
};
