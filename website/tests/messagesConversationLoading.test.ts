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
let loaderSource = "", visibilitySource = "", backgroundSource = "";
function findLoader(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "loadConversation") loaderSource += node.getText(source);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "isCurrentConversation") loaderSource += node.getText(source);
  if (ts.isArrowFunction(node) && node.body.getText(source).includes("conversationVisibleRef.current = conversationVisible")) visibilitySource = node.getText(source);
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].body.getText(source).includes("if (active && selectedRoomId && conversationVisibleRef.current)")) backgroundSource = node.arguments[0].getText(source);
  ts.forEachChild(node, findLoader);
}
findLoader(source);
assert.ok(loaderSource, "Community page must expose its conversation loader");
const loaderCode = ts.transpileModule(loaderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const visibilityCode = ts.transpileModule(`const changeVisibility = ${visibilitySource};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const backgroundCode = ts.transpileModule(`const startBackground = ${backgroundSource};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

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
  const view = { current: true };
  const scope = { current: { userId: "test-user", roomId: "", channelId: "" } };
  let followCalls = true, roomRefreshes = 0;
  const context = vm.createContext({
    AbortController,
    Error,
    CustomEvent: class { constructor(public type: string, public options?: unknown) {} },
    window: { dispatchEvent() {}, setInterval, clearInterval },
    navigator: { onLine: true }, selectedRoomId: "group", selectedChannelId: "",
    loadRooms: async () => { roomRefreshes++; },
    communityChannelSelection: null,
    userId: "test-user",
    conversationRequestRef: request,
    conversationVisibleRef: view,
    conversationScopeRef: scope,
    conversationVisible: true, typingVisible: true, typingVisibleRef: { current: true },
    document: { visibilityState: "visible" },
    setTypingUsers() {}, signalTyping() {},
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
  vm.runInContext(loaderCode + "\n" + visibilityCode + "\n" + backgroundCode, context);
  const load = vm.runInContext("loadConversation", context) as (roomId: string, silent?: boolean, channelId?: string) => Promise<void>;
  return {
    state, request, pending,
    load(roomId: string, silent = false, channelId = "") {
      if (followCalls) {
        scope.current = { userId: context.userId, roomId, channelId };
        context.selectedRoomId = roomId; context.selectedChannelId = channelId;
      }
      return load(roomId, silent, channelId);
    },
    setScope(roomId: string, channelId: string) {
      followCalls = false; scope.current = { userId: context.userId, roomId, channelId };
      context.selectedRoomId = roomId; context.selectedChannelId = channelId;
      context.communityChannelSelection = { roomId, channel: { id: channelId } };
    },
    loadDefault: (roomId: string) => load(roomId, true),
    startBackground: () => vm.runInContext("startBackground()", context) as () => void,
    roomRefreshes: () => roomRefreshes,
    setVisible(visible: boolean) {
      context.conversationVisible = visible; context.typingVisible = visible;
      vm.runInContext("changeVisibility()", context);
    },
    switchAccount: (userId: string) => { context.userId = userId; },
  };
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

test("hidden panes skip history and never acknowledge an unseen snapshot", async () => {
  const h = harness();
  h.setScope("group", "general");
  h.setVisible(false);
  await h.load("group", true, "general");
  assert.equal(h.pending.length, 0);
  h.setVisible(true);
  const opening = h.load("group", false, "general");
  const cached = h.state.conversation;
  h.setVisible(false);
  assert.equal(h.pending[0].signal.aborted, true);
  h.pending[0].resolve({ room: { id: "group" }, channel: { id: "general" }, messages: [{ id: "unseen" }] });
  await opening;
  assert.equal(h.pending.length, 1);
  assert.equal(h.state.conversation, cached, "Hiding must preserve the previous visible content");
  h.setVisible(true);
  const reopening = h.load("group", false, "general");
  h.pending[1].resolve({ room: { id: "group" }, channel: { id: "general" }, messages: [{ id: "unseen" }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.pending[2].url, "/api/messages/rooms/group/read");
  h.pending[2].resolve({ ok: true });
  await reopening;
});

test("delayed actions for an old room or channel cannot load or mark the new selection read", async () => {
  const h = harness();
  h.setScope("selected-room", "selected-channel");
  await h.load("old-room", true, "old-channel");
  await h.load("selected-room", true, "old-channel");
  assert.equal(h.pending.length, 0);
  const loading = h.load("selected-room", true, "selected-channel");
  const previous = h.state.conversation;
  h.setScope("selected-room", "another-channel");
  h.pending[0].resolve({ room: { id: "selected-room" }, channel: { id: "selected-channel" }, messages: [{ id: "late" }] });
  await loading;
  assert.equal(h.pending.length, 1);
  assert.equal(h.state.conversation, previous);
});

test("an in-flight read receipt cannot clear unread counts after the pane is hidden", async () => {
  const h = harness();
  h.setScope("group", "general");
  h.state.rooms = [{ id: "group", unread_count: 3 }];
  const loading = h.load("group", false, "general");
  h.pending[0].resolve({ room: { id: "group" }, channel: { id: "general" }, messages: [{ id: "visible" }] });
  await new Promise(resolve => setImmediate(resolve));
  h.setVisible(false);
  h.pending[1].resolve({ ok: true });
  await loading;
  assert.equal((h.state.rooms[0] as { unread_count: number }).unread_count, 3);
});

test("the actual inbox interval keeps unread summaries current while hidden history stays idle", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const h = harness();
  h.setScope("group", "general"); h.setVisible(false);
  const stop = h.startBackground();
  t.mock.timers.tick(15_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.roomRefreshes(), 1);
  assert.equal(h.pending.length, 0);
  h.setVisible(true);
  t.mock.timers.tick(15_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.roomRefreshes(), 2);
  assert.equal(h.pending.length, 1);
  assert.equal(h.pending[0].url, "/api/messages/rooms/group?limit=80&channel=general");
  h.pending[0].reject(new Error("Synthetic offline failure"));
  await new Promise(resolve => setImmediate(resolve));
  stop();
});

test("a late authorization failure for another channel cannot clear the current conversation", async () => {
  const h = harness();
  h.setScope("group", "old-channel");
  const previous = h.state.conversation;
  const loading = h.load("group", false, "old-channel");
  h.setScope("group", "new-channel");
  h.pending[0].reject(Object.assign(new Error("Old channel inaccessible"), { status: 403 }));
  await loading;
  assert.equal(h.state.conversation, previous);
  assert.equal(h.state.loadError, "");
});

test("an initially unresolved channel is not a wildcard after the user selects another channel", async () => {
  const h = harness();
  h.setScope("group", "");
  const previous = h.state.conversation;
  const loading = h.load("group", false, "");
  h.setScope("group", "selected");
  h.pending[0].resolve({ room: { id: "group" }, channel: { id: "default" }, messages: [{ id: "unseen-default" }] });
  await loading;
  assert.equal(h.pending.length, 1);
  assert.equal(h.state.conversation, previous);
});

test("default refreshes use the selected channel and reject mismatched response channels before rendering", async () => {
  const h = harness();
  h.setScope("group", "selected");
  const previous = h.state.conversation;
  const loading = h.loadDefault("group");
  assert.equal(h.pending[0].url, "/api/messages/rooms/group?limit=80&channel=selected");
  h.pending[0].resolve({ room: { id: "group" }, channel: { id: "default" }, messages: [{ id: "wrong-channel" }] });
  await loading;
  assert.equal(h.pending.length, 1);
  assert.equal(h.state.conversation, previous);
});

test("community summaries use room totals without showing another room's cached members", () => {
  let membersSource = "", countSource = "";
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "conversationMembers" && node.initializer && ts.isCallExpression(node.initializer)) membersSource = node.initializer.arguments[0].getText(source);
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "conversationMemberCount") countSource = node.initializer!.getText(source);
    ts.forEachChild(node, find);
  }
  find(source);
  const context = vm.createContext({
    conversation: { room: { id: "old-room" }, members: [{ user_id: "old-member" }] },
    selectedRoom: { id: "selected-room", member_count: 12 },
    selectedRoomId: "selected-room",
  });
  const members = vm.runInContext(`(${membersSource})()`, context);
  assert.equal(members.length, 0);
  context.conversationMembers = members;
  assert.equal(vm.runInContext(countSource, context), 12);
  context.selectedRoom = { id: "different-room", member_count: 99 };
  assert.equal(vm.runInContext(countSource, context), 0);
});
