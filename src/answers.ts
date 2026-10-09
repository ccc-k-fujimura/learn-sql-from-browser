import type { PGlite } from '@electric-sql/pglite';
import { run } from './db/run';
import type { GradeOptions } from './grade';

/** 検査に使う、レッスンファイルの演習の項目。ordered を省くと false */
export type Exercise = { answer: string } & Pick<GradeOptions, 'ordered'>;

const FILTERS = /\b(?:WHERE|LIMIT)\b/i;
const ORDER_BY = /\bORDER\s+BY\b/i;

// 最後の文から、文字列、引用符で囲んだ名前、コメントを消したもの。採点に使うのも最後の文の結果である。
// ponytail: E'…' のバックスラッシュ、$$ の文字列、入れ子の /* */ は見分けない。模範解答で使うようになったら、構文解析器に変える
function lastStatement(sql: string): string {
  const code = sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  return code.split(';').filter((s) => s.trim()).at(-1) ?? '';
}

// 括弧の中（副問い合わせ、OVER (…)、関数の引数）を消し、文の外側だけを残す
function outside(statement: string): string {
  let outer = statement;
  while (/\([^()]*\)/.test(outer)) outer = outer.replace(/\([^()]*\)/g, ' ');
  return outer;
}

/**
 * 模範解答を、ブラウザと同じ手順（リセットと題材データ）で実行し、演習の作り方の誤りを日本語の文で返す。
 * 誤りがなければ空の配列を返す。並びが 1 通りに決まるかは見ない（人のレビューで確かめる）
 */
export async function answerFlaws(db: PGlite, seed: string, { answer, ordered = false }: Exercise): Promise<string[]> {
  const res = await run(db, seed, answer);
  if (!res.ok) return [`実行するとエラーになる：${res.error.message}`];
  if (!res.result) return ['結果の表がない（最後の文が SELECT ではない）'];

  const flaws: string[] = [];
  const statement = lastStatement(answer);
  const rowCount = res.result.rows.length;
  if (rowCount === 0) flaws.push('結果が 0 行になる（WHERE false でも正解になってしまう）');
  // WHERE と LIMIT は、副問い合わせの中も数える。見逃すと黙って通るので、誤検出（ビルドが止まって気づく）の側に倒す
  if (FILTERS.test(statement)) {
    const bookCount = await run(db, seed, 'SELECT count(*) FROM books;');
    if (!bookCount.ok || !bookCount.result) flaws.push('題材データに books がなく、結果が全行かどうかを確かめられない');
    else if (rowCount === Number(bookCount.result.rows[0]![0]))
      flaws.push(`WHERE か LIMIT を含むのに、結果が books の全行（${rowCount} 行）になる（WHERE の書き忘れでも正解になってしまう）`);
  }
  // ORDER BY は外側の文だけを見る。副問い合わせや OVER (…) の中の ORDER BY は、結果の並びを決めない
  if (ordered && !ORDER_BY.test(outside(statement))) flaws.push('ordered: true なのに、模範解答の最後の文に ORDER BY がない');
  return flaws;
}
