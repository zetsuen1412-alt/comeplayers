/** Discord message metadata is the only input. Never inspect/store buyer chat content. */
export type DiscordMessageMeta = {
  messageId: string; guildId: string; channelId: string;
  authorId: string; username: string; globalName?: string;
  bot: boolean; webhookId?: string;
};
export type DiscordBuyerBinding = {
  order_ref: string; guild_id: string; channel_id: string;
  buyer_user_id: string; enabled: boolean;
};
const id = /^\d{15,22}$/;
export function validDiscordId(value: unknown): value is string {
  return typeof value === "string" && id.test(value);
}
export function parseIdAllowlist(raw = "") {
  return new Set(raw.split(",").map(value => value.trim()).filter(validDiscordId));
}
/** Only internal-looking names; do not block unrelated names like 'revolution'. */
export function internalEvoName(name: string) {
  return /(?:^|[^a-z0-9])evo(?:[\W_]|[a-z0-9]*)/i.test(name.trim());
}
export function parseMessageMeta(payload: unknown): DiscordMessageMeta | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  for (const prop of ["messageId", "guildId", "channelId", "authorId"])
    if (!validDiscordId(p[prop])) return null;
  if (typeof p.username !== "string" || p.username.length > 100
      || (p.globalName != null && (typeof p.globalName !== "string" || p.globalName.length > 100))
      || typeof p.bot !== "boolean"
      || (p.webhookId != null && !validDiscordId(p.webhookId))) return null;
  return {
    messageId:p.messageId as string, guildId:p.guildId as string, channelId:p.channelId as string,
    authorId:p.authorId as string, username:p.username, globalName:typeof p.globalName==="string"?p.globalName:undefined,
    bot:p.bot, webhookId:typeof p.webhookId==="string"?p.webhookId:undefined,
  };
}
export function matchesBuyerMessage(event: DiscordMessageMeta, binding: DiscordBuyerBinding, blockedIds: Set<string>) {
  return binding.enabled
    && binding.guild_id === event.guildId
    && binding.channel_id === event.channelId
    && binding.buyer_user_id === event.authorId
    && !event.bot && !event.webhookId
    && !blockedIds.has(event.authorId)
    && !internalEvoName(event.username)
    && !internalEvoName(event.globalName ?? "");
}
export function discordMessageUrl(event: Pick<DiscordMessageMeta, "guildId"|"channelId"|"messageId">) {
  if (![event.guildId,event.channelId,event.messageId].every(validDiscordId))
    throw new Error("Invalid Discord message identifier");
  return `https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId}`;
}
