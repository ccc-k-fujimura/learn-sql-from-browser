import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import { answerFlaws, type Exercise } from './answers';

const lessons = import.meta.glob<{ frontmatter: { exercises: Exercise[] } }>('./content/lessons/*/*.md', { eager: true });
const seeds = import.meta.glob<string>('./data/*/seed.sql', { query: '?raw', import: 'default', eager: true });
const db = await PGlite.create();
const intro = seeds['./data/intro/seed.sql']!;

// 検査そのものを、わざと誤った演習で確かめる
test.each([
  ['実行するとエラーになる', { answer: 'SELEC * FROM books;' }, 'エラーになる'],
  ['結果が 0 行になる', { answer: 'SELECT * FROM books WHERE false;' }, '0 行'],
  ['WHERE を含むのに全行になる', { answer: 'SELECT title FROM books WHERE price > 0;' }, 'books の全行'],
  ['LIMIT を含むのに全行になる', { answer: 'SELECT title FROM books LIMIT 100;' }, 'books の全行'],
  ['小文字の where を含むのに全行になる', { answer: 'select title from books where price > 0;' }, 'books の全行'],
  ['ordered: true なのに ORDER BY がない', { answer: 'SELECT title FROM books WHERE price > 1000;', ordered: true }, 'ORDER BY'],
  ['結果の表がない', { answer: 'DELETE FROM books;' }, '結果の表がない'],
])('誤った演習を見つける：%s', async (_, exercise, phrase) => {
  const flaws = await answerFlaws(db, intro, exercise);
  expect(flaws).toHaveLength(1);
  expect(flaws[0]).toContain(phrase);
});

test('題材データに books がなければ、全行かどうかを確かめられないことを誤りとして返す', async () => {
  const flaws = await answerFlaws(db, 'CREATE TABLE t (x integer); INSERT INTO t VALUES (1), (2);', { answer: 'SELECT x FROM t WHERE x > 1;' });
  expect(flaws).toEqual([expect.stringContaining('books')]);
});

test.each([
  ['WHERE も LIMIT もなければ、全行でよい', { answer: 'SELECT * FROM books;' }],
  ['絞り込んで並べる', { answer: 'SELECT title FROM books WHERE price > 1000 ORDER BY price, id;', ordered: true }],
  ['小文字で、改行をはさんで書いても見分ける', { answer: 'select title from books\nwhere price > 1000\norder\n  by price, id;', ordered: true }],
])('正しい演習は通す：%s', async (_, exercise) => {
  expect(await answerFlaws(db, intro, exercise)).toEqual([]);
});

// 全レッスンの全演習の模範解答を、そのレベルの題材データで検査する。テスト名で、どのレッスンのどの演習かがわかる
const exercises = Object.entries(lessons).flatMap(([path, { frontmatter }]) => {
  const [, level, file] = path.match(/^\.\/content\/lessons\/([^/]+)\/(.+)$/)!;
  return frontmatter.exercises.map((exercise, i) => ({ name: `${level}/${file} の演習 ${i + 1}`, level: level!, exercise }));
});

test('検査する演習がある', () => {
  expect(exercises.length).toBeGreaterThan(0);
});

test.each(exercises)('模範解答：$name', async ({ level, exercise }) => {
  const seed = seeds[`./data/${level}/seed.sql`];
  expect(seed, `題材データ src/data/${level}/seed.sql がない`).toBeDefined();
  expect(await answerFlaws(db, seed!, exercise)).toEqual([]);
});
