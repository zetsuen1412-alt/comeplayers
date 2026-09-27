import { ed25519 } from "@noble/curves/ed25519.js";
import {
  createIdentity,
  decryptJson,
  digest,
  encryptJson,
  fingerprint,
  hex,
  newId,
  openMessage,
  publicIdentity,
  random,
  sealMessage,
  unhex,
  utf8,
  validateIdentity,
  type Envelope,
  type Identity,
  type PublicIdentity,
} from "./crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY = /^[0-9a-f]{64}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const MAX_ACCOUNT_DEVICES = 8;
const MAX_PRIVATE_MEMBERS = 32;
const MAX_REVISION = 2147483647;

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function identifier(value: unknown): asserts value is string {
  check(typeof value === "string" && UUID.test(value), "Invalid encryption identifier.");
}

function revision(value: number) {
  check(
    Number.isSafeInteger(value) && value >= 1 && value <= MAX_REVISION,
    "Invalid key revision.",
  );
}

function instant(value: unknown): asserts value is string {
  check(
    typeof value === "string" &&
      value.length === 24 &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    "Invalid encryption timestamp.",
  );
}

function validatePublic(value: PublicIdentity) {
  check(value && typeof value === "object", "Missing public identity.");
  identifier(value.userId);
  check(
    KEY.test(value.encryptionKey) && KEY.test(value.signingKey),
    "Invalid public identity.",
  );
}

function sign(secret: Identity, data: unknown): string {
  return hex(
    ed25519.sign(utf8(JSON.stringify(data)), unhex(secret.signingSecret)),
  );
}

function verify(publicKey: string, signature: string, data: unknown) {
  check(
    typeof signature === "string" &&
      SIGNATURE.test(signature) &&
      ed25519.verify(
        unhex(signature),
        utf8(JSON.stringify(data)),
        unhex(publicKey),
        { zip215: false },
      ),
    "Encryption signature is invalid.",
  );
}

function sameIdentity(a: PublicIdentity, b: PublicIdentity) {
  return fingerprint(a) === fingerprint(b);
}

function orderedUnique(values: string[]) {
  check(
    values.every((value, index) => index === 0 || values[index - 1]! < value),
    "Encryption entries must be unique and sorted.",
  );
}

export type DevicePublic = {
  id: string;
  identity: PublicIdentity;
  createdAt: string;
};

export type DeviceSecrets = {
  id: string;
  identity: Identity;
  createdAt: string;
};

export type AccountRoster = {
  v: 2;
  identity: PublicIdentity;
  revision: number;
  previous: string | null;
  devices: DevicePublic[];
  signature: string;
};

export function createDevice(userId: string): DeviceSecrets {
  identifier(userId);
  return {
    id: newId(),
    identity: createIdentity(userId),
    createdAt: new Date().toISOString(),
  };
}

export function publicDevice(device: DevicePublic): DevicePublic {
  return {
    id: device.id,
    identity: publicIdentity(device.identity),
    createdAt: device.createdAt,
  };
}

function rosterData(roster: AccountRoster) {
  return [
    "cp-account-roster-v2",
    roster.v,
    publicIdentity(roster.identity),
    roster.revision,
    roster.previous,
    roster.devices.map(publicDevice),
  ];
}

export function rosterHash(roster: AccountRoster): string {
  return digest(utf8(JSON.stringify([...rosterData(roster), roster.signature])));
}

export function verifyRoster(
  roster: AccountRoster,
  trustedRoot: PublicIdentity,
  previous?: AccountRoster,
): void {
  validatePublic(trustedRoot);
  validatePublic(roster.identity);
  check(
    roster.v === 2 && sameIdentity(roster.identity, trustedRoot),
    "Account encryption identity changed.",
  );
  revision(roster.revision);
  check(
    roster.revision === 1
      ? roster.previous === null
      : typeof roster.previous === "string" && KEY.test(roster.previous),
    "Invalid roster chain.",
  );
  check(
    Array.isArray(roster.devices) &&
      roster.devices.length >= 1 &&
      roster.devices.length <= MAX_ACCOUNT_DEVICES,
    "Invalid device count.",
  );
  orderedUnique(roster.devices.map((device) => device.id));
  const deviceKeys = new Set<string>();
  for (const device of roster.devices) {
    identifier(device.id);
    instant(device.createdAt);
    validatePublic(device.identity);
    check(
      device.identity.userId === trustedRoot.userId,
      "Device belongs to another account.",
    );
    check(
      device.identity.encryptionKey !== trustedRoot.encryptionKey &&
        device.identity.signingKey !== trustedRoot.signingKey,
      "A device cannot use the account root keys.",
    );
    check(
      !deviceKeys.has(device.identity.encryptionKey) &&
        !deviceKeys.has(device.identity.signingKey),
      "Devices must have independent keys.",
    );
    deviceKeys.add(device.identity.encryptionKey);
    deviceKeys.add(device.identity.signingKey);
  }
  verify(trustedRoot.signingKey, roster.signature, rosterData(roster));
  if (!previous) return;
  verifyRoster(previous, trustedRoot);
  if (roster.revision === previous.revision) {
    check(
      rosterHash(roster) === rosterHash(previous),
      "Device roster fork detected.",
    );
  } else {
    check(
      roster.revision === previous.revision + 1 &&
        roster.previous === rosterHash(previous),
      "Stale or incomplete device authorization chain.",
    );
  }
  for (const device of roster.devices) {
    const old = previous.devices.find((item) => item.id === device.id);
    check(
      !old ||
        (sameIdentity(device.identity, old.identity) &&
          device.createdAt === old.createdAt),
      "A device identifier cannot be reassigned to new keys.",
    );
  }
}

export function verifyRosterChain(
  rosters: readonly AccountRoster[],
  trustedRoot: PublicIdentity,
  previous?: AccountRoster,
): AccountRoster | undefined {
  if (!previous && rosters.length && rosters[0]!.revision !== 1) {
    throw new Error("The device authorization chain is incomplete.");
  }
  let cursor = previous;
  for (const roster of rosters) {
    verifyRoster(roster, trustedRoot, cursor);
    cursor = roster;
  }
  return cursor;
}

export function authorizeDevices(
  root: Identity,
  devices: DevicePublic[],
  previous?: AccountRoster,
): AccountRoster {
  validateIdentity(root, root.userId);
  if (previous) verifyRoster(previous, root);
  const roster: AccountRoster = {
    v: 2,
    identity: publicIdentity(root),
    revision: previous ? previous.revision + 1 : 1,
    previous: previous ? rosterHash(previous) : null,
    devices: devices
      .map(publicDevice)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    signature: "",
  };
  roster.signature = sign(root, rosterData(roster));
  verifyRoster(roster, root, previous);
  return roster;
}

function authorizedDevice(roster: AccountRoster, deviceId: string): DevicePublic {
  const device = roster.devices.find((item) => item.id === deviceId);
  check(device, "This device is not authorized.");
  return device;
}

export type EncryptedIdentityBackup = {
  passkey?: import("./passkeyRecovery").PasskeyRecovery;
  password?: import("./passwordRecovery").PasswordRecovery;
  v: 2;
  id: string;
  userId: string;
  rootFingerprint: string;
  createdAt: string;
  ciphertext: string;
  signature: string;
};

function backupContext(backup: EncryptedIdentityBackup) {
  return [
    "cp-root-backup-v2",
    backup.v,
    backup.id,
    backup.userId,
    backup.rootFingerprint,
    backup.createdAt,
  ];
}

export function createRecoveryKey(): string {
  return hex(random());
}

function recoveryBytes(value: string): Uint8Array {
  const normalized = value.replace(/\s/g, "").toLowerCase();
  check(KEY.test(normalized), "Enter the complete 64-character recovery key.");
  return unhex(normalized);
}

export function sealIdentityBackup(
  root: Identity,
  recoveryKey: string,
): EncryptedIdentityBackup {
  validateIdentity(root, root.userId);
  const backup: EncryptedIdentityBackup = {
    v: 2,
    id: newId(),
    userId: root.userId,
    rootFingerprint: fingerprint(root),
    createdAt: new Date().toISOString(),
    ciphertext: "",
    signature: "",
  };
  const key = recoveryBytes(recoveryKey);
  try {
    backup.ciphertext = encryptJson(
      key,
      {
        ...publicIdentity(root),
        encryptionSecret: root.encryptionSecret,
        signingSecret: root.signingSecret,
      },
      JSON.stringify(backupContext(backup)),
    );
    backup.signature = sign(root, [...backupContext(backup), backup.ciphertext]);
    return backup;
  } finally {
    key.fill(0);
  }
}

export function openIdentityBackup(
  backup: EncryptedIdentityBackup,
  recoveryKey: string,
  userId: string,
  pinnedRoot?: PublicIdentity,
): Identity {
  identifier(backup.id);
  identifier(userId);
  instant(backup.createdAt);
  check(
    backup.v === 2 &&
      backup.userId === userId &&
      KEY.test(backup.rootFingerprint) &&
      typeof backup.ciphertext === "string" &&
      /^(?:[0-9a-f]{2}){40,4096}$/.test(backup.ciphertext),
    "Invalid encrypted identity backup.",
  );
  const key = recoveryBytes(recoveryKey);
  try {
    const root = decryptJson<Identity>(
      key,
      backup.ciphertext,
      JSON.stringify(backupContext(backup)),
    );
    validateIdentity(root, userId);
    check(
      fingerprint(root) === backup.rootFingerprint &&
        (!pinnedRoot || sameIdentity(root, pinnedRoot)),
      "Recovered account identity does not match.",
    );
    verify(root.signingKey, backup.signature, [
      ...backupContext(backup),
      backup.ciphertext,
    ]);
    return root;
  } finally {
    key.fill(0);
  }
}

export type EpochMember = { roster: AccountRoster; admin: boolean };
export type ConversationEpoch = {
  v: 2;
  id: string;
  roomId: string;
  epoch: number;
  previous: string | null;
  createdAt: string;
  authorUserId: string;
  authorDeviceId: string;
  members: EpochMember[];
  wraps: { target: string; envelope: Envelope }[];
  signature: string;
};
export type ConversationKey = {
  roomId: string;
  epochId: string;
  epochHash: string;
  secret: string;
};
export type TrustedRoots = ReadonlyMap<string, PublicIdentity>;

const verifiedEpochs = new WeakMap<ConversationEpoch, string>();

function requireVerifiedEpoch(epoch: ConversationEpoch): void {
  check(
    verifiedEpochs.get(epoch) === epochHash(epoch),
    "Verify this conversation's authenticated key chain first.",
  );
}

function epochData(epoch: ConversationEpoch) {
  return [
    "cp-conversation-epoch-v2",
    epoch.v,
    epoch.id,
    epoch.roomId,
    epoch.epoch,
    epoch.previous,
    epoch.createdAt,
    epoch.authorUserId,
    epoch.authorDeviceId,
    epoch.members.map((member) => [
      member.roster.identity.userId,
      rosterHash(member.roster),
      member.admin,
    ]),
  ];
}

function epochBinding(epoch: ConversationEpoch) {
  return digest(utf8(JSON.stringify(epochData(epoch))));
}

function canonicalWraps(epoch: ConversationEpoch) {
  return epoch.wraps.map(({ target, envelope }) => ({
    target,
    envelope: {
      v: envelope.v,
      id: envelope.id,
      roomId: envelope.roomId,
      senderId: envelope.senderId,
      recipientId: envelope.recipientId,
      senderKey: envelope.senderKey,
      recipientKey: envelope.recipientKey,
      createdAt: envelope.createdAt,
      enc: envelope.enc,
      ciphertext: envelope.ciphertext,
      signature: envelope.signature,
    },
  }));
}

export function epochHash(epoch: ConversationEpoch) {
  return digest(
    utf8(
      JSON.stringify([
        ...epochData(epoch),
        canonicalWraps(epoch),
        epoch.signature,
      ]),
    ),
  );
}

function epochTargets(members: EpochMember[]) {
  return members
    .flatMap(({ roster }) => [
      { target: `r:${roster.identity.userId}`, identity: roster.identity },
      ...roster.devices.map((device) => ({
        target: `d:${roster.identity.userId}:${device.id}`,
        identity: device.identity,
      })),
    ])
    .sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
}

function member(epoch: ConversationEpoch, userId: string): EpochMember {
  const value = epoch.members.find(
    (item) => item.roster.identity.userId === userId,
  );
  check(value, "Account is not a conversation member.");
  return value;
}

export function verifyEpoch(
  epoch: ConversationEpoch,
  trustedRoots: TrustedRoots,
  previous?: ConversationEpoch,
  trustedFounder?: string,
  rosterChains?: ReadonlyMap<string, readonly AccountRoster[]>,
): void {
  check(epoch.v === 2, "Unsupported conversation encryption version.");
  identifier(epoch.id);
  identifier(epoch.roomId);
  identifier(epoch.authorUserId);
  identifier(epoch.authorDeviceId);
  instant(epoch.createdAt);
  revision(epoch.epoch);
  check(
    Array.isArray(epoch.members) &&
      epoch.members.length >= 2 &&
      epoch.members.length <= MAX_PRIVATE_MEMBERS,
    "Invalid private conversation size.",
  );
  orderedUnique(epoch.members.map((item) => item.roster.identity.userId));
  check(
    epoch.members.some((item) => item.admin),
    "A private conversation needs an administrator.",
  );
  for (const item of epoch.members) {
    check(typeof item.admin === "boolean", "Invalid administrator flag.");
    const root = trustedRoots.get(item.roster.identity.userId);
    check(root, "Verify the new member's identity before accepting this key.");
    verifyRoster(item.roster, root);
  }
  const authorMember = member(epoch, epoch.authorUserId);
  const author = authorizedDevice(authorMember.roster, epoch.authorDeviceId);
  check(authorMember.admin, "Only an administrator can issue a conversation key.");
  if (previous) {
    requireVerifiedEpoch(previous);
    check(
      epoch.roomId === previous.roomId &&
        epoch.epoch === previous.epoch + 1 &&
        epoch.previous === epochHash(previous),
      "Conversation key rollback or fork detected.",
    );
    const previousAuthor = member(previous, epoch.authorUserId);
    const oldDevice = previousAuthor.roster.devices.find(
      (device) => device.id === epoch.authorDeviceId,
    );
    check(
      previousAuthor.admin &&
        (!oldDevice || sameIdentity(oldDevice.identity, author.identity)),
      "Key changes require an existing administrator's authorized device.",
    );
    for (const item of epoch.members) {
      const old = previous.members.find(
        (entry) =>
          entry.roster.identity.userId === item.roster.identity.userId,
      );
      if (!old) continue;
      const chain = (rosterChains?.get(item.roster.identity.userId) || []).filter(
        (roster) =>
          roster.revision > old.roster.revision &&
          roster.revision < item.roster.revision,
      );
      const cursor =
        verifyRosterChain(chain, old.roster.identity, old.roster) || old.roster;
      verifyRoster(item.roster, old.roster.identity, cursor);
    }
  } else {
    check(
      epoch.epoch === 1 &&
        epoch.previous === null &&
        epoch.authorUserId === trustedFounder,
      "Verify the conversation invitation before accepting its first key.",
    );
  }
  const targets = epochTargets(epoch.members);
  check(
    Array.isArray(epoch.wraps) && epoch.wraps.length === targets.length,
    "Missing or extra conversation key recipients.",
  );
  const binding = epochBinding(epoch);
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    const wrap = epoch.wraps[index]!;
    const envelope = wrap.envelope;
    check(
      wrap.target === target.target &&
        envelope.v === 1 &&
        envelope.id === epoch.id &&
        envelope.roomId === epoch.roomId &&
        envelope.senderId === author.identity.userId &&
        envelope.senderKey === fingerprint(author.identity) &&
        envelope.recipientId === target.identity.userId &&
        envelope.recipientKey === fingerprint(target.identity),
      "Conversation key recipient was substituted.",
    );
    check(
      typeof envelope.ciphertext === "string" &&
        envelope.ciphertext.length <= 4096 &&
        KEY.test(envelope.enc) &&
        SIGNATURE.test(envelope.signature),
      "Invalid wrapped conversation key.",
    );
  }
  verify(author.identity.signingKey, epoch.signature, [
    ...epochData(epoch),
    binding,
    canonicalWraps(epoch),
  ]);
  verifiedEpochs.set(epoch, epochHash(epoch));
}

export async function createEpoch(
  author: DeviceSecrets,
  roomId: string,
  members: EpochMember[],
  trustedRoots: TrustedRoots,
  previous?: ConversationEpoch,
  rosterChains?: ReadonlyMap<string, readonly AccountRoster[]>,
): Promise<{ epoch: ConversationEpoch; key: ConversationKey }> {
  const epoch: ConversationEpoch = {
    v: 2,
    id: newId(),
    roomId,
    epoch: previous ? previous.epoch + 1 : 1,
    previous: previous ? epochHash(previous) : null,
    createdAt: new Date().toISOString(),
    authorUserId: author.identity.userId,
    authorDeviceId: author.id,
    members: members
      .map((item) => ({ admin: item.admin, roster: item.roster }))
      .sort((a, b) =>
        a.roster.identity.userId < b.roster.identity.userId
          ? -1
          : a.roster.identity.userId > b.roster.identity.userId
            ? 1
            : 0,
      ),
    wraps: [],
    signature: "",
  };
  const secret = hex(random());
  const binding = epochBinding(epoch);
  for (const target of epochTargets(epoch.members)) {
    epoch.wraps.push({
      target: target.target,
      envelope: await sealMessage(
        author.identity,
        target.identity,
        roomId,
        {
          kind: "conversation-key-v2",
          binding,
          target: target.target,
          secret,
        },
        epoch.id,
      ),
    });
  }
  epoch.signature = sign(author.identity, [
    ...epochData(epoch),
    binding,
    canonicalWraps(epoch),
  ]);
  verifyEpoch(epoch, trustedRoots, previous, author.identity.userId, rosterChains);
  return {
    epoch,
    key: { roomId, epochId: epoch.id, epochHash: epochHash(epoch), secret },
  };
}

export async function openEpochKey(
  epoch: ConversationEpoch,
  recipient: Identity,
  deviceId?: string,
): Promise<ConversationKey> {
  requireVerifiedEpoch(epoch);
  const recipientMember = member(epoch, recipient.userId);
  const trustedRecipient = deviceId
    ? authorizedDevice(recipientMember.roster, deviceId).identity
    : recipientMember.roster.identity;
  validateIdentity(recipient, recipient.userId);
  check(
    sameIdentity(recipient, trustedRecipient),
    "This key belongs to another device or recovery identity.",
  );
  const target = deviceId
    ? `d:${recipient.userId}:${deviceId}`
    : `r:${recipient.userId}`;
  const wrap = epoch.wraps.find((item) => item.target === target);
  check(wrap, "This device has no conversation key.");
  const author = authorizedDevice(
    member(epoch, epoch.authorUserId).roster,
    epoch.authorDeviceId,
  );
  const payload = await openMessage<{
    kind: string;
    binding: string;
    target: string;
    secret: string;
  }>(recipient, author.identity, wrap.envelope, epoch.roomId);
  check(
    payload.kind === "conversation-key-v2" &&
      payload.binding === epochBinding(epoch) &&
      payload.target === target &&
      KEY.test(payload.secret),
    "Conversation key authentication failed.",
  );
  return {
    roomId: epoch.roomId,
    epochId: epoch.id,
    epochHash: epochHash(epoch),
    secret: payload.secret,
  };
}

export type HistoryEnvelope = {
  v: 2;
  id: string;
  roomId: string;
  epochId: string;
  epochHash: string;
  senderId: string;
  deviceId: string;
  createdAt: string;
  blobId: string | null;
  ciphertext: string;
  signature: string;
};

function messageContext(message: HistoryEnvelope) {
  return [
    "cp-history-message-v2",
    message.v,
    message.id,
    message.roomId,
    message.epochId,
    message.epochHash,
    message.senderId,
    message.deviceId,
    message.createdAt,
    message.blobId,
  ];
}

function keyMatches(key: ConversationKey, epoch: ConversationEpoch) {
  requireVerifiedEpoch(epoch);
  check(
    key.roomId === epoch.roomId &&
      key.epochId === epoch.id &&
      key.epochHash === epochHash(epoch) &&
      KEY.test(key.secret),
    "Wrong conversation key.",
  );
}

export function encryptHistory(
  author: DeviceSecrets,
  epoch: ConversationEpoch,
  key: ConversationKey,
  payload: unknown,
  id = newId(),
  blobId: string | null = null,
): HistoryEnvelope {
  keyMatches(key, epoch);
  identifier(id);
  if (blobId !== null) identifier(blobId);
  const device = authorizedDevice(member(epoch, author.identity.userId).roster, author.id);
  check(
    sameIdentity(device.identity, author.identity),
    "Unauthorized message sender.",
  );
  check(
    utf8(JSON.stringify(payload)).length <= 32768,
    "Message is too large.",
  );
  const message: HistoryEnvelope = {
    v: 2,
    id,
    roomId: epoch.roomId,
    epochId: epoch.id,
    epochHash: epochHash(epoch),
    senderId: author.identity.userId,
    deviceId: author.id,
    createdAt: new Date().toISOString(),
    blobId,
    ciphertext: "",
    signature: "",
  };
  const bytes = unhex(key.secret);
  try {
    message.ciphertext = encryptJson(
      bytes,
      payload,
      JSON.stringify(messageContext(message)),
    );
  } finally {
    bytes.fill(0);
  }
  message.signature = sign(author.identity, [
    ...messageContext(message),
    message.ciphertext,
  ]);
  return message;
}

export function decryptHistory<T>(
  message: HistoryEnvelope,
  epoch: ConversationEpoch,
  key: ConversationKey,
): T {
  keyMatches(key, epoch);
  identifier(message.id);
  instant(message.createdAt);
  if (message.blobId !== null) identifier(message.blobId);
  check(
    message.v === 2 &&
      message.roomId === epoch.roomId &&
      message.epochId === epoch.id &&
      message.epochHash === epochHash(epoch),
    "Message destination or epoch was substituted.",
  );
  check(
    typeof message.ciphertext === "string" &&
      /^(?:[0-9a-f]{2}){40,32808}$/.test(message.ciphertext),
    "Invalid encrypted message size.",
  );
  const sender = authorizedDevice(
    member(epoch, message.senderId).roster,
    message.deviceId,
  );
  verify(sender.identity.signingKey, message.signature, [
    ...messageContext(message),
    message.ciphertext,
  ]);
  const bytes = unhex(key.secret);
  try {
    return decryptJson<T>(
      bytes,
      message.ciphertext,
      JSON.stringify(messageContext(message)),
    );
  } finally {
    bytes.fill(0);
  }
}

export function assertCurrentEpoch(
  epoch: ConversationEpoch,
  currentRosters: ReadonlyMap<string, AccountRoster>,
): void {
  requireVerifiedEpoch(epoch);
  for (const { roster } of epoch.members) {
    const current = currentRosters.get(roster.identity.userId);
    check(
      current && rosterHash(current) === rosterHash(roster),
      "Devices changed. Rotate the conversation key before sending.",
    );
    verifyRoster(current, roster.identity);
  }
}

export type DeviceRequestProof = {
  deviceId: string;
  timestamp: string;
  nonce: string;
  signature: string;
};

export function proveDeviceRequest(
  device: DeviceSecrets,
  method: string,
  path: string,
  body = "",
): DeviceRequestProof {
  check(
    (path.startsWith("/api/messages/secure/") || path === "/api/messages/calls") &&
      !path.includes("#"),
    "Invalid encrypted API path.",
  );
  const proof: DeviceRequestProof = {
    deviceId: device.id,
    timestamp: new Date().toISOString(),
    nonce: newId(),
    signature: "",
  };
  proof.signature = sign(device.identity, [
    "cp-device-request-v2",
    device.identity.userId,
    proof.deviceId,
    proof.timestamp,
    proof.nonce,
    method.toUpperCase(),
    path,
    digest(utf8(body)),
  ]);
  return proof;
}
