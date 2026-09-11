"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

type RecentlyViewedGameTrackerProps = {
  gameId?: number | null;
  gameSlug: string;
  gameName: string;
  imageUrl?: string | null;
};

export default function RecentlyViewedGameTracker({
  gameId,
  gameSlug,
  gameName,
  imageUrl,
}: RecentlyViewedGameTrackerProps) {
  useEffect(() => {
    if (!gameSlug || !gameName) return;

    let cancelled = false;

    async function trackRecentlyViewedGame() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user || cancelled) return;

      const { error } = await supabase.from("recently_viewed_games").upsert(
        {
          user_id: user.id,
          game_id: gameId || null,
          game_slug: gameSlug,
          game_name: gameName,
          image_url: imageUrl || null,
          viewed_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,game_slug",
        }
      );

      if (error) {
        console.warn("Recently viewed game tracking failed:", error.message);
      }
    }

    trackRecentlyViewedGame();

    return () => {
      cancelled = true;
    };
  }, [gameId, gameSlug, gameName, imageUrl]);

  return null;
}
