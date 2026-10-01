'use strict';
const cp = url => { try { const u = new URL(url); return ((u.protocol === 'https:' && ['www.comeplayers.com','comeplayers.com'].includes(u.hostname)) || u.origin === 'http://localhost:3000') && /^\/admin\/lowongan\/?$/.test(u.pathname); } catch { return false; } };
const fb = url => { try { const u = new URL(url); return u.protocol === 'https:' && ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(u.hostname) && /^\/groups\/[a-zA-Z0-9._-]+(?:\/(?:posts|permalink)\/\d+)?\/?$/.test(u.pathname) && !u.username && !u.password; } catch { return false; } };
let busy = false;
async function waitTab(id) {
  for (let i = 0; i < 80; i++) { const t = await chrome.tabs.get(id); if (t.status === 'complete' && fb(t.url)) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Halaman Facebook belum siap atau meminta login/pemeriksaan keamanan.');
}
async function status() {
  const s = await chrome.storage.local.get(['facebookTab','active']);
  let attached = false; if (s.facebookTab) { try { attached = fb((await chrome.tabs.get(s.facebookTab)).url); } catch { /* Closed tab. */ } }
  return { installed: true, attached, busy, interrupted: !busy && s.active ? s.active : null };
}
async function stop() {
  const { facebookTab } = await chrome.storage.local.get('facebookTab');
  await chrome.storage.local.set({ cancelled: true });
  if (facebookTab) await chrome.tabs.sendMessage(facebookTab, { type: 'CP_LOKER_CANCEL' }).catch(() => undefined);
  return { stopped: true };
}
async function run(job, controller) {
  if (busy) throw new Error('Masih ada tugas browser yang berjalan.');
  const s = await chrome.storage.local.get(['facebookTab','active']);
  if (s.active) throw new Error('Tugas sebelumnya terputus. Tandai perlu diperiksa sebelum menjalankan tugas lain.');
  if (!s.facebookTab || !fb((await chrome.tabs.get(s.facebookTab)).url)) throw new Error('Pilih tab Facebook melalui ikon ekstensi terlebih dahulu.');
  if (!job || !fb(job.target) || !['group_post','group_scan','group_comment'].includes(job.kind) || typeof job.text !== 'string' || job.text.length > 9000 || typeof job.id !== 'string' || typeof job.lease !== 'string' || job.expiresAt <= Date.now()) throw new Error('Tugas browser tidak valid/kedaluwarsa.');
  if (job.banner && (!['image/png','image/jpeg','image/webp'].includes(job.banner.mime) || typeof job.banner.body !== 'string' || job.banner.body.length > 2796204)) throw new Error('Banner tidak valid.');
  busy = true;
  await chrome.storage.local.set({ active: { id: job.id, lease: job.lease, tab: s.facebookTab, controller }, cancelled: false });
  try {
    await chrome.tabs.update(s.facebookTab, { url: job.target, active: true }); await waitTab(s.facebookTab);
    await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
    let result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_RUN', job });
    if (result?.status === 'verify') {
      if (!fb(result.ref)) throw new Error('Bukti tujuan tidak valid.');
      if (result.ref === job.target) await chrome.tabs.reload(s.facebookTab);
      else await chrome.tabs.update(s.facebookTab, { url: result.ref });
      await new Promise(r => setTimeout(r, 800)); await waitTab(s.facebookTab);
      await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
      result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_VERIFY', job, ref: result.ref });
    }
    return result;
  } catch (e) { return { status: 'uncertain', note: e instanceof Error ? e.message : 'Browser terputus; periksa kiriman.' }; }
  finally { busy = false; await chrome.storage.local.remove('active'); }
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (m?.type === 'CP_LOKER_CHECK' && sender.tab) {
    (async () => {
      const s = await chrome.storage.local.get(['active','cancelled']); const a = s.active;
      if (!a || a.tab !== sender.tab.id || a.id !== m.id || a.lease !== m.lease || s.cancelled) return { allowed: false };
      if (!m.dispatch) return { allowed: true };
      try { return await chrome.tabs.sendMessage(a.controller, { type: 'CP_LOKER_PREFLIGHT', id: a.id, lease: a.lease }); } catch { return { allowed: false }; }
    })().then(respond).catch(() => respond({ allowed: false }));
    return true;
  }
  if (m?.type === 'CP_LOKER' && sender.tab && cp(sender.url)) {
    const operation = m.command === 'ping' ? status() : m.command === 'stop' ? stop() : m.command === 'run' ? run(m.data, sender.tab.id) : Promise.reject(new Error('Perintah tidak didukung.'));
    operation.then(respond).catch(e => respond({ error: e.message })); return true;
  }
  if (m?.type === 'CP_LOKER_POPUP' && !sender.tab && sender.url === chrome.runtime.getURL('popup.html')) {
    (async () => {
      if (m.action === 'attach') { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !fb(tab.url)) throw new Error('Buka tab grup Facebook yang sudah login, lalu tekan Hubungkan.'); await chrome.storage.local.set({ facebookTab: tab.id }); }
      if (m.action === 'stop') await stop();
      if (m.action === 'clear') { await stop(); if (busy) throw new Error('Tunggu tugas aktif selesai.'); await chrome.storage.local.remove('active'); }
      return status();
    })().then(respond).catch(e => respond({ error: e.message })); return true;
  }
});
chrome.runtime.onStartup.addListener(() => { void chrome.storage.local.set({ cancelled: true }); });
