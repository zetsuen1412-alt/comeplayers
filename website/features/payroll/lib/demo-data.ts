import type { Employee, FinanceIssue, InventoryStock, Order } from "@/features/payroll/types/domain";

// v0.13.0 starts operational data from zero.
// Add employees, orders, mutations, inventory and payroll data through the UI.
export const employees: Employee[] = [];
export const orders: Order[] = [];
export const financeIssues: FinanceIssue[] = [];
export const payrollRows: never[] = [];
export const inventoryRows: InventoryStock[] = [];

// Vendor master examples remain only on the separate Vendor prototype page.
export const vendorRows: {code:string;name:string;openPo:number;payableMinor:number;reliability:number;avgDelivery:string}[] = [];
