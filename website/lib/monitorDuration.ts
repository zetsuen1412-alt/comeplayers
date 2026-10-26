/** Parse only the administrator's Duration field, never TASK or account credentials. */
export function monitorDuration(value: unknown) {
  const duration = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const text = duration.toLowerCase().replace(/[×*]/g, "x").replace(/,/g, ".")
    .replace(/sebulan/g, "1 bulan").replace(/seminggu/g, "1 minggu").replace(/sehari/g, "1 hari");
  const days: number[] = [];
  const hours = [...text.matchAll(/(?<![0-9.])([0-9]+(?:\.[0-9]+)?)\s*(?:hours?|hrs?|jam|h)(?=x|[^a-z]|$)/g)].map(m => Number(m[1]));
  for (const m of text.matchAll(/(?<![0-9.])([0-9]+(?:\.[0-9]+)?)\s*(days?|hari|weeks?|wks?|minggu|pekan|months?|mos?|bulan)(?=[^a-z]|$)/g))
    days.push(Number(m[1]) * (/^(week|wk|minggu|pekan)/.test(m[2]) ? 7 : /^(month|mo|bulan)/.test(m[2]) ? 30 : 1));
  for (const m of text.matchAll(/(?<![0-9.])[0-9]+(?:\.[0-9]+)?\s*(?:hours?|hrs?|jam|h)(?:\s*(?:\/\s*(?:day|hari)|per\s+(?:day|hari)))?\s*x\s*([0-9]+(?:\.[0-9]+)?)(?!\s*(?:weeks?|wks?|minggu|pekan|months?|mos?|bulan))(?=[^0-9.]|$)/g)) days.push(Number(m[1]));
  const uniqueDays = [...new Set(days)], uniqueHours = [...new Set(hours)];
  const totalDays = uniqueDays[0] ?? 1;
  const needsReview = uniqueDays.length > 1 || !Number.isInteger(totalDays) || totalDays < 1 || totalDays > 366
    || (totalDays > 1 && (uniqueHours.length > 1 || uniqueHours.some(h => h <= 0 || h > 24) || /[0-9]\s*[-–]\s*[0-9]/.test(text)));
  const hoursPerDay = !needsReview && totalDays > 1 && uniqueHours.length === 1 ? uniqueHours[0] : null;
  const daily = !needsReview && totalDays > 1;
  const durationDisplay = daily ? `${hoursPerDay == null ? "" : `${hoursPerDay} jam × `}${totalDays} hari` : duration || "—";
  return { duration, durationDisplay, daily, totalDays: needsReview ? null : totalDays, hoursPerDay, durationNeedsReview: needsReview };
}

export type MonitorDailyState = {
  order_ref: string; duration: string; total_days: number; hours_per_day: number | null;
  completed_days: number; revision: number | string; cycle_id: string;
  phase: "waiting" | "running" | "paused" | "completed"; uncertain: boolean;
};

/** Advisory UI flags only. The locked, versioned database transaction authorizes every report. */
export function dailyWorkflow(state: MonitorDailyState, takeSent: boolean, normal: boolean) {
  const dayNumber = Math.min(state.completed_days + 1, state.total_days);
  const valid = Number.isSafeInteger(Number(state.revision)) && Number(state.revision) >= 0 && Number(state.revision) <= 1_000_000
    && state.total_days >= 2 && state.total_days <= 366 && state.completed_days >= 0 && state.completed_days <= state.total_days
    && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(state.cycle_id);
  const ready = valid && takeSent && normal && !state.uncertain;
  return { daily: true, duration: state.duration, durationDisplay: monitorDuration(state.duration).durationDisplay,
    totalDays: state.total_days, completedDays: state.completed_days, dayNumber,
    dailyRevision: Number(state.revision), dailyCycleId: state.cycle_id,
    startSent: ["running", "paused", "completed"].includes(state.phase),
    startStatus: ["running", "paused", "completed"].includes(state.phase) ? "sent" : "not_sent",
    doneStatus: state.phase === "completed" ? "sent" : "not_sent",
    canStart: ready && state.phase === "waiting", canPause: ready && state.phase === "running",
    canContinue: ready && state.phase === "paused", canDone: ready && state.phase === "running",
    deliveryUncertain: !valid || state.uncertain,
    actionMessage: !valid || state.uncertain ? "Laporan harian belum pasti. Periksa Telegram; jangan kirim ulang."
      : !normal ? "Order Refund atau Bermasalah. Hubungi admin."
      : !takeSent ? "Kirim TAKE sebelum memulai pekerjaan harian."
      : state.phase === "completed" ? `Semua ${state.total_days} hari selesai.`
      : `Day ${dayNumber}/${state.total_days} · ${state.completed_days} hari selesai. ` + (state.phase === "waiting"
        ? "Unggah START untuk hari ini." : state.phase === "paused" ? "Unggah CONTINUE untuk melanjutkan." : "Unggah DONE setelah jatah hari ini selesai."),
  };
}
