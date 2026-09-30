import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("messages desktop density fits the complete UI at browser zoom 100 percent", () => {
  const page = read("app/messages/page.tsx");
  const css = read("app/messages/messages.module.css");

  assert.equal(page.includes("visualViewport"), false);
  assert.equal(page.includes("--messages-ui-scale"), false);
  assert.equal(page.includes("--messages-layout-width"), false);
  assert.equal(page.includes("--messages-layout-height"), false);
  // Icon pulse animations may scale; the full page must not.
  const pageLayout = css.match(/\.page\s*\{[^}]*\}/)?.[0] ?? "";
  assert.ok(pageLayout, "The page layout selector must exist");
  assert.doesNotMatch(pageLayout, /transform:\s*scale/);
  assert.equal(/\bzoom\s*:/.test(css), false);

  assert.match(css, /width: 100vw;/);
  assert.match(css, /height: 100dvh;/);
  assert.match(css, /height: calc\(100dvh - 98px\)/);
  assert.match(css, /grid-template-columns: 306px minmax\(0, 1fr\) 306px/);
  assert.match(css, /grid-template-rows: 76px 8px minmax\(0, 1fr\) 15px 80px/);

  assert.match(
    css,
    /@media \(min-width: 1280px\) and \(max-height: 820px\)/,
  );
  assert.match(css, /font-size: 80% !important;/);
  assert.match(css, /height: calc\(100dvh - 78px\) !important;/);
  assert.match(css, /grid-template-columns: 245px minmax\(0, 1fr\) 245px !important;/);
  assert.match(
    css,
    /grid-template-rows: 61px 6px minmax\(0, 1fr\) 12px 64px !important;/,
  );
  assert.match(css, /left: 276px !important;/);
  assert.match(css, /right: 278px !important;/);
  assert.match(css, /height: 64px !important;/);
});

test("messages header and community navigation avoid dead single-slug routes", () => {
  const page = read("app/messages/page.tsx");
  for (const route of [
    "/play",
    "/tournaments",
    "/leaderboards",
    "/sell",
    "/members",
    "/events",
  ]) {
    assert.equal(page.includes(`href=\"${route}\"`), false, route);
  }
  assert.doesNotMatch(page, /showPlayMenu/);
  assert.match(page, /showCreateMenu/);
  assert.match(page, /router\.push\("\/tournaments"\)/);
  assert.equal(page.includes("Sign in to view server leaderboards."), false);
});
