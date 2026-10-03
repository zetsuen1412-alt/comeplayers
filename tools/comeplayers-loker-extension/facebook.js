(() => {
  'use strict';
  if (globalThis.__cpLokerInstalled) return;
  globalThis.__cpLokerInstalled = true;
  let cancelled = false;
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim();
  const visible = el => el instanceof HTMLElement && !el.closest('[hidden],[aria-hidden="true"],[inert]')
    && !['hidden', 'collapse'].includes(getComputedStyle(el).visibility)
    && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const label = el => norm(el.getAttribute('aria-label') || el.textContent);
  const buttons = root => [...root.querySelectorAll('button,[role="button"]')].filter(visible);
  const articles = () => [...document.querySelectorAll('[role="article"]')].filter(a => !a.parentElement?.closest('[role="article"]'));
  const story = a => a.querySelector('[data-ad-preview="message"],[data-ad-comet-preview="message"],[data-ad-rendering-role="story_message"]');
  const seeker = t => /\b(cari kerja|mencari (kerja|pekerjaan)|butuh (kerja|pekerjaan)|info loker|loker dong|ada loker|butuh loker|mau kerja)\b/i.test(t)
    && !/\b(kami membuka|dibutuhkan|open recruitment|lowongan tersedia|sedang membuka|membuka lowongan|hiring)\b/i.test(t);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editorSelector = '[contenteditable="true"][role="textbox"],[contenteditable="true"][data-lexical-editor="true"],textarea[role="textbox"]';
  const commentSelector = '[role="article"],[role="listitem"],[data-comment-id],[data-commentid],[data-ad-rendering-role="comment"]';
  const imageInput = input => !input.disabled && (!input.accept || /image\/|\.(png|jpe?g|webp)(?:,|$)/i.test(input.accept));
  const enabled = control => visible(control) && control.getAttribute('aria-disabled') !== 'true' && !control.disabled;
  function failure(code, message) { return Object.assign(new Error(message), { code }); }

  function target(url) {
    try {
      const u = new URL(url, location.href);
      if (!['www.facebook.com','web.facebook.com','m.facebook.com'].includes(u.hostname) || u.protocol !== 'https:'
        || u.username || u.password || u.port) return null;
      const m = u.pathname.match(/^\/groups\/([a-zA-Z0-9._-]+)(?:\/(?:posts|permalink)\/(\d+))?\/?$/);
      return m ? { group: m[1], post: m[2] || '', url: `https://www.facebook.com/groups/${m[1]}${m[2] ? `/posts/${m[2]}` : ''}/` } : null;
    } catch { return null; }
  }

  function check(job) {
    const here = target(location.href), wanted = target(job.target);
    if (cancelled || Date.now() > job.expiresAt) throw failure('cancelled', 'Dihentikan atau tugas kedaluwarsa.');
    if (!here || !wanted || here.group !== wanted.group || (wanted.post && wanted.post !== here.post)) throw failure('target_changed', 'Halaman bukan tujuan tugas.');
    if (/checkpoint|captcha|login/.test(location.pathname) || [...document.querySelectorAll('[role="alert"],[role="dialog"]')].some(e => /temporarily blocked|dibatasi sementara|confirm your identity|konfirmasi identitas|security check|pemeriksaan keamanan/i.test(e.textContent))) {
      throw failure('security_restriction', 'Facebook meminta pemeriksaan keamanan/pembatasan.');
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
    if (!reply?.allowed) throw failure('preflight_denied', 'START tidak aktif, admin terputus, atau tugas sudah pernah dikirim.');
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

  function findExactPostArticle(job) {
    const wanted = target(job.target);
    return articles().find(article => hasPostPermalink(article, wanted)) || null;
  }

  function hasPostPermalink(article, wanted) {
    return [...article.querySelectorAll('a[href]')].some(link => {
      const url = new URL(link.href, location.href);
      return !url.searchParams.has('comment_id') && !url.searchParams.has('reply_comment_id')
        && target(link.href)?.url === wanted.url;
    });
  }

  function findPostModal(job) {
    const wanted = target(job.target);
    const here = target(location.href);
    if (!wanted?.post || !here || here.group !== wanted.group || here.post !== wanted.post) return null;
    const visibleDialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    // Resolve the active/deepest dialog before checking post evidence. A
    // reply overlay must not expose a sendable footer in the post behind it.
    const innermost = visibleDialogs.filter(dialog => !visibleDialogs.some(other => other !== dialog && dialog.contains(other)));
    if (innermost.length !== 1) return null;
    const dialogs = innermost.filter(dialog => {
      const heading = norm([...dialog.querySelectorAll('h1,h2,[role="heading"]')].map(e => e.textContent).join(' '));
      if (/^(buat postingan|create post)/i.test(heading)) return false;
      // Require post evidence, not merely an editor/heading: a reply or share
      // overlay can appear while the address bar still names the same post.
      const refs = [...dialog.querySelectorAll('a[href]')].flatMap(link => {
        const url = new URL(link.href, location.href), parsed = target(link.href);
        return parsed?.post && !url.searchParams.has('comment_id') && !url.searchParams.has('reply_comment_id') ? [parsed.url] : [];
      });
      if (refs.length && !refs.includes(wanted.url)) return false;
      return !!story(dialog) || refs.includes(wanted.url);
    });
    return dialogs.length === 1 ? dialogs[0] : null;
  }

  function findCommentContext(job) {
    // The feed behind a modal can include the same permalink. Always resolve
    // the active dialog first so controls cannot leak out to the background.
    if ([...document.querySelectorAll('[role="dialog"]')].some(visible)) return findPostModal(job);
    return findExactPostArticle(job);
  }

  function postRoot(context, job) {
    if (context.matches('[role="article"]')) return context;
    const wanted = target(job.target);
    const roots = [...context.querySelectorAll('[role="article"]')].filter(article => {
      if (article.parentElement?.closest('[role="article"]')) return false;
      return !!story(article) || hasPostPermalink(article, wanted);
    });
    return roots.length === 1 ? roots[0] : context;
  }

  function nestedComment(element, context, root) {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node === context || node === root) continue;
      // A semantic comment can wrap a nested dialog. Continue beyond the
      // selected dialog instead of declaring its reply editor a post root.
      if (!context.contains(node) && node.matches('[role="article"]') && story(node)) continue;
      if (node !== root && (node.matches(commentSelector)
        || node.matches('li') && node.parentElement?.matches('[role="list"],ul,ol')
        || node.matches('[data-reply-thread],[data-comment-thread]'))) return true;
    }
    return false;
  }

  function classifyComposers(context, job) {
    const root = postRoot(context, job);
    const all = [...context.querySelectorAll(editorSelector)].filter(visible);
    const accepted = all.filter(editor => {
      if (nestedComment(editor, context, root)) return false;
      // A reply list is also semantic evidence, even if it uses plain divs
      // instead of an article for the individual comment.
      for (let node = editor.parentElement; node && node !== context; node = node.parentElement) {
        if (node !== root && node.matches('[role="list"],[data-comment-list]')) return false;
      }
      return true;
    });
    return { all, accepted, root };
  }

  function composerScopes(editor, context, includePreviewParents = false) {
    const scopes = [];
    const form = editor.closest('form');
    for (let scope = editor.parentElement; scope && context.contains(scope); scope = scope.parentElement) {
      // Never broaden a composer search into the post header, share controls,
      // or a comment list. Facebook can nest the footer dozens of divs deep.
      if (story(scope) || scope.querySelector(commentSelector) || scope.querySelector('h1,h2,[role="heading"]')
        || includePreviewParents && scope.querySelector('[role="list"],[data-comment-list],[data-reply-thread],[data-comment-thread]')) break;
      const editors = [...scope.querySelectorAll(editorSelector)].filter(node => includePreviewParents || visible(node));
      if (editors.length !== 1 || editors[0] !== editor) break;
      if (editors.length === 1 && editors[0] === editor) scopes.push(scope);
      if (scope === context || scope === form && !includePreviewParents) break;
    }
    return scopes;
  }

  function photoControls(scope, context, root) {
    return buttons(scope).filter(button => !nestedComment(button, context, root)
      && /(foto|photo|gambar|image|camera|kamera|lampir|attach)/i.test(label(button)));
  }

  function commentSendButton(scopes, context, root) {
    for (const scope of scopes) {
      const candidates = buttons(scope).filter(button => {
        if (nestedComment(button, context, root)) return false;
        const value = label(button);
        if (/(foto|photo|gambar|image|camera|kamera|gif|stiker|sticker|emoji|balas|reply|bagikan|share|teman|friends?|profil|profile)/i.test(value)) return false;
        return /^(kirim|send|kirim komentar|posting komentar|post comment|komentar|comment|komentari|posting|post)$/i.test(value)
          || /^(kirim komentar|send comment|post comment)\b/i.test(value)
          || button.matches('button[type="submit"],input[type="submit"]') && button.form?.contains(scope.querySelector(editorSelector));
      });
      if (candidates.length === 1) return candidates[0];
      if (candidates.length > 1) return null;
    }
    return null;
  }

  function mediaImages(scope) {
    return [...scope.querySelectorAll('img')].filter(img => {
      const width = img.getBoundingClientRect().width || img.width;
      return visible(img) && img.complete && img.naturalWidth >= 80 && width >= 80;
    });
  }

  function attachmentImages(scope) {
    return [...scope.querySelectorAll('img')].filter(img => {
      const profile = img.closest('a[href]');
      return !(profile && actorKey(profile.href)) && visible(img) && img.complete
        && img.naturalWidth >= 40 && (img.getBoundingClientRect().width || img.width) >= 40;
    });
  }

  function attachmentRemoveControls(scope, context, root) {
    return buttons(scope).filter(button => !nestedComment(button, context, root)
      && /^(hapus foto|remove photo|hapus gambar|remove image|hapus lampiran(?: foto)?|remove attachment)$/i.test(label(button)));
  }

  function activeUpload(scope) {
    return [...scope.querySelectorAll('[role="progressbar"]')].some(visible);
  }

  function editorText(editor) {
    return norm(editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent);
  }

  async function waitFor(job, fn, timeout, code, message) {
    try { return await until(job, fn, timeout); }
    catch (error) { if (error.code) throw error; throw failure(code, message); }
  }

  function bannerFile(job) {
    const banner = job.banner;
    if (!banner || !['image/png', 'image/jpeg', 'image/webp'].includes(banner.mime)
      || typeof banner.body !== 'string' || banner.body.length > 6990508) {
      throw failure('banner_invalid', 'Foto harus PNG, JPEG, atau WebP maksimal 5 MB.');
    }
    let raw;
    try { raw = atob(banner.body); }
    catch { throw failure('banner_invalid', 'Data foto tidak valid.'); }
    if (!raw.length || raw.length > 5 * 1024 * 1024) throw failure('banner_invalid', 'Foto harus berukuran 1 byte sampai 5 MB.');
    const ext = banner.mime === 'image/jpeg' ? 'jpg' : banner.mime.split('/')[1];
    return new File([Uint8Array.from(raw, c => c.charCodeAt(0))], `lowongan.${ext}`, { type: banner.mime });
  }

  async function attachComment(job, editor, context, root, mark, track) {
    if (editorText(editor)) throw failure('composer_draft_present', 'Kolom komentar sudah berisi draf.');
    const file = bannerFile(job);
    const scopes = composerScopes(editor, context);
    const scope = [...scopes].reverse().find(node => photoControls(node, context, root).length === 1
      || [...node.querySelectorAll('input[type="file"]')].filter(imageInput).length === 1);
    if (!scope) throw failure('photo_control_unavailable', 'Kontrol foto komentar tidak tersedia.');
    const previewScopes = composerScopes(editor, context, true);
    const previewScope = previewScopes[previewScopes.length - 1] || scope;
    // The observed Facebook thumbnail is a 64px HTTPS image next to the
    // form. This separate scope stops before posts, replies and other editors.
    if (editorText(editor) || attachmentImages(previewScope).length || activeUpload(previewScope)
      || attachmentRemoveControls(previewScope, context, root).length) {
      throw failure('composer_draft_present', 'Kolom komentar sudah berisi draf. Bersihkan atau simpan draf sebelum melanjutkan.');
    }
    const before = new Map([...previewScope.querySelectorAll('img')].map(img => [img, img.currentSrc || img.src]));
    let inputs = [...scope.querySelectorAll('input[type="file"]')].filter(imageInput);
    if (inputs.length !== 1) {
      const photos = photoControls(scope, context, root);
      if (photos.length !== 1) throw failure('photo_control_unavailable', 'Kontrol foto komentar tidak dapat dipastikan.');
      const photo = photos[0];
      const previous = new Set(context.querySelectorAll('input[type="file"]'));
      const controlledIds = norm(`${photo.getAttribute('aria-controls') || ''} ${photo.getAttribute('aria-owns') || ''}`).split(' ').filter(Boolean);
      check(job);
      photo.click();
      inputs = await waitFor(job, () => {
        const available = [...context.querySelectorAll('input[type="file"]')].filter(imageInput);
        const mapped = available.filter(input => controlledIds.some(id => input.id === id || document.getElementById(id)?.contains(input)));
        if (mapped.length === 1) return mapped;
        const created = available.filter(input => !previous.has(input));
        if (created.length === 1) return created;
        // A unique local photo control can reveal the dialog's one hidden
        // file input. Do not guess between multiple existing inputs.
        return available.length === 1 ? available : null;
      }, 6000, 'photo_control_unavailable', 'Input foto komentar tidak ditemukan.');
    }
    mark('photo_control_found');
    check(job);
    if (inputs[0].files.length || editorText(editor) || attachmentImages(previewScope).length || activeUpload(previewScope)
      || attachmentRemoveControls(previewScope, context, root).length || !context.isConnected || !editor.isConnected
      || !composerScopes(editor, context, true).includes(previewScope)) {
      throw failure('composer_draft_present', 'Kolom komentar atau input foto sudah berisi draf.');
    }
    const ownership = { editor, context, root, input: inputs[0], file, previewScope, before,
      beforeRemoves: new Set(attachmentRemoveControls(previewScope, context, root)),
      originalText: editorText(editor), changed: false, userChanged: false, cleaning: false };
    track(ownership);
    const watch = event => {
      if (!ownership.cleaning && event !== ownership.changeEvent) ownership.userChanged = true;
    };
    for (const type of ['input', 'change', 'paste', 'drop']) {
      previewScope.addEventListener(type, watch, true);
      inputs[0].addEventListener(type, watch, true);
    }
    ownership.release = () => {
      for (const type of ['input', 'change', 'paste', 'drop']) {
        previewScope.removeEventListener(type, watch, true);
        inputs[0].removeEventListener(type, watch, true);
      }
    };
    const transfer = new DataTransfer();
    transfer.items.add(file);
    // Record ownership first: the change handler may create a draft even when
    // preview detection later times out or STOP arrives during an upload.
    ownership.changed = true;
    inputs[0].files = transfer.files;
    ownership.assignedFile = inputs[0].files[0];
    ownership.changeEvent = new Event('change', { bubbles: true, composed: true });
    inputs[0].dispatchEvent(ownership.changeEvent);
    const preview = await waitFor(job, () => {
      if (activeUpload(previewScope)) return null;
      const remove = attachmentRemoveControls(previewScope, context, root);
      const candidates = attachmentImages(previewScope).filter(img => !nestedComment(img, context, root)
        && before.get(img) !== (img.currentSrc || img.src)
        && (img.closest('[data-attachment-preview]') || /^(blob:|data:image\/)/i.test(img.currentSrc || img.src) || remove.length === 1));
      return candidates.length === 1 ? candidates[0] : null;
    }, 30000, 'attachment_preview_missing', 'Pratinjau foto pada kolom komentar tidak terkonfirmasi.');
    ownership.preview = preview;
    ownership.previewSource = preview.currentSrc || preview.src;
    ownership.previewSrc = preview.src;
    ownership.previewSrcset = preview.srcset;
    mark('attachment_preview_found');
    return { scope: previewScope, preview, scopes };
  }

  async function cleanupAttachment(job, ownership) {
    if (!ownership?.changed) return true;
    const { editor, context, root, input, previewScope, before, beforeRemoves, originalText } = ownership;
    const fileOwned = () => !input.files.length || input.files.length === 1 && input.files[0] === ownership.assignedFile;
    const sameComposer = () => {
      const here = target(location.href), wanted = target(job.target);
      return here?.url === wanted?.url && context.isConnected && editor.isConnected && input.isConnected
        && !ownership.userChanged && previewScope.isConnected && context.contains(previewScope) && editorText(editor) === originalText
        && fileOwned() && findCommentContext(job) === context
        && composerScopes(editor, context, true).includes(previewScope);
    };
    const newImages = () => [...previewScope.querySelectorAll('img')].filter(img => visible(img)
      && before.get(img) !== (img.currentSrc || img.src));
    if (!sameComposer()) return false;
    const removes = attachmentRemoveControls(previewScope, context, root).filter(button => !beforeRemoves.has(button));
    if (!newImages().length && !input.files.length && !activeUpload(previewScope) && !removes.length) return true;
    const knownPreview = ownership.preview;
    if (knownPreview ? !knownPreview.isConnected || !previewScope.contains(knownPreview) || !knownPreview.complete
      || knownPreview.src !== ownership.previewSrc || knownPreview.srcset !== ownership.previewSrcset
      || (knownPreview.currentSrc || knownPreview.src) !== ownership.previewSource
      : input.files.length !== 1 || input.files[0] !== ownership.assignedFile) return false;
    // A new exact photo-removal control in the originally empty composer is
    // required. Never click a dialog-wide/global or generic "Hapus" action.
    if (removes.length !== 1 || !enabled(removes[0]) || (!newImages().length && !input.files.length)) return false;
    ownership.cleaning = true;
    removes[0].click();
    if (input.isConnected && fileOwned()) input.value = '';
    const start = Date.now();
    while (Date.now() - start < 4000) {
      // Cleanup reverses only this unsent upload, so STOP/lease expiry must not
      // block it. Target, composer and user-draft ownership are still checked.
      if (!sameComposer()) return false;
      if (!newImages().length && !input.files.length && !activeUpload(previewScope)
        && !attachmentRemoveControls(previewScope, context, root).some(button => !beforeRemoves.has(button))) return true;
      await sleep(100);
    }
    return false;
  }

  function attachmentStillOwned(ownership, preview) {
    const { input, assignedFile, previewScope, before, userChanged, previewSource } = ownership;
    const candidates = attachmentImages(previewScope).filter(img => before.get(img) !== (img.currentSrc || img.src));
    return !userChanged && preview.isConnected && previewScope.contains(preview)
      && preview.src === ownership.previewSrc && preview.srcset === ownership.previewSrcset
      && (preview.currentSrc || preview.src) === previewSource && candidates.length === 1 && candidates[0] === preview
      && (!input.files.length || input.files.length === 1 && input.files[0] === assignedFile) && !activeUpload(previewScope);
  }

  function topLevelComments(context, root, composer) {
    const nodes = [...context.querySelectorAll(commentSelector)].filter(node => node !== root
      && !node.contains(composer) && !composer.contains(node) && !story(node));
    return nodes.filter(node => !nodes.some(parent => parent !== node && parent.contains(node)));
  }

  function commentKey(comment) {
    const explicit = comment.getAttribute('data-comment-id') || comment.getAttribute('data-commentid');
    if (explicit) return `id:${explicit}`;
    for (const link of comment.querySelectorAll('a[href]')) {
      const owner = link.closest(commentSelector);
      if (owner && owner !== comment) continue;
      const url = new URL(link.href, location.href);
      const id = url.searchParams.get('reply_comment_id') || url.searchParams.get('comment_id');
      if (id) return `id:${id}`;
    }
    return '';
  }

  function mediaKey(img) {
    try {
      const url = new URL(img.currentSrc || img.src, location.href);
      return url.protocol === 'https:' ? `${url.origin}${url.pathname}` : url.href;
    } catch { return ''; }
  }

  function actorKey(href) {
    try {
      const url = new URL(href, location.href);
      if (!['www.facebook.com', 'web.facebook.com', 'm.facebook.com'].includes(url.hostname)) return '';
      if (url.pathname === '/profile.php') return url.searchParams.has('id') ? `${url.pathname}?id=${url.searchParams.get('id')}` : '';
      if (/^\/(photo|story|permalink|l)\.php$/.test(url.pathname)) return '';
      if (/^\/people\/[^/]+\/\d+\/?$/.test(url.pathname)) return url.pathname.replace(/\/$/, '');
      if (/^\/[a-zA-Z0-9._-]+\/?$/.test(url.pathname) && !/^\/(groups|photo|photos|watch|marketplace|notifications|home|me|reel|reels|login|help|messages)\/?$/.test(url.pathname)) return url.pathname.replace(/\/$/, '');
      return '';
    } catch { return ''; }
  }

  function composerCleared(editor, scope, preview) {
    const text = norm(editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent);
    const previews = mediaImages(scope).filter(img => img.closest('[data-attachment-preview]')
      || /^(blob:|data:image\/)/i.test(img.currentSrc || img.src));
    return !text && previews.length === 0 && (!preview.isConnected || !scope.contains(preview) || !visible(preview))
      && !scope.querySelector('[role="progressbar"]');
  }

  async function scanAllPosts(groupUrl) {
    cancelled = false;
    const wanted = target(groupUrl);
    const here = target(location.href);
    if (!wanted || wanted.post || !here || here.post || here.group !== wanted.group) throw new Error('Halaman grup tidak cocok untuk scan.');
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
    if (job.kind !== 'group_comment') check(job);

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
      const stages = [];
      let dispatched = false;
      let ownership = null;
      const mark = stage => { if (stages[stages.length - 1] !== stage) stages.push(stage); };
      const result = (status, message, ref) => ({ status, ...(ref ? { ref } : {}),
        stage: stages[stages.length - 1], stages, dispatched,
        note: `[stage:${stages[stages.length - 1]}] ${message}`.slice(0, 240) });
      try {
        check(job);
        mark('navigated');
        if (job.payload?.adminSelected !== true) throw failure('approval_required', 'Postingan belum ditandai dan disetujui admin.');
        const context = await waitFor(job, () => findCommentContext(job),
          20000, 'context_unavailable', 'Konteks postingan belum tersedia.');
        mark(`post_context_found:${context.matches('[role="dialog"]') ? 'modal' : 'feed'}`);
        let classification = classifyComposers(context, job);
        mark(`composer_candidates:${classification.all.length}`);
        if (!classification.accepted.length) {
          classification = await waitFor(job, () => {
            const candidate = classifyComposers(context, job);
            return candidate.accepted.length ? candidate : null;
          }, 12000, classification.all.length ? 'composer_nested_reply' : 'composer_missing',
          classification.all.length ? 'Hanya kolom balasan komentar yang tersedia.' : 'Kolom komentar postingan tidak tersedia.');
          mark(`composer_candidates:${classification.all.length}`);
        }
        if (classification.accepted.length !== 1) throw failure('composer_ambiguous', 'Ada beberapa kolom komentar; tujuan kirim tidak dapat dipastikan.');
        const editor = classification.accepted[0];
        const root = classification.root;
        mark('composer_selected:post_root');
        const { scope, preview, scopes } = await attachComment(job, editor, context, root, mark, tracked => { ownership = tracked; });
        check(job);
        if (ownership.userChanged || editorText(editor) !== ownership.originalText) throw failure('composer_draft_present', 'Draf berubah selama foto dipasang.');
        // In the observed modal, the real "Posting komentar" icon appears
        // only after focusing this already-classified post-level editor.
        editor.focus();
        check(job);
        const send = await waitFor(job, () => {
          const control = commentSendButton(scopes, context, root);
          return control && enabled(control) ? control : null;
        }, 12000, 'send_control_unavailable', 'Kontrol kirim foto tidak tersedia atau belum aktif.');
        mark('send_control_found');
        const existingComments = topLevelComments(context, root, scope);
        const beforeComments = {
          nodes: new Set(existingComments),
          keys: new Set(existingComments.map(commentKey).filter(Boolean)),
          media: new Set(existingComments.flatMap(comment => mediaImages(comment).map(mediaKey)).filter(Boolean)),
        };
        // Compare actor links only in memory, never include identity in a
        // result, note, storage, or log. Some variants have no avatar link.
        const actorLinks = new Set([...scope.querySelectorAll('a[href]')].filter(link => link.querySelector('img'))
          .map(link => actorKey(link.href)).filter(Boolean));
        check(job);
        if (!editor.isConnected || !context.contains(editor) || !attachmentStillOwned(ownership, preview) || !enabled(send)
          || ownership.userChanged || editorText(editor) !== ownership.originalText) {
          throw failure('send_control_unavailable', 'Kolom foto atau kontrol kirim berubah sebelum kirim.');
        }
        await dispatch(job);
        mark('preflight_allowed');
        // STOP may arrive while the server preflight is awaiting a response.
        // Recheck all local conditions immediately before the actual click.
        check(job);
        if (!context.isConnected || !editor.isConnected || !attachmentStillOwned(ownership, preview) || !enabled(send)
          || !classifyComposers(context, job).accepted.includes(editor) || ownership.userChanged || editorText(editor) !== ownership.originalText) {
          throw failure('send_control_unavailable', 'Kolom foto atau kontrol kirim berubah setelah pemeriksaan izin.');
        }
        dispatched = true;
        send.click();
        mark('send_clicked');
        await waitFor(job, () => {
          if (!composerCleared(editor, scope, preview)) return null;
          const comments = topLevelComments(context, root, scope);
          if (comments.length <= beforeComments.nodes.size) return null;
          return comments.find(comment => {
            const key = commentKey(comment), images = mediaImages(comment);
            if (beforeComments.nodes.has(comment) || key && beforeComments.keys.has(key) || !images.length) return false;
            if (!key && images.every(img => beforeComments.media.has(mediaKey(img)))) return false;
            const author = [...comment.querySelectorAll('a[href]')].map(link => actorKey(link.href)).find(Boolean);
            return !actorLinks.size || !author || actorLinks.has(author);
          }) || null;
        }, 18000, 'verification_inconclusive', 'Kirim sudah dicoba, tetapi komentar foto baru belum terkonfirmasi. Periksa manual; tidak dikirim ulang.');
        mark('verified_new_comment');
        return result('sent', context.matches('[role="dialog"]') ? 'Komentar foto baru terverifikasi di modal postingan.' : 'Komentar foto baru terverifikasi pada postingan.', target(job.target).url);
      } catch (error) {
        if (!dispatched && ownership?.changed) {
          let cleaned = false;
          try { cleaned = await cleanupAttachment(job, ownership); } catch { /* Fail closed on any cleanup ambiguity. */ }
          if (!cleaned) {
            mark('attachment_cleanup_blocked');
            return result('failed', 'Foto draf belum terbukti bersih. Periksa kolom komentar sebelum melanjutkan.');
          }
        }
        mark(error.code || (dispatched ? 'verification_inconclusive' : 'send_control_unavailable'));
        const message = error.code ? error.message : dispatched
          ? 'Kirim mungkin sudah terjadi. Periksa manual; tidak dikirim ulang.' : 'Kontrol komentar berubah sebelum kirim.';
        const status = dispatched ? 'uncertain' : ['security_restriction', 'composer_draft_present'].includes(error.code) ? 'failed'
          : error.code === 'cancelled' ? 'cancelled' : 'skipped';
        return result(status, message);
      } finally {
        ownership?.release?.();
      }
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
