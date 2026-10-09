import type { PGlite } from '@electric-sql/pglite';
import { run } from './db/run';
import type { GradeOptions } from './grade';

/** 検査に使う、レッスンファイルの演習の項目。ordered を省くと false */
export type Exercise = { answer: string } & Pick<GradeOptions, 'ordered'>;

// ponytail: 模範解答の文面を正規表現で探すだけで、文の構造は見ない。文字列、コメント、副問い合わせ、
// OVER (ORDER BY …) の中の語も数えるので、WHERE と LIMIT は誤検出し（ビルドが止まるので気づく）、
// 外側の ORDER BY の書き忘れは見逃す。副問い合わせやウィンドウ関数の演習を作るとき、構文木で外側の文だけを見る
const FILTERS = /\b(?:WHERE|LIMIT)\b/i;
const ORDER_BY = /\bORDER\s+BY\b/i;

/**
 * 模範解答を、ブラウザと同じ手順（リセットと題材データ）で実行し、演習の作り方の誤りを日本語の文で返す。
 * 誤りがなければ空の配列を返す。並びが 1 通りに決まるかは見ない（人のレビューで確かめる）
 */
export async function answerFlaws(db: PGlite, seed: string, { answer, ordered = false }: Exercise): Promise<string[]> {
  const res = await run(db, seed, answer);
  if (!res.ok) return [`実行するとエラーになる：${res.error.message}`];
  if (!res.result) return ['結果の表がない（最後の文が SELECT ではない）'];

  const flaws: string[] = [];
  const rowCount = res.result.rows.length;
  if (rowCount === 0) flaws.push('結果が 0 行になる（WHERE false でも正解になってしまう）');
  if (FILTERS.test(answer)) {
    const all = await run(db, seed, 'SELECT count(*) FROM books;');
    if (!all.ok || !all.result) flaws.push('題材データに books がなく、結果が全行かどうかを確かめられない');
    else if (rowCount === Number(all.result.rows[0]![0]))
      flaws.push(`WHERE か LIMIT を含むのに、結果が books の全行（${rowCount} 行）になる（WHERE の書き忘れでも正解になってしまう）`);
  }
  if (ordered && !ORDER_BY.test(answer)) flaws.push('ordered: true なのに、模範解答に ORDER BY がない');
  return flaws;
}
