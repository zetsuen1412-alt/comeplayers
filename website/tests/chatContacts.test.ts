import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { cleanContactQuery, normalizeContactPhone } from "../lib/chatContacts";
import { createChatClient, ComePlayersApiError } from "../../comeplayers-apps/packages/chat-core/src/client";

test("contact phone lookup accepts full international and Indonesian local numbers only", () => {
  assert.equal(normalizeContactPhone("0851 2434 7844"), "6285124347844");
  assert.equal(normalizeContactPhone("+62 (851) 2434-7844"), "6285124347844");
  assert.equal(normalizeContactPhone("0044 7400 123456"), "447400123456");
  assert.equal(normalizeContactPhone("+1 202 555 0199"), "12025550199");
  for (const invalid of ["123", "bob@example.com", "username", "1,or.id", "1234567890123456"]) assert.equal(normalizeContactPhone(invalid), "");
  assert.equal(cleanContactQuery("  @comeplayers "), "comeplayers");
});

test("mobile contact client sends bearer auth and encoded identifiers to shared APIs", async () => {
  const calls: {url: string; init?: RequestInit}[] = [];
  const client = createChatClient({baseUrl:"https://www.comeplayers.com",getAccessToken:async()=>"test-token",fetchImpl:async(input,init)=>{
    calls.push({url:String(input),init});
    return Response.json(String(input).includes("blocks") ? {ok:true,users:[]} : init?.method==="POST" ? {room:{id:"room-1"}} : {users:[]});
  }});
  await client.searchContacts("+62 85124347844");
  await client.openContact("username");
  await client.blockContact("user-id",true);
  await client.blockContact("user-id",false);
  assert.match(calls[0].url,/q=%2B62%2085124347844$/);
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"),"Bearer test-token");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)),{identifier:"username"});
  assert.equal(calls[2].init?.method,"POST"); assert.equal(calls[3].init?.method,"DELETE");
});

test("contact client refreshes an expired session once and exposes blocked errors", async () => {
  const refreshes: boolean[]=[]; let calls=0;
  const client=createChatClient({baseUrl:"https://example.invalid",getAccessToken:async(force)=>{refreshes.push(!!force);return force?"fresh":"expired";},fetchImpl:async()=> ++calls===1 ? Response.json({error:"Expired"},{status:401}) : Response.json({error:"Messaging is unavailable for this contact."},{status:403})});
  await assert.rejects(client.openContact("user"), (e: unknown) => e instanceof ComePlayersApiError && e.status===403);
  assert.deepEqual(refreshes,[false,true]); assert.equal(calls,2);
});

test("mobile opens on Chat with Chat and Community first in the bottom navigation", () => {
  const app=fs.readFileSync("../comeplayers-apps/apps/mobile/App.tsx","utf8");
  const components=fs.readFileSync("../comeplayers-apps/apps/mobile/src/components.tsx","utf8");
  assert.match(app,/useState<AppTab>\("messages"\)/);
  assert.deepEqual([...components.matchAll(/\{ id: "(\w+)", label:/g)].map(m=>m[1]),["messages","community","home","marketplace","profile"]);
  assert.match(components,/id: "home", label: "Berita"/);
  const website=fs.readFileSync("app/cpcommunity/page.tsx","utf8");
  assert.match(website,/messages\/page/);
});

test("mobile community and website contacts no longer require friend requests", () => {
  const mobile=fs.readFileSync("../comeplayers-apps/apps/mobile/src/screens/CommunityScreen.tsx","utf8");
  assert.doesNotMatch(mobile,/requestFriend|loadFriends|FriendsHub/);
  const website=fs.readFileSync("components/messages/ContactsWorkspace.tsx","utf8");
  assert.match(website,/\/api\/messages\/contacts/);
  assert.match(website,/\/api\/messages\/blocks/);
  const migration=fs.readFileSync("supabase/migrations/20260908100419_messages_contacts_blocks_news.sql","utf8");
  assert.match(migration,/enable row level security/);
  assert.match(migration,/phone_verified = true/);
  assert.match(migration,/before insert on public.chat_messages/);
});
