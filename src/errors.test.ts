import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import { run, type SqlError } from './db/run';
import { errorRange, explainError } from './errors';

const err = (code: string | null, message = ''): SqlError => ({ code, message, position: null, hint: null });
const GENERIC = 'エラーが起きました';

test.each([
  ['42601', 'syntax error at or near ","', '位置の近くで、カンマ'],
  ['42601', 'unterminated quoted string at or near "\'abc"', 'シングルクォート（\'）が閉じていません'],
  ['42703', 'column "x" does not exist', 'ダブルクォート'],
  ['42P01', 'relation "x" does not exist', 'books です'],
  ['22P02', 'invalid input syntax for type integer: "abc"', '数値ではない値'],
  ['22007', 'invalid input syntax for type date: "x"', '日付の書き方に誤り'],
  ['22008', 'date/time field value out of range: "2024-13-01"', '存在しない日付'],
  ['42883', 'operator does not exist: text > integer', '比べたり計算したり'],
  ['42804', 'argument of WHERE must be type boolean', 'WHERE の後ろ'],
  ['22012', 'division by zero', '0 で割る'],
])('SQLSTATE %s（%s）には、それ専用の日本語の説明を出す', (code, message, phrase) => {
  expect(explainError(err(code, message))).toContain(phrase);
});

test('専用の説明がない SQLSTATE と、SQLSTATE がないエラーには、汎用の説明を出す', () => {
  expect(explainError(err('23505', 'duplicate key'))).toContain(GENERIC);
  expect(explainError(err(null, 'PGlite が落ちた'))).toContain(GENERIC);
});

test('42601 のうち、引用符の閉じ忘れだけを別の説明にする', () => {
  expect(explainError(err('42601', 'syntax error at end of input'))).not.toContain('閉じていません');
  expect(explainError(err('42703', 'unterminated quoted string'))).not.toContain('閉じていません');
});

test.each([
  ['語の終わりまで', 'SELECT titel FROM books;', 8, 'titel'],
  ['日本語の語', 'SELECT 書名 FROM books;', 8, '書名'],
  ['ダブルクォートで囲んだ名前', 'SELECT "title" FROM books;', 8, '"title"'],
  ['閉じていない文字列は、入力の終わりまで', "SELECT 'abc", 8, "'abc"],
  ['記号は 1 文字', 'SELECT title, FROM books;', 13, ','],
  ['入力の終わりでは、最後の語', 'SELECT * FROM', 14, 'FROM'],
  ['入力の終わりが空白でも、最後の語', 'SELECT * FROM books WHERE \n', 28, 'WHERE'],
  ['絵文字は 1 文字と数える', "SELECT '😀', titel FROM books;", 13, 'titel'],
])('波線の範囲：%s', (_, sql, position, expected) => {
  const { from, to } = errorRange(sql, position);
  expect(sql.slice(from, to)).toBe(expected);
});

// PostgreSQL が返す位置を、実際に PGlite で取り出して確かめる
const db = await PGlite.create();
const seed = 'CREATE TABLE books (id integer, title text);';
const underlined = async (sql: string) => {
  const res = await run(db, seed, sql);
  if (res.ok || !res.error.position) throw new Error(`位置のあるエラーにならなかった：${sql}`);
  const { from, to } = errorRange(sql, res.error.position);
  return sql.slice(from, to);
};

test('複数の文を書いても、波線は 2 つ目以降の文の正しい位置に引かれる', async () => {
  expect(await underlined('SELECT 1;\nSELECT title FROM books;\nSELECT titel FROM books;')).toBe('titel');
  expect(await underlined('SELECT 1;\nSELECT * FORM books;')).toBe('FORM');
  expect(await underlined('SELECT 1; SELECT 日本語, titel FROM books;')).toBe('日本語');
  expect(await underlined("SELECT '😀', titel FROM books;")).toBe('titel');
});

test.each([
  ['語の途中の誤り', 'SELECT * FORM books;', 'FORM'],
  ['入力の終わりでの誤り', 'SELECT * FROM books WHERE', 'WHERE'],
  ['閉じ忘れの文字列', "SELECT * FROM books WHERE title = 'abc", "'abc"],
])('実際のエラーの位置：%s', async (_, sql, expected) => {
  expect(await underlined(sql)).toBe(expected);
});
