import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";
import {
  calculatePayrollEntry,
  calculatePayrollTotals,
  payrollInteger,
  type PayrollEntryInput,
} from "@/lib/payroll";

type JsonObject = Record<string, unknown>;

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function positiveId(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`${label} tidak valid.`);
  return parsed;
}

function optionalId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return positiveId(value, label);
}

function cleanText(value: unknown, label: string, maximum: number, minimum = 1) {
  const text = String(value ?? "").trim();
  if (text.length < minimum || text.length > maximum) {
    fail(`${label} harus berisi ${minimum}-${maximum} karakter.`);
  }
  return text;
}

function optionalText(value: unknown, maximum: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > maximum) fail(`Teks tidak boleh melebihi ${maximum} karakter.`);
  return text;
}

function normalizeEmployeeCode(value: unknown) {
  const code = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    fail("Kode karyawan harus berisi 2-32 huruf, angka, tanda hubung, atau garis bawah.");
  }
  return code;
}

function normalizePeriodCode(value: unknown) {
  return cleanText(value, "Kode periode", 40, 2)
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeDate(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    fail(`${label} tidak valid.`);
  }
  return text;
}

function entryInput(row: JsonObject): PayrollEntryInput {
  return {
    workValue: payrollInteger(row.work_value_minor, "Nilai pekerjaan"),
    shareBasisPoints: payrollInteger(row.share_basis_points, "Persentase", 10_000),
    bonusTips: payrollInteger(row.bonus_tips_minor, "Bonus/tips"),
    operationalDeduction: payrollInteger(
      row.operational_deduction_minor,
      "Potongan operasional",
    ),
    penalty: payrollInteger(row.penalty_minor, "Denda"),
    advanceRepayment: payrollInteger(row.advance_repayment_minor, "Potongan kasbon"),
  };
}

function periodSnapshot(rows: JsonObject[]) {
  const entries = rows
    .map((row) => {
      const input = entryInput(row);
      return {
        employeeId: positiveId(row.employee_id, "Karyawan"),
        employeeCode: String(row.employee_code_snapshot || ""),
        employeeName: String(row.employee_name_snapshot || ""),
        ...input,
        ...calculatePayrollEntry(input),
      };
    })
    .sort((left, right) => left.employeeId - right.employeeId);
  const totals = calculatePayrollTotals(entries);
  const hash = createHash("sha256")
    .update(JSON.stringify({ version: 1, entries, totals }))
    .digest("hex");
  return { entries, totals, hash };
}

async function loadPeriodEntries(
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"],
  periodId: number,
) {
  const { data, error } = await supabaseAdmin
    .from("cp_payroll_entries")
    .select("*")
    .eq("payroll_period_id", periodId)
    .order("employee_code_snapshot", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as JsonObject[];
}

export async function GET(request: Request) {
  try {
    const { profile, supabaseAdmin } = await requireAdmin(request);
    const requestedPeriod = new URL(request.url).searchParams.get("periodId");
    const periodId = requestedPeriod
      ? positiveId(requestedPeriod, "Periode penggajian")
      : null;

    const [employeesResult, periodsResult] = await Promise.all([
      supabaseAdmin
        .from("cp_payroll_employees")
        .select("*")
        .order("employee_code", { ascending: true }),
      supabaseAdmin
        .from("cp_payroll_periods")
        .select("*")
        .order("start_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(50),
    ]);

    if (employeesResult.error) throw new Error(employeesResult.error.message);
    if (periodsResult.error) throw new Error(periodsResult.error.message);

    const periods = (periodsResult.data || []) as JsonObject[];
    const selectedPeriodId = periodId ?? (periods[0] ? Number(periods[0].id) : null);
    if (periodId && !periods.some((period) => Number(period.id) === periodId)) {
      fail("Periode penggajian tidak ditemukan.", 404);
    }
    const entries = selectedPeriodId
      ? await loadPeriodEntries(supabaseAdmin, selectedPeriodId)
      : [];
    const preview = periodSnapshot(entries);

    return NextResponse.json({
      profile: {
        id: profile.id,
        username: profile.username || null,
        email: profile.email || null,
        role: profile.role || null,
      },
      employees: employeesResult.data || [],
      periods,
      selectedPeriodId,
      entries,
      previewTotals: preview.totals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memuat penggajian.";
    return NextResponse.json({ error: message }, { status: adminErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as JsonObject;
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "save_employee") {
      const employeeId = optionalId(body.employeeId, "Karyawan");
      const status = String(body.employmentStatus || "active").trim().toLowerCase();
      if (!new Set(["active", "inactive"]).has(status)) fail("Status karyawan tidak valid.");
      const payload = {
        employee_code: normalizeEmployeeCode(body.employeeCode),
        full_name: cleanText(body.fullName, "Nama karyawan", 120, 2),
        team: optionalText(body.team, 80),
        employment_status: status,
        default_share_basis_points: payrollInteger(
          body.defaultShareBasisPoints,
          "Persentase bawaan",
          10_000,
        ),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      let before: JsonObject | null = null;
      let result;
      if (employeeId) {
        const existing = await supabaseAdmin
          .from("cp_payroll_employees")
          .select("*")
          .eq("id", employeeId)
          .maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        if (!existing.data) fail("Karyawan tidak ditemukan.", 404);
        before = existing.data as JsonObject;
        result = await supabaseAdmin
          .from("cp_payroll_employees")
          .update(payload)
          .eq("id", employeeId)
          .select("*")
          .single();
      } else {
        result = await supabaseAdmin
          .from("cp_payroll_employees")
          .insert({ ...payload, created_by: user.id })
          .select("*")
          .single();
      }
      if (result.error) throw new Error(result.error.message);
      await recordAdminAudit({
        adminId: user.id,
        action: employeeId ? "payroll.employee.update" : "payroll.employee.create",
        entityType: "payroll_employee",
        entityId: result.data.id,
        beforeData: before,
        afterData: result.data,
      });
      return NextResponse.json({ ok: true, employee: result.data });
    }

    if (action === "create_period") {
      const startDate = normalizeDate(body.startDate, "Tanggal mulai");
      const endDate = normalizeDate(body.endDate, "Tanggal selesai");
      if (endDate < startDate) fail("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      const currencyCode = String(body.currencyCode || "IDR").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currencyCode)) fail("Kode mata uang tidak valid.");
      const result = await supabaseAdmin
        .from("cp_payroll_periods")
        .insert({
          period_code: normalizePeriodCode(body.periodCode),
          start_date: startDate,
          end_date: endDate,
          currency_code: currencyCode,
          created_by: user.id,
        })
        .select("*")
        .single();
      if (result.error) throw new Error(result.error.message);
      await recordAdminAudit({
        adminId: user.id,
        action: "payroll.period.create",
        entityType: "payroll_period",
        entityId: result.data.id,
        afterData: result.data,
      });
      return NextResponse.json({ ok: true, period: result.data });
    }

    if (action === "save_entry") {
      const periodId = positiveId(body.periodId, "Periode penggajian");
      const employeeId = positiveId(body.employeeId, "Karyawan");
      const [periodResult, employeeResult, beforeResult] = await Promise.all([
        supabaseAdmin.from("cp_payroll_periods").select("*").eq("id", periodId).maybeSingle(),
        supabaseAdmin.from("cp_payroll_employees").select("*").eq("id", employeeId).maybeSingle(),
        supabaseAdmin
          .from("cp_payroll_entries")
          .select("*")
          .eq("payroll_period_id", periodId)
          .eq("employee_id", employeeId)
          .maybeSingle(),
      ]);
      if (periodResult.error) throw new Error(periodResult.error.message);
      if (employeeResult.error) throw new Error(employeeResult.error.message);
      if (beforeResult.error) throw new Error(beforeResult.error.message);
      if (!periodResult.data) fail("Periode penggajian tidak ditemukan.", 404);
      if (!employeeResult.data) fail("Karyawan tidak ditemukan.", 404);
      if (periodResult.data.status !== "draft") {
        fail("Buka kembali periode ke Draft sebelum mengubah perhitungan.", 409);
      }

      const input: PayrollEntryInput = {
        workValue: payrollInteger(body.workValue, "Nilai pekerjaan"),
        shareBasisPoints: payrollInteger(body.shareBasisPoints, "Persentase", 10_000),
        bonusTips: payrollInteger(body.bonusTips, "Bonus/tips"),
        operationalDeduction: payrollInteger(
          body.operationalDeduction,
          "Potongan operasional",
        ),
        penalty: payrollInteger(body.penalty, "Denda"),
        advanceRepayment: payrollInteger(body.advanceRepayment, "Potongan kasbon"),
      };
      calculatePayrollEntry(input);
      const payload = {
        payroll_period_id: periodId,
        employee_id: employeeId,
        employee_code_snapshot: employeeResult.data.employee_code,
        employee_name_snapshot: employeeResult.data.full_name,
        team_snapshot: employeeResult.data.team,
        work_value_minor: input.workValue,
        share_basis_points: input.shareBasisPoints,
        bonus_tips_minor: input.bonusTips,
        operational_deduction_minor: input.operationalDeduction,
        penalty_minor: input.penalty,
        advance_repayment_minor: input.advanceRepayment,
        note: optionalText(body.note, 1000),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (beforeResult.data) {
        result = await supabaseAdmin
          .from("cp_payroll_entries")
          .update({ ...payload, version: Number(beforeResult.data.version || 1) + 1 })
          .eq("id", beforeResult.data.id)
          .eq("version", beforeResult.data.version)
          .select("*")
          .maybeSingle();
      } else {
        result = await supabaseAdmin
          .from("cp_payroll_entries")
          .insert({ ...payload, created_by: user.id })
          .select("*")
          .maybeSingle();
      }
      if (result.error) throw new Error(result.error.message);
      if (!result.data) fail("Data gaji berubah di perangkat lain. Muat ulang lalu coba lagi.", 409);
      await recordAdminAudit({
        adminId: user.id,
        action: beforeResult.data ? "payroll.entry.update" : "payroll.entry.create",
        entityType: "payroll_entry",
        entityId: result.data.id,
        beforeData: beforeResult.data,
        afterData: result.data,
        metadata: { payrollPeriodId: periodId, employeeId },
      });
      return NextResponse.json({ ok: true, entry: result.data });
    }

    if (action === "delete_entry") {
      const entryId = positiveId(body.entryId, "Baris gaji");
      const existing = await supabaseAdmin
        .from("cp_payroll_entries")
        .select("*")
        .eq("id", entryId)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) fail("Baris gaji tidak ditemukan.", 404);
      const result = await supabaseAdmin.from("cp_payroll_entries").delete().eq("id", entryId);
      if (result.error) throw new Error(result.error.message);
      await recordAdminAudit({
        adminId: user.id,
        action: "payroll.entry.delete",
        entityType: "payroll_entry",
        entityId: entryId,
        beforeData: existing.data,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "transition_period") {
      const periodId = positiveId(body.periodId, "Periode penggajian");
      const target = String(body.target || "").trim().toLowerCase();
      const existing = await supabaseAdmin
        .from("cp_payroll_periods")
        .select("*")
        .eq("id", periodId)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) fail("Periode penggajian tidak ditemukan.", 404);
      const before = existing.data as JsonObject;
      const now = new Date().toISOString();
      let expectedStatus = "";
      let update: JsonObject = { updated_at: now, version: Number(existing.data.version || 1) + 1 };

      if (target === "calculated") {
        expectedStatus = "draft";
        const rows = await loadPeriodEntries(supabaseAdmin, periodId);
        if (!rows.length) fail("Tambahkan setidaknya satu karyawan sebelum menghitung gaji.");
        const snapshot = periodSnapshot(rows);
        update = {
          ...update,
          status: "calculated",
          total_work_value_minor: snapshot.totals.workValue,
          gross_compensation_minor: snapshot.totals.grossCompensation,
          deductions_minor: snapshot.totals.deductions,
          net_pay_minor: snapshot.totals.netPay,
          calculation_hash: snapshot.hash,
          calculated_at: now,
          calculated_by: user.id,
        };
      } else if (target === "draft") {
        expectedStatus = "calculated";
        update = {
          ...update,
          status: "draft",
          total_work_value_minor: 0,
          gross_compensation_minor: 0,
          deductions_minor: 0,
          net_pay_minor: 0,
          calculation_hash: null,
          calculated_at: null,
          calculated_by: null,
        };
      } else if (target === "finalized") {
        expectedStatus = "calculated";
        const snapshot = periodSnapshot(await loadPeriodEntries(supabaseAdmin, periodId));
        if (!existing.data.calculation_hash || snapshot.hash !== existing.data.calculation_hash) {
          fail("Data gaji berubah setelah dihitung. Buka Draft dan hitung ulang.", 409);
        }
        update = { ...update, status: "finalized", finalized_at: now, finalized_by: user.id };
      } else if (target === "paid") {
        expectedStatus = "finalized";
        update = { ...update, status: "paid", paid_at: now, paid_by: user.id };
      } else {
        fail("Perubahan status penggajian tidak didukung.");
      }

      if (existing.data.status !== expectedStatus) {
        fail(`Periode harus berstatus ${expectedStatus} untuk tindakan ini.`, 409);
      }
      const result = await supabaseAdmin
        .from("cp_payroll_periods")
        .update(update)
        .eq("id", periodId)
        .eq("status", expectedStatus)
        .eq("version", existing.data.version)
        .select("*")
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) fail("Periode berubah di perangkat lain. Muat ulang lalu coba lagi.", 409);
      await recordAdminAudit({
        adminId: user.id,
        action: `payroll.period.${target}`,
        entityType: "payroll_period",
        entityId: periodId,
        beforeData: before,
        afterData: result.data,
      });
      return NextResponse.json({ ok: true, period: result.data });
    }

    fail("Tindakan payroll tidak dikenali.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memperbarui penggajian.";
    const status = /duplicate key|already exists/i.test(message)
      ? 409
      : /PAYROLL_PERIOD_LOCKED|IMMUTABLE/i.test(message)
        ? 409
        : adminErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
