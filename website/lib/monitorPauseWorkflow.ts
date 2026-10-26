import type { mobileWorkflow } from "./payrollMobileWorkflow";

export type MonitorPauseState = {
  order_ref: string; start_event_id: string; revision: number | string;
  paused: boolean; uncertain: boolean;
};

/** Current START cycle only; failed/uncertain photo delivery never advances state. */
export function monitorPauseWorkflow(workflow: ReturnType<typeof mobileWorkflow>, status: string,
  state: MonitorPauseState | undefined, supported: boolean) {
  const revision = Number(state?.revision ?? 0);
  const valid = supported && !!state && Number.isSafeInteger(revision) && revision >= 0 && revision <= 1_000_000
    && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(state.start_event_id);
  const uncertain = workflow.deliveryUncertain || !!state?.uncertain || (supported && workflow.startSent && !valid);
  const paused = valid && state.paused;
  const running = status === "in_progress" && workflow.takeSent && workflow.startSent;
  const canPause = valid && running && !paused && !uncertain && workflow.canDone;
  const canContinue = valid && running && paused && !uncertain && workflow.canDone;
  return {
    paused, pauseRevision: valid ? revision : 0, startEventId: valid ? state.start_event_id : null,
    canPause, canContinue, canDone: workflow.canDone && !paused && !uncertain,
    deliveryUncertain: uncertain,
    actionMessage: uncertain ? "Laporan Telegram belum pasti. Periksa grup; jangan kirim ulang."
      : paused ? "Order PAUSE terkonfirmasi. Unggah foto CONTINUE untuk melanjutkan."
      : workflow.actionMessage,
  };
}
