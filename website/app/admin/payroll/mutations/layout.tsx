import type { ReactNode } from 'react';
import { DeleteAllMutations } from '@/features/payroll/components/delete-all-mutations';

export default function MutationsLayout({ children }: { children: ReactNode }) {
  return <><DeleteAllMutations />{children}</>;
}
