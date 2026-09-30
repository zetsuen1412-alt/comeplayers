import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationRecipients, sendChatPushNotifications } from "@/lib/pushNotifications";
import { isUpstashRedisConfigured, redisCommand } from "@/lib/upstashRedis";

export const CHAT_PUSH_READY_QUEUE = "cp:v32:worker:chat-push:ready";

export type ChatPushJob = {
  version: 1;
  id: string;
  kind: "chat_push";
  createdAt: string;
  attempts: number;
  maxAttempts: number;
  payload: {
    receiverIds: string[];
    senderName: string;
    roomId: string;
    preview: string;
    channelId?: string;
  };
};

export function isBackgroundPushWorkerEnabled() {
  return /^(1|true|yes|on)$/i.test(
    String(process.env.BACKGROUND_WORKER_PUSH_ENABLED || "").trim(),
  );
}

export function createChatPushJob(input: {
  receiverIds: string[];
  senderName: string;
  roomId: string;
  preview: string;
  channelId?: string;
}): ChatPushJob {
  return {
    version: 1,
    id: randomUUID(),
    kind: "chat_push",
    createdAt: new Date().toISOString(),
    attempts: 0,
    maxAttempts: 5,
    payload: {
      receiverIds: Array.from(
        new Set(input.receiverIds.map((value) => String(value || "").trim()).filter(Boolean)),
      ).slice(0, 100),
      senderName: String(input.senderName || "ComePlayers").slice(0, 120),
      roomId: String(input.roomId || "").slice(0, 120),
      preview: String(input.preview || "Sent you a message.").slice(0, 500),
      channelId: input.channelId,
    },
  };
}

export async function dispatchChatPushNotifications(input: {
  supabaseAdmin: SupabaseClient;
  receiverIds: string[];
  senderName: string;
  roomId: string;
  preview: string;
  channelId?: string;
}) {
  const deliverDirectly = async (reason: string) => {
    await sendChatPushNotifications(input);
    return { queued: false, deliveredDirectly: true, reason } as const;
  };

  if (!input.receiverIds.length) {
    return { queued: false, deliveredDirectly: false, reason: "no-receivers" } as const;
  }

  if (!isBackgroundPushWorkerEnabled()) {
    return deliverDirectly("worker-disabled");
  }

  if (!isUpstashRedisConfigured()) {
    return deliverDirectly("redis-unavailable");
  }

  try {
    const receiverIds = await notificationRecipients({ ...input, kind: "message" });
    if (!receiverIds.length) return { queued: false, deliveredDirectly: false, reason: "muted" } as const;
    const job = createChatPushJob({ ...input, receiverIds });
    await redisCommand<number>([
      "LPUSH",
      CHAT_PUSH_READY_QUEUE,
      JSON.stringify(job),
    ]);
    // Prevent an accidental unbounded queue if the worker is disabled for a long time.
    await redisCommand<number>(["LTRIM", CHAT_PUSH_READY_QUEUE, 0, 9999]);
    return { queued: true, deliveredDirectly: false, jobId: job.id } as const;
  } catch (error) {
    console.warn(
      "Background push enqueue failed; delivering directly.",
      error instanceof Error ? error.message : error,
    );
    return deliverDirectly("enqueue-failed");
  }
}
