import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../components";
import { colors } from "../theme";
import { activatePasskeySetup, type SecureSetup } from "./secureSetup";
import { passkeyError } from "./nativePasskey";

export function SecureDeviceSetup({ userId, setup, error, onActivated, onRetry }: { userId: string; setup: SecureSetup | null; error: string; onActivated: () => void; onRetry: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const autoAttempted = useRef(false);
  const accountRecoveryReady = setup?.kind === "new" || Boolean(setup?.snapshot.encrypted_backup.passkey);

  const activateAccountRecovery = useCallback(async () => {
    if (!setup) return;
    setBusy(true); setMessage("");
    try {
      await activatePasskeySetup(userId, setup);
      onActivated();
    } catch (reason) {
      setMessage(passkeyError(reason));
    } finally {
      setBusy(false);
    }
  }, [onActivated, setup, userId]);

  useEffect(() => {
    if (!setup || !accountRecoveryReady || autoAttempted.current) return;
    autoAttempted.current = true;
    void activateAccountRecovery();
  }, [accountRecoveryReady, activateAccountRecovery, setup]);

  return <Modal visible animationType="slide" onRequestClose={() => undefined}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.lock}><Text style={s.lockText}>🔒</Text></View>
    <Text style={s.title}>{setup?.kind === "recover" ? "Secure account sign-in" : "Protect your Messages"}</Text>
    {!setup && !error ? <><ActivityIndicator color={colors.yellow} /><Text style={s.copy}>Connecting encrypted Messages to your ComePlayers account…</Text></> : null}
    {error ? <><Text style={s.error}>{error}</Text><PrimaryButton label="Try again" onPress={onRetry} /></> : null}

    {setup?.kind === "new" ? <>
      <Text style={s.copy}>Your ComePlayers account is being connected to end-to-end encrypted Messages. On a new phone or PC, sign in to the same account and confirm with your fingerprint or device PIN. There is no 64-character recovery code to type.</Text>
      <PrimaryButton label="Continue secure sign-in" loading={busy} disabled={busy} onPress={() => void activateAccountRecovery()} />
      <Text style={s.warning}>A synced device passkey protects the encryption secret. ComePlayers receives only encrypted backup data and cannot read your Messages.</Text>
    </> : null}

    {setup?.kind === "recover" && setup.snapshot.encrypted_backup.passkey ? <>
      <Text style={s.copy}>You are already signed in to the correct ComePlayers account. Confirm your fingerprint or device PIN to unlock the account-protected encryption backup and restore synced history.</Text>
      <PrimaryButton label="Continue secure sign-in" loading={busy} disabled={busy} onPress={() => void activateAccountRecovery()} />
    </> : null}

    {setup?.kind === "recover" && !setup.snapshot.encrypted_backup.passkey ? <>
      <Text style={s.copy}>This encrypted account was created before account-integrated recovery was enabled. Open ComePlayers once on a previously verified device and enable Account recovery from Profile. Then return here and check again.</Text>
      <Text style={s.warning}>Login credentials alone cannot decrypt old ciphertext without giving the server access to your encryption key, which would weaken end-to-end encryption.</Text>
      <PrimaryButton label="Check account recovery again" disabled={busy} onPress={onRetry} />
    </> : null}

    {message ? <Text style={s.error}>{message}</Text> : null}
    <Text style={s.note}>Messages, files and private call keys remain end-to-end encrypted. Normal recovery is tied to your ComePlayers account plus your device security, not a manually entered recovery code.</Text>
    <Pressable accessibilityRole="button" onPress={onRetry} disabled={busy}><Text style={s.retry}>Refresh secure account status</Text></Pressable>
  </ScrollView></Modal>;
}

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 20, backgroundColor: colors.background },
  lock: { alignSelf: "center", width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  lockText: { fontSize: 34 }, title: { color: colors.text, fontSize: 28, lineHeight: 35, fontWeight: "800", textAlign: "center" },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  warning: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  error: { color: colors.red, textAlign: "center", lineHeight: 21 }, note: { color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: "center" },
  retry: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center", textDecorationLine: "underline" },
});
