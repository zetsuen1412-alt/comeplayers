import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveContact, searchContacts } from "../lib/chatContacts";
import { normalizeCpNumber, parseContactIdentifier } from "../lib/cpNumbers";
import { toPublicChatProfile } from "../lib/chatServer";
import { createChatClient, ComePlayersApiError } from "../../comeplayers-apps/packages/chat-core/src/client";

test("CP numbers retain leading zeroes and accept only a full 13-digit identity", () => {
  for (const raw of ["0081234567890", " 008 12345 67890 ", "008-12345-67890"]) assert.equal(normalizeCpNumber(raw), "0081234567890");
  assert.equal(normalizeCpNumber("0080000000000"), "0080000000000");
  for (const raw of ["008", "008123456789", "00812345678901", "+0081234567890", "(008)1234567890", "085124347844", "0081.234567890", "0081234567890\nextra", 81234567890, null]) assert.equal(normalizeCpNumber(raw), "");
  assert.deepEqual(parseContactIdentifier("  @comeplayers "), { kind: "username", value: "comeplayers" });
  assert.deepEqual(parseContactIdentifier("0081234567890"), { kind: "cp_number", value: "0081234567890" });
  assert.deepEqual(parseContactIdentifier("@0081234567890"), { kind: "username", value: "0081234567890" });
  assert.deepEqual(parseContactIdentifier("@1234"), { kind: "username", value: "1234" });
  for (const raw of ["1234", "008-123", "+62 85124347844", "bob@example.com", "1,or.id", "player%", "a".repeat(81)]) assert.deepEqual(parseContactIdentifier(raw), { kind: "invalid" });
});

const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const another = "33333333-3333-4333-8333-333333333333";
type FixtureProfile = { id: string; username: string; cp_number: string; anonymized_at: string | null; email: string };
const contactProfile: FixtureProfile = { id: target, username: "player_name", cp_number: "0081234567890", anonymized_at: null, email: "private@example.test" };
function contactFixture(options: {
  profiles?: FixtureProfile[];
  blocks?: { blocker_id: string; blocked_id: string }[];
  rooms?: { buyer_id: string; seller_id: string }[];
  blockError?: boolean;
} = {}) {
  const calls: URL[] = [];
  const db = createClient("https://contacts.example.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); calls.push(url);
      if (url.pathname === "/rest/v1/chat_user_blocks") {
        if (options.blockError) return Response.json({ message: "Block lookup unavailable", code: "XX000" }, { status: 500 });
        return Response.json(options.blocks || []);
      }
      if (url.pathname === "/rest/v1/chat_rooms") return Response.json(options.rooms || []);
      assert.equal(url.pathname, "/rest/v1/profiles", "Contact lookup must never query phone settings or a phone RPC");
      const params = url.searchParams;
      let rows = options.profiles || [contactProfile];
      const cp = params.get("cp_number");
      if (cp) rows = rows.filter(row => `eq.${row.cp_number}` === cp);
      if (params.get("anonymized_at") === "is.null") rows = rows.filter(row => !row.anonymized_at);
      const id = params.get("id");
      if (id?.startsWith("eq.")) rows = rows.filter(row => `eq.${row.id}` === id);
      if (id?.startsWith("in.(")) rows = rows.filter(row => id.includes(row.id));
      const name = params.get("username");
      if (name) {
        const pattern = name.slice("ilike.".length).replace(/\\_/g, "_").toLowerCase();
        rows = rows.filter(row => pattern.startsWith("%") ? row.username.toLowerCase().includes(pattern.slice(1, -1)) : row.username.toLowerCase() === pattern);
      }
      const selected = rows.map(row => Object.fromEntries((params.get("select") || "").split(",").map(key => [key, row[key as keyof FixtureProfile] ?? null])));
      return Response.json(new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object") ? selected[0] ?? null : selected);
    } },
  });
  return { db, calls };
}

test("exact CP search resolves the number owner and exposes no private phone/email", async () => {
  const numericUsername = { ...contactProfile, id: another, username: contactProfile.cp_number, cp_number: "0080000000001" };
  const { db, calls } = contactFixture({ profiles: [contactProfile, numericUsername] });
  const users = await searchContacts(db, actor, "008-12345-67890");
  assert.deepEqual(users.map(u => u.id), [target]);
  assert.equal(users[0].cp_number, "0081234567890");
  assert.equal(Object.hasOwn(users[0], "email"), false);
  const query = calls.find(c => c.pathname.endsWith("/profiles"))!.searchParams;
  assert.equal(query.get("cp_number"), "eq.0081234567890");
  assert.equal(query.has("username"), false);
  assert.equal(query.get("anonymized_at"), "is.null");
  assert.equal(query.get("limit"), "30");
});

test("numeric usernames require @ and never fall back from a missing CP number", async () => {
  const numericUsername = { ...contactProfile, username: "0080000000001" };
  const { db, calls } = contactFixture({ profiles: [numericUsername] });
  assert.deepEqual(await searchContacts(db, actor, "0080000000001"), []);
  assert.deepEqual((await searchContacts(db, actor, "@0080000000001", true)).map(p => p.id), [target]);
  assert.equal(calls.filter(c => c.pathname.endsWith("/profiles")).at(-1)!.searchParams.get("username"), "ilike.0080000000001");
});

test("phone numbers, partial CP numbers, email, SQL filters and long queries do not reach the database", async () => {
  const { db, calls } = contactFixture();
  for (const query of ["008", "008123456", "+62 85124347844", "085124347844", "+0081234567890", "0081234567890,or.id", "person@example.test", "person%", "a".repeat(81)]) {
    assert.deepEqual(await searchContacts(db, actor, query), []);
  }
  assert.deepEqual(calls, []);
});

test("username matching keeps underscore literal and exact resolution distinct from partial search", async () => {
  const { db, calls } = contactFixture();
  assert.equal((await searchContacts(db, actor, "player_")).length, 1);
  assert.equal(calls.at(-1)!.searchParams.get("username"), "ilike.%player\\_%");
  assert.equal(await resolveContact(db, actor, "player_"), null);
  assert.equal(calls.at(-1)!.searchParams.get("username"), "ilike.player\\_");
  assert.equal((await resolveContact(db, actor, "@PLAYER_NAME"))?.cp_number, "0081234567890");
});

test("CP lookup excludes both directions of blocking, own account and anonymized profiles", async () => {
  for (const blocks of [[{ blocker_id: actor, blocked_id: target }], [{ blocker_id: target, blocked_id: actor }]]) {
    const { db } = contactFixture({ blocks });
    assert.deepEqual(await searchContacts(db, actor, contactProfile.cp_number), []);
  }
  const self = contactFixture({ profiles: [{ ...contactProfile, id: actor }] });
  assert.deepEqual(await searchContacts(self.db, actor, contactProfile.cp_number), []);
  const deleted = contactFixture({ profiles: [{ ...contactProfile, anonymized_at: "2026-09-30T00:00:00Z" }] });
  assert.deepEqual(await searchContacts(deleted.db, actor, contactProfile.cp_number), []);
});

test("block lookup errors fail closed before returning profiles", async () => {
  const { db, calls } = contactFixture({ blockError: true });
  await assert.rejects(searchContacts(db, actor, contactProfile.cp_number), /Block lookup unavailable/);
  assert.equal(calls.some(c => c.pathname.endsWith("/profiles")), false);
});

test("recent contacts preserve room order; empty resolution never chooses a recent account", async () => {
  const otherProfile = { ...contactProfile, id: another, cp_number: "0080000000001" };
  const { db, calls } = contactFixture({ profiles: [contactProfile, otherProfile], rooms: [{ buyer_id: actor, seller_id: another }, { buyer_id: target, seller_id: actor }] });
  assert.deepEqual((await searchContacts(db, actor, "")).map(p => p.id), [another, target]);
  const count = calls.length;
  assert.equal(await resolveContact(db, actor, " "), null);
  assert.equal(calls.length, count);
});

test("UUID resolution still checks blocks and supplies the immutable public number", async () => {
  const allowed = contactFixture();
  assert.equal((await resolveContact(allowed.db, actor, target))?.cp_number, "0081234567890");
  const blocked = contactFixture({ blocks: [{ blocker_id: target, blocked_id: actor }] });
  await assert.rejects(resolveContact(blocked.db, actor, target), (error: unknown) => (error as { status: number }).status === 403);
  assert.equal(blocked.calls.some(c => c.pathname.endsWith("/profiles")), false);
});

test("public message profiles retain CP number as text without copying private fields", () => {
  const profile = toPublicChatProfile(contactProfile);
  assert.equal(profile?.cp_number, "0081234567890");
  assert.equal(Object.hasOwn(profile!, "email"), false);
  assert.equal(toPublicChatProfile(null), null);
});

test("mobile contact client sends bearer auth and encoded identifiers to shared APIs", async () => {
  const calls: {url: string; init?: RequestInit}[] = [];
  const client = createChatClient({baseUrl:"https://www.comeplayers.com",getAccessToken:async()=>"test-token",fetchImpl:async(input,init)=>{
    calls.push({url:String(input),init});
    return Response.json(String(input).includes("blocks") ? {ok:true,users:[]} : init?.method==="POST" ? {room:{id:"room-1"}} : {users:[]});
  }});
  await client.searchContacts("008 12345 67890");
  await client.openContact("username");
  await client.blockContact("user-id",true);
  await client.blockContact("user-id",false);
  assert.match(calls[0].url,/q=008%2012345%2067890$/);
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
