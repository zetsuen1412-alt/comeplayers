import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://comeplayers.com"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/games", "/search", "/product"],
      disallow: [
        "/admin/",
        "/api/",
        "/checkout/",
        "/payment/",
        "/seller/",
        "/my-orders/",
        "/order/",
        "/wallet/",
        "/messages/",
        "/comeplayers/",
        "/cpcommunity/",
        "/account/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
