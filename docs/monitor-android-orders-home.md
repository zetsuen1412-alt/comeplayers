# Android 1.7.5 — orders first

The main screen after launch or sign-in is Order Baru. Bottom navigation has
three destinations: Order, Tugas and Menu. Menu retains employees, Tutup Buku,
team summary, local history, settings and authorized admin tools.

The compact white/blue home shows reference, game, Discord, a two-line TASK
preview and TAKE. Detail opens the complete TASK/order information; TAKE still
requires employee selection and confirmation through the existing server flow.
Search covers reference, game, Discord and TASK. Refresh failures keep the last
readable queue but disable TAKE; loading and empty results have distinct states.
Periodic renders preserve scroll position and home search focus/text.

The read-only pending endpoint now includes verified Telegram postedAt and sorts
the combined Payroll-linked and unpriced queue by that timestamp descending.
The sale date and numeric order reference do not determine which order is newest.
The source/sender checks, scope, take eligibility, schema and credentials filtering
are unchanged. Existing Windows clients accept the additional field.

Tugas retains START, PAUSE/CONTINUE and DONE photo reports. Group connectivity
diagnostics move to Settings; internal employee codes are no longer shown on
task cards. Notifications, the ten-second music clip, package identity, signing
key and local employee/history database remain unchanged.

Validation uses Android 15 framework views and synthetic data, including a real
native-graphics render at 360×800, compact 320dp-phone layout, explicit TAKE/detail
actions, disabled/error states, search and main-screen/navigation checks. Run the
Android tests with MONITOR_PREVIEW_DIR set to export android-order-home.png.
No physical phone, real credentials or Telegram reports are used by these tests.

Release package: id.comeplayers.boostmonitor.fh3.accounts, version 1.7.5, code 13.
No database migration is required. Production release requires owner approval.
