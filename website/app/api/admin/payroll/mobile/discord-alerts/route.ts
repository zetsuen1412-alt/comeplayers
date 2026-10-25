import { requireMonitorAccess } from "@/lib/monitorAccess";
import { monitorError, monitorReply } from "@/lib/monitorHttp";
import { loadFH3ManualOrders } from "@/lib/fh3ManualTelegramQueue";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";
import { loadMonitorControls } from "@/lib/monitorManagement";
import { currentDiscordRecipients, extractFH3PayrollOrders } from "@/lib/monitorDiscordRecipients";
import { discordMessageUrl } from "@/lib/monitorDiscordBuyerAlerts";
export const runtime="nodejs";
export const dynamic="force-dynamic";

/** Metadata-only alerts. Every request rechecks the live Monitor account and current assignment. */
export async function GET(request:Request) {
  try {
    const {actor,employeeCode,supabaseAdmin}=await requireMonitorAccess(request);
    const since=new Date(Date.now()-7*86400_000).toISOString();
    const [events,verified,controls,jobs,workspace]=await Promise.all([
      supabaseAdmin.from("cp_fh3_discord_alert_events")
        .select("message_id,order_ref,guild_id,channel_id,created_at")
        .gte("created_at",since).order("created_at",{ascending:false}).limit(200),
      loadFH3ManualOrders(supabaseAdmin),
      loadMonitorControls(supabaseAdmin),
      loadFH3MonitorJobs(supabaseAdmin),
      supabaseAdmin.from("cp_payroll_workspace").select("payload").eq("id",1).single(),
    ]);
    if(events.error || workspace.error || !workspace.data)throw events.error??workspace.error??new Error("Workspace not available");
    const orders=extractFH3PayrollOrders(workspace.data.payload);
    const rows=(events.data??[]).filter(event=>{
      const control=controls.get(event.order_ref);
      if(!verified.has(event.order_ref)||control?.archived || (control?.state && control.state!=="normal"))return false;
      if(!actor.isAdmin && !currentDiscordRecipients(event.order_ref,jobs,orders).includes(employeeCode.trim().toUpperCase()))return false;
      return true;
    }).map(event=>({
      messageId:event.message_id,orderRef:event.order_ref,
      url:discordMessageUrl({messageId:event.message_id,guildId:event.guild_id,channelId:event.channel_id}),
      at:event.created_at,
    }));
    return monitorReply({schema:1,scope:"FH3",source:"discord_buyer_metadata",alerts:rows});
  }catch(e){return monitorError(e);}
}
