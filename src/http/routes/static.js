// routes/static.js - 静态站点文件（public/ 下的 html / css / js / 图标）。
//
// 挂在 ROUTES 最后，prefix 是空串 -> 兜住所有没被 API 认领的路径。
// /api/ 开头的一律交还 router（让它回 JSON 404），不会被当成文件找。
//
// 为什么由 Node 出静态而不是 nginx 直出：整站就几个页面几十 KB，
// 一次 readFile + ETag 足够；换成 nginx 直出就得给这个应用单独分叉一套
// 网关片段模板，违背"所有应用共用一个模板"的平台约定。
//
// 路径安全：先 normalize，再确认解析结果仍在 PUBLIC_DIR 内（防 ../ 穿越），
// 且扩展名在白名单内。
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sendStatus } = require('../respond');
const { ROOT } = require('../../config');

const prefix = '';
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** 把请求路径映射到 public/ 下的真实文件；映射不出来返回 null */
function resolveFile(pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  // normalize 消掉 ../ 与重复斜杠，再去掉开头的分隔符交给 join
  rel = path.normalize(rel).replace(/^[/\\]+/, '');
  if (!rel) rel = 'index.html';

  const candidates = path.extname(rel)
    ? [rel]
    // 无扩展名时支持干净地址：/works -> works.html
    : [rel + '.html', path.join(rel, 'index.html')];

  for (const c of candidates) {
    const abs = path.resolve(PUBLIC_DIR, c);
    // 穿越检查：解析后必须还在 public/ 里
    if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) continue;
    if (!Object.prototype.hasOwnProperty.call(MIME, path.extname(abs).toLowerCase())) continue;
    try {
      const st = fs.statSync(abs);
      if (st.isFile()) return { abs, st };
    } catch (_) { /* 下一个候选 */ }
  }
  return null;
}

async function handle(req, res, url) {
  // API 不归我管（含未知的 /api/xxx，交还 router 回 JSON 404）
  if (url.pathname.startsWith('/api/')) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendStatus(res, 405, '只支持 GET');
  }

  const found = resolveFile(url.pathname);
  if (!found) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    // 404 不走 public/：静态文件都找不着的时候，别再指望 public/ 里有东西。
    // 配色与 site.css 的 token 手工对齐（纸 #eef1ea / 墨 #16202b / 玉 #1f5f52）。
    return res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>404 · 没有这个地址</title>'
      + '<body style="margin:0;font:16px/1.75 \'PingFang SC\',\'Microsoft YaHei\',system-ui,sans-serif;'
      + 'background:#eef1ea;color:#16202b;padding:14vh 8vw">'
      + '<p style="font:400 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;color:#1f5f52">404</p>'
      + '<h1 style="font:700 clamp(1.8rem,5vw,2.8rem)/1.2 \'Songti SC\',SimSun,Georgia,serif;margin:.3rem 0 0">'
      + '这个地址没有内容</h1>'
      + '<p style="color:#5d6b66">可能是链接写错了，或者那条内容还没发布。</p>'
      + '<p><a href="./" style="color:#1f5f52">回首页 →</a></p>');
  }

  const { abs, st } = found;
  const ext = path.extname(abs).toLowerCase();
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  // html 每次回源校验（发布后立刻生效）；其余资源短缓存 + ETag
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
    return res.end();
  }

  const buf = fs.readFileSync(abs);
  res.writeHead(200, {
    'Content-Type': MIME[ext],
    'Content-Length': buf.length,
    'Cache-Control': cache,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  return res.end(buf);
}

module.exports = { prefix, handle, PUBLIC_DIR };
