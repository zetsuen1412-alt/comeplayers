import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['node_modules','.git','.temp','.utmp','Library','Temp','Obj','Logs','UserSettings','Build','Builds']);
function walk(path) {
  return readdirSync(path,{withFileTypes:true}).flatMap(e=>ignored.has(e.name)?[]:e.isDirectory()?walk(join(path,e.name)):[join(path,e.name)]);
}
const files = walk(root).sort();
let json=0,glb=0;
for (const file of files) {
  const name=relative(root,file).replaceAll('\\','/');
  if (name.endsWith('.json')) { JSON.parse(readFileSync(file,'utf8')); json++; }
  if (name.endsWith('.glb')) {
    const bytes=readFileSync(file);
    assert.equal(bytes.toString('utf8',0,4),'glTF',name);
    assert.equal(bytes.readUInt32LE(4),2,name);
    assert.equal(bytes.readUInt32LE(8),bytes.length,name);
    glb++;
  }
  if (name.endsWith('.png')) {
    const bytes=readFileSync(file);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',name);
    assert.ok(bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0,name);
    if(name.endsWith('portraits-alexia-rindi.png')) assert.equal(bytes.readUInt32BE(16),bytes.readUInt32BE(20)*2,'Portrait atlas needs equal square halves');
  }
  if (name.startsWith('Assets/') && name.endsWith('.cs')) {
    const source=readFileSync(file,'utf8');
    assert.ok(!/\b(?:UnityEngine\.)?Random\b/.test(source),`Local RNG in ${name}`);
  }
  if (/\.(cs|json|html|m?js|md|sql|ps1)$/.test(name)) {
    const source=readFileSync(file,'utf8');
    assert.ok(!/sb_secret_[\w-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source),`Private credential in ${name}`);
    for (const jwt of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]) {
      let payload;
      try { payload=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString()); } catch { continue; }
      assert.notEqual(payload.role,'service_role',`Privileged JWT in ${name}`);
    }
  }
}
// Deterministic metadata is added only when missing; never change authored GUIDs.
if (process.argv.includes('--metadata')) {
  const assets=join(root,'Assets');
  function meta(path,folder=false) {
    const target=path+'.meta'; if (existsSync(target)) return;
    const guid=createHash('sha256').update('CRWT:'+relative(root,path).replaceAll('\\','/')).digest('hex').slice(0,32);
    const importer=path.endsWith('.cs')?'MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n':path.endsWith('.png')?'TextureImporter:\n  internalIDToNameTable: []\n  externalObjects: {}\n  serializedVersion: 13\n  mipmaps:\n    enableMipMap: 0\n    sRGBTexture: 1\n  isReadable: 0\n  textureType: 0\n  textureShape: 1\n  maxTextureSize: 2048\n  textureSettings:\n    serializedVersion: 2\n    filterMode: 1\n    wrapU: 1\n    wrapV: 1\n    wrapW: 1\n  nPOTScale: 0\n  alphaIsTransparency: 1\n':'DefaultImporter:\n  externalObjects: {}\n';
    writeFileSync(target,`fileFormatVersion: 2\nguid: ${guid}\n${folder?'folderAsset: yes\n':''}${importer}  userData:\n  assetBundleName:\n  assetBundleVariant:\n`);
  }
  function visit(path) { for(const e of readdirSync(path,{withFileTypes:true})) {
    if(e.name.endsWith('.meta')||e.name.startsWith('.')) continue;
    const p=join(path,e.name); meta(p,e.isDirectory()); if(e.isDirectory())visit(p);
  }}
  visit(assets);
}
if (process.argv.includes('--manifest')) {
  const manifest=walk(root).filter(p=>!/^BUILD_SHA256(?:_\d+)?\.txt$/.test(relative(root,p))).sort().map(p=>`${createHash('sha256').update(readFileSync(p)).digest('hex')}  ./${relative(root,p).replaceAll('\\','/')}`).join('\n')+'\n';
  writeFileSync(join(root,'BUILD_SHA256.txt'),manifest);
}
console.log(`Release checks: ${json} JSON, ${glb} GLB, no Unity RNG or embedded privileged credentials.`);
