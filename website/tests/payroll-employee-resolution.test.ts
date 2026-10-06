import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeGoogleSheetPayroll, type GoogleSheetSyncPayload } from "../features/payroll/lib/google-sheet-sync";
import { workspaceKeys as K } from "../features/payroll/lib/workspace-model";
import type { Employee, Order } from "../features/payroll/types/domain";

function employee(name: string, team: Employee["team"], code: string): Employee {
  return {id:code,code,name,team,workforceStatus:"FULL",utilization:0,earningsMinor:0};
}
function imported(employees: Employee[], input: {booster?:string;team?:string;status?:string;black?:boolean;quantity?:number}) {
  const values = ["06/10/2026 09:00","ROSTER-1","G2G","Buyer","Custom gold",input.booster ?? "",input.team ?? "",input.status ?? "","RO","F2F",input.quantity ?? 10,1000,(input.quantity ?? 10)*1000];
  const payload: GoogleSheetSyncPayload = {
    version:1,spreadsheetId:"roster-regression",sheetName:"MUTASI FH",sentAt:"2026-10-06T02:00:00.000Z",
    headers:["TANGGAL","KODE","GATE","NAMA BUYER","NAMA ORDER","BOOSTER","FH","STATUS","GAME","PROSES","JUMLAH","RATE","TOTAL"],
    rows:[{rowNumber:3,boosterBlack:input.black,values,display:values.map(String)}],
  };
  return (mergeGoogleSheetPayroll({[K.employees]:employees},payload).state[K.orders] as Order[])[0];
}
const andikas = [employee("ANDIKA","FH1","EMP-0022"),employee("ANDIKA","FH2","EMP-0150")];

test("duplicate canonical ANDIKA resolves by FH for direct Booster in either roster order", () => {
  for (const employees of [andikas,[...andikas].reverse()]) {
    for (const [team,code] of [["1","EMP-0022"],["FH2","EMP-0150"]]) {
      const order = imported(employees,{booster:"andika",team});
      assert.equal(order.employeeCode,code);
      assert.equal(order.workerAssignments?.[0].employeeName,"ANDIKA");
    }
  }
});

test("duplicate canonical ANDIKA resolves by FH for black Booster worker lists", () => {
  const order = imported(andikas,{team:"2",status:"ANDIKA: 10M",black:true});
  assert.equal(order.orderType,"gold");
  assert.deepEqual(order.workerAssignments?.map(row => [row.employeeCode,row.employeeName,row.quantity]),[["EMP-0150","ANDIKA",10]]);
});

test("ambiguous canonical names without FH remain unmatched and explain the ambiguity", () => {
  const direct = imported(andikas,{booster:"ANDIKA"});
  assert.deepEqual(direct.workerAssignments,[]);
  assert.match(direct.importIssues?.find(row => row.code==="sheet_booster_unmatched")?.description ?? "",/beberapa karyawan.*Isi FH/);
  const black = imported(andikas,{status:"ANDIKA 10M",black:true});
  assert.deepEqual(black.workerAssignments,[]);
  assert.match(black.importIssues?.find(row => row.code==="sheet_workers_review")?.description ?? "",/nama ambigu; isi FH/);
});

test("numeric canonical name suffixes remain part of names and preserve decimal quantities", () => {
  const employees = [employee("EKO3","FH3","EMP-0100"),employee("YODI3","FH3","EMP-0101"),employee("D2","FH3","EMP-0102")];
  const order = imported(employees,{team:"3",status:"EKO3:5M\nYODI3 2,5M\nD2 0.3M",black:true,quantity:7.8});
  assert.equal(order.orderType,"gold","Suffixed canonical names still infer legacy Gold");
  assert.deepEqual(order.workerAssignments?.map(row => [row.employeeName,row.quantity]),[["EKO3",5],["YODI3",2.5],["D2",0.3]]);
  assert.equal(order.quantity,7.8);
  assert.equal(order.grossMinor,7800);
});

test("employee codes containing digits and hyphens are not parsed as worker quantities", () => {
  const order = imported([employee("FAISAL2","FH2","EMP-0123")],{team:"2",status:"EMP-0123: 10M",black:true});
  assert.deepEqual(order.workerAssignments?.map(row => [row.employeeCode,row.quantity]),[["EMP-0123",10]]);
});

test("legacy hyphen separators remain supported for names and employee codes", () => {
  const employees = [employee("IRWAN","FH3","EMP-0123"),employee("EKO3","FH3","EMP-0100")];
  const order = imported(employees,{team:"3",status:"IRWAN-4M\nEKO3-5M\nEMP-0123-1M",black:true});
  assert.deepEqual(order.workerAssignments?.map(row => [row.employeeCode,row.quantity]),[["EMP-0123",4],["EMP-0100",5],["EMP-0123",1]]);
});

test("negative quantities remain unmatched instead of becoming positive assignments", () => {
  const employees = [employee("EKO3","FH3","EMP-0100")];
  for (const status of ["EKO3 -5M","EKO3: -5M","EKO3:-5M","EKO3--5M","EKO3,-5M","EKO3;-5M","EKO3|-5M","EKO3/-5M","EKO3+-5M","EKO3&-5M","EKO3=-5M","EKO3>-5M","EKO3=>-5M"]) {
    const order = imported(employees,{team:"3",status,black:true});
    assert.deepEqual(order.workerAssignments,[]);
    assert.match(order.importIssues?.find(row => row.code==="sheet_workers_review")?.description ?? "",/jumlah negatif/);
  }
});

test("an employee code without quantity is flagged for review", () => {
  const order = imported([employee("EKO3","FH3","EMP-0123")],{team:"3",status:"EMP-0123",black:true});
  assert.deepEqual(order.workerAssignments,[]);
  assert.match(order.importIssues?.find(row => row.code==="sheet_workers_review")?.description ?? "",/EMP-0123/);
});

test("legacy unsuffixed aliases resolve only within the known employee FH", () => {
  const employees = [employee("DENI1","FH1","E1"),employee("DENI2","FH2","E2"),employee("DENI3","FH3","E3")];
  for (const [team,code,name] of [["1","E1","DENI1"],["2","E2","DENI2"],["3","E3","DENI3"]]) {
    for (const input of [{booster:"deni"},{status:"DENI 10M",black:true}]) {
      const order = imported(employees,{...input,team});
      assert.deepEqual(order.workerAssignments?.map(row => [row.employeeCode,row.employeeName,row.quantity]),[[code,name,10]]);
    }
  }
});

test("legacy aliases are not guessed without FH or across FH boundaries", () => {
  const employees = [employee("EKO3","FH3","E3")];
  for (const input of [{booster:"EKO"},{booster:"EKO",team:"2"},{status:"EKO 10M",black:true},{status:"EKO 10M",black:true,team:"2"}]) {
    const order = imported(employees,input);
    assert.deepEqual(order.workerAssignments,[]);
    assert.ok(order.importIssues?.some(row => ["sheet_booster_unmatched","sheet_workers_review"].includes(row.code)));
  }
});

test("unique exact canonical names and codes still work without FH", () => {
  const employees = [employee("EKO3","FH3","EMP-0100")];
  for (const booster of ["EKO3","emp-0100"]) {
    assert.equal(imported(employees,{booster}).employeeCode,"EMP-0100");
  }
});

test("exact canonical names take priority over another employee's legacy alias", () => {
  const employees = [employee("EKO3","FH3","E3"),employee("EKO","FH3","E0")];
  assert.equal(imported(employees,{booster:"EKO",team:"3"}).employeeCode,"E0");
  assert.equal(imported(employees,{booster:"EKO3",team:"3"}).employeeCode,"E3");
});

test("an alias shared by multiple employee identities in the same FH remains ambiguous", () => {
  const employees = [employee("EKO3","FH3","E3A"),employee("EKO3","FH3","E3B")];
  const order = imported(employees,{booster:"EKO",team:"3"});
  assert.deepEqual(order.workerAssignments,[]);
  assert.match(order.importIssues?.find(row => row.code==="sheet_booster_unmatched")?.description ?? "",/beberapa karyawan/);
});

test("a suffix belonging to another FH or multiple digits does not create an alias", () => {
  const employees = [employee("EKO2","FH3","E2"),employee("DENI13","FH3","E13")];
  for (const booster of ["EKO","DENI1"]) assert.deepEqual(imported(employees,{booster,team:"3"}).workerAssignments,[]);
});

test("unitless quantities do not consume the next worker's initial as a unit", () => {
  const employees = [employee("EKO3","FH3","E3"),employee("GALIH3","FH3","G3")];
  const order = imported(employees,{team:"3",status:"EKO3 6\nGALIH3 4",black:true});
  assert.deepEqual(order.workerAssignments?.map(row => [row.employeeName,row.quantity]),[["EKO3",6],["GALIH3",4]]);
});

