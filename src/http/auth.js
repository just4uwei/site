// http/auth.js - 管理台鉴权。
//
// 管理员 token：**内存态** Set，进程重启即失效，需重新登录--管理台权限大，有意不持久化。
// 密码校验：优先 scrypt 哈希（ADMIN_PASSWORD_HASH，生产），否则回退明文（dev/selftest）。
'use strict';

const crypto = require('crypto');
const store = require('../store');
const { ADMIN_PASSWORD, ADMIN_PASSWORD_HASH } = require('../config');

const adminTokens = new Set();

function newAdminToken() {
  const t = crypto.randomBytes(24).toString('hex');
  adminTokens.add(t);
  return t;
}

/** 取 Bearer token：优先 Authorization 头，回退 query（<img src> 带不了头） */
function bearer(req, url, queryKey) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (url && queryKey && url.query[queryKey]) return url.query[queryKey];
  return null;
}

/** 管理员校验：atoken 在内存 Set 中即通过 */
function authAdmin(req, url) {
  const t = bearer(req, url, 'atoken');
  return !!t && adminTokens.has(t);
}

/** 管理台密码校验 */
function adminPasswordOk(input) {
  const pw = typeof input === 'string' ? input : '';
  if (ADMIN_PASSWORD_HASH) {
    try { return store.verifyPw(pw, ADMIN_PASSWORD_HASH); } catch (e) { return false; }
  }
  return pw === ADMIN_PASSWORD;
}

module.exports = { adminTokens, newAdminToken, authAdmin, adminPasswordOk };
