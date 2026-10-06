import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { EditorView, basicSetup } from 'codemirror';
import { ready, run } from '../db/client';
import type { ResultTable, SqlError } from '../db/run';
import { grade, verdictText, type GradeOptions } from '../grade';

const schema: Record<string, string[]> = JSON.parse(document.querySelector<HTMLElement>('[data-schema]')!.dataset.schema!);
// ponytail: 最初のテーブルの列を「books.」なしで補完する。テーブルが 1 つの入門向けで、増えたら見直す
const defaultTable = Object.keys(schema)[0];

const banner = document.getElementById('db-banner')!;
banner.hidden = false;
ready.then(
  () => (banner.hidden = true),
  () => (banner.textContent = 'データベースを起動できませんでした。ページを開き直してください。'),
);

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

function renderTable({ fields, rows }: ResultTable): Node {
  return h('div', { className: 'result' },
    h('table', {},
      h('thead', {}, h('tr', {}, ...fields.map((f) => h('th', {}, f.name)))),
      h('tbody', {}, ...rows.map((row) =>
        h('tr', {}, ...row.map((v) => h('td', {}, v === null ? h('span', { className: 'null' }, 'NULL') : String(v))))))),
    h('p', { className: 'count' }, `${rows.length} 行`));
}

// ponytail: 英語のメッセージだけ出す。日本語の説明と波線は #6 で足す
const renderError = (error: SqlError) => h('pre', { className: 'error' }, error.message);

// エディタと実行ボタンを作る。ボタンか Ctrl + Enter で SQL を実行し、エラーならその表示を、
// 成功なら結果の表を onResult に渡して返った要素を、下に出す
function createRunner(doc: string, label: string, onResult: (result: ResultTable | null) => Node[] | Promise<Node[]>) {
  const out = h('div');
  const button = h('button', { type: 'button' }, label);
  const go = async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const res = await run(editor.state.doc.toString());
      out.replaceChildren(...(res.ok ? await onResult(res.result) : [renderError(res.error)]));
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
    ],
  });
  return { editor: editor.dom, button, out };
}

// 本文の sql のコードブロックを、採点しない例に置き換える
for (const code of document.querySelectorAll('pre > code.language-sql')) {
  const { editor, button, out } = createRunner(code.textContent!.trimEnd(), '実行', (result) => [
    result ? renderTable(result) : h('p', {}, '結果の表がありません。'),
  ]);
  code.parentElement!.replaceWith(h('div', { className: 'example' }, editor, button, out));
}

// 演習は、模範解答をその場で実行した期待結果と比べて採点する。期待結果の表は見せない
for (const section of document.querySelectorAll<HTMLElement>('.exercise')) {
  const { answer, ...options }: { answer: string } & GradeOptions = JSON.parse(section.dataset.exercise!);
  let expected: Promise<ResultTable> | undefined;
  const { editor, button, out } = createRunner('', '実行して答え合わせ', async (result) => {
    // ponytail: 模範解答がエラーにも結果の表なしにもならないことは、#8 の自動検査で確かめる
    expected ??= run(answer).then((r) => {
      if (r.ok && r.result) return r.result;
      throw new Error(`模範解答を実行できません：${answer}`);
    });
    const verdict = grade(await expected, result, options);
    return [
      h('p', { className: verdict.ok ? 'verdict ok' : 'verdict ng' }, verdictText(verdict)),
      ...(result ? [renderTable(result)] : []),
    ];
  });
  section.append(editor, button, h('span', { className: 'muted' }, 'Ctrl + Enter でも実行できます'), out);
}
