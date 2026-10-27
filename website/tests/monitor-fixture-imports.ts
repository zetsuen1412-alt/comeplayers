import { withMonitorSessionDeadline } from '../lib/monitorSessionDeadline';
import { openMonitorContext } from '../lib/monitorOpenWorkspace';

// Adapts pre-existing role/workflow fixtures; the new RPC projection and public
// transport are exercised directly in monitor-open-workspace.test.ts.
const snapshot = { loadMonitorWorkspace: async (service: { from: (table: string) => {
  select: (columns: string) => { eq: (column: string, id: number) => { single: () => Promise<{ data: unknown; error?: unknown }> } };
} }) => {
  const result = await service.from('cp_payroll_workspace').select('payload,revision,updated_at').eq('id', 1).single();
  if (result.error) throw result.error;
  return result.data;
} };
export const monitorFixtureImports: Record<string, unknown> = {
  '@/lib/monitorWorkspaceSnapshot': snapshot, './monitorWorkspaceSnapshot': snapshot,
  '@/lib/monitorSessionDeadline': { withMonitorSessionDeadline },
  './monitorOpenWorkspace': { openMonitorContext },
};
