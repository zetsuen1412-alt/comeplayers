/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type StorePolicies = {
  delivery: string;
  refund: string;
  support: string;
};

type StoreProfile = {
  id: string;
  seller_name: string | null;
  username: string | null;
  store_slug: string | null;
  store_name: string | null;
  store_tagline: string | null;
  store_description: string | null;
  store_banner_url: string | null;
  store_logo_url: string | null;
  store_accent_color: string | null;
  store_announcement: string | null;
  store_policies: Partial<StorePolicies> | null;
  store_vacation_mode: boolean | null;
  store_vacation_message: string | null;
  store_reopens_at: string | null;
  store_is_published: boolean | null;
};

type Product = {
  id: number;
  title: string | null;
  slug: string | null;
  image_url: string | null;
  game_name: string | null;
  category: string | null;
  price: number | string | null;
  stock: number | null;
  status: string | null;
};

type StorefrontResponse = {
  profile: StoreProfile;
  products: Product[];
  featuredProductIds: number[];
};

type FormState = {
  storeSlug: string;
  storeName: string;
  storeTagline: string;
  storeDescription: string;
  storeBannerUrl: string;
  storeLogoUrl: string;
  storeAccentColor: string;
  storeAnnouncement: string;
  storePolicies: StorePolicies;
  storeVacationMode: boolean;
  storeVacationMessage: string;
  storeReopensAt: string;
  storeIsPublished: boolean;
  featuredProductIds: number[];
};

const EMPTY_FORM: FormState = {
  storeSlug: "",
  storeName: "",
  storeTagline: "",
  storeDescription: "",
  storeBannerUrl: "",
  storeLogoUrl: "",
  storeAccentColor: "#22d3ee",
  storeAnnouncement: "",
  storePolicies: { delivery: "", refund: "", support: "" },
  storeVacationMode: false,
  storeVacationMessage: "",
  storeReopensAt: "",
  storeIsPublished: true,
  featuredProductIds: [],
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export default function SellerStorefrontSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const activeProducts = useMemo(
    () => products.filter((product) => String(product.status || "").toLowerCase() === "active"),
    [products]
  );

  const publicPath = form.storeSlug ? `/store/${form.storeSlug}` : "";

  const loadStorefront = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authenticatedFetchJson<StorefrontResponse>("/api/seller/storefront");
      const profile = data.profile;
      setProducts(data.products || []);
      setForm({
        storeSlug: profile.store_slug || "",
        storeName: profile.store_name || profile.seller_name || profile.username || "ComePlayers Store",
        storeTagline: profile.store_tagline || "",
        storeDescription: profile.store_description || "",
        storeBannerUrl: profile.store_banner_url || "",
        storeLogoUrl: profile.store_logo_url || "",
        storeAccentColor: profile.store_accent_color || "#22d3ee",
        storeAnnouncement: profile.store_announcement || "",
        storePolicies: {
          delivery: profile.store_policies?.delivery || "",
          refund: profile.store_policies?.refund || "",
          support: profile.store_policies?.support || "",
        },
        storeVacationMode: Boolean(profile.store_vacation_mode),
        storeVacationMessage: profile.store_vacation_message || "",
        storeReopensAt: toLocalDateTime(profile.store_reopens_at),
        storeIsPublished: profile.store_is_published !== false,
        featuredProductIds: data.featuredProductIds || [],
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load storefront settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStorefront();
  }, [loadStorefront]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePolicy(key: keyof StorePolicies, value: string) {
    setForm((current) => ({
      ...current,
      storePolicies: { ...current.storePolicies, [key]: value },
    }));
  }

  function toggleFeatured(productId: number) {
    setForm((current) => {
      const exists = current.featuredProductIds.includes(productId);
      if (exists) {
        return {
          ...current,
          featuredProductIds: current.featuredProductIds.filter((id) => id !== productId),
        };
      }
      if (current.featuredProductIds.length >= 8) {
        setError("You can feature at most 8 products.");
        return current;
      }
      return {
        ...current,
        featuredProductIds: [...current.featuredProductIds, productId],
      };
    });
  }

  async function saveStorefront() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        ...form,
        storeSlug: slugify(form.storeSlug),
        storeReopensAt: form.storeReopensAt
          ? new Date(form.storeReopensAt).toISOString()
          : null,
      };
      const result = await authenticatedFetchJson<{
        publicUrl: string;
        featuredProductIds: number[];
      }>("/api/seller/storefront", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      update("storeSlug", slugify(form.storeSlug));
      setMessage(`Storefront saved. Public URL: ${result.publicUrl}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save storefront.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading storefront editor...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-5 py-10 text-white md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">Seller Branding</p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">Storefront Studio</h1>
            <p className="mt-4 max-w-3xl text-slate-400">
              Build a professional public store page with branding, policies, featured offers, announcements, and vacation mode.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {publicPath && form.storeIsPublished && (
              <Link
                href={publicPath}
                target="_blank"
                className="rounded-2xl border border-cyan-400/40 px-5 py-3 font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
              >
                Open Storefront ↗
              </Link>
            )}
            <button
              type="button"
              onClick={saveStorefront}
              disabled={saving}
              className="rounded-2xl bg-cyan-400 px-6 py-3 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Storefront"}
            </button>
          </div>
        </div>

        {error && <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</div>}
        {message && <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-200">{message}</div>}

        <div className="mt-8 grid gap-7 xl:grid-cols-[1fr_390px]">
          <div className="space-y-7">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
              <h2 className="text-2xl font-black">Identity & Public URL</h2>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Field label="Store name">
                  <input
                    value={form.storeName}
                    onChange={(event) => update("storeName", event.target.value)}
                    maxLength={80}
                    className="input"
                    placeholder="My Gaming Store"
                  />
                </Field>
                <Field label="Store URL slug">
                  <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-black/30 focus-within:border-cyan-400">
                    <span className="flex items-center border-r border-white/10 px-3 text-xs text-slate-500">/store/</span>
                    <input
                      value={form.storeSlug}
                      onChange={(event) => update("storeSlug", slugify(event.target.value))}
                      maxLength={40}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
                      placeholder="my-gaming-store"
                    />
                  </div>
                </Field>
                <Field label="Tagline" wide>
                  <input
                    value={form.storeTagline}
                    onChange={(event) => update("storeTagline", event.target.value)}
                    maxLength={120}
                    className="input"
                    placeholder="Fast delivery, verified products, real support."
                  />
                </Field>
                <Field label="Store description" wide>
                  <textarea
                    value={form.storeDescription}
                    onChange={(event) => update("storeDescription", event.target.value)}
                    maxLength={2000}
                    rows={6}
                    className="input resize-y"
                    placeholder="Tell buyers what makes your store trustworthy and unique."
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
              <h2 className="text-2xl font-black">Branding</h2>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Field label="Banner image URL" wide>
                  <input
                    value={form.storeBannerUrl}
                    onChange={(event) => update("storeBannerUrl", event.target.value)}
                    className="input"
                    placeholder="https://.../banner.jpg"
                  />
                </Field>
                <Field label="Store logo URL">
                  <input
                    value={form.storeLogoUrl}
                    onChange={(event) => update("storeLogoUrl", event.target.value)}
                    className="input"
                    placeholder="https://.../logo.png"
                  />
                </Field>
                <Field label="Accent color">
                  <div className="flex gap-3">
                    <input
                      type="color"
                      value={form.storeAccentColor}
                      onChange={(event) => update("storeAccentColor", event.target.value)}
                      className="h-12 w-16 rounded-xl border border-white/10 bg-black/30 p-1"
                    />
                    <input
                      value={form.storeAccentColor}
                      onChange={(event) => update("storeAccentColor", event.target.value)}
                      maxLength={7}
                      className="input flex-1"
                    />
                  </div>
                </Field>
                <Field label="Store announcement" wide>
                  <textarea
                    value={form.storeAnnouncement}
                    onChange={(event) => update("storeAnnouncement", event.target.value)}
                    maxLength={280}
                    rows={3}
                    className="input resize-y"
                    placeholder="Weekend promotion, delivery notice, or important buyer update."
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">Featured Offers</h2>
                  <p className="mt-2 text-sm text-slate-400">Choose up to 8 active products. Selection order controls storefront order.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-black">
                  {form.featuredProductIds.length}/8
                </span>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {activeProducts.length === 0 ? (
                  <p className="col-span-full rounded-2xl border border-white/10 bg-black/30 p-5 text-slate-400">
                    Publish at least one active product before selecting featured offers.
                  </p>
                ) : (
                  activeProducts.map((product) => {
                    const selected = form.featuredProductIds.includes(product.id);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => toggleFeatured(product.id)}
                        className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-cyan-400 bg-cyan-400/10"
                            : "border-white/10 bg-black/30 hover:border-white/30"
                        }`}
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xl">🎮</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-black">{product.title || `Product #${product.id}`}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {product.game_name || product.category || "Gaming product"} · Stock {product.stock || 0}
                          </p>
                        </div>
                        <span className={`text-xl ${selected ? "text-cyan-300" : "text-slate-600"}`}>
                          {selected ? "✓" : "+"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
              <h2 className="text-2xl font-black">Store Policies</h2>
              <div className="mt-6 space-y-5">
                <Field label="Delivery policy">
                  <textarea
                    value={form.storePolicies.delivery}
                    onChange={(event) => updatePolicy("delivery", event.target.value)}
                    maxLength={1500}
                    rows={5}
                    className="input resize-y"
                    placeholder="Explain delivery hours, requirements, and expected response time."
                  />
                </Field>
                <Field label="Refund and replacement policy">
                  <textarea
                    value={form.storePolicies.refund}
                    onChange={(event) => updatePolicy("refund", event.target.value)}
                    maxLength={1500}
                    rows={5}
                    className="input resize-y"
                    placeholder="Explain when replacements or refunds can be requested."
                  />
                </Field>
                <Field label="Support policy">
                  <textarea
                    value={form.storePolicies.support}
                    onChange={(event) => updatePolicy("support", event.target.value)}
                    maxLength={1500}
                    rows={5}
                    className="input resize-y"
                    placeholder="Explain how buyers should contact you through protected order chat."
                  />
                </Field>
              </div>
            </section>
          </div>

          <aside className="space-y-7">
            <section className="sticky top-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-2xl font-black">Publish Controls</h2>
              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <input
                  type="checkbox"
                  checked={form.storeIsPublished}
                  onChange={(event) => update("storeIsPublished", event.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <span className="block font-black">Public storefront</span>
                  <span className="mt-1 block text-sm text-slate-400">Allow buyers to open your store page.</span>
                </span>
              </label>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                <input
                  type="checkbox"
                  checked={form.storeVacationMode}
                  onChange={(event) => update("storeVacationMode", event.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <span className="block font-black text-yellow-200">Vacation mode</span>
                  <span className="mt-1 block text-sm text-yellow-100/70">Show buyers that delivery may be paused or delayed.</span>
                </span>
              </label>

              {form.storeVacationMode && (
                <div className="mt-4 space-y-4">
                  <Field label="Vacation message">
                    <textarea
                      value={form.storeVacationMessage}
                      onChange={(event) => update("storeVacationMessage", event.target.value)}
                      maxLength={500}
                      rows={4}
                      className="input resize-y"
                      placeholder="Orders resume on..."
                    />
                  </Field>
                  <Field label="Reopens at (optional)">
                    <input
                      type="datetime-local"
                      value={form.storeReopensAt}
                      onChange={(event) => update("storeReopensAt", event.target.value)}
                      className="input"
                    />
                  </Field>
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Store URL</p>
                <p className="mt-2 break-all font-mono text-sm text-cyan-300">
                  {publicPath || "/store/your-store"}
                </p>
              </div>

              <button
                type="button"
                onClick={saveStorefront}
                disabled={saving}
                className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black hover:bg-cyan-300 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save All Changes"}
              </button>
            </section>
          </aside>
        </div>
      </div>
      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(0,0,0,.3);
          padding: .8rem 1rem;
          color: white;
          outline: none;
        }
        .input:focus { border-color: #22d3ee; }
      `}</style>
    </main>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-2 block text-sm font-black text-slate-300">{label}</span>
      {children}
    </label>
  );
}
