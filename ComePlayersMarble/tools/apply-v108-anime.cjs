'use strict';
// One-shot, fail-closed integration. Used on the isolated feature branch only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const files = {
    'assets/scripts/board/BoardView.ts': '4c744d8ad3e74143230b3cc2857ab6020e33dc0f',
    'assets/scripts/ui/FrontEndShell.ts': '913239a1960685174cfbcd8a303c01b3aba10030',
    'assets/scripts/ui/MatchHUD.ts': '86157c9ffe6f41db75cab063f2680d439bc831ab',
    'assets/scenes/Match.scene': 'c9862f7ca6945127d9a6633ca47a9dd10c0daae8',
    'package.json': 'e4801774716b59c3d7939deddbebda2d6ab2015a',
};
const source = {};
for (const [file, expected] of Object.entries(files)) {
    const content = fs.readFileSync(path.join(root, file));
    const actual = crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
    if (actual !== expected) throw new Error(`Source changed: ${file}; refusing to overwrite newer work.`);
    source[file] = content.toString('utf8');
}
function exact(s, before, after) {
    if (s.split(before).length !== 2) throw new Error(`Expected one integration anchor: ${before.slice(0, 70)}`);
    return s.replace(before, after);
}
function parse(s) { return ts.createSourceFile('source.ts', s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS); }
function method(s, className, name, body) {
    const ast = parse(s);
    const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === className);
    const member = cls?.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(ast) === name);
    if (!member?.body) throw new Error(`Missing method ${className}.${name}`);
    return s.slice(0, member.body.getStart(ast)) + '{\n' + body + '\n    }' + s.slice(member.body.end);
}
function rewriteUiColors(s) {
    const ast = parse(s), edits = [];
    const visit = node => {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
            const property = node.left.name.text;
            let parent = node.parent;
            while (parent && !ts.isMethodDeclaration(parent) && !ts.isConstructorDeclaration(parent)) parent = parent.parent;
            if (property === 'color' && !node.right.getText(ast).startsWith('animeTextColor(')) {
                edits.push([node.right.getStart(ast), node.right.end, `animeTextColor(${node.right.getText(ast)})`]);
            }
            // Only remap hand-drawn interface chrome, not artwork, icons, or progress fills.
            if (property === 'fillColor' && parent && ts.isConstructorDeclaration(parent) && !/portrait|artwork/i.test(node.left.expression.getText(ast))) {
                edits.push([node.right.getStart(ast), node.right.end, `animeSurfaceColor(${node.right.getText(ast)})`]);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(ast);
    for (const [a, b, text] of edits.sort((a,b) => b[0] - a[0])) s = s.slice(0,a) + text + s.slice(b);
    return s;
}
let board = source['assets/scripts/board/BoardView.ts'];
board = exact(board, 'readonly humanPrefab?: Prefab | null;', 'readonly humanPrefab?: Prefab | null;\n    /** Disable only when supplying a finished anime character prefab. */\n    readonly useAnimeCharacters?: boolean;');
board = exact(board, 'const humanPrefab = player.bot ? null : this.options.humanPrefab;', 'const humanPrefab = this.options.useAnimeCharacters === false && !player.bot ? this.options.humanPrefab : null;');
board = method(board, 'BoardView', 'createVideoReferenceFloorV105', '        createAnimeFloor(this.root, this.primitive.bind(this), this.centerTurnLamps);');
board = method(board, 'BoardView', 'createVideoReferenceTileV105', '        createAnimeTile(this.root, tile, this.primitive.bind(this));');
board = method(board, 'BoardView', 'createPlayerPiece', '        return createAnimePlayer(name, color, bot, this.primitive.bind(this));');
board = method(board, 'BoardView', 'updateVideoReferencePropertyV105', `        this.markOwner(tileIndex, colorHex);
        const previous = this.buildingMarkers.get(tileIndex);
        if (previous?.isValid) { Tween.stopAllByTarget(previous); previous.destroy(); }
        this.buildingMarkers.delete(tileIndex);
        const tile = this.board[tileIndex];
        if (!tile || buildingLevel <= 0) return;
        const side = Math.floor(tile.index / 8);
        const color = this.colorFromHex(colorHex);
        const root = new Node(\`AnimePropertyV108-\${tileIndex}-L\${buildingLevel}\`);
        const inward = side === 0 ? new Vec3(0, 0.92, 0.38)
            : side === 1 ? new Vec3(-0.38, 0.92, 0)
            : side === 2 ? new Vec3(0, 0.92, -0.38) : new Vec3(0.38, 0.92, 0);
        root.setPosition(tile.worldPosition.clone().add(inward));
        root.setRotationFromEuler(new Vec3(0, side * -90, 0));
        root.setScale(0.10, 0.10, 0.10);
        this.root.addChild(root);
        createAnimeProperty(root, color, buildingLevel, this.primitive.bind(this));
        this.playConstructionBurst(tile.worldPosition, color, buildingLevel);
        tween(root).to(0.34, { scale: new Vec3(1.08, 1.08, 1.08) }, { easing: 'backOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' }).start();
        this.buildingMarkers.set(tileIndex, root);`);
board = exact(board, 'renderer.mesh = utils.createMesh(geometry);', "renderer.mesh = utils.createMesh(animeGeometry(geometry, finish === 'GLOW'));");
board = method(board, 'BoardView', 'material', `        const key = \`anime:\${finish}:\${color.toHEX('#rrggbbaa')}\`;
        const cached = this.materialCache.get(key);
        if (cached) return cached;
        const material = new Material();
        initializeAnimeMaterial(material, color);
        this.materialCache.set(key, material);
        return material;`);
board = method(board, 'BoardView', 'playConstructionBurst', `        const root = new Node(\`AnimeConstructionV108-L\${level}\`);
        root.setPosition(position.clone().add3f(0, 0.78, 0));
        this.root.addChild(root);
        for (let index = 0; index < 6; index++) {
            const angle = Math.PI * 2 * index / 6;
            const puff = this.primitive('AnimeConstructionPuff', primitives.sphere(0.11, { segments: 8 }),
                index % 2 === 0 ? color : new Color(255, 231, 165), 'GLOW');
            puff.setPosition(Math.cos(angle) * 0.45, 0.15, Math.sin(angle) * 0.45);
            root.addChild(puff);
            tween(puff).to(0.26, {
                position: new Vec3(Math.cos(angle) * 0.92, 0.75, Math.sin(angle) * 0.92),
                scale: new Vec3(1.4, 1.4, 1.4),
            }, { easing: 'quadOut' }).to(0.20, { scale: Vec3.ZERO }).start();
        }
        tween(root).delay(0.5).call(() => { if (root.isValid) root.destroy(); }).start();`);
board = "import { animeGeometry, initializeAnimeMaterial } from '../presentation/AnimeTheme';\nimport { createAnimeFloor, createAnimeTile, createAnimePlayer, createAnimeProperty } from '../presentation/AnimeWorld';\n" + board;
source['assets/scripts/board/BoardView.ts'] = board;

for (const name of ['FrontEndShell', 'MatchHUD']) {
    const file = `assets/scripts/ui/${name}.ts`;
    let text = source[file];
    text = method(text, name, 'drawPanel', "        drawAnimePanel(node, width, height, fill, stroke, /Button$/.test(node.name));");
    if (name === 'FrontEndShell') {
        text = method(text, name, 'setButtonVisualState', `        const fill = !interactable ? BUTTON_DISABLED : highlighted ? GOLD : BLUE;
        const transform = button.node.getComponent(UITransform);
        if (transform) drawAnimePanel(button.node, transform.contentSize.width,
            transform.contentSize.height, fill, fill, true);
        label.color = animeTextColor(!interactable ? BUTTON_DISABLED_TEXT : INK);
        button.interactable = interactable;`);
    } else {
        text = method(text, name, 'childRoundButton', `        const diameter = radius * 2;
        const node = this.uiNode(\`\${text}RoundButton\`, parent, position, diameter, diameter);
        drawAnimeRoll(node.addComponent(Graphics), radius);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        node.on(Button.EventType.CLICK, action);
        this.childLabel(node, \`\${text}Label\`, text, fontSize, Vec3.ZERO,
            ANIME.ink, diameter - 16, diameter - 16);
        return button;`);
        const ast = parse(text);
        let rollEnd = null;
        const visit = node => {
            if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
                && node.expression.left.getText(ast) === 'this.rollButton.interactable') rollEnd ??= node.end;
            ts.forEachChild(node, visit);
        };
        visit(ast);
        if (!rollEnd) throw new Error('ROLL readiness guard missing');
        text = text.slice(0, rollEnd) + '\n        this.rollButton.node.active = this.rollButton.interactable;' + text.slice(rollEnd);
        text = text.replace('COMEPLAYERS MARBLE', 'CRAZY RICH: WORLD TOUR')
            .replace('WORLD MAP  •  VIDEO REFERENCE  •  V107', 'WORLD TOUR  •  ANIME ADVENTURE');
    }
    text = rewriteUiColors(text);
    text = "import { ANIME, animeTextColor, animeSurfaceColor, drawAnimePanel, drawAnimeRoll } from '../presentation/AnimeTheme';\n" + text;
    source[file] = text;
}
const scene = JSON.parse(source['assets/scenes/Match.scene']);
for (const item of scene) {
    if (item.__type__ === 'cc.Camera') item._color = { __type__: 'cc.Color', r: 164, g: 221, b: 250, a: 255 };
    if (item.__type__ === 'cc.SkyboxInfo') item._enabled = false;
}
source['assets/scenes/Match.scene'] = JSON.stringify(scene, null, 2) + '\n';
const pkg = JSON.parse(source['package.json']);
pkg.version = '0.108.0'; pkg.devDependencies = { ...(pkg.devDependencies || {}), typescript: '5.8.3' }; pkg.scripts['test:anime'] = 'node tools/test-v108-anime.cjs';
source['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
// No writes until ALL expected anchors have been resolved.
for (const [file, text] of Object.entries(source)) fs.writeFileSync(path.join(root, file), text);
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = '0.108.0'; if (lock.packages?.['']) lock.packages[''].version = '0.108.0';
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
console.log('V108 integration applied. Game rules, dice resolution, camera and backend untouched.');
