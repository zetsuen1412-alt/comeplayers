import {
  createIdentity,
  fingerprint,
  publicIdentity,
  type Identity,
  type PublicIdentity,
} from "./crypto";
import {
  authorizeDevices,
  createDevice,
  createRecoveryKey,
  openIdentityBackup,
  proveDeviceRequest,
  rosterHash,
  sealIdentityBackup,
  verifyRoster,
  type AccountRoster,
  type DeviceSecrets,
  type EncryptedIdentityBackup,
} from "./protocol";

export type AccountSnapshot = {
  roster: AccountRoster;
  roster_hash: string;
  encrypted_backup: EncryptedIdentityBackup;
  updated_at: string;
};

export type VerifiedSession = {
  version: 2;
  device: DeviceSecrets;
  root: PublicIdentity;
  roster: AccountRoster;
};

export type EnrollmentPlan = {
  session: VerifiedSession;
  backup: EncryptedIdentityBackup | null;
  recoveryIdentity: Identity;
};

export type RecoveryTransport = <T>(
  path: string,
  options?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  },
) => Promise<T>;

export function prepareFirstDevice(userId: string): {
  recoveryKey: string;
  plan: EnrollmentPlan;
} {
  const root = createIdentity(userId);
  const recoveryKey = createRecoveryKey();
  const device = createDevice(userId);
  const roster = authorizeDevices(root, [device]);
  const backup = sealIdentityBackup(root, recoveryKey);
  if (
    fingerprint(openIdentityBackup(backup, recoveryKey, userId, root)) !==
    fingerprint(root)
  ) {
    throw new Error("Recovery verification failed.");
  }
  return {
    recoveryKey,
    plan: {
      session: {
        version: 2,
        device,
        root: publicIdentity(root),
        roster,
      },
      backup,
      recoveryIdentity: root,
    },
  };
}

export function prepareRecoveredDevice(
  userId: string,
  snapshot: AccountSnapshot,
  recoveryKey: string,
  options: { pinnedRoot?: PublicIdentity; removeDeviceIds?: string[] } = {},
): EnrollmentPlan {
  const root = openIdentityBackup(
    snapshot.encrypted_backup,
    recoveryKey,
    userId,
    options.pinnedRoot,
  );
  verifyRoster(snapshot.roster, root);
  if (rosterHash(snapshot.roster) !== snapshot.roster_hash) {
    throw new Error("The device list failed its integrity check.");
  }
  const remove = new Set(options.removeDeviceIds || []);
  if (
    [...remove].some(
      (id) => !snapshot.roster.devices.some((device) => device.id === id),
    )
  ) {
    throw new Error("The selected device is no longer in this account.");
  }
  const device = createDevice(userId);
  const roster = authorizeDevices(
    root,
    [...snapshot.roster.devices.filter((item) => !remove.has(item.id)), device],
    snapshot.roster,
  );
  return {
    session: {
      version: 2,
      device,
      root: publicIdentity(root),
      roster,
    },
    backup: null,
    recoveryIdentity: root,
  };
}

export async function activateVerifiedDevice(
  plan: EnrollmentPlan,
  transport: RecoveryTransport,
  persist: (
    session: VerifiedSession,
    recoveryIdentity: Identity,
  ) => Promise<void>,
): Promise<void> {
  const { session } = plan;
  verifyRoster(session.roster, session.root);
  const authorized = session.roster.devices.find(
    (device) => device.id === session.device.id,
  );
  if (
    !authorized ||
    fingerprint(authorized.identity) !== fingerprint(session.device.identity)
  ) {
    throw new Error("The enrollment plan does not authorize this device.");
  }
  const path = "/api/messages/secure/account";
  const body = JSON.stringify({
    roster: session.roster,
    ...(plan.backup ? { backup: plan.backup } : {}),
  });
  const proof = proveDeviceRequest(session.device, "POST", path, body);
  const result = await transport<{ revision: number; rosterHash: string }>(path, {
    method: "POST",
    body,
    headers: {
      "x-cp-device": proof.deviceId,
      "x-cp-time": proof.timestamp,
      "x-cp-nonce": proof.nonce,
      "x-cp-proof": proof.signature,
    },
  });
  if (
    result.revision !== session.roster.revision ||
    result.rosterHash !== rosterHash(session.roster)
  ) {
    throw new Error("The server did not confirm this device authorization.");
  }
  await persist(session, plan.recoveryIdentity);
}
