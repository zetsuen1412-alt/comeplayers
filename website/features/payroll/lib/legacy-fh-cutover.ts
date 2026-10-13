import type { Order } from "../types/domain";

/** Verified against EVO GAMING 2026 upload: MUTASI FH row 5848 is X2754. */
export const FH_NEW_BOOK_ROW = 5848;
export const FH_NEW_BOOK_CODE = "X2754";
export const FH_LEGACY_ARCHIVE_ID = "legacy-mutasi-fh-before-X2754";

export type LegacyMutationSnapshot = {
 id: string;
 spreadsheetId: string;
 sheetName: "MUTASI FH";
 sourceRow: number;
 code: string;
 sourceDate: string;
 source: string;
 buyerName: string;
 orderName: string;
 booster: string;
 team: string;
 game: string;
 process: string;
 quantity: number;
 rateMinor: number;
 grossMinor: number;
 transferStatus: string;
 /** Historical SOURCE snapshot, not a newly executed payroll Closing. */
 archiveType: "legacy-before-X2754";
 importedAt: string;
};

export function isPreX2754SheetOrder(order: Pick<Order,"id"|"importSourceRow">) {
 return order.id.startsWith("gsheet:") && order.id.toUpperCase().includes("MUTASI")
   && Number.isSafeInteger(order.importSourceRow) && Number(order.importSourceRow) < FH_NEW_BOOK_ROW;
}
export function isPreX2754SheetDay(order: Pick<Order,"id">, day: {sourceRow?:number}) {
 return order.id.startsWith("gsheet:") && order.id.toUpperCase().includes("MUTASI")
   && Number.isSafeInteger(day.sourceRow) && Number(day.sourceRow) < FH_NEW_BOOK_ROW;
}
export function belongsInLegacyArchive(order: Pick<Order,"id"|"importSourceRow">, day?: {sourceRow?:number}) {
 return day ? isPreX2754SheetDay(order,day) : isPreX2754SheetOrder(order);
}
export function legacyRowId(spreadsheetId:string,rowNumber:number) {
 return "fh-old:"+encodeURIComponent(spreadsheetId)+":"+rowNumber;
}
