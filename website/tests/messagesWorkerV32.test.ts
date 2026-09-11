import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CHAT_PUSH_READY_QUEUE,
  createChatPushJob,
} from "../lib/backgroundJobs";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("V32 creates bounded chat push jobs without credentials", () => {
  const job = createChatPushJob({
    receiverIds: ["a", "a", "b"],
    senderName: "Sender",
    roomId: "room-1",
    preview: "Hello",
  });

  assert.equal(job.kind, "chat_push");
  assert.equal(job.version, 1);
  assert.deepEqual(job.payload.receiverIds, ["a", "b"]);
  assert.equal(job.maxAttempts, 5);
  assert.match(job.id, /^[0-9a-f-]{36}$/i);
  assert.equal(CHAT_PUSH_READY_QUEUE, "cp:v32:worker:chat-push:ready");
});

test("V32 uses Railway queue with safe direct fallback", () => {
  const env = read(".env.example");
  const jobs = read("lib/backgroundJobs.ts");
  const route = read("app/api/messages/rooms/[id]/messages/route.ts");

  assert.match(env, /BACKGROUND_WORKER_PUSH_ENABLED=false/);
  assert.match(jobs, /worker-disabled/);
  assert.match(jobs, /redis-unavailable/);
  assert.match(jobs, /enqueue-failed/);
  assert.match(jobs, /sendChatPushNotifications/);
  assert.match(route, /dispatchChatPushNotifications/);
  assert.equal(env.includes("NEXT_PUBLIC_BACKGROUND_WORKER"), false);
});
