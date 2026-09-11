import type { Metadata } from "next";
import MarketplaceClient from "./MarketplaceClient";

export const metadata: Metadata = {
  title: "Alexia Marketplace | ComePlayers",
  description:
    "Explore game accounts, top-ups, gift cards, coins, boosting, software, and trusted gaming services in the Alexia-themed ComePlayers marketplace.",
};

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
