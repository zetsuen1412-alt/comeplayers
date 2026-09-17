/** Isolated browser fixtures: no production hosts, credentials, database writes or real payments. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = process.cwd();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-admin-id-'));
const stubs = {
  'next/navigation': 'export const usePathname = () => window.location.pathname;',
  'next/link': 'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',
  'next/image': 'import React from "react";export default function Image({priority,preload,unoptimized,...props}){return React.createElement("img",props)}',
  '@/lib/supabase': 'export const supabase={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};',
  '@/components/CurrencyProvider': 'export const useCurrency=()=>({currency:"IDR",locale:"en-US",setPreferences(){},formatIdrPrice:v=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR"}).format(Number(v)),formatIdrAmount:v=>Number(v).toLocaleString("id-ID")});',
  '@/lib/authenticatedFetch': `
    const overview={profile:{username:"Admin Uji"},snapshotAt:"2026-09-17T09:00:00Z",ledgerCurrency:"IDR",metrics:{users:0,products:0,orders:0,completedOrders:0,paidOrders:0,pendingSellerApplications:0,activeDisputes:0,pendingWithdrawals:0,topupsForReview:0,manualTopupsPending:0,supportQueue:0,grossVolume:0,feeRevenue:0,walletBalance:0,walletCount:0},recentOrders:[]};
    const run={id:"fixture-run",scope_key:"financial:30d",source:"cron",status:"completed",scanned_count:23,issue_count:0,critical_count:0,summary:{},error_message:null,started_at:"2026-09-17T09:00:00Z",completed_at:"2026-09-17T09:00:01Z"};
    export async function authenticatedFetchJson(url,init={}){
      window.__requests ??= [];window.__requests.push({url,method:init.method||"GET",body:init.body?JSON.parse(init.body):null});
      if(window.location.search.includes("denied"))throw new Error("Admin access required.");
      if(url==="/api/admin/overview")return overview;
      if(url.startsWith("/api/admin/reconciliation")){if(init.method==="POST")return {run,automaticallyResolved:0};return {runs:[run],issues:[]};}
      if(url.startsWith("/api/admin/orders"))return {orders:[],total:0,page:1,pageSize:25};
      if(url==="/api/admin/wallet-payments")return {payments:[{id:"fixture-payment",user_id:"fixture-user",provider:"paypal",status:"credited",amount_idr:15000,charge_currency:"USD",charge_amount:1,provider_order_id:"fixture-provider",provider_capture_id:null,created_at:"2026-09-17T09:00:00Z",review_reason:null}]};
      throw new Error("Unexpected fixture URL: "+url);
    }
  `,
};

test('Indonesian admin renders on desktop/mobile and preserves submitted filter values', { timeout: 120_000 }, async () => {
  let browser, server;
  try {
    await build({
      stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import AdminWorkspace from './components/admin/AdminWorkspace';import Reconciliation from './app/admin/reconciliation/page';import AdminOrders from './components/admin/AdminOrders';import Payments from './components/wallet/AdminWalletPayments';const page=location.pathname.includes('orders')?<AdminOrders/>:location.pathname.includes('wallet')?<Payments/>:<Reconciliation/>;createRoot(document.getElementById('root')).render(<AdminWorkspace>{page}</AdminWorkspace>);`, resolveDir: root, loader: 'tsx' },
      bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'isolated-admin-dependencies', setup(api) {
        api.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'admin-fixture' } : undefined);
        api.onLoad({ filter: /.*/, namespace: 'admin-fixture' }, args => ({ contents: stubs[args.path], loader: 'js', resolveDir: root }));
        api.onResolve({ filter: /^@\// }, args => ({ path: path.resolve(root, args.path.slice(2) + (path.extname(args.path) ? '' : fs.existsSync(path.resolve(root,args.path.slice(2)+'.tsx')) ? '.tsx' : '.ts')) }));
      }}],
    });
    server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      if(url.pathname==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(path.join(output,'app.js')));return;}
      if(url.pathname==='/admin.css'){response.setHeader('Content-Type','text/css');response.end(fs.readFileSync(path.join(root,'app/admin/admin.css')));return;}
      if(url.pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
      if(url.pathname.startsWith('/brand/')){const asset=path.join(root,'public',url.pathname);if(fs.existsSync(asset)){response.setHeader('Content-Type','image/png');response.end(fs.readFileSync(asset));}else{response.writeHead(204);response.end();}return;}
      response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin.css"><style>body{margin:0}img{max-width:100%}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const exceptions=[];page.on('pageerror',error=>exceptions.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/admin/reconciliation');
    await page.getByRole('heading',{name:'Rekonsiliasi Keuangan'}).waitFor();
    assert.equal(await page.locator('.admin-workspace').getAttribute('lang'),'id');
    assert.equal(await page.locator('.adm-brand img').getAttribute('src'),'/brand/comeplayers-cp-v7-transparent.png');
    assert.ok((await page.locator('body').innerText()).includes('Tidak ada temuan berstatus terbuka'));
    assert.ok((await page.locator('body').innerText()).includes('Selesai'));
    const status=page.locator('select').filter({has:page.locator('option[value="resolved"]')});
    await status.selectOption('resolved');
    await page.waitForFunction(()=>window.__requests.some(r=>r.url.includes('status=resolved')));
    assert.equal(await status.inputValue(),'resolved');
    await page.getByRole('button',{name:'Jalankan Pemeriksaan',exact:true}).click();
    await page.waitForFunction(()=>window.__requests.some(r=>r.method==='POST'&&r.body?.days===30));
    await page.screenshot({path:path.join(output,'reconciliation-desktop.png'),fullPage:true});
    await page.goto(origin+'/admin/orders');
    const filter=page.getByLabel('Saring status pesanan');await filter.waitFor();await filter.selectOption('processing');
    await page.waitForFunction(()=>window.__requests.some(r=>r.url.includes('status=processing')));
    assert.equal(await filter.locator('option:checked').innerText(),'Dibayar / diproses');
    await page.goto(origin+'/admin/wallet');
    const paymentFilter=page.getByLabel('Status pembayaran');await paymentFilter.selectOption('credited');
    assert.equal(await paymentFilter.inputValue(),'credited');assert.equal(await paymentFilter.locator('option:checked').innerText(),'Saldo ditambahkan');
    await page.setViewportSize({width:390,height:844});await page.goto(origin+'/admin/reconciliation');
    await page.getByRole('button',{name:'Buka navigasi',exact:true}).click();
    assert.equal(await page.getByRole('dialog',{name:'Navigasi admin'}).isVisible(),true);
    await page.screenshot({path:path.join(output,'navigation-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Tutup navigasi',exact:true}).click();
    await page.goto(origin+'/admin/reconciliation?denied');
    await page.getByRole('heading',{name:'Akses administrator',exact:true}).waitFor();
    assert.equal(await page.getByText('Akses admin diperlukan.',{exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('heading',{name:'Rekonsiliasi Keuangan'}).count(),0);
    assert.deepEqual(exceptions,[]);
    fs.mkdirSync('test-results/admin-locale',{recursive:true});
    for(const file of ['reconciliation-desktop.png','navigation-mobile.png'])fs.copyFileSync(path.join(output,file),path.join('test-results/admin-locale',file));
  } finally {
    if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(output,{recursive:true,force:true});
  }
});
