// Runs the actual inline Engine/OfflineSave/App classes without starting WebGL or a server.
// Usage: node Web30/tools/test_offline_save.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../client/game.html', import.meta.url), 'utf8');
const engineStart = html.indexOf('var Marble;');
const engineEnd = html.indexOf('})(Marble || (Marble = {}));', engineStart);
const appStart = html.indexOf('    class App {');
const appEnd = html.indexOf('    Marble.App = App;', appStart);
assert(engineStart >= 0 && engineEnd > engineStart && appStart >= 0 && appEnd > appStart, 'Inline class boundaries must exist');

let storage = new Map(), writes = [], download, revoked = [];
const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        const classes = new Set(id === 'modal-layer' ? ['hidden'] : []);
        elements.set(id, { value: '', textContent: '', onclick: null, classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name)
        } });
    }
    return elements.get(id);
}
const context = vm.createContext({
    Blob, console,
    localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value); writes.push([key, value]); }
    },
    document: {
        getElementById: element,
        body: element('body'),
        createElement: tag => { assert.equal(tag, 'a'); return { click() { download.link = this; } }; }
    },
    URL: {
        createObjectURL: blob => { download = { blob }; return 'blob:test-save'; },
        revokeObjectURL: url => revoked.push(url)
    },
    setTimeout: run => { run(); return 1; },
    $: element,
    escape: value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
});
vm.runInContext(html.slice(engineStart, engineEnd + '})(Marble || (Marble = {}));'.length), context);
vm.runInContext(html.slice(appStart, appEnd) + '\nglobalThis.App = App;', context);
const { Engine, OfflineSave } = context.Marble;
const defaults = { cards: { lucky: 1, shield: 1, double: 1, money: 1 }, bonusRollCard: false };
const spent = { cards: { lucky: 0, shield: 0, double: 0, money: 1 }, bonusRollCard: true };
const plain = value => JSON.parse(JSON.stringify(value));
const extras = app => ({ cards: plain(app.actionCardCounts), bonusRollCard: app.bonusRollCard });
const saveKey = 'crazyrich.worldtour.living.v4', legacyKey = 'crazyrich.worldtour.kids.v7';
const file = raw => ({ size: Buffer.byteLength(raw), text: async () => raw });
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
async function checkAsync(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

function appFixture(name = 'Browser lama') {
    const app = Object.create(context.App.prototype);
    Object.assign(app, {
        engine: new Engine(name, 'alexia', 'normal', 25, 20261004),
        actionCardCounts: { lucky: 1, shield: 1, double: 1, money: 0 }, bonusRollCard: false,
        busy: false, playing: true, viewingBoard: false, auto: false, gameEpoch: 0, diceRollEpoch: 0,
        gaugeValue: .5, speed: 1, resultShown: false, selectedHero: 'alexia',
        toasts: [], modals: [], resets: [], cancelCount: 0, pumpCount: 0,
        toast(message) { this.toasts.push(message); },
        modal(title, body) { this.modals.push({ title, body }); },
        cancelTimers() { this.cancelCount++; this.gameEpoch++; this.diceRollEpoch++; },
        closeModal() {}, render() {}, speak() {}, announce() {}, presentChanges() {},
        pump() { this.pumpCount++; },
        sound: { play() {} }
    });
    app.graphics = { reset(state) { app.resets.push(state); }, roll: async () => true, sync() {} };
    element('confirm-import').onclick = null;
    element('modal-layer').classList.add('hidden');
    return app;
}
function snapshot(app) {
    return JSON.stringify({ state: JSON.parse(app.engine.serialize()), extras: extras(app),
        storage: [...storage], writes: writes.length, resets: app.resets.length,
        cancels: app.cancelCount, pumps: app.pumpCount, playing: app.playing, busy: app.busy });
}
function resetStorage() { storage = new Map(); writes = []; }

check('codec preserves consumed cards, armed Double Roll and engine state', () => {
    const engine = new Engine('Checkpoint', 'rindi', 'hard', 25, 1234);
    engine.state.players[0].position = 7;
    const restored = OfflineSave.restore(OfflineSave.serialize(engine, spent));
    assert.deepEqual(plain(restored.engine.state), plain(engine.state));
    assert.deepEqual({ cards: plain(restored.cards), bonusRollCard: restored.bonusRollCard }, spent);
    restored.cards.money = 0;
    assert.equal(spent.cards.money, 1, 'Restore must not retain mutable references');
});

await checkAsync('actual export and confirmed import transfer extras to a fresh browser', async () => {
    resetStorage();
    const source = appFixture('Komputer satu');
    source.actionCardCounts = { ...spent.cards }; source.bonusRollCard = true;
    source.exportSave();
    assert.equal(download.link.download, 'Crazy-Rich-World-Tour-Save.json');
    assert.equal(download.blob.type, 'application/json');
    assert.deepEqual(revoked, ['blob:test-save']);
    const raw = await download.blob.text();
    const target = appFixture('Komputer dua');
    const before = snapshot(target);
    await target.importSave(file(raw));
    assert.equal(snapshot(target), before, 'Preview/cancel must not replace the active match');
    assert.equal(target.modals.length, 1);
    element('confirm-import').onclick();
    assert.equal(target.engine.state.players[0].name, 'Komputer satu');
    assert.deepEqual(extras(target), spent);
    assert.equal(writes.length, 1, 'Engine and extras must persist with one storage write');
    assert.equal(JSON.parse(storage.get(saveKey)).format, 'crazyrich-worldtour-offline');
    const resumed = appFixture();
    storage.set(legacyKey, JSON.stringify(defaults));
    resumed.start(true);
    assert.deepEqual(extras(resumed), spent, 'Modern checkpoint must ignore a stale legacy companion key');
    assert.deepEqual(plain(resumed.engine.state), plain(target.engine.state));
});

await checkAsync('legacy file import resets extras independently of existing local storage', async () => {
    resetStorage(); storage.set(legacyKey, JSON.stringify(spent));
    const app = appFixture(); app.actionCardCounts = { ...spent.cards }; app.bonusRollCard = true;
    const original = new Engine('Save lama', 'kairo', 'easy', 25, 999).serialize();
    await app.importSave(file(original)); element('confirm-import').onclick();
    assert.equal(app.engine.state.players[0].name, 'Save lama');
    assert.deepEqual(extras(app), defaults);
});

check('legacy local resume migrates valid companion cards into one checkpoint', () => {
    resetStorage(); storage.set(saveKey, new Engine('Lokal lama').serialize()); storage.set(legacyKey, JSON.stringify(spent));
    const app = appFixture(); app.start(true);
    assert.deepEqual(extras(app), spent);
    assert.equal(JSON.parse(storage.get(saveKey)).format, 'crazyrich-worldtour-offline');
    assert.equal(writes.length, 1);
});

check('absent or invalid optional legacy extras never inherit a previous match', () => {
    for (const legacy of [null, '{', JSON.stringify({ cards: { lucky: -1 }, bonusRollCard: 'false' })]) {
        resetStorage(); storage.set(saveKey, new Engine('Legacy').serialize());
        if (legacy !== null) storage.set(legacyKey, legacy);
        const app = appFixture(); app.actionCardCounts = { ...spent.cards }; app.bonusRollCard = true; app.start(true);
        assert.deepEqual(extras(app), defaults);
    }
});

const malformed = [];
malformed.push(JSON.stringify({ ...JSON.parse(new Engine('Legacy dengan format tidak dikenal').serialize()), format: 'future-offline-checkpoint' }));
function badEnvelope(change) {
    const envelope = JSON.parse(OfflineSave.serialize(new Engine('Valid'), spent));
    change(envelope); return JSON.stringify(envelope);
}
for (const count of [-1, 2, .5, '0', null]) malformed.push(badEnvelope(save => { save.extras.cards.lucky = count; }));
for (const bonus of [0, 1, 'false', null]) malformed.push(badEnvelope(save => { save.extras.bonusRollCard = bonus; }));
malformed.push('{', 'null', '[]', badEnvelope(save => { delete save.extras.cards.money; }),
    badEnvelope(save => { save.extras.cards.other = 1; }), badEnvelope(save => { save.extras.cards = []; }),
    badEnvelope(save => { save.extras = null; }), badEnvelope(save => { save.version = 2; }),
    badEnvelope(save => { save.format = 'unknown'; }), badEnvelope(save => { save.engine.players[0].cash = -1; }),
    badEnvelope(save => { delete save.engine; }), badEnvelope(save => { save.extras.cards.double = 1; }),
    badEnvelope(save => { save.engine.winner = 0; }),
    badEnvelope(save => { save.engine.phase = 'end'; save.engine.winner = 0; }),
    badEnvelope(save => { save.engine.phase = 'finished'; save.engine.winner = 0; save.engine.players[0].bankrupt = true; }));
await checkAsync('malformed saves are rejected without changing match, cards, timers or storage', async () => {
    for (const raw of malformed) {
        resetStorage(); const app = appFixture(); app.persist(); const before = snapshot(app);
        await app.importSave(file(raw));
        assert.equal(snapshot(app), before);
        assert.equal(app.modals.length, 0);
        assert.equal(element('confirm-import').onclick, null);
        assert.match(app.toasts.at(-1), /Save ditolak:/);
    }
});

await checkAsync('oversized imports do not read the file or change current state', async () => {
    resetStorage(); const app = appFixture(), before = snapshot(app);
    await app.importSave({ size: 150001, text() { throw new Error('Must not read oversized file'); } });
    assert.equal(snapshot(app), before); assert.equal(app.modals.length, 0);
    assert.match(app.toasts.at(-1), /terlalu besar/);
    assert.throws(() => OfflineSave.restore(' '.repeat(150001)));
});

check('busy animations cannot overwrite a stable checkpoint or export it', () => {
    resetStorage(); const app = appFixture(); app.persist(); const before = [...storage], oldDownload = download;
    app.busy = true; app.actionCardCounts.money = 1; app.persist(); app.exportSave();
    assert.deepEqual([...storage], before); assert.equal(writes.length, 1); assert.equal(download, oldDownload);
    assert.match(app.toasts.at(-1), /animasi selesai/);
});

check('new match resets inventory and corrupt modern autosave cannot replace a live match', () => {
    resetStorage(); const app = appFixture(); app.actionCardCounts = { ...spent.cards }; app.bonusRollCard = true;
    element('player-name').value = 'Baru'; element('difficulty').value = 'normal'; element('duration').value = '25';
    app.start(false); assert.deepEqual(extras(app), defaults);
    storage.set(saveKey, malformed[0]); const before = snapshot(app); app.start(true);
    assert.equal(snapshot(app), before); assert.match(app.toasts.at(-1), /Save tidak bisa dibaca:/);
});

check('supported stable phases preserve complete checkpoints', () => {
    for (const phase of ['roll', 'decision', 'end', 'travel', 'festival', 'finished']) {
        const engine = new Engine('Phase'); engine.state.phase = phase;
        if (phase === 'decision') { engine.state.players[0].position = 1; engine.state.pendingTile = 1; }
        if (phase === 'travel') engine.state.players[0].position = 24;
        if (phase === 'festival') engine.state.players[0].position = 16;
        if (phase === 'finished') { engine.state.winner = 0; engine.state.winReason = 'Last Player Standing'; engine.state.players.slice(1).forEach(player => { player.bankrupt = true; player.cash = 0; }); }
        const restored = OfflineSave.restore(OfflineSave.serialize(engine, defaults));
        assert.deepEqual(plain(restored.engine.state), plain(engine.state));
    }
});

check('legacy finished matches retain a living winner even with historical non-bankruptcy rules', () => {
    const engine = new Engine('Historical');
    engine.finish(0, 'Batas ronde lama');
    const restored = OfflineSave.restore(engine.serialize());
    assert.equal(restored.engine.state.phase, 'finished');
    assert.equal(restored.engine.state.winner, 0);
    assert.equal(restored.engine.state.players.filter(player => !player.bankrupt).length, 4);
});

await checkAsync('restored Double Roll is consumed once by actual rollCurrent and survives the decision save', async () => {
    resetStorage(); const app = appFixture();
    const imported = new Engine('Double Roll', 'alexia', 'normal', 25, 1234);
    imported.state.seed = 1234;
    await app.importSave(file(OfflineSave.serialize(imported, spent))); element('confirm-import').onclick();
    await app.rollCurrent(false, false);
    assert.equal(app.bonusRollCard, false); assert.equal(app.engine.state.extraTurn, true);
    assert.equal(app.actionCardCounts.double, 0);
    const restored = OfflineSave.restore(storage.get(saveKey));
    assert.equal(restored.bonusRollCard, false); assert.equal(restored.engine.state.extraTurn, true);
    assert.equal(restored.engine.state.logs.filter(log => log.text.startsWith('KARTU • Double Roll aktif:')).length, 1);
    const before = app.engine.serialize(); app.useCard('double'); assert.equal(app.engine.serialize(), before);
});

console.log(`Offline portable-save checks passed: ${checks} (${malformed.length} malformed payloads).`);
