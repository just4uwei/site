#!/usr/bin/env node
//
// server.js - 入口：只做装配与监听，业务在 src/ 下分层。
//
// 分层约定（改业务时按这个走，别往本文件堆代码）：
//   src/config.js        env + project.json 读取，全局唯一真源
//   src/http/router.js   路由分发（按无前缀路径匹配）
//   src/http/routes/     一个领域一个文件；static.js 兜底出 public/ 静态页
//   src/http/respond.js  响应/请求体工具（CORS、JSON、二进制）
//   src/store/           数据层，一个领域一个文件，db.js 管连接与建表
//
// 本站没有 WebSocket：前台纯只读展示，没有任何需要推送的东西。
//
'use strict';

const http = require('node:http');
const { PORT, HOST, NAME, VERSION } = require('./src/config');
const { handle } = require('./src/http/router');
const store = require('./src/store');

const server = http.createServer((req, res) => handle(req, res));

server.listen(PORT, HOST, () => {
  console.log(`[${NAME}] v${VERSION} 已启动 http://${HOST}:${PORT}`);
  console.log(`[${NAME}] 数据目录 ${store.DATA_DIR}`);
});

// 生产由 systemd 托管；收到 TERM 时干净收尾，避免 SQLite 写到一半
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[${NAME}] 收到 ${sig}，退出`);
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

module.exports = server;
