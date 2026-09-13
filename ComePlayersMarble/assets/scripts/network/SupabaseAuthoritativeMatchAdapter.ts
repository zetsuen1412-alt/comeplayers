import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
    AuthoritativeActionResult,
    AuthoritativeCommandKind,
    AuthoritativeMatchEvent,
    AuthoritativeMatchSnapshot,
    idempotencyKey,
    normalizeAuthoritativeEvent,
    normalizeAuthoritativeSnapshot,
} from './AuthoritativeMatchProtocol';
import {
    AuthoritativeEventHistory,
    AuthoritativeReplayArchiveHistory,
    AuthoritativeReplayArchiveSummary,
    AuthoritativeReplayLibrary,
    AuthoritativeReplayVisibility,
    mergeAuthoritativeEventHistories,
    mergeAuthoritativeReplayArchiveHistories,
    normalizeAuthoritativeEventHistory,
    normalizeAuthoritativeReplayArchiveHistory,
    normalizeAuthoritativeReplayArchiveSummary,
    normalizeAuthoritativeReplayLibrary,
} from './AuthoritativeReplayProtocol';
import {
    createSupabaseRuntimeClient,
    loadSupabaseRuntimeConfig,
    SupabaseRuntimeConfig,
} from './SupabaseRuntimeConfig';


export interface AuthoritativeLoadoutSelection {
    readonly roomId: string;
    readonly characterId: string;
    readonly activeSkillId: string;
    readonly pendantId: string;
    readonly boosterId: string;
}

export interface AuthoritativeMatchHandlers {
    readonly onSnapshot?: (snapshot: AuthoritativeMatchSnapshot) => void;
    readonly onEvent?: (event: AuthoritativeMatchEvent) => void;
}

export class SupabaseAuthoritativeMatchAdapter {
    private client: SupabaseClient | null = null;
    private channel: RealtimeChannel | null = null;
    private config: SupabaseRuntimeConfig | null = null;
    private snapshotValue: AuthoritativeMatchSnapshot | null = null;
    private handlers: AuthoritativeMatchHandlers = {};
    private profileId = '';

    public snapshot(): AuthoritativeMatchSnapshot | null {
        return this.snapshotValue;
    }

    public async configureLoadout(selection: AuthoritativeLoadoutSelection): Promise<AuthoritativeActionResult<Record<string, unknown>>> {
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('configure_marble_authoritative_loadout', {
                p_room_id: selection.roomId,
                p_character_id: selection.characterId,
                p_active_skill_id: selection.activeSkillId,
                p_pendant_id: selection.pendantId,
                p_booster_id: selection.boosterId,
            });
            if (response.error) throw response.error;
            if (!response.data || typeof response.data !== 'object') throw new Error('Supabase returned an invalid loadout result.');
            return { ok: true, message: 'Server loadout configured.', data: response.data as Record<string, unknown> };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Server loadout could not be configured.') };
        }
    }

    public async start(roomId: string, profileId: string, handlers: AuthoritativeMatchHandlers = {}): Promise<AuthoritativeActionResult> {
        this.handlers = handlers;
        this.profileId = profileId;
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('start_marble_authoritative_match', { p_room_id: roomId });
            if (response.error) throw response.error;
            const snapshot = normalizeAuthoritativeSnapshot(response.data);
            if (!snapshot) throw new Error('Supabase returned an invalid authoritative match snapshot.');
            this.snapshotValue = snapshot;
            await this.subscribe(snapshot.topic);
            this.handlers.onSnapshot?.(snapshot);
            return { ok: true, message: `Authoritative match ${snapshot.matchId.slice(0, 8)} started.`, data: snapshot };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Authoritative match could not be started.') };
        }
    }

    public async resume(roomId: string, profileId: string, handlers: AuthoritativeMatchHandlers = {}): Promise<AuthoritativeActionResult> {
        this.handlers = handlers;
        this.profileId = profileId;
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('get_marble_authoritative_match', { p_room_id: roomId });
            if (response.error) throw response.error;
            const snapshot = normalizeAuthoritativeSnapshot(response.data);
            if (!snapshot) throw new Error('No authoritative match is available for this room.');
            this.snapshotValue = snapshot;
            await this.subscribe(snapshot.topic);
            this.handlers.onSnapshot?.(snapshot);
            return { ok: true, message: 'Authoritative match state restored.', data: snapshot };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Authoritative match could not be restored.') };
        }
    }

    public async command(
        kind: AuthoritativeCommandKind,
        payload: Readonly<Record<string, unknown>> = {},
        expectedRevision = this.snapshotValue?.revision ?? 0,
    ): Promise<AuthoritativeActionResult> {
        const match = this.snapshotValue;
        if (!match) return { ok: false, message: 'Start or resume an authoritative match first.' };
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('submit_marble_authoritative_command', {
                p_match_id: match.matchId,
                p_command: kind,
                p_expected_revision: expectedRevision,
                p_idempotency_key: idempotencyKey(kind, this.profileId, expectedRevision),
                p_payload: payload,
            });
            if (response.error) throw response.error;
            const snapshot = normalizeAuthoritativeSnapshot(response.data);
            if (!snapshot) throw new Error('Supabase returned an invalid command result.');
            this.snapshotValue = snapshot;
            this.handlers.onSnapshot?.(snapshot);
            return { ok: true, message: `${kind.replace('_', ' ')} accepted at revision ${snapshot.revision}.`, data: snapshot };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, `${kind} was rejected by the authoritative server.`) };
        }
    }

    public async refresh(): Promise<AuthoritativeActionResult> {
        const match = this.snapshotValue;
        if (!match) return { ok: false, message: 'No authoritative match is active.' };
        return this.resume(match.roomId, this.profileId, this.handlers);
    }

    public async eventHistory(
        roomId = this.snapshotValue?.roomId ?? '',
        afterSequence = 0,
        limit = 180,
    ): Promise<AuthoritativeActionResult<AuthoritativeEventHistory>> {
        if (!roomId) return { ok: false, message: 'Join a room before requesting authoritative history.' };
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('get_marble_authoritative_event_history', {
                p_room_id: roomId,
                p_after_sequence: Math.max(0, Math.trunc(afterSequence)),
                p_limit: Math.max(1, Math.min(180, Math.trunc(limit))),
            });
            if (response.error) throw response.error;
            const history = normalizeAuthoritativeEventHistory(response.data);
            if (!history) throw new Error('Supabase returned invalid authoritative event history.');
            this.snapshotValue = history.snapshot;
            return {
                ok: true,
                message: `Loaded ${history.events.length} server events (${history.firstSequence}-${history.lastSequence}).`,
                data: history,
            };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Authoritative event history could not be loaded.') };
        }
    }


    public async eventHistoryAll(
        roomId = this.snapshotValue?.roomId ?? '',
        pageSize = 180,
        maxPages = 12,
    ): Promise<AuthoritativeActionResult<AuthoritativeEventHistory>> {
        const pages: AuthoritativeEventHistory[] = [];
        let afterSequence = 0;
        for (let pageIndex = 0; pageIndex < Math.max(1, Math.min(12, Math.trunc(maxPages))); pageIndex++) {
            const result = await this.eventHistory(roomId, afterSequence, pageSize);
            if (!result.ok || !result.data) return result;
            pages.push(result.data);
            if (!result.data.hasMore || result.data.lastSequence <= afterSequence) break;
            afterSequence = result.data.lastSequence;
        }
        const merged = mergeAuthoritativeEventHistories(pages);
        if (!merged) return { ok: false, message: 'No authoritative replay pages were returned.' };
        return {
            ok: true,
            message: `Loaded ${merged.events.length} server replay events across ${pages.length} page${pages.length === 1 ? '' : 's'}.`,
            data: merged,
        };
    }

    public async publishReplay(
        roomId = this.snapshotValue?.roomId ?? '',
        visibility: AuthoritativeReplayVisibility = 'UNLISTED',
    ): Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveSummary>> {
        if (!roomId) return { ok: false, message: 'Join a room before publishing an authoritative replay.' };
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('publish_marble_authoritative_replay', {
                p_room_id: roomId,
                p_visibility: visibility,
            });
            if (response.error) throw response.error;
            const archive = normalizeAuthoritativeReplayArchiveSummary(response.data);
            if (!archive) throw new Error('Supabase returned invalid replay archive metadata.');
            return {
                ok: true,
                message: `Replay ${archive.replayCode} published as ${archive.visibility}.`,
                data: archive,
            };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Authoritative replay could not be published.') };
        }
    }

    public async replayLibrary(limit = 20): Promise<AuthoritativeActionResult<AuthoritativeReplayLibrary>> {
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('list_marble_authoritative_replays', {
                p_limit: Math.max(1, Math.min(40, Math.trunc(limit))),
            });
            if (response.error) throw response.error;
            const library = normalizeAuthoritativeReplayLibrary(response.data);
            if (!library) throw new Error('Supabase returned invalid replay library data.');
            return { ok: true, message: `Loaded ${library.entries.length} server replay archives.`, data: library };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Server replay library could not be loaded.') };
        }
    }

    public async replayByCodePage(
        replayCode: string,
        afterSequence = 0,
        limit = 180,
    ): Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveHistory>> {
        const normalizedCode = replayCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (normalizedCode.length !== 8) return { ok: false, message: 'Replay code must contain eight letters or numbers.' };
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('get_marble_authoritative_replay_by_code', {
                p_replay_code: normalizedCode,
                p_after_sequence: Math.max(0, Math.trunc(afterSequence)),
                p_limit: Math.max(1, Math.min(180, Math.trunc(limit))),
            });
            if (response.error) throw response.error;
            const history = normalizeAuthoritativeReplayArchiveHistory(response.data);
            if (!history) throw new Error('Supabase returned invalid shared replay history.');
            return {
                ok: true,
                message: `Loaded replay ${history.archive.replayCode} events ${history.firstSequence}-${history.lastSequence}.`,
                data: history,
            };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Shared replay could not be loaded.') };
        }
    }

    public async replayByCode(
        replayCode: string,
        pageSize = 180,
        maxPages = 12,
    ): Promise<AuthoritativeActionResult<AuthoritativeReplayArchiveHistory>> {
        const pages: AuthoritativeReplayArchiveHistory[] = [];
        let afterSequence = 0;
        for (let pageIndex = 0; pageIndex < Math.max(1, Math.min(12, Math.trunc(maxPages))); pageIndex++) {
            const result = await this.replayByCodePage(replayCode, afterSequence, pageSize);
            if (!result.ok || !result.data) return result;
            pages.push(result.data);
            if (!result.data.hasMore || result.data.lastSequence <= afterSequence) break;
            afterSequence = result.data.lastSequence;
        }
        const merged = mergeAuthoritativeReplayArchiveHistories(pages);
        if (!merged) return { ok: false, message: 'No shared replay pages were returned.' };
        return {
            ok: true,
            message: `Replay ${merged.archive.replayCode} loaded with ${merged.events.length} events.`,
            data: merged,
        };
    }

    public async deleteReplay(replayId: string): Promise<AuthoritativeActionResult<Record<string, unknown>>> {
        try {
            const client = await this.ensureClient();
            const response = await client.rpc('delete_marble_authoritative_replay', { p_replay_id: replayId });
            if (response.error) throw response.error;
            if (!response.data || typeof response.data !== 'object') throw new Error('Supabase returned an invalid replay deletion result.');
            return { ok: true, message: 'Server replay deleted.', data: response.data as Record<string, unknown> };
        } catch (error: unknown) {
            return { ok: false, message: errorMessage(error, 'Server replay could not be deleted.') };
        }
    }

    public async disconnect(): Promise<void> {
        if (this.client && this.channel) {
            try { await this.client.removeChannel(this.channel); } catch { /* best effort */ }
        }
        this.channel = null;
    }

    private async subscribe(topic: string): Promise<void> {
        const client = await this.ensureClient();
        if (this.channel) {
            try { await client.removeChannel(this.channel); } catch { /* best effort */ }
        }
        const channel = client.channel(topic, { config: { private: this.config?.privateChannels !== false } });
        this.channel = channel;
        channel.on<Record<string, unknown>>('broadcast', { event: 'match_event' }, ({ payload }: { payload: Record<string, unknown> }) => {
            const event = normalizeAuthoritativeEvent(payload);
            if (!event) return;
            this.handlers.onEvent?.(event);
            void this.refresh();
        });
        await new Promise<void>((resolve, reject) => {
            let settled = false;
            channel.subscribe((status, error) => {
                if (status === 'SUBSCRIBED' && !settled) { settled = true; resolve(); }
                if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
                    settled = true;
                    reject(error ?? new Error(`Authoritative channel ${status.toLowerCase()}.`));
                }
            }, 12_000);
        });
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
        if (!session) throw new Error('Authoritative multiplayer requires an authenticated Supabase session.');
        await this.client.realtime.setAuth(session.access_token);
        return this.client;
    }
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 220);
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        return error.message.trim().slice(0, 220) || fallback;
    }
    return fallback;
}
