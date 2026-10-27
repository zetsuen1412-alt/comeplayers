/** One deadline for all sign-in stages; never replay a login or refresh. */
export async function withMonitorSessionDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 50_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('Monitor authentication deadline exceeded.'), { status: 503 });
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try { return await Promise.race([work(controller.signal), expired]); }
  finally { clearTimeout(timer!); }
}
