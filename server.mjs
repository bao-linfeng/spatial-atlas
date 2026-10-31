// 本地静态服务：node server.mjs [端口]，仅用 Node 内置模块
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = +(process.argv[2] || process.env.PORT || 5191);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.webm': 'video/webm', '.mp4': 'video/mp4',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden');
  try {
    let s = await stat(file);
    if (s.isDirectory()) { file = join(file, 'index.html'); s = await stat(file); }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': s.size,
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
    console.log(`200 ${req.method} ${url.pathname}`);
  } catch {
    send(res, 404, 'Not Found');
    console.log(`404 ${req.method} ${url.pathname}`);
  }
}).listen(PORT, HOST, () => console.log(`空间档案 · 苏南智城 → http://${HOST}:${PORT}/`));

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
