'use strict';
const cp = url => { try { const u = new URL(url); return ((u.protocol === 'https:' && !u.port && ['www.comeplayers.com','comeplayers.com'].includes(u.hostname)) || u.origin === 'http://localhost:3000') && !u.username && !u.password && /^\/admin\/lowongan\/?$/.test(u.pathname); } catch { return false; } };
const fb = url => { try { const u = new URL(url); return u.protocol === 'https:' && !u.port && ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(u.hostname) && /^\/groups\/[a-zA-Z0-9._-]+(?:\/(?:posts|permalink)\/\d+)?\/?$/.test(u.pathname) && !u.username && !u.password; } catch { return false; } };
let busy = false;
let cancelEpoch = 0;
let controllerTab = null;
async function cancelled(epoch) {
  return epoch !== cancelEpoch || (await chrome.storage.local.get('cancelled')).cancelled === true;
}
function terminal(status, stage, dispatched, note) {
  return { status, stage, dispatched, note: `[stage:${stage}] ${note}`.slice(0, 250) };
}
async function waitTab(id, epoch, verifying = false, expected = '') {
  const path = url => new URL(url).pathname.replace('/permalink/', '/posts/').replace(/\/$/, '');
  for (let i = 0; i < 80; i++) {
    if (!verifying && await cancelled(epoch)) return false;
    const t = await chrome.tabs.get(id);
    if (t.status === 'complete') {
      if (!fb(t.url)) throw new Error('Facebook meminta login/pemeriksaan keamanan atau tujuan tidak tersedia.');
      // A pending URL or the previous complete document is not the next target.
      if (!t.pendingUrl && (!expected || path(t.url) === path(expected))) {
        await new Promise(r => setTimeout(r, 300));
        const settled = await chrome.tabs.get(id);
        if (settled.status === 'complete' && !settled.pendingUrl && fb(settled.url) && (!expected || path(settled.url) === path(expected))) return verifying || !await cancelled(epoch);
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Halaman Facebook belum siap atau meminta login/pemeriksaan keamanan.');
}
async function status() {
  const s = await chrome.storage.local.get(['facebookTab','active','stopLatched']);
  let attached = false; if (s.facebookTab) { try { attached = fb((await chrome.tabs.get(s.facebookTab)).url); } catch { /* Closed tab. */ } }
  return { installed: true, version: chrome.runtime.getManifest().version, attached, busy, stopped: s.stopLatched === true, interrupted: !busy && s.active ? s.active : null };
}
async function requestAdminStop() {
  try {
    const { active } = await chrome.storage.local.get('active');
    const preferred = active?.controller || controllerTab;
    const tabs = await chrome.tabs.query({ url: ['https://www.comeplayers.com/admin/lowongan*','https://comeplayers.com/admin/lowongan*','http://localhost:3000/admin/lowongan*'] });
    const candidates = tabs.filter(tab => tab.id && cp(tab.url)).sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    for (const tab of candidates) {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'CP_LOKER_STOP_CAMPAIGN' }).catch(() => null);
      if (result?.handled === true) return true;
    }
  } catch { /* The persistent browser latch still prevents further sends. */ }
  return false;
}
async function resumeReviewed() {
  if (busy) return { resumed: false };
  const epoch = cancelEpoch;
  await chrome.storage.local.set({ stopLatched: false, cancelled: false });
  if (epoch !== cancelEpoch) { await chrome.storage.local.set({ stopLatched: true, cancelled: true }); return { resumed: false }; }
  return { resumed: true };
}
async function stop(notifyAdmin = false) {
  cancelEpoch++;
  const { facebookTab } = await chrome.storage.local.get('facebookTab');
  await chrome.storage.local.set({ cancelled: true, stopLatched: true });
  if (facebookTab) await chrome.tabs.sendMessage(facebookTab, { type: 'CP_LOKER_CANCEL' }).catch(() => undefined);
  return { stopped: true, adminStopRequested: notifyAdmin ? await requestAdminStop() : false };
}
async function scan(groups) {
  if (busy) throw new Error('Masih ada tugas browser yang berjalan.');
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 30) throw new Error('Masukkan 1–30 link grup.');
  const targets = [...new Set(groups.map(String))];
  if (targets.some(url => !fb(url) || /\/(?:posts|permalink)\//.test(new URL(url).pathname))) throw new Error('Daftar scan hanya boleh berisi link halaman grup.');
  const epoch = cancelEpoch;
  busy = true;
  const items = [];
  const seen = new Set();
  let groupsScanned = 0;
  try {
    const s = await chrome.storage.local.get(['facebookTab']);
    if (!s.facebookTab || !fb((await chrome.tabs.get(s.facebookTab)).url)) throw new Error('Hubungkan tab Facebook terlebih dahulu.');
    if (epoch !== cancelEpoch) return { items, groupsScanned, stopped: true };
    await chrome.storage.local.set({ cancelled: false });
    if (epoch !== cancelEpoch) { await chrome.storage.local.set({ cancelled: true }); return { items, groupsScanned, stopped: true }; }
    for (const group of targets) {
      if (await cancelled(epoch)) break;
      await chrome.tabs.update(s.facebookTab, { url: group, active: true });
      if (!await waitTab(s.facebookTab, epoch, false, group)) break;
      await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
      if (await cancelled(epoch)) break;
      const result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_SCAN_ALL', group });
      if (result?.error) throw new Error(String(result.error));
      groupsScanned++;
      for (const item of result?.items || []) {
        if (!item?.url || seen.has(item.url)) continue;
        seen.add(item.url);
        items.push({ url: item.url, preview: String(item.preview || '').slice(0, 220), group });
      }
    }
    return { items, groupsScanned, stopped: await cancelled(epoch) };
  } finally {
    busy = false;
  }
}
async function run(job, controller) {
  if (busy) throw new Error('Masih ada tugas browser yang berjalan.');
  if (!job || !fb(job.target) || !['group_post','group_scan','group_comment'].includes(job.kind) || typeof job.text !== 'string' || job.text.length > 9000 || typeof job.id !== 'string' || typeof job.lease !== 'string' || job.expiresAt <= Date.now()) throw new Error('Tugas browser tidak valid/kedaluwarsa.');
  if (job.banner && (!['image/png','image/jpeg','image/webp'].includes(job.banner.mime) || typeof job.banner.body !== 'string' || job.banner.body.length > 6990508)) throw new Error('Banner tidak valid.');
  const epoch = cancelEpoch;
  busy = true;
  let claimed = false;
  let stage = 'navigation_unavailable';
  try {
    const s = await chrome.storage.local.get(['facebookTab','active','stopLatched']);
    if (s.stopLatched === true) return terminal('cancelled', 'cancelled', false, 'STOP aktif. Tekan KIRIM KOMENTAR setelah memeriksa daftar untuk memulai batch baru.');
    if (s.active) throw new Error('Tugas sebelumnya terputus. Tandai perlu diperiksa sebelum menjalankan tugas lain.');
    if (!s.facebookTab || !fb((await chrome.tabs.get(s.facebookTab)).url)) throw new Error('Pilih tab Facebook melalui ikon ekstensi terlebih dahulu.');
    if (epoch !== cancelEpoch) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum tugas dimulai.');
    await chrome.storage.local.set({ active: { id: job.id, lease: job.lease, tab: s.facebookTab, controller, epoch, dispatchGranted: false }, cancelled: false });
    claimed = true;
    if (epoch !== cancelEpoch) await chrome.storage.local.set({ cancelled: true });
    if (await cancelled(epoch)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum navigasi.');
    let useExistingFeed = false;
    if (job.kind === 'group_comment' && job.payload?.adminSelected === true) {
      const tab = await chrome.tabs.get(s.facebookTab);
      const here = new URL(tab.url), wanted = new URL(job.target);
      const feedPath = wanted.pathname.replace(/\/(?:posts|permalink)\/\d+\/?$/, '').replace(/\/$/, '');
      if (tab.status === 'complete' && !tab.pendingUrl && fb(tab.url) && here.pathname.replace(/\/$/, '') === feedPath) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
          if (!await cancelled(epoch)) {
            const probe = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_PROBE_FEED', job });
            useExistingFeed = probe?.ready === true;
          }
        } catch { /* Unavailable or ambiguous feed falls back to the exact post URL. */ }
      }
    }
    if (await cancelled(epoch)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
    if (!useExistingFeed) {
      await chrome.tabs.update(s.facebookTab, { url: job.target, active: true });
      if (!await waitTab(s.facebookTab, epoch, false, job.target)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
    }
    stage = 'navigated';
    await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
    if (await cancelled(epoch)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
    let result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_RUN', job: { ...job, useExistingFeed } });
    if (result?.status === 'verify') {
      if (!fb(result.ref)) throw new Error('Bukti tujuan tidak valid.');
      if (result.ref === job.target) await chrome.tabs.reload(s.facebookTab);
      else await chrome.tabs.update(s.facebookTab, { url: result.ref });
      await new Promise(r => setTimeout(r, 800));
      // Verification must finish even if STOP arrives after a send.
      await waitTab(s.facebookTab, epoch, true, result.ref);
      await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
      result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_VERIFY', job, ref: result.ref });
    }
    if (!result || typeof result.status !== 'string') throw new Error('Browser tidak mengembalikan hasil tugas.');
    return result;
  } catch {
    const { active } = await chrome.storage.local.get('active');
    const granted = active?.id === job.id && active?.dispatchGranted === true;
    if (granted) return terminal('uncertain', 'browser_interrupted', true, 'Browser terputus setelah izin kirim. Periksa Facebook; tidak dikirim ulang.');
    if (await cancelled(epoch)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
    // A transport failure cannot send without the server preflight. Pause if the
    // browser context itself is unavailable; unsupported DOM is handled as skipped.
    return terminal('failed', stage === 'navigated' ? 'browser_interrupted' : stage, false, 'Browser tidak siap sebelum pengiriman. Periksa tab Facebook dan koneksi ekstensi.');
  } finally {
    if (claimed) await chrome.storage.local.remove('active');
    busy = false;
  }
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (m?.type === 'CP_LOKER_CHECK' && sender.tab) {
    (async () => {
      const s = await chrome.storage.local.get(['active','cancelled','stopLatched']); const a = s.active;
      if (!a || a.tab !== sender.tab.id || a.id !== m.id || a.lease !== m.lease || s.cancelled || s.stopLatched || a.epoch !== cancelEpoch) return { allowed: false };
      if (!m.dispatch) return { allowed: true };
      try {
        const result = await chrome.tabs.sendMessage(a.controller, { type: 'CP_LOKER_PREFLIGHT', id: a.id, lease: a.lease });
        const current = await chrome.storage.local.get(['active','cancelled']);
        if (current.active?.id !== a.id || current.active?.lease !== a.lease) return { allowed: false };
        if (result?.allowed === true) await chrome.storage.local.set({ active: { ...current.active, dispatchGranted: true } });
        if (current.cancelled || a.epoch !== cancelEpoch) return { allowed: false };
        return { allowed: result?.allowed === true };
      } catch { return { allowed: false }; }
    })().then(respond).catch(() => respond({ allowed: false }));
    return true;
  }
  if (m?.type === 'CP_LOKER' && sender.tab && cp(sender.url)) {
    controllerTab = sender.tab.id;
    const operation = m.command === 'ping' ? status() : m.command === 'stop' ? stop() : m.command === 'resume_reviewed' ? resumeReviewed() : m.command === 'scan' ? scan(m.data?.groups) : m.command === 'run' ? run(m.data, sender.tab.id) : Promise.reject(new Error('Perintah tidak didukung.'));
    operation.then(respond).catch(e => respond({ error: e.message })); return true;
  }
  if (m?.type === 'CP_LOKER_POPUP' && !sender.tab && sender.url === chrome.runtime.getURL('popup.html')) {
    (async () => {
      if (m.action === 'attach') { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !fb(tab.url)) throw new Error('Buka tab grup Facebook yang sudah login, lalu tekan Hubungkan.'); await chrome.storage.local.set({ facebookTab: tab.id }); }
      if (m.action === 'stop') await stop(true);
      if (m.action === 'clear') { await stop(); if (busy) throw new Error('Tunggu tugas aktif selesai.'); await chrome.storage.local.remove('active'); }
      return status();
    })().then(respond).catch(e => respond({ error: e.message })); return true;
  }
});
chrome.runtime.onStartup.addListener(() => { void chrome.storage.local.set({ cancelled: true, stopLatched: true }); });
