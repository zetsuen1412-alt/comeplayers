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
import { selectCurrentAccountCall } from "@/lib/callPresence";
import type { Room as LiveKitRoom, Track as LiveKitTrack } from "livekit-client";

type CallRecord = {
  id: string;
  room_id: string;
  caller_id: string;
  callee_id: string;
  media: "audio" | "video";
  status: "scheduled" | "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
  secure_event_id?: string | null;
  encryption_envelope?: unknown;
  created_at: string;
  answered_at?: string | null;
};

type TokenResponse = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
};

async function callApi<T>(path: string, method: string, body: unknown): Promise<T> {
  return authenticatedFetchJson<T>(path, { method, body: JSON.stringify(body) });
}

type Props = {
  roomId: string;
  userId: string;
  peerName: string;
  onError: (message: string) => void;
};

export default function AccountDirectCall({ roomId, userId, peerName, onError }: Props) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const mounted = useRef(false);
  const joining = useRef(false);
  const polling = useRef(false);
  const callRef = useRef<CallRecord | null>(null);
  const failedCalls = useRef(new Set<string>());
  const liveRoom = useRef<LiveKitRoom | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pendingMedia = useRef<HTMLElement[]>([]);

  const updateCall = useCallback((value: CallRecord | null) => {
    callRef.current = value;
    setCall(value);
  }, []);

  const clearMedia = useCallback(() => {
    pendingMedia.current.forEach(element => element.remove());
    pendingMedia.current = [];
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
    clearMedia();
    setConnected(false);
    setMicrophone(true);
    setCamera(false);
    setAudioBlocked(false);
  }, [clearMedia]);

  useEffect(() => {
    if (!stage.current || !pendingMedia.current.length) return;
    pendingMedia.current.forEach(element => stage.current?.appendChild(element));
    pendingMedia.current = [];
  }, [call]);

  const join = useCallback(async (target: CallRecord) => {
    if (!mounted.current || joining.current || liveRoom.current || failedCalls.current.has(target.id) || target.status !== "accepted") return;
    joining.current = true;
    setBusy(true);
    try {
      const livekit = await import("livekit-client");
      if (!mounted.current) return;
      if (target.secure_event_id || target.encryption_envelope) throw new Error("This older encrypted call cannot resume. Start a new call.");
      const room = new livekit.Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
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
        if (stage.current) stage.current.appendChild(element);
        else pendingMedia.current.push(element);
      };
      room
        .on(livekit.RoomEvent.TrackSubscribed, (track) => attach(track))
        .on(livekit.RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.track && publication.source === livekit.Track.Source.Camera) attach(publication.track);
        })
        .on(livekit.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()))
        .on(livekit.RoomEvent.LocalTrackUnpublished, (publication) => publication.track?.detach().forEach((element) => element.remove()))
        .on(livekit.RoomEvent.AudioPlaybackStatusChanged, () => {
          if (liveRoom.current === room) setAudioBlocked(!room.canPlaybackAudio);
        })
        .on(livekit.RoomEvent.Disconnected, () => { if (liveRoom.current === room) disconnectMedia(); });
      const token = await callApi<TokenResponse>("/api/messages/calls", "PATCH", { id: target.id, action: "token" });
      if (!mounted.current || liveRoom.current !== room) return;
      await room.connect(token.serverUrl, token.participantToken, { autoSubscribe: true });
      if (!mounted.current || liveRoom.current !== room) { void room.disconnect(true); return; }
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      if (target.media === "video") await room.localParticipant.setCameraEnabled(true, { facingMode: "user" });
      if (!mounted.current || liveRoom.current !== room) { void room.disconnect(true); return; }
      setMicrophone(true);
      setCamera(target.media === "video");
      setAudioBlocked(!room.canPlaybackAudio);
      setConnected(true);
    } catch (cause) {
      if (!mounted.current) return;
      failedCalls.current.add(target.id);
      disconnectMedia();
      updateCall(null);
      void callApi("/api/messages/calls", "PATCH", { id: target.id, action: "end" }).catch(() => undefined);
      onError(cause instanceof Error ? cause.message : "The call could not connect.");
    } finally {
      joining.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [disconnectMedia, onError, updateCall]);

  const poll = useCallback(async () => {
    if (!mounted.current || polling.current) return;
    polling.current = true;
    try {
      const result = await authenticatedFetchJson<{ calls: CallRecord[] }>(
        `/api/messages/calls?active=1${callRef.current ? `&id=${encodeURIComponent(callRef.current.id)}` : ""}`,
      );
      if (!mounted.current) return;
      const current = selectCurrentAccountCall(result.calls, roomId, callRef.current?.id);
      updateCall(current);
      if (current?.status === "accepted") void join(current);
      if (!current) disconnectMedia();
    } catch {
      // A short poll failure must not tear down a live media session.
    } finally { polling.current = false; }
  }, [disconnectMedia, join, roomId, updateCall]);

  useEffect(() => {
    mounted.current = true;
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [poll]);

  useEffect(() => () => disconnectMedia(), [disconnectMedia]);

  async function start(media: "audio" | "video") {
    if (busy || call) return;
    setBusy(true);
    onError("");
    try {
      const result = await callApi<{ call: CallRecord }>("/api/messages/calls", "POST", {
        roomId,
        media,
      });
      if (mounted.current) updateCall(result.call);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The call could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function answer() {
    if (!call || busy) return;
    setBusy(true);
    try {
      if (call.secure_event_id || call.encryption_envelope) throw new Error("Ask your contact to start a new call.");
      await callApi("/api/messages/calls", "PATCH", { id: call.id, action: "accept" });
      const accepted = { ...call, status: "accepted" as const, answered_at: new Date().toISOString() };
      updateCall(accepted);
      await join(accepted);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The call could not be accepted.");
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
    try {
      await callApi("/api/messages/calls", "PATCH", { id: current.id, action });
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

  async function enableAudio() {
    const room = liveRoom.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
    } catch {
      onError("Audio playback is blocked. Tap Enable sound again or check your browser sound setting.");
    }
  }

  const incoming = call?.caller_id !== userId && call?.status === "ringing";
  if (!call) {
    return (
      <div className="flex items-center gap-1">
        <button type="button" disabled={busy} onClick={() => void start("video")} className="rounded-xl p-3 text-slate-300 hover:bg-white/10 disabled:opacity-40" title="Start video call"><FaVideo /></button>
        <button type="button" disabled={busy} onClick={() => void start("audio")} className="rounded-xl p-3 text-slate-300 hover:bg-white/10 disabled:opacity-40" title="Start voice call"><FaPhone /></button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#02070d]/95 p-4 backdrop-blur-xl">
      <section className="flex h-full max-h-[760px] w-full max-w-3xl flex-col items-center justify-between overflow-hidden rounded-3xl border border-emerald-400/25 bg-[#07131f] p-5 text-center shadow-2xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">ComePlayers call</p>
          <h2 className="mt-2 text-2xl font-black">{peerName}</h2>
          <p className="mt-1 text-sm text-slate-400">{incoming ? `Incoming ${call.media} call` : connected ? "Connected" : "Calling…"}</p>
        </div>
        <div ref={stage} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden py-5">
          {!connected ? <div className="flex h-28 w-28 animate-pulse items-center justify-center rounded-full bg-emerald-400/15 text-4xl text-emerald-300">{call.media === "video" ? <FaVideo /> : <FaPhone />}</div> : null}
        </div>
        {audioBlocked ? <button type="button" onClick={() => void enableAudio()} className="mb-3 min-h-11 rounded-xl bg-yellow-400 px-5 font-bold text-black">Enable sound</button> : null}
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
