import { createSupabaseUserClient, getBearerToken, requireAccountIdentity } from "@/lib/serverSupabase";
import { singleDeviceSessionsEnabled } from "@/lib/auth/accountSessionConfig";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!singleDeviceSessionsEnabled()) return Response.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    await requireAccountIdentity(request);
    const { data, error } = await createSupabaseUserClient(getBearerToken(request))
      .rpc(request.method === "POST" ? "cp_claim_account_session" : "cp_account_session_state");
    if (error) return Response.json({ error: "Account session could not be verified." }, { status: error.code === "28000" ? 401 : error.code === "42501" ? 403 : 503, headers: { "Cache-Control": "no-store" } });
    return Response.json(data, { headers: { "Cache-Control": "no-store, private" } });
  } catch (reason) {
    const status = (reason as { status?: number }).status || 401;
    return Response.json({ error: reason instanceof Error ? reason.message : "Authentication required." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export { handle as GET, handle as POST };
