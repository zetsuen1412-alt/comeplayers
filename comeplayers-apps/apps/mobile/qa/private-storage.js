// QA ONLY. The production index never imports this entry.
require('../src/secure/random');
require('react-native-url-polyfill/auto');
const React = require('react');
const { Text, ScrollView } = require('react-native');
const { registerRootComponent } = require('expo');
const { File, Paths } = require('expo-file-system');
function NativeQA() {
  const [lines, setLines] = React.useState(['ComePlayers private native QA - NOT FOR RELEASE']);
  React.useEffect(() => { const results = []; const log = text => { results.push(text); setLines(v => [...v, text]); console.log('CP_PRIVATE_QA ' + text); };
    const assert = (ok, label) => { if (!ok) throw new Error(label); };
    (async () => {
      const crypto = require('../src/secure/crypto');
      const { openVault } = require('../src/secure/vault');
      const { storeMedia, readMedia, materializeMedia } = require('../src/secure/mediaStore');
      const { exportPrivateBackup, restorePrivateBackup } = require('../src/secure/backup');
      const account = crypto.newId(), peer = crypto.createIdentity(crypto.newId()), room = crypto.newId();
      let vault = await openVault(account);
      const message = 'Rahasia perangkat — 日本語 🔒 ' + crypto.newId();
      const envelope = await crypto.sealMessage(vault.descriptor.identity, peer, room, { text: message });
      const opened = await crypto.openMessage(peer, vault.descriptor.identity, envelope, room);
      assert(opened.text === message, 'HPKE native Unicode roundtrip');
      let rejected = false; try { await crypto.openMessage(peer, vault.descriptor.identity, { ...envelope, ciphertext: 'ff' + envelope.ciphertext.slice(2) }, room); } catch { rejected = true; }
      assert(rejected, 'Native tampering must fail'); log('PASS native HPKE, Unicode, signature tampering');
      await Promise.all(Array.from({ length: 12 }, (_, i) => vault.put('qa', 'parallel-' + i, { message, i })));
      assert((await vault.list('qa')).length === 12, 'Concurrent SQLite writes lost');
      const rows = await vault.db.getAllAsync('SELECT * FROM records');
      assert(!JSON.stringify(rows).includes(message), 'Plaintext in SQLite');
      log('PASS encrypted SQLite concurrent writes');
      const bytes = crypto.random(120000), media = await storeMedia(vault, bytes, 'qa.pdf', 'application/pdf');
      assert(crypto.digest((await readMedia(vault, media.id)).bytes) === crypto.digest(bytes), 'Media mismatch');
      const rendered = await materializeMedia(vault, media.id);
      assert(crypto.digest(await rendered.bytes()) === crypto.digest(bytes), 'Materialized media mismatch'); rendered.delete();
      log('PASS encrypted media chunks and local file roundtrip');
      const recovery = crypto.hex(crypto.random()), backup = await exportPrivateBackup(account, recovery);
      const originalDevice = vault.descriptor.deviceId;
      await vault.put('qa', 'after-backup', { message: 'newer local history' });
      await restorePrivateBackup(account, backup.uri, recovery); vault = await openVault(account);
      assert(vault.descriptor.deviceId !== originalDevice, 'Restored primary device not changed');
      assert((await vault.get('qa', 'after-backup')).message === 'newer local history', 'New history lost on restore');
      assert((await vault.get('qa', 'parallel-5')).message === message, 'Backup message missing');
      assert(crypto.digest((await readMedia(vault, media.id)).bytes) === crypto.digest(bytes), 'Backup media missing');
      log('PASS backup identity, messages, media, newer history preserved');
      const damaged = new File(Paths.cache, 'qa-damaged-' + crypto.newId() + '.cpbackup'); damaged.create();
      const archive = await backup.bytes(); damaged.write(archive.slice(0, archive.length - 50));
      const currentDevice = vault.descriptor.deviceId; rejected = false;
      try { await restorePrivateBackup(account, damaged.uri, recovery); } catch { rejected = true; }
      assert(rejected && (await openVault(account)).descriptor.deviceId === currentDevice, 'Partial restore activated');
      log('PASS truncated backup rejected without changing active history');
      backup.delete(); damaged.delete(); log('ALL NATIVE STORAGE CHECKS PASSED');
    })().catch(error => log('FAIL ' + String(error.stack || error))).finally(() => {
      const report = new File(Paths.document, 'private-native-qa.json'); report.write(JSON.stringify({ results }, null, 2));
    });
  }, []);
  return React.createElement(ScrollView, { style: { flex: 1, backgroundColor: '#080b10', padding: 24, paddingTop: 50 } }, lines.map((line, i) => React.createElement(Text, { key: i, style: { color: '#fff', marginBottom: 18 } }, line)));
}
registerRootComponent(NativeQA);
