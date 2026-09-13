export type StreamSource = "screen" | "camera";

export type StreamSignalDescription = {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
};

export type StreamSignalCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type StreamSignalPayload = {
  from?: string;
  to?: string;
  viewerId?: string;
  hostId?: string;
  sdp?: StreamSignalDescription;
  candidate?: StreamSignalCandidate;
  source?: StreamSource;
};

export type StreamIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function splitUrls(value?: string | null): string[] {
  return String(value || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function createStreamIceServers(input: {
  stunUrls?: string | null;
  turnUrls?: string | null;
  turnUsername?: string | null;
  turnCredential?: string | null;
} = {}): StreamIceServer[] {
  const stunUrls = splitUrls(input.stunUrls);
  const turnUrls = splitUrls(input.turnUrls);
  const servers: StreamIceServer[] = [
    {
      urls: stunUrls.length ? stunUrls : ["stun:stun.l.google.com:19302"],
    },
  ];

  if (turnUrls.length) {
    const username = String(input.turnUsername || "").trim();
    const credential = String(input.turnCredential || "").trim();
    servers.push({
      urls: turnUrls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }

  return servers;
}
