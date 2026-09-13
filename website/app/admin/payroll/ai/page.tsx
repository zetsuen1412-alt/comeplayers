import { PageHeader } from "@/features/payroll/components/page-header";
import { AiAssistant } from "@/features/payroll/components/ai-assistant";

export default function AiAssistantPage() {
  return (
    <>
      <PageHeader title="Asisten AI" description="Cek Mutasi, Gaji, Tutup Buku, dan tanyakan kondisi bisnis dengan bahasa sederhana." />
      <AiAssistant />
    </>
  );
}
