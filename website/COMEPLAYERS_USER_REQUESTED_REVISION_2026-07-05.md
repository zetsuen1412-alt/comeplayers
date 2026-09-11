# User-requested group and livestream revision

The transactional group-creation RPC and atomic stream start/stop RPC changes were removed at the user's request.

The project now keeps the original V24 behavior:

- group creation inserts the room and members through the existing API route;
- livestream start and stop update `chat_rooms` through the existing API route;
- group creation and livestream features remain available;
- chat participant email privacy and the other security fixes remain active.

If the earlier V24.1 atomic RPC migration was already applied, `OPTIONAL_REMOVE_ATOMIC_RPCS.sql` can remove the unused functions.

Validation after this revision:

- application TypeScript passed;
- E2E TypeScript passed;
- 109/109 tests passed;
- revised group/stream/test files passed ESLint;
- full-project ESLint remained at 0 errors and 103 pre-existing warnings.
