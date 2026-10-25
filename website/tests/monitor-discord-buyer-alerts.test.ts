import { test } from "node:test";
import assert from "node:assert/strict";
import { discordMessageUrl, internalEvoName, matchesBuyerMessage, parseIdAllowlist, parseMessageMeta } from "../lib/monitorDiscordBuyerAlerts";

const event={
  messageId:"1461111111111111111",guildId:"1451111111111111111",channelId:"1452222222222222222",
  authorId:"1453333333333333333",username:"Toasty",globalName:"Toasty",bot:false,
};
const bind={order_ref:"X4759",guild_id:event.guildId,channel_id:event.channelId,buyer_user_id:event.authorId,enabled:true};
test("only bound Discord buyer can trigger an order alert",()=>{
  const parsed=parseMessageMeta(event);
  assert.equal(parsed?.authorId,event.authorId);
  assert.ok(parsed && matchesBuyerMessage(parsed,bind,new Set()));
  assert.ok(!matchesBuyerMessage(event,{...bind,buyer_user_id:"1454444444444444444"},new Set()));
  assert.ok(!matchesBuyerMessage(event,{...bind,channel_id:"1454444444444444444"},new Set()));
  assert.ok(!matchesBuyerMessage(event,{...bind,guild_id:"1454444444444444444"},new Set()));
  assert.ok(!matchesBuyerMessage(event,{...bind,enabled:false},new Set()));
});
test("exclude EVOBOOSTER, EVO names, bots, webhooks and IDs regardless of channel",()=>{
  for(const name of ["EVOBOOSTER3","EVO","evo gaming","[EVO] Admin","evo_helper"])
    assert.ok(internalEvoName(name),name);
  assert.equal(internalEvoName("revolution"),false);
  for(const patch of [{username:"EVOBOOSTER3"},{globalName:"EVO Manager"},{serverNick:"EVO TEAM"},{bot:true},{webhookId:event.authorId}])
    assert.ok(!matchesBuyerMessage({...event,...patch},bind,new Set()),JSON.stringify(patch));
  assert.ok(!matchesBuyerMessage(event,bind,new Set([event.authorId])));
  assert.deepEqual(parseIdAllowlist("bad,"+event.authorId),new Set([event.authorId]));
});
test("no payload injection or spoofed non-snowflake IDs",()=>{
  assert.equal(parseMessageMeta({...event,authorId:"toasty"}),null);
  assert.equal(parseMessageMeta({...event,globalName:20}),null);
  assert.equal(parseMessageMeta({...event,serverNick:20}),null);
  assert.equal(parseMessageMeta({...event,bot:"false"}),null);
  assert.equal(parseMessageMeta({...event,webhookId:"bogus"}),null);
  assert.equal(parseMessageMeta(null),null);
  assert.equal(discordMessageUrl(event),"https://discord.com/channels/"+event.guildId+"/"+event.channelId+"/"+event.messageId);
  assert.throws(()=>discordMessageUrl({...event,messageId:"javascript:alert(1)"}));
});
