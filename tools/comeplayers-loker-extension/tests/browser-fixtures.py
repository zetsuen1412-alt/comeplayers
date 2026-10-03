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
window.chrome = {runtime: {id: 'fixture', onMessage: {addListener: f => listeners.push(f)},
  sendMessage: async m => {
    if (m.dispatch) { window.dispatches++; window.events.push('preflight'); }
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
                    nested_dialog=False):
    """Real DOM attachment/send handlers with an observable irreversible click."""
    root = '<div role="dialog" aria-label="Postingan fixture">' if modal else '<article role="article">'
    close = '</div>' if modal else '</article>'
    story = '<div data-ad-preview="message">Info loker apa aja</div><a href="/groups/example/posts/123/">Waktu</a>'
    comments = '<div id="comments" role="list" data-comment-list="true"><div role="listitem" data-comment-id="existing">Komentar sebelumnya</div></div>'
    textbox = f'<div contenteditable="true" role="textbox" aria-label="{placeholder}" id="editor"></div>'
    if deep_wrappers:
        textbox = '<div>' * 6 + textbox + '</div>' * 6
    photo = '<button type="button" id="camera" aria-label="Lampirkan foto" aria-controls="photo-input">Foto</button>'
    file_input = f'<input id="photo-input" type="file" accept="{input_accept}" hidden>'
    send_html = ''
    if send:
        disabled = '' if enabled else ' disabled aria-disabled="true"'
        send_html = (f'<button id="send" type="{"submit" if submit_send else "button"}"'
                     f' aria-label="{"" if submit_send else "Kirim"}"{disabled}>'
                     f'{"➤" if icon_send or submit_send else "Kirim"}</button>')
    composer = '' if comments_disabled else (
        '<form id="composer" role="presentation" onsubmit="return false" data-composer="true">'
        '<a aria-label="Profil Anda" href="/profile.php?id=100"><img alt="Avatar sintetis" width="32" height="32" '
        'src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3C/svg%3E">Profil</a>'
        + textbox + photo + ('' if external_input or deferred_input else file_input)
        + '<div id="preview"></div>' + send_html + '</form>'
    )
    if deep_wrappers:
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
                           accept=input_accept, actorMismatch=actor_mismatch))
    handler = """
const opts = OPTS, imageURL = IMAGE;
function media() { const i = document.createElement('img'); i.src = imageURL; return i; }
function bindInput(input) {
  input.addEventListener('change', () => {
    window.fileChanges++; window.events.push('attachment');
    window.lastFile = input.files[0] && {name:input.files[0].name, type:input.files[0].type, size:input.files[0].size};
    setTimeout(() => {
      if (opts.preview) { const i = media(); i.setAttribute('data-attachment-preview', 'true'); preview.append(i); }
      const enable = () => { if (window.send) { send.disabled = false; send.removeAttribute('aria-disabled'); } };
      if (opts.enableDelay) setTimeout(enable, opts.enableDelay); else enable();
    }, opts.attachmentDelay);
  });
}
const input = document.getElementById('photo-input'); if (input) bindInput(input);
if (window.camera) camera.onclick = () => {
  window.cameraClicks++;
  if (opts.deferred && !document.getElementById('photo-input')) {
    const input = document.createElement('input'); input.id = 'photo-input'; input.type = 'file';
    input.accept = opts.accept; input.hidden = true; document.querySelector('[role=dialog]').append(input); bindInput(input);
  }
};
if (window.send) send.onclick = e => {
  e.preventDefault(); window.sends++; window.events.push('send');
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
};
""".replace('OPTS', opts).replace('IMAGE', json.dumps(IMAGE))
    decoy = ('<button aria-label="Kirim ini ke teman atau posting di profil Anda." '
             'onclick="window.sends++;">Bagikan</button>') if share_decoy else ''
    result = root + story + decoy + comments + composer + extra + external + close
    if nested_dialog:
        result = '<div role="dialog" aria-label="Dialog luar">' + result + '</div>'
    return result + '<script>' + handler + '</script>'


def assert_equal(actual, expected, why):
    if actual != expected:
        raise AssertionError(f'{why}: expected {expected!r}, got {actual!r}')


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
    context.route('**/*', lambda route: (network_attempts.append(route.request.url), route.abort()))
    page = context.new_page()
    page.set_default_timeout(10000)
    html = case.get('html', '')
    page.set_content('<html><head><base href="https://www.facebook.com/"><style>' + CSS + '</style></head><body>' + html + '</body></html>')
    page.evaluate(BOOT)
    if case.get('overlay_ready'):
        assert_equal(page.evaluate("typeof document.getElementById('inner-input').onchange"), 'function', 'inner overlay fixture attachment handler is valid')
    page.evaluate('(a) => window.allow = a', case.get('allow', True))
    page.evaluate('(u) => window.__fixtureURL = u', case.get('url', POST))
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
    started = time.monotonic()
    result = page.evaluate("""async ({job, scan, cancel}) => {
      if (cancel) setTimeout(() => listeners[0]({type:'CP_LOKER_CANCEL'},{id:'fixture'},()=>{}), cancel);
      return await new Promise((resolve,reject) => {
        const timeout = __realSetTimeout(() => reject(new Error('fixture response timed out')),12000);
        const message = scan ? {type:'CP_LOKER_SCAN_ALL',group:job.target} : {type:'CP_LOKER_RUN',job};
        listeners[0](message,{id:'fixture'},r => {__realClearTimeout(timeout);resolve(r)});
      });
    }""", dict(job=job, scan=case.get('scan', False), cancel=case.get('cancel', 0)))
    counters = page.evaluate('({dispatches,sends,fileChanges,enterEvents,cameraClicks,events,lastFile:window.lastFile})')
    try:
        assert_equal(network_attempts, [], 'all fixture page network requests are blocked')
        assert_equal(counters['dispatches'], case.get('dispatches', 0), 'preflight dispatch count')
        assert_equal(counters['sends'], case.get('sends', 0), 'irreversible send click count')
        assert_equal(counters['enterEvents'], 0, 'never synthesize Enter')
        if case.get('scan'):
            if case.get('scan_error'):
                assert_equal(isinstance(result.get('error'), str) and bool(result['error']), True, 'scan fails safely with a clear error')
            else:
                assert_equal(result.get('error'), None, 'scan error')
            assert_equal([item['url'] for item in result.get('items', [])], case['items'], 'canonical scan results')
        else:
            assert_equal(result.get('status'), case['status'], 'terminal status')
            if case.get('file_changes') is not None:
                assert_equal(counters['fileChanges'], case['file_changes'], 'file input change count')
            if case.get('sends'):
                assert_equal(counters['events'], ['attachment', 'preflight', 'send'], 'preflight follows attachment immediately before dispatch')
            if case.get('check_mime'):
                assert_equal(counters['lastFile']['type'], case['mime'], 'banner MIME preserved')
            if case.get('wrong_empty'):
                assert_equal(page.locator('#wrong').inner_text(), '', 'nested reply editor unchanged')
        return {'name':case['name'], 'passed':True, 'status':result.get('status', 'scan'),
                'dispatches':counters['dispatches'], 'sends':counters['sends'],
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
        dict(name='07 missing send control skipped before dispatch', html=comment_fixture(modal=True, send=False), **skipped),
        dict(name='08 real icon send dispatches exactly once', html=comment_fixture(modal=True, icon_send=True), **success),
        dict(name='09 unverified dispatch pauses without retry', html=comment_fixture(modal=True, outcome='none'), **uncertain),
        dict(name='10 STOP while awaiting attachment prevents dispatch', html=comment_fixture(modal=True, attachment_delay=3000), cancel=900, status='cancelled', dispatches=0, sends=0),
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
        dict(name='attachment with no preview never dispatches', html=comment_fixture(modal=True, preview=False), **skipped),
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
