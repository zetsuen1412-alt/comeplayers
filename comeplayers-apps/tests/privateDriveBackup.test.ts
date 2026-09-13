import test from "node:test";
import assert from "node:assert/strict";
import { uploadDriveBackup, latestDriveBackup, validateDriveBackup, type BackupUploadSource } from "../apps/mobile/src/secure/driveBackupTransport";
const user = "11111111-1111-4111-8111-111111111111";
const metadata = { id: "drive-id", name: "history.cpbackup", size: "10", modifiedTime: "2026-09-12T00:00:00Z" };
test("uploads only archive bytes to appData with exact verified size", async () => {
  let uploaded = false;
  const source: BackupUploadSource = { name: metadata.name, size: 10, upload: async (url, options) => {
    uploaded = true; assert.match(url, /^https:\/\/www.googleapis.com\/upload\/drive/);
    assert.equal(options.httpMethod, "PUT"); assert.equal(options.headers["Content-Range"], "bytes 0-9/10");
    return { status: 200, body: JSON.stringify(metadata) };
  } };
  const request: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.deepEqual(body.parents, ["appDataFolder"]);
    assert.equal(body.appProperties.comeplayersAccount, user); assert.equal(body.recoveryKey, undefined);
    return new Response(null, { status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=x" } });
  };
  assert.deepEqual(await uploadDriveBackup(source, user, "test-token", undefined, undefined, request), metadata); assert.ok(uploaded);
});
test("rejects token exfiltration destinations and incomplete uploads", async () => {
  const source: BackupUploadSource = { name: metadata.name, size: 10, upload: async () => { throw new Error("must not upload"); } };
  for (const location of ["https://evil.test/upload/drive/v3/files", "http://www.googleapis.com/upload/drive/v3/files", "https://www.googleapis.com@evil.test/upload/drive/v3/files"]) {
    await assert.rejects(uploadDriveBackup(source, user, "secret", undefined, undefined, async () => new Response(null, { headers: { Location: location } })), /destination/);
  }
  assert.throws(() => validateDriveBackup({ ...metadata, size: "0" }));
  assert.throws(() => validateDriveBackup({ ...metadata, size: String(3 * 1024 ** 3) }));
});
test("restore lookup is scoped to the signed-in ComePlayers account and app folder", async () => {
  const result = await latestDriveBackup(user, "token", undefined, async input => {
    const url = new URL(String(input)); assert.equal(url.searchParams.get("spaces"), "appDataFolder");
    assert.match(url.searchParams.get("q")!, new RegExp(user));
    return Response.json({ files: [metadata] });
  });
  assert.deepEqual(result, metadata);
});
