export type MobileUpdateState = { status: "idle" | "ready" | "applying"; error?: string };

type UpdateDriver = {
  isEnabled: boolean;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean; isRollBackToEmbedded?: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean; isRollBackToEmbedded?: boolean }>;
  reloadAsync(): Promise<void>;
};

function within<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Pemeriksaan pembaruan melewati batas waktu.")), milliseconds);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

/** Download in the background. Only an explicit apply() may restart the app. */
export function createMobileUpdateController(
  driver: UpdateDriver,
  onState: (state: MobileUpdateState) => void,
  options: { checkTimeoutMs?: number; downloadTimeoutMs?: number; onError?: (error: unknown) => void } = {},
) {
  let checking = false;
  let pending = false;
  let applying = false;
  let disposed = false;
  const emit = (state: MobileUpdateState) => { if (!disposed) onState(state); };
  const markPending = () => {
    if (disposed || !driver.isEnabled) return;
    pending = true;
    if (!applying) emit({ status: "ready" });
  };
  return {
    markPending,
    async check() {
      if (disposed || !driver.isEnabled || checking || pending || applying) return;
      checking = true;
      try {
        const result = await within(driver.checkForUpdateAsync(), options.checkTimeoutMs ?? 15_000);
        if (disposed || (!result.isAvailable && !result.isRollBackToEmbedded)) return;
        const fetched = await within(driver.fetchUpdateAsync(), options.downloadTimeoutMs ?? 90_000);
        if (fetched.isNew || fetched.isRollBackToEmbedded) markPending();
      } catch (error) {
        if (!disposed) options.onError?.(error);
      } finally {
        checking = false;
      }
    },
    async apply() {
      if (disposed || !driver.isEnabled || !pending || applying) return;
      applying = true;
      emit({ status: "applying" });
      try {
        await driver.reloadAsync();
      } catch (error) {
        applying = false;
        emit({ status: "ready", error: "Pembaruan belum dapat diterapkan. Coba lagi." });
        if (!disposed) options.onError?.(error);
      }
    },
    dispose() { disposed = true; },
  };
}
