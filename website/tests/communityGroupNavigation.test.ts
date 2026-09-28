import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual page handlers: no network, rendered copy of the handler,
// or user session. This catches state left behind by switching groups.
const source = readFileSync(new URL("../app/messages/page.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["selectServer", "openRoom", "isGroupRoom", "isTradeRoom"]);
const functions: string[] = [];
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) functions.push(node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(functions.length, names.size);
const code = ts.transpileModule(`${functions.join("\n")}\n({ selectServer, openRoom });`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(width: number) {
  const state: Record<string, unknown> = {
    selectedRoomId: "group-a", selectedServerBundle: { community: { id: "server-a" } },
    communityChannelSelection: { roomId: "group-a", channel: { id: "channel-a" } },
    conversation: { room: { id: "group-a" }, messages: ["synthetic old message"] },
    serverViewMode: "home", mobileInboxOpen: false, showCommunityMenu: true,
    communityOverlay: "members", showSquadFinder: true, showMoreMenu: true,
    showPinnedPanel: true, showMemberPanel: true, showVoicePanel: true,
    search: "old room filter", draft: "Message intended for group A",
    replyingTo: { id: "reply-in-a" }, editingMessage: { id: "edit-in-a" },
  };
  const calls: string[] = [], urls: string[] = [], routes: string[] = [];
  const conversationRequestRef = { current: { abort: () => { calls.push("abort-old-request"); } } as { abort: () => void } | null };
  const deepLinkServerIdRef = { current: "server-a" }, deepLinkChannelIdRef = { current: "channel-a" };
  const globals: Record<string, unknown> = {
    ...state, conversationRequestRef, deepLinkServerIdRef, deepLinkChannelIdRef,
    window: {
      matchMedia(query: string) { assert.equal(query, "(max-width: 1023px)"); return { matches: width <= 1023 }; },
      history: { replaceState(_state: unknown, _unused: string, url: string) { urls.push(url); } },
    },
    router: { push(url: string) { routes.push(url); } },
  };
  for (const name of Object.keys(state)) {
    globals[`set${name[0].toUpperCase()}${name.slice(1)}`] = (value: unknown) => { calls.push(name); state[name] = value; };
  }
  const handlers = runInNewContext(code, globals) as {
    selectServer: (id: string) => void;
    openRoom: (room: { id: string; room_type?: string; product_id?: number; order_id?: number; server?: { id: string } }) => void;
  };
  return { state, calls, urls, routes, conversationRequestRef, deepLinkServerIdRef, deepLinkChannelIdRef, ...handlers };
}

for (const width of [390, 1023, 1024, 1440]) {
  test(`switching groups at ${width}px clears stale conversation and composer before opening the new destination`, () => {
    const f = fixture(width);
    f.selectServer("group-b/encoded");
    assert.equal(f.calls[0], "abort-old-request");
    assert.equal(f.conversationRequestRef.current, null);
    assert.equal(f.state.selectedRoomId, "group-b/encoded");
    assert.equal(f.state.serverViewMode, "chat");
    assert.equal(f.state.mobileInboxOpen, width <= 1023, "Mobile must show the new group's channel list; desktop keeps the conversation visible");
    for (const key of ["selectedServerBundle", "communityChannelSelection", "conversation", "communityOverlay", "replyingTo", "editingMessage"]) assert.equal(f.state[key], null, key);
    for (const key of ["showCommunityMenu", "showSquadFinder", "showMoreMenu", "showPinnedPanel", "showMemberPanel", "showVoicePanel"]) assert.equal(f.state[key], false, key);
    assert.equal(f.state.search, "");
    assert.equal(f.state.draft, "", "Old draft must not become sendable to the newly selected group");
    assert.equal(f.deepLinkServerIdRef.current, ""); assert.equal(f.deepLinkChannelIdRef.current, "");
    assert.deepEqual(f.urls, ["/cpcommunity?room=group-b%2Fencoded"]);
    assert.deepEqual(f.routes, []);
  });
}

for (const width of [390, 1440]) {
  test(`selecting the current group at ${width}px preserves its channel, request, draft and reply`, () => {
    const f = fixture(width), before = structuredClone(f.state), request = f.conversationRequestRef.current;
    f.selectServer("group-a");
    assert.deepEqual(f.calls, width <= 1023 ? ["mobileInboxOpen"] : []);
    assert.deepEqual(f.state, { ...before, ...(width <= 1023 ? { mobileInboxOpen: true } : {}) });
    assert.equal(f.conversationRequestRef.current, request);
    assert.equal(f.deepLinkServerIdRef.current, "server-a"); assert.equal(f.deepLinkChannelIdRef.current, "channel-a");
    assert.deepEqual(f.urls, []);
  });
}

test("legacy groups without a community record use the same safe room-ID navigation", () => {
  const f = fixture(390);
  f.openRoom({ id: "legacy-group", room_type: "group" });
  assert.equal(f.state.selectedRoomId, "legacy-group");
  assert.equal(f.state.communityChannelSelection, null);
  assert.equal(f.state.conversation, null);
  assert.equal(f.state.mobileInboxOpen, true);
  assert.deepEqual(f.urls, ["/cpcommunity?room=legacy-group"]);
});

test("order-linked conversations keep their private-chat route instead of entering the group rail", () => {
  const f = fixture(390), before = structuredClone(f.state);
  f.openRoom({ id: "trade/room", order_id: 123 });
  assert.deepEqual(f.routes, ["/chat?room=trade%2Froom"]);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.state, before);
});
