import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../components";
import { supabase } from "../runtime";
import { colors } from "../theme";

export function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;
      const factor = data.totp[0];
      if (!factor) throw new Error("No authenticator was found. Sign in again.");
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verifyError) throw verifyError;
      onVerified();
    } catch (e) { setError(e instanceof Error ? e.message : "Verification failed."); }
    finally { setBusy(false); }
  };
  return <View style={s.page}><Text style={s.title}>Two-step verification</Text><Text style={s.note}>Enter the current code from your authenticator app to unlock this session.</Text><TextInput accessibilityLabel="Authenticator code" style={s.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoFocus /><PrimaryButton label="Verify" loading={busy} disabled={!/^\d{6}$/.test(code)} onPress={() => void verify()} />{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}<PrimaryButton tone="neutral" label="Sign out" onPress={() => void supabase.auth.signOut()} /></View>;
}
const s = StyleSheet.create({ page: { flex: 1, justifyContent: "center", padding: 28, gap: 20, backgroundColor: colors.background }, title: { color: colors.text, fontSize: 26, fontWeight: "700" }, note: { color: colors.textMuted, fontSize: 16, lineHeight: 24 }, input: { color: colors.text, backgroundColor: colors.panel, padding: 18, borderRadius: 15, fontSize: 24, letterSpacing: 5 }, error: { color: colors.red } });
