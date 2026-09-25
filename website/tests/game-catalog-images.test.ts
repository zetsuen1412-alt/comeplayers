import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAME_IMAGE_INPUT_LIMIT, GAME_IMAGE_UPLOAD_LIMIT, gameImageFileError,
  getGameImageCandidates, isPlaceholderGameImage, normalizeGameImageUrl,
} from "../lib/gameCatalogImages";

const custom = "https://assets.example.com/custom.webp";
const cover = "https://media.example.com/cover.jpg";
const placeholder = "https://placehold.co/800x450?text=Game";

test("admin artwork wins over an old provider cover", () => {
  assert.deepEqual(getGameImageCandidates({ image_url: custom, cover_image_url: cover }), [custom, cover]);
});

test("a text placeholder cannot hide real cover artwork", () => {
  assert.deepEqual(getGameImageCandidates({ image_url: placeholder, cover_image_url: cover }), [cover]);
});

test("canonical and provider duplicates only load once", () => {
  assert.deepEqual(getGameImageCandidates({ image_url: custom, catalog_image_url: custom, cover_image_url: custom, background_image: cover }), [custom, cover]);
});

test("all supported fallback fields are considered", () => {
  for (const field of ["banner_image_url", "banner_url", "background_image", "background_url", "hero_url", "provider_cover_url", "provider_background_url", "icon_url", "logo_url"]) {
    assert.deepEqual(getGameImageCandidates({ [field]: cover }), [cover]);
  }
});

test("missing images produce no external text placeholder request", () => {
  assert.deepEqual(getGameImageCandidates({ image_url: placeholder }), []);
  assert.deepEqual(getGameImageCandidates({}), []);
});

test("safe HTTPS and root-relative asset URLs are accepted", () => {
  assert.equal(normalizeGameImageUrl(` ${custom} `), custom);
  assert.equal(normalizeGameImageUrl("/images/game.webp"), "/images/game.webp");
  assert.equal(normalizeGameImageUrl("https://assets.example.com/art%20work.webp?version=2"), "https://assets.example.com/art%20work.webp?version=2");
});

test("unsafe, temporary, malformed and credential URLs are rejected", () => {
  for (const value of [null, undefined, "", "javascript:alert(1)", "data:image/svg+xml,<svg/>", "blob:https://example.com/id", "http://example.com/a.jpg", "//example.com/a.jpg", "https://user:pass@example.com/a.jpg", "https://example.com/a b.jpg", "https:\\example.com/a.jpg", "https://example.com/\na.jpg", "a".repeat(4097)]) {
    assert.equal(normalizeGameImageUrl(value), null, String(value));
  }
});

test("known text placeholder hosts and local placeholders are excluded", () => {
  for (const value of [placeholder, "https://via.placeholder.com/300", "https://dummyimage.com/800x450", "https://placeimg.com/300/200", "/images/placeholder.png", "/game-cover-fallback.svg"]) {
    assert.equal(isPlaceholderGameImage(value), true, value);
  }
  assert.equal(isPlaceholderGameImage("https://placehold.co.example.com/real.jpg"), false);
  assert.equal(isPlaceholderGameImage(custom), false);
});

test("file validation accepts supported nonempty image files", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(gameImageFileError({ type, size: GAME_IMAGE_INPUT_LIMIT }), null);
  }
  assert.ok(GAME_IMAGE_UPLOAD_LIMIT < GAME_IMAGE_INPUT_LIMIT);
});

test("file validation rejects SVG, documents, empty and oversized uploads", () => {
  for (const file of [
    { type: "image/svg+xml", size: 100 }, { type: "application/pdf", size: 100 },
    { type: "image/gif", size: 100 }, { type: "image/png", size: 0 },
    { type: "image/png", size: NaN }, { type: "image/png", size: GAME_IMAGE_INPUT_LIMIT + 1 },
  ]) assert.ok(gameImageFileError(file));
});
