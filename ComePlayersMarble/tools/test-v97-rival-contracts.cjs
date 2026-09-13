'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ts;
try {
    ts = require('typescript');
} catch {
    ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
}

const root = path.resolve(__dirname, '..');
const sourceFile = path.join(root, 'assets', 'scripts', 'core', 'CareerJourneyService.ts');
const source = fs.readFileSync(sourceFile, 'utf8');
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
    },
    fileName: sourceFile,
    reportDiagnostics: true,
});
const errors = (transpiled.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
if (errors.length > 0) {
    throw new Error(errors.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n')).join('\n'));
}

const moduleValue = { exports: {} };
const sandbox = {
    module: moduleValue,
    exports: moduleValue.exports,
    require,
    console,
    Date,
    Math,
    Set,
};
vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourceFile });
const { CareerJourneyService } = moduleValue.exports;
if (typeof CareerJourneyService !== 'function') throw new Error('CareerJourneyService export is missing.');

function cycle(id = '') {
    return {
        id,
        matches: 0,
        wins: 0,
        podiums: 0,
        propertyActions: 0,
        worldTravels: 0,
        gameCenterWins: 0,
        takeovers: 0,
        classicVictories: 0,
        claimedMissionIds: [],
    };
}

function progression() {
    return {
        seasonId: '',
        seasonExperience: 0,
        claimedTierIds: [],
        claimedPrestigeIds: [],
        perfectDailyIds: [],
        perfectWeeklyIds: [],
        totalRewardCredits: 0,
        seasonRewardCredits: 0,
        activeDayStreak: 0,
        bestActiveDayStreak: 0,
        seasonBestActiveDayStreak: 0,
        lastActiveDayId: '',
        totalPerfectDaily: 0,
        totalPerfectWeekly: 0,
        seasonPerfectDaily: 0,
        seasonPerfectWeekly: 0,
        lifetimeJourneyExperience: 0,
        seasonsCompleted: 0,
        bestSeasonExperience: 0,
        seasonArchive: [],
        rivalRating: 1000,
        lastRivalRatingChange: 0,
        bestRivalRank: 6,
        seasonBestRivalRank: 6,
        seasonRivalMatches: 0,
        seasonRivalWins: 0,
        seasonRivalPodiums: 0,
        seasonElitePerformances: 0,
        totalRivalWins: 0,
        claimedRivalContractIds: [],
        totalRivalRewardCredits: 0,
        seasonRivalRewardCredits: 0,
        daily: cycle(),
        weekly: cycle(),
    };
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

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const service = new CareerJourneyService();
const january = Date.UTC(2026, 0, 15, 12, 0, 0);
let state = service.alignProgression(progression(), january);
let snapshot = service.snapshot(state, january);
assert(snapshot.rivalRating === 1000, 'Default Rival Rating should be 1000.');
assert(snapshot.localRivalBoard.length === 6, 'Rival Board should contain six entries.');
assert(snapshot.localRivalBoard.every((entry, index, values) => index === 0 || values[index - 1].rating >= entry.rating), 'Rival Board must be sorted by rating.');

let reward = service.recordMatch(state, context({
    won: true,
    rank: 1,
    classicVictory: true,
    performanceScore: 92,
    awardCount: 2,
}), january + 1_000);
state = reward.progression;
assert(reward.rivalRatingChange > 0, 'Strong victory should increase Rival Rating.');
assert(reward.completedRivalContractTitles.includes('RIVAL DEBUT'), 'First match should complete Rival Debut.');
assert(reward.rivalCredits >= 15_000, 'Rival Debut credit reward is missing.');
assert(reward.rivalExperience >= 150, 'Rival Debut JXP reward is missing.');
assert(state.seasonRivalMatches === 1 && state.seasonRivalWins === 1, 'Season rival match counters are incorrect.');

for (let index = 0; index < 2; index++) {
    reward = service.recordMatch(state, context({
        won: index === 0,
        rank: index === 0 ? 2 : 3,
        performanceScore: index === 0 ? 82 : 68,
        awardCount: 1,
    }), january + 2_000 + index);
    state = reward.progression;
}
assert(state.claimedRivalContractIds.includes('rival-podium-hunter'), 'Podium Hunter contract should be claimed.');
assert(state.claimedRivalContractIds.includes('rival-elite-signal'), 'Elite Signal contract should be claimed.');
const rewardBeforeReplay = state.totalRivalRewardCredits;
reward = service.recordMatch(state, context({ rank: 4, performanceScore: 45 }), january + 4_000);
state = reward.progression;
assert(!reward.completedRivalContractTitles.includes('PODIUM HUNTER'), 'A claimed contract must not reward twice.');
assert(state.totalRivalRewardCredits === rewardBeforeReplay, 'Rival contract credits duplicated.');

for (let index = 0; index < 12 && service.snapshot(state, january + 5_000 + index).localRivalRank !== 1; index++) {
    reward = service.recordMatch(state, context({
        won: true,
        rank: 1,
        classicVictory: true,
        performanceScore: 100,
        awardCount: 5,
    }), january + 5_000 + index);
    state = reward.progression;
}
snapshot = service.snapshot(state, january + 20_000);
assert(snapshot.localRivalRank === 1, 'Repeated elite wins should reach Rival Board rank #1.');
assert(state.claimedRivalContractIds.includes('rival-season-champion'), 'Rival Board Champion contract should be claimed.');
assert(snapshot.bestRivalRank === 1 && snapshot.seasonBestRivalRank === 1, 'Best Rival Rank tracking is incorrect.');

const february = Date.UTC(2026, 1, 1, 1, 0, 0);
const rolled = service.alignProgression(state, february);
assert(rolled.seasonsCompleted === 1, 'Season rollover should increment seasonsCompleted.');
assert(rolled.seasonArchive.length === 1, 'Season rollover should create one archive entry.');
assert(rolled.seasonArchive[0].finalRivalRating === state.rivalRating, 'Archived Rival Rating is incorrect.');
assert(rolled.seasonArchive[0].completedRivalContractCount === state.claimedRivalContractIds.length, 'Archived contract count is incorrect.');
assert(rolled.rivalRating === 1000, 'New season should reset Rival Rating to 1000.');
assert(rolled.claimedRivalContractIds.length === 0, 'New season should reset Rival Contracts.');
assert(rolled.totalRivalRewardCredits === state.totalRivalRewardCredits, 'Lifetime Rival rewards must persist.');

console.log(JSON.stringify({
    ok: true,
    finalRank: snapshot.localRivalRank,
    finalRating: snapshot.rivalRating,
    completedContracts: state.claimedRivalContractIds.length,
    archivedSeasons: rolled.seasonsCompleted,
    archivedRating: rolled.seasonArchive[0].finalRivalRating,
}, null, 2));
