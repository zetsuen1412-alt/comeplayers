# Codex Handoff — ComePlayers Facebook Lowongan Stabilization

Date: 2026-10-03
Branch to use: `codex/facebook-lowongan-stabilize-v2`
Base main SHA: `8537cb1c95d351d20b2913d4e70990566dafea37`

## User goal

Make the ComePlayers admin recruitment workflow reliably work end-to-end from the user's already logged-in Facebook browser session:

1. Admin opens `/admin/lowongan`.
2. Admin chooses one recruitment banner image.
3. Admin pastes one or more Facebook group URLs.
4. Admin clicks **SCAN SEMUA POSTINGAN**.
5. Every post/status discovered during the scan is listed and selected by default.
6. Admin may unselect any item, then clicks **KIRIM KOMENTAR** once.
7. The extension processes the approved batch sequentially, attaches the recruitment image as a Facebook comment, verifies the result, and moves to the next approved post.
8. **STOP** must stop all jobs that have not dispatched yet.

The approval click in step 6 must remain. Do not convert this into unreviewed background spam.

## Scope boundaries

Work only on the Facebook Lowongan module and its extension:

- `website/app/admin/lowongan/**`
- `website/app/api/admin/lowongan/**`
- `website/lib/loker/**`
- `website/supabase/migrations/*loker*`
- `website/tests/loker-automation.test.ts`
- `tools/comeplayers-loker-extension/**`

Do not modify employee, applicant, payroll, Crazy Rich, marketplace order, E2EE, or unrelated systems.

Do not add CAPTCHA bypass, anti-detection, fingerprint spoofing, rate-limit bypass, or credential/cookie scraping. If Facebook shows checkpoint/restriction/security verification, stop safely and surface it.

## Current production state

Main currently includes Lowongan extension v1.3.3 and production deployment for SHA:
`8537cb1c95d351d20b2913d4e70990566dafea37`

Existing flow:
- scan groups one-by-one;
- review/select all;
- queue `group_comment` jobs with `payload.adminSelected = true`;
- browser worker opens each target post;
- content script attempts to find feed article or post modal;
- unsupported targets before dispatch are marked `skipped`;
- uncertain results after dispatch pause for review;
- no blind retry.

## Actual failure observed on the user's machine

Admin side:
- `/admin/lowongan`
- scan succeeds;
- example result: **20 dari 20 ditandai**;
- user clicks **KIRIM KOMENTAR (20)**;
- Facebook opens a target post but no recruitment image comment is submitted.

Facebook example from the user's failing run:

`https://web.facebook.com/groups/2235170916973130/posts/2510892202734332/?_rdc=1&_rdr#`

Observed UI:
- post opens in a centered Facebook modal titled similar to **"Postingan Ani Agustin"**;
- comments/replies are visible;
- bottom composer says **"Tulis jawaban..."**, not the expected **"Tulis komentar publik..."**;
- camera/photo icon is visible in the bottom composer;
- current extension does not complete the image comment and appears stuck / skips.

Important: Facebook may render several variants:
- normal feed article with a public-comment composer;
- post modal with a top-level comment composer;
- post modal positioned inside a comment thread where the visible composer is a reply composer;
- hidden file input may be outside the immediate editor parent;
- send action may be a button, an icon button, or may only become available after attachment;
- Indonesian labels may use `Tulis jawaban`, `Tulis komentar publik`, `Balas`, `Kirim`, etc.

Do not assume `Tulis jawaban` is automatically safe to use. Determine whether it is the post-level composer or a nested comment-reply composer from DOM ancestry and dialog structure.

## Root-cause areas to inspect

### 1. Composer classification

Current selectors are too label-centric.

Implement a deterministic classifier for candidate composers:
- find visible contenteditable/textbox candidates inside the active post dialog;
- identify whether each candidate belongs to the post root or to a nested comment/reply thread;
- reject composers whose nearest semantic container is a comment/reply item;
- accept a post-level composer even if the localized placeholder says `Tulis jawaban...`, but only when DOM ancestry proves it is attached to the post dialog root rather than a specific comment.

Prefer structural evidence over translated label text.

### 2. Attachment control discovery

Current `attach()` often searches too small a DOM scope.

For the chosen composer:
- walk ancestors up to the active post dialog;
- locate associated image-capable `input[type=file]`;
- if hidden input is elsewhere in the dialog, map it via the photo/camera button rather than assuming it is a direct sibling;
- support PNG/JPEG/WebP up to 5 MB;
- after setting files and firing `change`, wait for a new attachment preview that belongs to the composer, not an unrelated image/avatar.

### 3. Dispatch action

Do not assume there is always a text-labeled send button.
Before dispatch:
- resolve the exact actionable control for this composer;
- verify it is enabled only after attachment;
- call server preflight immediately before the irreversible user-interface action.

If Facebook commits comments with Enter only in a given composer, do not synthesize Enter unless a deterministic fixture proves that is the correct post-level submit action for that DOM variant. Prefer a real send control when available.

### 4. Verification

Current "new large image exists" check is too weak.

Build stronger verification:
- snapshot comment nodes before dispatch;
- after dispatch, require a newly added top-level comment/comment attachment in the target post dialog;
- verify that the new node belongs to the authenticated actor when possible without storing identity;
- otherwise verify new comment-count / new media node within the comment list plus composer cleared;
- never treat unrelated lazy-loaded images as success.

If the click may have happened but verification is inconclusive, return `uncertain`, never retry automatically.

### 5. Queue resilience

If a target is clearly unsupported **before dispatch**:
- mark it `skipped`;
- record a precise note;
- continue to the next approved post.

If Facebook denies commenting, comments are disabled, photo comments are unavailable, the post was removed, or the account cannot comment:
- mark `skipped` or `failed` only when certain no comment was sent;
- continue when safe.

If a post-dispatch result is ambiguous:
- pause and require review to avoid duplicates.

### 6. Modal cleanup/navigation

After a terminal result:
- close the active post modal if needed, or let the worker navigate directly to the next canonical target;
- ensure no nested modal/thread state leaks into the next job;
- wait for navigation + dialog state to settle before injecting/starting next job.

## Required test work

### A. Read project agent instructions first

From `website/`, read `AGENTS.md`.
It requires using the actual installed Next.js docs under `node_modules/next/dist/docs/` before editing Next-specific code.

### B. Install project dependencies

From `website/`:

```bash
npm ci
```

Do not update lockfiles or dependency versions unless required and justified.

### C. Run baseline checks

```bash
npm run typecheck
npx tsx --test tests/loker-automation.test.ts
```

If reasonable after targeted fixes:

```bash
npm run lint
npm run build
```

### D. Upgrade extension fixture tests

Existing fixture:
`tools/comeplayers-loker-extension/tests/browser-fixtures.py`

The existing fixture is stale relative to image-only + reviewed selection behavior. Rewrite/extend it so it tests the actual v1.3.x content script.

Minimum fixtures:

1. Normal feed article + main public comment composer + photo attachment + send.
2. Post modal + `Tulis komentar publik...`.
3. Post modal + `Tulis jawaban...` that is structurally the post-level composer and should be accepted.
4. Nested comment reply composer + `Tulis jawaban...` that must be rejected.
5. Modal with hidden image file input only available after clicking camera/photo button.
6. Comments disabled/no composer => pre-dispatch `skipped`, zero dispatch calls.
7. Missing send control => pre-dispatch `skipped`, zero dispatch calls.
8. Successful attachment + send => exactly one dispatch call.
9. Post-dispatch verification failure => `uncertain`, never an automatic retry.
10. STOP/cancel while waiting => no dispatch.
11. Scan-all extracts canonical post URLs and does not comment.
12. Duplicate URLs from scan are deduplicated.

Use synthetic DOM only for this fixture suite; no network calls to Facebook.

### E. Real extension installation test

This is necessary before declaring completion.

Use the user's local Chrome/Edge environment (not a cloud-only test) because the workflow depends on their already authenticated Facebook session.

Install/reload unpacked extension from:

`tools/comeplayers-loker-extension`

Then:
1. open `https://www.comeplayers.com/admin/lowongan`;
2. confirm the page reports the exact extension version you are testing;
3. connect one Facebook group tab;
4. scan one known group;
5. select **one** post first;
6. click **KIRIM KOMENTAR (1)**;
7. verify the recruitment image comment is visible after a reload;
8. repeat with a post that opens in the modal variant shown above;
9. only after both pass, test a small batch of 2–3 approved posts;
10. verify one unsupported post is skipped without stopping the remaining batch.

Do not start with 20 posts. Stabilize one-post behavior first.

Do not save Facebook password, session cookie, browser profile, or access tokens into the repository, logs, screenshots, or test artifacts.

## Instrumentation required for live diagnosis

Add non-sensitive diagnostic stages to extension results/notes. Examples:
- `navigated`
- `post_context_found:modal`
- `post_context_found:feed`
- `composer_candidates:3`
- `composer_selected:post_root`
- `photo_control_found`
- `attachment_preview_found`
- `send_control_found`
- `preflight_allowed`
- `send_clicked`
- `verified_new_comment`

Do not log full post text, user names, cookies, auth headers, or message contents.

The Admin history should expose the final failure stage so a screenshot immediately tells us where it stopped.

## Acceptance criteria

Do not report "done" until all are true:

- [ ] `npm run typecheck` passes.
- [ ] targeted Lowongan tests pass.
- [ ] extension fixture suite covers both feed and modal variants and passes.
- [ ] extension version visible in Admin matches installed version.
- [ ] one live normal-post image comment succeeds.
- [ ] one live modal-post image comment succeeds.
- [ ] a 2–3 post reviewed batch advances sequentially without manual per-post intervention.
- [ ] an unsupported target is skipped and the next target proceeds.
- [ ] STOP prevents every not-yet-dispatched job.
- [ ] no blind retry after uncertain dispatch.
- [ ] production deployment is READY after merge.
- [ ] verification notes/evidence are committed under `docs/verification/lowongan-facebook/`.

## Delivery

Keep all work on `codex/facebook-lowongan-stabilize-v2` until the tests above pass.

When complete:
- commit code + tests + verification notes;
- open a PR to `main`;
- include exact test commands/results;
- include installed extension version;
- include which live Facebook UI variants were tested;
- include any remaining known Facebook DOM limitations.

Do not merge to main until the real one-post + modal-post tests are confirmed.
