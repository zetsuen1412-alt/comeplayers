"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhone,
  FaPhoneSlash,
  FaVideo,
  FaVideoSlash,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { unhex } from "@/lib/e2ee/crypto";
import type { WebMessenger } from "@/lib/e2ee/webMessenger";
import type { Room as LiveKitRoom, Track as LiveKitTrack } from "livekit-client";

type CallRecord = {
  id: string;
  room_id: string;
  caller_id: string;
  callee_id: string;
  media: "audio" | "video";
  status: "scheduled" | "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
  secure_event_id?: string | null;
  created_at: string;
  answered_at?: string | null;
};

type TokenResponse = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
};

type Props = {
  messenger: WebMessenger;
  roomId: string;
  userId: string;
  peerName: string;
  onError: (message: string) => void;
};

export default function SecureDirectCall({ messenger, roomId, userId, peerName, onError }: Props) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(false);
  const callRef = useRef<CallRecord | null>(null);
  const failedCalls = useRef(new Set<string>());
  const liveRoom = useRef<LiveKitRoom | null>(null);
  const worker = useRef<Worker | null>(null);
  const sharedKeys = useRef(new Map<string, string>());
  const stage = useRef<HTMLDivElement>(null);

  const updateCall = useCallback((value: CallRecord | null) => {
    callRef.current = value;
    setCall(value);
  }, []);

  const clearMedia = useCallback(() => {
    stage.current?.querySelectorAll("audio,video").forEach((element) => {
      const media = element as HTMLMediaElement;
      media.pause();
      media.srcObject = null;
      media.remove();
    });
  }, []);

  const disconnectMedia = useCallback(() => {
    const current = liveRoom.current;
    liveRoom.current = null;
    current?.disconnect(true);
    worker.current?.terminate();
    worker.current = null;
    clearMedia();
    setConnected(false);
    setMicrophone(true);
    setCamera(false);
  }, [clearMedia]);

  const join = useCallback(async (target: CallRecord) => {
    if (liveRoom.current || failedCalls.current.has(target.id) || target.status !== "accepted" || !target.secure_event_id) return;
    setBusy(true);
    try {
      const livekit = await import("livekit-client");
      if (!livekit.isE2EESupported()) {
        throw new Error("This browser cannot protect WebRTC frames with end-to-end encryption.");
      }
      const shared = sharedKeys.current.get(target.id) ||
        await messenger.callKey(target.secure_event_id, target.room_id, target.media);
      const keyBytes = unhex(shared);
      const keyCopy = new Uint8Array(keyBytes.byteLength);
      keyCopy.set(keyBytes);
      keyBytes.fill(0);
      const provider = new livekit.ExternalE2EEKeyProvider({ keySize: 256 });
      await provider.setKey(keyCopy.buffer);
      keyCopy.fill(0);
      const encryptionWorker = new Worker(
        new URL("livekit-client/e2ee-worker", import.meta.url),
        { type: "module", name: "comeplayers-e2ee-call" },
      );
      worker.current = encryptionWorker;
      const room = new livekit.Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        encryption: { keyProvider: provider, worker: encryptionWorker },
      });
      liveRoom.current = room;
      const attach = (track: LiveKitTrack) => {
        const element = track.attach();
        element.autoplay = true;
        if (element instanceof HTMLVideoElement) {
          element.playsInline = true;
          element.className = "max-h-[65vh] w-full rounded-2xl bg-black object-contain";
        } else {
          element.className = "hidden";
        }
        stage.current?.appendChild(element);
      };
      room
        .on(livekit.RoomEvent.TrackSubscribed, (track) => attach(track))
        .on(livekit.RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.track && publication.source === livekit.Track.Source.Camera) attach(publication.track);
        })
        .on(livekit.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()))
        .on(livekit.RoomEvent.LocalTrackUnpublished, (publication) => publication.track?.detach().forEach((element) => element.remove()))
        .on(livekit.RoomEvent.EncryptionError, () => {
          failedCalls.current.add(target.id);
          onError("Call encryption failed. The call was stopped before continuing.");
          disconnectMedia();
          updateCall(null);
          void messenger.api("/api/messages/calls", "PATCH", { id: target.id, action: "end" }).catch(() => undefined);
        })
        .on(livekit.RoomEvent.Disconnected, () => disconnectMedia());
      const token = await messenger.api<TokenResponse>("/api/messages/calls", "PATCH", { id: target.id, action: "token" });
      await room.connect(token.serverUrl, token.participantToken, { autoSubscribe: true });
      await room.setE2EEEnabled(true);
      if (!room.isE2EEEnabled) throw new Error("WebRTC encryption did not activate.");
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (target.media === "video") await room.localParticipant.setCameraEnabled(true, { facingMode: "user" });
      setMicrophone(true);
      setCamera(target.media === "video");
      setConnected(true);
    } catch (cause) {
      failedCalls.current.add(target.id);
      disconnectMedia();
      updateCall(null);
      void messenger.api("/api/messages/calls", "PATCH", { id: target.id, action: "end" }).catch(() => undefined);
      onError(cause instanceof Error ? cause.message : "The encrypted call could not connect.");
    } finally {
      setBusy(false);
    }
  }, [disconnectMedia, messenger, onError, updateCall]);

  const poll = useCallback(async () => {
    try {
      const result = await authenticatedFetchJson<{ calls: CallRecord[] }>(
        `/api/messages/calls?active=1${callRef.current ? `&id=${encodeURIComponent(callRef.current.id)}` : ""}`,
      );
      const current = result.calls.find((item) => item.room_id === roomId) || null;
      updateCall(current);
      if (current?.status === "accepted") void join(current);
      if (!current || !["ringing", "accepted", "scheduled"].includes(current.status)) disconnectMedia();
    } catch {
      // A short poll failure must not tear down a live encrypted media session.
    }
  }, [disconnectMedia, join, roomId, updateCall]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => () => disconnectMedia(), [disconnectMedia]);

  async function start(media: "audio" | "video") {
    if (busy || call) return;
    setBusy(true);
    onError("");
    try {
      const offer = await messenger.prepareCall(roomId, media);
      const result = await messenger.api<{ call: CallRecord }>("/api/messages/calls", "POST", {
        roomId,
        media,
        secureEventId: offer.eventId,
      });
      sharedKeys.current.set(result.call.id, offer.key);
      updateCall(result.call);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The encrypted call could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function answer() {
    if (!call?.secure_event_id || busy) return;
    setBusy(true);
    try {
      await messenger.callKey(call.secure_event_id, call.room_id, call.media);
      await messenger.api("/api/messages/calls", "PATCH", { id: call.id, action: "accept" });
      const accepted = { ...call, status: "accepted" as const, answered_at: new Date().toISOString() };
      updateCall(accepted);
      await join(accepted);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The encrypted call could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  async function end(action: "decline" | "end" = "end") {
    const current = call;
    disconnectMedia();
    updateCall(null);
    if (!current) return;
    failedCalls.current.add(current.id);
    sharedKeys.current.delete(current.id);
    try {
      await messenger.api("/api/messages/calls", "PATCH", { id: current.id, action });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The call state could not be updated.");
    }
  }

  async function toggleMicrophone() {
    const room = liveRoom.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      setMicrophone(room.localParticipant.isMicrophoneEnabled);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Microphone control failed.");
    }
  }

  async function toggleCamera() {
    const room = liveRoom.current;
    if (!room || call?.media !== "video") return;
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled, { facingMode: "user" });
      setCamera(room.localParticipant.isCameraEnabled);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Camera control failed.");
    }
  }

  const incoming = call?.caller_id !== userId && call?.status === "ringing";
  if (!call) {
    return (
      <div className="flex items-center gap-1">
        <button type="button" disabled={busy} onClick={() => void start("video")} className="rounded-xl p-3 text-slate-300 hover:bg-white/10 disabled:opacity-40" title="Start end-to-end encrypted video call"><FaVideo /></button>
        <button type="button" disabled={busy} onClick={() => void start("audio")} className="rounded-xl p-3 text-slate-300 hover:bg-white/10 disabled:opacity-40" title="Start end-to-end encrypted voice call"><FaPhone /></button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02070d]/95 p-4 backdrop-blur-xl">
      <section className="flex h-full max-h-[760px] w-full max-w-3xl flex-col items-center justify-between overflow-hidden rounded-3xl border border-emerald-400/25 bg-[#07131f] p-5 text-center shadow-2xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">End-to-end encrypted</p>
          <h2 className="mt-2 text-2xl font-black">{peerName}</h2>
          <p className="mt-1 text-sm text-slate-400">{incoming ? `Incoming ${call.media} call` : connected ? "Connected" : "Calling…"}</p>
        </div>
        <div ref={stage} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden py-5">
          {!connected ? <div className="flex h-28 w-28 animate-pulse items-center justify-center rounded-full bg-emerald-400/15 text-4xl text-emerald-300">{call.media === "video" ? <FaVideo /> : <FaPhone />}</div> : null}
        </div>
        <div className="flex items-center justify-center gap-3">
          {incoming ? (
            <>
              <button type="button" disabled={busy} onClick={() => void answer()} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-xl text-black"><FaPhone /></button>
              <button type="button" disabled={busy} onClick={() => void end("decline")} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-xl text-white"><FaPhoneSlash /></button>
            </>
          ) : (
            <>
              {connected ? <button type="button" onClick={() => void toggleMicrophone()} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg">{microphone ? <FaMicrophone /> : <FaMicrophoneSlash />}</button> : null}
              {connected && call.media === "video" ? <button type="button" onClick={() => void toggleCamera()} className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg">{camera ? <FaVideo /> : <FaVideoSlash />}</button> : null}
              <button type="button" onClick={() => void end()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-xl text-white"><FaPhoneSlash /></button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
