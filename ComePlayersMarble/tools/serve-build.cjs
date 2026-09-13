'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { buildRoot, outputName } = require('./release-config.cjs');

const host = process.env.COMEPLAYERS_PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.COMEPLAYERS_PREVIEW_PORT || 7456);
const mimeTypes = {
    '.bin': 'application/octet-stream',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.wasm': 'application/wasm',
};

if (!fs.existsSync(path.join(buildRoot, 'index.html'))) {
    throw new Error(`${outputName} was not found. Run npm run build:web first.`);
}

const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const filePath = path.resolve(buildRoot, relativePath);
    if (filePath !== buildRoot && !filePath.startsWith(`${buildRoot}${path.sep}`)) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
    }
    fs.stat(filePath, (error, stat) => {
        if (error || !stat.isFile()) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
        }
        response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        });
        fs.createReadStream(filePath).pipe(response);
    });
});

server.listen(port, host, () => console.log(`[preview] http://${host}:${port}/ (${outputName})`));
