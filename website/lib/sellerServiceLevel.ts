export type SellerPresence = "online" | "away" | "offline";
export type SellerServiceLevel =
  | "new"
  | "standard"
  | "reliable"
  | "trusted"
  | "elite";

export const SELLER_SLA_OPTIONS = [15, 30, 60, 120, 240, 480, 720, 1440] as const;

export function normalizePresence(value: unknown): SellerPresence {
  const normalized = String(value || "offline").toLowerCase();
  if (normalized === "online" || normalized === "away") return normalized;
  return "offline";
}

export function effectivePresence(
  mode: unknown,
  lastSeenAt: string | null | undefined,
  now = Date.now(),
  activeWindowMinutes = 5
): SellerPresence {
  const normalizedMode = normalizePresence(mode);
  if (normalizedMode === "offline" || !lastSeenAt) return "offline";

  const lastSeen = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeen)) return "offline";

  const activeWindowMs = Math.max(1, activeWindowMinutes) * 60 * 1000;
  return now - lastSeen <= activeWindowMs ? normalizedMode : "offline";
}

export function normalizeServiceLevel(value: unknown): SellerServiceLevel {
  const normalized = String(value || "new").toLowerCase();
  if (
    normalized === "standard" ||
    normalized === "reliable" ||
    normalized === "trusted" ||
    normalized === "elite"
  ) {
    return normalized;
  }
  return "new";
}

export function serviceLevelLabel(value: unknown) {
  const level = normalizeServiceLevel(value);
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function serviceLevelDescription(value: unknown) {
  switch (normalizeServiceLevel(value)) {
    case "elite":
      return "Top delivery performance with a strong on-time track record.";
    case "trusted":
      return "Consistently fast delivery and high on-time performance.";
    case "reliable":
      return "Established seller with dependable delivery performance.";
    case "standard":
      return "Active seller building a longer delivery track record.";
    default:
      return "New seller service level. Performance improves after completed deliveries.";
  }
}

export function serviceLevelClass(value: unknown) {
  switch (normalizeServiceLevel(value)) {
    case "elite":
      return "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200";
    case "trusted":
      return "border-cyan-400/40 bg-cyan-400/10 text-cyan-200";
    case "reliable":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
    case "standard":
      return "border-blue-400/40 bg-blue-400/10 text-blue-200";
    default:
      return "border-slate-400/30 bg-slate-400/10 text-slate-200";
  }
}

export function formatDeliveryEta(minutesValue: unknown) {
  const minutes = Math.max(0, Number(minutesValue || 0));
  if (!Number.isFinite(minutes) || minutes <= 0) return "Not configured";
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = minutes / 60;
  if (hours < 24) {
    return Number.isInteger(hours)
      ? `${hours} hour${hours === 1 ? "" : "s"}`
      : `${hours.toFixed(1)} hours`;
  }

  const days = hours / 24;
  return Number.isInteger(days)
    ? `${days} day${days === 1 ? "" : "s"}`
    : `${days.toFixed(1)} days`;
}

export function deliverySlaState(input: {
  dueAt?: string | null;
  deliveredAt?: string | null;
  storedStatus?: string | null;
  now?: number;
}) {
  const stored = String(input.storedStatus || "").toLowerCase();
  const dueAtMs = input.dueAt ? Date.parse(input.dueAt) : Number.NaN;
  const deliveredAtMs = input.deliveredAt
    ? Date.parse(input.deliveredAt)
    : Number.NaN;
  const now = input.now ?? Date.now();

  if (Number.isFinite(deliveredAtMs)) {
    const late = Number.isFinite(dueAtMs) && deliveredAtMs > dueAtMs;
    return {
      state: late ? "completed_late" : "completed_on_time",
      late,
      completed: true,
      remainingMs: Number.isFinite(dueAtMs) ? dueAtMs - deliveredAtMs : null,
    };
  }

  if (Number.isFinite(dueAtMs)) {
    const remainingMs = dueAtMs - now;
    const late = remainingMs < 0 || stored === "late";
    return {
      state: late ? "late" : "pending",
      late,
      completed: false,
      remainingMs,
    };
  }

  return {
    state: stored || "not_started",
    late: stored === "late" || stored === "completed_late",
    completed: stored.startsWith("completed"),
    remainingMs: null,
  };
}

export function formatRemainingDuration(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "No deadline";

  const absoluteMinutes = Math.max(1, Math.ceil(Math.abs(milliseconds) / 60000));
  const days = Math.floor(absoluteMinutes / 1440);
  const hours = Math.floor((absoluteMinutes % 1440) / 60);
  const minutes = absoluteMinutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}m`);

  return parts.join(" ") || "<1m";
}
