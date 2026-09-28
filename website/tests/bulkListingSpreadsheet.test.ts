import assert from "node:assert/strict";
import test from "node:test";
import {
  BULK_LISTING_MAX_ROWS,
  normalizeBulkListingHeader,
  parseDeliveryEtaMinutes,
  resolveBulkListingStatus,
  tableRowsToBulkListingRecords,
} from "../lib/bulkListingSpreadsheet";

const headers = [
  "Category",
  "Game",
  "Product Title",
  "Currency",
  "price",
  "stock",
  "Delivery ETA",
  "Region",
  "Platform",
  "Server / Realm",
  "Description",
];

test("spreadsheet headers are normalized consistently", () => {
  assert.equal(normalizeBulkListingHeader(" Delivery ETA Minutes "), "delivery_eta_minutes");
  assert.equal(normalizeBulkListingHeader("\uFEFFProduct ID"), "product_id");
});

test("delivery ETA accepts minutes and friendly time labels", () => {
  assert.equal(parseDeliveryEtaMinutes(90), 90);
  assert.equal(parseDeliveryEtaMinutes("1 hour"), 60);
  assert.equal(parseDeliveryEtaMinutes("3 days"), 4320);
  assert.equal(Number.isNaN(parseDeliveryEtaMinutes("tomorrow")), true);
});

test("inactive and unavailable imports are not reported as published", () => {
  assert.equal(resolveBulkListingStatus("allow", "active", 1), "active");
  assert.equal(resolveBulkListingStatus("allow", "inactive", 1), "inactive");
  assert.equal(resolveBulkListingStatus("allow", "active", 0), "inactive");
  assert.equal(resolveBulkListingStatus("review", "active", 1), "inactive");
});

test("spreadsheet rows become bulk listing records and preserve source row numbers", () => {
  const records = tableRowsToBulkListingRecords([
    headers,
    [
      "Game Coins",
      "Example Game",
      "1,000 Coins",
      "US Dollar (USD)",
      50000,
      10,
      "1 hour",
      "Global",
      "PC",
      "SEA-1",
      "A sufficiently detailed listing description.",
    ],
    ["", "", "", "", "", "", "", "", "", "", ""],
    [
      "Game Coins",
      "Example Game",
      "2,000 Coins",
      "IDR",
      90000,
      5,
      120,
      "Global",
      "Any",
      "",
      "Another sufficiently detailed listing description.",
    ],
  ]);

  assert.equal(records.length, 2);
  assert.equal(records[0].row_number, 2);
  assert.equal(records[1].row_number, 4);
  assert.equal(records[0].listing_id, undefined);
  assert.equal(records[0].listing_type, "Game Coins");
  assert.equal(records[0].game_name, "Example Game");
  assert.equal(records[0].currency, "US Dollar (USD)");
  assert.equal(records[0].delivery_minutes, "1 hour");
});

test("legacy technical headers remain compatible", () => {
  const records = tableRowsToBulkListingRecords([
    [
      "product_id",
      "game_name",
      "category",
      "title",
      "description",
      "price",
      "stock",
      "delivery_eta_minutes",
      "offer_region",
      "offer_platform",
      "offer_server",
    ],
    [
      88,
      "Legacy Game",
      "Boosting",
      "Legacy Listing",
      "A sufficiently detailed legacy description.",
      100,
      1,
      60,
      "Global",
      "PC",
      "SEA-1",
    ],
  ]);

  assert.equal(records[0].listing_id, 88);
  assert.equal(records[0].listing_type, "Boosting");
  assert.equal(records[0].product_title, "Legacy Listing");
  assert.equal(records[0].delivery_minutes, 60);
});

test("spreadsheet rows reject missing required columns", () => {
  assert.throws(
    () => tableRowsToBulkListingRecords([["title"], ["Example"]]),
    /missing columns/i
  );
});


test("spreadsheet import accepts thousands of rows and enforces the 5000 row cap", () => {
  const row = [
    "Boosting",
    "Example Game",
    "Leveling Service",
    "USD",
    10,
    1,
    60,
    "Global",
    "Any",
    "",
    "A sufficiently detailed listing description.",
  ];

  const accepted = tableRowsToBulkListingRecords([
    headers,
    ...Array.from({ length: BULK_LISTING_MAX_ROWS }, () => [...row]),
  ]);
  assert.equal(accepted.length, BULK_LISTING_MAX_ROWS);

  assert.throws(
    () =>
      tableRowsToBulkListingRecords([
        headers,
        ...Array.from({ length: BULK_LISTING_MAX_ROWS + 1 }, () => [...row]),
      ]),
    /at most 5000 listing rows/i
  );
});
