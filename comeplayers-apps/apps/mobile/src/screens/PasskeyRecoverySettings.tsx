import { useEffect, useState } from "react";
import { Modal, ScrollView, Text } from "react-native";
import { PrimaryButton } from "../components";
import { usePrivateMessenger } from "../secure/PrivateProvider";
import { colors } from "../theme";
import { fetchRecoveryAccount } from "../secure/accountRecovery";
import { mobileSecureTransport } from "../secure/mobileSecureTransport";
import { openVerifiedVault } from "../secure/verifiedVault";
import { createNativePasskeyRecovery, passkeyError } from "../secure/nativePasskey";
import { proveDeviceRequest } from "../secure/multiDevice";
import type { Identity } from "../secure/crypto";

export function PasskeyRecoverySettings({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { messenger, reopen } = usePrivateMessenger();
  const openVerification = () => { onClose(); reopen(); };
  const [busy, setBusy] = useState(false), [enabled, setEnabled] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { let alive = true; void fetchRecoveryAccount(mobileSecureTransport).then(account => {
    if (alive) setEnabled(Boolean(account?.encrypted_backup.passkey));
  }).catch(reason => { if (alive) setMessage(passkeyError(reason)); }); return () => { alive = false; }; }, [userId]);
  const enable = async () => {
    if (busy || enabled) return;
    setBusy(true); setMessage("");
    try {
      const vault = await openVerifiedVault(userId), account = await fetchRecoveryAccount(mobileSecureTransport);
      const root = await vault?.get<Identity>("root-recovery-v2", userId);
      if (!vault || !root || !account) throw new Error("Open Messages to finish passkey setup or recovery, then return here. If this account has no synced passkey yet, use a device with verified chat history.");
      const own = account.roster.devices.find(item => item.id === vault.descriptor.deviceId);
      if (!own) throw new Error("This device is no longer verified for encrypted Messages.");
      const passkey = await createNativePasskeyRecovery(root);
      const path = "/api/messages/secure/account/passkey", body = JSON.stringify({ passkey });
      const proof = proveDeviceRequest({ ...own, identity: vault.descriptor.identity }, "POST", path, body);
      const result = await mobileSecureTransport<{ passkeySignature: string }>(path, { method: "POST", body, headers: {
        "x-cp-device": proof.deviceId, "x-cp-time": proof.timestamp, "x-cp-nonce": proof.nonce, "x-cp-proof": proof.signature,
      } });
      if (result.passkeySignature !== passkey.signature) throw new Error("The encrypted backup was not confirmed. Please try again.");
      setEnabled(true); setMessage("Passkey recovery is ready. Use the same synced password manager when you sign in on a new device.");
    } catch (reason) { setMessage(passkeyError(reason)); }
    finally { setBusy(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={busy ? () => undefined : onClose}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.background, padding: 24, gap: 20 }}>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800" }}>Account recovery</Text>
      <Text style={{ color: colors.textMuted, lineHeight: 23 }}>After signing in on a new device, unlock your synced passkey with your fingerprint or device PIN to restore encrypted Messages. Use a password manager that syncs your passkeys.</Text>
      {!messenger ? <>
        <Text style={{ color: colors.textMuted, lineHeight: 23 }}>Verify Messages on this device before managing account recovery. If this account still uses the previous recovery method, Messages will show its current recovery status.</Text>
        <PrimaryButton label="Open Messages verification" onPress={openVerification} />
      </> : <PrimaryButton label={enabled ? "Passkey recovery enabled" : "Enable passkey recovery"} loading={busy} disabled={busy || enabled} onPress={() => void enable()} />}
      {message ? <Text accessibilityRole="alert" style={{ color: colors.yellow, lineHeight: 22 }}>{message}</Text> : null}
      <Text style={{ color: colors.textMuted, lineHeight: 22 }}>ComePlayers stores only the encrypted backup. Keep your existing recovery key for older exported backups. Adding a passkey does not delete or change those backups.</Text>
      <PrimaryButton label="Close" tone="neutral" disabled={busy} onPress={onClose} />
    </ScrollView>
  </Modal>;
}
