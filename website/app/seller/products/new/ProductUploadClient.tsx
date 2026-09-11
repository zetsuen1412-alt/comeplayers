"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { formatDeliveryEta, SELLER_SLA_OPTIONS } from "@/lib/sellerServiceLevel";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { marketplaceCategoryMatches } from "@/lib/marketplaceTaxonomy";
import { supabase } from "@/lib/supabase";
import { CURRENCY_OPTIONS, type SupportedCurrency } from "@/lib/localization";

type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  seller_status: string | null;
  seller_name: string | null;
  seller_delivery_sla_minutes?: number | null;
};

type Category = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
};

type GameMaster = {
  id: number;
  name: string;
  slug: string;
  first_letter: string | null;
  status: string | null;
  image_url: string | null;
  category_id?: number | null;
};

type ExistingProduct = {
  id: number;
  title: string | null;
  description: string | null;
  price: string | number | null;
  seller_price_currency?: SupportedCurrency | null;
  seller_price_amount?: string | number | null;
  stock: number | null;
  category: string | null;
  category_id: number | null;
  game_name: string | null;
  game_category_id: number | null;
  seller_id: string | null;
  image_url: string | null;
  slug: string | null;
  status: string | null;
  delivery_eta_minutes?: number | null;
  offer_region?: string | null;
  offer_platform?: string | null;
  offer_server?: string | null;
  offer_faction?: string | null;
  offer_tags?: string[] | null;
};



function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function mergeGames(currentGames: GameMaster[], incomingGames: GameMaster[]) {
  const byId = new Map<number, GameMaster>();

  for (const game of currentGames) {
    byId.set(game.id, game);
  }

  for (const game of incomingGames) {
    byId.set(game.id, game);
  }

  return Array.from(byId.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

async function fetchGameOptions({
  id,
  limit = 24,
  query,
  slug,
}: {
  id?: number | null;
  limit?: number;
  query?: string;
  slug?: string;
}) {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (id) params.set("id", String(id));
  if (slug) params.set("slug", slug);
  if (query) params.set("q", query);

  const response = await fetch(`/api/games/search?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Unable to load games.");
  }

  return (payload.games || []) as GameMaster[];
}



export default function ProductUploadClient() {
  const searchParams = useSearchParams();
  const params = useParams();

  const requestedGameSlug = searchParams.get("game") || "";
  const requestedCategoryValue = searchParams.get("category") || "";

  const rawEditingId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const editingId = rawEditingId ? Number(rawEditingId) : null;
  const isEditMode =
    Number.isFinite(editingId) &&
    Number(editingId) > 0;

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [existingProduct, setExistingProduct] = useState<ExistingProduct | null>(
    null
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [games, setGames] = useState<GameMaster[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<SupportedCurrency>("USD");
  const [stock, setStock] = useState("1");
  const [deliveryEtaMinutes, setDeliveryEtaMinutes] = useState("60");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [offerRegion, setOfferRegion] = useState("Global");
  const [offerPlatform, setOfferPlatform] = useState("Any");
  const [offerServer, setOfferServer] = useState("");
  const [offerFaction, setOfferFaction] = useState("");
  const [offerTags, setOfferTags] = useState("");

  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [gameQuery, setGameQuery] = useState("");
  const [gameSearchOpen, setGameSearchOpen] = useState(false);
  const [gameSearching, setGameSearching] = useState(false);
  const [gameSearchError, setGameSearchError] = useState("");

  const selectedCategory = categories.find(
    (category) => String(category.id) === selectedCategoryId
  );

  const selectedGame = games.find((game) => String(game.id) === selectedGameId);

  

  // GAME_COIN_TITLE_AUTO_PATCH_V2
  const isGameCoinCategoryV2 = useMemo(() => {
    const categoryText = `${selectedCategory?.name ?? ""} ${selectedCategory?.slug ?? ""}`
      .trim()
      .toLowerCase();

    return categoryText.includes("coin");
  }, [selectedCategory?.name, selectedCategory?.slug]);

  useEffect(() => {
    if (isGameCoinCategoryV2 && selectedGame?.name) {
      setTitle(`${selectedGame.name} Coins`);
    }
  }, [isGameCoinCategoryV2, selectedGame?.name]);
const productSlug = useMemo(() => {
    if (isEditMode && existingProduct?.slug) {
      return existingProduct.slug;
    }

    const baseSlug = createSlug(title);
    const gameSlug = selectedGame?.slug || "game";

    if (!baseSlug) return "";

    return `${gameSlug}-${baseSlug}`;
  }, [existingProduct?.slug, isEditMode, selectedGame, title]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    initializePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const trimmedQuery = gameQuery.trim();

    if (!trimmedQuery || trimmedQuery === selectedGame?.name) {
      setGameSearchError("");
      setGameSearching(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      setGameSearchError("");
      setGameSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setGameSearching(true);
        setGameSearchError("");

        const searchGames = await fetchGameOptions({
          query: trimmedQuery,
          limit: 30,
        });

        setGames((currentGames) => {
          const selectedOption = currentGames.find(
            (game) => String(game.id) === selectedGameId
          );

          return selectedOption
            ? mergeGames([selectedOption], searchGames)
            : searchGames;
        });
        setGameSearchOpen(true);
      } catch (error) {
        setGameSearchError(
          error instanceof Error ? error.message : "Unable to load games."
        );
      } finally {
        setGameSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [gameQuery, selectedGame?.name, selectedGameId]);

  async function initializePage() {
    try {
      setLoading(true);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        alert(sessionError.message);
        window.location.href = "/";
        return;
      }

      if (!sessionData.session?.user) {
        window.location.href = "/";
        return;
      }

      const currentUser = sessionData.session.user;
      setUser(currentUser);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) {
        alert(profileError.message);
        window.location.href = "/";
        return;
      }

      if (!profileData) {
        alert("Profile not found. Please login again.");
        window.location.href = "/";
        return;
      }

      if (profileData.seller_status !== "approved") {
        alert("Seller approval is required to manage products.");
        window.location.href = "/seller/apply";
        return;
      }

      setProfile(profileData);
      setDeliveryEtaMinutes(String(profileData.seller_delivery_sla_minutes || 60));

      const categoryResult = await supabase
        .from("categories")
        .select("id,name,slug,icon")
        .order("id", { ascending: true });

      if (categoryResult.error) {
        alert(categoryResult.error.message);
        setLoading(false);
        return;
      }

      const activeCategories = categoryResult.data || [];
      let activeGames = await fetchGameOptions(
        requestedGameSlug
          ? { slug: requestedGameSlug, limit: 1 }
          : { limit: 24 }
      );

      if (requestedGameSlug && activeGames.length === 0) {
        activeGames = await fetchGameOptions({ limit: 24 });
      }

      setCategories(activeCategories);
      setGames(activeGames);

      if (isEditMode && editingId) {
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("*")
          .eq("id", editingId)
          .maybeSingle();

        if (productError) {
          alert(productError.message);
          window.location.href = "/seller/products";
          return;
        }

        if (!productData) {
          alert("Product not found.");
          window.location.href = "/seller/products";
          return;
        }

        if (productData.seller_id !== profileData.id) {
          alert("You can only edit your own products.");
          window.location.href = "/seller/products";
          return;
        }

        const product = productData as ExistingProduct;

        setExistingProduct(product);
        setTitle(product.title || "");
        setPrice(String(product.seller_price_amount ?? product.price ?? ""));
        setPriceCurrency(product.seller_price_currency || "USD");
        setStock(String(product.stock ?? 0));
        setDescription(product.description || "");
        setImageUrl(product.image_url || "");
        setDeliveryEtaMinutes(
          String(
            product.delivery_eta_minutes ||
              profileData.seller_delivery_sla_minutes ||
              60
          )
        );
        setOfferRegion(product.offer_region || "Global");
        setOfferPlatform(product.offer_platform || "Any");
        setOfferServer(product.offer_server || "");
        setOfferFaction(product.offer_faction || "");
        setOfferTags((product.offer_tags || []).join(", "));

        if (product.category_id) {
          setSelectedCategoryId(String(product.category_id));
        } else if (activeCategories.length > 0) {
          const matchedCategory = activeCategories.find(
            (category) =>
              category.name.toLowerCase() ===
              String(product.category || "").toLowerCase()
          );

          setSelectedCategoryId(
            String((matchedCategory || activeCategories[0]).id)
          );
        }

        if (product.game_category_id) {
          const productGames = await fetchGameOptions({
            id: Number(product.game_category_id),
            limit: 1,
          });

          const nextGames = mergeGames(activeGames, productGames);
          setGames(nextGames);
          setSelectedGameId(String(product.game_category_id));
          setGameQuery(productGames[0]?.name || product.game_name || "");
        } else if (activeGames.length > 0) {
          const matchedGame = activeGames.find(
            (game) =>
              game.name.toLowerCase() ===
              String(product.game_name || "").toLowerCase()
          );

          const nextGame = matchedGame || activeGames[0];
          setSelectedGameId(String(nextGame.id));
          setGameQuery(nextGame.name);
        }

        setLoading(false);
        return;
      }

      if (activeCategories.length > 0) {
        const normalizedRequest = requestedCategoryValue.toLowerCase();
        const requestedCategory = activeCategories.find((category) => {
          return (
            category.slug.toLowerCase() === normalizedRequest ||
            category.name.toLowerCase() === normalizedRequest ||
            marketplaceCategoryMatches(category.name, normalizedRequest)
          );
        });

        setSelectedCategoryId(String((requestedCategory || activeCategories[0]).id));
      }

      if (activeGames.length > 0) {
        const requestedGame = activeGames.find(
          (game) => game.slug.toLowerCase() === requestedGameSlug.toLowerCase()
        );

        const nextGame = requestedGame || activeGames[0];
        setSelectedGameId(String(nextGame.id));
        setGameQuery(nextGame.name);
      }

      setLoading(false);
    } catch (error) {
      console.error("Product upload page error:", error);
      alert("Failed to load product page.");
      setLoading(false);
    }
  }

  function selectGame(game: GameMaster) {
    setGames((currentGames) => mergeGames(currentGames, [game]));
    setSelectedGameId(String(game.id));
    setGameQuery(game.name);
    setGameSearchOpen(false);
    setGameSearchError("");
  }


  async function submitProduct(event: React.FormEvent) {
    event.preventDefault();

    if (!user || !profile) {
      alert("Seller profile not found.");
      return;
    }

    if (!title.trim()) {
      alert("Product title is required.");
      return;
    }

    if (!price.trim()) {
      alert("Product price is required.");
      return;
    }

    if (!description.trim()) {
      alert("Product description is required.");
      return;
    }

    if (!selectedCategory) {
      alert("Please select a category.");
      return;
    }

    if (!selectedGame) {
      alert("Please select a game.");
      return;
    }

    const parsedStock = Number(stock);

    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      alert("Stock cannot be negative.");
      return;
    }

    if (!isEditMode && parsedStock < 1) {
      alert("Stock must be at least 1.");
      return;
    }

    const parsedPrice = Number(price);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      alert("Price must be greater than 0.");
      return;
    }

    const parsedDeliveryEta = Math.round(Number(deliveryEtaMinutes));

    if (
      !Number.isFinite(parsedDeliveryEta) ||
      parsedDeliveryEta < 15 ||
      parsedDeliveryEta > 10080
    ) {
      alert("Delivery ETA must be between 15 minutes and 7 days.");
      return;
    }

    setSubmitting(true);

    const payload = {
      title: title.trim(),
      description: description.trim(),
      price: parsedPrice,
      priceCurrency,
      stock: parsedStock,
      deliveryEtaMinutes: parsedDeliveryEta,
      category: selectedCategory.name,
      categoryId: selectedCategory.id,
      gameName: selectedGame.name,
      gameId: selectedGame.id,
      imageUrl: imageUrl.trim() || selectedGame.image_url || "",
      offerRegion: offerRegion.trim() || "Global",
      offerPlatform: offerPlatform.trim() || "Any",
      offerServer: offerServer.trim(),
      offerFaction: offerFaction.trim(),
      offerTags: offerTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      slug: productSlug || createSlug(title),
    };

    try {
      if (isEditMode && editingId) {
        await authenticatedFetchJson<{ product: { id: number } }>(
          "/api/seller/catalog",
          {
            method: "PATCH",
            body: JSON.stringify({ productId: editingId, ...payload }),
          }
        );

        alert("Product updated successfully.");
        window.location.href = "/seller/products";
        return;
      }

      await authenticatedFetchJson<{ product: { id: number } }>(
        "/api/seller/catalog",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      alert("Product created successfully.");
      window.location.href = "/seller/products";
    } catch (submitError) {
      alert(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save product."
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,196,0,0.08),transparent_28%),linear-gradient(180deg,#04070d_0%,#020617_100%)] text-white">
        <p className="text-xl font-black text-[#ffd54a]">
          {isEditMode ? "Loading product editor..." : "Loading product creator..."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,196,0,0.06),transparent_24%),linear-gradient(180deg,#04070d_0%,#020617_45%,#03060b_100%)] text-white">
      <section className="relative overflow-hidden border-b border-[#ffc400]/15 px-5 py-12 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,196,0,.15),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,.14),transparent_36%),linear-gradient(90deg,rgba(6,10,16,0.95),rgba(4,10,25,0.88))]" />

        <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col justify-between gap-8 lg:flex-row lg:items-start">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-[#14d8ff]/30 bg-[linear-gradient(90deg,rgba(20,216,255,0.16),rgba(255,196,0,0.12))] px-4 py-2 text-sm font-black text-[#62e7ff] shadow-[0_0_24px_rgba(20,216,255,0.08)]">
              {isEditMode ? "ComePlayers Product Editor" : "ComePlayers Seller Studio"}
            </p>

            <h1 className="max-w-5xl text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl md:text-6xl xl:text-7xl">
              {isEditMode ? "Edit Product Listing" : "Create Product Listing"}
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
              {isEditMode
                ? "Refine your offer details, stock, price, and marketplace placement with ComePlayers premium seller tools."
                : "Create a premium ComePlayers listing by choosing the right category, matching game, and buyer-friendly offer details."}
            </p>
          </div>

          <Link
            href="/seller/products"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-[#14d8ff]/60 bg-[#081523]/80 px-6 font-bold text-[#62e7ff] shadow-[0_0_20px_rgba(20,216,255,0.08)] transition hover:border-[#ffc400] hover:bg-[#ffc400] hover:text-black"
          >
            Back to Products
          </Link>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:px-10">
        <form
          onSubmit={submitProduct}
          className="order-2 rounded-[24px] border border-[#ffc400]/12 bg-[linear-gradient(180deg,rgba(8,12,18,0.96),rgba(4,7,12,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-sm sm:rounded-[28px] sm:p-6 lg:order-1 lg:p-7"
        >
          <div className="mb-6 flex flex-col gap-2 sm:mb-7">
            <h2 className="text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">Product Information</h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              Build a trusted listing with clear details, accurate pricing, and buyer-friendly delivery information.
            </p>
          </div>

          {isEditMode ? (
            <div className="mt-5 rounded-2xl border border-[#14d8ff]/20 bg-[linear-gradient(180deg,rgba(20,216,255,0.09),rgba(255,196,0,0.05))] p-5">
              <h3 className="font-black text-[#62e7ff]">Wishlist Alerts Active</h3>
              <p className="mt-2 text-sm text-gray-300">
                If you lower the price or restock this product, buyers who saved it
                to their wishlist will receive a notification automatically.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Category
              </label>

              <select
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 text-white outline-none focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon ? `${category.icon} ` : ""}
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Game
              </label>

              <div className="relative">
                <input
                  value={gameQuery}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setGameQuery(nextQuery);
                    setGameSearchOpen(true);

                    if (selectedGame && nextQuery !== selectedGame.name) {
                      setSelectedGameId("");
                    }
                  }}
                  onFocus={() => setGameSearchOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setGameSearchOpen(false), 120);
                  }}
                  placeholder="Search game..."
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 text-white outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
                />

                {gameSearchOpen ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-auto rounded-2xl border border-[#ffc400]/15 bg-[#06090d] shadow-2xl shadow-black/60">
                    {gameSearching ? (
                      <div className="px-5 py-4 text-sm font-bold text-gray-400">
                        Loading games...
                      </div>
                    ) : null}

                    {!gameSearching && gameSearchError ? (
                      <div className="px-5 py-4 text-sm font-bold text-red-300">
                        {gameSearchError}
                      </div>
                    ) : null}

                    {!gameSearching && !gameSearchError && games.length === 0 ? (
                      <div className="px-5 py-4 text-sm font-bold text-gray-400">
                        No active games found
                      </div>
                    ) : null}

                    {!gameSearchError
                      ? games.slice(0, 30).map((game) => (
                          <button
                            key={game.id}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectGame(game)}
                            className={`block w-full px-5 py-3 text-left text-sm font-bold transition hover:bg-[#ffc400] hover:text-black ${
                              String(game.id) === selectedGameId
                                ? "bg-[#ffc400] text-black"
                                : "text-white"
                            }`}
                          >
                            {game.name}
                          </button>
                        ))
                      : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:gap-5 md:grid-cols-2">
            {/* GAME_COIN_TITLE_FIELD_PATCH_V2 */}
            {!isGameCoinCategoryV2 ? (
              <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Product Title
              </label>

              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: 1000 Gold / Premium Account / Top Up"
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 text-white outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
              />
            </div>
            ) : null}

            <div
              /* GAME_COIN_PRICE_WIDTH_PATCH_V2 */
              className={isGameCoinCategoryV2 ? "md:col-span-2" : ""}
            >
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Price
              </label>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="Enter amount"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
                />
                <select
                  value={priceCurrency}
                  onChange={(event) => setPriceCurrency(event.target.value as SupportedCurrency)}
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 outline-none focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.currency} value={option.currency}>
                      {option.label} ({option.currency})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Stock
              </label>

              <input
                type="number"
                min="0"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 text-white outline-none focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-gray-300">
                Delivery ETA
              </label>

              <select
                value={deliveryEtaMinutes}
                onChange={(event) => setDeliveryEtaMinutes(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 text-white outline-none focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
              >
                {SELLER_SLA_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDeliveryEta(minutes)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                This product-specific promise overrides your seller default for new paid orders.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#14d8ff]/20 bg-[linear-gradient(180deg,rgba(8,31,48,0.62),rgba(255,196,0,0.04))] p-4 shadow-[0_0_0_1px_rgba(20,216,255,0.04)] sm:p-5">
            <div>
              <h3 className="text-lg font-black text-cyan-200 sm:text-xl">ComePlayers Offer Details</h3>
              <p className="mt-1 text-sm text-gray-400">
                These details help buyers discover the right ComePlayers offer faster and improve trust in your listing.
              </p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-300">Region</label>
                <input
                  value={offerRegion}
                  onChange={(event) => setOfferRegion(event.target.value)}
                  placeholder="Global, Asia, Europe, Indonesia"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-300">Platform</label>
                <input
                  value={offerPlatform}
                  onChange={(event) => setOfferPlatform(event.target.value)}
                  placeholder="PC, PlayStation, Xbox, Mobile"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-gray-300">Server / Realm</label>
                <input
                  value={offerServer}
                  onChange={(event) => setOfferServer(event.target.value)}
                  placeholder="Optional, e.g. SEA-1"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
                />
              </div>

              
            </div>

            
          </div>

          

          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="block text-sm font-bold text-gray-300">
                Description
              </label>
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Clear & professional
              </span>
            </div>

            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe product details, delivery process, requirements, and important notes."
              rows={8}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4 text-white outline-none placeholder:text-gray-500 focus:border-[#ffc400] focus:shadow-[0_0_0_1px_rgba(255,196,0,0.28)]"
            />
          </div>

          <div className="mt-6 rounded-2xl border border-[#ffc400]/22 bg-[linear-gradient(180deg,rgba(255,196,0,0.11),rgba(255,196,0,0.05))] p-4 shadow-[0_18px_36px_rgba(255,196,0,0.05)] sm:p-5">
            <h3 className="font-black text-[#ffd54a]">ComePlayers Listing Notice</h3>

            <p className="mt-3 text-sm text-gray-300">
              This product will be listed under{" "}
              <span className="font-black text-cyan-300">
                {selectedCategory?.name || "Category"}
              </span>{" "}
              and{" "}
              <span className="font-black text-cyan-300">
                {selectedGame?.name || "Game"}
              </span>
              .
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !selectedGame}
            className="mt-6 w-full rounded-2xl border border-[#ffd54a] bg-[linear-gradient(180deg,#ffd54a_0%,#ffc400_100%)] px-5 py-4 text-base font-black text-black shadow-[0_16px_38px_rgba(255,196,0,0.18)] transition hover:brightness-105 hover:shadow-[0_18px_42px_rgba(255,196,0,0.24)] disabled:cursor-not-allowed disabled:opacity-60 sm:mt-8 sm:text-lg"
          >
            {submitting
              ? isEditMode
                ? "Saving Product..."
                : "Creating Product..."
              : isEditMode
              ? "Save Product"
              : "Create Product"}
          </button>
        </form>

        <aside className="order-1 h-fit rounded-[24px] border border-[#14d8ff]/12 bg-[linear-gradient(180deg,rgba(7,11,18,0.98),rgba(5,8,14,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.4)] sm:rounded-[28px] sm:p-6 lg:order-2 lg:sticky lg:top-24 lg:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">Live Preview</h2>
            <span className="rounded-full border border-[#14d8ff]/25 bg-[#14d8ff]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#62e7ff]">
              Mobile ready
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[#ffc400]/12 bg-black/30 shadow-[0_16px_36px_rgba(0,0,0,0.32)]">
            <div className="flex h-48 items-center justify-center bg-black sm:h-56">
              {imageUrl || selectedGame?.image_url ? (
                <img
                  src={imageUrl || selectedGame?.image_url || ""}
                  alt={title || "Product preview"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <p className="text-6xl">🎮</p>
              )}
            </div>

            <div className="p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#62e7ff]">
                {selectedCategory?.name || "Category"} /{" "}
                {selectedGame?.name || "Game"}
              </p>

              <h3 className="mt-2 text-xl font-black leading-tight sm:text-2xl">
                {title || "Product Title"}
              </h3>

              <p className="mt-2 text-sm text-gray-400">
                Seller:{" "}
                {profile?.seller_name ||
                  profile?.username ||
                  user?.email ||
                  "Seller"}
              </p>

              <p className="mt-4 text-2xl font-black text-[#ffd54a] sm:mt-5 sm:text-3xl">
                Rp {Number(price || 0).toLocaleString("id-ID")}
              </p>

              <p className="mt-2 text-sm text-gray-400">
                Stock: {stock || "0"} · Delivery: {formatDeliveryEta(deliveryEtaMinutes)}
              </p>

              <p className="mt-4 line-clamp-4 text-sm text-gray-300">
                {description ||
                  "Product description will appear here as a preview."}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[#14d8ff]/20 bg-[linear-gradient(180deg,rgba(20,216,255,0.1),rgba(20,216,255,0.04))] p-4 sm:p-5">
            <h3 className="font-black text-cyan-300">SEO Slug Preview</h3>

            <p className="mt-2 break-words text-sm text-gray-300">
              {productSlug || "product-slug-preview"}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-[#ffc400]/12 bg-[linear-gradient(180deg,rgba(14,18,24,0.82),rgba(6,9,14,0.92))] p-4 sm:p-5">
            <h3 className="font-black text-white">Marketplace Path</h3>

            <p className="mt-2 break-words text-sm text-gray-400">
              /games/{selectedGame?.slug || "game"}/offers?category={encodeURIComponent(
                selectedCategory?.name || "category",
              )}
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
