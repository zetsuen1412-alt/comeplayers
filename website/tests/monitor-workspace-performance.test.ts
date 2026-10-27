import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';

test('polling reads a prebuilt projection without scanning or rewriting the Payroll document', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint,updated_at timestamptz);`);
    const payload = {
      'cp-ofs-demo-employees-v2': Array.from({length:60},(_,i)=>({id:`e${i}`,code:`F${i}`,name:`Worker ${i}`,team:'FH3',workforceStatus:'FULL',salary:12345})),
      'cp-ofs-demo-user-orders-v3': Array.from({length:5000},(_,i)=>({id:`o${i}`,externalReference:`X${i}`,team:i%2?'FH3':'FH1',orderType:'boosting',operationalStatus:'completed',quantity:1,employeeCode:`F${i%60}`,employeeName:`Worker ${i%60}`,orderedAt:'2026-10-22T00:00:00Z',service:'Synthetic archive order',grossMinor:999999})),
      closing_archive: 'PRIVATE_CLOSING'.repeat(160000),
    };
    await db.query("insert into cp_payroll_workspace values(1,$1,99,'2026-10-22T00:00:00Z')",[JSON.stringify(payload)]);
    // Only the original read RPCs and rate limiter are required for this benchmark.
    const original = readFileSync(new URL('../supabase/migrations/20261027060739_fh3_open_monitor_workspace.sql',import.meta.url),'utf8');
    const end = original.indexOf('-- Existing private-account/MFA');assert.ok(end>0);
    await db.exec(original.slice(0,end));
    const before = (await db.query<{v:unknown}>('select cp_monitor_workspace_snapshot(true) v')).rows[0].v;
    async function sample() {
      const ms:number[]=[];
      for(let i=0;i<7;i++) {
        const start=performance.now();
        await db.query('select octet_length(cp_monitor_workspace_snapshot(true)::text)');
        ms.push(performance.now()-start);
      }
      return ms.sort((a,b)=>a-b)[3];
    }
    const originalMs=await sample();
    const sourceBefore=(await db.query<{v:string}>('select md5(to_jsonb(w)::text) v from cp_payroll_workspace w')).rows[0].v;
    await db.exec(readFileSync(new URL('../supabase/migrations/20261027154318_fh3_monitor_compact_workspace.sql',import.meta.url),'utf8'));
    const cachedMs=await sample();
    assert.deepEqual((await db.query<{v:unknown}>('select cp_monitor_workspace_snapshot(true) v')).rows[0].v,before);
    const generation=(await db.query<{v:string}>('select xmin::text v from cp_monitor_private.workspace_projection')).rows[0].v;
    for(let i=0;i<30;i++) await db.query('select cp_monitor_public_context($1,false,false)',['c'.repeat(64)]);
    assert.equal((await db.query<{v:string}>('select xmin::text v from cp_monitor_private.workspace_projection')).rows[0].v,generation,'polls do not rewrite or rebuild the projection');
    assert.equal((await db.query<{v:string}>('select md5(to_jsonb(w)::text) v from cp_payroll_workspace w')).rows[0].v,sourceBefore,'source, revision and timestamp remain identical');
    // A broken source/projection builder would fail a recomputation. Reads must
    // still be pure SELECTs against the already-built data, including under NAT.
    await db.exec(`create or replace function cp_monitor_private.project_workspace(p_payload jsonb,p_revision bigint,p_updated_at timestamptz,p_orders boolean)
      returns jsonb language plpgsql as $$ begin raise exception 'Unexpected projection rebuild'; end $$;`);
    assert.deepEqual((await db.query<{v:unknown}>('select cp_monitor_workspace_snapshot(true) v')).rows[0].v,before);
    const roster=(await db.query<{v:unknown}>('select cp_monitor_public_context($1,false,false) v',['c'.repeat(64)])).rows[0].v;
    assert.doesNotMatch(JSON.stringify(roster),/salary|PRIVATE_CLOSING|grossMinor/);
    t.diagnostic(`Synthetic 5,000 orders + 2 MB Closing: median DB projection ${originalMs.toFixed(1)} ms before, ${cachedMs.toFixed(1)} ms cached (${(originalMs/cachedMs).toFixed(1)}x). Local PGlite, not production latency.`);
  } finally { await db.close(); }
});
