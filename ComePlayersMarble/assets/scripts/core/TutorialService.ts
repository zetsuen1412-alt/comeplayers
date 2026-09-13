export type TutorialStepId = 'WELCOME' | 'ROLL' | 'PROPERTY' | 'SPECIAL_TILES' | 'READY';

export interface TutorialStep {
    readonly id: TutorialStepId;
    readonly title: string;
    readonly description: string;
    readonly focus: string;
}

export interface TutorialSnapshot {
    readonly active: boolean;
    readonly completed: boolean;
    readonly stepIndex: number;
    readonly totalSteps: number;
    readonly step: TutorialStep;
}

export interface TutorialCompletionStore {
    readTutorialCompleted(): boolean;
    writeTutorialCompleted(completed: boolean): void;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
    {
        id: 'WELCOME',
        title: 'WELCOME, CHALLENGER',
        description: 'Build a city empire and finish with the highest net worth. Net worth combines cash, properties, and every building you own.',
        focus: 'GOAL  |  LEAD THE RANKING AFTER ROUND 12',
    },
    {
        id: 'ROLL',
        title: 'ROLL & MOVE',
        description: 'Press ROLL to throw two dice. Your character moves one space at a time, and passing START awards CP 200,000.',
        focus: 'DOUBLE  |  EARN AN EXTRA TURN',
    },
    {
        id: 'PROPERTY',
        title: 'BUILD YOUR EMPIRE',
        description: 'Buy open cities, then upgrade them through Villa, Building, Hotel, and Landmark. Rival cities charge rent and may be taken over when eligible.',
        focus: 'ECONOMY  |  KEEP A SAFE CASH RESERVE',
    },
    {
        id: 'SPECIAL_TILES',
        title: 'MASTER THE BOARD',
        description: 'Fortune, Island, World Travel, Olympic, Game Center, Tax, and Bonus spaces can change the momentum. Read each modal before choosing an action.',
        focus: 'SPECIAL TILES  |  TURN RISK INTO ADVANTAGE',
    },
    {
        id: 'READY',
        title: 'READY TO PLAY',
        description: 'The timer pauses while this guide is open. GUIDE can reopen the tutorial on your turn when no decision is pending.',
        focus: 'COMEPLAYERS MARBLE  |  MAKE EVERY ROLL COUNT',
    },
];

export class TutorialService {
    private active: boolean;
    private completed: boolean;
    private stepIndex = 0;

    public constructor(private readonly store: TutorialCompletionStore) {
        this.completed = this.store.readTutorialCompleted();
        this.active = !this.completed;
    }

    public get isActive(): boolean {
        return this.active;
    }

    public snapshot(): TutorialSnapshot {
        return {
            active: this.active,
            completed: this.completed,
            stepIndex: this.stepIndex,
            totalSteps: TUTORIAL_STEPS.length,
            step: TUTORIAL_STEPS[this.stepIndex] as TutorialStep,
        };
    }

    public next(): TutorialSnapshot {
        if (!this.active) return this.snapshot();
        if (this.stepIndex < TUTORIAL_STEPS.length - 1) {
            this.stepIndex++;
        } else {
            this.complete();
        }
        return this.snapshot();
    }

    public skip(): TutorialSnapshot {
        if (this.active) this.complete();
        return this.snapshot();
    }

    public open(): TutorialSnapshot {
        this.stepIndex = 0;
        this.active = true;
        return this.snapshot();
    }

    private complete(): void {
        this.active = false;
        if (this.completed) return;
        this.completed = true;
        this.store.writeTutorialCompleted(true);
    }
}
