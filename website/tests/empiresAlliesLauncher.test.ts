import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as crypto from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const websiteRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(websiteRoot, file), "utf8");

function loadSource(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports,
    require(name: string) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
    ...globals,
  }, { filename: file });
  return exports;
}

test("Empires & Allies is available from an isolated lightweight launcher", () => {
  const page = read("app/play/empires-allies/page.tsx");
  const launcher = read("app/play/empires-allies/EmpiresAlliesLauncher.tsx");

  assert.match(page, /EmpiresAlliesLauncher/);
  assert.match(launcher, /\/api\/games\/empires-allies\/ticket/);
  assert.match(launcher, /window\.location\.assign\(result\.launchUrl\)/);
  assert.match(launcher, /redirectPath="\/play\/empires-allies"/);
  assert.doesNotMatch(launcher, /iframe|EmpiresAlliesGame|\/social/);
});

test("community stays free of the Empires & Allies launcher", () => {
  const community = read("app/messages/page.tsx");
  assert.doesNotMatch(community, /empires-allies|EmpiresAlliesLauncher|EmpiresAlliesGame|RufflePlayer|ruffle-player/);
});

test("rendering the launcher requests no game ticket until the play button is clicked", async () => {
  const requests: { url: string; method: string }[] = [];
  const navigations: string[] = [];
  const effects: (() => unknown)[] = [];
  const buttons: { onClick: () => void }[] = [];
  function jsx(type: unknown, props: Record<string, unknown>) {
    if (type === "button") buttons.push(props as { onClick: () => void });
    return { type, props };
  }
  const launcherExports = loadSource("app/play/empires-allies/EmpiresAlliesLauncher.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: (initial: unknown) => [initial, () => undefined], useEffect: (effect: () => unknown) => effects.push(effect) },
    "next/link": { default: "link" },
    "react-icons/fa": { FaArrowLeft: "arrow", FaGamepad: "gamepad", FaShieldAlt: "shield" },
    "@/components/auth/AuthModal": { default: "auth-modal" },
    "@/lib/authenticatedFetch": {
      authenticatedFetchJson: async (url: string, options: { method: string }) => {
        requests.push({ url, method: options.method });
        return { launchUrl: "https://game.example/comeplayers/launch?ticket=synthetic" };
      },
    },
  }, { window: { location: { assign: (url: string) => navigations.push(url) } } });
  (launcherExports.default as () => unknown)();
  for (const effect of effects) effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 0);
  assert.equal(navigations.length, 0);
  assert.equal(buttons.length, 1);

  buttons[0].onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [{ url: "/api/games/empires-allies/ticket", method: "POST" }]);
  assert.deepEqual(navigations, ["https://game.example/comeplayers/launch?ticket=synthetic"]);
});

function notificationRoute(route: "events" | "social") {
  const notifications: Record<string, unknown>[] = [];
  const secret = "synthetic-game-service-secret-for-tests";
  const userId = "11111111-1111-4111-8111-111111111111";
  const friendId = "22222222-2222-4222-8222-222222222222";
  const database = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        insert(row: Record<string, unknown>) {
          if (table === "notifications") notifications.push(row);
          return query;
        },
        async single() { return { data: { id: "created-invite" }, error: null }; },
        async maybeSingle() {
          const data = table === "chat_friendships" ? { id: "friendship" }
            : table === "profiles" ? { username: "Commander" }
            : table === "notifications" ? notifications.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null
            : null;
          return { data, error: null };
        },
        then(resolve: (result: { data: null; error: null }) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const routeExports = loadSource(`app/api/games/empires-allies/${route}/route.ts`, {
    "node:crypto": crypto,
    "next/server": { NextResponse: Response },
    "@/lib/serverSupabase": {
      createSupabaseAdmin: () => database,
      requireAuthenticatedUser: async () => ({ id: userId }),
    },
  }, { process: { env: { EMPIRES_ALLIES_SHARED_SECRET: secret } } });
  const post = routeExports.POST as (request: Request) => Promise<Response>;
  return {
    notifications, userId, friendId,
    post: (body: Record<string, unknown>) => post(new Request(`https://site.example/api/games/empires-allies/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    })),
  };
}

test("attack notifications open the standalone launcher and retain the event identity for deduplication", async () => {
  const route = notificationRoute("events");
  const eventId = "33333333-3333-4333-8333-333333333333";
  const body = { event: "friend_attack", eventId, attackerUserId: route.userId, defenderUserId: route.friendId, occurredAt: Math.floor(Date.now() / 1000) };
  const response = await route.post(body);
  assert.equal(response.status, 200);
  assert.equal(route.notifications.length, 1);
  const destination = new URL(String(route.notifications[0].link_url), "https://site.example");
  assert.equal(destination.pathname, "/play/empires-allies");
  assert.equal(destination.searchParams.get("attackEvent"), eventId);
  const retry = await route.post(body);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(route.notifications.length, 1);
});

test("friend invitations open the standalone launcher", async () => {
  const route = notificationRoute("social");
  const response = await route.post({ action: "invite", targetUserId: route.friendId });
  assert.equal(response.status, 200);
  assert.equal(route.notifications.length, 1);
  assert.equal(route.notifications[0].type, "game_invite");
  assert.equal(route.notifications[0].link_url, "/play/empires-allies");
});
