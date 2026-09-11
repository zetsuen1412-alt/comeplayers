import { createHash } from "node:crypto";
import { consumeRedisRateLimit, isUpstashRedisConfigured } from "./upstashRedis";
import { inputError } from "./accountApi";

export function phoneOtpChannels(): ("sms" | "whatsapp")[] {
  // Explicitly opt in only after an OTP provider and its budget are configured.
  if (process.env.PHONE_OTP_ENABLED !== "true") return [];
  const configured = new Set((process.env.PHONE_OTP_CHANNELS || "whatsapp").split(",").map(s => s.trim()));
  return (["sms", "whatsapp"] as const).filter(channel => configured.has(channel));
}
export async function limitPhoneOtp(userId: string, phone: string, action: "send" | "verify") {
  // Supabase and the configured provider must also limit direct Auth requests.
  if (!isUpstashRedisConfigured()) return;
  const phoneKey = createHash("sha256").update(phone).digest("hex");
  const limits = action === "send" ? [
    { scope: "phone-otp-user-minute", identifier: userId, limit: 1, windowSeconds: 60 },
    { scope: "phone-otp-user-hour", identifier: userId, limit: 5, windowSeconds: 3600 },
    { scope: "phone-otp-number-hour", identifier: phoneKey, limit: 5, windowSeconds: 3600 },
  ] : [{ scope: "phone-otp-verify", identifier: userId, limit: 10, windowSeconds: 600 }];
  for (const limit of limits) {
    const result = await consumeRedisRateLimit(limit);
    if (!result.allowed) throw inputError("Too many verification attempts. Please wait before trying again.", 429);
  }
}
