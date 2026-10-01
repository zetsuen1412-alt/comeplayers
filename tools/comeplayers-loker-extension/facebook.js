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
  const seeker = t => /\b(cari kerja|mencari (kerja|pekerjaan)|butuh (kerja|pekerjaan)|info loker|loker dong|ada loker|butuh loker|mau kerja)\b/i.test(t)
    && !/\b(kami membuka|dibutuhkan|open recruitment|lowongan tersedia|sedang membuka|membuka lowongan|hiring)\b/i.test(t);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function target(url) {
    try {
      const u = new URL(url, location.href);
      if (!['www.facebook.com','web.facebook.com','m.facebook.com'].includes(u.hostname) || u.protocol !== 'https:') return null;
      const m = u.pathname.match(/^\/groups\/([a-zA-Z0-9._-]+)(?:\/(?:posts|permalink)\/(\d+))?\/?$/);
      return m ? { group: m[1], post: m[2] || '', url: `https://www.facebook.com/groups/${m[1]}${m[2] ? `/posts/${m[2]}` : ''}/` } : null;
    } catch { return null; }
  }

  function check(job) {
    const here = target(location.href), wanted = target(job.target);
    if (cancelled || Date.now() > job.expiresAt) throw new Error('Dihentikan atau tugas kedaluwarsa.');
    if (!here || !wanted || here.group !== wanted.group || (wanted.post && wanted.post !== here.post)) throw new Error('Halaman bukan tujuan tugas.');
    if (/checkpoint|captcha|login/.test(location.pathname) || [...document.querySelectorAll('[role="alert"],[role="dialog"]')].some(e => /temporarily blocked|dibatasi sementara|confirm your identity|konfirmasi identitas|security check|pemeriksaan keamanan/i.test(e.textContent))) {
      throw new Error('Facebook meminta pemeriksaan keamanan/pembatasan.');
    }
  }

  async function until(job, fn, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      check(job);
      const value = fn();
      if (value) return value;
      await sleep(300);
    }
    throw new Error('Tampilan Facebook belum siap atau berubah. Tidak dikirim ulang.');
  }

  async function dispatch(job) {
    check(job);
    const reply = await chrome.runtime.sendMessage({ type: 'CP_LOKER_CHECK', id: job.id, lease: job.lease, dispatch: true });
    check(job);
    if (!reply?.allowed) throw new Error('START tidak aktif, admin terputus, atau tugas sudah pernah dikirim.');
  }

  async function attach(job, root) {
    if (!job.banner) throw new Error('Foto lowongan belum tersedia.');
    const before = new Set([...root.querySelectorAll('img')].map(i => i.src));
    let inputs = [...root.querySelectorAll('input[type="file"]')].filter(e => !e.accept || /image/.test(e.accept));
    if (inputs.length !== 1) {
      const photo = buttons(root).filter(b => /(foto|photo|gambar|image|camera|kamera)/i.test(label(b)));
      if (photo.length === 1) photo[0].click();
      inputs = await until(job, () => {
        const all = [...root.querySelectorAll('input[type="file"]')].filter(e => !e.accept || /image/.test(e.accept));
        return all.length === 1 ? all : null;
      }, 6000);
    }
    const raw = atob(job.banner.body);
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const ext = job.banner.mime === 'image/jpeg' ? 'jpg' : job.banner.mime.split('/')[1];
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], `lowongan.${ext}`, { type: job.banner.mime }));
    inputs[0].files = dt.files;
    inputs[0].dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    await until(job, () => [...root.querySelectorAll('img')].some(i => !before.has(i.src) && i.complete && i.naturalWidth > 80) && !root.querySelector('[role="progressbar"]'), 30000);
    await sleep(1000);
  }

  function postUrlFromArticle(article, group) {
    for (const link of article.querySelectorAll('a[href]')) {
      const p = target(link.href);
      if (p?.post && p.group === group) return p.url;
    }
    return '';
  }

  function hasLargeImage(root) {
    return [...root.querySelectorAll('img')].some(i => visible(i) && (i.naturalWidth > 120 || i.width > 120));
  }

  function findJobPostArticle(job) {
    const wanted = target(job.target);
    return articles().find(a => {
      if (!story(a) || !seeker(story(a).textContent || '')) return false;
      return postUrlFromArticle(a, wanted.group) === wanted.url;
    }) || null;
  }

  function findExactPostArticle(job) {
    const wanted = target(job.target);
    return articles().find(a => postUrlFromArticle(a, wanted.group) === wanted.url) || null;
  }

  async function scanAllPosts(groupUrl) {
    cancelled = false;
    const wanted = target(groupUrl);
    const here = target(location.href);
    if (!wanted || wanted.post || !here || here.group !== wanted.group) throw new Error('Halaman grup tidak cocok untuk scan.');
    if (/checkpoint|captcha|login/.test(location.pathname) || [...document.querySelectorAll('[role="alert"],[role="dialog"]')].some(e => /temporarily blocked|dibatasi sementara|confirm your identity|konfirmasi identitas|security check|pemeriksaan keamanan/i.test(e.textContent))) {
      throw new Error('Facebook meminta pemeriksaan keamanan/pembatasan.');
    }
    const found = new Map();
    let idleRounds = 0;
    const deadline = Date.now() + 45000;
    while (!cancelled && Date.now() < deadline && idleRounds < 5) {
      const before = found.size;
      for (const a of articles()) {
        const ref = postUrlFromArticle(a, wanted.group);
        if (!ref || found.has(ref)) continue;
        const message = norm(story(a)?.textContent || a.textContent || '');
        found.set(ref, { url: ref, preview: message.slice(0, 220) || 'Postingan tanpa teks' });
      }
      idleRounds = found.size === before ? idleRounds + 1 : 0;
      window.scrollBy(0, innerHeight * .9);
      await sleep(900);
    }
    return { items: [...found.values()] };
  }

  async function run(job) {
    cancelled = false;
    check(job);

    if (job.kind === 'group_scan') {
      await dispatch(job);
      const found = new Set();
      const scanUntil = Math.min(job.expiresAt - 15000, Date.now() + 105000);
      let idleRounds = 0;
      while (Date.now() < scanUntil && idleRounds < 4) {
        check(job);
        const before = found.size;
        for (const a of articles()) {
          const message = story(a);
          if (!message || !seeker(message.textContent || '')) continue;
          const ref = postUrlFromArticle(a, target(job.target).group);
          if (ref) found.add(ref);
        }
        idleRounds = found.size === before ? idleRounds + 1 : 0;
        window.scrollBy(0, innerHeight * .85);
        await sleep(1000);
      }
      return { status: 'skipped', discovered: [...found], note: `${found.size} postingan pencari kerja relevan ditemukan; tidak ada batas jumlah komentar tetap.` };
    }

    if (job.kind === 'group_post') {
      const group = target(job.target).group;
      const beforeLinks = new Set(articles().map(a => postUrlFromArticle(a, group)).filter(Boolean));
      const open = await until(job, () => {
        const list = buttons(document).filter(b => /^(tulis sesuatu|write something|apa yang anda pikirkan|what.s on your mind)/i.test(label(b)));
        return list.length === 1 ? list[0] : null;
      });
      open.click();
      const dialog = await until(job, () => {
        const ds = [...document.querySelectorAll('[role="dialog"]')].filter(d => visible(d) && /buat postingan|create post/i.test(d.textContent || d.getAttribute('aria-label') || ''));
        return ds.length === 1 ? ds[0] : null;
      });
      await attach(job, dialog);
      const send = await until(job, () => {
        const bs = buttons(dialog).filter(b => /^(posting|post|kirim)$/i.test(label(b)) && b.getAttribute('aria-disabled') !== 'true' && !b.disabled);
        return bs.length === 1 ? bs[0] : null;
      });
      await dispatch(job);
      send.click();
      await sleep(2500);
      const pending = [...document.querySelectorAll('[role="alert"]')].some(e => /menunggu persetujuan|pending approval|submitted.*approval/i.test(e.textContent));
      if (pending) return { status: 'pending', note: 'Foto menunggu persetujuan admin grup.' };
      const ref = await until(job, () => {
        if (visible(dialog)) return null;
        for (const a of articles()) {
          const ref = postUrlFromArticle(a, group);
          if (ref && !beforeLinks.has(ref) && hasLargeImage(a)) return ref;
        }
        return null;
      }, 20000);
      return { status: 'verify', ref };
    }

    if (job.kind === 'group_comment') {
      const article = await until(job, () => job.payload?.adminSelected === true ? findExactPostArticle(job) : findJobPostArticle(job));
      const editor = await until(job, () => {
        const editors = [...article.querySelectorAll('[contenteditable="true"][role="textbox"]')].filter(el => visible(el) && el.closest('[role="article"]') === article && /komentar|comment/i.test(label(el)) && !/balas|reply/i.test(label(el)));
        return editors.length === 1 ? editors[0] : null;
      });
      const beforeImages = new Set([...article.querySelectorAll('img')].map(i => i.src));
      let scope = editor.parentElement;
      let chosen = null;
      for (let i = 0; i < 7 && scope && scope !== article.parentElement; i++, scope = scope.parentElement) {
        const inputs = [...scope.querySelectorAll('input[type="file"]')].filter(e => !e.accept || /image/.test(e.accept));
        const photoButtons = buttons(scope).filter(b => /(foto|photo|gambar|image|camera|kamera)/i.test(label(b)));
        if (inputs.length === 1 || photoButtons.length === 1) { chosen = scope; break; }
      }
      chosen ||= article;
      await attach(job, chosen);
      const send = await until(job, () => {
        const bs = buttons(chosen).filter(b => /^(kirim|send|kirim komentar|post comment|comment|komentari)$/i.test(label(b)) && b.getAttribute('aria-disabled') !== 'true' && !b.disabled);
        return bs.length === 1 ? bs[0] : null;
      }, 8000);
      await dispatch(job);
      send.click();
      await sleep(2500);
      await until(job, () => [...article.querySelectorAll('img')].some(i => !beforeImages.has(i.src) && visible(i) && (i.naturalWidth > 120 || i.width > 120)), 15000);
      return { status: 'sent', ref: target(job.target).url, note: 'Foto lowongan terlihat pada komentar posting pencari kerja.' };
    }

    throw new Error('Jenis tugas tidak didukung.');
  }

  async function verify(job, ref) {
    check(job);
    const wanted = target(ref);
    await until(job, () => {
      if (document.readyState !== 'complete') return false;
      return articles().some(a => postUrlFromArticle(a, wanted.group) === wanted.url && hasLargeImage(a));
    }, 20000);
    return { status: 'sent', ref, note: 'Foto lowongan terlihat kembali setelah halaman Facebook dimuat ulang.' };
  }

  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (m?.type === 'CP_LOKER_CANCEL') { cancelled = true; respond({ stopped: true }); return; }
    if (m?.type === 'CP_LOKER_SCAN_ALL') {
      scanAllPosts(m.group).then(respond).catch(e => respond({ error: e.message, items: [] }));
      return true;
    }
    if (!['CP_LOKER_RUN','CP_LOKER_VERIFY'].includes(m?.type)) return;
    const job = m.job;
    const pulse = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'CP_LOKER_CHECK', id: job.id, lease: job.lease })
        .then(r => { if (!r?.allowed) cancelled = true; })
        .catch(() => { cancelled = true; });
    }, 5000);
    (m.type === 'CP_LOKER_RUN' ? run(job) : verify(job, m.ref))
      .then(respond)
      .catch(e => respond({ status: 'uncertain', note: e.message }))
      .finally(() => clearInterval(pulse));
    return true;
  });
})();