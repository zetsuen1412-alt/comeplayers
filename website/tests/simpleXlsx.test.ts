import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import {
  tableRowsToBulkListingRecords,
  type SpreadsheetCell,
} from "../lib/bulkListingSpreadsheet";
import { createSimpleXlsx } from "../lib/simpleXlsx";

test("creates a readable Excel workbook with clear listing columns", async () => {
  const workbook = createSimpleXlsx({
    sheetName: "Listings",
    title: "ComePlayers listings",
    columns: [
      { header: "Category", width: 20 },
      { header: "Game", width: 26 },
      { header: "Product Title", width: 34 },
      { header: "Currency", width: 24 },
      { header: "Price", width: 16 },
      { header: "Stock", width: 12 },
      { header: "Delivery ETA", width: 18 },
      { header: "Region", width: 16 },
      { header: "Platform", width: 16 },
      { header: "Server / Realm", width: 20 },
      { header: "Description", width: 58 },
    ],
    rows: [
      [
        "Boosting",
        "Wuthering Waves",
        "15 Hours Piloting",
        "US Dollar (USD)",
        50000,
        10,
        "1 hour",
        "Global",
        "PC",
        "SEA-1",
        "A sufficiently clear listing description.",
      ],
    ],
  });

  assert.equal(String.fromCharCode(workbook[0], workbook[1]), "PK");

  const sheets = await readXlsxFile(Buffer.from(workbook));
  const rows = sheets[0].data;
  assert.deepEqual(rows[0], [
    "Category",
    "Game",
    "Product Title",
    "Currency",
    "Price",
    "Stock",
    "Delivery ETA",
    "Region",
    "Platform",
    "Server / Realm",
    "Description",
  ]);
  assert.equal(rows[1][0], "Boosting");
  assert.equal(rows[1][1], "Wuthering Waves");
  assert.equal(rows[1][2], "15 Hours Piloting");

  const records = tableRowsToBulkListingRecords(rows as SpreadsheetCell[][]);
  assert.equal(records[0].listing_id, undefined);
  assert.equal(records[0].game_name, "Wuthering Waves");
  assert.equal(records[0].listing_type, "Boosting");
  assert.equal(records[0].product_title, "15 Hours Piloting");
});

test("stores values as data instead of formulas", async () => {
  const workbook = createSimpleXlsx({
    sheetName: "Listings",
    title: "Safe listings",
    columns: [{ header: "Description", width: 40 }],
    rows: [["=HYPERLINK(\"https://example.com\",\"unsafe\")"]],
  });

  const sheets = await readXlsxFile(Buffer.from(workbook));
  assert.equal(
    sheets[0].data[1][0],
    '=HYPERLINK("https://example.com","unsafe")'
  );
});

test("creates locked dropdown lists on a hidden options sheet", async () => {
  const workbook = createSimpleXlsx({
    sheetName: "Listings",
    title: "ComePlayers validated template",
    columns: [
      { header: "Category", width: 20 },
      { header: "Game", width: 26 },
      { header: "Currency", width: 24 },
      { header: "Delivery ETA", width: 18 },
      { header: "Platform", width: 16 },
    ],
    rows: [],
    maxDataRows: 200,
    listValidations: [
      {
        column: 0,
        name: "CategoryOptions",
        values: ["Game Accounts", "Boosting"],
        allowBlank: false,
      },
      {
        column: 1,
        name: "GameOptions",
        values: ["Counter-Strike 2", "Wuthering Waves"],
        allowBlank: false,
      },
      {
        column: 2,
        name: "CurrencyOptions",
        values: ["Indonesia Rupiah (IDR)", "US Dollar (USD)"],
        allowBlank: false,
      },
      {
        column: 3,
        name: "DeliveryEtaOptions",
        values: ["15 min", "1 hour"],
        allowBlank: false,
      },
      {
        column: 4,
        name: "PlatformOptions",
        values: ["Any", "PC", "XBOX", "Nintendo", "Playstation"],
        allowBlank: false,
      },
    ],
  });

  const archive = unzipSync(workbook);
  const workbookXml = strFromU8(archive["xl/workbook.xml"]);
  const listingsXml = strFromU8(archive["xl/worksheets/sheet1.xml"]);
  const optionsXml = strFromU8(archive["xl/worksheets/sheet2.xml"]);

  assert.match(workbookXml, /name="Options"[^>]+state="hidden"/);
  assert.match(workbookXml, /name="CategoryOptions"/);
  assert.match(workbookXml, /name="GameOptions"/);
  assert.match(workbookXml, /name="CurrencyOptions"/);
  assert.match(
    workbookXml,
    /<definedName name="CategoryOptions">&apos;Options&apos;!\$A\$1:\$A\$2<\/definedName>/
  );
  assert.match(
    workbookXml,
    /<definedName name="CurrencyOptions">&apos;Options&apos;!\$C\$1:\$C\$2<\/definedName>/
  );
  assert.match(
    workbookXml,
    /<definedName name="PlatformOptions">&apos;Options&apos;!\$E\$1:\$E\$5<\/definedName>/
  );
  assert.doesNotMatch(workbookXml, /\$\$\d+<\/definedName>/);
  assert.match(listingsXml, /<dataValidations count="5">/);
  assert.match(listingsXml, /sqref="A2:A201"/);
  assert.match(listingsXml, /sqref="B2:B201"/);
  assert.match(listingsXml, /sqref="C2:C201"/);
  assert.match(listingsXml, /sqref="D2:D201"/);
  assert.match(listingsXml, /sqref="E2:E201"/);
  assert.match(listingsXml, /showErrorMessage="1" errorStyle="stop"/);
  assert.match(optionsXml, /Counter-Strike 2/);
  assert.match(optionsXml, /US Dollar \(USD\)/);
  assert.match(optionsXml, /Playstation/);

  const sheets = await readXlsxFile(Buffer.from(workbook));
  assert.deepEqual(sheets[0].data, [
    ["Category", "Game", "Currency", "Delivery ETA", "Platform"],
  ]);
});
