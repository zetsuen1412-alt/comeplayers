// QA ONLY. Never import this fixture from the production app entry.
require('../src/secure/random');
require('react-native-url-polyfill/auto');
const React = require('react');
const { Text, ScrollView } = require('react-native');
const { registerRootComponent } = require('expo');
const { File, Paths } = require('expo-file-system');
const SecureStore = require('expo-secure-store');
function NativeQA() {
  const [lines, setLines] = React.useState(['ComePlayers multi-device QA — NOT FOR RELEASE']);
  React.useEffect(() => {
    const results = [], log = text => { results.push(text); setLines(value => [...value, text]); console.log('CP_MULTIDEVICE_QA ' + text); };
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    (async () => {
      const c = require('../src/secure/crypto'), m = require('../src/secure/multiDevice'), recovery = require('../src/secure/accountRecovery');
      const { persistVerifiedSession, openVerifiedVault, closeVerifiedVault, verifiedDescriptorKey } = require('../src/secure/verifiedVault');
      const alice = recovery.prepareFirstDevice(c.newId()), bob = recovery.prepareFirstDevice(c.newId());
      const a = alice.plan.session, b = bob.plan.session;
      assert(await openVerifiedVault(a.root.userId) === null, 'Login must not create decryption credentials');
      await persistVerifiedSession(a);
      const firstVault = await openVerifiedVault(a.root.userId);
      assert(firstVault, 'Verified vault unavailable');
      const root = m.openIdentityBackup(alice.plan.backup, alice.recoveryKey, a.root.userId);
      const saved = await SecureStore.getItemAsync(verifiedDescriptorKey(a.root.userId));
      assert(!saved.includes(root.encryptionSecret) && !saved.includes(root.signingSecret) && !saved.includes(alice.recoveryKey), 'Root/recovery secret persisted');
      log('PASS native enrollment, independent device credentials, root excluded from SecureStore');
      const roots = new Map([[a.root.userId, a.root], [b.root.userId, b.root]]);
      const first = await m.createEpoch(a.device, c.newId(), [{ roster: a.roster, admin: true }, { roster: b.roster, admin: true }], roots);
      const text = 'Riwayat pulih di perangkat baru 日本語 🔒';
      const message = m.encryptHistory(b.device, first.epoch, first.key, { text });
      const ownKey = await m.openEpochKey(first.epoch, a.device.identity, a.device.id);
      await firstVault.put('message-v2', message.id, m.decryptHistory(message, first.epoch, ownKey), first.epoch.roomId, message.createdAt);
      const rows = await firstVault.db.getAllAsync('select * from records');
      assert(!JSON.stringify(rows).includes(text), 'Plaintext local history');
      log('PASS native conversation key, ciphertext history and encrypted SQLite');
      const snapshot = { roster: a.roster, roster_hash: m.rosterHash(a.roster), encrypted_backup: alice.plan.backup, updated_at: new Date().toISOString() };
      const pc = recovery.prepareRecoveredDevice(a.root.userId, snapshot, alice.recoveryKey, { removeDeviceIds: [a.device.id] });
      const recoveredKey = await m.openEpochKey(first.epoch, root);
      await persistVerifiedSession(pc.session);
      const newVault = await openVerifiedVault(a.root.userId);
      assert((await newVault.get('message-v2', message.id)).text === text, 'New vault activation hid existing local history');
      await newVault.put('message-v2', message.id, m.decryptHistory(message, first.epoch, recoveredKey), first.epoch.roomId, message.createdAt);
      assert((await newVault.get('message-v2', message.id)).text === text, 'Old history did not recover');
      assert(newVault.descriptor.deviceId !== firstVault.descriptor.deviceId, 'Device identity reused');
      assert((await firstVault.get('message-v2', message.id)).text === text, 'Previous local history was deleted');
      log('PASS native new-device recovery preserves old ciphertext history and original local database');
      const next = await m.createEpoch(pc.session.device, first.epoch.roomId, [{ roster: pc.session.roster, admin: true }, { roster: b.roster, admin: true }], roots, first.epoch);
      let rejected = false; try { await m.openEpochKey(next.epoch, a.device.identity, a.device.id); } catch { rejected = true; }
      assert(rejected, 'Revoked device received future key');
      const nextMessage = m.encryptHistory(b.device, next.epoch, next.key, { text: 'future' });
      rejected = false; try { m.decryptHistory(nextMessage, next.epoch, { ...next.key, secret: first.key.secret }); } catch { rejected = true; }
      assert(rejected, 'Old key opened future content');
      rejected = false; try { recovery.prepareRecoveredDevice(a.root.userId, snapshot, m.createRecoveryKey()); } catch { rejected = true; }
      assert(rejected, 'Wrong recovery key accepted');
      log('PASS native revoked-device, old-epoch and wrong-recovery-key rejection');
      await closeVerifiedVault(a.root.userId);
      const reopened = await openVerifiedVault(a.root.userId);
      assert((await reopened.get('message-v2', message.id)).text === text, 'History failed cold database reopen');
      assert(reopened.descriptor.deviceId === pc.session.device.id, 'Protected pointer did not restore verified device');
      log('PASS cold database reopen authenticates saved device checkpoint and history');
      log('ALL NATIVE MULTI-DEVICE CHECKS PASSED');
    })().catch(error => log('FAIL ' + String(error.stack || error))).finally(() => {
      const report = new File(Paths.document, 'private-multidevice-qa.json'); report.write(JSON.stringify({ results }, null, 2));
    });
  }, []);
  return React.createElement(ScrollView, { style: { flex: 1, backgroundColor: '#080b10', padding: 24, paddingTop: 50 } }, lines.map((line, index) => React.createElement(Text, { key: index, style: { color: '#fff', marginBottom: 18 } }, line)));
}
registerRootComponent(NativeQA);
