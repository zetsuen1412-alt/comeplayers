# V53 Smart AI and World Events

## Goals

V53 expands local matches without introducing online dependencies or real-money systems. The update adds selectable bot behavior and controlled match-wide events while preserving all V49-V52 saves and loadouts.

## AI difficulty

The Local Room now stores one of three bot profiles:

- **Casual** keeps a smaller cash reserve and takes more economic risks.
- **Smart** uses the balanced V52 strategy with improved group awareness.
- **Expert** protects a larger reserve, avoids high enemy rent more strongly, prioritizes landmarks, and uses stricter takeover evaluation.

The setting affects purchase, upgrade, World Travel, takeover, and Game Center decisions. Dice results remain authoritative and are not modified by AI difficulty.

## World Events

When enabled, one deterministic event runs every two rounds beginning at round 2. Events are selected from the match seed, making a seeded debug match repeatable.

Events are one-time round transitions rather than permanent hidden modifiers:

1. Sponsor Drop.
2. Construction Grant.
3. Travel Festival.
4. Insurance Day.
5. City Maintenance.
6. Comeback Fund.

Bankrupt players are excluded. City Maintenance is capped so the event itself cannot reduce a player below CP 1.

## Presentation

The event appears between turns using the existing cinematic overlay, semantic audio cue, and pooled celebration VFX. The latest event title remains visible in the round information for the event round.

## Save compatibility

`MatchSettingsData` is now version 2. Version-1 room settings normalize automatically with these defaults:

- Bot difficulty: `SMART`.
- World Events: enabled.

The outer local save remains version 3, so V52 character inventory, pendants, boosters, career history, and active-character progression remain intact.
