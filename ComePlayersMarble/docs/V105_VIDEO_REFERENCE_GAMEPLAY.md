# V105 Video Reference Gameplay

## Reference analyzed
- File: `monopoli1(1).mp4`
- Resolution: 638×360
- Frame rate: approximately 29.97 fps
- Duration: approximately 25 minutes 35 seconds

## Observed presentation rules
1. The board is visible almost completely for the whole match.
2. The camera uses a stable isometric angle and does not chase each movement step.
3. Player information is anchored to the four screen corners.
4. The center is a neutral gray arena used for dice and small event notices.
5. The roll button is centered at the bottom.
6. Buildings are compact and readable from the overview camera.
7. Property group colors are saturated and easy to identify.
8. Money stacks and light scenery sit outside the track without covering it.
9. Popup windows are centered but relatively small.
10. Visual effects are brief and do not obscure the board.

## V105 implementation
- Introduced a fixed full-board camera preset.
- Replaced the sky/world center with a gray dice arena.
- Replaced the arcade cabinet floor with a restrained wood table.
- Rebuilt tile surfaces into ivory cards with strong color bands.
- Rebuilt property stages with compact silhouettes.
- Simplified route, active tile, and landing effects.
- Restyled and reduced the match HUD.
