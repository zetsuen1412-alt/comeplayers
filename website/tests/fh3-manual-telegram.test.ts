import test from "node:test";
import assert from "node:assert/strict";
import { parseFH3ManualOrder } from "../lib/fh3ManualTelegram";

test("manual Telegram photo caption supplies code, game and multi-line TASK", () => {
  const caption = [
    "X4519",
    "duration 8hours",
    "ID: secret-login",
    "Pass: secret-password",
    "SERVER Triniel",
    "game : aion2",
    "task :",
    "Finish the Cleric quest",
    "Farm Abyss points with Ranger",
  ].join("\n");
  const order = parseFH3ManualOrder(caption);
  assert.equal(order?.orderRef, "X4519");
  assert.equal(order?.game, "aion2");
  assert.equal(order?.serverName, "Triniel");
  assert.equal(order?.duration, "8hours");
  assert.equal(order?.task, "Finish the Cleric quest\nFarm Abyss points with Ranger");
  assert.ok(!JSON.stringify(order).includes("secret-login"));
  assert.ok(!JSON.stringify(order).includes("secret-password"));
});

test("a task field never forwards credential lines even if added after TASK", () => {
  const order = parseFH3ManualOrder(
    "X4759\nGame: AION 2\nTask: Farm XP\nPassword: hidden123\nOTP: 123456\nThen finish quest");
  assert.equal(order?.task, "Farm XP\nThen finish quest");
});

test("photo without TASK and workflow proof caption cannot create an order", () => {
  assert.equal(parseFH3ManualOrder("X4519\ngame: aion2"), null);
  assert.equal(parseFH3ManualOrder("x4519/employee/start"), null);
  assert.equal(parseFH3ManualOrder("Order X4519\ntask: test"), null);
});

test("order code and TASK remain normalized and bounded", () => {
  const order = parseFH3ManualOrder("x4519\nTuGaS : " + "A".repeat(600));
  assert.equal(order?.orderRef, "X4519");
  assert.equal(order?.task.length, 400);
  assert.equal(parseFH3ManualOrder("x4519\nTASK: "), null);
});
