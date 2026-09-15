import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { limitedBody } from "@/lib/privateMessaging";
import { signedRosterHash, verifyAccountRoster, verifyDeviceRequest, verifyRootBackup, type SignedRoster } from "@/lib/secureAccountProtocol";
import { parseRecoveryPolicy, RECOVERY_CLIENT_VERSION, type RecoveryPolicy } from "@/lib/e2ee/recoveryPolicy";

const json = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
async function readPolicy(db: ReturnType<typeof createSupabaseAdmin>): Promise<RecoveryPolicy> {
  const result = await db.from("cp_secure_recovery_control").select("generation,reset_at,require_passkey").eq("singleton", true).single();
  if (result.error || !result.data) throw inputError("Account recovery is being prepared. Please try again shortly.", 503);
  return parseRecoveryPolicy({ generation: result.data.generation, resetAt: result.data.reset_at, requirePasskey: result.data.require_passkey });
}

// Login authorizes downloading ciphertext, never plaintext key recovery.
export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), db = createSupabaseAdmin();
    // Read policy on both sides to avoid pairing an old account with a new reset.
    const before = await readPolicy(db);
    const result = await db.from("cp_secure_accounts").select("roster,roster_hash,encrypted_backup,updated_at").eq("user_id", user.id).maybeSingle();
    if (result.error) throw result.error;
    const recovery = await readPolicy(db);
    if (before.generation !== recovery.generation) throw inputError("Account recovery changed. Refresh and try again.", 409);
    return json({ account: result.data, recovery });
  } catch (error) { return accountApiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), text = await limitedBody(request, 32768);
    let body: { roster?: unknown; backup?: unknown };
    try { body = JSON.parse(text); } catch { throw inputError("Invalid encrypted account request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw inputError("Invalid encrypted account request.");
    const db = createSupabaseAdmin(), recovery = await readPolicy(db);
    if (recovery.requirePasskey && request.headers.get("x-cp-recovery-client") !== RECOVERY_CLIENT_VERSION) throw inputError("Update ComePlayers to continue with account-protected Messages.", 426);
    const claimed = request.headers.get("x-cp-recovery-generation");
    if ((recovery.generation !== 0 || claimed !== null) && claimed !== String(recovery.generation)) throw inputError("Account recovery changed. Refresh before verifying this device.", 409);
    const existing = await db.from("cp_secure_accounts").select("roster,encrypted_backup").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    const roster = verifyAccountRoster(body.roster, user.id, existing.data?.roster as SignedRoster | undefined);
    verifyDeviceRequest(request, text, user.id, roster.devices);
    const backup = body.backup == null ? null : verifyRootBackup(body.backup, roster.identity);
    if (!existing.data && !backup) throw inputError("Save the client-encrypted account backup before activation.");
    if (recovery.requirePasskey && !(backup ?? existing.data?.encrypted_backup)?.passkey) throw inputError("Protect this account with a synced passkey before activation.");
    const saved = await db.rpc("cp_secure_authorize_account_recovery", { p_user: user.id, p_roster: roster, p_hash: signedRosterHash(roster), p_backup: backup, p_generation: recovery.generation });
    if (saved.error) throw inputError(/rate limit/i.test(saved.error.message) ? "Too many device changes. Try again later." : "Account authorization changed. Refresh the device list and try again.", /rate limit/i.test(saved.error.message) ? 429 : 409);
    return json({ revision: saved.data, rosterHash: signedRosterHash(roster), passkeySignature: backup?.passkey?.signature ?? null, recoveryGeneration: recovery.generation });
  } catch (error) { return accountApiError(error); }
}
