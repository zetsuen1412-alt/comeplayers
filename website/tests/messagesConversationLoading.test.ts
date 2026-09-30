import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { ConversationReadTracker } from "../lib/chatClientPerformance";

// Execute the page's actual loader with controllable network requests; no UI copy snapshots.
const filename = resolve("app/messages/page.tsx");
const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let loaderSource = "";
function findLoader(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "loadConversation") loaderSource = node.getText(source);
  ts.forEachChild(node, findLoader);
}
findLoader(source);
assert.ok(loaderSource, "Community page must expose its conversation loader");
const loaderCode = ts.transpileModule(loaderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function deferred() {
  let resolvePromise!: (value: unknown) => void;
  let rejectPromise!: (reason: Error) => void;
  const promise = new Promise<unknown>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function harness() {
  const pending: Array<ReturnType<typeof deferred> & { url: string; signal: AbortSignal; body?: string }> = [];
  const state = { conversation: { room: { id: "old-room" }, messages: [{ message: "old" }] } as unknown, loading: false, loadError: "", error: "", rooms: [] as unknown[] };
  const request = { current: null as AbortController | null };
  const context = vm.createContext({
    AbortController,
    Error,
    CustomEvent: class { constructor(public type: string, public options?: unknown) {} },
    window: { dispatchEvent() {} },
    communityChannelSelection: null,
    userId: "test-user",
    conversationRequestRef: request,
    conversationReads: { current: new ConversationReadTracker() },
    roomsRef: { current: [] },
    isGroupRoom: () => true,
    setConversation: (value: unknown) => { state.conversation = value; },
    setLoadingMessages: (value: boolean) => { state.loading = value; },
    setConversationLoadError: (value: string) => { state.loadError = value; },
    setError: (value: string) => { state.error = value; },
    setRooms: (update: (current: unknown[]) => unknown[]) => { state.rooms = update(state.rooms); },
    authenticatedFetchJson: (url: string, options: { signal: AbortSignal; body?: string }) => {
      const task = { ...deferred(), url, signal: options.signal, body: options.body };
      pending.push(task);
      return task.promise;
    },
  });
  vm.runInContext(loaderCode, context);
  const load = vm.runInContext("loadConversation", context) as (roomId: string, silent?: boolean, channelId?: string) => Promise<void>;
  return { state, request, pending, load, switchAccount: (userId: string) => { context.userId = userId; } };
}

test("background refresh cannot swallow a pending conversation's visible failure and retry", async () => {
  const h = harness();
  const foreground = h.load("new-room", false, "general");
  await h.load("new-room", true, "general");
  assert.equal(h.pending.length, 1, "Refresh reuses the pending load instead of aborting it");
  assert.equal(h.pending[0].signal.aborted, false);
  h.pending[0].reject(new Error("Network unavailable"));
  await foreground;
  assert.equal(h.state.loading, false);
  assert.ok(h.state.loadError, "The old room must stay behind a visible retry state");
  assert.equal(h.request.current, null);

  const retry = h.load("new-room", false, "general");
  assert.equal(h.state.loadError, "");
  assert.equal(h.state.error, "");
  const data = { room: { id: "new-room" }, channel: { id: "general" }, messages: [{ message: "new" }] };
  h.pending[1].resolve(data);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.conversation, data);
  assert.equal(h.state.loading, false, "Marking read does not hold the chat spinner");
  h.pending[2].reject(new Error("Read receipt temporarily unavailable"));
  await retry;
  assert.equal(h.state.loadError, "");
  assert.equal(h.state.error, "");
  assert.equal(h.request.current, null);
});

test("finishing an aborted room load does not release the newer room's request guard", async () => {
  const h = harness();
  const oldLoad = h.load("room-a");
  const newLoad = h.load("room-b");
  assert.equal(h.pending[0].signal.aborted, true);
  const activeRequest = h.request.current;
  h.pending[0].reject(new Error("Aborted"));
  await oldLoad;
  assert.equal(h.request.current, activeRequest);
  assert.equal(h.state.loading, true);
  await h.load("room-b", true);
  assert.equal(h.pending.length, 2);
  h.pending[1].reject(new Error("Offline"));
  await newLoad;
  assert.equal(h.request.current, null);
  assert.ok(h.state.loadError);
});


test("unchanged community polls do not repeat read writes; new messages and channels still do", async () => {
  const h = harness();
  const loadSnapshot = async (channelId: string, messageId: string, expectReceipt: boolean, rejectReceipt = false) => {
    const before = h.pending.length;
    const running = h.load("group", true, channelId);
    h.pending[before].resolve({ room: { id: "group" }, channel: { id: channelId }, messages: [{ id: messageId, message: "Synthetic test" }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.pending.length - before, expectReceipt ? 2 : 1);
    if (expectReceipt) {
      assert.equal(h.pending[before + 1].url, "/api/messages/rooms/group/read");
      assert.deepEqual(JSON.parse(h.pending[before + 1].body || "{}"), { channelId, lastReadMessageId: messageId });
      if (rejectReceipt) h.pending[before + 1].reject(new Error("Receipt temporarily unavailable"));
      else h.pending[before + 1].resolve({ ok: true });
    }
    await running;
  };
  await loadSnapshot("general", "message-1", true);
  for (let poll = 0; poll < 40; poll++) await loadSnapshot("general", "message-1", false);
  await loadSnapshot("general", "message-2", true);
  await loadSnapshot("other-channel", "message-2", true);
  await loadSnapshot("general", "message-3", true, true);
  await loadSnapshot("general", "message-3", true);
  await loadSnapshot("general", "message-3", false);
  h.switchAccount("different-user");
  await loadSnapshot("general", "message-3", true);
  assert.equal(h.pending.filter(request => request.url.endsWith("/read")).length, 6);
});
