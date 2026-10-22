import test from "node:test";
import assert from "node:assert/strict";
import { parseFH3ManualOrder, parseFH3Cancellation } from "../lib/fh3ManualTelegram";

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

test("workflow captions, inline credentials with spaces and multiline credential values stay private", () => {
  assert.equal(parseFH3ManualOrder("X4519/andi/start\nTask: proof"), null);
  const result = parseFH3ManualOrder("X4519\nTask: Farm XP login: secret user with spaces\nPassword:\nsecret multi word password\nThen quest");
  assert.equal(result?.task, "Farm XP [credential hidden]\nThen quest");
  assert.equal(parseFH3Cancellation("/fh3_cancel@fixture_bot x4519"), "X4519");
  assert.equal(parseFH3Cancellation("/fh3_cancel X4519 extra"), null);
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

test("X4827 layout accepts standalone AION while keeping credential and Discord/VPN fields out", () => {
  const order=parseFH3ManualOrder([
    "X4827","","Duration :12H","","Username : fixture-login","Password : fixture-password",
    "Discord Server : fixture-server","VPN : Ask on Discord","AION","","Task :","Farm items and finish quests",
  ].join("\n"));
  assert.equal(order?.orderRef,"X4827");assert.equal(order?.duration,"12H");
  assert.equal(order?.game,"AION");assert.equal(order?.task,"Farm items and finish quests");
  assert.doesNotMatch(JSON.stringify(order),/fixture-login|fixture-password|fixture-server|VPN|Discord/);
});
