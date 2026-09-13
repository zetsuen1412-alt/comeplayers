import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { Avatar } from "../components";
import { colors, radius } from "../theme";
import type { VoiceToken } from "../types";

export function VoiceLobby({
  connection,
  onLeave,
  callMode = false,
  initialVideo = false,
}: {
  connection: VoiceToken;
  onLeave: () => void;
  callMode?: boolean;
  initialVideo?: boolean;
}) {
  const [error, setError] = useState("");

  useEffect(() => {
    void AudioSession.startAudioSession().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Audio could not be started.");
    });
    return () => { void AudioSession.stopAudioSession(); };
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onLeave}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.liveDot} />
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>{callMode ? "COMEPLAYERS CALL" : "LIVE COMMUNITY LOBBY"}</Text>
            <Text style={styles.title}>{connection.channel.name}</Text>
          </View>
          <Pressable onPress={onLeave} style={styles.leaveTop}><Text style={styles.leaveTopText}>Leave</Text></Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <LiveKitRoom
          serverUrl={connection.serverUrl}
          token={connection.participantToken}
          connect
          audio
          video={initialVideo}
          options={{ adaptiveStream: { pixelDensity: "screen" }, dynacast: true }}
          onError={(reason) => setError(reason.message)}
          onDisconnected={onLeave}
        >
          <LobbyContent canPublishVideo={connection.permissions.canPublishVideo} onLeave={onLeave} />
        </LiveKitRoom>
      </View>
    </Modal>
  );
}

function LobbyContent({ canPublishVideo, onLeave }: { canPublishVideo: boolean; onLeave: () => void }) {
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [changing, setChanging] = useState(false);

  const toggleMicrophone = async () => {
    setChanging(true);
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }
    finally { setChanging(false); }
  };

  const toggleCamera = async () => {
    setChanging(true);
    try { await localParticipant.setCameraEnabled(!isCameraEnabled); }
    finally { setChanging(false); }
  };

  return (
    <View style={styles.room}>
      <ScrollView contentContainerStyle={styles.roomContent} showsVerticalScrollIndicator={false}>
        {tracks.length ? (
          <View style={styles.videoGrid}>
            {tracks.map((track, index) => <VideoTile key={trackKey(track, index)} track={track} />)}
          </View>
        ) : (
          <View style={styles.voiceHero}>
            <Text style={styles.voiceIcon}>◉</Text>
            <Text style={styles.voiceTitle}>Voice lobby connected</Text>
            <Text style={styles.voiceText}>Turn on video when you want to broadcast. Camera and shared streams from other members appear here.</Text>
          </View>
        )}

        <Text style={styles.peopleLabel}>IN THIS LOBBY · {participants.length}</Text>
        <View style={styles.peopleList}>
          {participants.map((participant) => (
            <View key={participant.identity} style={styles.person}>
              <Avatar name={participant.name || participant.identity} size={42} accent={participant.isSpeaking ? "yellow" : "blue"} />
              <View style={styles.personCopy}>
                <Text style={styles.personName}>{participant.name || participant.identity}</Text>
                <Text style={[styles.personState, participant.isSpeaking && styles.speaking]}>{participant.isSpeaking ? "Speaking" : "Connected"}</Text>
              </View>
              <View style={[styles.statusDot, participant.isSpeaking && styles.statusSpeaking]} />
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.controls}>
        <Pressable disabled={changing} onPress={() => void toggleMicrophone()} style={[styles.control, isMicrophoneEnabled && styles.controlActive]}>
          <Text style={styles.controlIcon}>{isMicrophoneEnabled ? "MIC" : "MUTE"}</Text>
          <Text style={styles.controlLabel}>{isMicrophoneEnabled ? "Mute" : "Unmute"}</Text>
        </Pressable>
        <Pressable disabled={changing || !canPublishVideo} onPress={() => void toggleCamera()} style={[styles.control, isCameraEnabled && styles.controlActive, !canPublishVideo && styles.disabled]}>
          <Text style={styles.controlIcon}>{isCameraEnabled ? "CAM" : "VIDEO"}</Text>
          <Text style={styles.controlLabel}>{isCameraEnabled ? "Stop video" : "Start video"}</Text>
        </Pressable>
        <Pressable onPress={onLeave} style={[styles.control, styles.leave]}>
          <Text style={styles.controlIcon}>END</Text>
          <Text style={styles.controlLabel}>Leave</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VideoTile({ track }: { track: TrackReferenceOrPlaceholder }) {
  if (!isTrackReference(track)) return <View style={styles.videoTile}><ActivityIndicator color={colors.blue} /></View>;
  return (
    <View style={styles.videoTile}>
      <VideoTrack trackRef={track} style={styles.video} objectFit="cover" />
      <Text style={styles.videoName}>{track.participant.name || track.participant.identity}</Text>
    </View>
  );
}

function trackKey(track: TrackReferenceOrPlaceholder, index: number) {
  return isTrackReference(track)
    ? `${track.participant.identity}-${track.source}`
    : `placeholder-${index}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 18, backgroundColor: colors.background },
  header: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  liveDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.green },
  headerCopy: { flex: 1 },
  kicker: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 3, color: colors.text, fontSize: 18, fontWeight: "900", textTransform: "capitalize" },
  leaveTop: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: "rgba(255,107,122,.12)" },
  leaveTopText: { color: colors.red, fontSize: 10, fontWeight: "900" },
  error: { margin: 12, padding: 10, borderRadius: 10, color: colors.red, fontSize: 10, backgroundColor: "rgba(255,107,122,.08)" },
  room: { flex: 1 },
  roomContent: { padding: 16, paddingBottom: 110 },
  voiceHero: { alignItems: "center", padding: 28, borderRadius: radius.large, borderWidth: 1, borderColor: "rgba(39,183,255,.28)", backgroundColor: "#071825" },
  voiceIcon: { color: colors.blue, fontSize: 48 },
  voiceTitle: { marginTop: 12, color: colors.text, fontSize: 22, fontWeight: "900" },
  voiceText: { marginTop: 8, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center" },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  videoTile: { width: "48%", aspectRatio: .78, overflow: "hidden", alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: colors.panel },
  video: { width: "100%", height: "100%" },
  videoName: { position: "absolute", left: 8, bottom: 7, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, color: colors.white, fontSize: 8, fontWeight: "900", backgroundColor: "rgba(0,0,0,.65)" },
  peopleLabel: { marginTop: 22, color: colors.textDim, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  peopleList: { gap: 8, marginTop: 9 },
  person: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 62, paddingHorizontal: 12, borderRadius: radius.medium, backgroundColor: colors.panel },
  personCopy: { flex: 1 },
  personName: { color: colors.text, fontSize: 12, fontWeight: "900" },
  personState: { marginTop: 3, color: colors.textMuted, fontSize: 9 },
  speaking: { color: colors.yellow },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusSpeaking: { backgroundColor: colors.yellow },
  controls: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 88, flexDirection: "row", gap: 9, padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "rgba(5,7,12,.98)" },
  control: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: colors.panelStrong },
  controlActive: { borderWidth: 1, borderColor: "rgba(54,226,160,.45)", backgroundColor: "rgba(54,226,160,.1)" },
  controlIcon: { color: colors.text, fontSize: 10, fontWeight: "900" },
  controlLabel: { marginTop: 4, color: colors.textMuted, fontSize: 8, fontWeight: "800" },
  leave: { backgroundColor: "rgba(255,107,122,.13)" },
  disabled: { opacity: .35 },
});
