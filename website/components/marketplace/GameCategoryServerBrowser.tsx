"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaBoxOpen, FaGlobeAsia, FaSearch, FaServer, FaThumbsUp } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import {
  sortCoinServerGroups,
  type MarketplaceServerGroup,
} from "@/lib/marketplaceServerGrouping";

type Props = {
  gameSlug: string;
  servers: MarketplaceServerGroup[];
};

function offerUrl(gameSlug: string, server: MarketplaceServerGroup) {
  const params = new URLSearchParams({
    category: "coin",
    server: server.name,
    region: server.region,
    sort: "recommended",
  });
  if (server.faction) params.set("faction", server.faction);
  if (server.platform) params.set("platform", server.platform);
  return `/games/${encodeURIComponent(gameSlug)}/offers?${params.toString()}`;
}

export default function GameCategoryServerBrowser({ gameSlug, servers }: Props) {
  const { formatPrice } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [sort, setSort] = useState<"recommended" | "price_asc">(
    searchParams.get("sort") === "price_asc" ? "price_asc" : "recommended"
  );

  const regions = useMemo(
    () =>
      Array.from(new Set(servers.map((server) => server.region).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [servers]
  );

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const selectedRegion = region.trim().toLowerCase();
    const matches = servers.filter((server) => {
      const haystack = [server.name, server.region, server.faction, server.platform]
        .join(" ")
        .toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (selectedRegion && server.region.toLowerCase() !== selectedRegion) return false;
      return true;
    });
    return sortCoinServerGroups(matches, sort);
  }, [query, region, servers, sort]);

  function syncUrl(next: { q?: string; region?: string; sort?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", "coin");
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/games/${encodeURIComponent(gameSlug)}?${params.toString()}`, {
      scroll: false,
    });
  }

  function clearFilters() {
    setQuery("");
    setRegion("");
    syncUrl({ q: "", region: "", sort });
  }

  return (
    <section className="mt-7">
      <div className="rounded-lg border border-white/15 bg-[#0a0c10] p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <label className="block">
            <span className="mb-3 flex items-center gap-3 text-base font-bold text-white">
              Select Server
              <span className="text-sm font-normal text-slate-500">
                {new Intl.NumberFormat("en-US").format(servers.length)} server options
              </span>
            </span>
            <span className="relative block">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  syncUrl({ q: value, region, sort });
                }}
                placeholder="Search servers..."
                className="h-14 w-full rounded-md border border-white/15 bg-[#101319] pl-12 pr-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-yellow-400/70"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-3 block text-base font-bold text-white">Select Region</span>
            <span className="relative flex h-14 items-center rounded-md border border-white/15 bg-[#101319] px-4 transition focus-within:border-yellow-400/70">
              <FaGlobeAsia className="mr-3 text-slate-400" />
              <select
                value={region}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegion(value);
                  syncUrl({ q: query, region: value, sort });
                }}
                className="h-full w-full bg-transparent font-medium text-slate-200 outline-none"
                aria-label="Filter by region"
              >
                <option value="" className="bg-[#101319]">All regions</option>
                {regions.map((item) => (
                  <option key={item} value={item} className="bg-[#101319]">
                    {item}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-slate-400">
          About {new Intl.NumberFormat("en-US").format(filtered.length)} results
        </p>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 text-slate-400">Sort by:</span>
          <button
            type="button"
            onClick={() => {
              setSort("recommended");
              syncUrl({ q: query, region, sort: "recommended" });
            }}
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 font-bold transition ${
              sort === "recommended"
                ? "border-yellow-400/70 bg-yellow-400/[0.07] text-yellow-300"
                : "border-white/15 bg-[#0b0d11] text-slate-300 hover:border-yellow-400/50"
            }`}
            aria-pressed={sort === "recommended"}
          >
            <FaThumbsUp /> Recommended
          </button>
          <button
            type="button"
            onClick={() => {
              setSort("price_asc");
              syncUrl({ q: query, region, sort: "price_asc" });
            }}
            className={`h-10 rounded-md border px-4 font-bold transition ${
              sort === "price_asc"
                ? "border-yellow-400/70 bg-yellow-400/[0.07] text-yellow-300"
                : "border-white/15 bg-[#0b0d11] text-slate-300 hover:border-yellow-400/50"
            }`}
            aria-pressed={sort === "price_asc"}
          >
            Lowest price
          </button>
        </div>
      </div>

      {filtered.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((server) => (
            <Link
              key={server.key}
              href={offerUrl(gameSlug, server)}
              className="group rounded-lg border border-white/15 bg-[#0b0d11] p-5 transition hover:border-yellow-400/70"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-yellow-400/25 bg-yellow-400/[0.06] text-yellow-300">
                  <FaServer />
                </span>
                <div className="min-w-0">
                  <h3 className="line-clamp-2 font-black text-white group-hover:text-yellow-200">
                    {server.name}
                    {server.region ? ` [${server.region}]` : ""}
                    {server.faction ? ` - ${server.faction}` : ""}
                  </h3>
                  {server.platform ? (
                    <p className="mt-1 text-xs text-slate-500">{server.platform}</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex items-end justify-between gap-3 text-sm">
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-bold text-slate-300">
                  {new Intl.NumberFormat("en-US").format(server.offerCount)} products
                </span>
                <span className="text-right font-black text-yellow-300">
                  {server.minimumPrice > 0
                    ? `from ${formatPrice(server.minimumPrice)}`
                    : "No price yet"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex min-h-[210px] flex-col items-center justify-center rounded-lg border border-white/15 bg-[#0a0c10] px-6 py-10 text-center">
          <FaBoxOpen className="text-4xl text-yellow-400/55" />
          <h3 className="mt-4 text-xl font-black text-white">No products available yet</h3>
          <p className="mt-2 text-slate-400">
            Select a server or change the filters to view products.
          </p>
          {(query || region) ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 rounded-md border border-yellow-400/60 px-5 py-2.5 font-bold text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
