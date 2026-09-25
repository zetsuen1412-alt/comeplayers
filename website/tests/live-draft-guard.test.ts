import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../lib/live/use-live-query.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type Query = (background: boolean, canApply: () => boolean) => void | Promise<void>;

function harness(query: Query) {
  const effects: (() => void | (() => void))[] = [], cleanups: (() => void)[] = [];
  const listeners = new Map<string, (event: { target: FakeInput }) => void>();
  let refresh!: () => Promise<boolean>;
  class FakeInput { matches() { return true; } }
  const exported: { useLiveQuery?: (query: Query, deps: unknown[], options: object) => void } = {};
  runInNewContext(code, {
    exports: exported, HTMLElement: FakeInput,
    document: {
      addEventListener: (name: string, callback: (event: { target: FakeInput }) => void) => listeners.set(name, callback),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    require(name: string) {
      if (name === 'react') return { useRef: (current: unknown) => ({ current }), useEffect: (effect: () => void | (() => void)) => effects.push(effect) };
      if (name === './use-live-refresh') return { useLiveRefresh: (callback: () => Promise<boolean>) => { refresh = callback; } };
      throw new Error(name);
    },
  });
  exported.useLiveQuery!(query, [], { topics: 'account', protectDrafts: true });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return {
    refresh: () => refresh(),
    edit: () => listeners.get('input')?.({ target: new FakeInput() }),
    close: () => cleanups.forEach(cleanup => cleanup()),
    listenerCount: () => listeners.size,
  };
}

test('typing after a live request begins prevents its delayed response from replacing the draft', async () => {
  let release!: () => void, applied = 0;
  const h = harness(async (background, canApply) => {
    if (background) await new Promise<void>(resolve => { release = resolve; });
    if (canApply()) applied++;
  });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(applied, 1);
  const refresh = h.refresh(); h.edit(); release(); await refresh;
  assert.equal(applied, 1);
  assert.equal(await h.refresh(), false);
  h.close(); assert.equal(h.listenerCount(), 0);
});

test('leaving a form invalidates its pending response and unregisters draft listeners', async () => {
  let release!: () => void, applied = 0;
  const h = harness(async (_background, canApply) => {
    await new Promise<void>(resolve => { release = resolve; });
    if (canApply()) applied++;
  });
  h.close(); release(); await Promise.resolve(); await Promise.resolve();
  assert.equal(applied, 0); assert.equal(h.listenerCount(), 0);
});
