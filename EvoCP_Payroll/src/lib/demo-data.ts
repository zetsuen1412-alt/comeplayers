import type { Employee, FinanceIssue, InventoryStock, Order } from "@/types/domain";

// v0.13.0 starts operational data from zero.
// Add employees, orders, mutations, inventory and payroll data through the UI.
export const employees: Employee[] = [];
export const orders: Order[] = [];
export const financeIssues: FinanceIssue[] = [];
export const payrollRows: never[] = [];
export const inventoryRows: InventoryStock[] = [];

// Vendor master examples remain only on the separate Vendor prototype page.
export const vendorRows = [
  { code: "VEN-0012", name: "Vendor Alpha", openPo: 3, payableMinor: 4_200_000, reliability: 97, avgDelivery: "1,8 jam" },
  { code: "VEN-0018", name: "Vendor Beta", openPo: 2, payableMinor: 2_150_000, reliability: 91, avgDelivery: "2,4 jam" },
  { code: "VEN-0022", name: "Vendor Gamma", openPo: 1, payableMinor: 850_000, reliability: 99, avgDelivery: "1,1 jam" },
];
