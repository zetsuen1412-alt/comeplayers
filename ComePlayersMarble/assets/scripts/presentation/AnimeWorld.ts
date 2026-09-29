import { Color, Node, primitives, Vec3 } from 'cc';
import { BoardTileData, TileType } from '../data/BoardData';
import { ANIME, ANIME_DISTRICTS, AnimePrimitive, mixAnime } from './AnimeTheme';

/** Rounded mesh with shared dimensions and a small, fixed vertex budget. */
export function roundedAnimeBox(width: number, height: number, length: number, rounding = 0.16): primitives.IGeometry {
    const half = [width / 2, height / 2, length / 2];
    const r = Math.max(0.001, Math.min(rounding, ...half.map(v => v * 0.8)));
    const core = half.map(v => v - r);
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const faces = [
        [[1,0,0],[0,0,-1],[0,1,0]], [[-1,0,0],[0,0,1],[0,1,0]],
        [[0,1,0],[1,0,0],[0,0,-1]], [[0,-1,0],[1,0,0],[0,0,1]],
        [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]],
    ];
    for (const [normal, u, v] of faces) {
        const axisU = u.findIndex(n => n !== 0), axisV = v.findIndex(n => n !== 0);
        const us = [-half[axisU], -core[axisU], core[axisU], half[axisU]];
        const vs = [-half[axisV], -core[axisV], core[axisV], half[axisV]];
        const start = positions.length / 3;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const p = half.map((h, k) => normal[k] * h + u[k] * us[x] + v[k] * vs[y]);
            const q = p.map((n, k) => Math.max(-core[k], Math.min(core[k], n)));
            const n = p.map((a, k) => a - q[k]);
            const magnitude = Math.hypot(...n) || 1;
            for (let k = 0; k < 3; k++) { normals.push(n[k] / magnitude); positions.push(q[k] + n[k] / magnitude * r); }
            uvs.push(x / 3, y / 3);
        }
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
            const a = start + y * 4 + x;
            indices.push(a, a + 1, a + 5, a, a + 5, a + 4);
        }
    }
    return { positions, normals, uvs, indices,
        minPos: { x: -half[0], y: -half[1], z: -half[2] },
        maxPos: { x: half[0], y: half[1], z: half[2] } };
}
function part(parent: Node, make: AnimePrimitive, name: string, geometry: primitives.IGeometry,
    color: Color, x: number, y: number, z: number): Node {
    const node = make(name, geometry, color, 'MATTE');
    node.setPosition(x, y, z); parent.addChild(node); return node;
}
function orb(parent: Node, make: AnimePrimitive, name: string, color: Color,
    x: number, y: number, z: number, sx: number, sy: number, sz: number): Node {
    const node = part(parent, make, name, primitives.sphere(1, { segments: 12 }), color, x, y, z);
    node.setScale(sx, sy, sz); return node;
}
function toyTree(parent: Node, make: AnimePrimitive, x: number, z: number, color: Color): void {
    part(parent, make, 'AnimeTreeTrunk', primitives.cylinder(0.10, 0.14, 0.65, { radialSegments: 8 }),
        new Color(169, 117, 93), x, 0.1, z);
    orb(parent, make, 'AnimeTreeCrown', color, x, 0.72, z, 0.56, 0.63, 0.5);
}
export function createAnimeFloor(root: Node, make: AnimePrimitive, lamps: Node[]): void {
    part(root, make, 'AnimeTableV108', roundedAnimeBox(35.8, 0.65, 34, 0.28), ANIME.sky, 0, -1.1, 0);
    part(root, make, 'AnimeBoardOutlineV108', roundedAnimeBox(28.6, 0.38, 28.6), ANIME.edge, 0, -0.51, 0);
    part(root, make, 'AnimeBoardFrameV108', roundedAnimeBox(28.2, 0.42, 28.2), ANIME.lavender, 0, -0.23, 0);
    part(root, make, 'AnimeBoardPaperV108', roundedAnimeBox(27.6, 0.2, 27.6), ANIME.paper, 0, 0.11, 0);
    part(root, make, 'AnimeArenaBorderV108', roundedAnimeBox(17.35, 0.2, 17.35), ANIME.mint, 0, 0.46, 0);
    part(root, make, 'AnimeDiceArenaV108', roundedAnimeBox(16.85, 0.16, 16.85), new Color(211, 239, 249), 0, 0.62, 0);
    // Keep the actual dice lane unobstructed. Only a low painted emblem lives here.
    part(root, make, 'AnimeArenaEmblemV108', primitives.cylinder(1.8, 1.8, 0.035, { radialSegments: 32 }),
        ANIME.paper, 0, 0.72, 0);
    for (let i = 0; i < 4; i++) {
        const x = i % 2 === 0 ? -5.5 : 5.5, z = i < 2 ? -5.5 : 5.5;
        lamps.push(orb(root, make, `AnimeTurnLampV108-${i}`, ANIME_DISTRICTS[i], x, 0.9, z, 0.17, 0.12, 0.17));
    }
    // All tall scenery is OUTSIDE the property track; no new movement or camera logic.
    for (let i = 0; i < 8; i++) {
        const z = -12 + i * 3.45;
        toyTree(root, make, -16, z, i % 2 ? ANIME.mint : ANIME.coral);
        if (i % 2 === 0) toyTree(root, make, 16, z, ANIME.lavender);
    }
    for (let i = 0; i < 3; i++) {
        const x = -10 + i * 10;
        for (let p = -1; p <= 1; p++) orb(root, make, `AnimeCloudV108-${i}-${p}`,
            ANIME.paper, x + p * 0.65, -0.05 + (p === 0 ? 0.12 : 0), -16,
            0.72, p === 0 ? 0.5 : 0.34, 0.44);
    }
}
export function animeDistrict(tile: BoardTileData): Color {
    if (tile.tileType === TileType.City) {
        const group = Number.parseInt(tile.colorGroup.replace('group-', ''), 10);
        return ANIME_DISTRICTS[((Number.isFinite(group) ? group : 0) % 8 + 8) % 8];
    }
    switch (tile.tileType) {
        case TileType.Fortune: return ANIME.lavender;
        case TileType.Tax: return ANIME.coral;
        case TileType.Bonus: case TileType.GameCenter: return ANIME.gold;
        case TileType.WorldTravel: return ANIME.mint;
        default: return ANIME.blue;
    }
}
export function createAnimeTile(root: Node, tile: BoardTileData, make: AnimePrimitive): void {
    const side = Math.floor(tile.index / 8), horizontal = side % 2 === 0, corner = tile.index % 8 === 0;
    const w = corner ? 3.4 : horizontal ? 2.30 : 3.28;
    const d = corner ? 3.4 : horizontal ? 3.28 : 2.30;
    const color = animeDistrict(tile);
    const node = new Node(`AnimeTileV108-${tile.index}`); node.setPosition(tile.worldPosition); root.addChild(node);
    part(node, make, 'AnimeTileOutline', roundedAnimeBox(w + 0.08, 0.25, d + 0.08, 0.10), ANIME.edge, 0, 0.3, 0);
    part(node, make, 'AnimeTileFace', roundedAnimeBox(w, 0.28, d, 0.12),
        mixAnime(ANIME.paper, color, corner ? 0.24 : 0.05), 0, 0.49, 0);
    const dx = side === 1 ? 0.93 : side === 3 ? -0.93 : 0;
    const dz = side === 0 ? -0.93 : side === 2 ? 0.93 : 0;
    part(node, make, 'AnimeDistrictBand', roundedAnimeBox(horizontal ? w - 0.18 : 0.65, 0.12,
        horizontal ? 0.65 : d - 0.18, 0.055), color, dx, 0.70, dz);
    const count = corner ? 3 : Math.max(1, Math.min(3, Math.ceil(tile.purchasePrice / 120000)));
    for (let i = 0; i < count; i++) orb(node, make, 'AnimePricePip', ANIME.paper,
        dx + (horizontal ? (i - (count - 1) / 2) * 0.33 : 0), 0.79,
        dz + (horizontal ? 0 : (i - (count - 1) / 2) * 0.33), 0.075, 0.04, 0.075);
    if (tile.tileType !== TileType.City) {
        // A small, friendly badge leaves space for a player and property label.
        part(node, make, 'AnimeSpecialBadge', primitives.cylinder(0.28, 0.28, 0.055, { radialSegments: 16 }), color, 0, 0.67, 0);
        if (tile.tileType === TileType.Tourist) {
            const tower = part(node, make, 'AnimeTouristTower', roundedAnimeBox(0.34, 0.6, 0.34, 0.08),
                ANIME.paper, 0, 0.97, -0.25);
            orb(tower, make, 'AnimeTouristDome', color, 0, 0.37, 0, 0.27, 0.22, 0.27);
        }
    }
}
/** Equal chibi treatment for human and bot pieces. Rig and animation controller stay in BoardView. */
export function createAnimePlayer(name: string, color: Color, bot: boolean, make: AnimePrimitive): Node {
    const root = new Node(name);
    const skin = new Color(255, 222, 199), hair = bot ? mixAnime(color, ANIME.ink, 0.35) : new Color(230, 235, 247);
    part(root, make, 'AnimePlayerBase', primitives.cylinder(0.47, 0.5, 0.08, { radialSegments: 20 }), color, 0, 0.04, 0);
    for (const side of [-1, 1]) {
        orb(root, make, 'AnimeShoe', ANIME.ink, side * 0.19, 0.16, 0.08, 0.18, 0.11, 0.24);
        orb(root, make, 'AnimeLeg', ANIME.paper, side * 0.16, 0.31, 0, 0.105, 0.2, 0.105);
        orb(root, make, 'AnimeSleeve', color, side * 0.34, 0.65, 0, 0.13, 0.23, 0.13);
        orb(root, make, 'AnimeHand', skin, side * 0.35, 0.47, 0.04, 0.115, 0.12, 0.115);
    }
    part(root, make, 'AnimeHoodie', roundedAnimeBox(0.59, 0.65, 0.42, 0.15), color, 0, 0.6, 0);
    part(root, make, 'AnimeHoodieStripe', roundedAnimeBox(0.4, 0.09, 0.03, 0.01), ANIME.gold, 0, 0.49, 0.23);
    orb(root, make, 'AnimeHairBack', hair, 0, 1.29, -0.06, 0.5, 0.49, 0.42);
    orb(root, make, 'AnimeFace', skin, 0, 1.22, 0.055, 0.43, 0.42, 0.36);
    for (const side of [-1, 1]) {
        orb(root, make, 'AnimeEar', skin, side * 0.425, 1.22, 0, 0.085, 0.12, 0.08);
        orb(root, make, 'AnimeEyeWhite', ANIME.paper, side * 0.16, 1.26, 0.364, 0.108, 0.155, 0.025);
        orb(root, make, 'AnimeEyeIris', bot ? color : ANIME.gold, side * 0.16, 1.245, 0.385, 0.075, 0.117, 0.024);
        orb(root, make, 'AnimeEyePupil', ANIME.ink, side * 0.16, 1.245, 0.402, 0.035, 0.087, 0.015);
        orb(root, make, 'AnimeEyeShine', ANIME.paper, side * 0.16 - 0.026, 1.29, 0.418, 0.025, 0.032, 0.01);
        orb(root, make, 'AnimeCheek', ANIME.coral, side * 0.28, 1.10, 0.337, 0.08, 0.035, 0.018);
        const fringe = orb(root, make, 'AnimeFringe', hair, side * 0.22, 1.53, 0.24, 0.2, 0.16, 0.2);
        fringe.setRotationFromEuler(0, 0, side * -24);
        orb(root, make, 'AnimeHeadphone', ANIME.gold, side * 0.48, 1.3, -0.015, 0.075, 0.16, 0.15);
    }
    orb(root, make, 'AnimeSmile', ANIME.ink, 0, 1.04, 0.395, 0.064, 0.023, 0.013);
    orb(root, make, 'AnimeHairTuft', hair, 0.035, 1.7, -0.03, 0.12, 0.14, 0.1);
    return root;
}
export function createAnimeProperty(root: Node, color: Color, level: number, make: AnimePrimitive): void {
    part(root, make, 'AnimePropertyGarden', roundedAnimeBox(1.40, 0.12, 1.12, 0.055), ANIME.mint, 0, 0.06, 0);
    const h = level === 1 ? 0.65 : level === 2 ? 1.02 : level === 3 ? 1.42 : 1.85;
    const w = level >= 3 ? 0.93 : 0.8;
    part(root, make, `AnimePropertyTier-${level}`, roundedAnimeBox(w, h, 0.72, 0.10),
        mixAnime(ANIME.paper, color, 0.12), 0, 0.12 + h / 2, 0);
    const roof = part(root, make, 'AnimePropertyRoof', primitives.cone(w * 0.79, 0.45,
        { radialSegments: level >= 4 ? 8 : 4 }), color, 0, h + 0.30, 0);
    roof.setRotationFromEuler(0, 45, 0);
    for (let row = 0; row < Math.min(3, level); row++) for (const side of [-1, 1]) {
        part(root, make, 'AnimePropertyWindow', roundedAnimeBox(0.16, 0.19, 0.045, 0.02),
            ANIME.blue, side * 0.23, 0.45 + row * 0.35, 0.385);
    }
    part(root, make, 'AnimePropertyDoor', roundedAnimeBox(0.19, 0.31, 0.055, 0.025), color, 0, 0.275, 0.385);
    if (level >= 3) {
        part(root, make, 'AnimeHotelAwning', roundedAnimeBox(0.7, 0.12, 0.24, 0.04), color, 0, 0.62, 0.44);
    }
    if (level >= 4) {
        for (const side of [-1, 1]) {
            part(root, make, 'AnimeLandmarkTurret', primitives.cylinder(0.18, 0.21, 1.35,
                { radialSegments: 12 }), color, side * 0.52, 0.79, 0);
            part(root, make, 'AnimeLandmarkTurretRoof', primitives.cone(0.28, 0.4,
                { radialSegments: 12 }), ANIME.gold, side * 0.52, 1.61, 0);
        }
        orb(root, make, 'AnimeLandmarkCrown', ANIME.gold, 0, h + 0.62, 0, 0.15, 0.17, 0.15);
    }
}
