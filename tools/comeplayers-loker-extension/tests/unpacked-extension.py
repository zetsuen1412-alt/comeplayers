"""Load the real unpacked MV3 extension in isolated local Playwright Chromium.

This is an integration test of installation, worker, bridge, popup and STOP.
It never uses a user's browser profile or connects to Facebook. A denying local
proxy and request routing block all non-local HTTP(S) requests. The scratch
profile is deleted after the browser closes, including on failure.
"""
from __future__ import annotations

import argparse
import base64
from collections import Counter
import hashlib
import importlib.util
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse

EXTENSION = Path(__file__).resolve().parents[1]
DEPS = EXTENSION / '.test-deps'
if (DEPS / 'python').exists():
    sys.path.insert(0, str(DEPS / 'python'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', str(DEPS / 'browsers'))

from playwright.sync_api import sync_playwright  # noqa: E402

ADMIN_URL = 'http://localhost:3000/admin/lowongan'
HTML = """<!doctype html><html lang="id"><meta charset="utf-8">
<title>Admin Lowongan — synthetic integration</title><style>
body{font:16px system-ui;padding:24px}button{padding:12px;margin:8px}
</style><body><h1>Admin Lowongan — uji integrasi sintetis</h1>
<p>Profil test kosong. Tidak terhubung ke Facebook. Tidak ada komentar dikirim.</p>
<button id="review">KIRIM KOMENTAR (1)</button><button id="stop">STOP</button>
<script>
window.fixtureStops=0;window.fixtureTrustedReviews=0;window.fixturePreflights=0;
window.fixtureAllowDispatch=false;window.fixtureAllowedJobIds=[];
document.getElementById('stop').onclick=()=>window.fixtureStops++;
document.getElementById('review').onclick=e=>{if(e.isTrusted)window.fixtureTrustedReviews++;};
window.fixtureCommand=(command,data)=>new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID();
  const timeout=setTimeout(()=>{window.removeEventListener('message',listener);reject(new Error('Bridge response timed out'));},45000);
  function listener(event){
    if(event.source!==window||event.origin!==location.origin||event.data?.source!=='cp-loker-extension')return;
    if(event.data.kind==='preflight'){
      window.fixturePreflights++;
      const allowed=window.fixtureAllowDispatch===true&&window.fixtureAllowedJobIds.includes(event.data.id);
      window.postMessage({source:'cp-loker-ui',kind:'preflight-result',requestId:event.data.requestId,allowed},location.origin);
    }
    if(event.data.kind==='result'&&event.data.requestId===requestId){
      clearTimeout(timeout);window.removeEventListener('message',listener);resolve(event.data.result);
    }
  }
  window.addEventListener('message',listener);
  window.postMessage({source:'cp-loker-ui',kind:'command',requestId,command,data},location.origin);
});
</script></body></html>"""


class LocalAdminHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/admin/lowongan':
            self.send_error(404)
            return
        content = HTML.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, *_args):
        pass


class DenyingProxyHandler(BaseHTTPRequestHandler):
    def deny(self, host):
        self.server.blocked_hosts.append(host)
        self.server.blocked_requests.append({'method':self.command, 'host':host})
        self.send_response(403)
        self.send_header('Content-Length', '0')
        self.send_header('Connection', 'close')
        self.end_headers()

    def do_CONNECT(self):
        self.deny(self.path.rsplit(':', 1)[0].lower())

    def do_GET(self):
        url = urlparse(self.path)
        if url.scheme == 'http' and url.hostname == 'localhost' and url.port == 3000:
            # Playwright's proxy bypass differs between Chromium builds. Forward
            # only the one synthetic loopback origin to our own loopback server.
            self.server.local_requests_forwarded += 1
            connection = HTTPConnection('127.0.0.1', 3000, timeout=5)
            try:
                connection.request('GET', url.path + ('?'+url.query if url.query else ''))
                response = connection.getresponse()
                content = response.read()
                self.send_response(response.status)
                self.send_header('Content-Type', response.getheader('Content-Type', 'text/plain'))
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            finally:
                connection.close()
            return
        self.deny((url.hostname or 'unknown').lower())

    do_POST = do_GET
    do_HEAD = do_GET
    do_PUT = do_GET
    do_PATCH = do_GET
    do_DELETE = do_GET
    do_OPTIONS = do_GET

    def log_message(self, *_args):
        pass


def assert_equal(actual, expected, reason):
    if actual != expected:
        raise AssertionError(f'{reason}: expected {expected!r}, got {actual!r}')


def command(page, name, data=None):
    return page.evaluate('({name,data})=>window.fixtureCommand(name,data)', {'name':name, 'data':data})


def job():
    return {'id':'synthetic-job', 'lease':'synthetic-lease', 'kind':'group_comment',
            'target':'https://www.facebook.com/groups/example/posts/123/', 'text':'',
            'payload':{'adminSelected':True}, 'expiresAt':int(time.time()*1000)+120000,
            'banner':{'mime':'image/png', 'body':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'}}


def storage(worker):
    return worker.evaluate("async()=>await chrome.storage.local.get(['stopLatched','cancelled','facebookTab','active'])")


def tab_urls(worker):
    return worker.evaluate('async()=> (await chrome.tabs.query({})).map(t=>t.url).sort()')


def wait_evaluate(page, function, arg=None, timeout=5):
    """Bounded reads avoid wait_for_function's eval compilation under MV3 CSP."""
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if page.evaluate(function,arg):
            return
        time.sleep(.05)
    raise AssertionError('Extension popup state did not settle within the bounded wait.')


def no_send_assertions(worker, page, before_urls):
    assert_equal(tab_urls(worker), before_urls, 'run cannot navigate or create a tab')
    assert_equal(page.evaluate('window.fixturePreflights'), 0, 'no dispatch preflight')
    state = storage(worker)
    assert_equal(state.get('active'), None, 'no active dispatch claim')
    assert_equal(state.get('facebookTab'), None, 'test never attaches a Facebook tab')


class ActionPopup:
    """Drive the real action popup through documented foreground getViews().

    Chromium does not expose this action target as a Playwright Page. The
    observer belongs to the same installed extension; clicks on the actual
    popup DOM are explicitly untrusted test clicks, never mocked senders.
    """
    def __init__(self, observer, worker):
        self.observer, self.worker = observer, worker
        self.open()

    def open(self):
        for attempt in range(2):
            try:
                self.worker.evaluate("""async()=>{
                  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
                  if(tab?.windowId)await chrome.windows.update(tab.windowId,{focused:true});
                  await chrome.action.openPopup(tab?.windowId ? {windowId:tab.windowId} : {});
                }""")
                break
            except Exception:
                if attempt:
                    raise
                wait_evaluate(self.observer,"()=>chrome.extension.getViews({type:'popup'}).length === 0")
        wait_evaluate(self.observer,"()=>chrome.extension.getViews({type:'popup'}).length === 1")

    def ensure(self):
        if not self.observer.evaluate("chrome.extension.getViews({type:'popup'}).length"):
            self.open()

    def click(self, selector):
        self.ensure()
        self.observer.evaluate("selector=>chrome.extension.getViews({type:'popup'})[0].document.querySelector(selector).click()", selector)

    def count(self, selector):
        self.ensure()
        return self.observer.evaluate("selector=>chrome.extension.getViews({type:'popup'})[0].document.querySelectorAll(selector).length", selector)

    def status(self):
        self.ensure()
        return self.observer.evaluate("chrome.extension.getViews({type:'popup'})[0].document.getElementById('status').textContent")

    def wait_status(self, text):
        self.ensure()
        wait_evaluate(self.observer,"text=>{const view=chrome.extension.getViews({type:'popup'})[0];return view?.document.getElementById('status')?.textContent.includes(text);}",text)

    def reload(self):
        self.ensure()
        self.observer.evaluate("chrome.extension.getViews({type:'popup'})[0].location.reload()")

    def close(self):
        self.observer.evaluate("chrome.extension.getViews({type:'popup'}).forEach(view=>view.close())")
        wait_evaluate(self.observer,"()=>chrome.extension.getViews({type:'popup'}).length === 0")


def run_suite(playwright, profile, proxy_port, results, request_blocks, screenshot, metadata, restart_check):
    spec = importlib.util.spec_from_file_location('cp_loker_integration_dom', Path(__file__).with_name('integration-dom.py'))
    fixtures = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = fixtures
    spec.loader.exec_module(fixtures)
    synthetic_documents = fixtures.synthetic_documents()
    synthetic_resources = fixtures.synthetic_resources()

    def route_request(route):
        url = urlparse(route.request.url)
        if route.request.url in synthetic_documents:
            metadata['synthetic_facebook_requests_intercepted'] += 1
            route.fulfill(status=200, content_type='text/html; charset=utf-8', body=synthetic_documents[route.request.url])
        elif route.request.url in synthetic_resources:
            metadata['synthetic_cdn_resources_intercepted'] += 1
            route.fulfill(status=200, **synthetic_resources[route.request.url])
        elif url.scheme in ('chrome-extension', 'data', 'blob', 'about'):
            route.continue_()
        elif url.scheme == 'http' and url.hostname == 'localhost' and url.port == 3000:
            route.continue_()
        else:
            request_blocks.append((url.hostname or 'unknown').lower())
            route.abort()

    def launch():
        context = playwright.chromium.launch_persistent_context(
            str(profile), channel='chromium', headless=True, chromium_sandbox=True,
            proxy={'server':f'http://127.0.0.1:{proxy_port}', 'bypass':'localhost,127.0.0.1'},
            args=[f'--disable-extensions-except={EXTENSION}', f'--load-extension={EXTENSION}',
                  '--disable-background-networking', '--no-first-run'],
        )
        context.route('**/*', route_request)
        context.set_default_timeout(10000)
        return context

    def check(name, callback):
        started = time.monotonic()
        metadata['current_stage'] = name
        callback()
        results.append({'name':name, 'passed':True, 'duration_seconds':round(time.monotonic()-started, 3)})
        print('PASS '+name, flush=True)

    context = None
    browser_version = None
    installed_version = None
    try:
        context = launch()
        browser_version = context.browser.version
        metadata['browser_version'] = browser_version
        executable = Path(playwright.chromium.executable_path)
        metadata['browser_resource_sha256'] = {
            path.name:hashlib.sha256(path.read_bytes()).hexdigest()
            for path in [executable, executable.parent/'chrome.dll'] if path.exists()}
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
        extension_id = urlparse(worker.url).hostname
        manifest = worker.evaluate('()=>chrome.runtime.getManifest()')
        installed_version = manifest['version']
        metadata['installed_version'] = installed_version
        check('actual unpacked MV3 service worker loads v1.3.6', lambda: (
            assert_equal(manifest['manifest_version'], 3, 'installed manifest is MV3'),
            assert_equal(installed_version, '1.3.6', 'actual installed extension version'),
            assert_equal(urlparse(worker.url).path, '/worker.js', 'real background worker loaded'),
        ))
        admin = context.new_page()
        admin.goto(ADMIN_URL)
        check('actual localhost content-script bridge ping returns installed version', lambda: (
            assert_equal(command(admin, 'ping').get('version'), installed_version, 'bridge-worker version'),
            assert_equal(command(admin, 'ping').get('attached'), False, 'fresh profile has no Facebook tab'),
        ))
        observer = context.new_page()
        observer.goto(f'chrome-extension://{extension_id}/popup.html')
        wait_evaluate(observer,"()=>document.getElementById('status').textContent !== 'Memeriksa tab…'")
        check('regular extension tab cannot impersonate browser-action popup', lambda:
            assert_equal(observer.locator('#status').inner_text(), 'Ekstensi belum siap. Muat ulang ekstensi.', 'actual worker rejects popup message sent from a tab'))
        popup = ActionPopup(observer, worker)
        metadata['popup_action_opened'] = True
        metadata['popup_test_method'] = 'Actual action popup via chrome.action.openPopup and foreground chrome.extension.getViews; observer-backed untrusted DOM clicks.'
        expected_popup = ('STOP aktif. Periksa riwayat lalu tekan KIRIM KOMENTAR di Admin untuk batch baru.'
                          if command(admin, 'ping').get('stopped') else 'Buka grup Facebook lalu hubungkan tab.')
        check('actual packaged popup JavaScript initializes safely without Facebook', lambda: (
            assert_equal(popup.count('#attach'), 1, 'actual popup controls'),
            assert_equal(popup.status(), expected_popup, 'popup status is actual successful runtime reply'),
        ))
        popup.click('#stop')
        popup.wait_status('STOP aktif')
        admin.wait_for_function('window.fixtureStops === 1')
        check('popup STOP crosses worker and bridge and persists browser latch', lambda: (
            assert_equal(storage(worker).get('stopLatched'), True, 'persistent STOP latch'),
            assert_equal(storage(worker).get('cancelled'), True, 'persistent cancellation'),
            assert_equal(command(admin, 'ping').get('stopped'), True, 'admin bridge reports STOP'),
        ))
        before = tab_urls(worker)
        stopped = command(admin, 'run', job())
        check('stopped run cancels before navigation or dispatch', lambda: (
            assert_equal(stopped.get('status'), 'cancelled', 'latched run terminal status'),
            assert_equal(stopped.get('dispatched'), False, 'latched run did not dispatch'),
            no_send_assertions(worker, admin, before),
        ))
        popup.reload()
        popup.wait_status('STOP aktif')
        check('popup reload retains persisted STOP', lambda: assert_equal(storage(worker).get('stopLatched'), True, 'latch survives popup reload'))
        admin.locator('#review').evaluate('(button)=>button.click()')
        before = tab_urls(worker)
        untrusted = command(admin, 'run', job())
        check('untrusted synthetic review click cannot resume old Admin bridge', lambda: (
            assert_equal(untrusted.get('status'), 'cancelled', 'synthetic review never unlatches'),
            assert_equal(storage(worker).get('stopLatched'), True, 'synthetic click preserves latch'),
            assert_equal(admin.evaluate('window.fixtureTrustedReviews'), 0, 'click was untrusted'),
            no_send_assertions(worker, admin, before),
        ))
        admin.locator('#review').click()
        before = tab_urls(worker)
        resumed = command(admin, 'run', job())
        check('trusted reviewed click resumes once and safely fails with no Facebook tab', lambda: (
            assert_equal(admin.evaluate('window.fixtureTrustedReviews'), 1, 'real browser click is trusted'),
            assert_equal(resumed.get('status'), 'failed', 'missing Facebook context fails safely'),
            assert_equal(resumed.get('stage'), 'navigation_unavailable', 'failure occurs before navigation'),
            assert_equal(resumed.get('dispatched'), False, 'resumed run never dispatches'),
            assert_equal(storage(worker).get('stopLatched'), False, 'real review unlatched browser'),
            no_send_assertions(worker, admin, before),
        ))
        # Fixture setup through the real storage API isolates one-use review
        # consumption without sending STOP (which would also revoke review).
        worker.evaluate("async()=>await chrome.storage.local.set({stopLatched:true,cancelled:true})")
        metadata['fixture_storage_setup'].append('Set STOP latch through real chrome.storage.local solely to isolate legacy reviewed approval consumption.')
        before = tab_urls(worker)
        consumed = command(admin, 'run', job())
        check('consumed reviewed approval cannot silently unlatch another run', lambda: (
            assert_equal(consumed.get('status'), 'cancelled', 'old UI review permission consumed once'),
            assert_equal(storage(worker).get('stopLatched'), True, 'second run remains latched'),
            no_send_assertions(worker, admin, before),
        ))
        admin.locator('#review').click()
        popup.click('#stop')
        popup.wait_status('STOP aktif')
        before = tab_urls(worker)
        revoked = command(admin, 'run', job())
        check('popup STOP revokes pending legacy reviewed approval', lambda: (
            assert_equal(revoked.get('status'), 'cancelled', 'popup STOP revokes the bridge review permission'),
            no_send_assertions(worker, admin, before),
        ))
        admin.locator('#review').click()
        admin.locator('#stop').click()
        before = tab_urls(worker)
        after_stop = command(admin, 'run', job())
        check('trusted STOP invalidates a pending reviewed click', lambda: (
            assert_equal(after_stop.get('status'), 'cancelled', 'STOP cancels pending review'),
            no_send_assertions(worker, admin, before),
        ))
        admin.locator('#review').click()
        new_resume = command(admin, 'resume_reviewed')
        before = tab_urls(worker)
        new_admin_run = command(admin, 'run', job())
        check('new Admin explicit reviewed resume reaches worker and fails safely without Facebook', lambda: (
            assert_equal(new_resume.get('resumed'), True, 'explicit new Admin resume crosses the installed bridge'),
            assert_equal(new_admin_run.get('status'), 'failed', 'missing Facebook tab remains safe after explicit resume'),
            assert_equal(new_admin_run.get('dispatched'), False, 'explicit resume alone cannot dispatch'),
            no_send_assertions(worker, admin, before),
        ))
        command(admin, 'stop')
        popup.close()
        if restart_check:
            print('STEP closing isolated browser before optional restart', flush=True)
            context.close()
            print('STEP restarting isolated test profile', flush=True)
            context = launch()
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
            admin = context.new_page()
            admin.goto(ADMIN_URL)
            before = tab_urls(worker)
            restart_ping = command(admin, 'ping')
            restarted = command(admin, 'run', job())
            check('fresh test browser restart retains STOP and blocks subsequent jobs', lambda: (
                assert_equal(restart_ping.get('version'), installed_version, 'extension loaded again after restart'),
                assert_equal(restart_ping.get('stopped'), True, 'latch retained across browser restart'),
                assert_equal(restarted.get('status'), 'cancelled', 'restart cannot resume sending'),
                assert_equal(restarted.get('dispatched'), False, 'restart run did not dispatch'),
                no_send_assertions(worker, admin, before),
            ))
            metadata['browser_restart_tested'] = True
        metadata['current_stage'] = 'attach exact in-memory synthetic Facebook tab'
        metadata['synthetic_content_network_mode'] = 'Exact in-memory route fulfillment; denying loopback proxy never forwards external origins.'
        fake_facebook = context.new_page()
        fixture_dialogs = []
        fake_facebook.on('dialog', lambda dialog: (fixture_dialogs.append(dialog.type), dialog.dismiss()))
        feed_url = fixtures.GROUP_URL+'posts/123/'
        fake_facebook.goto(feed_url)
        observer = context.new_page()
        observer.goto(f'chrome-extension://{extension_id}/popup.html')
        fake_facebook.bring_to_front()
        popup = ActionPopup(observer, worker)
        popup.click('#attach')
        attached_id = worker.evaluate("async url=>(await chrome.tabs.query({url}))[0]?.id", feed_url)
        wait_evaluate(observer,"async expected=>(await chrome.storage.local.get('facebookTab')).facebookTab===expected",attached_id)
        check('actual popup attaches the wholly intercepted synthetic Facebook tab', lambda: (
            assert_equal(storage(worker).get('facebookTab'), attached_id, 'real popup selected the active synthetic tab'),
            assert_equal(command(admin, 'ping').get('attached'), True, 'real bridge reports attached synthetic tab'),
        ))
        scan_before = admin.evaluate('window.fixturePreflights')
        scanned = command(admin, 'scan', {'groups':[fixtures.GROUP_URL]})
        check('installed worker injects real scan content script without commenting', lambda: (
            assert_equal(scanned.get('groupsScanned'), 1, 'actual worker scans one intercepted group'),
            assert_equal([item['url'] for item in scanned.get('items', [])], [fixtures.GROUP_URL+f'posts/{post}/' for post in ['123','124','125','126','127','128']], 'real content scan canonical URLs'),
            assert_equal(admin.evaluate('window.fixturePreflights'), scan_before, 'scan never requests dispatch preflight'),
            assert_equal(fake_facebook.locator('#photo-input').count(), 0, 'group scan DOM has no comment file input'),
        ))

        def content_job(post, suffix):
            result = job()
            result.update(id='synthetic-'+suffix, lease='synthetic-lease-'+suffix,
                          target=fixtures.GROUP_URL+f'posts/{post}/')
            result['banner']['body'] = admin.evaluate("""()=>{
              const canvas=document.createElement('canvas');canvas.width=180;canvas.height=180;
              const context=canvas.getContext('2d');context.fillStyle='teal';context.fillRect(0,0,180,180);
              return canvas.toDataURL('image/png').split(',')[1];
            }""")
            admin.evaluate("id=>{window.fixtureAllowDispatch=true;window.fixtureAllowedJobIds.push(id)}", result['id'])
            return result

        def content_send(post, suffix, expected_status='sent', expected_stage='photo_control_unavailable', expected_file_changes=0, expected_removals=0, target_group=None):
            selected_job = content_job(post, suffix)
            if target_group:
                selected_job['target'] = target_group+f'posts/{post}/'
            before_preflight = admin.evaluate('window.fixturePreflights')
            started = time.monotonic()
            result = command(admin, 'run', selected_job)
            observations = fake_facebook.evaluate(fixtures.OBSERVATIONS_JS)
            delta = admin.evaluate('window.fixturePreflights')-before_preflight
            assert_equal(result.get('status'), expected_status, 'actual worker/content terminal result')
            assert_equal(observations['synthetic'], True, 'target is a clearly labeled synthetic document')
            assert_equal(storage(worker).get('active'), None, 'worker clears its finished claim')
            if expected_status == 'sent':
                assert_equal(result.get('stage'), 'verified_new_comment', 'actual unmodified content verifies a new comment')
                assert_equal(result.get('dispatched'), True, 'actual worker received dispatched terminal result')
                assert_equal(delta, 1, 'one content-to-worker-to-bridge dispatch preflight')
                assert_equal(observations['sends'], 1, 'one synthetic DOM send action')
                assert_equal(observations['fileChanges'], 1, 'native file assignment reaches target DOM')
                assert_equal(observations['lastFile']['type'], 'image/png', 'real attached File MIME')
                assert_equal(observations['lastFile']['size'] > 0, True, 'actual attached image bytes')
                assert_equal(observations['editorCleared'], True, 'composer cleared after synthetic send')
                assert_equal(observations['attachmentPreviewImages'], 0, 'attachment moved out of composer')
                assert_equal(observations['newTopLevelComments'], 1, 'one newly added top-level comment')
                assert_equal(observations['loadedNewCommentImages'], 1, 'valid attached PNG visible in new comment')
                assert_equal(observations['removeClicks'], 0, 'verified send never removes attachment as unsent cleanup')
                if post == '124':
                    assert_equal(observations['lastPreview'], {'naturalWidth':64,'width':64,'height':80,'outsideForm':True}, 'observed small HTTPS preview outside FORM')
                    assert_equal(observations['sendLabel'], 'Posting komentar', 'focus reveals exact actual send label')
                metadata['synthetic_content_sends'] += 1
            else:
                assert_equal(result.get('dispatched'), False, 'unsupported target never dispatched')
                assert_equal(result.get('stage'), expected_stage, 'precise unsupported attachment stage')
                assert_equal(delta, 0, 'unsupported target has zero preflight dispatch')
                assert_equal(observations['sends'], 0, 'unsupported target has zero send clicks')
                assert_equal(observations['fileChanges'], expected_file_changes, 'expected native attachment changes')
                assert_equal(observations['removeClicks'], expected_removals, 'only owned unsent image is removed')
                assert_equal(observations['attachmentFilesRemaining'], 0, 'skipped target retains no selected file')
                assert_equal(observations['attachmentPreviewImages'], 0, 'skipped target retains no unsent preview')
            metadata['synthetic_content_results'].append({'post':post, 'status':result['status'], 'stage':result['stage'],
                'dispatch_preflights':delta, 'synthetic_send_clicks':observations['sends'],
                'owned_attachment_removals':observations['removeClicks'],
                'duration_seconds':round(time.monotonic()-started, 3)})
            return result

        admin.locator('#review').click()
        check('installed unpacked extension sends one native PNG comment in synthetic feed', lambda: content_send('123', 'normal'))
        admin.locator('#review').click()
        check('installed extension confirms small HTTPS sibling preview and focus-gated Posting komentar modal', lambda: content_send('124', 'modal'))
        metadata['installed_facebook_content_tested'] = True
        admin.locator('#review').evaluate("button=>button.textContent='KIRIM KOMENTAR (3)'")
        review_before = admin.evaluate('window.fixtureTrustedReviews')
        admin.locator('#review').click()
        metadata['current_stage'] = 'three reviewed synthetic posts advance sequentially past unsupported target'
        batch_results = [content_send('125', 'batch-unsupported', 'skipped'),
                         content_send('126', 'batch-feed'), content_send('127', 'batch-modal')]
        check('three reviewed synthetic posts advance sequentially past unsupported target', lambda: (
            assert_equal([result['status'] for result in batch_results], ['skipped','sent','sent'], 'batch skips safely and advances'),
            assert_equal(admin.evaluate('window.fixtureTrustedReviews')-review_before, 1, 'one reviewed click authorizes the controlled three-post batch'),
        ))
        admin.locator('#review').click()
        metadata['current_stage'] = 'owned missing-send image is cleaned before next reviewed target'
        cleanup_result=content_send('128','cleanup-missing-send','skipped','send_control_unavailable',1,1)
        fake_facebook.locator('#editor').click()
        next_result=content_send('123','after-cleanup')
        check('owned unsent image cleanup permits next target without beforeunload prompt',lambda:(
            assert_equal([cleanup_result['status'],next_result['status']],['skipped','sent'],'cleaned skipped job safely advances'),
            assert_equal(fixture_dialogs,[],'no native beforeunload dialog blocks subsequent navigation'),
        ))
        def beforeunload_control():
            calibration=context.new_page()
            observed_dialogs=[]
            calibration.on('dialog',lambda dialog:(observed_dialogs.append(dialog.type),dialog.dismiss()))
            try:
                dirty_url=fixtures.GROUP_URL+'posts/128/'
                calibration.goto(dirty_url)
                calibration.locator('#editor').click()
                image=content_job('128','fixture-beforeunload-control')['banner']['body']
                calibration.locator('#photo-input').set_input_files({'name':'fixture-control.png','mimeType':'image/png','buffer':base64.b64decode(image)})
                calibration.wait_for_function("document.querySelector('#preview img')?.complete")
                assert_equal(calibration.evaluate("document.getElementById('photo-input').files.length"),1,'positive guard has dirty native file')
                try:
                    calibration.goto(feed_url,timeout=5000)
                except Exception:
                    if observed_dialogs!=['beforeunload']:
                        raise
                assert_equal(observed_dialogs,['beforeunload'],'dirty native beforeunload guard is genuinely active')
                assert_equal(calibration.url,dirty_url,'dismissed native dialog preserves dirty page')
                calibration.get_by_role('button',name='Hapus foto',exact=True).click()
                assert_equal(calibration.evaluate("document.getElementById('photo-input').files.length"),0,'fixture remove empties positive control')
                assert_equal(calibration.locator('#preview img').count(),0,'fixture remove clears positive preview')
                calibration.goto(feed_url,timeout=5000)
                assert_equal(observed_dialogs,['beforeunload'],'clean native page navigates without another dialog')
                metadata['native_beforeunload_positive_control']={'dirty_dialogs':1,'clean_dialogs':0,'dismissed':True}
            finally:
                calibration.close()
        check('native dirty attachment beforeunload positive control dismisses then clean navigation passes',beforeunload_control)
        fake_facebook.goto(fixtures.FEED_REUSE_URL)
        admin.locator('#review').click()
        reuse_requests = metadata['synthetic_facebook_requests_intercepted']
        reused_result = content_send('123', 'plain-div-feed-reuse', target_group=fixtures.FEED_REUSE_URL)
        check('reviewed plain DIV post reuses exact existing group feed without navigation', lambda: (
            assert_equal(reused_result.get('status'), 'sent', 'exact approved feed post was verified'),
            assert_equal(fake_facebook.url, fixtures.FEED_REUSE_URL, 'group feed URL is retained'),
            assert_equal(metadata['synthetic_facebook_requests_intercepted'], reuse_requests, 'no new Facebook document request during reuse'),
        ))
        fallback_result = content_send('124', 'plain-div-fallback', target_group=fixtures.FEED_REUSE_URL)
        check('neighbor without proven root composer falls back to its exact canonical post', lambda: (
            assert_equal(fallback_result.get('status'), 'sent', 'fallback modal post was verified'),
            assert_equal(fake_facebook.url, fixtures.FEED_REUSE_URL+'posts/124/', 'canonical target navigation occurs'),
        ))
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            fake_facebook.screenshot(path=str(screenshot), full_page=True)
            metadata['synthetic_post_screenshot'] = screenshot.name
        command(admin, 'stop')
        before_urls = tab_urls(worker)
        before_preflight = admin.evaluate('window.fixturePreflights')
        stopped_connected = command(admin, 'run', content_job('123', 'stopped-connected'))
        check('STOP blocks a not-yet-dispatched job on attached synthetic Facebook tab', lambda: (
            assert_equal(stopped_connected.get('status'), 'cancelled', 'connected job still obeys STOP'),
            assert_equal(stopped_connected.get('dispatched'), False, 'connected STOP job never dispatches'),
            assert_equal(tab_urls(worker), before_urls, 'STOP job never navigates the attached tab'),
            assert_equal(admin.evaluate('window.fixturePreflights'), before_preflight, 'STOP job requests zero new dispatch preflight'),
        ))
        popup.close()
    finally:
        if context:
            context.close()
    return browser_version, installed_version


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--screenshot-post', type=Path, help='Capture a clearly synthetic intercepted post after content integration')
    parser.add_argument('--restart-check', action='store_true', help='Also restart the isolated Chromium profile to verify STOP persistence; optional lifecycle check')
    args = parser.parse_args()
    DEPS.mkdir(exist_ok=True)
    results, request_blocks = [], []
    admin_server = proxy = None
    scratch = None
    browser_version = installed_version = None
    metadata = {'fixture_storage_setup':[], 'synthetic_facebook_requests_intercepted':0,
                'synthetic_cdn_resources_intercepted':0,
                'synthetic_content_sends':0, 'synthetic_content_results':[], 'browser_restart_tested':False}
    failure = None
    profile_deleted = True
    source_hashes = {name:hashlib.sha256((EXTENSION/name).read_bytes()).hexdigest()
                     for name in ['manifest.json','worker.js','bridge.js','popup.js','popup.html','popup.css','facebook.js']}
    source_hashes_lf = {name:hashlib.sha256((EXTENSION/name).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
                        for name in source_hashes}
    try:
        # Bind only loopback; an occupied port fails safely without changing any
        # existing server or pretending the production Admin was exercised.
        admin_server = ThreadingHTTPServer(('127.0.0.1', 3000), LocalAdminHandler)
        threading.Thread(target=admin_server.serve_forever, daemon=True).start()
        proxy = ThreadingHTTPServer(('127.0.0.1', 0), DenyingProxyHandler)
        proxy.blocked_hosts = []
        proxy.blocked_requests = []
        proxy.local_requests_forwarded = 0
        proxy.external_requests_forwarded = 0
        threading.Thread(target=proxy.serve_forever, daemon=True).start()
        scratch = tempfile.TemporaryDirectory(prefix='unpacked-profile-', dir=DEPS)
        profile = Path(scratch.name).resolve()
        if not profile.is_relative_to(DEPS.resolve()):
            raise RuntimeError('Scratch profile is outside the test dependency directory.')
        with sync_playwright() as playwright:
            browser_version, installed_version = run_suite(playwright, profile, proxy.server_port,
                                                           results, request_blocks, args.screenshot_post, metadata, args.restart_check)
    except Exception as error:
        failure = str(error).splitlines()[0][:300]
        results.append({'name':metadata.get('current_stage', 'integration execution'), 'passed':False, 'error':failure})
    finally:
        if admin_server:
            admin_server.shutdown()
            admin_server.server_close()
        if proxy:
            proxy.shutdown()
            proxy.server_close()
        if scratch:
            try:
                profile_path = Path(scratch.name)
                scratch.cleanup()
                profile_deleted = not profile_path.exists()
            except Exception:
                profile_deleted = False
                results.append({'name':'fresh temporary profile cleanup', 'passed':False,
                                'error':'Temporary test profile could not be deleted.'})
    blocked = request_blocks + (proxy.blocked_hosts if proxy else [])
    application_facebook_blocks = sum(host == 'facebook.com' or host.endswith('.facebook.com') for host in request_blocks)
    proxy_facebook_blocks = [item for item in (proxy.blocked_requests if proxy else [])
                             if item['host'] == 'facebook.com' or item['host'].endswith('.facebook.com')]
    external_forwarded = proxy.external_requests_forwarded if proxy else 0
    guard_passed = not request_blocks and external_forwarded == 0
    results.append({'name':'synthetic routes stay in memory and no external request is forwarded',
                    'passed':guard_passed,
                    **({} if guard_passed else {'error':'Unexpected application route or forwarded external request.'})})
    for name, digest in source_hashes.items():
        if hashlib.sha256((EXTENSION/name).read_bytes()).hexdigest() != digest:
            results.append({'name':'runtime source unchanged throughout integration', 'passed':False,
                            'error':f'{name} changed while tests ran.'})
    report = {'isolated_local_unpacked_extension':True, 'synthetic_admin':True,
              'user_authenticated_browser_tested':False, 'live_facebook_sends_tested':False,
              'installed_facebook_content_tested':metadata.get('installed_facebook_content_tested', False),
              'extension_version_installed':metadata.get('installed_version', installed_version),
              'browser_channel':'chromium', 'browser_version':metadata.get('browser_version', browser_version),
              'browser_source':'Official Playwright Chromium download, fresh local test profile.',
              'browser_resource_sha256':metadata.get('browser_resource_sha256', {}),
              'runtime_source_sha256':source_hashes, 'runtime_source_sha256_lf':source_hashes_lf,
              'runtime_source_hash_line_endings':{'runtime_source_sha256':'raw bytes', 'runtime_source_sha256_lf':'LF'},
              'temporary_profile_deleted':profile_deleted,
              'browser_restart_requested':args.restart_check, 'browser_restart_tested':metadata['browser_restart_tested'],
              'browser_restart_limitation':None if metadata['browser_restart_tested'] else 'Optional restart check omitted from this run; actual storage persistence and popup reload are tested. Restart succeeded in an earlier isolated trial but intermittent relaunch stalls were observed.',
              'network_policy':'All external HTTP(S) blocked by a denying loopback proxy and page request routing.',
              'external_requests_blocked':len(blocked),
              'application_facebook_requests_blocked':application_facebook_blocks,
              'browser_proxy_facebook_requests_blocked':len(proxy_facebook_blocks),
              'browser_proxy_facebook_connect_probes_blocked':sum(item['method']=='CONNECT' for item in proxy_facebook_blocks),
              'browser_proxy_blocked_host_counts':dict(sorted(Counter(proxy.blocked_hosts if proxy else []).items())),
              'browser_proxy_blocked_method_counts':dict(sorted(Counter(item['method'] for item in (proxy.blocked_requests if proxy else [])).items())),
              'browser_proxy_probe_note':'Browser-level denied proxy requests are reported separately from application route requests. Their initiator is not inferred. No external origin is forwarded by the proxy.',
              'browser_proxy_external_requests_blocked':len(proxy.blocked_hosts) if proxy else 0,
              'browser_proxy_localhost_requests_forwarded':proxy.local_requests_forwarded if proxy else 0,
              'application_context_external_requests_blocked':len(request_blocks),
              'external_network_requests_dispatched':external_forwarded,
              'synthetic_facebook_requests_intercepted':metadata['synthetic_facebook_requests_intercepted'],
              'synthetic_cdn_resources_intercepted':metadata['synthetic_cdn_resources_intercepted'],
              'synthetic_content_sends':metadata['synthetic_content_sends'],
              'synthetic_content_network_mode':metadata.get('synthetic_content_network_mode'),
              'synthetic_content_results':metadata['synthetic_content_results'],
              'synthetic_batch_method':'One trusted review click, then three sequential real bridge/worker/content jobs with fixture Admin preflight. The production Admin queue pump and live Facebook batch are not exercised.',
              'native_beforeunload_positive_control':metadata.get('native_beforeunload_positive_control'),
              'synthetic_post_screenshot':metadata.get('synthetic_post_screenshot'),
              'fixture_storage_setup':metadata['fixture_storage_setup'],
              'popup_test_method':metadata.get('popup_test_method'),
              'popup_screenshot_limitation':metadata.get('popup_screenshot_limitation'),
              'official_extension_test_docs':'https://playwright.dev/python/docs/chrome-extensions',
              'official_popup_docs':'https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup',
              'official_popup_view_docs':'https://developer.chrome.com/docs/extensions/reference/api/extension#method-getViews',
              'passed':sum(test['passed'] for test in results),
              'failed':sum(not test['passed'] for test in results), 'tests':results}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
    return 1 if report['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
