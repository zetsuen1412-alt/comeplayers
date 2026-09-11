import "server-only";

import { createSign, randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { createDokuSnapSignature } from "@/lib/dokuSignature";

const DOKU_B2B_TOKEN_TARGET = "/authorization/v1/access-token/b2b";
const DOKU_QRIS_GENERATE_TARGET =
  "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate";

type DokuSnapQrisConfig = {
  baseUrl: string;
  clientId: string;
  secretKey: string;
  privateKey: string;
  merchantId: string;
  terminalId: string;
  postalCode: string;
  feeType: string;
};

type DokuTokenResponse = {
  responseCode?: string;
  responseMessage?: string;
  accessToken?: string;
  expiresIn?: string | number;
};

type DokuQrisResponse = {
  responseCode?: string;
  responseMessage?: string;
  referenceNo?: string;
  partnerReferenceNo?: string;
  qrContent?: string;
  terminalId?: string;
  additionalInfo?: {
    validityPeriod?: string;
  };
};

type TokenCache = {
  cacheKey: string;
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export class DokuSnapConfigurationError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = "DokuSnapConfigurationError";
  }
}

export class DokuSnapQrisError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseCode: string | null,
  ) {
    super(message);
    this.name = "DokuSnapQrisError";
  }
}

function readPrivateKey() {
  const encoded = String(
    process.env.DOKU_SNAP_PRIVATE_KEY_BASE64 || "",
  ).trim();
  const plain = String(process.env.DOKU_SNAP_PRIVATE_KEY || "").trim();

  if (encoded) {
    try {
      return Buffer.from(encoded, "base64").toString("utf8").trim();
    } catch {
      throw new DokuSnapConfigurationError(
        "The DOKU SNAP private key is not valid base64.",
      );
    }
  }

  return plain.replace(/\\n/g, "\n").trim();
}

function getDokuSnapQrisConfig(): DokuSnapQrisConfig {
  const environment = String(process.env.DOKU_ENV || "sandbox").toLowerCase();
  const production = environment === "production" || environment === "live";
  const config: DokuSnapQrisConfig = {
    baseUrl: production
      ? "https://api.doku.com"
      : "https://api-sandbox.doku.com",
    clientId: String(process.env.DOKU_CLIENT_ID || "").trim(),
    secretKey: String(process.env.DOKU_SECRET_KEY || "").trim(),
    privateKey: readPrivateKey(),
    merchantId: String(process.env.DOKU_QRIS_MERCHANT_ID || "").trim(),
    terminalId: String(process.env.DOKU_QRIS_TERMINAL_ID || "A01").trim(),
    postalCode: String(process.env.DOKU_QRIS_POSTAL_CODE || "").trim(),
    feeType: String(process.env.DOKU_QRIS_FEE_TYPE || "1").trim(),
  };

  const missing = [
    ["DOKU_CLIENT_ID", config.clientId],
    ["DOKU_SECRET_KEY", config.secretKey],
    ["DOKU_SNAP_PRIVATE_KEY_BASE64", config.privateKey],
    ["DOKU_QRIS_MERCHANT_ID", config.merchantId],
    ["DOKU_QRIS_POSTAL_CODE", config.postalCode],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new DokuSnapConfigurationError(
      `DOKU Direct QRIS is not fully configured (${missing.join(", ")}).`,
    );
  }
  if (!/^[A-Za-z0-9-]{1,64}$/.test(config.clientId)) {
    throw new DokuSnapConfigurationError("The DOKU client ID is invalid.");
  }
  if (!/^[A-Za-z0-9]{1,64}$/.test(config.merchantId)) {
    throw new DokuSnapConfigurationError("The DOKU QRIS merchant ID is invalid.");
  }
  if (!/^[A-Za-z0-9]{1,16}$/.test(config.terminalId)) {
    throw new DokuSnapConfigurationError("The DOKU QRIS terminal ID is invalid.");
  }
  if (!/^\d{5}$/.test(config.postalCode)) {
    throw new DokuSnapConfigurationError("The DOKU QRIS postal code is invalid.");
  }
  if (!/^[1-3]$/.test(config.feeType)) {
    throw new DokuSnapConfigurationError("The DOKU QRIS fee type is invalid.");
  }

  return config;
}

export function toDokuSnapTimestamp(date = new Date()) {
  return new Date(date.getTime() + 7 * 60 * 60_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "+07:00");
}

export function createDokuB2BSignature(input: {
  clientId: string;
  requestTimestamp: string;
  privateKey: string;
}) {
  const signer = createSign("RSA-SHA256");
  signer.update(`${input.clientId}|${input.requestTimestamp}`, "utf8");
  signer.end();
  return signer.sign(input.privateKey, "base64");
}

function numericExternalId() {
  const randomDigits = BigInt(`0x${randomBytes(10).toString("hex")}`)
    .toString(10)
    .padStart(24, "0")
    .slice(0, 24);
  return `${Date.now()}${randomDigits}`.slice(0, 36);
}

function safeProviderMessage(value: unknown, fallback: string) {
  const normalized = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || fallback).slice(0, 180);
}

async function requestB2BToken(config: DokuSnapQrisConfig) {
  const cacheKey = `${config.baseUrl}|${config.clientId}`;
  if (
    tokenCache?.cacheKey === cacheKey &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.accessToken;
  }

  const requestTimestamp = toDokuSnapTimestamp();
  let signature: string;
  try {
    signature = createDokuB2BSignature({
      clientId: config.clientId,
      requestTimestamp,
      privateKey: config.privateKey,
    });
  } catch {
    throw new DokuSnapConfigurationError(
      "The DOKU SNAP private key could not sign the request.",
    );
  }

  const response = await fetch(`${config.baseUrl}${DOKU_B2B_TOKEN_TARGET}`, {
    method: "POST",
    headers: {
      "X-CLIENT-KEY": config.clientId,
      "X-TIMESTAMP": requestTimestamp,
      "X-SIGNATURE": signature,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grantType: "client_credentials" }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as DokuTokenResponse;
  const responseCode = String(payload.responseCode || "").trim();
  const accessToken = String(payload.accessToken || "").trim();

  if (!response.ok || responseCode !== "2007300" || !accessToken) {
    throw new DokuSnapQrisError(
      `DOKU B2B token was rejected: ${safeProviderMessage(payload.responseMessage, responseCode || "provider error")}`,
      response.status || 502,
      responseCode || null,
    );
  }

  const expiresIn = Number(payload.expiresIn || 900);
  tokenCache = {
    cacheKey,
    accessToken,
    expiresAt:
      Date.now() +
      Math.max(120, Number.isFinite(expiresIn) ? expiresIn : 900) * 1000,
  };
  return accessToken;
}

export async function renderQrisDataUrl(qrContent: string) {
  return QRCode.toDataURL(qrContent, {
    type: "image/png",
    width: 640,
    margin: 4,
    errorCorrectionLevel: "M",
    color: {
      dark: "#0F172A",
      light: "#FFFFFF",
    },
  });
}

export function isTrustedGeneratedQrisDataUrl(value: string) {
  return (
    value.length >= 500 &&
    value.length <= 150_000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}

export async function createDokuSnapQrisPayment(input: {
  invoiceNumber: string;
  amount: number;
  dueMinutes: number;
}) {
  const config = getDokuSnapQrisConfig();
  const accessToken = await requestB2BToken(config);
  const requestTimestamp = toDokuSnapTimestamp();
  const externalId = numericExternalId();
  const validityPeriod = toDokuSnapTimestamp(
    new Date(Date.now() + Math.max(5, input.dueMinutes) * 60_000),
  );
  const body = {
    partnerReferenceNo: input.invoiceNumber,
    amount: {
      value: input.amount.toFixed(2),
      currency: "IDR",
    },
    merchantId: config.merchantId,
    terminalId: config.terminalId,
    validityPeriod,
    additionalInfo: {
      postalCode: config.postalCode,
      feeType: config.feeType,
    },
  };
  const rawBody = JSON.stringify(body);
  const signature = createDokuSnapSignature({
    httpMethod: "POST",
    requestTarget: DOKU_QRIS_GENERATE_TARGET,
    accessToken,
    requestTimestamp,
    rawBody,
    secretKey: config.secretKey,
  });

  const response = await fetch(
    `${config.baseUrl}${DOKU_QRIS_GENERATE_TARGET}`,
    {
      method: "POST",
      headers: {
        "X-PARTNER-ID": config.clientId,
        "X-EXTERNAL-ID": externalId,
        "X-TIMESTAMP": requestTimestamp,
        "X-SIGNATURE": signature,
        Authorization: `Bearer ${accessToken}`,
        "CHANNEL-ID": "H2H",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as DokuQrisResponse;
  const responseCode = String(payload.responseCode || "").trim();

  if (!response.ok || responseCode !== "2004700") {
    throw new DokuSnapQrisError(
      `DOKU QRIS was rejected: ${safeProviderMessage(payload.responseMessage, responseCode || "provider error")}`,
      response.status || 502,
      responseCode || null,
    );
  }

  const partnerReferenceNo = String(payload.partnerReferenceNo || "").trim();
  const referenceNo = String(payload.referenceNo || "").trim();
  const qrContent = String(payload.qrContent || "").trim();
  const providerValidity = String(
    payload.additionalInfo?.validityPeriod || validityPeriod,
  ).trim();
  const expiresAt = Date.parse(providerValidity);

  if (partnerReferenceNo !== input.invoiceNumber) {
    throw new DokuSnapQrisError(
      "DOKU QRIS returned a mismatched invoice reference.",
      502,
      responseCode,
    );
  }
  if (
    qrContent.length < 80 ||
    qrContent.length > 1024 ||
    !/^[\x20-\x7E]+$/.test(qrContent)
  ) {
    throw new DokuSnapQrisError(
      "DOKU QRIS returned invalid QR content.",
      502,
      responseCode,
    );
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 30_000) {
    throw new DokuSnapQrisError(
      "DOKU QRIS returned an invalid expiry time.",
      502,
      responseCode,
    );
  }

  const qrImageUrl = await renderQrisDataUrl(qrContent);
  if (!isTrustedGeneratedQrisDataUrl(qrImageUrl)) {
    throw new DokuSnapQrisError(
      "The QRIS image could not be rendered safely.",
      502,
      responseCode,
    );
  }

  return {
    invoiceNumber: partnerReferenceNo,
    referenceNo: referenceNo || partnerReferenceNo,
    qrContent,
    qrImageUrl,
    expiresAt: new Date(expiresAt).toISOString(),
    terminalId: String(payload.terminalId || config.terminalId).trim(),
    providerName: "DOKU SNAP QRIS",
  };
}
