// React Native's AbortSignal does not provide the browser throwIfAborted API.
export function checkBackupCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) { const error = new Error("Backup operation cancelled."); error.name = "AbortError"; throw error; }
}
