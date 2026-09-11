"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

type RecentlyViewedTrackerProps = {
  productId: number;
};

export default function RecentlyViewedTracker({
  productId,
}: RecentlyViewedTrackerProps) {
  useEffect(() => {
    if (!productId) return;

    let cancelled = false;

    async function trackRecentlyViewed() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user || cancelled) return;

      const { error } = await supabase.from("recently_viewed").upsert(
        {
          user_id: user.id,
          product_id: productId,
          viewed_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,product_id",
        }
      );

      if (error) {
        console.warn("Recently viewed tracking failed:", error.message);
      }
    }

    trackRecentlyViewed();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  return null;
}
