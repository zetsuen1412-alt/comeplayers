'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
class Color { constructor(r=255,g=255,b=255,a=255){ Object.assign(this,{r,g,b,a}); } }
class Graphics {
    constructor(){ this.calls=[]; }
    clear(){ this.calls=[]; }
    roundRect(...a){ this.calls.push(['roundRect',...a]); }
    circle(...a){ this.calls.push(['circle',...a]); }
    arc(...a){ this.calls.push(['arc',...a]); }
    fill(){ this.calls.push(['fill']); } stroke(){ this.calls.push(['stroke']); }
}
class Node {
    constructor(name=''){ this.name=name;this.children=[];this.components=new Map();this.position={x:0,y:0,z:0};this.scale={x:1,y:1,z:1}; }
    addChild(n){ this.children.push(n); }
    setPosition(x,y,z){ this.position=typeof x==='object'?{...x}:{x,y,z}; }
    setScale(x,y,z){ this.scale={x,y,z}; }
    setRotationFromEuler(){}
    getComponent(c){ return this.components.get(c)||null; }
    addComponent(c){ const v=new c();this.components.set(c,v);return v; }
}
const primitive=(...args)=>({ positions:[0,0,0],normals:[0,1,0],args });
const cc={Color,Graphics,Node,Vec3:class{},primitives:{sphere:primitive,cylinder:primitive,cone:primitive}};
const TileType=Object.fromEntries(['Start','City','Fortune','GameCenter','Island','Olympic','WorldTravel','Tax','Bonus','Tourist'].map(k=>[k,k]));
const cache=new Map();
function load(name){
    const file=path.join(root,'assets/scripts/presentation',name+'.ts');
    if(cache.has(file))return cache.get(file);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{reportDiagnostics:true,
        compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}});
    assert.equal((code.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
    const module={exports:{}};
    vm.runInNewContext(code.outputText,{module,exports:module.exports,require:id=>{
        if(id==='cc')return cc;
        if(id==='./AnimeTheme')return load('AnimeTheme');
        if(id==='../data/BoardData')return {TileType};
        throw new Error('Unexpected dependency '+id);
    }},{filename:file});
    cache.set(file,module.exports);return module.exports;
}
const theme=load('AnimeTheme'), world=load('AnimeWorld');
const make=(name,geometry,color,finish)=>{const n=new Node(name);Object.assign(n,{geometry,color,finish});return n;};
const all=n=>[n,...n.children.flatMap(all)];
check('rounded meshes have finite vertices, unit normals, valid winding and bounded geometry',()=>{
    for(const dims of [[2.3,.28,3.28],[35.8,.65,34],[.59,.65,.42]]){
        const g=world.roundedAnimeBox(...dims);
        assert.equal(g.positions.length,96*3);assert.equal(g.indices.length,6*9*6);
        for(let i=0;i<g.positions.length;i+=3){
            assert.ok(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-6);
            for(let k=0;k<3;k++)assert.ok(Number.isFinite(g.positions[i+k])&&Math.abs(g.positions[i+k])<=dims[k]/2+1e-6);
        }
        for(const i of g.indices)assert.ok(i>=0&&i<96);
        for(let i=0;i<g.indices.length;i+=3){
            const p=g.indices.slice(i,i+3).map(j=>g.positions.slice(j*3,j*3+3));
            const a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]);
            const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
            const normal=g.normals.slice(g.indices[i]*3,g.indices[i]*3+3);
            assert.ok(cross.reduce((n,v,k)=>n+v*normal[k],0)>-1e-8);
        }
    }
});
check('cel shading is non-mutating, finite, and uses a color per vertex',()=>{
    const input=world.roundedAnimeBox(2,1,3),before=JSON.stringify(input);
    const result=theme.animeGeometry(input);
    assert.equal(JSON.stringify(input),before);assert.equal(result.colors.length,input.positions.length/3*4);
    result.colors.forEach(v=>assert.ok(v>=0&&v<=1));
    const unlit=theme.animeGeometry(input,true);assert.ok(unlit.colors.every(v=>v===1));
});
check('light interface keeps text contrast at least 4.5:1',()=>{
    const luminance=c=>[c.r,c.g,c.b].map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
    for(const c of [new Color(255,255,255),...theme.ANIME_DISTRICTS,new Color(120,130,150)]){
        const text=theme.animeTextColor(c);
        for(const bg of [theme.animeSurfaceColor(c),theme.animeSurfaceColor(c,true)])assert.ok((luminance(bg)+.05)/(luminance(text)+.05)>=4.5);
    }
});
check('panels reuse Graphics during state changes instead of stacking components',()=>{
    const node=new Node('Button');theme.drawAnimePanel(node,150,50,theme.ANIME.blue,theme.ANIME.edge,true);
    const g=node.getComponent(Graphics),count=g.calls.length;
    theme.drawAnimePanel(node,150,50,theme.ANIME.coral,theme.ANIME.edge,true);
    assert.equal(node.getComponent(Graphics),g);assert.equal(g.calls.length,count);
});
check('human and bots share full chibi faces, with distinct hair and ownership accents',()=>{
    const human=world.createAnimePlayer('human',theme.ANIME.blue,false,make),bot=world.createAnimePlayer('bot',theme.ANIME.coral,true,make);
    assert.equal(all(human).length,all(bot).length);
    for(const n of [human,bot])assert.equal(all(n).filter(x=>x.name==='AnimeEyePupil').length,2);
    assert.notDeepEqual(all(human).find(x=>x.name==='AnimeHairBack').color,all(bot).find(x=>x.name==='AnimeHairBack').color);
});
check('board keeps dice lane open and tall scenery outside the property track',()=>{
    const board=new Node(),lamps=[];world.createAnimeFloor(board,make,lamps);
    assert.equal(lamps.length,4);assert.ok(all(board).some(n=>n.name==='AnimeDiceArenaV108'));
    for(const n of all(board).filter(n=>/Tree|Cloud/.test(n.name)))assert.ok(Math.max(Math.abs(n.position.x),Math.abs(n.position.z))>=15);
    assert.ok(all(board).length<80);
});
check('all tile types and all property tiers construct successfully',()=>{
    for(const [i,tileType] of Object.values(TileType).entries()){
        const r=new Node();world.createAnimeTile(r,{index:i,colorGroup:'group-0',tileType,purchasePrice:120000,worldPosition:{x:0,y:0,z:0}},make);
        assert.ok(all(r).some(n=>n.name==='AnimeDistrictBand'));
    }
    for(let level=1;level<=4;level++){
        const r=new Node();world.createAnimeProperty(r,theme.ANIME.blue,level,make);
        assert.ok(all(r).some(n=>n.name===`AnimePropertyTier-${level}`));assert.ok(all(r).length<22);
    }
});
// Integration checks run when real repository files are present, never label mocks an engine test.
const boardFile=path.join(root,'assets/scripts/board/BoardView.ts');
if(fs.existsSync(boardFile))check('active board, interface and ROLL paths are integrated',()=>{
    const board=fs.readFileSync(boardFile,'utf8');
    for(const name of ['createAnimeFloor','createAnimeTile','createAnimePlayer','createAnimeProperty','initializeAnimeMaterial'])assert.ok(board.includes(name+'('));
    for(const name of ['FrontEndShell','MatchHUD']){
        const source=fs.readFileSync(path.join(root,`assets/scripts/ui/${name}.ts`),'utf8');
        assert.ok(source.includes('drawAnimePanel('));assert.ok(source.includes('animeTextColor('));
        const out=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,experimentalDecorators:true}});
        assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
        if(name==='MatchHUD')assert.ok(source.includes('this.rollButton.node.active = this.rollButton.interactable;'));
    }
});
console.log(`${checks} V108 checks passed. These are geometry/presentation tests, not Cocos GPU/build tests.`);
