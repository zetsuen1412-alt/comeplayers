export const TOURNAMENT_STATUSES = [
  "draft",
  "published",
  "registration_closed",
  "live",
  "completed",
  "cancelled",
] as const;

export const TOURNAMENT_FORMATS = [
  "single_elimination",
  "double_elimination",
  "round_robin",
  "swiss",
  "battle_royale",
] as const;

export const TOURNAMENT_SKILL_LEVELS = [
  "all_levels",
  "beginner",
  "intermediate",
  "advanced",
  "pro",
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];
export type TournamentSkillLevel = (typeof TOURNAMENT_SKILL_LEVELS)[number];

export type Tournament = {
  id: string;
  host_id: string;
  organizer_name: string;
  organizer_avatar_url: string | null;
  title: string;
  game_title: string;
  game_mode: string;
  description: string;
  rules: string;
  platform: string;
  region: string;
  tournament_format: TournamentFormat;
  skill_level: TournamentSkillLevel;
  team_size: number;
  max_participants: number;
  participant_count: number;
  entry_fee: number | string;
  prize_pool: number | string;
  currency: string;
  registration_deadline: string;
  starts_at: string;
  ends_at: string | null;
  status: TournamentStatus;
  is_featured: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentRegistration = {
  id: string;
  tournament_id: string;
  user_id: string;
  player_name: string;
  game_username: string;
  team_name: string | null;
  contact_handle: string | null;
  notes: string | null;
  status: "registered" | "checked_in" | "withdrawn" | "disqualified";
  joined_at: string;
  updated_at: string;
};

export const TOURNAMENT_SELECT =
  "id,host_id,organizer_name,organizer_avatar_url,title,game_title,game_mode,description,rules,platform,region,tournament_format,skill_level,team_size,max_participants,participant_count,entry_fee,prize_pool,currency,registration_deadline,starts_at,ends_at,status,is_featured,is_verified,created_at,updated_at";

export const TOURNAMENT_REGISTRATION_SELECT =
  "id,tournament_id,user_id,player_name,game_username,team_name,contact_handle,notes,status,joined_at,updated_at";

export type TournamentCreateInput = {
  title: string;
  gameTitle: string;
  gameMode: string;
  description: string;
  rules: string;
  platform: string;
  region: string;
  tournamentFormat: TournamentFormat;
  skillLevel: TournamentSkillLevel;
  teamSize: number;
  maxParticipants: number;
  entryFee: number;
  prizePool: number;
  registrationDeadline: string;
  startsAt: string;
  endsAt: string | null;
};

function requiredText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const text = String(value || "").trim();
  if (text.length < minimum || text.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`);
  }
  return text;
}

function optionalText(value: unknown, maximum: number) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > maximum) {
    throw new Error(`Optional field cannot exceed ${maximum} characters.`);
  }
  return text;
}

function finiteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function dateValue(value: unknown, label: string) {
  const parsed = new Date(String(value || ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

export function parseTournamentCreateInput(body: unknown): TournamentCreateInput {
  const input = (body || {}) as Record<string, unknown>;
  const tournamentFormat = String(input.tournamentFormat || "") as TournamentFormat;
  const skillLevel = String(input.skillLevel || "") as TournamentSkillLevel;

  if (!TOURNAMENT_FORMATS.includes(tournamentFormat)) {
    throw new Error("Select a valid tournament format.");
  }
  if (!TOURNAMENT_SKILL_LEVELS.includes(skillLevel)) {
    throw new Error("Select a valid skill level.");
  }

  const registrationDeadline = dateValue(
    input.registrationDeadline,
    "Registration deadline",
  );
  const startsAt = dateValue(input.startsAt, "Tournament start time");
  const endsAt = input.endsAt ? dateValue(input.endsAt, "Tournament end time") : null;
  const minimumDeadline = Date.now() + 10 * 60 * 1000;

  if (registrationDeadline.getTime() < minimumDeadline) {
    throw new Error("Registration deadline must be at least 10 minutes from now.");
  }
  if (startsAt.getTime() <= registrationDeadline.getTime()) {
    throw new Error("Tournament must start after registration closes.");
  }
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("Tournament end time must be after its start time.");
  }

  return {
    title: requiredText(input.title, "Tournament title", 4, 120),
    gameTitle: requiredText(input.gameTitle, "Game title", 2, 80),
    gameMode: requiredText(input.gameMode, "Game mode", 2, 60),
    description: requiredText(input.description, "Description", 20, 5000),
    rules: requiredText(input.rules, "Rules", 10, 12000),
    platform: requiredText(input.platform, "Platform", 2, 40),
    region: requiredText(input.region, "Region", 2, 40),
    tournamentFormat,
    skillLevel,
    teamSize: Math.floor(finiteNumber(input.teamSize, "Team size", 1, 100)),
    maxParticipants: Math.floor(
      finiteNumber(input.maxParticipants, "Participant capacity", 2, 4096),
    ),
    entryFee: finiteNumber(input.entryFee, "Entry fee", 0, 999_999_999_999),
    prizePool: finiteNumber(input.prizePool, "Prize pool", 0, 999_999_999_999),
    registrationDeadline: registrationDeadline.toISOString(),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt?.toISOString() || null,
  };
}

export function parseTournamentJoinInput(body: unknown) {
  const input = (body || {}) as Record<string, unknown>;
  return {
    gameUsername: requiredText(input.gameUsername, "In-game username", 2, 80),
    teamName: optionalText(input.teamName, 80),
    contactHandle: optionalText(input.contactHandle, 120),
    notes: optionalText(input.notes, 1000),
  };
}
