import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { encryptDelivery } from "../lib/deliveryCrypto";

// Next.js automatically reads .env.local, but standalone scripts executed with
// `tsx` do not. Load it explicitly, then use .env only as a fallback.
const projectRoot = process.cwd();
config({ path: path.resolve(projectRoot, ".env.local"), override: false });
config({ path: path.resolve(projectRoot, ".env"), override: false });

type LegacyDeliveryOrder = {
  id: number;
  seller_id: string | null;
  delivery_message: string | null;
  delivery_credentials: string | null;
};

const supabaseUrl = String(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
).trim();
const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const deliveryEncryptionKey = String(
  process.env.DELIVERY_ENCRYPTION_KEY || ""
).trim();
const dryRun = process.argv.includes("--dry-run");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    [
      "Supabase environment variables are missing.",
      "Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
      `Checked: ${path.resolve(projectRoot, ".env.local")} and ${path.resolve(projectRoot, ".env")}`,
    ].join(" ")
  );
}

if (!deliveryEncryptionKey) {
  throw new Error(
    `DELIVERY_ENCRYPTION_KEY is missing. Checked ${path.resolve(projectRoot, ".env.local")} and ${path.resolve(projectRoot, ".env")}.`
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`Mode: ${dryRun ? "dry-run" : "migration"}`);
  console.log(`Project root: ${projectRoot}`);

  const { data, error } = await supabase
    .from("orders")
    .select("id,seller_id,delivery_message,delivery_credentials")
    .or("delivery_message.not.is.null,delivery_credentials.not.is.null")
    .order("id", { ascending: true });

  if (error) throw new Error(`Unable to read legacy deliveries: ${error.message}`);

  const orders = (data || []) as LegacyDeliveryOrder[];
  console.log(`Found ${orders.length} legacy delivery row(s).`);

  let migrated = 0;
  let skipped = 0;

  for (const order of orders) {
    if (!order.seller_id) {
      console.warn(`Skipping order #${order.id}: seller_id is missing.`);
      skipped += 1;
      continue;
    }

    const encrypted = encryptDelivery(order.id, {
      message: String(order.delivery_message || ""),
      credentials: String(order.delivery_credentials || ""),
    });

    if (dryRun) {
      console.log(`[dry-run] Would encrypt order #${order.id}.`);
      migrated += 1;
      continue;
    }

    const { error: vaultError } = await supabase
      .from("order_delivery_vaults")
      .upsert(
        {
          order_id: order.id,
          seller_id: order.seller_id,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_version: encrypted.keyVersion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "order_id" }
      );

    if (vaultError) {
      throw new Error(`Order #${order.id}: ${vaultError.message}`);
    }

    const { error: clearError } = await supabase
      .from("orders")
      .update({
        delivery_message: null,
        delivery_credentials: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("seller_id", order.seller_id);

    if (clearError) {
      throw new Error(`Order #${order.id}: ${clearError.message}`);
    }

    console.log(`Encrypted delivery for order #${order.id}.`);
    migrated += 1;
  }

  console.log(
    `${dryRun ? "Dry run complete" : "Migration complete"}: ${migrated} migrated, ${skipped} skipped.`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Delivery-vault migration failed: ${message}`);
  process.exitCode = 1;
});
