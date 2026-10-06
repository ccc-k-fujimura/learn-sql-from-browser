import type { ResultTable } from './db/run';

export type Verdict =
  | { ok: true }
  | { ok: false; kind: 'noResult' }
  | { ok: false; kind: 'columns'; expected: number; actual: number }
  | { ok: false; kind: 'columnOrder'; expected: string[] }
  | { ok: false; kind: 'names'; index: number; expected: string; actual: string }
  /** extra は学習者の結果の行番号、missing は期待結果の行番号 */
  | { ok: false; kind: 'rows'; extra: number[]; missing: number[] }
  | { ok: false; kind: 'order' };

/** 演習ごとの指定。どちらも省略すると比べない */
export type GradeOptions = { ordered?: boolean; checkNames?: boolean };

// 数値の型（int8、int2、int4、float4、float8、numeric）
const NUMERIC_TYPES = new Set([20, 21, 23, 700, 701, 1700]);

// 行を比べるための文字列。numericColumns の列は 1650.0 と 1650.00 を同じとみなし、NULL は空文字と区別する。
// ponytail: Number() にそろえるので、15 桁を超える数の違いは見分けられない。入門の題材データでは起きない
const rowKeys = (rows: unknown[][], numericColumns: boolean[]) =>
  rows.map((row) => JSON.stringify(row.map((v, i) => (v !== null && numericColumns[i] ? String(Number(v)) : v))));

// 列の数、列の並び、列名、行、行の順序の順に比べ、最初に食い違った点を返す
export function grade(expected: ResultTable, actual: ResultTable | null, { ordered, checkNames }: GradeOptions = {}): Verdict {
  if (!actual) return { ok: false, kind: 'noResult' };
  if (expected.fields.length !== actual.fields.length)
    return { ok: false, kind: 'columns', expected: expected.fields.length, actual: actual.fields.length };
  // SELECT price, title と書いたときは、行の違いではなく列の並びの違いとして伝える
  const expectedNames = expected.fields.map((f) => f.name);
  const actualNames = actual.fields.map((f) => f.name);
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(expectedNames, actualNames) && same([...expectedNames].sort(), [...actualNames].sort()))
    return { ok: false, kind: 'columnOrder', expected: expectedNames };
  const index = checkNames ? expectedNames.findIndex((name, i) => name !== actualNames[i]) : -1;
  if (index >= 0) return { ok: false, kind: 'names', index, expected: expectedNames[index]!, actual: actualNames[index]! };

  // 数値として比べるのは、両方の列が数値の型のときだけ。片方だけなら文字列表現のまま比べる
  const numericColumns = expected.fields.map((f, i) => NUMERIC_TYPES.has(f.type) && NUMERIC_TYPES.has(actual.fields[i]!.type));
  const expectedKeys = rowKeys(expected.rows, numericColumns);
  const actualKeys = rowKeys(actual.rows, numericColumns);
  // 順序を比べないときも、同じ行が何回出たかは比べる
  const remaining = new Map<string, number>();
  for (const k of expectedKeys) remaining.set(k, (remaining.get(k) ?? 0) + 1);
  const extra: number[] = [];
  actualKeys.forEach((k, i) => {
    const n = remaining.get(k) ?? 0;
    if (n > 0) remaining.set(k, n - 1);
    else extra.push(i);
  });
  const missing: number[] = [];
  expectedKeys.forEach((k, i) => {
    const n = remaining.get(k) ?? 0;
    if (n > 0) {
      remaining.set(k, n - 1);
      missing.push(i);
    }
  });
  if (extra.length || missing.length) return { ok: false, kind: 'rows', extra, missing };
  if (ordered && expectedKeys.some((k, i) => k !== actualKeys[i])) return { ok: false, kind: 'order' };
  return { ok: true };
}

export function verdictText(v: Verdict): string {
  if (v.ok) return '正解です。';
  switch (v.kind) {
    case 'noResult':
      return '結果の表がありません。SELECT 文を書いて実行してください。';
    case 'columns':
      return `列の数が違います。期待する結果は ${v.expected} 列ですが、あなたの結果は ${v.actual} 列です。`;
    case 'columnOrder':
      return `列の並びが違います。${v.expected.join('、')} の順に並べてください。`;
    case 'names':
      return `${v.index + 1} 列目の名前が違います。「${v.expected}」という名前を付けてください（いまは「${v.actual}」）。`;
    case 'rows':
      return (
        (v.missing.length ? `足りない行が ${v.missing.length} 行あります。` : '') +
        (v.extra.length ? `余分な行が ${v.extra.length} 行あります。` : '')
      );
    case 'order':
      return '行はそろっていますが、並び順が違います。';
  }
}
