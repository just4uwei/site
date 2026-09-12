// config.js - 配置唯一真源：env 覆盖 project.json，代码里不写死端口/路径。
//
// 单机多系统规范：
//   PORT / HOST 由部署时的 env 给（生产 HOST=127.0.0.1，只让网关连得到）
//   数据目录由 <NAME>_DATA env 给（生产 /var/lib/<name>）
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// project.json：name/version 的唯一来源。部署后与 server.js 平铺在 /opt/<name>
function readProject() {
  for (const f of [path.join(ROOT, 'project.json'), path.join(__dirname, 'project.json')]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j.name) return j;
    } catch (_) { /* 找下一个 */ }
  }
  throw new Error('找不到 project.json —— 它是项目名/版本的唯一真源，不能缺');
}

const project = readProject();

const NAME = project.name;
const VERSION = project.version || '0.0.0';
// 环境变量前缀：name 里的连字符换成下划线（env 名不能带连字符）
const ENV_PREFIX = NAME.toUpperCase().replace(/-/g, '_');

const PORT = Number(process.env.PORT) || Number(project.service?.port) || 8083;
// 本地默认 0.0.0.0 方便手机/局域网调试；生产 env 给 127.0.0.1
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env[`${ENV_PREFIX}_DATA`] || path.join(ROOT, 'data');

// 管理台密码：优先 scrypt 哈希（生产，ADMIN_PASSWORD_HASH），否则回退明文（dev/selftest）
// 机密绝不落盘 env 文件以外；哈希生成见根目录 hash-admin.js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

module.exports = {
  project, NAME, VERSION, ENV_PREFIX, PORT, HOST, DATA_DIR, ROOT,
  ADMIN_PASSWORD, ADMIN_PASSWORD_HASH,
};
