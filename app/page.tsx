import type { Metadata } from "next";
import PortalHome from "./PortalHome";

export const metadata: Metadata = {
  title: "ComePlayers | Play, Connect, Trade",
  description:
    "Choose your ComePlayers experience: connect through Chat & Messages, explore the gaming marketplace, or download the desktop and Android apps.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <PortalHome />;
}
