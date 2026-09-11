"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from "livekit-client";
import {
  FaDesktop,
  FaExpand,
  FaHeadphones,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhoneSlash,
  FaUserSlash,
  FaVideo,
  FaVideoSlash,
  FaVolumeMute,
  FaVolumeUp,
  FaTimes,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import type { CommunityChannel } from "@/components/messages/CommunityChannelSidebar";

type VoiceParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  videoTrack?: Track;
  videoSource?: Track.Source.Camera | Track.Source.ScreenShare;
};

export type CommunityVoiceCommand = {
  id: number;
  roomId: string;
  action: "join" | "toggle-microphone" | "toggle-output" | "leave";
};

export type CommunityVoiceDockState = {
  connected: boolean;
  channelId: string;
  channelName: string;
  microphoneEnabled: boolean;
  outputMuted: boolean;
  participantCount: number;
  speakingCount: number;
  participants: Array<{
    identity: string;
    name: string;
    isSpeaking: boolean;
    isLocal: boolean;
  }>;
};

type VoicePermissions = {
  canPublishVideo: boolean;
  canShareScreen: boolean;
  canModerateVoice: boolean;
};

type TokenResponse = {
  serverUrl: string;
  participantToken: string;
  roomName: string;
  channel: { id: string; name: string };
  permissions: VoicePermissions;
};

type Props = {
  roomId: string;
  selectedChannel?: CommunityChannel | null;
  dockCommand?: CommunityVoiceCommand | null;
  onDockStateChange?: (state: CommunityVoiceDockState) => void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
};

const EMPTY_PERMISSIONS: VoicePermissions = {
  canPublishVideo: false,
  canShareScreen: false,
  canModerateVoice: false,
};

function participantSnapshot(room: Room): VoiceParticipant[] {
  const rows: Participant[] = [
    room.localParticipant,
    ...Array.from(room.remoteParticipants.values()),
  ];
  return rows
    .map((participant) => {
      const microphone = participant.getTrackPublication(Track.Source.Microphone);
      const camera = participant.getTrackPublication(Track.Source.Camera);
      const screenShare = participant.getTrackPublication(Track.Source.ScreenShare);
      const screenShareTrack = screenShare?.videoTrack;
      const cameraTrack = camera?.videoTrack;
      const videoSource: VoiceParticipant["videoSource"] = screenShareTrack
        ? Track.Source.ScreenShare
        : cameraTrack
          ? Track.Source.Camera
          : undefined;
      return {
        identity: participant.identity,
        name: participant.name || participant.identity || "ComePlayers User",
        isLocal: participant === room.localParticipant,
        isSpeaking: participant.isSpeaking,
        isMuted: !microphone || microphone.isMuted,
        cameraEnabled: Boolean(camera && !camera.isMuted && cameraTrack),
        screenShareEnabled: Boolean(screenShare && !screenShare.isMuted && screenShareTrack),
        videoTrack: screenShareTrack || cameraTrack,
        videoSource,
      };
    })
    .sort((left, right) => {
      if (left.screenShareEnabled !== right.screenShareEnabled) {
        return left.screenShareEnabled ? -1 : 1;
      }
      if (left.isLocal !== right.isLocal) return left.isLocal ? -1 : 1;
      if (left.isSpeaking !== right.isSpeaking) return left.isSpeaking ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

function statusLabel(state: ConnectionState | "idle" | "error") {
  if (state === ConnectionState.Connected) return "Voice Connected";
  if (state === ConnectionState.Connecting) return "Connecting";
  if (state === ConnectionState.Reconnecting) return "Reconnecting";
  if (state === ConnectionState.Disconnected) return "Disconnected";
  if (state === "error") return "Connection Failed";
  return "Ready to Join";
}

export default function CommunityVoicePanel({
  roomId,
  selectedChannel,
  dockCommand,
  onDockStateChange,
  onNotice,
  onError,
}: Props) {
  const roomRef = useRef<Room | null>(null);
  const audioRootRef = useRef<HTMLDivElement | null>(null);
  const outputMutedRef = useRef(false);
  const handledDockCommandRef = useRef(0);
  const voiceLeaveDispatchedRef = useRef(false);
  const pendingExternalScreenStreamRef = useRef<MediaStream | null>(null);
  const externalScreenStreamRef = useRef<MediaStream | null>(null);
  const externalScreenTrackIdRef = useRef("");
  const [activeChannel, setActiveChannel] = useState<CommunityChannel | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState | "idle" | "error">("idle");
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [permissions, setPermissions] = useState<VoicePermissions>(EMPTY_PERMISSIONS);
  const [outputMuted, setOutputMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moderationBusy, setModerationBusy] = useState("");
  const spotlightContainerRef = useRef<HTMLDivElement | null>(null);
  const [spotlightParticipantId, setSpotlightParticipantId] = useState("");
  const [isSpotlightFullscreen, setIsSpotlightFullscreen] = useState(false);

  const selectedVoiceChannel = selectedChannel?.channel_type === "voice" ? selectedChannel : null;
  const connected = connectionState === ConnectionState.Connected;
  const activeMatchesSelected = Boolean(
    activeChannel && selectedVoiceChannel && activeChannel.id === selectedVoiceChannel.id,
  );
  const activeSpeakers = useMemo(
    () => participants.filter((participant) => participant.isSpeaking),
    [participants],
  );
  const spotlightParticipant = useMemo(
    () => participants.find((participant) => participant.identity === spotlightParticipantId) || null,
    [participants, spotlightParticipantId],
  );

  function refreshParticipants(room = roomRef.current) {
    if (!room) {
      setParticipants([]);
      return;
    }
    setParticipants(participantSnapshot(room));
    setMicrophoneEnabled(room.localParticipant.isMicrophoneEnabled);
    setCameraEnabled(room.localParticipant.isCameraEnabled);
    setScreenShareEnabled(room.localParticipant.isScreenShareEnabled);
    setAudioBlocked(!room.canPlaybackAudio);
  }

  function applyOutputMuted(muted: boolean) {
    outputMutedRef.current = muted;
    setOutputMuted(muted);
    audioRootRef.current?.querySelectorAll("audio").forEach((element) => {
      element.muted = muted;
    });
  }

  function attachRemoteAudio(track: RemoteTrack) {
    if (track.kind !== Track.Kind.Audio || !audioRootRef.current) return;
    const element = track.attach();
    element.autoplay = true;
    element.controls = false;
    element.muted = outputMutedRef.current;
    element.style.display = "none";
    audioRootRef.current.appendChild(element);
  }

  async function syncExternalScreenStream(
    stream: MediaStream | null,
    allowBeforeConnected = false,
  ) {
    pendingExternalScreenStreamRef.current = stream;
    externalScreenStreamRef.current = stream;
    const room = roomRef.current;
    if (!room || (!allowBeforeConnected && connectionState !== ConnectionState.Connected)) {
      return;
    }

    const existingPublication = room.localParticipant.getTrackPublication(
      Track.Source.ScreenShare,
    );

    if (!stream) {
      if (existingPublication?.track && externalScreenTrackIdRef.current) {
        await room.localParticipant.unpublishTrack(existingPublication.track, false);
      }
      externalScreenTrackIdRef.current = "";
      refreshParticipants(room);
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    if (
      existingPublication?.track?.mediaStreamTrack?.id === videoTrack.id ||
      externalScreenTrackIdRef.current === videoTrack.id
    ) {
      refreshParticipants(room);
      return;
    }

    if (existingPublication?.track) {
      await room.localParticipant.unpublishTrack(existingPublication.track, false);
    }

    await room.localParticipant.publishTrack(videoTrack, {
      source: Track.Source.ScreenShare,
      name: `comeplayers-screen-${roomId}`,
    });
    externalScreenTrackIdRef.current = videoTrack.id;
    refreshParticipants(room);
  }

  function dispatchVoiceLobbyLeft(channelId?: string) {
    if (voiceLeaveDispatchedRef.current || typeof window === "undefined") return;
    voiceLeaveDispatchedRef.current = true;
    window.dispatchEvent(
      new CustomEvent("comeplayers:voice-lobby-left", {
        detail: {
          roomId,
          channelId: channelId || activeChannel?.id || selectedVoiceChannel?.id || "",
        },
      }),
    );
  }

  async function leaveVoice(showNotice = true) {
    const room = roomRef.current;
    dispatchVoiceLobbyLeft(activeChannel?.id || selectedVoiceChannel?.id || "");
    roomRef.current = null;
    if (room) {
      try {
        await Promise.allSettled([
          room.localParticipant.setMicrophoneEnabled(false),
          room.localParticipant.setCameraEnabled(false),
          room.localParticipant.setScreenShareEnabled(false),
        ]);
      } catch {
        // Devices may already be unavailable while disconnecting.
      }
      room.disconnect(true);
    }
    audioRootRef.current?.replaceChildren();
    setParticipants([]);
    setMicrophoneEnabled(false);
    setCameraEnabled(false);
    setScreenShareEnabled(false);
    setPermissions(EMPTY_PERMISSIONS);
    outputMutedRef.current = false;
    setOutputMuted(false);
    setAudioBlocked(false);
    setActiveChannel(null);
    pendingExternalScreenStreamRef.current = null;
    externalScreenStreamRef.current = null;
    externalScreenTrackIdRef.current = "";
    setConnectionState("idle");
    if (showNotice) onNotice?.("Disconnected from voice.");
  }

  async function joinVoice(channel: CommunityChannel) {
    if (busy || channel.channel_type !== "voice") return;
    setBusy(true);
    onError?.("");
    try {
      if (roomRef.current) await leaveVoice(false);
      voiceLeaveDispatchedRef.current = false;
      setConnectionState(ConnectionState.Connecting);
      const token = await authenticatedFetchJson<TokenResponse>("/api/messages/livekit/token", {
        method: "POST",
        body: JSON.stringify({ roomId, channelId: channel.id }),
      });

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
      });
      roomRef.current = room;
      setActiveChannel(channel);
      setPermissions(token.permissions || EMPTY_PERMISSIONS);
      const refresh = () => refreshParticipants(room);

      room
        .on(RoomEvent.ParticipantConnected, refresh)
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.ActiveSpeakersChanged, refresh)
        .on(RoomEvent.TrackPublished, refresh)
        .on(RoomEvent.TrackUnpublished, refresh)
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.LocalTrackPublished, refresh)
        .on(RoomEvent.LocalTrackUnpublished, refresh)
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          setConnectionState(state);
          refresh();
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
        .on(RoomEvent.TrackSubscribed, (track) => {
          attachRemoteAudio(track);
          refresh();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
          refresh();
        })
        .on(RoomEvent.MediaDevicesError, (deviceError) => {
          onError?.(
            deviceError instanceof Error
              ? deviceError.message
              : "The selected media device could not be accessed.",
          );
        })
        .on(RoomEvent.Disconnected, () => {
          dispatchVoiceLobbyLeft(channel.id);
          roomRef.current = null;
          setConnectionState(ConnectionState.Disconnected);
          setParticipants([]);
          setMicrophoneEnabled(false);
          setCameraEnabled(false);
          setScreenShareEnabled(false);
          outputMutedRef.current = false;
          setOutputMuted(false);
          audioRootRef.current?.replaceChildren();
          setPermissions(EMPTY_PERMISSIONS);
          setActiveChannel(null);
        });

      await room.connect(token.serverUrl, token.participantToken, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      setConnectionState(ConnectionState.Connected);
      if (pendingExternalScreenStreamRef.current) {
        await syncExternalScreenStream(
          pendingExternalScreenStreamRef.current,
          true,
        );
      }
      refreshParticipants(room);
      onNotice?.(`Connected to ${channel.name}.`);
    } catch (error) {
      await leaveVoice(false);
      setConnectionState("error");
      onError?.(error instanceof Error ? error.message : "Voice connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMicrophone() {
    const room = roomRef.current;
    if (!room || !connected) return;
    setBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      refreshParticipants(room);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Microphone control failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room || !connected || !permissions.canPublishVideo) return;
    setBusy(true);
    onError?.("");
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled, {
        facingMode: "user",
      });
      refreshParticipants(room);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Camera control failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleScreenShare() {
    const room = roomRef.current;
    if (!room || !connected || !permissions.canShareScreen) return;
    setBusy(true);
    onError?.("");
    try {
      if (externalScreenStreamRef.current) {
        const externalStream = externalScreenStreamRef.current;
        externalScreenStreamRef.current = null;
        pendingExternalScreenStreamRef.current = null;
        externalStream.getTracks().forEach((track) => track.stop());
        await syncExternalScreenStream(null, true);
      } else {
        await room.localParticipant.setScreenShareEnabled(
          !room.localParticipant.isScreenShareEnabled,
          { audio: true },
        );
      }
      refreshParticipants(room);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Screen sharing could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function moderateParticipant(
    participant: VoiceParticipant,
    action: "mute" | "remove",
  ) {
    if (!activeChannel || participant.isLocal || !permissions.canModerateVoice) return;
    const key = `${action}:${participant.identity}`;
    setModerationBusy(key);
    onError?.("");
    try {
      const result = await authenticatedFetchJson<{ message?: string }>(
        "/api/messages/livekit/moderate",
        {
          method: "POST",
          body: JSON.stringify({
            roomId,
            channelId: activeChannel.id,
            participantIdentity: participant.identity,
            action,
          }),
        },
      );
      onNotice?.(
        result.message ||
          (action === "mute"
            ? `${participant.name} was server-muted.`
            : `${participant.name} was disconnected from voice.`),
      );
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Voice moderation failed.");
    } finally {
      setModerationBusy("");
    }
  }

  async function enableAudioPlayback() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Browser audio could not be enabled.");
    }
  }

  const runDockCommand = useEffectEvent(
    async (action: CommunityVoiceCommand["action"]) => {
    if (action === "leave") {
      await leaveVoice();
      return;
    }
    if (action === "toggle-microphone" && connected) {
      await toggleMicrophone();
      return;
    }
    if (action === "toggle-output" && connected) {
      applyOutputMuted(!outputMutedRef.current);
      return;
    }
    if (selectedVoiceChannel) {
      await joinVoice(selectedVoiceChannel);
      if (action === "toggle-output") {
        applyOutputMuted(true);
      }
      return;
    }
    onNotice?.("Select a voice room before joining voice.");
    },
  );

  useEffect(() => {
    onDockStateChange?.({
      connected,
      channelId: activeChannel?.id || "",
      channelName: activeChannel?.name || selectedVoiceChannel?.name || "",
      microphoneEnabled,
      outputMuted,
      participantCount: participants.length,
      speakingCount: activeSpeakers.length,
      participants: participants.map((participant) => ({
        identity: participant.identity,
        name: participant.name,
        isSpeaking: participant.isSpeaking,
        isLocal: participant.isLocal,
      })),
    });
  }, [
    activeChannel?.id,
    activeChannel?.name,
    activeSpeakers.length,
    connected,
    microphoneEnabled,
    onDockStateChange,
    outputMuted,
    participants,
    selectedVoiceChannel?.name,
  ]);

  useEffect(() => {
    const handleScreenStream = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          roomId?: string;
          stream?: MediaStream | null;
        }>
      ).detail;
      if (!detail || detail.roomId !== roomId) return;
      void syncExternalScreenStream(detail.stream || null);
    };

    window.addEventListener(
      "comeplayers:screen-stream",
      handleScreenStream as EventListener,
    );
    return () => {
      window.removeEventListener(
        "comeplayers:screen-stream",
        handleScreenStream as EventListener,
      );
    };
    // syncExternalScreenStream reads current refs and connection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, connectionState]);

  useEffect(() => {
    if (
      !dockCommand ||
      dockCommand.roomId !== roomId ||
      handledDockCommandRef.current === dockCommand.id
    ) {
      return;
    }
    handledDockCommandRef.current = dockCommand.id;
    void runDockCommand(dockCommand.action);
  }, [dockCommand, roomId]);

  useEffect(() => {
    if (!activeChannel || !roomRef.current) return;
    if (
      !selectedVoiceChannel ||
      selectedVoiceChannel.id !== activeChannel.id
    ) {
      void leaveVoice();
    }
    // leaveVoice uses current refs/state and must run whenever channel identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id, selectedVoiceChannel?.id]);

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        dispatchVoiceLobbyLeft(activeChannel?.id || selectedVoiceChannel?.id || "");
      }
      roomRef.current = null;
      room?.disconnect(true);
    };
    // This cleanup intentionally uses the final room/channel refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (
      spotlightParticipantId &&
      (!spotlightParticipant ||
        spotlightParticipant.videoSource !== Track.Source.ScreenShare ||
        !spotlightParticipant.videoTrack)
    ) {
      setSpotlightParticipantId("");
      setIsSpotlightFullscreen(false);
    }
  }, [spotlightParticipant, spotlightParticipantId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsSpotlightFullscreen(document.fullscreenElement === spotlightContainerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function toggleSpotlightFullscreen() {
    const container = spotlightContainerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await container.requestFullscreen();
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Fullscreen mode could not be changed.");
    }
  }

  function closeSpotlightView() {
    if (document.fullscreenElement === spotlightContainerRef.current) {
      void document.exitFullscreen();
    }
    setSpotlightParticipantId("");
    setIsSpotlightFullscreen(false);
  }

  if (!selectedVoiceChannel && !activeChannel) return null;

  const controls = activeChannel ? (
    <VoiceControls
      busy={busy}
      microphoneEnabled={microphoneEnabled}
      cameraEnabled={cameraEnabled}
      screenShareEnabled={screenShareEnabled}
      canPublishVideo={permissions.canPublishVideo}
      canShareScreen={permissions.canShareScreen}
      outputMuted={outputMuted}
      audioBlocked={audioBlocked}
      onToggleMicrophone={() => void toggleMicrophone()}
      onToggleCamera={() => void toggleCamera()}
      onToggleScreenShare={() => void toggleScreenShare()}
      onToggleOutput={() => applyOutputMuted(!outputMuted)}
      onEnableAudio={() => void enableAudioPlayback()}
      onLeave={() => void leaveVoice()}
    />
  ) : null;

  const content = !selectedVoiceChannel && activeChannel ? (
    <div
      data-community-voice-panel
      className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-emerald-200">
            <FaHeadphones className="mr-2 inline" /> Connected · {activeChannel.name}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {participants.length} participant{participants.length === 1 ? "" : "s"}
            {activeSpeakers.length
              ? ` · ${activeSpeakers.map((participant) => participant.name).join(", ")} speaking`
              : " · Everyone is listening"}
          </p>
        </div>
        {controls}
      </div>
    </div>
  ) : (
    <section
      data-community-voice-panel
      className="rounded-2xl border border-cyan-400/15 bg-[linear-gradient(145deg,rgba(4,20,38,0.96),rgba(2,10,22,0.96))] p-4 shadow-[inset_0_0_48px_rgba(34,211,238,0.035)] sm:p-5"
    >
      <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-lg text-cyan-200">
            <FaVolumeUp />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xl font-black text-white">
                {selectedVoiceChannel?.name}
              </h3>
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gray-300">
                Voice Lobby
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-400">
              {selectedVoiceChannel?.topic || "Talk, squad up, share your screen, and hang out."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-[11px] font-black ${
              activeMatchesSelected
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : "border-white/10 bg-white/[0.035] text-gray-400"
            }`}
          >
            <i className={`h-2 w-2 rounded-full ${activeMatchesSelected ? "bg-emerald-400" : "bg-gray-600"}`} />
            {activeMatchesSelected ? statusLabel(connectionState) : "Ready to Join"}
          </span>
          {!activeMatchesSelected ? (
            <button
              type="button"
              disabled={busy || !selectedVoiceChannel}
              onClick={() => selectedVoiceChannel && void joinVoice(selectedVoiceChannel)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-xs font-black text-black shadow-[0_0_22px_rgba(34,211,238,0.22)] hover:bg-cyan-300 disabled:opacity-50"
            >
              <FaHeadphones />
              {activeChannel ? "Switch Lobby" : busy ? "Connecting..." : "Join Voice"}
            </button>
          ) : null}
        </div>
      </div>

      {activeMatchesSelected ? (
        <>
          {spotlightParticipant?.videoTrack &&
          spotlightParticipant.videoSource === Track.Source.ScreenShare ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(4,20,38,0.96),rgba(2,10,22,0.98))] shadow-[inset_0_0_36px_rgba(34,211,238,0.035)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-cyan-400 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-black">
                      Big Screen
                    </span>
                    <h4 className="truncate text-sm font-black text-white sm:text-base">
                      {spotlightParticipant.name}{spotlightParticipant.isLocal ? " (You)" : ""}
                    </h4>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Click the large screen to return to tile view. Use the bottom-right button for fullscreen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSpotlightView}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-gray-300 transition hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-white"
                  title="Back to tile view"
                >
                  <FaTimes />
                </button>
              </div>

              <div
                ref={spotlightContainerRef}
                className={`group relative bg-black ${isSpotlightFullscreen ? "h-full w-full" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!isSpotlightFullscreen) closeSpotlightView();
                  }}
                  className="block w-full text-left"
                  title={isSpotlightFullscreen ? "Live fullscreen preview" : "Click to return to tile view"}
                >
                  <div className={`${isSpotlightFullscreen ? "h-screen w-screen" : "aspect-video w-full"}`}>
                    <VideoTrackView
                      track={spotlightParticipant.videoTrack}
                      mirrored={false}
                      className="h-full w-full bg-black object-contain"
                    />
                  </div>
                </button>

                <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/35 to-transparent px-4 py-3 text-white">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-red-400/30 bg-red-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-red-200">
                      Live Screen
                    </span>
                    <span className="truncate text-sm font-black">
                      {spotlightParticipant.name}{spotlightParticipant.isLocal ? " (You)" : ""}
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleSpotlightFullscreen();
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/70 px-4 text-xs font-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.38)] transition hover:border-cyan-300/35 hover:bg-cyan-400/18"
                    title={isSpotlightFullscreen ? "Exit fullscreen" : "Open fullscreen"}
                  >
                    <FaExpand />
                    {isSpotlightFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {participants.length ? (
              participants.map((participant) => (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                  canModerate={permissions.canModerateVoice}
                  moderationBusy={moderationBusy}
                  spotlightActive={spotlightParticipantId === participant.identity}
                  onMute={() => void moderateParticipant(participant, "mute")}
                  onRemove={() => void moderateParticipant(participant, "remove")}
                  onOpenSpotlight={() => setSpotlightParticipantId(participant.identity)}
                />
              ))
            ) : (
              <div className="col-span-full flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 text-center">
                <div>
                  <FaHeadphones className="mx-auto text-3xl text-cyan-300/70" />
                  <p className="mt-3 text-sm font-black text-gray-300">Waiting for players</p>
                  <p className="mt-1 text-xs text-gray-500">Invite people from the server sidebar.</p>
                </div>
              </div>
            )}
            <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-5 text-center">
              <div>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-xl text-gray-300">+</span>
                <p className="mt-3 text-sm font-black text-white">Invite Friends</p>
                <p className="mt-1 text-xs text-gray-500">Add more people to this voice lobby.</p>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-white/[0.07] pt-4">{controls}</div>
        </>
      ) : (
        <div className="mt-4 flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-black/15 text-center">
          <div>
            <FaHeadphones className="mx-auto text-4xl text-cyan-300/70" />
            <p className="mt-3 text-base font-black text-white">Enter the lobby when you are ready</p>
            <p className="mt-1 text-sm text-gray-500">Voice, video, and screen sharing are powered by LiveKit.</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <>
      {content}
      <div ref={audioRootRef} aria-hidden="true" className="hidden" />
    </>
  );
}

function ParticipantTile({
  participant,
  canModerate,
  moderationBusy,
  onMute,
  onRemove,
  spotlightActive,
  onOpenSpotlight,
}: {
  participant: VoiceParticipant;
  canModerate: boolean;
  moderationBusy: string;
  spotlightActive: boolean;
  onMute: () => void;
  onRemove: () => void;
  onOpenSpotlight: () => void;
}) {
  const showingScreen = participant.videoSource === Track.Source.ScreenShare;
  const muteBusy = moderationBusy === `mute:${participant.identity}`;
  const removeBusy = moderationBusy === `remove:${participant.identity}`;

  return (
    <article
      data-voice-participant
      className={`group relative min-h-44 overflow-hidden rounded-2xl border p-4 transition ${
        spotlightActive && showingScreen
          ? "border-cyan-300/75 bg-[radial-gradient(circle_at_50%_18%,rgba(34,211,238,0.14),rgba(0,0,0,0.2)_65%)] shadow-[0_0_30px_rgba(34,211,238,0.16)]"
          : participant.isSpeaking
            ? "border-yellow-400/65 bg-[radial-gradient(circle_at_50%_40%,rgba(250,204,21,0.12),rgba(0,0,0,0.18)_62%)] shadow-[0_0_28px_rgba(250,204,21,0.12)]"
            : "border-white/[0.075] bg-black/20 hover:border-cyan-400/25"
      }`}
    >
      <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
        {participant.isSpeaking ? (
          <span className="rounded-md bg-yellow-400 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-black">
            Speaking
          </span>
        ) : showingScreen ? (
          <span className="rounded-md bg-cyan-400 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-black">
            Screen
          </span>
        ) : null}
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        {showingScreen && participant.videoTrack ? (
          <button
            type="button"
            onClick={onOpenSpotlight}
            className="flex h-7 items-center gap-1 rounded-full border border-cyan-300/30 bg-black/70 px-2 text-[10px] font-black text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-400/20"
            title="Open big screen view"
          >
            <FaExpand /> View
          </button>
        ) : null}
        {participant.isMuted ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/25 bg-red-400/10 text-[10px] text-red-300">
            <FaMicrophoneSlash />
          </span>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-[10px] text-emerald-300">
            <FaMicrophone />
          </span>
        )}
      </div>

      {showingScreen && participant.videoTrack ? (
        <div className="flex h-full flex-col pt-7">
          <button
            type="button"
            onClick={onOpenSpotlight}
            className="relative block w-full flex-1 overflow-hidden rounded-2xl border border-cyan-400/20 bg-black text-left shadow-[inset_0_0_24px_rgba(34,211,238,0.04)] transition hover:border-cyan-300/50"
            title="Click to open big screen view"
          >
            <div className="absolute inset-0">
              <VideoTrackView
                track={participant.videoTrack}
                mirrored={false}
                className="h-full w-full bg-black object-cover"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-4 py-3 text-white">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    {participant.name}{participant.isLocal ? " (You)" : ""}
                  </p>
                  <p className="truncate text-xs text-cyan-100/80">
                    Sharing screen · Click for big screen
                  </p>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50">
                  {spotlightActive ? "Viewing" : "Open"}
                </span>
              </div>
            </div>
          </button>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center pt-5 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full">
            <span className={`absolute inset-0 rounded-full border-2 ${participant.isSpeaking ? "border-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.5)]" : "border-cyan-400/45"}`} />
            {participant.videoTrack ? (
              <VideoTrackView
                track={participant.videoTrack}
                mirrored={participant.isLocal && !showingScreen}
                className={`h-full w-full ${participant.isLocal && !showingScreen ? "-scale-x-100" : ""} object-cover`}
              />
            ) : (
              <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[linear-gradient(145deg,#13283c,#07111f)] text-3xl font-black text-cyan-100">
                {participant.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="mt-2 flex h-5 items-center justify-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, index) => (
              <i
                key={index}
                className={`block w-0.5 rounded-full ${participant.isSpeaking ? "bg-yellow-300/90" : "bg-cyan-300/35"}`}
                style={{
                  height: participant.isSpeaking
                    ? `${5 + ((index * 7) % 16)}px`
                    : `${3 + ((index * 3) % 6)}px`,
                }}
              />
            ))}
          </div>

          <p className="mt-1 max-w-full truncate text-sm font-black text-white">
            {participant.name}{participant.isLocal ? " (You)" : ""}
          </p>
          <p className={`mt-0.5 text-xs ${participant.isSpeaking ? "text-yellow-300" : "text-gray-500"}`}>
            {participant.cameraEnabled
              ? "Camera on"
              : participant.isSpeaking
                ? "Speaking"
                : participant.isMuted
                  ? "Muted"
                  : "Listening"}
          </p>
        </div>
      )}

      {canModerate && !participant.isLocal ? (
        <div className="absolute bottom-3 right-3 z-10 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            disabled={Boolean(moderationBusy)}
            onClick={onMute}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-300/35 bg-black/70 text-yellow-200 hover:bg-yellow-300 hover:text-black disabled:opacity-50"
            title="Server mute microphone"
          >
            {muteBusy ? "…" : <FaMicrophoneSlash />}
          </button>
          <button
            type="button"
            disabled={Boolean(moderationBusy)}
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-300/35 bg-black/70 text-red-200 hover:bg-red-400 hover:text-white disabled:opacity-50"
            title="Disconnect participant"
          >
            {removeBusy ? "…" : <FaUserSlash />}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function VideoTrackView({
  track,
  mirrored,
  className,
}: {
  track: Track;
  mirrored: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={className || `h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}

function VoiceControls({
  busy,
  microphoneEnabled,
  cameraEnabled,
  screenShareEnabled,
  canPublishVideo,
  canShareScreen,
  outputMuted,
  audioBlocked,
  onToggleMicrophone,
  onToggleCamera,
  onToggleScreenShare,
  onToggleOutput,
  onEnableAudio,
  onLeave,
}: {
  busy: boolean;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  canPublishVideo: boolean;
  canShareScreen: boolean;
  outputMuted: boolean;
  audioBlocked: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleOutput: () => void;
  onEnableAudio: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {audioBlocked ? (
        <button
          type="button"
          onClick={onEnableAudio}
          className="min-h-10 rounded-xl border border-yellow-400/40 px-3 text-xs font-black text-yellow-200 hover:bg-yellow-400 hover:text-black"
        >
          Enable Audio
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onToggleMicrophone}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black disabled:opacity-50 ${
          microphoneEnabled
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            : "border-red-400/35 bg-red-400/10 text-red-300"
        }`}
        title={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
      >
        {microphoneEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
        {microphoneEnabled ? "Mic On" : "Mic Off"}
      </button>
      <button
        type="button"
        disabled={busy || !canPublishVideo}
        onClick={onToggleCamera}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${
          cameraEnabled
            ? "border-blue-400/35 bg-blue-400/10 text-blue-200"
            : "border-white/10 bg-white/[0.035] text-gray-300"
        }`}
        title={canPublishVideo ? (cameraEnabled ? "Turn camera off" : "Turn camera on") : "Camera permission is disabled"}
      >
        {cameraEnabled ? <FaVideo /> : <FaVideoSlash />}
        {cameraEnabled ? "Camera On" : "Camera Off"}
      </button>
      <button
        type="button"
        disabled={busy || !canShareScreen}
        onClick={onToggleScreenShare}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${
          screenShareEnabled
            ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-200"
            : "border-white/10 bg-white/[0.035] text-gray-300"
        }`}
        title={canShareScreen ? (screenShareEnabled ? "Stop screen sharing" : "Share screen") : "Screen share permission is disabled"}
      >
        <FaDesktop />
        {screenShareEnabled ? "Stop Share" : "Share Screen"}
      </button>
      <button
        type="button"
        onClick={onToggleOutput}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black ${
          outputMuted
            ? "border-red-400/35 bg-red-400/10 text-red-300"
            : "border-white/10 bg-white/[0.035] text-gray-200"
        }`}
        title={outputMuted ? "Enable speaker audio" : "Mute speaker audio"}
      >
        {outputMuted ? <FaVolumeMute /> : <FaVolumeUp />}
        {outputMuted ? "Sound Off" : "Sound On"}
      </button>
      <button
        type="button"
        onClick={onLeave}
        className="ml-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-500 px-5 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.18)] hover:bg-red-400"
      >
        <FaPhoneSlash /> Leave Channel
      </button>
    </div>
  );
}

