// store/db.js - 数据库连接与建表。全库唯一一处 open。
//
// 单机多系统规范：
//   - 数据目录来自 config.DATA_DIR（生产 /var/lib/site，代码里不写死）
//   - 库文件名 = 项目名，与别的系统天然隔离
//   - 建表一律 IF NOT EXISTS（等幂）；给**已有表加列**必须走 addColumnIfMissing
'use strict';

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR, NAME } = require('../config');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- 子目录：图片原始字节。库里只存元数据，磁盘上的文件名就是 image id ----
const IMAGES_DIR = path.join(DATA_DIR, 'images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, `${NAME}.db`);

// ---- token 签名密钥：持久化到数据目录 ----
// 迁移数据目录时**必须带上 secret.key**。
const SECRET_PATH = path.join(DATA_DIR, 'secret.key');
let SECRET;
if (fs.existsSync(SECRET_PATH)) {
  SECRET = fs.readFileSync(SECRET_PATH);
} else {
  SECRET = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_PATH, SECRET);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---- 建表（等幂）----
//
// works / apps / news 三张内容表**故意同构**：字段一样、索引一样，
// 于是数据层与管理后台各写一套就能通吃三个模块（见 store/content.js 的 KINDS）。
// status 控制前台可见性（draft 只有后台看得到）；sort 越小越靠前，同 sort 再按创建时间倒序。
db.exec(`
-- ---- 图片：元数据在库里，字节在 IMAGES_DIR/<id> ----
CREATE TABLE IF NOT EXISTS images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- ---- 游戏作品 ----
CREATE TABLE IF NOT EXISTS works (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '',      -- 平台/分类标签，'Windows · Steam' 这种自由文本
  summary     TEXT NOT NULL DEFAULT '',      -- 列表页一句话
  body        TEXT NOT NULL DEFAULT '',      -- 详情正文（纯文本，空行分段）
  cover_id    INTEGER REFERENCES images(id) ON DELETE SET NULL,
  link_url    TEXT NOT NULL DEFAULT '',      -- 下载/试玩地址
  link_label  TEXT NOT NULL DEFAULT '',      -- 按钮文案，空则用默认
  dateline    TEXT NOT NULL DEFAULT '',      -- 展示用日期，'2025-08' 这种粒度就够
  sort        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published'
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_works_list ON works (status, sort, created_at DESC);

-- ---- App 介绍（cover 当图标用）----
CREATE TABLE IF NOT EXISTS apps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  cover_id    INTEGER REFERENCES images(id) ON DELETE SET NULL,
  link_url    TEXT NOT NULL DEFAULT '',
  link_label  TEXT NOT NULL DEFAULT '',
  dateline    TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_apps_list ON apps (status, sort, created_at DESC);

-- ---- 产品资讯 ----
CREATE TABLE IF NOT EXISTS news (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '',      -- 分类：更新 / 公告 / 幕后…
  summary     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  cover_id    INTEGER REFERENCES images(id) ON DELETE SET NULL,
  link_url    TEXT NOT NULL DEFAULT '',
  link_label  TEXT NOT NULL DEFAULT '',
  dateline    TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_list ON news (status, sort, created_at DESC);

-- ---- 截图：挂在某条内容上，有序。owner_kind 只能是 works/apps/news ----
-- 不加外键（owner 表名是动态的），删内容时由 content.remove 显式清理。
CREATE TABLE IF NOT EXISTS shots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_kind TEXT NOT NULL,
  owner_id   INTEGER NOT NULL,
  image_id   INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  caption    TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shots_owner ON shots (owner_kind, owner_id, sort);

-- ---- 站点设置：key/value 单表。站点标题、备案号、关于正文、联系方式都在这 ----
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

/**
 * 等幂加列。SQLite 没有 ADD COLUMN IF NOT EXISTS，重复 ALTER 会报错，
 * 而 CREATE TABLE IF NOT EXISTS 对已存在的表不生效——所以加字段必须走这里。
 */
function addColumnIfMissing(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

function close() {
  try { db.close(); } catch (_) { /* 已关 */ }
}

module.exports = {
  db, SECRET,
  DATA_DIR, IMAGES_DIR, DB_PATH, SECRET_PATH,
  addColumnIfMissing, close,
};
