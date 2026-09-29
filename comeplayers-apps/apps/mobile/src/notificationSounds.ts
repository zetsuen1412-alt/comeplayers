import { useCallback, useEffect, useRef } from "react";
import { AppState, Vibration } from "react-native";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";

const MESSAGE_SOUND = require("../assets/sounds/comeplayers_message.wav");
const CALL_SOUND = require("../assets/sounds/comeplayers_call.wav");

export function useMessageChime() {
  const player = useAudioPlayer(MESSAGE_SOUND);
  const lastPlayed = useRef(0);
  return useCallback(() => {
    if (AppState.currentState !== "active" || Date.now() - lastPlayed.current < 1500) return;
    lastPlayed.current = Date.now();
    void (async () => {
      await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" });
      await player.seekTo(0);
      if (AppState.currentState === "active") player.play();
    })().catch(() => undefined);
  }, [player]);
}

export function useIncomingRingtone(ringing: boolean) {
  const player = useAudioPlayer(CALL_SOUND);
  useEffect(() => {
    let alive = true;
    const stop = () => { player.pause(); Vibration.cancel(); };
    const update = async () => {
      if (!ringing || AppState.currentState !== "active") { stop(); return; }
      await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" });
      if (!alive || AppState.currentState !== "active") return;
      player.loop = true;
      await player.seekTo(0);
      if (!alive || AppState.currentState !== "active") return;
      player.play();
      Vibration.vibrate([0, 400, 300, 400, 2200], true);
    };
    void update().catch(() => undefined);
    const listener = AppState.addEventListener("change", () => { void update().catch(() => undefined); });
    return () => { alive = false; listener.remove(); stop(); };
  }, [player, ringing]);
}
