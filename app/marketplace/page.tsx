import type { Metadata } from "next";
import HomeClient from "../HomeClient";

export const metadata: Metadata = {
  title: "Gaming Marketplace",
  description:
    "Buy and sell game accounts, items, coins, top-ups, gift cards, software, and gaming services securely on ComePlayers.",
  alternates: { canonical: "/marketplace" },
};

export default function MarketplaceHomePage() {
  return <HomeClient />;
}
