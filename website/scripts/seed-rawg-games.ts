throw new Error(
  [
    "RAWG seeding has been retired.",
    "ComePlayers now serves games from the local game_master catalog.",
    "Use /admin/games for manual catalog entries or scripts/seed-igdb-games.ts for reviewed provider staging.",
  ].join(" ")
);
