// Explicit release QA: only generated example.invalid accounts/rooms are changed.
// No notification or email is sent. Every generated row is cleaned up in finally.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { prepareFirstDevice, activateVerifiedDevice, prepareRecoveredDevice, type AccountSnapshot, type RecoveryTransport } from "../lib/e2ee/account";
import { createEpoch, openEpochKey, encryptHistory, decryptHistory, proveDeviceRequest, type DeviceSecrets, type HistoryEnvelope } from "../lib/e2ee/protocol";
import { sealPasswordRecovery, openPasswordRecovery } from "../lib/e2ee/passwordRecovery";
import { parseRecoveryPolicy, recoveryHeaders } from "../lib/e2ee/recoveryPolicy";
config({ path: ".env.local", quiet: true });
const base = process.env.CHAT_RELEASE_TEST_URL || "https://www.comeplayers.com";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [], rooms: string[] = [];
type Actor = { id: string; request: RecoveryTransport };
async function actor(): Promise<Actor> {
  const username = `qa_chat_${randomUUID().slice(0, 8)}`, email = `${username}@example.invalid`, password = `Qa!${randomUUID()}Aa9`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
  if (created.error) throw created.error;
  const id = created.data.user.id; users.push(id);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
  const request: RecoveryTransport = async <T>(path: string, init = {}) => {
    const r = await fetch(base + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${login.data.session!.access_token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
    const data = await r.json();
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}: ${data.error || "request failed"}`);
    return data as T;
  };
  await request("/api/account/session", { method: "POST" });
  return { id, request };
}
function signed(actor: Actor, device: DeviceSecrets): RecoveryTransport {
  return (path, init = {}) => {
    const body = init.body || "", proof = proveDeviceRequest(device, init.method || "GET", path, body);
    return actor.request(path, { ...init, headers: { ...init.headers, "x-cp-device": proof.deviceId, "x-cp-time": proof.timestamp, "x-cp-nonce": proof.nonce, "x-cp-proof": proof.signature } });
  };
}
try {
  assert.equal((await fetch(base + "/api/messages/secure/account/password", { method: "POST", body: "{}" })).status, 401);
  const a = await actor(), b = await actor(), plans = [];
  for (const user of [a, b]) {
    const state = await user.request<{ account: AccountSnapshot | null; recovery: unknown }>("/api/messages/secure/account");
    assert.equal(state.account, null);
    const policy = parseRecoveryPolicy(state.recovery); assert.equal(policy.allowDeviceSetup, true);
    const { plan } = prepareFirstDevice(user.id);
    const transport: RecoveryTransport = (path, init = {}) => user.request(path, { ...init, headers: { ...init.headers, ...recoveryHeaders(policy) } });
    let confirmed = false; await activateVerifiedDevice(plan, transport, async () => { confirmed = true; });
    assert.equal(confirmed, true); assert.equal(plan.backup?.passkey, undefined); plans.push({ plan, transport });
  }
  const [pa, pb] = plans, ar = signed(a, pa.plan.session.device), br = signed(b, pb.plan.session.device);
  const room = await a.request<{ room: { id: string } }>("/api/messages/contacts", { method: "POST", body: JSON.stringify({ userId: b.id }) }); rooms.push(room.room.id);
  const members = [pa, pb].map(p => ({ roster: p.plan.session.roster, admin: true }));
  const roots = new Map(members.map(m => [m.roster.identity.userId, m.roster.identity]));
  const { epoch, key } = await createEpoch(pa.plan.session.device, room.room.id, members, roots);
  await ar("/api/messages/secure/history/epoch", { method: "POST", body: JSON.stringify({ epoch }) });
  const message = { text: "Scoped automatic chat release verification" };
  const event = encryptHistory(pa.plan.session.device, epoch, key, message);
  await ar("/api/messages/secure/history", { method: "POST", body: JSON.stringify({ event, notify: false }) });
  const pulled = await br<{ events: { event: HistoryEnvelope }[] }>("/api/messages/secure/history?after=0");
  const received = pulled.events.find(row => row.event.id === event.id)!;
  assert.ok(received); assert.ok(!JSON.stringify(received).includes(message.text));
  assert.deepEqual(decryptHistory(received.event, epoch, await openEpochKey(epoch, pb.plan.session.device.identity, pb.plan.session.device.id)), message);
  const password = `backup-${randomUUID()}`, { recovery } = await sealPasswordRecovery(pa.plan.recoveryIdentity, password);
  const saved = await ar<{ passwordSignature: string }>("/api/messages/secure/account/password", { method: "POST", body: JSON.stringify({ recovery }) }); assert.equal(saved.passwordSignature, recovery.signature);
  const state = await a.request<{ account: AccountSnapshot }>("/api/messages/secure/account");
  const recoveryKey = await openPasswordRecovery(state.account.encrypted_backup.password!, password, state.account.roster.identity);
  const recovered = prepareRecoveredDevice(a.id, { ...state.account, encrypted_backup: recovery.backup }, recoveryKey);
  await activateVerifiedDevice(recovered, pa.transport, async () => {});
  assert.deepEqual(decryptHistory(event, epoch, await openEpochKey(epoch, recovered.recoveryIdentity)), message);
  console.log("PASS live API: two passkey-free accounts; encrypted message send/pull/decrypt; password recovery; recovered device can decrypt retained history; unauthenticated requests rejected.");
} finally {
  // IDs come only from this run. Never delete by prefix or broad time range.
  if (rooms.length) {
    for (const table of ["cp_secure_events", "cp_secure_epochs"]) { const r = await admin.from(table).delete().in("room_id", rooms); if (r.error) throw r.error; }
    const r = await admin.from("chat_rooms").delete().in("id", rooms); if (r.error) throw r.error;
  }
  for (const id of users) { const r = await admin.auth.admin.deleteUser(id); if (r.error) throw r.error; }
  console.log("Generated QA accounts and rooms removed.");
}
