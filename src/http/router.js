// router.js - 路由分发。
//
// 规范：路径**按无前缀写**（/api/xxx）。线上网关有两条路都通到这里——
//   https://todoo.top/        根入口（root-app.conf，本来就没前缀）
//   https://todoo.top/site/   二级前缀入口（apps/site.conf，proxy_pass 尾斜杠剥掉 /site/）
// 两条路交到这里的 pathname 是同一套，所以代码里不要再拼前缀。
//
// 顺序有讲究：static 的 prefix 是空串，会匹配一切，必须排最后当兜底。
'use strict';

const { sendJson, sendStatus, cors, parseUrl } = require('./respond');

const ROUTES = [
  require('./routes/health'),
  require('./routes/public'),   // 前台只读（GET only）
  require('./routes/images'),   // 出图（公共 GET，长缓存）
  require('./routes/admin'),    // 管理后台（吃整个 /api/admin/ 前缀）
  require('./routes/static'),   // public/ 静态页面，prefix='' 兜底，必须最后
];

async function handle(req, res) {
  const url = parseUrl(req);

  // CORS 预检
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    for (const mod of ROUTES) {
      if (url.pathname.startsWith(mod.prefix)) {
        const handled = await mod.handle(req, res, url);
        if (handled !== false) return;
      }
    }
    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[error]', e);
    try {
      sendJson(res, 500, { error: '服务器内部错误' });
    } catch (_) {
      /* 响应已发出 */
    }
  }
}

module.exports = { handle, sendStatus };
