import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as callPresence from "../lib/callPresence";

const caller = "10000000-0000-4000-8000-000000000001";
const callee = "20000000-0000-4000-8000-000000000002";
const callId = "30000000-0000-4000-8000-000000000003";
const roomId = "40000000-0000-4000-8000-000000000004";
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
type Options = {
  actor?: string; status?: string; answeredAt?: string; fail?: "room" | "block" | "profile";
  roomWait?: Promise<void>; blockWait?: Promise<void>; profileWait?: Promise<void>; deleteWait?: Promise<void>;
  race?: boolean; startError?: boolean;
};
function fixture(options: Options = {}) {
  const actor = options.actor || caller;
  let call = { id: callId, room_id: roomId, caller_id: caller, callee_id: callee, media: "audio", status: options.status || "accepted", created_at: new Date().toISOString(), answered_at: options.answeredAt ?? new Date().toISOString() };
  const after: Array<() => Promise<void>> = [];
  const started: string[] = [], activities: Array<Record<string, unknown>> = [], updates: string[] = [], deleted: string[] = [];
  let tokens = 0, push = 0, reads = 0, wonRace = false;
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "cp_start_call"); assert.equal(args.p_actor, actor); assert.equal(args.p_room, roomId);
      call = { ...call, status: "ringing" };
      return { data: { ...call }, error: options.startError ? { message: "already in a call" } : null };
    },
    from(table: string) {
      const filters = new Map<string, unknown>(); let scope: string | undefined, values: Record<string, unknown> | undefined;
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { filters.set(key, value); return query; },
        or(value: string) { scope = value; return query; }, update(value: Record<string, unknown>) { values = value; return query; },
        async maybeSingle() {
          if (table === "profiles") return { data: { username: "Tester" }, error: null };
          assert.equal(table, "cp_calls"); assert.equal(filters.get("id"), callId);
          if (values) {
            updates.push(String(values.status));
            if (options.race && !wonRace) { wonRace = true; call = { ...call, status: "accepted" }; return { data: null, error: null }; }
            assert.equal(filters.get("status"), call.status, "transition must compare the status read by this participant");
            call = { ...call, ...values };
            return { data: { id: call.id }, error: null };
          }
          reads++;
          if (reads === 1) assert.equal(scope, `caller_id.eq.${actor},callee_id.eq.${actor}`, "initial lookup is scoped to the authenticated participant");
          return { data: actor === caller || actor === callee ? { ...call } : null, error: null };
        },
        async single() {
          assert.equal(table, "profiles"); assert.equal(filters.get("id"), actor);
          started.push("profile"); await options.profileWait;
          return { data: { username: "Tester", full_name: null }, error: options.fail === "profile" ? new Error("profile unavailable") : null };
        },
      };
      return query;
    },
  };
  const fail = (kind: string) => { if (options.fail === kind) throw Object.assign(new Error(`Denied ${kind}`), { status: 403 }); };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) }, after: (task: () => Promise<void>) => { after.push(task); } },
    "@/lib/serverSupabase": { requireAuthenticatedUser: async () => ({ id: actor }), createSupabaseAdmin: () => db },
    "@/lib/accountApi": { inputError: (message: string, status = 400) => Object.assign(new Error(message), { status }), accountApiError: (error: { status?: number }) => Response.json({ error: "failed" }, { status: error.status || 500 }) },
    "@/lib/chatServer": { requireChatRoomAccess: async (input: Record<string, unknown>) => {
      assert.equal(input.roomId, roomId); assert.equal(input.userId, actor); assert.equal(input.allowAdmin, false);
      started.push("room"); await options.roomWait; fail("room"); return { room: { id: roomId } };
    } },
    "@/lib/chatContacts": { assertContactAllowed: async (_db: unknown, user: string, target: string) => {
      assert.equal(user, actor); assert.equal(target, actor === caller ? callee : caller);
      started.push("block"); await options.blockWait; fail("block");
    } },
    "@/lib/livekitServer": {
      getLiveKitServerUrl: () => "wss://example.test",
      createDirectCallToken: async (input: Record<string, unknown>) => { tokens++; assert.equal(input.userId, actor); assert.equal(input.roomName, `cp-call-${callId}`); return "verified-token"; },
      createLiveKitRoomServiceClient: () => ({ deleteRoom: async (name: string) => { deleted.push(name); await options.deleteWait; } }),
    },
    "@/lib/privateMessaging": { limitedBody: (request: Request) => request.text(), uuid: (value: unknown) => value, privateRoom: async (_db: unknown, user: string, id: string) => { assert.equal(user, actor); assert.equal(id, roomId); return { room: { id: roomId }, target: callee }; }, privateActor: async () => {} },
    "@/lib/secureHistoryProtocol": { secureActor: async () => {} },
    "@/lib/callPresence": callPresence,
    "@/lib/callRoomActivity": { recordCallRoomActivity: async (_db: unknown, input: Record<string, unknown>) => { activities.push(input); } },
    "@/lib/pushNotifications": { sendCallPushNotifications: async () => { push++; } },
    "@/lib/callRevisionEvents": { callRevisionEventsEnabled: () => false },
  };
  const { outputText } = ts.transpileModule(readFileSync("app/api/messages/calls/route.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports: Record<string, (request: Request) => Promise<Response>> = {};
  runInNewContext(outputText, { exports, require: (name: string) => { assert.ok(name in mocks, `Missing ${name}`); return mocks[name]; }, console, URL, Request, Response, Date });
  return { route: exports, after, started, activities, updates, deleted, tokens: () => tokens, push: () => push, call: () => call };
}
const patch = (f: ReturnType<typeof fixture>, action = "token") => f.route.PATCH(new Request("https://example.test/api/messages/calls", { method: "PATCH", body: JSON.stringify({ id: callId, action }) }));
const tick = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };

test("token authorization starts three independent checks together and never issues early", async () => {
  const room = deferred(), block = deferred(), profile = deferred();
  const f = fixture({ roomWait: room.promise, blockWait: block.promise, profileWait: profile.promise });
  const response = patch(f);
  await tick();
  assert.deepEqual(f.started.sort(), ["block", "profile", "room"]);
  assert.equal(f.tokens(), 0);
  profile.resolve(); room.resolve(); await tick();
  assert.equal(f.tokens(), 0, "a pending contact block check still prevents the token");
  block.resolve();
  assert.equal((await response).status, 200); assert.equal(f.tokens(), 1);
});

test("failed room, block or profile checks never create a participant token", async () => {
  for (const fail of ["room", "block", "profile"] as const) {
    const f = fixture({ fail });
    const result = await patch(f);
    assert.equal(result.status, fail === "profile" ? 500 : 403);
    assert.equal(f.tokens(), 0); assert.equal(f.after.length, 0);
  }
});

test("foreign, expired, ended and malformed calls never reach token authorization", async () => {
  for (const options of [{ actor: "outsider" }, { answeredAt: "2020-01-01T00:00:00Z" }, { status: "ended" }, { answeredAt: "invalid" }]) {
    const f = fixture(options);
    assert.equal((await patch(f)).status, options.actor ? 404 : 409);
    assert.equal(f.tokens(), 0); assert.equal(f.started.length, 0);
  }
});

test("committed call start responds before inbox activity and push work", async () => {
  const f = fixture();
  const result = await f.route.POST(new Request("https://example.test/api/messages/calls", { method: "POST", body: JSON.stringify({ roomId, media: "audio" }) }));
  assert.equal(result.status, 201); assert.equal(f.activities.length, 0); assert.equal(f.push(), 0);
  assert.equal(f.after.length, 2);
  await Promise.all(f.after.map(task => task()));
  assert.equal(f.activities.length, 1); assert.equal(f.activities[0].roomId, roomId); assert.equal(f.activities[0].status, "ringing");
  assert.equal(f.activities[0].occurredAt, f.call().created_at); assert.equal(f.push(), 1);
});

test("failed start and rejected state transitions never enqueue inbox activity", async () => {
  const failed = fixture({ startError: true });
  assert.equal((await failed.route.POST(new Request("https://example.test/api/messages/calls", { method: "POST", body: JSON.stringify({ roomId }) }))).status, 409);
  assert.equal(failed.after.length, 0);
  const rejected = fixture({ status: "ended", actor: callee });
  assert.equal((await patch(rejected, "accept")).status, 409); assert.equal(rejected.after.length, 0);
});

test("accept responds after its committed transition without waiting for inbox work", async () => {
  const f = fixture({ status: "ringing", actor: callee });
  assert.equal((await patch(f, "accept")).status, 200);
  assert.equal(f.call().status, "accepted"); assert.equal(f.activities.length, 0); assert.equal(f.after.length, 1);
  await f.after[0]();
  assert.equal(f.activities[0].status, "accepted"); assert.equal(f.activities[0].actorId, callee); assert.equal(f.activities[0].occurredAt, f.call().answered_at);
});

test("hang-up still waits for LiveKit room deletion and a raced accept is safely ended", async () => {
  const deletion = deferred();
  const f = fixture({ status: "ringing", race: true, deleteWait: deletion.promise });
  let responded = false;
  const response = patch(f, "end").then(result => { responded = true; return result; });
  await tick();
  assert.deepEqual(f.updates, ["cancelled", "ended"]);
  assert.deepEqual(f.deleted, [`cp-call-${callId}`]);
  assert.equal(responded, false, "LiveKit termination is security-critical and must remain awaited");
  deletion.resolve();
  assert.equal((await response).status, 200); assert.equal(f.after.length, 1); assert.equal(f.activities.length, 0);
  await f.after[0]();
  assert.equal(f.activities[0].status, "ended"); assert.equal(f.activities[0].roomId, roomId);
});
