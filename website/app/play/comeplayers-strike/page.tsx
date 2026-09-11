import type { Metadata } from "next";
import ComePlayersStrike from "@/components/strike/ComePlayersStrike";

export const metadata: Metadata = {
  title: "Play ComePlayers Strike Black Core 0.4",
  description:
    "Play ComePlayers Strike Black Core 0.4 with detailed terrain, Zombie Survival, Zombie Adventure, special infected, and boss combat directly in the browser.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ComePlayersStrikePlayPage() {
  return <ComePlayersStrike />;
}
