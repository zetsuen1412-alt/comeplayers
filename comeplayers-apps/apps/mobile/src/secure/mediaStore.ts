import { File, Paths } from "expo-file-system";
import { hex, unhex, newId } from "./crypto";
import type { Vault } from "./vault";

const CHUNK_SIZE = 49152;
export const MAX_PRIVATE_FILE = 4 * 1024 * 1024;
const MAX_LOCAL_FILE = 100 * 1024 * 1024;
let cacheCleaned = false;
export function cleanPrivatePreviewCache(): void {
  if (cacheCleaned) return;
  // Only files created by this module/importer, directly inside the app cache.
  // Clear remnants of an interrupted preview/import before opening any history.
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && /^cp-(view|import)-[0-9a-f-]{36}(\.[a-z0-9]+)?$/.test(entry.name)) entry.delete();
  }
  cacheCleaned = true;
}
export type LocalMedia = { id: string; name: string; mime: string; size: number; chunks: number };
export async function storeMedia(vault: Vault, bytes: Uint8Array, name: string, mime: string, id = newId()): Promise<LocalMedia> {
  if (!bytes.length || bytes.length > MAX_PRIVATE_FILE) throw new Error("Choose a file under 4 MB.");
  const media = { id, name: name.slice(0, 180), mime, size: bytes.length, chunks: Math.ceil(bytes.length / CHUNK_SIZE) };
  const rows = [];
  for (let i = 0; i < media.chunks; i++) rows.push(vault.encode("media-chunk", `${id}:${i}`, hex(bytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))));
  rows.push(vault.encode("media", id, media));
  await vault.putRows(rows);
  return media;
}
export async function readMedia(vault: Vault, id: string): Promise<{ bytes: Uint8Array; media: LocalMedia }> {
  const media = await vault.get<LocalMedia>("media", id);
  if (!media || media.size <= 0 || media.size > MAX_PRIVATE_FILE || media.chunks !== Math.ceil(media.size / CHUNK_SIZE)) throw new Error("This attachment is not on this device. Restore its backup.");
  const bytes = new Uint8Array(media.size);
  for (let i = 0; i < media.chunks; i++) {
    const chunk = await vault.get<string>("media-chunk", `${id}:${i}`);
    if (!chunk) throw new Error("Attachment is incomplete.");
    const value = unhex(chunk); if (value.length !== Math.min(CHUNK_SIZE, media.size - i * CHUNK_SIZE)) throw new Error("Invalid attachment chunk.");
    bytes.set(value, i * CHUNK_SIZE);
  }
  return { bytes, media };
}
export async function storeLegacyFile(vault: Vault, file: File, name: string, mime: string, id: string): Promise<LocalMedia> {
  if (!file.size || file.size > MAX_LOCAL_FILE) throw new Error("Legacy attachment exceeds the 100 MB import limit.");
  const media = { id, name, mime, size: file.size, chunks: Math.ceil(file.size / CHUNK_SIZE) }, handle = file.open();
  try { for (let i = 0; i < media.chunks; i++) {
    const chunk = handle.readBytes(Math.min(CHUNK_SIZE, media.size - i * CHUNK_SIZE));
    if (!chunk.length) throw new Error("Legacy attachment is incomplete.");
    await vault.put("media-chunk", `${id}:${i}`, hex(chunk));
  } } finally { handle.close(); }
  await vault.put("media", id, media);
  return media;
}
export async function materializeMedia(vault: Vault, id: string): Promise<File> {
  const media = await vault.get<LocalMedia>("media", id);
  if (!media || media.size <= 0 || media.size > MAX_LOCAL_FILE || media.chunks !== Math.ceil(media.size / CHUNK_SIZE)) throw new Error("Restore the backup containing this attachment.");
  const extension = media.mime.startsWith("image/") ? "jpg" : media.mime.startsWith("audio/") ? "m4a" : media.mime.startsWith("video/") ? "mp4" : "pdf";
  const file = new File(Paths.cache, `cp-view-${newId()}.${extension}`); file.create(); const handle = file.open();
  try { for (let i = 0; i < media.chunks; i++) { const chunk = await vault.get<string>("media-chunk", `${id}:${i}`); if (!chunk) throw new Error("Attachment is incomplete."); const bytes = unhex(chunk); if (bytes.length !== Math.min(CHUNK_SIZE, media.size - i * CHUNK_SIZE)) throw new Error("Invalid attachment chunk."); handle.writeBytes(bytes); } }
  catch (error) { handle.close(); file.delete(); throw error; }
  finally { try { handle.close(); } catch { /* already closed */ } }
  return file;
}
