import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream' };
const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (path === '/')
            path = '/index.html';
        const file = resolve(root, '.' + path);
        if (file !== root && !file.startsWith(root + sep))
            throw Error('Invalid path');
        if (!(await stat(file)).isFile())
            throw Error('Not a file');
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
        if (req.method === 'HEAD')
            res.end();
        else
            res.end(await readFile(file));
    }
    catch {
        res.writeHead(404);
        res.end('Not found');
    }
});
server.listen(port, '127.0.0.1', () => console.log(`Revector Studio: http://localhost:${port}`));
