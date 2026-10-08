'use strict';
// Run after exporting browser-fixtures.py with export-composer-fixtures.py;
// supply its JSON using --fixtures. All pages are synthetic and network-blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]};
const source=fs.readFileSync(arg('--source',path.join(__dirname,'..','facebook.js')),'utf8').replaceAll('location.href','globalThis.__fixtureURL').replaceAll('location.pathname','new URL(globalThis.__fixtureURL).pathname');
const fixture=JSON.parse(fs.readFileSync(arg('--fixtures'),'utf8'));
const post='https://www.facebook.com/groups/example/posts/123/', id='1837828897215027',photo='122122814811465799';
const image='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="teal"/%3E%3C/svg%3E';
const proof={ref:post,commentId:id,photoIds:[photo]};
const job=()=>({id:'job',lease:'lease',kind:'group_comment',target:post,payload:{adminSelected:true}});
const meta=(text,tag='ul')=>`<${tag} id="metadata"><div role="listitem">${text}</div><div role="listitem"><button>Lihat masukan</button></div></${tag}>`;
function comment({commentId=id,photoId=photo,extra='',link='',attribute=true}={}){return `<article role="article" ${attribute?`data-comment-id="${commentId}"`:''}><a href="/profile.php?id=100">Author</a>${link}<a href="https://www.facebook.com/photo/?fbid=${photoId}"><img width="200" height="200" src='${image}'></a>${extra}</article>`}
const doc=comments=>`<article role="article"><a href="${post}">Waktu</a><div data-ad-preview="message">Postingan utama</div><div role="list" data-comment-list>${comments}</div></article>`;
const cases=[
 {name:'fresh numeric comment and exact public photo confirms sent',html:doc(comment()),status:'sent'},
 {name:'owned rejected footer after fresh load reports failed',html:doc(comment({extra:meta('Ditolak')})),status:'failed'},
 {name:'owned rejected footer in plain DIV reports failed',html:doc(comment({extra:meta('Ditolak','div')})),status:'failed'},
 {name:'owned pending status reports pending',html:doc(comment({extra:'<div role="status">Menunggu persetujuan admin grup</div>'})),status:'pending'},
 {name:'owned pending footer in plain DIV reports pending',html:doc(comment({extra:meta('Menunggu persetujuan','div')})),status:'pending'},
 {name:'owned pending list label without feedback stays uncertain',html:doc(comment({extra:'<div><div role="listitem">Menunggu persetujuan</div><button>Batalkan</button></div>'})),status:'uncertain'},
 {name:'owned rejected list label without feedback stays uncertain',html:doc(comment({extra:'<div><div role="listitem">Ditolak</div></div>'})),status:'uncertain'},
 {name:'ordinary comment text saying rejected is not moderation UI',html:doc(comment({extra:'<div data-comment-body>Ditolak</div>'})),status:'sent'},
 {name:'quoted button in comment text is not moderation UI',html:doc(comment({extra:'<blockquote><button>Ditolak</button></blockquote>'})),status:'sent'},
 {name:'nested reply rejection does not reject the parent comment',html:doc(comment({extra:comment({commentId:'444',extra:meta('Ditolak')})})),status:'sent'},
 {name:'unrelated rejected comment does not reject the exact comment',html:doc(comment()+comment({commentId:'444',extra:meta('Ditolak')})),status:'sent'},
 {name:'global moderation feedback does not classify an unrelated comment',html:doc(comment())+'<div role="alert">Ditolak</div>',status:'sent'},
 {name:'hidden owned rejection label is ignored',html:doc(comment({extra:'<div hidden>'+meta('Ditolak')+'</div>'})),status:'sent'},
 {name:'late rejection is observed before stable fresh proof',html:doc(comment()),later:meta('Ditolak'),status:'failed'},
 {name:'late pending status is observed before stable fresh proof',html:doc(comment()),later:'<div role="status">Pending approval</div>',status:'pending'},
 {name:'unknown owned status is uncertain',html:doc(comment({extra:'<div role="status">Komentar disembunyikan</div>'})),status:'uncertain'},
 {name:'wrong numeric comment never satisfies fresh proof',html:doc(comment({commentId:'444'})),status:'uncertain'},
 {name:'wrong public photo never satisfies fresh proof',html:doc(comment({photoId:'999'})),status:'uncertain'},
 {name:'optimistic client ID never satisfies fresh proof',html:doc(comment({commentId:'client:89be24a7-6241-4458-9fd6-886195b2e645'})),status:'uncertain'},
 {name:'standalone reply thread cannot satisfy primary comment proof',html:doc('<div data-reply-thread>'+comment()+'</div>'),status:'uncertain'},
 {name:'reply permalink cannot satisfy primary comment proof',html:doc(comment({attribute:false,link:`<a href="${post}?comment_id=123&reply_comment_id=${id}">Waktu</a>`})),status:'uncertain'},
 {name:'public timestamp in own footer supplies committed ID',html:doc(comment({attribute:false,link:`<ul><li><a href="${post}?comment_id=${id}">1 menit</a></li></ul>`})),status:'sent'},
 {name:'conflicting explicit and permalink comment IDs are uncertain',html:doc(comment({link:`<a href="${post}?comment_id=999">Waktu</a>`})),status:'uncertain'},
 {name:'duplicate matching comments are uncertain',html:doc(comment()+comment()),status:'uncertain'},
 {name:'different post navigation invalidates proof',html:doc(comment()),url:post.replace('123','999'),status:'uncertain'},
 {name:'wrong primary post header cannot borrow the matching comment permalink',html:doc(comment({link:`<a href="${post}?comment_id=${id}">Waktu komentar</a>`})).replace(`<a href="${post}">Waktu</a>`,`<a href="${post.replace('123','999')}">Waktu</a>`),status:'uncertain'},
 {name:'ambiguous primary headers in a modal cannot prove the target comment',html:`<div role="dialog"><a href="${post}">Waktu</a><a href="${post.replace('123','999')}">Waktu lain</a><div data-ad-preview="message">Postingan utama</div>${comment()}</div>`,status:'uncertain'},
 {name:'primary header from another group cannot hide beside target header',html:`<div role="dialog"><a href="${post}">Waktu</a><a href="https://www.facebook.com/groups/other/posts/999/">Waktu lain</a><div data-ad-preview="message">Postingan utama</div>${comment()}</div>`,status:'uncertain'},
 {name:'security restriction prevents acceptance',html:doc(comment())+'<div role="alert">Pemeriksaan keamanan</div>',status:'uncertain'},
 {name:'STOP after dispatch still completes read-only verification',html:doc(comment()),stop:true,status:'sent'},
 {name:'expired proof remains uncertain',html:doc(comment()),expired:true,status:'uncertain'},
 {name:'missing public photo proof remains uncertain',html:doc(comment()),proof:{...proof,photoIds:[]},status:'uncertain'},
 {name:'plain post without a composer still supports read-only proof',html:doc(comment()).replace('<article role="article"><a href=', '<div><a href=').replace('</div></article>','</div></div>'),status:'sent'},
];
const base=fixture.cases.find(item=>item.status==='verify_comment' && !item.url && item.name.includes('plain')) || fixture.cases.find(item=>item.status==='verify_comment');
const initial=[
 {name:'initial committed ID returns fresh verification proof not sent',status:'verify_comment'},
 {name:'initial optimistic client ID alone is uncertain',id:'client:89be24a7-6241-4458-9fd6-886195b2e645',status:'uncertain'},
 {name:'initial comment without public photo ID is uncertain',noPhoto:true,status:'uncertain'},
 {name:'initial delayed committed ID waits instead of accepting optimistic ID',id:'client:89be24a7-6241-4458-9fd6-886195b2e645',commit:true,status:'verify_comment'},
 {name:'initial numeric timestamp replaces an optimistic attribute',id:'client:89be24a7-6241-4458-9fd6-886195b2e645',timestamp:true,status:'verify_comment'},
 {name:'initial group-user author and SVG avatar bind the same account',groupActor:true,status:'verify_comment'},
 {name:'initial concurrent foreign photo comment is ambiguous',concurrent:true,status:'uncertain'},
 {name:'initial optimistic photo plus concurrent committed comment is ambiguous',concurrent:true,id:'client:89be24a7-6241-4458-9fd6-886195b2e645',status:'uncertain'},
 {name:'initial unique committed photo remains verifiable without an avatar link',noActor:true,status:'verify_comment'},
 {name:'initial foreign author never certifies own submitted comment',foreignActor:true,status:'uncertain'},
 {name:'initial unreadable actor with a concurrent blank optimistic node is ambiguous',noActor:true,pendingBlank:true,status:'uncertain'},
];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--disable-background-networking','--no-first-run']});const results=[];
 const selected=[...cases,...initial.map(c=>({...c,initial:true}))].filter(c=>!arg('--filter') || new RegExp(arg('--filter'),'i').test(c.name));
 try{for(const c of selected){
  const context=await browser.newContext(),requests=[];await context.route('**/*',r=>{requests.push(r.request().url());return r.abort()});const page=await context.newPage();
  try{
   let html=c.html;
   if(c.initial){html=base.html;if(c.id)html=html.replace("c.setAttribute('data-comment-id', '"+id+"')","c.setAttribute('data-comment-id', '"+c.id+"')");if(c.noPhoto)html=html.replace('photo/?fbid='+photo,'photo/');if(c.commit)html=html.replace('c.append(actor, photo);',`c.append(actor, photo);setTimeout(()=>c.setAttribute('data-comment-id','${id}'),6000);`);if(c.timestamp)html=html.replace('c.append(actor, photo);',`c.append(actor, photo);const timestamp=document.createElement('a');timestamp.href='${post}?comment_id=${id}';timestamp.textContent='Baru saja';c.append(timestamp);`);if(c.concurrent)html=html.replace('editor.textContent = \'\'; preview.replaceChildren();',`const other=c.cloneNode(true);other.setAttribute('data-comment-id','999');other.querySelector('a').href='/profile.php?id=200';comments.append(other);editor.textContent='';preview.replaceChildren();`);if(c.groupActor)html=html.replace('href="/profile.php?id=100"','href="/groups/example/user/100/"').replace(/<img alt="Avatar sintetis"[^>]+>/,'<svg width="32" height="32"><circle cx="16" cy="16" r="16"/></svg>').replace("actor.href = '/profile.php?id='", "actor.href = '/groups/example/user/'");if(c.noActor)html=html.replace('href="/profile.php?id=100"','href="/me/"');if(c.foreignActor)html=html.replace("(opts.actorMismatch ? '200' : '100')","'200'");}
   if(c.pendingBlank)html=html.replace('editor.textContent = \'\'; preview.replaceChildren();',`const pending=document.createElement('article');pending.setAttribute('role','article');pending.setAttribute('data-comment-id','client:pending');comments.append(pending);editor.textContent='';preview.replaceChildren();`);
   await page.setContent(`<base href="https://www.facebook.com/"><style>${fixture.CSS}</style><input id="keep-focus">`+html);await page.evaluate(fixture.BOOT);await page.evaluate(url=>globalThis.__fixtureURL=url,c.url||post);await page.locator('#keep-focus').focus();await page.addScriptTag({content:source});
   const result=await page.evaluate(async({initial,job,proof,stop,later,expired})=>{job.expiresAt=Date.now()+(expired?-1:60000);if(initial){const canvas=document.createElement('canvas');canvas.width=180;canvas.height=180;job.banner={mime:'image/png',body:canvas.toDataURL().split(',')[1]};}if(stop){listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{});setTimeout(()=>listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}),1200);}if(later)setTimeout(()=>document.querySelector('[data-comment-id]').insertAdjacentHTML('beforeend',later),2000);return new Promise(resolve=>listeners[0](initial?{type:'CP_LOKER_RUN',job}:{type:'CP_LOKER_VERIFY_COMMENT',job,proof,expiresAt:Date.now()+10000},{id:'fixture'},resolve));},{initial:!!c.initial,job:job(),proof:c.proof||proof,stop:!!c.stop,later:c.later,expired:!!c.expired});
   assert.equal(result.status,c.status);assert.equal(result.dispatched,true);const counters=await page.evaluate('({sends,dispatches,fileChanges,removeClicks,focus:document.activeElement.id})');assert.equal(counters.sends,c.initial?1:0);assert.equal(counters.dispatches,c.initial?1:0);assert.equal(counters.fileChanges,c.initial?1:0);assert.equal(counters.removeClicks,0);assert.deepEqual(requests,[]);
   if(!c.initial){assert.equal(counters.focus,'keep-focus');assert.equal(result.commentId,(c.proof||proof).commentId);assert.deepEqual(result.photoIds,(c.proof||proof).photoIds);assert.equal(result.ref,post);}
   if(c.status==='verify_comment'){assert.equal(result.commentId,id);assert.deepEqual(result.photoIds,[photo]);assert.equal(result.stage,'committed_comment_found');}
   results.push({name:c.name,passed:true,status:result.status});
  }catch(error){results.push({name:c.name,passed:false,error:String(error)});}finally{await context.close();}console.log((results.at(-1).passed?'PASS ':'FAIL ')+c.name+(results.at(-1).error||''));
 }}finally{await browser.close();}
 const report={synthetic_only:true,network_blocked:true,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,tests:results};const reportPath=arg('--report');if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1});
