export interface ClassicPresentationTimingProfile {
    readonly diceRevealHoldMs: number;
    readonly tileFocusHoldMs: number;
    readonly resolutionHoldMs: number;
    readonly fortuneRevealHoldMs: number;
    readonly gameCenterResultHoldMs: number;
    readonly specialResultHoldMs: number;
    readonly victoryBannerHoldMs: number;
    readonly overviewSettleMs: number;
}

export const CLASSIC_PRESENTATION_TIMING: ClassicPresentationTimingProfile = {
    diceRevealHoldMs: 980,
    tileFocusHoldMs: 420,
    resolutionHoldMs: 650,
    fortuneRevealHoldMs: 1_150,
    gameCenterResultHoldMs: 1_400,
    specialResultHoldMs: 880,
    victoryBannerHoldMs: 1_850,
    overviewSettleMs: 420,
};
