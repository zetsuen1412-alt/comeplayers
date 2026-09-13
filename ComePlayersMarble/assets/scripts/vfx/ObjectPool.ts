export interface ObjectPoolOptions<T> {
    readonly initialSize: number;
    readonly maxSize: number;
    readonly create: (index: number) => T;
    readonly onAcquire?: (item: T) => void;
    readonly onRelease?: (item: T) => void;
    readonly onDestroy?: (item: T) => void;
}

export interface ObjectPoolSnapshot {
    readonly created: number;
    readonly active: number;
    readonly available: number;
    readonly capacity: number;
    readonly exhausted: number;
}

export class ObjectPool<T> {
    private readonly all: T[] = [];
    private readonly available: T[] = [];
    private readonly active = new Set<T>();
    private readonly capacity: number;
    private exhausted = 0;
    private destroyed = false;

    public constructor(private readonly options: ObjectPoolOptions<T>) {
        this.capacity = Math.max(1, Math.floor(options.maxSize));
        const initialSize = Math.max(0, Math.min(Math.floor(options.initialSize), this.capacity));
        for (let index = 0; index < initialSize; index++) {
            this.available.push(this.create());
        }
    }

    public acquire(): T | undefined {
        if (this.destroyed) return undefined;
        const item = this.available.pop()
            ?? (this.all.length < this.capacity ? this.create() : undefined);
        if (item === undefined) {
            this.exhausted++;
            return undefined;
        }
        this.active.add(item);
        this.options.onAcquire?.(item);
        return item;
    }

    public release(item: T): boolean {
        if (this.destroyed || !this.active.delete(item)) return false;
        this.options.onRelease?.(item);
        this.available.push(item);
        return true;
    }

    public releaseAll(): void {
        for (const item of Array.from(this.active)) this.release(item);
    }

    public snapshot(): ObjectPoolSnapshot {
        return {
            created: this.all.length,
            active: this.active.size,
            available: this.available.length,
            capacity: this.capacity,
            exhausted: this.exhausted,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.releaseAll();
        this.destroyed = true;
        for (const item of this.all) this.options.onDestroy?.(item);
        this.active.clear();
        this.available.length = 0;
        this.all.length = 0;
    }

    private create(): T {
        const item = this.options.create(this.all.length);
        this.all.push(item);
        return item;
    }
}
