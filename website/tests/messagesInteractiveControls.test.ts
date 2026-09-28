import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("joined squads remain openable and member controls respect role hierarchy", () => {
  const page = read("app/messages/page.tsx");

  assert.equal(page.includes("disabled={full || busy}"), false);
  assert.match(page, /disabled=\{\(full && !party\.joined\) \|\| busy\}/);
  assert.match(
    page,
    /actorIsModerator[\s\S]{0,700}targetIsModerator[\s\S]{0,220}!isAdminProfile\(profile\)/,
  );
  assert.match(page, /disabled=\{memberBusy\}/);
});

test("livestream controls expose real watcher state and survive layout changes", () => {
  const page = read("app/messages/page.tsx");

  assert.match(page, /entry\.watching === true/);
  assert.match(page, /const compactWatchingCount = watcherCount/);
  assert.match(page, /onWatchingChange=\{setStreamViewerActive\}/);
  assert.match(page, /onHostingChange=\{setStreamHostActive\}/);
  assert.match(
    page,
    /if \(!streamHostActive && !streamViewerActive\)[\s\S]{0,180}setWideMessagesLayout/,
  );
  assert.match(page, /streamViewerActive[\s\S]{0,100}"Keluar siaran"/);
});

test("voice output and channel polling keep their advertised state", () => {
  const page = read("app/messages/page.tsx");
  const voice = read("components/messages/CommunityVoicePanel.tsx");

  assert.match(
    page,
    /\[userId, selectedRoomId, communityChannelSelection\?\.channel\.id\]/,
  );
  assert.match(
    voice,
    /await joinVoice\(selectedVoiceChannel\);[\s\S]{0,120}action === "toggle-output"[\s\S]{0,80}applyOutputMuted\(true\)/,
  );
});

test("server creator opens as an accessible centered modal", () => {
  const page = read("app/messages/page.tsx");
  const styles = read("app/messages/messages.module.css");

  assert.match(page, /createPortal\(/);
  assert.match(page, /className=\{styles\.createModalBackdrop\}/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /createServerTitleRef\.current\?\.focus\(\)/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(styles, /\.createModalBackdrop\s*\{[\s\S]*position:\s*fixed/);
  assert.match(styles, /\.createOverlay\s*\{[\s\S]*width:\s*min\(620px, 100%\)/);
});

test("rename server uses a branded accessible identity modal", () => {
  const page = read("app/messages/page.tsx");
  const styles = read("app/messages/messages.module.css");

  assert.equal(page.includes('window.prompt("Server name"'), false);
  assert.match(page, /showRenameServerModal/);
  assert.match(page, /aria-labelledby="rename-server-title"/);
  assert.match(page, /renameServerInputRef\.current\?\.select\(\)/);
  assert.match(page, /updateServerIdentity\(\{ name \}\)/);
  assert.match(page, /renameServerDraft\.length\}\/80/);
  assert.match(styles, /\.renameServerModal\s*\{[\s\S]*border-radius:\s*28px/);
  assert.match(styles, /\.renameInputShell:focus-within/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
