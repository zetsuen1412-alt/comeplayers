// Read at most the authenticated size, even if the upload was replaced or a
// remote server omits Content-Length. Never buffer an unbounded response.
export async function readExactBytes(response: Response, expected: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > 4 * 1024 * 1024 + 40) throw new Error("Invalid attachment size.");
  if (!response.ok || !response.body) throw new Error("Could not receive this attachment. It remains in the delivery queue.");
  const reader = response.body.getReader();
  try {
    const declared = response.headers.get("content-length");
    if (declared !== null && Number(declared) !== expected) throw new Error("Attachment size does not match.");
    const result = new Uint8Array(expected); let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error("Attachment exceeds its authenticated size.");
      result.set(value, offset); offset += value.length;
    }
    if (offset !== expected) throw new Error("Attachment is incomplete.");
    return result;
  } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
}
