import * as SecureStore from "expo-secure-store";
import { defaultDatabaseDirectory, deleteDatabaseAsync } from "expo-sqlite";
import { File } from "expo-file-system";
import { closeVerifiedVault, verifiedDescriptorKey } from "./verifiedVault";
import { descriptorKey } from "./vault";
import { needsRecoveryReset, readRecoveryGeneration, recoveryGenerationKey, type RecoveryPolicy } from "./recoveryPolicy";

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const pending = new Map<string, Promise<boolean>>();
const databaseName = /^cp-private-[0-9a-f-]{36}\.db$/;

/** Reset only the signed-in account's private vault; never Auth or app storage. */
export function applyNativeRecoveryPolicy(userId: string, policy: RecoveryPolicy): Promise<boolean> {
  const key = recoveryGenerationKey(userId), cleanupKey = `${key}.cleanup`;
  const previous = pending.get(userId) ?? Promise.resolve(false);
  const run = previous.catch(() => false).then(async () => {
    const remembered = readRecoveryGeneration(await SecureStore.getItemAsync(key, options));
    if (!needsRecoveryReset(policy, remembered)) return false;
    await closeVerifiedVault(userId);
    const savedQueue = await SecureStore.getItemAsync(cleanupKey, options);
    let names: string[] = savedQueue ? JSON.parse(savedQueue) : [];
    if (!Array.isArray(names) || names.some(name => typeof name !== "string" || !databaseName.test(name))) throw new Error("Invalid encrypted cache cleanup checkpoint.");
    for (const pointer of [verifiedDescriptorKey(userId), descriptorKey(userId)]) {
      const encoded = await SecureStore.getItemAsync(pointer, options);
      if (!encoded) continue;
      const value = JSON.parse(encoded) as { database?: unknown; root?: { userId?: unknown }; identity?: { userId?: unknown } };
      if ((value.root?.userId ?? value.identity?.userId) !== userId || typeof value.database !== "string" || !databaseName.test(value.database)) throw new Error("The encrypted cache belongs to another account; it was not changed.");
      names.push(value.database);
    }
    names = [...new Set(names)];
    // A journal plus existence checks makes interrupted cleanup repeatable.
    // The default SQLite directory is used by createVaultDatabase as well.
    await SecureStore.setItemAsync(cleanupKey, JSON.stringify(names), options);
    for (const name of names) {
      if (new File(defaultDatabaseDirectory, name).exists) await deleteDatabaseAsync(name);
    }
    await SecureStore.deleteItemAsync(verifiedDescriptorKey(userId), options);
    await SecureStore.deleteItemAsync(descriptorKey(userId), options);
    await SecureStore.setItemAsync(key, String(policy.generation), options);
    await SecureStore.deleteItemAsync(cleanupKey, options);
    return true;
  });
  pending.set(userId, run);
  void run.finally(() => { if (pending.get(userId) === run) pending.delete(userId); }).catch(() => undefined);
  return run;
}
