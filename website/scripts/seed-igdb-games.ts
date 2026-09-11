import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  applyApprovedIgdbCandidates,
  stagePopularIgdbGames,
  syncExistingIgdbGames,
} from "../lib/igdb/catalog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mode = String(process.argv[2] || process.env.IGDB_IMPORT_MODE || "STAGE").toUpperCase();
const limit = Math.max(
  1,
  Math.min(500, Number(process.env.IGDB_SYNC_BATCH_SIZE || 100))
);
const offset = Math.max(0, Number(process.env.IGDB_SYNC_OFFSET || 0));
const gameTypes = String(process.env.IGDB_GAME_TYPES || "0")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 0);

async function main() {
  if (mode === "STAGE") {
    const result = await stagePopularIgdbGames({
      supabaseAdmin,
      limit,
      offset,
      gameTypes,
    });
    console.log("IGDB stage completed:", result);
    return;
  }

  if (mode === "APPLY") {
    const result = await applyApprovedIgdbCandidates({
      supabaseAdmin,
      limit,
    });
    console.log("IGDB apply completed:", result);
    return;
  }

  if (mode === "SYNC") {
    const result = await syncExistingIgdbGames({
      supabaseAdmin,
      limit,
    });
    console.log("IGDB sync completed:", result);
    return;
  }

  throw new Error(
    `Unsupported IGDB_IMPORT_MODE=${mode}. Use STAGE, APPLY, or SYNC.`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
