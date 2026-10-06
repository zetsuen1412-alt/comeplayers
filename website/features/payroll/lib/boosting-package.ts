export type BoostingPackagePlan = {
  isDaily: boolean;
  totalDays: number;
  dailyHours?: number;
  multiplier: number;
  basis: "week" | "month" | "day" | "hours-multiplier" | "single";
};

function positiveInt(value: string | undefined, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads package names used in EVO GAMING / ComePlayers listings.
 *
 * Examples:
 * - 12 Hours Package ... X6        -> 12 jam/hari, 6 hari
 * - 1 Week Package (5 Hours/Day)   -> 5 jam/hari, 7 hari
 * - 1 Month Package (5 Hours/Day)  -> 5 jam/hari, 30 hari
 * - 1 Month Package ... X2         -> 60 hari
 */
export function parseBoostingPackagePlan(title: string | undefined | null): BoostingPackagePlan {
  const raw = String(title ?? "").trim();
  const clean = raw
    .replace(/[⭐☑️✅]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const multiplierMatch = clean.match(/\b[x×]\s*(\d+)\b/i);
  const multiplier = positiveInt(multiplierMatch?.[1], 1);

  const hoursPerDayMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|jam)\s*(?:\/|per\s+)(?:days?|hari)\b/i);
  const genericHoursMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|jam)\s*(?:package|paket)\b/i);
  const dailyHoursText = hoursPerDayMatch?.[1] ?? genericHoursMatch?.[1];
  const dailyHours = dailyHoursText ? Number(dailyHoursText.replace(",", ".")) : undefined;
  function durationMultiplier(duration: RegExpMatchArray) {
    const start = duration.index ?? 0, end = start + duration[0].length;
    // A leading x introduces the stated duration once. Only a separate xN,
    // such as "1 Week Package X2", multiplies that duration.
    const separate = [...clean.matchAll(/\b[x×]\s*(\d+)\b/gi)]
      .find(match => match.index !== undefined && (match.index < start || match.index >= end));
    return positiveInt(separate?.[1], 1);
  }

  const weekMatch = clean.match(/(?<![\p{L}\p{N}.,])(?:[x×]\s*)?(\d+)\s*(?:weeks?|minggu)\b/iu);
  if (weekMatch) {
    const weekMultiplier = durationMultiplier(weekMatch);
    return {
      isDaily: true,
      totalDays: Math.min(366, positiveInt(weekMatch[1]) * 7 * weekMultiplier),
      dailyHours,
      multiplier: weekMultiplier,
      basis: "week",
    };
  }

  const monthMatch = clean.match(/(?<![\p{L}\p{N}.,])(?:[x×]\s*)?(\d+)\s*(?:months?|bulan)\b/iu);
  if (monthMatch) {
    const monthMultiplier = durationMultiplier(monthMatch);
    return {
      isDaily: true,
      totalDays: Math.min(366, positiveInt(monthMatch[1]) * 30 * monthMultiplier),
      dailyHours,
      multiplier: monthMultiplier,
      basis: "month",
    };
  }

  const dayMatch = clean.match(/(?<![\p{L}\p{N}.,])(?:[x×]\s*)?(\d+)\s*(?:days?|hari)\b/iu);
  if (dayMatch) {
    const dayMultiplier = durationMultiplier(dayMatch);
    const totalDays = Math.min(366, positiveInt(dayMatch[1]) * dayMultiplier);
    return { isDaily: totalDays > 1, totalDays, dailyHours, multiplier: dayMultiplier, basis: "day" };
  }

  if (genericHoursMatch && multiplier > 1) {
    return {
      isDaily: true,
      totalDays: Math.min(366, multiplier),
      dailyHours,
      multiplier,
      basis: "hours-multiplier",
    };
  }

  return {
    isDaily: false,
    totalDays: 1,
    dailyHours,
    multiplier,
    basis: "single",
  };
}

/**
 * Extracts explicit D markers from BOOSTER text.
 * D2-D4 becomes [2,3,4], while "TATANG D24 D25" becomes [24,25].
 */
export function parseBoosterDayNumbers(value: string | undefined | null): number[] {
  let text = String(value ?? "").toUpperCase().replace(/[–—]/g, "-");
  const days: number[] = [];

  text = text.replace(/\bD\s*(\d+)\s*-\s*D?\s*(\d+)\b/g, (_match, fromText: string, toText: string) => {
    const from = Number(fromText), to = Number(toText);
    if (Number.isInteger(from) && Number.isInteger(to) && from > 0 && to > 0) {
      const start = Math.min(from, to), end = Math.max(from, to);
      for (let day = start; day <= end && day <= 366; day += 1) days.push(day);
    }
    return " ";
  });

  for (const match of text.matchAll(/\bD\s*(\d+)\b/g)) {
    const day = Number(match[1]);
    if (Number.isInteger(day) && day > 0 && day <= 366) days.push(day);
  }

  return [...new Set(days)].sort((a, b) => a - b);
}

export function boostingPlanLabel(plan: BoostingPackagePlan) {
  if (!plan.isDaily) return plan.dailyHours ? `${plan.dailyHours} jam · sekali selesai` : "Sekali selesai";
  const hours = plan.dailyHours ? `${plan.dailyHours} jam/hari · ` : "";
  return `${hours}${plan.totalDays} hari`;
}
