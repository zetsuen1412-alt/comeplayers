import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config";

test("APK Android dikirim sebagai attachment yang dikenali oleh browser", async () => {
  const headers = await config.headers?.();
  assert.ok(headers, "Next.js harus mengatur header download");
  const apk = headers.find((row) => row.source === "/downloads/cp-boost-monitor.apk");
  assert.ok(apk && "headers" in apk);
  assert.equal(apk.headers?.find((x) => x.key === "Content-Disposition")?.value, 'attachment; filename="CP-Boost-Monitor.apk"');
  assert.equal(apk.headers?.find((x) => x.key === "Content-Type")?.value, "application/vnd.android.package-archive");
});

test("ZIP alternatif juga memakai attachment, bukan dibuka sebagai halaman", async () => {
  const headers = await config.headers?.();
  const zip = headers?.find((row) => row.source === "/downloads/cp-boost-monitor.zip");
  assert.ok(zip && "headers" in zip);
  assert.equal(zip.headers?.find((x) => x.key === "Content-Disposition")?.value, 'attachment; filename="CP-Boost-Monitor-Android.zip"');
});
