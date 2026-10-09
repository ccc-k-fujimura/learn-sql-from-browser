import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createDb, type DbState } from './client';
import type { WorkerMessage, WorkerRequest } from './run';

// Worker の代わり。spawn に渡すと、作られた Worker をテストから動かせる
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: WorkerMessage }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: WorkerRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: WorkerRequest) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  say(data: WorkerMessage) {
    this.onmessage?.({ data });
  }
  crash(message: string) {
    this.onerror?.({ message });
  }
}
const ok = { ok: true, result: null } as const;
const done = (id: number): WorkerMessage => ({ type: 'result', id, result: ok });

function setup() {
  const states: DbState[] = [];
  const db = createDb(() => new FakeWorker() as unknown as Worker, (s) => states.push(s));
  return { db, states, worker: (i = FakeWorker.all.length - 1) => FakeWorker.all[i]! };
}

beforeEach(() => {
  FakeWorker.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

// 起動を終えた状態から始める
function ready() {
  const t = setup();
  t.worker().say({ type: 'ready' });
  return t;
}
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

test('起動中は loading、起動が終わると ready になる', () => {
  const { states, worker } = setup();
  expect(states).toEqual(['loading']);
  worker().say({ type: 'ready' });
  expect(states).toEqual(['loading', 'ready']);
});

test('実行を Worker に渡し、返事をそのまま返す', async () => {
  const { db, worker } = ready();
  const res = db.run('SELECT 1;');
  await tick();
  expect(worker().posted).toEqual([{ id: 1, sql: 'SELECT 1;' }]);
  worker().say(done(1));
  expect(await res).toEqual(ok);
});

test('起動に失敗すると fatal になり、実行は拒否される', async () => {
  const { db, states, worker } = setup();
  worker().say({ type: 'fatal', message: 'wasm が読めない' });
  expect(states).toEqual(['loading', 'fatal']);
  await expect(db.run('SELECT 1;')).rejects.toThrow('wasm が読めない');
});

test('起動の途中で Worker が落ちたら fatal。起動したあとに落ちても、状態は変えない', async () => {
  const booting = setup();
  booting.worker().crash('boom');
  expect(booting.states).toEqual(['loading', 'fatal']);
  await expect(booting.db.run('SELECT 1;')).rejects.toThrow('boom');

  const running = ready();
  running.worker().crash('boom');
  expect(running.states).toEqual(['loading', 'ready']);
});

test('1 秒たっても返事がなければ onSlow を呼ぶ。早く終われば呼ばない', async () => {
  const { db, worker } = ready();
  const onSlow = vi.fn();
  const fast = db.run('SELECT 1;', onSlow);
  await tick(500);
  worker().say(done(1));
  await fast;
  await tick(5000);
  expect(onSlow).not.toHaveBeenCalled();

  const slow = db.run('SELECT 2;', onSlow);
  await tick(999);
  expect(onSlow).not.toHaveBeenCalled();
  await tick(1);
  expect(onSlow).toHaveBeenCalledTimes(1);
  worker().say(done(2));
  await slow;
});

test('stop すると、Worker を捨てて作り直し、待っていた実行は cancelled で返る', async () => {
  const { db, states, worker } = ready();
  const res = db.run('SELECT count(*) FROM generate_series(1, 1e12);');
  await tick();
  db.stop();
  expect(await res).toEqual({ ok: false, stopped: 'cancelled' });
  expect(worker(0).terminated).toBe(true);
  expect(FakeWorker.all).toHaveLength(2);
  expect(states).toEqual(['loading', 'ready', 'restarting']);
  worker(1).say({ type: 'ready' });
  expect(states.at(-1)).toBe('ready');
});

test('作り直しのあいだに実行すると、新しい Worker が起動してから渡す。待つあいだは時間に数えない', async () => {
  const { db, worker } = ready();
  db.stop();
  const onSlow = vi.fn();
  const res = db.run('SELECT 1;', onSlow);
  await tick(60_000);
  expect(worker(1).posted).toEqual([]);
  expect(onSlow).not.toHaveBeenCalled();
  expect(worker(1).terminated).toBe(false);

  worker(1).say({ type: 'ready' });
  await tick();
  expect(worker(1).posted).toEqual([{ id: 1, sql: 'SELECT 1;' }]);
  expect(worker(0).posted).toEqual([]);
  await tick(999);
  expect(onSlow).not.toHaveBeenCalled();
  await tick(1);
  expect(onSlow).toHaveBeenCalledTimes(1);
  worker(1).say(done(1));
  expect(await res).toEqual(ok);
});

test('作り直しの途中で stop を重ねても、Worker を増やさない', () => {
  const { db, worker } = ready();
  db.stop();
  db.stop();
  expect(FakeWorker.all).toHaveLength(2);
  expect(worker(1).terminated).toBe(false);
});

test('10 秒たっても返事がなければ、自動で止める', async () => {
  const { db, worker } = ready();
  const res = db.run('SELECT 1;');
  await tick(9999);
  expect(worker().terminated).toBe(false);
  await tick(1);
  expect(await res).toEqual({ ok: false, stopped: 'timedOut' });
  expect(worker(0).terminated).toBe(true);
  expect(FakeWorker.all).toHaveLength(2);
});

test('前に詰まった実行の後ろに並んだ実行は、まとめて止まる。timedOut になるのは、時間切れになった実行だけ', async () => {
  const { db } = ready();
  const stuck = db.run('SELECT 1;');
  await tick(100);
  const queued = db.run('SELECT 2;');
  await tick(9900); // stuck が 10 秒に達する。queued は 9.9 秒
  expect(await stuck).toEqual({ ok: false, stopped: 'timedOut' });
  expect(await queued).toEqual({ ok: false, stopped: 'cancelled' });
  await tick(60_000);
  expect(FakeWorker.all).toHaveLength(2); // queued のタイマーが、作り直した Worker を捨てない
});

test('終わった実行のタイマーは止まり、あとから Worker を捨てない', async () => {
  const { db, worker } = ready();
  const res = db.run('SELECT 1;');
  await tick();
  worker().say(done(1));
  await res;
  await tick(60_000);
  expect(worker().terminated).toBe(false);
  expect(FakeWorker.all).toHaveLength(1);
});
