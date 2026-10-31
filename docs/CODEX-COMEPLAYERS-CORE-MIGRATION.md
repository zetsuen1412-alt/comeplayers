# Codex handoff — private ComePlayers core repository migration
Date: 2026-10-31

> **Source-only migration, never production cutover.** Companion task: [GitHub issue #119](https://github.com/zetsuen1412-alt/comeplayers/issues/119).
>
> This branch was created from the reviewed EVOGAMING Monitor v2.4.0 PR #118 commit
> `96a2348106842fe53520928529eefa47ed15c0f0`.
> Do not assume `main` contains PR #118. Review newer commits before changing the source snapshot.

## Goal

Codex should create an independently maintainable private source repository:

- **SOURCE**: `zetsuen1412-alt/comeplayers`
- **SOURCE REF**: `codex/monitor-teams-admin-splits-20261031`
- **DESTINATION**: `zetsuen1412-alt/comeplayers-core` (**private**)
- **MODE**: new snapshot history; preserve paths, no git-submodules pointing at source
- **PRODUCTION / DATABASE / OLD REPO**: no changes whatsoever

## Copy these source folders

- `website/` — Next.js website and Supabase migration source (NOT database records)
- `comeplayers-apps/` — ComePlayers desktop & mobile source
- `CP-BoostMonitor-Windows/` — EVOGAMING Monitor Windows 2.4.0
- `CP-BoostMonitor-Windows.Tests/`
- `CP-BoostMonitor-Windows.Preview/`
- `CP-BoostMonitor-Android/`
- `EvoCP_Payroll/`
- `docs/`, `assets/monitor/`, `tools/`
- `app/`, `public/`, `route.ts` and only required nonsecret root configs

## Do not copy

- `game-services/` (separate experimental games)
- `website/public/downloads/` (generated installer binaries; production still serves existing downloads)
- Any `.env` other than genuinely empty/safe `.env.example` / `.env.sample`
- Actual credentials, personal data dumps, JWTs, auth tokens, signing keys, `*.keystore`, `*.jks`, `*.p12`, `*.pem`, `google-services.json`
- Generated outputs: `node_modules`, `.next`, `.vercel`, `dist`, `build`, `bin`, `obj`, `coverage`, caches, `*.exe`, `*.apk`, `*.aab`, `*.zip`

## CI / safety rules

- Do not copy workflows into an **active** `.github/workflows/` in the destination. Store historical workflow text in `migration-reference/workflows-disabled/` (or omit it) until approved.
- **Do not** merge PR #118, execute SQL, change any Supabase project, trigger Vercel production, switch domains, or publish packages.
- GitHub Actions in the old repo have been failing before starting runner steps; this is an existing blocker, not proof that code fails.
- The `20261031013816_fh3_monitor_teams.sql` migration is **not applied to production** and must remain unapplied during this operation.
- Never ask for or print GitHub access tokens, signing keys, service role keys, or environment file contents.

## Suggested Codex implementation

1. Check if destination exists; if yes, **stop without overwriting**.
2. Check the source ref SHA, compare to the reviewed SHA above, and record any deviations.
3. Use Git/GitHub CLI with authorized repository access; sparse checkout selected directories rather than cloning full historical binary artifacts.
4. Create the new source snapshot in a fresh local repository. Never include `.git` from source.
5. Audit files before commit: secret detection + checksums, no accidental active workflows, all required source paths present.
6. Create destination PRIVATE via an authorized GitHub operation (example: `gh repo create zetsuen1412-alt/comeplayers-core --private`).
7. Push `main` to destination. Confirm GitHub API reports `private: true`, compare local and remote HEAD SHA, and verify files via GitHub API.
8. Commit `migration-reference/MIGRATION-MANIFEST.json` containing source ref/SHA, copy scope, excluded groups, file count, and release safety state.
9. Report final repository URL, commit SHA, integrity-check summary, and any blockers. **Do not infer success from a local script running.**

## If Codex does not have permission to create repositories

Produce a tested idempotent source-migration tool on a review branch and explain the exact permission limitation. Do not claim a new repository exists or change source production. The user specifically cannot do a long manual script procedure; favor a minimal, explicit, actionable authorization step rather than asking them to run tooling.

## Milestones

- [ ] Source audit & safe migration tool ready
- [ ] Destination repo created PRIVATE
- [ ] Core source pushed + checksums verified
- [ ] Production/old-repo unchanged confirmed
- [ ] Review results recorded back on issue #119

**Review gate:** Migrating source does not approve production deployment or moving Vercel. Those actions require a separate user instruction.
