# Facebook Lowongan stabilization — 2026-10-03

Branch: `codex/facebook-lowongan-stabilize-v2`  
Starting commit: `4fa73ae`  
Issue: <https://github.com/zetsuen1412-alt/comeplayers/issues/45>  
Extension under test: **1.3.5**

## Status

**Not complete. Do not merge.** The authenticated production Admin now reports
installed extension **1.3.4**. A user-reported stuck modal was matched to a
`skipped / attachment_preview_missing` history result, before dispatch. Live
normal-post, modal-post and sequential-batch image-send acceptance remain pending.

STOP was clicked and its status confirmed
`STOP aktif. Pengiriman berikutnya dihentikan.` The Admin currently reports zero
sent, zero queued and three jobs requiring review. No uncertain job was retried
and no Facebook comment was sent by this investigation.

The observed live modal has nested dialog wrappers, two story markers, eight
semantic comment articles, and one composer labelled `Tulis jawaban...` outside
the comment articles. Its form (`role=presentation`) has a photo/video file input
and a `Lampirkan foto atau video` control. The composer is 26 ancestors below the
nearest dialog. These observations contain no stored actor identity or post text.

The later failed-modal reproduction used the same Admin-selected banner through
the browser's normal photo chooser, without submitting a comment. Its loaded
HTTPS preview was **64 × 80 px**, natural width **64**, and a **sibling of the
form**, inside a composer-only ancestor with `Hapus foto`. The form is seven
ancestors above the selected public-comment editor; the first preview ancestor
is depth eight, the composer table is depth twelve, and the first post/comment
boundary is depth twenty-three. Focusing that editor revealed the enabled
`Posting komentar` icon button inside its form. The diagnostic attachment was
then removed and the empty composer confirmed. Anonymous measurements are in
`2026-10-03-live-preview-diagnosis.json`; no Facebook identifiers, actor identity,
post text or private screenshot were saved.

An unsent-draft `Keluar dari situs?` browser dialog had blocked DOM inspection and
the next job's navigation. It was cancelled through the documented native UI;
DOM inspection recovered. Queue continuation must clean only this job's proven
unsent attachment, or pause when safe cleanup is impossible.

## Changes

- Select the active target post dialog before background-feed controls; require
  structural post evidence and reject nested comment/reply containers.
- Resolve the composer-associated file input, including controls which reveal an
  input elsewhere in the dialog. Require a new local attachment preview and an
  enabled real submit control. Never use speculative Enter submission.
- Detect the observed 64px HTTPS preview beside the form in a structurally
  bounded single-editor composer container. Focus that editor and recognize its
  exact `Posting komentar` control. Keep published-comment media verification
  separate from the smaller attachment preview.
- Preserve preexisting drafts and user replacement photos. Track the assigned
  file and loaded preview sources before and after preflight. Before dispatch,
  clean only the job-owned unsent photo through a unique local removal control;
  pause with `attachment_cleanup_blocked` if ownership or cleanup is ambiguous.
- Snapshot top-level comment identity and media before the single preflight/send;
  verify new comment media and cleared composer. Compare actor links only in
  memory when available. Ambiguous sends pause without replay.
- Report static diagnostic stages in extension results and history notes. Notes
  include a stage prefix so the previous production API can display the stage.
- Guard worker startup, navigation and server preflight against STOP races.
  Keep Admin STOP usable during scan/queue setup and wait for in-flight setup
  before authoritative server cancellation.
- Persist popup STOP until a new reviewed send click. Forward popup STOP to the
  existing authenticated Admin handler without reading tokens. The bridge also
  supports the previous production Admin's reviewed click before its first job.
- Use synthetic browser fixtures and execute deployed queue SQL in PGlite to
  test sequential leases, skip continuation, STOP cancellation and uncertainty.

No database migration, dependency lockfile change, CAPTCHA bypass, credential
collection, payroll change, or Crazy Rich change is included.

## Commands and environment

From `website/`:

```text
npm ci --cache C:/Comeplayers-new/.npm-cache --no-audit --no-fund
npm run typecheck
node node_modules/tsx/dist/cli.mjs --test tests/loker-automation.test.ts
npm run lint -- --format json --output-file tmp/loker-eslint-final.json
npm run build
```

The clean worktree initially lacked dependencies needed by imported sibling
mobile crypto source. An ignored local `comeplayers-apps/node_modules` junction
points to the installed `website/node_modules`; the shared crypto packages have
the exact same versions in both manifests. No mobile source was modified.

The initial build compiled but failed prerendering `/sitemap.xml` because public
Supabase configuration was absent. The successful build loaded only
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_SITE_URL` from the existing local configuration into the build
process. No environment file, secret, or configuration value is in these artifacts.

The extension fixture suite uses pinned Python Playwright and an isolated local
Edge process. Exact synthetic image assets are fulfilled in memory and every
external request is blocked. Its report and screenshot
are synthetic evidence only, not live Facebook send evidence.

From `tools/comeplayers-loker-extension/`:

```powershell
& 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-930-608-0_26.930.608.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe' -m pip install --target .test-deps/python -r tests/requirements.txt
& 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-930-608-0_26.930.608.0_x64__3k8sg7r9htsxt\dependencies\python\python.exe' tests/browser-fixtures.py --report ../../docs/verification/lowongan-facebook/2026-10-03-extension-fixtures.json
```

The synthetic screenshot was inspected directly. `agent-browser` 0.38.2 was also
installed, but its Edge launcher exited before producing `DevToolsActivePort` in
both sandboxed and approved local launch attempts. No sandbox-disabling option
was used. The successful fixture suite and screenshot use Python Playwright with
the same installed Edge executable and isolated test contexts.

### Actual unpacked extension integration

The frozen extension **1.3.5** was also loaded as a real MV3 extension in a
fresh local Playwright Chromium **145.0.7632.6** profile. Its localhost bridge
was injected from the manifest, the actual action popup was exercised through
official `action.openPopup` and foreground `extension.getViews`, and the worker
injected `facebook.js` through `chrome.scripting`. **22/22 checks passed.**

From `tools/comeplayers-loker-extension/`, after installing bundled Chromium
as described in `tests/README.md`:

```text
python tests/unpacked-extension.py --report ../../docs/verification/lowongan-facebook/2026-10-03-unpacked-integration.json --screenshot-post ../../docs/verification/lowongan-facebook/2026-10-03-unpacked-post-synthetic.png
```

Eleven exact synthetic Facebook document requests and one synthetic CDN image
resource were fulfilled entirely in memory.
The native content/worker/bridge path verified one PNG comment in a feed, one in
the deep `Tulis jawaban` modal with a 64×80 HTTPS form-sibling preview and
focus-gated `Posting komentar`, and a sequence of three approved jobs returning
`skipped`, `sent`, `sent` after one trusted review click. Each synthetic send
had exactly one preflight and one DOM send action. Connected STOP prevented
navigation and preflight. This controlled sequence does not exercise the
production Admin queue pump or a live Facebook batch. Five synthetic comments
were sent in total. A missing-send target cleaned its own attachment with zero
preflight/send, then the next target succeeded without a leave-site prompt. A
native positive control proved that a dirty attachment really triggers
`beforeunload`; it was dismissed, then clean navigation produced no prompt.

The denying localhost proxy forwarded zero external requests. It separately
recorded 34 denied Facebook CONNECT attempts; their initiator is not inferred.
Unknown application routes were zero. The temporary test profile was deleted.
Popup clicks were observer-backed untrusted DOM clicks; Admin review used
trusted browser input. One declared real-storage setup isolated approval
consumption without changing runtime APIs, source, clocks, or timers.

Storage persistence and popup reload passed. The final full-flow run omitted
the optional browser restart check: an earlier isolated restart passed, but
intermittent Chromium relaunch stalls were observed. Its JSON reports this
limitation explicitly. The screenshot is labelled synthetic and was inspected.
Raw and LF-normalized runtime hashes bind the report to the unchanged source.
**This does not satisfy authenticated live Facebook acceptance.**

## Acceptance tracking

| Gate | Result |
| --- | --- |
| Website dependencies | PASS — 513 packages installed from lockfile |
| Website typecheck | PASS |
| Targeted Lowongan tests | PASS — 54/54, including worker/bridge races and deployed SQL pause-before-dispatch regressions |
| Extension feed/modal fixtures | PASS — 52/52, final source fingerprint in adjacent JSON |
| Actual unpacked MV3 integration | PASS — 22/22 in isolated Chromium, native worker/bridge/popup/content path with synthetic pages |
| Website lint | PASS — zero errors, 297 repository warnings; targeted Lowongan has one existing banner-effect warning |
| Website production build | PASS — 242/242 pages using public configuration |
| Installed version matches Admin | PENDING — Admin confirmed 1.3.4; tested 1.3.5 needs reload |
| Live normal-post image comment, retained after reload | PENDING |
| Live modal-post image comment, retained after reload | PENDING |
| Reviewed 2–3 post sequential batch | PENDING |
| Unsupported target skips and next proceeds | PASS in DOM fixtures and deployed SQL; live PENDING |
| STOP prevents not-yet-dispatched jobs | PASS in automated worker/bridge/SQL tests; live 1.3.4 STOP confirmed, 1.3.5 live PENDING |
| No blind retry after uncertain dispatch | PASS in DOM, worker and deployed SQL tests; live PENDING |
| Production READY after merge | PENDING — merge prohibited until live gates pass |
| Verification artifacts committed | See branch commit containing this document |

The tested Windows content-script SHA256 is
`1d5bbce08f831e3ff9ed3369254c411c76bd8e2fd4df1ebc44fa9b882ce32239`.
The fixture report also records the LF-normalized digest for Git checkouts.

Known conservative DOM limitations: a composer preview rendered only as a CSS
background, comment nodes without semantic/identity evidence, or virtualized
comment lists with no count growth can yield `skipped` or `uncertain`. They must
be diagnosed with live stage notes; they must not trigger automatic retry.

## Live installation blocker and next steps

The user loaded v1.3.4 and the authenticated Admin confirmed it. The tested
v1.3.5 changes now need an extension reload. Tab-control policy blocks
`edge://extensions` and explicitly disallows using another surface to work
around that installation restriction. No alternate protocol, raw CDP, profile
extraction, or policy workaround was attempted for installation.

Load unpacked from:

```text
C:\Comeplayers-new\.worktrees\facebook-lowongan\tools\comeplayers-loker-extension
```

Keep only one active ComePlayers Lowongan extension, connect a logged-in Facebook
group tab, and reload `https://www.comeplayers.com/admin/lowongan`. Confirm **1.3.5**
before a new scan. Review one normal post, send once, and confirm its image after
reload. Repeat for a modal post, then a reviewed 2–3 post batch with an unsupported
target. Verify sequential advancement and STOP. Preserve uncertainty rather than
retrying any previously ambiguous post.

Production readiness is a later gate: it cannot be checked after merge until all
live send gates are passed and merge is authorized by the task conditions.
