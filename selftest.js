#!/usr/bin/env node
//
// selftest.js - 零依赖端到端自检：起真服务、打真 HTTP、用临时数据目录。
//
// 用法：npm run selftest
//
// 它同时是回归网（重构时靠它保命）和活文档。bin/deploy.sh 发布前必跑，
// 不允许带着红灯上线。加业务时同步加断言。
//
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用临时数据目录，绝不碰开发/线上数据
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'site-selftest-'));
const project = JSON.parse(fs.readFileSync(path.join(__dirname, 'project.json'), 'utf8'));
const ENV_PREFIX = project.name.toUpperCase().replace(/-/g, '_');
process.env[`${ENV_PREFIX}_DATA`] = TMP;
process.env.PORT = '8199';
process.env.HOST = '127.0.0.1';

const server = require('./server');
const store = require('./src/store');
const BASE = 'http://127.0.0.1:8199';

/** 通用请求。body 是 Buffer 时按 contentType 发原始字节（图片上传） */
function req(method, p, body, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    let data = null;
    const headers = {};
    if (Buffer.isBuffer(body)) {
      data = body;
      headers['Content-Type'] = o.contentType || 'application/octet-stream';
    } else if (body !== undefined) {
      data = Buffer.from(JSON.stringify(body), 'utf8');
      headers['Content-Type'] = 'application/json';
    }
    if (data) headers['Content-Length'] = data.length;
    if (o.token) headers.Authorization = 'Bearer ' + o.token;
    if (o.ifNoneMatch) headers['If-None-Match'] = o.ifNoneMatch;
    const r = http.request(BASE + p, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, buf, body: buf.toString('utf8') });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const j = (s) => JSON.parse(s);

let passed = 0;
function expect(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  passed++;
  console.log('  ok  - ' + msg);
}

// 1x1 PNG，够验上传/出图/缓存的整条链路
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

(async () => {
  await new Promise((res) => (server.listening ? res() : server.on('listening', res)));
  console.log('selftest running on :8199 ...');

  // ---- 健康检查（规范要求，勿删）----
  let r = await req('GET', '/api/health');
  expect(r.status === 200, 'health -> 200');
  expect(j(r.body).ok === true, 'health.ok === true');
  expect(j(r.body).name === project.name, 'health.name 与 project.json 一致');
  expect(!!j(r.body).version, 'health 带 version');

  // ---- 站点元信息（前台首页与抬头字段行靠它）----
  r = await req('GET', '/api/site');
  expect(r.status === 200, '/api/site -> 200');
  expect(!!j(r.body).site.icp, '站点设置带 ICP 备案号（法定展示项，默认值不能空）');
  expect(j(r.body).counts.works === 0, '初始已发布作品数 0');
  expect(j(r.body).updated === 0, '没有已发布内容时 updated=0');
  expect(j(r.body).canonical === 'https://todoo.top/',
    '/api/site 带正式对外地址（本地管理台靠它列出"线上"目标，不硬编码域名）');

  // ---- 前台只读是硬约束 ----
  for (const p of ['/api/works', '/api/apps', '/api/news', '/api/site']) {
    r = await req('POST', p, { title: '访客想写点东西' });
    expect(r.status === 405, `访客 POST ${p} -> 405（前台只读，没有写入口）`);
  }
  r = await req('POST', '/api/image?id=1');
  expect(r.status === 405, '访客 POST /api/image -> 405');

  // ---- 管理台登录 ----
  r = await req('POST', '/api/admin/login', { password: 'wrong' });
  expect(r.status === 401, 'admin 密码错误 -> 401');
  // 坏 JSON 是客户端的错，不该记成服务端错误——回 500 还会把垃圾请求刷进 error 日志
  r = await req('POST', '/api/admin/login', Buffer.from('{not json'), { contentType: 'application/json' });
  expect(r.status === 400, '请求体不是合法 JSON -> 400（不是 500）');
  r = await req('POST', '/api/admin/login', { password: 'admin' });
  expect(r.status === 200, 'admin 登录 -> 200');
  const tk = j(r.body).atoken;
  expect(!!tk, '返回 atoken');

  r = await req('GET', '/api/admin/content?kind=works');
  expect(r.status === 401, '未带 token 访问管理端 -> 401');
  r = await req('GET', '/api/admin/content?kind=bad', undefined, { token: tk });
  expect(r.status === 400, '非法 kind -> 400');

  // ---- 图片：上传 -> 出图 -> ETag 304 ----
  r = await req('POST', '/api/admin/images/upload?alt=封面图', PNG, { token: tk, contentType: 'image/png' });
  expect(r.status === 200, '上传 PNG -> 200');
  const imgId = j(r.body).id;
  expect(Number.isInteger(imgId), '返回图片 id');

  r = await req('POST', '/api/admin/images/upload', Buffer.from('not an image'), { token: tk, contentType: 'text/plain' });
  expect(r.status === 400, '非图片 Content-Type 上传 -> 400（白名单外一律拒）');

  r = await req('GET', `/api/image?id=${imgId}`);
  expect(r.status === 200 && r.buf.equals(PNG), '出图内容与上传一致');
  expect(r.headers['content-type'] === 'image/png', '出图 Content-Type 正确');
  const etag = r.headers.etag;
  expect(!!etag, '出图带 ETag');
  r = await req('GET', `/api/image?id=${imgId}`, undefined, { ifNoneMatch: etag });
  expect(r.status === 304, '带 If-None-Match 命中 -> 304（图片是最热资源，必须能走缓存）');
  r = await req('GET', '/api/image?id=99999');
  expect(r.status === 404, '不存在的图片 -> 404');

  // ---- 三个内容模块同构：一套断言跑三遍 ----
  for (const kind of ['works', 'apps', 'news']) {
    r = await req('POST', '/api/admin/content/save', {
      kind, title: `${kind} 第一条`, summary: '摘要', body: '第一段。\n\n第二段。',
      tag: 'Windows', dateline: '2026-09', cover_id: imgId, status: 'draft', sort: 1,
    }, { token: tk });
    expect(r.status === 200, `[${kind}] 新建草稿 -> 200`);
    const itemId = j(r.body).item.id;

    r = await req('POST', '/api/admin/content/save', { kind, title: '   ' }, { token: tk });
    expect(r.status === 400, `[${kind}] 空标题 -> 400`);

    // 草稿对前台不存在
    r = await req('GET', `/api/${kind}`);
    expect(j(r.body).items.length === 0, `[${kind}] 草稿不出现在前台列表`);
    r = await req('GET', `/api/${kind}/item?id=${itemId}`);
    expect(r.status === 404, `[${kind}] 草稿详情前台 -> 404`);
    // 但后台看得到
    r = await req('GET', `/api/admin/content?kind=${kind}`, undefined, { token: tk });
    expect(j(r.body).items.length === 1, `[${kind}] 后台列表含草稿`);

    // 发布
    r = await req('POST', '/api/admin/content/status', { kind, id: itemId, status: 'published' }, { token: tk });
    expect(j(r.body).changed === 1, `[${kind}] 发布 -> changed=1`);
    r = await req('GET', `/api/${kind}`);
    expect(j(r.body).items.length === 1, `[${kind}] 发布后出现在前台列表`);
    expect(j(r.body).items[0].body === undefined, `[${kind}] 列表不带正文（省流量）`);

    r = await req('GET', `/api/${kind}/item?id=${itemId}`);
    expect(r.status === 200, `[${kind}] 详情 -> 200`);
    expect(j(r.body).item.body.includes('第二段'), `[${kind}] 详情带正文`);

    // 截图
    r = await req('POST', '/api/admin/shots/add', { kind, id: itemId, image_id: imgId, caption: '截图一', sort: 0 }, { token: tk });
    expect(r.status === 200, `[${kind}] 加截图 -> 200`);
    r = await req('GET', `/api/${kind}/item?id=${itemId}`);
    expect(j(r.body).shots.length === 1, `[${kind}] 详情带截图`);

    // 上下一篇：只有一条时两头都空
    expect(j(r.body).prev === null && j(r.body).next === null, `[${kind}] 单条时无上下篇`);

    // 删除连带清掉截图关联
    r = await req('POST', '/api/admin/content/delete', { kind, id: itemId }, { token: tk });
    expect(j(r.body).deleted === 1, `[${kind}] 删除 -> 1`);
    expect(store.content.listShots(kind, itemId).length === 0, `[${kind}] 删除后截图关联一并清掉`);
    r = await req('POST', '/api/admin/content/delete', { kind, id: itemId }, { token: tk });
    expect(j(r.body).deleted === 0, `[${kind}] 重复删除等幂 -> 0`);
  }

  // ---- 上/下一篇（两条以上才有意义）----
  const ids = [];
  for (const n of ['一', '二', '三']) {
    r = await req('POST', '/api/admin/content/save',
      { kind: 'news', title: `资讯${n}`, status: 'published', sort: ids.length }, { token: tk });
    ids.push(j(r.body).item.id);
  }
  r = await req('GET', `/api/news/item?id=${ids[1]}`);
  expect(j(r.body).prev.id === ids[0] && j(r.body).next.id === ids[2], '中间那条的上下篇按列表顺序给对');

  // ---- 站点设置：白名单外的键写不进去 ----
  r = await req('POST', '/api/admin/settings',
    { site_title: '我的小站', icp: '闽ICP备2026032416号-1', evil_key: 'x' }, { token: tk });
  expect(r.status === 200 && j(r.body).updated === 2, '只采纳白名单内的键（3 个字段里写进 2 个）');
  expect(j(r.body).site.evil_key === undefined, '白名单外的键读不出来');
  r = await req('GET', '/api/site');
  expect(j(r.body).site.site_title === '我的小站', '前台读到新站点名');
  expect(j(r.body).updated > 0, '有已发布内容后 updated 有值');

  // ---- 图片删除：引用它的封面被置空 ----
  r = await req('POST', '/api/admin/content/save',
    { kind: 'works', title: '带封面的作品', cover_id: imgId, status: 'published' }, { token: tk });
  const withCover = j(r.body).item.id;
  expect(j(r.body).item.cover_id === imgId, '保存时封面挂上了');
  r = await req('POST', '/api/admin/images/delete', { id: imgId }, { token: tk });
  expect(j(r.body).deleted === 1, '删图 -> 1');
  r = await req('GET', `/api/works/item?id=${withCover}`);
  expect(j(r.body).item.cover_id === null, '删图后引用它的封面被置空（外键 SET NULL），不留死链');

  // ---- 静态站点：页面、资源、干净地址、穿越防护 ----
  r = await req('GET', '/');
  expect(r.status === 200 && r.headers['content-type'].startsWith('text/html'), '/ -> 首页 HTML');
  expect(r.body.includes('assets/site.js'), '首页引的是相对路径资源（两个入口都要能用）');
  expect(!r.body.includes('"/assets/'), '首页里没有绝对路径资源引用');

  r = await req('GET', '/assets/site.css');
  expect(r.status === 200 && r.headers['content-type'].startsWith('text/css'), '/assets/site.css -> 200 CSS');
  const cssEtag = r.headers.etag;
  expect(r.headers['cache-control'] === 'no-cache',
    '静态资源是 no-cache（每次回源校验，改完立刻生效；没有构建指纹就不能设 max-age）');
  r = await req('GET', '/assets/site.css', undefined, { ifNoneMatch: cssEtag });
  expect(r.status === 304, '静态资源 ETag 命中 -> 304（no-cache 不等于不缓存）');

  r = await req('GET', '/works');
  expect(r.status === 200, '干净地址 /works -> works.html');
  r = await req('GET', '/admin.html');
  expect(r.status === 200, '/admin.html -> 200（本地由 console/ 出）');

  // 管理台**不进部署包**：线上没有这个页面，扫描器就扫不到登录框。
  // 这两条是静态检查，防止以后有人顺手把 console 加进清单、或把 public 去掉。
  const packSh = fs.readFileSync(path.join(__dirname, 'deploy', 'pack.sh'), 'utf8');
  const items = /ITEMS="([^"]*)"/.exec(packSh)[1].trim().split(/\s+/);
  expect(!items.includes('console'), '打包清单不含 console/（线上不留管理后台页面）');
  expect(items.includes('public'), '打包清单含 public/（公开站点必须上线）');

  for (const p of ['/../project.json', '/assets/../../project.json', '/%2e%2e/project.json']) {
    r = await req('GET', p);
    expect(r.status === 404 && !r.body.includes('"name"'), `路径穿越 ${p} -> 404（拿不到 public/ 外的文件）`);
  }
  r = await req('GET', '/nope-nope');
  expect(r.status === 404 && r.body.includes('这个地址没有内容'), '未知页面 -> 自带的 404 页');
  r = await req('GET', '/api/nope');
  expect(r.status === 404 && j(r.body).error === 'not found', '未知 API -> JSON 404（不当文件找）');

  // ---- 管理台密码哈希（hash-admin.js / verifyPw 回环）----
  const stored = store.hashPw('test-pw');
  expect(store.verifyPw('test-pw', stored) === true, 'verifyPw 正确密码 -> true');
  expect(store.verifyPw('wrong-pw', stored) === false, 'verifyPw 错误密码 -> false');

  console.log(`\n✅ 全部通过（${passed} 项）`);
  server.close();
  setTimeout(() => {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 上 WAL 可能占用 */ }
    process.exit(0);
  }, 100);
})().catch((e) => {
  console.error('\n❌ ' + e.message);
  process.exit(1);
});
