---
title: はじめての SQL
goal: テーブルの全データを表示できる。テーブル、行、列という言葉がわかる
exercises:
  - prompt: books テーブルのすべての行と列を表示してください。
    answer: |
      SELECT *
      FROM books;
    hints:
      - SELECT の後ろの * は「すべての列」を表します。
      - FROM の後ろにテーブル名を書きます。
---

このサイトでは、架空の書店の本のデータを使って SQL を学びます。
本のデータは `books` という名前のテーブルに入っています。

次の SQL を「実行」ボタンで実行してみましょう。
`books` テーブルのすべての行が、下に表で表示されます。

```sql
SELECT *
FROM books;
```
