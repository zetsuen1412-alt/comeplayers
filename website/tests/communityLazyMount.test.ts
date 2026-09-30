import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const projectRequire = createRequire(path.resolve("package.json"));
const chromeSource = readFileSync(path.resolve("app/components/ConditionalChrome.tsx"), "utf8");
const chromeCode = ts.transpileModule(chromeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mountedChrome(pathname: string) {
  const exports: Record<string, unknown> = {};
  runInNewContext(chromeCode, {
    exports,
    require: (name: string) => name === "next/navigation" ? { usePathname: () => pathname }
      : name === "next/dynamic" ? { default: (loader: () => unknown) => loader.toString().includes("MainHeader") ? "marketplace-header" : "pet" } : projectRequire(name),
  });
  const render = exports.default as (props: Record<string, unknown>) => unknown;
  const tree = render({ children: "page", footer: "marketplace-footer" });
  const mounted: string[] = [];
  function walk(node: unknown) {
    if (typeof node === "string") mounted.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      const element = node as { type?: string; props?: { children?: unknown } };
      if (element.type === "marketplace-header") mounted.push(element.type);
      walk(element.props?.children);
    }
  }
  walk(tree);
  return mounted;
}

test("community owns its chrome without mounting invisible marketplace data loaders", () => {
  for (const route of ["/cpcommunity", "/cpcommunity/servers/a/channels/b", "/messages", "/messages/servers/a/channels/b"]) {
    assert.deepEqual(mountedChrome(route), ["page"], route);
  }
  assert.deepEqual(mountedChrome("/chat"), ["marketplace-header", "page"]);
  assert.deepEqual(mountedChrome("/marketplace"), ["marketplace-header", "page", "marketplace-footer"]);
  assert.deepEqual(mountedChrome("/"), ["page"]);
});

test("text channels skip the voice engine while explicit controls and active voice keep it mounted", () => {
  const source = readFileSync(path.resolve("app/messages/page.tsx"), "utf8");
  const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let condition = "";
  function walk(node: ts.Node) {
    if (ts.isConditionalExpression(node) && node.condition.getText(tree).startsWith("selectedIsGroup") && node.whenTrue.getText(tree).includes("styles.voicePanelHost")) condition = node.condition.getText(tree);
    ts.forEachChild(node, walk);
  }
  walk(tree);
  assert.ok(condition);
  const shouldMount = (state: Record<string, boolean>) => runInNewContext(condition, {
    selectedIsGroup: true, selectedChannelIsVoice: false, showVoicePanel: false,
    voiceDockState: { connected: Boolean(state.connected) }, ...state,
  });
  assert.equal(shouldMount({}), false, "Fresh text channel must not download LiveKit");
  assert.equal(shouldMount({ selectedChannelIsVoice: true }), true);
  assert.equal(shouldMount({ showVoicePanel: true }), true);
  assert.equal(shouldMount({ connected: true }), true, "Closing controls must not tear down connected voice");
  assert.equal(shouldMount({ selectedIsGroup: false, connected: true }), false);
});
