import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const PIN_PATTERN = /^\d{6}$/;
const BLOCKED_PINS = new Set([
  "000000",
  "111111",
  "222222",
  "333333",
  "444444",
  "555555",
  "666666",
  "777777",
  "888888",
  "999999",
  "123456",
  "654321",
  "121212",
]);

function pinPepper() {
  const value = process.env.WITHDRAWAL_PIN_PEPPER || "";

  if (value.length < 32) {
    throw new Error(
      "WITHDRAWAL_PIN_PEPPER must be configured with at least 32 characters."
    );
  }

  return value;
}

export function validateWithdrawalPin(pin: string) {
  if (!PIN_PATTERN.test(pin)) {
    throw new Error("Withdrawal PIN must contain exactly 6 digits.");
  }

  if (BLOCKED_PINS.has(pin)) {
    throw new Error("Choose a less predictable withdrawal PIN.");
  }
}

export function hashWithdrawalPin(userId: string, pin: string, salt?: string) {
  validateWithdrawalPin(pin);
  const resolvedSalt = salt || randomBytes(16).toString("base64");
  const input = `${userId}:${pin}:${pinPepper()}`;
  const hash = scryptSync(input, resolvedSalt, 64).toString("base64");

  return {
    hash,
    salt: resolvedSalt,
  };
}

export function verifyWithdrawalPin(input: {
  userId: string;
  pin: string;
  salt: string;
  expectedHash: string;
}) {
  if (!PIN_PATTERN.test(input.pin)) return false;

  const actual = scryptSync(
    `${input.userId}:${input.pin}:${pinPepper()}`,
    input.salt,
    64
  );
  const expected = Buffer.from(input.expectedHash, "base64");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
