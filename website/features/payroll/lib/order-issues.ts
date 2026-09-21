import type { Employee, Order, OrderDailyWork, OrderIssue, OrderWorkerAssignment } from "../types/domain";
import { parseBoostingPackagePlan } from "./boosting-package";
import { getOrderAssignments } from "./order-workers";

const EPSILON = 0.000001;

function issue(code: string, title: string, description: string, severity: OrderIssue["severity"] = "high", source: OrderIssue["source"] = "validation"): OrderIssue {
  return { code, title, description, severity, source };
}

function assignmentsFor(order: Order, day?: OrderDailyWork): OrderWorkerAssignment[] {
  return day?.workerAssignments?.length ? day.workerAssignments : getOrderAssignments(order);
}

function normalize(value: string | undefined) {
  return String(value ?? "").trim().toLocaleUpperCase("id-ID");
}

function uniqueIssues(rows: OrderIssue[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.code}\u001f${row.title}\u001f${row.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzeOrderIssues(order: Order, employees: Employee[], day?: OrderDailyWork): OrderIssue[] {
  const issues: OrderIssue[] = [
    ...(order.importIssues ?? []),
    ...(day?.issues ?? []),
  ];

  if (!order.source?.trim()) issues.push(issue("SOURCE_MISSING", "Sumber belum diisi", "Kolom Sumber/GATE kosong.", "warning"));
  if (!order.buyerName?.trim()) issues.push(issue("BUYER_MISSING", "Nama pembeli belum diisi", "NAMA BUYER kosong atau belum terbaca.", "warning"));
  if (!order.game?.trim()) issues.push(issue("GAME_MISSING", "Gim belum diisi", "Kode gim pada pesanan kosong.", "warning"));
  if (order.orderType !== "gold" && !(order.orderName ?? order.service)?.trim()) {
    issues.push(issue("ORDER_NAME_MISSING", "Nama pesanan belum diisi", "Nama pesanan/layanan kosong.", "warning"));
  }
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) issues.push(issue("QUANTITY_INVALID", "Jumlah pesanan tidak valid", `Jumlah pesanan terbaca ${order.quantity}.`));
  if (!Number.isFinite(order.grossMinor) || order.grossMinor < 0) issues.push(issue("TOTAL_INVALID", "Total pesanan tidak valid", "Nilai total pesanan kosong, minus, atau bukan angka."));

  const assignments = assignmentsFor(order, day);
  if (!assignments.length) {
    issues.push(issue(
      "EMPLOYEE_MISSING",
      "Nama karyawan tidak ada",
      day ? `Hari ke-${day.sequence} belum mempunyai karyawan yang dapat dicocokkan.` : "BOOSTER kosong atau nama karyawan belum dapat dicocokkan dengan daftar Karyawan.",
    ));
  } else {
    const seenCodes = new Set<string>();
    const rosterByCode = new Map(employees.map((employee) => [employee.code, employee]));
    for (const assignment of assignments) {
      if (!assignment.employeeCode?.trim() || !assignment.employeeName?.trim()) {
        issues.push(issue("EMPLOYEE_IDENTITY_INCOMPLETE", "Data karyawan tidak lengkap", "Kode atau nama karyawan pada pembagian pekerjaan kosong."));
        continue;
      }
      if (seenCodes.has(assignment.employeeCode)) {
        issues.push(issue("EMPLOYEE_DUPLICATE", "Karyawan terduplikat", `${assignment.employeeName} tercatat lebih dari sekali pada pembagian yang sama.`));
      }
      seenCodes.add(assignment.employeeCode);

      const employee = rosterByCode.get(assignment.employeeCode);
      if (!employee) {
        issues.push(issue("EMPLOYEE_NOT_FOUND", "Nama karyawan tidak ada di daftar Karyawan", `${assignment.employeeName} (${assignment.employeeCode}) tidak ditemukan pada master Karyawan.`));
      } else if (normalize(employee.name) !== normalize(assignment.employeeName)) {
        issues.push(issue("EMPLOYEE_NAME_MISMATCH", "Nama karyawan tidak cocok", `Kode ${assignment.employeeCode} terdaftar sebagai ${employee.name}, tetapi Mutasi membaca ${assignment.employeeName}.`));
      }
      if (!Number.isFinite(assignment.quantity) || assignment.quantity <= 0) {
        issues.push(issue("WORKER_QUANTITY_INVALID", "Pembagian jumlah karyawan tidak valid", `Jumlah untuk ${assignment.employeeName} harus lebih dari 0.`));
      }
    }
  }

  if ((order.orderType === "gold" || order.orderType === "item") && assignments.length) {
    const assigned = assignments.reduce((sum, assignment) => sum + Number(assignment.quantity || 0), 0);
    if (Math.abs(assigned - order.quantity) > EPSILON) {
      issues.push(issue(
        "WORKER_QUANTITY_MISMATCH",
        "Total pembagian jumlah tidak sama",
        `Jumlah pesanan ${order.quantity.toLocaleString("id-ID")}, tetapi total pembagian karyawan ${assigned.toLocaleString("id-ID")}. Selisih ${Math.abs(order.quantity - assigned).toLocaleString("id-ID")}.`,
      ));
    }
  }

  const title = order.orderName ?? order.service;
  const plan = order.orderType === "boosting" ? parseBoostingPackagePlan(title) : null;
  if (plan?.isDaily) {
    if (order.scheduleMode !== "daily") {
      issues.push(issue("DAILY_MODE_MISSING", "Paket harian belum dibuat sebagai Harian Berjangka", `Nama paket menunjukkan ${plan.totalDays} hari, tetapi mode pesanan belum harian.`));
    }
    if (order.scheduleTotalDays && order.scheduleTotalDays !== plan.totalDays) {
      issues.push(issue("DAILY_TOTAL_MISMATCH", "Jumlah hari paket tidak cocok", `Nama paket terbaca ${plan.totalDays} hari, sedangkan pesanan menyimpan ${order.scheduleTotalDays} hari.`));
    }
  }

  if (order.scheduleMode === "daily") {
    const daily = order.dailyWork ?? [];
    if (!daily.length) {
      issues.push(issue("DAILY_ROWS_MISSING", "Daftar hari belum tersedia", "Pesanan Harian Berjangka tidak mempunyai baris Hari 1, Hari 2, dan seterusnya."));
    } else {
      const sequenceCounts = new Map<number, number>();
      for (const row of daily) sequenceCounts.set(row.sequence, (sequenceCounts.get(row.sequence) ?? 0) + 1);
      const duplicates = [...sequenceCounts].filter(([, count]) => count > 1).map(([sequence]) => sequence);
      if (duplicates.length) issues.push(issue("DAILY_SEQUENCE_DUPLICATE", "Nomor hari terduplikat", `Hari ${duplicates.join(", ")} muncul lebih dari sekali.`));
      const maxAllowed = order.scheduleTotalDays ?? plan?.totalDays;
      if (maxAllowed) {
        const outside = daily.filter((row) => row.sequence < 1 || row.sequence > maxAllowed).map((row) => row.sequence);
        if (outside.length) issues.push(issue("DAILY_SEQUENCE_OUTSIDE", "Nomor hari di luar paket", `Hari ${outside.join(", ")} berada di luar 1–${maxAllowed}.`));
      }
    }
  }

  if (day && day.status === "on_hold" && !(day.issues?.length)) {
    issues.push(issue("DAY_ON_HOLD", `Hari ke-${day.sequence} ditandai bermasalah`, "Hari ini berstatus Bermasalah. Periksa karyawan, jumlah, catatan sumber, atau input Mutasi.", "high", "manual"));
  }

  if (!day && order.operationalStatus === "on_hold" && !issues.some((row) => row.severity === "high" || row.severity === "critical")) {
    issues.push(issue("ORDER_ON_HOLD", "Pesanan ditandai bermasalah", "Status Mutasi adalah Bermasalah. Periksa data karyawan, jumlah, nama pesanan, dan input lainnya.", "high", "manual"));
  }

  if (order.importNeedsReview && !(order.importIssues?.length)) {
    issues.push(issue("IMPORT_REVIEW", "Baris impor perlu diperiksa", "Spreadsheet menandai baris ini untuk pemeriksaan, tetapi alasan rinci dari impor lama belum tersedia.", "warning", "import"));
  }

  return uniqueIssues(issues);
}

export function hasBlockingOrderIssues(issues: OrderIssue[]) {
  return issues.some((row) => row.severity === "high" || row.severity === "critical");
}
