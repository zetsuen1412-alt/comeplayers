import type { Metadata } from "next";
import EmpiresAlliesLauncher from "./EmpiresAlliesLauncher";

export const metadata: Metadata = {
  title: "Main Empires & Allies | ComePlayers",
  description:
    "Mainkan Empires & Allies melalui sesi aman ComePlayers tanpa membebani chat dan komunitas.",
  alternates: { canonical: "/play/empires-allies" },
  robots: { index: false, follow: false },
};

export default function EmpiresAlliesPage() {
  return <EmpiresAlliesLauncher />;
}
