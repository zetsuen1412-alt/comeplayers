export class TurnTimer {
    private remainingSeconds = 0;

    public reset(seconds: number): void {
        this.remainingSeconds = Math.max(0, seconds);
    }

    public tick(deltaSeconds: number): boolean {
        const wasActive = this.remainingSeconds > 0;
        this.remainingSeconds = Math.max(0, this.remainingSeconds - deltaSeconds);
        return wasActive && this.remainingSeconds === 0;
    }

    public stop(): void {
        this.remainingSeconds = 0;
    }

    public get displaySeconds(): number {
        return Math.ceil(this.remainingSeconds);
    }
}
