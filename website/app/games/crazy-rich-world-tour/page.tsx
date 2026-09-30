import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Crazy Rich: World Tour",
  description: "Mainkan Crazy Rich: World Tour langsung di browser melalui ComePlayers.",
};

export default function CrazyRichWorldTourPage() {
  redirect("/crazy-rich-world-tour/PLAY-Crazy-Rich-World-Tour-Launcher.html");
}
