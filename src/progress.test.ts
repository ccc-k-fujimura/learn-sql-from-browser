import { expect, test } from 'vitest';
import { lessonProgress, levelProgress, loadSolved, recordSolved, type Solved } from './progress';

const KEY = 'browser-sql:progress';
// localStorage の代わり
const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
// プライベートウィンドウなどで、読むのも書くのも例外になる localStorage
const broken = {
  getItem: () => {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('quota', 'QuotaExceededError');
  },
};

test('正解した演習の番号を、レッスンの名前ごとに JSON で保存する', () => {
  const storage = memory();
  recordSolved('intro/where', 2, storage);
  recordSolved('intro/where', 0, storage);
  recordSolved('intro/where', 2, storage); // 同じ演習に 2 回正解しても 1 つ
  recordSolved('intro/first-select', 1, storage);
  expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ 'intro/where': [0, 2], 'intro/first-select': [1] });
});

test('保存した記録を読み出す。何も保存していなければ空', () => {
  expect(loadSolved(memory())).toEqual({});
  expect(loadSolved(memory({ [KEY]: '{"intro/where":[0,2]}' }))).toEqual({ 'intro/where': [0, 2] });
});

test('localStorage が使えなくても、例外を投げず、記録は空として扱う', () => {
  expect(loadSolved(broken)).toEqual({});
  expect(() => recordSolved('intro/where', 0, broken)).not.toThrow();
});

test('壊れた値は読み飛ばす', () => {
  expect(loadSolved(memory({ [KEY]: 'not json' }))).toEqual({});
  expect(loadSolved(memory({ [KEY]: 'null' }))).toEqual({});
  expect(loadSolved(memory({ [KEY]: '{"intro/where":"0","intro/null":[1]}' }))).toEqual({ 'intro/null': [1] });
});

test.each([
  ['正解がなければ未着手', undefined, 3, 'todo'],
  ['1 問でも正解すれば途中', [1], 3, 'doing'],
  ['全問正解で修了', [0, 1, 2], 3, 'done'],
  ['同じ番号が重なっていても、1 問と数える', [0, 0, 1, 1], 3, 'doing'],
  ['演習の数より大きい番号（演習を減らしたあとの古い記録）は数えない', [0, 1, 5], 3, 'doing'],
] as const)('レッスンの進捗：%s', (_, solved, count, expected) => {
  expect(lessonProgress(solved ? [...solved] : undefined, count)).toBe(expected);
});

const intro = [
  { id: 'intro/first-select', exercises: 3 },
  { id: 'intro/columns', exercises: 3 },
  { id: 'intro/review', exercises: 5 },
];

test('1 本も手を付けていなければ、最初のレッスンから始める', () => {
  expect(levelProgress(intro, {})).toEqual({ progress: ['todo', 'todo', 'todo'], doneCount: 0, next: 0, started: false });
});

test('続きからは、修了していない最初のレッスン。修了数は修了したレッスンの数', () => {
  const solved: Solved = { 'intro/first-select': [0, 1, 2], 'intro/columns': [0], 'intro/review': [0, 1, 2, 3, 4] };
  expect(levelProgress(intro, solved)).toEqual({ progress: ['done', 'doing', 'done'], doneCount: 2, next: 1, started: true });
});

test('途中のレッスンがなく、後ろのレッスンだけ修了していても、修了していない最初のレッスンに飛ぶ', () => {
  expect(levelProgress(intro, { 'intro/columns': [0, 1, 2] })).toMatchObject({ next: 0, started: true, doneCount: 1 });
});

test('すべて修了したら、続きの先はない', () => {
  const solved: Solved = { 'intro/first-select': [0, 1, 2], 'intro/columns': [0, 1, 2], 'intro/review': [0, 1, 2, 3, 4] };
  expect(levelProgress(intro, solved)).toMatchObject({ next: -1, doneCount: 3 });
});
