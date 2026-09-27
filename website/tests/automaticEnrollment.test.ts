import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as crypto from "../../comeplayers-apps/apps/mobile/src/secure/crypto";
import * as protocol from "../../comeplayers-apps/apps/mobile/src/secure/multiDevice";
import * as account from "../../comeplayers-apps/apps/mobile/src/secure/accountRecovery";
import * as policy from "../../comeplayers-apps/apps/mobile/src/secure/recoveryPolicy";
import { verifyAccountRoster, verifyDeviceRequest, verifyRootBackup } from "../lib/secureAccountProtocol";

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const mod = { exports: {} };
  const source = readFileSync(new URL(`../../comeplayers-apps/apps/mobile/src/secure/${file}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  runInNewContext(outputText, { module: mod, exports: mod.exports, Error, Uint8Array, console, require(name: string) { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; } });
  return mod.exports as T;
}
type Journal = { readPendingEnrollment: (id: string) => Promise<{ plan: account.EnrollmentPlan } | null> };
type AutoEnrollment = { ensureAutomaticEnrollment: (id: string, p: policy.RecoveryPolicy) => Promise<boolean> };
function fixture() {
  const userId = crypto.newId(), storage = new Map<string, string>(), trace: string[] = [];
  const recovery = { generation: 1, resetAt: "2026-09-16T00:00:00.000Z", requirePasskey: true, allowDeviceSetup: true };
  let remote: account.AccountSnapshot | null = null, local: account.VerifiedSession | null = null, lostResponse = false, writeFailure = false, signedIn = userId;
  let creations = 0, posts = 0;
  const journal = load<Journal>("enrollmentJournal", {
    "expo-secure-store": { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key: string) => storage.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => { if (writeFailure) throw new Error("Storage unavailable"); assert.ok(value.length <= 1800); storage.set(key, value); trace.push("stored"); },
      deleteItemAsync: async (key: string) => { storage.delete(key); } },
    "./crypto": crypto, "./multiDevice": protocol, "./recoveryPolicy": policy,
  });
  const transport: account.RecoveryTransport = async <T>(path: string, init = {}) => {
    const request = init as { method?: string; body?: string; headers?: Record<string, string> };
    if (request.method !== "POST") return { account: remote, recovery } as T;
    assert.ok(await journal.readPendingEnrollment(userId), "Protected journal must precede POST");
    const body = JSON.parse(request.body!);
    const roster = verifyAccountRoster(body.roster, userId, remote?.roster);
    verifyDeviceRequest(new Request("https://www.comeplayers.com" + path, { ...request, method: "POST" }), request.body!, userId, roster.devices);
    const backup = verifyRootBackup(body.backup, roster.identity);
    assert.equal(request.headers!["x-cp-recovery-generation"], "1");
    posts++; trace.push("posted");
    remote = { roster, roster_hash: protocol.rosterHash(roster), encrypted_backup: backup, updated_at: "" };
    if (lostResponse) throw new Error("Connection lost after commit");
    return { revision: roster.revision, rosterHash: remote.roster_hash } as T;
  };
  const restart = () => load<AutoEnrollment>("automaticEnrollment", {
    "./accountRecovery": { ...account, prepareFirstDevice: (id: string) => { creations++; return account.prepareFirstDevice(id); } },
    "./enrollmentJournal": journal, "./mobileSecureTransport": { mobileSecureTransport: transport },
    "./verifiedVault": { openVerifiedVault: async () => local ? { put: async () => { trace.push("key-saved"); } } : null, persistVerifiedSession: async (session: account.VerifiedSession) => { local = session; trace.push("activated"); } },
    "./crypto": crypto, "./multiDevice": protocol, "./recoveryPolicy": policy,
    "../runtime": { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: signedIn } } } }) } } },
  });
  return { userId, recovery, storage, trace, journal, restart, remote: () => remote, local: () => local, posts: () => posts, creations: () => creations,
    loseResponse: (value: boolean) => { lostResponse = value; }, failStorage: () => { writeFailure = true; }, signOut: () => { signedIn = "other"; },
    setRemote: (value: account.AccountSnapshot) => { remote = value; } };
}
test("automatic setup stores keys before POST, verifies signatures and never calls a passkey provider", async () => {
  const f = fixture(), api = f.restart();
  const first = api.ensureAutomaticEnrollment(f.userId, f.recovery), second = api.ensureAutomaticEnrollment(f.userId, f.recovery);
  assert.equal(first, second); assert.equal(await first, true);
  assert.equal(f.posts(), 1); assert.equal(f.creations(), 1); assert.ok(f.local());
  assert.ok(f.trace.indexOf("stored") < f.trace.indexOf("posted"));
  assert.equal(await f.journal.readPendingEnrollment(f.userId), null);
});
test("an app restart after a lost POST response resumes the same identity and device", async () => {
  const f = fixture(); f.loseResponse(true);
  await assert.rejects(f.restart().ensureAutomaticEnrollment(f.userId, f.recovery), /Connection lost/);
  assert.equal(f.local(), null); const accepted = f.remote()!.roster;
  f.loseResponse(false); await f.restart().ensureAutomaticEnrollment(f.userId, f.recovery);
  assert.equal(f.creations(), 1); assert.equal(f.posts(), 1);
  assert.equal(f.local()!.device.id, accepted.devices[0].id);
  assert.equal(crypto.fingerprint(f.local()!.root), crypto.fingerprint(accepted.identity));
});
test("existing account on another device is recovered, never replaced", async () => {
  const f = fixture(), { plan } = account.prepareFirstDevice(f.userId);
  f.setRemote({ roster: plan.session.roster, roster_hash: protocol.rosterHash(plan.session.roster), encrypted_backup: plan.backup!, updated_at: "" });
  assert.equal(await f.restart().ensureAutomaticEnrollment(f.userId, f.recovery), false);
  assert.equal(f.creations(), 0); assert.equal(f.posts(), 0); assert.equal(f.local(), null);
});
test("storage failure or account switching cannot activate a fresh remote identity", async () => {
  const f = fixture(); f.failStorage();
  await assert.rejects(f.restart().ensureAutomaticEnrollment(f.userId, f.recovery), /Storage/);
  assert.equal(f.posts(), 0);
  const g = fixture(); g.signOut();
  await assert.rejects(g.restart().ensureAutomaticEnrollment(g.userId, g.recovery), /account changed/);
  assert.equal(g.creations(), 0); assert.equal(g.posts(), 0);
});
test("journal corruption and generation changes preserve keys and stop activation", async () => {
  const f = fixture(); f.loseResponse(true);
  await assert.rejects(f.restart().ensureAutomaticEnrollment(f.userId, f.recovery));
  await assert.rejects(f.restart().ensureAutomaticEnrollment(f.userId, { ...f.recovery, generation: 2 }), /policy changed/);
  const key = [...f.storage.keys()].find(key => key.endsWith(".0"))!;
  f.storage.set(key, "corrupt");
  await assert.rejects(f.restart().ensureAutomaticEnrollment(f.userId, f.recovery), /verification/);
  assert.equal(f.posts(), 1); assert.equal(f.local(), null); assert.ok(f.storage.size > 0);
});
