import type { RunResult } from './run';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, (res: RunResult) => void>();
let seq = 0;

/** DB の起動が終わると解決し、起動に失敗すると拒否する */
export const ready = new Promise<void>((resolve, reject) => {
  worker.onerror = (e) => reject(new Error(e.message));
  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') return resolve();
    if (data.type === 'fatal') return reject(new Error(data.message));
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };
});

export async function run(sql: string): Promise<RunResult> {
  await ready;
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, sql });
  });
}
