'use strict';
const cp = url => { try { const u = new URL(url); return ((u.protocol === 'https:' && !u.port && ['www.comeplayers.com','comeplayers.com'].includes(u.hostname)) || u.origin === 'http://localhost:3000') && !u.username && !u.password && /^\/admin\/lowongan\/?$/.test(u.pathname); } catch { return false; } };
const fb = url => { try { const u = new URL(url); return u.protocol === 'https:' && !u.port && ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(u.hostname) && /^\/groups\/[a-zA-Z0-9._-]+(?:\/(?:posts|permalink)\/\d+)?\/?$/.test(u.pathname) && !u.username && !u.password; } catch { return false; } };
let busy = false;
let cancelEpoch = 0;
let controllerTab = null;
let scanSession = null;
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
async function diagnoseReading() {
  const { facebookTab } = await chrome.storage.local.get('facebookTab');
  const tab = facebookTab ? await chrome.tabs.get(facebookTab).catch(() => null) : null;
  if (!tab || !fb(tab.url) || tab.pendingUrl) throw new Error('Hubungkan tab grup Facebook yang sudah selesai dimuat terlebih dahulu.');
  const expectedPath = new URL(tab.url).pathname;
  const [execution] = await chrome.scripting.executeScript({ target: { tabId: facebookTab }, args: [expectedPath], func: expected => {
    // This diagnostic reads public DOM structure only. It never focuses,
    // dispatches events, navigates, reads private framework state, or sends.
    if (location.protocol !== 'https:' || !['www.facebook.com', 'web.facebook.com', 'm.facebook.com'].includes(location.hostname)
      || location.pathname !== expected) return { error: 'Halaman berubah selama pemeriksaan.' };
    const storySelectors = ['[data-ad-preview="message"]', '[data-ad-comet-preview="message"]', '[data-ad-rendering-role="story_message"]'];
    const storySelector = storySelectors.join(',');
    const editorSelector = '[contenteditable="true"][role="textbox"],[contenteditable="true"][data-lexical-editor="true"],textarea[role="textbox"]';
    const normalize = value => String(value || '').replace(/[\u034f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    const timeOnly = value => {
      const text = normalize(value);
      const match = text.match(/^(?:baru saja|just now|kemarin|yesterday|hari ini|today|(?:sekitar\s+)?se(?:detik|menit|jam|hari|minggu|bulan|tahun)(?:\s+yang\s+lalu)?\b|\d+\s*(?:detik|menit|mnt|jam|hari|minggu|bulan|tahun|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|[smhdwyj])(?=\b|lalu\b|ago\b)|(?:\d{1,2}\s+)?(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|january|february|march|may|june|july|august|october|december)\b(?:\s+\d{1,4})?)/i);
      return match ? match[0].slice(0, 70) : '';
    };
    const isVisible = node => node instanceof HTMLElement && !node.closest('[hidden],[aria-hidden="true"],[inert]')
      && !['hidden', 'collapse'].includes(getComputedStyle(node).visibility)
      && !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    const markerNodes = root => [...root.querySelectorAll(storySelector)].filter(node => isVisible(node) && !node.parentElement?.closest(storySelector));
    const structure = node => {
      const rect = node.getBoundingClientRect(), ad = {};
      for (const name of ['data-ad-preview', 'data-ad-comet-preview', 'data-ad-rendering-role']) {
        if (node.hasAttribute(name)) ad[name] = /^[a-z_ -]{0,60}$/i.test(node.getAttribute(name)) ? node.getAttribute(name) : '[value omitted]';
      }
      return { tag: node.tagName.toLowerCase(), role: (node.getAttribute('role') || '').slice(0, 40), ad,
        visible: isVisible(node), hidden: !!node.closest('[hidden],[aria-hidden="true"],[inert]'),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        visibleStories: markerNodes(node).length, links: node.querySelectorAll('a[href]').length };
    };
    const safePath = link => {
      try {
        const url = new URL(link.href, location.href);
        if (!['www.facebook.com', 'web.facebook.com', 'm.facebook.com', 'facebook.com'].includes(url.hostname)) return '[external path omitted]';
        return /^\/groups\/[a-zA-Z0-9._-]+(?:\/(?:posts|permalink)\/[a-zA-Z0-9]+)?\/?$/.test(url.pathname)
          || /^\/(?:profile|photo|story|permalink)\.php$/.test(url.pathname) || /^\/photo\/?$/.test(url.pathname)
          ? url.pathname.slice(0, 220) : '[profile or other path omitted]';
      } catch { return '[invalid path]'; }
    };
    const commentBoundary = '[data-comment-id],[data-commentid],[data-ad-rendering-role="comment"],[data-comment-list],[data-reply-thread],[data-comment-thread]';
    const nestedComment = (element, card) => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        if (node.matches(commentBoundary)) return true;
        if (node === card) continue;
        if (node.matches('[role="article"],[role="listitem"],li')) {
          const outerFeedItem = card.matches('[role="article"]') && node.contains(card)
            && node.matches('[role="listitem"],li') && node.closest('[role="feed"]')
            && !card.matches(commentBoundary) && !card.parentElement?.closest('[role="article"],[role="dialog"]');
          if (!outerFeedItem) return true;
        }
      }
      return false;
    };
    const publicActor = link => {
      try {
        const url = new URL(link.href, location.href);
        if (url.protocol !== 'https:' || !['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)) return '';
        const groupUser = /^\/groups\/[^/]+\/user\/(\d+)\/?$/.exec(url.pathname);
        if (groupUser) return `/profile.php?id=${groupUser[1]}`;
        if (url.pathname === '/profile.php') return /^\d+$/.test(url.searchParams.get('id') || '') ? '/profile.php?id='+url.searchParams.get('id') : '';
        if (/^\/(photo|story|permalink|l)\.php$/.test(url.pathname)) return '';
        if (/^\/people\/[^/]+\/\d+\/?$/.test(url.pathname)) return url.pathname.replace(/\/$/, '');
        return /^\/[a-zA-Z0-9._-]+\/?$/.test(url.pathname)
          && !/^\/(groups|photo|photos|watch|marketplace|notifications|home|me|reel|reels|login|help|messages)\/?$/.test(url.pathname)
          ? url.pathname.replace(/\/$/, '') : '';
      } catch { return ''; }
    };
    const group = /^\/groups\/([a-zA-Z0-9._-]+)/.exec(expected)?.[1] || '';
    const inspectMedia = (link, card) => {
      const url = new URL(link.href, location.href), images = [...link.querySelectorAll('img')];
      const fbid = url.searchParams.get('fbid') || '', set = url.searchParams.get('set') || '', affinity = url.searchParams.get('idorvanity') || '';
      const gm = /^gm\.(\d+)$/.exec(set), photoRoute = /^\/photo(?:\.php|\/)\/?$/.test(url.pathname);
      const facebookHost = url.protocol === 'https:' && ['www.facebook.com','web.facebook.com','m.facebook.com'].includes(url.hostname)
        && !url.username && !url.password && !url.port;
      const flags = { visible:isVisible(link), insideStory:!!link.closest(storySelector), insideForm:!!link.closest('form'),
        insideComment:nestedComment(link, card), photoRoute, facebookHost, hasImage:images.length > 0,
        bigVisibleImage:images.some(img => isVisible(img) && (img.width > 120 || img.naturalWidth > 120)),
        fbidNumeric:/^\d+$/.test(fbid), gmNumeric:!!gm, affinityNumeric:/^\d+$/.test(affinity), affinityMatches:affinity === group,
        hasCommentQuery:url.searchParams.has('comment_id'), hasReplyQuery:url.searchParams.has('reply_comment_id') };
      const blocked = [];
      for (const [name, failed] of Object.entries({ hidden:!flags.visible, story_body:flags.insideStory, form:flags.insideForm,
        comment:flags.insideComment, photo_route:!flags.photoRoute, facebook_host:!flags.facebookHost,
        large_image:!flags.bigVisibleImage, photo_id:!flags.fbidNumeric, group_post_id:!flags.gmNumeric,
        group_affinity:!flags.affinityMatches, comment_query:flags.hasCommentQuery || flags.hasReplyQuery })) if (failed) blocked.push(name);
      return { ...flags, ...(/^\d+$/.test(fbid) ? { fbid } : {}), ...(gm ? { groupPostId:gm[1] } : {}),
        ...(/^\d+$/.test(affinity) ? { groupAffinity:affinity } : {}), blocked,
        images:images.slice(0, 4).map(img => ({ visible:isVisible(img), width:img.width, height:img.height,
          naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight })) };
    };
    const scopedTimestamp = (link, card, seed) => {
      const ids = normalize(link.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
      const referenced = ids.map(id => document.getElementById(id)).filter(node => node && card.contains(node)
        && !node.contains(link) && !node.closest(storySelector) && !nestedComment(node, card)
        && (node.compareDocumentPosition(seed) & Node.DOCUMENT_POSITION_FOLLOWING));
      return !!(timeOnly(link.getAttribute('aria-label')) || timeOnly(link.innerText)
        || timeOnly(referenced.map(node => node.textContent).join(' '))
        || [...link.querySelectorAll('[aria-label]')].filter(isVisible).some(node => timeOnly(node.getAttribute('aria-label'))));
    };
    const sharedMarkers = (card, primaryStory) => {
      const selector = '[data-shared-post],[data-ad-rendering-role="shared_story"],blockquote';
      const closest = card.closest(selector), markers = new Set([...(closest ? [closest] : []), ...card.querySelectorAll(selector)]);
      return [...markers].slice(0, 12).map(marker => {
        const ownStories = markerNodes(marker), firstStory = marker.contains(primaryStory) ? primaryStory : ownStories[0];
        const ownHeader = firstStory ? [...marker.querySelectorAll('a[href]')].filter(link => isVisible(link)
          && !link.closest(storySelector) && !nestedComment(link, marker)
          && (link.compareDocumentPosition(firstStory) & Node.DOCUMENT_POSITION_FOLLOWING)) : [];
        return { ...structure(marker), matchedByClosest:marker === closest, insideRoot:card.contains(marker), containsRoot:marker.contains(card),
          insideComment:marker.matches(commentBoundary) || nestedComment(marker, card), insideForm:!!marker.closest('form'),
          insideStory:!!marker.closest(storySelector), containsPrimaryStory:marker === primaryStory || marker.contains(primaryStory),
          storyCount:ownStories.length, ownAuthorCount:new Set(ownHeader.map(publicActor).filter(Boolean)).size,
          ownTimestampCount:firstStory ? ownHeader.filter(link => scopedTimestamp(link, marker, firstStory)).length : 0 };
      });
    };
    const assessMediaScope = (card, seed) => {
      const links = [...card.querySelectorAll('a[href]')], eligibleHeader = links.filter(link => isVisible(link)
        && !link.closest(storySelector) && !nestedComment(link, card));
      const before = eligibleHeader.filter(link => link.compareDocumentPosition(seed) & Node.DOCUMENT_POSITION_FOLLOWING);
      const allActorLinks = eligibleHeader.filter(link => !link.closest('form') && publicActor(link));
      const headerAuthors = new Set(before.map(publicActor).filter(Boolean)), allAuthors = new Set(allActorLinks.map(publicActor));
      const afterActorCount = allActorLinks.filter(link => !(link.compareDocumentPosition(seed) & Node.DOCUMENT_POSITION_FOLLOWING)).length;
      const times = eligibleHeader.filter(link => scopedTimestamp(link, card, seed));
      const headings = [...card.querySelectorAll('h1,h2,[role="heading"]')].filter(heading => isVisible(heading)
        && !heading.closest(storySelector) && !heading.closest('form') && !nestedComment(heading, card)
        && (heading.compareDocumentPosition(seed) & Node.DOCUMENT_POSITION_FOLLOWING)
        && [...heading.querySelectorAll('a[href]')].some(publicActor));
      const headingCount = headings.filter(heading => !headings.some(other => other !== heading && other.contains(heading))).length;
      const media = links.map(link => inspectMedia(link, card)), qualified = media.filter(item => item.blocked.length === 0);
      const captionLength = String(seed.textContent || '').replace(/\s+/g, ' ').trim().length;
      const counts = { visible:isVisible(card), isolatedStories:markerNodes(card).length, captionLength, headerAuthors:headerAuthors.size,
        allAuthors:allAuthors.size, actorsAfterStory:afterActorCount, authorHeadings:headingCount, timestamps:times.length,
        photoRoutes:media.filter(item => item.photoRoute).length, largeImageLinks:media.filter(item => item.bigVisibleImage).length,
        qualifiedMedia:qualified.length, uniqueGroupPosts:new Set(qualified.map(item => item.groupPostId)).size };
      const shared = !!card.closest('[data-shared-post],[data-ad-rendering-role="shared_story"],blockquote')
        || !!card.querySelector('[data-shared-post],[data-ad-rendering-role="shared_story"],blockquote');
      const blocked = [];
      for (const [name, failed] of Object.entries({ hidden:!counts.visible, explicit_shared:shared,
        explicit_comment:card.matches(commentBoundary), story_count:counts.isolatedStories !== 1,
        caption_length:captionLength < 8 || captionLength > 9000, header_author:counts.headerAuthors !== 1,
        author_headings:headingCount > 1, timestamp_count:times.length !== 1, actor_after_story:afterActorCount > 0,
        author_count:counts.allAuthors !== 1, primary_media:counts.uniqueGroupPosts !== 1 })) if (failed) blocked.push(name);
      return { counts, blocked, sharedMarkers:sharedMarkers(card, seed) };
    };
    const describeLink = (link, card) => {
      const ids = normalize(link.getAttribute('aria-labelledby')).split(' ').filter(Boolean).slice(0, 4);
      const ariaTime = timeOnly(link.getAttribute('aria-label')), textTime = timeOnly(link.innerText);
      return { ...structure(link), pathname: safePath(link), publicActor:!!publicActor(link), media:inspectMedia(link, card),
        ...(ariaTime ? { ariaTime } : {}), ...(textTime ? { textTime } : {}),
        labelledBy: ids.map(id => {
          const node = document.getElementById(id);
          if (!node) return { id: id.slice(0, 100), found: false };
          const time = timeOnly(node.textContent);
          return { id: id.slice(0, 100), found: true, ...structure(node), insideCard: card.contains(node), insideLink: link.contains(node), ...(time ? { time } : {}) };
        }) };
    };
    const linkPriority = link => {
      const referenceTime = normalize(link.getAttribute('aria-labelledby')).split(' ').filter(Boolean).slice(0, 4)
        .some(id => timeOnly(document.getElementById(id)?.textContent));
      const timestamp = !!(timeOnly(link.getAttribute('aria-label')) || timeOnly(link.innerText) || referenceTime);
      const groupPath = /^\/groups\//.test(safePath(link));
      return Number(timestamp && groupPath) * 4 + Number(timestamp) * 2 + Number(groupPath);
    };
    const samples = [];
    const markers = markerNodes(document);
    const seeds = markers.length ? markers.slice(0, 6) : [...document.querySelectorAll(editorSelector)].filter(node => isVisible(node)
      && !node.closest('[data-comment-id],[data-commentid],[data-ad-rendering-role="comment"],[data-reply-thread],[data-comment-thread]')).slice(0, 6);
    for (const seed of seeds) {
      const chain = []; let card = seed.parentElement;
      for (let node = seed.parentElement; node && node !== document.body && chain.length < 12; node = node.parentElement) {
        chain.push(structure(node));
        const count = markerNodes(node).length;
        if (node.matches('[role="feed"],main,[role="main"]') || count > 1) break;
        card = node;
        if (node.matches('[role="article"],[role="dialog"]')) break;
      }
      if (!card) continue;
      const before = [...card.querySelectorAll('a[href]')].filter(link => !link.closest(storySelector)
        && (link.compareDocumentPosition(seed) & Node.DOCUMENT_POSITION_FOLLOWING))
        .sort((a, b) => linkPriority(b) - linkPriority(a));
      const after = [...card.querySelectorAll('a[href]')].filter(link => seed.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
      const mediaScopes = [];
      for (let scope = seed.parentElement; scope && scope !== document.body && mediaScopes.length < 12; scope = scope.parentElement) {
        if (scope.matches('[role="feed"],main,[role="main"],[role="dialog"]')) break;
        if (markerNodes(scope).length !== 1) break;
        mediaScopes.push({ ...structure(scope), ...assessMediaScope(scope, seed) });
        if (scope.matches('[role="article"]')) break;
      }
      samples.push({ kind: markers.length ? 'story' : 'editor', seed: structure(seed), ancestors: chain,
        root: structure(card), sharedMarkers:sharedMarkers(card, seed), mediaScopes, headerLinksBeforeSeed: before.slice(0, 8).map(link => describeLink(link, card)), headerLinksBeforeSeedTotal: before.length,
        postBodyLinks:after.slice(0, 12).map(link => describeLink(link, card)), postBodyLinksTotal:after.length });
    }
    return { readOnly: true, pathname: location.pathname, readyState: document.readyState,
      visibleCounts: Object.fromEntries([...storySelectors, '[role="feed"]', '[role="article"]', editorSelector]
        .map(selector => [selector, [...document.querySelectorAll(selector)].filter(isVisible).length])),
      isolatedStoryMarkers: markers.length, samples };
  } });
  if (!execution?.result) throw new Error('Struktur halaman belum dapat dibaca. Muat ulang tab Facebook lalu coba lagi.');
  const { scanDiagnostics } = await chrome.storage.local.get('scanDiagnostics');
  return { diagnostic: { ...execution.result, ...(scanDiagnostics ? { lastScan:scanDiagnostics } : {}) } };
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
  if (scanSession?.temporaryTab) await chrome.tabs.sendMessage(scanSession.temporaryTab, { type:'CP_LOKER_CANCEL' }).catch(() => undefined);
  return { stopped: true, adminStopRequested: notifyAdmin ? await requestAdminStop() : false };
}
async function validScanSource(session, sender) {
  if (!session || scanSession !== session || !busy || session.verifying === 'closed' || session.expiresAt <= Date.now()
    || session.epoch !== cancelEpoch || sender.id !== chrome.runtime.id || sender.tab?.id !== session.tab
    || sender.frameId !== undefined && sender.frameId !== 0 || await cancelled(session.epoch)) return false;
  const { facebookTab } = await chrome.storage.local.get('facebookTab');
  const tab = await chrome.tabs.get(session.tab).catch(() => null);
  return facebookTab === session.tab && tab && !tab.pendingUrl && tab.status === 'complete' && fb(tab.url)
    && new URL(tab.url).pathname.replace(/\/$/, '') === `/groups/${session.group}`;
}
async function closeScanTemporaryTab(session, id) {
  if (!id || session.temporaryTab !== id) return;
  session.temporaryTab = null;
  await chrome.tabs.remove(id).catch(() => undefined);
}
async function verifyScanMedia(message, sender) {
  const session = scanSession, proof = message.proof;
  if (!await validScanSource(session, sender) || session.verifying || message.token !== session.token
    || !proof || !fb(proof.url) || new URL(proof.url).pathname !== `/groups/${session.group}/posts/${new URL(proof.url).pathname.split('/')[4]}/`
    || !/^\d+$/.test(new URL(proof.url).pathname.split('/')[4] || '') || new URL(proof.url).hostname !== 'www.facebook.com'
    || new URL(proof.url).search || new URL(proof.url).hash || typeof proof.author !== 'string'
    || !/^\/(?:profile\.php\?id=\d+|[a-zA-Z0-9._-]+|people\/[^/?#]+\/\d+)$/.test(proof.author)
    || typeof proof.caption !== 'string' || proof.caption.length < 8 || proof.caption.length > 9000
    || !Array.isArray(proof.photos) || proof.photos.length < 1 || proof.photos.length > 8
    || proof.photos.some(photo => typeof photo !== 'string' || !/^\d+$/.test(photo))
    || session.checked.has(proof.url) || session.checked.size >= 12) return { verified:false, stage:'binding_or_candidate_rejected' };
  session.checked.add(proof.url);
  session.verifying = true;
  let temporaryTab = null;
  let lastStage = 'source_recheck';
  const expiresAt = Math.min(session.expiresAt, Date.now() + 18000);
  try {
    if (!await validScanSource(session, sender)) return { verified:false, stage:lastStage };
    // Only this operation owns this inactive tab. Never reuse or close an
    // existing Facebook tab, and never inject any sending job into it.
    const created = await chrome.tabs.create({ url:proof.url, active:false });
    if (!created?.id || created.id === session.tab) return { verified:false, stage:'tab_creation_failed' };
    temporaryTab = created.id;
    session.temporaryTab = temporaryTab;
    lastStage = 'canonical_tab_loading';
    const loadingUntil = Math.min(expiresAt - 6000, Date.now() + 10000);
    let ready = false;
    while (Date.now() < loadingUntil) {
      if (!await validScanSource(session, sender)) return { verified:false, stage:'source_changed_or_stop' };
      const tab = await chrome.tabs.get(temporaryTab);
      if (tab.status === 'complete') {
        if (!fb(tab.url) || new URL(tab.url).pathname.replace('/permalink/', '/posts/').replace(/\/$/, '') !== new URL(proof.url).pathname.replace(/\/$/, '')) return { verified:false, stage:'canonical_target_changed' };
        if (!tab.pendingUrl) { ready = true; break; }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready || !await validScanSource(session, sender)) return { verified:false, stage:lastStage };
    await chrome.scripting.executeScript({ target:{ tabId:temporaryTab }, files:['facebook.js'] });
    if (!await validScanSource(session, sender)) return { verified:false, stage:'source_changed_or_stop' };
    lastStage = 'public_document_matching';
    const result = await chrome.tabs.sendMessage(temporaryTab, { type:'CP_LOKER_VERIFY_SCAN_DOCUMENT', proof, expiresAt });
    if (!await validScanSource(session, sender)) return { verified:false, stage:'source_changed_or_stop' };
    const final = await chrome.tabs.get(temporaryTab);
    return result?.verified === true && result.url === proof.url && !final.pendingUrl && final.status === 'complete' && fb(final.url)
      && new URL(final.url).pathname.replace('/permalink/', '/posts/').replace(/\/$/, '') === new URL(proof.url).pathname.replace(/\/$/, '')
      ? { verified:true, url:proof.url, stage:'verified' } : { verified:false, stage:'public_document_mismatch' };
  } catch { return { verified:false, stage:lastStage + '_failed' }; }
  finally {
    await closeScanTemporaryTab(session, temporaryTab);
    if (scanSession === session) session.verifying = false;
  }
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
      await chrome.tabs.update(s.facebookTab, { url: group });
      if (!await waitTab(s.facebookTab, epoch, false, group)) break;
      await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
      if (await cancelled(epoch)) break;
      scanSession = { token:globalThis.crypto?.randomUUID?.() || `${epoch}:${Date.now()}:${Math.random()}`, tab:s.facebookTab,
        epoch, group:new URL(group).pathname.split('/')[2], expiresAt:Date.now() + 45000, verifying:false, temporaryTab:null, checked:new Set() };
      const result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_SCAN_ALL', group, token:scanSession.token });
      if (result?.scanDiagnostics) await chrome.storage.local.set({ scanDiagnostics:result.scanDiagnostics });
      scanSession = null;
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
    const session = scanSession;
    scanSession = null;
    if (session?.temporaryTab) await closeScanTemporaryTab(session, session.temporaryTab);
    busy = false;
  }
}
function canonicalCommentTarget(value) {
  if (!fb(value)) return '';
  const url = new URL(value), match = /^\/groups\/([a-zA-Z0-9._-]+)\/(?:posts|permalink)\/(\d+)\/?$/.exec(url.pathname);
  return match ? `https://www.facebook.com/groups/${match[1]}/posts/${match[2]}/` : '';
}
async function verifyCommentResult(job, initial, sourceTab, controller) {
  const uncertain = () => terminal('uncertain', 'verification_inconclusive', true,
    'Kirim sudah dicoba, tetapi hasil komentar belum terverifikasi setelah halaman baru dimuat. Periksa Facebook; tidak dikirim ulang.');
  const ref = canonicalCommentTarget(job.target);
  const numericId = value => typeof value === 'string' && /^[1-9]\d{0,39}$/.test(value);
  const active = (await chrome.storage.local.get('active')).active;
  if (job.kind !== 'group_comment' || job.payload?.adminSelected !== true || initial.dispatched !== true || initial.stage !== 'committed_comment_found'
    || !active || active.id !== job.id || active.lease !== job.lease || active.tab !== sourceTab
    || active.controller !== controller || active.dispatchGranted !== true || !ref || initial.ref !== ref
    || !numericId(initial.commentId) || !Array.isArray(initial.photoIds) || initial.photoIds.length < 1 || initial.photoIds.length > 8
    || initial.photoIds.some(photo => !numericId(photo)) || new Set(initial.photoIds).size !== initial.photoIds.length) return uncertain();
  const proof = { ref, commentId:initial.commentId, photoIds:[...initial.photoIds] };
  const expiresAt = Math.min(job.expiresAt, Date.now() + 25000);
  let temporaryTab = null;
  let proofTimer;
  const bound = tab => {
    if (!tab || tab.status !== 'complete' || tab.pendingUrl || canonicalCommentTarget(tab.url) !== ref) return false;
    const url = new URL(tab.url);
    return !url.searchParams.has('reply_comment_id') && (!url.searchParams.has('comment_id')
      || url.searchParams.getAll('comment_id').length === 1 && url.searchParams.get('comment_id') === proof.commentId);
  };
  try {
    if (expiresAt <= Date.now()) return uncertain();
    // A fresh, inactive document reveals moderation hidden by an optimistic
    // comment. Never reload the user's original tab or its newer draft.
    const created = await chrome.tabs.create({ url:`${ref}?comment_id=${proof.commentId}`, active:false });
    if (!Number.isInteger(created?.id) || created.id <= 0 || created.id === sourceTab || created.id === controller) return uncertain();
    temporaryTab = created.id;
    const loadingUntil = Math.min(expiresAt - 6000, Date.now() + 10000);
    let ready = false;
    while (Date.now() < loadingUntil) {
      const tab = await chrome.tabs.get(temporaryTab);
      if (tab.status === 'complete' && !tab.pendingUrl) {
        if (!bound(tab)) return uncertain();
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!bound(await chrome.tabs.get(temporaryTab))) return uncertain();
        ready = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready || Date.now() >= expiresAt) return uncertain();
    await chrome.scripting.executeScript({ target:{ tabId:temporaryTab }, files:['facebook.js'] });
    if (!bound(await chrome.tabs.get(temporaryTab))) return uncertain();
    // This handler only reads the exact committed comment. STOP blocks the
    // next send but must not conceal the outcome of the click already made.
    const result = await Promise.race([
      chrome.tabs.sendMessage(temporaryTab, { type:'CP_LOKER_VERIFY_COMMENT', job:{ ...job, expiresAt }, proof }),
      new Promise(resolve => { proofTimer = setTimeout(() => resolve(null), Math.max(1, expiresAt - Date.now())); }),
    ]);
    const expectedStage = { sent:'verified_new_comment', failed:'comment_rejected', pending:'comment_pending', uncertain:'verification_inconclusive' };
    if (!bound(await chrome.tabs.get(temporaryTab)) || Date.now() >= expiresAt
      || !result || !['sent','failed','pending','uncertain'].includes(result.status)
      || result.stage !== expectedStage[result.status] || result.dispatched !== true || result.ref !== ref || result.commentId !== proof.commentId
      || !Array.isArray(result.photoIds) || result.photoIds.length !== proof.photoIds.length
      || result.photoIds.some((photo, index) => photo !== proof.photoIds[index])) return uncertain();
    // Keep proof in memory only; Admin needs the final outcome and post URL.
    return { status:result.status, ref, dispatched:true, stage:result.stage,
      stages:Array.isArray(result.stages) ? result.stages.slice(-20) : [], note:String(result.note || '').slice(0, 250) };
  } catch { return uncertain(); }
  finally {
    if (proofTimer !== undefined) clearTimeout(proofTimer);
    if (temporaryTab !== null) await chrome.tabs.remove(temporaryTab).catch(() => undefined);
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
      await chrome.tabs.update(s.facebookTab, { url: job.target });
      if (!await waitTab(s.facebookTab, epoch, false, job.target)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
      if (await cancelled(epoch)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
      await chrome.tabs.update(s.facebookTab, { active: true });
    }
    stage = 'navigated';
    await chrome.scripting.executeScript({ target: { tabId: s.facebookTab }, files: ['facebook.js'] });
    if (await cancelled(epoch)) return terminal('cancelled', 'cancelled', false, 'STOP aktif sebelum pengiriman.');
    let result = await chrome.tabs.sendMessage(s.facebookTab, { type: 'CP_LOKER_RUN', job: { ...job, useExistingFeed } });
    if (result?.status === 'verify_comment') {
      result = await verifyCommentResult(job, result, s.facebookTab, controller);
    } else if (job.kind === 'group_comment' && ['sent','verify'].includes(result?.status)) {
      // Old content scripts cannot certify a comment from the optimistic DOM.
      result = terminal('uncertain', 'verification_inconclusive', true, 'Kirim mungkin sudah terjadi, tetapi bukti halaman baru belum tersedia. Periksa Facebook; tidak dikirim ulang.');
    } else if (result?.status === 'verify') {
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
  if (m?.type === 'CP_LOKER_VERIFY_SCAN_MEDIA' && sender.tab) {
    verifyScanMedia(m, sender).then(respond).catch(() => respond({ verified:false }));
    return true;
  }
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
      if (m.action === 'diagnose') return diagnoseReading();
      if (m.action === 'attach') { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id || !fb(tab.url)) throw new Error('Buka tab grup Facebook yang sudah login, lalu tekan Hubungkan.'); await chrome.storage.local.set({ facebookTab: tab.id }); }
      if (m.action === 'stop') await stop(true);
      if (m.action === 'clear') { await stop(); if (busy) throw new Error('Tunggu tugas aktif selesai.'); await chrome.storage.local.remove('active'); }
      return status();
    })().then(respond).catch(e => respond({ error: e.message })); return true;
  }
});
chrome.runtime.onStartup.addListener(() => { void chrome.storage.local.set({ cancelled: true, stopLatched: true }); });
