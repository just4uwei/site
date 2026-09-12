#!/usr/bin/env node
//
// hash-admin.js - 生成管理台密码的 scrypt 哈希
//
// 用于写入 <name>.env 的 ADMIN_PASSWORD_HASH，使 env 文件不再保存明文密码。
// 服务端登录时用 src/store/auth.js 的 verifyPw 校验（与用户密码同算法）。
//
// 用法：
//   node hash-admin.js <密码>                # 参数传入
//   printf '%s' <密码> | node hash-admin.js  # stdin 传入（避免进 shell 历史/ps）
//
// 输出：salt_hex:hash_hex  （格式须与 src/store/auth.js 的 hashPw/verifyPw 严格一致）
//
'use strict';
const crypto = require('node:crypto');

let pw = process.argv[2];
if (pw === undefined) {
  try { pw = require('node:fs').readFileSync(0, 'utf8'); } catch (e) { pw = ''; }
  pw = pw.replace(/\r?\n$/, '');
}
if (!pw) {
  console.error('用法: node hash-admin.js <密码>  （或经 stdin 传入）');
  process.exit(1);
}
// 与 store/auth.js hashPw 完全一致：16 字节随机盐 + scrypt 64 字节
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 64);
process.stdout.write(salt.toString('hex') + ':' + hash.toString('hex') + '\n');
