import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import { loadFH3ManualOrders } from "@/lib/fh3ManualTelegramQueue";
import { loadFH3MonitorJobs } from "@/lib/fh3MonitorJobs";
import { loadMonitorControls } from "@/lib/monitorManagement";
import { matchesBuyerMessage, parseIdAllowlist, parseMessageMeta } from "@/lib/monitorDiscordBuyerAlerts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const unauthorized=()=>reply({error:"Unauthorized Discord relay."},401);
function verifiedSignature(raw:string,request:Request,secret:string){
  const timestamp=request.headers.get("x-cp-discord-timestamp")??"";
  const signature=request.headers.get("x-cp-discord-signature")??"";
  if(!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature))return false;
  if(Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300)return false;
  const expected=createHmac("sha256",secret).update(timestamp+"."+raw).digest();
  const provided=Buffer.from(signature,"hex");
  return provided.length===expected.length && timingSafeEqual(expected,provided);
}

/** Only the trusted Gateway service may call this endpoint. Never accept Discord messages from the client. */
export async function POST(request:Request){
  const secret=process.env.MONITOR_DISCORD_RELAY_SECRET??"";
  if(secret.length<32) return reply({error:"Discord relay disabled."},503);
  if(Number(request.headers.get("content-length")??"0")>8192) return reply({error:"Payload too large."},413);
  const reader=request.body?.getReader();
  if(!reader) return reply({error:"Missing payload."},400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>8192){await reader.cancel();return reply({error:"Payload too large."},413);}
    chunks.push(value);
  }
  const raw=Buffer.concat(chunks).toString("utf8");
  if(!verifiedSignature(raw,request,secret))return unauthorized();
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{return reply({error:"Invalid message."},400);}
  const event=parseMessageMeta(parsed);
  if(!event)return reply({error:"Invalid message."},400);
  if(!parseIdAllowlist(process.env.MONITOR_DISCORD_GUILD_IDS??"").has(event.guildId))
    return reply({ignored:true},200);
  const blocked=parseIdAllowlist(process.env.MONITOR_DISCORD_INTERNAL_USER_IDS??"");
  // Filters run before DB access, and never use mutable display names to *match* buyers.
  if(event.bot||event.webhookId||blocked.has(event.authorId))
    return reply({ignored:true},200);
  try{
    const service=createSupabaseAdmin();
    const {data,error}=await service.from("cp_fh3_discord_order_bindings")
      .select("order_ref,guild_id,channel_id,buyer_user_id,enabled")
      .eq("guild_id",event.guildId).eq("channel_id",event.channelId)
      .eq("buyer_user_id",event.authorId).eq("enabled",true).limit(100);
    if(error)throw error;
    const matched=(data??[]).filter(binding=>matchesBuyerMessage(event,binding,blocked));
    if(matched.length===0)return reply({ok:true,accepted:0});
    const [verified,controls,jobs]=await Promise.all([
      loadFH3ManualOrders(service),loadMonitorControls(service),loadFH3MonitorJobs(service),
    ]);
    const eligible=matched.filter(b=>verified.has(b.order_ref)
      && !controls.get(b.order_ref)?.archived
      && (!controls.get(b.order_ref)?.state || controls.get(b.order_ref)?.state==="normal")
      && jobs.get(b.order_ref)?.status!=="completed");
    if(eligible.length===0)return reply({ok:true,accepted:0});
    // Keep only IDs and received timestamp. Never store content, username or attachment.
    const {error:saveError}=await service.from("cp_fh3_discord_alert_events").upsert(
      eligible.map(b=>({message_id:event.messageId,order_ref:b.order_ref,
        guild_id:event.guildId,channel_id:event.channelId})),
      {onConflict:"message_id,order_ref",ignoreDuplicates:true});
    if(saveError)throw saveError;
    return reply({ok:true,accepted:eligible.length});
  }catch{return reply({error:"Discord alert not available."},503);}
}
