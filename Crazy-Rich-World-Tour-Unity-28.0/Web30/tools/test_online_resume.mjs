import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const client = resolve(dirname(fileURLToPath(import.meta.url)), '../client');
const launcher = readFileSync(resolve(client, 'PLAY-Crazy-Rich-World-Tour-Launcher.html'), 'utf8');
const online = readFileSync(resolve(client, 'online-game.html'), 'utf8');
const block = (text, name) => {
  const begin = `// CRWT ONLINE ${name} BEGIN`, end = `// CRWT ONLINE ${name} END`;
  assert.equal(text.split(begin).length, 2, `one ${name} block`);
  return text.split(begin)[1].split(end)[0];
};
const line = (text, prefix) => {
  const hits = text.split('\n').filter(s => s.startsWith(prefix));
  assert.equal(hits.length, 1, `one ${prefix}`);
  return hits[0];
};
for (const [name, text] of [['launcher', launcher], ['online', online]]) {
  const code = text.slice(text.lastIndexOf('<script>') + 8, text.lastIndexOf('</script>'));
  new vm.Script(code, { filename: name });
}
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const jwt = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
function harness(source, origin = 'https://game.example') {
  const messages = [], timers = new Map(), elements = new Map(), listeners = new Map();
  let timerId = 0;
  const classList = () => ({ add() {}, remove() {}, toggle() {} });
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { classList: classList(), style: {}, textContent: '', innerHTML: '', disabled: false, src: '', onload: null, children: [], appendChild(child) { this.children.push(child); }, addEventListener(type, fn) { this[type] = fn; }, click() { return this.clickHandler ? this.clickHandler() : this.click?.handler?.(); } });
    const el = elements.get(selector);
    el.addEventListener = (type, fn) => { if (type === 'click') el.clickHandler = fn; else el[type] = fn; };
    el.click = () => el.clickHandler?.();
    return el;
  };
  const ownedWindow = { postMessage(data, target) { messages.push({ data, target }); } };
  element('#gameFrame').contentWindow = ownedWindow;
  const state = source === 'launcher' ? {
    online: true, userId: 'user', authEpoch: 0, roomSyncEpoch: 0, queueEpoch: 0, frameGeneration: 0, frameMode: null, frameReady: false, tokenVersion: 0, room: null, activeMatchId: null, spectatorMatchId: null,
    resumePaused: false, resumingMatch: false, startingMatch: false, launchingMatch: false, roomPoll: null, presenceTimer: null, socialTimer: null, queueTimer: null, gameUrl: null,
  } : { token: null, matchId: null, frameGeneration: null, tokenVersion: -1, tokenRefresh: null, tokenRequestSeq: 0, spectator: false, lastVersion: -1, poll: null, emotePoll: null, rematchPoll: null };
  const context = vm.createContext({ state, session: { access_token: jwt(Math.floor(Date.now() / 1000) + 3600), refresh_token: 'refresh-old' }, profile: { name: 'Me' },
    location: { origin, protocol: origin === 'null' ? 'file:' : 'https:' }, parent: ownedWindow, URL: { revokeObjectURL() {} },
    Date, Set, Promise, console: { warn() {}, error() {} }, atob: s => Buffer.from(s, 'base64').toString(),
    SUPABASE_URL: 'https://backend.invalid', SUPABASE_KEY: 'public-test-key',
    $: element, document: { createElement: () => ({ classList: classList() }) },
    window: { addEventListener(type, fn) { listeners.set(type, fn); } },
    setInterval(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms, interval: true }); return id; }, clearInterval(id) { timers.delete(id); },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    saveSession() {}, toast() {}, closeModals() {}, open() {}, renderRoom() {}, renderBoard() {}, renderEmotePanel() {}, refresh() {}, beginEmotePoll() {},
    occupiedPlayers: r => r.players.filter(Boolean), backendToRoom: data => data, friendlyError: e => e.message, request: async () => { throw Error('unmocked request'); }, rpc: async () => { throw Error('unmocked RPC'); }, fetch: async () => { throw Error('unmocked fetch'); },
  });
  const code = source === 'launcher' ? block(launcher, 'AUTH') + '\n' + line(launcher, 'function jwtExp(') + '\n' + line(launcher, 'async function ensureSession(') + '\n' + line(launcher, 'function showRoom(') + '\n' + block(launcher, 'ROOM') + '\n' + block(launcher, 'FRAME') : block(online, 'TOKEN') + '\n' + block(online, 'START');
  vm.runInContext(code, context);
  return { context, state, element, ownedWindow, messages, timers, listeners, run: code => vm.runInContext(code, context) };
}
const room = () => ({ backendId: 'room-1', online: true, status: 'in_game', host: false, max: 2, name: 'Room', players: [{ userId: 'user', name: 'Me', ready: false }] });
const startConfig = { type: 'CRWT_ONLINE_START', accessToken: 'token-1', matchId: 'match-1', frameGeneration: 1, tokenVersion: 1 };
const trusted = (h, data) => ({ source: h.ownedWindow, origin: h.context.location.origin, data });
let tests = 0;
async function test(name, fn) { await fn(); tests++; console.log(`ok ${tests} - ${name}`); }

await test('refresh token rotates once for concurrent callers and pushes token to live frame', async () => {
  const h = harness('launcher'), wait = deferred(); let calls = 0;
  h.context.request = async () => { calls++; return wait.promise; };
  h.context.configureGameFrame('player', 'match-1'); h.state.frameReady = true;
  const a = h.context.refreshSession(), b = h.context.refreshSession();
  wait.resolve({ access_token: 'token-new', refresh_token: 'refresh-new' }); await Promise.all([a, b]);
  assert.equal(calls, 1); assert.equal(h.context.session.access_token, 'token-new');
  assert.equal(h.messages.filter(x => x.data.type === 'CRWT_AUTH_UPDATE').length, 1);
  assert.equal(h.messages[0].target, 'https://game.example');
});
await test('logout cancels old refresh and stops room, social, and queue timers', async () => {
  const h = harness('launcher'), wait = deferred(); h.context.request = () => wait.promise;
  h.state.socialTimer = h.context.setInterval(() => {}, 1); h.state.queueTimer = h.context.setInterval(() => {}, 1); h.context.startRoomSync('room-1');
  const pending = h.context.refreshSession(); h.context.invalidateOnlineSession(); wait.resolve({ access_token: 'stale', refresh_token: 'stale' });
  await assert.rejects(pending, /Sesi telah berubah/); assert.equal(h.context.session, null); assert.equal(h.state.online, false); assert.equal(h.timers.size, 0);
});
await test('launcher checks owned source and exact HTTP origin; file origin remains source guarded', () => {
  for (const origin of ['https://game.example', 'null']) {
    const h = harness('launcher', origin);
    assert.equal(h.context.trustedGameFrameMessage(trusted(h, {})), true);
    assert.equal(h.context.trustedGameFrameMessage({ source: {}, origin, data: {} }), false);
    assert.equal(h.context.trustedGameFrameMessage({ source: h.ownedWindow, origin: 'https://evil.example', data: {} }), false);
  }
});
await test('host and non-host in_game rooms show resume and escape received names', () => {
  const h = harness('launcher'); h.run(line(launcher, 'function escapeRoomText(') + '\n' + line(launcher, 'function renderRoom('));
  for (const host of [true, false]) { h.state.room = { ...room(), host, mode: '<svg/onload=evil()>', map: 'World', players: [{ userId: 'user', name: '<img onerror=evil()>', character: '<b>x</b>' }] }; h.context.renderRoom(); assert.equal(h.element('#startMatch').disabled, false); assert.equal(h.element('#startMatch').textContent, 'LANJUTKAN PERTANDINGAN'); assert.match(h.element('#roomSlots').children.at(-2).innerHTML, /&lt;img/); }
  assert.equal(h.context.escapeRoomText('"<&'), '&quot;&lt;&amp;');
});
await test('resume only reads the existing match and duplicate clicks launch once', async () => {
  const h = harness('launcher'), wait = deferred(), names = []; h.state.room = room();
  h.context.rpc = async name => { names.push(name); return wait.promise; };
  const a = h.context.resumeOnlineMatch(), b = h.context.resumeOnlineMatch(); wait.resolve({ match_id: 'match-1' }); await Promise.all([a, b]);
  assert.deepEqual(names, ['crwt_active_match_for_room']); assert.equal(h.state.activeMatchId, 'match-1'); assert.equal(h.state.frameMode, 'player'); assert.equal(h.element('#gameFrame').src, 'online-game.html?v=30');
});
await test('exit leaves a visible resume path and room polling does not reopen the iframe', async () => {
  const h = harness('launcher'); h.state.room = room(); h.context.configureGameFrame('player', 'match-1');
  h.context.rpc = async name => { assert.notEqual(name, 'crwt_active_match_for_room'); return room(); };
  h.element('#leaveGame').click(); assert.equal(h.state.resumePaused, true); assert.equal(h.state.frameMode, null); assert.equal(h.state.spectatorMatchId, null); assert.equal(h.element('#gameFrame').onload, null);
  await h.timers.get(h.state.roomPoll).fn(); assert.equal(h.element('#gameFrame').src, 'about:blank'); assert.equal(h.state.frameMode, null);
});
await test('stale room fetch and active match response cannot apply after stopping sync', async () => {
  const h = harness('launcher'), wait = deferred(); h.state.room = room(); h.context.rpc = () => wait.promise;
  const pending = h.context.fetchOnlineRoom('room-1', true); h.context.stopRoomSync(); wait.resolve({ ...room(), name: 'stale' }); assert.equal(await pending, null); assert.equal(h.state.room.name, 'Room');
  const active = deferred(); h.context.rpc = async name => name === 'crwt_get_room' ? room() : name === 'crwt_active_match_for_room' ? active.promise : {};
  h.context.startRoomSync('room-1'); const poll = h.timers.get(h.state.roomPoll).fn(); await tick(); h.element('#leaveGame').click(); active.resolve({ match_id: 'old-match' }); await poll; assert.equal(h.state.frameMode, null);
});
await test('frame token requests are trusted and delayed replies cannot reach a later frame', async () => {
  const h = harness('launcher'), wait = deferred(); h.context.configureGameFrame('player', 'match-1'); h.state.frameReady = true;
  h.context.ensureSession = () => wait.promise;
  const data = { type: 'CRWT_REQUEST_TOKEN', matchId: 'match-1', frameGeneration: h.state.frameGeneration, requestId: 1, accessToken: h.context.session.access_token };
  await h.context.onGameFrameMessage({ ...trusted(h, data), source: {} }); assert.equal(h.messages.length, 0);
  const pending = h.context.onGameFrameMessage(trusted(h, data)); h.context.clearGameFrame(); h.context.configureGameFrame('spectator', 'match-2'); wait.resolve(); await pending; assert.equal(h.messages.length, 0);
});
await test('queued exit from an old online document cannot close the current match', async () => {
  const h = harness('launcher'); h.state.room = room(); h.context.configureGameFrame('player', 'match-old'); const oldGeneration = h.state.frameGeneration;
  h.context.clearGameFrame(); h.context.configureGameFrame('player', 'match-new');
  await h.context.onGameFrameMessage(trusted(h, { type: 'CRWT_EXIT_MATCH', matchId: 'match-old', frameGeneration: oldGeneration }));
  assert.equal(h.state.activeMatchId, 'match-new'); assert.equal(h.state.frameMode, 'player');
});
await test('pending online launch cannot overwrite a later practice frame', async () => {
  const h = harness('launcher'), wait = deferred(); h.state.room = room(); h.context.ensureSession = () => wait.promise;
  const pending = h.context.launchOnlineGame(h.state.room, 'match-1'); h.context.launchGame({ mode: 'Practice' }); wait.resolve(); await pending;
  assert.equal(h.state.frameMode, 'offline'); assert.equal(h.element('#gameFrame').src, 'game.html?v=30'); assert.equal(h.element('#gameFrame').onload, null);
});
await test('queued online exit cannot close a later offline practice frame', async () => {
  const h = harness('launcher'); h.context.configureGameFrame('player', 'match-old'); const oldGeneration = h.state.frameGeneration;
  h.context.launchGame({ mode: 'Practice' });
  await h.context.onGameFrameMessage(trusted(h, { type: 'CRWT_EXIT_MATCH', matchId: 'match-old', frameGeneration: oldGeneration }));
  assert.equal(h.state.frameMode, 'offline'); assert.equal(h.element('#gameFrame').src, 'game.html?v=30');
});
await test('authenticated bootstrap response is discarded when logout or guest changes session', async () => {
  const h = harness('launcher'), wait = deferred(); h.run(block(launcher, 'REQUEST'));
  h.context.fetch = () => wait.promise;
  const pending = h.context.request('/rest/v1/rpc/crwt_bootstrap_profile', { method: 'POST', body: {} }); await tick();
  h.context.invalidateOnlineSession(); wait.resolve({ ok: true, status: 200, text: async () => JSON.stringify({ display_name: 'Old account' }) });
  await assert.rejects(pending, /Sesi telah berubah/); assert.equal(h.context.session, null); assert.equal(h.state.online, false);
});
await test('duplicate start and token update preserve snapshot and create one poll', () => {
  const h = harness('online'); h.context.start(startConfig); h.state.snap = { sentinel: true }; h.state.lastVersion = 42; const polls = h.timers.size;
  h.context.onParentMessage(trusted(h, { ...startConfig, accessToken: 'token-2', tokenVersion: 2 }));
  h.context.onParentMessage(trusted(h, { type: 'CRWT_AUTH_UPDATE', matchId: 'match-1', frameGeneration: 1, accessToken: 'token-3', tokenVersion: 3 }));
  assert.equal(h.timers.size, polls); assert.equal(h.state.lastVersion, 42); assert.equal(h.state.snap.sentinel, true); assert.equal(h.state.token, 'token-3'); assert.equal(h.state.matchId, 'match-1');
  h.context.onParentMessage({ ...trusted(h, startConfig), source: {} }); assert.equal(h.state.token, 'token-3');
  h.context.onParentMessage({ ...trusted(h, startConfig), origin: 'https://evil.example' }); assert.equal(h.state.token, 'token-3');
});
await test('concurrent read-only 401s share refresh and retry each unchanged request once', async () => {
  const h = harness('online'); h.context.start(startConfig); const calls = [];
  h.context.fetch = async (url, opts) => { calls.push({ url, ...opts }); return { status: opts.headers.Authorization === 'Bearer token-1' ? 401 : 200, ok: opts.headers.Authorization !== 'Bearer token-1', json: async () => ({ version: 1 }) }; };
  const a = h.context.rpc('crwt_v16_snapshot', { p_match_id: 'match-1' }), b = h.context.rpc('crwt_recent_match_emotes', { p_match_id: 'match-1', p_after_id: 9 }); await tick();
  const requests = h.messages.filter(x => x.data.type === 'CRWT_REQUEST_TOKEN'); assert.equal(requests.length, 1);
  h.context.onParentMessage(trusted(h, { type: 'CRWT_AUTH_UPDATE', matchId: 'match-1', frameGeneration: 1, requestId: requests[0].data.requestId, tokenVersion: 2, accessToken: 'token-2' })); await Promise.all([a, b]);
  assert.equal(calls.length, 4); for (const c of calls.slice(0, 2)) assert.equal(calls.find(x => x.url === c.url && x.headers.Authorization === 'Bearer token-2').body, c.body);
});
await test('mutating RPC recovers session without replaying the action', async () => {
  const h = harness('online'); h.context.start(startConfig); let calls = 0;
  h.context.fetch = async () => { calls++; return { status: 401, ok: false, json: async () => ({}) }; };
  const pending = h.context.rpc('crwt_v18_roll', { p_match_id: 'match-1', p_idempotency_key: 'fixed' }); await tick();
  const req = h.messages.at(-1).data; h.context.onParentMessage(trusted(h, { type: 'CRWT_AUTH_UPDATE', matchId: 'match-1', frameGeneration: 1, requestId: req.requestId, tokenVersion: 2, accessToken: 'token-2' }));
  await assert.rejects(pending, /ulangi tindakan terakhir/); assert.equal(calls, 1);
});
await test('stale or wrong-origin token replies cannot resolve the current request', async () => {
  const h = harness('online'); h.context.start(startConfig); const promise = h.context.requestFreshToken(); let settled = false; promise.then(() => { settled = true; });
  const req = h.messages.at(-1).data, update = { type: 'CRWT_AUTH_UPDATE', matchId: 'match-1', frameGeneration: 1, requestId: req.requestId, tokenVersion: 2, accessToken: 'new' };
  h.context.onParentMessage({ ...trusted(h, update), source: {} }); h.context.onParentMessage({ ...trusted(h, update), origin: 'https://evil.example' }); h.context.onParentMessage(trusted(h, { ...update, frameGeneration: 0 })); await tick(); assert.equal(settled, false);
  h.context.onParentMessage(trusted(h, update)); await promise; assert.equal(h.state.token, 'new');
});
console.log(`PASS: ${tests} online resume/token continuity checks; no live backend requests.`);
