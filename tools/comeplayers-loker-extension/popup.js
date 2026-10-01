'use strict';
async function act(action) {
  const el = document.getElementById('status');
  try { const r = await chrome.runtime.sendMessage({ type: 'CP_LOKER_POPUP', action }); el.textContent = r.error || (r.interrupted ? 'Tugas terputus. Periksa riwayat ComePlayers.' : r.attached ? 'Tab Facebook terhubung.' : 'Buka grup Facebook lalu hubungkan tab.'); }
  catch { el.textContent = 'Ekstensi belum siap. Muat ulang ekstensi.'; }
}
for (const name of ['attach','stop','clear']) document.getElementById(name).addEventListener('click',() => act(name));
document.getElementById('open').addEventListener('click',() => chrome.tabs.create({ url: 'https://www.comeplayers.com/admin/lowongan' }));
act('status');
