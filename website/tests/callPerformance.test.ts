import assert from "node:assert/strict";
import { test } from "node:test";
import { createCallMonitor } from "../lib/callMonitor";
import { directCallRoomOptions } from "../lib/directCallMedia";

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("two call surfaces share 21 reads/minute and unchanged snapshots do not rerender", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0, notifications = 0;
  const monitor = createCallMonitor(async () => { reads++; return [{ id: "call", status: "accepted" }]; });
  const stopA = monitor.subscribe(() => notifications++), stopB = monitor.subscribe(() => notifications++);
  await settle();
  for (let i = 0; i < 20; i++) { t.mock.timers.tick(3000); await settle(); }
  assert.equal(reads, 21, "previous independent 1.5s/3s loops issued about 62 reads/minute");
  assert.equal(notifications, 2, "one initial notification per subscriber");
  stopA(); stopB(); t.mock.timers.tick(60_000); await settle(); assert.equal(reads, 21);
});

test("slow polling never overlaps and mutation invalidation discards the in-flight stale result", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending: Array<(value: string[]) => void> = [];
  const seen: string[][] = [];
  const monitor = createCallMonitor<string[]>(() => new Promise(resolve => pending.push(resolve)));
  const stop = monitor.subscribe(value => seen.push(value));
  t.mock.timers.tick(30_000); assert.equal(pending.length, 1);
  void monitor.refresh(); void monitor.refresh();
  pending[0](["ringing"]); await settle();
  assert.deepEqual(seen, []);
  t.mock.timers.tick(0); await settle(); assert.equal(pending.length, 2);
  pending[1](["accepted"]); await settle(); assert.deepEqual(seen, [["accepted"]]);
  stop();
});

test("explicit refresh delivers an unchanged state skipped while a mutation was pending", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen: string[][] = [];
  const monitor = createCallMonitor(async () => ["ended"]);
  const stop = monitor.subscribe(value => seen.push(value));
  await settle(); await monitor.refresh();
  assert.deepEqual(seen, [["ended"], ["ended"]]);
  stop();
});

test("failure preserves active media state and the final unmount aborts pending reads", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  let signal: AbortSignal | undefined;
  const seen: string[][] = [];
  const monitor = createCallMonitor(async current => {
    signal = current;
    if (++reads === 1) return ["accepted"];
    if (reads === 2) throw new Error("offline");
    return await new Promise<string[]>(() => {});
  });
  const stop = monitor.subscribe(value => seen.push(value)); await settle();
  t.mock.timers.tick(3000); await settle(); assert.deepEqual(seen, [["accepted"]]);
  t.mock.timers.tick(3000); await settle(); stop(); assert.equal(signal?.aborted, true);
});

test("direct-call media uses bounded encoding while preserving speech loss recovery", () => {
  const publish = directCallRoomOptions.publishDefaults!;
  assert.equal(publish.videoEncoding?.maxBitrate, 500_000);
  assert.equal(publish.videoEncoding?.maxFramerate, 20);
  assert.equal(publish.simulcast, false);
  assert.equal(publish.audioPreset?.maxBitrate, 24_000);
  assert.equal(publish.red, true);
  assert.equal(publish.dtx, true);
  assert.equal(directCallRoomOptions.audioCaptureDefaults?.echoCancellation, true);
  assert.equal(directCallRoomOptions.adaptiveStream, true);
});
