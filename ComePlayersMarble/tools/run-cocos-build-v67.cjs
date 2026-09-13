'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectPath = path.resolve(__dirname, '..');
const creatorPath = 'C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe';
const buildSpec = [
    'platform=web-desktop',
    'debug=true',
    'buildPath=project://build',
    'outputName=web-desktop-v67',
    'logDest=C:\\ComePlayersMarble\\temp\\logs\\v67-build.log',
].join(';');

if (!fs.existsSync(creatorPath)) {
    throw new Error(`Cocos Creator 3.8.8 was not found at ${creatorPath}`);
}
if (!fs.existsSync(path.join(projectPath, 'package.json'))) {
    throw new Error(`Invalid project path: ${projectPath}`);
}

// Creator skips its Dashboard dependency-installer when both an IPC channel
// and the Dashboard version marker are present. This is the same contract used
// when Dashboard launches Creator, while allowing command-line builds to remain
// non-interactive and avoiding the dependency-install relaunch loop.
const child = spawn(
    creatorPath,
    ['--project', projectPath, '--build', buildSpec],
    {
        cwd: projectPath,
        env: {
            ...process.env,
            COCOS_DASHBOARD_VERSION: process.env.COCOS_DASHBOARD_VERSION || '2.0.0',
        },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        windowsHide: true,
    },
);

const timeout = setTimeout(() => {
    console.error('[V67 build] Timed out after 10 minutes.');
    child.kill();
    process.exitCode = 124;
}, 10 * 60 * 1000);

child.on('message', (message) => {
    console.log('[V67 build IPC]', JSON.stringify(message));
    if (!message || message.channel !== 'cocos-user' || typeof message.id !== 'number') return;

    let result = null;
    let error = null;
    switch (message.func) {
        case 'getData':
            result = {
                session_id: '',
                session_key: '',
                cocos_uid: '',
                email: '',
                nickname: '',
            };
            break;
        case 'isLoggedIn':
            result = false;
            break;
        case 'queryServerBaseURL':
            result = 'https://creator-api.cocos.com';
            break;
        default:
            error = `Offline build does not provide cocos-user/${String(message.func)}.`;
            break;
    }

    if (child.connected) {
        child.send({
            channel: 'cocos-user',
            id: message.id,
            error,
            result,
        });
    }
});

child.on('error', (error) => {
    clearTimeout(timeout);
    console.error('[V67 build] Failed to launch Creator:', error);
    process.exitCode = 1;
});

child.on('exit', (code, signal) => {
    clearTimeout(timeout);
    console.log(`[V67 build] Creator exited with code ${String(code)} signal ${String(signal)}.`);
    // Cocos Creator uses 36 for a completed command-line build.
    if (process.exitCode === undefined) process.exitCode = code === 36 ? 0 : (code ?? 1);
});
