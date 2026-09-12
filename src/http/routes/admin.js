// routes/admin.js - 管理后台接口 /api/admin/*。
//
// 鉴权：/api/admin/login 公共（校验密码，优先 scrypt 哈希）；其余一律要 atoken。
// atoken 是**内存态**，进程重启即失效，需重新登录——管理后台权限大，有意不持久化。
//
// 三个内容模块（works/apps/news）同构，所以这里是一套通用 CRUD：
//   /api/admin/content?kind=works            GET  列表（含草稿）
//   /api/admin/content/item?kind&id           GET  详情（含草稿）
//   /api/admin/content/save                   POST { kind, id?, title, ... }
//   /api/admin/content/status                 POST { kind, id, status }
//   /api/admin/content/delete                 POST { kind, id }
//   /api/admin/shots?kind&id                  GET  某条内容的截图
//   /api/admin/shots/add|delete               POST
//   /api/admin/images                         GET  图库
//   /api/admin/images/upload?alt=             POST 二进制图片本体
//   /api/admin/images/delete                  POST { id }
//   /api/admin/settings                       GET / POST 站点设置
'use strict';

const { sendJson, readJson, readBinary } = require('../respond');
const { authAdmin, adminPasswordOk, newAdminToken } = require('../auth');
const store = require('../../store');

const prefix = '/api/admin';

// 图片上传上限：与 project.json 的 gateway.maxBodySize(12m) 留出余量。
// 网关那层会先挡掉超大 body，这里是第二道闸，也让本地开发（不过网关）有个上限。
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 取 kind（works/apps/news）。非法返回 null 让调用处回 400 */
function kindOf(v) {
  const k = String(v || '');
  return store.content.isKind(k) ? k : null;
}

/** 业务异常统一落地：store 层抛的 error 带 .status，照着回 */
function fail(res, e) {
  return sendJson(res, e && e.status ? e.status : 500, { error: (e && e.message) || '服务器内部错误' });
}

async function handle(req, res, url) {
  const p = url.pathname;

  // ---- 登录（公共）----
  if (p === '/api/admin/login' && req.method === 'POST') {
    const b = await readJson(req);
    if (!adminPasswordOk(b.password)) return sendJson(res, 401, { error: '密码错误' });
    return sendJson(res, 200, { atoken: newAdminToken() });
  }

  if (!p.startsWith('/api/admin/')) return false;

  // ---- 以下全部需要管理员 ----
  if (!authAdmin(req, url)) return sendJson(res, 401, { error: '管理员未登录' });

  // ==== 内容：列表 / 详情 ====
  if (p === '/api/admin/content' && req.method === 'GET') {
    const kind = kindOf(url.query.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    return sendJson(res, 200, { items: store.content.listAll(kind) });
  }

  if (p === '/api/admin/content/item' && req.method === 'GET') {
    const kind = kindOf(url.query.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    const id = Number(url.query.id);
    const item = store.content.get(kind, Number.isInteger(id) ? id : NaN, false);
    if (!item) return sendJson(res, 404, { error: '内容不存在' });
    return sendJson(res, 200, { item, shots: store.content.listShots(kind, item.id) });
  }

  // ==== 内容：写入 ====
  if (p === '/api/admin/content/save' && req.method === 'POST') {
    const b = await readJson(req);
    const kind = kindOf(b.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    try {
      return sendJson(res, 200, { item: store.content.save(kind, b) });
    } catch (e) { return fail(res, e); }
  }

  if (p === '/api/admin/content/status' && req.method === 'POST') {
    const b = await readJson(req);
    const kind = kindOf(b.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    const n = store.content.setStatus(kind, Number(b.id), b.status);
    return sendJson(res, 200, { changed: n });
  }

  if (p === '/api/admin/content/delete' && req.method === 'POST') {
    const b = await readJson(req);
    const kind = kindOf(b.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    return sendJson(res, 200, { deleted: store.content.remove(kind, Number(b.id)) });
  }

  // ==== 截图 ====
  if (p === '/api/admin/shots' && req.method === 'GET') {
    const kind = kindOf(url.query.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    return sendJson(res, 200, { shots: store.content.listShots(kind, Number(url.query.id)) });
  }

  if (p === '/api/admin/shots/add' && req.method === 'POST') {
    const b = await readJson(req);
    const kind = kindOf(b.kind);
    if (!kind) return sendJson(res, 400, { error: 'kind 只能是 works / apps / news' });
    try {
      return sendJson(res, 200, store.content.addShot(kind, Number(b.id), Number(b.image_id), b.caption, b.sort));
    } catch (e) { return fail(res, e); }
  }

  if (p === '/api/admin/shots/delete' && req.method === 'POST') {
    const b = await readJson(req);
    return sendJson(res, 200, { deleted: store.content.removeShot(Number(b.id)) });
  }

  // ==== 图库 ====
  if (p === '/api/admin/images' && req.method === 'GET') {
    return sendJson(res, 200, { images: store.images.list(url.query.limit) });
  }

  if (p === '/api/admin/images/upload' && req.method === 'POST') {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (!store.images.isAllowedMime(mime)) {
      return sendJson(res, 400, { error: '只支持 png/jpeg/webp/gif/svg（按 Content-Type 判）' });
    }
    let buf;
    try {
      buf = await readBinary(req, MAX_IMAGE_BYTES);
    } catch (e) { return fail(res, e); }
    try {
      return sendJson(res, 200, store.images.create(mime, buf, url.query.alt));
    } catch (e) { return fail(res, e); }
  }

  if (p === '/api/admin/images/delete' && req.method === 'POST') {
    const b = await readJson(req);
    return sendJson(res, 200, { deleted: store.images.remove(Number(b.id)) });
  }

  // ==== 站点设置（含 ICP 备案号、关于与联系正文）====
  if (p === '/api/admin/settings' && req.method === 'GET') {
    return sendJson(res, 200, { site: store.settings.all() });
  }

  if (p === '/api/admin/settings' && req.method === 'POST') {
    const b = await readJson(req);
    const n = store.settings.update(b);
    return sendJson(res, 200, { updated: n, site: store.settings.all() });
  }

  return false;
}

module.exports = { prefix, handle };
