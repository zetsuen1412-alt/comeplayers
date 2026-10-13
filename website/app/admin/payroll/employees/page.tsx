import { EmployeeManager } from "@/features/payroll/components/employee-manager";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function EmployeesPage() {
  return (
    <>
      <PageHeader title="Karyawan" description="Tambah karyawan, perbaiki nama dengan tombol Edit Nama, dan kelola status. Nama yang berasal dari PAYROLL Sheet dikirim untuk koreksi otomatis melalui Apps Script, setelah fitur writeback diaktifkan." />
      <EmployeeManager />
    </>
  );
}
