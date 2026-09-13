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
const {
    createDefaultLocalSaveData,
    normalizeLocalSaveData,
    LOCAL_SAVE_VERSION,
} = require(path.join(root, 'assets', 'scripts', 'save', 'LocalSaveData.ts'));
const { CareerProgressionService } = require(path.join(root, 'assets', 'scripts', 'core', 'CareerProgressionService.ts'));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const migrated = normalizeCareerProgression({
    ...createDefaultCareerProgression(),
    version: 6,
    journey: {
        ...createDefaultCareerProgression().journey,
        seasonId: '2026-01',
        seasonExperience: 750,
        rivalRating: 1_140,
        claimedRivalContractIds: ['rival-debut'],
    },
});
assert(migrated.version === 7, 'V97 Career save should migrate to Career version 7.');
assert(migrated.journey.seasonRivalGauntletScore === 0, 'Migrated save should receive zero Gauntlet score.');
assert(migrated.journey.rivalPodiumStreak === 0, 'Migrated save should receive zero podium streak.');
assert(migrated.journey.claimedRivalGauntletIds.length === 0, 'Migrated save should start with unclaimed Gauntlet circuits.');

const localV10 = {
    ...createDefaultLocalSaveData(),
    version: 10,
    careerProgression: migrated,
};
const localMigrated = normalizeLocalSaveData(localV10);
assert(LOCAL_SAVE_VERSION === 13, 'V100 local save version should be 13.');
assert(localMigrated.version === 13, 'V100 local save should migrate to version 13.');

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
    worldTravels: 2,
    gameCenterWins: 1,
    takeovers: 2,
});
const snapshot = service.snapshot();
assert(reward.persisted, 'Career result should persist.');
assert(reward.journeyRivalGauntletScoreGained > 0, 'Career reward should expose Gauntlet score gain.');
assert(reward.completedJourneyRivalGauntletTitles.includes('QUALIFIER SIGNAL'), 'Elite career match should clear Qualifier Signal.');
assert(reward.journeyRivalGauntletCredits === 10_000, 'Career reward should include Qualifier credits.');
assert(snapshot.journey.rivalGauntletScore > 0, 'Career snapshot should expose Gauntlet score.');
assert(snapshot.highlightReel.length === 1, 'Classic elite victory should create one tactical replay highlight.');
assert(snapshot.highlightReel[0].tacticalTag === 'TRIPLE MONOPOLY STUDY', 'Classic victory should receive the correct tactical replay tag.');
assert(snapshot.highlightReel[0].replayPriority >= 100, 'Elite classic victory should have high replay priority.');
assert(reward.totalCredits >= reward.journeyRivalGauntletCredits, 'Gauntlet credit reward should be included in total career credits.');

console.log(JSON.stringify({
    ok: true,
    careerVersion: stored.version,
    localSaveVersion: localMigrated.version,
    gauntletScore: snapshot.journey.rivalGauntletScore,
    gauntletDivision: snapshot.journey.rivalGauntletDivision,
    completedGauntlets: reward.completedJourneyRivalGauntletTitles,
    tacticalTag: snapshot.highlightReel[0].tacticalTag,
    replayPriority: snapshot.highlightReel[0].replayPriority,
}, null, 2));
