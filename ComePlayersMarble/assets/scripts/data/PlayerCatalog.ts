export interface LocalPlayerTemplate {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly bot: boolean;
}

export const LOCAL_PLAYER_TEMPLATES: readonly LocalPlayerTemplate[] = [
    { id: 'p1', name: 'YOU', color: '#19c9ff', bot: false },
    { id: 'p2', name: 'BOT NOVA', color: '#ffd21f', bot: true },
    { id: 'p3', name: 'BOT LUX', color: '#e758ff', bot: true },
    { id: 'p4', name: 'BOT ONYX', color: '#50e083', bot: true },
];
