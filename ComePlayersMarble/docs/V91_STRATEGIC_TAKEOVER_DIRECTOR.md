# V91 Strategic Takeover Director

V91 turns property acquisition after rent payment into a readable strategic decision instead of a blind cost prompt.

## Forecast model

`TakeoverStrategyService` evaluates the proposed transfer without mutating the live match. It reports:

- Cash reserve after takeover.
- Reserve risk: SAFE, TIGHT, or DANGER.
- Buyer color-group ownership before and after transfer.
- Rival color-group ownership before and after transfer.
- Whether the transfer completes a Color Monopoly.
- Whether the transfer breaks a rival Color Monopoly.
- Projected rent after ownership changes.
- Progress gained toward Triple, Line, or Tourism Monopoly.
- A normalized strategic score from 0 to 100.
- Tactical tags shown directly in the payment window.

Team Match uses combined team ownership when calculating color groups and victory progress.

## Bot behavior

Bots no longer compare only raw rent with takeover cost. They reject dangerous acquisitions unless the property completes a color set or makes a large victory-path gain. Smart and Expert bots accept strategically decisive takeovers more aggressively.

## Presentation

- `ClassicTakeoverStrategyRailV91` keeps takeover analysis visible as a supported match system.
- The payment window displays cost, reserve, projected rent, group transitions, score, and tactical tags.
- `ClassicTakeoverDirectorV91` replaces a plain marker swap with a complete ownership-transfer sequence.
- High-impact acquisitions receive stronger camera impact and additional VFX particles.

## Compatibility

No persistent save fields were added. Existing V90 career, ranked, replay, profile, and match settings remain valid.
