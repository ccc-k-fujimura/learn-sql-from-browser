// `intro/01-first-select.md` → `intro/first-select`。URL と進捗の識別に使う
export const lessonId = (entry: string) => entry.replace(/\.md$/, '').replace(/(^|\/)\d+-/g, '$1');

// id からは番号を除いているので、並び順はファイルのパスの番号で決める
export const levelLessons = <T extends { id: string; filePath?: string }>(entries: T[], level: string) =>
  entries.filter((e) => e.id.startsWith(`${level}/`)).sort((a, b) => a.filePath!.localeCompare(b.filePath!, 'en', { numeric: true }));
