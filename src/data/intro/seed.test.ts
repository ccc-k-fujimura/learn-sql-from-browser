import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import seed from './seed.sql?raw';

const db = await PGlite.create();
await db.exec(seed);
const count = async (sql: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) t`)).rows[0]!.n;
const countBooks = (where: string) => count(`SELECT * FROM books WHERE ${where}`);

test('id が 1〜30 の 30 冊がある', async () => {
  expect(await countBooks('true')).toBe(30);
  expect(await countBooks('id BETWEEN 1 AND 30')).toBe(30);
});

test('ジャンルは 5 種類程度', async () => {
  const n = await count('SELECT DISTINCT genre FROM books');
  expect(n).toBeGreaterThanOrEqual(4);
  expect(n).toBeLessThanOrEqual(6);
});

test('複数の本を持つ著者がいる', async () => {
  expect(await count('SELECT author FROM books GROUP BY author HAVING count(*) >= 2')).toBeGreaterThan(0);
});

test('LIKE で探す語が複数の書名に含まれ、_ で探せる短い書名がある', async () => {
  expect(await countBooks("title LIKE '%猫%'")).toBeGreaterThanOrEqual(2);
  expect(await countBooks("title LIKE '_'")).toBeGreaterThan(0);
});

test('ちょうど 1000 円と 2000 円の本がある', async () => {
  expect(await countBooks('price = 1000')).toBeGreaterThan(0);
  expect(await countBooks('price = 2000')).toBeGreaterThan(0);
});

test('NULL は published_on だけにあり、2〜3 冊', async () => {
  const n = await countBooks('published_on IS NULL');
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  expect(await countBooks('num_nulls(id, title, title_kana, author, genre, price) > 0')).toBe(0);
});

test('境界にあたる発売日（2024-01-01）の本がある', async () => {
  expect(await countBooks("published_on = '2024-01-01'")).toBeGreaterThan(0);
});
