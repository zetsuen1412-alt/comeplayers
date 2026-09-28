type CallState = {
  id: string;
  room_id: string;
  status: string;
  created_at: string;
  answered_at?: string | null;
  secure_event_id?: string | null;
  encryption_envelope?: unknown;
};

const ACTIVE = new Set(["ringing", "accepted"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Keep both the account scope and active/current-call condition in one PostgREST
// `or` expression. Chaining .or() calls can overwrite the first filter.
export function activeCallFilter(userId: string, currentId?: string | null, now = Date.now()) {
  const ringingSince = new Date(now - 60_000).toISOString();
  const acceptedSince = new Date(now - 3_600_000).toISOString();
  const conditions = (["caller_id", "callee_id"] as const).flatMap(column => [
    `and(${column}.eq.${userId},status.eq.ringing,created_at.gte.${ringingSince})`,
    `and(${column}.eq.${userId},status.eq.accepted,answered_at.gte.${acceptedSince})`,
  ]);
  if (currentId && UUID.test(currentId)) {
    conditions.push(`and(caller_id.eq.${userId},id.eq.${currentId})`);
    conditions.push(`and(callee_id.eq.${userId},id.eq.${currentId})`);
  }
  return conditions.join(",");
}

export function visibleCallStatus<T extends CallState>(call: T, now = Date.now()): T {
  if (call.status === "ringing" && Date.parse(call.created_at) <= now - 60_000) {
    return { ...call, status: "missed" };
  }
  if (call.status === "accepted" && (!call.answered_at || Date.parse(call.answered_at) <= now - 3_600_000)) {
    return { ...call, status: "ended" };
  }
  return call;
}

export function selectCurrentAccountCall<T extends CallState>(calls: T[], roomId: string, currentId?: string | null): T | null {
  const active = calls.filter(call => call.room_id === roomId && ACTIVE.has(call.status) && !call.secure_event_id && !call.encryption_envelope);
  return active.find(call => call.id === currentId) || active[0] || null;
}
