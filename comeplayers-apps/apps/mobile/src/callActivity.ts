import type { CallRecord } from "./messagingApi";

export function callActivityAt(call: CallRecord): string {
  return [call.created_at, call.answered_at, call.ended_at]
    .filter((value): value is string => !!value)
    .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest, call.created_at);
}

export function sortCallsByActivity(calls: CallRecord[]): CallRecord[] {
  return calls.sort((left, right) => Date.parse(callActivityAt(right)) - Date.parse(callActivityAt(left)) || left.id.localeCompare(right.id));
}

export function callActivityPreview(call: CallRecord, userId: string): string {
  const label = call.media === "video" ? "Panggilan video" : "Panggilan suara";
  const outgoing = call.caller_id === userId;
  switch (call.status) {
    case "ringing": return outgoing ? `${label} keluar` : `${label} masuk`;
    case "accepted": return `${label} berlangsung`;
    case "missed": return outgoing ? `${label} tidak dijawab` : `${label} tak terjawab`;
    case "declined": return outgoing ? `${label} ditolak` : `${label} Anda tolak`;
    case "cancelled": return `${label} dibatalkan`;
    case "scheduled": return `${label} dijadwalkan`;
    case "ended": return `${label} berakhir`;
  }
}
