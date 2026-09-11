export type ChatSafetyFlag =
  | "external_contact"
  | "external_link"
  | "payment_bypass"
  | "credential_sharing"
  | "suspicious_financial_request"
  | "spam";

export type ChatSafetyResult = {
  allowed: boolean;
  score: number;
  level: "low" | "medium" | "high" | "critical";
  flags: ChatSafetyFlag[];
  redactedText: string;
  userMessage: string | null;
};

const OWN_HOSTS = new Set([
  "comeplayers.com",
  "www.comeplayers.com",
  "localhost",
  "127.0.0.1",
]);

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>{}\[\]]+/gi;
const SOCIAL_RE = /\b(?:whats?app|wa\.me|telegram|t\.me|discord(?:\.gg)?|line\s?id|wechat|kik|signal|instagram|facebook|messenger)\b/gi;
const PAYMENT_BYPASS_RE = /\b(?:pay|bayar|payment|transfer|transaksi)\b.{0,36}\b(?:outside|off[-\s]?platform|di\s?luar|langsung|direct|private|pribadi)\b|\b(?:paypal\s*(?:friends|f&f)|gift\s*card|crypto|bitcoin|usdt|ethereum|binance|ovo|dana|gopay|shopeepay)\b/gi;
const CREDENTIAL_RE = /\b(?:password|passcode|otp|one[-\s]?time\s?password|recovery\s?code|backup\s?code|seed\s?phrase|private\s?key)\s*[:=]/gi;
const FINANCIAL_REQUEST_RE = /\b(?:send|kirim|transfer)\b.{0,24}\b(?:money|uang|funds?|saldo|deposit)\b/gi;
const REPEATED_RE = /(.)\1{14,}/g;

function addFlag(flags: Set<ChatSafetyFlag>, flag: ChatSafetyFlag) {
  flags.add(flag);
}

function linkIsExternal(value: string) {
  try {
    const normalized = value.startsWith("www.") ? `https://${value}` : value;
    const url = new URL(normalized);
    return !OWN_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return true;
  }
}

function redact(value: string) {
  let output = value;
  output = output.replace(EMAIL_RE, "[email removed]");
  output = output.replace(PHONE_RE, "[phone number removed]");
  output = output.replace(URL_RE, (match) =>
    linkIsExternal(match) ? "[external link removed]" : match
  );
  output = output.replace(CREDENTIAL_RE, "[credential removed]:");
  return output;
}

export function analyzeChatMessage(rawText: string): ChatSafetyResult {
  const text = String(rawText || "").trim();
  const flags = new Set<ChatSafetyFlag>();
  let score = 0;

  if (EMAIL_RE.test(text) || PHONE_RE.test(text) || SOCIAL_RE.test(text)) {
    addFlag(flags, "external_contact");
    score += 55;
  }

  EMAIL_RE.lastIndex = 0;
  PHONE_RE.lastIndex = 0;
  SOCIAL_RE.lastIndex = 0;

  const links = text.match(URL_RE) || [];
  if (links.some(linkIsExternal)) {
    addFlag(flags, "external_link");
    score += 45;
  }
  URL_RE.lastIndex = 0;

  if (PAYMENT_BYPASS_RE.test(text)) {
    addFlag(flags, "payment_bypass");
    score += 70;
  }
  PAYMENT_BYPASS_RE.lastIndex = 0;

  if (CREDENTIAL_RE.test(text)) {
    addFlag(flags, "credential_sharing");
    score += 70;
  }
  CREDENTIAL_RE.lastIndex = 0;

  if (FINANCIAL_REQUEST_RE.test(text)) {
    addFlag(flags, "suspicious_financial_request");
    score += 35;
  }
  FINANCIAL_REQUEST_RE.lastIndex = 0;

  if (REPEATED_RE.test(text) || text.length > 1800) {
    addFlag(flags, "spam");
    score += 20;
  }
  REPEATED_RE.lastIndex = 0;

  score = Math.min(100, score);
  const level =
    score >= 90 ? "critical" : score >= 70 ? "high" : score >= 35 ? "medium" : "low";

  const blockingFlags: ChatSafetyFlag[] = [
    "external_contact",
    "external_link",
    "payment_bypass",
    "credential_sharing",
  ];
  const allowed = !Array.from(flags).some((flag) => blockingFlags.includes(flag));

  let userMessage: string | null = null;
  if (!allowed) {
    if (flags.has("credential_sharing")) {
      userMessage =
        "Do not send passwords, OTPs, recovery codes, or account credentials in chat. Sellers must use the encrypted delivery section on the order page.";
    } else if (flags.has("payment_bypass")) {
      userMessage =
        "Payments and transactions must stay inside ComePlayers so escrow protection remains active.";
    } else {
      userMessage =
        "External contact details and off-platform links are blocked to protect both buyers and sellers.";
    }
  }

  return {
    allowed,
    score,
    level,
    flags: Array.from(flags),
    redactedText: redact(text),
    userMessage,
  };
}

export function chatMessagePreview(value: string | null | undefined) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, 140);
}
