# Windows startup connection recovery

Windows 2.0.7 fixes a recovery gap: when the first roster/queue refresh timed out,
the polling timer had never started. The app showed an empty workspace and
"Login belum aktif" even though an encrypted session was still loaded.

Polling now starts before the first read. Read-only refreshes retry on the normal
30-second timer, with a visible Sambungkan ulang button and connection status.
An incomplete refresh keeps the last complete snapshot and blocks order actions.
Startup/background failures are shown inline instead of a blocking error dialog.
Reads have a 20-second deadline and interactive login has a 25-second deadline.
Photo uploads and other mutations retain their 75-second deadline and are never
replayed automatically.

An interrupted token refresh can already have rotated the refresh token. The
client requires interactive sign-in instead of replaying it, including reads
already waiting for the refresh lock. The encrypted session and local history
are preserved; neither is deleted due to a network error.

Validation uses fake transports, a genuinely stalled cancellable read, encrypted
synthetic sessions and hidden native forms. It covers startup failure followed
by successful reconnect, subsequent disconnect retaining the snapshot, uncertain
session recovery, concurrent refresh callers, and exactly-once mutation attempts.

The reported initial 75-second request could not be reproduced against an
authenticated production session. Unauthenticated requests from the affected PC
responded in 55–226 ms, and the available runtime error query returned no errors.
These observations confirm current basic connectivity, not the original network
cause. The UI recovery defect is reproduced and fixed independently.

No backend, Android, database, Payroll, salary or Closing change is required.
