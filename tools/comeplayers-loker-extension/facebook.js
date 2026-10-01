(() => {
  'use strict';
  if (globalThis.__cpLokerInstalled) return;
  globalThis.__cpLokerInstalled = true;
  let cancelled = false;
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim();
  const visible = el => el instanceof HTMLElement && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const label = el => norm(el.getAttribute('aria-label') || el.textContent);
  const buttons = root => [...root.querySelectorAll('button,[role="button"]')].filter(visible);
  const articles = () => [...document.querySelectorAll('[role="article"]')].filter(a => !a.parentElement?.closest('[role="article"]'));
  const story = a => a.querySelector('[data-ad-preview="message"],[data-ad-comet-preview="message"],[data-ad-rendering-role="story_message"]');
  const seeker = t => /\b(cari kerja|mencari (kerja|pekerjaan)|butuh (kerja|pekerjaan)|info loker|loker dong|ada loker)\b/i.test(t) && !/\b(kami membuka|dibutuhkan|open recruitment|lowongan tersedia|sedang membuka|membuka lowongan)\b/i.test(t);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function target(url) { try { const u = new URL(url, location.href); if (!['www.facebook.com','web.facebook.com','m.facebook.com'].includes(u.hostname) || u.protocol !== 'https:') return null; const m = u.pathname.match(/^\/groups\/([a-zA-Z0-9._-]+)(?:\/(?:posts|permalink)\/(\d+))?\/?$/); return m ? { group: m[1], post: m[2] || '', url: `https://www.facebook.com/groups/${m[1]}${m[2] ? `/posts/${m[2]}` : ''}/` } : null; } catch { return null; } }
  function check(job) {
    const here = target(location.href), wanted = target(job.target);
    if (cancelled || Date.now() > job.expiresAt) throw new Error('Dihentikan atau tugas kedaluwarsa.');
    if (!here || !wanted || here.group !== wanted.group || (wanted.post && wanted.post !== here.post)) throw new Error('Halaman bukan tujuan tugas.');
    if (/checkpoint|captcha|login/.test(location.pathname) || [...document.querySelectorAll('[role="alert"],[role="dialog"]')].some(e => /temporarily blocked|dibatasi sementara|confirm your identity|konfirmasi identitas|security check|pemeriksaan keamanan/i.test(e.textContent))) throw new Error('Facebook meminta pemeriksaan keamanan/pembatasan.');
  }
  async function until(job, fn, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { check(job); const value = fn(); if (value) return value; await sleep(300); }
    throw new Error('Elemen Facebook belum siap atau tampilannya berubah. Tidak dikirim ulang.');
  }
  async function dispatch(job) {
    check(job);
    const reply = await chrome.runtime.sendMessage({ type: 'CP_LOKER_CHECK', id: job.id, lease: job.lease, dispatch: true });
    check(job); if (!reply?.allowed) throw new Error('START tidak aktif, admin terputus, atau tugas sudah pernah dikirim.');
  }
  function fill(editor, text) {
    editor.focus(); const selection = getSelection(); const range = document.createRange(); range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
    if (!document.execCommand('insertText', false, text) || norm(editor.innerText) !== norm(text)) throw new Error('Editor Facebook tidak menerima teks.');
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
  async function attach(job, root) {
    if (!job.banner) return;
    const before = new Set([...root.querySelectorAll('img')].map(i => i.src));
    let inputs = [...root.querySelectorAll('input[type="file"]')].filter(e => /image/.test(e.accept));
    if (inputs.length !== 1) {
      const photo = buttons(root).filter(b => /^(foto\/video|photo\/video|tambahkan foto|add photo)/i.test(label(b)));
      if (photo.length === 1) photo[0].click();
      inputs = await until(job, () => { const all = [...root.querySelectorAll('input[type="file"]')].filter(e => /image/.test(e.accept)); return all.length === 1 ? all : null; },5000);
    }
    const raw = atob(job.banner.body); const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], `lowongan.${job.banner.mime.split('/')[1]}`, { type: job.banner.mime }));
    inputs[0].files = dt.files; inputs[0].dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await until(job, () => [...root.querySelectorAll('img')].some(i => !before.has(i.src) && i.complete && i.naturalWidth > 0) && !root.querySelector('[role="progressbar"]'),25000);
    await sleep(1500);
  }
  const sameText = (root, text) => [...root.querySelectorAll('[dir="auto"]')].some(e => !e.closest('[contenteditable="true"]') && norm(e.textContent) === norm(text));
  function evidence(job) {
    for (const a of articles()) {
      if (!sameText(a,job.text)) continue;
      for (const link of a.querySelectorAll('a[href]')) { const t = target(link.href); if (t?.post && t.group === target(job.target).group) return t.url; }
    }
    return null;
  }
  async function run(job) {
    cancelled = false; check(job);
    if (job.kind === 'group_scan') {
      await dispatch(job); const found = new Set();
      for (let i = 0; i < 4 && found.size < 3; i++) {
        check(job);
        for (const a of articles()) {
          const message = story(a); if (!message || !seeker(message.textContent || '')) continue;
          for (const link of a.querySelectorAll('a[href]')) { const p = target(link.href); if (p?.post && p.group === target(job.target).group) { found.add(p.url); break; } }
        }
        if (found.size < 3) { window.scrollBy(0, innerHeight * .8); await sleep(1200); }
      }
      return { status: 'skipped', discovered: [...found].slice(0,3), note: `${found.size} postingan pencari kerja relevan ditemukan; isi postingan tidak disimpan.` };
    }
    if (job.kind === 'group_post') {
      if (evidence(job)) return { status: 'skipped', note: 'Materi yang sama sudah terlihat. Tidak dikirim ulang.' };
      const open = await until(job, () => { const list = buttons(document).filter(b => /^(tulis sesuatu|write something|apa yang anda pikirkan|what.s on your mind)/i.test(label(b))); return list.length === 1 ? list[0] : null; });
      open.click();
      const dialog = await until(job, () => { const ds = [...document.querySelectorAll('[role="dialog"]')].filter(d => visible(d) && /buat postingan|create post/i.test(d.textContent || d.getAttribute('aria-label') || '')); return ds.length === 1 ? ds[0] : null; });
      const editor = await until(job, () => { const e = [...dialog.querySelectorAll('[contenteditable="true"][role="textbox"]')].filter(visible); return e.length === 1 ? e[0] : null; });
      fill(editor,job.text); await attach(job,dialog);
      const send = await until(job, () => { const bs = buttons(dialog).filter(b => /^(posting|post|kirim)$/i.test(label(b)) && b.getAttribute('aria-disabled') !== 'true' && !b.disabled); return bs.length === 1 ? bs[0] : null; });
      await dispatch(job); send.click(); await sleep(2500);
      const pending = [...document.querySelectorAll('[role="alert"]')].some(e => /menunggu persetujuan|pending approval|submitted.*approval/i.test(e.textContent));
      if (pending) return { status: 'pending', note: 'Facebook menampilkan status menunggu persetujuan admin grup.' };
      const ref = await until(job, () => !visible(dialog) && evidence(job),20000);
      return { status: 'verify', ref };
    }
    if (job.kind === 'group_comment') {
      const article = await until(job, () => { const roots = articles().filter(a => story(a) && seeker(story(a).textContent || '')); return roots.length === 1 ? roots[0] : null; });
      if (sameText(article,job.text)) return { status: 'skipped', note: 'Komentar yang sama sudah terlihat.' };
      const editor = await until(job, () => { const e = [...article.querySelectorAll('[contenteditable="true"][role="textbox"]')].filter(el => visible(el) && el.closest('[role="article"]') === article && /komentar|comment/i.test(label(el)) && !/balas|reply/i.test(label(el))); return e.length === 1 ? e[0] : null; });
      fill(editor,job.text);
      let scope = editor.parentElement;
      for (let i = 0; i < 4 && scope && scope !== article; i++, scope = scope.parentElement) {
        const sends = buttons(scope).filter(b => /^(kirim|send|kirim komentar|post comment|comment|komentari)$/i.test(label(b)) && b.getAttribute('aria-disabled') !== 'true' && !b.disabled);
        if (sends.length === 1) {
          await attach(job,scope); await dispatch(job); sends[0].click(); await sleep(3000);
          await until(job, () => !norm(editor.innerText) && sameText(article,job.text),12000);
          return { status: 'verify', ref: target(job.target).url };
        }
      }
      throw new Error('Tombol kirim komentar tidak teridentifikasi. Enter sintetis tidak dianggap berhasil.');
    }
    throw new Error('Jenis tugas tidak didukung.');
  }
  async function verify(job, ref) {
    check(job);
    await until(job, () => document.readyState === 'complete' && articles().some(a => sameText(a,job.text)),20000);
    return { status: 'sent', ref, note: 'Teks terlihat kembali setelah halaman Facebook dimuat ulang.' };
  }
  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (m?.type === 'CP_LOKER_CANCEL') { cancelled = true; respond({ stopped: true }); return; }
    if (!['CP_LOKER_RUN','CP_LOKER_VERIFY'].includes(m?.type)) return;
    const job = m.job;
    const pulse = setInterval(() => { chrome.runtime.sendMessage({ type: 'CP_LOKER_CHECK', id: job.id, lease: job.lease }).then(r => { if (!r?.allowed) cancelled = true; }).catch(() => { cancelled = true; }); },5000);
    (m.type === 'CP_LOKER_RUN' ? run(job) : verify(job,m.ref)).then(respond).catch(e => respond({ status: 'uncertain', note: e.message })).finally(() => clearInterval(pulse));
    return true;
  });
})();
