import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

// Bundle the real entry form; stub storage hooks only. No real accounts,
// credentials, or production writes are used by this browser fixture.
const root = fileURLToPath(new URL('../', import.meta.url));
const mocked = new Set([
  '@/features/payroll/lib/workspace-store', '@/features/payroll/lib/demo-order-store',
  '@/features/payroll/lib/demo-employee-store', '@/features/payroll/lib/demo-product-store',
  '@/features/payroll/lib/demo-inventory-store', '@/lib/authenticatedFetch', '@/lib/adminLocale',
]);
const result = await build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { OrderEntryForm } from './features/payroll/components/order-entry-form'; createRoot(document.getElementById('root')).render(<OrderEntryForm />);`, loader: 'tsx', resolveDir: root },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-payroll-storage', setup(plugin) {
    plugin.onResolve({ filter: /^@\// }, args => mocked.has(args.path) ? { path: 'state', namespace: 'fixture' } : undefined);
    plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', resolveDir: root, contents: args.path === 'link' ? `import React from 'react'; export default function Link(props) { return <a {...props} />; }` : `
      window.__orders = []; window.__reservations = []; window.__flushCount = 0;
      const employees = [{ id: 'emp-test', code: 'EMP-TEST', name: 'Karyawan Uji', team: 'FH2', workforceStatus: 'FULL', utilization: 0, earningsMinor: 0 }];
      const games = [{ id: 'game-test', code: 'TEST', name: 'Permainan Uji', regions: [{ name: 'EU', servers: ['EU'] }], active: true }];
      export const useDemoEmployees = () => ({ employees });
      export const useDemoProductGames = () => ({ games });
      export const useDemoOrders = () => ({ allOrders: window.__orders, addOrder(order) { window.__orders.push(structuredClone(order)); } });
      export const useDemoInventory = () => ({ inventory: [], reserveAllocations(rows) { window.__reservations.push(rows); return { ok: true }; } });
      export const withPayrollBatch = (fn) => fn();
      export const flushPayroll = async () => { window.__flushCount++; if (window.__holdSave) await new Promise(resolve => { window.__releaseSave = resolve; }); };
      export const authenticatedFetch = () => { throw new Error('Unexpected server-clock dependency'); };
      export const adminLabel = (value) => value;
    ` }));
  } }],
});
const script = result.outputFiles[0].text;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? script : '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  for (const [timezoneId, viewport] of [['Asia/Jakarta', { width: 1440, height: 1000 }], ['America/Los_Angeles', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ timezoneId, viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      if (!route.request().url().startsWith(url)) { unexpected.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.clock.install({ time: new Date('2026-09-17T14:00:00.000Z') });
    await page.goto(url);
    const date = page.locator('#payroll-order-datetime');
    const employeeSelect = page.locator('select').filter({ has: page.locator('option[value="emp-test"]') });
    const typeSelect = page.locator('select').filter({ has: page.locator('option[value="boosting"]') });
    await expect(date).toHaveValue('2026-09-17T21:00');
    await expect(date).toBeEditable();
    await date.fill('2026-09-08T04:05');
    await expect(page.locator('#payroll-order-datetime-preview')).toContainText('Selasa');
    await page.clock.fastForward('02:00');
    await expect(date).toHaveValue('2026-09-08T04:05');
    await page.getByRole('button', { name: 'Gunakan waktu sekarang' }).click();
    await expect(date).toHaveValue('2026-09-17T21:02');
    async function fillOrder(code) {
      await page.getByLabel('Kode pesanan manual').fill(code);
      await page.getByLabel('Nama pembeli', { exact: true }).fill('Pembeli Uji');
      await page.getByPlaceholder('Ketik nama permainan, lalu pilih rekomendasi').fill('Permainan Uji');
      await page.getByRole('button', { name: /Permainan Uji/ }).click();
      await employeeSelect.selectOption('emp-test');
      await page.getByLabel('Tarif / harga per unit').fill('10000');
    }
    await fillOrder('TEST-MANUAL-1');
    await page.getByLabel('Nama pesanan', { exact: true }).fill('Pesanan historis');
    await date.fill('');
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.locator('form').dispatchEvent('submit');
    assert.equal(await page.evaluate(() => window.__orders.length), 0);
    await expect(page.locator('#payroll-order-datetime-preview')).toContainText('wajib diisi');
    await date.fill('2026-09-08T04:05');
    await page.evaluate(() => { window.__holdSave = true; });
    await page.locator('button[type="submit"]').click();
    await expect(date).toBeDisabled();
    const saved = await page.evaluate(() => window.__orders[0]);
    assert.equal(saved.orderedAt, '2026-09-07T21:05:00.000Z');
    assert.equal(saved.dueAt, '2026-09-08T21:05:00.000Z');
    assert.equal(saved.grossMinor, 10000);
    assert.equal(saved.operationalStatus, 'assigned');
    assert.equal(saved.payrollClosedAt, undefined);
    await page.evaluate(() => { window.__holdSave = false; window.__releaseSave(); });
    await expect(date).toBeEditable();
    await expect(date).toHaveValue('2026-09-08T04:05');
    await expect(page.getByText(/berhasil disimpan dengan 1 karyawan/)).toBeVisible();
    assert.equal(await page.evaluate(() => window.__flushCount), 1);
    assert.equal(await page.evaluate(() => window.__reservations.length), 0);
    await typeSelect.selectOption('gold');
    await fillOrder('TEST-GOLD-2');
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expect(page.locator('button[type="submit"]')).toHaveText('Periksa Stok Sebelum Simpan');
    await page.locator('form').dispatchEvent('submit');
    await expect(page.getByText('Pilih stok gudang untuk pesanan Gold.')).toBeVisible();
    assert.equal(await page.evaluate(() => window.__orders.length), 1);
    assert.equal(await page.evaluate(() => window.__reservations.length), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(`PASS ${timezoneId}: manual historical date, weekday, two-minute stability, explicit now, empty rejection, submitted UTC value, due date, preserved selection, stock gate, no server-clock request`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
