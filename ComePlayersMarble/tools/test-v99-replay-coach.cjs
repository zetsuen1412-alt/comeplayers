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
const { ReplayCoachService } = require(path.join(root, 'assets', 'scripts', 'core', 'ReplayCoachService.ts'));
const { ReplayLibraryService } = require(path.join(root, 'assets', 'scripts', 'core', 'ReplayLibraryService.ts'));
const {
    createDefaultReplayLibrary,
    normalizeReplayLibrary,
    REPLAY_LIBRARY_VERSION,
} = require(path.join(root, 'assets', 'scripts', 'save', 'ReplayLibraryData.ts'));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const events = [
    { sequence: 1, elapsedMs: 0, kind: 'SYSTEM', message: 'Match recorder initialized.', values: [] },
    { sequence: 2, elapsedMs: 1_000, kind: 'ROLL', playerId: 'human', message: 'Dice 3 + 4 = 7.', values: [3, 4] },
    { sequence: 3, elapsedMs: 2_200, kind: 'MOVE', playerId: 'human', message: 'Moved 7 spaces to tile 7.', values: [1, 2, 3, 4, 5, 6, 7] },
    { sequence: 4, elapsedMs: 3_300, kind: 'ACTION', playerId: 'human', message: 'Purchased Seoul and built a Villa.', values: [7] },
    { sequence: 5, elapsedMs: 5_000, kind: 'ROLL', playerId: 'human', message: 'Dice 5 + 5 = 10.', values: [5, 5] },
    { sequence: 6, elapsedMs: 6_500, kind: 'MOVE', playerId: 'human', message: 'World Travel moved to tile 18.', values: [18] },
    { sequence: 7, elapsedMs: 8_000, kind: 'ACTION', playerId: 'human', message: 'Takeover completed and Color Monopoly activated.', values: [18] },
    { sequence: 8, elapsedMs: 9_500, kind: 'ACTION', playerId: 'human', message: 'Upgraded Seoul to Landmark.', values: [7] },
    { sequence: 9, elapsedMs: 11_000, kind: 'RESULT', playerId: 'human', message: 'human won by triple monopoly after round 8.', values: [8] },
];
const record = {
    id: 'replay-000099',
    playedAt: Date.UTC(2026, 6, 23),
    durationMs: 11_000,
    mode: 'SOLO',
    ranked: false,
    botDifficulty: 'SMART',
    playerCount: 4,
    completedRound: 8,
    winnerId: 'human',
    eventCount: events.length,
    checksum: 'TEST99',
    events,
};

const coach = new ReplayCoachService().analyze(record);
assert(coach.score >= 70, `Strong classic victory should receive at least 70, got ${coach.score}.`);
assert(['S', 'A', 'B'].includes(coach.grade), `Strong replay grade should be S, A, or B, got ${coach.grade}.`);
assert(coach.takeoverCount === 1, 'Takeover count should be detected.');
assert(coach.travelCount === 1, 'World Travel count should be detected.');
assert(coach.keyMoments.length >= 2, 'Replay Coach should expose multiple key moments.');
assert(coach.strengths.includes('CLASSIC VICTORY CONVERSION'), 'Classic victory strength is missing.');

const legacy = normalizeReplayLibrary({ version: 1, nextSequence: 2, records: [record] });
assert(REPLAY_LIBRARY_VERSION === 4, 'V100 replay library version should be 4.');
assert(legacy.version === 4, 'V98 replay library should normalize to version 4.');
assert(!legacy.records[0].coach, 'Data normalization should preserve legacy replay without inventing persisted coach data.');

let stored = createDefaultReplayLibrary();
const store = {
    loadReplayLibrary() { return { version: 1, nextSequence: 2, records: [record] }; },
    saveReplayLibrary(data) {
        stored = normalizeReplayLibrary(data);
        return { data: stored, persisted: true };
    },
};
const library = new ReplayLibraryService(store);
assert(library.snapshot().records[0].coach, 'ReplayLibraryService should analyze V98 records when loaded.');
const saved = library.saveRecord({ ...record, id: 'replay-000100' });
assert(saved.ok, 'V100 replay should save successfully.');
assert(saved.snapshot.records[0].coach.score === coach.score, 'Saved replay coach score should be deterministic.');

console.log(JSON.stringify({
    ok: true,
    replayLibraryVersion: REPLAY_LIBRARY_VERSION,
    grade: coach.grade,
    score: coach.score,
    strengths: coach.strengths,
    focusAreas: coach.focusAreas,
    keyMoments: coach.keyMoments.length,
}, null, 2));
