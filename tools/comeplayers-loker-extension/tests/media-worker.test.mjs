import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const group='https://www.facebook.com/groups/511036553227608/';
const post=group+'posts/1837765490554701/';
const proof=()=>({url:post,author:'/profile.php?id=12345',caption:'Saya mencari pekerjaan di Bandung dan siap bekerja dengan sungguh sungguh.',photos:['4790454794507429']});
function harness(options={}){
  const storage={facebookTab:1,cancelled:false,stopLatched:false},events=[];
  const tabs=new Map([[1,{id:1,url:group,status:'complete'}],[2,{id:2,url:'https://www.comeplayers.com/admin/lowongan',status:'complete'}],[77,{id:77,url:post,status:'complete'}]]);
  let listener,scanMessage,scanStarted,scanRelease;
  const started=new Promise(resolve=>scanStarted=resolve),scanPending=new Promise(resolve=>scanRelease=resolve);
  const command=(command,data)=>new Promise(resolve=>listener({type:'CP_LOKER',command,data},{id:'extension',tab:{id:2},url:tabs.get(2).url},resolve));
  const request=(change={},senderChange={})=>new Promise(resolve=>listener({type:'CP_LOKER_VERIFY_SCAN_MEDIA',token:scanMessage.token,proof:proof(),...change},{id:'extension',tab:{id:1},frameId:0,...senderChange},resolve));
  const chrome={runtime:{id:'extension',getManifest:()=>({version:'1.3.9'}),getURL:path=>'chrome-extension://extension/'+path,onMessage:{addListener:fn=>listener=fn},onStartup:{addListener(){}}},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,storage[key]])),set:async values=>Object.assign(storage,values),remove:async key=>delete storage[key]}},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('closed');return {...tabs.get(id)}},update:async(id,change)=>Object.assign(tabs.get(id),change),query:async()=>[],
      create:async change=>{events.push({type:'create',...change});const tab={id:10,url:options.redirect || change.url,status:'complete'};tabs.set(10,tab);if(options.stopOnCreate)await command('stop');return tab},
      remove:async id=>{events.push({type:'remove',id});tabs.delete(id)},
      sendMessage:async(id,message)=>{
        events.push({type:message.type,id});
        if(message.type==='CP_LOKER_SCAN_ALL'){scanMessage=message;scanStarted();return scanPending}
        if(message.type==='CP_LOKER_VERIFY_SCAN_DOCUMENT'){
          if(options.stopOnProof)await command('stop');
          if(options.redirectOnProof)tabs.get(id).url=options.redirectOnProof;
          if(options.changeSourceOnProof)tabs.get(1).url=group+'posts/999/';
          if(options.detachOnProof)storage.facebookTab=77;
          if(options.failProofTransport)throw Error('transport closed');
          if(options.holdProof)await options.holdProof;
          return {verified:options.verified!==false,url:options.responseURL || post};
        }
        return {stopped:true};
      }},scripting:{executeScript:async details=>{events.push({type:'inject',id:details.target.tabId});if(options.failInject&&details.target.tabId===10)throw Error('inject denied')}}};
  vm.runInNewContext(source,{chrome,URL,Date,crypto:{randomUUID:()=> 'random-scan-token'},setTimeout:fn=>queueMicrotask(fn)});
  const scan=command('scan',{groups:[group]});
  return {started,scan,request,command,events,tabs,storage,finish:()=>scanRelease({items:[]})};
}
test('scan candidate uses one inactive newly owned tab and closes only that tab',async()=>{
  const h=harness();await h.started;
  assert.deepEqual(JSON.parse(JSON.stringify(await h.request())),{verified:true,url:post,stage:'verified'});
  h.finish();await h.scan;
  assert.deepEqual(h.events.filter(e=>e.type==='create'),[{type:'create',url:post,active:false}]);
  assert.deepEqual(h.events.filter(e=>e.type==='remove'),[{type:'remove',id:10}]);
  assert.equal(h.tabs.has(1),true);assert.equal(h.tabs.has(77),true);
  assert.equal(h.events.some(e=>['CP_LOKER_RUN','CP_LOKER_CHECK','CP_LOKER_PREFLIGHT'].includes(e.type)),false);
});
for(const [name,change,sender] of [
  ['wrong token',{token:'wrong'},{}],['other tab',{}, {tab:{id:77}}],['child frame',{}, {frameId:1}],
  ['another group',{proof:{...proof(),url:post.replace('511036553227608','999')}},{}],
  ['group-only route',{proof:{...proof(),url:group}},{}],['comment query',{proof:{...proof(),url:post+'?comment_id=99'}},{}],
  ['pfbid route',{proof:{...proof(),url:group+'posts/pfbid123/'}},{}],
  ['no photo proof',{proof:{...proof(),photos:[]}},{}],['short caption',{proof:{...proof(),caption:'Short'}},{}],
])test(`${name} cannot create verification tab`,async()=>{const h=harness();await h.started;assert.equal((await h.request(change,sender)).verified,false);assert.equal(h.events.some(e=>e.type==='create'),false);h.finish();await h.scan});
for(const [name,options] of [
  ['login redirect',{redirect:'https://www.facebook.com/login/'}],['other canonical post',{redirect:group+'posts/999/'}],
  ['negative public document proof',{verified:false}],['wrong proof response URL',{responseURL:group+'posts/999/'}],
  ['STOP before injection',{stopOnCreate:true}],['STOP after proof',{stopOnProof:true}],
  ['redirect after proof',{redirectOnProof:'https://www.facebook.com/checkpoint/'}],
  ['source card tab navigates while proof awaits',{changeSourceOnProof:true}],['attachment changed while proof awaits',{detachOnProof:true}],
  ['script injection failure',{failInject:true}],['proof transport failure',{failProofTransport:true}],
])test(`${name} fails closed and removes owned verification tab`,async()=>{const h=harness(options);await h.started;assert.equal((await h.request()).verified,false);h.finish();await h.scan;assert.deepEqual(h.events.filter(e=>e.type==='remove'),[{type:'remove',id:10}]);assert.equal(h.tabs.has(1),true);assert.equal(h.tabs.has(77),true)});
test('same candidate is verified at most once in the scan session',async()=>{const h=harness();await h.started;assert.equal((await h.request()).verified,true);assert.equal((await h.request()).verified,false);h.finish();await h.scan;assert.equal(h.events.filter(e=>e.type==='create').length,1)});
test('two asynchronous requests cannot own concurrent verification tabs',async()=>{let release;const held=new Promise(resolve=>release=resolve);const h=harness({holdProof:held});await h.started;const first=h.request();while(!h.events.some(e=>e.type==='CP_LOKER_VERIFY_SCAN_DOCUMENT'))await new Promise(resolve=>setImmediate(resolve));assert.equal((await h.request({proof:{...proof(),url:group+'posts/999/'}})).verified,false);release();assert.equal((await first).verified,true);h.finish();await h.scan;assert.equal(h.events.filter(e=>e.type==='create').length,1)});
test('STOP latch denies all following candidate requests',async()=>{const h=harness();await h.started;await h.command('stop');assert.equal((await h.request()).verified,false);h.finish();await h.scan;assert.equal(h.events.some(e=>e.type==='create'),false)});
