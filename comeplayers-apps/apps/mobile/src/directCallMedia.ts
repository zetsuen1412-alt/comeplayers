import type { AudioCaptureOptions, RoomOptions, VideoCaptureOptions } from "livekit-client";

// Calls favor speech and a single modest camera stream over conference defaults.
// Keep packet-loss recovery and echo cancellation enabled on slower connections.
export const directCallAudio: AudioCaptureOptions = {
  echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
};
export const directCallVideo: VideoCaptureOptions = {
  facingMode: "user", resolution: { width: 640, height: 480, frameRate: 20 },
};
export const directCallRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: directCallVideo,
  audioCaptureDefaults: directCallAudio,
  publishDefaults: {
    audioPreset: { maxBitrate: 24_000 }, dtx: true, red: true, forceStereo: false,
    simulcast: false, videoCodec: "vp8",
    videoEncoding: { maxBitrate: 500_000, maxFramerate: 20 },
    degradationPreference: "balanced",
  },
};
