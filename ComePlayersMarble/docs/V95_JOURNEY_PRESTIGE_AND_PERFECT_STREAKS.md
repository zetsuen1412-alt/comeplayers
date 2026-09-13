# V95 Journey Prestige & Perfect Streaks

## Purpose

V95 extends World Journey progression beyond the twenty base tiers and rewards consistent participation without changing match authority or board rules.

## Prestige progression

The base Journey still contains twenty tiers at 500 Journey XP each. After 10,000 Journey XP, players enter a ten-level Prestige track. Each Prestige level requires 1,000 additional Journey XP. Prestige rewards are claimed atomically in the same career save transaction as the match result.

## Perfect cycles

A Perfect Journey Day is completed when all three missions selected for the current UTC day are complete. A Perfect Journey Week is completed when all four missions selected for the current UTC week are complete. The reward identifiers include the UTC cycle ID, preventing duplicate rewards across repeated matches.

- Perfect Day: CP 20,000 and 250 Journey XP.
- Perfect Week: CP 75,000 and 800 Journey XP.

## Activity streak

The first completed local match of each UTC day advances the activity streak. Consecutive UTC days increase the streak; a missed day resets it to one on the next active day. The first match of the day receives a bounded Journey XP bonus. Additional matches on the same day cannot repeat that bonus.

## Save migration

Career progression version 4 adds Prestige claims, Perfect Cycle IDs, streak state, and lifetime Perfect Cycle counters. Local save version 8 imports version 7 and earlier supported bundles through the existing normalization path. Missing V95 fields receive safe defaults.

## Presentation

The Career page displays Prestige, streak, Perfect Day, and Perfect Week state. The match result lists Perfect Cycle rewards, Prestige rewards, and the streak bonus separately. `BoardView.showWorldJourneyHighlight` accepts an optional Prestige level and adds a second ring and crown without affecting gameplay state.
