# V79 Classic Dice Control and Board Motion

V79 focuses on two areas visible throughout classic marble-board gameplay: pre-roll targeting and readable movement across the board.

## Dice control architecture

The HUD sends a `DiceControlRequest` containing parity, range, and accuracy to the local match authority. The local authority generates multiple seeded candidate pairs and scores each candidate. It returns the strongest match while preserving random failure cases.

The 3D dice animation receives the returned authority result and only visualizes it. It never generates the match result.

The Supabase authoritative protocol is untouched. Online matches continue to use the server result without local manipulation.

## Movement route presentation

The destination path now contains:

- glowing points on each traversed tile;
- connected route rails between consecutive tiles;
- a larger final marker;
- an animated destination beacon;
- the existing active-tile halo and landing burst.

All markers are presentation objects and are removed after movement.

## Construction presentation

Purchase and upgrade actions now create a short construction sequence around the tile. Six vertical light beams rise around the property while a gold ring expands from the foundation. The effect is removed automatically and does not change ownership, building level, rent, or authority state.

## Compatibility

V79 does not change local save schemas, replay schemas, ranked records, online profiles, or Supabase match protocols.
