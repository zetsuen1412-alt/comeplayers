import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = join(process.cwd(), ".doku-keys");
const privateKeyPath = join(outputDirectory, "doku-snap-private.pem");
const privateKeyBase64Path = join(
  outputDirectory,
  "doku-snap-private.pem.base64",
);
const publicKeyPath = join(outputDirectory, "doku-snap-public.pem");

if (
  existsSync(privateKeyPath) ||
  existsSync(privateKeyBase64Path) ||
  existsSync(publicKeyPath)
) {
  throw new Error(
    "DOKU SNAP key files already exist. Refusing to overwrite merchant credentials.",
  );
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });
writeFileSync(privateKeyBase64Path, Buffer.from(privateKey).toString("base64"), {
  encoding: "utf8",
  mode: 0o600,
});
writeFileSync(publicKeyPath, publicKey, { encoding: "utf8", mode: 0o644 });

const fingerprint = createHash("sha256")
  .update(publicKey, "utf8")
  .digest("hex")
  .match(/.{1,2}/g)
  .join(":");

console.log(`DOKU SNAP public key: ${publicKeyPath}`);
console.log(`SHA-256 fingerprint: ${fingerprint}`);
console.log("The private key was generated locally and was not printed.");
