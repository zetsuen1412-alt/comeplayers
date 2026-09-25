import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("auth V23.1 register, verification, and reset flows use the callback guard", () => {
  const authModal = source("components/auth/AuthModal.tsx");
  const confirmPage = source("app/auth/confirm/AuthConfirmClient.tsx");
  const confirmFallback = source("app/auth/confirm/page.tsx");
  const resetPage = source("app/reset-password/page.tsx");

  assert.match(
    authModal,
    /const oauthReturnUrl = buildAuthCallbackUrl\([\s\S]*getAuthReturnPath\(\)[\s\S]*\);/,
  );
  assert.match(authModal, /resetPasswordForEmail/);
  assert.match(authModal, /emailRedirectTo:\s*buildAuthCallbackUrl/);
  assert.match(confirmPage, /sanitizeAuthRedirect/);
  assert.match(confirmPage, /verifyOtp/);
  assert.match(confirmPage, /type === "signup"/);
  assert.match(confirmPage, /Signing you in/);
  assert.doesNotMatch(confirmFallback, /Verifying email/);
  assert.match(confirmFallback, /Returning you to ComePlayers/);
  assert.match(resetPage, /updateUser\(\{\s*password\s*\}\)/);
});

test("auth modal logo is rendered without the checkerboard bitmap asset", () => {
  const authModal = source("components/auth/AuthModal.tsx");
  const brandLogo = source("components/brand/ComePlayersLogo.tsx");

  assert.match(authModal, /ComePlayersLogo/);
  assert.match(brandLogo, /aria-label="ComePlayers"/);
  assert.match(brandLogo, /src="\/logo\.png"/);
  assert.match(brandLogo, /from "next\/image"/);
  assert.doesNotMatch(authModal, /logo-transparent\.png/);
  assert.doesNotMatch(brandLogo, /logo-transparent\.png/);
});

test("marketplace game categories show mapped or actively listed games", () => {
  const gamesRoute = source("app/api/games/route.ts");
  const adminGames = source("app/admin/games/page.tsx");

  assert.match(gamesRoute, /let activeCategory/);
  assert.match(gamesRoute, /categoryProductGameIds/);
  assert.match(gamesRoute, /id\.in\.\(\$\{categoryGameIds\.join\(","\)\}\)/);
  assert.match(gamesRoute, /from\("game_master_marketplace_catalog"\)/);
  assert.match(gamesRoute, /if \(activeCategory\)[\s\S]*category_id\.eq/);
  assert.match(adminGames, /GameCategoryCheckboxes/);
  assert.match(adminGames, /category_id/);
});

test("gift cards and software use curated non-game marketplace catalogs", () => {
  const gamesRoute = source("app/api/games/route.ts");
  const browsePage = source("app/games/BrowseGamesClient.tsx");
  const marketplaceCatalog = source("lib/marketplaceCatalog.ts");

  assert.match(
    gamesRoute,
    /isCuratedMarketplaceCategory\(activeCategory\.slug\)/,
  );
  assert.match(gamesRoute, /getCuratedMarketplaceCatalog/);
  assert.match(gamesRoute, /applyCuratedOfferCounts/);
  assert.match(
    browsePage,
    /Gift Cards Catalog|Software Catalog|getCuratedCategoryMeta/,
  );
  assert.match(marketplaceCatalog, /Google Play Gift Card/);
  assert.match(marketplaceCatalog, /Spotify Premium/);
  assert.match(marketplaceCatalog, /Netflix Gift Card/);
  assert.match(marketplaceCatalog, /Microsoft 365/);
  assert.match(marketplaceCatalog, /Windows 11 License/);
});

test("dark legal center exposes marketplace policy menu pages", () => {
  const header = source("app/components/MainHeader.tsx");
  const footer = source("components/layout/SiteFooter.tsx");
  const layout = source("app/layout.tsx");
  const legalContent = source("lib/legalContent.ts");
  const legalHub = source("app/legal/page.tsx");
  const legalArticle = source("components/legal/LegalArticlePage.tsx");
  const privacyPage = source("app/privacy/page.tsx");
  const termsPage = source("app/terms/page.tsx");

  assert.doesNotMatch(header, /href="\/legal"/);
  assert.match(layout, /<SiteFooter \/>/);
  assert.match(footer, /href: "\/legal"/);
  assert.match(footer, /FaDiscord/);
  assert.match(footer, /FaInstagram/);
  assert.match(footer, /FaXTwitter/);
  assert.match(legalContent, /privacy-policy/);
  assert.match(legalContent, /terms-of-service/);
  assert.match(legalContent, /product-offering-policy/);
  assert.match(legalContent, /seller-rules/);
  assert.match(legalContent, /payment-fee-schedule/);
  assert.match(legalContent, /refund-cancellation-policy/);
  assert.match(legalContent, /advertising-policy/);
  assert.match(legalHub, /Legal Center/);
  assert.match(legalArticle, /Legal menu/);
  assert.match(privacyPage, /privacy-policy/);
  assert.match(termsPage, /terms-of-service/);
});

test("checkout creates an immutable order pricing and seller tax snapshot", () => {
  const checkoutRoute = source("app/api/checkout/create-order/route.ts");
  const profilePatch = source(
    "scripts/comeplayers_profiles_full_name_v23_5.sql",
  );

  assert.match(checkoutRoute, /cp_create_quoted_marketplace_order_v1/);
  assert.match(checkoutRoute, /verifyCheckoutQuote/);
  const pricing = source("supabase/migrations/20260916144937_marketplace_pricing_consistency.sql");
  assert.match(pricing, /cp_apply_seller_tax_v23/);
  assert.match(pricing, /p_expected_quote/);
  assert.match(profilePatch, /ADD COLUMN IF NOT EXISTS full_name text/);
});

test("checkout order migration supports product-level listings without variants", () => {
  const v13Migration = source("scripts/comeplayers_catalog_variants_v13.sql");
  const v23Patch = source(
    "scripts/comeplayers_checkout_variant_null_fix_v23_3.sql",
  );
  const v23CouponPatch = source(
    "scripts/comeplayers_checkout_coupon_record_fix_v23_4.sql",
  );

  for (const sql of [v13Migration, v23Patch]) {
    assert.match(sql, /v_variant_name text := NULL;/);
    assert.match(sql, /v_variant_sku text := NULL;/);
    assert.match(sql, /v_coupon_id bigint := NULL;/);
    assert.match(sql, /v_coupon_id := v_coupon\.id;/);
    assert.match(
      sql,
      /price = CASE WHEN v_min IS NOT NULL THEN v_min::text ELSE price END/,
    );
    assert.doesNotMatch(
      sql,
      /CASE WHEN p_variant_id IS NOT NULL THEN v_variant\.(name|sku) ELSE NULL END/,
    );
    assert.doesNotMatch(
      sql,
      /CASE WHEN v_coupon_code IS NOT NULL THEN v_coupon\.id ELSE NULL END/,
    );
  }
  assert.match(v23CouponPatch, /pg_get_functiondef/);
  assert.match(v23CouponPatch, /v_coupon_id bigint := NULL/);
  assert.match(v23CouponPatch, /v_coupon_id := v_coupon\.id/);
});

test("seller listing creation skips manual SKU variant setup", () => {
  const productUpload = source(
    "app/seller/products/new/ProductUploadClient.tsx",
  );
  const variantsPage = source("app/seller/products/[id]/variants/page.tsx");
  const sellerProducts = source("app/seller/products/page.tsx");

  assert.match(productUpload, /window\.location\.href = "\/seller\/products"/);
  assert.doesNotMatch(
    productUpload,
    /\/seller\/products\/\$\{result\.product\.id\}\/variants/,
  );
  assert.match(variantsPage, /redirect\("\/seller\/products"\)/);
  assert.doesNotMatch(sellerProducts, /Manage Variants/);
});

test("seller product upload searches games without loading the full catalog", () => {
  const productUpload = source(
    "app/seller/products/new/ProductUploadClient.tsx",
  );
  const gameSearchRoute = source("app/api/games/search/route.ts");

  assert.match(productUpload, /fetchGameOptions/);
  assert.match(productUpload, /\/api\/games\/search/);
  assert.match(productUpload, /requestedGameSlug/);
  assert.match(productUpload, /setGameQuery\(nextGame\.name\)/);
  assert.doesNotMatch(
    productUpload,
    /from\("game_master"\)[\s\S]*order\("name"/,
  );
  assert.match(gameSearchRoute, /searchParams\.get\("slug"\)/);
  assert.match(gameSearchRoute, /searchParams\.get\("id"\)/);
  assert.match(gameSearchRoute, /clampLimit/);
});

test("group messages support invite remove avatar timeline and openable live watch links", () => {
  const messagesPage = source("app/messages/page.tsx");
  const membersRoute = source("app/api/messages/rooms/[id]/members/route.ts");

  assert.match(messagesPage, /function ProfileAvatar/);
  assert.match(messagesPage, /inviteMember/);
  assert.match(messagesPage, /removeMember/);
  assert.match(messagesPage, /FaUserPlus/);
  assert.match(messagesPage, /FaUserMinus/);
  assert.match(messagesPage, /target="_blank"/);
  assert.match(messagesPage, /live=1/);
  assert.match(membersRoute, /export async function POST/);
  assert.match(membersRoute, /export async function DELETE/);
  assert.match(membersRoute, /\.from\("chat_room_members"\)/);
  assert.match(membersRoute, /\.from\("chat_party_invitations"\)/);
  assert.match(membersRoute, /status: "pending"/);
  assert.match(membersRoute, /status: "removed"/);
});

test("order completion releases escrow through the V23 settlement RPC", () => {
  const completeRoute = source("app/api/orders/complete/route.ts");
  const v23Migration = source("scripts/comeplayers_finance_governance_v23.sql");
  const walletTypePatch = source(
    "scripts/comeplayers_wallet_transaction_types_v23_6.sql",
  );

  assert.match(completeRoute, /complete_order_and_release_escrow_v23/);
  assert.match(completeRoute, /seller_payout_released/);
  assert.match(v23Migration, /order_pricing_snapshots/i);
  assert.match(v23Migration, /seller_earning/i);
  assert.match(v23Migration, /wallet_transactions/i);
  assert.match(walletTypePatch, /buyer_order_payment/);
  assert.match(walletTypePatch, /seller_order_payout/);
  assert.match(walletTypePatch, /withdraw_paid/);
});

test("withdrawal quote, tax, FX, and payout execution stay on V23 contracts", () => {
  const quoteRoute = source("app/api/withdrawals/quote/route.ts");
  const adminWithdrawalsRoute = source("app/api/admin/withdrawals/route.ts");
  const tax = source("lib/tax.ts");
  const fx = source("lib/fx.ts");
  const paypalPayout = source("lib/paypalPayout.ts");

  assert.match(quoteRoute, /cp_quote_withdrawal_v23/);
  assert.match(adminWithdrawalsRoute, /cp_admin_process_withdrawal_v23/);
  assert.match(adminWithdrawalsRoute, /execute_provider/);
  assert.match(adminWithdrawalsRoute, /seller_tax_residencies/);
  assert.match(tax, /calculateWithdrawalTaxQuote/);
  assert.match(fx, /quoteFx/);
  assert.match(paypalPayout, /sender_batch_id/);
});

test("dispute buyer-win refunds and seller-win escrow release use admin finance helpers", () => {
  const adminDisputesRoute = source("app/api/admin/disputes/route.ts");
  const adminOrderActions = source("lib/adminOrderActions.ts");

  assert.match(adminDisputesRoute, /refundMarketplaceOrder/);
  assert.match(adminDisputesRoute, /completeMarketplaceOrderAsAdmin/);
  assert.match(adminDisputesRoute, /recordAdminAudit/);
  assert.match(adminOrderActions, /cp_refund_order_to_wallet/);
  assert.match(adminOrderActions, /complete_order_and_release_escrow_v23/);
});
