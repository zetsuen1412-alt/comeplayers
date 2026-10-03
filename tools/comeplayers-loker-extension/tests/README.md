# Synthetic extension browser tests

These tests execute `facebook.js` in isolated browser contexts using synthetic
HTML. They do not connect to Facebook, use a logged-in profile, or send comments.
Every page network request is blocked and fails the corresponding case. Passing
this suite does not prove live Facebook acceptance criteria.

Install test dependencies locally without changing application dependencies:

```powershell
python -m pip install --target .test-deps/python -r tests/requirements.txt
python tests/browser-fixtures.py --report .test-deps/fixtures.json
```

Run from `tools/comeplayers-loker-extension`. Use `py` or the configured Python
runtime if `python` is not on PATH. An installed Chrome, Edge, or Chromium is
detected automatically. Set `CHROMIUM_PATH` to override the browser executable;
otherwise Playwright's installed Chromium can be used (`python -m playwright
install chromium`). Browsers always launch with a fresh isolated test profile.

The suite covers all twelve cases in the stabilization handoff, plus attachment
MIME handling, icon/form submit controls, preflight refusal, ambiguous composers,
lazy images, existing-comment media, nested replies, actor mismatch, and delayed
attachment readiness. Timers run 30 times faster in the test page. The content
script is loaded intact except that `location.href` and `location.pathname` read
the synthetic target URL. Use `--source path/to/facebook.js` for baseline
comparison or `--filter phrase` to inspect a specific case.

## Real unpacked MV3 integration in isolated Chromium

`unpacked-extension.py` installs the unchanged unpacked extension in a fresh
local Playwright Chromium profile. It exercises the actual worker, localhost
bridge, action popup, STOP latch, scan, content injection and dispatch preflight.
Install Playwright's bundled Chromium because current Chrome and Edge no longer
support the extension loading flags used by this test.

```powershell
$env:PYTHONPATH = (Resolve-Path '.test-deps/python').Path
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location).Path '.test-deps/browsers'
python -m playwright install chromium --no-shell
python tests/unpacked-extension.py --report ../../docs/verification/lowongan-facebook/2026-10-03-unpacked-integration.json --screenshot-post ../../docs/verification/lowongan-facebook/2026-10-03-unpacked-post-synthetic.png
```

The server binds only `127.0.0.1:3000` and fails if that port is occupied. The
profile stays under `.test-deps` and is deleted when the run finishes. The test
never reads a user's browser profile, login, cookies or Facebook content.
Only exact synthetic Facebook URLs supplied by `integration-dom.py` are
fulfilled entirely in memory. All other page requests are rejected, and a
denying loopback proxy forwards only the fixture's localhost origin. Denied
browser-level proxy requests are counted separately; the test does not infer
their initiator. No external request is forwarded.

Native extension APIs, timers, location, file input and the content source remain
unchanged. The real action popup opens with `chrome.action.openPopup`; a same
extension foreground observer uses `chrome.extension.getViews` to read its DOM
and click its buttons. These popup DOM clicks are explicitly untrusted test
clicks. Admin review clicks use Playwright's trusted browser input. One fixture
setup writes STOP through the real storage API to isolate one-use reviewed
approval consumption; this setup is declared in the JSON report.

The content cases verify a normal post, a modal with 26 wrappers and `Tulis
jawaban`, and three sequential jobs that skip an unsupported post before two
synthetic sends. A single trusted review click authorizes that sequence. The
fixture Admin grants preflight only to its approved synthetic jobs. This tests
the actual bridge, worker and content path; it does not exercise the production
Admin queue pump or a live Facebook batch. All authenticated live acceptance
criteria remain pending.

Storage persistence and popup reload are included by default. The optional
`--restart-check` also relaunches the isolated profile to check STOP persistence
across a browser restart. This succeeded in an earlier trial, but intermittent
Chromium relaunch stalls were observed; the default report explicitly marks it
unexercised. The post screenshot is clearly synthetic; Playwright does not expose
this Chromium action popup as a screenshot-capable `Page`.

Official API references: [Playwright extension testing](https://playwright.dev/python/docs/chrome-extensions),
[action.openPopup](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup),
[extension.getViews](https://developer.chrome.com/docs/extensions/reference/api/extension#method-getViews).
