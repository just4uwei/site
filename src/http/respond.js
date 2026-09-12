// respond.js - HTTP 响应与请求体工具。路由文件只管业务，编解码都走这里。
'use strict';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  cors(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function sendStatus(res, status, msg) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(msg || '');
}

/** 发二进制（更新包、HTML 包等）。默认 no-store：包要拿最新的。
 *  opts.filename：给下载类资源（APK/exe 等）设 attachment 文件名，浏览器另存为有意义的名字而非 URL 末段。
 *  opts.cacheControl：可指定长缓存（头像等带版本参数的资源）。 */
function sendBuffer(res, buf, mime, opts) {
  cors(res);
  const headers = {
    'Content-Type': mime,
    'Content-Length': buf.length,
    'Cache-Control': (opts && opts.cacheControl) || 'no-store',
  };
  if (opts && opts.filename) {
    // 剥掉 " 与 \，防文件名注入响应头
    const name = String(opts.filename).replace(/["\\]/g, '');
    headers['Content-Disposition'] = `attachment; filename="${name}"`;
  }
  res.writeHead(200, headers);
  res.end(buf);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * 收完整个请求体。maxBytes 可选，超限即停止缓存（APK/exe 等大包上传别让整块进内存后 OOM），
 * 剩余字节丢弃式排空好让 413 送达，总量翻倍还不结束才断连。
 * 客户端中途断线时**必须** reject：只听 end/error 的话 Promise 永不 settle，
 * handler 挂死、已收字节滞留内存。
 * 抛出的 error 带 .status（400 中断 / 413 超限），路由层照着回状态码。
 */
function readBinary(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, done = false;
    const fail = (status, msg) => {
      if (done) return;
      done = true;
      const e = new Error(msg);
      e.status = status;
      reject(e);
    };
    if (req.destroyed || req.aborted) return fail(400, '上传中断');
    req.on('data', (c) => {
      size += c.length;
      if (done) {
        if (maxBytes && size > maxBytes * 2) req.destroy();
        return;
      }
      if (maxBytes && size > maxBytes) {
        chunks.length = 0;
        return fail(413, '内容过大');
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (e) => fail(400, e.message || '读取失败'));
    req.on('close', () => fail(400, '上传中断'));
  });
}

/** 解析 URL。注意：网关已剥掉 /<name>/ 前缀，这里拿到的就是 /api/xxx */
function parseUrl(req) {
  const u = new URL(req.url, 'http://localhost');
  const query = {};
  for (const [k, v] of u.searchParams) query[k] = v;
  return { pathname: u.pathname, query };
}

module.exports = { cors, sendJson, sendStatus, sendBuffer, readJson, readBinary, parseUrl };
