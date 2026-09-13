'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const assetsRoot = path.join(root, 'assets');

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

const assetFiles = walk(assetsRoot);
const metaFiles = assetFiles.filter((file) => file.endsWith('.meta'));
const jsonTargets = [
    ...metaFiles,
    path.join(root, 'package.json'),
    path.join(root, 'package-lock.json'),
    path.join(root, 'assets', 'scenes', 'Match.scene'),
    path.join(root, 'assets', 'resources', 'materials', 'V67Standard.mtl'),
];

for (const file of jsonTargets) JSON.parse(fs.readFileSync(file, 'utf8'));

const metaUuids = metaFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).uuid);
const uniqueMetaUuids = new Set(metaUuids);
if (uniqueMetaUuids.size !== metaUuids.length) throw new Error('Duplicate primary metadata UUID detected.');

const typeScriptFiles = assetFiles.filter((file) => file.endsWith('.ts'));
let relativeImports = 0;
for (const file of typeScriptFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const importPattern = /(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(importPattern)) {
        relativeImports += 1;
        const target = path.resolve(path.dirname(file), match[1]);
        const candidates = [target, `${target}.ts`, path.join(target, 'index.ts')];
        if (!candidates.some((candidate) => fs.existsSync(candidate))) {
            throw new Error(`Unresolved relative import ${match[1]} in ${path.relative(root, file)}.`);
        }
    }
}

const buildRoot = path.join(root, 'build', 'web-desktop-v67');
const buildFiles = fs.existsSync(buildRoot) ? walk(buildRoot) : [];
const standardConfig = path.join(buildRoot, 'assets', 'resources', 'config.json');
const standardEffectPacked = fs.existsSync(standardConfig)
    && fs.readFileSync(standardConfig, 'utf8').includes('c8f66d17-351a-48da-a12c-0212d28575c4');

const result = {
    typeScriptFiles: typeScriptFiles.length,
    metaFiles: metaFiles.length,
    uniqueMetaUuids: uniqueMetaUuids.size,
    jsonTargets: jsonTargets.length,
    relativeImports,
    buildFiles: buildFiles.length,
    buildBytes: buildFiles.reduce((total, file) => total + fs.statSync(file).size, 0),
    buildIndexExists: fs.existsSync(path.join(buildRoot, 'index.html')),
    standardEffectPacked,
};

if (!result.buildIndexExists || !standardEffectPacked) throw new Error('The verified V67 Web Desktop build is incomplete.');
console.log(JSON.stringify(result, null, 2));

