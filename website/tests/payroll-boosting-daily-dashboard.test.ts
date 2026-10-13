import test from "node:test";
import assert from "node:assert/strict";
import { dailyPackageOverview, packageScheduledForDate } from "../features/payroll/lib/daily-dashboard";
import { validateWorkspace, validateWorkspaceEdit, workspaceKeys } from "../features/payroll/lib/workspace-model";
import type { Order } from "../features/payroll/types/domain";

function partialSheetOrder(): Order {
  return {
    id: "gsheet:TEST", orderNumber: "X-001", externalReference: "X-001", source: "G2G",
    buyerName: "Buyer", orderName: "Paket 7 hari", orderType: "boosting", scheduleMode: "daily",
    scheduleStartDate: "2026-10-11", scheduleTotalDays: 7, game: "GW2", service: "Boosting",
    quantity: 1, rateMinor: 700000, grossMinor: 700000, expectedPaymentMinor: 700000,
    matchedPaymentMinor: 0, operationalStatus: "partially_completed", financeStatus: "pending",
    orderedAt: "2026-10-11T08:00:00+07:00", dueAt: "2026-10-18T08:00:00+07:00",
    dailyWork: [
      {id: "d1", sequence: 1, workDate: "2026-10-11", status: "verified", grossMinor: 100000,
        rateMinor: 100000, workerAssignments: [{id:"a1", employeeCode:"E1", employeeName:"Ari", team:"FH1", process:"JOKI", quantity:1}]},
      {id: "d3", sequence: 3, workDate: "2026-10-13", status: "on_hold", grossMinor: 100000,
        rateMinor: 99000, workerAssignments: []},
    ],
  };
}

test("paket 7 hari dengan 2 baris Sheet tetap 1 order dan 5 hari teridentifikasi belum tercatat", () => {
  const order = partialSheetOrder();
  const summary = dailyPackageOverview(order);
  assert.equal(summary.totalDays, 7);
  assert.equal(summary.recorded, 2);
  assert.equal(summary.missing, 5);
  assert.equal(summary.completed, 1);
  assert.equal(summary.finishedGrossMinor, 100000);
  assert.equal(summary.recordedGrossMinor, 200000);
  assert.equal(summary.timeline[1].expectedDate, "2026-10-12");
  assert.equal(summary.timeline[1].day, undefined);
  assert.equal(summary.timeline[2].day?.rateMinor, 99000);
  assert.deepEqual(order.dailyWork?.map(day => day.sequence), [1, 3]);
});

test("tanggal paket yang belum masuk Sheet tetap terlihat sebagai kekosongan, bukan order fiktif", () => {
  const order = partialSheetOrder();
  assert.equal(packageScheduledForDate(order, "2026-10-12"), true);
  assert.equal(packageScheduledForDate(order, "2026-10-17"), true);
  assert.equal(packageScheduledForDate(order, "2026-10-18"), false);
  assert.equal(packageScheduledForDate({ ...order, scheduleMode: "single" }, "2026-10-12"), false);
});

test("katalog boosting baru tersimpan di workspace tanpa mengubah RATE atau nilai order Sheet", () => {
  const order = partialSheetOrder();
  const plan = {id:"plan-1",gameId:"game-gw2",name:"Boosting 7 hari",rateMinor:850000,active:true};
  const before = {[workspaceKeys.orders]: [order]};
  const after = {...before,[workspaceKeys.boostingCatalog]:[plan]};
  assert.doesNotThrow(() => validateWorkspaceEdit(before, after));
  assert.equal((validateWorkspace(after)[workspaceKeys.orders] as Order[])[0].rateMinor, 700000);
  assert.equal((validateWorkspace(after)[workspaceKeys.orders] as Order[])[0].dailyWork?.[1].rateMinor, 99000);
});

test("katalog menolak harga minus, desimal, nama game ganda, dan ID duplikat", () => {
  const p = {id:"plan-1",gameId:"game-gw2",name:"7 Hari",rateMinor:100000,active:true};
  const state=(plans:unknown[]) => ({[workspaceKeys.boostingCatalog]: plans});
  assert.doesNotThrow(() => validateWorkspace(state([p])));
  assert.throws(() => validateWorkspace(state([{...p,rateMinor:-1}])),/harga katalog/);
  assert.throws(() => validateWorkspace(state([{...p,rateMinor:12.5}])),/harga katalog/);
  assert.throws(() => validateWorkspace(state([p,{...p,id:"plan-2",name:"7 HARI"}])),/duplikat/);
  assert.throws(() => validateWorkspace(state([p,{...p,name:"Yang lain"}])),/duplikat/);
});
