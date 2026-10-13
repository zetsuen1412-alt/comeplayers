import type {Order} from "../types/domain";

export type SheetCodeConflict = {
  id:string; spreadsheetId:string; code:string; sourceRow:number;
  message:string; detectedAt:string;
};
const noise=new Set(["G2G","BUYER","CUSTOMER","CUST","ORDER","PESANAN","PAKET","PACKAGE","BOOSTING","JOKI","DAN","THE","FOR","OF"]);
const normalize=(s:string)=>s.normalize("NFKC").toLocaleUpperCase("id-ID").replace(/[⭐✅☑️]/gu,"")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
function tokens(s:string){return normalize(s).split(" ").filter(t=>t && !noise.has(t));}
function related(a:string,b:string){
  const x=normalize(a),y=normalize(b);
  if(!x||!y)return false;
  if(x===y)return true;
  const left=tokens(a),right=tokens(b);
  if(!left.length||!right.length)return false;
  return left.some(t=>right.includes(t)&&t.length>=2);
}
/** Fail closed when either buyer OR service has no meaningful resemblance. */
export function unrelatedCodeIdentity(a:Pick<Order,"buyerName"|"orderName"|"service">,b:Pick<Order,"buyerName"|"orderName"|"service">) {
  const buyerA=a.buyerName??"",buyerB=b.buyerName??"";
  const titleA=a.orderName??a.service,titleB=b.orderName??b.service;
  return !related(buyerA,buyerB)||!related(titleA,titleB);
}
export function conflictRecord(spreadsheetId:string,code:string,rowNumber:number,message:string,sentAt:string):SheetCodeConflict {
  return {id:`sheet-code-conflict:${encodeURIComponent(spreadsheetId)}:${encodeURIComponent(code.toUpperCase())}`,
    spreadsheetId,code,sourceRow:rowNumber,message:message.slice(0,420),detectedAt:sentAt};
}
