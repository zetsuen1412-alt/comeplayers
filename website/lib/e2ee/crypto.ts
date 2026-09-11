import { CipherSuite } from "hpke";
import {
  AEAD_ChaCha20Poly1305,
  KDF_HKDF_SHA256,
  KEM_DHKEM_X25519_HKDF_SHA256,
} from "@panva/hpke-noble";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";

const suite = new CipherSuite(
  KEM_DHKEM_X25519_HKDF_SHA256,
  KDF_HKDF_SHA256,
  AEAD_ChaCha20Poly1305,
);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const utf8 = (value: string) => encoder.encode(value);
export const hex = bytesToHex;
export const unhex = hexToBytes;
export const digest = (value: Uint8Array) => hex(sha256(value));

export function random(size = 32): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(size));
}

export function newId(): string {
  const bytes = random(16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export type PublicIdentity = {
  userId: string;
  encryptionKey: string;
  signingKey: string;
};

export type Identity = PublicIdentity & {
  encryptionSecret: string;
  signingSecret: string;
};

export function createIdentity(userId: string): Identity {
  const encryptionSecret = random();
  const signingSecret = random();
  return {
    userId,
    encryptionSecret: hex(encryptionSecret),
    signingSecret: hex(signingSecret),
    encryptionKey: hex(x25519.getPublicKey(encryptionSecret)),
    signingKey: hex(ed25519.getPublicKey(signingSecret)),
  };
}

export function publicIdentity(identity: PublicIdentity): PublicIdentity {
  return {
    userId: identity.userId,
    encryptionKey: identity.encryptionKey,
    signingKey: identity.signingKey,
  };
}

export function validateIdentity(identity: Identity, userId: string): void {
  if (
    identity.userId !== userId ||
    hex(x25519.getPublicKey(unhex(identity.encryptionSecret))) !== identity.encryptionKey ||
    hex(ed25519.getPublicKey(unhex(identity.signingSecret))) !== identity.signingKey
  ) {
    throw new Error("The backup identity does not match this account.");
  }
}

export function fingerprint(identity: PublicIdentity): string {
  return digest(
    utf8(
      JSON.stringify([
        "cp-identity-v1",
        identity.userId,
        identity.encryptionKey,
        identity.signingKey,
      ]),
    ),
  );
}

export function safetyCode(a: PublicIdentity, b: PublicIdentity): string {
  return digest(utf8([fingerprint(a), fingerprint(b)].sort().join(":")))
    .match(/.{1,4}/g)!
    .join(" ");
}

export type Envelope = {
  v: 1;
  id: string;
  roomId: string;
  senderId: string;
  recipientId: string;
  senderKey: string;
  recipientKey: string;
  createdAt: string;
  enc: string;
  ciphertext: string;
  signature: string;
};

function metadata(
  envelope: Omit<Envelope, "enc" | "ciphertext" | "signature">,
): Uint8Array {
  return utf8(
    JSON.stringify([
      "cp-private-message-v1",
      envelope.v,
      envelope.id,
      envelope.roomId,
      envelope.senderId,
      envelope.recipientId,
      envelope.senderKey,
      envelope.recipientKey,
      envelope.createdAt,
    ]),
  );
}

function signedBytes(envelope: Envelope): Uint8Array {
  return concatBytes(
    metadata(envelope),
    unhex(envelope.enc),
    unhex(envelope.ciphertext),
  );
}

export async function sealMessage(
  sender: Identity,
  recipient: PublicIdentity,
  roomId: string,
  payload: unknown,
  id = newId(),
): Promise<Envelope> {
  const plaintext = utf8(JSON.stringify(payload));
  if (plaintext.length > 32768) throw new Error("Message is too large.");
  const meta = {
    v: 1 as const,
    id,
    roomId,
    senderId: sender.userId,
    recipientId: recipient.userId,
    senderKey: fingerprint(sender),
    recipientKey: fingerprint(recipient),
    createdAt: new Date().toISOString(),
  };
  const result = await suite.Seal(
    await suite.DeserializePublicKey(unhex(recipient.encryptionKey)),
    plaintext,
    {
      aad: metadata(meta),
      info: utf8("ComePlayers/private/v1"),
    },
  );
  const envelope: Envelope = {
    ...meta,
    enc: hex(result.encapsulatedSecret),
    ciphertext: hex(result.ciphertext),
    signature: "",
  };
  envelope.signature = hex(
    ed25519.sign(signedBytes(envelope), unhex(sender.signingSecret)),
  );
  return envelope;
}

export async function openMessage<T>(
  recipient: Identity,
  trustedSender: PublicIdentity,
  envelope: Envelope,
  expectedRoom: string,
): Promise<T> {
  if (
    envelope.v !== 1 ||
    envelope.roomId !== expectedRoom ||
    envelope.recipientId !== recipient.userId ||
    envelope.senderId !== trustedSender.userId ||
    envelope.recipientKey !== fingerprint(recipient) ||
    envelope.senderKey !== fingerprint(trustedSender) ||
    envelope.ciphertext.length > 65568 ||
    envelope.enc.length !== 64 ||
    envelope.signature.length !== 128
  ) {
    throw new Error("Message identity or destination does not match.");
  }
  if (
    !ed25519.verify(
      unhex(envelope.signature),
      signedBytes(envelope),
      unhex(trustedSender.signingKey),
      { zip215: false },
    )
  ) {
    throw new Error("Message signature is invalid.");
  }
  const plaintext = await suite.Open(
    await suite.DeserializePrivateKey(unhex(recipient.encryptionSecret)),
    unhex(envelope.enc),
    unhex(envelope.ciphertext),
    {
      aad: metadata(envelope),
      info: utf8("ComePlayers/private/v1"),
    },
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function encryptBytes(
  key: Uint8Array,
  plaintext: Uint8Array,
  context: string,
): Uint8Array {
  const nonce = random(24);
  return concatBytes(
    nonce,
    xchacha20poly1305(key, nonce, utf8(context)).encrypt(plaintext),
  );
}

export function decryptBytes(
  key: Uint8Array,
  ciphertext: Uint8Array,
  context: string,
): Uint8Array {
  if (ciphertext.length < 40) throw new Error("Encrypted data is incomplete.");
  return xchacha20poly1305(
    key,
    ciphertext.subarray(0, 24),
    utf8(context),
  ).decrypt(ciphertext.subarray(24));
}

export function encryptJson(
  key: Uint8Array,
  value: unknown,
  context: string,
): string {
  return hex(encryptBytes(key, utf8(JSON.stringify(value)), context));
}

export function decryptJson<T>(
  key: Uint8Array,
  value: string,
  context: string,
): T {
  return JSON.parse(decoder.decode(decryptBytes(key, unhex(value), context))) as T;
}
