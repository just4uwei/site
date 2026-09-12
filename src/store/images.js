// store/images.js - 图片：元数据进库，字节落盘 IMAGES_DIR/<id>。
//
// 为什么不塞库：图片几百 KB 起，塞 SQLite 会让 WAL 和备份都变难看；
// 落盘后前台出图就是一次 readFile，还能带长缓存（id 不变即内容不变）。
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, IMAGES_DIR } = require('./db');

// 只收这几种。后台上传时按 Content-Type 判，白名单外一律拒——
// 不让站点变成任意文件托管。
const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};
const isAllowedMime = (m) => Object.prototype.hasOwnProperty.call(MIME_EXT, m);

const filePath = (id) => path.join(IMAGES_DIR, String(id));

/** 存一张图。返回 { id, mime, size } */
function create(mime, buf, alt) {
  if (!isAllowedMime(mime)) throw Object.assign(new Error('只支持 png/jpeg/webp/gif/svg'), { status: 400 });
  if (!buf || !buf.length) throw Object.assign(new Error('图片内容为空'), { status: 400 });
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const now = Date.now();
  const info = db.prepare(
    'INSERT INTO images (mime, size, sha256, alt, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(mime, buf.length, sha256, String(alt || ''), now);
  const id = Number(info.lastInsertRowid);
  // 先写库拿到 id 再落盘：落盘失败就把库里那条撤掉，不留悬空元数据
  try {
    fs.writeFileSync(filePath(id), buf);
  } catch (e) {
    db.prepare('DELETE FROM images WHERE id = ?').run(id);
    throw e;
  }
  return { id, mime, size: buf.length, sha256, alt: String(alt || ''), created_at: now };
}

function meta(id) {
  if (!Number.isInteger(id)) return null;
  return db.prepare('SELECT id, mime, size, sha256, alt, created_at FROM images WHERE id = ?').get(id) || null;
}

/** 读字节。库里有记录但文件没了 -> 返回 null（当 404 处理，不 500） */
function read(id) {
  const m = meta(id);
  if (!m) return null;
  try {
    return { meta: m, buf: fs.readFileSync(filePath(id)) };
  } catch (_) {
    return null;
  }
}

function list(limit = 200) {
  const n = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return db.prepare(
    'SELECT id, mime, size, alt, created_at FROM images ORDER BY id DESC LIMIT ?',
  ).all(n);
}

/**
 * 删图：库里删掉 + 文件删掉。引用它的内容 cover_id 由外键 ON DELETE SET NULL 置空，
 * shots 里的引用由 ON DELETE CASCADE 清掉。
 */
function remove(id) {
  if (!Number.isInteger(id)) return 0;
  const n = Number(db.prepare('DELETE FROM images WHERE id = ?').run(id).changes);
  if (n) { try { fs.unlinkSync(filePath(id)); } catch (_) { /* 文件本来就没了 */ } }
  return n;
}

module.exports = { MIME_EXT, isAllowedMime, create, meta, read, list, remove };
