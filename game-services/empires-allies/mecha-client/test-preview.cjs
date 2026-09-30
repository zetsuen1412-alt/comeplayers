'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1);
const context = {};
vm.createContext(context);
vm.runInContext(scripts[0][1], context, {timeout: 1000});
const {THEME, landAt, mechSVG, pilotSVG, bindVisual} = context.CPMecha;

test('preview is explicitly non-gameplay and has no network or persistence code', () => {
  assert.equal(THEME.mode, 'visual-preview');
  assert.equal(THEME.writesGameState, false);
  assert.doesNotMatch(scripts[0][1], /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|sendBeacon)\b/);
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /\.swf(?:["'/?]|$)/i);
});
test('original catalog has six unique frames covering land, sea, air', () => {
  assert.equal(THEME.units.length, 6);
  assert.equal(new Set(THEME.units.map(x => x.id)).size, 6);
  assert.deepEqual([...new Set(THEME.units.map(x => x.domain))].sort(), ['DARAT','LAUT','UDARA']);
  assert.ok(Object.isFrozen(THEME));
  assert.ok(THEME.units.every(Object.isFrozen));
});
test('every unit and pilot has a distinct self-contained SVG', () => {
  const units = THEME.units.map(u => mechSVG(u.id));
  const pilots = THEME.pilots.map(p => pilotSVG(p.id));
  assert.equal(new Set(units).size, 6);
  assert.equal(new Set(pilots).size, 3);
  [...units,...pilots].forEach(svg => {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /aria-label="/);
    assert.doesNotMatch(svg, /<(?:script|image|foreignObject)|href=/i);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  });
});
test('all eight concept building footprints fit all three maps', () => {
  assert.equal(THEME.buildings.length, 8);
  THEME.regions.forEach((r,i) => THEME.buildings.forEach(b => {
    for(let x=b.x; x<b.x+b.w; x++) for(let z=b.z; z<b.z+b.d; z++) {
      assert.equal(landAt(x,z,i), true, `${r.id}/${b.id} at ${x},${z}`);
    }
  }));
});
test('regions have genuinely different silhouettes, not only recolors', () => {
  const silhouettes = THEME.regions.map((_,i) => {
    let bits=''; for(let x=0;x<19;x++)for(let z=0;z<17;z++)bits+=landAt(x,z,i)?'1':'0'; return bits;
  });
  assert.equal(new Set(silhouettes).size, 3);
});
test('concept buildings never overlap', () => {
  const occupied = new Set();
  THEME.buildings.forEach(b => {for(let x=b.x;x<b.x+b.w;x++)for(let z=b.z;z<b.z+b.d;z++){
    const key=`${x},${z}`;assert.ok(!occupied.has(key),`Overlapping concept building ${b.id}`);occupied.add(key);
  }});
});
test('visual binding keeps every supplied gameplay field unchanged', () => {
  const definition = Object.freeze({id:'test-id-not-production',cost:250,health:42,damage:7,buildSeconds:120,counters:Object.freeze(['test-counter'])});
  const before = JSON.stringify(definition);
  const projection = bindVisual(definition,'kestrel');
  assert.equal(projection.definition, definition);
  assert.equal(projection.visualId,'kestrel');
  assert.equal(JSON.stringify(definition), before);
  assert.deepEqual(Object.keys(projection).sort(), ['definition','visualId']);
  assert.throws(()=>bindVisual(definition,'unmapped-unit'));
  assert.throws(()=>bindVisual(null,'kestrel'));
});
test('accessibility, reduced motion, and preview disclaimers are present', () => {
  assert.match(html, /<html lang="id">/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /pointercancel/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-labelledby="modal-title"/);
  assert.match(html, /belum terhubung ke gameplay atau save lama/);
  assert.doesNotMatch(html, /Wznów|M43  sixty/);
});
