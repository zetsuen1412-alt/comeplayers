export type PlayUpdateStatus =
  | "accepted"
  | "cancelled"
  | "closed"
  | "completing"
  | "failed"
  | "not_allowed"
  | "unavailable"
  | "up_to_date";

export type PlayUpdateResult = {
  status: PlayUpdateStatus;
  mode: "flexible" | "immediate" | null;
  availableVersionCode: number | null;
};
