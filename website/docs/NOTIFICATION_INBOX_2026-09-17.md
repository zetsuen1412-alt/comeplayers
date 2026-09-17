# Notification inbox dismissal

## Behavior

- The header dropdown shows unread personal notifications and unread visible announcements only.
- Opening an entry persists its read state before normal in-app navigation.
- Clear all marks the signed-in user's notification backlog through the highest ID in the loaded snapshot as read, plus the loaded unread announcements. Notifications with newer IDs remain unread.
- Read entries remain available in Notification Center under All history. No database rows, orders, payments, or messages are deleted.
- Network/database errors are shown rather than silently discarding the inbox. Mutations use a busy lock. Loads are refreshed explicitly and old-account inbox responses are discarded.

## Verification

Eight injected-client unit tests passed locally using the Node test runner after TypeScript transpilation. These verify query scope and errors, not live Supabase RLS or browser behavior. Run with installed website dependencies:

```sh
npx tsx --test tests/notificationInbox.test.ts
npm run typecheck
npm run build
```

Authenticated browser testing, including reload persistence, cross-device reads, new arrivals during clearing, and account switching, remains required before release.

## Website-only build boundary

The first Vercel preview compiled the application successfully, then failed TypeScript checking because `tests/browserE2eeProtocol.test.ts` imports `../comeplayers-apps/apps/mobile/src/secure/multiDevice` (relative to the repository layout). The mobile implementation imports `hpke` from its own workspace, whose dependencies are not installed by Vercel's website-only installation. This is not a notification or encryption-code change.

Production Next.js builds now use `tsconfig.build.json`, extending the existing strict configuration and excluding the test directory. The original `tsconfig.json`, `npm run typecheck`, test scripts, mobile sources, cryptographic code, package versions, and lockfiles are unchanged. Full test/typecheck runs still require both workspaces to be installed. Application imports remain typechecked; `ignoreBuildErrors` remains false. Development uses the original configuration.

No database migration or production deployment is performed by this change. Publishing requires reviewing and merging the pull request and a successful deployment.
