import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20260930030606_crwt_events_missions_v30.sql', import.meta.url),'utf8');
const indexes = readFileSync(new URL('../supabase/migrations/20260930030753_crwt_mission_progress_indexes_v30.sql', import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111';

before(async()=>{
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table crwt_player_profiles(
      user_id uuid primary key,display_name text not null default 'QA',level int not null default 1,xp int not null default 0,
      gold bigint not null default 25000,diamonds int not null default 250,character_id text not null default 'alexia',
      dice_id text not null default 'travel_dice',deck jsonb not null default '["lucky_day"]',updated_at timestamptz not null default now());
    create table crwt_match_results(id bigserial primary key,match_id uuid not null,user_id uuid not null,placement smallint not null,created_at timestamptz not null default now());
    create table crwt_progression_events(id bigserial primary key,user_id uuid not null,event_type text not null,item_type text,item_id text,
      gold_delta bigint not null default 0,diamonds_delta int not null default 0,metadata jsonb not null default '{}',created_at timestamptz not null default now());
    create function crwt_progression_bootstrap() returns jsonb language plpgsql as $$
    begin
      insert into crwt_player_profiles(user_id) values(auth.uid()) on conflict do nothing;
      return jsonb_build_object('ok',true);
    end $$;
    create function crwt_progression_snapshot() returns jsonb language sql stable as $$
      select jsonb_build_object('profile',jsonb_build_object('gold',gold,'diamonds',diamonds))
      from crwt_player_profiles where user_id=auth.uid()
    $$;
  `);
  await db.exec(migration);
  await db.exec(indexes);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
});
after(()=>db.close());

test('event snapshot exposes six recurring missions with zero initial progress',async()=>{
  const {rows:[{s}]}=await db.query('select crwt_event_snapshot_v30() s');
  assert.equal(s.missions.length,6);
  assert.equal(s.claimable,0);
  assert.ok(s.daily_reset_at);
  assert.ok(s.weekly_reset_at);
  assert.equal(s.missions.find(x=>x.id==='daily_play_1').progress,0);
});

test('daily match progress is capped to target and claim is exactly once',async()=>{
  for(let i=1;i<=3;i++)
    await db.query('insert into crwt_match_results(match_id,user_id,placement) values($1,$2,$3)',
      [`22222222-2222-4222-8222-22222222222${i}`,user,i===1?1:2]);
  const {rows:[{s}]}=await db.query('select crwt_event_snapshot_v30() s');
  assert.equal(s.missions.find(x=>x.id==='daily_play_1').progress,1);
  assert.equal(s.missions.find(x=>x.id==='daily_play_3').progress,3);
  assert.equal(s.missions.find(x=>x.id==='daily_win_1').progress,1);
  const before=(await db.query('select gold from crwt_player_profiles where user_id=$1',[user])).rows[0].gold;
  const {rows:[{r}]}=await db.query("select crwt_claim_mission_v30('daily_play_1') r");
  assert.equal(r.reward_gold,500);
  const after=(await db.query('select gold from crwt_player_profiles where user_id=$1',[user])).rows[0].gold;
  assert.equal(after-before,500);
  await assert.rejects(()=>db.query("select crwt_claim_mission_v30('daily_play_1')"),/mission_already_claimed/);
});

test('unlock progression event advances weekly collector mission',async()=>{
  await db.query("insert into crwt_progression_events(user_id,event_type,item_type,item_id) values($1,'unlock','character','rindi')",[user]);
  const {rows:[{s}]}=await db.query('select crwt_event_snapshot_v30() s');
  const m=s.missions.find(x=>x.id==='weekly_unlock_1');
  assert.equal(m.progress,1); assert.equal(m.completed,true); assert.equal(m.claimed,false);
});

test('mission RPC permissions exclude anon and direct tables remain private',async()=>{
  for(const name of ['crwt_event_snapshot_v30','crwt_claim_mission_v30']){
    const {rows:[r]}=await db.query("select has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') auth from pg_proc where proname=$1",[name]);
    assert.equal(r.anon,false); assert.equal(r.auth,true);
  }
  const {rows:[r]}=await db.query("select has_table_privilege('authenticated','crwt_mission_claims','SELECT') allowed");
  assert.equal(r.allowed,false);
});
