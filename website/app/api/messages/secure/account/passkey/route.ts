import { accountApiError, inputError } from "@/lib/accountApi";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { limitedBody } from "@/lib/privateMessaging";
import { verifyDeviceRequest, verifyRootBackup, verifyStoredAccountRoster } from "@/lib/secureAccountProtocol";

/** Adds a signed encrypted recovery option; never changes the account root or device authorization. */
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), text = await limitedBody(request, 16384);
    let body: { passkey?: unknown };
    try { body = JSON.parse(text); } catch { throw inputError("Invalid passkey backup."); }
    if (!body?.passkey) throw inputError("Missing encrypted passkey backup.");
    const db = createSupabaseAdmin();
    const current = await db.from("cp_secure_accounts").select("roster,roster_hash,encrypted_backup,updated_at").eq("user_id", user.id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw inputError("Activate encrypted Messages on this device first.", 409);
    const roster = verifyStoredAccountRoster(current.data.roster, user.id);
    verifyDeviceRequest(request, text, user.id, roster.devices);
    const previous = verifyRootBackup(current.data.encrypted_backup, roster.identity);
    if (previous.passkey) throw inputError("Passkey recovery is already enabled. Use your existing synced passkey.", 409);
    const backup = verifyRootBackup({ ...previous, passkey: body.passkey }, roster.identity);
    const saved = await db.from("cp_secure_accounts").update({ encrypted_backup: backup, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("roster_hash", current.data.roster_hash).eq("updated_at", current.data.updated_at)
      .select("user_id").maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw inputError("Your encrypted account changed. Reload and try again.", 409);
    return Response.json({ passkeySignature: backup.passkey!.signature }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
