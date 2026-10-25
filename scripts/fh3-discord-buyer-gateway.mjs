#!/usr/bin/env node
/**
 * Dedicated Node 22+ Gateway relay for metadata-only FH3 Discord buyer alerts.
 * NOT a Vercel API route, Discord webhook, or self-bot. Run on an always-on private host.
 * Never log message content or credentials. Secret values come from process environment.
 */
import {createHmac} from "node:crypto";
const BOT=process.env.MONITOR_DISCORD_BOT_TOKEN??"";
const SECRET=process.env.MONITOR_DISCORD_RELAY_SECRET??"";
const RELAY=process.env.MONITOR_DISCORD_RELAY_URL??"https://www.comeplayers.com/api/integrations/discord/fh3-message";
const GUILDS=new Set((process.env.MONITOR_DISCORD_GUILD_IDS??"").split(",").map(x=>x.trim()).filter(x=>/^\d{15,22}$/.test(x)));
if(!BOT || SECRET.length<32 || GUILDS.size===0 || !RELAY.startsWith("https://")){
  throw new Error("Set bot token, 32+ char relay secret, allowed guild IDs, and HTTPS relay URL.");
}
const id=x=>typeof x==="string" && /^\d{15,22}$/.test(x);
let socket, heartbeat, reconnectTimer, sequence=null, sessionId=null, resumeUrl=null, backoff=1000, stopped=false, lastAck=true;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function relay(d){
  if(!GUILDS.has(d.guild_id) || !id(d.channel_id) || !id(d.id) || !id(d.author?.id))return;
  if(d.author.bot || d.webhook_id)return;
  const body=JSON.stringify({
    messageId:d.id,guildId:d.guild_id,channelId:d.channel_id,authorId:d.author.id,
    username:String(d.author.username??"").slice(0,100),
    globalName:String(d.author.global_name??"").slice(0,100),
    serverNick:String(d.member?.nick??"").slice(0,100),
    bot:!!d.author.bot,webhookId:d.webhook_id??undefined,
  });
  for(let i=0;i<3;i++){
    const timestamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac("sha256",SECRET).update(timestamp+"."+body).digest("hex");
    try{
      const response=await fetch(RELAY,{method:"POST",headers:{"content-type":"application/json",
        "x-cp-discord-timestamp":timestamp,"x-cp-discord-signature":signature},body,signal:AbortSignal.timeout(15000)});
      if(response.ok)return;
      if(response.status===401 || response.status===403 || response.status===400)throw new Error("Relay rejected event: "+response.status);
    }catch(error){
      if(i===2)console.error("Discord metadata relay failed for message ID",d.id,String(error?.message??error));
    }
    if(i<2)await sleep(800*(i+1));
  }
}
function cleanup(){
  if(heartbeat){clearInterval(heartbeat);heartbeat=null;}
}
function later(){
  if(stopped)return;
  cleanup();
  if(reconnectTimer)clearTimeout(reconnectTimer);
  reconnectTimer=setTimeout(connect,backoff);
  backoff=Math.min(backoff*2,30000);
}
async function connect(){
  if(stopped)return;
  try{
    const response=await fetch("https://discord.com/api/v10/gateway/bot",{headers:{authorization:"Bot "+BOT},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error("Discord gateway lookup HTTP "+response.status);
    const info=await response.json();
    const url=(resumeUrl??info.url)+"?v=10&encoding=json";
    socket=new WebSocket(url);
    const current=socket;
    let connected=false;
    current.addEventListener("open",()=>{connected=true;backoff=1000;console.info("Discord Gateway connection open");});
    current.addEventListener("message",async event=>{
      let p;try{p=JSON.parse(event.data);}catch{return;}
      if(p.s!==null && p.s!==undefined)sequence=p.s;
      if(p.op===10){
        const interval=Number(p.d?.heartbeat_interval);
        if(!Number.isFinite(interval)||interval<1000){current.close();return;}
        lastAck=true;
        heartbeat=setInterval(()=>{
          if(current.readyState!==WebSocket.OPEN)return;
          if(!lastAck){current.close();return;}
          lastAck=false;current.send(JSON.stringify({op:1,d:sequence}));
        },interval);
        if(sessionId && sequence!==null){
          current.send(JSON.stringify({op:6,d:{token:BOT,session_id:sessionId,seq:sequence}}));
        }else{
          current.send(JSON.stringify({op:2,d:{token:BOT,intents:512,properties:{os:"linux",browser:"comeplayers-monitor",device:"comeplayers-monitor"}}}));
        }
      }
      if(p.op===11)lastAck=true;
      if(p.op===7){current.close();return;}
      if(p.op===9){if(!p.d){sessionId=null;sequence=null;resumeUrl=null;}current.close();return;}
      if(p.op===0 && p.t==="READY"){sessionId=p.d.session_id;resumeUrl=p.d.resume_gateway_url;}
      if(p.op===0 && p.t==="MESSAGE_CREATE"){void relay(p.d).catch(e=>console.error("Relay error",String(e?.message??e)));}
    });
    current.addEventListener("close",event=>{
      cleanup();
      if(socket!==current)return;
      if(event.code===4004){stopped=true;console.error("Invalid Discord bot token. Exit.");process.exitCode=1;return;}
      // Non-resumable invalid intent or permission: fail instead of flood reconnects.
      if([4013,4014].includes(event.code)){stopped=true;console.error("Discord Gateway intents not authorized:",event.code);process.exitCode=1;return;}
      if(connected)console.warn("Discord Gateway disconnected:",event.code);
      later();
    });
    current.addEventListener("error",()=>{if(current.readyState===WebSocket.OPEN)current.close();});
  }catch(e){console.error("Discord gateway connection error:",String(e?.message??e));later();}
}
process.on("SIGTERM",()=>{stopped=true;cleanup();if(reconnectTimer)clearTimeout(reconnectTimer);socket?.close();});
process.on("SIGINT",()=>{stopped=true;cleanup();if(reconnectTimer)clearTimeout(reconnectTimer);socket?.close();});
void connect();
