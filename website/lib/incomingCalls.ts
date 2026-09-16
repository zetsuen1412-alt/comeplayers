export type IncomingCall = {
  id: string; room_id: string; caller_id: string; callee_id: string;
  media: "audio" | "video"; status: string; created_at: string;
  secure_event_id?: string | null;
  encryption_envelope?: unknown;
  other?: { username?: string | null; full_name?: string | null } | null;
};

export function selectIncomingCall(calls: IncomingCall[], userId: string, now = Date.now()): IncomingCall | null {
  return calls.filter(call => call.callee_id === userId && call.caller_id !== userId &&
    call.status === "ringing" && !call.secure_event_id && !call.encryption_envelope &&
    Number.isFinite(Date.parse(call.created_at)) && Date.parse(call.created_at) > now - 60_000)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}
