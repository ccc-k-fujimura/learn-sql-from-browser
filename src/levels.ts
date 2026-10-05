export type Column = { name: string; meaning: string; example: string };

export type Level = {
  /** URL の 1 段目（`/intro/`）と、レッスンファイルのディレクトリ名 */
  id: string;
  name: string;
  /** レベルの境界の 1 行 */
  boundary: string;
  published: boolean;
  /** レッスン画面の列の表と、エディタの補完に使う */
  tables: Record<string, Column[]>;
};

export const levels: Level[] = [
  {
    id: 'intro',
    name: '入門',
    boundary: '1 つのテーブルから、条件に合う行と必要な列を取り出して並べる（SELECT のみ）',
    published: true,
    tables: {
      books: [
        { name: 'id', meaning: '本の番号', example: '1' },
        { name: 'title', meaning: '書名', example: 'こころ' },
        { name: 'title_kana', meaning: '書名の読み（ひらがな）', example: 'こころ' },
        { name: 'author', meaning: '著者名', example: '夏目漱石' },
        { name: 'genre', meaning: 'ジャンル', example: '小説' },
        { name: 'price', meaning: '価格（円、税抜）', example: '506' },
        { name: 'published_on', meaning: '発売日（未定なら NULL）', example: '2004-03-01' },
      ],
    },
  },
  {
    id: 'basic',
    name: '初級',
    boundary: '複数のテーブルを結合し、集計し、データを変更する',
    published: false,
    tables: {},
  },
  {
    id: 'intermediate',
    name: '中級',
    boundary: 'サブクエリやウィンドウ関数を使い、複雑な問いを 1 つのクエリで書く',
    published: false,
    tables: {},
  },
  {
    id: 'advanced',
    name: '実践応用',
    boundary: 'Docker で用意したローカル環境の PostgreSQL で、テーブル設計、インデックス、トランザクション、実務の課題に取り組む',
    published: false,
    tables: {},
  },
];
