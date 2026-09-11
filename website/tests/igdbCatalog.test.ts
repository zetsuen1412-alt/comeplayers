import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNewGameInsert,
  buildProviderUpdate,
  findBestIgdbMatch,
  igdbImageUrl,
  mapIgdbGame,
  normalizeGameName,
} from "../lib/igdb/catalog";
import type { GameMasterProviderRow, IgdbGame } from "../lib/igdb/types";

const igdbGame: IgdbGame = {
  id: 1942,
  name: "The Witcher 3: Wild Hunt",
  slug: "the-witcher-3-wild-hunt",
  summary: "A story-driven open world role-playing game.",
  first_release_date: 1431993600,
  updated_at: 1710000000,
  checksum: "checksum-1942",
  total_rating: 92.45,
  total_rating_count: 5000,
  cover: { image_id: "co1wyy" },
  artworks: [{ image_id: "ar12" }],
  genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
  platforms: [
    { id: 6, name: "PC (Microsoft Windows)", slug: "win", abbreviation: "PC" },
  ],
  involved_companies: [
    {
      developer: true,
      company: { id: 908, name: "CD PROJEKT RED" },
    },
  ],
};

test("IGDB image URLs use the image id and requested size", () => {
  assert.equal(
    igdbImageUrl({ image_id: "co1wyy" }, "cover_big"),
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg"
  );
  assert.equal(igdbImageUrl(null), null);
});

test("IGDB payload maps into ComePlayers candidate fields", () => {
  const candidate = mapIgdbGame(igdbGame);
  assert.equal(candidate.igdbId, 1942);
  assert.equal(candidate.slug, "the-witcher-3-wild-hunt");
  assert.equal(candidate.releaseDate, "2015-05-19");
  assert.equal(candidate.providerRating, 92.45);
  assert.equal(candidate.rating, 92.45 / 20);
  assert.equal(candidate.platforms[0]?.abbreviation, "PC");
  assert.equal(candidate.developers[0]?.name, "CD PROJEKT RED");
  assert.match(candidate.coverUrl || "", /co1wyy\.jpg$/);
});

test("matching prefers an exact normalized name and release context", () => {
  const candidate = mapIgdbGame(igdbGame);
  const existing: GameMasterProviderRow[] = [
    {
      id: 10,
      name: "The Witcher 3 Wild Hunt",
      slug: "witcher-3",
      normalized_name: "the witcher 3 wild hunt",
      released: "2015-05-18",
      platforms: [{ name: "PC" }],
    },
  ];

  const match = findBestIgdbMatch(candidate, existing);
  assert.equal(match.gameId, 10);
  assert.ok(match.score >= 77);
});

test("provider sync never overwrites an explicit local override", () => {
  const candidate = mapIgdbGame(igdbGame);
  const existing: GameMasterProviderRow = {
    id: 10,
    name: "Witcher 3 Indonesia",
    slug: "witcher-3-id",
    normalized_name: "witcher 3 indonesia",
    description: "Custom marketplace description",
    image_url: null,
    cover_image_url: null,
    background_image: null,
    released: null,
    rating: null,
    genres: null,
    platforms: null,
    local_override_fields: ["name", "slug", "description"],
  };

  const update = buildProviderUpdate(existing, candidate);
  assert.equal(update.name, undefined);
  assert.equal(update.slug, undefined);
  assert.equal(update.description, undefined);
  assert.equal(update.image_url, candidate.coverUrl);
  assert.equal(update.igdb_id, 1942);
  assert.equal(update.provider_name, igdbGame.name);
});

test("new IGDB games stay inactive until an admin activates them", () => {
  const inserted = buildNewGameInsert(mapIgdbGame(igdbGame));
  assert.equal(inserted.status, "inactive");
  assert.equal(inserted.is_active, false);
  assert.equal(inserted.source, "igdb");
  assert.equal(inserted.igdb_id, 1942);
});

test("game names normalize consistently for legacy matching", () => {
  assert.equal(normalizeGameName("Pokémon: GO™"), "pokemon go");
});
