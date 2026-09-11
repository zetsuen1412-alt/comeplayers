import "server-only";

import { randomUUID } from "node:crypto";
import {
  createDokuRequestSignature,
  verifyDokuResponseSignature,
} from "@/lib/dokuSignature";
import {
  describeDokuWalletResponse,
  extractDokuWalletPaymentUrl,
  isTrustedDokuPaymentUrl,
} from "@/lib/dokuPaymentResponse";

export const DOKU_CHECKOUT_TARGET = "/checkout/v1/payment";
export const DOKU_CARD_PAYMENT_PAGE_TARGET = "/credit-card/v1/payment-page";
export const DOKU_WALLET_PAYMENT_TARGET = "/dokuwallet-emoney/v1/payment";
export const DOKU_VIRTUAL_ACCOUNT_TARGET =
  "/doku-virtual-account/v2/payment-code";
export const DOKU_NOTIFICATION_TARGET = "/api/doku/notification";

type DokuCheckoutRequest = {
  order: {
    amount: number;
    invoice_number: string;
    currency?: "IDR";
    callback_url?: string;
    callback_url_result?: string;
    language?: "EN" | "ID";
    auto_redirect?: boolean;
  };
  payment: {
    payment_due_date: number;
    payment_method_types?: Array<"CREDIT_CARD" | "QRIS">;
  };
  additional_info?: {
    override_notification_url: string;
  };
};

type DokuCheckoutResponse = {
  response?: {
    payment?: {
      url?: string;
      token_id?: string;
      expired_date?: string;
    };
    message?: string[] | string;
  };
  error?: {
    message?: string[] | string;
  };
  message?: string[] | string;
};

type DokuCardPaymentPageRequest = {
  order: {
    invoice_number: string;
    amount: number;
    callback_url: string;
    failed_url: string;
    auto_redirect: boolean;
  };
  customer: {
    name: string;
    email?: string;
    phone?: string;
    country?: "ID";
  };
  payment: {
    type: "SALE";
  };
  override_configuration?: {
    themes: {
      language: "EN" | "ID";
      background_color: string;
      font_color: string;
      button_background_color: string;
      button_font_color: string;
    };
  };
  additional_info?: {
    override_notification_url: string;
  };
};

type DokuCardPaymentPageResponse = {
  credit_card_payment_page?: {
    url?: string;
  };
  errors?: {
    code?: string;
    message?: string[] | string;
    type?: string;
  };
  error?: {
    message?: string[] | string;
  };
  response?: {
    message?: string[] | string;
  };
  message?: string[] | string;
};

type DokuWalletPaymentRequest = {
  order: {
    invoice_number: string;
    amount: number;
    success_url: string;
    failed_url: string;
    notify_url: string;
    auto_redirect: boolean;
  };
  additional_info?: {
    override_notification_url: string;
  };
};

type DokuWalletPaymentResponse = {
  doku_wallet_payment_page?: {
    url?: string;
  };
  data?: {
    doku_wallet_payment_page?: {
      url?: string;
    };
  };
  response?: {
    doku_wallet_payment_page?: {
      url?: string;
    };
    payment?: {
      url?: string;
    };
    message?: string[] | string;
  };
  error?: {
    code?: string | number;
    message?: string[] | string;
  };
  response_code?: string | number;
  responseCode?: string | number;
  status?: string | number;
  message?: string[] | string;
};

type DokuVirtualAccountRequest = {
  order: {
    invoice_number: string;
    amount: number;
  };
  virtual_account_info: {
    billing_type: "FIX_BILL";
    expired_time: number;
    reusable_status: false;
    info1: string;
  };
  customer: {
    name: string;
    email?: string;
  };
  additional_info?: {
    override_notification_url: string;
  };
};

type DokuVirtualAccountResponse = {
  virtual_account_info?: {
    virtual_account_number?: string;
    how_to_pay_page?: string;
    created_date_utc?: string;
    expired_date_utc?: string;
  };
  error?: {
    message?: string[] | string;
  };
  response?: {
    message?: string[] | string;
  };
  message?: string[] | string;
};

type DokuErrorEnvelope = {
  errors?: {
    message?: string[] | string;
  };
  error?: {
    message?: string[] | string;
  };
  response?: {
    message?: string[] | string;
  };
  message?: string[] | string;
};

export class DokuProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string,
    providerMessage: string,
  ) {
    super(
      `DOKU rejected the payment request (${status})${
        providerMessage ? `: ${providerMessage.slice(0, 240)}` : "."
      }`,
    );
    this.name = "DokuProviderError";
  }
}

export function getDokuConfig() {
  const clientId = String(process.env.DOKU_CLIENT_ID || "").trim();
  const secretKey = String(process.env.DOKU_SECRET_KEY || "").trim();
  const environment = String(process.env.DOKU_ENV || "sandbox").toLowerCase();
  const production = environment === "production" || environment === "live";

  if (!clientId || !secretKey) {
    throw new Error("DOKU payment credentials are not configured.");
  }

  return {
    clientId,
    secretKey,
    environment: production ? "production" : "sandbox",
    apiBaseUrl: production
      ? "https://api.doku.com"
      : "https://api-sandbox.doku.com",
  } as const;
}

export function getDokuPaymentDueMinutes() {
  const configured = Number(process.env.DOKU_PAYMENT_DUE_MINUTES || 50);
  return Math.min(55, Math.max(5, Math.floor(configured || 50)));
}

export function isTrustedDokuCheckoutUrl(value: string) {
  return isTrustedDokuPaymentUrl(value);
}

async function postSignedDoku<T extends DokuErrorEnvelope>(
  requestTarget: string,
  payload: unknown,
) {
  const config = getDokuConfig();
  const requestId = randomUUID();
  const requestTimestamp = new Date().toISOString();
  const rawBody = JSON.stringify(payload);
  const signature = createDokuRequestSignature({
    clientId: config.clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    rawBody,
    secretKey: config.secretKey,
  });

  const response = await fetch(
    `${config.apiBaseUrl}${requestTarget}`,
    {
      method: "POST",
      headers: {
        "Client-Id": config.clientId,
        "Request-Id": requestId,
        "Request-Timestamp": requestTimestamp,
        Signature: signature,
        "Content-Type": "application/json",
      },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  const responseBody = await response.text();
  let data: T;

  try {
    data = JSON.parse(responseBody) as T;
  } catch {
    throw new Error(`DOKU returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    const providerMessage =
      data.errors?.message ||
      data.error?.message ||
      data.response?.message ||
      data.message;
    const normalizedMessage = Array.isArray(providerMessage)
      ? providerMessage.join(" ")
      : String(providerMessage || "");
    throw new DokuProviderError(response.status, requestId, normalizedMessage);
  }

  const responseClientId = response.headers.get("client-id") || "";
  const responseRequestId = response.headers.get("request-id") || "";
  const responseTimestamp = response.headers.get("response-timestamp") || "";
  const responseSignature = response.headers.get("signature") || "";

  if (
    responseClientId !== config.clientId ||
    responseRequestId !== requestId ||
    !responseTimestamp ||
    !responseSignature ||
    !verifyDokuResponseSignature({
      clientId: responseClientId,
      requestId: responseRequestId,
      responseTimestamp,
      requestTarget,
      rawBody: responseBody,
      secretKey: config.secretKey,
      signature: responseSignature,
    })
  ) {
    throw new Error("DOKU response signature verification failed.");
  }

  return { data, requestId };
}

export async function createDokuCheckout(payload: DokuCheckoutRequest) {
  const { data, requestId } = await postSignedDoku<DokuCheckoutResponse>(
    DOKU_CHECKOUT_TARGET,
    payload,
  );

  const paymentUrl = String(data.response?.payment?.url || "").trim();
  if (!paymentUrl || !isTrustedDokuCheckoutUrl(paymentUrl)) {
    throw new Error("DOKU did not return a trusted checkout URL.");
  }

  return {
    paymentUrl,
    requestId,
    tokenId: data.response?.payment?.token_id || null,
    expiresAt: data.response?.payment?.expired_date || null,
  };
}

export async function createDokuCardPaymentPage(
  payload: DokuCardPaymentPageRequest,
) {
  const { data, requestId } =
    await postSignedDoku<DokuCardPaymentPageResponse>(
      DOKU_CARD_PAYMENT_PAGE_TARGET,
      payload,
    );

  const paymentUrl = String(
    data.credit_card_payment_page?.url || "",
  ).trim();
  if (!paymentUrl || !isTrustedDokuCheckoutUrl(paymentUrl)) {
    throw new Error("DOKU did not return a trusted card payment URL.");
  }

  return {
    paymentUrl,
    requestId,
    tokenId: null,
    expiresAt: null,
  };
}

export async function createDokuWalletPayment(
  payload: DokuWalletPaymentRequest,
) {
  const { data, requestId } = await postSignedDoku<DokuWalletPaymentResponse>(
    DOKU_WALLET_PAYMENT_TARGET,
    payload,
  );

  const paymentUrl = extractDokuWalletPaymentUrl(data);
  if (!paymentUrl) {
    console.error(
      `DOKU Wallet response ${requestId} omitted the payment URL (${describeDokuWalletResponse(data)}).`,
    );
    throw new Error("DOKU Wallet did not return a payment URL.");
  }

  if (!isTrustedDokuCheckoutUrl(paymentUrl)) {
    let hostname = "invalid-url";
    try {
      hostname = new URL(paymentUrl).hostname || hostname;
    } catch {
      // Keep diagnostics free of the full URL and any session token.
    }
    console.error(
      `DOKU Wallet response ${requestId} returned an untrusted payment host (${hostname}).`,
    );
    throw new Error("DOKU Wallet did not return a trusted payment URL.");
  }

  return {
    paymentUrl,
    requestId,
    tokenId: null,
    expiresAt: null,
  };
}

export async function createDokuVirtualAccount(
  payload: DokuVirtualAccountRequest,
) {
  const { data, requestId } =
    await postSignedDoku<DokuVirtualAccountResponse>(
      DOKU_VIRTUAL_ACCOUNT_TARGET,
      payload,
    );

  const info = data.virtual_account_info;
  const virtualAccountNumber = String(
    info?.virtual_account_number || "",
  ).trim();
  const howToPayUrl = String(info?.how_to_pay_page || "").trim();

  if (!/^\d{8,28}$/.test(virtualAccountNumber)) {
    throw new Error("DOKU did not return a valid virtual account number.");
  }

  if (howToPayUrl && !isTrustedDokuCheckoutUrl(howToPayUrl)) {
    throw new Error("DOKU did not return a trusted payment instruction URL.");
  }

  return {
    requestId,
    virtualAccountNumber,
    howToPayUrl: howToPayUrl || null,
    createdAt: info?.created_date_utc || null,
    expiresAt: info?.expired_date_utc || null,
  };
}
