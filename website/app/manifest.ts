import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ComePlayers",
    short_name: "ComePlayers",
    description:
      "ComePlayers gaming marketplace, community, tournaments, and secure player chat.",
    start_url: "/?source=ios-pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#020617",
    theme_color: "#020617",
    lang: "en",
    categories: ["games", "shopping", "social"],
    icons: [
      {
        src: "/icon.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
