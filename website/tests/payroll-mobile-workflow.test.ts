import assert from "node:assert/strict";
import { test } from "node:test";
import type { Order } from "../features/payroll/types/domain";
import { mobileWorkflow, type MobileDelivery } from "../lib/payrollMobileWorkflow";

const order = (status = "assigned") => ({ externalReference: "X4806", operationalStatus: status,
  workerAssignments: [{ id: "mobile:a1", employeeCode: "E1" }],
}) as Order;
const receipt = (status: string, action?: string, patch: Partial<MobileDelivery> = {}): MobileDelivery => ({
  order_ref: "X4806", employee_code: "E1", chat_id: -123, status, action, ...patch,
});
const state = (status: string, takes: MobileDelivery[] = [], proofs: MobileDelivery[] = []) =>
  mobileWorkflow(order(status), "E1", -123, takes, proofs);

test("Monitor unlocks TAKE then screenshot START then screenshot DONE from confirmed receipts", () => {
  const before = state("assigned");
  assert.equal(before.canTake, true); assert.equal(before.canStart, false); assert.equal(before.canDone, false);
  const take = receipt("sent");
  const afterTake = state("assigned", [take]);
  assert.equal(afterTake.canTake, false); assert.equal(afterTake.canStart, true); assert.equal(afterTake.canDone, false);
  const afterStart = state("in_progress", [take], [receipt("sent", "start")]);
  assert.equal(afterStart.canTake, false); assert.equal(afterStart.canStart, false); assert.equal(afterStart.canDone, true);
  assert.equal(state("completed", [take], [receipt("sent", "start"), receipt("sent", "done")]).canDone, false);
});

test("ambiguous, in-flight and unrecognized delivery states cannot create duplicate Telegram reports", () => {
  for (const status of ["sending", "unknown", "unexpected"]) {
    for (const action of [undefined, "start", "done"]) {
      const result = action
        ? state(action === "done" ? "in_progress" : "assigned", [receipt("sent")],
          [receipt(status, action), ...(action === "done" ? [receipt("sent", "start")] : [])])
        : state("assigned", [receipt(status)]);
      assert.equal(result.deliveryUncertain, true);
      assert.equal(result.canTake || result.canStart || result.canDone, false);
    }
  }
});

test("definite Telegram rejection permits a deliberate retry of only the failed step", () => {
  assert.equal(state("assigned", [receipt("failed")]).canTake, true);
  assert.equal(state("assigned", [receipt("sent")], [receipt("failed", "start")]).canStart, true);
  assert.equal(state("in_progress", [receipt("sent")], [receipt("sent", "start"), receipt("failed", "done")]).canDone, true);
  assert.equal(state("in_progress", [], [receipt("sent", "start")]).canDone, false);
});

test("other employees, previous groups and website-only assignments never unlock app actions", () => {
  for (const patch of [{ employee_code: "E2" }, { chat_id: -999 }]) {
    const result = state("assigned", [receipt("sent", undefined, patch)]);
    assert.equal(result.canStart || result.canTake || result.canDone, false);
    assert.equal(result.deliveryUncertain, true);
  }
  const legacy = order(); legacy.workerAssignments![0].id = "website:1";
  assert.equal(mobileWorkflow(legacy, "E1", -123, [], []).canTake, false);
});
