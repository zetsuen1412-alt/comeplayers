import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { limitedBody } from "@/lib/privateMessaging";
import { signedRosterHash, verifyAccountRoster, verifyDeviceRequest, verifyRootBackup, type SignedRoster } from "@/lib/secureAccountProtocol";

const json = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });

// Account login may fetch its own encrypted recovery blob. It grants neither
// plaintext recovery nor device authorization: the client must possess the key.
export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), db = createSupabaseAdmin();
    const result = await db.from("cp_secure_accounts").select("roster,roster_hash,encrypted_backup,updated_at").eq("user_id", user.id).maybeSingle();
    if (result.error) throw result.error;
    return json({ account: result.data });
  } catch (error) { return accountApiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), text = await limitedBody(request, 32768);
    let body: { roster?: unknown; backup?: unknown };
    try { body = JSON.parse(text); } catch { throw inputError("Invalid encrypted account request."); }
    if (!body || typeof body !== "object") throw inputError("Invalid encrypted account request.");
    const db = createSupabaseAdmin();
    const existing = await db.from("cp_secure_accounts").select("roster").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    const roster = verifyAccountRoster(body.roster, user.id, existing.data?.roster as SignedRoster | undefined);
    // Possession of the newly authorized device private key is required as well
    // as the root-signed roster. The proof binds the exact bytes and endpoint.
    verifyDeviceRequest(request, text, user.id, roster.devices);
    const backup = body.backup == null ? null : verifyRootBackup(body.backup, roster.identity);
    if (!existing.data && !backup) throw inputError("Save an encrypted recovery-key backup before activating this identity.");
    const saved = await db.rpc("cp_secure_authorize_account", { p_user: user.id, p_roster: roster, p_hash: signedRosterHash(roster), p_backup: backup });
    if (saved.error) throw inputError(/rate limit/i.test(saved.error.message) ? "Too many device changes. Try again later." : "Device authorization changed. Reload and verify the latest device list before trying again.", /rate limit/i.test(saved.error.message) ? 429 : 409);
    return json({ revision: saved.data, rosterHash: signedRosterHash(roster), passkeySignature: backup?.passkey?.signature ?? null });
  } catch (error) { return accountApiError(error); }
}
