// store/content.js - 三个内容模块（游戏作品 / App 介绍 / 产品资讯）的数据层。
//
// 三张表同构（见 db.js），所以这里只有一套 SQL，kind 决定表名。
// kind 必须先过 isKind() —— 它是唯一把外部输入变成表名的地方，白名单之外一律拒绝，
// 表名不能参数化绑定，这是防注入的关键闸门。
'use strict';

const { db } = require('./db');

const KINDS = ['works', 'apps', 'news'];
const isKind = (k) => KINDS.includes(k);

// 前台列表用的字段（不含 body：详情页才需要，列表页别白传）
const LIST_COLS = 'id, title, subtitle, tag, summary, cover_id, link_url, link_label, dateline, sort, status, created_at, updated_at';
// 可写字段：save 只认这些键，其余（id/created_at/status/sort…）由代码控制
const TEXT_FIELDS = ['title', 'subtitle', 'tag', 'summary', 'body', 'link_url', 'link_label', 'dateline'];

function table(kind) {
  if (!isKind(kind)) throw Object.assign(new Error('未知内容类型'), { status: 400 });
  return kind;
}

/** 前台列表：只出已发布。limit 上限 200，防一次拉爆 */
function listPublished(kind, limit = 60) {
  const t = table(kind);
  const n = Math.min(Math.max(Number(limit) || 60, 1), 200);
  return db.prepare(
    `SELECT ${LIST_COLS} FROM ${t} WHERE status = 'published' ORDER BY sort ASC, created_at DESC LIMIT ?`,
  ).all(n);
}

/** 后台列表：草稿也要出 */
function listAll(kind) {
  const t = table(kind);
  return db.prepare(
    `SELECT ${LIST_COLS} FROM ${t} ORDER BY sort ASC, created_at DESC`,
  ).all();
}

/** 详情。onlyPublished=true 时草稿视作不存在（前台用） */
function get(kind, id, onlyPublished) {
  const t = table(kind);
  if (!Number.isInteger(id)) return null;
  const row = db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(id);
  if (!row) return null;
  if (onlyPublished && row.status !== 'published') return null;
  return row;
}

/** 相邻条目（详情页「上一篇/下一篇」）。与列表同序 */
function neighbours(kind, id) {
  const list = listPublished(kind, 200);
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return { prev: null, next: null };
  const slim = (r) => (r ? { id: r.id, title: r.title } : null);
  return { prev: slim(list[i - 1]), next: slim(list[i + 1]) };
}

/**
 * 新建/更新。有 id 就更新，没有就插入。
 * patch 里只有 TEXT_FIELDS + cover_id / sort / status 会被采纳。
 */
function save(kind, patch) {
  const t = table(kind);
  const now = Date.now();
  const vals = {};
  for (const f of TEXT_FIELDS) vals[f] = String(patch[f] ?? '').trim();
  if (!vals.title) throw Object.assign(new Error('标题不能为空'), { status: 400 });

  // cover_id: 0/空/非法 -> NULL（表示没封面）
  const cover = Number(patch.cover_id);
  vals.cover_id = Number.isInteger(cover) && cover > 0 ? cover : null;
  vals.sort = Number.isInteger(Number(patch.sort)) ? Number(patch.sort) : 0;
  vals.status = patch.status === 'published' ? 'published' : 'draft';

  const keys = [...TEXT_FIELDS, 'cover_id', 'sort', 'status'];
  const id = Number(patch.id);
  if (Number.isInteger(id) && id > 0) {
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const info = db.prepare(`UPDATE ${t} SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => vals[k]), now, id);
    if (!Number(info.changes)) throw Object.assign(new Error('没有这条内容'), { status: 404 });
    return get(kind, id);
  }
  const cols = [...keys, 'created_at', 'updated_at'].join(', ');
  const marks = [...keys, 'created_at', 'updated_at'].map(() => '?').join(', ');
  const info = db.prepare(`INSERT INTO ${t} (${cols}) VALUES (${marks})`)
    .run(...keys.map((k) => vals[k]), now, now);
  return get(kind, Number(info.lastInsertRowid));
}

/** 上/下架 */
function setStatus(kind, id, status) {
  const t = table(kind);
  if (!Number.isInteger(id)) return 0;
  const s = status === 'published' ? 'published' : 'draft';
  return Number(db.prepare(`UPDATE ${t} SET status = ?, updated_at = ? WHERE id = ?`)
    .run(s, Date.now(), id).changes);
}

/** 删除内容，连带它的截图关联（图片本体留着，可能被别处引用） */
function remove(kind, id) {
  const t = table(kind);
  if (!Number.isInteger(id)) return 0;
  const n = Number(db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id).changes);
  if (n) db.prepare('DELETE FROM shots WHERE owner_kind = ? AND owner_id = ?').run(kind, id);
  return n;
}

/** 前台首页用的计数（只数已发布） */
function countPublished(kind) {
  const t = table(kind);
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE status = 'published'`).get().n);
}

/** 全站最近一次内容更新时间（只看已发布）。0 表示还没有已发布内容 */
function latestUpdate() {
  let newest = 0;
  for (const k of KINDS) {
    const r = db.prepare(`SELECT MAX(updated_at) AS m FROM ${k} WHERE status = 'published'`).get();
    const m = Number(r && r.m) || 0;
    if (m > newest) newest = m;
  }
  return newest;
}

// ---------- 截图 ----------

function listShots(kind, ownerId) {
  table(kind);
  if (!Number.isInteger(ownerId)) return [];
  return db.prepare(
    `SELECT s.id, s.image_id, s.caption, s.sort
       FROM shots s WHERE s.owner_kind = ? AND s.owner_id = ?
      ORDER BY s.sort ASC, s.id ASC`,
  ).all(kind, ownerId);
}

function addShot(kind, ownerId, imageId, caption, sort) {
  table(kind);
  if (!Number.isInteger(ownerId) || !Number.isInteger(imageId)) {
    throw Object.assign(new Error('owner_id / image_id 非法'), { status: 400 });
  }
  const info = db.prepare(
    'INSERT INTO shots (owner_kind, owner_id, image_id, caption, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(kind, ownerId, imageId, String(caption || ''), Number(sort) || 0, Date.now());
  return { id: Number(info.lastInsertRowid) };
}

function removeShot(id) {
  if (!Number.isInteger(id)) return 0;
  return Number(db.prepare('DELETE FROM shots WHERE id = ?').run(id).changes);
}

module.exports = {
  KINDS, isKind,
  listPublished, listAll, get, neighbours, save, setStatus, remove, countPublished, latestUpdate,
  listShots, addShot, removeShot,
};
