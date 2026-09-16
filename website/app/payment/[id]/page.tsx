"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  FaArrowLeft,
  FaBuilding,
  FaCcMastercard,
  FaCcVisa,
  FaCheckCircle,
  FaCopy,
  FaCreditCard,
  FaExternalLinkAlt,
  FaInfoCircle,
  FaGooglePay,
  FaPaypal,
  FaQrcode,
  FaShieldAlt,
  FaStore,
  FaUniversity,
  FaWallet,
} from "react-icons/fa";
import { orderTotalIdr, storedMoney } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { isTrustedDokuPaymentUrl } from "@/lib/dokuPaymentResponse";
import { isTrustedPayPalCheckoutUrl } from "@/lib/paypalCheckout";
import { supabase } from "@/lib/supabase";
import PaymentWaitGame from "./PaymentWaitGame";
import styles from "./payment.module.css";

type Order = {
  id: number;
  product?: string | null;
  price?: string | number | null;
  status?: string | null;
  product_id?: number | null;
  buyer_id?: string | null;
  seller_id?: string | null;
  quantity?: number | null;
  subtotal_amount?: string | number | null;
  discount_amount?: string | number | null;
  payment_fee_amount?: string | number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  product_title?: string | null;
  seller_name?: string | null;
  game_name?: string | null;
  category?: string | null;
};

type Product = {
  id: number;
  title?: string | null;
  price?: string | number | null;
  seller?: string | null;
  seller_name?: string | null;
  category?: string | null;
  image_url?: string | null;
  game_name?: string | null;
};

type PaymentChoice =
  | "bank_transfer"
  | "card"
  | "doku_wallet"
  | "paypal"
  | "qris";

const SOURCE_BANKS = [
  "BCA",
  "BRI",
  "BNI",
  "Bank Mandiri",
  "Bank Syariah Indonesia",
  "CIMB Niaga",
  "PermataBank",
  "Bank Danamon",
  "BTN",
  "Bank BJB",
  "Bank Neo Commerce",
  "Bank Sahabat Sampoerna",
  "Other bank",
] as const;

type VirtualAccountInstructions = {
  number: string;
  howToPayUrl: string | null;
  expiresAt: string | null;
  providerName: string;
  networkName: string;
  transferType: "multi_bank";
};

type QrisInstructions = {
  imageUrl: string;
  content: string;
  expiresAt: string;
  providerName: string;
  referenceNo: string | null;
  merchantName: string;
  terminalId: string | null;
};

const numberPrice = storedMoney;

function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function orderIsPaid(order: Order | null) {
  return Boolean(
    order &&
      (normalize(order.payment_status) === "paid" ||
        ["paid", "delivered", "completed"].includes(normalize(order.status))),
  );
}

function fallbackImage(title: string) {
  return `https://placehold.co/900x600/020617/22d3ee?text=${encodeURIComponent(
    title || "ComePlayers Order",
  )}`;
}

function getOrderTotal(order: Order | null, product: Product | null) {
  return (
    orderTotalIdr(order)
  );
}

function formatExpiry(value: string | null) {
  if (!value) return "Follow the expiry shown by your bank";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function isTrustedDokuQrisImageUrl(value: string) {
  if (
    value.length >= 500 &&
    value.length <= 150_000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
  ) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["api.doku.com", "api-sandbox.doku.com"].includes(url.hostname) &&
      url.pathname === "/doku-mcp-server/api/qr/generate"
    );
  } catch {
    return false;
  }
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Please log in again before continuing to payment.");
  }
  return data.session.access_token;
}

function PaymentHeader() {
  return (
    <header className={styles.focusHeader}>
      <div className={styles.focusHeaderInner}>
        <Link href="/" aria-label="Go to ComePlayers homepage">
          <Image
            src="/logo.png"
            alt="ComePlayers"
            width={320}
            height={110}
            priority
          />
        </Link>
        <span>
          <FaShieldAlt /> Secure checkout
        </span>
      </div>
    </header>
  );
}

export default function PaymentPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { formatIdrPrice: formatPrice, formatIdrAmount: formatBasePrice, currency } = useCurrency();
  const rawOrderId = params?.id;
  const orderId = Array.isArray(rawOrderId)
    ? rawOrderId[0] || ""
    : rawOrderId || "";
  const returningFromDoku = searchParams.get("dokuReturn") === "1";
  const dokuReturnMethod = searchParams.get("method");
  const returningFromDokuCard =
    returningFromDoku &&
    (dokuReturnMethod === "card" || dokuReturnMethod === "doku");
  const returningFromPayPal = searchParams.get("paypalReturn") === "1";
  const paypalCanceled = searchParams.get("paypalCancel") === "1";
  const paypalToken = String(searchParams.get("token") || "").trim();

  const [order, setOrder] = useState<Order | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentChoice>(
      searchParams.get("method") === "paypal"
        ? "paypal"
        : searchParams.get("method") === "card"
          ? "card"
          : searchParams.get("method") === "qris"
            ? "qris"
            : "bank_transfer",
    );
  const [sourceBank, setSourceBank] = useState<(typeof SOURCE_BANKS)[number]>(
    "BCA",
  );
  const [virtualAccount, setVirtualAccount] =
    useState<VirtualAccountInstructions | null>(null);
  const [qris, setQris] = useState<QrisInstructions | null>(null);
  const [qrisModalOpen, setQrisModalOpen] = useState(false);
  const [qrisNow, setQrisNow] = useState(() => Date.now());
  const [cardPaymentUrl, setCardPaymentUrl] = useState("");
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const cardFrameRef = useRef<HTMLIFrameElement | null>(null);
  const cardModalCloseRef = useRef<HTMLButtonElement | null>(null);
  const paymentDetailsRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(
    returningFromDoku || (returningFromPayPal && Boolean(paypalToken)),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    returningFromDoku
      ? "Waiting for DOKU to confirm your payment securely..."
      : returningFromPayPal
        ? "Completing your PayPal payment securely..."
        : paypalCanceled
          ? "PayPal checkout was canceled. No payment was taken."
          : "",
  );

  const total = useMemo(() => getOrderTotal(order, product), [order, product]);
  const loadedOrderId = order?.id;
  const currentOrderPaid = orderIsPaid(order);
  const quantity = Number(order?.quantity || 1);
  const productTitle =
    order?.product_title || order?.product || product?.title || "Product";
  const sellerName =
    order?.seller_name ||
    product?.seller_name ||
    product?.seller ||
    "Verified Seller";
  const gameName = order?.game_name || product?.game_name || "-";
  const category = order?.category || product?.category || "Game Product";
  const imageUrl = product?.image_url || fallbackImage(productTitle);

  const qrisRemainingSeconds = qris
    ? (() => {
        const expiryTime = Date.parse(qris.expiresAt);
        return Number.isFinite(expiryTime)
          ? Math.max(0, Math.ceil((expiryTime - qrisNow) / 1000))
          : 0;
      })()
    : null;

  const qrisExpired = Boolean(
    qris && qrisRemainingSeconds !== null && qrisRemainingSeconds <= 0,
  );

  function formatCountdown(totalSeconds: number | null) {
    if (totalSeconds === null) return "--:--";
    const safeSeconds = Math.max(0, totalSeconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  useEffect(() => {
    if (!virtualAccount) return;

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      paymentDetailsRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [virtualAccount]);

  useEffect(() => {
    if (!qris) return;

    const timer = window.setInterval(() => setQrisNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [qris]);

  useEffect(() => {
    if (!qrisModalOpen && !cardModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (cardModalOpen) setCardModalOpen(false);
      else setQrisModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cardModalOpen, qrisModalOpen]);

  useEffect(() => {
    if (!cardModalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      cardModalCloseRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cardModalOpen]);

  const loadOrder = useCallback(async () => {
    if (!orderId || !Number.isInteger(Number(orderId))) {
      throw new Error("Invalid order.");
    }

    const { data, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", Number(orderId))
      .maybeSingle();

    if (orderError || !data) throw new Error("Order not found.");
    const nextOrder = data as Order;
    setOrder(nextOrder);
    return nextOrder;
  }, [orderId]);

  useEffect(() => {
    let active = true;

    async function loadPayment() {
      setLoading(true);
      setError("");

      try {
        const nextOrder = await loadOrder();
        if (!active) return;

        if (orderIsPaid(nextOrder)) {
          router.replace(`/order-success/${nextOrder.id}`);
          return;
        }

        if (nextOrder.product_id) {
          const { data: productData } = await supabase
            .from("products")
            .select(
              "id,title,price,seller,seller_name,category,image_url,game_name",
            )
            .eq("id", Number(nextOrder.product_id))
            .maybeSingle();

          if (active) setProduct((productData as Product | null) || null);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load payment.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPayment();
    return () => {
      active = false;
    };
  }, [loadOrder, router]);

  useEffect(() => {
    if (!returningFromDoku || !loadedOrderId || currentOrderPaid) return;

    let active = true;
    let attempts = 0;

    const checkConfirmation = async () => {
      attempts += 1;
      try {
        const nextOrder = await loadOrder();
        if (!active) return;

        if (orderIsPaid(nextOrder)) {
          router.replace(`/order-success/${nextOrder.id}`);
          return;
        }

        if (attempts >= 20) {
          setWaitingForConfirmation(false);
          setNotice(
            "DOKU confirmation is still pending. You can safely retry this check or return to your orders; the webhook will update it automatically.",
          );
        }
      } catch {
        if (active && attempts >= 20) {
          setWaitingForConfirmation(false);
          setNotice(
            "Payment confirmation is delayed. Please check your order again shortly.",
          );
        }
      }
    };

    void checkConfirmation();
    const timer = window.setInterval(() => {
      if (attempts >= 20) {
        window.clearInterval(timer);
        return;
      }
      void checkConfirmation();
    }, 3_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentOrderPaid, loadOrder, loadedOrderId, returningFromDoku, router]);

  useEffect(() => {
    if (!qris || !loadedOrderId || currentOrderPaid) return;

    let active = true;
    const checkQrisConfirmation = async () => {
      try {
        const nextOrder = await loadOrder();
        if (active && orderIsPaid(nextOrder)) {
          router.replace(`/order-success/${nextOrder.id}`);
        }
      } catch {
        // The signed DOKU notification remains authoritative. A temporary
        // polling error must not alter the order or interrupt QR scanning.
      }
    };

    const timer = window.setInterval(() => {
      void checkQrisConfirmation();
    }, 4_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentOrderPaid, loadOrder, loadedOrderId, qris, router]);

  useEffect(() => {
    if (
      !returningFromPayPal ||
      !paypalToken ||
      !loadedOrderId ||
      currentOrderPaid
    ) {
      return;
    }

    let active = true;

    async function capturePayPalPayment() {
      setWaitingForConfirmation(true);
      setError("");

      try {
        const accessToken = await getAccessToken();
        const response = await fetch("/api/paypal/capture-checkout-order", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paypalOrderId: paypalToken,
            marketplaceOrderId: loadedOrderId,
          }),
        });
        const json = (await response.json()) as {
          error?: string;
          ok?: boolean;
          alreadyCaptured?: boolean;
        };

        if (!response.ok || (!json.ok && !json.alreadyCaptured)) {
          throw new Error(json.error || "Unable to complete PayPal payment.");
        }

        if (active) router.replace(`/order-success/${loadedOrderId}`);
      } catch (captureError) {
        if (active) {
          setError(
            captureError instanceof Error
              ? captureError.message
              : "Unable to complete PayPal payment.",
          );
          setNotice("");
          setWaitingForConfirmation(false);
        }
      }
    }

    void capturePayPalPayment();
    return () => {
      active = false;
    };
  }, [currentOrderPaid, loadedOrderId, paypalToken, returningFromPayPal, router]);

  async function payWithDoku() {
    if (!order || paying) return;
    setPaying(true);
    setError("");
    setNotice("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/doku/create-payment", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          paymentMethod: selectedPaymentMethod,
        }),
      });
      const json = (await response.json()) as {
        error?: string;
        alreadyPaid?: boolean;
        paymentMode?:
          | "checkout"
          | "card_payment_page"
          | "doku_wallet"
          | "virtual_account"
          | "qris";
        paymentUrl?: string;
        virtualAccount?: {
          number?: string | null;
          howToPayUrl?: string | null;
          expiresAt?: string | null;
          providerName?: string | null;
          networkName?: string | null;
          transferType?: "multi_bank" | null;
        };
        qris?: {
          imageUrl?: string | null;
          content?: string | null;
          expiresAt?: string | null;
          providerName?: string | null;
          referenceNo?: string | null;
          merchantName?: string | null;
          terminalId?: string | null;
        };
      };

      if (json.alreadyPaid) {
        router.push(`/order-success/${order.id}`);
        return;
      }

      if (json.paymentMode === "qris") {
        const imageUrl = String(json.qris?.imageUrl || "").trim();
        const content = String(json.qris?.content || "").trim();
        const expiresAt = String(json.qris?.expiresAt || "").trim();

        if (!isTrustedDokuQrisImageUrl(imageUrl)) {
          throw new Error("DOKU returned an invalid QR image address.");
        }
        if (
          content.length < 80 ||
          content.length > 1024 ||
          !/^[\x20-\x7E]+$/.test(content)
        ) {
          throw new Error("DOKU returned invalid QRIS content.");
        }
        if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
          throw new Error("DOKU returned an invalid QRIS expiry time.");
        }

        setQris({
          imageUrl,
          content,
          expiresAt,
          providerName: json.qris?.providerName || "DOKU",
          referenceNo: json.qris?.referenceNo || null,
          merchantName: json.qris?.merchantName || "COMEPLAYERS",
          terminalId: json.qris?.terminalId || null,
        });
        setQrisNow(Date.now());
        setQrisModalOpen(true);
        setNotice("QRIS is ready with the exact order total already embedded.");
        setPaying(false);
        return;
      }

      if (!response.ok) {
        throw new Error(json.error || "Unable to prepare DOKU payment.");
      }

      if (json.paymentMode === "virtual_account") {
        const number = String(json.virtualAccount?.number || "").trim();
        const howToPayUrl = String(
          json.virtualAccount?.howToPayUrl || "",
        ).trim();

        if (!/^\d{8,28}$/.test(number)) {
          throw new Error("DOKU returned an invalid bank account number.");
        }
        if (howToPayUrl && !isTrustedDokuPaymentUrl(howToPayUrl)) {
          throw new Error("DOKU returned an invalid payment instruction address.");
        }

        setVirtualAccount({
          number,
          howToPayUrl: howToPayUrl || null,
          expiresAt: json.virtualAccount?.expiresAt || null,
          providerName: json.virtualAccount?.providerName || "DOKU",
          networkName:
            json.virtualAccount?.networkName || "DOKU Virtual Account",
          transferType: "multi_bank",
        });
        setNotice("");
        setPaying(false);
        return;
      }

      if (!json.paymentUrl) {
        throw new Error("DOKU did not return a checkout address.");
      }

      if (!isTrustedDokuPaymentUrl(json.paymentUrl)) {
        throw new Error("DOKU returned an invalid checkout address.");
      }

      if (
        selectedPaymentMethod === "card" &&
        json.paymentMode === "card_payment_page"
      ) {
        setCardPaymentUrl(json.paymentUrl);
        setCardModalOpen(true);
        setPaying(false);
        return;
      }

      window.location.assign(json.paymentUrl);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to process payment.",
      );
      setPaying(false);
    }
  }

  async function payWithPayPal() {
    if (!order || paying) return;
    setPaying(true);
    setError("");
    setNotice("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/paypal/create-checkout-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: order.id }),
      });
      const json = (await response.json()) as {
        error?: string;
        approveUrl?: string;
      };

      if (!response.ok || !json.approveUrl) {
        throw new Error(json.error || "Unable to start PayPal checkout.");
      }
      if (!isTrustedPayPalCheckoutUrl(json.approveUrl)) {
        throw new Error("PayPal returned an invalid checkout address.");
      }

      window.location.assign(json.approveUrl);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to start PayPal checkout.",
      );
      setPaying(false);
    }
  }

  async function startSelectedPayment() {
    if (selectedPaymentMethod === "paypal") {
      await payWithPayPal();
      return;
    }

    if (selectedPaymentMethod === "card" && cardPaymentUrl) {
      setCardModalOpen(true);
      return;
    }

    await payWithDoku();
  }

  function choosePaymentMethod(method: PaymentChoice) {
    if (virtualAccount || qris || method === selectedPaymentMethod) return;
    setSelectedPaymentMethod(method);
    setCopied(false);
    setError("");
    setNotice("");
  }

  function handleQrisAction() {
    if (!qris) return;

    if (qrisExpired) {
      setQris(null);
      setQrisModalOpen(false);
      setNotice("");
      void payWithDoku();
      return;
    }

    setQrisModalOpen(true);
  }

  function handleCardFrameLoad() {
    const frame = cardFrameRef.current;
    if (!frame) return;

    try {
      const frameUrl = new URL(frame.contentWindow?.location.href || "");
      if (
        frameUrl.origin === window.location.origin &&
        frameUrl.pathname === `/payment/${order?.id}` &&
        frameUrl.searchParams.get("dokuReturn") === "1"
      ) {
        setCardModalOpen(false);
        setCardPaymentUrl("");
        window.location.assign(frameUrl.toString());
      }
    } catch {
      // DOKU is cross-origin while the secure card form is active. Access is
      // possible only after DOKU redirects the frame back to ComePlayers.
    }
  }

  async function copyVirtualAccountNumber() {
    if (!virtualAccount?.number) return;

    try {
      await navigator.clipboard.writeText(virtualAccount.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Unable to copy automatically. Please copy the number manually.");
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <PaymentHeader />
        <div className={styles.centerState}>
          <span className={styles.loader} aria-hidden="true" />
          <p>Loading payment...</p>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className={styles.page}>
        <PaymentHeader />
        <div className={styles.centerState}>
          <FaShieldAlt className={styles.stateIcon} />
          <h1>Payment unavailable</h1>
          <p>{error}</p>
          <Link href="/">Back to homepage</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {waitingForConfirmation && returningFromDokuCard ? (
        <PaymentWaitGame orderId={loadedOrderId || orderId} />
      ) : null}
      <PaymentHeader />

      <div className={styles.container}>
        <Link
          href={order?.product_id ? `/product/${order.product_id}#checkout` : "/"}
          className={styles.backLink}
        >
          <FaArrowLeft /> Back to product
        </Link>

        <div className={styles.titleRow}>
          <div>
            <span>Checkout</span>
            <h1>Complete your payment</h1>
            <p>Review the order once, then continue to secure payment.</p>
          </div>
          <strong>Order #{order?.id}</strong>
        </div>

        <section className={styles.checkoutGrid}>
          <div className={styles.orderColumn}>
            <article className={styles.productCard}>
              <div
                className={styles.productImage}
                style={{ backgroundImage: `url(${imageUrl})` }}
                role="img"
                aria-label={productTitle}
              />
              <div className={styles.productCopy}>
                <p className={styles.eyebrow}>
                  {gameName} <span aria-hidden="true">•</span> {category}
                </p>
                <h2>{productTitle}</h2>
                <div className={styles.productMeta}>
                  <span>Qty {quantity}</span>
                  <span>
                    <FaStore /> {sellerName}
                  </span>
                </div>
              </div>
            </article>

            <section
              className={styles.methodCard}
              aria-labelledby="payment-method-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.sectionIcon} aria-hidden="true">
                    <FaCreditCard />
                  </span>
                  <div>
                    <h2 id="payment-method-heading">Payment method</h2>
                    <p>Choose how you want to pay</p>
                  </div>
                </div>
                <span className={styles.secureBadge}>
                  <FaShieldAlt /> Secure checkout
                </span>
              </div>
              <div
                className={styles.paymentMenu}
                role="group"
                aria-labelledby="payment-method-heading"
              >
                <div className={styles.methodGroup}>
                  <div className={styles.methodGroupTitle}>
                    <span>Bank transfer</span>
                    <small>Instant confirmation</small>
                  </div>
                  <button
                    type="button"
                    className={`${styles.paymentChoice} ${
                      selectedPaymentMethod === "bank_transfer"
                        ? styles.paymentChoiceSelected
                        : ""
                    }`}
                    aria-pressed={selectedPaymentMethod === "bank_transfer"}
                    disabled={Boolean(virtualAccount || qris)}
                    onClick={() => choosePaymentMethod("bank_transfer")}
                  >
                    <span className={styles.choiceIcon} aria-hidden="true">
                      <FaBuilding />
                    </span>
                    <span>
                      <strong>Virtual Account</strong>
                      <small>DOKU multi-bank transfer</small>
                    </span>
                    <em className={styles.availableStatus}>Available</em>
                  </button>
                  {selectedPaymentMethod === "bank_transfer" ? (
                    <label className={styles.bankSelector}>
                      <span>Transfer from</span>
                      <select
                        value={sourceBank}
                        onChange={(event) =>
                          setSourceBank(
                            event.target.value as (typeof SOURCE_BANKS)[number],
                          )
                        }
                        disabled={Boolean(virtualAccount || qris)}
                      >
                        {SOURCE_BANKS.map((bank) => (
                          <option key={bank} value={bank}>
                            {bank}
                          </option>
                        ))}
                      </select>
                      <small>
                        Choose your bank, then follow DOKU&apos;s bank-specific
                        transfer steps.
                      </small>
                    </label>
                  ) : null}
                </div>

                <div className={styles.methodGroup}>
                  <div className={styles.methodGroupTitle}>
                    <span>Cards</span>
                    <small>Debit or credit card</small>
                  </div>
                  <button
                    type="button"
                    className={`${styles.paymentChoice} ${
                      selectedPaymentMethod === "card"
                        ? styles.paymentChoiceSelected
                        : ""
                    }`}
                    aria-pressed={selectedPaymentMethod === "card"}
                    disabled={Boolean(virtualAccount || qris)}
                    onClick={() => choosePaymentMethod("card")}
                  >
                    <span className={`${styles.choiceIcon} ${styles.cardLogos}`}>
                      <FaCcVisa /> <FaCcMastercard />
                    </span>
                    <span>
                      <strong>Visa / Mastercard</strong>
                      <small>Credit and debit cards</small>
                    </span>
                    <em className={styles.availableStatus}>Available</em>
                  </button>
                </div>

                <div className={styles.methodGroup}>
                  <div className={styles.methodGroupTitle}>
                    <span>Wallets &amp; other methods</span>
                    <small>Choose an available provider</small>
                  </div>
                  <div className={styles.walletGrid}>
                    <button
                      type="button"
                      className={`${styles.paymentChoice} ${
                        selectedPaymentMethod === "doku_wallet"
                          ? styles.paymentChoiceSelected
                          : ""
                      }`}
                      aria-pressed={selectedPaymentMethod === "doku_wallet"}
                      disabled={Boolean(virtualAccount || qris)}
                      onClick={() => choosePaymentMethod("doku_wallet")}
                    >
                      <span className={styles.choiceIcon} aria-hidden="true">
                        <FaWallet />
                      </span>
                      <span>
                        <strong>DOKU Wallet</strong>
                        <small>DOKU ID and PIN</small>
                      </span>
                      <em className={styles.availableStatus}>Available</em>
                    </button>
                    <button
                      type="button"
                      className={`${styles.paymentChoice} ${styles.paypalChoice} ${
                        selectedPaymentMethod === "paypal"
                          ? styles.paymentChoiceSelected
                          : ""
                      }`}
                      aria-pressed={selectedPaymentMethod === "paypal"}
                      disabled={Boolean(virtualAccount || qris)}
                      onClick={() => choosePaymentMethod("paypal")}
                    >
                      <span className={styles.choiceIcon} aria-hidden="true">
                        <FaPaypal />
                      </span>
                      <span>
                        <strong>PayPal</strong>
                        <small>Pay securely with PayPal</small>
                      </span>
                      <em className={styles.availableStatus}>Available</em>
                    </button>
                    <button
                      type="button"
                      className={`${styles.paymentChoice} ${styles.paymentChoiceDisabled}`}
                      disabled
                      aria-disabled="true"
                    >
                      <span className={styles.choiceIcon} aria-hidden="true">
                        <FaGooglePay />
                      </span>
                      <span>
                        <strong>Google Pay</strong>
                        <small>Fast wallet checkout</small>
                      </span>
                      <em className={styles.pendingStatus}>Pending</em>
                    </button>
                    <button
                      type="button"
                      className={`${styles.paymentChoice} ${
                        selectedPaymentMethod === "qris"
                          ? styles.paymentChoiceSelected
                          : ""
                      }`}
                      aria-pressed={selectedPaymentMethod === "qris"}
                      disabled={Boolean(virtualAccount || qris)}
                      onClick={() => choosePaymentMethod("qris")}
                    >
                      <span className={styles.choiceIcon} aria-hidden="true">
                        <FaQrcode />
                      </span>
                      <span>
                        <strong>QRIS</strong>
                        <small>Scan with any QRIS app</small>
                      </span>
                      <em className={styles.availableStatus}>Available</em>
                    </button>
                  </div>
                </div>
              </div>
              <p className={styles.methodSecurity}>
                <FaInfoCircle /> QRIS is generated directly by DOKU&apos;s active
                payment service.
                Google Pay remains pending until provider activation. An issued
                VA locks this order to bank transfer.
              </p>
            </section>

            {virtualAccount ? (
              <article
                ref={paymentDetailsRef}
                id="bank-transfer-instructions"
                className={styles.vaCard}
                aria-live="polite"
              >
                <div className={styles.vaCardHeader}>
                  <div>
                    <span className={styles.vaBrandIcon} aria-hidden="true">
                      <FaUniversity />
                    </span>
                    <div>
                      <p>Bank transfer details</p>
                      <h2>{virtualAccount.networkName}</h2>
                    </div>
                  </div>
                  <span className={styles.multiBankBadge}>Multi-bank</span>
                </div>

                <div className={styles.networkExplanation}>
                  <FaInfoCircle aria-hidden="true" />
                  <p>
                    Transfer from <strong>{sourceBank}</strong> to DOKU&apos;s
                    multi-bank Virtual Account. The destination is the DOKU VA
                    network—not a personal BCA, BRI, BNI, or Mandiri account.
                  </p>
                </div>

                <div className={styles.vaPaymentGrid}>
                  <div className={styles.accountNumberBlock}>
                    <span>Virtual Account number</span>
                    <div>
                      <code>{virtualAccount.number}</code>
                      <button
                        type="button"
                        onClick={() => void copyVirtualAccountNumber()}
                        aria-label="Copy virtual account number"
                      >
                        <FaCopy /> {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div className={styles.paymentDetailBlock}>
                    <span>Source bank</span>
                    <strong>{sourceBank}</strong>
                    <small>Selected by customer</small>
                  </div>
                  <div className={styles.paymentDetailBlock}>
                    <span>Transfer amount</span>
                    <strong>{formatBasePrice(total)}</strong>
                    <small>Transfer the exact amount</small>
                  </div>
                  <div className={styles.paymentDetailBlock}>
                    <span>Payment deadline</span>
                    <strong>{formatExpiry(virtualAccount.expiresAt)} WIB</strong>
                    <small>VA expires automatically</small>
                  </div>
                </div>

                <div className={styles.vaActions}>
                  {virtualAccount.howToPayUrl ? (
                    <a
                      href={virtualAccount.howToPayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.instructionLink}
                    >
                      View {sourceBank} transfer steps
                      <FaExternalLinkAlt />
                    </a>
                  ) : null}
                  <span>
                    <FaCheckCircle /> Status updates automatically after DOKU
                    confirms the transfer.
                  </span>
                </div>
              </article>
            ) : null}

            {cardPaymentUrl && cardModalOpen ? (
              <div
                className={styles.qrisModalBackdrop}
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setCardModalOpen(false);
                  }
                }}
              >
                <section
                  className={styles.cardPaymentModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="card-modal-title"
                  aria-describedby="card-modal-description"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className={styles.cardModalHeader}>
                    <div className={styles.cardModalTitle}>
                      <span className={styles.cardModalIcon} aria-hidden="true">
                        <FaCreditCard />
                      </span>
                      <div>
                        <p>Secure card payment</p>
                        <h2 id="card-modal-title">PAY WITH CARD</h2>
                      </div>
                    </div>
                    <div className={styles.cardModalHeaderActions}>
                      <span className={styles.cardProviderBadge}>
                        <FaShieldAlt /> Secured by DOKU
                      </span>
                      <button
                        ref={cardModalCloseRef}
                        type="button"
                        className={styles.qrisModalClose}
                        onClick={() => setCardModalOpen(false)}
                        aria-label="Close card payment window"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  </div>

                  <div className={styles.cardCheckoutOverview}>
                    <div>
                      <small>Merchant</small>
                      <strong>COMEPLAYERS</strong>
                    </div>
                    <div>
                      <small>Order</small>
                      <strong>#{order?.id}</strong>
                    </div>
                    <div className={styles.cardCheckoutTotal}>
                      <small>Total payment</small>
                      <strong>{formatBasePrice(total)}</strong>
                    </div>
                  </div>

                  <div className={styles.cardSecurityNotice}>
                    <span aria-hidden="true">
                      <FaShieldAlt />
                    </span>
                    <div>
                      <strong>Your card details stay with DOKU</strong>
                      <p id="card-modal-description">
                        Card number, expiry date, and CVV are entered directly on DOKU&apos;s secure payment page.
                      </p>
                    </div>
                    <span className={styles.cardModalLogos} aria-label="Visa and Mastercard accepted">
                      <FaCcVisa /> <FaCcMastercard />
                    </span>
                  </div>

                  <div className={styles.cardPaymentFrameShell}>
                    <div className={styles.cardPaymentFrameHeader}>
                      <span>
                        <FaCreditCard /> Secure card details
                      </span>
                      <small>Powered by DOKU</small>
                    </div>
                    <iframe
                      ref={cardFrameRef}
                      className={styles.cardPaymentFrame}
                      title="Secure Visa and Mastercard payment powered by DOKU"
                      src={cardPaymentUrl}
                      allow="payment *"
                      referrerPolicy="strict-origin-when-cross-origin"
                      onLoad={handleCardFrameLoad}
                    />
                  </div>

                  <div className={styles.cardModalFooter}>
                    <span>
                      <FaShieldAlt /> DOKU security and 3D Secure verification remain active.
                    </span>
                    <div>
                      <a
                        href={cardPaymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.cardExternalAction}
                      >
                        Open secure page <FaExternalLinkAlt />
                      </a>
                      <button
                        type="button"
                        className={styles.qrisSecondaryAction}
                        onClick={() => setCardModalOpen(false)}
                      >
                        Close window
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {qris && qrisModalOpen ? (
              <div
                className={styles.qrisModalBackdrop}
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setQrisModalOpen(false);
                  }
                }}
              >
                <section
                  className={styles.qrisModal}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="qris-modal-title"
                  aria-describedby="qris-modal-description"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className={styles.qrisModalHeader}>
                    <div className={styles.qrisHeader}>
                      <div>
                        <span className={styles.qrisBrandIcon} aria-hidden="true">
                          <FaQrcode />
                        </span>
                        <div>
                          <p>QRIS payment</p>
                          <h2 id="qris-modal-title">SCAN QRIS</h2>
                        </div>
                      </div>
                      <span className={styles.qrisProviderBadge}>
                        {qris.providerName} secured
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.qrisModalClose}
                      onClick={() => setQrisModalOpen(false)}
                      aria-label="Close QRIS payment window"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>

                  <div className={styles.qrisScanner}>
                    <strong className={styles.qrisScannerMerchant}>
                      QRIS {qris.merchantName}
                    </strong>
                    <span className={styles.qrisScannerAmountLabel}>Total payment</span>
                    <strong className={styles.qrisScannerAmount}>{formatBasePrice(total)}</strong>
                    <div className={`${styles.qrisImageFrame} ${qrisExpired ? styles.qrisImageExpired : ""}`}>
                      <Image
                        src={qris.imageUrl}
                        alt={`DOKU QRIS for Order #${order?.id}`}
                        width={320}
                        height={320}
                        unoptimized
                      />
                      {qrisExpired ? <span className={styles.qrisExpiredOverlay}>Expired</span> : null}
                    </div>
                    <div
                      className={`${styles.qrisCountdown} ${qrisExpired ? styles.qrisCountdownExpired : ""}`}
                      aria-live="polite"
                    >
                      <span>Time remaining</span>
                      <strong>{formatCountdown(qrisRemainingSeconds)}</strong>
                      <small>
                        {qrisExpired
                          ? "Generate a new QRIS to continue."
                          : `Valid until ${formatExpiry(qris.expiresAt)} WIB`}
                      </small>
                    </div>
                    <p id="qris-modal-description" className={styles.qrisScannerHint}>
                      {qrisExpired
                        ? "This QRIS has expired. Generate a new code to continue payment."
                        : "Exact amount embedded. Scan the code with your banking or wallet app; no amount entry is required."}
                    </p>
                  </div>

                  <div className={styles.qrisScannerInstructions}>
                    <div className={styles.qrisInstructions}>
                      <h3>{qrisExpired ? "This QRIS is no longer valid" : "Scan—no amount entry required"}</h3>
                      {!qrisExpired ? (
                        <ol>
                          <li>Open Scan QRIS in your preferred banking or wallet app.</li>
                          <li>Scan the code and verify the merchant is {qris.merchantName}.</li>
                          <li>Confirm the automatically filled amount of {formatBasePrice(total)}.</li>
                        </ol>
                      ) : (
                        <p className={styles.qrisExpiredCopy}>
                          The payment window closed before confirmation. Generate a fresh QRIS to receive a new secure payment code.
                        </p>
                      )}
                      <dl>
                        <div>
                          <dt>Valid until</dt>
                          <dd>{formatExpiry(qris.expiresAt)} WIB</dd>
                        </div>
                        {qris.referenceNo ? (
                          <div>
                            <dt>Reference</dt>
                            <dd>{qris.referenceNo}</dd>
                          </div>
                        ) : null}
                        {qris.terminalId ? (
                          <div>
                            <dt>Terminal</dt>
                            <dd>{qris.terminalId}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <p>
                        <FaShieldAlt />
                        Payment status updates automatically after a verified DOKU confirmation.
                      </p>
                    </div>
                  </div>

                  <div className={styles.qrisModalFooter}>
                    {qrisExpired ? (
                      <button type="button" className={styles.qrisPrimaryAction} onClick={handleQrisAction}>
                        <FaQrcode /> Generate new QRIS
                      </button>
                    ) : null}
                    <button type="button" className={styles.qrisSecondaryAction} onClick={() => setQrisModalOpen(false)}>
                      Close window
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            <article className={styles.protectionCard}>
              <div className={styles.protectionTitle}>
                <FaShieldAlt />
                <div>
                  <h2>Buyer protection included</h2>
                  <p>Your payment and delivery stay inside ComePlayers.</p>
                </div>
              </div>
              <div className={styles.protectionList}>
                <span><FaCheckCircle /> Signed payment confirmation</span>
                <span><FaCheckCircle /> Escrow-protected order</span>
                <span><FaCheckCircle /> Secure in-platform delivery</span>
              </div>
            </article>
          </div>

          <aside className={styles.summaryCard}>
            <div className={styles.summaryHeading}>
              <h2>Summary</h2>
              <span>{currency}</span>
            </div>

            <dl className={styles.summaryRows}>
              <div>
                <dt>Product</dt>
                <dd title={productTitle}>{productTitle}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{quantity}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  {selectedPaymentMethod === "bank_transfer"
                    ? "Bank Transfer"
                    : selectedPaymentMethod === "card"
                      ? "Visa / Mastercard"
                      : selectedPaymentMethod === "doku_wallet"
                        ? "DOKU Wallet"
                        : selectedPaymentMethod === "qris"
                          ? "QRIS"
                          : "PayPal"}
                </dd>
              </div>
            </dl>

            <dl className={styles.summaryRows}>
              {order?.subtotal_amount != null ? <div><dt>Subtotal</dt><dd>{formatPrice(order.subtotal_amount)}</dd></div> : null}
              {Number(order?.discount_amount) > 0 ? <div><dt>Coupon discount</dt><dd>-{formatPrice(order?.discount_amount)}</dd></div> : null}
              {order?.payment_fee_amount != null ? <div><dt>Payment fee</dt><dd>{formatPrice(order.payment_fee_amount)}</dd></div> : null}
            </dl>
            <div className={styles.totalRow}>
              <span>Total</span>
              <strong>{formatPrice(total)}</strong>
            </div>
            {currency !== "IDR" ? (
              <p className={styles.convertedPrice}>
                Prices are shown in {currency}.{" "}
                {selectedPaymentMethod === "paypal"
                  ? "PayPal confirms its final USD amount before approval."
                  : <>DOKU charges {formatBasePrice(total)} (IDR).</>}
              </p>
            ) : null}

            {notice && !virtualAccount && !qris ? (
              <div className={styles.notice}>{notice}</div>
            ) : null}
            {error ? <div className={styles.error}>{error}</div> : null}

            <button
              type="button"
              onClick={() =>
                void (virtualAccount
                  ? copyVirtualAccountNumber()
                  : qris
                    ? handleQrisAction()
                    : startSelectedPayment())
              }
              disabled={paying || waitingForConfirmation}
              className={styles.payButton}
            >
              {virtualAccount ? (
                <FaCopy />
              ) : qris ? (
                <FaQrcode />
              ) : selectedPaymentMethod === "paypal" ? (
                <FaPaypal />
              ) : selectedPaymentMethod === "bank_transfer" ? (
                <FaUniversity />
              ) : selectedPaymentMethod === "qris" ? (
                <FaQrcode />
              ) : (
                <FaCreditCard />
              )}
              {waitingForConfirmation
                ? "Checking payment..."
                : paying
                  ? selectedPaymentMethod === "bank_transfer"
                    ? "Generating account..."
                    : selectedPaymentMethod === "card"
                      ? "Opening card checkout..."
                      : selectedPaymentMethod === "paypal"
                        ? "Opening PayPal..."
                        : selectedPaymentMethod === "qris"
                          ? "Generating QRIS..."
                          : "Opening wallet..."
                  : virtualAccount
                    ? copied
                      ? "VA number copied"
                      : "Copy VA number"
                    : qris
                      ? qrisExpired
                        ? "Generate new QRIS"
                        : "View QRIS code"
                      : selectedPaymentMethod === "bank_transfer"
                        ? "Continue with bank transfer"
                        : selectedPaymentMethod === "card"
                          ? "Continue with Visa / Mastercard"
                          : selectedPaymentMethod === "paypal"
                            ? "Continue to PayPal"
                            : selectedPaymentMethod === "qris"
                              ? "Continue with QRIS"
                              : "Continue to DOKU Wallet"}
            </button>
            <p className={styles.paymentNote}>
              <FaShieldAlt />
              {selectedPaymentMethod === "bank_transfer"
                ? virtualAccount
                  ? "Use the exact VA number and transfer amount shown on this page."
                  : `A DOKU VA will be created for transfer from ${sourceBank}.`
                : selectedPaymentMethod === "paypal"
                  ? "PayPal will show the final USD amount before you approve payment."
                  : selectedPaymentMethod === "card"
                    ? "You will continue to DOKU's secure Visa / Mastercard checkout."
                    : selectedPaymentMethod === "qris"
                      ? qris
                        ? `The QR already contains ${formatBasePrice(total)}. Payment status updates after DOKU confirms it.`
                        : "DOKU will generate a secure dynamic QR code. Scan it with any QRIS-supported banking or wallet app."
                      : "You will continue to DOKU Wallet's secure login page."}
            </p>
          </aside>
        </section>
      </div>
    </main>
  );
}
