import type { Metadata } from "next";
import { Suspense } from "react";
import BrowseGamesClient from "./BrowseGamesClient";

export const metadata: Metadata = {
  title: "Browse Games | ComePlayers Marketplace",
  description:
    "Browse game accounts, coins, items, boosting, top up, and gift cards in one ComePlayers marketplace catalog.",
  alternates: { canonical: "/games" },
  openGraph: {
    title: "Browse Games | ComePlayers Marketplace",
    description:
      "Find games and marketplace offers across accounts, coins, items, boosting, top up, and gift cards.",
    url: "/games",
    siteName: "ComePlayers",
    type: "website",
  },
};

export default function BrowseGamesPage() {
  return (
    <Suspense fallback={null}>
      <BrowseGamesClient />
    </Suspense>
  );
}
