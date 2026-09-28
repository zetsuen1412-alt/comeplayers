import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "@playwright/test";

const root = process.cwd();
const output = path.join(root, "test-results", "community-navigation");
await mkdir(output, { recursive: true });
const source = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Sidebar from "./components/messages/CommunityChannelSidebar";
function Preview() {
  const [selected, select] = useState("general");
  return <div style={{height:"100dvh",padding:16,background:"#07101d",color:"white",display:"flex",gap:24}}>
    <aside style={{width:300,maxWidth:"100%",height:"100%"}}><Sidebar roomId="room" selectedChannelId={selected} onSelectChannel={channel => select(channel.id)} /></aside>
    <main className="hidden md:block" style={{padding:28}}><p>COMEPLAYERS COMMUNITY</p><h1>Welcome to your squad</h1><p>Selected channel: <span data-selected>{selected}</span></p></main>
  </div>;
}
createRoot(document.getElementById("root")).render(<Preview />);
`;
const bundle = await build({
  stdin: { contents: source, resolveDir: root, loader: "tsx" }, bundle: true, write: false,
  format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-api", setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/(authenticatedFetch|supabase)$/ }, args => ({ path: args.path, namespace: "test-api" }));
    plugin.onLoad({ filter: /.*/, namespace: "test-api" }, args => ({ contents: args.path.endsWith("authenticatedFetch")
      ? `export async function authenticatedFetchJson(url, init) { const response = await fetch(url, init); const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status }); return data; }`
      : `export const supabase = { channel() { const listeners=[]; const channel={on(type, filter, callback){listeners.push(callback);return channel}, subscribe(callback){window.__change=()=>listeners.forEach(fn=>fn());queueMicrotask(()=>callback("SUBSCRIBED"));return channel}};return channel}, removeChannel(){return Promise.resolve()} };`,
    }));
  }}],
});
const css = await postcss([tailwind({ base: root })]).process('@import "tailwindcss" source(none); @source "../components/messages";', { from: path.join(root, "tests", "community-preview.css") });
const channel = (id, name, category_id, extra = {}) => ({ id, name, category_id, community_id: "community", channel_type: "text", topic: "Find teammates and plan your next game.", position: 10, is_private: false, is_read_only: false, is_default: false, unread_count: 0, ...extra });
const initial = {
  community: { id: "community", room_id: "room", name: "ComePlayers Squad" },
  categories: [{ id: "text", name: "TEXT CHANNELS", position: 10 }, { id: "voice", name: "VOICE LOBBIES", position: 20 }],
  channels: [channel("general", "general", "text", { is_default: true, unread_count: 5 }), channel("market", "marketplace", "text"), channel("lounge", "Lounge", "voice", { channel_type: "voice" }), channel("private", "staff-chat", "text", { is_private: true })],
  currentUser: { userId: "user", memberRole: "owner", isOwner: true, isAdmin: false, permissions: ["*"] },
};
let data = structuredClone(initial);
let writes = [];
let fail = false;
const server = createServer(async (request, response) => {
  if (request.url === "/app.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
  if (request.url === "/app.css") { response.setHeader("Content-Type", "text/css"); response.end(css.css); return; }
  if (request.url?.startsWith("/api/")) {
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET") { response.statusCode = fail ? 503 : 200; response.end(JSON.stringify(fail ? { error: "Connection unavailable" } : data)); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    writes.push({ url: request.url, method: request.method, body });
    if (request.url.endsWith("/categories")) {
      data.categories.push({ id: "new-category", name: body.name, position: 30 });
      response.end("{}"); return;
    }
    const existing = data.channels.find(item => request.url.endsWith("/" + item.id));
    const saved = { ...(existing || channel("new-channel", body.name, body.categoryId)), name: body.name, topic: body.topic, category_id: body.categoryId, is_private: body.isPrivate, is_read_only: body.isReadOnly, channel_type: body.type || existing?.channel_type || "text" };
    data.channels = [...data.channels.filter(item => item.id !== saved.id), saved];
    response.end(JSON.stringify({ channel: saved })); return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0"><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => window.__online !== false }));
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(url);
  await page.getByRole("button", { name: "Pengaturan ruang general", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await page.getByRole("searchbox", { name: "Cari ruang obrolan" }).fill("market");
  await page.getByRole("button", { name: "marketplace" }).waitFor();
  assert.equal(await page.locator("[data-community-channel]").count(), 1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Belum dibaca" }).click();
  assert.equal(await page.locator("[data-community-channel]").count(), 1);
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page.getByRole("button", { name: /^VOICE LOBBIES/ }).click();
  assert.equal(await page.locator("[data-voice-channel]").isVisible(), false);
  await page.getByRole("button", { name: /^VOICE LOBBIES/ }).click();
  await page.getByRole("button", { name: "Pengaturan ruang general" }).click();
  await page.getByRole("dialog", { name: "Pengaturan ruang" }).waitFor();
  await page.getByLabel("Nama ruang").fill("squad-chat");
  await page.getByLabel("Deskripsi (opsional)").fill("Plan a game together.");
  await page.getByLabel("Hanya pengelola yang dapat mengirim pesan", { exact: false }).check();
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.getByRole("button", { name: "Pengaturan ruang squad-chat" }).waitFor();
  assert.equal(writes.at(-1).method, "PATCH");
  assert.equal(writes.at(-1).body.isReadOnly, true);
  await page.getByRole("button", { name: "Tambah ruang", exact: true }).click();
  await page.getByLabel("Nama ruang").fill("game-night");
  await page.getByRole("combobox", { name: "Jenis ruang", exact: true }).selectOption("voice");
  await page.getByLabel("Kategori", { exact: true }).selectOption("voice");
  await page.getByRole("button", { name: "Tambahkan", exact: true }).click();
  await page.getByRole("button", { name: "Pengaturan ruang game-night" }).waitFor();
  assert.equal(writes.at(-1).body.type, "voice");
  await page.getByText("Atur daftar ruang", { exact: true }).click();
  await page.getByRole("button", { name: "Tambah kategori", exact: true }).click();
  await page.getByLabel("Nama kategori").fill("EVENTS");
  await page.getByRole("button", { name: "Tambahkan", exact: true }).click();
  await page.getByRole("button", { name: /^EVENTS/ }).waitFor();
  data.channels.push(channel("remote", "remote-update", "text"));
  await page.evaluate(() => window.__change());
  await page.getByRole("button", { name: "Pengaturan ruang remote-update" }).waitFor();
  await page.evaluate(() => { window.__online = false; window.dispatchEvent(new Event("offline")); });
  await page.getByRole("status").filter({ hasText: "Tidak ada koneksi" }).waitFor();
  data.channels.push(channel("reconnected", "back-online", "text"));
  await page.evaluate(() => { window.__online = true; window.dispatchEvent(new Event("online")); });
  await page.getByRole("button", { name: "Pengaturan ruang back-online" }).waitFor();
  fail = true;
  await page.getByRole("button", { name: "Muat ulang ruang obrolan" }).click();
  await page.getByRole("alert").waitFor();
  fail = false;
  await page.getByRole("button", { name: "Muat ulang ruang obrolan" }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: "Pengaturan ruang squad-chat" }).click();
  await page.screenshot({ path: path.join(output, "channel-settings-mobile.png"), fullPage: true });
  assert.equal(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  data = structuredClone(initial);
  data.currentUser = { ...data.currentUser, isOwner: false, memberRole: "member", permissions: ["view_channels"] };
  writes = [];
  await page.reload();
  await page.getByRole("searchbox").waitFor();
  assert.equal(await page.getByRole("button", { name: "Tambah ruang", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Pengaturan ruang general" }).count(), 0);
  assert.equal(writes.length, 0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, checks: ["search", "unread filter", "collapse categories", "edit channel", "create voice channel", "create category", "live invalidation", "offline recovery", "retry", "mobile layout", "keyboard dismissal", "member controls", "no page errors"] }, null, 2));
  console.log("PASS: 13 community navigation browser checks; screenshots in test-results/community-navigation");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
