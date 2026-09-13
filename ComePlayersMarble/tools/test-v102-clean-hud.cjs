const fs = require('fs');
const path = require('path');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/scripts/ui/MatchHUD.ts'), 'utf8');
assert(source.includes('CleanHudInfoPanelV102'), 'Missing optional info panel.');
assert(source.includes('this.advancedHudPanel.active = false'), 'Info panel must start hidden.');
assert(source.includes('toggleAdvancedHud'), 'Missing INFO toggle.');
assert(source.includes("this.advancedHudButtonLabel.string = this.advancedHudPanel.active ? 'CLOSE' : 'INFO'"), 'INFO button state is not synchronized.');
assert(source.includes('VideoReferenceDiceDockV105'), 'Missing compact dice dock.');
assert(source.includes('VideoReferencePlayerCardV105'), 'Missing compact player cards.');
assert(source.includes('const hasBlockingDecision'), 'Info panel must hide during important decisions.');
for (const marker of ['ClassicVictoryTrackerV90','ClassicTurnOrderRailV90','ClassicCityIntelRailV90','ClassicSpecialDistrictRailV90','ClassicLiquidationStatusRailV90']) {
  assert(!source.includes(marker), `Blocking HUD marker remains: ${marker}`);
}
console.log('V102 Clean Match HUD checks passed.');
