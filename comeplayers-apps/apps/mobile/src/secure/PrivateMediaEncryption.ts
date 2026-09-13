import { EncryptionEvent, ParticipantEvent, RoomEvent, type BaseE2EEManager, type E2EEManagerCallbacks, type LocalTrackPublication, type RemoteTrackPublication, type Room } from "livekit-client";
import { RTCFrameCryptorFactory, RTCFrameCryptorAlgorithm, type RTCFrameCryptor, type RTCRtpReceiver, type RTCRtpSender } from "@livekit/react-native-webrtc";

// Adapter for the SDK's native AES-GCM frame cryptor. It does not implement a
// cipher. Publication stays disabled until the native cryptor confirms readiness.
export class PrivateMediaEncryption implements BaseE2EEManager {
  private statusListeners: E2EEManagerCallbacks[EncryptionEvent.ParticipantEncryptionStatusChanged][] = [];
  on<E extends keyof E2EEManagerCallbacks>(event: E, listener: E2EEManagerCallbacks[E]): this {
    if (event === EncryptionEvent.ParticipantEncryptionStatusChanged) this.statusListeners.push(listener as E2EEManagerCallbacks[EncryptionEvent.ParticipantEncryptionStatusChanged]);
    return this;
  }
  isEnabled = true;
  isDataChannelEncryptionEnabled = false;
  private room?: Room;
  private stopped = false;
  private provider = RTCFrameCryptorFactory.createDefaultKeyProvider({ sharedKey: true, ratchetSalt: "ComePlayersPrivateMediaV1", ratchetWindowSize: 0, keyRingSize: 1, failureTolerance: 0, discardFrameWhenCryptorNotReady: true, uncryptedMagicBytes: new Uint8Array() });
  private cryptors = new Map<string, RTCFrameCryptor>();
  private pending = new Map<string, Promise<void>>();
  constructor(private peerId: string, private fail: (error: Error) => void) {}
  async initialize(key: Uint8Array) { if (key.length !== 32) throw new Error("Invalid private call key."); if (!(await this.provider.setSharedKey(key, 0))) throw new Error("The native call key could not be installed."); }
  setup(room: Room) {
    this.room = room;
    room.localParticipant.on(ParticipantEvent.LocalTrackPublished, publication => this.attach(publication, room.localParticipant.identity, true));
    room.on(RoomEvent.SignalConnected, () => this.setParticipantCryptorEnabled(true, room.localParticipant.identity));
    room.on(RoomEvent.ParticipantConnected, participant => { if (participant.identity !== this.peerId) this.abort(new Error("An unexpected participant attempted to join the private call.")); });
    room.on(RoomEvent.TrackPublished, (publication, participant) => this.subscribe(publication, participant.identity));
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      track.mediaStreamTrack.enabled = false;
      if (participant.identity !== this.peerId || !publication.isEncrypted) { this.abort(new Error("Unencrypted media was rejected.")); return; }
      this.attach(publication, participant.identity, false);
      void this.waitForTrack(publication.trackSid).then(() => { if (!this.stopped) track.mediaStreamTrack.enabled = true; }).catch(error => this.abort(error));
    });
    room.on(RoomEvent.Connected, () => { for (const participant of room.remoteParticipants.values()) { if (participant.identity !== this.peerId) { this.abort(new Error("Unexpected private call participant.")); return; } for (const pub of participant.trackPublications.values()) this.subscribe(pub, participant.identity); } });
    room.on(RoomEvent.LocalTrackUnpublished, publication => void this.release(publication.trackSid));
    room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => void this.release(publication.trackSid));
  }
  private subscribe(publication: RemoteTrackPublication, identity: string) {
    if (identity !== this.peerId || !publication.isEncrypted) { this.abort(new Error("This contact cannot join an encrypted call.")); return; }
    publication.setSubscribed(true);
  }
  private attach(publication: LocalTrackPublication | RemoteTrackPublication, identity: string, local: boolean) {
    const track = publication.track;
    if (this.stopped || !track || !publication.isEncrypted) { this.abort(new Error("Private call encryption is unavailable.")); return; }
    if (this.pending.has(publication.trackSid)) return;
    const start = async () => {
      const algorithm = RTCFrameCryptorAlgorithm.kAesGcm;
      const cryptor = local
        ? RTCFrameCryptorFactory.createFrameCryptorForRtpSender(identity, (track as unknown as { sender: RTCRtpSender }).sender, algorithm, this.provider)
        : RTCFrameCryptorFactory.createFrameCryptorForRtpReceiver(identity, (track as unknown as { receiver: RTCRtpReceiver }).receiver, algorithm, this.provider);
      this.cryptors.set(publication.trackSid, cryptor);
      cryptor.addEventListener("framecryptorstatechanged", event => {
        // Native library reports string states. Missing/incorrect keys are fatal,
        // never a reason to retry with plaintext transport.
        const state = String(event.state);
        if (["encryptionFailed", "decryptionFailed", "internalError", "missingKey", "2", "3", "4", "6"].includes(state)) this.abort(new Error("Media encryption failed. The call was disconnected."));
      });
      await cryptor.setKeyIndex(0); await cryptor.setEnabled(true);
      if (!(await cryptor.getEnabled()) || this.stopped) throw new Error("The native media cryptor is not ready.");
    };
    const operation = start(); this.pending.set(publication.trackSid, operation);
    void operation.catch(error => this.abort(error));
  }
  async waitForTrack(id: string) { const pending = this.pending.get(id); if (!pending) throw new Error("Encrypted media was not initialized."); await pending; }
  private abort(error: Error) { if (this.stopped) return; this.stopped = true; for (const pub of this.room?.localParticipant.trackPublications.values() || []) pub.track?.stop(); void this.room?.disconnect(); this.fail(error); }
  private async release(id: string) { const cryptor = this.cryptors.get(id); this.cryptors.delete(id); this.pending.delete(id); if (cryptor) await cryptor.dispose(); }
  async dispose() { this.stopped = true; await Promise.allSettled([...this.cryptors.keys()].map(id => this.release(id))); await this.provider.dispose(); }
  setupEngine() { /* Native WebRTC owns RTP encryption. */ }
  setParticipantCryptorEnabled(enabled: boolean, identity: string) {
    if (!enabled) { this.abort(new Error("Private call encryption cannot be disabled.")); return; }
    const participant = this.room?.getParticipantByIdentity(identity) || (identity === this.room?.localParticipant.identity ? this.room.localParticipant : null);
    if (participant) for (const listener of this.statusListeners) listener(true, participant);
  }
  setSifTrailer() { /* Do not accept a server-provided plaintext bypass trailer. */ }
  async encryptData(): Promise<never> { throw new Error("Private call control uses the authenticated encrypted relay."); }
  async handleEncryptedData(): Promise<never> { throw new Error("Private call control uses the authenticated encrypted relay."); }
}
