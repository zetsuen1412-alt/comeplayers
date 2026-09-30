import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(project, relative), 'utf8');
const match = read('Assets/CRWT/Scripts/Scenes/CrwtMatchController.cs');
const ui = read('Assets/CRWT/Scripts/UI/CrwtUi.cs');
const board = read('Assets/CRWT/Scripts/Match/CrwtBoardView.cs');

test('main roll control is a dedicated circular button',()=>{
  assert.match(ui,/CircleButton\(/);
  assert.match(match,/CrwtUi\.CircleButton\(safe, "ROLL"/);
  assert.doesNotMatch(match,/CrwtUi\.Button\(actions, "ROLL"/);
});

test('turn countdown follows server deadline and timeout stays server-authoritative',()=>{
  assert.match(match,/DateTimeOffset\.TryParse\(snap\.deadline_at/);
  assert.match(match,/Mathf\.Clamp\(\(float\)seconds, 0f, 10f\)/);
  assert.match(match,/AUTO ROLL/);
  assert.match(match,/TimeoutTickAsync\(CrwtSession\.MatchId\)/);
  assert.match(match,/seconds <= -1/);
});

test('turn cue presents character speech and pawn reaction without gameplay mutation',()=>{
  assert.match(match,/CrwtHudArt\.SetPortrait\(turnPortrait/);
  assert.match(match,/AYO ROLL!/);
  assert.match(match,/board\.PlayTurnCue\(snap\.your_seat\)/);
  assert.match(board,/PlayTurnCue\(int seat\)/);
  assert.match(board,/PlayReaction\("Jump"\)/);
});

test('turn presentation respects reduced motion and adds no local RNG',()=>{
  assert.match(match,/ReducedMotionPreference/);
  for(const source of [match,ui,board])
    assert.doesNotMatch(source,/UnityEngine\.Random|System\.Random|new Random\s*\(/);
});
