import { requireMonitorAccess } from '@/lib/monitorAccess';
import { monitorBody, monitorError, monitorReply } from '@/lib/monitorHttp';
import { parseMonitorTeamInput, readMonitorTeam } from '@/lib/monitorTeams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;
const validRef = (value: unknown): value is string => typeof value === 'string' && /^X\d{2,12}$/.test(value);

export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requireMonitorAccess(request);
    if (!actor.isAdmin) return monitorReply({ error: 'Pembagian hasil hanya dapat diatur admin.' }, 403);
    const orderRef = new URL(request.url).searchParams.get('orderRef');
    if (!validRef(orderRef)) return monitorReply({ error: 'Pilih order yang valid.' }, 400);
    const { data, error } = await supabaseAdmin.rpc('cp_monitor_team_snapshot', { p_order_ref: orderRef });
    if (error) throw error;
    return monitorReply(readMonitorTeam(data));
  } catch (error) { return monitorError(error); }
}

export async function POST(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requireMonitorAccess(request);
    if (!actor.isAdmin) return monitorReply({ error: 'Pembagian hasil hanya dapat diatur admin.' }, 403);
    const body = await monitorBody(request);
    if (!validRef(body.orderRef) || !Number.isSafeInteger(body.version) || Number(body.version) < 0)
      return monitorReply({ error: 'Versi atau order tidak valid. Perbarui data.' }, 400);
    const participants = parseMonitorTeamInput(body.participants);
    const { data, error } = await supabaseAdmin.rpc('cp_monitor_set_team', {
      p_order_ref: body.orderRef, p_expected_version: body.version,
      p_participants: participants, p_actor_user_id: actor.id,
    });
    if (error) throw error;
    return monitorReply({ ...readMonitorTeam(data), ok: true });
  } catch (error) { return monitorError(error); }
}
