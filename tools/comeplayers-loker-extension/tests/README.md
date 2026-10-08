# Extension regression checks

All checks use synthetic pages and fresh browser contexts. They never reuse a logged-in profile or send a Facebook comment. Passing controlled fixtures does not establish that Facebook's current interface accepts a scan, attachment or send.

## Current tested baseline

The promoted v1.3.10 source has **97 scan cases, 43 verified-media DOM cases, 73 composer DOM cases, 44 comment-status DOM cases, 87 worker routing cases (10 feed + 24 media + 53 comment), six native unpacked MV3 baseline checks, and 15 native fresh-comment verification checks**. Re-run relevant suites after source changes; an earlier report does not verify a later revision. Reports identify the source hash and actual manifest version where supported.

- Scan: late-loaded cards/permalinks; semantic and plain DIV boundaries; accessibility timestamp labels; hover/press targets; matching numeric post modals; unrelated body/reply links; ambiguous close controls; native default-navigation prevention; STOP, partial results, and return to the group feed. Every case asserts zero dispatch requests and file assignments. Read-only timestamp/close clicks occur only where explicitly expected.
- Composer: approved exact-target selection; feed/modal composers; nested replies; image MIME and preview readiness; preflight refusal; STOP; owned-attachment cleanup; preservation of user drafts; and new-comment evidence after one synthetic send click. Includes the small HTTPS form-sibling preview and focus-revealed Posting komentar control.
- Feed worker: feed reuse; canonical fallback; target readiness before foreground activation; preserving Admin focus during read-only scan; STOP during probe/loading. Chrome transport/storage are simulated here.
- Native smoke: real unpacked service worker; localhost Admin content bridge; stored STOP; reviewed resume; unattached-scan rejection; no Facebook tabs or active jobs. This is a smaller check than the historical full Python native runner.

## Node scan and worker suites

Run from tools/comeplayers-loker-extension. Prefer an existing Node Playwright installation and installed Chromium/Edge. PLAYWRIGHT_MODULE can point to the existing module; CHROMIUM_PATH selects a browser executable.

```text
node tests/scan-loading.test.cjs facebook.js --report .test-deps/scan-report.json
node --test tests/feed-worker.test.mjs
node --check facebook.js
node --check worker.js
node --check popup.js
```

The scan runner executes all 97 cases by default. An optional source path must be the first argument. Filters include --boundaries, --hydration, --labels, --descendants, --clicks and --press; --baseline isolates the original late-loading regressions. Report counts must match the selected filter. Synthetic location access and accelerated timers are the only script adaptations. Page requests are blocked.

## Composer DOM suite

With Python Playwright already available:

```text
python tests/browser-fixtures.py --report .test-deps/composer-report.json
```

CHROMIUM_PATH selects an installed browser. --source path/to/facebook.js supports baseline comparison and --filter phrase runs matching cases. The suite has 73 cases; test-page timers run 30 times faster and location.href/location.pathname read the synthetic target. Exact fixture images are fulfilled in memory; every other page request is blocked and fails the corresponding case.

The current repair environment has Node Playwright but lacks Python Playwright. Workspace helpers export-composer-fixtures.py and run-composer-fixtures.cjs export the unchanged Python fixture definitions and execute equivalent Node Playwright operations with every original assertion. That adapter passed 73/73 cases in isolated Edge with a denying local proxy and verified the source stayed unchanged during the run. These helpers are workspace verification tools, not extension runtime dependencies.

## Real unpacked MV3 verification

The repair workspace's native-mv3-smoke.cjs successfully loads the actual unpacked extension in a fresh isolated headless Edge profile. All six smoke checks listed above passed. A denying loopback proxy and page routing prevent external requests. No user's profile, cookies or login are read. The successful scratch profile is removed after the run. native-mv3-smoke-report.json records the manifest version, results and source hashes.

This successful local Edge run supersedes the earlier browser-startup failure. There is no general claim that Edge cannot load the extension through the tested flags.

unpacked-extension.py remains the broader historical native runner:

```text
python tests/unpacked-extension.py --report .test-deps/unpacked-report.json
```

It needs Python Playwright and its configured Chromium runtime. It exercises actual worker, localhost bridge, popup, STOP, injection and synthetic preflight/send paths. Its Admin server binds 127.0.0.1:3000 and fails if occupied. Exact synthetic URLs from integration-dom.py are fulfilled in memory; the denying proxy forwards only the fixture's localhost origin. It distinguishes synthetic popup input from trusted Admin review input. The optional --restart-check has previously encountered intermittent browser relaunch stalls.

The broader Python runner has not been re-run in this repair environment. Six native smoke checks do not substitute for all its scenarios or for the production Admin queue pump.

## Verified-media DOM and worker checks

The frozen media resolver was promoted into v1.3.10. media-scan.test.cjs contains **43 DOM cases**. The media/feed worker command covers **34 cases: 10 in feed-worker.test.mjs and 24 in media-worker.test.mjs**. The separate fresh-comment worker suite adds 53 cases, giving 87 overall. Do not count the combined 34 as 34 additional media-worker cases.

Run:

```text
node tests/media-scan.test.cjs --report .test-deps/media-scan-report.json
node --test tests/feed-worker.test.mjs tests/media-worker.test.mjs
```

Coverage includes numeric primary-photo references, source-caption/author matching, same-group canonical proof, ambiguous or unrelated media rejection, ownership of temporary tabs, STOP/session cancellation and cleanup restricted to resolver-owned tabs. Regular scan and composer checks also cover the combined source; native MV3 smoke and all 34 worker checks passed again on the promoted v1.3.10 folder.

## Fresh comment outcome verification

```text
node tests/comment-status.test.cjs --report .test-deps/comment-status-report.json
node --test tests/feed-worker.test.mjs tests/media-worker.test.mjs tests/comment-worker.test.mjs
```

The 73 composer cases retain send/preflight/cleanup assertions. Successful source submission now yields `verify_comment` with a numeric committed comment and public photo reference, rather than declaring an optimistic comment sent. The 44 status cases cover fresh matching comment/photo, rejection, pending approval, unknown metadata, client IDs, nested replies, concurrent comments, wrong photos and ambiguous primary headers across groups. These read-only verification cases assert zero clicks, file assignments and dispatch requests.

The repair workspace's native-comment-proof.cjs runs 15 additional checks through the real unpacked worker, inactive temporary tabs, script injection and runtime messages. A controlled loopback TLS proxy serves only exact synthetic Facebook documents and denies every other request. It does not install certificates, change the system proxy, use the user's browser profile or reach real Facebook. Every case preserves source drafts, focus and existing tabs, and closes only its created verifier tab. These checks do not exercise actual authentication, the moderation service, server preflight or a live send.

## Live acceptance remains separate

A live scan must return the intended group's real post URLs for review. A live send must use the approved post and image and confirm the new comment remains after reload. Synthetic fixtures, an optimistic DOM comment, historical send counters or bridge ping do not establish that outcome. Do not automatically retry a send whose outcome is uncertain.

The authenticated Edge trial on 8 October 2026 found one canonical post and submitted the stored banner once. Its numeric comment/photo persisted after native reload, but Facebook displayed automatic group rejection. The pre-fix Admin incorrectly reported it as sent. The final fresh-verification source was checked by the isolated suites above; live public acceptance remains unverified. Do not treat that rejected comment as an accepted public result.
