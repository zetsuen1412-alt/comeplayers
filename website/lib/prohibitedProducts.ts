export type ProductPolicyDecision = "allow" | "review" | "block";

export type ProductPolicyRule = {
  key: string;
  pattern: string;
  matchType?: "keyword" | "regex";
  decision: Exclude<ProductPolicyDecision, "allow">;
  severity: "medium" | "high" | "critical";
  reason: string;
};

export type ProductPolicyResult = {
  decision: ProductPolicyDecision;
  reasons: string[];
  matchedRules: string[];
  severity: "info" | "medium" | "high" | "critical";
};

export const DEFAULT_PRODUCT_POLICY_RULES: ProductPolicyRule[] = [
  {
    key: "stolen_or_hacked_property",
    pattern: "stolen|hacked account|cracked account|compromised account|stolen account",
    matchType: "regex",
    decision: "block",
    severity: "critical",
    reason: "Stolen, hacked, cracked, or compromised digital property is prohibited.",
  },
  {
    key: "malware_or_phishing",
    pattern: "malware|ransomware|keylogger|stealer|phishing kit|credential harvester",
    matchType: "regex",
    decision: "block",
    severity: "critical",
    reason: "Malware, phishing tools, and credential theft products are prohibited.",
  },
  {
    key: "payment_fraud",
    pattern: "carding|cvv|fullz|stolen card|cashout service|money mule",
    matchType: "regex",
    decision: "block",
    severity: "critical",
    reason: "Payment fraud, stolen financial data, and cash-out services are prohibited.",
  },
  {
    key: "game_cheats",
    pattern: "aimbot|wallhack|esp cheat|undetected cheat|memory hack|dupe exploit",
    matchType: "regex",
    decision: "block",
    severity: "high",
    reason: "Cheats, exploits, and unauthorized game manipulation tools are prohibited.",
  },
  {
    key: "automated_bots",
    pattern: "botting service|farming bot|macro bot|autofarm bot",
    matchType: "regex",
    decision: "review",
    severity: "high",
    reason: "Automation or botting services require compliance review.",
  },
  {
    key: "region_or_identity_bypass",
    pattern: "kyc bypass|region bypass|ban bypass|identity bypass",
    matchType: "regex",
    decision: "block",
    severity: "high",
    reason: "Identity, region, or enforcement bypass services are prohibited.",
  },
  {
    key: "boosting_service",
    pattern: "rank boost|boosting service|elo boost|piloted boosting",
    matchType: "regex",
    decision: "review",
    severity: "medium",
    reason: "Boosting services require manual policy and game-rule review.",
  },
];

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9@.+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function severityRank(value: ProductPolicyResult["severity"]) {
  return { info: 0, medium: 1, high: 2, critical: 3 }[value];
}

function matchesRule(text: string, rule: ProductPolicyRule) {
  if (rule.matchType === "keyword") {
    return text.includes(normalize(rule.pattern));
  }

  try {
    return new RegExp(rule.pattern, "i").test(text);
  } catch {
    return false;
  }
}

export function evaluateProductPolicy(input: {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  gameName?: unknown;
  tags?: unknown[] | unknown;
  rules?: ProductPolicyRule[];
}): ProductPolicyResult {
  const tags = Array.isArray(input.tags) ? input.tags.join(" ") : input.tags;
  const text = normalize([
    input.title,
    input.description,
    input.category,
    input.gameName,
    tags,
  ].join(" "));
  const matched = (input.rules || DEFAULT_PRODUCT_POLICY_RULES).filter((rule) =>
    matchesRule(text, rule)
  );

  const decision: ProductPolicyDecision = matched.some((rule) => rule.decision === "block")
    ? "block"
    : matched.some((rule) => rule.decision === "review")
      ? "review"
      : "allow";
  const severity = matched.reduce<ProductPolicyResult["severity"]>(
    (highest, rule) =>
      severityRank(rule.severity) > severityRank(highest) ? rule.severity : highest,
    "info"
  );

  return {
    decision,
    reasons: Array.from(new Set(matched.map((rule) => rule.reason))),
    matchedRules: matched.map((rule) => rule.key),
    severity,
  };
}
