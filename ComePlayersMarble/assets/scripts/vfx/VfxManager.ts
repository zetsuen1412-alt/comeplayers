import {
    Color,
    Material,
    Mesh,
    MeshRenderer,
    Node,
    primitives,
    tween,
    Tween,
    utils,
    Vec3,
} from 'cc';
import { ObjectPool } from './ObjectPool';
import {
    isVfxRequest,
    VFX_CUES,
    VFX_DEFINITIONS,
    VfxCue,
    VfxRequest,
    VfxShape,
} from './VfxTypes';

export interface VfxManagerSnapshot {
    readonly cueCount: number;
    readonly created: number;
    readonly active: number;
    readonly capacity: number;
    readonly exhausted: number;
    readonly burstsPlayed: number;
    readonly emittedNodes: number;
}

export class VfxManager {
    private readonly root = new Node('RuntimeVFX');
    private readonly pools = new Map<VfxCue, ObjectPool<Node>>();
    private readonly renderers = new Map<Node, MeshRenderer>();
    private readonly meshes = new Map<VfxShape, Mesh>();
    private readonly materials = new Map<string, Material>();
    private destroyed = false;
    private burstsPlayed = 0;
    private emittedNodes = 0;

    public constructor(host: Node) {
        host.addChild(this.root);
        for (const cue of VFX_CUES) this.pools.set(cue, this.createPool(cue));
    }

    public handle(payload: unknown): boolean {
        if (!isVfxRequest(payload)) return false;
        return this.play(payload);
    }

    public play(request: VfxRequest): boolean {
        if (this.destroyed) return false;
        const count = Math.max(1, Math.min(12, Math.trunc(request.count ?? 1)));
        const radius = Math.max(0, Math.min(4, request.radius ?? 0));
        let played = 0;
        for (let index = 0; index < count; index++) {
            const angle = count === 1 ? 0 : index / count * Math.PI * 2;
            const ring = count === 1 ? 0 : radius * (0.45 + (index % 3) * 0.2);
            if (this.playSingle(request, Math.cos(angle) * ring, Math.sin(angle) * ring, index)) played += 1;
        }
        if (played > 0) {
            this.burstsPlayed += 1;
            this.emittedNodes += played;
        }
        return played > 0;
    }

    public snapshot(): VfxManagerSnapshot {
        let created = 0;
        let active = 0;
        let capacity = 0;
        let exhausted = 0;
        for (const pool of Array.from(this.pools.values())) {
            const snapshot = pool.snapshot();
            created += snapshot.created;
            active += snapshot.active;
            capacity += snapshot.capacity;
            exhausted += snapshot.exhausted;
        }
        return { cueCount: this.pools.size, created, active, capacity, exhausted, burstsPlayed: this.burstsPlayed, emittedNodes: this.emittedNodes };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const pool of Array.from(this.pools.values())) pool.destroy();
        this.pools.clear();
        this.renderers.clear();
        for (const material of Array.from(this.materials.values())) material.destroy();
        this.materials.clear();
        for (const mesh of Array.from(this.meshes.values())) mesh.destroy();
        this.meshes.clear();
        if (this.root.isValid) this.root.destroy();
    }

    private playSingle(request: VfxRequest, offsetX: number, offsetZ: number, sequenceIndex: number): boolean {
        const definition = VFX_DEFINITIONS[request.cue];
        const pool = this.pools.get(request.cue);
        const node = pool?.acquire();
        if (!pool || !node) return false;

        const renderer = this.renderers.get(node);
        if (!renderer) {
            pool.release(node);
            return false;
        }
        renderer.material = this.material(request.colorHex ?? definition.defaultColor);

        const delay = Math.min(0.18, sequenceIndex * 0.025);
        const start = new Vec3(request.x + offsetX, request.y + 0.28, request.z + offsetZ);
        const middle = start.clone().add3f(offsetX * 0.42, definition.lift, offsetZ * 0.42);
        const end = middle.clone().add3f(offsetX * 0.12, definition.lift * 0.18, offsetZ * 0.12);
        const scaleVariation = 1 + (sequenceIndex % 3) * 0.08;
        node.setPosition(start);
        node.setScale(uniformScale(definition.startScale * scaleVariation));

        tween(node)
            .delay(delay)
            .to(definition.duration * 0.62, { position: middle, scale: uniformScale(definition.peakScale * scaleVariation) }, { easing: 'quadOut' })
            .to(definition.duration * 0.38, { position: end, scale: uniformScale(0.02) }, { easing: 'quadIn' })
            .call(() => pool.release(node))
            .start();
        return true;
    }

    private createPool(cue: VfxCue): ObjectPool<Node> {
        const definition = VFX_DEFINITIONS[cue];
        return new ObjectPool<Node>({
            initialSize: definition.initialPoolSize,
            maxSize: definition.maxPoolSize,
            create: (index) => this.createEffectNode(cue, definition.shape, index),
            onAcquire: (node) => {
                Tween.stopAllByTarget(node);
                node.active = true;
            },
            onRelease: (node) => {
                Tween.stopAllByTarget(node);
                node.active = false;
            },
            onDestroy: (node) => {
                if (node.isValid) node.destroy();
            },
        });
    }

    private createEffectNode(cue: VfxCue, shape: VfxShape, index: number): Node {
        const node = new Node(`VFX-${cue}-${index}`);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = this.mesh(shape);
        renderer.material = this.material(VFX_DEFINITIONS[cue].defaultColor);
        node.active = false;
        this.root.addChild(node);
        this.renderers.set(node, renderer);
        return node;
    }

    private mesh(shape: VfxShape): Mesh {
        const cached = this.meshes.get(shape);
        if (cached) return cached;
        const geometry = shape === VfxShape.Disc
            ? primitives.cylinder(0.55, 0.55, 0.08)
            : shape === VfxShape.Pillar
                ? primitives.cylinder(0.2, 0.48, 0.95)
                : primitives.box({ width: 0.48, height: 0.48, length: 0.48 });
        const mesh = utils.createMesh(geometry);
        this.meshes.set(shape, mesh);
        return mesh;
    }

    private material(hex: string): Material {
        const key = hex.toLowerCase();
        const cached = this.materials.get(key);
        if (cached) return cached;
        const color = new Color();
        Color.fromHEX(color, hex);
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_COLOR: true } });
        material.setProperty('mainColor', color);
        this.materials.set(key, material);
        return material;
    }
}

function uniformScale(value: number): Vec3 {
    return new Vec3(value, value, value);
}
