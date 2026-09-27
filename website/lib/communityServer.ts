import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser, requireChatRoomAccess } from "@/lib/chatServer";

export const COMMUNITY_PERMISSION_NAMES = [
  "view_channels",
  "view_private_channels",
  "send_messages",
  "connect_voice",
  "publish_video",
  "share_screen",
  "moderate_voice",
  "manage_channels",
  "manage_roles",
  "manage_members",
  "manage_messages",
  "create_invite",
  "start_stream",
] as const;

export type CommunityPermission = (typeof COMMUNITY_PERMISSION_NAMES)[number] | "*";

export type CommunityRow = {
  id: string;
  room_id: string;
  owner_id: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CommunityAccess = {
  community: CommunityRow;
  memberRole: string;
  roleIds: string[];
  permissions: Set<string>;
  isOwner: boolean;
  isAdmin: boolean;
};

const DEFAULT_ROLE_DEFINITIONS = [
  {
    name: "Owner",
    color: "#facc15",
    position: 100,
    is_default: false,
    permissions: ["*"],
  },
  {
    name: "Admin",
    color: "#ef4444",
    position: 80,
    is_default: false,
    permissions: [
      "view_channels",
      "view_private_channels",
      "send_messages",
      "connect_voice",
      "publish_video",
      "share_screen",
      "moderate_voice",
      "manage_channels",
      "manage_roles",
      "manage_members",
      "manage_messages",
      "create_invite",
      "start_stream",
    ],
  },
  {
    name: "Moderator",
    color: "#22d3ee",
    position: 60,
    is_default: false,
    permissions: [
      "view_channels",
      "send_messages",
      "connect_voice",
      "publish_video",
      "share_screen",
      "moderate_voice",
      "manage_members",
      "manage_messages",
      "create_invite",
      "start_stream",
    ],
  },
  {
    name: "Member",
    color: "#94a3b8",
    position: 10,
    is_default: true,
    permissions: [
      "view_channels",
      "send_messages",
      "connect_voice",
      "publish_video",
      "share_screen",
      "start_stream",
    ],
  },
] as const;

const DEFAULT_CATEGORY_DEFINITIONS = [
  { name: "INFORMATION", position: 10 },
  { name: "TEXT CHANNELS", position: 20 },
  { name: "VOICE CHANNELS", position: 30 },
] as const;

const DEFAULT_CHANNEL_DEFINITIONS = [
  {
    category: "INFORMATION",
    name: "announcements",
    channel_type: "announcement",
    topic: "Official community updates.",
    position: 10,
    is_read_only: true,
    is_default: false,
  },
  {
    category: "TEXT CHANNELS",
    name: "general",
    channel_type: "text",
    topic: "General discussion for community members.",
    position: 10,
    is_read_only: false,
    is_default: true,
  },
  {
    category: "TEXT CHANNELS",
    name: "marketplace",
    channel_type: "text",
    topic: "Discuss games, products, and marketplace topics.",
    position: 20,
    is_read_only: false,
    is_default: false,
  },
  {
    category: "VOICE CHANNELS",
    name: "Lounge",
    channel_type: "voice",
    topic: "Voice channel prepared for LiveKit.",
    position: 10,
    is_read_only: false,
    is_default: false,
  },
] as const;

function schemaMissing(error: { message?: string } | null | undefined) {
  return Boolean(error && /does not exist|schema cache/i.test(String(error.message || "")));
}

function statusError(message: string, status: number) {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
}

function cleanChannelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function normalizeCommunityChannelName(value: string) {
  return cleanChannelName(value);
}

export function hasCommunityPermission(
  access: CommunityAccess,
  permission: CommunityPermission,
) {
  return access.isAdmin || access.isOwner || access.permissions.has("*") || access.permissions.has(permission);
}

export function assertCommunityPermissionsGrantable(access: CommunityAccess, permissions: CommunityPermission[]) {
  if (permissions.some((permission) => !hasCommunityPermission(access, permission))) {
    throw statusError("You can only grant permissions that you already have.", 403);
  }
}

/** Update the room timestamp to invalidate existing RLS-protected subscriptions.
 * Community metadata tables need not be exposed to Realtime. */
export async function notifyCommunityChanged(supabaseAdmin: SupabaseClient, roomId: string) {
  try {
    const { error } = await supabaseAdmin.from("chat_rooms")
      .update({ updated_at: new Date().toISOString() }).eq("id", roomId);
    if (error) console.error("Community refresh signal failed; clients will reconcile on their next refresh.");
  } catch {
    // The original mutation succeeded. Never encourage a duplicate write just
    // because the optional refresh signal could not be delivered.
    console.error("Community refresh signal failed; clients will reconcile on their next refresh.");
  }
}

export async function bootstrapCommunityForRoom(input: {
  supabaseAdmin: SupabaseClient;
  roomId: string;
  actorId?: string;
  newMemberId?: string;
}) {
  const { supabaseAdmin, roomId } = input;
  // Bootstrapping writes through the service role, including role assignments.
  // Authenticate the actor's membership before any of those writes can happen.
  if (input.actorId) {
    await requireChatRoomAccess({ supabaseAdmin, roomId, userId: input.actorId, allowAdmin: false });
  }
  const { data: room, error: roomError } = await supabaseAdmin
    .from("chat_rooms")
    .select("id,room_type,title,description,created_by,buyer_id,seller_id,status,created_at,updated_at")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) throw new Error(roomError.message);
  if (!room || String(room.room_type || "").toLowerCase() !== "group") {
    throw statusError("Community can only be created for a group chat.", 400);
  }

  const ownerId = String(room.created_by || room.buyer_id || room.seller_id || input.actorId || "");
  if (!ownerId) throw statusError("Community owner is unavailable.", 400);

  const { data: existingCommunity, error: existingCommunityError } = await supabaseAdmin
    .from("chat_communities")
    .select("id,room_id,owner_id,name,description,icon_url,status,created_at,updated_at")
    .eq("room_id", roomId)
    .maybeSingle();
  if (existingCommunityError) throw new Error(existingCommunityError.message);
  const { data: community, error: communityError } = existingCommunity
    ? { data: existingCommunity, error: null }
    : await supabaseAdmin
    .from("chat_communities")
    .upsert(
      {
        room_id: roomId,
        owner_id: ownerId,
        name: String(room.title || "ComePlayers Community").trim().slice(0, 80),
        description: String(room.description || "").trim().slice(0, 500) || null,
        status: String(room.status || "active").toLowerCase() === "locked" ? "suspended" : "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" },
    )
    .select("id,room_id,owner_id,name,description,icon_url,status,created_at,updated_at")
    .single();

  if (communityError) throw new Error(communityError.message);
  const communityId = String(community.id);

  const { data: existingCategories, error: categoryReadError } = await supabaseAdmin
    .from("chat_channel_categories")
    .select("id,name")
    .eq("community_id", communityId);
  if (categoryReadError) throw new Error(categoryReadError.message);

  const existingCategoryNames = new Set(
    (existingCategories || []).map((category) => String(category.name || "").toLowerCase()),
  );
  const missingCategories = DEFAULT_CATEGORY_DEFINITIONS.filter(
    (category) => !existingCategoryNames.has(category.name.toLowerCase()),
  ).map((category) => ({
    community_id: communityId,
    name: category.name,
    position: category.position,
    created_by: ownerId,
  }));
  if (missingCategories.length) {
    const { error } = await supabaseAdmin.from("chat_channel_categories").insert(missingCategories);
    if (error) throw new Error(error.message);
  }

  const { data: categories, error: categoriesError } = await supabaseAdmin
    .from("chat_channel_categories")
    .select("id,name,position")
    .eq("community_id", communityId);
  if (categoriesError) throw new Error(categoriesError.message);
  const categoryMap = new Map(
    (categories || []).map((category) => [String(category.name || "").toLowerCase(), String(category.id)]),
  );

  const { data: existingChannels, error: channelReadError } = await supabaseAdmin
    .from("chat_channels")
    .select("id,name,is_default")
    .eq("community_id", communityId);
  if (channelReadError) throw new Error(channelReadError.message);
  const existingChannelNames = new Set(
    (existingChannels || []).map((channel) => String(channel.name || "").toLowerCase()),
  );
  const missingChannels = DEFAULT_CHANNEL_DEFINITIONS.filter(
    (channel) => !existingChannelNames.has(channel.name.toLowerCase()),
  ).map((channel) => ({
    community_id: communityId,
    category_id: categoryMap.get(channel.category.toLowerCase()) || null,
    name: channel.name,
    channel_type: channel.channel_type,
    topic: channel.topic,
    position: channel.position,
    is_read_only: channel.is_read_only,
    is_default: channel.is_default && !(existingChannels || []).some((row) => row.is_default),
    created_by: ownerId,
  }));
  if (missingChannels.length) {
    const { error } = await supabaseAdmin.from("chat_channels").insert(missingChannels);
    if (error) throw new Error(error.message);
  }

  const { data: existingRoles, error: roleReadError } = await supabaseAdmin
    .from("chat_community_roles")
    .select("id,name")
    .eq("community_id", communityId);
  if (roleReadError) throw new Error(roleReadError.message);
  const existingRoleNames = new Set(
    (existingRoles || []).map((role) => String(role.name || "").toLowerCase()),
  );
  const missingRoles = DEFAULT_ROLE_DEFINITIONS.filter(
    (role) => !existingRoleNames.has(role.name.toLowerCase()),
  ).map((role) => ({
    community_id: communityId,
    name: role.name,
    color: role.color,
    position: role.position,
    is_default: role.is_default,
    is_managed: true,
    permissions: [...role.permissions],
  }));
  if (missingRoles.length) {
    const { error } = await supabaseAdmin.from("chat_community_roles").insert(missingRoles);
    if (error) throw new Error(error.message);
  }

  const [{ data: roles, error: rolesError }, { data: members, error: membersError }] = await Promise.all([
    supabaseAdmin
      .from("chat_community_roles")
      .select("id,name")
      .eq("community_id", communityId),
    supabaseAdmin
      .from("chat_room_members")
      .select("user_id,member_role,status,invited_by,joined_at")
      .eq("room_id", roomId)
      .eq("status", "active"),
  ]);
  if (rolesError) throw new Error(rolesError.message);
  if (membersError) throw new Error(membersError.message);
  const roleMap = new Map(
    (roles || []).map((role) => [String(role.name || "").toLowerCase(), String(role.id)]),
  );

  const assignments = (members || []).flatMap((member) => {
    // Joining a server must not recreate roles revoked from existing members.
    if (existingCommunity && String(member.user_id) !== input.newMemberId) return [];
    const legacyRole = String(member.member_role || "member").toLowerCase();
    const roleName =
      legacyRole === "owner"
        ? "owner"
        : legacyRole === "moderator"
          ? "moderator"
          : "member";
    const roleId = roleMap.get(roleName);
    if (!roleId) return [];
    return [
      {
        community_id: communityId,
        user_id: String(member.user_id),
        role_id: roleId,
        assigned_by: String(member.invited_by || ownerId),
        assigned_at: member.joined_at || new Date().toISOString(),
      },
    ];
  });
  if (assignments.length) {
    const { error } = await supabaseAdmin
      .from("chat_community_member_roles")
      .upsert(assignments, { onConflict: "community_id,user_id,role_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const { data: generalChannel, error: generalError } = await supabaseAdmin
    .from("chat_channels")
    .select("id")
    .eq("community_id", communityId)
    .eq("is_default", true)
    .maybeSingle();
  if (generalError) throw new Error(generalError.message);
  if (generalChannel?.id) {
    const { error } = await supabaseAdmin
      .from("chat_messages")
      .update({ channel_id: generalChannel.id })
      .eq("room_id", roomId)
      .is("channel_id", null);
    if (error) throw new Error(error.message);
  }

  await notifyCommunityChanged(supabaseAdmin, roomId);
  return community as CommunityRow;
}

export async function requireCommunityAccess(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  communityId?: string;
  roomId?: string;
  permission?: CommunityPermission;
}) {
  const { supabaseAdmin, userId } = input;
  let query = supabaseAdmin
    .from("chat_communities")
    .select("id,room_id,owner_id,name,description,icon_url,status,created_at,updated_at");
  query = input.communityId
    ? query.eq("id", input.communityId)
    : query.eq("room_id", String(input.roomId || ""));
  const { data: community, error: communityError } = await query.maybeSingle();
  if (communityError) throw new Error(communityError.message);
  if (!community) throw statusError("Community was not found.", 404);

  const [admin, memberResult, banResult, assignmentResult] = await Promise.all([
    isAdminUser(supabaseAdmin, userId),
    supabaseAdmin
      .from("chat_room_members")
      .select("member_role,status")
      .eq("room_id", community.room_id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("chat_community_bans")
      .select("user_id,expires_at")
      .eq("community_id", community.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("chat_community_member_roles")
      .select("role_id,chat_community_roles(id,name,permissions)")
      .eq("community_id", community.id)
      .eq("user_id", userId),
  ]);

  if (memberResult.error) throw new Error(memberResult.error.message);
  if (banResult.error) throw new Error(banResult.error.message);
  if (assignmentResult.error) {
    throw new Error(assignmentResult.error.message);
  }

  const isOwner = String(community.owner_id) === userId;
  const memberActive = String(memberResult.data?.status || "").toLowerCase() === "active";
  const banActive = Boolean(
    banResult.data &&
      (!banResult.data.expires_at || new Date(String(banResult.data.expires_at)).getTime() > Date.now()),
  );
  if ((!memberActive && !isOwner && !admin) || banActive) {
    throw statusError("You are not allowed to access this community.", 403);
  }

  const permissions = new Set<string>();
  const roleIds: string[] = [];
  for (const row of assignmentResult.data || []) {
    const roleValue = row.chat_community_roles as unknown;
    const role = Array.isArray(roleValue) ? roleValue[0] : roleValue;
    if (row.role_id) roleIds.push(String(row.role_id));
    if (role && typeof role === "object" && "permissions" in role) {
      for (const permission of ((role as { permissions?: string[] }).permissions || [])) {
        permissions.add(String(permission));
      }
    }
  }

  const legacyRole = String(memberResult.data?.member_role || "member").toLowerCase();
  // Empty or removed roles must stay empty. Legacy roles are assigned by the
  // migration/bootstrap, never inferred here after a manager revokes access.
  if (isOwner || admin) permissions.add("*");

  const access: CommunityAccess = {
    community: community as CommunityRow,
    memberRole: legacyRole,
    roleIds,
    permissions,
    isOwner,
    isAdmin: admin,
  };
  if (input.permission && !hasCommunityPermission(access, input.permission)) {
    throw statusError("You do not have permission to perform this community action.", 403);
  }
  return access;
}

export async function loadCommunityBundle(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  roomId: string;
}) {
  const { supabaseAdmin, userId, roomId } = input;
  let community: CommunityRow;
  const { data: existing, error } = await supabaseAdmin
    .from("chat_communities")
    .select("id,room_id,owner_id,name,description,icon_url,status,created_at,updated_at")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error && !schemaMissing(error)) throw new Error(error.message);
  if (!existing) community = await bootstrapCommunityForRoom({ supabaseAdmin, roomId, actorId: userId });
  else community = existing as CommunityRow;

  const access = await requireCommunityAccess({
    supabaseAdmin,
    userId,
    communityId: community.id,
  });
  const [categoriesResult, channelsResult, rolesResult, readStatesResult] = await Promise.all([
    supabaseAdmin
      .from("chat_channel_categories")
      .select("id,community_id,name,position,created_at,updated_at")
      .eq("community_id", community.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("chat_channels")
      .select("id,community_id,category_id,name,channel_type,topic,position,is_private,is_read_only,is_default,created_at,updated_at")
      .eq("community_id", community.id)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("chat_community_roles")
      .select("id,community_id,name,color,position,is_default,is_managed,permissions")
      .eq("community_id", community.id)
      .order("position", { ascending: false }),
    supabaseAdmin
      .from("chat_channel_read_states")
      .select("channel_id,last_read_message_id,last_read_at,notification_level,muted_until")
      .eq("user_id", userId),
  ]);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (channelsResult.error) throw new Error(channelsResult.error.message);
  if (rolesResult.error) throw new Error(rolesResult.error.message);
  if (readStatesResult.error) throw new Error(readStatesResult.error.message);
  const allChannels = channelsResult.data || [];
  const privateChannelIds = allChannels.filter((channel) => channel.is_private).map((channel) => String(channel.id));
  const { data: overrideRows, error: overrideError } = privateChannelIds.length
    ? await supabaseAdmin
        .from("chat_channel_permission_overrides")
        .select("channel_id,role_id,user_id,allow_permissions,deny_permissions")
        .in("channel_id", privateChannelIds)
    : { data: [], error: null };
  if (overrideError) throw new Error(overrideError.message);

  const visibleChannels = allChannels.filter((channel) => {
    if (!channel.is_private || hasCommunityPermission(access, "view_private_channels")) return true;
    const relevant = (overrideRows || []).filter(
      (overrideRow) =>
        String(overrideRow.channel_id) === String(channel.id) &&
        (String(overrideRow.user_id || "") === userId || access.roleIds.includes(String(overrideRow.role_id || ""))),
    );
    if (relevant.some((overrideRow) => (overrideRow.deny_permissions || []).includes("view_channel"))) {
      return false;
    }
    return relevant.some((overrideRow) => (overrideRow.allow_permissions || []).includes("view_channel"));
  });

  const visibleChannelIds = visibleChannels.map((channel) => String(channel.id));
  const readAtByChannel = new Map(
    (readStatesResult.data || []).map((state) => [
      String(state.channel_id),
      new Date(String(state.last_read_at || 0)).getTime(),
    ]),
  );
  const unreadByChannel = new Map<string, number>();
  if (visibleChannelIds.length) {
    const { data: unreadRows, error: unreadError } = await supabaseAdmin
      .from("chat_messages")
      .select("channel_id,sender_id,created_at")
      .in("channel_id", visibleChannelIds)
      .neq("sender_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(0, 4999);
    if (unreadError) throw new Error(unreadError.message);
    for (const message of unreadRows || []) {
      const channelId = String(message.channel_id || "");
      if (
        channelId &&
        new Date(String(message.created_at || 0)).getTime() >
          (readAtByChannel.get(channelId) || 0)
      ) {
        unreadByChannel.set(channelId, (unreadByChannel.get(channelId) || 0) + 1);
      }
    }
  }

  return {
    community,
    categories: categoriesResult.data || [],
    channels: visibleChannels.map((channel) => ({
      ...channel,
      unread_count: unreadByChannel.get(String(channel.id)) || 0,
    })),
    roles: rolesResult.data || [],
    readStates: (readStatesResult.data || []).filter((state) => visibleChannelIds.includes(String(state.channel_id))),
    currentUser: {
      userId,
      memberRole: access.memberRole,
      roleIds: access.roleIds,
      permissions: Array.from(access.permissions),
      isOwner: access.isOwner,
      isAdmin: access.isAdmin,
    },
  };
}

export async function requireCommunityChannel(input: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  roomId: string;
  channelId?: string | null;
  send?: boolean;
}) {
  const { supabaseAdmin, userId, roomId } = input;
  const access = await requireCommunityAccess({ supabaseAdmin, userId, roomId });
  let query = supabaseAdmin
    .from("chat_channels")
    .select("id,community_id,category_id,name,channel_type,topic,position,is_private,is_read_only,is_default")
    .eq("community_id", access.community.id);
  query = input.channelId ? query.eq("id", input.channelId) : query.eq("is_default", true);
  const { data: channel, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!channel) throw statusError("Channel was not found.", 404);

  if (channel.is_private && !hasCommunityPermission(access, "view_private_channels")) {
    const { data: overrides, error: overrideError } = await supabaseAdmin
      .from("chat_channel_permission_overrides")
      .select("role_id,user_id,allow_permissions,deny_permissions")
      .eq("channel_id", channel.id);
    if (overrideError) throw new Error(overrideError.message);
    const relevant = (overrides || []).filter(
      (overrideRow) =>
        String(overrideRow.user_id || "") === userId || access.roleIds.includes(String(overrideRow.role_id || "")),
    );
    if (
      relevant.some((overrideRow) => (overrideRow.deny_permissions || []).includes("view_channel")) ||
      !relevant.some((overrideRow) => (overrideRow.allow_permissions || []).includes("view_channel"))
    ) {
      throw statusError("You are not allowed to view this channel.", 403);
    }
  }

  if (input.send) {
    if (String(channel.channel_type) === "voice") {
      throw statusError("Voice channels do not accept text messages.", 400);
    }
    if (channel.is_read_only && !hasCommunityPermission(access, "manage_messages")) {
      throw statusError("This channel is read-only.", 403);
    }
    // Use the same policy as database writes: explicit channel denies win,
    // and an explicit channel allow can grant sending to a restricted role.
    const { data: canSend, error: permissionError } = await supabaseAdmin.rpc(
      "cp_can_send_chat_channel_v27",
      { p_channel_id: channel.id, p_user_id: userId },
    );
    if (permissionError) throw new Error(permissionError.message);
    if (canSend !== true) {
      throw statusError("You are not allowed to send messages in this channel.", 403);
    }
  }

  return { access, channel };
}
