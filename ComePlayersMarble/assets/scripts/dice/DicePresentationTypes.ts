export type DiceFaceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type DiceVector = readonly [number, number, number];
export type DicePipCoordinate = readonly [number, number];

export enum DiceSkinPreset {
    ComePlayersGold = 0,
    NeonCircuit = 1,
    MarblePearl = 2,
}

export interface DiceSkinDefinition {
    readonly preset: DiceSkinPreset;
    readonly displayName: string;
    readonly bodyColorHex: string;
    readonly pipColorHex: string;
    readonly trimColorHex: string;
    readonly pipRingColorHex: string;
}

export interface DiceFaceDefinition {
    readonly value: DiceFaceValue;
    readonly opposite: DiceFaceValue;
    readonly normal: DiceVector;
    readonly tangent: DiceVector;
    readonly bitangent: DiceVector;
    readonly settleEuler: DiceVector;
    readonly pips: readonly DicePipCoordinate[];
}

const PIP_LAYOUTS: Readonly<Record<DiceFaceValue, readonly DicePipCoordinate[]>> = {
    1: [[0, 0]],
    2: [[-1, 1], [1, -1]],
    3: [[-1, 1], [0, 0], [1, -1]],
    4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
    5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
    6: [[-1, 1], [-1, 0], [-1, -1], [1, 1], [1, 0], [1, -1]],
};

/**
 * The local face assignment preserves the original authority-to-visual mapping:
 * +Y/-Y = 1/6, +X/-X = 2/5, and -Z/+Z = 3/4.
 */
export const DICE_FACE_DEFINITIONS: readonly DiceFaceDefinition[] = [
    {
        value: 1,
        opposite: 6,
        normal: [0, 1, 0],
        tangent: [1, 0, 0],
        bitangent: [0, 0, -1],
        settleEuler: [0, 0, 0],
        pips: PIP_LAYOUTS[1],
    },
    {
        value: 2,
        opposite: 5,
        normal: [1, 0, 0],
        tangent: [0, 0, -1],
        bitangent: [0, 1, 0],
        settleEuler: [0, 0, 90],
        pips: PIP_LAYOUTS[2],
    },
    {
        value: 3,
        opposite: 4,
        normal: [0, 0, -1],
        tangent: [-1, 0, 0],
        bitangent: [0, 1, 0],
        settleEuler: [90, 0, 0],
        pips: PIP_LAYOUTS[3],
    },
    {
        value: 4,
        opposite: 3,
        normal: [0, 0, 1],
        tangent: [1, 0, 0],
        bitangent: [0, 1, 0],
        settleEuler: [-90, 0, 0],
        pips: PIP_LAYOUTS[4],
    },
    {
        value: 5,
        opposite: 2,
        normal: [-1, 0, 0],
        tangent: [0, 0, 1],
        bitangent: [0, 1, 0],
        settleEuler: [0, 0, -90],
        pips: PIP_LAYOUTS[5],
    },
    {
        value: 6,
        opposite: 1,
        normal: [0, -1, 0],
        tangent: [1, 0, 0],
        bitangent: [0, 0, 1],
        settleEuler: [180, 0, 0],
        pips: PIP_LAYOUTS[6],
    },
];

export const DICE_OPPOSITE_FACE_PAIRS: readonly (readonly [DiceFaceValue, DiceFaceValue])[] = [
    [1, 6],
    [2, 5],
    [3, 4],
];

export const DICE_SKIN_DEFINITIONS: Readonly<Record<DiceSkinPreset, DiceSkinDefinition>> = {
    [DiceSkinPreset.ComePlayersGold]: {
        preset: DiceSkinPreset.ComePlayersGold,
        displayName: 'ComePlayers Gold',
        bodyColorHex: '#101318',
        pipColorHex: '#FFF9E8',
        trimColorHex: '#F5C323',
        pipRingColorHex: '#D99A12',
    },
    [DiceSkinPreset.NeonCircuit]: {
        preset: DiceSkinPreset.NeonCircuit,
        displayName: 'Neon Circuit',
        bodyColorHex: '#101A2B',
        pipColorHex: '#DDF9FF',
        trimColorHex: '#1ECAFF',
        pipRingColorHex: '#147DA1',
    },
    [DiceSkinPreset.MarblePearl]: {
        preset: DiceSkinPreset.MarblePearl,
        displayName: 'Marble Pearl',
        bodyColorHex: '#E9EEF7',
        pipColorHex: '#183A66',
        trimColorHex: '#B8C8DC',
        pipRingColorHex: '#6D8EB7',
    },
};

export const DICE_SKIN_PRESETS: readonly DiceSkinPreset[] = [
    DiceSkinPreset.ComePlayersGold,
    DiceSkinPreset.NeonCircuit,
    DiceSkinPreset.MarblePearl,
];

export function normalizeDiceFace(value: number): DiceFaceValue {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(6, Math.trunc(value))) as DiceFaceValue;
}

export function diceFaceDefinition(value: number): DiceFaceDefinition {
    return DICE_FACE_DEFINITIONS[normalizeDiceFace(value) - 1] as DiceFaceDefinition;
}

export function normalizeDiceSkinPreset(value: number): DiceSkinPreset {
    switch (value) {
        case DiceSkinPreset.NeonCircuit:
            return DiceSkinPreset.NeonCircuit;
        case DiceSkinPreset.MarblePearl:
            return DiceSkinPreset.MarblePearl;
        default:
            return DiceSkinPreset.ComePlayersGold;
    }
}

export function diceSkinDefinition(value: number): DiceSkinDefinition {
    return DICE_SKIN_DEFINITIONS[normalizeDiceSkinPreset(value)];
}
