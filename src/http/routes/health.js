// routes/health.js - 健康检查。
//
// 规范要求：每个系统都必须有它。nginx 网关与 register-app.sh 靠它探活，
// 排查线上跑的是哪个版本也看它。project.json 的 service.healthPath 要与这里一致。
'use strict';

const { sendJson } = require('../respond');
const { NAME, VERSION } = require('../../config');

const prefix = '/api/health';

async function handle(req, res, url) {
  if (url.pathname !== '/api/health' || req.method !== 'GET') return false;
  sendJson(res, 200, { ok: true, name: NAME, version: VERSION });
}

module.exports = { prefix, handle };
