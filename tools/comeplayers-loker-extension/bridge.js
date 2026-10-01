'use strict';
// This bridge never receives a Supabase token or Facebook cookie.
const pending = new Map();
window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin || !event.data || event.data.source !== 'cp-loker-ui') return;
  const m = event.data;
  if (m.kind === 'preflight-result') { const done = pending.get(m.requestId); if (done) { pending.delete(m.requestId); done(m.allowed === true); } return; }
  if (m.kind !== 'command' || typeof m.requestId !== 'string' || !['ping','run','scan','stop'].includes(m.command)) return;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CP_LOKER', command: m.command, data: m.data });
    window.postMessage({ source: 'cp-loker-extension', kind: 'result', requestId: m.requestId, result }, location.origin);
  } catch { window.postMessage({ source: 'cp-loker-extension', kind: 'result', requestId: m.requestId, result: { error: 'Ekstensi terputus. Tugas tidak diulang otomatis.' } }, location.origin); }
});
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id || m?.type !== 'CP_LOKER_PREFLIGHT') return;
  const requestId = crypto.randomUUID();
  const timer = setTimeout(() => { pending.delete(requestId); respond({ allowed: false }); }, 8000);
  pending.set(requestId, allowed => { clearTimeout(timer); respond({ allowed }); });
  window.postMessage({ source: 'cp-loker-extension', kind: 'preflight', requestId, id: m.id, lease: m.lease }, location.origin);
  return true;
});
