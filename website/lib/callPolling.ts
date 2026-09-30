type PollableCall = { status: string };

/** Fast fallback remains active while connecting, ringing or talking. */
export function accountCallPollInterval(calls: PollableCall[] | undefined, realtimeReady: boolean) {
  return realtimeReady && calls?.every(call => call.status !== "ringing" && call.status !== "accepted")
    ? 15_000
    : 3_000;
}
