import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Welcome to ComePlayers",
  description:
    "Choose Chat & Community, Marketplace, or download the ComePlayers apps.",
};

export default function HomePage() {
  return <HomeClient />;
}
