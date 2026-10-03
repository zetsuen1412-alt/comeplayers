import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { EMPTY_CONFIG, normalizePhone, whatsappLink, facebookTarget, validateConfig, publicationText, replyText, isJobSeekerPost, validateImage, readLimited, browserStage, browserResultNote, browserNoteStage, LokerError, type Config } from '../lib/loker/model';
import { validSignature, seal, unseal, subjectHash, equalSecret } from '../lib/loker/security';
import { graph } from '../lib/loker/server';
const config = (): Config => ({ ...EMPTY_CONFIG, title: 'Game House', text: 'Lowongan resmi', comment: 'Ada lowongan Game House.', whatsapp: '081234567890', bannerId: '11111111-1111-1111-1111-111111111111', groups: ['https://web.facebook.com/groups/example/'], publishGroups: true, groupsAuthorized: true, faqs: [{ keywords: ['lokasi'], answer: 'Lokasi sesuai alamat yang diisi admin.' }] });
test('phone: Indonesia local number normalized', () => assert.equal(normalizePhone('0812-3456-7890'),'6281234567890'));
test('phone: international format retained', () => assert.equal(normalizePhone('+44 (7700) 900123'),'447700900123'));
test('phone: placeholder, multiple plus, HTML and short number rejected', () => { for (const s of ['','123','+62+81','<script>081234567890</script>','admin']) assert.throws(() => normalizePhone(s),LokerError); });
test('WhatsApp deep link has encoded approved title, not a form', () => { const link = new URL(whatsappLink(config())); assert.equal(link.hostname,'wa.me'); assert.equal(link.pathname,'/6281234567890'); assert.equal(link.searchParams.get('text'),'Halo Admin, saya tertarik dengan lowongan Game House.'); });
test('group URL canonicalizes host and tracking', () => assert.equal(facebookTarget('https://web.facebook.com/groups/example/?ref=share').url,'https://www.facebook.com/groups/example/'));
test('group URLs: reject spoof, credentials, port, javascript, non-group and HTTP', () => { for (const u of ['https://facebook.com.attacker.test/groups/a/','https://www.facebook.com@evil.test/groups/a/','https://user@www.facebook.com/groups/a/','https://www.facebook.com:444/groups/a/','javascript:alert(1)','https://www.facebook.com/messages/','http://www.facebook.com/groups/a/']) assert.throws(() => facebookTarget(u)); });
test('post links canonicalized and group-only inputs cannot be posts', () => { assert.equal(facebookTarget('https://www.facebook.com/groups/a/permalink/123/?x=1',true).url,'https://www.facebook.com/groups/a/posts/123/'); assert.throws(() => facebookTarget('https://www.facebook.com/groups/a/posts/123/')); assert.throws(() => facebookTarget('https://www.facebook.com/groups/a/',true)); });
test('empty campaign is draftable but cannot start', () => { assert.deepEqual(validateConfig(EMPTY_CONFIG),EMPTY_CONFIG); assert.throws(() => validateConfig(EMPTY_CONFIG,true)); });
test('active config requires explicit group authorization', () => assert.throws(() => validateConfig({ ...config(), groupsAuthorized:false },true)));
test('image-only group campaign can start without caption or WhatsApp', () => { const c: Config = { ...EMPTY_CONFIG, bannerId: '11111111-1111-1111-1111-111111111111', groups: ['https://www.facebook.com/groups/example/'], publishGroups: true, commentGroups: true, groupsAuthorized: true, dailyLimit: 20, intervalMinutes: 1 }; assert.doesNotThrow(() => validateConfig(c,true)); });
test('config canonicalizes and deduplicates groups', () => { const c=config();c.groups.push('https://www.facebook.com/groups/example/');assert.equal(validateConfig(c,true).groups.length,1); });
test('daily and scan bounds enforced', () => { for (const limit of [0,51,NaN,1.1]) assert.throws(() => validateConfig({...config(),dailyLimit:limit})); assert.throws(() => validateConfig({...config(),intervalMinutes:0})); });
test('config rejects wrong boolean and excessive text', () => { assert.throws(() => validateConfig({...config(),replyMessenger:'true'}));assert.throws(() => validateConfig({...config(),text:'x'.repeat(4001)})); });
test('approved FAQ is used and WhatsApp always included', () => { const r=replyText(config(),'Lokasi di mana?')!;assert.match(r,/Lokasi sesuai alamat/);assert.match(r,/Asisten otomatis/);assert.match(r,/wa\.me\/6281234567890/); });
test('FAQ uses word boundaries, not partial matches', () => assert.doesNotMatch(replyText(config(),'alokasi')!,/Lokasi sesuai alamat/));
test('FAQ regex-like keyword is escaped', () => { const c=config();c.faqs=[{keywords:['gaji (net)'],answer:'Jawaban aman'}];assert.match(replyText(c,'gaji (net)?')!,/Jawaban aman/); });
test('unknown question does not invent salary', () => { const r=replyText(config(),'Gajinya berapa?')!;assert.match(r,/WhatsApp/);assert.doesNotMatch(r,/50\/50|Rp|diterima/); });
test('STOP never gets an automated reply', () => { for (const s of ['STOP','berhenti','jangan hubungi saya','unsubscribe']) assert.equal(replyText(config(),s),null); });
test('human request points to WhatsApp', () => assert.match(replyText(config(),'minta admin')!,/langsung dengan admin/));
test('publication appends WhatsApp consistently', () => { assert.match(publicationText(config()),/^Lowongan resmi/);assert.match(publicationText(config(),true),/^Ada lowongan/);assert.match(publicationText(config()),/\+6281234567890/); });
test('seeker relevance excludes companies hiring and unrelated posts', () => { assert.equal(isJobSeekerPost('Loker dong buat cowok umur 26'),true);assert.equal(isJobSeekerPost('info loker apa aja yang penting halal'),true);assert.equal(isJobSeekerPost('Kami membuka lowongan untuk yang cari kerja'),false);assert.equal(isJobSeekerPost('Dijual motor bekas'),false); });
test('banner magic bytes and size limits enforced', () => { const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);validateImage(png,'image/png');assert.throws(()=>validateImage(png,'image/jpeg'));assert.throws(()=>validateImage(new TextEncoder().encode('<svg/>'),'image/svg+xml'));assert.throws(()=>validateImage(new Uint8Array(5*1024*1024+1),'image/png')); });
test('request body limit enforced without trusting Content-Length', async () => { await assert.rejects(()=>readLimited(new Request('https://example.test',{method:'POST',body:'x'.repeat(11)}),10),LokerError);const r=await readLimited(new Request('https://example.test',{method:'POST',body:'ok'}),10);assert.equal(new TextDecoder().decode(r),'ok'); });
test('webhook signature missing, malformed or wrong is rejected', () => { const b=Buffer.from('{"a":1}');const h='sha256='+createHmac('sha256','secret').update(b).digest('hex');assert.equal(validSignature(b,h,'secret'),true);assert.equal(validSignature(b,null,'secret'),false);assert.equal(validSignature(b,h,''),false);assert.equal(validSignature(Buffer.from('changed'),h,'secret'),false);assert.equal(validSignature(b,'sha256=no','secret'),false); });
test('empty secret is never accepted', () => { assert.equal(equalSecret('',''),false);assert.equal(equalSecret('a','a'),true);assert.equal(equalSecret('a','aa'),false); });
test('recipient encrypted; ciphertext tampering rejected', () => { const before=process.env.LOKER_DATA_KEY;process.env.LOKER_DATA_KEY='ab'.repeat(32);try{const sealed=seal('1234567890');assert.notEqual(sealed,'1234567890');assert.equal(unseal(sealed),'1234567890');const raw=Buffer.from(sealed,'base64url');raw[15]^=1;assert.throws(()=>unseal(raw.toString('base64url')));assert.equal(subjectHash('x'),subjectHash('x'));assert.notEqual(subjectHash('x'),subjectHash('y'));}finally{if(before===undefined)delete process.env.LOKER_DATA_KEY;else process.env.LOKER_DATA_KEY=before;} });
test('Graph sends token only as Authorization and never retries lost sends', async () => {
  const env={...process.env};const fetchBefore=globalThis.fetch;let calls=0;
  process.env.LOKER_META_PAGE_ID='123';process.env.LOKER_META_PAGE_TOKEN='secret-test-only';process.env.LOKER_META_GRAPH_VERSION='v99.0';
  globalThis.fetch=async (url,init)=>{calls++;assert.equal(String(url),'https://graph.facebook.com/v99.0/123/feed');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer secret-test-only');assert.doesNotMatch(String(url),/secret-test/);throw new Error('timeout');};
  try{await assert.rejects(()=>graph('123/feed',{message:'Test'}));assert.equal(calls,1);}finally{globalThis.fetch=fetchBefore;process.env=env;}
});
test('Graph rejects unexpected paths before networking', async () => {const env={...process.env};process.env.LOKER_META_PAGE_ID='123';process.env.LOKER_META_PAGE_TOKEN='x';process.env.LOKER_META_GRAPH_VERSION='v99.0';try{await assert.rejects(()=>graph('https://evil.test'));await assert.rejects(()=>graph('123/../../secrets'));}finally{process.env=env;}});
const migration = () => readFileSync(resolve(process.cwd(),'supabase/migrations/20261001093000_loker_automation.sql'),'utf8');
test('migration limits privileges to service role, with RLS enabled', () => {const s=migration();assert.equal((s.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,5);assert.match(s,/FROM PUBLIC, anon, authenticated/);assert.match(s,/Admin required/);assert.match(s,/Revision conflict/);});
test('database dispatch uses leases, row locks and no blind retries', () => {const s=migration();assert.match(s,/FOR UPDATE SKIP LOCKED/);assert.match(s,/j\.status <> 'leased'/);assert.match(s,/p_lease/);assert.match(s,/status = 'uncertain'/);assert.match(s,/payload = '\{\}'/);});
test('module never references payroll or writes applicant/employee tables', () => {for(const file of ['model.ts','security.ts','server.ts','webhook.ts']){const s=readFileSync(resolve(process.cwd(),'lib/loker',file),'utf8');assert.doesNotMatch(s, /from\(['"](?:cp_payroll|employees|applicants)|INSERT INTO.*(?:employees|applicants)/i);}});

test('relevant comment implementation has no fixed eight-item slice', () => { const server=readFileSync(resolve(process.cwd(),'lib/loker/server.ts'),'utf8'); assert.doesNotMatch(server,/discovered\.slice\(0,\s*8\)/); });

test('manual review mode is explicit and skips automatic group scan scheduling', () => {
  const server=readFileSync(resolve(process.cwd(),'lib/loker/server.ts'),'utf8');
  assert.match(server,/c\.commentGroups && !c\.manualReview/);
});
test('admin selected comments are tagged for explicit review', () => {
  const route=readFileSync(resolve(process.cwd(),'app/api/admin/lowongan/route.ts'),'utf8');
  assert.match(route,/adminSelected: true/);
  assert.match(route,/selected_comment:/);
});
test('latest STOP migration cancels all queued or leased loker tasks', () => {
  const s=readFileSync(resolve(process.cwd(),'supabase/migrations/20261001113000_loker_stop_all_queued.sql'),'utf8');
  assert.match(s,/status IN \('queued','leased'\)/);
  assert.match(s,/w\.state='stopped'/);
});

test('history retains an allowlisted final stage within the database note limit', () => {
  const note = browserResultNote('[stage:send_clicked] '+ 'x'.repeat(400), 'verification_inconclusive');
  assert.equal(note.length, 250);
  assert.equal(browserNoteStage(note), 'verification_inconclusive');
  assert.equal((note.match(/\[stage:/g)||[]).length, 1);
  assert.equal(browserStage('post_context_found:modal'), 'post_context_found:modal');
  assert.equal(browserStage('composer_candidates:3'), 'composer_candidates:3');
  for (const stage of ['username:Private Person', 'send_clicked\nCookie:secret', 'composer_candidates:secret', 'https://facebook.com/private']) {
    assert.equal(browserStage(stage), '');
    assert.equal(browserResultNote('Pesan aman', stage), 'Pesan aman');
  }
  assert.equal(browserResultNote('Pesan\u0000aman', 'cancelled'), '[stage:cancelled] Pesan aman');
});

type WorkerResult = {status?:string;stage?:string;dispatched?:boolean;stopped?:boolean;handled?:boolean;groupsScanned?:number;items?:unknown[]};
type WorkerMessage = {type:string;id?:string;lease?:string;dispatch?:boolean;job?:Record<string,unknown>;group?:string};
type WorkerSender = {id:string;tab?:{id:number};url?:string};
function workerHarness(options:{get?: (keys:string|string[])=>Promise<void>;send?: (tab:number,message:WorkerMessage,check:()=>Promise<{allowed:boolean}>)=>Promise<WorkerResult|{allowed:boolean}>} = {}) {
  const state:Record<string,unknown> = {facebookTab:2,cancelled:false};
  const navigations:string[] = [];
  let listener:(m:WorkerMessage,sender:WorkerSender,respond:(value:{allowed:boolean})=>void)=>unknown;
  const job = {id:'test-job',lease:'test-lease',target:'https://www.facebook.com/groups/test/posts/100/',kind:'group_comment',text:'',expiresAt:Date.now()+120000};
  const check = () => new Promise<{allowed:boolean}>(resolveCheck=>listener({type:'CP_LOKER_CHECK',id:job.id,lease:job.lease,dispatch:true},{id:'extension-test',tab:{id:2}},resolveCheck));
  const chrome = {
    runtime:{id:'extension-test',getManifest:()=>({version:'test'}),getURL:(path:string)=>`chrome-extension://extension-test/${path}`,onMessage:{addListener:(fn:typeof listener)=>{listener=fn;}},onStartup:{addListener:()=>undefined}},
    storage:{local:{get:async(keys:string|string[])=>{await options.get?.(keys);return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(state[key])]));},set:async(value:Record<string,unknown>)=>{Object.assign(state,structuredClone(value));},remove:async(key:string)=>{delete state[key];}}},
    tabs:{get:async()=>({url:navigations.at(-1)||'https://www.facebook.com/groups/test/',status:'complete'}),query:async()=>[{id:1,url:'https://www.comeplayers.com/admin/lowongan'}],update:async(_tab:number,{url}:{url:string})=>{navigations.push(url);},reload:async()=>undefined,sendMessage:async(tab:number,message:WorkerMessage)=>options.send?options.send(tab,message,check):{status:'skipped',stage:'composer_missing',dispatched:false}},
    scripting:{executeScript:async()=>undefined},
  };
  const source = readFileSync(resolve(process.cwd(),'../tools/comeplayers-loker-extension/worker.js'),'utf8');
  const context = {chrome,URL,Date,setTimeout:(fn:()=>void)=>setTimeout(fn,0),structuredClone,workerApi:null as unknown as {run:(job:Record<string,unknown>,controller:number)=>Promise<WorkerResult>;stop:(notifyAdmin?:boolean)=>Promise<{stopped:boolean;adminStopRequested:boolean}>;resumeReviewed:()=>Promise<{resumed:boolean}>;scan:(groups:string[])=>Promise<WorkerResult>}};
  runInNewContext(source+'\nglobalThis.workerApi = {run,stop,scan,resumeReviewed};',context);
  return {...context.workerApi,job,state,navigations,check};
}
function deferred<T>() {
  let resolvePromise!:(value:T)=>void;
  const promise = new Promise<T>(resolveDeferred=>{resolvePromise=resolveDeferred;});
  return {promise,resolve:resolvePromise};
}

test('STOP during worker startup cannot be overwritten by cancelled:false', async () => {
  const entered=deferred<void>(),release=deferred<void>();
  const worker=workerHarness({get:async keys=>{if(Array.isArray(keys)&&keys.includes('active')){entered.resolve();await release.promise;}}});
  const running=worker.run(worker.job,1);
  await entered.promise;
  await worker.stop();
  release.resolve();
  assert.equal((await running).status,'cancelled');
  assert.equal(worker.navigations.length,0);
  assert.equal(worker.state.cancelled,true);
});

test('STOP while server preflight is pending prevents the send', async () => {
  const entered=deferred<void>(),release=deferred<void>();let clicks=0,preflights=0;
  const worker=workerHarness({send:async(tab,m,check)=>{
    if(tab===1&&m.type==='CP_LOKER_PREFLIGHT'){preflights++;entered.resolve();await release.promise;return {allowed:true};}
    if(m.type==='CP_LOKER_RUN'){const result=await check();if(result.allowed)clicks++;return {status:result.allowed?'sent':'cancelled',dispatched:result.allowed};}
    return {stopped:true};
  }});
  const running=worker.run(worker.job,1);
  await entered.promise;await worker.stop();release.resolve();
  assert.equal((await running).status,'cancelled');
  assert.equal(preflights,1);assert.equal(clicks,0);
});

test('lost acknowledgement after preflight is uncertain and never replayed', async () => {
  let attempts=0;
  const worker=workerHarness({send:async(tab,m,check)=>{
    if(tab===1&&m.type==='CP_LOKER_PREFLIGHT')return {allowed:true};
    if(m.type==='CP_LOKER_RUN'){attempts++;assert.equal((await check()).allowed,true);throw new Error('lost result');}
    return {stopped:true};
  }});
  const result=await worker.run(worker.job,1);
  assert.equal(result.status,'uncertain');assert.equal(result.dispatched,true);assert.equal(attempts,1);
});

test('worker reserves one task before asynchronous startup', async () => {
  const entered=deferred<void>(),release=deferred<void>();
  const worker=workerHarness({get:async keys=>{if(Array.isArray(keys)&&keys.includes('active')){entered.resolve();await release.promise;}}});
  const running=worker.run(worker.job,1);await entered.promise;
  await assert.rejects(()=>worker.run({...worker.job,id:'second'},1),/Masih ada tugas/);
  release.resolve();assert.equal((await running).status,'skipped');assert.equal(worker.navigations.length,1);
});

test('STOP during a group scan prevents navigation to the next group', async () => {
  const worker:ReturnType<typeof workerHarness>=workerHarness({send:async(_tab,m)=>{if(m.type==='CP_LOKER_SCAN_ALL'){await worker.stop();return {items:[]};}return {stopped:true};}});
  const result=await worker.scan(['https://www.facebook.com/groups/test/','https://www.facebook.com/groups/next/']);
  assert.equal(result.stopped,true);assert.equal(result.groupsScanned,1);assert.equal(worker.navigations.length,1);
});

test('STOP remains latched across automatic jobs until explicit reviewed resume', async () => {
  const worker=workerHarness();await worker.stop();
  assert.equal((await worker.run(worker.job,1)).status,'cancelled');
  assert.equal((await worker.run({...worker.job,id:'next-job'},1)).status,'cancelled');
  assert.equal(worker.navigations.length,0);
  assert.equal((await worker.resumeReviewed()).resumed,true);
  assert.equal((await worker.run(worker.job,1)).status,'skipped');assert.equal(worker.navigations.length,1);
});

test('popup STOP forwards cancellation to Admin and keeps browser latch', async () => {
  let adminRequests=0;
  const worker=workerHarness({send:async(tab,m)=>{
    if(tab===1&&m.type==='CP_LOKER_STOP_CAMPAIGN'){adminRequests++;return {handled:true};}
    return {stopped:true};
  }});
  const result=await worker.stop(true);
  assert.equal(result.adminStopRequested,true);assert.equal(adminRequests,1);
  assert.equal(worker.state.stopLatched,true);assert.equal((await worker.run(worker.job,1)).status,'cancelled');
});

function bridgeHarness(resume?:()=>Promise<{resumed:boolean}>) {
  class Button {
    disabled=false;clicks=0;
    constructor(public textContent:string) {}
    closest(){return this;}
    getClientRects(){return [{}];}
    click(){this.clicks++;}
  }
  const stopButton=new Button('STOP'),sendButton=new Button('KIRIM KOMENTAR (2)');
  const sent:string[]=[];const results:Record<string,unknown>[]=[];
  let onClick:(event:{isTrusted:boolean;target:Button})=>void;
  let onWindowMessage:(event:{source:unknown;origin:string;data:Record<string,unknown>})=>Promise<void>;
  let onRuntimeMessage:(message:{type:string},sender:{id:string},respond:(value:{handled:boolean})=>void)=>unknown;
  const window={addEventListener:(_name:string,fn:typeof onWindowMessage)=>{onWindowMessage=fn;},postMessage:(message:Record<string,unknown>)=>{results.push(message);}};
  const document={addEventListener:(_name:string,fn:typeof onClick)=>{onClick=fn;},querySelectorAll:()=>[stopButton]};
  const chrome={runtime:{id:'extension-test',onMessage:{addListener:(fn:typeof onRuntimeMessage)=>{onRuntimeMessage=fn;}},sendMessage:async(message:{command:string})=>{
    sent.push(message.command);
    return message.command==='resume_reviewed'?(resume?await resume():{resumed:true}):{status:'skipped'};
  }}};
  const context={window,document,chrome,Element:Button,location:{origin:'https://www.comeplayers.com'},setTimeout,clearTimeout,crypto};
  runInNewContext(readFileSync(resolve(process.cwd(),'../tools/comeplayers-loker-extension/bridge.js'),'utf8'),context);
  return {sent,results,stopButton,approve:(trusted=true)=>onClick({isTrusted:trusted,target:sendButton}),
    command:(command:string)=>onWindowMessage({source:window,origin:context.location.origin,data:{source:'cp-loker-ui',kind:'command',requestId:'request',command}}),
    popupStop:()=>{let handled=false;onRuntimeMessage({type:'CP_LOKER_STOP_CAMPAIGN'},{id:'extension-test'},result=>{handled=result.handled;});return handled;}};
}

test('older Admin review click resumes only the first run after campaign preparation STOP', async () => {
  const bridge=bridgeHarness();bridge.approve();await bridge.command('stop');await bridge.command('run');await bridge.command('run');
  assert.deepEqual(bridge.sent,['stop','resume_reviewed','run','run']);
});

test('popup STOP invokes existing Admin handler and revokes old review approval', async () => {
  const bridge=bridgeHarness();bridge.approve();assert.equal(bridge.popupStop(),true);await bridge.command('run');
  assert.equal(bridge.stopButton.clicks,1);assert.deepEqual(bridge.sent,['run']);
  const untrusted=bridgeHarness();untrusted.approve(false);await untrusted.command('run');assert.deepEqual(untrusted.sent,['run']);
});

test('popup STOP while reviewed resume is pending never starts the browser job', async () => {
  const entered=deferred<void>(),release=deferred<void>();
  const bridge=bridgeHarness(async()=>{entered.resolve();await release.promise;return {resumed:true};});
  bridge.approve();const running=bridge.command('run');await entered.promise;bridge.popupStop();release.resolve();await running;
  assert.deepEqual(bridge.sent,['resume_reviewed']);
  assert.equal((bridge.results.at(-1)?.result as WorkerResult).status,'cancelled');
});

test('deployed queue SQL serializes jobs, skips safely, cancels STOP and pauses uncertain sends', async t => {
  const db=new PGlite();
  const actor='11111111-1111-1111-1111-111111111111';
  type LeasedJob={id:string;lease:string;status:string};
  const claimJob=async()=> (await db.query<{job:LeasedJob|null}>("select cp_loker_claim('browser') as job")).rows[0].job;
  const preflightJob=async(job:LeasedJob)=> (await db.query<{allowed:boolean}>('select cp_loker_preflight($1,$2) as allowed',[job.id,job.lease])).rows[0].allowed;
  const finishJob=async(job:LeasedJob,status:string)=>db.query("select cp_loker_finish($1,$2,$3,'','fixture result')",[job.id,job.lease,status]);
  const seed=async()=>{
    await db.exec("truncate cp_loker_jobs; update cp_loker_workspace set state='running',revision=0,config='{\"dailyLimit\":1}';");
    for(let i=0;i<3;i++)await db.query("insert into cp_loker_jobs(dedupe_key,generation,kind,channel,target,payload,created_at) select $1,generation,'group_comment','browser',$2,'{\"adminSelected\":true}',now()+($3::integer * interval '1 second') from cp_loker_workspace where id=1",[`post-${i}`,`https://www.facebook.com/groups/test/posts/${i+100}/`,i]);
  };
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create table profiles(id uuid primary key,role text);insert into profiles values('${actor}','admin');`);
    for(const file of ['20261001093000_loker_automation.sql','20261001104000_loker_banner_5mb.sql','20261001110500_loker_unlimited_relevant_comments.sql','20261001113000_loker_stop_all_queued.sql'])await db.exec(readFileSync(resolve(process.cwd(),'supabase/migrations',file),'utf8'));
    await t.test('pre-dispatch skipped target advances to next selected post',async()=>{
      await seed();const first=await claimJob();assert.ok(first);assert.equal(await claimJob(),null);
      await finishJob(first,'skipped');const second=await claimJob();assert.ok(second);assert.notEqual(second.id,first.id);
      assert.equal(await preflightJob(second),true);assert.equal(await preflightJob(second),false);
      await finishJob(second,'sent');const third=await claimJob();assert.ok(third);assert.equal(await preflightJob(third),true);
    });
    await t.test('STOP cancels every queued and leased target before dispatch',async()=>{
      await seed();const first=await claimJob();assert.ok(first);
      await db.query("select cp_loker_control(0,'stop','{}',$1)",[actor]);
      assert.equal(await preflightJob(first),false);assert.equal(await claimJob(),null);
      assert.equal((await db.query<{n:number}>("select count(*)::int as n from cp_loker_jobs where status='cancelled'")).rows[0].n,3);
    });
    await t.test('uncertain dispatch pauses batch and never leases that job again',async()=>{
      await seed();const first=await claimJob();assert.ok(first);assert.equal(await preflightJob(first),true);
      await finishJob(first,'uncertain');assert.equal(await claimJob(),null);
      assert.equal((await db.query<{state:string}>('select state from cp_loker_workspace')).rows[0].state,'paused');
      await db.query("select cp_loker_control(1,'start','{}',$1)",[actor]);
      const next=await claimJob();assert.ok(next);assert.notEqual(next.id,first.id);
    });
    await t.test('worker crash after dispatch becomes uncertain without automatic retry',async()=>{
      await seed();const first=await claimJob();assert.ok(first);assert.equal(await preflightJob(first),true);
      await db.query("update cp_loker_jobs set leased_at=now()-interval '4 minutes' where id=$1",[first.id]);
      assert.equal(await claimJob(),null);
      assert.equal((await db.query<{status:string}>('select status from cp_loker_jobs where id=$1',[first.id])).rows[0].status,'uncertain');
      assert.equal((await db.query<{state:string}>('select state from cp_loker_workspace')).rows[0].state,'paused');
    });
  }finally{await db.close();}
});
