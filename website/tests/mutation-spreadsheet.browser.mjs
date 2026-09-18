import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const stub = `import React,{useEffect,useState}from'react';
export function useDemoOrders(){return{allOrders:window.__orders,updateOrder:(...args)=>window.__writes.push(args)}}
export function useDemoInventory(){return{consumeAllocations:(...args)=>window.__writes.push(args)}}
export function useDemoMutationHistory(){return{addHistory:(...args)=>window.__writes.push(args),countsByOrder:new Map()}}
export function getPayrollActor(){return{name:'Fixture admin'}}
export async function exportMutationsSpreadsheet(rows,label){window.__exports.push({ids:rows.map(r=>r.id),label})}
export function useDemoPeriodLock(){const [isLocked,setLocked]=useState(false);useEffect(()=>{const listener=()=>setLocked(window.__locked);window.addEventListener('fixture-lock',listener);return()=>window.removeEventListener('fixture-lock',listener)},[]);return{isLocked}}
export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}
`;
const bundle = await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import MutationsPage from './app/admin/payroll/mutations/page';
window.__writes=[];window.__exports=[];window.__locked=false;
window.__orders=Array.from({length:473},(_,i)=>({id:'fixture-'+i,orderNumber:'TEST-'+i,externalReference:'TEST-'+String(i).padStart(4,'0'),source:['G2G','PlayerAuction','FunPay'][i%3],buyerName:'Pembeli Uji '+i,orderName:i===0?'Paket uji dengan nama layanan yang panjang untuk memeriksa ukuran otomatis kolom':'Layanan pengujian '+i,orderType:'boosting',game:'UJI',gameName:'Permainan Uji',region:'EU',server:'Skadi',service:'Layanan',quantity:16,rateMinor:33352,grossMinor:533632,workerAssignments:[{id:'a-'+i,employeeCode:'TEST-EMP',employeeName:'Pekerja Uji',team:'FH1',process:'JOKI',quantity:16}],operationalStatus:'in_progress',financeStatus:'pending',expectedPaymentMinor:533632,matchedPaymentMinor:0,orderedAt:new Date(Date.parse('2026-09-17T09:00:00Z')-i*60000).toISOString(),dueAt:'2026-09-18T09:00:00Z'}));
createRoot(document.getElementById('root')).render(<div className="evocp-payroll fixture-grid"><aside>Sidebar uji</aside><main><fieldset><MutationsPage/></fieldset><table className="cp-table other-table"><tbody><tr><td>Tabel lain</td></tr></tbody></table></main></div>);`, resolveDir: process.cwd(), loader: 'tsx' },
  outfile: '/tmp/mutation-sheet-fixture.js', write: false, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-hooks', setup(builder) {
    builder.onResolve({filter:/^next\/link$|^@\/features\/payroll\/lib\/(?:demo-order-store|demo-inventory-store|demo-mutation-history-store|demo-period-lock-store|workspace-store|spreadsheet-export)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js',resolveDir:process.cwd()}));
  } }],
});
const styles = readFileSync('features/payroll/payroll.css','utf8') + '\n' + readFileSync('app/admin/admin.css','utf8') + '\n' + bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
const server=createServer((request,response)=>{
  response.setHeader('Cache-Control','no-store');
  if(request.url==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles.find(file=>file.path.endsWith('.js')).text);}
  else if(request.url==='/styles.css'){response.setHeader('Content-Type','text/css');response.end(styles);}
  else response.end('<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0}fieldset{min-width:0;margin:0;border:0;padding:0}.fixture-grid{display:grid;grid-template-columns:210px minmax(0,1fr)}main{min-width:0;padding:20px}button,input,select{padding:8px}.flex{display:flex}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}[role=dialog]:not(dialog){position:fixed;inset:0;z-index:50;background:#111;overflow:auto;padding:20px}@media(max-width:700px){.fixture-grid{display:block}aside{display:none}main{padding:10px}}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try {
  for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,locale:'id-ID'});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin);
    const table=page.getByRole('table',{name:'Daftar Mutasi'});
    await expect(table.locator('tbody>tr')).toHaveCount(473);
    const width=id=>page.locator(`th[data-column="${id}"]`).evaluate(el=>Math.round(el.getBoundingClientRect().width));
    assert.equal(await width('source'),155); assert.equal(await width('total'),190);
    assert.equal(await table.evaluate(el=>getComputedStyle(el).tableLayout),'fixed');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    for(const index of [2,3,4,11,12,13]) assert.equal(await table.locator(`tbody>tr:first-child>td:nth-child(${index})`).evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
    assert.equal(await page.locator('.other-table').evaluate(el=>getComputedStyle(el).tableLayout),'auto');

    const separator=page.getByRole('separator',{name:'Lebar kolom Kode',exact:true});
    await separator.scrollIntoViewIfNeeded();
    const box=await separator.boundingBox(), before=await width('code');
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+96,box.y+box.height/2,{steps:8}); await page.mouse.up();
    assert.equal(await width('code'),before+96); assert.equal(await width('source'),155);
    await separator.focus(); await page.keyboard.press('ArrowRight'); assert.equal(await width('code'),before+112);
    await page.keyboard.press('Home'); assert.equal(await width('code'),135);
    await page.keyboard.press('End'); assert.equal(await width('code'),640);
    await page.keyboard.press('Home');

    await page.getByLabel('Pilih kolom',{exact:true}).selectOption('order');
    await page.getByLabel('Lebar (px)',{exact:true}).fill('610');
    await page.getByRole('button',{name:'Terapkan lebar',exact:true}).click();
    assert.equal(await width('order'),610);
    await page.waitForTimeout(230); await page.reload(); await expect(table.locator('tbody>tr')).toHaveCount(473);
    await expect.poll(()=>width('order')).toBe(610);
    await page.getByRole('separator',{name:'Lebar kolom Nama pesanan',exact:true}).dblclick();
    assert.ok(await width('order')>500); assert.ok(await width('order')<=1200);
    assert.equal(await page.locator('.mutation-sheet-measure').count(),0);
    await page.getByRole('button',{name:'Rapikan semua kolom',exact:true}).click();
    assert.ok(await width('source')>=130);
    await page.getByRole('button',{name:'Atur ulang lebar',exact:true}).click(); assert.equal(await width('order'),320);

    const mainEnd=await page.locator('.mutation-sheet-scroll').evaluate(el=>{el.scrollLeft=1e9;const end=el.scrollLeft;el.scrollLeft=0;return end;});
    const topEnd=await page.locator('.mutation-sheet-top-scroll').evaluate(el=>{el.scrollLeft=1e9;const end=el.scrollLeft;el.scrollLeft=0;return end;});
    assert.ok(mainEnd>0 && topEnd>0);
    await page.locator('.mutation-sheet-top-scroll').evaluate(el=>{el.scrollLeft=1e9;});
    await expect.poll(()=>page.locator('.mutation-sheet-scroll').evaluate(el=>el.scrollLeft)).toBeCloseTo(mainEnd,0);
    await page.locator('.mutation-sheet-scroll').evaluate(el=>{el.scrollLeft=el.scrollWidth/2;});
    await expect.poll(async()=>{
      const values=await page.evaluate(()=>{const main=document.querySelector('.mutation-sheet-scroll'),top=document.querySelector('.mutation-sheet-top-scroll');return [main.scrollLeft/(main.scrollWidth-main.clientWidth),top.scrollLeft/(top.scrollWidth-top.clientWidth)];});
      return Math.abs(values[0]-values[1]);
    }).toBeLessThan(0.01);
    await page.locator('.mutation-sheet-scroll').evaluate(el=>{el.scrollLeft=0;el.scrollTop=500;});
    await expect.poll(()=>page.locator('.mutation-sheet-top-scroll').evaluate(el=>el.scrollLeft)).toBe(0);
    assert.ok(await page.locator('.mutation-sheet-scroll').evaluate(el=>Math.abs(el.querySelector('th').getBoundingClientRect().top-el.getBoundingClientRect().top)<3));
    assert.deepEqual(await page.evaluate(()=>window.__writes),[]);

    await page.locator('select').filter({has:page.locator('option[value="FunPay"]')}).selectOption('FunPay');
    await expect(table.locator('tbody>tr')).toHaveCount(157);
    await page.getByRole('button',{name:/Ekspor Mutasi/}).click();
    assert.equal(await page.evaluate(()=>window.__exports[0].ids.length),157);
    assert.equal(await width('order'),320);

    await page.getByRole('button',{name:'Perbesar tabel',exact:true}).click();
    const modal=page.locator('dialog.mutation-sheet-dialog');
    await expect(modal).toBeVisible(); assert.equal(await modal.evaluate(el=>el.matches(':modal')),true);
    assert.ok((await modal.boundingBox()).width>=viewport.width-26);
    await table.locator('tbody>tr:first-child').getByRole('button',{name:/Edit Mutasi/}).click();
    await expect(modal.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(modal.locator('[role="dialog"]')).toHaveCount(0); await expect(modal).toBeVisible();
    await page.getByRole('button',{name:'Kecilkan tabel',exact:true}).focus(); await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible(); await expect(page.getByRole('button',{name:'Perbesar tabel',exact:true})).toBeFocused();
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    assert.deepEqual(await page.evaluate(()=>window.__writes),[]);
    await table.locator('tbody>tr:first-child').getByRole('button',{name:'Proses',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__writes.length),1);
    assert.equal(await page.evaluate(()=>window.__writes[0][1].operationalStatus),'assigned');
    await page.getByRole('button',{name:'Perbesar tabel',exact:true}).click();
    await page.evaluate(()=>{window.__locked=true;window.dispatchEvent(new Event('fixture-lock'));});
    await expect(modal).not.toBeVisible(); await expect(page.getByRole('button',{name:'Perbesar tabel',exact:true})).toBeDisabled();
    assert.equal(await page.evaluate(()=>window.__writes.length),1);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}px: 473 rows, widths, drag, keyboard, auto-fit, persistence, scroll, filters/export, modal editing, locks, no incidental writes.`);
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:900,height:800}});
  await context.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked')};Storage.prototype.setItem=()=>{throw new Error('blocked')};});
  const page=await context.newPage(); await page.goto(origin);
  await expect(page.getByRole('table',{name:'Daftar Mutasi'})).toBeVisible();
  await page.getByRole('button',{name:'Atur ulang lebar'}).click();
  assert.deepEqual(await page.evaluate(()=>window.__writes),[]);
  await context.close(); console.log('PASS storage-disabled fallback.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
