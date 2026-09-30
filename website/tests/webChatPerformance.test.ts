import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ConversationReadTracker, expireTypingEntries, sameTypingEntries, sameUserIds, recentAutomaticImages } from "../lib/chatClientPerformance";

test("idle typing expiry retains the same reference instead of rerendering the page 50 times per minute", () => {
  const empty = {};
  for (let tick = 0; tick < 1000; tick++) assert.equal(expireTypingEntries(empty, tick * 1200), empty);
  const active = { alice: { at: 1000, name: "Alice" }, bob: { at: 3000, name: "Bob" } };
  assert.equal(expireTypingEntries(active, 4000), active);
  const expired = expireTypingEntries(active, 5000);
  assert.deepEqual(expired, { bob: active.bob });
  assert.notEqual(expired, active);
  assert.equal(expireTypingEntries(expired, 6000), expired);
});

test("unchanged presence and typing snapshots compare membership rather than response object identities", () => {
  assert.equal(sameUserIds(new Set(["a", "b"]), new Set(["b", "a"])), true);
  assert.equal(sameUserIds(new Set(["a", "b"]), new Set(["a", "c"])), false);
  assert.equal(sameTypingEntries({}, {}), true);
  assert.equal(sameTypingEntries({ a: { name: "A", at: 4 } }, { a: { name: "A", at: 4 } }), true);
  assert.equal(sameTypingEntries({ a: { name: "A", at: 4 } }, { a: { name: "A", at: 5 } }), false);
  assert.equal(sameTypingEntries({ a: { name: "A", at: 4 } }, {}), false);
});

test("read boundaries preserve separate room/channel identities and retry failures", () => {
  const tracker = new ConversationReadTracker();
  assert.equal(tracker.needsRead("room", "general", "1"), true);
  // A failed request never calls confirm, so a refresh retries it.
  assert.equal(tracker.needsRead("room", "general", "1"), true);
  tracker.confirm("room", "general", "1");
  assert.equal(tracker.needsRead("room", "general", "1"), false);
  assert.equal(tracker.needsRead("room", "general", "2"), true);
  assert.equal(tracker.needsRead("room", "other", "1"), true);
  assert.equal(tracker.needsRead("different-room", "general", "1"), true);
  tracker.confirm("room", "empty", "");
  assert.equal(tracker.needsRead("room", "empty", ""), false);
});

function staticDependencyGraph(entry: string) {
  const visited = new Set<string>();
  function walk(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const spec = node.moduleSpecifier.text;
      const candidate = spec.startsWith("@/") ? path.resolve(spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : "";
      if (!candidate) continue;
      const target = [candidate + ".tsx", candidate + ".ts", path.join(candidate, "index.tsx"), path.join(candidate, "index.ts")].find(existsSync);
      if (target) walk(target);
    }
  }
  walk(path.resolve(entry));
  return visited;
}

test("Messages keeps removed game engines out of its imports and loads the voice panel only on demand", () => {
  const graph = staticDependencyGraph("app/messages/page.tsx");
  for (const game of ["ComePlayersChessGame", "ComePlayersMonopolyV21ArcadeGame", "ComePlayersSnakeGame", "ComePlayersStrikeArcadeGame", "CPFrontlineGame", "EmpiresAlliesGame"]) {
    assert.equal(graph.has(path.resolve("components/arcade/" + game + ".tsx")), false, game + " was removed from ComePlayers");
  }
  assert.equal(graph.has(path.resolve("components/messages/CommunityVoicePanel.tsx")), false);
});


// Execute the private view's real synchronizer against a synthetic local vault
// and network. This checks startup order and avoids a timing-only snapshot test.
function privateSynchronizer(changed: boolean, network?: Promise<boolean>) {
  const text = readFileSync(path.resolve("components/messages/SecureConversationView.tsx"), "utf8");
  const tree = ts.createSourceFile("view.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer = "";
  function walk(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "synchronize") initializer = node.initializer!.getText(tree);
    ts.forEachChild(node, walk);
  }
  walk(tree);
  assert.ok(initializer);
  const calls: string[] = [];
  const code = ts.transpileModule("const synchronize = " + initializer + "; synchronize;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sync = runInNewContext(code, {
    active: true, syncing: false, pendingSync: false, roomId: "synthetic-room", roomRef: { current: { id: "synthetic-room" } },
    document: { visibilityState: "visible" },
    messenger: {
      saveRoom: async () => { calls.push("save-room"); },
      sync: async () => { calls.push("network"); return network ? await network : changed; },
      markRead: async () => { calls.push("receipt"); },
    },
    refresh: async () => { calls.push("decrypt-local-history"); return 1000; },
    setBusy: (value: boolean) => { calls.push(value ? "busy" : "ready"); },
    setError: (value: string) => { throw new Error(value); },
  }) as (first?: boolean) => Promise<void>;
  return { sync, calls };
}

test("private idle sync does not repeatedly decrypt its 1,000-row message history", async () => {
  const h = privateSynchronizer(false);
  for (let poll = 0; poll < 40; poll++) await h.sync();
  assert.equal(h.calls.filter(call => call === "network").length, 40);
  assert.equal(h.calls.filter(call => call === "decrypt-local-history").length, 0);
  const update = privateSynchronizer(true);
  await update.sync();
  assert.deepEqual(update.calls, ["network", "decrypt-local-history"]);
});

test("private chat shows existing local messages while the network is still pending", async () => {
  let finish!: (value: boolean) => void;
  const network = new Promise<boolean>(resolve => { finish = resolve; });
  const h = privateSynchronizer(true, network);
  const opening = h.sync(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls, ["save-room", "decrypt-local-history", "ready", "network"]);
  finish(true);
  await opening;
  assert.deepEqual(h.calls.slice(4), ["decrypt-local-history", "receipt", "decrypt-local-history", "ready"]);
});


test("opening a thousand-image history schedules only the eight newest automatic previews", () => {
  const photos = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), secureAttachment: { mime: "image/jpeg" } }));
  assert.deepEqual(recentAutomaticImages(photos).map(message => message.id), ["992", "993", "994", "995", "996", "997", "998", "999"]);
  const mixed = [
    { id: "photo", secureAttachment: { mime: "image/webp" } },
    { id: "video", secureAttachment: { mime: "video/mp4" } },
    { id: "deleted", deleted_at: "2026-09-30", secureAttachment: { mime: "image/jpeg" } },
    { id: "text" },
  ];
  assert.deepEqual(recentAutomaticImages(mixed).map(message => message.id), ["photo"]);
});


test("the actual private preview effect permits only two automatic downloads in flight", () => {
  const source = readFileSync(path.resolve("components/messages/SecureConversationView.tsx"), "utf8");
  const tree = ts.createSourceFile("view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = "";
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" && node.arguments[0]?.getText(tree).includes("recentAutomaticImages(messages)")) callback = node.arguments[0].getText(tree);
    ts.forEachChild(node, walk);
  }
  walk(tree);
  assert.ok(callback);
  const messages = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), secureAttachment: { mime: "image/jpeg" } }));
  const inFlight = new Set<string>();
  const previews: Record<string, { url: string }> = {};
  const calls: string[] = [];
  const code = ts.transpileModule("const effect = " + callback + "; effect;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = runInNewContext(code, {
    messages, recentAutomaticImages, mediaInFlight: { current: inFlight }, previews: { current: previews }, mediaFailed: { current: new Set<string>() },
    openMedia: (message: { id: string }) => { calls.push(message.id); inFlight.add(message.id); },
  }) as () => void;
  run();
  assert.deepEqual(calls, ["992", "993"]);
  run();
  assert.equal(calls.length, 2, "A rerender must not start duplicate or extra downloads");
  while (inFlight.size) {
    const id = inFlight.values().next().value!;
    inFlight.delete(id);
    previews[id] = { url: "blob:synthetic" };
    run();
    assert.ok(inFlight.size <= 2);
  }
  assert.deepEqual(calls, ["992", "993", "994", "995", "996", "997", "998", "999"]);
});
