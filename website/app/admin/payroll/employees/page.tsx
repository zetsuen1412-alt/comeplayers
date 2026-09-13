import { EmployeeManager } from "@/features/payroll/components/employee-manager";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function EmployeesPage() {
  return (
    <>
      <PageHeader title="Karyawan" description="Tambah karyawan, tentukan FH, dan ubah status NEW / SHIFT / FULL / SAKIT / IJIN / RESIGN kapan saja. Status otomatis terlihat di Gaji." />
      <EmployeeManager />
    </>
  );
}
