import type { CharacterCardDefinition } from '../data/CharacterCardData';
import type { PlayerState } from './MatchModel';

export interface CharacterSkillResult {
    readonly ok: boolean;
    readonly message: string;
    readonly moneyGained: number;
    readonly freeUpgradeCreditsGained: number;
    readonly freeWorldTravelCreditsGained: number;
    readonly rentDiscountPercent: number;
    readonly rentDiscountChargesGained: number;
}

export class CharacterSkillService {
    public activate(character: CharacterCardDefinition, player: PlayerState): CharacterSkillResult {
        switch (character.activeSkill.id) {
            case 'route-override':
                player.freeWorldTravelCredits += 1;
                return this.result(true, `${character.activeSkill.name}: one free World Travel ticket added.`, 0, 0, 1, 0, 0);
            case 'turbo-capital':
                player.money += 250_000;
                return this.result(true, `${character.activeSkill.name}: CP 250,000 emergency capital received.`, 250_000, 0, 0, 0, 0);
            case 'instant-permit':
                player.freeUpgradeCredits += 1;
                return this.result(true, `${character.activeSkill.name}: one free upgrade credit added.`, 0, 1, 0, 0, 0);
            case 'rent-barrier':
                player.rentDiscountPercent = Math.max(player.rentDiscountPercent, 60);
                player.rentDiscountCharges += 1;
                return this.result(true, `${character.activeSkill.name}: the next rent payment is reduced by 60%.`, 0, 0, 0, 60, 1);
            case 'safe-passage':
                player.islandTurns = 0;
                player.freeWorldTravelCredits += 1;
                return this.result(true, `${character.activeSkill.name}: Island cleared and one travel ticket added.`, 0, 0, 1, 0, 0);
            case 'overcharge':
                player.money += 120_000;
                player.freeUpgradeCredits += 1;
                return this.result(true, `${character.activeSkill.name}: CP 120,000 and one upgrade credit received.`, 120_000, 1, 0, 0, 0);
            default:
                return this.result(false, 'This character has no active skill.', 0, 0, 0, 0, 0);
        }
    }

    private result(
        ok: boolean,
        message: string,
        moneyGained: number,
        freeUpgradeCreditsGained: number,
        freeWorldTravelCreditsGained: number,
        rentDiscountPercent: number,
        rentDiscountChargesGained: number,
    ): CharacterSkillResult {
        return {
            ok,
            message,
            moneyGained,
            freeUpgradeCreditsGained,
            freeWorldTravelCreditsGained,
            rentDiscountPercent,
            rentDiscountChargesGained,
        };
    }
}
