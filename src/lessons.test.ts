import { expect, test } from 'vitest';
import { lessonId } from './lessons';

test('レッスンの id は、ファイル名から番号を除いた名前になる', () => {
  expect(lessonId('intro/01-first-select.md')).toBe('intro/first-select');
  expect(lessonId('intro/10-review.md')).toBe('intro/review');
});
