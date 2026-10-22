import type { Order } from "@/features/payroll/types/domain";

export type MobileDelivery = {
  order_ref: string;
  employee_code: string;
  chat_id: number | string;
  status: string;
  action?: string;
  sent_at?: string | null;
};

/** Read-only action hints. The locked database RPC still authorizes every write. */
export function mobileWorkflow(order: Pick<Order, "externalReference" | "operationalStatus" | "workerAssignments">, employeeCode: string, chatId: number | string,
  takes: MobileDelivery[], proofs: MobileDelivery[]) {
  const ref = order.externalReference;
  const take = takes.find(row => row.order_ref === ref);
  const start = proofs.find(row => row.order_ref === ref && row.action === "start");
  const done = proofs.find(row => row.order_ref === ref && row.action === "done");
  const records = [take, start, done].filter((row): row is MobileDelivery => !!row);
  const mismatch = records.some(row => row.employee_code !== employeeCode
    || String(row.chat_id) !== String(chatId));
  const uncertain = records.some(row => !["sent", "failed"].includes(row.status));
  const appAssignment = order.workerAssignments?.length === 1
    && order.workerAssignments[0].id?.startsWith("mobile:");
  const locked = mismatch || uncertain || !appAssignment;
  const retryable = (row: MobileDelivery | undefined) => !row || row.status === "failed";
  const takeSent = take?.status === "sent" && !mismatch;
  const startSent = start?.status === "sent" && !mismatch;
  const canTake = !locked && order.operationalStatus === "assigned" && retryable(take) && !start && !done;
  const canStart = !locked && order.operationalStatus === "assigned" && takeSent
    && retryable(start) && !done;
  const canDone = !locked && order.operationalStatus === "in_progress" && takeSent
    && startSent && retryable(done);
  let actionMessage = "Segarkan tugas untuk memeriksa status terbaru.";
  if (!appAssignment) actionMessage = "Penugasan ini bukan dari Monitor. Periksa dengan admin Payroll.";
  else if (mismatch) actionMessage = "Karyawan atau grup berbeda dari laporan sebelumnya. Perlu pemeriksaan admin.";
  else if (uncertain) actionMessage = "Pengiriman sedang berlangsung atau belum pasti. Periksa Telegram; jangan kirim ulang.";
  else if (canTake) actionMessage = "Penugasan tersimpan. Kirim TAKE sebelum START.";
  else if (canStart) actionMessage = "TAKE terkonfirmasi. Unggah screenshot untuk START.";
  else if (canDone) actionMessage = "START terkonfirmasi. Unggah screenshot akhir untuk DONE.";
  return {
    canTake, canStart, canDone, takeSent, startSent,
    deliveryUncertain: uncertain || mismatch, actionMessage,
    takeStatus: take?.status ?? "not_sent", startStatus: start?.status ?? "not_sent",
    doneStatus: done?.status ?? "not_sent",
    takeSentAt: take?.sent_at ?? null, startSentAt: start?.sent_at ?? null,
  };
}
