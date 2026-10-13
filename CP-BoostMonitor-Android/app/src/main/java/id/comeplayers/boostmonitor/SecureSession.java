package id.comeplayers.boostmonitor;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Supabase session encrypted at rest using a non-exportable Android Keystore key. */
final class SecureSession {
    private static final String ALIAS = "cp_boost_payroll_session_v1";
    private final SharedPreferences prefs;
    SecureSession(Context context) { prefs = context.getSharedPreferences("payroll_session_secure", Context.MODE_PRIVATE); }

    boolean exists() { return prefs.contains("session"); }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        KeyStore.Entry entry = ks.getEntry(ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return generator.generateKey();
    }

    synchronized void save(JSONObject session) throws Exception {
        if (session.optString("accessToken").isEmpty() || session.optString("refreshToken").isEmpty())
            throw new IllegalArgumentException("Token sesi kosong.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(session.toString().getBytes(StandardCharsets.UTF_8));
        prefs.edit().putString("session", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit();
    }

    synchronized JSONObject load() throws Exception {
        String data = prefs.getString("session", "");
        if (data.isEmpty()) return null;
        String[] pieces = data.split("\\.", -1);
        if (pieces.length != 2) throw new IllegalStateException("Penyimpanan sesi tidak valid.");
        byte[] iv = Base64.decode(pieces[0], Base64.DEFAULT);
        byte[] bytes = Base64.decode(pieces[1], Base64.DEFAULT);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new JSONObject(new String(cipher.doFinal(bytes), StandardCharsets.UTF_8));
    }

    synchronized void clear() { prefs.edit().remove("session").commit(); }
}