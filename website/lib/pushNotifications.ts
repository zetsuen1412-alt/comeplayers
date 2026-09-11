import type { SupabaseClient } from "@supabase/supabase-js";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

type PushTokenRow = {
  id: number;
  expo_push_token: string;
};

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

export function isExpoPushToken(value: unknown): value is string {
  return EXPO_PUSH_TOKEN_PATTERN.test(String(value || "").trim());
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function sendChatPushNotifications(input: {
  supabaseAdmin: SupabaseClient;
  receiverIds: string[];
  senderName: string;
  roomId: string;
  preview: string;
}) {
  const receiverIds = Array.from(
    new Set(input.receiverIds.map((value) => String(value || "").trim()).filter(Boolean))
  ).slice(0, 100);

  if (!receiverIds.length) return;

  const { data, error } = await input.supabaseAdmin
    .from("chat_push_tokens")
    .select("id,expo_push_token")
    .in("user_id", receiverIds)
    .eq("enabled", true);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      console.warn("Chat push tokens table is not available yet.");
      return;
    }
    console.error("Chat push token lookup failed:", error.message);
    return;
  }

  const rows = ((data || []) as PushTokenRow[]).filter((row) =>
    isExpoPushToken(row.expo_push_token)
  );
  if (!rows.length) return;

  for (const batch of chunks(rows, 100)) {
    const payload = batch.map((row) => ({
      to: row.expo_push_token,
      sound: "default",
      priority: "high",
      channelId: "messages",
      title: input.senderName || "ComePlayers",
      body: input.preview || "Sent you a message.",
      data: {
        type: "chat_message",
        roomId: input.roomId,
      },
    }));

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      const accessToken = String(process.env.EXPO_ACCESS_TOKEN || "").trim();
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        console.error("Expo push request failed:", response.status);
        continue;
      }

      const result = (await response.json()) as {
        data?: ExpoPushTicket | ExpoPushTicket[];
      };
      const tickets = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];

      const invalidTokenIds = tickets
        .map((ticket, index) =>
          ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
            ? batch[index]?.id
            : null
        )
        .filter((value): value is number => Number.isInteger(value));

      if (invalidTokenIds.length) {
        const { error: disableError } = await input.supabaseAdmin
          .from("chat_push_tokens")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .in("id", invalidTokenIds);
        if (disableError) {
          console.error("Invalid push token cleanup failed:", disableError.message);
        }
      }
    } catch (reason) {
      console.error(
        "Expo push delivery failed:",
        reason instanceof Error ? reason.message : reason
      );
    }
  }
}
