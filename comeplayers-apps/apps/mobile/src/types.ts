export type AppTab = "home" | "community" | "marketplace" | "messages" | "profile";

export type MarketplaceProduct = {
  id: number;
  title: string;
  slug?: string | null;
  price: number | string | null;
  image_url?: string | null;
  category?: string | null;
  game_name?: string | null;
  seller_name?: string | null;
  stock?: number | null;
  delivery_eta_minutes?: number | null;
  href: string;
};

export type MarketplaceSearchResult = {
  query: string;
  products: MarketplaceProduct[];
  games: Array<{
    id: number;
    name: string;
    slug: string;
    image_url?: string | null;
    cover_image_url?: string | null;
    href: string;
  }>;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    icon?: string | null;
    href: string;
  }>;
};

export type MarketplaceCategory = MarketplaceSearchResult["categories"][number];

export type CheckoutOrder = {
  id: number;
  invoice_number?: string | null;
  product_title?: string | null;
  quantity?: number;
  total_amount?: number | string | null;
  total_price?: number | string | null;
  currency_code?: string | null;
};

export type PaymentResult = {
  ok: boolean;
  alreadyPaid?: boolean;
  orderId: number;
  invoiceNumber?: string;
  paymentMode?: "qris" | "virtual_account" | "card_payment_page" | "checkout" | "doku_wallet";
  paymentUrl?: string;
  qris?: {
    imageUrl: string;
    content?: string;
    expiresAt?: string;
    merchantName?: string;
  };
  virtualAccount?: {
    number: string;
    expiresAt?: string;
    networkName?: string;
  };
};

export type PublicProfile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

export type FriendEntry = {
  relationId: string;
  profile: PublicProfile;
  relationshipStatus: "accepted" | "pending";
  requestDirection: "incoming" | "outgoing";
  presenceStatus: "online" | "away" | "offline";
  lastSeenAt?: string | null;
  roomId?: string | null;
  unreadCount: number;
};

export type FriendsResult = {
  friends: FriendEntry[];
  incomingRequests: FriendEntry[];
  outgoingRequests: FriendEntry[];
  recentChats: FriendEntry[];
  onlineCount: number;
  ownStatus: "online" | "away" | "invisible" | "offline";
};

export type CommunityChannel = {
  id: string;
  community_id: string;
  category_id?: string | null;
  name: string;
  channel_type: "text" | "announcement" | "voice";
  topic?: string | null;
  is_private?: boolean;
  is_read_only?: boolean;
  is_default?: boolean;
  unread_count?: number;
};

export type CommunityBundle = {
  community: {
    id: string;
    room_id: string;
    owner_id: string;
    name: string;
    description?: string | null;
    icon_url?: string | null;
  };
  channels: CommunityChannel[];
  currentUser: {
    memberRole: string;
    permissions: string[];
    isOwner: boolean;
    isAdmin: boolean;
  };
};

export type VoiceToken = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  channel: { id: string; name: string };
  permissions: {
    canPublishVideo: boolean;
    canShareScreen: boolean;
    canModerateVoice: boolean;
  };
};

export type AccountProfile = PublicProfile & { email?: string | null };

export type Tournament = {
  id: string;
  host_id: string;
  organizer_name: string;
  organizer_avatar_url: string | null;
  title: string;
  game_title: string;
  game_mode: string;
  description: string;
  platform: string;
  region: string;
  tournament_format: string;
  skill_level: string;
  team_size: number;
  max_participants: number;
  participant_count: number;
  entry_fee: number | string;
  prize_pool: number | string;
  currency: string;
  registration_deadline: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  is_featured: boolean;
  is_verified: boolean;
};

export type TournamentRegistration = {
  id: string;
  tournament_id: string;
  user_id: string;
  player_name: string;
  game_username: string;
  team_name: string | null;
  status: string;
};

export type TournamentResult = {
  tournaments: Tournament[];
  registrations: TournamentRegistration[];
  viewerId: string | null;
};
