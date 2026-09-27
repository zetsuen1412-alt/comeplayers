/** Public metadata only. A login token is never encryption key material. */
export type RecoveryPolicy = { generation: number; resetAt: string | null; requirePasskey: boolean; allowDeviceSetup?: boolean };
export const RECOVERY_CLIENT_VERSION = "1";
export const LEGACY_RECOVERY_POLICY: RecoveryPolicy = { generation: 0, resetAt: null, requirePasskey: false };

export function parseRecoveryPolicy(value: unknown): RecoveryPolicy {
  if (value === undefined) return { ...LEGACY_RECOVERY_POLICY };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid account recovery policy.");
  const p = value as Record<string, unknown>;
  if (!Number.isSafeInteger(p.generation) || Number(p.generation) < 0 || Number(p.generation) > 2147483647 || typeof p.requirePasskey !== "boolean") throw new Error("Invalid account recovery policy.");
  if (p.generation === 0 && p.resetAt !== null) throw new Error("Invalid account reset checkpoint.");
  if (Number(p.generation) > 0 && (typeof p.resetAt !== "string" || !Number.isFinite(Date.parse(p.resetAt)) || p.requirePasskey !== true)) throw new Error("Invalid account reset checkpoint.");
  if (p.allowDeviceSetup !== undefined && typeof p.allowDeviceSetup !== "boolean") throw new Error("Invalid device setup policy.");
  return { generation: Number(p.generation), resetAt: p.resetAt as string | null, requirePasskey: p.requirePasskey, ...(p.allowDeviceSetup !== undefined ? { allowDeviceSetup: p.allowDeviceSetup } : {}) };
}
export function recoveryGenerationKey(userId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Invalid account identity.");
  return `cp.secure.recovery-generation.${userId}`;
}
export function readRecoveryGeneration(value: string | null): number {
  if (value === null) return 0;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid local recovery checkpoint.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 2147483647) throw new Error("Invalid local recovery checkpoint.");
  return n;
}
export function needsRecoveryReset(policy: RecoveryPolicy, rememberedGeneration: number): boolean {
  parseRecoveryPolicy(policy);
  if (!Number.isSafeInteger(rememberedGeneration) || rememberedGeneration < 0) throw new Error("Invalid local recovery checkpoint.");
  if (policy.generation < rememberedGeneration) throw new Error("The recovery policy moved backwards. Reload the latest app; local history was not changed.");
  return policy.generation > rememberedGeneration;
}
export function recoveryHeaders(policy: RecoveryPolicy): Record<string, string> {
  parseRecoveryPolicy(policy);
  return { "x-cp-recovery-client": RECOVERY_CLIENT_VERSION, "x-cp-recovery-generation": String(policy.generation) };
}
/** Validate an explicit device replacement; never silently revoke another device. */
export function validateDeviceReplacement(deviceIds: string[], removeIds: string[]): void {
  const removed = new Set(removeIds);
  if (removed.size !== removeIds.length || removeIds.some(id => !deviceIds.includes(id))) throw new Error("The device selection changed. Refresh the account and select again.");
  if (deviceIds.length - removed.size >= 8) throw new Error("The account already has eight devices. Select an old device to replace.");
}
/** Only a confirmed generation change may discard old local encrypted data. */
export function assertLocalAccountMatch(localRoot: string, accountRoot: string | null, localDevice: string, serverDevices: string[]): void {
  if (accountRoot === null) throw new Error("The encrypted account is missing without a confirmed reset. Local history was preserved; refresh account status.");
  if (localRoot !== accountRoot) throw new Error("The encryption identity changed without a confirmed reset. Local history was preserved.");
  if (!serverDevices.includes(localDevice)) throw new Error("This device is no longer authorized. Use a verified device to recover access.");
}
