// routes/static.js - 静态站点文件。
//
// 两个根，按顺序找：
//   public/    公开站点，**进部署包**，线上就是它
//   console/   管理台页面，**不进部署包**（见 deploy/pack.sh 的 ITEMS）
//
// 为什么管理台不上线：线上没有 /admin.html 这个页面，扫描器就扫不到登录框。
// 管理台只在本地起（bash bin/console.sh 或 npm run dev），要管线上内容时在
// 登录页把"管理目标"切到云端地址，请求直接跨域打线上 /api/admin/*（CORS 已放开）。
// 注意：**接口必须留在线上**，否则本地管理台无从连接——去掉的是页面，不是 API。
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
const CONSOLE_DIR = path.join(ROOT, 'console');
// 线上只有 public/；console/ 不在部署包里，所以那边这个目录压根不存在，
// 访问 /admin.html 会自然落到 404，不需要额外开关。
const ROOTS = [PUBLIC_DIR, CONSOLE_DIR];

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
    for (const root of ROOTS) {
      const abs = path.resolve(root, c);
      // 穿越检查：解析后必须还在**这个** root 里（每个 root 各判各的）
      if (abs !== root && !abs.startsWith(root + path.sep)) continue;
      if (!Object.prototype.hasOwnProperty.call(MIME, path.extname(abs).toLowerCase())) continue;
      try {
        const st = fs.statSync(abs);
        if (st.isFile()) return { abs, st };
      } catch (_) { /* 下一个 root / 下一个候选 */ }
    }
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
  // 一律 no-cache + ETag：**no-cache 不是不缓存**，是"每次回源校验"，没改就回 304（几十字节）。
  // 这里没有构建流程，文件名不带指纹，所以 max-age 一旦设上，改完 CSS/JS 就得等它过期或教人强刷——
  // 发布后不能立刻生效的代价，远大于每次多一个 304 往返。图片走 /api/image 另有一年长缓存。
  const cache = 'no-cache';

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

module.exports = { prefix, handle, PUBLIC_DIR, CONSOLE_DIR };
