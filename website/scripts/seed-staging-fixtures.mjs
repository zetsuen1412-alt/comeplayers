import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;
const fixtureEnvironment = String(process.env.FIXTURE_ENV || "").toLowerCase();
const prefix = String(process.env.E2E_FIXTURE_PREFIX || "cp-v20").toLowerCase();

if (!supabaseUrl || !serviceRoleKey || !password) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and E2E_FIXTURE_PASSWORD are required."
  );
}
if (fixtureEnvironment !== "staging" && fixtureEnvironment !== "test") {
  throw new Error("FIXTURE_ENV must be staging or test.");
}
if (process.env.FIXTURE_CONFIRM !== "COMEPLAYERS_STAGING_ONLY") {
  throw new Error("Set FIXTURE_CONFIRM=COMEPLAYERS_STAGING_ONLY to confirm isolated staging data use.");
}
if (String(process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live") {
  throw new Error("Fixture seeding is blocked while PAYPAL_ENV=live.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const emails = {
  buyer: process.env.E2E_BUYER_EMAIL || `${prefix}+buyer@comeplayers.test`,
  seller: process.env.E2E_SELLER_EMAIL || `${prefix}+seller@comeplayers.test`,
  admin: process.env.E2E_ADMIN_EMAIL || `${prefix}+admin@comeplayers.test`,
};

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}

async function ensureUser(role, email) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { fixture: prefix, fixture_role: role },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fixture: prefix, fixture_role: role },
  });
  if (error || !data.user) throw error || new Error(`Failed to create ${role} user.`);
  return data.user;
}

async function optionalRunInsert() {
  const { data, error } = await supabase
    .from("staging_fixture_runs")
    .insert({
      fixture_key: prefix,
      environment: fixtureEnvironment,
      status: "running",
      manifest: { emails },
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn(`Fixture run tracking unavailable: ${error.message}`);
    return null;
  }
  return data?.id || null;
}

async function finishRun(runId, status, manifest, errorMessage = null) {
  if (!runId) return;
  const { error } = await supabase
    .from("staging_fixture_runs")
    .update({
      status,
      manifest,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) console.warn(`Fixture run update failed: ${error.message}`);
}

const runId = await optionalRunInsert();
let manifest = { fixtureKey: prefix, environment: fixtureEnvironment, emails };

try {
  const users = {
    buyer: await ensureUser("buyer", emails.buyer),
    seller: await ensureUser("seller", emails.seller),
    admin: await ensureUser("admin", emails.admin),
  };

  const profiles = [
    {
      id: users.buyer.id,
      email: emails.buyer,
      username: `${prefix}-buyer`,
      role: "user",
      seller_status: "not_applied",
      bio: "Deterministic V20 staging buyer fixture.",
    },
    {
      id: users.seller.id,
      email: emails.seller,
      username: `${prefix}-seller`,
      seller_name: "V20 Fixture Seller",
      role: "seller",
      seller_status: "approved",
      bio: "Deterministic V20 staging seller fixture.",
    },
    {
      id: users.admin.id,
      email: emails.admin,
      username: `${prefix}-admin`,
      role: "admin",
      seller_status: "not_applied",
      bio: "Deterministic V20 staging admin fixture.",
    },
  ];
  const { error: profileError } = await supabase.from("profiles").upsert(profiles, {
    onConflict: "id",
  });
  if (profileError) throw profileError;

  const { error: walletError } = await supabase.from("wallets").upsert(
    [users.buyer, users.seller].map((user) => ({
      user_id: user.id,
      balance: user.id === users.buyer.id ? 5_000_000 : 0,
      total_earned: 0,
      total_spent: 0,
      total_withdrawn: 0,
      status: "active",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id" }
  );
  if (walletError) throw walletError;

  const [{ data: category, error: categoryError }, { data: game, error: gameError }] =
    await Promise.all([
      supabase.from("categories").select("id,name").order("id").limit(1).maybeSingle(),
      supabase
        .from("game_master")
        .select("id,name,slug")
        .eq("status", "active")
        .order("id")
        .limit(1)
        .maybeSingle(),
    ]);
  if (categoryError || !category) throw categoryError || new Error("No category exists.");
  if (gameError || !game) throw gameError || new Error("No active game exists.");

  const slug = `${prefix}-deterministic-listing`;
  const productPayload = {
    title: "V20 Deterministic Staging Listing",
    description:
      "Controlled staging fixture used for repeatable checkout, seller, and load-test journeys.",
    price: 125000,
    stock: 5000,
    delivery_eta_minutes: 30,
    category: category.name,
    category_id: category.id,
    game_name: game.name,
    game_category_id: game.id,
    seller: "V20 Fixture Seller",
    seller_id: users.seller.id,
    seller_name: "V20 Fixture Seller",
    image_url: null,
    offer_region: "Global",
    offer_platform: "Any",
    offer_server: "Staging",
    offer_tags: ["v20", "fixture", "staging"],
    slug,
    status: "active",
    updated_at: new Date().toISOString(),
  };

  const { data: existingProduct, error: productLookupError } = await supabase
    .from("products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (productLookupError) throw productLookupError;

  let product;
  if (existingProduct) {
    const { data, error } = await supabase
      .from("products")
      .update(productPayload)
      .eq("id", existingProduct.id)
      .select("id,slug")
      .single();
    if (error) throw error;
    product = data;
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert(productPayload)
      .select("id,slug")
      .single();
    if (error) throw error;
    product = data;
  }

  const variantSku = `${prefix}-sku`
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "-")
    .slice(0, 80);
  const variantPayload = {
    product_id: product.id,
    seller_id: users.seller.id,
    sku: variantSku,
    name: "E2E Wallet Delivery SKU",
    attributes: { fixture: prefix, delivery: "wallet-e2e" },
    price: 125000,
    stock: 5000,
    status: "active",
    sort_order: 0,
    updated_at: new Date().toISOString(),
  };

  const { data: existingVariant, error: variantLookupError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", product.id)
    .eq("seller_id", users.seller.id)
    .ilike("sku", variantSku)
    .neq("status", "archived")
    .maybeSingle();
  if (variantLookupError) throw variantLookupError;

  let variant;
  if (existingVariant) {
    const { data, error } = await supabase
      .from("product_variants")
      .update(variantPayload)
      .eq("id", existingVariant.id)
      .select("id,sku,name")
      .single();
    if (error) throw error;
    variant = data;
  } else {
    const { data, error } = await supabase
      .from("product_variants")
      .insert(variantPayload)
      .select("id,sku,name")
      .single();
    if (error) throw error;
    variant = data;
  }

  const { error: syncError } = await supabase.rpc("cp_sync_product_variant_summary", {
    p_product_id: product.id,
  });
  if (syncError) throw syncError;

  const { data: previousOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("buyer_id", users.buyer.id)
    .eq("product_id", product.id)
    .eq("variant_id", variant.id)
    .in("status", ["pending", "pending_payment"])
    .order("created_at", { ascending: false })
    .limit(1);

  let orderId = previousOrders?.[0]?.id || null;
  if (!orderId) {
    const { data: orderResult, error: orderError } = await supabase.rpc(
      "create_marketplace_order_v13",
      {
        p_buyer_id: users.buyer.id,
        p_product_id: product.id,
        p_variant_id: variant.id,
        p_quantity: 1,
        p_payment_method: "wallet",
        p_coupon_code: null,
        p_payment_fee_rate: 0,
        p_reservation_minutes: 60,
      }
    );
    if (orderError) throw orderError;
    orderId = Number(orderResult?.order_id || orderResult?.id || 0) || null;
  }

  manifest = {
    fixtureKey: prefix,
    environment: fixtureEnvironment,
    productId: product.id,
    productSlug: product.slug,
    variantId: variant.id,
    variantSku: variant.sku,
    categoryId: category.id,
    categoryName: category.name,
    gameId: game.id,
    gameName: game.name,
    sellerOrderId: orderId,
    buyerOrderId: orderId,
    disputeId: null,
    buyerId: users.buyer.id,
    sellerId: users.seller.id,
    adminId: users.admin.id,
    emails,
    generatedAt: new Date().toISOString(),
  };

  const output = path.resolve(process.env.E2E_FIXTURE_MANIFEST || "e2e/fixtures.json");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  await finishRun(runId, "completed", manifest);

  console.log(`Seeded deterministic fixtures: ${output}`);
  console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await finishRun(runId, "failed", manifest, message);
  throw error;
}
