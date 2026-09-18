import { GoogleSignin } from "@react-native-google-signin/google-signin";

export { GoogleSignin };
export const googleWebClientId = String(process.env.EXPO_PUBLIC_GOOGLE_AUTH_WEB_CLIENT_ID || "").trim();
if (googleWebClientId) GoogleSignin.configure({ webClientId: googleWebClientId, offlineAccess: false });

export function assertGoogleAccountEmail(actual: string, expected?: string | null) {
  if (!expected) return;
  if (actual.trim().toLowerCase() !== expected.trim().toLowerCase()) {
    throw new Error(`Use Google Drive with the same email as your ComePlayers account: ${expected}`);
  }
}

export async function googleDriveAccess(expectedEmail?: string | null): Promise<{ accessToken: string; email: string }> {
  if (!googleWebClientId) throw new Error("Google sign-in is not configured for this release.");
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  if (!GoogleSignin.getCurrentUser()) {
    const result = await GoogleSignin.signIn();
    if (result.type !== "success") throw new Error("Google Drive connection cancelled.");
  }
  const granted = await GoogleSignin.addScopes({ scopes: ["https://www.googleapis.com/auth/drive.appdata"] });
  if (!granted || granted.type !== "success") throw new Error("Google Drive backup permission was not granted.");
  const email = granted.data.user.email;
  assertGoogleAccountEmail(email, expectedEmail);
  const { accessToken } = await GoogleSignin.getTokens();
  if (!accessToken) throw new Error("Google Drive could not authorize this device.");
  return { accessToken, email };
}
