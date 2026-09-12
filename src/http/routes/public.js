// routes/public.js - 前台只读接口 /api/site、/api/works|apps|news。
//
// **只读是硬约束，不是约定**：本文件里除 GET 之外的方法一律 405，
// 而且根本没有写入型接口——访客不能评论、不能留言、不能提交任何东西。
// 要加任何"用户产出内容"的功能，先回头看需求文档里这一条为什么被排除。
//
// 路径按无前缀写（/api/xxx）：网关的 proxy_pass 尾斜杠已经剥掉了 /site/，
// 根入口（todoo.top/）本来就没有前缀，两条路进来都是同一套路径。
'use strict';

const { sendJson } = require('../respond');
const store = require('../../store');
const { NAME, VERSION } = require('../../config');

const prefix = '/api';

// 三个内容模块的前台路径 -> 数据层 kind。顺带当白名单用。
const KIND_BY_PATH = { works: 'works', apps: 'apps', news: 'news' };

async function handle(req, res, url) {
  const p = url.pathname;

  // 本路由管的路径集合：命中了但方法不对 -> 405（而不是含糊的 404）
  const m = /^\/api\/(site|works|apps|news)(\/item)?$/.exec(p);
  if (!m) return false;
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: '本站前台只读，不接受写入' });
  }

  // GET /api/site - 站点设置 + 各模块已发布条数（首页导航按它决定显示哪些栏目）
  if (m[1] === 'site') {
    return sendJson(res, 200, {
      site: store.settings.all(),
      counts: {
        works: store.content.countPublished('works'),
        apps: store.content.countPublished('apps'),
        news: store.content.countPublished('news'),
      },
      updated: store.content.latestUpdate(),
      name: NAME,
      version: VERSION,
    });
  }

  const kind = KIND_BY_PATH[m[1]];

  // GET /api/<kind> - 已发布列表（不含正文）
  if (!m[2]) {
    return sendJson(res, 200, { items: store.content.listPublished(kind, url.query.limit) });
  }

  // GET /api/<kind>/item?id=N - 详情（草稿视作不存在）+ 截图 + 上/下一篇
  const id = Number(url.query.id);
  const item = store.content.get(kind, Number.isInteger(id) ? id : NaN, true);
  if (!item) return sendJson(res, 404, { error: '内容不存在或未发布' });
  return sendJson(res, 200, {
    item,
    shots: store.content.listShots(kind, item.id),
    ...store.content.neighbours(kind, item.id),
  });
}

module.exports = { prefix, handle };
