'use strict';

const fs = require('fs');
const path = require('path');
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }

require.extensions['.ts'] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        fileName: filename,
        reportDiagnostics: true,
    });
    const errors = (output.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) throw new Error(errors.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, '\n')).join('\n'));
    module._compile(output.outputText, filename);
};

const root = path.resolve(__dirname, '..');
const { LiveAcademyObjectiveService } = require(path.join(root, 'assets', 'scripts', 'core', 'LiveAcademyObjectiveService.ts'));
const { ReplayLibraryService } = require(path.join(root, 'assets', 'scripts', 'core', 'ReplayLibraryService.ts'));
const { normalizeReplayLibrary, REPLAY_LIBRARY_VERSION } = require(path.join(root, 'assets', 'scripts', 'save', 'ReplayLibraryData.ts'));

function assert(condition, message) { if (!condition) throw new Error(message); }
function academy(focusMetric) {
    return {
        analyzedReplayCount: 3, averageScore: 70, trendDelta: 5, consistencyScore: 80,
        academyTier: 'GOLD ACADEMY', focusMetric, focusLabel: focusMetric,
        recommendation: 'Train.', recommendedReplayId: 'replay-1', completedDrillCount: 1, drills: [],
    };
}

const service = new LiveAcademyObjectiveService();
const tempo = service.create(academy('TEMPO'));
assert(!service.evaluate(tempo, { fastRolls: 2, propertyActions: 0, controlActions: 0, cash: 500000, bankrupt: false, finished: false }).completed, 'Tempo should not complete at 2/3.');
assert(service.evaluate(tempo, { fastRolls: 3, propertyActions: 0, controlActions: 0, cash: 500000, bankrupt: false, finished: false }).completed, 'Tempo should complete at 3/3.');
const economy = service.create(academy('ECONOMY'));
assert(service.evaluate(economy, { fastRolls: 0, propertyActions: 3, controlActions: 0, cash: 500000, bankrupt: false, finished: false }).completed, 'Economy should complete at 3 actions.');
const control = service.create(academy('CONTROL'));
assert(service.evaluate(control, { fastRolls: 0, propertyActions: 0, controlActions: 1, cash: 500000, bankrupt: false, finished: false }).completed, 'Control should complete with one control action.');
const resilience = service.create(academy('RESILIENCE'));
assert(!service.evaluate(resilience, { fastRolls: 0, propertyActions: 0, controlActions: 0, cash: 300000, bankrupt: false, finished: false }).completed, 'Resilience only completes at match end.');
assert(service.evaluate(resilience, { fastRolls: 0, propertyActions: 0, controlActions: 0, cash: 300000, bankrupt: false, finished: true }).completed, 'Resilience should complete solvent at match end.');
assert(service.rewardForStreak(1) === 6000, 'First live streak reward should be 6000 CP.');
assert(service.rewardForStreak(99) === 10000, 'Live streak reward should cap at 10000 CP.');

const migrated = normalizeReplayLibrary({ version: 3, nextSequence: 1, records: [] });
assert(REPLAY_LIBRARY_VERSION === 4, 'V101 replay library version should be 4.');
assert(migrated.academyProgress.liveObjectiveStreak === 0, 'V100 save should migrate with a zero live streak.');
let stored = migrated;
const library = new ReplayLibraryService({
    loadReplayLibrary() { return stored; },
    saveReplayLibrary(data) { stored = normalizeReplayLibrary(data); return { data: stored, persisted: true }; },
});
let result = library.recordLiveObjectiveResult('CONTROL', true, 6000);
assert(result.ok && result.snapshot.liveObjectiveStreak === 1, 'Completed live objective should start streak 1.');
assert(result.snapshot.liveObjectiveCompletions === 1, 'Completion count should increment.');
assert(result.snapshot.totalLiveObjectiveCredits === 6000, 'Reward credits should persist.');
result = library.recordLiveObjectiveResult('TEMPO', true, 7000);
assert(result.snapshot.liveObjectiveStreak === 2, 'Second completion should extend the streak.');
result = library.recordLiveObjectiveResult('ECONOMY', false, 9999);
assert(result.snapshot.liveObjectiveStreak === 0, 'Failed objective should reset the streak.');
assert(result.snapshot.totalLiveObjectiveCredits === 13000, 'Failed objective must not add credits.');

console.log(JSON.stringify({
    ok: true,
    replayLibraryVersion: REPLAY_LIBRARY_VERSION,
    liveObjectiveCompletions: result.snapshot.liveObjectiveCompletions,
    bestStreak: result.snapshot.bestLiveObjectiveStreak,
    totalCredits: result.snapshot.totalLiveObjectiveCredits,
}, null, 2));
