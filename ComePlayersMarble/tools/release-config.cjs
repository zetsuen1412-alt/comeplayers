'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const semanticVersion = String(packageJson.version || '0.0.0');
const majorVersion = Number(semanticVersion.split('.')[1] || 0);
const releaseName = `v${majorVersion}`;
const outputName = `web-desktop-${releaseName}`;

module.exports = {
    root,
    semanticVersion,
    majorVersion,
    releaseName,
    outputName,
    buildRoot: path.join(root, 'build', outputName),
};
