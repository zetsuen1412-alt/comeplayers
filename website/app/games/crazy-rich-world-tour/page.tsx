import type { Metadata } from "next";
import Script from "next/script";

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
    <main style={{ margin: 0, width: "100%", height: "100dvh", overflow: "hidden", background: "#071525" }}>
      <Script src="/crazy-rich-world-tour/install.js" strategy="afterInteractive" />
      <iframe
        title="Crazy Rich: World Tour"
        src="/games/crazy-rich-world-tour/client/PLAY-Crazy-Rich-World-Tour-Launcher.html"
        allow="autoplay; fullscreen; gamepad"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
