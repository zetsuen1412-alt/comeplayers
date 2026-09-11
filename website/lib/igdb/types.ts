export type IgdbNamedEntity = {
  id: number;
  name: string;
  slug?: string | null;
  abbreviation?: string | null;
};

export type IgdbImage = {
  id?: number;
  image_id?: string | null;
  url?: string | null;
};

export type IgdbCompany = {
  id: number;
  name: string;
};

export type IgdbInvolvedCompany = {
  id?: number;
  developer?: boolean;
  publisher?: boolean;
  supporting?: boolean;
  porting?: boolean;
  company?: IgdbCompany | number | null;
};

export type IgdbExternalGame = {
  id?: number;
  uid?: string | null;
  url?: string | null;
  external_game_source?: number | IgdbNamedEntity | null;
};

export type IgdbWebsite = {
  id?: number;
  url?: string | null;
  type?: number | IgdbNamedEntity | null;
};

export type IgdbGame = {
  id: number;
  name: string;
  slug?: string | null;
  summary?: string | null;
  storyline?: string | null;
  first_release_date?: number | null;
  updated_at?: number | null;
  checksum?: string | null;
  game_type?: number | IgdbNamedEntity | null;
  game_status?: number | IgdbNamedEntity | null;
  rating?: number | null;
  rating_count?: number | null;
  aggregated_rating?: number | null;
  aggregated_rating_count?: number | null;
  total_rating?: number | null;
  total_rating_count?: number | null;
  hypes?: number | null;
  cover?: IgdbImage | number | null;
  artworks?: Array<IgdbImage | number> | null;
  screenshots?: Array<IgdbImage | number> | null;
  genres?: Array<IgdbNamedEntity | number> | null;
  platforms?: Array<IgdbNamedEntity | number> | null;
  involved_companies?: Array<IgdbInvolvedCompany | number> | null;
  external_games?: Array<IgdbExternalGame | number> | null;
  websites?: Array<IgdbWebsite | number> | null;
  version_parent?: number | null;
};

export type GameMasterProviderRow = {
  id: number;
  name: string;
  slug: string;
  normalized_name?: string | null;
  source?: string | null;
  igdb_id?: number | null;
  rawg_id?: number | null;
  description?: string | null;
  image_url?: string | null;
  cover_image_url?: string | null;
  background_image?: string | null;
  released?: string | null;
  rating?: number | null;
  genres?: unknown;
  platforms?: unknown;
  local_override_fields?: string[] | null;
};

export type IgdbCandidate = {
  igdbId: number;
  name: string;
  slug: string;
  normalizedName: string;
  summary: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  releaseDate: string | null;
  providerUpdatedAt: string | null;
  checksum: string | null;
  rating: number;
  providerRating: number;
  ratingCount: number;
  genres: Array<{ id: number; name: string; slug: string }>;
  platforms: Array<{
    id: number;
    name: string;
    slug: string;
    abbreviation: string | null;
  }>;
  developers: Array<{ id: number; name: string }>;
  publishers: Array<{ id: number; name: string }>;
  externalGames: Array<{
    sourceId: number | null;
    sourceName: string | null;
    uid: string | null;
    url: string | null;
  }>;
  websites: Array<{
    typeId: number | null;
    typeName: string | null;
    url: string;
  }>;
  payload: IgdbGame;
};

export type IgdbMatch = {
  gameId: number | null;
  score: number;
  reason: string;
};

export type IgdbImportCandidateRow = {
  id: number;
  igdb_id: number;
  status: "pending" | "approved" | "rejected" | "imported" | "error";
  proposed_name: string;
  proposed_slug: string;
  proposed_summary: string | null;
  proposed_cover_url: string | null;
  proposed_background_url: string | null;
  proposed_release_date: string | null;
  proposed_rating: number | string | null;
  proposed_genres: unknown;
  proposed_platforms: unknown;
  match_game_id: number | null;
  match_score: number | string | null;
  match_reason: string | null;
  provider_checksum: string | null;
  provider_updated_at: string | null;
  payload: IgdbGame;
};
