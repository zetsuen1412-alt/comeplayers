import { NextResponse } from "next/server";
import { decryptDelivery } from "@/lib/deliveryCrypto";
import {
  normalizeDeliveryAttachmentReferences,
  r2DeliveryObjectKey,
  type DeliveryAttachmentReference,
  type DeliveryAttachmentView,
} from "@/lib/orderDeliveryAttachmentPolicy";
import { createR2DownloadUrl } from "@/lib/r2Server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

type OrderRow = {
  id: number;
  created_at?: string | null;
  product?: string | null;
  buyer?: string | null;
  price?: string | number | null;
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  product_id?: number | null;
  variant_id?: number | null;
  variant_name?: string | null;
  variant_sku?: string | null;
  buyer_id?: string | null;
  seller_id?: string | null;
  quantity?: number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  product_title?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
  escrow_status?: string | null;
  delivered_at?: string | null;
  completed_at?: string | null;
  paid_at?: string | null;
  seller_gross_amount?: string | number | null;
  marketplace_fee_amount?: string | number | null;
  seller_sales_tax_rate_percent?: string | number | null;
  seller_sales_tax_amount?: string | number | null;
  seller_earning_amount?: string | number | null;
  seller_payout_status?: string | null;
  reservation_status?: string | null;
  reservation_expires_at?: string | null;
  expired_at?: string | null;
  expiration_reason?: string | null;
  delivery_sla_minutes?: number | null;
  delivery_due_at?: string | null;
  delivery_late_at?: string | null;
  delivery_sla_status?: string | null;
  seller_service_level_snapshot?: string | null;
  delivery_message?: string | null;
  delivery_credentials?: string | null;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ORDER_DETAIL_FIELDS = [
  "id",
  "created_at",
  "product",
  "buyer",
  "price",
  "status",
  "payment_status",
  "payment_method",
  "product_id",
  "variant_id",
  "variant_name",
  "variant_sku",
  "buyer_id",
  "seller_id",
  "quantity",
  "subtotal_amount",
  "discount_amount",
  "payment_fee_amount",
  "currency_code",
  "total_amount",
  "total_price",
  "product_title",
  "seller_name",
  "game_name",
  "category",
  "escrow_status",
  "delivered_at",
  "completed_at",
  "paid_at",
  "seller_gross_amount",
  "marketplace_fee_amount",
  "seller_sales_tax_rate_percent",
  "seller_sales_tax_amount",
  "seller_earning_amount",
  "seller_payout_status",
  "reservation_status",
  "reservation_expires_at",
  "expired_at",
  "expiration_reason",
  "delivery_sla_minutes",
  "delivery_due_at",
  "delivery_late_at",
  "delivery_sla_status",
  "seller_service_level_snapshot",
  "delivery_message",
  "delivery_credentials",
].join(",");

function maskEmail(value?: string | null) {
  const email = String(value || "").trim();
  const [local, domain] = email.split("@");

  if (!local || !domain) return email || "Buyer";

  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function profileIdentity(profile: Record<string, unknown> | null | undefined) {
  if (!profile) return { name: "", username: "" };

  return {
    name: firstText(
      profile.display_name,
      profile.full_name,
      profile.name,
      profile.nickname
    ),
    username: firstText(
      profile.username,
      profile.user_name,
      profile.handle
    ).replace(/^@/, ""),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const orderId = Number(id);

    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(ORDER_DETAIL_FIELDS)
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { error: orderError?.message || "Order not found." },
        { status: 404 }
      );
    }

    const orderRow = order as unknown as OrderRow;
    const isBuyer =
      orderRow.buyer_id === user.id ||
      Boolean(user.email && orderRow.buyer === user.email);
    const isSeller = orderRow.seller_id === user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "You are not allowed to access this order." },
        { status: 403 }
      );
    }

    let product = null;

    if (orderRow.product_id) {
      const { data: productData } = await supabaseAdmin
        .from("products")
        .select(
          "id,title,image_url,price,seller,seller_id,seller_name,game_name,category,slug,stock,status"
        )
        .eq("id", Number(orderRow.product_id))
        .maybeSingle();

      product = productData || null;
    }

    let buyerName = "";
    let buyerUsername = "";

    if (isSeller && orderRow.buyer_id) {
      let buyerProfile: Record<string, unknown> | null = null;

      const profileById = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", orderRow.buyer_id)
        .maybeSingle();

      if (!profileById.error && profileById.data) {
        buyerProfile = profileById.data as Record<string, unknown>;
      } else {
        const profileByUserId = await supabaseAdmin
          .from("profiles")
          .select("*")
          .eq("user_id", orderRow.buyer_id)
          .maybeSingle();

        if (!profileByUserId.error && profileByUserId.data) {
          buyerProfile = profileByUserId.data as Record<string, unknown>;
        }
      }

      const profileInfo = profileIdentity(buyerProfile);
      buyerName = profileInfo.name;
      buyerUsername = profileInfo.username;

      if (!buyerName || !buyerUsername) {
        const { data: buyerAuthData } =
          await supabaseAdmin.auth.admin.getUserById(orderRow.buyer_id);
        const metadata =
          (buyerAuthData?.user?.user_metadata || {}) as Record<string, unknown>;
        const authInfo = profileIdentity(metadata);

        buyerName = buyerName || authInfo.name;
        buyerUsername = buyerUsername || authInfo.username;
      }
    }

    let deliveryMessage = String(orderRow.delivery_message || "");
    let deliveryCredentials = String(orderRow.delivery_credentials || "");
    let deliveryAttachments: DeliveryAttachmentReference[] = [];

    const { data: vault } = await supabaseAdmin
      .from("order_delivery_vaults")
      .select("ciphertext,iv,auth_tag,key_version")
      .eq("order_id", orderId)
      .maybeSingle();

    if (vault) {
      try {
        const delivery = decryptDelivery(orderId, vault);
        deliveryMessage = delivery.message;
        deliveryCredentials = delivery.credentials;
        deliveryAttachments = normalizeDeliveryAttachmentReferences(delivery.attachments);

        const { error: accessLogError } = await supabaseAdmin.rpc(
          "cp_record_delivery_access",
          {
            p_order_id: orderId,
            p_user_id: user.id,
            p_access_role: isSeller ? "seller" : "buyer",
            p_action: "reveal",
          }
        );

        if (accessLogError) {
          console.error("Delivery access log failed:", accessLogError.message);
        }
      } catch (decryptError) {
        console.error("Delivery decrypt failed:", decryptError);
        deliveryMessage = "";
        deliveryCredentials = "";
      }
    }

    const deliveryAttachmentViews: DeliveryAttachmentView[] = [];
    const expectedDeliveryPrefix = `orders/${orderId}/delivery/${String(orderRow.seller_id || "")}/`;

    for (const attachment of deliveryAttachments) {
      try {
        const objectKey = r2DeliveryObjectKey(attachment.storagePath);
        if (!objectKey.startsWith(expectedDeliveryPrefix)) {
          console.error("Skipped delivery proof with unexpected storage path.");
          continue;
        }
        const url = await createR2DownloadUrl({
          objectKey,
          fileName: attachment.fileName,
          contentType: attachment.mimeType,
          expiresIn: 600,
        });
        deliveryAttachmentViews.push({ ...attachment, url });
      } catch (attachmentError) {
        console.error("Delivery proof URL generation failed:", attachmentError);
        deliveryAttachmentViews.push({ ...attachment, url: null });
      }
    }

    const { data: disputeSummary, error: disputeSummaryError } = await supabaseAdmin
      .from("disputes")
      .select("id,status,reason,category,requested_resolution,created_at,resolved_at")
      .eq("order_id", orderId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (disputeSummaryError) {
      console.error("Order dispute summary failed:", disputeSummaryError.message);
    }

    const safeOrder = {
      ...orderRow,
      buyer: isSeller ? maskEmail(orderRow.buyer) : null,
      buyer_name: isSeller ? buyerName || null : null,
      buyer_username: isSeller ? buyerUsername || null : null,
      buyer_id: null,
      seller_gross_amount: isSeller
        ? orderRow.seller_gross_amount || null
        : null,
      marketplace_fee_amount: isSeller
        ? orderRow.marketplace_fee_amount || null
        : null,
      seller_sales_tax_rate_percent: isSeller
        ? orderRow.seller_sales_tax_rate_percent || null
        : null,
      seller_sales_tax_amount: isSeller
        ? orderRow.seller_sales_tax_amount || null
        : null,
      seller_earning_amount: isSeller
        ? orderRow.seller_earning_amount || null
        : null,
      seller_payout_status: isSeller
        ? orderRow.seller_payout_status || null
        : null,
      delivery_message: deliveryMessage || null,
      delivery_credentials: deliveryCredentials || null,
      delivery_attachments: deliveryAttachmentViews,
    };

    return NextResponse.json({
      order: safeOrder,
      product,
      role: isSeller ? "seller" : "buyer",
      deliveryEncrypted: Boolean(vault),
      dispute: disputeSummary || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected order detail error.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
