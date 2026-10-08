'use strict';
// Isolated synthetic pages only. All page network requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sourcePath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'facebook.js'));
const baseline = process.argv.includes('--baseline');
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
const delayed = [
  { name: 'first feed card appears after 8 seconds', html: '<main id="feed"></main>',
    setup: `setTimeout(()=>document.getElementById('feed').innerHTML=${JSON.stringify(article())},8000)`, items: [post], firstScroll: 8000 },
  { name: 'timestamp permalink appears after 8 seconds', html: article('123', group + '#'),
    setup: `setTimeout(()=>document.querySelector('article a').href=${JSON.stringify(post)},8000)`, items: [post], firstScroll: 8000 },
];
const cases = baseline ? delayed : [
  ...delayed,
  { name: 'first card appears after 25 seconds', html: '<main id="feed"></main>',
    setup: `setTimeout(()=>document.getElementById('feed').innerHTML=${JSON.stringify(article())},25000)`, items: [post], firstScroll: 25000 },
  { name: 'ready semantic card is collected', html: article(), items: [post] },
  { name: 'plain DIV card remains supported', html: article().replace('<article role="article">', '<div>').replace('</article>', '</div>'), items: [post] },
  { name: 'adjacent posts canonicalize and deduplicate', html: article() + article('124', 'https://web.facebook.com/groups/example/permalink/124/?x=1') + article(), items: [post, group + 'posts/124/'] },
  { name: 'empty feed shows a readiness error instead of false success', html: '<main id="feed"></main>', error: /Feed grup belum terbaca setelah 45 detik/ },
  { name: 'card without a readable permalink shows a layout error', html: article('123', group + '#'), error: /tautan postingannya belum dikenali/ },
  { name: 'comment and reply URLs never become review targets', html: article('123', post + '?comment_id=1') + article('124', group + 'posts/124/?reply_comment_id=2'), error: /tautan postingannya belum dikenali/ },
  { name: 'post URL inside body cannot become a header', html: `<article role="article"><div data-ad-preview="message"><a href="${post}">URL in body</a></div></article>`, error: /tautan postingannya belum dikenali/ },
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
    for (const c of cases) {
      const context = await browser.newContext();
      const requests = [];
      await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      const page = await context.newPage();
      try {
        await page.setContent('<!doctype html><style>article{padding:20px;border:1px solid} [hidden]{display:none}</style>' + c.html);
        await page.addScriptTag({ content: `
          window.__fixtureURL=${JSON.stringify(c.url || group)};
          const realNow=Date.now.bind(Date), epoch=realNow(), speed=30;
          Date.now=()=>epoch+(realNow()-epoch)*speed;
          const realTimer=window.setTimeout.bind(window);
          window.setTimeout=(fn,ms,...args)=>realTimer(fn,Math.max(1,ms/speed),...args);
          window.listeners=[]; window.runtimeCalls=0; window.clicks=0; window.scrolls=[];
          window.chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async()=>{runtimeCalls++;return {allowed:false}}}};
          window.scrollBy=()=>scrolls.push(Date.now()-window.scanStarted);
          document.addEventListener('click',()=>window.clicks++);
        ` });
        await page.addScriptTag({ content: source });
        const actual = await page.evaluate(async setup => {
          window.scanStarted = Date.now();
          if (setup) new Function(setup)();
          const result = await new Promise(resolve => listeners[0]({ type: 'CP_LOKER_SCAN_ALL', group: 'https://www.facebook.com/groups/example/' }, { id: 'fixture' }, resolve));
          return { result, elapsed: Date.now()-scanStarted, scrolls, runtimeCalls, clicks };
        }, c.setup || '');
        const items = (actual.result.items || []).map(x => x.url);
        if (c.error) assert.match(actual.result.error || '', c.error);
        else { assert.equal(actual.result.error, undefined); assert.deepEqual(items, c.items); }
        if (c.firstScroll) assert.ok(actual.scrolls[0] >= c.firstScroll, 'must not scroll away before the first permalink is ready');
        if (c.maxElapsed) assert.ok(actual.elapsed < c.maxElapsed, 'STOP/restriction must not wait the whole scan timeout');
        assert.equal(actual.runtimeCalls, 0, 'scan never requests dispatch');
        assert.equal(actual.clicks, 0, 'scan never clicks submit controls');
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
