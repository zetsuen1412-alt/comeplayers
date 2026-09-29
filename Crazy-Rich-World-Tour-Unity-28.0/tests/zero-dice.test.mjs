import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Runs actual exported PL/pgSQL in an in-memory PostgreSQL, never production.
const db = new PGlite();
const fixture = readFileSync(new URL('./fixtures/server-before-v29.sql', import.meta.url), 'utf8');
const maps = JSON.parse(readFileSync(new URL('./fixtures/map-catalog.json', import.meta.url)));
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const migration = readFileSync(new URL(readdirSync(migrationDir).find(n => n.endsWith('_crwt_zero_dice_v29.sql')), migrationDir), 'utf8');
const host = '11111111-1111-4111-8111-111111111111';
const room = '22222222-2222-4222-8222-222222222222';
const match = '33333333-3333-4333-8333-333333333333';
const seedFor = new Map();
let serial = 0;
const schema = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table crwt_board_tiles(tile_id smallint,name text,kind text,group_id smallint,price integer);
create table crwt_map_catalog(id text primary key,enabled boolean,rules jsonb);
create table crwt_map_tiles(map_id text,tile_id smallint,name text,kind text,group_id smallint,price integer,primary key(map_id,tile_id));
create table crwt_rooms(id uuid primary key,host_user_id uuid,status text,rounds integer,win_condition text,finished_at timestamptz,updated_at timestamptz);
create table crwt_room_members(room_id uuid,seat integer,user_id uuid,bot_key text);
create table crwt_matches(id uuid primary key,room_id uuid,status text,state jsonb,turn_seat smallint,round integer,version bigint,deadline_at timestamptz,ended_at timestamptz);
create table crwt_match_events(match_id uuid,seq bigint,actor_user_id uuid,event_type text,payload jsonb,idempotency_key text,unique(match_id,idempotency_key));
-- Ranked finalization is outside dice scope: record that the real advance calls it.
create table test_rank_finalized(match_id uuid);
create function crwt_v15_finalize_ranked(uuid,jsonb) returns void language sql as $$insert into test_rank_finalized values($1)$$;
`;

before(async () => {
  await db.exec(schema);
  for (const m of maps.maps) await db.query('insert into crwt_map_catalog values($1,$2,$3)', [m.id,m.enabled,m.rules]);
  for (const t of maps.tiles) await db.query('insert into crwt_map_tiles values($1,$2,$3,$4,$5,$6)', [t.map_id,t.tile_id,t.name,t.kind,t.group_id,t.price]);
  await db.exec(fixture);
  await db.exec(migration);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [host]);
  // Discover fixed seeds using PostgreSQL's own generator, not a client RNG.
  for (let i = 0; seedFor.size < 49 && i < 20000; i++) {
    const seed = i / 20000;
    await db.query('select setseed($1)', [seed]);
    const {rows:[pair]} = await db.query('select floor(random()*7)::int a,floor(random()*7)::int b');
    if (!seedFor.has(`${pair.a},${pair.b}`)) seedFor.set(`${pair.a},${pair.b}`, seed);
  }
  assert.equal(seedFor.size,49);
});
after(() => db.close());

async function reset({position=0, map='world_tour', owner=0, bot=false, focus=null, round=1, otherBankrupt=false}={}) {
  const state = { phase:'await_roll', map_id:map, win_condition:'bankruptcy', pending:null,
    festival_group:3, festival_until_round:9999,
    players:[{seat:1,name:'QA',position,cash:5000,bankrupt:false,bot_key:bot?'qa-bot':null,skip_turns:0,
      effects:{shield:2,rent_discount:2,lucky_chance:2,travel_bonus:2,builder_discount:true,extra_roll:2,dice_focus:focus}},
      {seat:2,name:'Other',position:4,cash:5000,bankrupt:otherBankrupt,effects:{}}],
    properties:owner?{[position]:{owner_seat:owner,level:2,invested:1000}}:{} };
  await db.exec('truncate crwt_match_events,crwt_matches,crwt_room_members,crwt_rooms,test_rank_finalized');
  await db.query("insert into crwt_rooms values($1,$2,'playing',1,'bankruptcy',null,null)",[room,host]);
  await db.query('insert into crwt_room_members values($1,1,$2,$3)',[room,bot?null:host,bot?'qa-bot':null]);
  // Timeout caller is a member even when the current seat belongs to a bot.
  if (bot) await db.query('insert into crwt_room_members values($1,2,$2,null)',[room,host]);
  await db.query("insert into crwt_matches values($1,$2,'active',$3,1,$4,0,now()-interval '1 second',null)",[match,room,state,round]);
  return state;
}

async function roll(a,b,mode='human',key=`qa-roll-${++serial}`) {
  await db.query('select setseed($1)',[seedFor.get(`${a},${b}`)]);
  const fn = {human:'crwt_v18_roll',bot:'crwt_v18_bot_step',timeout:'crwt_v18_timeout_tick'}[mode];
  const {rows:[{result}]} = await db.query(`select ${fn}($1,$2) result`,[match,key]);
  return result;
}

test('all 49 ordered pairs: totals, doubles, zero flags and required JSON',async()=>{
  for(let a=0;a<7;a++) for(let b=0;b<7;b++) {
    await reset(); const r=await roll(a,b); const v=r.roll;
    assert.equal(v.d1,a); assert.equal(v.d2,b); assert.equal(v.total,a+b);
    assert.equal(v.doubles,a===b); assert.equal(v.zero_roll,a+b===0);
    assert.equal(v.from,0); assert.equal(v.to,a+b);
    for(const key of ['d1','d2','total','doubles','zero_roll','from','to','tile','event','roll_id']) assert.ok(Object.hasOwn(v,key),key);
    if(a===b) assert.equal(r.turn_seat,1);
  }
});

test('ZERO ROLL cannot farm any tile, on every map, via human, bot or timeout',async()=>{
  let cases=0;
  for(const tile of maps.tiles) for(const mode of ['human','bot','timeout']) {
    const owners=['city','resort'].includes(tile.kind)?[0,1,2]:[0];
    for(const owner of owners) {
      const before=await reset({position:tile.tile_id,map:tile.map_id,owner,bot:mode==='bot'});
      const r=await roll(0,0,mode);
      assert.deepEqual(r.state.players,before.players,`${mode} ${tile.kind} changed player state`);
      assert.deepEqual(r.state.properties,before.properties);
      assert.equal(r.state.festival_group,before.festival_group);
      assert.equal(r.state.festival_until_round,before.festival_until_round);
      assert.equal(r.state.pending,null); assert.equal(r.state.phase,'await_roll');
      assert.equal(r.roll.from,tile.tile_id); assert.equal(r.roll.to,tile.tile_id);
      assert.equal(r.roll.zero_roll,true); assert.equal(r.roll.doubles,true);
      assert.equal(r.roll.event,'ZERO ROLL! Tetap di tempat.');
      assert.equal(r.turn_seat,1); cases++;
    }
  }
  console.log(`Anti-farming: ${cases} real core calls across ${maps.maps.length} maps`);
});

test('normal roll values are identical through human, bot and human/bot timeout paths',async()=>{
  for(const [a,b] of [[0,0],[0,1],[0,6],[1,0],[6,0],[1,1],[6,6]]) {
    for(const mode of ['human','bot','timeout']) {
      await reset({bot:mode==='bot'}); const r=await roll(a,b,mode);
      assert.deepEqual([r.roll.d1,r.roll.d2,r.roll.total],[a,b,a+b]);
    }
    await reset({bot:true}); const timeout=await roll(a,b,'timeout');
    assert.deepEqual([timeout.roll.d1,timeout.roll.d2],[a,b]);
  }
});

test('START pays only on actual crossing; 0+0 at START never pays',async()=>{
  await reset({position:31}); const r=await roll(0,1);
  const bonus=maps.maps.find(x=>x.id==='world_tour').rules.start_bonus??350;
  assert.equal(r.state.players[0].position,0); assert.equal(r.state.players[0].cash,5000+bonus);
  await reset({position:0}); assert.equal((await roll(0,0)).state.players[0].cash,5000);
});

test('Dice Focus is always correct; zero is even and doubles preserve extra_roll',async()=>{
  for(const focus of ['odd','even']) for(let i=0;i<120;i++) {
    await reset({focus}); await db.query('select setseed($1)',[i/120]);
    const {rows:[{r}]}=await db.query('select crwt_v18_roll($1,$2) r',[match,`focus-${focus}-${i}`]);
    assert.equal(r.roll.total%2,focus==='even'?0:1);
    assert.equal(r.state.players[0].effects.dice_focus,null);
  }
  await reset({focus:'even'}); const r=await roll(0,0);
  assert.equal(r.roll.total,0); assert.equal(r.state.players[0].effects.extra_roll,2);
});

test('100,000 pairs use the exact RNG expressions extracted from the migrated core',async()=>{
  const {rows:[{source}]}=await db.query("select prosrc source from pg_proc where proname='crwt_v18_roll_core'");
  const expressions=[...source.matchAll(/v_d[12]:=(floor\(random\(\)\*7\)::integer);/g)].map(x=>x[1]);
  assert.equal(expressions.length,2);
  const {rows:[r]}=await db.query(`with rolls as materialized(select ${expressions[0]} a,${expressions[1]} b from generate_series(1,100000))
    select min(a) amin,max(a) amax,min(b) bmin,max(b) bmax,min(a+b) tmin,max(a+b) tmax,
    count(*) filter(where a not between 0 and 6 or b not between 0 and 6 or a+b not between 0 and 12)::int invalid,
    count(distinct (a,b))::int outcomes from rolls`);
  assert.deepEqual(r,{amin:0,amax:6,bmin:0,bmax:6,tmin:0,tmax:12,invalid:0,outcomes:49});
});

test('idempotency does not pay/process twice and consecutive zero rolls have distinct IDs',async()=>{
  await reset(); const first=await roll(0,0,'human','qa-repeat-key');
  const replay=await roll(6,6,'human','qa-repeat-key');
  assert.deepEqual(replay,first);
  const second=await roll(0,0,'human','qa-second-key');
  assert.notEqual(second.roll.roll_id,first.roll.roll_id);
  const {rows:[{count}]}=await db.query('select count(*)::int count from crwt_match_events'); assert.equal(count,2);
});

test('cron sweep uses v18 core; no round-limit victory; last survivor ends match',async()=>{
  await reset({round:999}); await db.query('select setseed($1)',[seedFor.get('0,0')]);
  await db.query('select crwt_v15_timeout_sweep()');
  const {rows:[s]}=await db.query('select state,status from crwt_matches');
  assert.equal(s.state.last_roll.zero_roll,true); assert.equal(s.status,'active');
  await reset({round:999});
  await db.query('select crwt_v15_advance(id,state,1) from crwt_matches');
  assert.equal((await db.query('select status from crwt_matches')).rows[0].status,'active');
  await reset({otherBankrupt:true});
  await db.query('select crwt_v15_advance(id,state,1) from crwt_matches');
  assert.equal((await db.query('select status from crwt_matches')).rows[0].status,'finished');
  assert.equal((await db.query('select count(*)::int n from test_rank_finalized')).rows[0].n,1);
});

test('RPC permissions and unauthenticated roll guard',async()=>{
  for(const name of ['crwt_v18_roll','crwt_v18_bot_step','crwt_v18_timeout_tick','crwt_v18_roll_core','crwt_v18_timeout_apply']) {
    const {rows:[r]}=await db.query("select has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') auth from pg_proc where proname=$1",[name]);
    assert.equal(r.anon,false); assert.equal(r.auth,!['crwt_v18_roll_core','crwt_v18_timeout_apply'].includes(name));
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(()=>db.query('select crwt_v18_roll($1,$2)',[match,'unauthorized-test']),/not_authenticated/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[host]);
});

test('migration is repeatable and supports the pre-zero 1..6 core',async()=>{
  await db.exec(migration);
  let old=fixture.replaceAll('floor(random()*7)','1+floor(random()*6)')
    .replace("if v_total=0 then\n    v_event:='ZERO ROLL • tetap di tempat • tidak memicu tile';\n  elsif v_tile.kind",'if v_tile.kind')
    .replace("'zero_roll',v_total=0,'dice_min',0,'dice_max',6,",'');
  await db.exec(old); await db.exec(migration);
  await reset(); assert.equal((await roll(0,0)).roll.zero_roll,true);
});
