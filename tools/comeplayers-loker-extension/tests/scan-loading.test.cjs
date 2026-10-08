'use strict';
// Isolated synthetic pages only. All page network requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'facebook.js'));
const baseline = process.argv.includes('--baseline');
const boundariesOnly = process.argv.includes('--boundaries');
const hydrationOnly = process.argv.includes('--hydration');
const labelsOnly = process.argv.includes('--labels');
const descendantsOnly = process.argv.includes('--descendants');
const clicksOnly = process.argv.includes('--clicks');
const pressOnly = process.argv.includes('--press');
const filterIndex = process.argv.indexOf('--filter');
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
const source = fs.readFileSync(sourcePath, 'utf8')
  .replaceAll('location.href', 'globalThis.__fixtureURL')
  .replaceAll('location.pathname', 'new URL(globalThis.__fixtureURL).pathname');
const group = 'https://www.facebook.com/groups/example/';
const post = group + 'posts/123/';
function article(id = '123', href = group + 'posts/' + id + '/', attrs = '') {
  return `<article role="article"><h2>Author fixture</h2><a ${attrs} href="${href}">Waktu</a><div data-ad-preview="message">Status sintetis ${id}</div></article>`;
}
const editor = '<form><div contenteditable="true" role="textbox" aria-label="Tulis komentar"></div><input type="file" accept="image/*"><button type="button">Kirim komentar</button></form>';
const withEditor = article().replace('</article>', editor + '</article>');
const inFeedItem = html => `<div role="feed"><div role="listitem">${html}</div></div>`;
const boundaries = [
  { name: 'outer feed listitem does not turn a semantic post into a comment', html: inFeedItem(article()), items: [post] },
  { name: 'outer feed LI does not turn a semantic post into a comment', html: `<ul role="feed"><li>${article()}</li></ul>`, items: [post] },
  { name: 'reviewed root composer inside an outer feed listitem is ready', html: inFeedItem(withEditor), probe: true, ready: true },
  { name: 'inner semantic comment header never becomes a post target', html: inFeedItem(article().replace('</article>', article('124') + '</article>')), items: [post] },
  { name: 'inner listitem reply header never becomes a post target', html: inFeedItem(article().replace('</article>', `<div role="listitem"><a href="${group}posts/124/">Reply link</a></div></article>`)), items: [post] },
  { name: 'inner semantic reply-only composer remains ineligible', html: inFeedItem(article().replace('</article>', `<article role="article">${editor}</article></article>`)), probe: true, ready: false },
  { name: 'explicit outer comment wrapper remains excluded', html: `<div role="feed"><div role="listitem" data-comment-id="parent">${article()}</div></div>`, error: /tautan postingannya belum dikenali/ },
  { name: 'explicit root comment article remains excluded', html: inFeedItem(article().replace('<article role="article">', '<article role="article" data-comment-id="parent">')), error: /tautan postingannya belum dikenali/ },
  { name: 'comment list between feed and article remains excluded', html: `<div role="feed"><div role="list"><div role="listitem">${article()}</div></div></div>`, error: /tautan postingannya belum dikenali/ },
  { name: 'unclassified listitem outside feed remains excluded', html: `<div role="listitem">${article()}</div>`, error: /tautan postingannya belum dikenali/ },
  { name: 'outer feed wrapper never authorizes a nested reply dialog',
    html: inFeedItem(article().replace('</article>', `<div role="list"><article role="article" data-comment-id="parent"><div role="dialog"><a href="${post}">Quoted post</a><div data-ad-preview="message">Quoted text</div>${editor}</div></article></div></article>`)),
    url: post, run: true, status: 'skipped', stage: 'composer_nested_reply' },
  { name: 'explicit semantic comment wrapping a reply dialog stays excluded without a feed wrapper',
    html: `<article role="article" data-comment-id="parent"><div role="dialog"><a href="${post}">Quoted post</a><div data-ad-preview="message">Quoted text</div>${editor}</div></article>`,
    url: post, run: true, status:'skipped', stage:'composer_nested_reply' },
  { name: 'nested semantic comment cannot borrow the reply dialog story as post evidence',
    html: article().replace('</article>', `<article role="article"><div role="dialog"><a href="${post}">Quoted post</a><div data-ad-preview="message">Quoted text</div>${editor}</div></article></article>`),
    url:post, run:true, status:'skipped', stage:'composer_nested_reply' },
];
function lazyArticle(id = '123', {plain = false, href = group + '?tracking=1#?feb', label = '37 menit lalu', attrs = ''} = {}) {
  let html = article(id, href, `id="time-${id}" ${attrs}`).replace('>Waktu</a>', `>${label}</a>`);
  return plain ? html.replace('<article role="article">', '<div>').replace('</article>', '</div>') : html;
}
const resolveOnHover = (ids, delay = 0) => ids.map(id => `document.getElementById('time-${id}').addEventListener('mouseover',()=>setTimeout(()=>document.getElementById('time-${id}').href=${JSON.stringify(group+'posts/'+id+'/')},${delay}));`).join('\n');
const childTimestamp = lazyArticle('123',{label:'<span id="hover-span" aria-label="37 menit lalu" style="display:inline-block"><b id="hover-text" style="display:inline-block">37 menit lalu</b></span>'});
const overlay = '<div id="overlay" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.01)">Unrelated overlay</div>';
const resolveFromChild = event => `document.getElementById('hover-span').addEventListener('${event}',()=>document.getElementById('time-123').href=${JSON.stringify(post)});`;
const descendants = [
  { name:'timestamp hover reaches a handler attached only to its child span', html:childTimestamp, setup:resolveFromChild('mouseover'), items:[post], hovered:['time-123'], hoverTargets:['hover-text'] },
  { name:'timestamp pointer hover reaches a handler attached only to its child span', html:childTimestamp, setup:resolveFromChild('pointerover'), items:[post], hovered:['time-123'], hoverTargets:['hover-text'] },
  { name:'timestamp enters child ancestors along the single hit path', html:childTimestamp, setup:resolveFromChild('mouseenter'), items:[post], hovered:['time-123'], hoverTargets:['hover-text'] },
  { name:'unrelated hit test uses a single scoped labelled child fallback', html:childTimestamp+overlay, setup:resolveFromChild('mouseover'), items:[post], hovered:['time-123'], hoverTargets:['hover-text'] },
  { name:'child fallback supports an unambiguous unlabelled visible chain', html:childTimestamp.replace('aria-label="37 menit lalu"','')+overlay, setup:resolveFromChild('mouseover'), items:[post], hovered:['time-123'], hoverTargets:['hover-text'] },
  { name:'ambiguous child branches keep the anchor fallback without guessing', html:lazyArticle('123',{label:'<span id="hover-span" aria-label="37 menit lalu">37 menit lalu</span><span aria-label="42 menit lalu">42 menit lalu</span>'})+overlay, setup:resolveFromChild('mouseover'), error:/tautan postingannya belum dikenali/, hovered:['time-123'], hoverTargets:['time-123'] },
  { name:'child hover preserves a native anchor mouseenter listener', html:childTimestamp, setup:`document.getElementById('time-123').addEventListener('mouseenter',()=>document.getElementById('time-123').href=${JSON.stringify(post)});`, items:[post], hovered:['time-123'], hoverTargets:['hover-text'] },
];
const labelled = [
  { name:'live plain card resolves aria-hidden sibling timestamp label with nested message markers', html:`<div role="feed"><div aria-posinset="1"><h2>Author fixture</h2><div aria-hidden="true" id="time-label">8 menit lalu</div><a id="time-123" role="link" aria-labelledby="time-label" href="${group}?tracking=1#?ddi">q\u034fXk</a><div data-ad-rendering-role="story_message"><div data-ad-comet-preview="message" data-ad-preview="message">Body fixture</div></div></div></div>`, setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name:'timestamp resolves an explicitly referenced hidden child label', html:lazyArticle('123',{label:'qXk<span id="time-label" hidden>sekitar semenit yang lalu</span>',attrs:'aria-labelledby="time-label"'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name:'timestamp resolves a sibling aria-labelledby label within the same plain card header', html:lazyArticle('123',{plain:true,label:'qXk',attrs:'aria-labelledby="time-label"'}).replace('<h2>','<span id="time-label" hidden>sekitar satu jam yang lalu</span><h2>'), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name:'timestamp combines scoped aria-labelledby references in order', html:lazyArticle('123',{label:'qXk<span id="time-about" hidden>sekitar</span><span id="time-value" hidden>semenit yang lalu</span>',attrs:'aria-labelledby="time-about time-value"'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name:'timestamp accepts a scoped numeric approximate relative label', html:lazyArticle('123',{label:'qXk<span id="time-label" hidden>sekitar 2 jam yang lalu</span>',attrs:'aria-labelledby="time-label"'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name:'referenced label outside the isolated post card cannot authorize hover', html:lazyArticle('123',{label:'qXk',attrs:'aria-labelledby="time-label"'})+'<span id="time-label" hidden>sekitar semenit yang lalu</span>', setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name:'referenced label inside post body cannot authorize hover', html:lazyArticle('123',{label:'qXk',attrs:'aria-labelledby="time-label"'}).replace('Status sintetis 123','<span id="time-label" hidden>sekitar semenit yang lalu</span>Status sintetis 123'), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name:'referenced label inside a semantic comment cannot authorize hover', html:lazyArticle('123',{label:'qXk',attrs:'aria-labelledby="time-label"'}).replace('<h2>','<div role="listitem"><span id="time-label" hidden>sekitar semenit yang lalu</span></div><h2>'), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name:'missing aria-labelledby reference never authorizes hover', html:lazyArticle('123',{label:'qXk',attrs:'aria-labelledby="missing-label"'}), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
];
const hydration = [
  ...descendants,
  ...labelled,
  { name: 'hover resolves a visible semantic post timestamp', html: lazyArticle(), setup: resolveOnHover(['123']), items: [post], hovered: ['time-123'] },
  { name: 'hover resolves adjacent plain DIV timestamps independently', html: '<div role="feed">'+lazyArticle('123',{plain:true})+lazyArticle('124',{plain:true})+'</div>', setup: resolveOnHover(['123','124']), items: [post,group+'posts/124/'], hovered: ['time-123','time-124'] },
  { name: 'hover hydration waits for an asynchronously resolved timestamp', html: lazyArticle('123',{plain:true}), setup: resolveOnHover(['123'],2500), items:[post], hovered:['time-123'] },
  { name: 'timestamp aria label supports obfuscated visible text', html: lazyArticle('123',{label:'xYz',attrs:'aria-label="30 September pada 16.42"'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name: 'timestamp strips Facebook formatting joiners before recognition', html: lazyArticle('123',{label:'3\u034f7 me\u034fnit lalu'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name: 'timestamp uses visible text instead of hidden obfuscation', html: lazyArticle('123',{label:'<span hidden>junk</span>37 menit lalu'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name: 'timestamp recognizes a visible child accessible label', html: lazyArticle('123',{label:'<span role="group" aria-label="37 menit lalu">qXkL</span>'}), setup:resolveOnHover(['123']), items:[post], hovered:['time-123'] },
  { name: 'unresolved placeholder never becomes a post target', html:lazyArticle(), error:/tautan postingannya belum dikenali/, hovered:['time-123'] },
  { name: 'ordinary group navigation is not hovered as a timestamp', html:lazyArticle('123',{label:'Lihat grup'}), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'timestamp inside post body is never hydrated', html:`<article role="article"><div data-ad-preview="message"><a id="time-123" href="${group}#?feb">37 menit lalu</a></div></article>`, setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'timestamp inside semantic comment is never hydrated', html:article('123',group+'#').replace('</article>',lazyArticle('124')+'</article>'), setup:resolveOnHover(['124']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'comment timestamp URL is never hydrated into a post target', html:lazyArticle('123',{href:group+'?comment_id=99#?feb'}), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'reply timestamp URL is never hydrated into a post target', html:lazyArticle('123',{href:group+'?reply_comment_id=99#?feb'}), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'hidden timestamp is never hydrated', html:lazyArticle('123',{attrs:'hidden'}), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'another group timestamp is never hydrated', html:lazyArticle('123',{href:'https://www.facebook.com/groups/other/#?feb'}), setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'hover resolving to another group is still rejected', html:lazyArticle(), setup:`document.getElementById('time-123').addEventListener('mouseover',()=>document.getElementById('time-123').href='https://www.facebook.com/groups/other/posts/123/')`, error:/tautan postingannya belum dikenali/, hovered:['time-123'] },
  { name: 'plain shared-post card with two stories is not hydrated', html:`<div role="feed"><div><a id="time-123" href="${group}#?feb">37 menit lalu</a><div data-ad-preview="message">Outer story</div><div data-ad-preview="message">Shared story</div></div></div>`, setup:resolveOnHover(['123']), error:/Feed grup belum terbaca/, hovered:[] },
  { name: 'two competing timestamp placeholders remain ambiguous', html:lazyArticle().replace('<h2>',`<a id="time-124" href="${group}#?bha">42 menit lalu</a><h2>`), setup:resolveOnHover(['123','124']), error:/tautan postingannya belum dikenali/, hovered:[] },
  { name: 'timestamp after the body is not promoted to header', html:`<article role="article"><div data-ad-preview="message">Body</div><a id="time-123" href="${group}#?feb">37 menit lalu</a></article>`, setup:resolveOnHover(['123']), error:/tautan postingannya belum dikenali/, hovered:[] },
];
function clickCard(id='123', text='Status sintetis '+id, extra='') {
  return lazyArticle(id,{attrs:'target="_blank"'}).replace('<h2>Author fixture</h2>', `<h2><a href="https://web.facebook.com/groups/example/user/12345/">Author fixture</a></h2>`)
    .replace('Status sintetis '+id,text).replace('</article>',extra+'</article>');
}
function openFixture(ids=['123'], opts={}) {
  return `const options=${JSON.stringify(opts)}; const ids=${JSON.stringify(ids)};
    for(const id of ids) {
      const anchor=document.getElementById('time-'+id);
      const trigger=options.childOnly ? anchor.querySelector('span') : anchor;
      const pressed=[];
      for(const type of ['pointerdown','mousedown','pointerup','mouseup'])trigger.addEventListener(type,event=>{
        pressed.push(type);
        if(options.cancelPress && type==='pointerdown')listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{});
        if(options.changeLink && type==='mousedown')anchor.href='https://www.facebook.com/groups/other/';
        if(options.replaceLink && type==='mousedown')anchor.replaceWith(anchor.cloneNode(true));
        if(options.resolveOnDown && type==='pointerdown')anchor.href=${JSON.stringify(group)}+'posts/'+id+'/';
      });
      trigger.addEventListener(options.openOn || 'click',event=>{
        if(options.stopPropagation)event.stopPropagation();
        if(options.requirePress && pressed.join(',')!==(options.openOn==='pointerup'?'pointerdown,mousedown,pointerup':'pointerdown,mousedown,pointerup,mouseup'))return;
        if(options.requirePress && event.type==='click' && event.detail!==1)return;
        if(options.rejectCancelled && event.defaultPrevented)return;
        if(options.noModal) return;
        const openedText=options.text || ('Status sintetis '+id);
        const author=options.author || '12345';
        const head='<header><h2>Postingan Author fixture</h2><button id="close-'+id+'" aria-label="Tutup">X</button>'+(options.twoClose?'<button aria-label="Tutup">X</button>':'')+'</header>';
        const authorTag=options.plainAuthor?'div':'h2';
        const body='<'+authorTag+' id="modal-author"><a href="https://www.facebook.com/profile.php?id='+author+'">Author fixture</a></'+authorTag+'><div data-ad-preview="message">'+openedText+'</div>';
        const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.id='opened-modal';
        dialog.innerHTML=options.reply ? '<div role="listitem" data-comment-id="reply">'+head+body+'</div>' : head+body;
        document.body.append(dialog);
        window.__fixtureURL=options.photoRoute ? 'https://www.facebook.com/photo.php?fbid=123' : ${JSON.stringify(group)}+'posts/'+id+'/';
        if(options.authorDelay){const authorNode=dialog.querySelector('#modal-author');authorNode.hidden=true;setTimeout(()=>authorNode.hidden=false,options.authorDelay)}
        if(options.cancelOn===id)setTimeout(()=>listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}),options.cancelDelay||200);
        if(options.security)setTimeout(()=>dialog.insertAdjacentHTML('beforeend','<div role="alert">Pemeriksaan keamanan</div>'),200);
        if(options.otherGroup)setTimeout(()=>window.__fixtureURL='https://www.facebook.com/groups/other/',200);
        if(options.cancelOn===id || options.security || options.otherGroup)dialog.querySelector('#close-'+id).hidden=true;
        dialog.querySelector('#close-'+id).addEventListener('click',()=>{dialog.remove();if(!options.noRestore)window.__fixtureURL=${JSON.stringify(group)};if(options.rerender)anchor.replaceWith(anchor.cloneNode(true))});
      });
    }`;
}
const clickCases = [
  {name:'unresolved timestamp click verifies numeric modal then closes to group feed',html:clickCard(),setup:openFixture(),items:[post],clickTargets:['time-123','close-123']},
  {name:'timestamp child-only click handler resolves without sweeping other targets',html:clickCard().replace('>37 menit lalu</a>','><span id="click-span"><b id="click-text">37 menit lalu</b></span></a>'),setup:openFixture(['123'],{childOnly:true}),items:[post],clickTargets:['click-text','close-123']},
  {name:'collapsed caption matches expanded modal from the same author',html:clickCard('123','Sisa 2 slot … Lihat selengkapnya'),setup:openFixture(['123'],{text:'Sisa 2 slot Akun ready farm !! Langsung inbox/wa'}),items:[post],clickTargets:['time-123','close-123']},
  {name:'collapsed prefix never matches a different word',html:clickCard('123','Sisa 2 slot … Lihat selengkapnya'),setup:openFixture(['123'],{text:'Sisa 2 slotlain merupakan teks berbeda'}),error:/isi atau penulis dialog tidak cocok/,clickTargets:['time-123']},
  {name:'modal waits for asynchronously rendered matching author',html:clickCard(),setup:openFixture(['123'],{authorDelay:900}),items:[post],clickTargets:['time-123','close-123']},
  {name:'modal author may be a plain header link before the story',html:clickCard(),setup:openFixture(['123'],{plainAuthor:true}),items:[post],clickTargets:['time-123','close-123']},
  {name:'rerendered completed card is not opened repeatedly',html:clickCard(),setup:openFixture(['123'],{rerender:true}),items:[post],clickTargets:['time-123','close-123']},
  {name:'mismatched modal author is never closed or accepted',html:clickCard(),setup:openFixture(['123'],{author:'54321'}),error:/isi atau penulis dialog tidak cocok/,clickTargets:['time-123']},
  {name:'mismatched modal body is never closed or accepted',html:clickCard(),setup:openFixture(['123'],{text:'Postingan berbeda'}),error:/isi atau penulis dialog tidak cocok/,clickTargets:['time-123']},
  {name:'two modal close controls are ambiguous',html:clickCard(),setup:openFixture(['123'],{twoClose:true}),error:/kontrol tutup postingan belum dapat dipastikan/,clickTargets:['time-123']},
  {name:'reply content cannot authorize matching story author or close',html:clickCard(),setup:openFixture(['123'],{reply:true}),error:/kontrol tutup postingan belum dapat dipastikan/,clickTargets:['time-123']},
  {name:'photo route never substitutes for a numeric group permalink',html:clickCard(),setup:openFixture(['123'],{photoRoute:true}),error:/Halaman bukan tujuan tugas/,clickTargets:['time-123']},
  {name:'targetblank default navigation is prevented if React opens no modal',html:clickCard(),setup:openFixture(['123'],{noModal:true}),error:/kontrol tutup postingan belum dapat dipastikan/,clickTargets:['time-123']},
  {name:'feed restoration is required before accepting a resolved post',html:clickCard(),setup:openFixture(['123'],{noRestore:true}),error:/halaman grup belum kembali/,clickTargets:['time-123','close-123']},
  {name:'STOP during second modal resolution preserves the first verified post',html:clickCard()+clickCard('124'),setup:openFixture(['123','124'],{cancelOn:'124'}),items:[post],clickTargets:['time-123','close-123','time-124']},
  {name:'security restriction during modal resolution stops without close',html:clickCard(),setup:openFixture(['123'],{security:true}),error:/pemeriksaan keamanan/,clickTargets:['time-123']},
  {name:'navigation to another group during modal resolution stops without close',html:clickCard(),setup:openFixture(['123'],{otherGroup:true}),error:/Halaman bukan tujuan tugas/,clickTargets:['time-123']},
  {name:'missing source author leaves timestamp unclicked',html:lazyArticle(),setup:openFixture(),error:/tautan postingannya belum dikenali/,clickTargets:[]},
  {name:'timestamp inside post body remains unclicked even with a matching author',html:clickCard().replace('<a id="time-123"','<div data-ad-preview="message"><a id="time-123"').replace('>37 menit lalu</a>','>37 menit lalu</a></div>'),setup:openFixture(),error:/tautan postingannya belum dikenali/,clickTargets:[]},
];
const pressCases = [
  {name:'Pressable requires a complete primary pointer and mouse sequence plus click detail1',html:clickCard(),setup:openFixture(['123'],{requirePress:true}),items:[post],clickTargets:['time-123','close-123'],pressEvents:['pointerdown','mousedown','pointerup','mouseup','click']},
  {name:'full press reaches a child-only Pressable handler',html:clickCard().replace('>37 menit lalu</a>','><span id="click-span"><b id="click-text">37 menit lalu</b></span></a>'),setup:openFixture(['123'],{childOnly:true,requirePress:true}),items:[post],clickTargets:['click-text','close-123'],pressEvents:['pointerdown','mousedown','pointerup','mouseup','click']},
  {name:'opening on pointerup skips the remaining activation steps',html:clickCard(),setup:openFixture(['123'],{requirePress:true,openOn:'pointerup'}),items:[post],clickTargets:['close-123'],pressEvents:['pointerdown','mousedown','pointerup']},
  {name:'stopped propagation cannot open a native targetblank tab',html:clickCard(),setup:openFixture(['123'],{requirePress:true,stopPropagation:true,noModal:true}),error:/kontrol tutup postingan belum dapat dipastikan/,clickTargets:['time-123'],pressEvents:['pointerdown','mousedown','pointerup','mouseup','click']},
  {name:'handler rejecting cancelled clicks fails closed without a new tab',html:clickCard(),setup:openFixture(['123'],{requirePress:true,rejectCancelled:true}),error:/kontrol tutup postingan belum dapat dipastikan/,clickTargets:['time-123'],pressEvents:['pointerdown','mousedown','pointerup','mouseup','click']},
  {name:'STOP during pointer press prevents release and click',html:clickCard(),setup:openFixture(['123'],{requirePress:true,cancelPress:true}),items:[],clickTargets:[],pressEvents:['pointerdown']},
  {name:'timestamp destination change midpress prevents remaining events',html:clickCard(),setup:openFixture(['123'],{requirePress:true,changeLink:true}),error:/Tautan waktu postingan berubah/,clickTargets:[],pressEvents:['pointerdown','mousedown']},
  {name:'replaced timestamp node midpress receives no further events',html:clickCard(),setup:openFixture(['123'],{requirePress:true,replaceLink:true}),error:/Tautan waktu postingan berubah/,clickTargets:[],pressEvents:['pointerdown','mousedown']},
  {name:'pointerdown may resolve the same card numeric permalink before click',html:clickCard(),setup:openFixture(['123'],{requirePress:true,resolveOnDown:true}),items:[post],clickTargets:['time-123','close-123'],pressEvents:['pointerdown','mousedown','pointerup','mouseup','click']},
];
const delayed = [
  { name: 'first feed card appears after 8 seconds', html: '<main id="feed"></main>',
    setup: `setTimeout(()=>document.getElementById('feed').innerHTML=${JSON.stringify(article())},8000)`, items: [post], firstScroll: 8000 },
  { name: 'timestamp permalink appears after 8 seconds', html: article('123', group + '#'),
    setup: `setTimeout(()=>document.querySelector('article a').href=${JSON.stringify(post)},8000)`, items: [post], firstScroll: 8000 },
];
const cases = pressOnly ? pressCases : clicksOnly ? clickCases : descendantsOnly ? descendants : labelsOnly ? labelled : hydrationOnly ? hydration : boundariesOnly ? boundaries : baseline ? delayed : [
  ...delayed,
  ...boundaries,
  ...hydration,
  ...clickCases,
  ...pressCases,
  { name: 'first card appears after 25 seconds', html: '<main id="feed"></main>',
    setup: `setTimeout(()=>document.getElementById('feed').innerHTML=${JSON.stringify(article())},25000)`, items: [post], firstScroll: 25000 },
  { name: 'ready semantic card is collected', html: article(), items: [post] },
  { name: 'plain DIV card remains supported', html: article().replace('<article role="article">', '<div>').replace('</article>', '</div>'), items: [post] },
  { name: 'adjacent posts canonicalize and deduplicate', html: article() + article('124', 'https://web.facebook.com/groups/example/permalink/124/?x=1') + article(), items: [post, group + 'posts/124/'] },
  { name: 'empty feed shows a readiness error instead of false success', html: '<main id="feed"></main>', error: /Feed grup belum terbaca setelah 45 detik/ },
  { name: 'card without a readable permalink shows a layout error', html: article('123', group + '#'), error: /tautan postingannya belum dikenali/ },
  { name: 'comment and reply URLs never become review targets', html: article('123', post + '?comment_id=1') + article('124', group + 'posts/124/?reply_comment_id=2'), error: /tautan postingannya belum dikenali/ },
  { name: 'post URL inside body cannot become a header', html: `<article role="article"><div data-ad-preview="message"><a href="${post}">URL in body</a></div></article>`, error: /tautan postingannya belum dikenali/ },
  { name: 'shared canonical timestamp after the primary body cannot become its header', html:`<article role="article"><h2>Outer post</h2><a href="${group}#">Waktu belum dikenali</a><div data-ad-preview="message">Outer post body</div><div><a href="${post}">37 menit lalu</a></div></article>`, error:/tautan postingannya belum dikenali/ },
  { name: 'outer canonical header wins over a shared canonical timestamp after body', html:article().replace('</article>',`<div><a href="${group}posts/124/">Shared time</a></div></article>`), items:[post] },
  { name: 'captionless semantic post retains its canonical timestamp', html:`<article role="article"><a href="${post}">37 menit lalu</a><img width="180" height="180"></article>`,items:[post] },
  { name: 'hidden timestamp never becomes a review target', html: article('123', post, 'hidden'), error: /tautan postingannya belum dikenali/ },
  { name: 'another group is excluded', html: article('123', 'https://www.facebook.com/groups/other/posts/123/'), error: /tautan postingannya belum dikenali/ },
  { name: 'security restriction already present stops scan', html: '<div role="alert">Pemeriksaan keamanan</div>' + article(), error: /pemeriksaan keamanan/ },
  { name: 'security restriction appearing during wait stops scan', html: '<main id="feed"></main>', setup: `setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<div role="alert">Pemeriksaan keamanan</div>'),3000)`, error: /pemeriksaan keamanan/, maxElapsed: 8000 },
  { name: 'navigation to another group stops scan', html: '<main id="feed"></main>', setup: `setTimeout(()=>window.__fixtureURL='https://www.facebook.com/groups/other/',3000)`, error: /Halaman bukan tujuan tugas/, maxElapsed: 8000 },
  { name: 'STOP during empty wait returns promptly', html: '<main id="feed"></main>', setup: `setTimeout(()=>listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}),3000)`, items: [], maxElapsed: 8000 },
  { name: 'STOP after discovery keeps the partial read-only result', html: article(), setup: `setTimeout(()=>listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}),1500)`, items: [post], maxElapsed: 8000 },
  { name: 'direct post URL cannot masquerade as a group scan', html: article(), url: post, error: /Halaman grup tidak cocok/ },
];

(async () => {
  const exe = process.env.CHROMIUM_PATH || [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, headless: true,
    args: ['--disable-background-networking', '--no-first-run'] });
  const results = [];
  try {
    for (const c of cases.filter(c => filterIndex < 0 || c.name.includes(process.argv[filterIndex + 1]))) {
      const context = await browser.newContext();
      const requests = [];
      await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      const page = await context.newPage();
      let popups = 0;
      page.on('popup',()=>{popups++});
      try {
        await page.setContent('<!doctype html><style>article{padding:20px;border:1px solid} [hidden]{display:none}</style><input id="keep-focus">' + c.html);
        await page.locator('#keep-focus').focus();
        await page.addScriptTag({ content: `
          window.__fixtureURL=${JSON.stringify(c.url || group)};
          const realNow=Date.now.bind(Date), epoch=realNow(), speed=30;
          Date.now=()=>epoch+(realNow()-epoch)*speed;
          const realTimer=window.setTimeout.bind(window);
          window.setTimeout=(fn,ms,...args)=>realTimer(fn,Math.max(1,ms/speed),...args);
          window.listeners=[]; window.runtimeCalls=0; window.clicks=0; window.fileChanges=0; window.scrolls=[]; window.hovered=[]; window.hoverTargets=[];window.clickTargets=[];window.pressEvents=[];
          window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async()=>{runtimeCalls++;return {allowed:false}}}};
          window.scrollBy=()=>scrolls.push(Date.now()-window.scanStarted);
          document.addEventListener('click',event=>{window.clicks++;window.clickTargets.push(event.target.id)},true);
          for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])document.addEventListener(type,event=>{if(event.target.closest('a[id^="time-"]'))window.pressEvents.push(type)},true);
          document.addEventListener('change',event=>{if(event.target.matches('input[type="file"]'))window.fileChanges++});
          document.addEventListener('mouseover',event=>{const link=event.target.closest('a');if(link){window.hovered.push(link.id);window.hoverTargets.push(event.target.id)}});
        ` });
        await page.addScriptTag({ content: source });
        const actual = await page.evaluate(async ({setup, probe, run, post}) => {
          window.scanStarted = Date.now();
          if (setup) new Function(setup)();
          const job = { id:'job', lease:'lease', kind:'group_comment', target:post,
            payload:{adminSelected:true}, useExistingFeed:true, expiresAt:Date.now()+120000,
            banner:{mime:'image/png',body:'AA=='} };
          const message = probe || run ? {type:probe ? 'CP_LOKER_PROBE_FEED' : 'CP_LOKER_RUN',job}
            : {type:'CP_LOKER_SCAN_ALL',group:'https://www.facebook.com/groups/example/'};
          const result = await new Promise(resolve => listeners[0](message, { id:'fixture' }, resolve));
          return { result, elapsed:Date.now()-scanStarted, scrolls, runtimeCalls, clicks, fileChanges,
            hovered:[...new Set(hovered)],hoverTargets:[...new Set(hoverTargets)],clickTargets,pressEvents,activeElement:document.activeElement.id };
        }, {setup:c.setup || '',probe:!!c.probe,run:!!c.run,post});
        const items = (actual.result.items || []).map(x => x.url);
        if (c.probe) assert.equal(actual.result.ready, c.ready);
        else if (c.run) { assert.equal(actual.result.status,c.status); assert.equal(actual.result.stage,c.stage); assert.equal(actual.result.dispatched,false); }
        else if (c.error) assert.match(actual.result.error || '', c.error);
        else { assert.equal(actual.result.error, undefined); assert.deepEqual(items, c.items); }
        if (c.firstScroll) assert.ok(actual.scrolls[0] >= c.firstScroll, 'must not scroll away before the first permalink is ready');
        if (c.maxElapsed) assert.ok(actual.elapsed < c.maxElapsed, 'STOP/restriction must not wait the whole scan timeout');
        assert.equal(actual.runtimeCalls, 0, 'scan/probe/rejected reply never requests dispatch');
        assert.equal(actual.clicks, c.clickTargets?.length || 0, 'only approved read-only timestamp and matching close controls are clicked');
        if(c.clickTargets)assert.deepEqual(actual.clickTargets,c.clickTargets,'read-only modal resolution click order');
        if(c.pressEvents)assert.deepEqual(actual.pressEvents,c.pressEvents,'single guarded timestamp press sequence');
        assert.equal(popups,0,'scan never opens a native new tab');
        assert.equal(actual.fileChanges, 0, 'scan/probe/rejected reply never attaches a file');
        assert.equal(actual.activeElement, 'keep-focus', 'scan/probe/rejected reply preserves user focus');
        if (c.hovered) assert.deepEqual(actual.hovered,c.hovered,'only eligible timestamp links receive hover events');
        if (c.hoverTargets) assert.deepEqual(actual.hoverTargets,c.hoverTargets,'hover uses one scoped element rather than dispatching through child branches');
        assert.deepEqual(requests, [], 'fixture makes no network requests');
        results.push({ name: c.name, passed: true, ...actual });
      } catch (error) {
        results.push({ name: c.name, passed: false, error: String(error) });
      } finally { await context.close(); }
      const latest = results.at(-1);
      console.log(`${latest.passed ? 'PASS' : 'FAIL'} ${c.name}${latest.passed ? '' : ': ' + latest.error}`);
    }
  } finally { await browser.close(); }
  const report = { synthetic_only: true, network_blocked: true, source: sourcePath, browser: 'isolated headless Chromium/Edge', baseline,
    passed: results.filter(x=>x.passed).length, failed: results.filter(x=>!x.passed).length, tests: results };
  if (reportPath) { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n'); }
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, synthetic_only: true }));
  process.exitCode = report.failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode=1; });
