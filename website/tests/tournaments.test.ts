import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  parseTournamentCreateInput,
  parseTournamentJoinInput,
} from "../lib/tournaments";

function validTournament() {
  return {
    title: "ComePlayers Open Championship",
    gameTitle: "Valorant",
    gameMode: "5v5 Competitive",
    description: "A professionally hosted tournament for the ComePlayers community.",
    rules: "Fair play is required. Follow the organizer schedule.",
    platform: "PC",
    region: "Southeast Asia",
    tournamentFormat: "single_elimination",
    skillLevel: "all_levels",
    teamSize: 5,
    maxParticipants: 32,
    entryFee: 0,
    prizePool: 1_000_000,
    registrationDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    startsAt: new Date(Date.now() + 172_800_000).toISOString(),
    endsAt: new Date(Date.now() + 176_400_000).toISOString(),
  };
}

test("tournament payload accepts a valid scheduled competition", () => {
  const parsed = parseTournamentCreateInput(validTournament());
  assert.equal(parsed.title, "ComePlayers Open Championship");
  assert.equal(parsed.teamSize, 5);
  assert.equal(parsed.maxParticipants, 32);
});

test("tournament payload rejects a deadline after the match start", () => {
  const input = validTournament();
  input.registrationDeadline = new Date(Date.now() + 172_800_000).toISOString();
  input.startsAt = new Date(Date.now() + 86_400_000).toISOString();
  assert.throws(
    () => parseTournamentCreateInput(input),
    /must start after registration closes/i,
  );
});

test("tournament registration requires an in-game username", () => {
  assert.throws(
    () => parseTournamentJoinInput({ gameUsername: "x" }),
    /in-game username/i,
  );
  assert.equal(
    parseTournamentJoinInput({ gameUsername: "PLAYER-001" }).gameUsername,
    "PLAYER-001",
  );
});

test("community navigation routes tournaments and removes leaderboard control", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "app/messages/page.tsx"),
    "utf8",
  );
  assert.match(page, /router\.push\("\/tournaments"\)/);
  assert.equal(page.includes(">\n            Leaderboards\n"), false);
});
