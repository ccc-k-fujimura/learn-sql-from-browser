import { expect, test } from 'vitest';
import { lessonId, levelLessons } from './lessons';

test('レッスンの id は、ファイル名から番号を除いた名前になる', () => {
  expect(lessonId('intro/01-first-select.md')).toBe('intro/first-select');
  expect(lessonId('intro/10-review.md')).toBe('intro/review');
});

test('レベルのレッスンは、そのレベルのものだけがファイル名の番号の順に並ぶ', () => {
  const entries = [
    { id: 'intro/review', filePath: 'src/content/lessons/intro/10-review.md' },
    { id: 'basic/join', filePath: 'src/content/lessons/basic/01-join.md' },
    { id: 'intro/where', filePath: 'src/content/lessons/intro/03-where.md' },
    { id: 'intro/first-select', filePath: 'src/content/lessons/intro/01-first-select.md' },
  ];
  expect(levelLessons(entries, 'intro').map((e) => e.id)).toEqual(['intro/first-select', 'intro/where', 'intro/review']);
});
