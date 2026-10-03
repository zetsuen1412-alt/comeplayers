"""Exercise the shipped content script against synthetic DOM, never Facebook.

Run with Python + Playwright. CHROMIUM_PATH optionally selects a local browser.
The only script adaptation replaces location with the synthetic target URL;
timers are accelerated in the isolated page, without replacing DOM behavior.
"""
from __future__ import annotations

import argparse
import hashlib
from html import escape
import json
import os
from pathlib import Path
import shutil
import sys
import time

EXTENSION = Path(__file__).resolve().parents[1]
LOCAL_DEPS = EXTENSION / ".test-deps" / "python"
if LOCAL_DEPS.exists():
    sys.path.insert(0, str(LOCAL_DEPS))

from playwright.sync_api import sync_playwright  # noqa: E402

GROUP = "https://www.facebook.com/groups/example/"
POST = GROUP + "posts/123/"
CDN_PREVIEW = 'https://static.xx.fbcdn.net/synthetic-lowongan/attachment-64.svg'
CDN_PREVIEW_BODY = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80"><rect width="64" height="80" fill="teal"/></svg>'
USER_PREVIEW = 'https://static.xx.fbcdn.net/synthetic-lowongan/user-draft-64.svg'
IMAGE = "data:image/svg+xml," + (
    "%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E"
    "%3Crect width='200' height='200' fill='teal'/%3E%3C/svg%3E"
)

BOOT = """
window.__realSetTimeout = window.setTimeout.bind(window);
window.__realClearTimeout = window.clearTimeout.bind(window);
const realNow = Date.now.bind(Date), epoch = realNow(), speed = 30;
Date.now = () => epoch + (realNow() - epoch) * speed;
window.setTimeout = (fn, ms, ...args) => __realSetTimeout(fn, Math.max(1, ms / speed), ...args);
const realInterval = window.setInterval.bind(window);
window.setInterval = (fn, ms, ...args) => realInterval(fn, Math.max(1, ms / speed), ...args);
window.listeners = []; window.dispatches = 0; window.sends = 0;
window.fileChanges = 0; window.enterEvents = 0; window.cameraClicks = 0;
window.removeClicks = 0;
window.chrome = {runtime: {id: 'fixture', onMessage: {addListener: f => listeners.push(f)},
  sendMessage: async m => {
    if (m.dispatch) { window.dispatches++; window.events.push('preflight'); }
    if (m.dispatch && window.replaceOnPreflight) {
      document.getElementById('photo-input').value='';
      document.querySelector('#preview img').src=window.__replacementURL;
    }
    if (m.dispatch && window.targetChangeOnPreflight) {
      document.querySelector('[data-fixture-post] > a').href='/groups/example/posts/999/';
    }
    return {allowed: window.allow !== false};
  }}};
window.events = [];
window.scrollBy = () => {};
document.addEventListener('keydown', e => { if (e.key === 'Enter') window.enterEvents++; });
"""

CSS = """
body { font:16px sans-serif; margin:0; }
article,[role=dialog] { padding:12px; border:1px solid #ddd; margin:8px; }
form,[data-composer] { padding:8px; border:1px solid #aaa; }
[contenteditable] { min-height:30px; border:1px solid black; padding:5px; }
[contenteditable]:empty::before { content:attr(aria-label); color:#555; }
button,[role=button] { padding:10px; display:inline-block; }
img[data-attachment-preview], [data-comment-id] img { width:200px; height:200px; }
[hidden] { display:none !important; }
"""


def article(post="123", message="Status biasa", href=None):
    link = href or f'/groups/example/posts/{post}/'
    return (f'<article role="article"><div data-ad-preview="message">{message}</div>'
            f'<a href="{link}">Waktu</a></article>')


def comment_fixture(*, modal=False, placeholder="Tulis komentar publik...",
                    reply_only=False, nested_reply=False, external_input=False,
                    deferred_input=False, input_accept="image/*", send=True,
                    icon_send=False, submit_send=False, enabled=True,
                    outcome="success", preview=True, attachment_delay=0,
                    enable_delay=0, two_composers=False, comments_disabled=False,
                    actor_mismatch=False, deep_wrappers=False, share_decoy=False,
                    nested_dialog=False, preview_sibling=False,
                    small_cdn_preview=False, stale_preview=False,
                    preview_outside=False, preview_reply=False, focus_send=False,
                    ambiguous_remove=False, user_text_during_upload=False,
                    replace_preview_on_focus=False, live_preview_structure=False):
    """Real DOM attachment/send handlers with an observable irreversible click."""
    root = '<div role="dialog" aria-label="Postingan fixture">' if modal else '<article role="article">'
    close = '</div>' if modal else '</article>'
    story = '<div data-ad-preview="message">Info loker apa aja</div><a href="/groups/example/posts/123/">Waktu</a>'
    comments = '<div id="comments" role="list" data-comment-list="true"><div role="listitem" data-comment-id="existing">Komentar sebelumnya</div></div>'
    if live_preview_structure:
        story='<h2>Postingan sintetis</h2>'+story
        comments=comments.replace('</div></div>','</div>'+''.join(f'<article role="article" data-comment-id="prior-{n}">Komentar sintetis</article>' for n in range(10))+'</div>')
    textbox = f'<div contenteditable="true" role="textbox" aria-label="{placeholder}" id="editor"></div>'
    if deep_wrappers:
        textbox = '<div>' * 6 + textbox + '</div>' * 6
    photo = '<button type="button" id="camera" aria-label="Lampirkan foto" aria-controls="photo-input">Foto</button>'
    file_input = f'<input id="photo-input" type="file" accept="{input_accept}" hidden>'
    send_html = ''
    if send and not focus_send:
        disabled = '' if enabled else ' disabled aria-disabled="true"'
        send_html = (f'<button id="send" type="{"submit" if submit_send else "button"}"'
                     f' aria-label="{"" if submit_send else "Kirim"}"{disabled}>'
                     f'{"➤" if icon_send or submit_send else "Kirim"}</button>')
    stale = f'<img src="{CDN_PREVIEW}" width="64" height="80" style="width:64px;height:80px">' if stale_preview else ''
    preview_html = '<div id="preview">'+stale+'</div>'
    remove = '<span id="remove-controls"></span>'
    external_preview = ''
    if preview_reply:
        comments = comments.replace('Komentar sebelumnya</div>', 'Komentar sebelumnya'+preview_html+remove+'</div>')
    elif preview_outside:
        external_preview = preview_html+remove
    composer = '' if comments_disabled else (
        '<form id="composer" role="presentation" onsubmit="return false" data-composer="true">'
        '<a aria-label="Profil Anda" href="/profile.php?id=100"><img alt="Avatar sintetis" width="32" height="32" '
        'src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3C/svg%3E">Profil</a>'
        + textbox + photo + ('' if external_input or deferred_input else file_input)
        + ('' if preview_sibling or preview_outside or preview_reply else preview_html+remove) + send_html + '</form>'
    )
    if preview_sibling:
        composer = '<div id="composer-shell">'+composer+preview_html+remove+'</div>'
    if live_preview_structure:
        composer='<div>'*10+'<div role="table">'+'<div>'*3+composer+'</div>'*3+'</div>'+'</div>'*10
    elif deep_wrappers:
        composer = '<div>' * 18 + composer + '</div>' * 18
    reply = ('<div role="listitem" data-comment-id="reply-parent">Komentar induk'
             '<form id="reply-composer"><div contenteditable="true" role="textbox" '
             'aria-label="Tulis jawaban..." id="wrong"></div>'
             '<button type="button" aria-label="Lampirkan foto">Foto</button>'
             '<input type="file" accept="image/*" hidden><button type="button" aria-label="Kirim">Kirim</button>'
             '</form></div>')
    if reply_only:
        composer = reply.replace('id="wrong"', 'id="editor"')
    elif nested_reply:
        comments = comments.replace('</div></div>', '</div>' + reply + '</div>')
    extra = ('<form data-composer="true"><div contenteditable="true" role="textbox" '
             'aria-label="Tulis komentar publik..."></div><input type="file" accept="image/*" hidden>'
             '<button type="button" aria-label="Kirim">Kirim</button></form>') if two_composers else ''
    external = file_input if external_input and not deferred_input else ''
    opts = json.dumps(dict(outcome=outcome, preview=preview, attachmentDelay=attachment_delay,
                           enableDelay=enable_delay, deferred=deferred_input,
                           accept=input_accept, actorMismatch=actor_mismatch,
                           smallCdnPreview=small_cdn_preview, focusSend=focus_send,
                           stalePreview=stale_preview, ambiguousRemove=ambiguous_remove,
                           userTextDuringUpload=user_text_during_upload,
                           replacePreviewOnFocus=replace_preview_on_focus))
    handler = """
const opts = OPTS, imageURL = IMAGE;
function media() { const i = document.createElement('img'); i.src = imageURL; return i; }
function attachment() {
  if (!opts.smallCdnPreview) { const i=media();i.setAttribute('data-attachment-preview','true');return i; }
  const i=document.createElement('img');i.src=CDN_URL;i.width=64;i.height=80;
  i.style.cssText='width:64px;height:80px';
  i.addEventListener('load',()=>{const rect=i.getBoundingClientRect();window.lastPreview={naturalWidth:i.naturalWidth,width:rect.width,height:rect.height,outsideForm:!document.getElementById('composer').contains(i)};});
  return i;
}
function addRemove(input) {
  const holder=document.getElementById('remove-controls');if(!holder||holder.children.length)return;
  for(let n=0;n<(opts.ambiguousRemove?2:1);n++) {
    const control=document.createElement('button');control.type='button';control.setAttribute('aria-label','Hapus foto');
    control.textContent='×';control.onclick=()=>{window.removeClicks++;preview.replaceChildren();input.value='';holder.replaceChildren();};
    holder.append(control);
  }
}
function bindInput(input) {
  input.addEventListener('change', () => {
    window.fileChanges++; window.events.push('attachment');
    window.lastFile = input.files[0] && {name:input.files[0].name, type:input.files[0].type, size:input.files[0].size};
    addRemove(input);
    if(opts.userTextDuringUpload) editor.textContent='Draf pengguna baru';
    setTimeout(() => {
      if (!input.files.length) return;
      if (opts.preview) preview.append(attachment());
      const enable = () => { if (window.send) { send.disabled = false; send.removeAttribute('aria-disabled'); } };
      if (opts.enableDelay) setTimeout(enable, opts.enableDelay); else enable();
    }, opts.attachmentDelay);
  });
}
const input = document.getElementById('photo-input'); if (input) {bindInput(input);if(opts.stalePreview)addRemove(input);}
if (window.camera) camera.onclick = () => {
  window.cameraClicks++;
  if (opts.deferred && !document.getElementById('photo-input')) {
    const input = document.createElement('input'); input.id = 'photo-input'; input.type = 'file';
    input.accept = opts.accept; input.hidden = true; document.querySelector('[role=dialog]').append(input); bindInput(input);
  }
};
function bindSend(control) { control.onclick = e => {
  e.preventDefault(); window.sends++; window.events.push('send');
    window.lastSendLabel=control.getAttribute('aria-label');
    // Capture the loaded thumbnail while it still belongs to the composer.
    // Its queued load event can run after submission removes the preview.
    if (opts.smallCdnPreview && preview.querySelector('img')) {
      const image=preview.querySelector('img'), rect=image.getBoundingClientRect();
      window.lastPreview={naturalWidth:image.naturalWidth,width:rect.width,height:rect.height,outsideForm:!document.getElementById('composer').contains(image)};
    }
  if (opts.outcome === 'success' || opts.outcome === 'nested' || opts.outcome === 'moved-preview') {
    const c = document.createElement('div'); c.setAttribute('role', 'listitem'); c.setAttribute('data-comment-id', 'new-comment');
    const actor = document.createElement('a'); actor.href = '/profile.php?id=' + (opts.actorMismatch ? '200' : '100'); actor.textContent='Profil';
    c.append(actor, opts.outcome === 'moved-preview' ? preview.querySelector('img') : media());
    (opts.outcome === 'nested' ? comments.querySelector('[data-comment-id]') : comments).append(c);
    editor.textContent = ''; preview.replaceChildren();
  } else if (opts.outcome === 'lazy-image') {
    document.querySelector('[role=dialog],article').append(media()); editor.textContent=''; preview.replaceChildren();
  } else if (opts.outcome === 'existing-media') {
    comments.querySelector('[data-comment-id]').append(media()); editor.textContent=''; preview.replaceChildren();
  } else if (opts.outcome === 'rerender-existing') {
    const original = comments.querySelector('[data-comment-id]'), replacement = original.cloneNode(true);
    const actor = document.createElement('a'); actor.href='/profile.php?id=100'; actor.textContent='Profil';
    replacement.append(actor,media()); original.replaceWith(replacement);
    const lazyComment = document.createElement('div'); lazyComment.setAttribute('role','listitem');
    lazyComment.setAttribute('data-comment-id','lazy-loaded-text'); lazyComment.textContent='Komentar teks dimuat belakangan';
    comments.append(lazyComment); editor.textContent=''; preview.replaceChildren();
  }
}; }
if (window.send) bindSend(send);
if (opts.focusSend) editor.addEventListener('focus', () => {
  if (!preview.querySelector('img') || document.getElementById('send')) return;
  if(opts.replacePreviewOnFocus) {input.value='';preview.querySelector('img').src=USER_CDN_URL;}
  const control=document.createElement('div');control.id='send';control.setAttribute('role','button');
  control.setAttribute('aria-label','Posting komentar');control.tabIndex=0;
  control.style.cssText='width:16px;height:16px;padding:0;display:inline-block';
  control.textContent='➤';document.getElementById('composer').append(control);bindSend(control);
});
""".replace('OPTS', opts).replace('IMAGE', json.dumps(IMAGE)).replace('USER_CDN_URL', json.dumps(USER_PREVIEW)).replace('CDN_URL', json.dumps(CDN_PREVIEW))
    decoy = ('<button aria-label="Kirim ini ke teman atau posting di profil Anda." '
             'onclick="window.sends++;">Bagikan</button>') if share_decoy else ''
    result = root + story + decoy + comments + composer + extra + external + external_preview + close
    if nested_dialog:
        result = '<div role="dialog" aria-label="Dialog luar">' + result + '</div>'
    return result + '<script>' + handler + '</script>'


def assert_equal(actual, expected, why):
    if actual != expected:
        raise AssertionError(f'{why}: expected {expected!r}, got {actual!r}')


def plain_article(post='123', message='Status biasa', href=None):
    return article(post, message, href).replace('<article role="article">', '<div data-fixture-post="true">').replace('</article>', '</div>')


def plain_comment_fixture(**options):
    return comment_fixture(**options).replace('<article role="article">', '<div data-fixture-post="true">', 1).replace('</article><script>', '</div><script>', 1)


def nested_reply_dialog_fixture():
    inner = comment_fixture(modal=True, placeholder='Tulis jawaban...')
    inner = inner.replace('<div data-ad-preview="message">Info loker apa aja</div><a href="/groups/example/posts/123/">Waktu</a>', '')
    inner = inner.replace('aria-label="Postingan fixture"', 'aria-label="Balas komentar"')
    return ('<div role="dialog" aria-label="Postingan fixture"><div data-ad-preview="message">Status biasa</div>'
            '<a href="/groups/example/posts/123/">Waktu</a><div role="list" data-comment-list="true">'
            '<article role="article" data-comment-id="parent-comment">Komentar induk' + inner + '</article></div></div>')


def reply_overlay_fixture():
    html = comment_fixture(modal=True)
    change = ("window.fileChanges++;const i=document.createElement('img');"
              "i.src="+json.dumps(IMAGE)+";i.setAttribute('data-attachment-preview','true');"
              "document.getElementById('inner-preview').append(i);")
    inner = ('<div role="dialog" aria-label="Balas komentar"><form onsubmit="return false">'
             '<div contenteditable="true" role="textbox" aria-label="Tulis jawaban..."></div>'
             '<button type="button" aria-label="Lampirkan foto">Foto</button>'
             '<input id="inner-input" type="file" accept="image/*" hidden onchange="'+escape(change, quote=True)+'">'
             '<div id="inner-preview"></div><button type="button" aria-label="Kirim" '
             'onclick="window.sends++;">Kirim</button></form></div>')
    return html.replace('</form></div><script>', '</form>'+inner+'</div><script>', 1)


def choose_executable():
    configured = os.environ.get('CHROMIUM_PATH')
    if configured:
        return configured
    candidates = [shutil.which('chromium'), shutil.which('chromium-browser'), shutil.which('google-chrome'),
                  r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                  r'C:\Program Files\Google\Chrome\Application\chrome.exe']
    return next((str(p) for p in candidates if p and Path(p).exists()), None)


def run_case(browser, script, case):
    context = browser.new_context()
    network_attempts = []
    def route_request(route):
        if route.request.url in (CDN_PREVIEW,USER_PREVIEW):
            if route.request.url == USER_PREVIEW and case.get('slow_replacement'):
                time.sleep(.15)
            route.fulfill(status=200, content_type='image/svg+xml', body=CDN_PREVIEW_BODY)
        else:
            network_attempts.append(route.request.url)
            route.abort()
    context.route('**/*', route_request)
    page = context.new_page()
    page.set_default_timeout(10000)
    html = case.get('html', '')
    page.set_content('<html><head><base href="https://www.facebook.com/"><style>' + CSS + '</style></head><body>' + html + '</body></html>')
    page.evaluate(BOOT)
    if case.get('overlay_ready'):
        assert_equal(page.evaluate("typeof document.getElementById('inner-input').onchange"), 'function', 'inner overlay fixture attachment handler is valid')
    page.evaluate('(a) => window.allow = a', case.get('allow', True))
    page.evaluate('({enabled,url})=>{window.replaceOnPreflight=enabled;window.__replacementURL=url}', {'enabled':case.get('replace_on_preflight',False),'url':USER_PREVIEW})
    page.evaluate('(u) => window.__fixtureURL = u', case.get('url', POST))
    page.evaluate('(enabled) => window.targetChangeOnPreflight = enabled', case.get('change_target', False))
    page.add_script_tag(content=script)
    job = page.evaluate("""({url, mime, selected, expired}) => {
      const canvas=document.createElement('canvas'); canvas.width=180; canvas.height=180;
      canvas.getContext('2d').fillRect(0,0,180,180);
      return {id:'job',lease:'lease',kind:'group_comment',target:url,
        payload:{adminSelected:selected},expiresAt:Date.now()+(expired ? -1 : 120000),
        banner:{mime,body:canvas.toDataURL(mime).split(',')[1]}};
    }""", dict(url=case.get('job_target', case.get('url', POST)), mime=case.get('mime', 'image/png'),
               selected=case.get('selected', True), expired=case.get('expired', False)))
    if case.get('banner_override') is not None:
        job['banner'] = case['banner_override']
    if case.get('missing_payload'):
        job.pop('payload')
    if case.get('use_existing_feed'):
        job['useExistingFeed'] = True
    if case.get('preexisting_file'):
        page.evaluate("()=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array([1,2,3])],'user-draft.png',{type:'image/png'}));document.getElementById('photo-input').files=transfer.files;}")
    started = time.monotonic()
    result = page.evaluate("""async ({job, scan, probe, cancel}) => {
      if (cancel) setTimeout(() => listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}), cancel);
      return await new Promise((resolve,reject) => {
        const timeout = __realSetTimeout(() => reject(new Error('fixture response timed out')),12000);
        const message = scan ? {type:'CP_LOKER_SCAN_ALL',group:job.target} : {type:probe ? 'CP_LOKER_PROBE_FEED' : 'CP_LOKER_RUN',job};
        listeners[0](message,{id:'fixture'},r => {__realClearTimeout(timeout);resolve(r)});
      });
    }""", dict(job=job, scan=case.get('scan', False), probe=case.get('probe', False), cancel=case.get('cancel', 0)))
    counters = page.evaluate('({dispatches,sends,fileChanges,enterEvents,cameraClicks,removeClicks,events,lastFile:window.lastFile,lastPreview:window.lastPreview,lastSendLabel:window.lastSendLabel})')
    try:
        assert_equal(network_attempts, [], 'all fixture page network requests are blocked')
        assert_equal(counters['dispatches'], case.get('dispatches', 0), 'preflight dispatch count')
        assert_equal(counters['sends'], case.get('sends', 0), 'irreversible send click count')
        assert_equal(counters['enterEvents'], 0, 'never synthesize Enter')
        if case.get('probe'):
            assert_equal(result.get('ready'), case['ready'], 'read-only feed probe readiness')
            assert_equal(counters['fileChanges'], 0, 'read-only probe never attaches an image')
        elif case.get('scan'):
            if case.get('scan_error'):
                assert_equal(isinstance(result.get('error'), str) and bool(result['error']), True, 'scan fails safely with a clear error')
            else:
                assert_equal(result.get('error'), None, 'scan error')
            assert_equal([item['url'] for item in result.get('items', [])], case['items'], 'canonical scan results')
        else:
            assert_equal(result.get('status'), case['status'], 'terminal status')
            assert_equal(result.get('dispatched'), bool(case.get('sends')), 'terminal result records actual send dispatch')
            if case.get('file_changes') is not None:
                assert_equal(counters['fileChanges'], case['file_changes'], 'file input change count')
            if case.get('remove_clicks') is not None:
                assert_equal(counters['removeClicks'], case['remove_clicks'], 'owned unsent attachment removal count')
            if case.get('stage'):
                assert_equal(result.get('stage'), case['stage'], 'precise guarded terminal stage')
            if case.get('preserved_text'):
                assert_equal(page.locator('#editor').inner_text(), case['preserved_text'], 'user draft is preserved')
            if case.get('preserved_file'):
                assert_equal(page.evaluate("document.getElementById('photo-input').files[0]?.name"), 'user-draft.png', 'preexisting file is preserved')
            if case.get('preserved_preview'):
                assert_equal(page.locator('#preview img').count(), 1, 'preexisting image is preserved')
                assert_equal(page.locator('#preview img').get_attribute('src'), CDN_PREVIEW, 'preexisting image source is preserved')
            if case.get('preserved_replacement'):
                assert_equal(page.locator('#preview img').count(),1,'user replacement image is preserved')
                assert_equal(page.locator('#preview img').get_attribute('src'),USER_PREVIEW,'user replacement source is preserved')
            if case.get('cleaned'):
                assert_equal(page.locator('#preview img').count(), 0, 'our unsent image is cleared')
                assert_equal(page.evaluate("document.getElementById('photo-input').files.length"), 0, 'our unsent file is cleared')
            if case.get('files_remaining') is not None:
                assert_equal(page.evaluate("document.getElementById('photo-input').files.length"), case['files_remaining'], 'unsafe cleanup preserves remaining draft file')
            if case.get('sends'):
                assert_equal(counters['events'], ['attachment', 'preflight', 'send'], 'preflight follows attachment immediately before dispatch')
            if case.get('check_mime'):
                assert_equal(counters['lastFile']['type'], case['mime'], 'banner MIME preserved')
            if case.get('wrong_empty'):
                assert_equal(page.locator('#wrong').inner_text(), '', 'nested reply editor unchanged')
            if case.get('observed_preview'):
                assert_equal(counters['lastPreview'], {'naturalWidth':64,'width':64,'height':80,'outsideForm':True}, 'confirmed small HTTPS preview outside form')
                assert_equal(counters['lastSendLabel'], 'Posting komentar', 'confirmed focus-gated send label')
        return {'name':case['name'], 'passed':True, 'status':result.get('status', 'scan'),
                'dispatches':counters['dispatches'], 'sends':counters['sends'],
                'file_changes':counters['fileChanges'], 'attachment_removals':counters['removeClicks'],
                **({'observed_preview':counters['lastPreview'],'send_label':counters['lastSendLabel']} if case.get('observed_preview') else {}),
                'stage':result.get('stage'), 'duration_seconds':round(time.monotonic()-started, 3)}
    except AssertionError as error:
        return {'name':case['name'], 'passed':False, 'error':str(error), 'result':result,
                'dispatches':counters['dispatches'], 'sends':counters['sends']}
    finally:
        context.close()


def cases():
    success = dict(status='sent', dispatches=1, sends=1, file_changes=1)
    skipped = dict(status='skipped', dispatches=0, sends=0)
    uncertain = dict(status='uncertain', dispatches=1, sends=1)
    return [
        dict(name='01 normal feed public comment image sends once', html=comment_fixture(), **success),
        dict(name='02 post modal public comment composer', html=comment_fixture(modal=True), **success),
        dict(name='03 post modal root Tulis jawaban composer', html=comment_fixture(modal=True, placeholder='Tulis jawaban...'), **success),
        dict(name='04 nested comment Tulis jawaban rejected', html=comment_fixture(modal=True, reply_only=True), **skipped),
        dict(name='05 camera reveals mapped external hidden input', html=comment_fixture(modal=True, deferred_input=True), **success),
        dict(name='06 comments disabled skipped before dispatch', html=comment_fixture(modal=True, comments_disabled=True), **skipped),
        dict(name='07 missing send control cleans only own unsent image before skip', html=comment_fixture(modal=True, send=False), remove_clicks=1, cleaned=True, **skipped),
        dict(name='08 real icon send dispatches exactly once', html=comment_fixture(modal=True, icon_send=True), **success),
        dict(name='09 unverified dispatch pauses without cleanup or retry', html=comment_fixture(modal=True, outcome='none'), remove_clicks=0, files_remaining=1, **uncertain),
        dict(name='10 STOP while awaiting attachment removes own image without dispatch', html=comment_fixture(modal=True, attachment_delay=3000), cancel=900, status='cancelled', dispatches=0, sends=0, remove_clicks=1, cleaned=True),
        dict(name='11 scan all canonicalizes every post without comment', scan=True, url=GROUP,
             html=article('123','Info loker')+article('124','Kami membuka lowongan')+article('125','Status biasa', 'https://web.facebook.com/groups/example/permalink/125/?x=1#hash'),
             items=[POST,GROUP+'posts/124/',GROUP+'posts/125/']),
        dict(name='12 duplicate scan URLs deduplicated', scan=True, url=GROUP,
             html=article('123')+article('123',href='https://m.facebook.com/groups/example/permalink/123/?x=2')+article('124'),
             items=[POST,GROUP+'posts/124/']),
        dict(name='JPEG accepted with correct file MIME', html=comment_fixture(modal=True, input_accept='.jpg,.jpeg,.png,.webp'), mime='image/jpeg', check_mime=True, **success),
        dict(name='WebP accepted with correct file MIME', html=comment_fixture(modal=True), mime='image/webp', check_mime=True, **success),
        dict(name='existing external input mapped by photo control', html=comment_fixture(modal=True, external_input=True), **success),
        dict(name='native form submit icon is a real send control', html=comment_fixture(modal=True, submit_send=True), **success),
        dict(name='preflight denial clicks nothing', html=comment_fixture(modal=True), allow=False, status='skipped', dispatches=1, sends=0),
        dict(name='nested reply ignored when root composer exists', html=comment_fixture(modal=True, nested_reply=True), wrong_empty=True, **success),
        dict(name='unrelated lazy image cannot prove success', html=comment_fixture(modal=True, outcome='lazy-image'), **uncertain),
        dict(name='media added to existing comment cannot prove success', html=comment_fixture(modal=True, outcome='existing-media'), **uncertain),
        dict(name='new nested reply cannot prove top-level comment', html=comment_fixture(modal=True, outcome='nested'), **uncertain),
        dict(name='two equally eligible root composers rejected', html=comment_fixture(modal=True, two_composers=True), **skipped),
        dict(name='attachment with no preview is safely cleaned without dispatch', html=comment_fixture(modal=True, preview=False), remove_clicks=1, cleaned=True, **skipped),
        dict(name='send awaits attachment and enabled control', html=comment_fixture(modal=True, enabled=False, enable_delay=1200), **success),
        dict(name='different actor new comment cannot prove our send', html=comment_fixture(modal=True, actor_mismatch=True), **uncertain),
        dict(name='wrong group route never dispatches', html=comment_fixture(modal=True), url='https://www.facebook.com/groups/other/posts/123/', job_target=POST, **skipped),
        dict(name='expired job never dispatches', html=comment_fixture(modal=True), expired=True, status='cancelled', dispatches=0, sends=0),
        dict(name='security restriction stops before dispatch', html=comment_fixture(modal=True)+'<div role="alert">Konfirmasi identitas untuk pemeriksaan keamanan</div>', status='failed', dispatches=0, sends=0),
        dict(name='deep 26-wrapper modal Tulis jawaban with photo/video input', html=comment_fixture(modal=True, placeholder='Tulis jawaban...', deep_wrappers=True, input_accept='image/*,video/*'), **success),
        dict(name='share-to-profile control never substitutes missing send', html=comment_fixture(modal=True, send=False, share_decoy=True), **skipped),
        dict(name='deep composer ignores share control outside form', html=comment_fixture(modal=True, deep_wrappers=True, share_decoy=True), **success),
        dict(name='inner post dialog chosen inside outer dialog', html=comment_fixture(modal=True, deep_wrappers=True, nested_dialog=True), **success),
        dict(name='unapproved selection cannot attach or dispatch', html=comment_fixture(modal=True), selected=False, file_changes=0, **skipped),
        dict(name='missing reviewed selection cannot attach or dispatch', html=comment_fixture(modal=True), missing_payload=True, file_changes=0, **skipped),
        dict(name='inner reply dialog inside comment cannot dispatch', html=nested_reply_dialog_fixture(), file_changes=0, **skipped),
        dict(name='mismatched modal permalink cannot dispatch on valid route', html=comment_fixture(modal=True).replace('/groups/example/posts/123/', '/groups/example/posts/999/'), file_changes=0, **skipped),
        dict(name='rerender existing comment plus lazy count growth cannot prove success', html=comment_fixture(modal=True, outcome='rerender-existing'), **uncertain),
        dict(name='unproven active reply overlay blocks outer post composer', html=reply_overlay_fixture(), overlay_ready=True, file_changes=0, **skipped),
        dict(name='stale post route cannot masquerade as group scan', scan=True, scan_error=True, url=POST, job_target=GROUP, html=article('123'), items=[]),
        dict(name='attachment preview moved into new comment proves success', html=comment_fixture(modal=True, outcome='moved-preview'), **success),
        dict(name='64x80 HTTPS preview outside form TABLE depth12 then focus reveals Posting komentar', html=comment_fixture(modal=True, placeholder='Tulis jawaban...', deep_wrappers=True, preview_sibling=True, small_cdn_preview=True, focus_send=True, live_preview_structure=True), observed_preview=True, **success),
        dict(name='small HTTPS sibling preview permits real native form submit', html=comment_fixture(modal=True, preview_sibling=True, small_cdn_preview=True, submit_send=True), **success),
        dict(name='preexisting small sibling image preserves draft and blocks new attachment', html=comment_fixture(modal=True, preview_sibling=True, small_cdn_preview=True, stale_preview=True, preview=False), status='failed', stage='composer_draft_present', dispatches=0, sends=0, file_changes=0, remove_clicks=0, preserved_preview=True),
        dict(name='small sibling preview without real send cleans own image and never presses Enter', html=comment_fixture(modal=True, preview_sibling=True, small_cdn_preview=True, send=False), remove_clicks=1, cleaned=True, **skipped),
        dict(name='preview outside bounded composer cannot authorize send or unsafe removal', html=comment_fixture(modal=True, preview_outside=True, small_cdn_preview=True), status='failed', stage='attachment_cleanup_blocked', dispatches=0, sends=0, file_changes=1, remove_clicks=0, files_remaining=1),
        dict(name='image in nested comment cannot authorize root send or remove reply draft', html=comment_fixture(modal=True, preview_reply=True, small_cdn_preview=True), status='failed', stage='attachment_cleanup_blocked', dispatches=0, sends=0, file_changes=1, remove_clicks=0, files_remaining=1),
        dict(name='preexisting user text is preserved before any file assignment', html=comment_fixture(modal=True).replace('id="editor"></div>', 'id="editor">Draf pengguna lama</div>'), status='failed', stage='composer_draft_present', dispatches=0, sends=0, file_changes=0, remove_clicks=0, preserved_text='Draf pengguna lama'),
        dict(name='preexisting selected file is preserved before any assignment', html=comment_fixture(modal=True), preexisting_file=True, preserved_file=True, status='failed', stage='composer_draft_present', dispatches=0, sends=0, file_changes=0, remove_clicks=0),
        dict(name='ambiguous photo removal preserves unsent draft and pauses', html=comment_fixture(modal=True, send=False, ambiguous_remove=True), status='failed', stage='attachment_cleanup_blocked', dispatches=0, sends=0, file_changes=1, remove_clicks=0, files_remaining=1),
        dict(name='user text typed during upload is preserved without send or cleanup', html=comment_fixture(modal=True, user_text_during_upload=True), status='failed', stage='attachment_cleanup_blocked', dispatches=0, sends=0, file_changes=1, remove_clicks=0, files_remaining=1, preserved_text='Draf pengguna baru'),
        dict(name='same IMG user source replacement on focus preserves empty-text cleared-file draft', html=comment_fixture(modal=True, preview_sibling=True, small_cdn_preview=True, focus_send=True, replace_preview_on_focus=True), status='failed', stage='attachment_cleanup_blocked', dispatches=0, sends=0, file_changes=1, remove_clicks=0, files_remaining=0, preserved_replacement=True),
        dict(name='pending same IMG user source replacement during preflight never sends or removes replacement', html=comment_fixture(modal=True, preview_sibling=True, small_cdn_preview=True, focus_send=True), replace_on_preflight=True, slow_replacement=True, status='failed', stage='attachment_cleanup_blocked', dispatches=1, sends=0, file_changes=1, remove_clicks=0, files_remaining=0, preserved_replacement=True),
        dict(name='plain DIV canonical post sends verified image', html=plain_comment_fixture(), **success),
        dict(name='plain DIV reviewed existing group feed sends to exact header permalink', html=plain_comment_fixture()+plain_article('124'), url=GROUP, job_target=POST, use_existing_feed=True, **success),
        dict(name='plain DIV read-only probe recognizes exact approved root composer', html=plain_comment_fixture(), url=GROUP, job_target=POST, probe=True, ready=True),
        dict(name='plain DIV probe refuses a nested reply-only composer', html=plain_comment_fixture(reply_only=True), url=GROUP, job_target=POST, probe=True, ready=False),
        dict(name='plain DIV probe refuses unapproved target', html=plain_comment_fixture(), url=GROUP, job_target=POST, selected=False, probe=True, ready=False),
        dict(name='plain DIV probe refuses target found only in body text', html=plain_comment_fixture().replace('<a href="/groups/example/posts/123/">Waktu</a>', '').replace('Info loker apa aja</div>', 'Info loker <a href="/groups/example/posts/123/">URL</a></div>'), url=GROUP, job_target=POST, probe=True, ready=False),
        dict(name='plain DIV group feed requires explicit worker reuse decision', html=plain_comment_fixture(), url=GROUP, job_target=POST, file_changes=0, **skipped),
        dict(name='plain DIV mismatched target never attaches or dispatches', html=plain_comment_fixture(), url=GROUP, job_target=GROUP+'posts/124/', use_existing_feed=True, file_changes=0, **skipped),
        dict(name='plain DIV wrong group never reuses approved composer', html=plain_comment_fixture(), url='https://www.facebook.com/groups/other/', job_target=POST, use_existing_feed=True, file_changes=0, **skipped),
        dict(name='plain DIV duplicate rendered target is ambiguous', html=plain_comment_fixture()+plain_article(), url=GROUP, job_target=POST, use_existing_feed=True, file_changes=0, **skipped),
        dict(name='plain DIV existing feed STOP cleans owned image before dispatch', html=plain_comment_fixture(attachment_delay=3000), url=GROUP, job_target=POST, use_existing_feed=True, cancel=900, status='cancelled', dispatches=0, sends=0, remove_clicks=1, cleaned=True),
        dict(name='plain DIV header change during preflight prevents send and preserves ambiguous draft', html=plain_comment_fixture(), url=GROUP, job_target=POST, use_existing_feed=True, change_target=True, status='failed', stage='attachment_cleanup_blocked', dispatches=1, sends=0, file_changes=1, remove_clicks=0, files_remaining=1),
        dict(name='plain DIV nested reply cannot become reviewed group root', html=plain_comment_fixture(reply_only=True), url=GROUP, job_target=POST, use_existing_feed=True, file_changes=0, **skipped),
        dict(name='plain DIV draft remains intact on reviewed group feed', html=plain_comment_fixture().replace('id="editor"></div>', 'id="editor">Draf pengguna lama</div>'), url=GROUP, job_target=POST, use_existing_feed=True, status='failed', stage='composer_draft_present', dispatches=0, sends=0, file_changes=0, remove_clicks=0, preserved_text='Draf pengguna lama'),
        dict(name='plain DIV group feed refuses active reply overlay', html=plain_comment_fixture()+'<div role="dialog"><div contenteditable="true" role="textbox">Balas</div></div>', url=GROUP, job_target=POST, use_existing_feed=True, file_changes=0, **skipped),
        dict(name='plain DIV scan canonicalizes adjacent posts', scan=True, url=GROUP, html='<div role="feed">'+plain_article('123')+plain_article('124',href='https://web.facebook.com/groups/example/permalink/124/?x=1')+'</div>', items=[POST,GROUP+'posts/124/']),
        dict(name='scan ignores comment and reply permalinks', scan=True, url=GROUP, html=article('123',href='/groups/example/posts/123/?comment_id=1')+plain_article('124',href='/groups/example/posts/124/?reply_comment_id=2'), items=[]),
        dict(name='scan ignores permalink mentioned only in post body', scan=True, url=GROUP, html='<div><div data-ad-preview="message">Status <a href="/groups/example/posts/123/">URL</a></div></div>', items=[]),
        dict(name='plain DIV nested-comment story cannot become a scanned post', scan=True, url=GROUP, html='<div role="listitem" data-comment-id="reply">'+plain_article()+'</div>', items=[]),
        dict(name='plain DIV hidden header cannot authorize existing feed reuse', html=plain_comment_fixture().replace('<a href="/groups/example/posts/123/">', '<a hidden href="/groups/example/posts/123/">'), url=GROUP, job_target=POST, probe=True, ready=False),
        dict(name='plain DIV feed boundary cannot combine unrelated story and header', html='<div role="feed">'+plain_comment_fixture().replace('<a href="/groups/example/posts/123/">Waktu</a>', '')+'<div><a href="/groups/example/posts/123/">Waktu tetangga</a></div></div>', url=GROUP, job_target=POST, probe=True, ready=False),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=EXTENSION / 'facebook.js')
    parser.add_argument('--report', type=Path, default=os.environ.get('LOKER_TEST_REPORT'))
    parser.add_argument('--filter', default='', help='Run matching case names only')
    parser.add_argument('--export-modal', type=Path, help='Export a sanitized static modal fixture and exit')
    parser.add_argument('--screenshot-modal', type=Path, help='Save a screenshot of the sanitized synthetic modal')
    args = parser.parse_args()
    if args.export_modal:
        args.export_modal.parent.mkdir(parents=True, exist_ok=True)
        html = comment_fixture(modal=True, placeholder='Tulis jawaban...', deep_wrappers=True, share_decoy=True, input_accept='image/*,video/*')
        args.export_modal.write_text('<!doctype html><html><head><meta charset="utf-8"><title>Lowongan synthetic modal</title><style>'+CSS+'</style></head><body>'+html+'</body></html>', encoding='utf-8')
        print(str(args.export_modal))
        return 0
    source_bytes = args.source.read_bytes()
    source_text = source_bytes.decode('utf-8')
    script = source_text.replace('location.href', 'globalThis.__fixtureURL').replace('location.pathname', 'new URL(globalThis.__fixtureURL).pathname')
    results = []
    with sync_playwright() as playwright:
        executable = choose_executable()
        browser = playwright.chromium.launch(executable_path=executable, headless=True,
                                             args=['--disable-background-networking', '--no-first-run'])
        browser_version = browser.version
        if args.screenshot_modal:
            args.screenshot_modal.parent.mkdir(parents=True, exist_ok=True)
            visual_context = browser.new_context(viewport={'width':1100, 'height':820})
            visual_context.route('**/*', lambda route: route.abort())
            visual_page = visual_context.new_page()
            html = comment_fixture(modal=True, placeholder='Tulis jawaban...', deep_wrappers=True, share_decoy=True, input_accept='image/*,video/*')
            visual_page.set_content('<!doctype html><html><head><meta charset="utf-8"><style>'+CSS+'</style></head><body><h1>Modal sintetis — uji DOM extension</h1><p>Tidak terhubung ke Facebook. Tidak ada komentar yang dikirim.</p>'+html+'</body></html>')
            visual_page.screenshot(path=str(args.screenshot_modal), full_page=True)
            visual_context.close()
        for case in cases():
            if args.filter.lower() not in case['name'].lower():
                continue
            try:
                result = run_case(browser, script, case)
            except Exception as error:
                result = {'name':case['name'], 'passed':False, 'error':str(error)}
            results.append(result)
            print(f'{"PASS" if result["passed"] else "FAIL"} {case["name"]}', flush=True)
        browser.close()
    try:
        source_path = str(args.source.resolve().relative_to(EXTENSION))
    except ValueError:
        source_path = args.source.name
    report = {'synthetic_only':True, 'source':source_path,
              'source_sha256':hashlib.sha256(source_bytes).hexdigest(),
              'source_sha256_lf':hashlib.sha256(source_bytes.replace(b'\r\n',b'\n')).hexdigest(),
              'source_hash_line_endings':{'source_sha256':'raw bytes','source_sha256_lf':'LF'},
              'extension_version_from_manifest':json.loads((EXTENSION / 'manifest.json').read_text(encoding='utf-8'))['version'],
              'browser_version':browser_version,
              'passed':sum(item['passed'] for item in results),
              'failed':sum(not item['passed'] for item in results), 'tests':results}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
    return 1 if report['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
