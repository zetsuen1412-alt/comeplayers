import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(project, relative), 'utf8');

const api = read('Assets/CRWT/Scripts/Network/CrwtSupabaseClient.cs');
const dto = read('Assets/CRWT/Scripts/Network/CrwtDtos.cs');
const lobby = read('Assets/CRWT/Scripts/Scenes/CrwtLobbyController.cs');
const dicePresenter = read('Assets/CRWT/Scripts/Match/CrwtDicePresenter.cs');

test('Unity progression client uses the existing authoritative RPC contract', () => {
  for (const rpc of [
    'crwt_progression_snapshot',
    'crwt_unlock_progression_item',
    'crwt_upgrade_progression_item',
    'crwt_set_loadout_v17',
  ]) assert.match(api, new RegExp(rpc));

  for (const parameter of ['p_item_type', 'p_item_id', 'p_character_id', 'p_dice_id', 'p_deck'])
    assert.match(api, new RegExp(parameter));

  assert.match(dto, /class CrwtProgressionSnapshot/);
  assert.match(dto, /CrwtProgressionItem\[\] characters/);
  assert.match(dto, /CrwtProgressionItem\[\] dice/);
  assert.match(dto, /CrwtProgressionItem\[\] cards/);
});

test('collection UI keeps destructive progression actions behind confirmation', () => {
  assert.match(lobby, /KONFIRMASI UNLOCK/);
  assert.match(lobby, /KONFIRMASI UPGRADE/);
  assert.match(lobby, /YA, BUKA/);
  assert.match(lobby, /UpgradeProgressionItemAsync/);
  assert.match(lobby, /UnlockProgressionItemAsync/);
});

test('deck editing preserves the server 1-3 unique-card contract before RPC', () => {
  assert.match(lobby, /deck\.Count >= 3/);
  assert.match(lobby, /deck\.Count <= 1/);
  assert.match(lobby, /deck\.Contains\(id\)/);
  assert.match(lobby, /SetLoadoutAsync/);
});

test('progression UI never introduces client-side gameplay RNG', () => {
  for (const source of [lobby, api, dicePresenter]) {
    assert.doesNotMatch(source, /UnityEngine\.Random|System\.Random|new Random\s*\(/);
  }
});
