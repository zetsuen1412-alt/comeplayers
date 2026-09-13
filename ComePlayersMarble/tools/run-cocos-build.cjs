'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { root, outputName, releaseName } = require('./release-config.cjs');

function creatorCandidates() {
    const explicit = process.env.COCOS_CREATOR_PATH;
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const localAppData = process.env.LOCALAPPDATA || '';
    return [
        explicit,
        path.join(programData, 'cocos', 'editors', 'Creator', '3.8.8', 'CocosCreator.exe'),
        localAppData ? path.join(localAppData, 'Programs', 'CocosCreator', 'CocosCreator.exe') : '',
    ].filter(Boolean);
}

const creatorPath = creatorCandidates().find((candidate) => fs.existsSync(candidate));
if (!creatorPath) {
    throw new Error('Cocos Creator 3.8.8 was not found. Set COCOS_CREATOR_PATH to CocosCreator.exe.');
}

const logPath = path.join(root, 'temp', 'logs', `${releaseName}-build.log`);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const buildSpec = [
    'platform=web-desktop',
    `debug=${process.env.COMEPLAYERS_BUILD_DEBUG === 'false' ? 'false' : 'true'}`,
    'buildPath=project://build',
    `outputName=${outputName}`,
    `logDest=${logPath}`,
].join(';');

const child = spawn(creatorPath, ['--project', root, '--build', buildSpec], {
    cwd: root,
    env: { ...process.env, COCOS_DASHBOARD_VERSION: process.env.COCOS_DASHBOARD_VERSION || '2.0.0' },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
});

const timeout = setTimeout(() => {
    console.error('[build] Timed out after 10 minutes.');
    child.kill();
    process.exitCode = 124;
}, 10 * 60 * 1000);

child.on('message', (message) => {
    if (!message || message.channel !== 'cocos-user' || typeof message.id !== 'number') return;
    let result = null;
    let error = null;
    switch (message.func) {
        case 'getData':
            result = { session_id: '', session_key: '', cocos_uid: '', email: '', nickname: '' };
            break;
        case 'isLoggedIn': result = false; break;
        case 'queryServerBaseURL': result = 'https://creator-api.cocos.com'; break;
        default: error = `Offline build does not provide cocos-user/${String(message.func)}.`;
    }
    if (child.connected) child.send({ channel: 'cocos-user', id: message.id, error, result });
});

child.on('error', (error) => {
    clearTimeout(timeout);
    console.error('[build] Failed to launch Creator:', error);
    process.exitCode = 1;
});
child.on('exit', (code, signal) => {
    clearTimeout(timeout);
    console.log(`[build] Creator exited with code ${String(code)} signal ${String(signal)}.`);
    if (process.exitCode === undefined) process.exitCode = code === 36 ? 0 : (code ?? 1);
});
