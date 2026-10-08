// Keep the standalone embedded launcher on the same runtime as the external-file launcher.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
const check = process.argv.includes('--check');
const launcherPath = path.join(client, 'PLAY-Crazy-Rich-World-Tour-Launcher.html');
const original = fs.readFileSync(launcherPath, 'utf8');
const launcher = original.replace(/^const (?:GAME_B64|ONLINE_GAME_B64)=(['"])[^'"]*\1;\r?\n/gm, '');
const game = fs.readFileSync(path.join(client, 'game.html')).toString('base64');
const online = fs.readFileSync(path.join(client, 'online-game.html')).toString('base64');
let embedded = launcher.replace('const SUPABASE_URL=', `const GAME_B64='${game}';\nconst ONLINE_GAME_B64='${online}';\nconst SUPABASE_URL=`);
const helper = "function embeddedGameUrl(base64){const bin=atob(base64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);if(state.gameUrl)URL.revokeObjectURL(state.gameUrl);state.gameUrl=URL.createObjectURL(new Blob([bytes],{type:'text/html'}));return state.gameUrl}\nfunction portableGameSource(relative,base64){return location.protocol==='file:'?embeddedGameUrl(base64):relative}\n";
if ((embedded.match(/frame\.src='online-game\.html\?v=30';/g) || []).length !== 2 ||
    (embedded.match(/frame\.src='game\.html\?v=30';/g) || []).length !== 1 ||
    !embedded.includes('function frameTargetOrigin()')) throw new Error('Launcher boundaries changed; review the embedded build mapping.');
embedded = embedded.replace('function frameTargetOrigin()', helper + 'function frameTargetOrigin()')
  .replaceAll("frame.src='online-game.html?v=30';", "frame.src=portableGameSource('online-game.html?v=30',ONLINE_GAME_B64);")
  .replace("frame.src='game.html?v=30';", "frame.src=portableGameSource('game.html?v=30',GAME_B64);");
const target = path.join(client, 'index.html');
for (const [name, html] of [['external launcher', launcher], ['embedded launcher', embedded]]) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) throw new Error('Missing launcher script: ' + name);
  for (const script of scripts) new vm.Script(script[1], { filename: name });
}
if (check) {
  if (launcher !== original || !fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== embedded)
    throw new Error('Embedded launcher is stale. Run tools/sync_launcher.mjs before publishing.');
  console.log('[CRWT] Embedded launcher matches the current game and online runtime.');
} else {
  fs.writeFileSync(launcherPath, launcher);
  fs.writeFileSync(target, embedded);
  console.log('[CRWT] Rebuilt embedded launcher from current source runtimes.');
}
