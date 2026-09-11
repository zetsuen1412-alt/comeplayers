import test from "node:test";
import assert from "node:assert/strict";
import { createIdentity, publicIdentity, sealMessage, registrationProof, requestProof } from "../../comeplayers-apps/apps/mobile/src/secure/crypto";
import { verifyEnvelope, verifySignature, publicDevice, hash, type PrivateDevice } from "../lib/privateMessaging";

const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",room="44444444-4444-4444-8444-444444444444",deviceId="66666666-6666-4666-8666-666666666666";
test("server validates the exact mobile envelope without persisting extra fields", async () => {
  const sender = createIdentity(a), recipient = createIdentity(b);
  const device = (id: typeof sender): PrivateDevice => ({ user_id: id.userId, device_id: deviceId, encryption_key: id.encryptionKey, signing_key: id.signingKey, updated_at: new Date().toISOString() });
  const envelope = await sealMessage(sender, recipient, room, { text: "private" });
  const saved = verifyEnvelope({ ...envelope, plaintext: "MUST NOT STORE", privateKey: sender.signingSecret }, device(sender), device(recipient), room);
  assert.deepEqual(saved, envelope);
  assert.throws(() => verifyEnvelope({ ...envelope, roomId: deviceId }, device(sender), device(recipient), deviceId));
  assert.throws(() => verifyEnvelope({ ...envelope, createdAt: new Date(0).toISOString() }, device(sender), device(recipient), room));
});
test("registration and device request proofs interoperate and bind the full request", () => {
  const identity = createIdentity(a), timestamp = new Date().toISOString();
  const registered = registrationProof(identity, deviceId, timestamp);
  const registration = JSON.stringify(["cp-device-v1", publicIdentity(identity), deviceId, timestamp]);
  assert.equal(verifySignature(identity.signingKey, registered, registration), true);
  const path="/api/messages/private/relay", body=JSON.stringify({ ids:[room] });
  const signature=requestProof(identity,deviceId,timestamp,"PATCH",path,body);
  const statement=JSON.stringify(["cp-request-v1",a,deviceId,timestamp,"PATCH",path,hash(body)]);
  assert.equal(verifySignature(identity.signingKey,signature,statement),true);
  assert.equal(verifySignature(identity.signingKey,signature,statement.replace("PATCH","GET")),false);
  assert.equal(verifySignature(identity.signingKey,signature,statement.replace(hash(body),hash("{}"))),false);
});
