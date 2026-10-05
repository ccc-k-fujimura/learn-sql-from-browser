import type { PGlite } from '@electric-sql/pglite';

export type ResultTable = { fields: { name: string; type: number }[]; rows: unknown[][] };
/** `code`（SQLSTATE）が null なら、学習者の SQL ではなく PGlite の側で起きた失敗である */
export type SqlError = { message: string; code: string | null; position: number | null; hint: string | null };
export type RunResult = { ok: true; result: ResultTable | null } | { ok: false; error: SqlError };

// 先頭の ROLLBACK は、学習者が BEGIN を残した場合に備える。RESET ALL は SET search_path などを戻し、
// DISCARD TEMP は books を隠す一時テーブルを消す（DISCARD ALL は複数の文の中で実行できない）。
// ponytail: public 以外のスキーマは残る。SELECT だけの入門では困らない
const RESET = `ROLLBACK; RESET ALL; DISCARD TEMP; SET TimeZone = 'Asia/Tokyo';
DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`;

// 値は PostgreSQL の文字列表現のまま受け取る（表示と採点をそろえる）
const TEXT_OIDS = [16, 20, 21, 23, 25, 700, 701, 1043, 1082, 1083, 1114, 1184, 1700];
const parsers = Object.fromEntries(TEXT_OIDS.map((oid) => [oid, (x: string) => x]));

// 実行の直前に毎回 DB を初期状態へ戻し、最後の文の結果の表を返す
export async function run(db: PGlite, seed: string, sql: string): Promise<RunResult> {
  try {
    await db.exec(RESET + seed);
    const last = (await db.exec(sql, { rowMode: 'array', parsers })).at(-1);
    if (!last?.fields.length) return { ok: true, result: null };
    return {
      ok: true,
      result: { fields: last.fields.map((f) => ({ name: f.name, type: f.dataTypeID })), rows: last.rows as unknown[][] },
    };
  } catch (e) {
    const { message, code, position, hint } = e as { message: string; code?: string; position?: string; hint?: string };
    return { ok: false, error: { message, code: code ?? null, position: Number(position) || null, hint: hint ?? null } };
  }
}
