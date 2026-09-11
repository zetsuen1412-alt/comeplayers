export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎮", "✅", "😮", "😢", "🙏"] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export function normalizeChatReaction(value: unknown): ChatReactionEmoji | null {
  const emoji = String(value || "").trim();
  return CHAT_REACTION_EMOJIS.includes(emoji as ChatReactionEmoji)
    ? (emoji as ChatReactionEmoji)
    : null;
}

export function canModerateChatMessage(role?: string | null) {
  return ["admin", "group_owner", "group_moderator"].includes(
    String(role || "").toLowerCase()
  );
}
