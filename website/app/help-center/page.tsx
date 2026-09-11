import type { Metadata } from "next";
import AlexiaHelpCenter from "@/components/help-center/AlexiaHelpCenter";

export const metadata: Metadata = {
  title: "Alexia Help Center",
  description: "Ask Alexia about ComePlayers features or contact an admin directly.",
};

export default function HelpCenterPage() {
  return <AlexiaHelpCenter />;
}
