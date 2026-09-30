'use strict';
// Export only newly authored procedural vector concepts, never historical assets.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) throw new Error('Expected one embedded preview script.');
const context = {};
vm.createContext(context);
vm.runInContext(scripts[0][1], context, {timeout: 1000});
const {THEME, mechSVG, pilotSVG} = context.CPMecha;
const destination = path.resolve(process.argv[2] || path.join(__dirname, 'exports'));
const assets = [
  ...THEME.units.map(unit => [`mecha-${unit.id}.svg`, mechSVG(unit.id)]),
  ...THEME.pilots.map(pilot => [`pilot-${pilot.id}.svg`, pilotSVG(pilot.id)])
];
for (const [name] of assets) {
  if (fs.existsSync(path.join(destination, name))) {
    throw new Error(`Refusing to overwrite ${name}; choose a new output directory.`);
  }
}
fs.mkdirSync(destination, {recursive: true});
for (const [name, content] of assets) {
  fs.writeFileSync(path.join(destination, name), `${content}\n`, {encoding: 'utf8', flag: 'wx'});
}
console.log(`Exported ${assets.length} original concept SVGs to ${destination}`);
