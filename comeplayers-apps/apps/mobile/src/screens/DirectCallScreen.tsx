import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AudioSession, LiveKitRoom, useTracks, VideoTrack, isTrackReference } from "@livekit/react-native";
import { Room, RoomEvent, Track, createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";
import { Avatar } from "../components";
import type { VoiceToken } from "../types";
import type { CallRecord } from "../messagingApi";
import { PrivateMediaEncryption } from "../secure/PrivateMediaEncryption";
import { unhex } from "../secure/crypto";
import { colors } from "../theme";

export function DirectCallScreen({ connection, call, peerId, sharedKey, onLeave, onRetry }: { connection: VoiceToken; call: CallRecord; peerId: string; sharedKey?: string; onLeave: () => void; onRetry: () => void }) {
  const [room, setRoom] = useState<Room | null>(null), [error, setError] = useState(""), [mic, setMic] = useState(true), [video, setVideo] = useState(call.media === "video"), [speaker, setSpeaker] = useState(call.media === "video");
  const audioTrack = useRef<LocalAudioTrack | null>(null), videoTrack = useRef<LocalVideoTrack | null>(null), [seconds, setSeconds] = useState(0);
  const leaveRef = useRef(onLeave); leaveRef.current = onLeave;
  useEffect(() => {
    let alive = true;
    const encryption = sharedKey ? new PrivateMediaEncryption(peerId, e => { if (alive) setError(e.message); }) : null;
    const next = new Room({ ...(encryption ? { e2ee: { e2eeManager: encryption } } : {}), adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: false, videoCodec: "vp8" }, videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } } });
    next.on(RoomEvent.Disconnected, () => {
      if (alive) { setRoom(null); setError("Call disconnected. Tap Retry connection."); }
    });
    const tracks: (LocalAudioTrack | LocalVideoTrack)[] = [];
    void (async () => {
      if (encryption && sharedKey) { await encryption.initialize(unhex(sharedKey)); await next.setE2EEEnabled(true); }
      await AudioSession.startAudioSession();
      await next.connect(connection.serverUrl, connection.participantToken, { autoSubscribe: !encryption });
      if (!alive) return;
      if (encryption && !next.isE2EEEnabled) throw new Error("Encrypted media could not be enabled.");
      const audio = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true }); audio.mediaStreamTrack.enabled = false; tracks.push(audio);
      const audioPub = await next.localParticipant.publishTrack(audio, { source: Track.Source.Microphone });
      await encryption?.waitForTrack(audioPub.trackSid); if (!alive) return;
      audio.mediaStreamTrack.enabled = true; audioTrack.current = audio;
      if (call.media === "video") {
        const camera = await createLocalVideoTrack({ resolution: { width: 640, height: 480, frameRate: 24 } }); camera.mediaStreamTrack.enabled = false; tracks.push(camera);
        const publication = await next.localParticipant.publishTrack(camera, { source: Track.Source.Camera, simulcast: false, videoCodec: "vp8" });
        await encryption?.waitForTrack(publication.trackSid); if (!alive) return;
        camera.mediaStreamTrack.enabled = true; videoTrack.current = camera;
      }
      if (alive) setRoom(next);
      await AudioSession.selectAudioOutput(call.media === "video" ? "speaker" : "earpiece").catch(() => undefined);
    })().catch(e => { for (const track of tracks) track.stop(); void next.disconnect(); void AudioSession.stopAudioSession(); if (alive) { setRoom(null); setError(e instanceof Error ? e.message : "Call could not connect."); } }).finally(() => { if (!alive) { for (const track of tracks) track.stop(); void next.disconnect(); } });
    const timer = setInterval(() => { if (next.state === "connected") setSeconds(value => value + 1); }, 1000);
    return () => { alive = false; clearInterval(timer); for (const track of tracks) track.stop(); void next.disconnect().finally(() => encryption?.dispose()); void AudioSession.stopAudioSession(); };
  }, [connection, call.id, call.media, peerId, sharedKey]);
  const control = async (work: () => Promise<void>) => { try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Call control failed."); } };
  return <Modal visible animationType="slide" onRequestClose={onLeave}><View style={s.page}>
    <Text style={s.secure}>{sharedKey ? "End-to-end encrypted private call" : "Private call · ComePlayers account"}</Text>
    {room ? <LiveKitRoom room={room} serverUrl={connection.serverUrl} token={connection.participantToken} connect={false}><PrivateVideoTiles /></LiveKitRoom> : error ? null : <ActivityIndicator color={colors.yellow} />}
    <View style={s.contact}><Avatar name={call.other?.username || "Contact"} uri={call.other?.avatar_url} size={90} /><Text style={s.name}>{call.other?.username || call.other?.full_name || "ComePlayers contact"}</Text><Text style={s.note}>{error || (room ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Connecting call…")}</Text></View>
    {error ? <Pressable accessibilityRole="button" onPress={onRetry} style={s.retry}><Text style={s.retryText}>Retry connection</Text></Pressable> : null}
    <View style={s.controls}><Control icon={mic ? "mic" : "mic-off"} label={mic ? "Mute" : "Unmute"} onPress={() => void control(async () => { if (!audioTrack.current) return; if (mic) await audioTrack.current.mute(); else await audioTrack.current.unmute(); setMic(!mic); })} />{call.media === "video" ? <><Control icon={video ? "videocam" : "videocam-off"} label="Camera" onPress={() => void control(async () => { if (!videoTrack.current) return; if (video) await videoTrack.current.mute(); else await videoTrack.current.unmute(); setVideo(!video); })} /><Control icon="camera-reverse" label="Flip" onPress={() => void control(async () => { const track = videoTrack.current; if (track) await track.restartTrack({ facingMode: track.mediaStreamTrack.getSettings().facingMode === "user" ? "environment" : "user" }); })} /></> : null}<Control icon={speaker ? "volume-high" : "ear"} label="Speaker" onPress={() => void control(async () => { await AudioSession.selectAudioOutput(speaker ? "earpiece" : "speaker"); setSpeaker(!speaker); })} /><Control icon="call" label="End" danger onPress={onLeave} /></View>
  </View></Modal>;
}
function PrivateVideoTiles() { const tracks = useTracks([Track.Source.Camera]); const remote = tracks.find(t => !t.participant.isLocal && isTrackReference(t)), local = tracks.find(t => t.participant.isLocal && isTrackReference(t)); return <View style={s.videos}>{remote && isTrackReference(remote) ? <VideoTrack trackRef={remote} style={s.remote} /> : null}{local && isTrackReference(local) ? <VideoTrack trackRef={local} style={s.local} /> : null}</View>; }
function Control({ icon, label, onPress, danger = false }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; danger?: boolean }) { return <Pressable accessibilityLabel={label} onPress={onPress} style={s.control}><View style={[s.circle, danger && { backgroundColor: "#ae263f" }]}><Ionicons name={icon} size={25} color={colors.text} /></View><Text style={s.note}>{label}</Text></Pressable>; }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.background, paddingTop: 35 }, secure: { color: colors.textMuted, textAlign: "center", padding: 12, fontSize: 12 }, contact: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 20 }, name: { color: colors.text, fontSize: 25, fontWeight: "700" }, note: { color: colors.textMuted, fontSize: 13, textAlign: "center" }, retry: { alignSelf: "center", minHeight: 48, justifyContent: "center", paddingHorizontal: 24, borderRadius: 14, backgroundColor: colors.yellow }, retryText: { color: colors.background, fontWeight: "700" }, controls: { flexDirection: "row", justifyContent: "space-evenly", padding: 15, paddingBottom: 36, gap: 8 }, control: { alignItems: "center", gap: 10 }, circle: { width: 52, height: 52, borderRadius: 28, backgroundColor: colors.panelStrong, justifyContent: "center", alignItems: "center" }, videos: { height: "45%", width: "100%" }, remote: { width: "100%", height: "100%" }, local: { position: "absolute", right: 15, bottom: 10, width: 105, height: 140, borderRadius: 16 } });
