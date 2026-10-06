import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import { run } from './run';

const db = await PGlite.create();
const seed = 'CREATE TABLE books (id integer, title text); INSERT INTO books VALUES (1, \'こころ\'), (2, \'坊っちゃん\');';
const exec = (sql: string) => run(db, seed, sql);
const twoBooks = { ok: true, result: { fields: [{ name: 'count', type: 20 }], rows: [['2']] } };

test.each([
  ['BEGIN を残す', 'BEGIN; DELETE FROM books;'],
  ['テーブルを消す', 'DROP TABLE books;'],
  ['スキーマを消す', 'DROP SCHEMA public CASCADE;'],
  ['search_path を変える', 'SET search_path = nowhere;'],
  ['同じ名前の一時テーブルを作る', "CREATE TEMP TABLE books AS SELECT 'shadow' AS x;"],
])('学習者が %s と、次の実行は初期状態から始まる', async (_, sql) => {
  await exec(sql);
  expect(await exec('SELECT count(*) FROM books;')).toEqual(twoBooks);
});

test('複数の文を書くと、最後の文の結果を返す', async () => {
  expect(await exec('SELECT * FROM books; SELECT count(*) FROM books;')).toEqual(twoBooks);
});

test('同じ名前の列が 2 つあっても 1 つに潰れない', async () => {
  expect(await exec('SELECT id, id FROM books WHERE id = 1;')).toEqual({
    ok: true,
    result: { fields: [{ name: 'id', type: 23 }, { name: 'id', type: 23 }], rows: [['1', '1']] },
  });
});

test('値は PostgreSQL の文字列表現で受け取り、NULL と空文字を区別する', async () => {
  const res = await exec("SELECT NULL AS a, '' AS b, DATE '2024-01-01' AS c, 1.50 AS d, true AS e, current_setting('TimeZone') AS f;");
  expect(res.ok && res.result?.rows).toEqual([[null, '', '2024-01-01', '1.50', 't', 'Asia/Tokyo']]);
});

test('最後の文が結果の表を返さなければ、result は null になる', async () => {
  expect(await exec('SELECT * FROM books; DELETE FROM books;')).toEqual({ ok: true, result: null });
});

test('エラーのときは、メッセージ、SQLSTATE、位置、ヒントを返す', async () => {
  expect(await exec('SELECT titel FROM books;')).toEqual({
    ok: false,
    error: {
      message: 'column "titel" does not exist',
      code: '42703',
      position: 8,
      hint: 'Perhaps you meant to reference the column "books.title".',
    },
  });
});

// 本番ビルドではクラス名が短縮されるので、例外の型ではなく code の有無で見分ける
test('例外の型にかかわらず、code があれば SQL のエラー、なければ PGlite の失敗として返す', async () => {
  const failing = (e: unknown) => ({ exec: () => Promise.reject(e) }) as unknown as PGlite;
  expect(await run(failing({ message: 'column "x" does not exist', code: '42703', position: '8' }), seed, 'SELECT x;')).toEqual({
    ok: false,
    error: { message: 'column "x" does not exist', code: '42703', position: 8, hint: null },
  });
  expect(await run(failing(new Error('worker crashed')), seed, 'SELECT 1;')).toEqual({
    ok: false,
    error: { message: 'worker crashed', code: null, position: null, hint: null },
  });
});
