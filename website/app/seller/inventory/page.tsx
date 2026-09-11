"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type Product = {
  id: number;
  title: string;
  slug: string | null;
  price: string | number;
  stock: number;
  status: string;
  has_variants: boolean;
  variant_count: number;
  game_name: string | null;
  category: string | null;
};

type Variant = {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  price: string | number;
  stock: number;
  status: string;
};

type Row = {
  key: string;
  kind: "product" | "variant";
  id: number;
  productId: number;
  productTitle: string;
  sku: string;
  name: string;
  price: string;
  stock: string;
  status: "active" | "inactive";
  locked?: boolean;
};

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  values.push(current);
  return values;
}

export default function SellerInventoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [original, setOriginal] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authenticatedFetchJson<{ products: Product[]; variants: Variant[] }>("/api/seller/inventory");
      const variantsByProduct = new Map<number, Variant[]>();
      for (const variant of data.variants || []) {
        variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) || []), variant]);
      }

      const next: Row[] = [];
      for (const product of data.products || []) {
        if (product.has_variants) {
          const variants = variantsByProduct.get(product.id) || [];
          for (const variant of variants) {
            next.push({
              key: `variant-${variant.id}`,
              kind: "variant",
              id: variant.id,
              productId: product.id,
              productTitle: product.title,
              sku: variant.sku,
              name: variant.name,
              price: String(variant.price),
              stock: String(variant.stock),
              status: variant.status === "inactive" ? "inactive" : "active",
            });
          }
        } else {
          next.push({
            key: `product-${product.id}`,
            kind: "product",
            id: product.id,
            productId: product.id,
            productTitle: product.title,
            sku: `PRODUCT-${product.id}`,
            name: "Default listing",
            price: String(product.price),
            stock: String(product.stock),
            status: product.status === "active" ? "active" : "inactive",
          });
        }
      }
      setRows(next);
      setOriginal(next.map((row) => ({ ...row })));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const changedRows = useMemo(() => {
    const originalMap = new Map(original.map((row) => [row.key, row]));
    return rows.filter((row) => {
      const before = originalMap.get(row.key);
      return !before || before.price !== row.price || before.stock !== row.stock || before.status !== row.status;
    });
  }, [original, rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.productTitle, row.sku, row.name].some((value) => value.toLowerCase().includes(term)));
  }, [rows, search]);

  function updateRow(key: string, field: "price" | "stock" | "status", value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } as Row : row));
  }

  async function save() {
    if (changedRows.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await authenticatedFetchJson("/api/seller/inventory", {
        method: "PATCH",
        body: JSON.stringify({
          rows: changedRows.map((row) => ({
            kind: row.kind,
            id: row.id,
            price: Number(row.price),
            stock: Number(row.stock),
            status: row.status,
          })),
        }),
      });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save inventory.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ["kind", "id", "product_id", "product_title", "sku", "variant_name", "price", "stock", "status"];
    const lines = [header.join(","), ...rows.map((row) => [row.kind, row.id, row.productId, row.productTitle, row.sku, row.name, row.price, row.stock, row.status].map(csvEscape).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `comeplayers-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("CSV has no inventory rows.");
    const headers = parseCsvLine(lines[0]).map((value) => value.trim().toLowerCase());
    const idIndex = headers.indexOf("id");
    const kindIndex = headers.indexOf("kind");
    const priceIndex = headers.indexOf("price");
    const stockIndex = headers.indexOf("stock");
    const statusIndex = headers.indexOf("status");
    if ([idIndex, kindIndex, priceIndex, stockIndex, statusIndex].some((index) => index < 0)) {
      throw new Error("CSV columns kind, id, price, stock, and status are required.");
    }

    const updates = new Map<string, Partial<Row>>();
    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      const kind = values[kindIndex] === "variant" ? "variant" : "product";
      const id = Number(values[idIndex]);
      if (!Number.isInteger(id) || id <= 0) continue;
      updates.set(`${kind}-${id}`, {
        price: values[priceIndex],
        stock: values[stockIndex],
        status: values[statusIndex] === "inactive" ? "inactive" : "active",
      });
    }

    setRows((current) => current.map((row) => ({ ...row, ...(updates.get(row.key) || {}) })));
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.2),transparent_34%)] px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div>
            <p className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">Bulk Inventory V13</p>
            <h1 className="mt-4 text-4xl font-black md:text-6xl">Inventory Center</h1>
            <p className="mt-3 max-w-2xl text-slate-300">Update hundreds of product and SKU prices, stock levels, and listing statuses from one screen or CSV.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/seller/products" className="rounded-xl border border-white/10 px-5 py-3 font-black">Products</Link>
            <button onClick={exportCsv} className="rounded-xl border border-cyan-400/40 px-5 py-3 font-black text-cyan-300">Export CSV</button>
            <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-violet-400/40 px-5 py-3 font-black text-violet-300">Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsv(file).catch((e) => setError(e instanceof Error ? e.message : "CSV import failed.")); event.target.value = ""; }} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU, or variant..." className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-cyan-400 md:max-w-xl" />
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-400">{changedRows.length} unsaved changes</span>
            <button onClick={() => setRows(original.map((row) => ({ ...row })))} disabled={!changedRows.length || saving} className="rounded-xl border border-white/10 px-4 py-3 font-black disabled:opacity-40">Reset</button>
            <button onClick={() => void save()} disabled={!changedRows.length || saving} className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-black disabled:opacity-40">{saving ? "Saving..." : "Save Changes"}</button>
          </div>
        </div>

        {error ? <p className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p> : null}

        {loading ? <p>Loading inventory...</p> : (
          <div className="overflow-x-auto rounded-3xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.05] text-left text-slate-300">
                <tr><th className="px-5 py-4">Product / SKU</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Price</th><th className="px-5 py-4">Stock</th><th className="px-5 py-4">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((row) => (
                  <tr key={row.key} className="bg-black/20">
                    <td className="px-5 py-4"><p className="font-black">{row.productTitle}</p><p className="mt-1 text-xs text-violet-300">{row.sku} · {row.name}</p></td>
                    <td className="px-5 py-4"><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">{row.kind}</span></td>
                    <td className="px-5 py-4"><input type="number" min="1" value={row.price} onChange={(e) => updateRow(row.key, "price", e.target.value)} className="w-36 rounded-lg border border-white/10 bg-black px-3 py-2 outline-none focus:border-cyan-400" /></td>
                    <td className="px-5 py-4"><input type="number" min="0" value={row.stock} onChange={(e) => updateRow(row.key, "stock", e.target.value)} className="w-28 rounded-lg border border-white/10 bg-black px-3 py-2 outline-none focus:border-cyan-400" /></td>
                    <td className="px-5 py-4"><select value={row.status} onChange={(e) => updateRow(row.key, "status", e.target.value)} className="rounded-lg border border-white/10 bg-black px-3 py-2 outline-none"><option value="active">Active</option><option value="inactive">Inactive</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
