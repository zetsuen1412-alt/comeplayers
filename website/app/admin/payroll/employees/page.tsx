import { EmployeeManager } from "@/features/payroll/components/employee-manager";
import { PageHeader } from "@/features/payroll/components/page-header";

export default function EmployeesPage() {
  return (
    <>
      <PageHeader title="Karyawan" description="Tambah, ubah status, dan hapus karyawan. Penghapusan diblokir jika karyawan masih dipakai di Pesanan/Mutasi, Kasbon, atau Stok agar riwayat tetap aman." />
      <EmployeeManager />
    </>
  );
}
