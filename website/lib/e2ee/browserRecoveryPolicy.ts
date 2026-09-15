import { closeBrowserVault } from "./browserVault";
import { needsRecoveryReset, readRecoveryGeneration, recoveryGenerationKey, type RecoveryPolicy } from "./recoveryPolicy";

const pending = new Map<string, Promise<boolean>>();

/** Delete only this account's private E2EE database after an explicit server reset. */
export function applyBrowserRecoveryPolicy(userId: string, policy: RecoveryPolicy): Promise<boolean> {
  const key = recoveryGenerationKey(userId);
  const previous = pending.get(userId) ?? Promise.resolve(false);
  const run = previous.catch(() => false).then(async () => {
    const remembered = readRecoveryGeneration(localStorage.getItem(key));
    if (!needsRecoveryReset(policy, remembered)) return false;
    await closeBrowserVault(userId);
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(`cp-e2ee-v2-${userId}`);
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error || new Error("The old encrypted cache could not be removed."));
      deletion.onblocked = () => reject(new Error("Close the other ComePlayers tabs, then retry the encrypted account reset."));
    });
    // This number is public metadata, not a key. Never clear login/app storage.
    localStorage.setItem(key, String(policy.generation));
    return true;
  });
  pending.set(userId, run);
  void run.finally(() => { if (pending.get(userId) === run) pending.delete(userId); }).catch(() => undefined);
  return run;
}
