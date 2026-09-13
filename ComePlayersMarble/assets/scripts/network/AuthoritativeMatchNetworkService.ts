import type { DiceAuthorityResult, NetworkService } from './NetworkService';
import type { AuthoritativeMatchSnapshot } from './AuthoritativeMatchProtocol';
import { SupabaseAuthoritativeMatchAdapter } from './SupabaseAuthoritativeMatchAdapter';

export class AuthoritativeMatchNetworkService implements NetworkService {
    public constructor(private readonly adapter: SupabaseAuthoritativeMatchAdapter) {}

    public async requestDiceRoll(_playerId: string): Promise<DiceAuthorityResult> {
        const result = await this.adapter.command('ROLL');
        if (!result.ok || !result.data?.lastDice) throw new Error(result.message);
        return { first: result.data.lastDice.first, second: result.data.lastDice.second };
    }

    public async completeTurn(_playerId: string): Promise<void> {
        const result = await this.adapter.command('END_TURN');
        if (!result.ok) throw new Error(result.message);
    }

    public snapshot(): AuthoritativeMatchSnapshot | null {
        return this.adapter.snapshot();
    }
}
