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
import { silenceCallAlert } from "@/lib/clientAlerts";
import { subscribeAccountCalls, refreshAccountCalls, type AccountCall } from "@/lib/accountCalls";
import { directCallRoomOptions, directCallAudio, directCallVideo } from "@/lib/directCallMedia";
import type { Room as LiveKitRoom, Track as LiveKitTrack } from "livekit-client";

type CallRecord = AccountCall;

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
  const [connectionError, setConnectionError] = useState("");
  const mounted = useRef(false);
  const joining = useRef(false);
  const changingCall = useRef(false);
  const callRef = useRef<CallRecord | null>(null);
  const failedCalls = useRef(new Set<string>());
  const endedCalls = useRef(new Set<string>());
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
    setConnectionError("");
    try {
      const [livekit, token] = await Promise.all([
        import("livekit-client"),
        callApi<TokenResponse>("/api/messages/calls", "PATCH", { id: target.id, action: "token" }),
      ]);
      if (!mounted.current || callRef.current?.id !== target.id || callRef.current.status !== "accepted") return;
      if (target.secure_event_id || target.encryption_envelope) throw new Error("This older encrypted call cannot resume. Start a new call.");
      const room = new livekit.Room({
        ...directCallRoomOptions,
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
        .on(livekit.RoomEvent.Disconnected, () => {
          if (liveRoom.current !== room) return;
          failedCalls.current.add(target.id);
          disconnectMedia();
          setConnectionError("Call disconnected. Retry connection.");
        });
      if (!mounted.current || liveRoom.current !== room) return;
      await room.connect(token.serverUrl, token.participantToken, { autoSubscribe: true });
      if (!mounted.current || liveRoom.current !== room) { void room.disconnect(true); return; }
      await room.localParticipant.setMicrophoneEnabled(true, directCallAudio);
      if (target.media === "video") await room.localParticipant.setCameraEnabled(true, directCallVideo);
      if (!mounted.current || liveRoom.current !== room) { void room.disconnect(true); return; }
      setMicrophone(true);
      setCamera(target.media === "video");
      setAudioBlocked(!room.canPlaybackAudio);
      setConnected(true);
    } catch (cause) {
      if (!mounted.current || callRef.current?.id !== target.id || callRef.current.status !== "accepted") return;
      failedCalls.current.add(target.id);
      disconnectMedia();
      setConnectionError(cause instanceof Error ? cause.message : "The call could not connect.");
    } finally {
      joining.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [disconnectMedia]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeAccountCalls(userId, calls => {
      if (!mounted.current || changingCall.current) return;
      const current = selectCurrentAccountCall(calls.filter(item => !endedCalls.current.has(item.id)), roomId, callRef.current?.id);
      updateCall(current);
      if (current?.status === "accepted") void join(current);
      if (!current) { disconnectMedia(); setConnectionError(""); }
    });
    return () => { mounted.current = false; unsubscribe(); };
  }, [disconnectMedia, join, roomId, updateCall, userId]);

  useEffect(() => () => disconnectMedia(), [disconnectMedia]);

  async function start(media: "audio" | "video") {
    if (busy || call) return;
    changingCall.current = true;
    setBusy(true);
    onError("");
    setConnectionError("");
    try {
      const result = await callApi<{ call: CallRecord }>("/api/messages/calls", "POST", {
        roomId,
        media,
      });
      if (mounted.current) updateCall(result.call);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The call could not start.");
    } finally {
      changingCall.current = false;
      refreshAccountCalls(userId);
      setBusy(false);
    }
  }

  async function answer() {
    if (!call || busy) return;
    changingCall.current = true;
    setBusy(true);
    try {
      if (call.secure_event_id || call.encryption_envelope) throw new Error("Ask your contact to start a new call.");
      await callApi("/api/messages/calls", "PATCH", { id: call.id, action: "accept" });
      const accepted = { ...call, status: "accepted" as const, answered_at: new Date().toISOString() };
      silenceCallAlert(call.id);
      updateCall(accepted);
      changingCall.current = false;
      refreshAccountCalls(userId);
      await join(accepted);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "The call could not be accepted.");
    } finally {
      changingCall.current = false;
      refreshAccountCalls(userId);
      setBusy(false);
    }
  }

  async function end(action: "decline" | "end" = "end") {
    const current = call;
    changingCall.current = true;
    disconnectMedia();
    updateCall(null);
    setConnectionError("");
    if (!current) { changingCall.current = false; return; }
    silenceCallAlert(current.id);
    failedCalls.current.add(current.id);
    endedCalls.current.add(current.id);
    try {
      await callApi("/api/messages/calls", "PATCH", { id: current.id, action });
    } catch (cause) {
      endedCalls.current.delete(current.id);
      failedCalls.current.delete(current.id);
      if (mounted.current) updateCall(current);
      onError(cause instanceof Error ? cause.message : "The call state could not be updated.");
    } finally {
      changingCall.current = false;
      refreshAccountCalls(userId);
    }
  }

  async function toggleMicrophone() {
    const room = liveRoom.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled, directCallAudio);
      setMicrophone(room.localParticipant.isMicrophoneEnabled);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Microphone control failed.");
    }
  }

  async function toggleCamera() {
    const room = liveRoom.current;
    if (!room || call?.media !== "video") return;
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled, directCallVideo);
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

  function retryConnection() {
    const current = callRef.current;
    if (!current || current.status !== "accepted" || busy) return;
    failedCalls.current.delete(current.id);
    void join(current);
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
        {connectionError ? <div role="alert" className="mb-3 text-sm text-red-200"><p>{connectionError}</p><button type="button" disabled={busy} onClick={retryConnection} className="mt-3 min-h-11 rounded-xl bg-yellow-400 px-5 font-bold text-black disabled:opacity-50">Retry connection</button></div> : null}
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
