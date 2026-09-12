#!/usr/bin/env node
//
// selftest-pages.js - 页面冒烟：把每个页面真的用浏览器打开一遍，看渲染出的是内容还是报错。
//
// 用法：npm run selftest:pages
//
// 为什么要单独有它：selftest.js 只打 HTTP，**前端一行都没执行过**。
// 本站页面全靠 JS 渲染，服务端全绿不代表页面能看——实际漏过一次：
// 列表页往一个根本不存在的 #list 容器里写，整页只剩一行
// "Cannot set properties of null"，而 selftest 100 项全过。
//
// 做法很土但有效：headless 浏览器 --dump-dom 把渲染后的 DOM 抓回来，
// 一看该有的内容在不在，二看有没有 JS 异常的痕迹。
// 之所以不必注入 console 钩子：site.js 的 boot 有 catch，异常会被写进页面，
// 抓 DOM 就等于抓到了它——用户看到的也正是这行字。
//
// **浏览器必须异步起**：被测的 HTTP 服务就跑在本进程里，用 execFileSync 会把
// 事件循环整个堵死——浏览器发来的请求没人应答，每页都白等到超时。这不是理论，
// 是实际踩过的：同步版每页 30s 超时，7 页跑不完。
//
// 没装 Edge/Chrome 就跳过（exit 0）：这是本机开发的补充网，不该卡住没有浏览器的环境。
//
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'site-pages-'));
const project = JSON.parse(fs.readFileSync(path.join(__dirname, 'project.json'), 'utf8'));
process.env[`${project.name.toUpperCase().replace(/-/g, '_')}_DATA`] = TMP;
process.env.PORT = '8197';
process.env.HOST = '127.0.0.1';
const BASE = 'http://127.0.0.1:8197';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const BROWSER = CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } });
if (!BROWSER) {
  console.log('（没找到 Edge/Chrome，跳过页面冒烟。服务端自检仍然必须过：npm run selftest）');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}

const server = require('./server');
const store = require('./src/store');

// JS 炸了以后留在页面上的痕迹。这些字**永远不该**出现在渲染结果里。
const BOOM = /Cannot (read|set)|is not a function|is not defined|undefined is not|TypeError|ReferenceError|\[object Object\]|undefined/;

/** 打开一个地址，返回渲染后的可见文本 */
function render(url) {
  return new Promise((resolve, reject) => {
    execFile(BROWSER, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--virtual-time-budget=4000', '--dump-dom', url,
    ], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      // 必须有超时：浏览器偶尔会挂住，没这个整个自检就没了下文
      timeout: 30000,
    }, (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout)));
  }).then(stripTags);
}

/** 粗暴去标签取文本：够用了，这里只判断"有没有这几个字" */
function stripTags(dom) {
  return dom
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let passed = 0;
let failed = 0;

/** want: 渲染后必须出现的字样（数组，全都要有） */
async function check(name, url, want) {
  let text;
  try {
    text = await render(BASE + url);
  } catch (e) {
    failed++;
    console.log(`  FAIL - ${name}  ${url}\n         打不开：${e.message}`);
    return;
  }
  const bad = [];
  const boom = BOOM.exec(text);
  if (boom) bad.push(`页面上出现了 JS 异常痕迹：「${boom[0]}」`);
  for (const w of want) if (!text.includes(w)) bad.push(`没渲染出「${w}」`);
  if (bad.length) {
    failed++;
    console.log(`  FAIL - ${name}  ${url}`);
    bad.forEach((b) => console.log(`         ${b}`));
    console.log(`         实际文本：${text.slice(0, 160)}`);
  } else {
    passed++;
    console.log(`  ok   - ${name}  ${url}`);
  }
}

(async () => {
  await new Promise((res) => (server.listening ? res() : server.on('listening', res)));

  // 每类各来一条已发布内容，列表与详情才有东西可看
  const ids = {};
  for (const kind of ['works', 'apps', 'news']) {
    ids[kind] = store.content.save(kind, {
      title: `${kind}冒烟条目`,
      subtitle: '副标题一行',
      summary: '列表摘要，足够长好让页面有字可看。',
      body: '第一段正文。\n\n第二段正文。',
      tag: 'Windows',
      dateline: '2026-09',
      status: 'published',
    }).id;
  }

  console.log(`页面冒烟（${path.basename(BROWSER)}）...`);
  // 每页一次浏览器冷启动（~2s），所以只挑**结构不同**的页面跑，不逐个排列组合：
  // 三个列表页共用一套渲染，测一个就够；三个详情页同理。
  await check('首页', '/', ['紫夜堂', 'works冒烟条目', 'news冒烟条目', '闽ICP备']);
  await check('列表页', '/works.html', ['游戏作品', 'works冒烟条目']);
  await check('详情页', `/work.html?id=${ids.works}`, ['works冒烟条目', '第二段正文']);
  await check('关于', '/about.html', ['关于与联系', '不开放评论与留言']);
  await check('管理台登录', '/admin.html', ['管理目标', '管理后台']);
  // 详情页拿到不存在的 id 时，要好好说一句人话，而不是抛异常白屏
  await check('详情页 id 不存在', '/work.html?id=999999', ['内容不存在或未发布']);
  await check('404 页', '/nope-nope', ['这个地址没有内容']);

  console.log(failed ? `\n❌ ${failed} 个页面有问题（通过 ${passed} 个）` : `\n✅ 全部通过（${passed} 个页面）`);
  server.close();
  setTimeout(() => {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 上可能占用 */ }
    process.exit(failed ? 1 : 0);
  }, 100);
})().catch((e) => {
  console.error('\n❌ ' + (e && e.message));
  process.exit(1);
});
