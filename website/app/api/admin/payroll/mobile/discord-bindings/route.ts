import { requireMonitorAccess } from "@/lib/monitorAccess";
import { monitorBody, monitorError, monitorReply } from "@/lib/monitorHttp";
import { loadFH3ManualOrders } from "@/lib/fh3ManualTelegramQueue";
import { loadMonitorControls } from "@/lib/monitorManagement";
import { parseIdAllowlist, validDiscordId } from "@/lib/monitorDiscordBuyerAlerts";
export const runtime="nodejs";
export const dynamic="force-dynamic";

/** Admin-only: bind verified FH3 order to stable Discord IDs, not display names. */
export async function GET(request:Request) {
  try {
    const {actor,supabaseAdmin}=await requireMonitorAccess(request);
    if(!actor.isAdmin) return monitorReply({error:"Khusus admin Monitor."},403);
    const {data,error}=await supabaseAdmin.from("cp_fh3_discord_order_bindings")
      .select("order_ref,guild_id,channel_id,buyer_user_id,enabled,updated_at")
      .order("order_ref").limit(500);
    if(error) throw error;
    return monitorReply({schema:1,scope:"FH3",bindings:data??[]});
  } catch(e){return monitorError(e);}
}
export async function POST(request:Request) {
  try {
    const {actor,supabaseAdmin}=await requireMonitorAccess(request);
    if(!actor.isAdmin) return monitorReply({error:"Khusus admin Monitor."},403);
    const b=await monitorBody(request);
    const ref=typeof b.orderRef==="string"?b.orderRef.trim().toUpperCase():"";
    if(!/^X\d{2,12}$/.test(ref) ||
      !validDiscordId(b.guildId) || !validDiscordId(b.channelId) || !validDiscordId(b.buyerUserId) ||
      typeof b.enabled!=="boolean")
      return monitorReply({error:"Order dan ID Discord harus valid."},400);
    const allowed=parseIdAllowlist(process.env.MONITOR_DISCORD_GUILD_IDS??"");
    if(!allowed.has(b.guildId)) return monitorReply({error:"Server Discord belum diizinkan."},403);
    const verified=await loadFH3ManualOrders(supabaseAdmin);
    if(!verified.has(ref)) return monitorReply({error:"Order bukan sumber Telegram FH3 terverifikasi."},403);
    const controls=await loadMonitorControls(supabaseAdmin),state=controls.get(ref);
    if(state?.archived || (state?.state && state.state!=="normal"))
      return monitorReply({error:"Order diarsipkan atau bermasalah."},409);
    const {error}=await supabaseAdmin.from("cp_fh3_discord_order_bindings").upsert({
      order_ref:ref,guild_id:b.guildId,channel_id:b.channelId,buyer_user_id:b.buyerUserId,
      enabled:b.enabled,updated_by:actor.id,updated_at:new Date().toISOString(),
    },{onConflict:"order_ref"});
    if(error) throw error;
    return monitorReply({ok:true,orderRef:ref});
  }catch(e){return monitorError(e);}
}
