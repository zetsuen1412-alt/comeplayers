import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const group='https://www.facebook.com/groups/example/';
const target=group+'posts/123/';
const commentId='1837828897215027';
const photoIds=['122122814811465799'];
const proof=()=>({status:'verify_comment',ref:target,commentId,photoIds:[...photoIds],dispatched:true,stage:'committed_comment_found'});
const task=()=>({id:'job',lease:'lease',kind:'group_comment',target,text:'',expiresAt:Date.now()+120000,payload:{adminSelected:true}});
function harness(options={}) {
  const storage={facebookTab:1,cancelled:false,stopLatched:false},events=[];
  const tabs=new Map([[1,{id:1,url:group,status:'complete'}],[2,{id:2,url:'https://www.comeplayers.com/admin/lowongan',status:'complete'}],[77,{id:77,url:target,status:'complete'}]]);
  let listener;
  let clock=Date.now();
  class TestDate extends Date {static now(){return clock;}}
  const command=(command,data)=>new Promise(resolve=>listener({type:'CP_LOKER',command,data},{id:'extension',tab:{id:2},url:tabs.get(2).url},resolve));
  const chrome={runtime:{id:'extension',getManifest:()=>({version:'1.3.10'}),getURL:path=>'chrome-extension://extension/'+path,onMessage:{addListener:fn=>listener=fn},onStartup:{addListener(){}}},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,storage[key]])),set:async values=>Object.assign(storage,values),remove:async key=>delete storage[key]}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('closed');events.push({type:'get',id});return {...tabs.get(id)};},
      update:async(id,change)=>{events.push({type:'update',id,...change});Object.assign(tabs.get(id),change);},query:async()=>[],
      reload:async id=>events.push({type:'reload',id}),
      create:async change=>{
        events.push({type:'create',...change});if(options.createFails)throw Error('cannot create');
        if(options.reusedId)return {...tabs.get(options.reusedId)};
        const tab={id:10,url:options.redirect||change.url,status:options.loading?'loading':'complete'};tabs.set(10,tab);
        if(options.stopOnCreate)await command('stop');return tab;
      },remove:async id=>{events.push({type:'remove',id});tabs.delete(id);},
      sendMessage:async(id,message)=>{
        events.push({type:message.type,id,message});
        if(message.type==='CP_LOKER_PROBE_FEED')return {ready:true};
        if(message.type==='CP_LOKER_PREFLIGHT')return {allowed:true};
        if(message.type==='CP_LOKER_RUN'){
          if(options.grant!==false)await new Promise(resolve=>listener({type:'CP_LOKER_CHECK',id:message.job.id,lease:message.job.lease,dispatch:true},{id:'extension',tab:{id:1},frameId:0},resolve));
          if(options.changeActive)options.changeActive(storage.active);
          if(options.stopOnRun)await command('stop');
          return options.initial===undefined?proof():options.initial;
        }
        if(message.type==='CP_LOKER_VERIFY_COMMENT'){
          if(options.failTransport)throw Error('lost response');
          if(options.hangTransport)return new Promise(()=>{});
          if(options.stopOnProof)await command('stop');
          if(options.sourceDraft)tabs.get(1).draft='new user draft';
          if(options.redirectOnProof)tabs.get(10).url=options.redirectOnProof;
          if(options.pendingOnProof)tabs.get(10).pendingUrl=target;
          if(options.expireOnProof)clock=message.job.expiresAt+1;
          return {status:'sent',ref:target,commentId,photoIds:[...photoIds],dispatched:true,stage:'verified_new_comment',note:'synthetic proof',...options.final};
        }
        return {stopped:true};
      }},scripting:{executeScript:async details=>{events.push({type:'inject',id:details.target.tabId});if(details.target.tabId===10){if(options.failInject)throw Error('injection failed');if(options.redirectOnInject)tabs.get(10).url=options.redirectOnInject;}}}};
  vm.runInNewContext(source,{chrome,URL,Date:TestDate,setTimeout:(fn,ms)=>{if(ms<1000||options.hangTransport){clock+=ms;queueMicrotask(fn);}return 1;},clearTimeout:()=>{}});
  return {command,events,storage,tabs,run:job=>command('run',job||task())};
}
const same=(actual,expected)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
function assertOnlyOneSend(h){assert.equal(h.events.filter(e=>e.type==='CP_LOKER_RUN').length,1);assert.equal(h.events.some(e=>e.id===10&&['CP_LOKER_RUN','CP_LOKER_CHECK','CP_LOKER_PREFLIGHT'].includes(e.type)),false);}
function assertOwnedCleanup(h){same(h.events.filter(e=>e.type==='remove').map(e=>e.id),[10]);assert.equal(h.tabs.has(1),true);assert.equal(h.tabs.has(2),true);assert.equal(h.tabs.has(77),true);assert.equal(h.events.some(e=>e.type==='reload'),false);assert.equal(h.storage.active,undefined);}

test('fresh read-only comment proof owns one inactive tab and never reloads source draft',async()=>{
  const h=harness({sourceDraft:true}),result=await h.run();
  assert.equal(result.status,'sent');assert.equal(result.ref,target);assert.equal(result.dispatched,true);
  same(h.events.filter(e=>e.type==='create'),[{type:'create',url:target+'?comment_id='+commentId,active:false}]);
  const request=h.events.find(e=>e.type==='CP_LOKER_VERIFY_COMMENT');
  same(request.message.proof,{ref:target,commentId,photoIds});assert.equal(request.id,10);
  assert.equal(h.tabs.get(1).draft,'new user draft');assert.equal('photoIds' in result,false);assert.equal('commentId' in result,false);
  assertOnlyOneSend(h);assertOwnedCleanup(h);
});
for(const [status,stage] of [['failed','comment_rejected'],['pending','comment_pending'],['uncertain','verification_inconclusive']])test(`fresh ${status} is final without retry`,async()=>{const h=harness({final:{status,stage}});assert.equal((await h.run()).status,status);assertOnlyOneSend(h);assertOwnedCleanup(h);});
for(const [name,options] of [
  ['ungranted dispatch',{grant:false}],['no dispatched flag',{initial:{...proof(),dispatched:false}}],
  ['uncommitted initial stage',{initial:{...proof(),stage:'send_clicked'}}],
  ['wrong group',{initial:{...proof(),ref:target.replace('example','other')}}],['wrong post',{initial:{...proof(),ref:group+'posts/999/'}}],
  ['query in proof URL',{initial:{...proof(),ref:target+'?comment_id='+commentId}}],['optimistic ID',{initial:{...proof(),commentId:'client:123'}}],
  ['missing ID',{initial:{...proof(),commentId:undefined}}],['numeric type ID',{initial:{...proof(),commentId:123}}],['unbounded ID',{initial:{...proof(),commentId:'1'.repeat(41)}}],
  ['missing photos',{initial:{...proof(),photoIds:[]}}],['duplicate photos',{initial:{...proof(),photoIds:[...photoIds,...photoIds]}}],
  ['non-numeric photo',{initial:{...proof(),photoIds:['client:111']}}],['too many photos',{initial:{...proof(),photoIds:Array.from({length:9},(_,i)=>String(i+1))}}],
  ['different job binding',{changeActive:a=>a.id='other'}],['different lease binding',{changeActive:a=>a.lease='other'}],['different source binding',{changeActive:a=>a.tab=77}],['different controller binding',{changeActive:a=>a.controller=77}],
])test(`${name} cannot create a verification tab or report sent`,async()=>{const h=harness(options),result=await h.run();assert.equal(result.status,'uncertain');assert.equal(result.dispatched,true);assert.equal(h.events.some(e=>e.type==='create'),false);assertOnlyOneSend(h);});
for(const status of ['sent','verify'])test(`legacy direct ${status} comment result cannot bypass fresh proof`,async()=>{const h=harness({initial:{status,ref:target}});assert.equal((await h.run()).status,'uncertain');assert.equal(h.events.some(e=>e.type==='create'||e.type==='reload'),false);assertOnlyOneSend(h);});
test('unreviewed job cannot create comment verification tab',async()=>{const h=harness();const job=task();delete job.payload;assert.equal((await h.run(job)).status,'uncertain');assert.equal(h.events.some(e=>e.type==='create'),false);});
test('other job kind cannot enter comment verification path',async()=>{const h=harness();assert.equal((await h.run({...task(),kind:'group_post'})).status,'uncertain');assert.equal(h.events.some(e=>e.type==='create'),false);});
for(const [name,options] of [
  ['login redirect',{redirect:'https://www.facebook.com/login/'}],['other target',{redirect:group+'posts/999/'}],
  ['different comment query',{redirect:target+'?comment_id=999'}],['reply query',{redirect:target+'?reply_comment_id=999'}],['duplicate comment query',{redirect:target+'?comment_id='+commentId+'&comment_id=999'}],
  ['loading timeout',{loading:true}],['injection failure',{failInject:true}],['redirect during injection',{redirectOnInject:group+'posts/999/'}],
  ['transport failure',{failTransport:true}],['unresponsive proof handler',{hangTransport:true}],['navigation after proof',{redirectOnProof:'https://www.facebook.com/checkpoint/'}],['pending navigation after proof',{pendingOnProof:true}],
  ['wrong final URL',{final:{ref:group+'posts/999/'}}],['wrong final comment',{final:{commentId:'999'}}],['uncommitted final response',{final:{dispatched:false}}],
  ['unsupported final outcome',{final:{status:'verify_comment'}}],['expired fresh proof',{expireOnProof:true}],
  ['wrong photo proof response',{final:{photoIds:['999']}}],['missing photo proof response',{final:{photoIds:undefined}}],['status stage mismatch',{final:{stage:'comment_rejected'}}],
])test(`${name} returns uncertain and closes only owned tab`,async()=>{const h=harness(options),result=await h.run();assert.equal(result.status,'uncertain');assert.equal(result.dispatched,true);assertOwnedCleanup(h);assertOnlyOneSend(h);});
for(const where of ['stopOnRun','stopOnCreate','stopOnProof'])test(`${where} completes already-dispatched proof but blocks next send`,async()=>{
  const h=harness({[where]:true});assert.equal((await h.run()).status,'sent');assert.equal(h.storage.stopLatched,true);
  assert.equal((await h.run()).status,'cancelled');assertOwnedCleanup(h);assertOnlyOneSend(h);
  assert.equal(h.events.some(e=>e.type==='CP_LOKER_CANCEL'&&e.id===10),false);
});
for(const id of [1,2])test(`invalid create response cannot close existing tab ${id}`,async()=>{const h=harness({reusedId:id});assert.equal((await h.run()).status,'uncertain');assert.equal(h.events.some(e=>e.type==='remove'),false);assert.equal(h.tabs.has(id),true);});
test('create failure remains uncertain after one dispatch',async()=>{const h=harness({createFails:true});assert.equal((await h.run()).status,'uncertain');assert.equal(h.events.some(e=>e.type==='remove'),false);assertOnlyOneSend(h);});
test('STOP before dispatch never sends or creates proof tab',async()=>{const h=harness();await h.command('stop');assert.equal((await h.run()).status,'cancelled');assert.equal(h.events.some(e=>e.type==='CP_LOKER_RUN'||e.type==='create'),false);});
