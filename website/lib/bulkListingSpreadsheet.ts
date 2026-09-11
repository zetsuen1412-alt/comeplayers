import { parseCsv } from "@/lib/csv";

export type BulkListingRecord = Record<string, string | number>;
export type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export const BULK_LISTING_REQUIRED_COLUMNS = [
  "game_name",
  "listing_type",
  "product_title",
  "price",
  "stock",
  "delivery_minutes",
  "region",
  "platform",
  "server_realm",
  "description",
] as const;

const LEGACY_COLUMN_ALIASES: Record<string, string> = {
  product_id: "listing_id",
  category: "listing_type",
  game: "game_name",
  title: "product_title",
  price_currency: "currency",
  delivery_eta: "delivery_minutes",
  delivery_eta_minutes: "delivery_minutes",
  offer_region: "region",
  offer_platform: "platform",
  offer_server: "server_realm",
  offer_tags: "tags",
};

const COLUMN_LABELS: Record<string, string> = {
  listing_type: "Category",
  game_name: "Game",
  product_title: "Product Title",
  currency: "Currency",
  price: "Price",
  stock: "Stock",
  delivery_minutes: "Delivery ETA",
  region: "Region",
  platform: "Platform",
  server_realm: "Server / Realm",
  description: "Description",
};

export const BULK_LISTING_MAX_ROWS = 200;
export const BULK_LISTING_MAX_FILE_BYTES = 8 * 1024 * 1024;

export function normalizeBulkListingHeader(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseDeliveryEtaMinutes(value: unknown, fallback = 60) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : fallback;
  }

  const source = String(value).trim().toLowerCase();
  if (!source) return fallback;
  if (/^\d+(?:\.\d+)?$/.test(source)) return Math.round(Number(source));

  const match = source.match(
    /^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/
  );
  if (!match) return Number.NaN;

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit.startsWith("d")
    ? 1440
    : unit.startsWith("h")
      ? 60
      : 1;
  return Math.round(amount * multiplier);
}

function spreadsheetCellToValue(value: SpreadsheetCell): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}

function isEmptySpreadsheetRow(row: SpreadsheetCell[]) {
  return row.every((value) => String(spreadsheetCellToValue(value)).trim() === "");
}

export function tableRowsToBulkListingRecords(
  table: SpreadsheetCell[][]
): BulkListingRecord[] {
  if (table.length < 2) {
    throw new Error("The file has no listing rows.");
  }

  const headers = table[0].map((value) => {
    const header = normalizeBulkListingHeader(value);
    return LEGACY_COLUMN_ALIASES[header] || header;
  });
  const missingColumns = BULK_LISTING_REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column)
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `The file is missing columns: ${missingColumns
        .map((column) => COLUMN_LABELS[column] || column)
        .join(", ")}.`
    );
  }

  const records = table
    .slice(1)
    .map((values, index) => ({ values, rowNumber: index + 2 }))
    .filter(({ values }) => !isEmptySpreadsheetRow(values))
    .map(({ values, rowNumber }) => {
      const record: BulkListingRecord = {};
      headers.forEach((header, columnIndex) => {
        if (!header) return;
        record[header] = spreadsheetCellToValue(values[columnIndex]);
      });
      record.row_number = rowNumber;
      return record;
    });

  if (records.length < 1) {
    throw new Error("The file has no listing rows.");
  }
  if (records.length > BULK_LISTING_MAX_ROWS) {
    throw new Error(
      `A bulk import can contain at most ${BULK_LISTING_MAX_ROWS} listing rows.`
    );
  }

  return records;
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export async function readBulkListingFile(file: File): Promise<{
  records: BulkListingRecord[];
  format: "csv" | "xlsx";
  sheetName: string | null;
}> {
  if (file.size > BULK_LISTING_MAX_FILE_BYTES) {
    throw new Error("CSV or Excel file must be 8 MB or smaller.");
  }

  const extension = fileExtension(file.name);
  if (extension === "csv") {
    return {
      records: tableRowsToBulkListingRecords(parseCsv(await file.text())),
      format: "csv",
      sheetName: null,
    };
  }

  if (extension === "xlsx") {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile(file);
    if (sheets.length < 1) throw new Error("The Excel workbook has no worksheets.");

    const sheet =
      sheets.find((item) => normalizeBulkListingHeader(item.sheet) === "listings") ||
      sheets[0];
    const records = tableRowsToBulkListingRecords(
      sheet.data as SpreadsheetCell[][]
    );

    return {
      records,
      format: "xlsx",
      sheetName: sheet.sheet,
    };
  }

  throw new Error("Use a .csv or .xlsx file.");
}
