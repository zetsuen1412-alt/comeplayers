import type { Employee } from '@/features/payroll/types/domain';

/** A deliberately minimal read model. Never return financial/order fields to mobile clients. */
export function mobilePayrollRoster(employees: Employee[]) {
  return employees.map(employee => ({
    id: employee.id,
    code: employee.code,
    name: employee.name,
    team: employee.team,
    workforceStatus: employee.workforceStatus,
    active: !employee.sheetRosterMissingAt && employee.workforceStatus !== 'RESIGN',
  }));
}