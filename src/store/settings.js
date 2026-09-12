// store/settings.js - 站点设置（key/value 单表）。
//
// 站点标题、副标题、关于正文、联系方式、ICP 备案号都在这里，后台可改，前台只读。
// DEFAULTS 是**唯一的键白名单**：不在里面的键写不进去，前台也读不到，
// 免得后台变成任意 kv 写入口。
'use strict';

const { db } = require('./db');

// 备案号是法定要求的展示项（工信部），默认值就是本站已下发的号，后台仍可改。
const DEFAULTS = {
  site_title: 'todoo',
  site_tagline: '独立游戏与小工具的自留地',
  site_intro: '这里放我做的游戏、写的 App，和它们的更新记录。',
  about_body: '一个人做游戏和小工具。\n\n作品和 App 都在上面几栏里，更新会发在「资讯」。',
  contact_email: '',
  contact_note: '',
  icp: '闽ICP备2026032416号-1',
  footer_note: '',
};

/** 全量读（前台/后台共用）。缺的键回落到 DEFAULTS */
function all() {
  const out = { ...DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, r.key)) out[r.key] = r.value;
  }
  return out;
}

/** 批量写。白名单外的键静默忽略；返回实际写入的键数 */
function update(patch) {
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    + ' ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  );
  let n = 0;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
    stmt.run(k, String(v ?? ''), now);
    n++;
  }
  return n;
}

module.exports = { DEFAULTS, all, update };
