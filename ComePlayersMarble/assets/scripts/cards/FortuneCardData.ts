export enum FortuneCardRarity {
    Common = 'COMMON',
    Rare = 'RARE',
    Epic = 'EPIC',
    Legendary = 'LEGENDARY',
}

export enum FortuneEffectType {
    EarnMoney = 'EARN_MONEY',
    LoseMoney = 'LOSE_MONEY',
    MoveSteps = 'MOVE_STEPS',
    GoToIsland = 'GO_TO_ISLAND',
    LeaveIsland = 'LEAVE_ISLAND',
    RentDiscount = 'RENT_DISCOUNT',
    TakeoverProperty = 'TAKEOVER_PROPERTY',
    ProtectProperty = 'PROTECT_PROPERTY',
    BuildingBonus = 'BUILDING_BONUS',
    EconomicAttack = 'ECONOMIC_ATTACK',
    SwapPosition = 'SWAP_POSITION',
    FreeWorldTravel = 'FREE_WORLD_TRAVEL',
}

export enum FortuneTargetType {
    Self = 'SELF',
    RichestOpponent = 'RICHEST_OPPONENT',
    AllOpponents = 'ALL_OPPONENTS',
    RandomOpponent = 'RANDOM_OPPONENT',
    OwnedProperty = 'OWNED_PROPERTY',
    OpponentProperty = 'OPPONENT_PROPERTY',
}

export enum FortuneCardCategory {
    Economy = 'ECONOMY',
    Movement = 'MOVEMENT',
    Defense = 'DEFENSE',
    Property = 'PROPERTY',
    Attack = 'ATTACK',
    Travel = 'TRAVEL',
}

export interface FortuneCardData {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly iconKey: string;
    readonly rarity: FortuneCardRarity;
    readonly animationKey: string;
    readonly effectType: FortuneEffectType;
    readonly effectValue: number;
    readonly targetType: FortuneTargetType;
    /** Number of uses/charges for persistent effects; zero for immediate effects. */
    readonly duration: number;
    readonly isConsumable: boolean;
}

export const FORTUNE_CARDS: readonly FortuneCardData[] = [
    {
        id: 'creator-fund', title: 'Creator Fund',
        description: 'Your work was featured by the community. Receive CP 150,000.',
        iconKey: 'creator-fund', rarity: FortuneCardRarity.Common, animationKey: 'money-rain',
        effectType: FortuneEffectType.EarnMoney, effectValue: 150_000,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'viral-streak', title: 'Viral Streak',
        description: 'Your content went viral overnight. Receive CP 250,000.',
        iconKey: 'viral-streak', rarity: FortuneCardRarity.Rare, animationKey: 'social-burst',
        effectType: FortuneEffectType.EarnMoney, effectValue: 250_000,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'arena-champion', title: 'Arena Champion',
        description: 'You won a ComePlayers tournament. Receive CP 400,000.',
        iconKey: 'arena-champion', rarity: FortuneCardRarity.Epic, animationKey: 'trophy-flare',
        effectType: FortuneEffectType.EarnMoney, effectValue: 400_000,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'server-maintenance', title: 'Server Maintenance',
        description: 'Emergency server costs charge CP 80,000.',
        iconKey: 'server-maintenance', rarity: FortuneCardRarity.Common, animationKey: 'warning-pulse',
        effectType: FortuneEffectType.LoseMoney, effectValue: 80_000,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'marketplace-fee', title: 'Marketplace Fee',
        description: 'A license invoice is due. Pay CP 160,000.',
        iconKey: 'marketplace-fee', rarity: FortuneCardRarity.Rare, animationKey: 'coin-drain',
        effectType: FortuneEffectType.LoseMoney, effectValue: 160_000,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'patch-momentum', title: 'Patch Momentum',
        description: 'Your update succeeded. Move forward 3 spaces.',
        iconKey: 'patch-momentum', rarity: FortuneCardRarity.Common, animationKey: 'speed-lines',
        effectType: FortuneEffectType.MoveSteps, effectValue: 3,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'backtrack-bug', title: 'Backtrack Bug',
        description: 'An old bug returned. Move back 2 spaces.',
        iconKey: 'backtrack-bug', rarity: FortuneCardRarity.Common, animationKey: 'glitch-rewind',
        effectType: FortuneEffectType.MoveSteps, effectValue: -2,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'community-express', title: 'Community Express',
        description: 'The community carries you forward 5 spaces.',
        iconKey: 'community-express', rarity: FortuneCardRarity.Rare, animationKey: 'express-trail',
        effectType: FortuneEffectType.MoveSteps, effectValue: 5,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'island-timeout', title: 'Island Timeout',
        description: 'A moderator issued a timeout. Go directly to the Island.',
        iconKey: 'island-timeout', rarity: FortuneCardRarity.Rare, animationKey: 'island-warp',
        effectType: FortuneEffectType.GoToIsland, effectValue: 0,
        targetType: FortuneTargetType.Self, duration: 2, isConsumable: true,
    },
    {
        id: 'moderator-pardon', title: 'Moderator Pardon',
        description: 'The timeout was cancelled. Leave the Island immediately.',
        iconKey: 'moderator-pardon', rarity: FortuneCardRarity.Rare, animationKey: 'unlock-flare',
        effectType: FortuneEffectType.LeaveIsland, effectValue: 0,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'rent-coupon', title: 'Rent Coupon',
        description: 'Get a 50% rent discount for 2 payments.',
        iconKey: 'rent-coupon', rarity: FortuneCardRarity.Rare, animationKey: 'coupon-stamp',
        effectType: FortuneEffectType.RentDiscount, effectValue: 50,
        targetType: FortuneTargetType.Self, duration: 2, isConsumable: true,
    },
    {
        id: 'vip-rent-waiver', title: 'VIP Rent Waiver',
        description: 'Your next rent payment is free.',
        iconKey: 'vip-rent-waiver', rarity: FortuneCardRarity.Epic, animationKey: 'vip-shimmer',
        effectType: FortuneEffectType.RentDiscount, effectValue: 100,
        targetType: FortuneTargetType.Self, duration: 1, isConsumable: true,
    },
    {
        id: 'community-takeover', title: 'Community Takeover',
        description: 'Take over one rival property, excluding Landmarks and protected properties.',
        iconKey: 'community-takeover', rarity: FortuneCardRarity.Legendary, animationKey: 'ownership-surge',
        effectType: FortuneEffectType.TakeoverProperty, effectValue: 1,
        targetType: FortuneTargetType.OpponentProperty, duration: 0, isConsumable: true,
    },
    {
        id: 'founder-firewall', title: 'Founder Firewall',
        description: 'Protect your best property from 2 takeover attempts.',
        iconKey: 'founder-firewall', rarity: FortuneCardRarity.Epic, animationKey: 'shield-grid',
        effectType: FortuneEffectType.ProtectProperty, effectValue: 1,
        targetType: FortuneTargetType.OwnedProperty, duration: 2, isConsumable: true,
    },
    {
        id: 'express-blueprint', title: 'Express Blueprint',
        description: 'Your next building upgrade is free.',
        iconKey: 'express-blueprint', rarity: FortuneCardRarity.Rare, animationKey: 'blueprint-open',
        effectType: FortuneEffectType.BuildingBonus, effectValue: 1,
        targetType: FortuneTargetType.Self, duration: 1, isConsumable: true,
    },
    {
        id: 'master-builder', title: 'Master Builder',
        description: 'Your next two building upgrades are free.',
        iconKey: 'master-builder', rarity: FortuneCardRarity.Legendary, animationKey: 'build-burst',
        effectType: FortuneEffectType.BuildingBonus, effectValue: 2,
        targetType: FortuneTargetType.Self, duration: 2, isConsumable: true,
    },
    {
        id: 'market-shock', title: 'Market Shock',
        description: 'Every opponent loses CP 75,000.',
        iconKey: 'market-shock', rarity: FortuneCardRarity.Epic, animationKey: 'market-wave',
        effectType: FortuneEffectType.EconomicAttack, effectValue: 75_000,
        targetType: FortuneTargetType.AllOpponents, duration: 0, isConsumable: true,
    },
    {
        id: 'rival-audit', title: 'Rival Audit',
        description: 'The richest opponent loses CP 200,000.',
        iconKey: 'rival-audit', rarity: FortuneCardRarity.Epic, animationKey: 'scan-lock',
        effectType: FortuneEffectType.EconomicAttack, effectValue: 200_000,
        targetType: FortuneTargetType.RichestOpponent, duration: 0, isConsumable: true,
    },
    {
        id: 'portal-sync', title: 'Portal Sync',
        description: 'Swap positions with one random opponent.',
        iconKey: 'portal-sync', rarity: FortuneCardRarity.Epic, animationKey: 'portal-swap',
        effectType: FortuneEffectType.SwapPosition, effectValue: 0,
        targetType: FortuneTargetType.RandomOpponent, duration: 0, isConsumable: true,
    },
    {
        id: 'global-boarding-pass', title: 'Global Boarding Pass',
        description: 'Store 1 free World Travel ticket.',
        iconKey: 'global-boarding-pass', rarity: FortuneCardRarity.Legendary, animationKey: 'world-route',
        effectType: FortuneEffectType.FreeWorldTravel, effectValue: 1,
        targetType: FortuneTargetType.Self, duration: 1, isConsumable: true,
    },
    {
        id: 'sponsor-contract', title: 'Sponsor Contract',
        description: 'A tournament sponsor signs your squad. Receive CP 300,000.',
        iconKey: 'sponsor-contract', rarity: FortuneCardRarity.Rare, animationKey: 'contract-flare',
        effectType: FortuneEffectType.EarnMoney, effectValue: 300_000,
        targetType: FortuneTargetType.Self, duration: 0, isConsumable: true,
    },
    {
        id: 'emergency-rent-shield', title: 'Emergency Rent Shield',
        description: 'Reduce the next rent payment by 75%.',
        iconKey: 'emergency-rent-shield', rarity: FortuneCardRarity.Epic, animationKey: 'shield-grid',
        effectType: FortuneEffectType.RentDiscount, effectValue: 75,
        targetType: FortuneTargetType.Self, duration: 1, isConsumable: true,
    },
    {
        id: 'rapid-renovation', title: 'Rapid Renovation',
        description: 'Store one free building upgrade for your next city development.',
        iconKey: 'rapid-renovation', rarity: FortuneCardRarity.Rare, animationKey: 'build-burst',
        effectType: FortuneEffectType.BuildingBonus, effectValue: 1,
        targetType: FortuneTargetType.Self, duration: 1, isConsumable: true,
    },
    {
        id: 'world-circuit-pass', title: 'World Circuit Pass',
        description: 'Store two free World Travel tickets.',
        iconKey: 'world-circuit-pass', rarity: FortuneCardRarity.Legendary, animationKey: 'world-route',
        effectType: FortuneEffectType.FreeWorldTravel, effectValue: 2,
        targetType: FortuneTargetType.Self, duration: 2, isConsumable: true,
    },
] as const;

export function fortuneCardCategory(card: Readonly<FortuneCardData>): FortuneCardCategory {
    switch (card.effectType) {
        case FortuneEffectType.EarnMoney:
        case FortuneEffectType.LoseMoney:
            return FortuneCardCategory.Economy;
        case FortuneEffectType.MoveSteps:
        case FortuneEffectType.GoToIsland:
        case FortuneEffectType.LeaveIsland:
        case FortuneEffectType.SwapPosition:
            return FortuneCardCategory.Movement;
        case FortuneEffectType.RentDiscount:
        case FortuneEffectType.ProtectProperty:
            return FortuneCardCategory.Defense;
        case FortuneEffectType.TakeoverProperty:
        case FortuneEffectType.BuildingBonus:
            return FortuneCardCategory.Property;
        case FortuneEffectType.EconomicAttack:
            return FortuneCardCategory.Attack;
        case FortuneEffectType.FreeWorldTravel:
            return FortuneCardCategory.Travel;
        default:
            return FortuneCardCategory.Economy;
    }
}

export function fortuneEffectPreview(card: Readonly<FortuneCardData>): string {
    switch (card.effectType) {
        case FortuneEffectType.EarnMoney: return `GAIN CP ${card.effectValue.toLocaleString('en-US')}`;
        case FortuneEffectType.LoseMoney: return `PAY CP ${card.effectValue.toLocaleString('en-US')}`;
        case FortuneEffectType.MoveSteps: return `${card.effectValue >= 0 ? 'FORWARD' : 'BACK'} ${Math.abs(card.effectValue)}`;
        case FortuneEffectType.GoToIsland: return `ISLAND ${Math.max(1, card.duration)} TURNS`;
        case FortuneEffectType.LeaveIsland: return 'LEAVE ISLAND';
        case FortuneEffectType.RentDiscount: return `${card.effectValue}% RENT SHIELD x${Math.max(1, card.duration)}`;
        case FortuneEffectType.TakeoverProperty: return 'RIVAL PROPERTY TAKEOVER';
        case FortuneEffectType.ProtectProperty: return `PROPERTY FIREWALL x${Math.max(1, card.duration)}`;
        case FortuneEffectType.BuildingBonus: return `FREE UPGRADE x${Math.max(1, card.duration, card.effectValue)}`;
        case FortuneEffectType.EconomicAttack: return `ATTACK CP ${card.effectValue.toLocaleString('en-US')}`;
        case FortuneEffectType.SwapPosition: return 'SWAP POSITION';
        case FortuneEffectType.FreeWorldTravel: return `FREE TRAVEL x${Math.max(1, card.duration, card.effectValue)}`;
        default: return 'FORTUNE EFFECT';
    }
}
