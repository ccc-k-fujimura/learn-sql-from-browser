import type { RunResult, WorkerMessage, WorkerRequest } from './run';

/** 実行を止めたときに、実行の結果の代わりに返す。timedOut は自分が 10 秒の時間切れになった実行で、cancelled はそれ以外（止める操作と、ほかの実行を止めた巻き添え） */
export type Stopped = { ok: false; stopped: 'timedOut' | 'cancelled' };
export type DbState = 'loading' | 'ready' | 'restarting' | 'fatal';

// 実行が 1 秒を超えたら止められるようにし、10 秒たったら自動で止める
const SLOW_MS = 1000;
const LIMIT_MS = 10_000;

/**
 * PGlite を動かす Worker の持ち主。PGlite には実行中のクエリを止める手段がないので、止めるときは Worker ごと捨てて作り直す。
 * Worker の作り方は spawn で渡す（テストでは偽物を渡す）。状態が変わるたびに onState を呼ぶ。
 */
export function createDb(spawn: () => Worker, onState: (state: DbState) => void) {
  const pending = new Map<number, (res: RunResult | Stopped) => void>();
  let seq = 0;
  let state: DbState;
  let worker: Worker;
  // DB の起動が終わると解決し、起動に失敗すると拒否する。作り直すたびに新しくなる
  let ready: Promise<void>;

  const setState = (s: DbState) => {
    state = s;
    onState(s);
  };

  function start(initial: 'loading' | 'restarting') {
    setState(initial);
    worker = spawn();
    ready = new Promise<void>((resolve, reject) => {
      const fail = (message: string) => {
        setState('fatal');
        reject(new Error(message));
      };
      // 起動したあとに落ちたときは何もしない。待っている実行は、10 秒の時間切れで止まり、Worker が作り直される
      worker.onerror = (e) => state !== 'ready' && fail(e.message);
      worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
        if (data.type === 'ready') {
          setState('ready');
          resolve();
        } else if (data.type === 'fatal') {
          fail(data.message);
        } else {
          pending.get(data.id)?.(data.result);
          pending.delete(data.id);
        }
      };
    });
    ready.catch(() => {}); // 失敗は state で伝える。実行を待っている側が拒否を受け取る
  }
  start('loading');

  // Worker を捨てて作り直す。待っている実行はすべて止める。timedOutId の実行だけは、時間切れとして返す。
  // 起動や作り直しの途中では何もしない（捨てた Worker の起動を待つ実行を作らないため）
  function restart(timedOutId?: number) {
    if (state !== 'ready') return;
    worker.terminate();
    for (const [id, resolve] of pending) resolve({ ok: false, stopped: id === timedOutId ? 'timedOut' : 'cancelled' });
    pending.clear();
    start('restarting');
  }

  /** onSlow は、実行が 1 秒を超えたときに 1 回呼ぶ。起動や作り直しを待つあいだは数えない */
  async function run(sql: string, onSlow?: () => void): Promise<RunResult | Stopped> {
    await ready;
    const id = ++seq;
    const result = new Promise<RunResult | Stopped>((resolve) => {
      pending.set(id, resolve);
      worker.postMessage({ id, sql } satisfies WorkerRequest);
    });
    // 時間は、依頼を Worker に渡してから数える
    const slow = onSlow && setTimeout(onSlow, SLOW_MS);
    const limit = setTimeout(() => restart(id), LIMIT_MS);
    try {
      return await result;
    } finally {
      clearTimeout(slow);
      clearTimeout(limit);
    }
  }

  return { run, stop: () => restart() };
}
