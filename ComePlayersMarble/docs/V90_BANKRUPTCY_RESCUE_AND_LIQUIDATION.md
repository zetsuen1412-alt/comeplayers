# V90 Bankruptcy Rescue & Liquidation

V90 replaces the old partial-rent bankruptcy shortcut with a complete rescue economy.

## Payment flow

1. Calculate final rent after building level, Olympic multiplier, Color Monopoly, and rent shield.
2. Compare rent with the payer's cash.
3. If cash is insufficient, invoke `LiquidationService.coverShortfall`.
4. Downgrade buildings in strategic order and recover 70% of each construction step.
5. If necessary, return land to the bank for 60% of purchase price.
6. Pay the owner with the available amount.
7. Declare bankruptcy only if an unpaid balance remains.
8. Recalculate takeover eligibility from the player's post-payment state.

## Strategic preservation

The model increases preservation priority for:

- Completed Color Monopoly groups.
- Near-complete color groups.
- Tourism properties and Tourism Monopoly progress.
- Landmarks.
- Protected properties.
- High-rent cities.

Lower-priority assets are liquidated first.

## Presentation

- `ClassicLiquidationStatusRailV90` reports rescue status.
- The payment dialog displays cash before rent, recovered value, action count, unpaid balance, and survival state.
- `ClassicLiquidationAuctionV90` adds auction rings, recovery beams, and a bank seal to affected tiles.
- `GameBootstrap` synchronizes every downgraded or released property with the live board before the turn ends.

## Compatibility

No save schema fields were added. The system derives liquidation state during the current payment, so V89 saves and existing career/ranked/replay data remain compatible.
