import { Color, Graphics, Material, Node, primitives } from 'cc';

/** V108: one presentation palette; never change gameplay/ownership values here. */
export const ANIME = Object.freeze({
    ink: new Color(39, 54, 86), paper: new Color(255, 253, 246),
    sky: new Color(164, 221, 250), blue: new Color(92, 188, 238),
    mint: new Color(129, 225, 184), gold: new Color(255, 213, 105),
    coral: new Color(255, 151, 164), lavender: new Color(187, 171, 244),
    edge: new Color(100, 140, 177), shadow: new Color(106, 145, 174),
});
export type AnimeFinish = 'MATTE' | 'GLOSS' | 'METAL' | 'GLOW';
export type AnimePrimitive = (name: string, geometry: primitives.IGeometry,
    color: Color, finish?: AnimeFinish) => Node;
export const ANIME_DISTRICTS: readonly Color[] = [
    ANIME.blue, ANIME.coral, ANIME.gold, ANIME.mint,
    ANIME.lavender, new Color(255, 184, 132), new Color(108, 214, 215), new Color(230, 164, 221),
];

export function mixAnime(a: Color, b: Color, t: number): Color {
    const amount = Math.max(0, Math.min(1, t));
    return new Color(Math.round(a.r + (b.r - a.r) * amount),
        Math.round(a.g + (b.g - a.g) * amount),
        Math.round(a.b + (b.b - a.b) * amount), a.a);
}
function luminance(c: Color): number {
    const f = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return f(c.r) * 0.2126 + f(c.g) * 0.7152 + f(c.b) * 0.0722;
}
/** Keeps semantic hues but makes them readable on the light interface. */
export function animeTextColor(color: Color): Color {
    let result = new Color(color.r, color.g, color.b, 255);
    for (let step = 0; step < 16 && luminance(result) > 0.075; step++) {
        result = mixAnime(result, ANIME.ink, 0.2);
    }
    return result;
}
export function animeSurfaceColor(color: Color, button = false): Color {
    if (!button) return mixAnime(ANIME.paper, color, 0.065);
    const difference = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    if (difference < 28) return new Color(222, 232, 239);
    let surface = mixAnime(color, ANIME.paper, 0.52);
    while (luminance(surface) < 0.55) surface = mixAnime(surface, ANIME.paper, 0.15);
    return surface;
}

/** Baked three-band cel lighting. No optional shader preload or additional pass. */
export function animeGeometry(geometry: primitives.IGeometry, unshaded = false): primitives.IGeometry {
    const colors: number[] = [];
    for (let i = 0; i < geometry.positions.length; i += 3) {
        const normals = geometry.normals;
        const light = normals ? normals[i] * -0.36 + normals[i + 1] * 0.86 + normals[i + 2] * 0.36 : 1;
        const band = unshaded ? 1 : light > 0.5 ? 1 : light > -0.18 ? 0.88 : 0.72;
        colors.push(band, band, Math.min(1, band + 0.035), 1);
    }
    return { ...geometry, colors };
}
export function initializeAnimeMaterial(material: Material, color: Color): void {
    material.initialize({ effectName: 'builtin-unlit', technique: color.a < 255 ? 1 : 0, defines: { USE_COLOR: true, USE_VERTEX_COLOR: true } });
    material.setProperty('mainColor', color);
}

/** Shared by normal panels AND stateful button redraws. */
export function drawAnimePanel(node: Node, width: number, height: number, fill: Color, stroke: Color, button = false): void {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const radius = Math.min(24, height / 2, width / 2);
    const surface = animeSurfaceColor(fill, button);
    graphics.clear();
    graphics.fillColor = new Color(95, 127, 158, 65);
    graphics.roundRect(-width / 2 + 2, -height / 2 - 5, width, height, radius);
    graphics.fill();
    graphics.fillColor = surface;
    graphics.strokeColor = mixAnime(ANIME.edge, stroke, 0.25);
    graphics.lineWidth = button ? 3 : 2;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill(); graphics.stroke();
    if (width > 32 && height > 28) {
        graphics.strokeColor = new Color(255, 255, 255, 230);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, Math.max(2, radius - 5));
        graphics.stroke();
    }
}
export function drawAnimeRoll(graphics: Graphics, radius: number): void {
    graphics.clear();
    graphics.fillColor = ANIME.edge;
    graphics.circle(0, -5, radius + 3); graphics.fill();
    graphics.fillColor = ANIME.coral;
    graphics.strokeColor = ANIME.paper;
    graphics.lineWidth = 4;
    graphics.circle(0, 0, radius); graphics.fill(); graphics.stroke();
    graphics.strokeColor = new Color(255, 223, 221);
    graphics.lineWidth = 3;
    graphics.arc(0, 0, radius - 7, 0.3, 2.6, false); graphics.stroke();
}
