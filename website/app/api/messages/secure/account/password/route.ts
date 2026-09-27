import { accountApiError, inputError } from "@/lib/accountApi";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { limitedBody } from "@/lib/privateMessaging";
import { verifyDeviceRequest, verifyRootBackup, verifyStoredAccountRoster } from "@/lib/secureAccountProtocol";

/** Client-encrypted recovery only. Neither a password nor a derived key is accepted. */
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request), text = await limitedBody(request, 16384);
    let body: { recovery?: unknown };
    try { body = JSON.parse(text); } catch { throw inputError("Invalid encrypted password backup."); }
    if (!body?.recovery) throw inputError("Missing encrypted password backup.");
    const db = createSupabaseAdmin();
    const current = await db.from("cp_secure_accounts").select("roster,roster_hash,encrypted_backup,updated_at").eq("user_id", user.id).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) throw inputError("Open Messages on this device first.", 409);
    const roster = verifyStoredAccountRoster(current.data.roster, user.id);
    verifyDeviceRequest(request, text, user.id, roster.devices);
    const previous = verifyRootBackup(current.data.encrypted_backup, roster.identity);
    const backup = verifyRootBackup({ ...previous, password: body.recovery }, roster.identity);
    // Exact retries are safe after a lost response; never replace an existing backup key.
    if (previous.password) {
      if (previous.password.signature !== backup.password!.signature) throw inputError("Sandi cadangan sudah diatur. Gunakan sandi yang ada.", 409);
      return Response.json({ passwordSignature: previous.password.signature }, { headers: { "Cache-Control": "no-store" } });
    }
    const saved = await db.from("cp_secure_accounts").update({ encrypted_backup: backup, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("roster_hash", current.data.roster_hash).eq("updated_at", current.data.updated_at).select("user_id").maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw inputError("Your encrypted account changed. Reload and try again.", 409);
    return Response.json({ passwordSignature: backup.password!.signature }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
