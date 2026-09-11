import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fixtureEnvironment = String(process.env.FIXTURE_ENV || "").toLowerCase();
const manifestPath = path.resolve(process.env.E2E_FIXTURE_MANIFEST || "e2e/fixtures.json");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
if (fixtureEnvironment !== "staging" && fixtureEnvironment !== "test") {
  throw new Error("FIXTURE_ENV must be staging or test.");
}
if (process.env.FIXTURE_CONFIRM !== "COMEPLAYERS_STAGING_ONLY") {
  throw new Error("Set FIXTURE_CONFIRM=COMEPLAYERS_STAGING_ONLY to confirm isolated staging data use.");
}
if (String(process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live") {
  throw new Error("Fixture cleanup is blocked while PAYPAL_ENV=live.");
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function deleteRows(table, column, values) {
  const filtered = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (filtered.length === 0) return;
  const { error } = await supabase.from(table).delete().in(column, filtered);
  if (error) console.warn(`${table} cleanup warning: ${error.message}`);
}

await deleteRows("orders", "id", [manifest.sellerOrderId, manifest.buyerOrderId]);
await deleteRows("product_variants", "id", [manifest.variantId]);
await deleteRows("products", "id", [manifest.productId]);
await deleteRows("wallets", "user_id", [manifest.buyerId, manifest.sellerId]);
await deleteRows("profiles", "id", [manifest.buyerId, manifest.sellerId, manifest.adminId]);

for (const userId of [manifest.buyerId, manifest.sellerId, manifest.adminId].filter(Boolean)) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) console.warn(`Auth user cleanup warning (${userId}): ${error.message}`);
}

const { error: runError } = await supabase
  .from("staging_fixture_runs")
  .update({
    status: "cleaned",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq("fixture_key", manifest.fixtureKey)
  .eq("status", "completed");
if (runError) console.warn(`Fixture tracking cleanup warning: ${runError.message}`);

await fs.rm(manifestPath, { force: true });
console.log(`Cleaned fixture ${manifest.fixtureKey}.`);
