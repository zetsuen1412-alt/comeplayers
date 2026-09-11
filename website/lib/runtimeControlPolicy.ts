import { createHash } from "node:crypto";

export type CheckoutMode = "enabled" | "disabled" | "canary";

export type CheckoutControl = {
  key: "checkout";
  mode: CheckoutMode;
  percentage: number;
  message: string;
  allowlist: string[];
  source: "database" | "environment" | "default";
  updatedAt?: string | null;
};

export function checkoutBucket(userId: string, salt = "comeplayers-checkout-v20") {
  const digest = createHash("sha256")
    .update(`${salt}:${userId.trim().toLowerCase()}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

export function evaluateCheckoutAccess(
  control: CheckoutControl,
  userId: string
) {
  const normalizedUserId = userId.trim();
  const bucket = checkoutBucket(normalizedUserId);
  const allowlisted = control.allowlist.includes(normalizedUserId);

  if (control.mode === "disabled") {
    return {
      allowed: false,
      reason: "checkout_disabled" as const,
      bucket,
      allowlisted,
    };
  }

  if (
    control.mode === "canary" &&
    !allowlisted &&
    bucket >= control.percentage
  ) {
    return {
      allowed: false,
      reason: "checkout_canary_not_eligible" as const,
      bucket,
      allowlisted,
    };
  }

  return {
    allowed: true,
    reason: "allowed" as const,
    bucket,
    allowlisted,
  };
}
