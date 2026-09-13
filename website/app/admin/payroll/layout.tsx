import { WorkspaceGate } from '@/features/payroll/components/workspace-gate';
import '@/features/payroll/payroll.css';
export const metadata = {title:'EVO COMEPLAYERS Operasional & Keuangan'};
export default function PayrollLayout({children}:{children:React.ReactNode}) {return <WorkspaceGate>{children}</WorkspaceGate>;}
