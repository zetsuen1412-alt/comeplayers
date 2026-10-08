'use strict';
async function act(action) {
  const el = document.getElementById('status');
  try { const r = await chrome.runtime.sendMessage({ type: 'CP_LOKER_POPUP', action }); el.textContent = r.error || (r.interrupted ? 'Tugas terputus. Periksa riwayat ComePlayers.' : r.stopped ? 'STOP aktif. Periksa riwayat lalu tekan KIRIM KOMENTAR di Admin untuk batch baru.' : r.attached ? 'Tab Facebook terhubung.' : 'Buka grup Facebook lalu hubungkan tab.'); }
  catch { el.textContent = 'Ekstensi belum siap. Muat ulang ekstensi.'; }
}
for (const name of ['attach','stop','clear']) document.getElementById(name).addEventListener('click',() => act(name));
document.getElementById('diagnose').addEventListener('click', async () => {
  const button = document.getElementById('diagnose'), output = document.getElementById('diagnostic');
  button.disabled = true; output.hidden = false; output.textContent = 'Memeriksa struktur halaman…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CP_LOKER_POPUP', action: 'diagnose' });
    output.textContent = result.error || JSON.stringify(result.diagnostic, null, 2);
  } catch { output.textContent = 'Ekstensi terputus. Muat ulang ekstensi lalu coba lagi.'; }
  finally { button.disabled = false; }
});
document.getElementById('open').addEventListener('click', async () => {
  const target = 'https://www.comeplayers.com/admin/lowongan';
  const tabs = await chrome.tabs.query({ url: ['https://www.comeplayers.com/*', 'https://comeplayers.com/*'] });
  const existing = tabs.find(tab => tab.url?.startsWith('https://www.comeplayers.com/')) || tabs[0];
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { url: target, active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: target });
});
act('status');
