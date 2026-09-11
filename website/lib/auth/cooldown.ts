export function getCooldownSeconds(availableAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}

export function isRateLimitMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("security purposes") ||
    normalized.includes("request limit")
  );
}

export function createCooldownDeadline(seconds: number, now = Date.now()) {
  return now + Math.max(0, seconds) * 1000;
}
