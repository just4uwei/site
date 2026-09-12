// routes/images.js - 图片出图 /api/image?id=N（公共，只读 GET）。
//
// 缓存：图片内容与 id 一一对应（改图= 传新图拿新 id），所以可以放心长缓存
// + ETag 走 304。这是整站最热的资源，别每次都回传几百 KB。
'use strict';

const { sendJson, sendBuffer } = require('../respond');
const store = require('../../store');

const prefix = '/api/image';

async function handle(req, res, url) {
  if (url.pathname !== '/api/image') return false;
  if (req.method !== 'GET') return sendJson(res, 405, { error: '只支持 GET' });

  const id = Number(url.query.id);
  if (!Number.isInteger(id) || id <= 0) return sendJson(res, 400, { error: 'id 非法' });

  const m = store.images.meta(id);
  if (!m) return sendJson(res, 404, { error: '图片不存在' });

  // ETag 用 sha256 前 16 位：内容指纹，改不动就一直命中
  const etag = `"${m.sha256.slice(0, 16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable' });
    return res.end();
  }

  const got = store.images.read(id);
  if (!got) return sendJson(res, 404, { error: '图片文件缺失' });
  res.setHeader('ETag', etag);
  return sendBuffer(res, got.buf, m.mime, { cacheControl: 'public, max-age=31536000, immutable' });
}

module.exports = { prefix, handle };
