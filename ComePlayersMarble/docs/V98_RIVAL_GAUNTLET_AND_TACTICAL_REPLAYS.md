# ComePlayers Marble V98 — Rival Gauntlet & Tactical Replays

## Release goal

V98 adds a second seasonal competitive layer on top of V97 Rival Rating. Rival Rating continues to represent ranking strength, while the Rival Gauntlet rewards consistent match activity, podium streaks, high performance, awards, and classic Monopoly victories.

## Rival Gauntlet score

Every completed match awards seasonal Gauntlet score from:

- final placement;
- performance score;
- Match Legacy Awards;
- Triple, Line, or Tourism Monopoly victories;
- consecutive podium finishes.

A fourth-place result still grants bounded participation score, but resets the current podium streak. The best podium streak remains stored for the season archive.

## Six seasonal circuits

1. Qualifier Signal — 100 score.
2. Bronze Circuit — 250 score.
3. Silver Circuit — 450 score.
4. Gold Circuit — 700 score.
5. Elite Circuit — 1,000 score.
6. Gauntlet Champion — 1,400 score.

Each circuit grants CP and Journey XP exactly once. Reward IDs are persisted independently from Rival Contract IDs.

## Tactical Replay Reel

Career highlights now include two replay-analysis fields:

- **Tactical tag** — identifies the match lesson, such as Triple Monopoly Study, Takeover Command, City Architect, World Router, Arcade Control, or Recovery Study.
- **Replay priority** — a score from 0 to 200 based on performance, awards, classic victory, and match activity.

The Career page and Replay Studio show the newest tactical study and priority score to help players choose useful matches to review.

## Season archive

Monthly UTC rollover additionally archives:

- final Rival Gauntlet score;
- best podium streak;
- completed Gauntlet circuit count.

Season score, current podium streak, and claimed circuit IDs reset for the new season. Lifetime Gauntlet reward credits remain intact.

## Presentation

- Lobby and Career Command use V98 Rival Gauntlet status.
- Result HUD shows score gained, current division, podium streak, and circuit rewards.
- Final Honors prioritizes newly completed Gauntlet circuits.
- A new 3D Gauntlet effect uses score rings, circuit gates, podium pips, and a central core around the human player.

## Save migration

- Career progression version: 7.
- Local save version: 11.
- V97 and older supported saves receive safe default Gauntlet fields automatically.
- Existing Career, Journey, Rival Rating, contracts, replay, ranked, economy, and multiplayer data are preserved.

## Compatibility

Rival Gauntlet progression is local metagame progression. It does not alter dice results, property economy, victory conditions, bot authority, replay determinism, ranked RP, or Supabase authoritative multiplayer state.
