import { Color, Material, Mesh, MeshRenderer, Node, primitives, resources, utils, Vec3 } from 'cc';
import {
    DICE_FACE_DEFINITIONS,
    DiceSkinPreset,
    diceSkinDefinition,
    normalizeDiceSkinPreset,
} from './DicePresentationTypes';

const DIE_SIZE = 1.24;
const FACE_FRAME_SIZE = 1.145;
const FACE_FRAME_DEPTH = 0.026;
const FACE_FRAME_OFFSET = 0.624;
const FACE_PANEL_SIZE = 1.055;
const FACE_PANEL_DEPTH = 0.052;
const FACE_PANEL_OFFSET = 0.638;
const PIP_SOCKET_RADIUS = 0.132;
const PIP_RING_RADIUS = 0.112;
const PIP_CAP_RADIUS = 0.078;
const PIP_SPACING = 0.255;
const PIP_SOCKET_OFFSET = 0.662;
const PIP_RING_OFFSET = 0.681;
const PIP_CAP_OFFSET = 0.704;
const PIPS_PER_DIE = 21;
const CORNER_ACCENTS_PER_DIE = 8;
const EDGE_TRIMS_PER_DIE = 12;
const FACE_PANELS_PER_DIE = 6;
const FACE_FRAMES_PER_DIE = 6;

export interface DiceVisualSnapshot {
    readonly skinPreset: DiceSkinPreset;
    readonly skinName: string;
    readonly createdDice: number;
    readonly facesPerDie: number;
    readonly pipsPerDie: number;
    readonly totalPips: number;
    readonly cornerAccentsPerDie: number;
    readonly edgeTrimsPerDie: number;
    readonly facePanelsPerDie: number;
    readonly faceFramesPerDie: number;
    readonly pipLayersPerPip: number;
    readonly sharedMeshCount: number;
    readonly sharedMaterialCount: number;
}

/**
 * Builds premium layered dice entirely at runtime.
 * V73 extends the V72 shell with framed face recesses and triple-layer pips.
 * The extra socket layer and stepped face geometry produce stronger contact shadows.
 */
export class DiceVisualFactory {
    private readonly shellMesh: Mesh;
    private readonly frameMesh: Mesh;
    private readonly panelMesh: Mesh;
    private readonly pipSocketMesh: Mesh;
    private readonly pipRingMesh: Mesh;
    private readonly pipCapMesh: Mesh;
    private readonly cornerMesh: Mesh;
    private readonly edgeMesh: Mesh;
    private readonly shellMaterial: Material;
    private readonly frameMaterial: Material;
    private readonly panelMaterial: Material;
    private readonly pipSocketMaterial: Material;
    private readonly pipRingMaterial: Material;
    private readonly pipCapMaterial: Material;
    private readonly trimMaterial: Material;
    private skinPreset = DiceSkinPreset.ComePlayersGold;
    private createdDice = 0;
    private destroyed = false;

    public constructor(initialSkin: DiceSkinPreset = DiceSkinPreset.ComePlayersGold) {
        this.shellMesh = utils.createMesh(primitives.box({ width: DIE_SIZE, height: DIE_SIZE, length: DIE_SIZE }));
        this.frameMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        this.panelMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        this.pipSocketMesh = utils.createMesh(primitives.sphere(PIP_SOCKET_RADIUS, { segments: 20 }));
        this.pipRingMesh = utils.createMesh(primitives.sphere(PIP_RING_RADIUS, { segments: 16 }));
        this.pipCapMesh = utils.createMesh(primitives.sphere(PIP_CAP_RADIUS, { segments: 16 }));
        this.cornerMesh = utils.createMesh(primitives.sphere(0.105, { segments: 12 }));
        this.edgeMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));

        this.shellMaterial = this.createMaterial('TRIM');
        this.frameMaterial = this.createMaterial('TRIM');
        this.panelMaterial = this.createMaterial('BODY');
        this.pipSocketMaterial = this.createMaterial('BODY');
        this.pipRingMaterial = this.createMaterial('TRIM');
        this.pipCapMaterial = this.createMaterial('PIP');
        this.trimMaterial = this.createMaterial('TRIM');
        this.setSkin(initialSkin);
    }

    public createDie(name: string): Node {
        if (this.destroyed) throw new Error('Cannot create dice after visual resources are destroyed.');

        const die = new Node(name);
        this.addMeshNode(die, 'MetallicShell', this.shellMesh, this.shellMaterial);
        this.addFaceFrames(die);
        this.addFacePanels(die);
        this.addPips(die);
        this.addEdgeTrims(die);
        this.addCornerAccents(die);

        this.createdDice += 1;
        return die;
    }

    public setSkin(preset: DiceSkinPreset): DiceSkinPreset {
        if (this.destroyed) return this.skinPreset;
        this.skinPreset = normalizeDiceSkinPreset(preset);
        const definition = diceSkinDefinition(this.skinPreset);
        this.applyColor(this.frameMaterial, definition.trimColorHex);
        this.applyColor(this.panelMaterial, definition.bodyColorHex);
        this.applyColor(this.pipSocketMaterial, '#050608');
        this.applyColor(this.pipCapMaterial, definition.pipColorHex);
        this.applyColor(this.shellMaterial, definition.trimColorHex);
        this.applyColor(this.trimMaterial, definition.trimColorHex);
        this.applyColor(this.pipRingMaterial, definition.pipRingColorHex);
        return this.skinPreset;
    }

    public snapshot(): DiceVisualSnapshot {
        const definition = diceSkinDefinition(this.skinPreset);
        return {
            skinPreset: this.skinPreset,
            skinName: definition.displayName,
            createdDice: this.createdDice,
            facesPerDie: DICE_FACE_DEFINITIONS.length,
            pipsPerDie: PIPS_PER_DIE,
            totalPips: this.createdDice * PIPS_PER_DIE,
            cornerAccentsPerDie: CORNER_ACCENTS_PER_DIE,
            edgeTrimsPerDie: EDGE_TRIMS_PER_DIE,
            facePanelsPerDie: FACE_PANELS_PER_DIE,
            faceFramesPerDie: FACE_FRAMES_PER_DIE,
            pipLayersPerPip: 3,
            sharedMeshCount: 8,
            sharedMaterialCount: 7,
        };
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const material of [
            this.shellMaterial,
            this.frameMaterial,
            this.panelMaterial,
            this.pipSocketMaterial,
            this.pipRingMaterial,
            this.pipCapMaterial,
            this.trimMaterial,
        ]) material.destroy();
        for (const mesh of [
            this.shellMesh,
            this.frameMesh,
            this.panelMesh,
            this.pipSocketMesh,
            this.pipRingMesh,
            this.pipCapMesh,
            this.cornerMesh,
            this.edgeMesh,
        ]) mesh.destroy();
    }


    private addFaceFrames(die: Node): void {
        const frames = new Node('MetallicFaceFrames');
        die.addChild(frames);
        for (const face of DICE_FACE_DEFINITIONS) {
            const frame = this.addMeshNode(frames, `FaceFrame-${face.value}`, this.frameMesh, this.frameMaterial);
            const normal = face.normal;
            frame.setPosition(normal[0] * FACE_FRAME_OFFSET, normal[1] * FACE_FRAME_OFFSET, normal[2] * FACE_FRAME_OFFSET);
            frame.setScale(new Vec3(
                normal[0] === 0 ? FACE_FRAME_SIZE : FACE_FRAME_DEPTH,
                normal[1] === 0 ? FACE_FRAME_SIZE : FACE_FRAME_DEPTH,
                normal[2] === 0 ? FACE_FRAME_SIZE : FACE_FRAME_DEPTH,
            ));
        }
    }

    private addFacePanels(die: Node): void {
        const panels = new Node('InsetFacePanels');
        die.addChild(panels);
        for (const face of DICE_FACE_DEFINITIONS) {
            const panel = this.addMeshNode(panels, `FacePanel-${face.value}`, this.panelMesh, this.panelMaterial);
            const normal = face.normal;
            panel.setPosition(normal[0] * FACE_PANEL_OFFSET, normal[1] * FACE_PANEL_OFFSET, normal[2] * FACE_PANEL_OFFSET);
            panel.setScale(new Vec3(
                normal[0] === 0 ? FACE_PANEL_SIZE : FACE_PANEL_DEPTH,
                normal[1] === 0 ? FACE_PANEL_SIZE : FACE_PANEL_DEPTH,
                normal[2] === 0 ? FACE_PANEL_SIZE : FACE_PANEL_DEPTH,
            ));
        }
    }

    private addPips(die: Node): void {
        const pips = new Node('LayeredPips');
        die.addChild(pips);
        for (const face of DICE_FACE_DEFINITIONS) {
            face.pips.forEach((coordinate, index) => {
                const u = coordinate[0] * PIP_SPACING;
                const v = coordinate[1] * PIP_SPACING;
                const socket = this.addMeshNode(pips, `PipSocket-${face.value}-${index + 1}`, this.pipSocketMesh, this.pipSocketMaterial);
                const ring = this.addMeshNode(pips, `PipRing-${face.value}-${index + 1}`, this.pipRingMesh, this.pipRingMaterial);
                const cap = this.addMeshNode(pips, `PipCap-${face.value}-${index + 1}`, this.pipCapMesh, this.pipCapMaterial);
                this.placePipLayer(socket, face.normal, face.tangent, face.bitangent, u, v, PIP_SOCKET_OFFSET, 0.38);
                this.placePipLayer(ring, face.normal, face.tangent, face.bitangent, u, v, PIP_RING_OFFSET, 0.48);
                this.placePipLayer(cap, face.normal, face.tangent, face.bitangent, u, v, PIP_CAP_OFFSET, 0.42);
            });
        }
    }

    private placePipLayer(
        node: Node,
        normal: readonly [number, number, number],
        tangent: readonly [number, number, number],
        bitangent: readonly [number, number, number],
        u: number,
        v: number,
        offset: number,
        depthScale: number,
    ): void {
        node.setPosition(new Vec3(
            normal[0] * offset + tangent[0] * u + bitangent[0] * v,
            normal[1] * offset + tangent[1] * u + bitangent[1] * v,
            normal[2] * offset + tangent[2] * u + bitangent[2] * v,
        ));
        node.setScale(new Vec3(
            normal[0] === 0 ? 1 : depthScale,
            normal[1] === 0 ? 1 : depthScale,
            normal[2] === 0 ? 1 : depthScale,
        ));
    }

    private addEdgeTrims(die: Node): void {
        const edges = new Node('MetallicEdgeRails');
        die.addChild(edges);
        const railLength = 1.02;
        const railThickness = 0.055;
        const edgeOffset = 0.605;

        for (const y of [-1, 1]) {
            for (const z of [-1, 1]) {
                const edge = this.addMeshNode(edges, `Edge-X-${y}-${z}`, this.edgeMesh, this.trimMaterial);
                edge.setPosition(0, y * edgeOffset, z * edgeOffset);
                edge.setScale(railLength, railThickness, railThickness);
            }
        }
        for (const x of [-1, 1]) {
            for (const z of [-1, 1]) {
                const edge = this.addMeshNode(edges, `Edge-Y-${x}-${z}`, this.edgeMesh, this.trimMaterial);
                edge.setPosition(x * edgeOffset, 0, z * edgeOffset);
                edge.setScale(railThickness, railLength, railThickness);
            }
        }
        for (const x of [-1, 1]) {
            for (const y of [-1, 1]) {
                const edge = this.addMeshNode(edges, `Edge-Z-${x}-${y}`, this.edgeMesh, this.trimMaterial);
                edge.setPosition(x * edgeOffset, y * edgeOffset, 0);
                edge.setScale(railThickness, railThickness, railLength);
            }
        }
    }

    private addCornerAccents(die: Node): void {
        const corners = new Node('RoundedCornerCaps');
        die.addChild(corners);
        for (const x of [-1, 1]) {
            for (const y of [-1, 1]) {
                for (const z of [-1, 1]) {
                    const accent = this.addMeshNode(corners, `Corner-${x}-${y}-${z}`, this.cornerMesh, this.trimMaterial);
                    accent.setPosition(x * 0.595, y * 0.595, z * 0.595);
                }
            }
        }
    }

    private addMeshNode(parent: Node, name: string, mesh: Mesh, material: Material): Node {
        const node = new Node(name);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(material, 0);
        renderer.shadowCastingMode = 1;
        renderer.receiveShadow = 1;
        parent.addChild(node);
        return node;
    }

    private createMaterial(role: 'BODY' | 'PIP' | 'TRIM'): Material {
        const material = new Material();
        const pbrTemplate = resources.get<Material>('materials/V67Standard', Material);
        if (pbrTemplate?.effectAsset) {
            material.initialize({ effectAsset: pbrTemplate.effectAsset });
            material.setProperty('roughness', role === 'BODY' ? 0.12 : role === 'PIP' ? 0.2 : 0.08);
            material.setProperty('metallic', role === 'BODY' ? 0.38 : role === 'PIP' ? 0.08 : 0.92);
            material.setProperty('specularIntensity', role === 'PIP' ? 0.72 : 0.96);
        } else {
            material.initialize({ effectName: 'builtin-unlit', defines: { USE_COLOR: true } });
        }
        return material;
    }

    private applyColor(material: Material, hex: string): void {
        const color = new Color();
        Color.fromHEX(color, hex);
        material.setProperty('mainColor', color);
    }
}
