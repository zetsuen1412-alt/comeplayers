import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createIdentity,
  fingerprint,
  publicIdentity,
} from "../lib/e2ee/crypto";
import * as browser from "../lib/e2ee/protocol";
import * as mobile from "../../comeplayers-apps/apps/mobile/src/secure/multiDevice";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const room = "33333333-3333-4333-8333-333333333333";

test("browser account backup and roster interoperate with Android", () => {
  const root = createIdentity(alice);
  const device = browser.createDevice(alice);
  const roster = browser.authorizeDevices(root, [device]);
  mobile.verifyRoster(roster, root);

  const recoveryKey = browser.createRecoveryKey();
  const backup = browser.sealIdentityBackup(root, recoveryKey);
  const recovered = mobile.openIdentityBackup(backup, recoveryKey, alice, root);
  assert.equal(fingerprint(recovered), fingerprint(root));

  const mobileBackup = mobile.sealIdentityBackup(root, recoveryKey);
  assert.equal(
    fingerprint(browser.openIdentityBackup(mobileBackup, recoveryKey, alice, root)),
    fingerprint(root),
  );
});

test("browser ciphertext and conversation epochs open on Android", async () => {
  const aliceRoot = createIdentity(alice);
  const bobRoot = createIdentity(bob);
  const aliceDevice = browser.createDevice(alice);
  const bobDevice = browser.createDevice(bob);
  const aliceRoster = browser.authorizeDevices(aliceRoot, [aliceDevice]);
  const bobRoster = browser.authorizeDevices(bobRoot, [bobDevice]);
  const roots = new Map([
    [alice, publicIdentity(aliceRoot)],
    [bob, publicIdentity(bobRoot)],
  ]);
  const created = await browser.createEpoch(
    aliceDevice,
    room,
    [
      { roster: aliceRoster, admin: true },
      { roster: bobRoster, admin: true },
    ],
    roots,
  );
  mobile.verifyEpoch(created.epoch, roots, undefined, alice);
  const bobKey = await mobile.openEpochKey(created.epoch, bobDevice.identity, bobDevice.id);
  assert.deepEqual(bobKey, created.key);

  const event = browser.encryptHistory(aliceDevice, created.epoch, created.key, {
    v: 2,
    kind: "message",
    text: "browser to Android",
  });
  assert.deepEqual(
    mobile.decryptHistory(event, created.epoch, bobKey),
    { v: 2, kind: "message", text: "browser to Android" },
  );
});

test("Android ciphertext and conversation epochs open in browser", async () => {
  const aliceRoot = createIdentity(alice);
  const bobRoot = createIdentity(bob);
  const aliceDevice = mobile.createDevice(alice);
  const bobDevice = mobile.createDevice(bob);
  const aliceRoster = mobile.authorizeDevices(aliceRoot, [aliceDevice]);
  const bobRoster = mobile.authorizeDevices(bobRoot, [bobDevice]);
  const roots = new Map([
    [alice, publicIdentity(aliceRoot)],
    [bob, publicIdentity(bobRoot)],
  ]);
  const created = await mobile.createEpoch(
    bobDevice,
    room,
    [
      { roster: aliceRoster, admin: true },
      { roster: bobRoster, admin: true },
    ],
    roots,
  );
  browser.verifyEpoch(created.epoch, roots, undefined, bob);
  const aliceKey = await browser.openEpochKey(created.epoch, aliceDevice.identity, aliceDevice.id);
  assert.deepEqual(aliceKey, created.key);

  const event = mobile.encryptHistory(bobDevice, created.epoch, created.key, {
    v: 2,
    kind: "message",
    text: "Android to browser",
  });
  assert.deepEqual(
    browser.decryptHistory(event, created.epoch, aliceKey),
    { v: 2, kind: "message", text: "Android to browser" },
  );
});

test("signed device proof permits only secure endpoints and direct calls", () => {
  const device = browser.createDevice(alice);
  assert.doesNotThrow(() => browser.proveDeviceRequest(device, "PATCH", "/api/messages/calls", "{}"));
  assert.doesNotThrow(() => mobile.proveDeviceRequest(device, "POST", "/api/messages/calls", "{}"));
  assert.throws(() => browser.proveDeviceRequest(device, "POST", "/api/messages/rooms", "{}"));
  assert.throws(() => mobile.proveDeviceRequest(device, "POST", "/api/messages/rooms", "{}"));
});
