import test from "node:test";
import assert from "node:assert/strict";
import { fingerprint, newId, openMessage } from "../apps/mobile/src/secure/crypto";
import { prepareFirstDevice, prepareRecoveredDevice, type AccountSnapshot, type VerifiedSession } from "../apps/mobile/src/secure/accountRecovery";
import { epochHash, openIdentityBackup, rosterHash, type AccountRoster, type ConversationEpoch, type HistoryEnvelope } from "../apps/mobile/src/secure/multiDevice";
import { SecureHistorySync, type SecureBinaryTransport, type SecureTransport } from "../apps/mobile/src/secure/secureHistorySync";
import { secureEpochHash, verifySecureEpoch, verifySecureHistory } from "../../website/lib/secureHistoryProtocol";
import { verifyDeviceRequest } from "../../website/lib/secureAccountProtocol";

class MemoryVault {
  readonly rows = new Map<string, unknown>();
  readonly descriptor;
  constructor(session: VerifiedSession) {
    this.descriptor = { version: 1 as const, database: `cp-private-${newId()}.db`, deviceId: session.device.id, identity: session.device.identity, localKey: "00".repeat(32) };
    this.rows.set(`account-roster:${session.root.userId}`, session.roster);
  }
  get<T>(kind: string, id: string) { return Promise.resolve((this.rows.get(`${kind}:${id}`) as T | undefined) ?? null); }
  put(kind: string, id: string, value: unknown) { this.rows.set(`${kind}:${id}`, structuredClone(value)); return Promise.resolve(); }
  remove(kind: string, id: string) { this.rows.delete(`${kind}:${id}`); return Promise.resolve(); }
  list<T>(kind: string) { return Promise.resolve([...this.rows].filter(([key]) => key.startsWith(`${kind}:`)).map(([, value]) => structuredClone(value) as T)); }
}
type ServerEvent = { sequence: number; event: HistoryEnvelope; blob_id: string | null; server_created_at: string };
class MemoryHistoryServer {
  accounts = new Map<string, AccountRoster>();
  histories = new Map<string, AccountRoster[]>();
  epochs = new Map<string, ConversationEpoch[]>();
  events: ServerEvent[] = [];
  rooms = new Map<string, string[]>();
  corruptNextPull = false;
  failNextEventPosts = 0;
  contextGets = 0;
  blobs = new Map<string, { roomId: string; epochId: string; size: number; bytes?: Uint8Array; attachedEventId?: string }>();
  register(roster: AccountRoster) {
    this.accounts.set(roster.identity.userId, roster);
    const chain = this.histories.get(roster.identity.userId) || [];
    if (!chain.some(item => rosterHash(item) === rosterHash(roster))) chain.push(roster);
    this.histories.set(roster.identity.userId, chain.sort((a, b) => a.revision - b.revision));
  }
  transport(userId: string): SecureTransport {
    return async <T>(path: string, init = {}): Promise<T> => {
      const roster = this.accounts.get(userId); assert.ok(roster);
      const request = new Request(`https://comeplayers.com${path}`, { method: init.method || "GET", headers: init.headers });
      verifyDeviceRequest(request, init.body || "", userId, roster.devices);
      if (path.startsWith("/api/messages/secure/history/epoch?")) {
        this.contextGets += 1;
        const roomId = new URL(request.url).searchParams.get("roomId")!; this.authorize(userId, roomId);
        const members = this.rooms.get(roomId)!;
        return structuredClone({
          accounts: members.map(id => ({ userId: id, roster: this.accounts.get(id)!, rosterHash: rosterHash(this.accounts.get(id)!) })),
          rosterHistory: members.flatMap(id => this.histories.get(id)!.map(item => ({ user_id: id, revision: item.revision, roster: item, roster_hash: rosterHash(item) }))),
          epochs: (this.epochs.get(roomId) || []).map(epoch => ({ epoch, epochHash: epochHash(epoch), serverCreatedAt: new Date().toISOString() })),
        }) as T;
      }
      if (path === "/api/messages/secure/history/epoch" && init.method === "POST") {
        const epoch = JSON.parse(init.body!).epoch as ConversationEpoch, members = this.authorize(userId, epoch.roomId);
        const accounts = new Map(members.map(id => [id, { roster: this.accounts.get(id)!, roster_hash: rosterHash(this.accounts.get(id)!) }]));
        const list = this.epochs.get(epoch.roomId) || [], previous = list.at(-1);
        const verified = verifySecureEpoch(epoch, epoch.roomId, members, accounts, previous);
        const existing = list.find(item => item.id === verified.id);
        if (existing) assert.equal(epochHash(existing), epochHash(verified)); else list.push(verified);
        this.epochs.set(epoch.roomId, list);
        return { inserted: !existing, epochHash: secureEpochHash(verified) } as T;
      }
      if (path === "/api/messages/secure/history/blob" && init.method === "POST") {
        const body = JSON.parse(init.body!) as { roomId: string; epochId: string; size: number };
        this.authorize(userId, body.roomId);
        assert.equal(this.epochs.get(body.roomId)?.at(-1)?.id, body.epochId);
        const id = newId(); this.blobs.set(id, { ...body });
        return { id, url: `https://memory.invalid/upload/${id}` } as T;
      }
      if (path.startsWith("/api/messages/secure/history/blob?")) {
        const id = new URL(request.url).searchParams.get("id")!, blob = this.blobs.get(id); assert.ok(blob?.attachedEventId && blob.bytes);
        this.authorize(userId, blob.roomId);
        return { size: blob.size, url: `https://memory.invalid/download/${id}` } as T;
      }
      if (path === "/api/messages/secure/history" && init.method === "POST") {
        if (this.failNextEventPosts > 0) { this.failNextEventPosts -= 1; throw new Error("Connection timed out. Please try again."); }
        const event = JSON.parse(init.body!).event as HistoryEnvelope, members = this.authorize(userId, event.roomId);
        assert.ok(members.includes(event.senderId));
        const latest = this.epochs.get(event.roomId)?.at(-1); assert.ok(latest);
        if (event.epochId !== latest.id || latest.members.some(member => rosterHash(member.roster) !== rosterHash(this.accounts.get(member.roster.identity.userId)!))) throw new Error("Device authorization changed. Rotate the conversation key before sending.");
        const verified = verifySecureHistory(event, latest);
        if (event.blobId) {
          const blob = this.blobs.get(event.blobId); assert.ok(blob?.bytes && blob.bytes.length === blob.size && blob.roomId === event.roomId && blob.epochId === event.epochId && !blob.attachedEventId);
          blob.attachedEventId = event.id;
        }
        const existing = this.events.find(item => item.event.id === verified.id);
        if (!existing) this.events.push({ sequence: this.events.length + 1, event: verified, blob_id: verified.blobId, server_created_at: new Date().toISOString() });
        else assert.deepEqual(existing.event, verified);
        return { sequence: (existing || this.events.at(-1)!).sequence } as T;
      }
      if (path.startsWith("/api/messages/secure/history?")) {
        const after = Number(new URL(request.url).searchParams.get("after") || 0);
        let events = this.events.filter(item => item.sequence > after && this.rooms.get(item.event.roomId)?.includes(userId)).slice(0, 50);
        if (this.corruptNextPull && events.length) { events = structuredClone(events); events[0]!.event.ciphertext = "00" + events[0]!.event.ciphertext.slice(2); this.corruptNextPull = false; }
        return structuredClone({ events, next: events.at(-1)?.sequence || after, hasMore: events.length === 50 }) as T;
      }
      throw new Error(`Unhandled ${init.method || "GET"} ${path}`);
    };
  }
  binaryTransport: SecureBinaryTransport = async (url, init = {}) => {
    const parsed = new URL(url), id = parsed.pathname.split("/").at(-1)!, blob = this.blobs.get(id); assert.ok(blob);
    if (parsed.pathname.startsWith("/upload/")) {
      assert.equal(init.method, "PUT"); assert.ok(init.body); assert.equal(init.body.length, blob.size);
      blob.bytes = Uint8Array.from(init.body);
      return new Response(null, { status: 200 });
    }
    assert.ok(blob.bytes);
    return new Response(blob.bytes, { status: 200, headers: { "content-length": String(blob.bytes.length), "content-type": "application/octet-stream" } });
  };
  private authorize(userId: string, roomId: string) { const members = this.rooms.get(roomId); assert.ok(members?.includes(userId)); return [...members].sort(); }
}

test("retained ciphertext syncs across devices and survives every read cursor", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const av = new MemoryVault(alice.plan.session), bv = new MemoryVault(bob.plan.session);
  const a = new SecureHistorySync(av as never, server.transport(alice.plan.session.root.userId));
  const b = new SecureHistorySync(bv as never, server.transport(bob.plan.session.root.userId));
  const sent = await a.send(roomId, { kind: "message", text: "Halo dari perangkat A 🔒" });
  assert.equal(server.events.length, 1);
  assert.ok(!JSON.stringify(server.events).includes("Halo dari perangkat A"));
  const received = await b.sync();
  assert.deepEqual(received.map(item => item.payload), [sent.payload]);
  assert.equal(server.events.length, 1);
  assert.deepEqual(await b.sync(), []);
  assert.equal(server.events.length, 1);
  await b.send(roomId, { kind: "receipt", ids: [sent.event.id], read: true });
  const atAlice = await a.sync();
  assert.equal(atAlice.length, 2); // own retained event plus the encrypted receipt
  assert.equal(server.events.length, 2);
});

test("consecutive sends reuse verified room context instead of downloading the full key chain", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const sender = new SecureHistorySync(new MemoryVault(alice.plan.session) as never, server.transport(alice.plan.session.root.userId));
  await sender.send(roomId, { kind: "message", text: "one" });
  await sender.send(roomId, { kind: "message", text: "two" });
  assert.equal(server.contextGets, 2); // initial load plus one confirmation after creating genesis
  assert.equal(server.events.length, 2);
});

test("new-device recovery drains several retained-history pages in one bounded sync", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const sender = new SecureHistorySync(new MemoryVault(alice.plan.session) as never, server.transport(alice.plan.session.root.userId));
  for (let index = 0; index < 105; index++) await sender.send(roomId, { kind: "message", text: `history ${index}` });
  const receiver = new SecureHistorySync(new MemoryVault(bob.plan.session) as never, server.transport(bob.plan.session.root.userId));
  const restored = await receiver.sync();
  assert.equal(restored.length, 105);
  assert.equal((restored.at(-1)!.payload as { text: string }).text, "history 104");
});

test("a lost send response remains in the encrypted local outbox and retries idempotently", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const vault = new MemoryVault(alice.plan.session), sender = new SecureHistorySync(vault as never, server.transport(alice.plan.session.root.userId));
  server.failNextEventPosts = 1;
  const queued = await sender.send(roomId, { kind: "message", text: "tetap antre saat offline" });
  assert.equal(queued.queued, true);
  assert.equal(queued.sequence, 0);
  assert.equal(server.events.length, 0);
  assert.ok(await vault.get("history-outbox-v2", queued.event.id));
  assert.equal(await sender.flushOutbox(), 1);
  assert.equal(server.events.length, 1);
  assert.equal(await vault.get("history-outbox-v2", queued.event.id), null);
  assert.equal(await vault.get("history-pending-v2", queued.event.id), null);
  assert.equal(await sender.flushOutbox(), 0);
  assert.equal(server.events.length, 1);
});

test("a queued text event safely re-encrypts under a newer device roster before retry", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const vault = new MemoryVault(alice.plan.session), sender = new SecureHistorySync(vault as never, server.transport(alice.plan.session.root.userId));
  server.failNextEventPosts = 1;
  const queued = await sender.send(roomId, { kind: "message", text: "kirim setelah rotasi" });
  const extra = prepareRecoveredDevice(alice.plan.session.root.userId, { roster: alice.plan.session.roster, roster_hash: rosterHash(alice.plan.session.roster), encrypted_backup: alice.plan.backup!, updated_at: "" }, alice.recoveryKey);
  const rosterWithBoth = extra.session.roster;
  server.register(rosterWithBoth);
  assert.equal(await sender.flushOutbox(), 1);
  assert.equal(server.events.length, 1);
  assert.equal(server.events[0]!.event.id, queued.event.id);
  assert.notEqual(server.events[0]!.event.epochId, queued.event.epochId);
  assert.equal(server.epochs.get(roomId)!.length, 2);
});

test("retained attachments stay opaque on the server and decrypt only for a conversation member", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const sender = new SecureHistorySync(new MemoryVault(alice.plan.session) as never, server.transport(alice.plan.session.root.userId), server.binaryTransport);
  const receiver = new SecureHistorySync(new MemoryVault(bob.plan.session) as never, server.transport(bob.plan.session.root.userId), server.binaryTransport);
  const clear = new TextEncoder().encode("isi lampiran rahasia ComePlayers");
  const sent = await sender.sendAttachment(roomId, { kind: "message", text: "bukti" }, { bytes: clear, name: "bukti.pdf", mime: "application/pdf" });
  assert.equal(sent.queued, undefined);
  const retained = server.blobs.get(sent.event.blobId!)!;
  assert.ok(retained.attachedEventId);
  assert.notDeepEqual(retained.bytes, clear);
  assert.ok(!new TextDecoder().decode(retained.bytes).includes("rahasia"));
  const [received] = await receiver.sync(); assert.ok(received);
  const opened = await receiver.downloadAttachment(received as typeof sent);
  assert.deepEqual(opened.bytes, clear);
  assert.equal(opened.attachment.name, "bukti.pdf");
});

test("private-call media key is delivered as retained E2EE history and bound to media type", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const caller = new SecureHistorySync(new MemoryVault(alice.plan.session) as never, server.transport(alice.plan.session.root.userId));
  const callee = new SecureHistorySync(new MemoryVault(bob.plan.session) as never, server.transport(bob.plan.session.root.userId));
  const offer = await caller.createCallKey(roomId, "video");
  assert.ok(!JSON.stringify(server.events).includes(offer.key));
  await callee.sync();
  assert.equal(await callee.openCallKey(offer.eventId, roomId, "video"), offer.key);
  await assert.rejects(callee.openCallKey(offer.eventId, roomId, "audio"));
  await assert.rejects(callee.openCallKey(offer.eventId, newId(), "video"));
});

test("new PC recovers historical keys, rotates future keys, and revoked device cannot continue", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const oldVault = new MemoryVault(alice.plan.session), bobVault = new MemoryVault(bob.plan.session);
  const old = new SecureHistorySync(oldVault as never, server.transport(alice.plan.session.root.userId));
  const b = new SecureHistorySync(bobVault as never, server.transport(bob.plan.session.root.userId));
  await b.send(roomId, { kind: "message", text: "riwayat sebelum PC baru" });
  const snapshot: AccountSnapshot = { roster: alice.plan.session.roster, roster_hash: rosterHash(alice.plan.session.roster), encrypted_backup: alice.plan.backup!, updated_at: new Date().toISOString() };
  const recoveredRoot = openIdentityBackup(snapshot.encrypted_backup, alice.recoveryKey, alice.plan.session.root.userId);
  const pc = prepareRecoveredDevice(alice.plan.session.root.userId, snapshot, alice.recoveryKey, { removeDeviceIds: [alice.plan.session.device.id] });
  server.register(pc.session.roster);
  const pcVault = new MemoryVault(pc.session);
  await pcVault.put("root-recovery-v2", pc.session.root.userId, recoveredRoot);
  const pcSync = new SecureHistorySync(pcVault as never, server.transport(pc.session.root.userId));
  assert.deepEqual((await pcSync.sync()).map(item => item.payload), [{ kind: "message", text: "riwayat sebelum PC baru" }]);
  await pcSync.send(roomId, { kind: "message", text: "pesan dari PC baru" });
  await assert.rejects(old.send(roomId, { kind: "message", text: "perangkat dicabut" }));
  const onBob = await b.sync();
  assert.ok(onBob.some(item => (item.payload as { text?: string }).text === "pesan dari PC baru"));
  const latest = server.epochs.get(roomId)!.at(-1)!;
  const oldWrap = latest.wraps.find(item => item.target.includes(alice.plan.session.device.id));
  assert.equal(oldWrap, undefined);
  const recoveryWrap = latest.wraps.find(item => item.target === `r:${alice.plan.session.root.userId}`)!;
  await assert.rejects(openMessage(alice.plan.session.device.identity, pc.session.device.identity, recoveryWrap.envelope, roomId));
});

test("tampered server history blocks cursor advancement and local persistence", async () => {
  const alice = prepareFirstDevice(newId()), bob = prepareFirstDevice(newId()), roomId = newId(), server = new MemoryHistoryServer();
  server.register(alice.plan.session.roster); server.register(bob.plan.session.roster); server.rooms.set(roomId, [alice.plan.session.root.userId, bob.plan.session.root.userId]);
  const sender = new SecureHistorySync(new MemoryVault(alice.plan.session) as never, server.transport(alice.plan.session.root.userId));
  const receiverVault = new MemoryVault(bob.plan.session), receiver = new SecureHistorySync(receiverVault as never, server.transport(bob.plan.session.root.userId));
  await sender.send(roomId, { kind: "message", text: "authentic" }); server.corruptNextPull = true;
  await assert.rejects(receiver.sync());
  assert.equal(await receiverVault.get("meta", "secure-history-cursor"), null);
  assert.equal([...receiverVault.rows.keys()].filter(key => key.startsWith("history-event-v2:")).length, 0);
  assert.equal((await receiver.sync()).length, 1);
});

test("complete intermediate roster chains permit safe recovery across multiple device changes", async () => {
  const account = prepareFirstDevice(newId()), root = openIdentityBackup(account.plan.backup!, account.recoveryKey, account.plan.session.root.userId);
  const d2 = prepareRecoveredDevice(root.userId, { roster: account.plan.session.roster, roster_hash: rosterHash(account.plan.session.roster), encrypted_backup: account.plan.backup!, updated_at: "" }, account.recoveryKey);
  const snapshot2: AccountSnapshot = { roster: d2.session.roster, roster_hash: rosterHash(d2.session.roster), encrypted_backup: account.plan.backup!, updated_at: "" };
  const d3 = prepareRecoveredDevice(root.userId, snapshot2, account.recoveryKey);
  assert.equal(d3.session.roster.revision, 3);
  assert.notEqual(fingerprint(d3.session.device.identity), fingerprint(d2.session.device.identity));
});
