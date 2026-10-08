import { PGlite } from '@electric-sql/pglite';
import seed from '../data/intro/seed.sql?raw';
import { run, type WorkerMessage, type WorkerRequest } from './run';

// Worker から出す知らせは、型を付けたここだけから送る（メインスレッドの client.ts が受ける形と食い違わないように）
const post = (message: WorkerMessage) => postMessage(message);

// ponytail: 題材データは入門の版だけ。初級を作るときに、ページからレベルの版を渡す
let queue = PGlite.create();
queue.then(
  () => post({ type: 'ready' }),
  (e) => post({ type: 'fatal', message: String(e) }),
);

// 実行は 1 つずつ順に行い、リセットと学習者の SQL のあいだに別の実行を挟ませない
onmessage = ({ data: { id, sql } }: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async (db) => {
    post({ type: 'result', id, result: await run(db, seed, sql) });
    return db;
  });
};
