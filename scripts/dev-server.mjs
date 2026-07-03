/**
 * 로컬 개발 서버 — Vercel 없이 실제 서버리스 핸들러(api/*.js)를 그대로 구동.
 * public/ 정적 파일 + /api/* 라우팅. .env 자동 로드.
 * 실행: node scripts/dev-server.mjs   (기본 포트 8787)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8787;

// .env 로드 (KEY=VALUE, # 주석/빈 줄 무시, 값 안의 = 허용)
const envPath = join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// Vercel (req,res) 어댑터
function adapt(req, res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  res.send = (body) => res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const handlers = {};
async function getHandler(name) {
  if (!handlers[name]) {
    const mod = await import(join(ROOT, 'api', `${name}.js`));
    handlers[name] = mod.default;
  }
  return handlers[name];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let path = url.pathname;

  // /api/* → 서버리스 핸들러
  if (path.startsWith('/api/')) {
    const name = path.slice(5);
    try {
      const handler = await getHandler(name);
      if (!handler) { res.statusCode = 404; return res.end('no handler'); }
      adapt(req, res);
      req.query = Object.fromEntries(url.searchParams);
      if (req.method === 'POST') req.body = await readBody(req);
      return handler(req, res);
    } catch (e) {
      res.statusCode = 500;
      return res.end('handler error: ' + e.message);
    }
  }

  // 정적 파일
  if (path === '/') path = '/index.html';
  const file = join(ROOT, 'public', path);
  if (!file.startsWith(join(ROOT, 'public'))) { res.statusCode = 403; return res.end('forbidden'); }
  try {
    const buf = await readFile(file);
    res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream');
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

server.listen(PORT, () => console.log(`효자손 dev server → http://localhost:${PORT}`));
