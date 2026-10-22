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

test("X4827 layout retains AION and Discord while excluding credentials and VPN", () => {
  const order=parseFH3ManualOrder([
    "X4827","","Duration :12H","","Username : fixture-login","Password : fixture-password",
    "Discord Server : fixture-server","VPN : Ask on Discord","AION","","Task :","Farm items and finish quests",
  ].join("\n"));
  assert.equal(order?.orderRef,"X4827");assert.equal(order?.duration,"12H");
  assert.equal(order?.game,"AION");assert.equal(order?.task,"Farm items and finish quests");
  assert.equal(order?.discord,"fixture-server");
  assert.doesNotMatch(JSON.stringify(order),/fixture-login|fixture-password|VPN/);
});

test("Discord labels are normalized, bounded and do not capture credential continuations", () => {
  for (const label of ["Discord", "Discord Server", "DC Server", "dc", "dIsCoRd SeRvEr"]) {
    const result = parseFH3ManualOrder(`X4839\n${label} : FH3 Demo\nTask: Farm XP`);
    assert.equal(result?.discord, "FH3 Demo");
    assert.equal(result?.task, "Farm XP");
  }
  assert.equal(parseFH3ManualOrder("X4839\nDC Server = " + "A".repeat(200) + "\nTask: Farm XP")?.discord.length, 150);
  assert.equal(parseFH3ManualOrder("X4839\nTask: Farm XP")?.discord, "");
  const protectedValue = parseFH3ManualOrder("X4839\nPassword:\nDiscord: secret-continuation\nTask: Farm XP");
  assert.equal(protectedValue?.discord, "");
  assert.doesNotMatch(JSON.stringify(protectedValue), /secret-continuation/);
  assert.doesNotMatch(JSON.stringify(parseFH3ManualOrder("X4839\nDiscord: FH3 Demo Password: secret-inline\nTask: Farm XP")), /secret-inline/);
});
