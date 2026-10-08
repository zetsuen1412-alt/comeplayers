'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname,'..','facebook.js'),'utf8')
  .replaceAll('location.href','globalThis.__fixtureURL').replaceAll('location.pathname','new URL(globalThis.__fixtureURL).pathname');
const group = 'https://www.facebook.com/groups/511036553227608/';
const post = group + 'posts/1837765490554701/';
const caption = 'Saya mencari pekerjaan di Bandung dan siap bekerja dengan sungguh sungguh.';
const author = 'https://www.facebook.com/profile.php?id=12345';
const photo = 'https://web.facebook.com/photo/?fbid=4790454794507429&set=gm.1837765490554701&idorvanity=511036553227608';
function card({text=caption,actor=author,media=photo,time=group+'#?ddi',extra='',plain=false}={}) {
  return `<${plain?'div':'article role="article"'}><h2><a href="${actor}">Public author</a></h2><a href="${time}" aria-label="37 menit lalu">qXk</a><div data-ad-preview="message">${text}</div><a id="primary-photo" href="${media}"><img width="160" height="160"></a>${extra}</${plain?'div':'article'}>`;
}
const sourceCard=card(), verifiedCard=card({time:post});
const cases=[
  {name:'primary photo candidate becomes canonical only after public document proof',html:sourceCard,opened:verifiedCard,items:[post],calls:1},
  {name:'plain DIV cards verify with group-user author normalization',html:card({plain:true,actor:group+'user/12345/'}),opened:card({plain:true,time:post}),items:[post],calls:1},
  {name:'verified detail photo may omit idorvanity while retaining exact gm and photo',html:sourceCard,opened:card({time:post,media:photo.replace('&idorvanity=511036553227608','')}),items:[post],calls:1},
  {name:'matching expanded caption verifies a sufficiently long truncated source',html:card({text:caption.slice(0,50)+'... Lihat selengkapnya'}),opened:verifiedCard,items:[post],calls:1},
  {name:'live short collapsed caption verifies with exact primary photo and author',html:card({text:'Sisa 2 slot … Lihat selengkapnya'}),opened:card({time:post,text:'Sisa 2 slot untuk pelamar yang serius bekerja dan bersedia tinggal di mess.'}),items:[post],calls:1},
  {name:'composer avatar is not mistaken for a shared-post author',html:card({extra:'<form><a href="https://www.facebook.com/profile.php?id=67890">Comment as actor</a><div contenteditable="true" role="textbox"></div></form>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'another post author fails public document proof',html:sourceCard,opened:card({time:post,actor:author.replace('12345','67890')}),items:[],calls:1},
  {name:'another caption fails public document proof',html:sourceCard,opened:card({time:post,text:'Kami mencari kandidat lain untuk pekerjaan lain di lokasi yang berbeda.'}),items:[],calls:1},
  {name:'another public photo fails proof even when caption and author match',html:sourceCard,opened:card({time:post,media:photo.replace('4790454794507429','99999')}),items:[],calls:1},
  {name:'canonical document location is required',html:sourceCard,opened:verifiedCard,openedURL:group,items:[],calls:1},
  {name:'security warning in canonical document fails closed',html:sourceCard,opened:verifiedCard+'<div role="alert">Pemeriksaan keamanan</div>',items:[],calls:1},
  {name:'comment image cannot become a media candidate',html:card({media:'https://example.invalid'}).replace('</article>',`<div data-comment-id="99"><a href="${photo}"><img width="160"></a></div></article>`),items:[],calls:0},
  {name:'image inside story body cannot become primary media proof',html:card({media:'https://example.invalid'}).replace(caption,`${caption}<a href="${photo}"><img width="160"></a>`),items:[],calls:0},
  {name:'photo from another group cannot become a candidate',html:card({media:photo.replace('idorvanity=511036553227608','idorvanity=999')}),items:[],calls:0},
  {name:'source photo without explicit group affinity is rejected',html:card({media:photo.replace('&idorvanity=511036553227608','')}),items:[],calls:0},
  {name:'shared card with a second timestamp is rejected',html:card({extra:`<a href="${group}#?quoted" aria-label="2 jam lalu">Shared timestamp</a>`}),items:[],calls:0},
  {name:'shared card with another public author is rejected',html:card({extra:'<h2><a href="https://www.facebook.com/profile.php?id=67890">Shared author</a></h2>'}),items:[],calls:0},
  {name:'self-shared card with duplicate author after body is rejected',html:card({extra:`<h2><a href="${author}">Same shared author</a></h2>`}),items:[],calls:0},
  {name:'self-shared card with two author headings before body is rejected',html:sourceCard.replace('<div data-ad-preview=',`<h2><a href="${author}">Same shared author</a></h2><div data-ad-preview=`),items:[],calls:0},
  {name:'explicit shared attachment is rejected',html:card({extra:'<div data-shared-post>Quoted attachment</div>'}),items:[],calls:0},
  {name:'semantic comment blockquote does not invalidate the primary photo candidate',html:card({extra:'<div data-comment-id="99"><blockquote>Quoted comment text</blockquote></div>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'semantic reply shared marker does not invalidate the primary photo candidate',html:card({extra:'<div data-reply-thread><div data-shared-post>Quoted reply text</div></div>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'semantic article comment quote does not invalidate the primary photo candidate',html:card({extra:'<article role="article"><blockquote>Quoted comment text</blockquote></article>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'hidden blockquote metadata does not invalidate the primary photo candidate',html:card({extra:'<blockquote hidden>Hidden metadata</blockquote>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'aria-hidden shared metadata does not invalidate the primary photo candidate',html:card({extra:'<div aria-hidden="true"><div data-shared-post>Hidden metadata</div></div>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'display-none blockquote metadata does not invalidate the primary photo candidate',html:card({extra:'<blockquote style="display:none">Hidden metadata</blockquote>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'composer blockquote does not invalidate the primary photo candidate',html:card({extra:'<form><blockquote>Composer preview</blockquote><div contenteditable="true" role="textbox"></div></form>'}),opened:verifiedCard,items:[post],calls:1},
  {name:'visible owned blockquote remains rejected',html:card({extra:'<blockquote>Visible quoted post</blockquote>'}),items:[],calls:0},
  {name:'visible quote inside the primary story remains rejected',html:card({text:caption+'<blockquote>Visible quoted post</blockquote>'}),items:[],calls:0},
  {name:'display-contents shared wrapper with visible content remains rejected',html:card({extra:'<div data-shared-post style="display:contents"><div>Visible quoted post</div></div>'}),items:[],calls:0},
  {name:'shared wrapper containing the entire source card remains rejected',html:'<blockquote>'+sourceCard+'</blockquote>',items:[],calls:0},
  {name:'verification ignores nested comment quote while proving the exact post',html:sourceCard,opened:card({time:post,extra:'<div data-comment-id="99"><blockquote>Quoted comment</blockquote></div>'}),items:[post],calls:1},
  {name:'verification ignores hidden shared metadata while proving the exact post',html:sourceCard,opened:card({time:post,extra:'<blockquote hidden>Hidden metadata</blockquote>'}),items:[post],calls:1},
  {name:'verification rejects an owned visible shared quote',html:sourceCard,opened:card({time:post,extra:'<blockquote>Visible quoted post</blockquote>'}),items:[],calls:1},
  {name:'multiple independent story bodies are rejected',html:card({extra:'<div data-ad-preview="message">Quoted text</div>'}),items:[],calls:0},
  {name:'comment query media is rejected',html:card({media:photo+'&comment_id=99'}),items:[],calls:0},
  {name:'external host cannot become a candidate',html:card({media:photo.replace('web.facebook.com','example.invalid')}),items:[],calls:0},
  {name:'pfbid set cannot become numeric candidate',html:card({media:photo.replace('gm.1837765490554701','gm.pfbid123')}),items:[],calls:0},
  {name:'very short caption has insufficient identifying evidence',html:card({text:'Cari.'}),items:[],calls:0},
  {name:'source mutation while verification awaits rejects stale proof',html:sourceCard,opened:verifiedCard,mutate:true,items:[],calls:1},
  {name:'STOP while verification awaits returns no accepted item',html:sourceCard,opened:verifiedCard,stop:true,items:[],calls:1},
  {name:'STOP during second verification preserves prior canonical discovery',html:card({time:group+'posts/99/',media:'https://example.invalid'})+sourceCard,opened:verifiedCard,stop:true,items:[group+'posts/99/'],calls:1},
  {name:'nested reply document cannot satisfy primary-post proof',html:sourceCard,opened:`<article role="article" data-comment-id="99">${verifiedCard}</article>`,items:[],calls:1},
];
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
  const results=[];
  try {
    const filterIndex=process.argv.indexOf('--filter');
    const filtered=filterIndex>=0 ? cases.filter(fixture=>new RegExp(process.argv[filterIndex+1],'i').test(fixture.name)) : cases;
    for(const fixture of filtered){
      const context=await browser.newContext();
      const requests=[];
      await context.route('**/*',route=>{requests.push(route.request().url());return route.abort()});
      const page=await context.newPage();let calls=0;
      const install=async(p,html,url)=>{
        await p.setContent('<style>[hidden]{display:none}</style><input id="keep-focus">'+html);
        await p.locator('#keep-focus').focus();
        await p.addScriptTag({content:`window.__fixtureURL=${JSON.stringify(url)};const realNow=Date.now.bind(Date),anchor=realNow(),speed=30;Date.now=()=>anchor+(realNow()-anchor)*speed;const timer=setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timer(fn,Math.max(1,ms/speed),...args);window.listeners=[];window.events=[];window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async m=>{events.push(m.type);return window.verifyPublicDocument(m)}}};window.scrollBy=()=>{};document.addEventListener('click',()=>events.push('click'));document.addEventListener('change',e=>{if(e.target.matches('input[type="file"]'))events.push('attachment')});`});
        await p.addScriptTag({content:source});
      };
      try{
        await page.exposeBinding('verifyPublicDocument',async(_binding,message)=>{
          calls++;assert.equal(message.type,'CP_LOKER_VERIFY_SCAN_MEDIA');assert.equal(message.token,'scan-token');
          const opened=await context.newPage();
          try{
            await install(opened,fixture.opened || verifiedCard,fixture.openedURL || post);
            const result=await opened.evaluate(async proof=>new Promise(resolve=>listeners[0]({type:'CP_LOKER_VERIFY_SCAN_DOCUMENT',proof,expiresAt:Date.now()+6000},{id:'fixture'},resolve)),message.proof);
            if(fixture.mutate)await page.evaluate(()=>document.querySelector('[data-ad-preview]').textContent='Caption berubah selama verifikasi berlangsung sehingga bukti lama tidak berlaku.');
            if(fixture.stop)await page.evaluate(()=>listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}));
            return result;
          }finally{await opened.close()}
        });
        await install(page,fixture.html,group);
        const actual=await page.evaluate(async group=>{const result=await new Promise(resolve=>listeners[0]({type:'CP_LOKER_SCAN_ALL',group,token:'scan-token'},{id:'fixture'},resolve));return {result,events,focus:document.activeElement.id}},group);
        assert.deepEqual((actual.result.items || []).map(item=>item.url),fixture.items);
        assert.equal(calls,fixture.calls);
        assert.equal(actual.result.scanDiagnostics.checkedMedia,fixture.calls);
        assert.equal(actual.result.scanDiagnostics.verifiedMedia,fixture.items.includes(post)?1:0);
        if(fixture.stop){assert.equal(actual.result.stopped,true);assert.equal(actual.result.error,undefined)}
        assert.equal(actual.events.every(type=>type==='CP_LOKER_VERIFY_SCAN_MEDIA'),true,'read-only fallback must never click, attach or request dispatch');
        assert.equal(actual.focus,'keep-focus');assert.deepEqual(requests,[]);
        results.push({name:fixture.name,passed:true,calls});
      }catch(error){results.push({name:fixture.name,passed:false,error:String(error)})}
      finally{await context.close()}
      console.log((results.at(-1).passed?'PASS ':'FAIL ')+fixture.name+(results.at(-1).error || ''));
    }
  }finally{await browser.close()}
  const report={synthetic_only:true,network_blocked:true,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,tests:results};
  const index=process.argv.indexOf('--report');if(index>=0)fs.writeFileSync(process.argv[index+1],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1});
