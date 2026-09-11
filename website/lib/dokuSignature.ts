import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

type DokuRequestSignatureInput = {
  clientId: string;
  requestId: string;
  requestTimestamp: string;
  requestTarget: string;
  rawBody: string;
  secretKey: string;
};

type DokuResponseSignatureInput = {
  clientId: string;
  requestId: string;
  responseTimestamp: string;
  requestTarget: string;
  rawBody: string;
  secretKey: string;
};

type DokuSnapSignatureInput = {
  httpMethod: string;
  requestTarget: string;
  accessToken: string;
  requestTimestamp: string;
  rawBody: string;
  secretKey: string;
};

export function createDokuDigest(rawBody: string) {
  return createHash("sha256").update(rawBody, "utf8").digest("base64");
}

export function sanitizeDokuText(
  value: string | null | undefined,
  fallback: string,
  maxLength: number,
) {
  const sanitize = (input: string) =>
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9 .\-\/+,_=:'@%()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalized = sanitize(String(value || "")) || sanitize(fallback);
  return normalized.slice(0, Math.max(1, maxLength));
}

export function buildDokuRequestSignatureComponent(
  input: Omit<DokuRequestSignatureInput, "secretKey">,
) {
  return [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Request-Timestamp:${input.requestTimestamp}`,
    `Request-Target:${input.requestTarget}`,
    `Digest:${createDokuDigest(input.rawBody)}`,
  ].join("\n");
}

export function buildDokuResponseSignatureComponent(
  input: Omit<DokuResponseSignatureInput, "secretKey">,
) {
  return [
    `Client-Id:${input.clientId}`,
    `Request-Id:${input.requestId}`,
    `Response-Timestamp:${input.responseTimestamp}`,
    `Request-Target:${input.requestTarget}`,
    `Digest:${createDokuDigest(input.rawBody)}`,
  ].join("\n");
}

function signComponent(component: string, secretKey: string) {
  const digest = createHmac("sha256", secretKey)
    .update(component, "utf8")
    .digest("base64");

  return `HMACSHA256=${digest}`;
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left.trim(), "utf8");
  const rightBuffer = Buffer.from(right.trim(), "utf8");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function minifyJsonBody(rawBody: string) {
  try {
    return JSON.stringify(JSON.parse(rawBody));
  } catch {
    return rawBody.trim();
  }
}

export function buildDokuSnapSignatureComponent(
  input: Omit<DokuSnapSignatureInput, "secretKey">,
) {
  const accessToken = input.accessToken.replace(/^Bearer\s+/i, "").trim();
  const bodyHash = createHash("sha256")
    .update(minifyJsonBody(input.rawBody), "utf8")
    .digest("hex")
    .toLowerCase();

  return [
    input.httpMethod.toUpperCase(),
    input.requestTarget,
    accessToken,
    bodyHash,
    input.requestTimestamp,
  ].join(":");
}

export function createDokuSnapSignature(input: DokuSnapSignatureInput) {
  return createHmac("sha512", input.secretKey)
    .update(buildDokuSnapSignatureComponent(input), "utf8")
    .digest("base64");
}

export function verifyDokuSnapSignature(
  input: DokuSnapSignatureInput & { signature: string },
) {
  return signaturesMatch(createDokuSnapSignature(input), input.signature);
}

export function createDokuRequestSignature(input: DokuRequestSignatureInput) {
  return signComponent(
    buildDokuRequestSignatureComponent(input),
    input.secretKey,
  );
}

export function verifyDokuRequestSignature(
  input: DokuRequestSignatureInput & { signature: string },
) {
  const expected = createDokuRequestSignature(input);
  return signaturesMatch(expected, input.signature);
}

export function createDokuResponseSignature(input: DokuResponseSignatureInput) {
  return signComponent(
    buildDokuResponseSignatureComponent(input),
    input.secretKey,
  );
}

export function verifyDokuResponseSignature(
  input: DokuResponseSignatureInput & { signature: string },
) {
  const expected = createDokuResponseSignature(input);
  return signaturesMatch(expected, input.signature);
}

export function buildDokuInvoice(
  orderId: number,
  existingInvoice?: string | null,
) {
  const sanitized = String(existingInvoice || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 30);

  if (sanitized) return sanitized;

  const year = new Date().getUTCFullYear();
  return `CP${year}${String(orderId).padStart(12, "0")}`.slice(0, 30);
}

export function buildDokuAttemptInvoice(orderId: number, channel: string) {
  const normalizedChannel = String(channel || "PAY")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 3) || "PAY";
  const attemptId = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const year = new Date().getUTCFullYear();

  return `CP${normalizedChannel}${year}${String(orderId).padStart(10, "0")}${attemptId}`.slice(
    0,
    30,
  );
}
