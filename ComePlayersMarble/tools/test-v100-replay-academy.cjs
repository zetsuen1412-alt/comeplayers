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
const { ReplayAcademyService } = require(path.join(root, 'assets', 'scripts', 'core', 'ReplayAcademyService.ts'));
const { ReplayLibraryService } = require(path.join(root, 'assets', 'scripts', 'core', 'ReplayLibraryService.ts'));
const { normalizeReplayLibrary, REPLAY_LIBRARY_VERSION } = require(path.join(root, 'assets', 'scripts', 'save', 'ReplayLibraryData.ts'));

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function coach(score, tempo, economy, control, resilience, risks = 0) {
    return {
        version: 1,
        focusPlayerId: 'human',
        score,
        grade: score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 68 ? 'B' : score >= 52 ? 'C' : 'D',
        tempoScore: tempo,
        economyScore: economy,
        controlScore: control,
        resilienceScore: resilience,
        rollCount: 8,
        actionCount: 9,
        purchaseCount: 3,
        upgradeCount: 2,
        takeoverCount: 1,
        travelCount: 1,
        fortuneCount: 1,
        tollCount: 1,
        averageDecisionMs: 4_000,
        longestDecisionMs: 12_000,
        strengths: ['PROPERTY DEVELOPMENT'],
        focusAreas: ['KEEP A LARGER CASH RESERVE'],
        keyMoments: Array.from({ length: risks }, (_, index) => ({
            sequence: index + 1,
            elapsedMs: index * 1_000,
            impact: 'RISK',
            label: 'RISK MOMENT',
            detail: 'Paid a dangerous toll.',
        })),
    };
}

function record(id, playedAt, report) {
    return {
        id,
        playedAt,
        durationMs: 30_000,
        mode: 'SOLO',
        ranked: false,
        botDifficulty: 'SMART',
        playerCount: 4,
        completedRound: 8,
        winnerId: 'human',
        eventCount: 1,
        checksum: id.toUpperCase(),
        events: [{ sequence: 1, elapsedMs: 0, kind: 'RESULT', playerId: 'human', message: 'Match complete.', values: [] }],
        coach: report,
    };
}

const low = record('replay-low', 1, coach(58, 38, 76, 66, 54, 2));
const medium = record('replay-medium', 2, coach(70, 62, 74, 71, 66, 1));
const high = record('replay-high', 3, coach(84, 82, 80, 85, 79, 0));
const academyService = new ReplayAcademyService();
const snapshot = academyService.analyze([high, medium, low]);
assert(snapshot.analyzedReplayCount === 3, 'Academy should analyze three replays.');
assert(snapshot.trendDelta === 26, `Expected +26 trend, got ${snapshot.trendDelta}.`);
assert(snapshot.focusMetric === 'RESILIENCE' || snapshot.focusMetric === 'TEMPO', 'Academy should identify a weak training metric.');
assert(snapshot.drills.length === 3, 'Academy should create three adaptive drills.');
assert(snapshot.recommendedReplayId === 'replay-low', 'High-risk low-score replay should be recommended for review.');

const migrated = normalizeReplayLibrary({ version: 2, nextSequence: 4, records: [medium, low] });
assert(REPLAY_LIBRARY_VERSION === 4, 'V100 replay library version should be 4.');
assert(migrated.version === 4, 'V99 replay library should migrate to version 4.');
assert(migrated.academyProgress.bestAverageScore === 0, 'Legacy replay academy progress should start safely.');

let stored = migrated;
const store = {
    loadReplayLibrary() { return migrated; },
    saveReplayLibrary(data) {
        stored = normalizeReplayLibrary(data);
        return { data: stored, persisted: true };
    },
};
const library = new ReplayLibraryService(store);
const before = library.snapshot().academy;
assert(before.analyzedReplayCount === 2, 'Migrated library should produce an academy snapshot.');
const result = library.saveRecord(high);
assert(result.ok, 'Improved replay should save.');
assert(result.snapshot.academy.averageScore > before.averageScore, 'Academy average should improve after a strong replay.');
assert(result.snapshot.academyBestAverageScore >= result.snapshot.academy.averageScore, 'Best academy average should persist.');
assert(stored.academyProgress.lastFocusMetric === result.snapshot.academy.focusMetric, 'Focus metric should persist.');

console.log(JSON.stringify({
    ok: true,
    replayLibraryVersion: REPLAY_LIBRARY_VERSION,
    academyTier: result.snapshot.academy.academyTier,
    averageScore: result.snapshot.academy.averageScore,
    trendDelta: result.snapshot.academy.trendDelta,
    focusMetric: result.snapshot.academy.focusMetric,
    drills: result.snapshot.academy.drills.map((drill) => `${drill.title}:${drill.currentScore}/${drill.targetScore}`),
}, null, 2));
