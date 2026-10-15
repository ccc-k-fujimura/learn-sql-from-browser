// GitHub Pages では同じ所有者のサイトが origin を共有するので、サイト固有の接頭辞を付ける
const KEY = 'browser-sql:progress';

/** レッスンの名前（`intro/where`）ごとの、正解した演習の番号（0 始まり）。localStorage に残すのはこれだけ */
export type Solved = Record<string, number[]>;
/** レッスンの進捗（未着手、途中、修了） */
export type LessonProgress = 'todo' | 'doing' | 'done';

// localStorage は、プライベートウィンドウや保存の拒否で、触れるだけで例外になることがある。
// そのときは記録を空として扱い、画面は未着手のまま動かす。配列でない値は読み飛ばす
export function loadSolved(storage?: Pick<Storage, 'getItem'>): Solved {
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(KEY) ?? '{}');
    return Object.fromEntries(Object.entries(data).filter(([, solved]) => Array.isArray(solved))) as Solved;
  } catch {
    return {};
  }
}

// 演習に正解したことを残す。保存できなくても答え合わせは続けられるよう、例外を投げない
export function recordSolved(lesson: string, exercise: number, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  try {
    const target = storage ?? localStorage;
    const solved = loadSolved(target);
    solved[lesson] = [...new Set([...(solved[lesson] ?? []), exercise])].sort((a, b) => a - b);
    target.setItem(KEY, JSON.stringify(solved));
  } catch {
    // 保存できないときは、記録を残さないだけ
  }
}

// 全問正解で修了、1 問以上の正解で途中。模範解答を開いたかどうかは問わない。
// 演習を減らしたあとの古い番号は数えない。演習は 1 問以上ある（レッスンファイルのスキーマで縛っている）
export function lessonProgress(solved: number[] | undefined, exerciseCount: number): LessonProgress {
  const count = new Set((solved ?? []).filter((i) => i < exerciseCount)).size;
  if (count === exerciseCount) return 'done';
  return count > 0 ? 'doing' : 'todo';
}

// レベルのレッスン（並び順どおり）の進捗をまとめる。next は修了していない最初のレッスンの位置で、すべて修了なら -1。
// started は、どれか 1 本でも手を付けたか（「続きから」と「最初のレッスンから始める」の出し分けに使う）
export function levelProgress(lessons: { id: string; exercises: number }[], solved: Solved) {
  const progress = lessons.map((l) => lessonProgress(solved[l.id], l.exercises));
  return {
    progress,
    doneCount: progress.filter((p) => p === 'done').length,
    next: progress.findIndex((p) => p !== 'done'),
    started: progress.some((p) => p !== 'todo'),
  };
}
