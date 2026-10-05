import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

// ponytail: 環境の確認用。模範解答の自動検査のテストができたら消す
test('Node の上で PGlite が SQL を実行できる', async () => {
  const db = await PGlite.create();
  const [result] = await db.exec('SELECT 1 + 1 AS two;');
  expect(result?.rows).toEqual([{ two: 2 }]);
  await db.close();
});
