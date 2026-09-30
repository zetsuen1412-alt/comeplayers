import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function fixture(denied = false, authenticated = true) {
  let historyQueries = 0, accessChecks = 0;
  const room = { id: "room-id", room_type: "product", product_id: 23, order_id: null, last_message: "private body", buyer_id: "actor", seller_id: "other" };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/apiErrors": { safeApiErrorMessage: () => "Unavailable" },
    "@/lib/callRoomActivity": { callActivityPreview: () => null },
    "@/lib/chatServer": {
      requireChatRoomAccess: async (input: {userId: string; allowAdmin: boolean}) => {
        accessChecks++; assert.equal(input.userId, "actor"); assert.equal(input.allowAdmin, false);
        if (denied) throw Object.assign(new Error("Forbidden"), {status: 403});
        return {room, role: "buyer"};
      },
      chatErrorStatus: (error: {status?: number}) => error.status || 500,
    },
    "@/lib/communityServer": {},
    "@/lib/chatStream": {},
    "@/lib/serverSupabase": {
      requireAuthenticatedUser: async () => { if (!authenticated) throw Object.assign(new Error("Login"), {status: 401}); return {id: "actor"}; },
      createSupabaseAdmin: () => ({ from: () => { historyQueries++; throw new Error("Unexpected history query"); } }),
    },
  };
  const {outputText} = ts.transpileModule(readFileSync("app/api/messages/rooms/[id]/route.ts", "utf8"), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}});
  const exports: {GET?: (r: Request, context: unknown) => Promise<Response>} = {};
  runInNewContext(outputText, {exports, require: (name: string) => {assert.ok(name in mocks, name); return mocks[name];}, console, URL, Request, Response});
  return {read: () => exports.GET!(new Request("https://example.test/api/messages/rooms/room-id?summary=1"), {params: Promise.resolve({id: "room-id"})}), history: () => historyQueries, access: () => accessChecks};
}

test("call routing summary returns only metadata after room authorization without loading messages", async () => {
  const f = fixture(); const response = await f.read();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {room: {id: "room-id", room_type: "product", product_id: 23, order_id: null}});
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(f.access(), 1); assert.equal(f.history(), 0);
});
test("room summary keeps participant authorization and authentication", async () => {
  for (const [denied, authenticated, status] of [[true, true, 403], [false, false, 401]] as const) {
    const f = fixture(denied, authenticated); const response = await f.read();
    assert.equal(response.status, status); assert.equal(f.history(), 0);
  }
});
