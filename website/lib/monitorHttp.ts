import { adminErrorStatus } from "@/lib/adminSecurity";
export const monitorReply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});
export async function monitorBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Permintaan kosong."), { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); throw Object.assign(new Error("Permintaan terlalu besar."), { status: 413 }); }
    chunks.push(value);
  }
  try { const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw Object.assign(new Error("Permintaan tidak valid."), { status: 400 }); }
}
export function monitorError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  const status = code === "P0001" || code === "23505" ? 409 : adminErrorStatus(error);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return monitorReply({ error: [400,403,409].includes(status) ? message : status === 401 ? "Sesi habis; login kembali."
    : "Data belum dapat diproses. Perbarui sebelum mencoba lagi." }, [400,401,403,409,413,429].includes(status) ? status : 503);
}
