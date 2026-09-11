export type SettlementInput = {
  captureId: string;
  localGross: number;
  providerGross?: number | string | null;
  providerFee?: number | string | null;
  providerNet?: number | string | null;
};

function numeric(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function compareProviderSettlement(input: SettlementInput) {
  const localGross = rounded(numeric(input.localGross));
  const providerGross = rounded(numeric(input.providerGross));
  const providerFee = rounded(numeric(input.providerFee));
  const providerNet = rounded(numeric(input.providerNet));
  const expectedNet = rounded(providerGross - providerFee);
  const grossDelta = rounded(providerGross - localGross);
  const netFormulaDelta = rounded(providerNet - expectedNet);
  const mismatches: string[] = [];

  if (Math.abs(grossDelta) > 0.01) mismatches.push("gross_amount");
  if (Math.abs(netFormulaDelta) > 0.01) mismatches.push("provider_net_formula");
  if (providerFee < 0 || providerNet < 0) mismatches.push("negative_provider_amount");

  return {
    captureId: input.captureId,
    localGross,
    providerGross,
    providerFee,
    providerNet,
    expectedNet,
    grossDelta,
    netFormulaDelta,
    status: mismatches.length === 0 ? ("matched" as const) : ("mismatch" as const),
    mismatches,
  };
}

export function dedupeSettlementChecks<T extends { capture_id?: unknown; checked_at?: unknown }>(rows: T[]) {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const captureId = String(row.capture_id || "").trim();
    if (!captureId) continue;
    const existing = latest.get(captureId);
    const currentTime = new Date(String(row.checked_at || "")).getTime();
    const existingTime = new Date(String(existing?.checked_at || "")).getTime();
    if (!existing || !Number.isFinite(existingTime) || (Number.isFinite(currentTime) && currentTime >= existingTime)) {
      latest.set(captureId, row);
    }
  }
  return Array.from(latest.values());
}
