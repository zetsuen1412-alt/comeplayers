// Isolated, disposable PostgreSQL; never reads production database credentials.
// Install runner: npm install --prefix tmp/telegram-pg --no-save embedded-postgres@17.9.0-beta.17
// Run from website: node scripts/test-payroll-telegram-concurrency.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve('tmp/telegram-pg/node_modules/embedded-postgres/dist/index.js')).href);
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const databaseDir = await mkdtemp(join(tmpdir(), 'comeplayers-telegram-pg-'));
const postgres = new EmbeddedPostgres({ databaseDir, port, user: 'postgres', password: randomBytes(32).toString('hex'), persistent: true, initdbFlags: ['--encoding=UTF8'], onLog() {}, onError() {} });
const { pg_ctl } = await import(pathToFileURL(resolve('tmp/telegram-pg/node_modules/@embedded-postgres/windows-x64/dist/index.js')).href);
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`PostgreSQL runner exited ${code}`)));
  });
}
const clients = [];
let started = false;
try {
  await postgres.initialise();
  await run(pg_ctl, ['start','-D',databaseDir,'-o',`-p ${port} -h 127.0.0.1`,'-l',join(databaseDir,'postgres.log'),'-w']);
  started = true;
  console.log('Local PostgreSQL started.');
  for (let i = 0; i < 4; i++) { const c = postgres.getPgClient('postgres', '127.0.0.1'); await c.connect(); clients.push(c); }
  const db = clients[0];
  await db.query("create role anon; create role authenticated; create role service_role; create table cp_payroll_workspace(id int primary key,payload jsonb,revision bigint default 0,updated_at timestamptz default now()); insert into cp_payroll_workspace(id,payload) values(1,'{}');");
  for (const file of ['20260926030000_payroll_telegram_operations.sql', '20260926030001_payroll_telegram_durable_workflow.sql', '20260926030002_payroll_telegram_leader_dispatch.sql', '20260926035622_payroll_telegram_item_workflow.sql', '20260926041704_payroll_telegram_strict_division_routing.sql']) await db.query(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  await db.query("insert into cp_payroll_telegram_divisions(division,chat_id) values('FH1',-1),('FH2',-2),('FH3',-3); insert into cp_payroll_telegram_employees(employee_code,telegram_user_id,division) values('A',1,'FH1'),('B',2,'FH1'),('C',3,'FH1');");
  const workspace = { 'cp-ofs-demo-user-orders-v3': [{ id: 'local-only', externalReference: 'LOCAL-GOLD', orderType: 'gold', quantity: 200, team: 'FH1', operationalStatus: 'draft' }], 'cp-ofs-demo-employees-v2': ['A','B','C'].map(code => ({ code, name: code, team: 'FH1', workforceStatus: 'SHIFT' })) };
  await db.query('update cp_payroll_workspace set payload=$1::jsonb', [JSON.stringify(workspace)]);
  await db.query("update cp_payroll_telegram_orders set delivered_quantity=180 where order_ref='LOCAL-GOLD'");
  let updateId = 1;
  async function event(client, userId, action, rest = {}, id = updateId++) {
    return (await client.query('select cp_telegram_process_update($1,$2::jsonb,false) as result', [id, JSON.stringify({ userId, chatId: -1, ref: 'LOCAL-GOLD', action, ...rest })])).rows[0].result;
  }
  const sessions = [];
  for (let userId=1; userId<=3; userId++) {
    const session = await event(db,userId,'gold'); assert.ok(!session.rejected,session.text);
    await event(db,userId,'amount',{quantity:[15,20,10][userId-1]});
    await event(db,userId,'media',{messageId:userId,mediaType:'photo',fileId:`metadata-${userId}`,fileUniqueId:`unique-${userId}`});
    sessions.push(session.sessionId);
  }
  // Hold the workspace row so all three transactions are demonstrably waiting concurrently.
  await db.query('begin'); await db.query('select id from cp_payroll_workspace where id=1 for update');
  const pids = await Promise.all(clients.slice(1).map(c=>c.query('select pg_backend_pid() as pid')));
  const finishing = clients.slice(1).map((c,i)=>event(c,i+1,'finish',{sessionId:sessions[i]}));
  let waiting = 0;
  for (let attempt=0; attempt<50; attempt++) {
    await db.query('select pg_stat_clear_snapshot()');
    waiting = Number((await db.query("select count(*) as n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids.map(r=>r.rows[0].pid)])).rows[0].n);
    if (waiting===3) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  await db.query('commit');
  const results = await Promise.all(finishing);
  assert.equal(waiting,3,'All independent clients must contend on the row lock');
  assert.equal(results.reduce((sum,r)=>sum+Number(r.accepted??0),0),20);
  assert.equal((await db.query("select delivered_quantity from cp_payroll_telegram_orders where order_ref='LOCAL-GOLD'")).rows[0].delivered_quantity,'200');
  assert.equal(results.filter(r=>r.rejected).length>=1,true);
  const sameId=updateId++;
  await Promise.all(clients.slice(1).map(c=>event(c,1,'myid',{},sameId)));
  assert.equal((await db.query('select count(*) n from cp_payroll_telegram_updates where update_id=$1',[sameId])).rows[0].n,'1');
  assert.equal((await db.query('select count(*) n from cp_payroll_telegram_outbox where event_key=$1',[`update:${sameId}`])).rows[0].n,'1');
  console.log('PASS: three independent PostgreSQL connections blocked concurrently; Gold capped at 200; duplicate update committed once.');
  await db.query("select cp_telegram_configure_leader(array['FH1'],900,'Local leader')");
  const item = { id: 'local-item', externalReference: 'LOCAL-ITEM', orderType: 'item', quantity: 10, team: 'FH1', assignmentMode: 'leader', operationalStatus: 'draft' };
  workspace['cp-ofs-demo-user-orders-v3'].push(item);
  await db.query('update cp_payroll_workspace set payload=$1::jsonb', [JSON.stringify(workspace)]);
  const context = { chatId: 900, ref: 'LOCAL-ITEM' };
  assert.ok(!(await event(db,900,'assign',{...context,employeeCode:'A'})).rejected);
  await event(db,900,'start',context);
  await event(db,900,'media',{...context,messageId:50,mediaType:'photo',fileId:'start-item',fileUniqueId:'start-item'});
  const done = await event(db,900,'done',context);
  await event(db,900,'media',{...context,messageId:51,mediaType:'photo',fileId:'done-item',fileUniqueId:'done-item'});
  await db.query('begin'); await db.query('select id from cp_payroll_workspace where id=1 for update');
  const itemFinishing = clients.slice(1).map(c=>event(c,900,'finish',{...context,sessionId:done.sessionId}));
  waiting = 0;
  for (let attempt=0; attempt<50; attempt++) {
    await db.query('select pg_stat_clear_snapshot()');
    waiting = Number((await db.query("select count(*) as n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids.map(r=>r.rows[0].pid)])).rows[0].n);
    if (waiting===3) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  await db.query('commit');
  const itemResults = await Promise.all(itemFinishing);
  assert.equal(waiting,3);
  assert.equal(itemResults.filter(r=>r.state==='done_pending_admin').length,1);
  assert.equal(itemResults.filter(r=>r.rejected).length,2);
  assert.equal((await db.query("select delivered_quantity from cp_payroll_telegram_orders where order_ref='LOCAL-ITEM'")).rows[0].delivered_quantity,'10');
  console.log('PASS: three concurrent Item completions commit exactly once; delivered quantity stays 10.');
} finally {
  if (clients[0]) await clients[0].query('rollback').catch(() => {});
  await Promise.all(clients.map(c=>c.end()));
  if (started) await run(pg_ctl, ['stop','-D',databaseDir,'-m','fast','-w']);
}
