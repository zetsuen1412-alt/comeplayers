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
const {
    createDefaultCareerProgression,
    normalizeCareerProgression,
} = require(path.join(root, 'assets', 'scripts', 'save', 'CareerProgressionData.ts'));
const { CareerProgressionService } = require(path.join(root, 'assets', 'scripts', 'core', 'CareerProgressionService.ts'));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const migrated = normalizeCareerProgression({
    ...createDefaultCareerProgression(),
    version: 5,
    journey: {
        seasonId: '2026-01',
        seasonExperience: 750,
        claimedTierIds: ['journey-tier-1'],
        claimedPrestigeIds: [],
        perfectDailyIds: [],
        perfectWeeklyIds: [],
        totalRewardCredits: 10_000,
        seasonRewardCredits: 10_000,
        activeDayStreak: 2,
        bestActiveDayStreak: 2,
        seasonBestActiveDayStreak: 2,
        lastActiveDayId: '2026-01-15',
        totalPerfectDaily: 0,
        totalPerfectWeekly: 0,
        seasonPerfectDaily: 0,
        seasonPerfectWeekly: 0,
        lifetimeJourneyExperience: 750,
        seasonsCompleted: 0,
        bestSeasonExperience: 0,
        seasonArchive: [],
        daily: {
            id: '2026-01-15',
            matches: 0,
            wins: 0,
            podiums: 0,
            propertyActions: 0,
            worldTravels: 0,
            gameCenterWins: 0,
            takeovers: 0,
            classicVictories: 0,
            claimedMissionIds: [],
        },
        weekly: {
            id: '2026-W03',
            matches: 0,
            wins: 0,
            podiums: 0,
            propertyActions: 0,
            worldTravels: 0,
            gameCenterWins: 0,
            takeovers: 0,
            classicVictories: 0,
            claimedMissionIds: [],
        },
    },
});
assert(migrated.version === 6, 'Career save should migrate to version 6.');
assert(migrated.journey.rivalRating === 1000, 'V96 save should receive the default Rival Rating.');
assert(migrated.journey.bestRivalRank === 6, 'V96 save should receive the default best Rival rank.');
assert(migrated.journey.claimedRivalContractIds.length === 0, 'V96 save should start with unclaimed Rival Contracts.');

let stored = migrated;
const store = {
    loadCareerProgression() {
        return stored;
    },
    saveCareerProgression(data) {
        stored = normalizeCareerProgression(data);
        return { data: stored, persisted: true };
    },
};
const timestamp = Date.UTC(2026, 0, 15, 13, 0, 0);
const service = new CareerProgressionService(store, () => timestamp);
const summary = {
    winnerId: 'human',
    matchMode: 'SOLO',
    completedRound: 12,
    reason: 'TRIPLE_MONOPOLY',
    teamEntries: [],
    entries: [
        {
            playerId: 'human',
            name: 'Alexia',
            color: '#f5c323',
            money: 1_250_000,
            propertyValue: 2_000_000,
            propertyCount: 12,
            buildingCount: 20,
            bankrupt: false,
            rank: 1,
            netWorth: 3_250_000,
        },
        {
            playerId: 'nova',
            name: 'Nova',
            color: '#58b8ff',
            money: 400_000,
            propertyValue: 500_000,
            propertyCount: 4,
            buildingCount: 5,
            bankrupt: false,
            rank: 2,
            netWorth: 900_000,
        },
        {
            playerId: 'mira',
            name: 'Mira',
            color: '#ff7edb',
            money: 200_000,
            propertyValue: 300_000,
            propertyCount: 3,
            buildingCount: 2,
            bankrupt: false,
            rank: 3,
            netWorth: 500_000,
        },
        {
            playerId: 'ray',
            name: 'Ray',
            color: '#78df9a',
            money: 0,
            propertyValue: 0,
            propertyCount: 0,
            buildingCount: 0,
            bankrupt: true,
            rank: 4,
            netWorth: 0,
        },
    ],
};
const reward = service.recordMatch(summary, 'human', {
    propertyActions: 8,
    worldTravels: 1,
    gameCenterWins: 1,
    takeovers: 2,
});
const snapshot = service.snapshot();
assert(reward.persisted, 'Career result should persist.');
assert(reward.completedJourneyRivalContractTitles.includes('RIVAL DEBUT'), 'Career integration should expose Rival Contract completion.');
assert(snapshot.highlightReel.length === 1, 'A classic elite win should create one Highlight Reel entry.');
assert(snapshot.highlightReel[0].title !== 'CAREER MATCH RECORD', 'Highlight Reel should use a meaningful title.');
assert(snapshot.journey.rivalRating > 1000, 'Elite victory should increase Rival Rating.');
assert(snapshot.journey.localRivalBoard.some((entry) => entry.player && entry.rating === snapshot.journey.rivalRating), 'Rival Board should include the player rating.');

console.log(JSON.stringify({
    ok: true,
    careerVersion: stored.version,
    highlightCount: snapshot.highlightReel.length,
    highlightTitle: snapshot.highlightReel[0].title,
    rivalRating: snapshot.journey.rivalRating,
    rivalRank: snapshot.journey.localRivalRank,
    completedContracts: reward.completedJourneyRivalContractTitles,
}, null, 2));
