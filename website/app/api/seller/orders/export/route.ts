import { NextResponse } from "next/server";
import { createCsv } from "@/lib/csv";
import { createSimpleXlsx } from "@/lib/simpleXlsx";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";

export const runtime = "nodejs";

const PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 50_000;

const ORDER_XLSX_COLUMNS = [
  { header: "Order ID", width: 14 },
  { header: "Order Date", width: 24 },
  { header: "Game Name", width: 26 },
  { header: "Listing Type", width: 20 },
  { header: "Listing ID", width: 14 },
  { header: "Product Title", width: 36 },
  { header: "Variant", width: 26 },
  { header: "Quantity", width: 12 },
  { header: "Currency", width: 12 },
  { header: "Buyer Total", width: 16 },
  { header: "Marketplace Fee", width: 18 },
  { header: "Seller Tax", width: 16 },
  { header: "Net Earning", width: 16 },
  { header: "Order Status", width: 18 },
  { header: "Payment Status", width: 18 },
  { header: "Delivery Status", width: 18 },
  { header: "Payout Status", width: 18 },
  { header: "Completed At", width: 24 },
  { header: "Buyer Reference", width: 28 },
];

const ORDER_EXPORT_FIELDS = [
  "id",
  "created_at",
  "product",
  "buyer",
  "price",
  "status",
  "product_id",
  "variant_id",
  "variant_name",
  "variant_sku",
  "quantity",
  "subtotal_amount",
  "discount_amount",
  "payment_fee_amount",
  "tax_amount",
  "total_amount",
  "total_price",
  "currency_code",
  "payment_status",
  "payment_method",
  "product_title",
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
  "delivery_due_at",
  "delivery_sla_status",
].join(",");

type OrderRow = {
  id: number;
  created_at?: string | null;
  product?: string | null;
  buyer?: string | null;
  price?: string | number | null;
  status?: string | null;
  product_id?: number | null;
  variant_id?: number | null;
  variant_name?: string | null;
  variant_sku?: string | null;
  quantity?: number | null;
  subtotal_amount?: string | number | null;
  discount_amount?: string | number | null;
  payment_fee_amount?: string | number | null;
  tax_amount?: string | number | null;
  total_amount?: string | number | null;
  total_price?: string | number | null;
  currency_code?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  product_title?: string | null;
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
  delivery_due_at?: string | null;
  delivery_sla_status?: string | null;
};

type ProductRow = {
  id: number;
  title?: string | null;
  game_name?: string | null;
  category?: string | null;
};

type ExportRow = OrderRow & {
  resolvedTitle: string;
  resolvedGame: string;
  resolvedCategory: string;
};

type ExportFilters = {
  game: string;
  category: string;
  status: string;
  from: number | null;
  to: number | null;
};

function clean(value: unknown, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalize(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("en");
}

function safeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function parseDateBoundary(value: string | null, endOfDay = false) {
  const source = clean(value, 32);
  if (!source) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? new Date(`${source}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(source);
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new Error("Use a valid export date.");
  return time;
}

function readFilters(url: URL): ExportFilters {
  return {
    game: clean(url.searchParams.get("game")),
    category: clean(url.searchParams.get("category"), 120),
    status: clean(url.searchParams.get("status"), 80),
    from: parseDateBoundary(url.searchParams.get("from")),
    to: parseDateBoundary(url.searchParams.get("to"), true),
  };
}

function maskBuyer(value?: string | null) {
  const buyer = clean(value, 320);
  const [local, domain] = buyer.split("@");
  if (!local || !domain) return buyer || "Buyer";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function matchesFilters(row: ExportRow, filters: ExportFilters) {
  if (filters.game && normalize(row.resolvedGame) !== normalize(filters.game)) {
    return false;
  }
  if (
    filters.category &&
    normalize(row.resolvedCategory) !== normalize(filters.category)
  ) {
    return false;
  }
  if (filters.status) {
    const expected = normalize(filters.status);
    if (
      normalize(row.status) !== expected &&
      normalize(row.payment_status) !== expected &&
      normalize(row.escrow_status) !== expected
    ) {
      return false;
    }
  }

  if (filters.from !== null || filters.to !== null) {
    const createdAt = new Date(String(row.created_at || "")).getTime();
    if (!Number.isFinite(createdAt)) return false;
    if (filters.from !== null && createdAt < filters.from) return false;
    if (filters.to !== null && createdAt > filters.to) return false;
  }

  return true;
}

async function loadSellerOrders(
  supabaseAdmin: Awaited<ReturnType<typeof requireApprovedSeller>>["supabaseAdmin"],
  sellerId: string
) {
  const rows: OrderRow[] = [];

  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(ORDER_EXPORT_FIELDS)
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data || []) as unknown as OrderRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function loadProducts(
  supabaseAdmin: Awaited<ReturnType<typeof requireApprovedSeller>>["supabaseAdmin"],
  productIds: number[]
) {
  const products = new Map<number, ProductRow>();

  for (let offset = 0; offset < productIds.length; offset += 500) {
    const ids = productIds.slice(offset, offset + 500);
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id,title,game_name,category")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const item of (data || []) as ProductRow[]) {
      products.set(Number(item.id), item);
    }
  }

  return products;
}

function resolveRows(orders: OrderRow[], products: Map<number, ProductRow>) {
  return orders.map<ExportRow>((order) => {
    const product = order.product_id
      ? products.get(Number(order.product_id))
      : undefined;
    return {
      ...order,
      resolvedTitle: clean(order.product_title || order.product || product?.title) || "Product",
      resolvedGame: clean(order.game_name || product?.game_name) || "Unassigned",
      resolvedCategory: clean(order.category || product?.category) || "Unassigned",
    };
  });
}

function uniqueOptions(rows: ExportRow[], key: "resolvedGame" | "resolvedCategory") {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    const label = row[key];
    const normalized = normalize(label);
    const current = counts.get(normalized);
    counts.set(normalized, {
      label: current?.label || label,
      count: (current?.count || 0) + 1,
    });
  }
  return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const url = new URL(request.url);
    const mode = clean(url.searchParams.get("mode"), 20) || "export";
    const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const orders = await loadSellerOrders(supabaseAdmin, user.id);
    const productIds = Array.from(
      new Set(
        orders
          .map((order) => Number(order.product_id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
    const products = await loadProducts(supabaseAdmin, productIds);
    const rows = resolveRows(orders, products);

    if (mode === "options") {
      const statuses = new Map<string, { label: string; count: number }>();
      for (const row of rows) {
        const label = clean(row.status, 80) || "pending";
        const key = normalize(label);
        const current = statuses.get(key);
        statuses.set(key, {
          label: current?.label || label,
          count: (current?.count || 0) + 1,
        });
      }

      return NextResponse.json({
        total: rows.length,
        games: uniqueOptions(rows, "resolvedGame"),
        categories: uniqueOptions(rows, "resolvedCategory"),
        statuses: Array.from(statuses.values()).sort((a, b) =>
          a.label.localeCompare(b.label)
        ),
      });
    }

    if (mode !== "export") throw new Error("Invalid order export mode.");
    const filters = readFilters(url);
    if (filters.from !== null && filters.to !== null && filters.from > filters.to) {
      throw new Error("The start date must be before the end date.");
    }

    const filteredRows = rows.filter((row) => matchesFilters(row, filters));
    const scope = safeFilenamePart(filters.game || "all-games") || "all-games";

    if (format === "xlsx") {
      const workbook = createSimpleXlsx({
        sheetName: "Orders",
        title: `ComePlayers seller orders - ${filters.game || "All Games"}`,
        columns: ORDER_XLSX_COLUMNS,
        rows: filteredRows.map((row) => [
          row.id,
          row.created_at,
          row.resolvedGame,
          row.resolvedCategory,
          row.product_id,
          row.resolvedTitle,
          row.variant_name || row.variant_sku,
          row.quantity || 1,
          row.currency_code || "IDR",
          row.total_amount || row.total_price,
          row.marketplace_fee_amount,
          row.seller_sales_tax_amount,
          row.seller_earning_amount,
          row.status,
          row.payment_status,
          row.delivery_sla_status,
          row.seller_payout_status,
          row.completed_at,
          maskBuyer(row.buyer),
        ]),
      });

      return new Response(Buffer.from(workbook), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="comeplayers-orders-${scope}-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
          "X-Exported-Rows": String(filteredRows.length),
        },
      });
    }

    const csv = createCsv(
      [
        "order_id",
        "created_at",
        "game",
        "category",
        "product_id",
        "product_title",
        "variant_id",
        "variant_sku",
        "variant_name",
        "quantity",
        "currency",
        "unit_price",
        "subtotal",
        "discount",
        "payment_fee",
        "tax",
        "buyer_total",
        "seller_gross",
        "marketplace_fee",
        "seller_sales_tax_rate_percent",
        "seller_sales_tax",
        "seller_net_earning",
        "order_status",
        "payment_status",
        "payment_method",
        "escrow_status",
        "payout_status",
        "delivery_due_at",
        "delivery_status",
        "paid_at",
        "delivered_at",
        "completed_at",
        "buyer_reference",
      ],
      filteredRows.map((row) => [
        row.id,
        row.created_at,
        row.resolvedGame,
        row.resolvedCategory,
        row.product_id,
        row.resolvedTitle,
        row.variant_id,
        row.variant_sku,
        row.variant_name,
        row.quantity || 1,
        row.currency_code || "IDR",
        row.price,
        row.subtotal_amount,
        row.discount_amount,
        row.payment_fee_amount,
        row.tax_amount,
        row.total_amount || row.total_price,
        row.seller_gross_amount,
        row.marketplace_fee_amount,
        row.seller_sales_tax_rate_percent,
        row.seller_sales_tax_amount,
        row.seller_earning_amount,
        row.status,
        row.payment_status,
        row.payment_method,
        row.escrow_status,
        row.seller_payout_status,
        row.delivery_due_at,
        row.delivery_sla_status,
        row.paid_at,
        row.delivered_at,
        row.completed_at,
        maskBuyer(row.buyer),
      ])
    );

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comeplayers-orders-${scope}-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
        "X-Exported-Rows": String(filteredRows.length),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected order export error.";
    return NextResponse.json(
      { error: message },
      { status: sellerErrorStatus(error) }
    );
  }
}
