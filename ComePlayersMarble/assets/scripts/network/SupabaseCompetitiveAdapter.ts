import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { AuthoritativeActionResult } from './AuthoritativeMatchProtocol';
import {
    CompetitiveHubSnapshot,
    CompetitiveMode,
    TournamentMode,
    normalizeCompetitiveHub,
    normalizeTournamentDetail,
    TournamentDetail,
} from './CompetitiveProtocol';
import {
    createSupabaseRuntimeClient,
    loadSupabaseRuntimeConfig,
    SupabaseRuntimeConfig,
} from './SupabaseRuntimeConfig';

export class SupabaseCompetitiveAdapter {
    private client: SupabaseClient | null = null;
    private config: SupabaseRuntimeConfig | null = null;
    private competitiveChannel: RealtimeChannel | null = null;
    private competitiveTopic = '';

    public async hub(profileId: string, displayName: string): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        return this.callHub('get_marble_competitive_hub', {
            p_profile_id: profileId,
            p_display_name: displayName,
        }, 'Competitive hub loaded.');
    }

    public async joinQueue(
        profileId: string,
        displayName: string,
        mode: CompetitiveMode,
        region = 'GLOBAL',
    ): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        return this.callHub('join_marble_ranked_queue', {
            p_profile_id: profileId,
            p_display_name: displayName,
            p_mode: mode,
            p_region: region,
        }, `Server ranked ${mode.toLowerCase()} queue updated.`);
    }

    public async pollQueue(profileId: string, displayName: string): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        return this.callHub('poll_marble_ranked_queue', {
            p_profile_id: profileId,
            p_display_name: displayName,
        }, 'Server ranked queue refreshed.');
    }

    public async cancelQueue(profileId: string, displayName: string): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        return this.callHub('cancel_marble_ranked_queue', {
            p_profile_id: profileId,
            p_display_name: displayName,
        }, 'Server ranked queue cancelled.');
    }


    public async subscribeQueue(
        profileId: string,
        displayName: string,
        listener: (result: AuthoritativeActionResult<CompetitiveHubSnapshot>) => void,
    ): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        try {
            const client = await this.ensureClient();
            const sessionResult = await client.auth.getSession();
            if (sessionResult.error) throw sessionResult.error;
            const userId = sessionResult.data.session?.user.id ?? '';
            if (!userId) throw new Error('Competitive Realtime requires an authenticated Supabase user.');
            const topic = `marble-competitive:${userId}`;
            if (this.competitiveChannel && this.competitiveTopic !== topic) {
                await client.removeChannel(this.competitiveChannel);
                this.competitiveChannel = null;
            }
            if (!this.competitiveChannel) {
                const channel = client.channel(topic, { config: { private: true, broadcast: { self: false } } });
                channel.on('broadcast', { event: 'queue_update' }, () => {
                    void this.hub(profileId, displayName).then(listener);
                });
                channel.on('broadcast', { event: 'season_update' }, () => {
                    void this.hub(profileId, displayName).then(listener);
                });
                await subscribeChannel(channel);
                this.competitiveChannel = channel;
                this.competitiveTopic = topic;
            }
            return this.hub(profileId, displayName);
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Competitive Realtime subscription failed.') };
        }
    }

    public async unsubscribeQueue(): Promise<void> {
        if (this.client && this.competitiveChannel) await this.client.removeChannel(this.competitiveChannel);
        this.competitiveChannel = null;
        this.competitiveTopic = '';
    }

    public async finalizeMatch(
        roomId: string,
        profileId: string,
        displayName: string,
    ): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        return this.callHub('finalize_marble_competitive_match', {
            p_room_id: roomId,
            p_profile_id: profileId,
            p_display_name: displayName,
        }, 'Competitive result finalized.');
    }

    public async createTournament(
        profileId: string,
        displayName: string,
        name: string,
        capacity: 4 | 8,
        mode: TournamentMode = 'SOLO',
    ): Promise<AuthoritativeActionResult<TournamentDetail>> {
        return this.callTournament('create_marble_competitive_tournament', {
            p_profile_id: profileId,
            p_display_name: displayName,
            p_name: name,
            p_capacity: capacity,
            p_mode: mode,
        }, 'Tournament created.');
    }

    public async joinTournament(
        tournamentCode: string,
        profileId: string,
        displayName: string,
    ): Promise<AuthoritativeActionResult<TournamentDetail>> {
        return this.callTournament('join_marble_competitive_tournament', {
            p_tournament_code: normalizeCode(tournamentCode),
            p_profile_id: profileId,
            p_display_name: displayName,
        }, 'Tournament joined.');
    }

    public async tournamentByCode(tournamentCode: string): Promise<AuthoritativeActionResult<TournamentDetail>> {
        return this.callTournament('get_marble_competitive_tournament', {
            p_tournament_code: normalizeCode(tournamentCode),
        }, 'Tournament bracket loaded.');
    }

    public async advanceTournament(tournamentCode: string): Promise<AuthoritativeActionResult<TournamentDetail>> {
        return this.callTournament('advance_marble_competitive_tournament', {
            p_tournament_code: normalizeCode(tournamentCode),
        }, 'Tournament bracket synchronized.');
    }

    private async callHub(
        rpcName: string,
        params: Record<string, unknown>,
        successMessage: string,
    ): Promise<AuthoritativeActionResult<CompetitiveHubSnapshot>> {
        try {
            const client = await this.ensureClient();
            const response = await client.rpc(rpcName, params);
            if (response.error) throw response.error;
            const normalized = normalizeCompetitiveHub(response.data);
            if (!normalized) throw new Error('Supabase returned an invalid competitive hub payload.');
            return { ok: true, message: successMessage, data: normalized };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Competitive service is unavailable.') };
        }
    }

    private async callTournament(
        rpcName: string,
        params: Record<string, unknown>,
        successMessage: string,
    ): Promise<AuthoritativeActionResult<TournamentDetail>> {
        try {
            const client = await this.ensureClient();
            const response = await client.rpc(rpcName, params);
            if (response.error) throw response.error;
            const normalized = normalizeTournamentDetail(response.data);
            if (!normalized) throw new Error('Supabase returned an invalid tournament payload.');
            return { ok: true, message: successMessage, data: normalized };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Tournament service is unavailable.') };
        }
    }

    private async ensureClient(): Promise<SupabaseClient> {
        const loaded = loadSupabaseRuntimeConfig();
        if (!loaded.configured || !loaded.config) throw new Error(loaded.message);
        if (!this.client || this.config?.projectUrl !== loaded.config.projectUrl || this.config.publishableKey !== loaded.config.publishableKey) {
            this.config = loaded.config;
            this.client = createSupabaseRuntimeClient<SupabaseClient>(loaded.config.projectUrl, loaded.config.publishableKey, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
            });
        }
        let sessionResult = await this.client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
        let session = sessionResult.data.session;
        if (!session && loaded.config.autoAnonymousAuth) {
            const signIn = await this.client.auth.signInAnonymously();
            if (signIn.error) throw signIn.error;
            session = signIn.data.session;
        }
        if (!session) throw new Error('Competitive multiplayer requires an authenticated Supabase session.');
        await this.client.realtime.setAuth(session.access_token);
        return this.client;
    }
}

function normalizeCode(value: string): string {
    const code = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (code.length !== 8) throw new Error('Enter a valid eight-character tournament code.');
    return code;
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 220);
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        return error.message.trim().slice(0, 220) || fallback;
    }
    return fallback;
}


async function subscribeChannel(channel: RealtimeChannel): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Competitive Realtime subscription timed out.'));
        }, 8_000);
        channel.subscribe((status) => {
            if (settled) return;
            if (status === 'SUBSCRIBED') {
                settled = true;
                clearTimeout(timer);
                resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                settled = true;
                clearTimeout(timer);
                reject(new Error(`Competitive Realtime channel ${status.toLowerCase().replace(/_/g, ' ')}.`));
            }
        });
    });
}
