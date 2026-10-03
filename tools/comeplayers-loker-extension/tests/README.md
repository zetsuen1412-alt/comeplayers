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
