// store/auth.js - 密码哈希与校验。
//
// 密码：scrypt + 随机 salt，存 "salt_hex:hash_hex"。
// 供管理台登录校验（hash-admin.js 生成的哈希与此处 verifyPw 严格一致）。
'use strict';

const crypto = require('crypto');
const { SECRET } = require('./db');

/** 生成密码的 scrypt 哈希（salt_hex:hash_hex） */
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

/** 校验密码：明文 vs 存储的 "salt_hex:hash_hex" */
function verifyPw(pw, stored) {
  if (!stored) return false;
  const sep = stored.indexOf(':');
  if (sep < 0) return false;
  const salt = Buffer.from(stored.slice(0, sep), 'hex');
  const hash = Buffer.from(stored.slice(sep + 1), 'hex');
  const test = crypto.scryptSync(pw, salt, hash.length);
  return crypto.timingSafeEqual(hash, test);
}

module.exports = { hashPw, verifyPw };
