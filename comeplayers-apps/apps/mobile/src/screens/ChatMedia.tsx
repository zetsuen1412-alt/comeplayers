import { memo, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import type { ChatAttachment } from "@comeplayers/chat-core";
import { chatClient } from "../runtime";
import { colors } from "../theme";

export type PendingAttachment = { uri: string; name: string; type: string; size?: number };
export const ChatMedia = memo(function ChatMedia({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState("");
  const [viewing, setViewing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isImage = attachment.mime_type.startsWith("image/");
  const isAudio = attachment.mime_type.startsWith("audio/");
  useEffect(() => {
    let alive = true;
    if (isImage) void chatClient.getAttachmentLink(attachment.id).then(r => { if (alive) setUrl(r.url); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [attachment.id, isImage]);
  const open = async () => {
    if (busy) return; setBusy(true); setError("");
    try { const r = await chatClient.getAttachmentLink(attachment.id); setUrl(r.url); if (isImage || isAudio || attachment.mime_type.startsWith("video/")) setViewing(true); else await Linking.openURL(r.url); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open attachment."); }
    finally { setBusy(false); }
  };
  return <><Pressable accessibilityLabel={`Open ${attachment.file_name}`} onPress={() => void open()} style={s.attachment}>{isImage && url ? <Image source={{ uri: url }} resizeMode="cover" style={s.preview} onError={() => { setUrl(""); setError("Image unavailable. Tap to retry."); }} /> : <View style={s.file}><Ionicons name={isAudio ? "mic" : attachment.mime_type.startsWith("video/") ? "videocam" : "document-text-outline"} size={30} color={colors.yellow} /><View style={{ flex: 1 }}><Text numberOfLines={2} style={s.text}>{isAudio ? "Voice message" : attachment.file_name}</Text><Text style={s.note}>{(attachment.size_bytes / 1024).toFixed(0)} KB · Tap to open</Text></View></View>}{busy ? <ActivityIndicator color={colors.yellow} /> : null}{error ? <Text style={s.error}>{error}</Text> : null}</Pressable><Modal visible={viewing} onRequestClose={() => setViewing(false)} animationType="fade"><View style={s.viewer}><Pressable style={s.close} onPress={() => setViewing(false)}><Text style={s.text}>Close</Text></Pressable>{viewing && url ? isImage ? <Image source={{ uri: url }} style={s.fullImage} resizeMode="contain" /> : isAudio ? <AudioPlayback url={url} /> : <VideoPlayback url={url} /> : null}</View></Modal></>;
});
export function AudioPlayback({ url, compact = false }: { url: string; compact?: boolean }) {
  const player = useAudioPlayer(url);
  const state = useAudioPlayerStatus(player);
  return <View style={compact ? { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 } : s.playback}>{!compact ? <><Ionicons name="mic-outline" size={65} color={colors.yellow} /><Text style={s.text}>Voice message</Text></> : null}<Text style={s.note}>{Math.floor(state.currentTime || 0)} / {Math.floor(state.duration || 0)} seconds</Text><Pressable accessibilityLabel={state.playing ? "Pause" : "Play voice message"} style={[s.control, compact && { padding: 10 }]} onPress={() => { if (state.playing) player.pause(); else { if (state.didJustFinish || player.currentTime >= player.duration) void player.seekTo(0); player.play(); } }}><Ionicons name={state.playing ? "pause" : "play"} size={compact ? 20 : 30} color={colors.background} /></Pressable></View>;
}
function VideoPlayback({ url }: { url: string }) { const player = useVideoPlayer(url); return <VideoView style={s.fullImage} player={player} nativeControls fullscreenOptions={{ enable: true }} />; }

export function VoiceRecorder({ onReady, onCancel }: { onReady: (file: PendingAttachment) => void; onCancel: () => void }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, bitRate: 64000, numberOfChannels: 1 });
  const state = useAudioRecorderState(recorder);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Allow microphone access to record a voice message.");
      if (!alive) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (alive) recorder.record();
    })().catch(e => { if (alive) setError(e.message); });
    const listener = AppState.addEventListener("change", next => { if (next !== "active") { void recorder.stop().catch(() => undefined); onCancel(); } });
    return () => { alive = false; listener.remove(); void recorder.stop().catch(() => undefined); void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined); };
  }, [recorder]);
  const stop = async () => {
    if (stopping) return; setStopping(true);
    try { await recorder.stop(); if (!recorder.uri) throw new Error("No recording was captured."); onReady({ uri: recorder.uri, name: `voice-${Date.now()}.m4a`, type: "audio/mp4" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Recording failed."); setStopping(false); }
  };
  useEffect(() => { if (state.isRecording && state.durationMillis >= 120000) void stop(); }, [state.durationMillis]);
  return <View style={s.recording}><Pressable accessibilityLabel="Cancel recording" onPress={onCancel}><Ionicons name="trash-outline" size={24} color={colors.red} /></Pressable><View style={{ flex: 1 }}><Text style={s.text}>{error || `Recording · ${Math.floor(state.durationMillis / 1000)}s / 120s`}</Text><Text style={s.note}>Stop to review before sending.</Text></View><Pressable disabled={stopping || !state.isRecording} accessibilityLabel="Stop recording" onPress={() => void stop()}><Ionicons name="stop-circle" size={40} color={colors.yellow} /></Pressable></View>;
}
const s = StyleSheet.create({ attachment: { marginVertical: 5, minWidth: 200, maxWidth: 280 }, preview: { width: 225, height: 180, borderRadius: 11, backgroundColor: colors.panel }, file: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }, text: { color: colors.text, fontSize: 15 }, note: { color: colors.textMuted, fontSize: 12, marginTop: 5 }, error: { color: colors.red, fontSize: 12 }, viewer: { flex: 1, backgroundColor: colors.background }, close: { alignSelf: "flex-end", padding: 25, marginTop: 30 }, fullImage: { flex: 1, width: "100%" }, playback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 22 }, control: { padding: 22, borderRadius: 50, backgroundColor: colors.yellow }, recording: { flexDirection: "row", alignItems: "center", padding: 20, gap: 15, backgroundColor: colors.panel } });
