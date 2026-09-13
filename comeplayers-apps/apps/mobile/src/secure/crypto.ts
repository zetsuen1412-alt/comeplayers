import { CipherSuite } from "hpke";
import { KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_ChaCha20Poly1305 } from "@panva/hpke-noble";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, concatBytes } from "@noble/hashes/utils.js";

// HPKE RFC 9180, X25519/HKDF-SHA256/ChaCha20-Poly1305. Identity signatures
// authenticate the sender separately; this is not a Signal Double Ratchet.
const suite = new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_ChaCha20Poly1305);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export const utf8 = (value: string) => encoder.encode(value);
export const hex = bytesToHex;
export const unhex = hexToBytes;
export const digest = (value: Uint8Array) => hex(sha256(value));
export function random(size = 32): Uint8Array { return globalThis.crypto.getRandomValues(new Uint8Array(size)); }
export function newId(): string {
  const b = random(16); b[6] = (b[6]! & 15) | 64; b[8] = (b[8]! & 63) | 128;
  const h = hex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export type PublicIdentity = { userId: string; encryptionKey: string; signingKey: string };
export type Identity = PublicIdentity & { encryptionSecret: string; signingSecret: string };
export function createIdentity(userId: string): Identity {
  const encryptionSecret = random(), signingSecret = random();
  return { userId, encryptionSecret: hex(encryptionSecret), signingSecret: hex(signingSecret), encryptionKey: hex(x25519.getPublicKey(encryptionSecret)), signingKey: hex(ed25519.getPublicKey(signingSecret)) };
}
export function publicIdentity(identity: PublicIdentity): PublicIdentity {
  return { userId: identity.userId, encryptionKey: identity.encryptionKey, signingKey: identity.signingKey };
}
export function validateIdentity(identity: Identity, userId: string): void {
  if (identity.userId !== userId || hex(x25519.getPublicKey(unhex(identity.encryptionSecret))) !== identity.encryptionKey || hex(ed25519.getPublicKey(unhex(identity.signingSecret))) !== identity.signingKey) throw new Error("The backup identity does not match this account.");
}
export function fingerprint(identity: PublicIdentity): string {
  return digest(utf8(JSON.stringify(["cp-identity-v1", identity.userId, identity.encryptionKey, identity.signingKey])));
}
export function safetyCode(a: PublicIdentity, b: PublicIdentity): string {
  return digest(utf8([fingerprint(a), fingerprint(b)].sort().join(":"))).match(/.{1,4}/g)!.join(" ");
}
export type Envelope = {
  v: 1; id: string; roomId: string; senderId: string; recipientId: string;
  senderKey: string; recipientKey: string; createdAt: string;
  enc: string; ciphertext: string; signature: string;
};
function metadata(e: Omit<Envelope, "enc" | "ciphertext" | "signature">): Uint8Array {
  return utf8(JSON.stringify(["cp-private-message-v1", e.v, e.id, e.roomId, e.senderId, e.recipientId, e.senderKey, e.recipientKey, e.createdAt]));
}
function signedBytes(e: Envelope): Uint8Array { return concatBytes(metadata(e), unhex(e.enc), unhex(e.ciphertext)); }
export async function sealMessage(sender: Identity, recipient: PublicIdentity, roomId: string, payload: unknown, id = newId()): Promise<Envelope> {
  const plaintext = utf8(JSON.stringify(payload));
  if (plaintext.length > 32768) throw new Error("Message is too large.");
  const meta = { v: 1 as const, id, roomId, senderId: sender.userId, recipientId: recipient.userId, senderKey: fingerprint(sender), recipientKey: fingerprint(recipient), createdAt: new Date().toISOString() };
  const result = await suite.Seal(await suite.DeserializePublicKey(unhex(recipient.encryptionKey)), plaintext, { aad: metadata(meta), info: utf8("ComePlayers/private/v1") });
  const envelope: Envelope = { ...meta, enc: hex(result.encapsulatedSecret), ciphertext: hex(result.ciphertext), signature: "" };
  envelope.signature = hex(ed25519.sign(signedBytes(envelope), unhex(sender.signingSecret)));
  return envelope;
}
export async function openMessage<T>(recipient: Identity, trustedSender: PublicIdentity, envelope: Envelope, expectedRoom: string): Promise<T> {
  if (envelope.v !== 1 || envelope.roomId !== expectedRoom || envelope.recipientId !== recipient.userId || envelope.senderId !== trustedSender.userId || envelope.recipientKey !== fingerprint(recipient) || envelope.senderKey !== fingerprint(trustedSender) || envelope.ciphertext.length > 65568 || envelope.enc.length !== 64 || envelope.signature.length !== 128) throw new Error("Message identity or destination does not match.");
  if (!ed25519.verify(unhex(envelope.signature), signedBytes(envelope), unhex(trustedSender.signingKey), { zip215: false })) throw new Error("Message signature is invalid.");
  const plaintext = await suite.Open(await suite.DeserializePrivateKey(unhex(recipient.encryptionSecret)), unhex(envelope.enc), unhex(envelope.ciphertext), { aad: metadata(envelope), info: utf8("ComePlayers/private/v1") });
  return JSON.parse(decoder.decode(plaintext)) as T;
}
// A fresh 192-bit nonce for every encrypted local record, attachment and backup chunk.
export function encryptBytes(key: Uint8Array, plaintext: Uint8Array, context: string): Uint8Array {
  const nonce = random(24);
  return concatBytes(nonce, xchacha20poly1305(key, nonce, utf8(context)).encrypt(plaintext));
}
export function decryptBytes(key: Uint8Array, ciphertext: Uint8Array, context: string): Uint8Array {
  if (ciphertext.length < 40) throw new Error("Encrypted data is incomplete.");
  return xchacha20poly1305(key, ciphertext.subarray(0, 24), utf8(context)).decrypt(ciphertext.subarray(24));
}
export function encryptJson(key: Uint8Array, value: unknown, context: string): string { return hex(encryptBytes(key, utf8(JSON.stringify(value)), context)); }
export function decryptJson<T>(key: Uint8Array, value: string, context: string): T { return JSON.parse(decoder.decode(decryptBytes(key, unhex(value), context))) as T; }

export function registrationProof(identity: Identity, deviceId: string, timestamp: string): string {
  return hex(ed25519.sign(utf8(JSON.stringify(["cp-device-v1", publicIdentity(identity), deviceId, timestamp])), unhex(identity.signingSecret)));
}
export function requestProof(identity: Identity, deviceId: string, timestamp: string, method: string, path: string, body = ""): string {
  return hex(ed25519.sign(utf8(JSON.stringify(["cp-request-v1", identity.userId, deviceId, timestamp, method.toUpperCase(), path, digest(utf8(body))])), unhex(identity.signingSecret)));
}
