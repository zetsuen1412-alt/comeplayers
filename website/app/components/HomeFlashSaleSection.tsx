"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/components/CurrencyProvider";
import { supabase } from "@/lib/supabase";

type Product = {
  id: number;
  title: string | null;
  price: string | number | null;
  image_url: string | null;
  category: string | null;
  game_name: string | null;
  stock: number | null;
  status: string | null;
};

type FlashSale = {
  id: number;
  product_id: number;
  title: string;
  description: string | null;
  original_price: string | number;
  flash_price: string | number;
  stock_limit: number | null;
  sold_count: number;
  start_at: string;
  end_at: string;
  status: "active" | "inactive";
  products: Product | null;
};


function getTimeLeft(endAt: string) {
  const distance = new Date(endAt).getTime() - Date.now();

  if (distance <= 0) {
    return {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }

  return {
    expired: false,
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((distance / (1000 * 60)) % 60),
    seconds: Math.floor((distance / 1000) % 60),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default function HomeFlashSaleSection() {
  const { formatPrice, currency } = useCurrency();
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(0);

  const runningFlashSales = useMemo(() => {
    const now = Date.now();

    return flashSales.filter((item) => {
      const product = item.products;
      const start = new Date(item.start_at).getTime();
      const end = new Date(item.end_at).getTime();

      return (
        item.status === "active" &&
        product?.status === "active" &&
        now >= start &&
        now <= end
      );
    });
  }, [flashSales, nowTick]);

  async function loadFlashSales() {
    const { data, error } = await supabase
      .from("flash_sales")
      .select(
        `
        *,
        products:product_id (
          id,
          title,
          price,
          image_url,
          category,
          game_name,
          stock,
          status
        )
      `
      )
      .eq("status", "active")
      .order("id", { ascending: false })
      .limit(12);

    if (error) {
      console.error("Flash sale load error:", error.message);
      setLoading(false);
      return;
    }

    setFlashSales((data || []) as unknown as FlashSale[]);
    setLoading(false);
  }

  useEffect(() => {
    loadFlashSales();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-6 py-10 text-white">
        <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-8">
          <p className="font-black text-yellow-300">Loading flash sales...</p>
        </div>
      </section>
    );
  }

  if (runningFlashSales.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 text-white">
      <div className="relative overflow-hidden rounded-[2rem] border border-yellow-400/30 bg-yellow-400/10 p-7 shadow-2xl shadow-yellow-500/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,.24),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,.16),transparent_34%)]" />

        <div className="relative z-10 mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-yellow-400/40 bg-black/30 px-4 py-2 text-sm font-black text-yellow-300">
              ⚡ Limited Time Deals
            </p>

            <h2 className="text-4xl font-black md:text-5xl">
              Flash Sale
            </h2>

            <p className="mt-3 max-w-2xl text-gray-300">
              Grab discounted gaming products before the timer ends.
            </p>
          </div>

          <Link
            href="/flash-sales"
            className="inline-flex h-12 items-center justify-center rounded-full border border-yellow-400 px-6 font-black text-yellow-300 transition hover:bg-yellow-400 hover:text-black"
          >
            View All Deals
          </Link>
        </div>

        <div className="relative z-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {runningFlashSales.slice(0, 8).map((item) => {
            const product = item.products;
            const timeLeft = getTimeLeft(item.end_at);
            const originalPrice = Number(item.original_price || 0);
            const flashPrice = Number(item.flash_price || 0);
            const discountPercent =
              originalPrice > 0
                ? Math.round(((originalPrice - flashPrice) / originalPrice) * 100)
                : 0;

            const soldPercent =
              item.stock_limit && item.stock_limit > 0
                ? Math.min((item.sold_count / item.stock_limit) * 100, 100)
                : 0;

            return (
              <Link
                key={item.id}
                href={`/product/${item.product_id}`}
                className="group overflow-hidden rounded-3xl border border-white/10 bg-[#020617]/90 transition hover:-translate-y-1 hover:border-yellow-400"
              >
                <div className="relative flex h-44 items-center justify-center bg-black">
                  {product?.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title || item.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <span className="text-5xl">🎮</span>
                  )}

                  <span className="absolute left-3 top-3 rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">
                    -{discountPercent}%
                  </span>

                  <span className="absolute right-3 top-3 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-black">
                    FLASH
                  </span>
                </div>

                <div className="p-5">
                  <p className="text-xs font-black text-cyan-300">
                    {product?.category || "Marketplace"} /{" "}
                    {product?.game_name || "Game"}
                  </p>

                  <h3 className="mt-2 line-clamp-2 min-h-[56px] text-xl font-black group-hover:text-yellow-300">
                    {product?.title || item.title}
                  </h3>

                  <div className="mt-4">
                    <p className="text-sm font-bold text-gray-500 line-through">
                      {formatPrice(item.original_price)}
                    </p>

                    <p className="text-2xl font-black text-yellow-300">
                      {formatPrice(item.flash_price)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                      <p className="text-lg font-black text-white">
                        {timeLeft.days}
                      </p>
                      <p className="text-[10px] text-gray-500">D</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                      <p className="text-lg font-black text-white">
                        {pad(timeLeft.hours)}
                      </p>
                      <p className="text-[10px] text-gray-500">H</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                      <p className="text-lg font-black text-white">
                        {pad(timeLeft.minutes)}
                      </p>
                      <p className="text-[10px] text-gray-500">M</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                      <p className="text-lg font-black text-white">
                        {pad(timeLeft.seconds)}
                      </p>
                      <p className="text-[10px] text-gray-500">S</p>
                    </div>
                  </div>

                  {item.stock_limit && (
                    <div className="mt-4">
                      <div className="mb-2 flex justify-between text-xs text-gray-400">
                        <span>Sold</span>
                        <span>
                          {item.sold_count}/{item.stock_limit}
                        </span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-black/60">
                        <div
                          className="h-full rounded-full bg-yellow-400"
                          style={{ width: `${soldPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-5 rounded-2xl bg-yellow-400 py-3 text-center font-black text-black">
                    Buy Now
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}