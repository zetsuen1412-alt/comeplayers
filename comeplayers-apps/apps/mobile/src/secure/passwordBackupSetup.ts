import { fetchRecoveryAccount } from "./accountRecovery";
import { mobileSecureTransport } from "./mobileSecureTransport";
import { openVerifiedVault } from "./verifiedVault";
import { openPasswordRecovery, sealPasswordRecovery } from "./passwordRecovery";
import { fingerprint, type Identity } from "./crypto";
import { proveDeviceRequest, rosterHash, verifyRoster } from "./multiDevice";
import { supabase } from "../runtime";

export async function enablePasswordBackup(userId: string, password: string): Promise<void> {
  const assertUser = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen settings.");
  };
  await assertUser();
  const vault = await openVerifiedVault(userId), account = await fetchRecoveryAccount(mobileSecureTransport);
  const root = await vault?.get<Identity>("root-recovery-v2", userId);
  if (!vault || !root || !account) throw new Error("Buka chat di perangkat ini terlebih dahulu.");
  verifyRoster(account.roster, root);
  const own = account.roster.devices.find(device => device.id === vault.descriptor.deviceId);
  if (rosterHash(account.roster) !== account.roster_hash || !own || fingerprint(own.identity) !== fingerprint(vault.descriptor.identity)) throw new Error("The device list changed. Reopen settings.");
  // Resolve a lost success response with the password the user already chose.
  if (account.encrypted_backup.password) {
    await openPasswordRecovery(account.encrypted_backup.password, password, root);
    return;
  }
  const { recovery } = await sealPasswordRecovery(root, password);
  await assertUser();
  const path = "/api/messages/secure/account/password", body = JSON.stringify({ recovery });
  const proof = proveDeviceRequest({ ...own, identity: vault.descriptor.identity }, "POST", path, body);
  const result = await mobileSecureTransport<{ passwordSignature: string }>(path, { method: "POST", body, headers: {
    "x-cp-device": proof.deviceId, "x-cp-time": proof.timestamp, "x-cp-nonce": proof.nonce, "x-cp-proof": proof.signature,
  } });
  await assertUser();
  if (result.passwordSignature !== recovery.signature) throw new Error("The encrypted backup was not confirmed. Please try again.");
}
