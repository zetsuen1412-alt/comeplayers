import type { Metadata } from "next";
import Script from "next/script";
import CrazyRichGameShell from "./CrazyRichGameShell";

export const metadata: Metadata = {
  title: "Crazy Rich: World Tour",
  description: "Mainkan Crazy Rich: World Tour di Web, Android, dan PC dengan satu akun ComePlayers.",
  manifest: "/crazy-rich-world-tour/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Crazy Rich",
    statusBarStyle: "black-translucent",
  },
};

export default function CrazyRichWorldTourPage() {
  return (
    <>
      <Script src="/crazy-rich-world-tour/install.js" strategy="afterInteractive" />
      <CrazyRichGameShell />
    </>
  );
}
