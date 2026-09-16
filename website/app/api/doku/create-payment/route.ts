import { orderTotalIdr } from "@/lib/money";
import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  buildDokuAttemptInvoice,
  buildDokuInvoice,
  sanitizeDokuText,
} from "@/lib/dokuSignature";
import {
  createDokuCardPaymentPage,
  createDokuCheckout,
  createDokuVirtualAccount,
  createDokuWalletPayment,
  DOKU_NOTIFICATION_TARGET,
  DokuProviderError,
  getDokuPaymentDueMinutes,
} from "@/lib/dokuServer";
import {
  createDokuQrisPayment,
  isTrustedDokuQrisImageUrl,
} from "@/lib/dokuMcpServer";
import {
  createDokuSnapQrisPayment,
  DokuSnapConfigurationError,
  DokuSnapQrisError,
  isTrustedGeneratedQrisDataUrl,
  renderQrisDataUrl,
} from "@/lib/dokuSnapQrisServer";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

type PaymentMethod = "bank_transfer" | "card" | "doku_wallet" | "qris";

type PaymentAttemptRow = {
  status: string | null;
  invoice_number: string | null;
  provider_request_id: string | null;
  virtual_account_number: string | null;
  how_to_pay_url: string | null;
  qr_content: string | null;
  qr_image_url: string | null;
  terminal_id: string | null;
  expires_at: string | null;
};

type OrderRow = {
  id: number;
  buyer_id: string | null;
  seller_id: string | null;
  product_id: number | null;
  product_title: string | null;
  quantity: number | null;
  total_amount: string | number | null;
  total_price: string | number | null;
  price: string | number | null;
  invoice_number: string | null;
  currency_code: string | null;
  status: string | null;
  payment_status: string | null;
};

function numberPrice(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const direct = Number(value.replace(/,/g, "").trim());
  if (Number.isFinite(direct)) return direct;

  const sanitized = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(sanitized) ? sanitized : 0;
}

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function isActiveVirtualAccount(attempt: PaymentAttemptRow | null) {
  if (!attempt || normalize(attempt.status) !== "active") return false;
  if (!/^\d{8,28}$/.test(String(attempt.virtual_account_number || ""))) {
    return false;
  }

  const expiresAt = Date.parse(String(attempt.expires_at || ""));
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000;
}

function isActiveQris(attempt: PaymentAttemptRow | null) {
  if (!attempt || normalize(attempt.status) !== "active") return false;

  if (!/^[A-Za-z0-9]{1,30}$/.test(String(attempt.invoice_number || ""))) {
    return false;
  }

  const content = String(attempt.qr_content || "");
  if (
    content.length < 80 ||
    content.length > 1024 ||
    !/^[\x20-\x7E]+$/.test(content)
  ) {
    return false;
  }

  const expiresAt = Date.parse(String(attempt.expires_at || ""));
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000;
}

function dokuErrorLog(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    status:
      error instanceof DokuProviderError
        ? error.status
        : error instanceof DokuSnapQrisError
          ? error.status
          : null,
    requestId:
      error instanceof DokuProviderError ? error.requestId : null,
    responseCode:
      error instanceof DokuSnapQrisError ? error.responseCode : null,
    message:
      error instanceof Error
        ? error.message.replace(/[\r\n\t]+/g, " ").slice(0, 220)
        : null,
  };
}

function getPublicSiteUrl(request: Request) {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const fallback = new URL(request.url).origin;
  const candidate = configured || fallback;
  const parsed = new URL(candidate);

  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
  ) {
    throw new Error("The public site URL must use HTTPS.");
  }

  return parsed.origin;
}

function getNotificationUrl(siteUrl: string) {
  const configured = String(process.env.DOKU_NOTIFICATION_URL || "").trim();
  const parsed = new URL(configured || DOKU_NOTIFICATION_TARGET, siteUrl);

  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
  ) {
    throw new Error("The DOKU notification URL must use HTTPS.");
  }

  return parsed.toString();
}

export async function POST(request: Request) {
  try {
    const buyer = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      orderId?: number | string;
      paymentMethod?: PaymentMethod;
    };
    const orderId = Number(body.orderId || 0);
    const paymentMethod = body.paymentMethod || "bank_transfer";

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
    }

    if (!(["bank_transfer", "card", "doku_wallet", "qris"] as const).includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Unsupported payment method." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id,buyer_id,seller_id,product_id,product_title,quantity,total_amount,total_price,price,invoice_number,currency_code,status,payment_status",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !orderData) {
      if (orderError) console.error("DOKU order lookup failed:", orderError.message);
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const order = orderData as OrderRow;
    if (order.buyer_id !== buyer.id) {
      return NextResponse.json(
        { error: "You can only pay for your own order." },
        { status: 403 },
      );
    }

    if (
      normalize(order.payment_status) === "paid" ||
      ["paid", "delivered", "completed"].includes(normalize(order.status))
    ) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        orderId: order.id,
      });
    }

    if (["cancelled", "expired", "refunded"].includes(normalize(order.status))) {
      return NextResponse.json(
        { error: "This order can no longer be paid." },
        { status: 409 },
      );
    }

    if (normalize(order.currency_code || "IDR") !== "idr") {
      return NextResponse.json(
        { error: "DOKU Checkout currently requires an IDR order." },
        { status: 400 },
      );
    }

    const amount = orderTotalIdr(order);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "The order total must be a positive whole IDR amount." },
        { status: 400 },
      );
    }

    const dueMinutes = getDokuPaymentDueMinutes();
    const { error: claimError } = await supabaseAdmin.rpc("cp_claim_external_order_payment", { p_order_id: order.id, p_buyer_id: buyer.id });
    if (claimError) return NextResponse.json({ error: "This order is no longer available for payment. Refresh its status." }, { status: 409 });
    const { error: reservationError } = await supabaseAdmin.rpc(
      "cp_prepare_order_payment",
      {
        p_order_id: order.id,
        p_buyer_id: buyer.id,
        p_extension_minutes: Math.min(60, dueMinutes + 5),
      },
    );

    if (reservationError) {
      const reservationMessage = normalize(reservationError.message);
      const status =
        reservationMessage.includes("expired") ||
        reservationMessage.includes("stock")
          ? 409
          : reservationMessage.includes("not found")
            ? 404
            : 400;

      return NextResponse.json(
        {
          error:
            status === 409
              ? "The checkout reservation expired or stock is no longer available. Please create a new order."
              : "The order is not ready for payment.",
        },
        { status },
      );
    }

    if (paymentMethod === "qris") {
      const existing = await supabaseAdmin
        .from("doku_payment_attempts")
        .select(
          "status,invoice_number,provider_request_id,virtual_account_number,how_to_pay_url,qr_content,qr_image_url,terminal_id,expires_at",
        )
        .eq("order_id", order.id)
        .eq("payment_type", "qris")
        .maybeSingle();

      if (existing.error) {
        throw new Error(`Unable to load QRIS instructions: ${existing.error.message}`);
      }

      const existingAttempt = existing.data as PaymentAttemptRow | null;
      if (isActiveQris(existingAttempt)) {
        const activeInvoice = String(existingAttempt?.invoice_number || "");
        const existingQrContent = String(existingAttempt?.qr_content || "");
        const storedImageUrl = String(existingAttempt?.qr_image_url || "");
        const imageUrl = isTrustedDokuQrisImageUrl(storedImageUrl)
          ? storedImageUrl
          : await renderQrisDataUrl(existingQrContent);

        if (!isTrustedGeneratedQrisDataUrl(imageUrl) &&
            !isTrustedDokuQrisImageUrl(imageUrl)) {
          throw new Error("Unable to render the active QRIS payment.");
        }
        const { error: invoiceError } = await supabaseAdmin
          .from("orders")
          .update({
            invoice_number: activeInvoice,
            payment_method: "doku",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)
          .eq("buyer_id", buyer.id)
          .neq("payment_status", "paid");

        if (invoiceError) {
          throw new Error(`Unable to restore QRIS invoice: ${invoiceError.message}`);
        }

        return NextResponse.json({
          ok: true,
          orderId: order.id,
          invoiceNumber: activeInvoice,
          paymentMode: "qris",
          qris: {
            imageUrl,
            content: existingQrContent,
            expiresAt: existingAttempt?.expires_at,
            providerName: "DOKU QRIS",
            referenceNo: existingAttempt?.provider_request_id,
            merchantName: "COMEPLAYERS",
            terminalId: existingAttempt?.terminal_id,
          },
        });
      }

      if (existingAttempt) {
        const { error: expiryError } = await supabaseAdmin
          .from("doku_payment_attempts")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", order.id)
          .eq("payment_type", "qris");

        if (expiryError) throw new Error(expiryError.message);
      }
    }

    // A provider invoice identifies one payment attempt. Direct VA keeps its
    // reusable order invoice, while each new dynamic QRIS receives a unique
    // reference so DOKU notifications can be reconciled without ambiguity.
    const invoiceNumber =
      paymentMethod === "qris"
        ? buildDokuAttemptInvoice(order.id, "QR")
        : buildDokuInvoice(order.id, order.invoice_number);
    const { error: invoiceError } = await supabaseAdmin
      .from("orders")
      .update({
        invoice_number: invoiceNumber,
        payment_method: "doku",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("buyer_id", buyer.id)
      .neq("payment_status", "paid");

    if (invoiceError) {
      throw new Error(`Unable to prepare DOKU invoice: ${invoiceError.message}`);
    }

    const siteUrl = getPublicSiteUrl(request);
    const callbackMethod =
      paymentMethod === "qris"
        ? "qris"
        : paymentMethod === "card"
          ? "card"
          : "doku";
    const callbackUrl = `${siteUrl}/payment/${order.id}?method=${callbackMethod}&dokuReturn=1`;
    const notificationUrl = getNotificationUrl(siteUrl);

    if (paymentMethod === "bank_transfer") {
      const existing = await supabaseAdmin
        .from("doku_payment_attempts")
        .select(
          "status,invoice_number,provider_request_id,virtual_account_number,how_to_pay_url,qr_content,qr_image_url,expires_at",
        )
        .eq("order_id", order.id)
        .eq("payment_type", "virtual_account")
        .maybeSingle();

      if (existing.error) {
        throw new Error(
          `Unable to load bank-transfer instructions: ${existing.error.message}`,
        );
      }

      const existingAttempt = existing.data as PaymentAttemptRow | null;
      if (isActiveVirtualAccount(existingAttempt)) {
        return NextResponse.json({
          ok: true,
          orderId: order.id,
          invoiceNumber: existingAttempt?.invoice_number || invoiceNumber,
          paymentMode: "virtual_account",
          virtualAccount: {
            number: existingAttempt?.virtual_account_number,
            howToPayUrl: existingAttempt?.how_to_pay_url,
            expiresAt: existingAttempt?.expires_at,
            providerName: "DOKU",
            networkName: "DOKU Virtual Account",
            transferType: "multi_bank",
          },
        });
      }

      if (existingAttempt) {
        await supabaseAdmin
          .from("doku_payment_attempts")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("order_id", order.id)
          .eq("payment_type", "virtual_account");

        return NextResponse.json(
          {
            error:
              "The bank-transfer instruction for this order has expired. Please create a new order.",
          },
          { status: 409 },
        );
      }

      const customerName = sanitizeDokuText(
        String(
          buyer.user_metadata?.full_name ||
            buyer.user_metadata?.name ||
            buyer.user_metadata?.username ||
            buyer.email?.split("@")[0] ||
            "",
        ),
        "ComePlayers Buyer",
        50,
      );
      const customerEmail = String(buyer.email || "").trim().slice(0, 128);
      const virtualAccount = await createDokuVirtualAccount({
        order: {
          invoice_number: invoiceNumber,
          amount,
        },
        virtual_account_info: {
          billing_type: "FIX_BILL",
          expired_time: dueMinutes,
          reusable_status: false,
          info1: sanitizeDokuText(
            `ComePlayers Order ${order.id}`,
            "ComePlayers Order",
            32,
          ),
        },
        customer: {
          name: customerName,
          ...(customerEmail ? { email: customerEmail } : {}),
        },
        additional_info: {
          override_notification_url: notificationUrl,
        },
      });
      const providerExpiresAt = Date.parse(
        String(virtualAccount.expiresAt || ""),
      );
      const expiresAt = Number.isFinite(providerExpiresAt)
        ? new Date(providerExpiresAt).toISOString()
        : new Date(Date.now() + dueMinutes * 60_000).toISOString();
      const now = new Date().toISOString();
      const storedAttempt = await supabaseAdmin
        .from("doku_payment_attempts")
        .upsert(
          {
            order_id: order.id,
            buyer_id: buyer.id,
            payment_type: "virtual_account",
            invoice_number: invoiceNumber,
            provider_request_id: virtualAccount.requestId,
            virtual_account_number: virtualAccount.virtualAccountNumber,
            how_to_pay_url: virtualAccount.howToPayUrl,
            expires_at: expiresAt,
            status: "active",
            updated_at: now,
          },
          { onConflict: "order_id,payment_type" },
        );

      if (storedAttempt.error) {
        throw new Error(
          `Unable to store bank-transfer instructions: ${storedAttempt.error.message}`,
        );
      }

      return NextResponse.json({
        ok: true,
        orderId: order.id,
        invoiceNumber,
        paymentMode: "virtual_account",
        virtualAccount: {
          number: virtualAccount.virtualAccountNumber,
          howToPayUrl: virtualAccount.howToPayUrl,
          expiresAt,
          providerName: "DOKU",
          networkName: "DOKU Virtual Account",
          transferType: "multi_bank",
        },
        requestId: virtualAccount.requestId,
      });
    }

    if (paymentMethod === "qris") {
      let qris;

      try {
        qris = await createDokuSnapQrisPayment({
          invoiceNumber,
          amount,
          dueMinutes,
        });
      } catch (snapQrisError) {
        // MCP remains a temporary compatibility path for merchants that have
        // that separate DOKU product. DOKU Checkout is deliberately not used
        // here: an active Direct/SNAP QRIS service does not imply that hosted
        // Checkout is enabled for the same merchant account.
        console.warn("DOKU SNAP QRIS is unavailable; checking MCP compatibility.",
          dokuErrorLog(snapQrisError));

        try {
          const mcpQris = await createDokuQrisPayment({
            invoiceNumber,
            amount,
            dueMinutes,
          });
          qris = {
            ...mcpQris,
            providerName: "DOKU MCP QRIS",
          };
        } catch (mcpQrisError) {
          console.error("DOKU QRIS providers could not create a dynamic code.", {
            snap: dokuErrorLog(snapQrisError),
            mcp: dokuErrorLog(mcpQrisError),
          });
          throw snapQrisError;
        }
      }

      const storedImageUrl = isTrustedDokuQrisImageUrl(qris.qrImageUrl)
        ? qris.qrImageUrl
        : null;

      const now = new Date().toISOString();
      const storedAttempt = await supabaseAdmin
        .from("doku_payment_attempts")
        .upsert(
          {
            order_id: order.id,
            buyer_id: buyer.id,
            payment_type: "qris",
            invoice_number: qris.invoiceNumber,
            provider_request_id: qris.referenceNo,
            virtual_account_number: null,
            how_to_pay_url: null,
            qr_content: qris.qrContent,
            // SNAP returns QR content rather than an image URL. The PNG data
            // URL is rendered on demand and must never be persisted in this
            // provider-URL column.
            qr_image_url: storedImageUrl,
            terminal_id: qris.terminalId,
            expires_at: qris.expiresAt,
            status: "active",
            updated_at: now,
          },
          { onConflict: "order_id,payment_type" },
        );

      if (storedAttempt.error) {
        throw new Error(`Unable to store QRIS instructions: ${storedAttempt.error.message}`);
      }

      return NextResponse.json({
        ok: true,
        orderId: order.id,
        invoiceNumber: qris.invoiceNumber,
        paymentMode: "qris",
        qris: {
          imageUrl: qris.qrImageUrl,
          content: qris.qrContent,
          expiresAt: qris.expiresAt,
          providerName: qris.providerName || "DOKU QRIS",
          referenceNo: qris.referenceNo,
          merchantName: "COMEPLAYERS",
          terminalId: qris.terminalId,
        },
      });
    }

    if (paymentMethod === "card") {
      const customerName = sanitizeDokuText(
        String(
          buyer.user_metadata?.full_name ||
            buyer.user_metadata?.name ||
            buyer.user_metadata?.username ||
            buyer.email?.split("@")[0] ||
            "",
        ),
        "ComePlayers Buyer",
        50,
      );
      const customerEmail = String(buyer.email || "").trim().slice(0, 128);
      const customerPhone = String(
        buyer.phone || buyer.user_metadata?.phone || "",
      )
        .replace(/\D/g, "")
        .slice(0, 20);

      if (!customerEmail && !customerPhone) {
        return NextResponse.json(
          {
            error:
              "Add an email address or phone number to your account before paying by card.",
          },
          { status: 400 },
        );
      }

      const cardPayment = await createDokuCardPaymentPage({
        order: {
          invoice_number: invoiceNumber,
          amount,
          callback_url: callbackUrl,
          failed_url: callbackUrl,
          auto_redirect: true,
        },
        customer: {
          name: customerName,
          ...(customerEmail ? { email: customerEmail } : {}),
          ...(customerPhone ? { phone: customerPhone } : {}),
          country: "ID",
        },
        payment: {
          type: "SALE",
        },
        override_configuration: {
          themes: {
            language: "EN",
            background_color: "FFFFFF",
            font_color: "172033",
            button_background_color: "0EA5E9",
            button_font_color: "FFFFFF",
          },
        },
        additional_info: {
          override_notification_url: notificationUrl,
        },
      });

      return NextResponse.json({
        ok: true,
        orderId: order.id,
        invoiceNumber,
        paymentUrl: cardPayment.paymentUrl,
        expiresAt: cardPayment.expiresAt,
        requestId: cardPayment.requestId,
        paymentMode: "card_payment_page",
      });
    }

    // Keep the initial request intentionally close to DOKU's documented basic
    // Checkout payload. Optional customer and line-item metadata has caused the
    // production gateway to return an opaque 500 before creating a session.
    let paymentMode: "checkout" | "doku_wallet" = "checkout";
    let checkout;

    try {
      checkout = await createDokuCheckout({
        order: {
          amount,
          invoice_number: invoiceNumber,
          currency: "IDR",
          callback_url: callbackUrl,
          callback_url_result: callbackUrl,
          language: "EN",
          auto_redirect: true,
        },
        payment: {
          payment_due_date: dueMinutes,
        },
        additional_info: {
          override_notification_url: notificationUrl,
        },
      });
    } catch (error) {
      if (!(error instanceof DokuProviderError) || error.status < 500) {
        throw error;
      }

      console.warn(
        `DOKU Checkout request ${error.requestId} is unavailable; using DOKU Wallet fallback.`,
      );
      paymentMode = "doku_wallet";
      checkout = await createDokuWalletPayment({
        order: {
          invoice_number: invoiceNumber,
          amount,
          success_url: callbackUrl,
          failed_url: callbackUrl,
          notify_url: notificationUrl,
          auto_redirect: true,
        },
        additional_info: {
          override_notification_url: notificationUrl,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      invoiceNumber,
      paymentUrl: checkout.paymentUrl,
      expiresAt: checkout.expiresAt,
      requestId: checkout.requestId,
      paymentMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      error instanceof DokuSnapConfigurationError
        ? error.status
        : error instanceof DokuSnapQrisError
          ? 502
          : authErrorStatus(message);
    console.error("DOKU checkout creation failed:", dokuErrorLog(error));

    const fallback =
      error instanceof DokuSnapConfigurationError
        ? "QRIS is temporarily unavailable while the merchant Direct API configuration is completed. Please use bank transfer for this order."
        : error instanceof DokuSnapQrisError
          ? "DOKU could not generate a QRIS code right now. Please use bank transfer or try again shortly."
          : status === 401
            ? "Authentication required."
            : "Unable to start DOKU Checkout.";

    return NextResponse.json(
      {
        error: safeApiErrorMessage(error, fallback, status),
      },
      { status },
    );
  }
}
