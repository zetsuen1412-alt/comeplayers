/** Incoming Payroll Sheets integration is disabled unless explicitly approved. */
export function payrollSheetSyncEnabled() {
  return process.env.PAYROLL_SHEETS_SYNC_ENABLED === "true";
}

export function payrollSheetSyncDisabledResponse() {
  if (payrollSheetSyncEnabled()) return null;
  return Response.json({
    ok: false,
    saved: false,
    enabled: false,
    code: "PAYROLL_SHEETS_SYNC_DISABLED",
    error: "Sinkronisasi Google Sheets ke Payroll dinonaktifkan. Data Payroll tetap tersimpan.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
