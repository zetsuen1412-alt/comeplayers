import * as SecureStore from "expo-secure-store";
import { fingerprint, hex, newId, random, validateIdentity, type Identity, type PublicIdentity } from "./crypto";
import { rosterHash, verifyRoster, type DeviceSecrets } from "./multiDevice";
import type { VerifiedSession } from "./accountRecovery";
import { createVaultDatabase, descriptorKey, type Vault, type VaultDescriptor, type VaultRow } from "./vault";

type DeviceDescriptor = {
  version: 2; device: DeviceSecrets; root: PublicIdentity;
  rosterRevision: number; rosterHash: string; database: string; localKey: string;
};
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const verifiedDescriptorKey = (userId: string) => `cp.secure.v2.${userId}`;
const active = new Map<string, { descriptor: DeviceDescriptor; vault: Vault }>();
let activation: Promise<unknown> = Promise.resolve();

async function openDescriptor(descriptor: DeviceDescriptor, userId: string): Promise<Vault> {
  if (descriptor.version !== 2 || descriptor.root.userId !== userId || descriptor.device.identity.userId !== userId || !/^[0-9a-f]{64}$/.test(descriptor.localKey)) throw new Error("Invalid verified-device vault.");
  validateIdentity(descriptor.device.identity, userId);
  if (descriptor.device.identity.encryptionKey === descriptor.root.encryptionKey || descriptor.device.identity.signingKey === descriptor.root.signingKey) throw new Error("Root private keys cannot be stored as device credentials.");
  // Vault's local-record format is reusable; its identity is this device's key,
  // and the server relay-v1 registration/provider must never consume this vault.
  return createVaultDatabase({ version: 1, database: descriptor.database, deviceId: descriptor.device.id, identity: descriptor.device.identity, localKey: descriptor.localKey });
}

/** Called by activateVerifiedDevice only after its signed server confirmation. */
export function persistVerifiedSession(session: VerifiedSession, recoveryIdentity: Identity): Promise<void> {
  const run = async () => {
    verifyRoster(session.roster, session.root);
    validateIdentity(recoveryIdentity, session.root.userId);
    if (fingerprint(recoveryIdentity) !== fingerprint(session.root)) throw new Error("The recovery identity does not match this account.");
    const own = session.roster.devices.find(device => device.id === session.device.id);
    if (!own || fingerprint(own.identity) !== fingerprint(session.device.identity)) throw new Error("This device is not authorized to store the recovered account.");
    const userId = session.root.userId;
    let existing = active.get(userId);
    if (!existing) {
      const saved = await SecureStore.getItemAsync(verifiedDescriptorKey(userId), options);
      if (saved) {
        const descriptor: DeviceDescriptor = JSON.parse(saved);
        existing = { descriptor, vault: await openDescriptor(descriptor, userId) };
      }
    }
    if (existing && fingerprint(existing.descriptor.root) !== fingerprint(session.root)) throw new Error("The existing history belongs to a different encryption identity.");
    if (existing?.descriptor.device.id === session.device.id && existing.descriptor.rosterHash === rosterHash(session.roster)) {
      await existing.vault.put("root-recovery-v2", userId, recoveryIdentity);
      active.set(userId, existing); return;
    }
    let legacyVault: Vault | null = null;
    if (!existing) {
      const savedLegacy = await SecureStore.getItemAsync(descriptorKey(userId), options);
      if (savedLegacy) {
        const legacyDescriptor = JSON.parse(savedLegacy) as VaultDescriptor;
        if (legacyDescriptor.version !== 1 || legacyDescriptor.identity.userId !== userId || !/^[0-9a-f]{64}$/.test(legacyDescriptor.localKey)) throw new Error("Invalid older private-history vault.");
        validateIdentity(legacyDescriptor.identity, userId);
        legacyVault = await createVaultDatabase(legacyDescriptor);
      }
    }
    const descriptor: DeviceDescriptor = {
      version: 2, device: { id: session.device.id, identity: { userId, encryptionKey: session.device.identity.encryptionKey, signingKey: session.device.identity.signingKey, encryptionSecret: session.device.identity.encryptionSecret, signingSecret: session.device.identity.signingSecret }, createdAt: session.device.createdAt },
      root: { userId, encryptionKey: session.root.encryptionKey, signingKey: session.root.signingKey },
      rosterRevision: session.roster.revision, rosterHash: rosterHash(session.roster), database: `cp-private-${newId()}.db`, localKey: hex(random()),
    };
    const vault = await openDescriptor(descriptor, userId);
    try {
      if (existing) {
        const oldVault = existing.vault;
        // Preserve locally available history during recovery on this phone.
        // Device authorization, sync cursors and pending device-bound requests
        // are not transferable history and must be rebuilt for the new device.
        const contentKinds = new Set(["message-v2", "history-event-v2", "history-pending-v2", "conversation-key", "conversation-epoch", "root-pin-v2", "room-unread-v2", "room-unread-initialized-v2", "legacy-cursor-v2", "legacy-complete-v2", "room", "media", "media-chunk", "call-history"]);
        await oldVault.transaction(async oldTx => {
          await vault.transaction(async tx => {
            for await (const row of oldTx.getEachAsync<VaultRow>("SELECT * FROM records ORDER BY kind,id")) {
              if (!contentKinds.has(row.kind)) continue;
              const copied = vault.encode(row.kind, row.id, oldVault.decode(row), row.room, row.sort);
              await tx.runAsync("INSERT INTO records(kind,id,room,sort,value) VALUES (?,?,?,?,?)", copied.kind, copied.id, copied.room, copied.sort, copied.value);
            }
          });
        });
      } else if (legacyVault) {
        // A v1 vault belongs to this signed-in user but used a device identity
        // that cannot participate in the account-root protocol. Copy only the
        // decrypted local content, re-encrypt it with this verified device's
        // local key, and label messages as older history. Never copy the old
        // relay identity, mailbox cursor, call key, or unsent relay outbox.
        const legacyKinds = new Set(["message", "room", "media", "media-chunk", "call-history"]);
        await vault.transaction(async tx => {
          for await (const row of legacyVault!.db.getEachAsync<VaultRow>("SELECT * FROM records ORDER BY kind,id")) {
            if (!legacyKinds.has(row.kind)) continue;
            const kind = row.kind === "message" ? "message-v2" : row.kind;
            const value = legacyVault!.decode<Record<string, unknown>>(row);
            const copied = vault.encode(kind, row.id, row.kind === "message" ? { ...value, legacy: true } : value, row.room, row.sort);
            await tx.runAsync("INSERT INTO records(kind,id,room,sort,value) VALUES (?,?,?,?,?)", copied.kind, copied.id, copied.room, copied.sort, copied.value);
          }
        });
      }
      await vault.put("account-roster", userId, session.roster);
      await vault.put("root-recovery-v2", userId, recoveryIdentity);
      // Commit the new encrypted database before switching the protected pointer.
      // Existing local databases are kept until a separate explicit cleanup.
      await SecureStore.setItemAsync(verifiedDescriptorKey(userId), JSON.stringify(descriptor), options);
      active.set(userId, { descriptor, vault });
    } catch (error) { await vault.db.closeAsync(); throw error; }
    finally { await legacyVault?.db.closeAsync(); }
  };
  const pending = activation.then(run, run); activation = pending.catch(() => undefined); return pending;
}

/** A login without verification returns null; it never invents a replacement identity. */
export async function openVerifiedVault(userId: string): Promise<Vault | null> {
  await activation;
  const existing = active.get(userId); if (existing) return existing.vault;
  const encoded = await SecureStore.getItemAsync(verifiedDescriptorKey(userId), options);
  if (!encoded) return null;
  const descriptor: DeviceDescriptor = JSON.parse(encoded), vault = await openDescriptor(descriptor, userId);
  try {
    const roster = await vault.get<VerifiedSession["roster"]>("account-roster", userId);
    if (!roster) throw new Error("The verified device roster is missing.");
    verifyRoster(roster, descriptor.root);
    if (roster.revision !== descriptor.rosterRevision || rosterHash(roster) !== descriptor.rosterHash || !roster.devices.some(device => device.id === descriptor.device.id && fingerprint(device.identity) === fingerprint(descriptor.device.identity))) throw new Error("The local authorization checkpoint does not match.");
    active.set(userId, { descriptor, vault }); return vault;
  } catch (error) { await vault.db.closeAsync(); throw error; }
}

export async function closeVerifiedVault(userId: string): Promise<void> {
  await activation;
  const existing = active.get(userId);
  active.delete(userId);
  await existing?.vault.db.closeAsync();
}
