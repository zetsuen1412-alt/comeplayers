/** A successful static HEAD may omit Content-Length, including Vercel EXE downloads. */
export function isMonitorDownloadReady(response: Pick<Response, "ok" | "headers">, mime: string, minimumBytes: number) {
  if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== mime) return false;
  const length = response.headers.get("content-length");
  return length === null || (/^\d+$/.test(length) && Number(length) > minimumBytes);
}
