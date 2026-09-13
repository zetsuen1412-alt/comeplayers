import { relayMobileAuth } from "@/lib/auth/mobileAuthProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publicKey) return Response.json({ message: "Sign-in is temporarily unavailable." }, { status: 503 });
  return relayMobileAuth(request, path, { supabaseUrl, publicKey, fetch });
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
