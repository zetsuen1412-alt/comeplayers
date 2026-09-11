import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Welcome to ComePlayers",
  description:
    "Choose Chat & Community or Marketplace in the ComePlayers Dual World Portal.",
};

export default function HomePage() {
  return <HomeClient />;
}
