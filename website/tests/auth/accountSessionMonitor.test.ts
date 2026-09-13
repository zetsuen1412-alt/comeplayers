import { strict as assert } from "node:assert";
import { test } from "node:test";
import { accountSessionMonitor as browserMonitor } from "../../lib/auth/accountSessionMonitor";
import { accountSessionMonitor as mobileMonitor } from "../../../comeplayers-apps/apps/mobile/src/accountSessionMonitor";

for (const [client, accountSessionMonitor] of [["web", browserMonitor], ["mobile", mobileMonitor]] as const) {

test(`${client}: a replaced session is signed out; a new session is claimed once`, async () => {
  for (const canClaim of [true, false]) {
    let signedOut = 0;
    const methods: string[] = [];
    const monitor = accountSessionMonitor({
      session: async () => ({ access_token: "synthetic-session" }), visible: () => true,
      request: async (_, method) => { methods.push(method); return method === "POST" ? { active: canClaim, claimed: canClaim } : { active: false, claimed: false }; },
      replaced: async () => { signedOut++; },
    });
    try { await monitor.check(); assert.deepEqual(methods, ["GET", "POST"]); assert.equal(signedOut, canClaim ? 0 : 1); }
    finally { monitor.stop(); }
  }
});

test(`${client}: network failures and stale checks cannot sign out a newer login`, async () => {
  let token = "old-token", signedOut = 0;
  const monitor = accountSessionMonitor({
    session: async () => ({ access_token: token }), visible: () => true,
    request: async (_, method) => { if (method === "POST") token = "new-token"; return { active: false, claimed: false }; },
    replaced: async () => { signedOut++; },
  });
  try { await monitor.check(); assert.equal(signedOut, 0); } finally { monitor.stop(); }
  const offline = accountSessionMonitor({ session: async () => ({ access_token: token }), visible: () => true,
    request: async () => { throw new Error("Offline"); }, replaced: async () => { signedOut++; } });
  try { await offline.check(); assert.equal(signedOut, 0); } finally { offline.stop(); }
});

test(`${client}: a disabled rollout does not claim sessions or sign anyone out`, async () => {
  let requests = 0, signedOut = 0;
  const monitor = accountSessionMonitor({session: async()=>({access_token:"synthetic"}), visible:()=>true,
    request: async()=>{ requests++; return {enabled:false}; }, replaced:async()=>{signedOut++;}});
  try {
    await monitor.check(); await monitor.check();
    assert.equal(requests,1); assert.equal(signedOut,0);
    await monitor.check(true); assert.equal(requests,2); assert.equal(signedOut,0);
  } finally { monitor.stop(); }
});
}
