'use strict';
// This bridge never receives a Supabase token or Facebook cookie.
const pending = new Map();
let reviewedResume = false;
let approvalEpoch = 0;
document.addEventListener('click', event => {
  if (!event.isTrusted) return;
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button || button.disabled) return;
  const text = button.textContent.replace(/\s+/g, ' ').trim();
  if (/^KIRIM KOMENTAR \([1-9]\d*\)$/.test(text)) { reviewedResume = true; approvalEpoch++; }
  if (text === 'STOP') { reviewedResume = false; approvalEpoch++; }
}, true);
window.addEventListener('message', async event => {
  if (event.source !== window || event.origin !== location.origin || !event.data || event.data.source !== 'cp-loker-ui') return;
  const m = event.data;
  if (m.kind === 'preflight-result') { const done = pending.get(m.requestId); if (done) { pending.delete(m.requestId); done(m.allowed === true); } return; }
  if (m.kind !== 'command' || typeof m.requestId !== 'string' || !['ping','run','scan','stop','resume_reviewed'].includes(m.command)) return;
  try {
    // Older production Admin builds do not send resume_reviewed. A real review
    // click permits one unlatch immediately before their first browser task.
    if (m.command === 'run' && reviewedResume) {
      const approved = approvalEpoch;
      const resumed = await chrome.runtime.sendMessage({ type: 'CP_LOKER', command: 'resume_reviewed' });
      if (!resumed?.resumed || approved !== approvalEpoch || !reviewedResume) {
        window.postMessage({ source: 'cp-loker-extension', kind: 'result', requestId: m.requestId, result: { status: 'cancelled', stage: 'cancelled', dispatched: false, note: '[stage:cancelled] STOP aktif sebelum batch dimulai.' } }, location.origin);
        return;
      }
      reviewedResume = false;
    }
    const result = await chrome.runtime.sendMessage({ type: 'CP_LOKER', command: m.command, data: m.data });
    window.postMessage({ source: 'cp-loker-extension', kind: 'result', requestId: m.requestId, result }, location.origin);
  } catch { window.postMessage({ source: 'cp-loker-extension', kind: 'result', requestId: m.requestId, result: { error: 'Ekstensi terputus. Tugas tidak diulang otomatis.' } }, location.origin); }
});
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (m?.type === 'CP_LOKER_STOP_CAMPAIGN') {
    reviewedResume = false; approvalEpoch++;
    // Use the authenticated page's existing STOP handler; the bridge never
    // reads auth tokens. This also supports the pre-deployment Admin build.
    const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'STOP' && !el.disabled && el.getClientRects().length);
    if (button) button.click();
    respond({ handled: !!button });
    return;
  }
  if (m?.type !== 'CP_LOKER_PREFLIGHT') return;
  const requestId = crypto.randomUUID();
  const timer = setTimeout(() => { pending.delete(requestId); respond({ allowed: false }); }, 8000);
  pending.set(requestId, allowed => { clearTimeout(timer); respond({ allowed }); });
  window.postMessage({ source: 'cp-loker-extension', kind: 'preflight', requestId, id: m.id, lease: m.lease }, location.origin);
  return true;
});
