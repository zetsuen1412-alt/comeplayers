import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@comeplayers.com";
const CONFIRMATION = "DELETE_NON_ADMIN_COMEPLAYERS_DATA";
const execute = process.argv.includes("--execute");
const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));
const confirmed = confirmArg?.slice("--confirm=".length) === CONFIRMATION;

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  throw new Error(`Missing required env vars: ${missingEnv.join(", ")}`);
}

if (execute && !confirmed) {
  throw new Error(
    `Refusing to delete data. Re-run with --execute --confirm=${CONFIRMATION}`
  );
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const allRowTables = [
  ["chat_attachments", "id"],
  ["chat_typing", "room_id"],
  ["chat_reports", "id"],
  ["chat_moderation_events", "id"],
  ["chat_messages", "id"],
  ["chat_rooms", "id"],
  ["messages", "id"],
  ["conversations", "id"],
  ["support_ticket_messages", "id"],
  ["support_tickets", "id"],
  ["dispute_events", "id"],
  ["dispute_evidence", "id"],
  ["dispute_messages", "id"],
  ["disputes", "id"],
  ["reviews", "id"],
  ["seller_reviews", "id"],
  ["coupon_usages", "id"],
  ["notification_event_logs", "id"],
  ["notifications", "id"],
  ["notification_events", "id"],
  ["marketplace_events", "id"],
  ["recently_viewed", "id"],
  ["wishlists", "id"],
  ["order_delivery_access_logs", "id"],
  ["order_delivery_vaults", "order_id"],
  ["order_invoices", "id"],
  ["order_tax_snapshots", "id"],
  ["seller_sales_tax_snapshots", "id"],
  ["order_pricing_snapshots", "id"],
  ["paypal_provider_checks", "id"],
  ["provider_settlement_lines", "id"],
  ["provider_settlement_reports", "id"],
  ["reconciliation_issues", "id"],
  ["reconciliation_runs", "id"],
  ["paypal_transactions", "id"],
  ["payment_webhook_events", "id"],
  ["orders", "id"],
  ["payout_execution_attempts", "id"],
  ["product_stock_reservations", "id"],
  ["seller_store_featured_products", "id"],
  ["flash_sales", "id"],
  ["product_policy_reviews", "id"],
  ["product_variants", "id"],
  ["products", "id"],
  ["seller_tax_statement_lines", "id"],
];

const userScopedTables = [
  ["admin_audit_logs", "admin_id"],
  ["announcement_reads", "user_id"],
  ["announcements", "created_by"],
  ["seller_tax_statements", "seller_id"],
  ["seller_tax_ledger", "seller_id"],
  ["seller_tax_residencies", "seller_id"],
  ["seller_policy_strikes", "seller_id"],
  ["seller_followers", "seller_id"],
  ["seller_followers", "follower_id"],
  ["seller_daily_stats", "seller_id"],
  ["seller_applications", "user_id"],
  ["withdrawal_requests", "user_id"],
  ["payout_accounts", "user_id"],
  ["wallet_topups", "user_id"],
  ["wallet_transactions", "user_id"],
  ["wallets", "user_id"],
  ["privacy_events", "user_id"],
  ["privacy_requests", "user_id"],
  ["security_events", "user_id"],
  ["user_account_settings", "user_id"],
  ["user_billing_profiles", "user_id"],
  ["user_presence", "user_id"],
  ["user_risk_profiles", "user_id"],
  ["user_security_controls", "user_id"],
  ["user_security_devices", "user_id"],
  ["user_social_connections", "user_id"],
  ["user_verifications", "user_id"],
];

function chunk(values, size = 50) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function listAuthUsers() {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    users.push(...(data.users || []));
    if (!data.users || data.users.length < 1000) break;
    page += 1;
  }

  return users;
}

async function countAllRows(table, markerColumn) {
  const { count, error } = await supabase
    .from(table)
    .select(markerColumn, { count: "exact", head: true })
    .not(markerColumn, "is", null);

  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function deleteAllRows(table, markerColumn) {
  const { error } = await supabase
    .from(table)
    .delete()
    .not(markerColumn, "is", null);

  if (error) throw new Error(`${table}: ${error.message}`);
}

async function countRowsByUsers(table, column, userIds) {
  let total = 0;

  for (const ids of chunk(userIds)) {
    const { count, error } = await supabase
      .from(table)
      .select(column, { count: "exact", head: true })
      .in(column, ids);

    if (error) throw new Error(`${table}.${column}: ${error.message}`);
    total += count || 0;
  }

  return total;
}

async function deleteRowsByUsers(table, column, userIds) {
  for (const ids of chunk(userIds)) {
    const { error } = await supabase.from(table).delete().in(column, ids);
    if (error) throw new Error(`${table}.${column}: ${error.message}`);
  }
}

async function main() {
  const authUsers = await listAuthUsers();
  const admin = authUsers.find(
    (user) => user.email?.toLowerCase() === ADMIN_EMAIL
  );

  if (!admin) {
    throw new Error(`Admin account ${ADMIN_EMAIL} was not found. Aborting.`);
  }

  const nonAdminUsers = authUsers.filter(
    (user) => user.email?.toLowerCase() !== ADMIN_EMAIL
  );
  const nonAdminUserIds = nonAdminUsers.map((user) => user.id);
  const report = [];

  report.push(["auth.users except admin", nonAdminUsers.length]);

  for (const [table, markerColumn] of allRowTables) {
    report.push([table, await countAllRows(table, markerColumn)]);
  }

  if (nonAdminUserIds.length > 0) {
    for (const [table, column] of userScopedTables) {
      report.push([`${table}.${column}`, await countRowsByUsers(table, column, nonAdminUserIds)]);
    }

    report.push([
      "profiles.id",
      await countRowsByUsers("profiles", "id", nonAdminUserIds),
    ]);
  } else {
    for (const [table, column] of userScopedTables) {
      report.push([`${table}.${column}`, 0]);
    }
    report.push(["profiles.id", 0]);
  }

  console.table(
    report.map(([scope, rows]) => ({
      scope,
      rows,
      mode: execute ? "delete" : "dry-run",
    }))
  );

  if (!execute) {
    console.log(
      `Dry-run only. To delete, run: node --env-file=.env.local scripts/cleanup-comeplayers-data.mjs --execute --confirm=${CONFIRMATION}`
    );
    return;
  }

  for (const [table, markerColumn] of allRowTables) {
    await deleteAllRows(table, markerColumn);
  }

  if (nonAdminUserIds.length > 0) {
    for (const [table, column] of userScopedTables) {
      await deleteRowsByUsers(table, column, nonAdminUserIds);
    }

    await deleteRowsByUsers("profiles", "id", nonAdminUserIds);
  }

  for (const user of nonAdminUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`auth.users.${user.id}: ${error.message}`);
  }

  console.log(
    `Cleanup complete. Kept admin account ${ADMIN_EMAIL} (${admin.id}).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
