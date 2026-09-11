import type { Metadata } from "next";
import ComePlayersMarbleGame from "./ComePlayersMarbleGame";

export const metadata: Metadata = {
  title: "ComePlayers Marble World",
  description:
    "ComePlayers Marble with Alexia dice control, strategic AI, asset liquidation, quick and classic modes, evolving cities, landmarks, World Tour, takeovers, and special monopoly victories.",
};

export default async function ComePlayersMonopolyPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string | string[] }>;
}) {
  const { embed } = await searchParams;
  return <ComePlayersMarbleGame embedded={embed === "messages"} />;
}
