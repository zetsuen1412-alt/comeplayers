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
  const storySelector = '[data-ad-preview="message"],[data-ad-comet-preview="message"],[data-ad-rendering-role="story_message"]';
  const story = a => a.querySelector(storySelector);
  const seeker = t => /\b(cari kerja|mencari (kerja|pekerjaan)|butuh (kerja|pekerjaan)|info loker|loker dong|ada loker|butuh loker|mau kerja)\b/i.test(t)
    && !/\b(kami membuka|dibutuhkan|open recruitment|lowongan tersedia|sedang membuka|membuka lowongan|hiring)\b/i.test(t);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editorSelector = '[contenteditable="true"][role="textbox"],[contenteditable="true"][data-lexical-editor="true"],textarea[role="textbox"]';
  const commentSelector = '[role="article"],[role="listitem"],[data-comment-id],[data-commentid],[data-ad-rendering-role="comment"]';
  const commentBoundarySelector = '[data-comment-id],[data-commentid],[data-ad-rendering-role="comment"],[data-comment-list],[data-reply-thread],[data-comment-thread]';
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
    const reviewedFeed = here && wanted && !here.post && wanted.post && here.group === wanted.group
      && job.kind === 'group_comment' && job.payload?.adminSelected === true && job.useExistingFeed === true
      && ![...document.querySelectorAll('[role="dialog"]')].some(visible) && findFeedContext(job, false);
    if (!here || !wanted || here.group !== wanted.group || (wanted.post && wanted.post !== here.post && !reviewedFeed)) throw failure('target_changed', 'Halaman bukan tujuan tugas.');
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
    const refs = postHeaderRefs(article, group);
    return refs.size === 1 ? [...refs][0] : '';
  }

  function postHeaderRefs(root, group) {
    const refs = new Set();
    const messages = [...root.querySelectorAll(storySelector)].filter(node => visible(node)
      && !node.parentElement?.closest(storySelector) && !nestedComment(node, root, root));
    for (const link of root.querySelectorAll('a[href]')) {
      if (!visible(link) || link.closest(storySelector) || nestedComment(link, root, root)
        || messages.some(message => !(link.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
      const url = new URL(link.href, location.href), parsed = target(link.href);
      if (parsed?.post && parsed.group === group && !url.searchParams.has('comment_id') && !url.searchParams.has('reply_comment_id')) refs.add(parsed.url);
    }
    return refs;
  }

  function plainPostContexts(group, wanted = '', withComposer = false, job = null) {
    const contexts = new Set();
    const markers = [...document.querySelectorAll(storySelector)].filter(marker => visible(marker)
      && !marker.parentElement?.closest(storySelector)
      && !marker.closest(`${commentSelector},[role="dialog"],[role="list"],[data-comment-list],[data-reply-thread],[data-comment-thread],form`));
    for (const marker of markers) {
      for (let scope = marker.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
        if (scope.matches(`${commentSelector},[role="dialog"],[role="list"],[role="feed"],main,[role="main"],[data-comment-list],[data-reply-thread],[data-comment-thread],form`)) break;
        const stories = [...scope.querySelectorAll(storySelector)].filter(node => visible(node) && !node.parentElement?.closest(storySelector));
        if (stories.length !== 1 || stories[0] !== marker) break;
        const refs = postHeaderRefs(scope, group);
        // Never enlarge one post into a feed wrapper containing another post.
        if (refs.size > 1) break;
        if (refs.size !== 1 || wanted && !refs.has(wanted)) continue;
        if (withComposer && classifyComposers(scope, job).accepted.length !== 1) continue;
        contexts.add(scope);
        break;
      }
    }
    return [...contexts];
  }

  function scanPostContexts(group) {
    return [...articles(), ...plainPostContexts(group)];
  }

  function timestampLabel(link, root, message) {
    // Facebook inserts invisible formatting characters into timestamp text.
    // Referenced accessibility labels may be hidden, but must belong to this
    // isolated post header, not another card, post body, or comment thread.
    const referenced = norm(link.getAttribute('aria-labelledby')).split(' ').filter(Boolean).map(id => link.ownerDocument.getElementById(id))
      .filter(node => node && root.contains(node) && !node.contains(link) && !node.closest(storySelector)
        && !nestedComment(node, root, root) && (node.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING));
    const labels = [link.getAttribute('aria-label'), link.innerText,
      referenced.map(node => node.textContent).join(' '),
      ...[...link.querySelectorAll('[aria-label]')].filter(visible).map(node => node.getAttribute('aria-label'))];
    return labels.some(value => {
      const text = norm(value).replace(/[\u034f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/^(?:sekitar|about)\s+/i, '');
      return /^(?:baru saja|just now|kemarin|yesterday|hari ini|today)\b/i.test(text)
        || /^(?:semenit|sejam|sehari|seminggu|sebulan|setahun|satu\s+(?:detik|menit|jam|hari|minggu|bulan|tahun))(?:\s+(?:yang\s+)?lalu)?$/i.test(text)
        || /^\d+\s*(?:detik|menit|mnt|jam|hari|minggu|bulan|tahun|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|[smhdwyj])(?:\b|$)/i.test(text)
        || /^(?:\d{1,2}\s+)?(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|january|february|march|may|june|july|august|october|december)\b/i.test(text);
    });
  }

  function lazyHeaderLinks(root, group) {
    const messages = [...root.querySelectorAll(storySelector)].filter(marker => visible(marker)
      && !marker.parentElement?.closest(storySelector));
    if (messages.length !== 1) return [];
    const message = messages[0];
    return [...root.querySelectorAll('a[href]')].filter(link => {
      if (!visible(link) || link.closest(storySelector) || nestedComment(link, root, root)
        || !(link.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING) || !timestampLabel(link, root, message)) return false;
      const parsed = target(link.href), url = new URL(link.href, location.href);
      return parsed && !parsed.post && parsed.group === group
        && !url.searchParams.has('comment_id') && !url.searchParams.has('reply_comment_id');
    });
  }

  function timestampHoverTarget(link, rect) {
    // Facebook can attach its lazy-link handler to a span inside the anchor.
    // An event on the anchor cannot reach that descendant. Prefer the actual
    // hit-tested child; never dispatch to an element outside this timestamp.
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (hit && hit !== link && link.contains(hit) && visible(hit)) return hit;
    const labelled = [...link.querySelectorAll('[aria-label],[aria-labelledby]')].filter(visible);
    const branches = labelled.filter(node => !labelled.some(other => other !== node && other.contains(node)));
    if (branches.length > 1) return link;
    let selected = branches[0] || link;
    // A single visible child chain gives an unambiguous fallback for a
    // temporarily obscured/off-screen timestamp, without sweeping branches.
    for (let depth = 0; depth < 12; depth++) {
      const children = [...selected.children].filter(visible);
      if (children.length !== 1) break;
      selected = children[0];
    }
    return selected;
  }

  function lazyPostHeaders(group) {
    // Discover isolated cards before they have a post URL: plainPostContexts
    // deliberately requires that URL, so it cannot bootstrap lazy headers.
    const scopes = new Set(articles().filter(visible));
    const markers = [...document.querySelectorAll(storySelector)].filter(marker => visible(marker)
      && !marker.parentElement?.closest(storySelector)
      && !marker.closest(`${commentSelector},[role="dialog"],[role="list"],[data-comment-list],[data-reply-thread],[data-comment-thread],form`));
    for (const marker of markers) {
      for (let scope = marker.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
        if (scope.matches(`${commentSelector},[role="dialog"],[role="list"],[role="feed"],main,[role="main"],[data-comment-list],[data-reply-thread],[data-comment-thread],form`)) break;
        const messages = [...scope.querySelectorAll(storySelector)].filter(node => visible(node) && !node.parentElement?.closest(storySelector));
        if (messages.length !== 1 || messages[0] !== marker) break;
        if (lazyHeaderLinks(scope, group).length !== 1) continue;
        scopes.add(scope);
        break;
      }
    }
    return [...scopes].flatMap(scope => {
      const links = lazyHeaderLinks(scope, group);
      return links.length === 1 ? [{ scope, link:links[0] }] : [];
    });
  }

  function hydratePostHeaders(group, attempted) {
    for (const { link } of lazyPostHeaders(group)) {
      const attempt = attempted.get(link);
      if (attempt && Date.now() - attempt.last < 3000) continue;
      attempted.set(link, { first:attempt?.first ?? Date.now(), last:Date.now() });
      // React resolves some group timestamp placeholders on hover. Request
      // that ordinary behavior without clicking, navigating, or taking focus.
      const rect = link.getBoundingClientRect();
      const hoverTarget = timestampHoverTarget(link, rect);
      const init = { bubbles:true, composed:true, view:window, clientX:rect.left + rect.width / 2, clientY:rect.top + rect.height / 2 };
      hoverTarget.dispatchEvent(new PointerEvent('pointerover', { ...init, pointerType:'mouse' }));
      hoverTarget.dispatchEvent(new MouseEvent('mouseover', init));
      // Native mouseenter does not bubble. Emit it only along the selected
      // hit path, as ordinary pointer entry would, including the anchor.
      const entered = [];
      for (let node = hoverTarget; node && link.contains(node); node = node.parentElement) {
        entered.unshift(node);
        if (node === link) break;
      }
      for (const node of entered) node.dispatchEvent(new MouseEvent('mouseenter', { ...init, bubbles:false }));
    }
  }

  function scanHeaderAuthors(root, boundaryRoot = root) {
    const refs = new Set();
    const messages = [...root.querySelectorAll(storySelector)].filter(node => visible(node)
      && !node.parentElement?.closest(storySelector) && !nestedComment(node, root, boundaryRoot));
    if (messages.length !== 1) return refs;
    for (const link of root.querySelectorAll('a[href]')) {
      if (!visible(link) || link.closest(storySelector) || nestedComment(link, root, boundaryRoot)
        || !(link.compareDocumentPosition(messages[0]) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const url = new URL(link.href, location.href);
      const groupUser = /^\/groups\/[a-zA-Z0-9._-]+\/user\/(\d+)\/?$/.exec(url.pathname);
      const ref = ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)
        && url.protocol === 'https:' && groupUser ? `/profile.php?id=${groupUser[1]}` : actorKey(link.href);
      if (ref) refs.add(ref);
    }
    return refs;
  }

  function scanStoryMatches(source, opened) {
    if (source === opened) return true;
    const prefix = source.replace(/\s*(?:…|\.\.\.)?\s*(?:lihat selengkapnya|see more)\s*$/i, '').replace(/\s*(?:…|\.\.\.)\s*$/, '').trim();
    return prefix !== source && prefix.length >= 8 && opened.startsWith(prefix)
      && (opened.length === prefix.length || /\s|[.,!?;:]/.test(opened[prefix.length]));
  }

  function scanPhotoReference(link, group, strict = true) {
    try {
      const url = new URL(link.href, location.href);
      if (url.protocol !== 'https:' || !['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)
        || url.username || url.password || url.port || !/^\/photo(?:\.php|\/)\/?$/.test(url.pathname)
        || url.searchParams.has('comment_id') || url.searchParams.has('reply_comment_id')) return null;
      // A media URL is only a candidate. The numeric post is never accepted
      // until another public DOM document confirms author, caption and photo.
      const media = /^gm\.(\d+)$/.exec(url.searchParams.get('set') || '');
      const photo = url.searchParams.get('fbid') || '';
      const affinity = url.searchParams.get('idorvanity');
      return media && /^\d+$/.test(group) && /^\d+$/.test(photo)
        && (strict ? affinity === group : !affinity || affinity === group)
        ? { url:`https://www.facebook.com/groups/${group}/posts/${media[1]}/`, photo } : null;
    } catch { return null; }
  }

  function scanPrimaryPhotos(root, group, strict = true) {
    return [...root.querySelectorAll('a[href]')].filter(link => visible(link) && !link.closest(storySelector) && !link.closest('form') && !nestedComment(link, root, root)
      && [...link.querySelectorAll('img')].some(img => visible(img) && (img.width > 120 || img.naturalWidth > 120)))
      .map(link => scanPhotoReference(link, group, strict)).filter(Boolean);
  }

  function scanHasSharedPost(root) {
    const selector = '[data-shared-post],[data-ad-rendering-role="shared_story"],blockquote';
    const markers = new Set([root.closest(selector), ...root.querySelectorAll(selector)]);
    return [...markers].some(marker => {
      if (!marker || marker.matches(commentBoundarySelector) || marker.closest('form') || nestedComment(marker, root, root)) return false;
      // Shared markers belong to the primary post only while visibly owned
      // by it. Hidden metadata and quotes in semantic comments/replies must
      // not invalidate the separately verified author, caption and photo.
      return visible(marker) || getComputedStyle(marker).display === 'contents'
        && [...marker.querySelectorAll('*')].some(visible);
    });
  }

  function scanMediaScope(root, group) {
    if (!visible(root) || root.matches(commentBoundarySelector) || scanHasSharedPost(root)) return null;
    const messages = [...root.querySelectorAll(storySelector)].filter(node => visible(node) && !node.parentElement?.closest(storySelector)
      && !nestedComment(node, root, root));
    if (messages.length !== 1) return null;
    const authors = scanHeaderAuthors(root), caption = norm(messages[0].textContent);
    if (authors.size !== 1 || caption.length < 8 || caption.length > 9000) return null;
    const authorHeadings = [...root.querySelectorAll('h1,h2,[role="heading"]')].filter(heading => visible(heading)
      && !heading.closest(storySelector) && !heading.closest('form') && !nestedComment(heading, root, root)
      && (heading.compareDocumentPosition(messages[0]) & Node.DOCUMENT_POSITION_FOLLOWING)
      && [...heading.querySelectorAll('a[href]')].some(link => {
        const url = new URL(link.href, location.href);
        return actorKey(link.href) || url.protocol === 'https:' && ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)
          && /^\/groups\/[^/]+\/user\/\d+\/?$/.test(url.pathname);
      }));
    if (authorHeadings.filter(heading => !authorHeadings.some(other => other !== heading && other.contains(heading))).length > 1) return null;
    const times = [...root.querySelectorAll('a[href]')].filter(link => visible(link) && !link.closest(storySelector)
      && !nestedComment(link, root, root) && timestampLabel(link, root, messages[0]));
    // A second timestamp is evidence of a quoted/shared post, even when its
    // author happens to be the same account as the outer post's author.
    if (times.length !== 1) return null;
    let quotedAuthor = false;
    const allActors = new Set([...root.querySelectorAll('a[href]')].filter(link => visible(link) && !link.closest(storySelector)
      && !link.closest('form') && !nestedComment(link, root, root)).flatMap(link => {
        const url = new URL(link.href, location.href), user = /^\/groups\/[^/]+\/user\/(\d+)\/?$/.exec(url.pathname);
        const actor = ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname) && url.protocol === 'https:' && user
          ? `/profile.php?id=${user[1]}` : actorKey(link.href);
        if (actor && !(link.compareDocumentPosition(messages[0]) & Node.DOCUMENT_POSITION_FOLLOWING)) quotedAuthor = true;
        return actor ? [actor] : [];
      }));
    if (quotedAuthor || allActors.size !== 1 || !allActors.has([...authors][0])) return null;
    const photos = scanPrimaryPhotos(root, group), refs = new Set(photos.map(photo => photo.url));
    if (refs.size !== 1) return null;
    return { scope:root, proof:{ url:[...refs][0], author:[...authors][0], caption, photos:[...new Set(photos.map(photo => photo.photo))].sort().slice(0, 8) } };
  }

  function scanMediaCandidates(group) {
    const candidates = new Map();
    for (const candidate of lazyPostHeaders(group)) {
      for (let scope = candidate.scope; scope && scope !== document.body; scope = scope.parentElement) {
        if (scope.matches('[role="feed"],main,[role="main"],[role="dialog"]')) break;
        const messages = [...scope.querySelectorAll(storySelector)].filter(node => visible(node) && !node.parentElement?.closest(storySelector));
        if (messages.length !== 1) break;
        const resolved = scanMediaScope(scope, group);
        if (resolved) { candidates.set(resolved.proof.url, resolved); break; }
        if (scope.matches('[role="article"]')) break;
      }
    }
    return [...candidates.values()];
  }

  function scanVerificationRoots(wanted) {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    if (dialogs.length) {
      const inner = dialogs.filter(dialog => !dialogs.some(other => other !== dialog && dialog.contains(other)));
      return inner.length === 1 ? [postRoot(inner[0], { target:wanted.url })] : [];
    }
    const roots = new Set(articles().filter(visible));
    for (const marker of document.querySelectorAll(storySelector)) {
      if (!visible(marker) || marker.parentElement?.closest(storySelector)
        || marker.closest(`${commentSelector},[role="dialog"],[role="list"],${commentBoundarySelector},form`)) continue;
      for (let scope = marker.parentElement; scope && scope !== document.body; scope = scope.parentElement) {
        if (scope.matches('[role="feed"],main,[role="main"],[role="dialog"]')) break;
        const messages = [...scope.querySelectorAll(storySelector)].filter(node => visible(node) && !node.parentElement?.closest(storySelector));
        if (messages.length !== 1) break;
        if (scanHeaderAuthors(scope).size === 1 && scanPrimaryPhotos(scope, wanted.group, false).length) roots.add(scope);
      }
    }
    return [...roots];
  }

  async function verifyScanMedia(proof, expiresAt) {
    cancelled = false;
    const wanted = target(proof?.url);
    if (!wanted?.post || typeof proof.caption !== 'string' || proof.caption.length < 8 || proof.caption.length > 9000
      || typeof proof.author !== 'string' || !Array.isArray(proof.photos) || proof.photos.length < 1 || proof.photos.length > 8
      || proof.photos.some(photo => !/^\d+$/.test(photo)) || !(expiresAt > Date.now() && expiresAt <= Date.now() + 20000)) return { verified:false };
    const job = { kind:'group_scan', target:wanted.url, expiresAt };
    while (Date.now() < expiresAt) {
      check(job);
      const matched = new Map();
      for (const root of scanVerificationRoots(wanted)) {
        if (nestedComment(root, root, root) || root.matches(commentBoundarySelector) || scanHasSharedPost(root)) continue;
        const messages = [...root.querySelectorAll(storySelector)].filter(node => visible(node) && !node.parentElement?.closest(storySelector)
          && !nestedComment(node, root, root));
        const authors = scanHeaderAuthors(root), refs = postHeaderRefs(root, wanted.group);
        const photos = scanPrimaryPhotos(root, wanted.group, false);
        if (messages.length !== 1 || authors.size !== 1 || !authors.has(proof.author) || refs.size > 1
          || refs.size === 1 && !refs.has(wanted.url) || !scanStoryMatches(proof.caption, norm(messages[0].textContent))) continue;
        if (!proof.photos.every(photo => photos.some(item => item.url === wanted.url && item.photo === photo))) continue;
        matched.set(messages[0], root);
      }
      if (matched.size === 1) return { verified:true, url:wanted.url };
      if (matched.size > 1) return { verified:false };
      await sleep(300);
    }
    return { verified:false };
  }

  function scanDialogClose(dialog, boundaryRoot) {
    const candidates = new Set();
    const headings = [...dialog.querySelectorAll('h1,h2,[role="heading"]')].filter(heading => visible(heading)
      && heading.closest('[role="dialog"]') === dialog && !nestedComment(heading, dialog, boundaryRoot)
      && /postingan|\bpost\b/i.test(norm(heading.textContent)));
    for (const heading of headings) {
      for (let scope = heading.parentElement; scope && dialog.contains(scope); scope = scope.parentElement) {
        if (story(scope) || scope.querySelector(`${editorSelector},${commentSelector}`)) break;
        for (const button of buttons(scope)) {
          if (enabled(button) && !nestedComment(button, dialog, boundaryRoot)
            && /^(tutup|close)(?: (?:postingan|post|dialog))?$/i.test(label(button))) candidates.add(button);
        }
        if (scope === dialog) break;
      }
    }
    return candidates.size === 1 ? [...candidates][0] : null;
  }

  async function pressScanTimestamp(job, scope, link, clickTarget) {
    const group = target(job.target).group;
    const steps = ['pointerdown','mousedown','pointerup','mouseup','click'];
    for (const type of steps) {
      check(job);
      // A press handler may already have opened the post. Do not deliver a
      // second activation into the newly opened modal or its background.
      if (target(location.href)?.post || [...document.querySelectorAll('[role="dialog"]')].some(visible)) return;
      const linkTarget = target(link.href), refs = postHeaderRefs(scope, group);
      const lazy = lazyHeaderLinks(scope, group);
      if (!scope.isConnected || !link.isConnected || !clickTarget.isConnected || !scope.contains(link)
        || !link.contains(clickTarget) || !visible(link) || !visible(clickTarget) || !linkTarget || linkTarget.group !== group
        || (linkTarget.post ? refs.size !== 1 || !refs.has(linkTarget.url) : lazy.length !== 1 || lazy[0] !== link)) {
        throw failure('scan_timestamp_changed', 'Tautan waktu postingan berubah selama scan.');
      }
      const rect = clickTarget.getBoundingClientRect();
      const down = /down$/.test(type);
      const init = { bubbles:true, cancelable:true, composed:true, view:window, button:0, buttons:down ? 1 : 0, detail:1,
        clientX:rect.left + rect.width / 2, clientY:rect.top + rect.height / 2 };
      const event = type.startsWith('pointer')
        ? new PointerEvent(type, { ...init, detail:0, pointerId:1, pointerType:'mouse', isPrimary:true, width:1, height:1, pressure:down ? .5 : 0 })
        : new MouseEvent(type, init);
      // A page can stop propagation before a late bubble guard executes.
      // Pre-cancel only native anchor activation; page press handlers still
      // receive the event. If they refuse cancelled clicks, fail closed.
      if (type === 'click') event.preventDefault();
      clickTarget.dispatchEvent(event);
      if (type !== 'click') await sleep(40);
    }
  }

  async function resolveScanHeader(job, candidate) {
    check(job);
    const wanted = target(job.target), { scope, link } = candidate;
    const sourceText = norm(story(scope)?.textContent), authors = scanHeaderAuthors(scope);
    const links = lazyHeaderLinks(scope, wanted.group);
    if (!sourceText || authors.size !== 1 || !scope.isConnected || !link.isConnected || !scope.contains(link) || !visible(link)
      || link.hasAttribute('download') || links.length !== 1 || links[0] !== link
      || [...document.querySelectorAll('[role="dialog"]')].some(visible)) return null;
    const author = [...authors][0];
    // This is a read-only timestamp press, never a comment/composer click.
    const hit = timestampHoverTarget(link, link.getBoundingClientRect());
    const nestedControl = hit.closest('button,[role="button"],input,textarea,select,[contenteditable="true"]');
    const clickTarget = link.contains(hit) && (!nestedControl || !link.contains(nestedControl)) ? hit : link;
    await pressScanTimestamp(job, scope, link, clickTarget);
    const openUntil = Math.min(job.expiresAt, Date.now() + 7000);
    let matched = null;
    while (Date.now() < openUntil) {
      check(job);
      const here = target(location.href);
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
      const inner = dialogs.filter(dialog => !dialogs.some(other => other !== dialog && dialog.contains(other)));
      if (inner.length > 1) throw failure('scan_modal_ambiguous', 'Scan dihentikan: ada beberapa dialog Facebook.');
      if (here?.post && inner.length === 1) {
        const dialog = inner[0];
        const boundaryRoot = postRoot(dialog, { target:here.url });
        const messages = [...dialog.querySelectorAll(storySelector)].filter(node => visible(node)
          && !node.parentElement?.closest(storySelector) && node.closest('[role="dialog"]') === dialog
          && !nestedComment(node, dialog, boundaryRoot));
        const modalAuthors = scanHeaderAuthors(dialog, boundaryRoot);
        if (messages.length > 1 || messages.length === 1 && !scanStoryMatches(sourceText, norm(messages[0].textContent))
          || modalAuthors.size > 1 || modalAuthors.size === 1 && !modalAuthors.has(author)) {
          throw failure('scan_modal_mismatch', 'Scan dihentikan: isi atau penulis dialog tidak cocok dengan postingan yang dibuka.');
        }
        const close = messages.length === 1 && modalAuthors.size === 1 ? scanDialogClose(dialog, boundaryRoot) : null;
        if (close) { matched = { dialog, close, boundaryRoot, url:here.url }; break; }
      }
      await sleep(150);
    }
    if (!matched) throw failure('scan_modal_unresolved', 'Scan dihentikan: tautan atau kontrol tutup postingan belum dapat dipastikan.');
    check(job);
    if (!matched.dialog.isConnected || !enabled(matched.close) || target(location.href)?.url !== matched.url
      || scanDialogClose(matched.dialog, matched.boundaryRoot) !== matched.close) throw failure('scan_modal_changed', 'Dialog berubah selama scan.');
    matched.close.click();
    const closeUntil = Math.min(job.expiresAt, Date.now() + 5000);
    while (Date.now() < closeUntil) {
      check(job);
      const here = target(location.href);
      if (here && !here.post && here.group === wanted.group
        && ![...document.querySelectorAll('[role="dialog"]')].some(visible)) return { url:matched.url, preview:sourceText.slice(0, 220) };
      if (here?.post && here.url !== matched.url) throw failure('scan_modal_changed', 'Halaman berubah saat menutup postingan hasil scan.');
      await sleep(150);
    }
    throw failure('scan_feed_not_restored', 'Scan dihentikan: halaman grup belum kembali setelah menutup postingan.');
  }

  function findFeedContext(job, withComposer = true) {
    const wanted = target(job.target);
    if (!wanted?.post) return null;
    const semantic = articles().filter(article => visible(article) && hasPostPermalink(article, wanted));
    if (semantic.length) return semantic.length === 1 ? semantic[0] : null;
    const plain = plainPostContexts(wanted.group, wanted.url, withComposer, job);
    return plain.length === 1 ? plain[0] : null;
  }

  function hasLargeImage(root) {
    return [...root.querySelectorAll('img')].some(i => visible(i) && (i.naturalWidth > 120 || i.width > 120));
  }

  function findExactPostArticle(job) {
    return findFeedContext(job);
  }

  function hasPostPermalink(article, wanted) {
    const refs = postHeaderRefs(article, wanted.group);
    return refs.size === 1 && refs.has(wanted.url);
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

  function feedItemWrapper(node, context, root) {
    // A feed can wrap each semantic post in a listitem. That wrapper is not
    // a comment, but a listitem inside a comment list still is. Only permit
    // this structural wrapper around a complete, top-level semantic post.
    if (context !== root || !root.matches('[role="article"]')
      || !node.matches('[role="listitem"],li') || !node.contains(root)) return false;
    const message = story(root), feed = node.closest('[role="feed"]');
    if (!message || message.closest(commentSelector) !== root || !feed
      || root.matches(commentBoundarySelector) || root.parentElement?.closest('[role="article"],[role="dialog"]')) return false;
    for (let ancestor = root.parentElement; ancestor && ancestor !== feed; ancestor = ancestor.parentElement) {
      if (ancestor.matches(`${commentBoundarySelector},[role="article"],[role="dialog"],[role="list"]`)) return false;
    }
    return true;
  }

  function nestedComment(element, context, root) {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.matches(commentBoundarySelector)) return true;
      if (node === context || node === root) continue;
      // A semantic comment can wrap a nested dialog. Continue beyond the
      // selected dialog instead of declaring its reply editor a post root.
      const outerStory = !context.contains(node) && node.matches('[role="article"]') ? story(node) : null;
      if (outerStory && !context.contains(outerStory) && !node.parentElement?.closest('[role="article"]')) continue;
      if (feedItemWrapper(node, context, root)) continue;
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
      const sameTarget = here?.url === wanted?.url || job.useExistingFeed === true && job.payload?.adminSelected === true
        && here && !here.post && wanted?.post && here.group === wanted.group && hasPostPermalink(context, wanted)
        && ![...document.querySelectorAll('[role="dialog"]')].some(visible);
      return sameTarget && context.isConnected && editor.isConnected && input.isConnected
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
      && !node.contains(composer) && !composer.contains(node) && !story(node)
      && !node.closest('[data-reply-thread],[data-comment-thread]'));
    return nodes.filter(node => !nodes.some(parent => parent !== node && parent.contains(node)));
  }

  function commentOwnsNode(comment, element) {
    for (let node = element; node && node !== comment; node = node.parentElement) {
      if (node.matches(`${commentBoundarySelector},[role="article"],form`)) return false;
      // Footer status listitems are metadata, while a nested listitem with
      // its own author/editor is a reply and cannot describe this comment.
      if (node.matches('[role="listitem"],li') && (node.querySelector(editorSelector)
        || [...node.querySelectorAll('a[href]')].some(link => commentActorKey(link.href)))) return false;
    }
    return comment.contains(element);
  }

  function commentKey(comment, wanted = null) {
    const explicit = comment.getAttribute('data-comment-id') || comment.getAttribute('data-commentid');
    const ids = new Set(/^[1-9]\d{0,39}$/.test(explicit || '') ? [explicit] : []);
    for (const link of comment.querySelectorAll('a[href]')) {
      if (!commentOwnsNode(comment, link)) continue;
      const url = new URL(link.href, location.href), parsed = target(link.href);
      if (!parsed?.post || wanted && parsed.url !== wanted.url) continue;
      if (url.searchParams.has('reply_comment_id')) return '';
      const id = url.searchParams.get('comment_id');
      // React's optimistic client:UUID is not a persisted Facebook comment.
      if (/^[1-9]\d{0,39}$/.test(id || '')) ids.add(id);
    }
    return ids.size === 1 ? `id:${[...ids][0]}` : '';
  }

  function commentPhotoIds(comment) {
    const ids = new Set();
    for (const link of comment.querySelectorAll('a[href]')) {
      if (!visible(link) || !commentOwnsNode(comment, link) || !mediaImages(link).length) continue;
      const url = new URL(link.href, location.href), id = url.searchParams.get('fbid');
      if (url.protocol === 'https:' && ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)
        && !url.username && !url.password && !url.port && /^\/photo(?:\.php|\/)\/?$/.test(url.pathname)
        && /^[1-9]\d{0,39}$/.test(id || '')) ids.add(id);
    }
    return [...ids].sort().slice(0, 8);
  }

  function commentModeration(comment) {
    const rejected = /^(?:(?:komentar(?: anda)?|your comment|comment)\s+)?(?:ditolak|rejected|declined)$/i;
    const pending = /^(?:(?:komentar(?: anda)?|your comment|comment)\s+)?(?:menunggu persetujuan(?: admin)?|menunggu persetujuan admin grup|pending(?: approval)?|awaiting approval)$/i;
    const feedback = /^(?:lihat masukan|lihat umpan balik|see feedback|view feedback)$/i;
    const states = new Set();
    for (const control of comment.querySelectorAll('button,[role="button"],[role="status"],[role="alert"],[role="listitem"],li')) {
      if (!visible(control) || !commentOwnsNode(comment, control)
        || control.closest(`${storySelector},[data-comment-body],[data-comment-text],blockquote,[contenteditable="true"]`)) continue;
      const text = label(control);
      if (!rejected.test(text) && !pending.test(text)) {
        if (text && control.matches('[role="status"],[role="alert"]')) states.add('uncertain');
        continue;
      }
      if (control.matches('[role="listitem"],li')) {
        // An ordinary comment can literally say "Ditolak". Accept a list
        // label only in its own metadata list next to Facebook's feedback UI.
        let metadata = null;
        for (let parent = control.parentElement, depth = 0; parent && parent !== comment && depth < 3; parent = parent.parentElement, depth++) {
          if (parent.querySelector(`${storySelector},${editorSelector},[role="article"],[data-comment-id],[data-commentid],[data-comment-body],[data-comment-text]`)
            || mediaImages(parent).length || [...parent.querySelectorAll('a[href]')].some(link => commentActorKey(link.href))) break;
          if (buttons(parent).some(button => !control.contains(button) && commentOwnsNode(comment, button) && feedback.test(label(button)))) { metadata = parent; break; }
        }
        if (!metadata) { states.add('uncertain'); continue; }
      }
      states.add(rejected.test(text) ? 'failed' : 'pending');
    }
    return states.has('failed') ? 'failed' : states.has('pending') ? 'pending' : states.has('uncertain') ? 'uncertain' : '';
  }

  async function verifyComment(job, proof, expiresAt) {
    const wanted = target(job?.target);
    const end = Math.min(Number(job?.expiresAt) || 0, Number(expiresAt) || Date.now() + 18000, Date.now() + 18000);
    const finish = (status, stage, note) => ({ status, ref:wanted?.url, commentId:proof?.commentId, photoIds:proof?.photoIds,
      dispatched:true, stage, stages:['send_clicked','committed_comment_found',stage], note:`[stage:${stage}] ${note}`.slice(0,240) });
    if (job?.kind !== 'group_comment' || job.payload?.adminSelected !== true || !wanted?.post || proof?.ref !== wanted.url
      || !/^[1-9]\d{0,39}$/.test(proof?.commentId || '') || !Array.isArray(proof.photoIds) || !proof.photoIds.length
      || proof.photoIds.length > 8 || new Set(proof.photoIds).size !== proof.photoIds.length
      || proof.photoIds.some(id => typeof id !== 'string' || !/^[1-9]\d{0,39}$/.test(id))) {
      return finish('uncertain','verification_inconclusive','Bukti komentar belum lengkap. Tidak dikirim ulang.');
    }
    let stableSince = 0;
    while (Date.now() < end) {
      // Sending already occurred. STOP stops future dispatches, but this
      // isolated read-only check must still report what Facebook retained.
      if (target(location.href)?.url !== wanted.url) return finish('uncertain','verification_inconclusive','Halaman verifikasi berubah. Tidak dikirim ulang.');
      if ([...document.querySelectorAll('[role="alert"],[role="dialog"]')].some(element => /temporarily blocked|dibatasi sementara|confirm your identity|konfirmasi identitas|security check|pemeriksaan keamanan/i.test(element.textContent))) {
        return finish('uncertain','verification_inconclusive','Facebook membatasi pemeriksaan hasil. Tidak dikirim ulang.');
      }
      const context = document.readyState === 'complete' && (findCommentContext(job)
        || ![...document.querySelectorAll('[role="dialog"]')].some(visible) && findFeedContext(job, false));
      if (context) {
        const root = postRoot(context, job), editor = context.querySelector(editorSelector) || document.createElement('div');
        const groups = new Set([...root.querySelectorAll('a[href]')].map(link => target(link.href)).filter(ref => ref?.post).map(ref => ref.group));
        const headers = new Set([...groups].flatMap(group => [...postHeaderRefs(root, group)]));
        const messages = [...root.querySelectorAll(storySelector)].filter(node => visible(node)
          && !node.parentElement?.closest(storySelector) && !nestedComment(node, root, root));
        if (headers.size > 1 || headers.size === 1 && !headers.has(wanted.url) || messages.length !== 1) {
          return finish('uncertain','verification_inconclusive','Konteks postingan pada halaman verifikasi tidak tunggal. Tidak dikirim ulang.');
        }
        const matching = topLevelComments(context, root, editor).filter(comment => visible(comment)
          && commentKey(comment, wanted) === `id:${proof.commentId}`
          && proof.photoIds.every(id => commentPhotoIds(comment).includes(id)));
        if (matching.length === 1) {
          const state = commentModeration(matching[0]);
          if (state === 'failed') return finish('failed','comment_rejected','Facebook menolak komentar melalui moderasi grup. Tidak dikirim ulang.');
          if (state === 'pending') return finish('pending','comment_pending','Komentar menunggu persetujuan admin grup. Tidak dikirim ulang.');
          if (state === 'uncertain') return finish('uncertain','verification_inconclusive','Facebook menampilkan status komentar yang belum dapat dipastikan. Tidak dikirim ulang.');
          stableSince ||= Date.now();
          if (Date.now() - stableSince >= 4500) return finish('sent','verified_new_comment','Komentar dan foto terlihat pada pemeriksaan baru tanpa status ditolak atau menunggu persetujuan.');
        } else stableSince = 0;
      } else stableSince = 0;
      await sleep(300);
    }
    return finish('uncertain','verification_inconclusive','Hasil komentar belum terkonfirmasi pada halaman baru. Tidak dikirim ulang.');
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

  function commentActorKey(href) {
    try {
      const url = new URL(href, location.href), user = /^\/groups\/[a-zA-Z0-9._-]+\/user\/([1-9]\d*)\/?$/.exec(url.pathname);
      if (url.protocol !== 'https:' || !['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)
        || url.username || url.password || url.port) return '';
      return user ? `/profile.php?id=${user[1]}` : actorKey(href);
    } catch { return ''; }
  }

  function composerCleared(editor, scope, preview) {
    const text = norm(editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent);
    const previews = mediaImages(scope).filter(img => img.closest('[data-attachment-preview]')
      || /^(blob:|data:image\/)/i.test(img.currentSrc || img.src));
    return !text && previews.length === 0 && (!preview.isConnected || !scope.contains(preview) || !visible(preview))
      && !scope.querySelector('[role="progressbar"]');
  }

  async function scanAllPosts(groupUrl, scanToken = '') {
    cancelled = false;
    const wanted = target(groupUrl);
    const here = target(location.href);
    if (!wanted || wanted.post || !here || here.post || here.group !== wanted.group) throw new Error('Halaman grup tidak cocok untuk scan.');
    if (/checkpoint|captcha|login/.test(location.pathname) || [...document.querySelectorAll('[role="alert"],[role="dialog"]')].some(e => /temporarily blocked|dibatasi sementara|confirm your identity|konfirmasi identitas|security check|pemeriksaan keamanan/i.test(e.textContent))) {
      throw new Error('Facebook meminta pemeriksaan keamanan/pembatasan.');
    }
    const found = new Map();
    const hydrated = new WeakMap();
    const openedLinks = new WeakSet();
    const completedCards = new Set();
    const checkedMedia = new Set();
    const scanDiagnostics = { mediaCandidates:0, checkedMedia:0, verifiedMedia:0, lastVerifyStage:'not_attempted' };
    let openedCount = 0;
    let idleRounds = 0;
    const deadline = Date.now() + 45000;
    const scanJob = { kind: 'group_scan', target: groupUrl, expiresAt: deadline };
    // A complete document can still be waiting for Facebook's first feed card
    // or timestamp permalink. Empty initial polls must not end the scan early.
    while (!cancelled && Date.now() < deadline && (!found.size || idleRounds < 5)) {
      check(scanJob);
      if (target(location.href)?.post) throw failure('target_changed', 'Halaman bukan tujuan scan grup.');
      hydratePostHeaders(wanted.group, hydrated);
      check(scanJob);
      const before = found.size;
      for (const a of scanPostContexts(wanted.group)) {
        const ref = postUrlFromArticle(a, wanted.group);
        if (!ref || found.has(ref)) continue;
        const message = norm(story(a)?.textContent || a.textContent || '');
        found.set(ref, { url: ref, preview: message.slice(0, 220) || 'Postingan tanpa teks' });
      }
      // Give ordinary hover hydration time first. If it never reveals a URL,
      // resolve one reviewed card by its timestamp modal, then return to feed.
      // Each link is opened at most once and one scan has a bounded budget.
      if (scanToken && deadline - Date.now() > 12000) {
        const media = scanMediaCandidates(wanted.group);
        scanDiagnostics.mediaCandidates = Math.max(scanDiagnostics.mediaCandidates, media.length);
        const candidate = media.find(item => !found.has(item.proof.url) && !checkedMedia.has(item.proof.url));
        if (candidate) {
          checkedMedia.add(candidate.proof.url);
          scanDiagnostics.checkedMedia = checkedMedia.size;
          const result = await chrome.runtime.sendMessage({ type:'CP_LOKER_VERIFY_SCAN_MEDIA', token:scanToken, proof:candidate.proof });
          scanDiagnostics.lastVerifyStage = typeof result?.stage === 'string' ? result.stage.slice(0, 60) : result?.verified ? 'verified' : 'document_unverified';
          if (cancelled) return { items:[...found.values()], stopped:true, scanDiagnostics };
          check(scanJob);
          // Confirm that the source card is still exactly the card reviewed
          // before asynchronous verification; rerenders or caption edits fail.
          const current = candidate.scope.isConnected && scanMediaScope(candidate.scope, wanted.group);
          if (result?.verified === true && result.url === candidate.proof.url && current
            && JSON.stringify(current.proof) === JSON.stringify(candidate.proof)) {
            found.set(result.url, { url:result.url, preview:candidate.proof.caption.slice(0, 220) });
            scanDiagnostics.verifiedMedia++;
          }
        }
      }
      if (!scanToken && openedCount < 12 && deadline - Date.now() > 12000
        && ![...document.querySelectorAll('[role="dialog"]')].some(visible)) {
        const candidate = lazyPostHeaders(wanted.group).map(candidate => ({ ...candidate,
          key:[...scanHeaderAuthors(candidate.scope)].join('|') + '\n' + norm(story(candidate.scope)?.textContent) }))
          .find(({ scope, link, key }) => !openedLinks.has(link) && !completedCards.has(key)
            && hydrated.has(link) && Date.now() - hydrated.get(link).first >= 3500 && scanHeaderAuthors(scope).size === 1);
        if (candidate) {
          openedLinks.add(candidate.link);
          openedCount++;
          try {
            const resolved = await resolveScanHeader(scanJob, candidate);
            if (resolved) {
              completedCards.add(candidate.key);
              if (!found.has(resolved.url)) found.set(resolved.url, resolved);
            }
          } catch (error) {
            if (cancelled && error.code === 'cancelled') return { items:[...found.values()], stopped:true };
            throw error;
          }
        }
      }
      idleRounds = found.size > 0 && found.size === before ? idleRounds + 1 : 0;
      if (found.size) window.scrollBy(0, innerHeight * .9);
      await sleep(900);
    }
    if (!found.size && !cancelled) {
      const hasCards = scanPostContexts(wanted.group).some(visible);
      const error = failure(hasCards ? 'scan_layout_unrecognized' : 'scan_feed_not_ready', hasCards
        ? 'Postingan terlihat tetapi tautan postingannya belum dikenali. Buka halaman Diskusi grup, lalu scan ulang.'
        : 'Feed grup belum terbaca setelah 45 detik. Pastikan postingan tampil di tab Facebook, lalu scan ulang.');
      error.scanDiagnostics = scanDiagnostics;
      throw error;
    }
    return { items: [...found.values()], scanDiagnostics };
  }

  async function run(job) {
    cancelled = false;
    if (job.kind !== 'group_comment') check(job);

    if (job.kind === 'group_scan') {
      await dispatch(job);
      const found = new Set();
      const hydrated = new WeakMap();
      const scanUntil = Math.min(job.expiresAt - 15000, Date.now() + 105000);
      let idleRounds = 0;
      while (Date.now() < scanUntil && idleRounds < 4) {
        check(job);
        hydratePostHeaders(target(job.target).group, hydrated);
        check(job);
        const before = found.size;
        for (const a of scanPostContexts(target(job.target).group)) {
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
          keys: new Set(existingComments.map(comment => commentKey(comment, target(job.target))).filter(Boolean)),
          media: new Set(existingComments.flatMap(comment => mediaImages(comment).map(mediaKey)).filter(Boolean)),
        };
        // Compare the single composer actor only in memory; SVG avatars and
        // group/user profile aliases carry the same public account identity.
        const actorLinks = new Set([...scope.querySelectorAll('a[href]')].filter(link => link.querySelector('img,svg'))
          .map(link => commentActorKey(link.href)).filter(Boolean));
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
        const committed = await waitFor(job, () => {
          if (!composerCleared(editor, scope, preview)) return null;
          const comments = topLevelComments(context, root, scope);
          if (comments.length <= beforeComments.nodes.size) return null;
          const candidates = comments.filter(comment => {
            const key = commentKey(comment, target(job.target));
            return !beforeComments.nodes.has(comment) && !(key && beforeComments.keys.has(key));
          });
          // A concurrent photo comment or an optimistic client placeholder
          // cannot be silently substituted for the comment just submitted.
          if (candidates.length !== 1 || actorLinks.size > 1) return null;
          const comment = candidates[0], key = commentKey(comment, target(job.target));
          const authors = new Set([...comment.querySelectorAll('a[href]')].filter(link => commentOwnsNode(comment, link))
            .map(link => commentActorKey(link.href)).filter(Boolean));
          if (authors.size > 1 || actorLinks.size && (authors.size !== 1 || !actorLinks.has([...authors][0]))) return null;
          return key && mediaImages(comment).length && commentPhotoIds(comment).length ? comment : null;
        }, 18000, 'verification_inconclusive', 'Kirim sudah dicoba, tetapi komentar foto baru belum terkonfirmasi. Periksa manual; tidak dikirim ulang.');
        mark('committed_comment_found');
        return { ...result('verify_comment','Komentar memiliki ID tetap; memeriksa hasil moderasi pada halaman baru.',target(job.target).url),
          commentId:commentKey(committed, target(job.target)).slice(3), photoIds:commentPhotoIds(committed) };
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
    if (m?.type === 'CP_LOKER_VERIFY_COMMENT') {
      verifyComment(m.job, m.proof, m.expiresAt).then(respond).catch(() => respond({ status:'uncertain',ref:m.proof?.ref,
        commentId:m.proof?.commentId,photoIds:m.proof?.photoIds,dispatched:true,stage:'verification_inconclusive',
        note:'[stage:verification_inconclusive] Hasil komentar belum terkonfirmasi. Tidak dikirim ulang.' }));
      return true;
    }
    if (m?.type === 'CP_LOKER_PROBE_FEED') {
      // Read-only probe: the worker still checks STOP and obtains server
      // preflight before any approved job can attach or submit a comment.
      const job = m.job, here = target(location.href), wanted = target(job?.target);
      const context = job?.kind === 'group_comment' && job.payload?.adminSelected === true && job.expiresAt > Date.now()
        && here && !here.post && wanted?.post && here.group === wanted.group
        && ![...document.querySelectorAll('[role="dialog"]')].some(visible) ? findFeedContext(job) : null;
      respond({ ready: !!context && classifyComposers(context, job).accepted.length === 1 });
      return;
    }
    if (m?.type === 'CP_LOKER_SCAN_ALL') {
      scanAllPosts(m.group, m.token).then(respond).catch(e => respond({ error: e.message, items: [], ...(e.scanDiagnostics ? { scanDiagnostics:e.scanDiagnostics } : {}) }));
      return true;
    }
    if (m?.type === 'CP_LOKER_VERIFY_SCAN_DOCUMENT') {
      verifyScanMedia(m.proof, m.expiresAt).then(respond).catch(() => respond({ verified:false }));
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
