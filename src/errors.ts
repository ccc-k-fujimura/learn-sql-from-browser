import type { SqlError } from './db/run';

const GENERIC = 'エラーが起きました。下の英語のメッセージと、印の付いた位置を手がかりに確認してください。';

const UNTERMINATED_STRING = "シングルクォート（'）が閉じていません。文字列の終わりにもシングルクォートを付けます。";

// SQLSTATE から選ぶ説明。文面は docs/spec.md の「レッスン画面」の表に合わせる
const BY_CODE: Record<string, string> = {
  '42601': 'SQL の書き方に誤りがあります。印の付いた位置の近くで、カンマの付けすぎや付け忘れ、キーワードのつづりを確認してください。',
  '42703':
    '指定した列がありません。列名のつづりを確認してください。文字列をダブルクォート（"）で囲んでいませんか？ 文字列はシングルクォート（\'）で囲みます。',
  '42P01': '指定したテーブルがありません。このレッスンで使うテーブルは books です。',
  '22P02': '数値の列を、数値ではない値と比べています。数値は引用符で囲まずに書きます。',
  '22007': "日付の書き方に誤りがあります。日付は '2024-01-01' の形で書きます。",
  '22008': "存在しない日付です。日付は '2024-01-01' の形で書き、月と日の値を確認してください。",
  '42883': 'この組み合わせでは、比べたり計算したりできません。文字列の列と数値を比べていないか確認してください。',
  '42804': '条件の書き方に誤りがあります。WHERE の後ろには「price >= 1000」のような条件を書きます。',
  '22012': '0 で割ることはできません。',
};

// 学習者の SQL のエラーかどうかは、SQLSTATE の有無で決める（例外のクラス名は本番ビルドで短縮される）。
// code がなければ、リセットの失敗のような PGlite の側の失敗で、学習者の間違いには数えない
export const isSqlError = ({ code }: Pick<SqlError, 'code'>) => code !== null;

// 42601 のうち、引用符の閉じ忘れだけは SQLSTATE が同じなので、メッセージで見分ける
export function explainError({ code, message }: Pick<SqlError, 'code' | 'message'>): string {
  if (code === '42601' && message.includes('unterminated quoted string')) return UNTERMINATED_STRING;
  return (code && BY_CODE[code]) || GENERIC;
}

const WORD = String.raw`[\p{L}\p{N}_$]+`;
// 引用符で囲んだ名前や文字列、語、記号 1 文字のいずれか
const TOKEN = new RegExp(String.raw`^(?:"[^"]*"?|'[^']*'?|${WORD}|.)`, 'su');
const LAST_TOKEN = new RegExp(String.raw`${WORD}$|.$`, 'su');

// PostgreSQL のエラーの位置（1 始まり、文字数で数える）から、波線を引く範囲（文字列の添字）を求める。
// ponytail: 位置から先を切り出して語を取るだけで、コメントや $$ の中は見ない。
// 学習者が -- や /* */ を書くレッスンを作るとき、字句解析に変える
export function errorRange(sql: string, position: number): { from: number; to: number } {
  // PostgreSQL は絵文字を 1 文字と数えるので、UTF-16 の添字へ直す
  let from = 0;
  for (let n = 1; n < position && from < sql.length; n++) from += sql.codePointAt(from)! > 0xffff ? 2 : 1;
  // 入力の終わりでエラーになったとき（FROM の後ろに何もないなど）は、最後の語に引く
  const end = sql.trimEnd().length;
  if (from >= end) from = Math.max(0, sql.slice(0, end).search(LAST_TOKEN));
  return { from, to: from + (TOKEN.exec(sql.slice(from))?.[0].length ?? 0) };
}
