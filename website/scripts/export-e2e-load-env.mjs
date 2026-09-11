import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;
const manifestPath = path.resolve(process.env.E2E_FIXTURE_MANIFEST || "e2e/fixtures.json");
const githubEnv = process.env.GITHUB_ENV;
if (!supabaseUrl || !anonKey || !password) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and E2E_FIXTURE_PASSWORD are required."
  );
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

async function token(email) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`Fixture authentication failed for ${email}.`);
  }
  return payload.access_token;
}

const values = {
  BUYER_TOKEN: await token(manifest.emails.buyer),
  SELLER_TOKEN: await token(manifest.emails.seller),
  FIXTURE_PRODUCT_ID: manifest.productId,
  FIXTURE_CATEGORY_ID: manifest.categoryId,
  FIXTURE_CATEGORY_NAME: manifest.categoryName,
  FIXTURE_GAME_ID: manifest.gameId,
  FIXTURE_GAME_NAME: manifest.gameName,
  LOAD_RUN_ID: Date.now(),
};

const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value ?? "")}`);
if (githubEnv) {
  await fs.appendFile(githubEnv, `${lines.join("\n")}\n`);
} else {
  console.log(lines.join("\n"));
}
