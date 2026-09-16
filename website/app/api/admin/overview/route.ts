import { NextResponse } from "next/server";
import { requireAdmin, adminErrorStatus } from "@/lib/adminSecurity";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const { profile, supabaseAdmin } = await requireAdmin(request);
    const { data, error } = await supabaseAdmin.rpc("cp_admin_workspace_overview");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ...data, profile: { username: profile.username, email: profile.email } }, { headers });
  } catch (error) {
    const status = adminErrorStatus(error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to load the admin overview. Please retry." }, { status, headers });
  }
}
