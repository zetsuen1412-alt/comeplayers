import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function fixture(path: string, hang: boolean) {
  const signals: AbortSignal[] = [];
  const service = createClient('https://catalog.example.test', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (_input, init) => {
      const signal = init?.signal;
      assert.ok(signal); signals.push(signal);
      if (!hang) return new Response(JSON.stringify([{ id: 1, slug: 'sample', name: 'Sample' }]), { status: 200 });
      return await new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } },
  });
  const exports: { default?: () => Promise<unknown>; revalidate?: number; dynamic?: string } = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, process: { env: {} }, AbortSignal: { timeout: (ms: number) => {
    assert.equal(ms, 5_000); return AbortSignal.timeout(15);
  } }, require: (name: string) => {
    if (name === '@/lib/supabase') return { supabase: service };
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'next/link') return { default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props) };
    throw new Error(name);
  } });
  return { exports, signals };
}

test('unresponsive catalog is cancelled in parallel and sitemap keeps static routes with a refresh window', async () => {
  const { exports, signals } = fixture('app/sitemap.ts', true);
  const result = await exports.default!() as { url: string }[];
  assert.equal(exports.revalidate, 3600);
  // PostgREST may retry with the same already-aborted signal; no query gets a
  // new deadline and native fetch rejects those retries without another send.
  assert.equal(new Set(signals).size, 3); assert.ok(signals.every(signal => signal.aborted));
  assert.equal(result.length, 5);
  assert.ok(result.some(row => row.url.endsWith('/arcade')));
  assert.ok(result.some(row => row.url.endsWith('/games/comeplayers-strike')));
});

test('healthy sitemap still includes catalog URLs and admin category timeout shows a retry message', async () => {
  const normal = await fixture('app/sitemap.ts', false).exports.default!() as { url: string }[];
  assert.ok(normal.some(row => row.url.endsWith('/games/sample/offers')));
  assert.ok(normal.some(row => row.url.endsWith('/product/sample')));
  assert.ok(normal.some(row => row.url.endsWith('/games?category=sample')));
  const admin = fixture('app/admin/category-mapping/page.tsx', true);
  const view = await admin.exports.default!() as React.ReactNode;
  assert.equal(admin.exports.dynamic, 'force-dynamic');
  assert.match(renderToStaticMarkup(view), /Kategori belum dapat dimuat/);
  assert.doesNotMatch(renderToStaticMarkup(view), /Tambahkan baris pada tabel/);
  assert.equal(new Set(admin.signals).size, 1); assert.ok(admin.signals.every(signal => signal.aborted));
});
