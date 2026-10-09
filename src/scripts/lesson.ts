import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { setDiagnostics } from '@codemirror/lint';
import { EditorView, basicSetup } from 'codemirror';
import { createDb, type Stopped } from '../db/client';
import type { ResultTable, RunResult, SqlError } from '../db/run';
import { errorRange, explainError, isSqlError } from '../errors';
import { grade, verdictText, type GradeOptions } from '../grade';

const schema: Record<string, string[]> = JSON.parse(document.querySelector<HTMLElement>('[data-schema]')!.dataset.schema!);
// ponytail: 最初のテーブルの列を「books.」なしで補完する。テーブルが 1 つの入門向けで、増えたら見直す
const defaultTable = Object.keys(schema)[0];

// 起動中と、実行を止めたあとの作り直し中は、帯で知らせる
const banner = document.getElementById('db-banner')!;
const db = createDb(
  () => new Worker(new URL('../db/worker.ts', import.meta.url), { type: 'module' }),
  (state) => {
    banner.hidden = state === 'ready';
    banner.textContent = state === 'fatal' ? 'データベースを起動できませんでした。ページを開き直してください。' : 'データベースを準備しています…';
  },
);

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

// extra（行番号）の行は赤くし、色の見え方に頼らないよう、先頭に足した列にも「余分」と書く
function renderTable({ fields, rows }: ResultTable, { caption, extra = [] }: { caption?: string; extra?: number[] } = {}): Node {
  const hasExtra = extra.length > 0;
  return h('div', { className: 'overflow-x-auto [&_td]:whitespace-nowrap' },
    h('table', {},
      ...(caption ? [h('caption', {}, caption)] : []),
      h('thead', {}, h('tr', {},
        ...(hasExtra ? [h('th', {}, h('span', { className: 'sr-only' }, '余分な行の印'))] : []),
        ...fields.map((f) => h('th', {}, f.name)))),
      h('tbody', {}, ...rows.map((row, i) => {
        const isExtra = extra.includes(i);
        return h('tr', { className: isExtra ? 'bg-row-extra-bg' : '' },
          ...(hasExtra ? [h('td', { className: 'text-wrong' }, isExtra ? '余分' : '')] : []),
          ...row.map((v) => h('td', {}, v === null ? h('span', { className: 'text-null italic' }, 'NULL') : String(v))));
      }))),
    h('p', { className: 'my-1 text-[.9rem] text-muted' }, `${rows.length} 行`));
}

const buttonClass = 'my-2 cursor-pointer rounded border border-control bg-page px-3.5 py-1 disabled:cursor-default disabled:opacity-50';

// ヒントはボタンを押すたびに 1 つずつ出す。文は Markdown として解釈せず、そのまま出す
function renderHints(hints: string[]): Node[] {
  const list = h('ol', { className: 'empty:hidden' });
  const next = h('button', { type: 'button', className: buttonClass, hidden: hints.length === 0 }, 'ヒント 1 を見る');
  next.onclick = () => {
    list.append(h('li', { className: 'whitespace-pre-line' }, hints[list.childElementCount]!));
    next.textContent = `ヒント ${list.childElementCount + 1} を見る`;
    next.hidden = list.childElementCount === hints.length;
  };
  return [list, next];
}

const renderStopped = ({ stopped }: Stopped) =>
  h('p', { className: 'my-2' }, stopped === 'timedOut' ? '10 秒たっても終わらなかったので、実行を止めました。' : '実行を止めました。');

// 日本語の説明を先に出し、英語の元のメッセージは折りたたむ
const renderError = (error: SqlError) =>
  h('div', { className: 'my-2 rounded border border-error-line bg-error-bg px-3 py-2' },
    h('p', { className: 'm-0' }, explainError(error)),
    h('details', { className: 'mt-2' },
      h('summary', { className: 'cursor-pointer text-muted' }, '英語の元のメッセージ'),
      h('pre', { className: 'mb-0' }, error.message)));

// エラーの位置に波線を引く（エラーでなければ消す）。待っているあいだに SQL が書き換わっていたら、位置がずれるので引かない
function markError(editor: EditorView, ran: string, error?: SqlError) {
  const marks = error?.position && editor.state.doc.toString() === ran
    ? [{ ...errorRange(ran, error.position), severity: 'error' as const, message: explainError(error) }]
    : [];
  editor.dispatch(setDiagnostics(editor.state, marks));
}

// エディタと実行ボタンを作る。ボタンか Ctrl + Enter で SQL を実行し、エラーならその説明を出し、
// エディタに波線を引き、学習者の SQL のエラー（SQLSTATE がある）なら onError を呼ぶ。
// 1 秒たっても終わらなければ、ボタンの横に「止める」を出す。止めたときは onResult も onError も呼ばない。
// 成功なら結果の表と SQL を onResult に渡し、返った要素を下に出す
function createRunner(
  doc: string,
  label: string,
  onResult: (result: ResultTable | null, sql: string) => Node[] | Promise<Node[]>,
  onError?: () => void,
) {
  const out = h('div');
  const button = h('button', { type: 'button', className: buttonClass }, label);
  const stop = h('button', { type: 'button', className: buttonClass, onclick: () => db.stop() }, '止める');
  const slowNotice = h('span', { role: 'status', className: 'ml-2 text-[.9rem] text-muted' });
  const go = async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const sql = editor.state.doc.toString();
      const res = await db.run(sql, () => slowNotice.replaceChildren('時間がかかっています… ', stop));
      slowNotice.replaceChildren();
      if ('stopped' in res) {
        markError(editor, sql);
        return out.replaceChildren(renderStopped(res));
      }
      markError(editor, sql, res.ok ? undefined : res.error);
      out.replaceChildren(...(res.ok ? await onResult(res.result, sql) : [renderError(res.error)]));
      if (!res.ok && isSqlError(res.error)) onError?.();
    } finally {
      button.disabled = false;
    }
  };
  button.onclick = go;
  const editor = new EditorView({
    doc,
    extensions: [
      // basicSetup のキー操作（Ctrl + Enter で空行を入れる）より先に置き、実行に使う
      EditorView.domEventHandlers({
        keydown: (e) => {
          if (!(e.key === 'Enter' && (e.ctrlKey || e.metaKey))) return false;
          e.preventDefault();
          go();
          return true;
        },
      }),
      basicSetup,
      sql({ dialect: PostgreSQL, schema, defaultTable, upperCaseKeywords: true }),
      EditorView.editorAttributes.of({ class: 'rounded border border-control text-[15px]' }),
    ],
  });
  return { editor: editor.dom, controls: h('span', {}, button, slowNotice), out };
}

// 本文の sql のコードブロックを、採点しない例に置き換える
for (const code of document.querySelectorAll('pre > code.language-sql')) {
  const { editor, controls, out } = createRunner(code.textContent!.trimEnd(), '実行', (result) => [
    result ? renderTable(result) : h('p', {}, '結果の表がありません。'),
  ]);
  code.parentElement!.replaceWith(h('div', { className: 'mt-2 mb-4' }, editor, controls, out));
}

// 演習は、模範解答をその場で実行した期待結果と比べて採点する。期待結果の表は見せない
for (const section of document.querySelectorAll<HTMLElement>('.exercise')) {
  const { answer, hints, ...options }: { answer: string; hints: string[] } & GradeOptions = JSON.parse(section.dataset.exercise!);
  let answerRun: Promise<RunResult | Stopped> | undefined;
  // 模範解答は、答え合わせで 1 回間違えるまで開けない。SQL のエラーも間違いに数え、空のままの実行は数えない
  const answerBox = h('details', { hidden: true },
    h('summary', { className: 'cursor-pointer' }, '模範解答を見る'),
    h('pre', {}, answer.trimEnd()));
  const unlockAnswer = () => (answerBox.hidden = false);
  const { editor, controls, out } = createRunner('', '実行して答え合わせ', async (result, sql) => {
    // 期待結果は最初の答え合わせで 1 回だけ、模範解答を実行して作り、使い回す。
    // ほかの実行の「止める」に巻き込まれて止まったときは、次の答え合わせで作り直す
    const answerResult = await (answerRun ??= db.run(answer));
    if ('stopped' in answerResult) {
      answerRun = undefined;
      return [renderStopped(answerResult)];
    }
    // 模範解答がエラーにも結果の表なしにもならないことは、answers.test.ts の自動検査で確かめている
    if (!answerResult.ok || !answerResult.result) throw new Error(`模範解答を実行できません：${answer}`);
    const expectedTable = answerResult.result;
    const verdict = grade(expectedTable, result, options);
    if (!verdict.ok && sql.trim()) unlockAnswer();
    const diff = !verdict.ok && verdict.kind === 'rows' ? verdict : undefined;
    return [
      h('p', { className: `my-2 rounded px-3 py-1.5 ${verdict.ok ? 'bg-correct-bg text-correct' : 'bg-wrong-bg text-wrong'}` }, verdictText(verdict)),
      ...(result ? [renderTable(result, { caption: 'あなたの結果', extra: diff?.extra })] : []),
      ...(diff?.missing.length
        ? [h('div', { className: 'mt-4 [&_tbody_tr]:bg-row-missing-bg' },
            renderTable({ fields: expectedTable.fields, rows: diff.missing.map((i) => expectedTable.rows[i]!) }, { caption: '足りない行' }))]
        : []),
    ];
  }, unlockAnswer);
  section.append(editor, controls, h('span', { className: 'ml-2 text-[.9rem] text-muted' }, 'Ctrl + Enter でも実行できます'), out,
    ...renderHints(hints), answerBox);
}
