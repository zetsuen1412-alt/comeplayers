import type { Metadata } from "next";
import ComePlayersMatchPageClient from "./ComePlayersMatchPageClient";

export const metadata: Metadata = {
  title: "ComePlayers Match | Alexia's Crystal Quest",
  description:
    "Play the original ComePlayers match-3 puzzle game with Alexia, power crystals, boosters, combos, and level missions.",
  alternates: { canonical: "/games/comeplayers-match" },
};

export default function ComePlayersMatchPage() {
  return <ComePlayersMatchPageClient />;
}
