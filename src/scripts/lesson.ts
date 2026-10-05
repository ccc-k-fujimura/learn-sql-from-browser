import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { EditorView, basicSetup } from 'codemirror';
import { ready, run } from '../db/client';
import type { RunResult } from '../db/run';

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

function renderResult(res: RunResult): Node {
  // ponytail: 英語のメッセージだけ出す。日本語の説明と波線は #6 で足す
  if (!res.ok) return h('pre', { className: 'error' }, res.error.message);
  if (!res.result) return h('p', {}, '結果の表がありません。');
  const { fields, rows } = res.result;
  return h('div', { className: 'result' },
    h('table', {},
      h('thead', {}, h('tr', {}, ...fields.map((f) => h('th', {}, f.name)))),
      h('tbody', {}, ...rows.map((row) =>
        h('tr', {}, ...row.map((v) => h('td', {}, v === null ? h('span', { className: 'null' }, 'NULL') : String(v))))))),
    h('p', { className: 'count' }, `${rows.length} 行`));
}

// 本文の sql のコードブロックを、エディタと「実行」ボタンに置き換える
for (const code of document.querySelectorAll('pre > code.language-sql')) {
  const editor = new EditorView({
    doc: code.textContent!.trimEnd(),
    extensions: [basicSetup, sql({ dialect: PostgreSQL, schema, defaultTable, upperCaseKeywords: true })],
  });
  const out = h('div');
  const button = h('button', { type: 'button' }, '実行');
  button.onclick = async () => {
    button.disabled = true;
    out.replaceChildren(renderResult(await run(editor.state.doc.toString())));
    button.disabled = false;
  };
  code.parentElement!.replaceWith(h('div', { className: 'example' }, editor.dom, button, out));
}
