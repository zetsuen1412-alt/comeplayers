import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { withMonitorSessionDeadline } from '../lib/monitorSessionDeadline';

function load(path: string, modules: Record<string, unknown>, globals = {}) {
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  const source = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, Request, Response, Buffer, AbortSignal, ...globals,
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return exports;
}

test('hanging authentication aborts upstream work and returns before the native login budget', async () => {
  let signal: AbortSignal | undefined;
  const start = Date.now();
  await assert.rejects(withMonitorSessionDeadline(s => {
    signal = s; return new Promise(() => {});
  }, 15), { status: 503 });
  assert.equal(signal?.aborted, true);
  assert.ok(Date.now() - start < 2000);
});

test('an expired authentication attempt cannot abort a concurrent device login', async () => {
  const slow = withMonitorSessionDeadline(() => new Promise(() => {}), 10);
  const fast = withMonitorSessionDeadline(async signal => {
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(signal.aborted, false); return 'authorized';
  }, 1000);
  await assert.rejects(slow); assert.equal(await fast, 'authorized');
});

test('all scoped Supabase transports forward cancellation and block requests after expiry', async () => {
  let calls = 0;
  const api = load('lib/serverSupabase.ts', {
    '@supabase/supabase-js': { createClient: (_url: unknown, _key: unknown, options: unknown) => options },
    '@/lib/auth/accountSessionConfig': { singleDeviceSessionsEnabled: () => false },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-public', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' } },
    fetch: async (_input: unknown, init: RequestInit) => { calls++; return init.signal; } });
  const controller = new AbortController();
  for (const factory of ['createSupabaseAuthClient', 'createSupabaseAdmin', 'createSupabaseUserClient']) {
    const original = new AbortController();
    const args = factory === 'createSupabaseUserClient' ? ['fixture-bearer', { signal: controller.signal }] : [{ signal: controller.signal }];
    const client = api[factory](...args) as { global: { fetch: typeof fetch } };
    const signal = await client.global.fetch('https://supabase.example.test', { signal: original.signal }) as unknown as AbortSignal;
    assert.equal(signal.aborted, false);
    original.abort(); assert.equal(signal.aborted, true);
  }
  const client = api.createSupabaseAdmin({ signal: controller.signal }) as { global: { fetch: typeof fetch } };
  controller.abort();
  assert.throws(() => client.global.fetch('https://supabase.example.test'));
  assert.equal(calls, 3);
});

async function sessionRoute(options: { hang?: boolean; authStatus?: number; accessStatus?: number } = {}) {
  let requests = 0;
  let upstreamSignal: AbortSignal | undefined;
  const route = load('app/api/admin/payroll/mobile/session/route.ts', {
    'next/server': { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) } },
    'node:crypto': await import('node:crypto'),
    '@/lib/monitorSessionDeadline': { withMonitorSessionDeadline: (work: (signal: AbortSignal) => Promise<unknown>) => withMonitorSessionDeadline(work, options.hang ? 15 : 1000) },
    '@/lib/serverSupabase': {
      createSupabaseAdmin: () => ({ rpc: async () => ({ data: true }) }),
      createSupabaseAuthClient: ({ signal }: { signal: AbortSignal }) => ({ auth: { signInWithPassword: async () => {
        requests++; upstreamSignal = signal;
        if (options.hang) return new Promise(() => {});
        return options.authStatus ? { error: { status: options.authStatus }, data: {} }
          : { data: { session: { access_token: 'private-access', refresh_token: 'private-refresh', expires_at: 9999999 } } };
      } } }),
    },
    '@/lib/monitorAccess': { requireMonitorAccess: async (_request: Request, input: { signal: AbortSignal }) => {
      assert.equal(input.signal, upstreamSignal);
      if (options.accessStatus) throw Object.assign(new Error('private database detail'), { status: options.accessStatus });
    } },
    '@/lib/adminSecurity': { adminErrorStatus: (error: { status?: number }) => error.status ?? 500 },
  });
  const response = await route.POST(new Request('https://test/session', {
    method: 'POST', body: JSON.stringify({ action: 'login', username: 'fixture@example.test', password: 'fixture-password' }),
  })) as Response;
  return { response, requests, upstreamSignal };
}

test('session deadline gives a private no-store 503 without retrying password verification', async () => {
  const { response, requests, upstreamSignal } = await sessionRoute({ hang: true });
  assert.equal(response.status, 503); assert.equal(requests, 1); assert.equal(upstreamSignal?.aborted, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /private-access|private-refresh|fixture-password|fixture@example/);
});

test('upstream Auth 504 and access database failures stay retryable 503, not wrong-password or forbidden', async () => {
  for (const options of [{ authStatus: 504 }, { accessStatus: 503 }, { accessStatus: 500 }]) {
    const { response, requests } = await sessionRoute(options);
    assert.equal(response.status, 503); assert.equal(requests, 1);
    assert.doesNotMatch(await response.text(), /private-access|private-refresh|private database/);
  }
});

test('invalid credentials and denied Monitor access remain rejected before tokens are returned', async () => {
  for (const [options, status] of [[{ authStatus: 400 }, 401], [{ accessStatus: 403 }, 403], [{ accessStatus: 401 }, 401]] as const) {
    const { response } = await sessionRoute(options);
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /private-access|private-refresh/);
  }
  const { response } = await sessionRoute();
  assert.equal(response.status, 200); assert.equal((await response.json()).accessToken, 'private-access');
});
