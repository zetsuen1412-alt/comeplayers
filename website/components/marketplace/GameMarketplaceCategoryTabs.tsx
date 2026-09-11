"use client";

import Link from "next/link";
import { FaBoxOpen, FaCoins, FaUserAstronaut, FaUserNinja } from "react-icons/fa";
import type { IconType } from "react-icons";
import { useCurrency } from "@/components/CurrencyProvider";
import type { TranslationKey } from "@/lib/localization";
import {
  MARKETPLACE_CATEGORY_DEFINITIONS,
  type MarketplaceCategoryCode,
} from "@/lib/marketplaceTaxonomy";

type Props = {
  gameSlug: string;
  activeCategory: MarketplaceCategoryCode;
  counts: Record<MarketplaceCategoryCode, number>;
};

const ICONS: Record<MarketplaceCategoryCode, IconType> = {
  coin: FaCoins,
  boosting: FaUserNinja,
  item: FaBoxOpen,
  account: FaUserAstronaut,
};

const CATEGORY_KEYS: Record<MarketplaceCategoryCode, TranslationKey> = {
  coin: "offers.category.coin",
  boosting: "offers.category.boosting",
  item: "offers.category.item",
  account: "offers.category.account",
};

function hrefFor(gameSlug: string, code: MarketplaceCategoryCode) {
  if (code === "coin") return `/games/${encodeURIComponent(gameSlug)}?category=coin`;
  return `/games/${encodeURIComponent(gameSlug)}/offers?category=${code}`;
}

export default function GameMarketplaceCategoryTabs({
  gameSlug,
  activeCategory,
  counts,
}: Props) {
  const { locale, t } = useCurrency();

  return (
    <nav
      aria-label={t("offers.categoryTabsAria")}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {MARKETPLACE_CATEGORY_DEFINITIONS.map((definition) => {
        const Icon = ICONS[definition.code];
        const active = definition.code === activeCategory;
        const count = counts[definition.code] || 0;
        const label = t(CATEGORY_KEYS[definition.code]);
        const formattedCount = new Intl.NumberFormat(locale).format(count);

        return (
          <Link
            key={definition.code}
            href={hrefFor(gameSlug, definition.code)}
            aria-current={active ? "page" : undefined}
            aria-label={t("offers.categoryTabAria", {
              category: label,
              count: formattedCount,
            })}
            className={`flex h-[78px] min-w-0 items-center justify-center gap-4 rounded-md border px-5 text-center transition-colors ${
              active
                ? "border-yellow-400 bg-yellow-400/[0.08] text-yellow-300"
                : "border-white/15 bg-[#0b0d11] text-slate-200 hover:border-yellow-400/70 hover:text-yellow-200"
            }`}
          >
            <Icon aria-hidden="true" className={`text-xl ${active ? "text-yellow-300" : "text-slate-400"}`} />
            <span className="truncate text-base font-bold md:text-lg">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
