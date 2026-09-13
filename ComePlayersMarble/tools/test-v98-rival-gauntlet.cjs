'use strict';

const fs = require('fs');
const path = require('path');
let ts;
try {
    ts = require('typescript');
} catch {
    ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
}

require.extensions['.ts'] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            esModuleInterop: true,
        },
        fileName: filename,
        reportDiagnostics: true,
    });
    const errors = (output.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
        throw new Error(errors.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n')).join('\n'));
    }
    module._compile(output.outputText, filename);
};

const root = path.resolve(__dirname, '..');
const { CareerJourneyService } = require(path.join(root, 'assets', 'scripts', 'core', 'CareerJourneyService.ts'));
const { createDefaultCareerJourneyProgression } = require(path.join(root, 'assets', 'scripts', 'save', 'CareerProgressionData.ts'));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function context(overrides = {}) {
    return {
        won: false,
        rank: 4,
        classicVictory: false,
        performanceScore: 50,
        awardCount: 0,
        activity: {
            propertyActions: 0,
            worldTravels: 0,
            gameCenterWins: 0,
            takeovers: 0,
        },
        ...overrides,
    };
}

const service = new CareerJourneyService();
const january = Date.UTC(2026, 0, 15, 12, 0, 0);
let state = service.alignProgression(createDefaultCareerJourneyProgression(), january);
let snapshot = service.snapshot(state, january);
assert(snapshot.rivalGauntletScore === 0, 'New season should start with zero Gauntlet score.');
assert(snapshot.rivalGauntletDivision === 'OPEN QUALIFIER', 'New season should start in Open Qualifier.');
assert(snapshot.rivalGauntlets.length === 6, 'V98 should expose six Rival Gauntlet circuits.');

let reward = service.recordMatch(state, context({
    won: true,
    rank: 1,
    classicVictory: true,
    performanceScore: 100,
    awardCount: 2,
}), january + 1_000);
state = reward.progression;
assert(reward.rivalGauntletScoreGained === 215, `Elite victory should grant 215 Gauntlet score, got ${reward.rivalGauntletScoreGained}.`);
assert(reward.completedRivalGauntletTitles.includes('QUALIFIER SIGNAL'), 'First elite victory should clear Qualifier Signal.');
assert(reward.rivalGauntletCredits === 10_000, 'Qualifier credit reward is incorrect.');
assert(reward.rivalGauntletExperience === 100, 'Qualifier Journey XP reward is incorrect.');
assert(state.rivalPodiumStreak === 1, 'First podium should start a one-match podium streak.');

reward = service.recordMatch(state, context({
    won: false,
    rank: 2,
    performanceScore: 80,
    awardCount: 1,
}), january + 2_000);
state = reward.progression;
assert(state.rivalPodiumStreak === 2, 'Second consecutive podium should extend the streak to two.');
assert(state.bestRivalPodiumStreak === 2, 'Best podium streak should track the season high.');
assert(reward.completedRivalGauntletTitles.includes('BRONZE CIRCUIT'), 'Second strong result should clear Bronze Circuit.');

const creditsAfterBronze = state.totalRivalGauntletRewardCredits;
reward = service.recordMatch(state, context({
    rank: 4,
    performanceScore: 35,
}), january + 3_000);
state = reward.progression;
assert(state.rivalPodiumStreak === 0, 'A non-podium result should reset the current podium streak.');
assert(state.bestRivalPodiumStreak === 2, 'Resetting the current streak must not erase the best streak.');
assert(state.totalRivalGauntletRewardCredits === creditsAfterBronze, 'Previously claimed Gauntlet rewards must not duplicate.');

for (let index = 0; index < 10 && state.claimedRivalGauntletIds.length < 6; index++) {
    reward = service.recordMatch(state, context({
        won: true,
        rank: 1,
        classicVictory: true,
        performanceScore: 100,
        awardCount: 5,
    }), january + 4_000 + index);
    state = reward.progression;
}
snapshot = service.snapshot(state, january + 20_000);
assert(state.claimedRivalGauntletIds.length === 6, 'Repeated elite victories should complete all six Gauntlet circuits.');
assert(snapshot.completedRivalGauntletCount === 6, 'Snapshot should expose all completed Gauntlet circuits.');
assert(snapshot.rivalGauntletDivision === 'GAUNTLET CHAMPION', 'Final Gauntlet division should be Gauntlet Champion.');
assert(snapshot.rivalGauntletProgress === 1, 'Completed Gauntlet should show full progress.');

const lifetimeGauntletCredits = state.totalRivalGauntletRewardCredits;
const february = Date.UTC(2026, 1, 1, 1, 0, 0);
const rolled = service.alignProgression(state, february);
assert(rolled.seasonArchive.length === 1, 'Season rollover should archive the completed Gauntlet season.');
assert(rolled.seasonArchive[0].finalRivalGauntletScore === state.seasonRivalGauntletScore, 'Archived Gauntlet score is incorrect.');
assert(rolled.seasonArchive[0].bestRivalPodiumStreak === state.bestRivalPodiumStreak, 'Archived podium streak is incorrect.');
assert(rolled.seasonArchive[0].completedRivalGauntletCount === 6, 'Archived completed Gauntlet count is incorrect.');
assert(rolled.seasonRivalGauntletScore === 0, 'New season should reset Gauntlet score.');
assert(rolled.rivalPodiumStreak === 0, 'New season should reset the current podium streak.');
assert(rolled.claimedRivalGauntletIds.length === 0, 'New season should reset claimed Gauntlet circuits.');
assert(rolled.totalRivalGauntletRewardCredits === lifetimeGauntletCredits, 'Lifetime Gauntlet credits must persist after rollover.');

console.log(JSON.stringify({
    ok: true,
    finalScore: state.seasonRivalGauntletScore,
    completedCircuits: state.claimedRivalGauntletIds.length,
    division: snapshot.rivalGauntletDivision,
    bestPodiumStreak: state.bestRivalPodiumStreak,
    archivedScore: rolled.seasonArchive[0].finalRivalGauntletScore,
}, null, 2));
