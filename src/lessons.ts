// `intro/01-first-select.md` → `intro/first-select`。URL と進捗の識別に使う
export const lessonId = (entry: string) => entry.replace(/\.md$/, '').replace(/(^|\/)\d+-/g, '$1');
