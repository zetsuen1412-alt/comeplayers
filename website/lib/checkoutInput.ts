export function parseCheckoutInput(body: {
  productId?: unknown; quantity?: unknown; variantId?: unknown; couponCode?: unknown;
}) {
  for (const value of [body.productId, body.quantity, body.variantId]) {
    if (value !== null && value !== undefined && typeof value !== "number" && typeof value !== "string") {
      throw new Error("Invalid checkout input.");
    }
  }
  const productId = Number(body.productId);
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
  const variantId = body.variantId === null || body.variantId === undefined || body.variantId === ""
    ? null : Number(body.variantId);
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new Error("Invalid product ID.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error("Quantity must be a whole number between 1 and 100.");
  }
  if (variantId !== null && (!Number.isSafeInteger(variantId) || variantId <= 0)) {
    throw new Error("Invalid product variant ID.");
  }
  const couponCode = String(body.couponCode || "").trim().toUpperCase();
  if (couponCode.length > 100) throw new Error("Invalid coupon code.");
  return { productId, quantity, variantId, couponCode: couponCode || null };
}

export type CheckoutInput = ReturnType<typeof parseCheckoutInput>;
export type CheckoutQuote = {
  product_id: number;
  variant_id: number | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount: number;
  payment_fee: number;
  total: number;
  currency: "IDR";
  coupon_code: string | null;
};
