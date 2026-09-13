# V59 Server-Authoritative Property Economy

V59 extends the V58 command protocol so the client cannot choose property prices, rent, building levels, takeover values, liquidation results, bankruptcy, or the winner.

## New database state

`marble_authoritative_match_properties` stores one authoritative owner per board tile with building level, rent multiplier, protection state, and acquisition timestamps. Direct writes are not granted to client roles. Room members receive read-only access through RLS.

## Commands

- `ROLL`: server rolls, moves, resolves the landing, pays START salary, applies rent/tax/bonus, and creates a pending decision.
- `PURCHASE`: validates the unowned landed city and subtracts the server price.
- `UPGRADE`: validates ownership, balance, next level, and Landmark cost.
- `TAKEOVER`: validates opponent ownership, team rules, Landmark protection, and twice-property-value cost.
- `END_TURN`: skips any optional pending decision, advances the active seat, and evaluates victory.

Every command still requires authenticated current-turn ownership, expected revision, and an idempotency key.

## Economy rules mirrored from the Cocos board

- 32 board spaces
- Starting money: CP 2,000,000 by default
- START salary: CP 200,000
- City purchase price scales by board quarter
- Upgrade costs: CP 30,000 / 50,000 / 80,000 / 180,000
- Rent by level: base / 30,000 / 65,000 / 120,000 / 220,000
- Takeover: twice the accumulated property value
- Landmark properties cannot be taken over
- Team partners do not pay each other rent
- Tax: CP 100,000
- Bonus Game economy reward: CP 120,000

## Liquidation and bankruptcy

When a player cannot cover rent or tax, Postgres sells the player's highest-value property to the bank at 70% of accumulated value and repeats until the amount can be paid. Each sale becomes an `ASSET_LIQUIDATED` event. If all assets and cash are insufficient, the remaining cash is paid, remaining properties return to the bank, and `PLAYER_BANKRUPT` is appended.

## Victory

- Solo: last non-bankrupt player wins.
- Team: last team with a non-bankrupt member wins.
- Round limit: highest server-calculated net worth wins; Team mode aggregates both partners.

## Client contract

`AuthoritativeMatchSnapshot` now includes mode, max rounds, landing, pending action, properties, player property count/net worth, and final winner data. The Online Center enables economy buttons only for the authenticated current player.

## Deferred systems

Fortune cards, Game Center choices, Olympic selection, World Travel destination, Island state, and full 3D remote board reconstruction remain outside the V59 server reducer.
