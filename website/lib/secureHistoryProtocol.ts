import type { SupabaseClient, User } from "@supabase/supabase-js";
import { inputError } from "./accountApi";
import { createSupabaseAdmin, requireAuthenticatedUser } from "./serverSupabase";
import { hash, uuid, verifySignature } from "./privateMessaging";
import {
  rootFingerprint, signedRosterHash, verifyDeviceRequest, verifyStoredAccountRoster,
  type AuthorizedDevice, type RootPublic, type SignedRoster,
} from "./secureAccountProtocol";

const HEX_32 = /^[0-9a-f]{64}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const MAX_EPOCH_BYTES = 196608;
export type SecureEnvelope = {
  v: 1; id: string; roomId: string; senderId: string; recipientId: string;
  senderKey: string; recipientKey: string; createdAt: string; enc: string; ciphertext: string; signature: string;
};
export type SecureEpochMember = { roster: SignedRoster; admin: boolean };
export type SecureEpoch = {
  v: 2; id: string; roomId: string; epoch: number; previous: string | null;
  createdAt: string; authorUserId: string; authorDeviceId: string;
  members: SecureEpochMember[]; wraps: { target: string; envelope: SecureEnvelope }[]; signature: string;
};
export type SecureHistoryEnvelope = {
  v: 2; id: string; roomId: string; epochId: string; epochHash: string;
  senderId: string; deviceId: string; createdAt: string; blobId: string | null;
  ciphertext: string; signature: string;
};
export type SecureActor = { user: User; db: SupabaseClient; roster: SignedRoster; device: AuthorizedDevice };
type AccountCheckpoint = { roster: SignedRoster; roster_hash: string };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw inputError("Invalid encrypted history.");
  return value as Record<string, unknown>;
}
function iso(value: unknown): string {
  if (typeof value !== "string" || value.length !== 24 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw inputError("Invalid encryption timestamp.");
  return value;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2147483647) throw inputError("Invalid encryption revision.");
  return Number(value);
}
function signature(value: unknown): string {
  if (typeof value !== "string" || !SIGNATURE.test(value)) throw inputError("Invalid encryption signature.");
  return value;
}
function hex32(value: unknown): string {
  if (typeof value !== "string" || !HEX_32.test(value)) throw inputError("Invalid encryption hash.");
  return value;
}
function canonicalEnvelope(value: unknown): SecureEnvelope {
  const e = object(value);
  const result: SecureEnvelope = {
    v: 1, id: uuid(e.id), roomId: uuid(e.roomId), senderId: uuid(e.senderId), recipientId: uuid(e.recipientId),
    senderKey: hex32(e.senderKey), recipientKey: hex32(e.recipientKey), createdAt: iso(e.createdAt),
    enc: hex32(e.enc), ciphertext: typeof e.ciphertext === "string" ? e.ciphertext : "", signature: signature(e.signature),
  };
  if (e.v !== 1 || !/^(?:[0-9a-f]{2}){16,2048}$/.test(result.ciphertext)) throw inputError("Invalid wrapped conversation key.");
  return result;
}
function envelopeData(e: SecureEnvelope) {
  return JSON.stringify(["cp-private-message-v1", 1, e.id, e.roomId, e.senderId, e.recipientId, e.senderKey, e.recipientKey, e.createdAt]);
}
function verifyEnvelope(e: SecureEnvelope, sender: RootPublic, recipient: RootPublic) {
  if (e.senderId !== sender.userId || e.recipientId !== recipient.userId || e.senderKey !== rootFingerprint(sender) || e.recipientKey !== rootFingerprint(recipient)) throw inputError("Conversation key recipient was substituted.");
  const signed = Buffer.concat([Buffer.from(envelopeData(e)), Buffer.from(e.enc, "hex"), Buffer.from(e.ciphertext, "hex")]);
  if (!verifySignature(sender.signingKey, e.signature, signed)) throw inputError("Invalid wrapped-key signature.", 403);
}
function canonicalWraps(epoch: SecureEpoch) { return epoch.wraps.map(({ target, envelope: e }) => ({ target, envelope: {
  v: e.v, id: e.id, roomId: e.roomId, senderId: e.senderId, recipientId: e.recipientId,
  senderKey: e.senderKey, recipientKey: e.recipientKey, createdAt: e.createdAt,
  enc: e.enc, ciphertext: e.ciphertext, signature: e.signature,
} })); }
function epochData(epoch: SecureEpoch) {
  return ["cp-conversation-epoch-v2", epoch.v, epoch.id, epoch.roomId, epoch.epoch, epoch.previous, epoch.createdAt, epoch.authorUserId, epoch.authorDeviceId,
    epoch.members.map(member => [member.roster.identity.userId, signedRosterHash(member.roster), member.admin])];
}
function epochBinding(epoch: SecureEpoch) { return hash(JSON.stringify(epochData(epoch))); }
export function secureEpochHash(epoch: SecureEpoch) { return hash(JSON.stringify([...epochData(epoch), canonicalWraps(epoch), epoch.signature])); }
function device(roster: SignedRoster, id: string) {
  const found = roster.devices.find(item => item.id === id);
  if (!found) throw inputError("This device is not authorized for the conversation.", 403);
  return found;
}
function sameArray(a: string[], b: string[]) { return a.length === b.length && a.every((value, index) => value === b[index]); }

export async function secureActor(request: Request, body = ""): Promise<SecureActor> {
  const user = await requireAuthenticatedUser(request), db = createSupabaseAdmin();
  const account = await db.from("cp_secure_accounts").select("roster,roster_hash").eq("user_id", user.id).maybeSingle();
  if (account.error) throw account.error;
  if (!account.data) throw inputError("Set up encrypted recovery before using private Messages.", 409);
  const roster = verifyStoredAccountRoster(account.data.roster, user.id);
  if (signedRosterHash(roster) !== account.data.roster_hash) throw inputError("Account encryption checkpoint is invalid.", 409);
  return { user, db, roster, device: verifyDeviceRequest(request, body, user.id, roster.devices) };
}

export async function loadSecureAccounts(db: SupabaseClient, userIds: string[]): Promise<Map<string, AccountCheckpoint>> {
  const unique = [...new Set(userIds)].sort();
  const result = await db.from("cp_secure_accounts").select("user_id,roster,roster_hash").in("user_id", unique);
  if (result.error) throw result.error;
  const map = new Map<string, AccountCheckpoint>();
  for (const row of result.data || []) {
    const roster = verifyStoredAccountRoster(row.roster, row.user_id);
    if (signedRosterHash(roster) !== row.roster_hash) throw inputError("A participant's encryption checkpoint is invalid.", 409);
    map.set(row.user_id, { roster, roster_hash: row.roster_hash });
  }
  if (map.size !== unique.length) throw inputError("Every participant must activate encrypted Messages first.", 409);
  return map;
}

export function verifySecureEpoch(value: unknown, expectedRoomId: string, expectedMembers: string[], accounts: Map<string, AccountCheckpoint>, previous?: SecureEpoch): SecureEpoch {
  const raw = object(value);
  if (JSON.stringify(raw).length > MAX_EPOCH_BYTES || raw.v !== 2) throw inputError("Invalid conversation key package.");
  const membersRaw = Array.isArray(raw.members) ? raw.members : [];
  const members: SecureEpochMember[] = membersRaw.map(value => {
    const member = object(value), rosterRaw = object(member.roster), userId = uuid(object(rosterRaw.identity).userId);
    const account = accounts.get(userId);
    if (!account) throw inputError("Unexpected conversation member.", 403);
    const roster = verifyStoredAccountRoster(member.roster, userId);
    if (signedRosterHash(roster) !== account.roster_hash || JSON.stringify(roster) !== JSON.stringify(account.roster)) throw inputError("Use every member's current authorized device list.", 409);
    if (typeof member.admin !== "boolean") throw inputError("Invalid conversation administrator.");
    return { roster, admin: member.admin };
  });
  const memberIds = members.map(item => item.roster.identity.userId);
  if (!sameArray(memberIds, [...expectedMembers].sort()) || !members.some(item => item.admin)) throw inputError("Conversation membership does not match the room.", 403);
  const epoch: SecureEpoch = {
    v: 2, id: uuid(raw.id), roomId: uuid(raw.roomId), epoch: integer(raw.epoch),
    previous: raw.previous === null ? null : hex32(raw.previous), createdAt: iso(raw.createdAt),
    authorUserId: uuid(raw.authorUserId), authorDeviceId: uuid(raw.authorDeviceId), members,
    wraps: Array.isArray(raw.wraps) ? raw.wraps.map(value => { const wrap = object(value); return { target: String(wrap.target || ""), envelope: canonicalEnvelope(wrap.envelope) }; }) : [],
    signature: signature(raw.signature),
  };
  if (epoch.roomId !== expectedRoomId) throw inputError("Conversation key has the wrong room.");
  const authorMember = members.find(item => item.roster.identity.userId === epoch.authorUserId);
  if (!authorMember?.admin) throw inputError("Only a conversation administrator may rotate keys.", 403);
  const author = device(authorMember.roster, epoch.authorDeviceId);
  if (previous) {
    if (epoch.epoch !== previous.epoch + 1 || epoch.previous !== secureEpochHash(previous)) throw inputError("Conversation key is stale or forked.", 409);
    const oldAuthor = previous.members.find(item => item.roster.identity.userId === epoch.authorUserId);
    if (!oldAuthor?.admin) throw inputError("The key author was not an administrator.", 403);
    const oldDevice = oldAuthor.roster.devices.find(item => item.id === epoch.authorDeviceId);
    if (oldDevice && rootFingerprint(oldDevice.identity) !== rootFingerprint(author.identity)) throw inputError("Device identity was substituted.", 403);
  } else if (epoch.epoch !== 1 || epoch.previous !== null) throw inputError("Invalid first conversation key.");
  const targets = members.flatMap(member => [
    { target: `r:${member.roster.identity.userId}`, identity: member.roster.identity },
    ...member.roster.devices.map(item => ({ target: `d:${member.roster.identity.userId}:${item.id}`, identity: item.identity })),
  ]).sort((a, b) => a.target.localeCompare(b.target));
  if (targets.length !== epoch.wraps.length) throw inputError("Missing or extra conversation key recipients.");
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]!, wrap = epoch.wraps[index]!;
    if (wrap.target !== target.target || wrap.envelope.id !== epoch.id || wrap.envelope.roomId !== epoch.roomId) throw inputError("Conversation key recipient order is invalid.");
    verifyEnvelope(wrap.envelope, author.identity, target.identity);
  }
  const signed = JSON.stringify([...epochData(epoch), epochBinding(epoch), canonicalWraps(epoch)]);
  if (!verifySignature(author.identity.signingKey, epoch.signature, signed)) throw inputError("Invalid conversation-key signature.", 403);
  return epoch;
}

function historyData(message: SecureHistoryEnvelope) {
  return ["cp-history-message-v2", message.v, message.id, message.roomId, message.epochId, message.epochHash, message.senderId, message.deviceId, message.createdAt, message.blobId];
}
export function secureHistoryHash(message: SecureHistoryEnvelope) { return hash(JSON.stringify([...historyData(message), message.ciphertext, message.signature])); }
export function verifySecureHistory(value: unknown, epoch: SecureEpoch): SecureHistoryEnvelope {
  const raw = object(value), ciphertext = typeof raw.ciphertext === "string" ? raw.ciphertext : "";
  const message: SecureHistoryEnvelope = {
    v: 2, id: uuid(raw.id), roomId: uuid(raw.roomId), epochId: uuid(raw.epochId), epochHash: hex32(raw.epochHash),
    senderId: uuid(raw.senderId), deviceId: uuid(raw.deviceId), createdAt: iso(raw.createdAt),
    blobId: raw.blobId === null ? null : uuid(raw.blobId), ciphertext, signature: signature(raw.signature),
  };
  if (raw.v !== 2 || !/^(?:[0-9a-f]{2}){40,32808}$/.test(ciphertext) || message.roomId !== epoch.roomId || message.epochId !== epoch.id || message.epochHash !== secureEpochHash(epoch)) throw inputError("Invalid encrypted history event.");
  const senderMember = epoch.members.find(item => item.roster.identity.userId === message.senderId);
  if (!senderMember) throw inputError("Message sender is not a member.", 403);
  const sender = device(senderMember.roster, message.deviceId);
  if (!verifySignature(sender.identity.signingKey, message.signature, JSON.stringify([...historyData(message), message.ciphertext]))) throw inputError("Invalid encrypted-message signature.", 403);
  return message;
}
