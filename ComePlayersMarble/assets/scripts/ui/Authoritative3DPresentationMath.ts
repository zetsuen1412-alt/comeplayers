export function boardPath(fromTileIndex: number, toTileIndex: number, boardSize = 32): number[] {
    const size = Math.max(1, Math.trunc(boardSize));
    const from = normalizeTile(fromTileIndex, size);
    const to = normalizeTile(toTileIndex, size);
    const distance = (to - from + size) % size;
    if (distance === 0) return [];
    return Array.from({ length: distance }, (_, index) => (from + index + 1) % size);
}

export function shouldForceAuthoritativeReconcile(
    initialized: boolean,
    snapshotSequence: number,
    lastPresentedSequence: number,
): boolean {
    if (!initialized) return false;
    const snapshot = Math.max(0, Math.trunc(snapshotSequence));
    const presented = Math.max(0, Math.trunc(lastPresentedSequence));
    return snapshot > presented + 1;
}

export function shouldAcceptPresentationSequence(
    incomingSequence: number,
    lastPresentedSequence: number,
    queuedSequences: readonly number[],
): boolean {
    const incoming = Math.trunc(incomingSequence);
    if (incoming <= 0 || incoming <= Math.trunc(lastPresentedSequence)) return false;
    return !queuedSequences.some((sequence) => Math.trunc(sequence) === incoming);
}

function normalizeTile(value: number, size: number): number {
    const integer = Math.trunc(Number.isFinite(value) ? value : 0);
    return ((integer % size) + size) % size;
}
