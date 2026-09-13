import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createCheckoutOrder, createPayment, payWithWallet } from "../api";
import { formatCurrency, PrimaryButton } from "../components";
import { colors, radius } from "../theme";
import type { MarketplaceProduct, PaymentResult } from "../types";

type Method = "qris" | "bank_transfer" | "wallet";

export function CheckoutSheet({
  product,
  onClose,
}: {
  product: MarketplaceProduct | null;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<Method>("qris");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [paidWithWallet, setPaidWithWallet] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setMethod("qris");
    setProcessing(false);
    setError("");
    setPayment(null);
    setPaidWithWallet(false);
  }, [product?.id]);

  const beginPayment = async () => {
    if (!product) return;
    setProcessing(true);
    setError("");
    try {
      const order = await createCheckoutOrder(product.id, quantity);
      if (method === "wallet") {
        await payWithWallet(order.id);
        setPaidWithWallet(true);
        setPayment({ ok: true, orderId: order.id });
      } else {
        setPayment(await createPayment(order.id, method));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment could not be started.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      visible={Boolean(product)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text style={styles.kicker}>SECURE CHECKOUT</Text>
                <Text style={styles.title}>{product?.title || "Product"}</Text>
              </View>
              <Pressable accessibilityLabel="Close checkout" onPress={onClose} style={styles.close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            {!payment ? (
              <>
                <View style={styles.summary}>
                  <View>
                    <Text style={styles.summaryLabel}>PRICE</Text>
                    <Text style={styles.price}>{formatCurrency(product?.price, "USD")}</Text>
                  </View>
                  <View style={styles.quantity}>
                    <Pressable
                      style={styles.quantityButton}
                      onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                    >
                      <Text style={styles.quantityButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.quantityValue}>{quantity}</Text>
                    <Pressable
                      style={styles.quantityButton}
                      onPress={() => setQuantity((value) => Math.min(100, value + 1))}
                    >
                      <Text style={styles.quantityButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.label}>CHOOSE PAYMENT METHOD</Text>
                <View style={styles.methods}>
                  <MethodButton
                    active={method === "qris"}
                    title="QRIS"
                    detail="Scan from any supported payment app"
                    onPress={() => setMethod("qris")}
                  />
                  <MethodButton
                    active={method === "bank_transfer"}
                    title="Bank transfer"
                    detail="Receive a virtual account number"
                    onPress={() => setMethod("bank_transfer")}
                  />
                  <MethodButton
                    active={method === "wallet"}
                    title="ComePlayers Wallet"
                    detail="Use your available account balance"
                    onPress={() => setMethod("wallet")}
                  />
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton
                  label="Create order and pay"
                  onPress={() => void beginPayment()}
                  loading={processing}
                />
                <Text style={styles.note}>
                  Your final converted amount, fees, and order number are confirmed before payment is completed.
                </Text>
              </>
            ) : (
              <PaymentInstructions payment={payment} wallet={paidWithWallet} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MethodButton({
  active,
  title,
  detail,
  onPress,
}: {
  active: boolean;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.method, active && styles.methodActive]}>
      <View style={[styles.radio, active && styles.radioActive]} />
      <View style={styles.methodCopy}>
        <Text style={styles.methodTitle}>{title}</Text>
        <Text style={styles.methodDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function PaymentInstructions({ payment, wallet }: { payment: PaymentResult; wallet: boolean }) {
  if (wallet || payment.alreadyPaid) {
    return (
      <View style={styles.success}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successTitle}>Payment successful</Text>
        <Text style={styles.successText}>Order #{payment.orderId} is paid and now protected by ComePlayers.</Text>
      </View>
    );
  }

  if (payment.qris) {
    return (
      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>Scan to pay</Text>
        <Text style={styles.instructionText}>Order #{payment.orderId}</Text>
        <View style={styles.qrFrame}>
          <Image source={{ uri: payment.qris.imageUrl }} style={styles.qrImage} resizeMode="contain" />
        </View>
        <Text style={styles.expiry}>Complete payment before {formatExpiry(payment.qris.expiresAt)}.</Text>
      </View>
    );
  }

  return (
    <View style={styles.instructions}>
      <Text style={styles.instructionTitle}>Bank transfer ready</Text>
      <Text style={styles.instructionText}>Order #{payment.orderId}</Text>
      <Text style={styles.vaLabel}>VIRTUAL ACCOUNT NUMBER</Text>
      <Text selectable style={styles.vaNumber}>{payment.virtualAccount?.number || "Unavailable"}</Text>
      <Text style={styles.expiry}>Complete payment before {formatExpiry(payment.virtualAccount?.expiresAt)}.</Text>
    </View>
  );
}

function formatExpiry(value?: string) {
  if (!value) return "the payment instruction expires";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "the payment instruction expires";
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.75)" },
  sheet: { maxHeight: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.backgroundRaised },
  handle: { alignSelf: "center", width: 42, height: 4, marginTop: 9, borderRadius: 2, backgroundColor: colors.textDim },
  content: { padding: 20, paddingBottom: 38 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  headingCopy: { flex: 1 },
  kicker: { color: colors.blue, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  title: { marginTop: 6, color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  close: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.panelStrong },
  closeText: { color: colors.text, fontSize: 23, lineHeight: 25 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: 15, borderRadius: radius.medium, backgroundColor: colors.panel },
  summaryLabel: { color: colors.textDim, fontSize: 8, fontWeight: "900" },
  price: { marginTop: 4, color: colors.yellow, fontSize: 20, fontWeight: "900" },
  quantity: { flexDirection: "row", alignItems: "center", gap: 13 },
  quantityButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.panelStrong },
  quantityButtonText: { color: colors.text, fontSize: 20, fontWeight: "800" },
  quantityValue: { minWidth: 22, color: colors.text, fontSize: 15, fontWeight: "900", textAlign: "center" },
  label: { marginTop: 20, marginBottom: 8, color: colors.textMuted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  methods: { gap: 8, marginBottom: 17 },
  method: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 65, padding: 13, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  methodActive: { borderColor: "rgba(255,208,0,.65)", backgroundColor: colors.yellowSoft },
  radio: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: colors.textDim },
  radioActive: { borderWidth: 4, borderColor: colors.yellow, backgroundColor: colors.background },
  methodCopy: { flex: 1 },
  methodTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  methodDetail: { marginTop: 3, color: colors.textMuted, fontSize: 9 },
  error: { marginBottom: 13, color: colors.red, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  note: { marginTop: 12, color: colors.textDim, fontSize: 9, lineHeight: 14, textAlign: "center" },
  instructions: { alignItems: "center", marginTop: 26, padding: 18, borderRadius: radius.large, backgroundColor: colors.panel },
  instructionTitle: { color: colors.text, fontSize: 23, fontWeight: "900" },
  instructionText: { marginTop: 5, color: colors.textMuted, fontSize: 11 },
  qrFrame: { width: 260, height: 260, marginTop: 18, padding: 12, borderRadius: 20, backgroundColor: colors.white },
  qrImage: { width: "100%", height: "100%" },
  expiry: { marginTop: 14, color: colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: "center" },
  vaLabel: { marginTop: 24, color: colors.blue, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  vaNumber: { marginTop: 8, color: colors.yellow, fontSize: 24, fontWeight: "900", letterSpacing: 1.1 },
  success: { alignItems: "center", marginTop: 28, padding: 28, borderRadius: radius.large, borderWidth: 1, borderColor: "rgba(54,226,160,.32)", backgroundColor: "rgba(54,226,160,.08)" },
  successIcon: { width: 54, height: 54, paddingTop: 9, borderRadius: 27, color: colors.background, fontSize: 24, fontWeight: "900", textAlign: "center", backgroundColor: colors.green },
  successTitle: { marginTop: 16, color: colors.text, fontSize: 22, fontWeight: "900" },
  successText: { marginTop: 7, color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center" },
});
