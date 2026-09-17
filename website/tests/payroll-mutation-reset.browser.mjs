import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const stub = `
export const usePayrollActor=()=>({isAdmin:!location.search.includes('nonadmin')});
export const flushPayroll=async()=>{};
export const loadPayroll=async()=>{window.__loads++};
export const authenticatedFetchJson=async()=>window.__preview;
export const authenticatedFetch=async()=>new Response('private backup',{headers:{'Content-Type':'application/gzip'}});
export const resetPayrollMutations=async(request)=>{
 window.__requests.push(request); await new Promise(resolve=>setTimeout(resolve,80));
 if(location.search.includes('stale')) throw new Error('Data berubah.');
 const receipt={id:request.requestId,removed_count:request.expectedCount,total_minor:14000,revision_after:6,created_at:'2026-09-17T15:00:00Z'};
 window.__preview={...window.__preview,count:0,canReset:false,receipts:[receipt]};
 if(location.search.includes('uncertain')) throw new Error('Connection interrupted');
 return {receiptId:request.requestId,removedCount:request.expectedCount};
};`;
const bundle = await build({
  stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{DeleteAllMutations}from'./features/payroll/components/delete-all-mutations';window.__requests=[];window.__loads=0;window.__preview={revision:5,count:2,totalMinor:14000,payrollReadyCount:0,closedCount:0,stockLinkedCount:0,paymentLinkedCount:0,locked:false,canReset:true,blockers:[],receipts:[]};createRoot(document.getElementById('root')).render(<DeleteAllMutations/>);`,resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'isolated-storage',setup(b){
    b.onResolve({filter:/^@\/features\/payroll\/lib\/workspace-store$|^@\/lib\/authenticatedFetch$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js'}));
  }}],
});
const server=createServer((request,response)=>{
  response.setHeader('Cache-Control','no-store');
  if(request.url==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);}
  else response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif}dialog{max-width:calc(100vw - 40px);max-height:90vh}button,input{padding:8px;margin:4px}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin);
  const open=page.getByRole('button',{name:'Hapus Semua Mutasi',exact:true});
  await open.waitFor();assert.equal(await page.evaluate(()=>window.__requests.length),0);
  await open.click();const modal=page.getByRole('dialog');await modal.waitFor();
  const confirm=modal.getByRole('button',{name:'Hapus 2 Mutasi',exact:true});
  await confirm.waitFor();assert.equal(await confirm.isDisabled(),true);
  await modal.getByRole('button',{name:'Batal',exact:true}).click();assert.equal(await page.evaluate(()=>window.__requests.length),0);
  await open.click();await confirm.waitFor();
  await page.locator('#mutation-reset-confirmation').fill('wrong phrase');
  await modal.getByRole('checkbox').check();assert.equal(await confirm.isDisabled(),true);
  await page.locator('#mutation-reset-confirmation').fill('HAPUS SEMUA MUTASI');
  await modal.getByRole('checkbox').uncheck();assert.equal(await confirm.isDisabled(),true);
  await modal.getByRole('checkbox').check();await confirm.click();
  await modal.getByText('2 mutasi berhasil dihapus.',{exact:true}).waitFor();
  const requests=await page.evaluate(()=>window.__requests);assert.equal(requests.length,1);assert.equal(requests[0].expectedCount,2);assert.equal(requests[0].expectedRevision,5);
  const downloadPromise=page.waitForEvent('download');await modal.getByRole('button',{name:'Unduh cadangan',exact:true}).click();
  assert.match((await downloadPromise).suggestedFilename(),/\.json\.gz$/);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: confirmation, cancel, exact count, backup download and no automatic deletion at width',width);
 }
 for(const mode of ['nonadmin','uncertain','stale','locked']){
  const context=await browser.newContext(),page=await context.newPage();await page.goto(origin+'/?'+mode);
  if(mode==='nonadmin'){await page.waitForFunction(()=>Array.isArray(window.__requests));assert.equal(await page.getByRole('button',{name:'Hapus Semua Mutasi',exact:true}).count(),0);}
  else{
   if(mode==='locked')await page.evaluate(()=>{window.__preview.canReset=false;window.__preview.blockers=['Payroll sedang dikunci.'];});
   await page.getByRole('button',{name:'Hapus Semua Mutasi',exact:true}).click();const modal=page.getByRole('dialog');
   const confirm=modal.getByRole('button',{name:'Hapus 2 Mutasi',exact:true});await confirm.waitFor();
   if(mode==='locked'){assert.equal(await confirm.isDisabled(),true);assert.equal(await page.evaluate(()=>window.__requests.length),0);}
   else{
    await page.locator('#mutation-reset-confirmation').fill('HAPUS SEMUA MUTASI');await modal.getByRole('checkbox').check();await confirm.click();
    if(mode==='uncertain'){await modal.getByText('2 mutasi berhasil dihapus.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__loads),1);}
    else {await modal.getByRole('button',{name:'Periksa ulang ringkasan'}).waitFor();assert.equal(await page.locator('#mutation-reset-confirmation').count(),0);}
    assert.equal(await page.evaluate(()=>window.__requests.length),1);
   }
  }
  await context.close();console.log('PASS:',mode);
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
