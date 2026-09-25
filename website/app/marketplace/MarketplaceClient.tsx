"use client";
import { useLiveQuery } from '@/lib/live/use-live-query';

import { useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FaArrowRight,
  FaBolt,
  FaCheckCircle,
  FaCoins,
  FaCode,
  FaGift,
  FaHeadset,
  FaRocket,
  FaShieldAlt,
  FaTags,
  FaUserCircle,
  FaUsers,
} from "react-icons/fa";
import { supabase } from "@/lib/supabase";
import RecentlyViewed from "@/components/marketplace/RecentlyViewed";
import RecentlyViewedGames from "@/components/marketplace/RecentlyViewedGames";
import InterestRecommendations from "@/components/marketplace/InterestRecommendations";
import RecommendedGames from "@/components/marketplace/RecommendedGames";
import FollowedSellerFeed from "@/components/marketplace/FollowedSellerFeed";
import styles from "./marketplace.module.css";

type Category = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
};

const categoryMeta: Array<{
  terms: string[];
  icon: ReactNode;
  description: string;
  accent: string;
}> = [
  {
    terms: ["account", "accounts", "akun"],
    icon: <FaUserCircle />,
    description: "Premium accounts ready to play",
    accent: "gold",
  },
  {
    terms: ["top-up", "topup", "diamond", "voucher"],
    icon: <FaBolt />,
    description: "Instant top-ups and vouchers",
    accent: "silver",
  },
  {
    terms: ["gift", "card"],
    icon: <FaGift />,
    description: "Global gift cards and codes",
    accent: "gold",
  },
  {
    terms: ["coin", "gold", "currency"],
    icon: <FaCoins />,
    description: "In-game currency and coins",
    accent: "silver",
  },
  {
    terms: ["boost", "boosting", "rank"],
    icon: <FaRocket />,
    description: "Rank up faster with trusted pros",
    accent: "gold",
  },
  {
    terms: ["software", "tool", "key"],
    icon: <FaCode />,
    description: "Tools, keys, and digital software",
    accent: "silver",
  },
];

function resolveCategoryMeta(category: Category, index: number) {
  const key = `${category.name} ${category.slug}`.toLowerCase();
  const matched = categoryMeta.find((item) =>
    item.terms.some((term) => key.includes(term))
  );

  return (
    matched ||
    categoryMeta[index % categoryMeta.length] || {
      icon: <FaTags />,
      description: "Explore trusted gaming products",
      accent: "gold",
    }
  );
}

export default function MarketplaceClient() {
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const search = searchParams.get("q") || "";

  useLiveQuery(() => {
    let cancelled = false;

    async function initializePage() {
      setLoadingCategories(true);

      const { data: categoryData, error } = await supabase
        .from("categories")
        .select("id,name,slug,icon")
        .order("id", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn("Failed to load marketplace categories:", error.message);
        setCategories([]);
      } else {
        setCategories((categoryData || []) as Category[]);
      }

      setLoadingCategories(false);
    }

    initializePage();

    return () => {
      cancelled = true;
    };
  }, [], { topics: 'catalog' });

  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return categories;

    return categories.filter((category) =>
      `${category.name} ${category.slug}`.toLowerCase().includes(normalizedSearch)
    );
  }, [categories, search]);

  const featuredCategories = filteredCategories.slice(0, 6);

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="marketplace-heading">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroGlowOne} aria-hidden="true" />
        <div className={styles.heroGlowTwo} aria-hidden="true" />
        <div className={styles.heroTopRail} aria-hidden="true" />

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <FaShieldAlt />
              Alexia-powered marketplace for gamers
            </div>

            <h1 id="marketplace-heading" className={styles.heroTitle}>
              <span className={styles.heroLineSilver}>All your</span>
              <span className={styles.heroLineGold}>gaming needs</span>
              <span className={styles.heroLineSilver}>in one secure</span>
              <span className={styles.heroLineGold}>marketplace</span>
            </h1>

            <div className={styles.heroTrustRow}>
              <span>
                <FaBolt /> Fast
              </span>
              <span>
                <FaShieldAlt /> Safe
              </span>
              <span>
                <FaCheckCircle /> Trusted
              </span>
            </div>

            <p className={styles.heroDescription}>
              Buy and sell game accounts, top-ups, gift cards, coins, boosting,
              skins, software, and digital items with trusted transaction
              protection.
            </p>

          </div>

          <div className={styles.alexiaStage} aria-hidden="true" />
        </div>

        <div className={styles.statBar}>
          <div>
            <span className={styles.statIcon}>
              <FaShieldAlt />
            </span>
            <span>
              <strong>Secure transactions</strong>
              Advanced protection for every trade
            </span>
          </div>
          <div>
            <span className={styles.statIcon}>
              <FaBolt />
            </span>
            <span>
              <strong>Instant delivery</strong>
              Digital products delivered quickly
            </span>
          </div>
          <div>
            <span className={styles.statIcon}>
              <FaUsers />
            </span>
            <span>
              <strong>Trusted community</strong>
              Verified sellers and real gamers
            </span>
          </div>
          <div>
            <span className={styles.statIcon}>
              <FaHeadset />
            </span>
            <span>
              <strong>24/7 support</strong>
              Help whenever you need it
            </span>
          </div>
        </div>
      </section>

      <section className={styles.categoryPanel} aria-label="Popular categories">
        <div className={styles.categoryPanelHeading}>
          <div>
            <span>Explore with Alexia</span>
            <i aria-hidden="true" />
          </div>
          <Link href="/games">
            View all categories <FaArrowRight />
          </Link>
        </div>

        <div className={styles.categoryStrip}>
          {loadingCategories
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className={styles.categorySkeleton} />
              ))
            : featuredCategories.map((category, index) => {
                const meta = resolveCategoryMeta(category, index);
                return (
                  <Link
                    key={category.id}
                    href={`/games?category=${encodeURIComponent(category.slug)}`}
                    className={`${styles.quickCategory} ${styles[`accent_${meta.accent}`]}`}
                  >
                    <span className={styles.quickCategoryIcon}>
                      {category.icon || meta.icon}
                    </span>
                    <span>
                      <strong>{category.name}</strong>
                      <small>{meta.description}</small>
                    </span>
                    <FaArrowRight className={styles.quickCategoryArrow} />
                  </Link>
                );
              })}
        </div>
      </section>

      <section className={styles.promiseStrip}>
        <div>
          <strong>500+</strong>
          <span>Active products</span>
        </div>
        <div>
          <strong>100+</strong>
          <span>Trusted sellers</span>
        </div>
        <div>
          <strong>99.9%</strong>
          <span>Protected transactions</span>
        </div>
        <div>
          <strong>24/7</strong>
          <span>Customer support</span>
        </div>
      </section>

      <div className={styles.personalizedSections}>
        <RecommendedGames />
        <InterestRecommendations />
        <RecentlyViewed />
        <RecentlyViewedGames />
        <FollowedSellerFeed />
      </div>

      <section className={styles.alexiaPromo}>
        <div className={styles.promoCharacter} aria-hidden="true">
          <Image
            src="/marketplace-alexia/alexia-hero.png"
            alt=""
            width={1122}
            height={1402}
          />
        </div>

        <div className={styles.promoCopy}>
          <span>Alexia&apos;s golden picks</span>
          <h2>Premium gaming deals selected by Alexia.</h2>
          <p>
            Explore selected accounts, top-ups, boosting, and digital products from
            trusted ComePlayers sellers.
          </p>
        </div>

        <div className={styles.promoDiscount}>
          <small>Selected offers</small>
          <strong>Up to 35% off</strong>
        </div>

      </section>

    </main>
  );
}
