import { expect, test } from 'vitest';
import type { ResultTable } from './db/run';
import { grade, verdictText, type GradeOptions } from './grade';

const [TEXT, INT4, FLOAT8, NUMERIC] = [25, 23, 701, 1700];
const table = (names: string[], rows: unknown[][], types: number[] = names.map(() => TEXT)): ResultTable => ({
  fields: names.map((name, i) => ({ name, type: types[i]! })),
  rows,
});
const verdictFor = (expected: ResultTable, actual: ResultTable | null, options: GradeOptions = {}) => verdictText(grade(expected, actual, options));

const books = table(['title', 'price'], [['こころ', '506'], ['空', '1000']]);

test('すべて一致すれば正解', () => {
  expect(grade(books, books)).toEqual({ ok: true });
  expect(verdictText({ ok: true })).toBe('正解です。');
});

test('列の数が違う', () => {
  const actual = table(['title', 'price', 'id'], [['こころ', '506', '2'], ['空', '1000', '22']]);
  expect(verdictFor(books, actual)).toBe('列の数が違います。期待する結果は 2 列ですが、あなたの結果は 3 列です。');
});

test('列名の集まりが同じで並びだけ違えば、行より先に並びの違いを伝える', () => {
  const reversed = table(['price', 'title'], [['506', 'こころ'], ['1000', '空']]);
  expect(verdictFor(books, reversed)).toBe('列の並びが違います。title、price の順に並べてください。');
});

test('列名は checkNames のときだけ比べる', () => {
  const expected = table(['title', '税込価格'], [['空', '1100.0']], [TEXT, NUMERIC]);
  const actual = table(['title', '?column?'], [['空', '1100.0']], [TEXT, NUMERIC]);
  expect(verdictFor(expected, actual)).toBe('正解です。');
  expect(verdictFor(expected, actual, { checkNames: true })).toBe(
    '2 列目の名前が違います。「税込価格」という名前を付けてください（いまは「?column?」）。',
  );
});

test('行の順序は ordered のときだけ比べる', () => {
  const reversed = table(['title', 'price'], [['空', '1000'], ['こころ', '506']]);
  expect(verdictFor(books, reversed)).toBe('正解です。');
  expect(verdictFor(books, reversed, { ordered: true })).toBe('行はそろっていますが、並び順が違います。');
  expect(verdictFor(books, books, { ordered: true })).toBe('正解です。');
});

test('結果の表がない', () => {
  expect(verdictFor(books, null)).toBe('結果の表がありません。SELECT 文を書いて実行してください。');
});

test('足りない行と余分な行の数を伝える', () => {
  const three = table(['title', 'price'], [['こころ', '506'], ['空', '1000'], ['海', '1100']]);
  const one = table(['title', 'price'], [['こころ', '506']]);
  const swapped = table(['title', 'price'], [['こころ', '506'], ['夢十夜', '352']]);
  expect(verdictFor(three, one)).toBe('足りない行が 2 行あります。');
  expect(verdictFor(one, books)).toBe('余分な行が 1 行あります。');
  expect(verdictFor(books, swapped)).toBe('足りない行が 1 行あります。余分な行が 1 行あります。');
});

test('数値の型どうしは数値として比べ、それ以外は文字列表現で比べる', () => {
  const price = (v: string, type: number) => table(['price'], [[v]], [type]);
  expect(verdictFor(price('1650.0', NUMERIC), price('1650.00', NUMERIC))).toBe('正解です。');
  expect(verdictFor(price('1650', INT4), price('1650.0', NUMERIC))).toBe('正解です。');
  expect(verdictFor(price('1815', NUMERIC), price('1815', FLOAT8))).toBe('正解です。');
  expect(verdictFor(price('1650.0', TEXT), price('1650.00', TEXT))).toBe('足りない行が 1 行あります。余分な行が 1 行あります。');
  // 片方だけが数値の型なら、どちらも文字列表現のまま比べる
  expect(verdictFor(price('1650.0', NUMERIC), price('1650.0', TEXT))).toBe('正解です。');
  expect(verdictFor(price('1650.0', NUMERIC), price('1650', TEXT))).toBe('足りない行が 1 行あります。余分な行が 1 行あります。');
});

test('NULL と空文字を区別する', () => {
  expect(verdictFor(table(['a'], [[null]]), table(['a'], [['']]))).toBe('足りない行が 1 行あります。余分な行が 1 行あります。');
  expect(verdictFor(table(['a'], [[null]], [NUMERIC]), table(['a'], [[null]], [NUMERIC]))).toBe('正解です。');
});

test('同じ行が何回出たかまで比べる（DISTINCT の書き忘れを正解にしない）', () => {
  const genres = table(['genre'], [['小説'], ['絵本']]);
  const duplicated = table(['genre'], [['小説'], ['小説'], ['絵本']]);
  expect(verdictFor(genres, duplicated)).toBe('余分な行が 1 行あります。');
  expect(grade(genres, duplicated)).toMatchObject({ extra: [1], missing: [] });
});
