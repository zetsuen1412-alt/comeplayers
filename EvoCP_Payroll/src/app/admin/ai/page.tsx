import { PageHeader } from "@/components/page-header";
import { AiAssistant } from "@/components/ai-assistant";

export default function AiAssistantPage() {
  return (
    <>
      <PageHeader title="Asisten AI" description="Cek Mutasi, Gaji, Tutup Buku, dan tanyakan kondisi bisnis dengan bahasa sederhana." />
      <AiAssistant />
    </>
  );
}
