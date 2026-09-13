# V55 Ranked Season Architecture

## Scope

V55 adds an offline ranked progression layer to the existing Cocos Creator local match runtime. It is intentionally separated from the career level system so competitive rating can reset by season without deleting long-term character and career progress.

## Fixed ranked rules

- Four players.
- Twenty-second turns.
- Auto-roll on timeout.
- World Events enabled.
- Solo or Team mode follows the player's current room preference.
- AI difficulty is selected from placement status and current rating.

## Rating tiers

| Tier | Minimum RP |
|---|---:|
| Bronze | 600 |
| Silver | 900 |
| Gold | 1100 |
| Platinum | 1300 |
| Diamond | 1500 |
| Master | 1700 |

The first five matches are provisional. Positive placement changes are larger and losses are softened during placement.

## Season and week rollover

- Season ID uses the current UTC year and month.
- A new season resets seasonal RP, placements, season record, weekly activity, and recent ranked history.
- Lifetime matches, lifetime wins, best streak, and record sequence remain.
- Weekly progress resets every Monday UTC.

## Weekly reward

Five ranked matches unlock one local CP reward. Reward value follows the current tier. The claim state is stored in the version-4 local save bundle. If CP persistence fails, the ranked claim is restored.

## Local leaderboard

The leaderboard combines the player entry with deterministic simulated ComePlayers rivals positioned around the current rating. This is a presentation and progression prototype, not a public online ranking.

## Files

- `assets/scripts/save/RankedProgressionData.ts`
- `assets/scripts/core/RankedProgressionService.ts`
- `assets/scripts/save/LocalSaveData.ts`
- `assets/scripts/save/LocalSaveService.ts`
- `assets/scripts/save/MatchSettingsData.ts`
- `assets/scripts/core/GameBootstrap.ts`
- `assets/scripts/ui/FrontEndCatalog.ts`
- `assets/scripts/ui/FrontEndShell.ts`
- `assets/scripts/ui/MatchHUD.ts`
