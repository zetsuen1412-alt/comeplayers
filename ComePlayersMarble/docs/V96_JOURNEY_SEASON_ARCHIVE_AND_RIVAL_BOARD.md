# V96 Journey Season Archive & Rival Board

## Purpose

V96 makes monthly World Journey seasons persistent instead of silently resetting the active season state. It also adds an offline rival board that communicates progression pressure without presenting simulated entries as an online leaderboard.

## Season archive

When the UTC month changes, the next completed local match archives the previous season before creating the new season state. Each archive record stores:

- Season identifier.
- Final Journey XP.
- Completed base tier count.
- Prestige level.
- CP earned from Journey rewards during that season.
- Perfect Journey Day and Perfect Journey Week totals for the season.
- Best active-day streak.
- Archive timestamp.

The archive is duplicate-safe by season ID and retains the twelve most recent seasons. Lifetime Journey XP, lifetime reward totals, and lifetime Perfect Cycle totals are preserved across rollovers.

## Local rival board

The Career page includes a deterministic six-entry local rival board. Five named rivals are generated from the active season identifier and the player's current Journey XP. The entry named `YOU` is always the local player. The board is explicitly local and does not claim to represent Supabase or global ranking data.

## Save migration

Career progression version 5 adds season archives, lifetime Journey XP, best-season XP, season reward counters, and season-specific Perfect Cycle counters. Local save version 9 imports version 8 and all earlier supported versions through the normalization path. Existing V95 Journey XP is used as the initial lifetime Journey XP fallback.

## Presentation

The Career page displays lifetime statistics, local rival rank, rival entries, and the latest archived season. Match results include a season-archive line when rollover occurs. `BoardView.showWorldJourneyHighlight` accepts a season-archive count and adds a turquoise archive ring, core, and pillars without changing gameplay authority.
