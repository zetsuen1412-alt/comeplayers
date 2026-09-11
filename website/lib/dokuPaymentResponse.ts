type UnknownRecord = Record<string, unknown>;

const TRUSTED_DOKU_PAYMENT_HOSTS = new Set([
  "doku.com",
  "my.dokuwallet.com",
]);

export function isTrustedDokuPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (TRUSTED_DOKU_PAYMENT_HOSTS.has(url.hostname) ||
        url.hostname.endsWith(".doku.com"))
    );
  } catch {
    return false;
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readString(record: UnknownRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function nestedRecord(record: UnknownRecord | null, key: string) {
  return asRecord(record?.[key]);
}

export function extractDokuWalletPaymentUrl(value: unknown) {
  const root = asRecord(value);
  const rootWallet = nestedRecord(root, "doku_wallet_payment_page");
  const data = nestedRecord(root, "data");
  const dataWallet = nestedRecord(data, "doku_wallet_payment_page");
  const response = nestedRecord(root, "response");
  const responseWallet = nestedRecord(response, "doku_wallet_payment_page");
  const responsePayment = nestedRecord(response, "payment");

  return (
    readString(rootWallet, "url") ||
    readString(dataWallet, "url") ||
    readString(responseWallet, "url") ||
    readString(responsePayment, "url")
  );
}

function safeKeys(record: UnknownRecord | null) {
  return record ? Object.keys(record).sort().slice(0, 20).join(",") : "none";
}

function safeCode(record: UnknownRecord | null) {
  const error = nestedRecord(record, "error");
  const candidates = [
    record?.response_code,
    record?.responseCode,
    record?.status,
    error?.code,
  ];
  const value = candidates.find(
    (candidate) =>
      typeof candidate === "string" || typeof candidate === "number",
  );

  return String(value ?? "none")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 64);
}

export function describeDokuWalletResponse(value: unknown) {
  const root = asRecord(value);
  const data = nestedRecord(root, "data");
  const response = nestedRecord(root, "response");

  return [
    `code=${safeCode(root)}`,
    `rootKeys=${safeKeys(root)}`,
    `dataKeys=${safeKeys(data)}`,
    `responseKeys=${safeKeys(response)}`,
  ].join(" ");
}
